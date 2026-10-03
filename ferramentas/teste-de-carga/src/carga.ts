/**
 * Teste de carga: uma turma inteira de clientes simulados numa sala real do servidor. Cada aluno entra
 * (HTTP), abre o WebSocket como o navegador abriria (mesmo protocolo, mesmo `ping` de aplicação a cada 15 s)
 * e toma decisões plausíveis em intervalos irregulares. Mede quedas, latência dos comandos, tamanho das
 * mensagens e a pontualidade do relógio.
 */
import type { DecisaoDoAluno, VisaoAluno } from "@simulador/compartilhado";
import { criteriosDeCarga, type CriterioDeCarga, planoDeEquipes, resumir, type ResumoNumerico } from "./metricas";

export interface OpcoesDeCarga {
  /** Endereço do servidor, ex.: `http://127.0.0.1:47800`. */
  base: string;
  chave: string;
  alunos: number;
  mercados: number;
  vagasPorMercado: number;
  presetId: string;
  /** Estratégia dos robôs nas vagas vazias (`null` = vagas vazias ficam inativas). */
  robos: string | null;
  segundosPorTick: number;
  /** Duração do jogo medido, em segundos de relógio real. */
  duracaoSegundos: number;
  /** Intervalo médio entre decisões de um aluno, em ms (sorteado entre 0,5× e 1,5×). */
  intervaloDecisaoMs: number;
  /** Semente do sorteio das decisões (o teste é reprodutível na parte do cliente). */
  semente: number;
}

export interface ResultadoDeCarga {
  opcoes: OpcoesDeCarga;
  codigo: string;
  falhasDeEntrada: number;
  quedas: number;
  comandosEnviados: number;
  comandosComProblema: number;
  /** Motivos de recusa e quantas vezes apareceram. */
  recusas: Record<string, number>;
  latencia: ResumoNumerico;
  intervalo: ResumoNumerico;
  tamanhoDaMensagem: ResumoNumerico;
  mensagensRecebidas: number;
  bytesRecebidos: number;
  ticksEsperados: number;
  ticksJogados: number;
  criterios: CriterioDeCarga[];
  aprovado: boolean;
}

const dorme = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Gerador congruencial simples (reprodutível). */
function gerador(semente: number) {
  let x = (semente >>> 0) || 1;
  return () => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return x / 2 ** 32;
  };
}

const cookieDe = (r: Response) => (r.headers.getSetCookie()[0] ?? "").split(";")[0]!;

let contador = 0;
const idDeComando = () => `carga-${Date.now().toString(36)}-${(++contador).toString(36)}`;

interface Medidas {
  latencias: number[];
  intervalos: number[];
  tamanhos: number[];
  mensagens: number;
  bytes: number;
  quedas: number;
  enviados: number;
  problemas: number;
  recusas: Record<string, number>;
}

class Cliente {
  ws!: WebSocket;
  visao: VisaoAluno | null = null;
  private pendentes = new Map<string, number>();
  private ultimaAtualizacao = 0;
  private ping: ReturnType<typeof setInterval> | undefined;
  private parado = false;

  constructor(
    readonly nome: string,
    readonly empresa: string,
    private readonly cookie: string,
    private readonly o: OpcoesDeCarga,
    private readonly medidas: Medidas,
    readonly primeiroDaEquipe: boolean,
    private readonly sorteio: () => number,
  ) {}

  async abrir(): Promise<void> {
    const url = `${this.o.base.replace(/^http/, "ws")}/ws?codigo=${this.codigoDaSala}&papel=aluno`;
    // @ts-ignore: o Bun aceita cabeçalhos no WebSocket (o navegador manda o cookie sozinho)
    this.ws = new WebSocket(url, { headers: { cookie: this.cookie, origin: this.o.base } });
    this.ws.onmessage = (e) => this.receber(String(e.data));
    this.ws.onclose = () => {
      if (!this.parado) this.medidas.quedas++;
    };
    await new Promise<void>((ok, erro) => {
      this.ws.onopen = () => ok();
      this.ws.onerror = () => erro(new Error("falha ao abrir o WebSocket"));
    });
    this.ping = setInterval(() => this.ws.readyState === 1 && this.ws.send(JSON.stringify({ tipo: "ping" })), 15_000);
  }

  codigoDaSala = "";

  private receber(texto: string): void {
    this.medidas.mensagens++;
    this.medidas.bytes += texto.length;
    this.medidas.tamanhos.push(texto.length);
    const m = JSON.parse(texto) as { tipo: string; visao?: VisaoAluno; idComando?: string; ok?: boolean; motivo?: string };
    if (m.tipo === "snapshot" || m.tipo === "atualizacao") {
      this.visao = m.visao ?? this.visao;
      const agora = performance.now();
      if (m.tipo === "atualizacao" && this.ultimaAtualizacao > 0) this.medidas.intervalos.push(agora - this.ultimaAtualizacao);
      this.ultimaAtualizacao = agora;
    } else if (m.tipo === "resposta" && m.idComando) {
      const t0 = this.pendentes.get(m.idComando);
      if (t0 !== undefined) {
        this.pendentes.delete(m.idComando);
        this.medidas.latencias.push(performance.now() - t0);
        if (m.ok === false) {
          this.medidas.problemas++;
          const motivo = m.motivo ?? "sem motivo";
          this.medidas.recusas[motivo] = (this.medidas.recusas[motivo] ?? 0) + 1;
        }
      }
    }
  }

  /** Uma decisão plausível para o estado atual, ou `null` se ainda não há visão. */
  decisao(): DecisaoDoAluno | null {
    const v = this.visao;
    if (!v || this.ws.readyState !== 1) return null;
    const c = v.visao.cadeia;
    const r = this.sorteio();
    if (c && this.primeiroDaEquipe && c.fazendas.length === 0 && r < 0.5 && v.visao.empresa.caixa > 2_000_000) return { tipo: "construirFazenda", atividade: "gado_leiteiro" };
    const operando = c?.fazendas.filter((f) => !f.emObra && !f.emConversao) ?? [];
    if (c && operando.length > 0 && r < 0.35) {
      const f = operando[Math.floor(this.sorteio() * operando.length)]!;
      const a = c.atividades.find((x) => x.id === f.atividade)!;
      return { tipo: "ajustarFazenda", fazenda: f.id, producaoMensal: Math.round(this.sorteio() * a.capacidadeUnidadesPorDia * v.visao.ticksPorMes) };
    }
    if (c && r < 0.45) {
      const m = c.materiasPrimas[Math.floor(this.sorteio() * c.materiasPrimas.length)]!;
      const faixa = c.faixaDoAtacado[m.produto];
      if (faixa && c.fazendas.length > 0) return { tipo: "ofertarNoAtacado", produto: m.produto, preco: Math.round(faixa.piso + this.sorteio() * (faixa.teto - faixa.piso)), quantidadeMensal: Math.round(this.sorteio() * 500) };
    }
    const vendaveis = v.visao.produtos.filter((p) => p.fornecedor !== null);
    const p = vendaveis[Math.floor(this.sorteio() * vendaveis.length)]!;
    const preco = Math.max(1, Math.min(p.precoMaximo, Math.round(p.fornecedor!.preco * (1.2 + this.sorteio() * 0.4))));
    return { tipo: "produto", produto: p.id, preco, publicidadeMensal: Math.round(this.sorteio() * 50_000) };
  }

  enviar(decisao: DecisaoDoAluno): void {
    const idComando = idDeComando();
    this.pendentes.set(idComando, performance.now());
    this.medidas.enviados++;
    this.ws.send(JSON.stringify({ tipo: "decidir", idComando, decisoes: [decisao] }));
  }

  /** Comandos que não receberam resposta até agora contam como problema. */
  encerrar(): void {
    this.parado = true;
    clearInterval(this.ping);
    if (this.pendentes.size > 0) {
      this.medidas.problemas += this.pendentes.size;
      this.medidas.recusas["sem resposta"] = (this.medidas.recusas["sem resposta"] ?? 0) + this.pendentes.size;
    }
    this.ws.close();
  }
}

export async function executarCarga(o: OpcoesDeCarga): Promise<ResultadoDeCarga> {
  const cabecalhos = { "content-type": "application/json", origin: o.base };
  const criada = await fetch(`${o.base}/api/salas`, {
    method: "POST",
    headers: cabecalhos,
    body: JSON.stringify({
      chave: o.chave,
      config: { presetId: o.presetId, mercados: o.mercados, vagasPorMercado: o.vagasPorMercado, robosNasVagasVazias: o.robos, duracaoMeses: 120, segundosPorTick: o.segundosPorTick, modo: "continuo", edicaoNaPausa: true },
    }),
  });
  const sala = (await criada.json()) as { ok: boolean; codigo: string; motivo?: string };
  if (!sala.ok) throw new Error(`não criou a sala: ${sala.motivo ?? criada.status}`);
  const professor = new Professor(o.base, sala.codigo, cookieDe(criada));

  const medidas: Medidas = { latencias: [], intervalos: [], tamanhos: [], mensagens: 0, bytes: 0, quedas: 0, enviados: 0, problemas: 0, recusas: {} };
  const sorteio = gerador(o.semente);
  const plano = planoDeEquipes(o.alunos, o.mercados, o.vagasPorMercado);
  const clientes: Cliente[] = [];
  let falhasDeEntrada = 0;

  // Entradas em ondas de 10 (a turma chega aos poucos, não no mesmo milissegundo).
  for (let i = 0; i < plano.length; i += 10) {
    await Promise.all(
      plano.slice(i, i + 10).map(async (p) => {
        try {
          const equipe = p.tipo === "nova" ? { tipo: "nova", empresa: p.empresa, nome: p.nomeDaEquipe, cor: p.cor } : { tipo: "existente", empresa: p.empresa };
          const r = await fetch(`${o.base}/api/alunos/entrar`, { method: "POST", headers: cabecalhos, body: JSON.stringify({ codigo: sala.codigo, nome: p.nome, equipe }) });
          const corpo = (await r.json()) as { ok: boolean };
          if (!corpo.ok) throw new Error(`entrada recusada (${r.status})`);
          const c = new Cliente(p.nome, p.empresa, cookieDe(r), o, medidas, p.tipo === "nova", sorteio);
          c.codigoDaSala = sala.codigo;
          await c.abrir();
          clientes.push(c);
        } catch {
          falhasDeEntrada++;
        }
      }),
    );
    await dorme(100);
  }

  await professor.abrir();
  await professor.comando({ tipo: "relogio", acao: "iniciar" });
  const inicio = performance.now();
  const tickInicial = professor.tick;

  // Cada aluno decide em intervalos irregulares até o fim da duração.
  const fim = inicio + o.duracaoSegundos * 1000;
  await Promise.all(
    clientes.map(async (c) => {
      await dorme(sorteio() * o.intervaloDecisaoMs);
      while (performance.now() < fim) {
        const d = c.decisao();
        if (d) c.enviar(d);
        await dorme(o.intervaloDecisaoMs * (0.5 + sorteio()));
      }
    }),
  );
  await dorme(1000); // respostas que ainda estão a caminho

  const decorrido = (performance.now() - inicio) / 1000;
  const ticksJogados = professor.tick - tickInicial;
  const ticksEsperados = Math.floor(decorrido / o.segundosPorTick);
  for (const c of clientes) c.encerrar();
  professor.encerrar();

  const criterios = criteriosDeCarga({
    alunos: o.alunos,
    falhasDeEntrada,
    quedas: medidas.quedas,
    latencias: medidas.latencias,
    comandosEnviados: medidas.enviados,
    comandosComProblema: medidas.problemas,
    ticksEsperados,
    ticksJogados,
    intervalosMs: medidas.intervalos,
    segundosPorTick: o.segundosPorTick,
  });
  return {
    opcoes: o,
    codigo: sala.codigo,
    falhasDeEntrada,
    quedas: medidas.quedas,
    comandosEnviados: medidas.enviados,
    comandosComProblema: medidas.problemas,
    recusas: medidas.recusas,
    latencia: resumir(medidas.latencias),
    intervalo: resumir(medidas.intervalos),
    tamanhoDaMensagem: resumir(medidas.tamanhos),
    mensagensRecebidas: medidas.mensagens,
    bytesRecebidos: medidas.bytes,
    ticksEsperados,
    ticksJogados,
    criterios,
    aprovado: criterios.every((c) => c.passou),
  };
}

/** O professor da sala: inicia o relógio e acompanha o tick. */
class Professor {
  tick = 0;
  private ws!: WebSocket;
  private respostas = new Map<string, { ok: boolean }>();

  constructor(private base: string, private codigo: string, private cookie: string) {}

  async abrir(): Promise<void> {
    // @ts-ignore: o Bun aceita cabeçalhos no WebSocket
    this.ws = new WebSocket(`${this.base.replace(/^http/, "ws")}/ws?codigo=${this.codigo}&papel=professor`, { headers: { cookie: this.cookie, origin: this.base } });
    this.ws.onmessage = (e) => {
      const m = JSON.parse(String(e.data)) as { tipo: string; visao?: { relogio?: { tick: number } }; idComando?: string; ok?: boolean };
      if (m.visao?.relogio) this.tick = m.visao.relogio.tick;
      if (m.tipo === "resposta" && m.idComando) this.respostas.set(m.idComando, { ok: m.ok === true });
    };
    await new Promise<void>((ok, erro) => {
      this.ws.onopen = () => ok();
      this.ws.onerror = () => erro(new Error("o professor não abriu o WebSocket"));
    });
    for (let i = 0; i < 50 && this.tick === 0 && this.respostas.size === 0; i++) await dorme(50);
  }

  async comando(corpo: object): Promise<void> {
    const idComando = idDeComando();
    this.ws.send(JSON.stringify({ tickEsperado: this.tick, ...corpo, idComando, tipo: "relogio" }));
    for (let i = 0; i < 100; i++) {
      const r = this.respostas.get(idComando);
      if (r) {
        if (!r.ok) throw new Error("o servidor recusou o comando do professor");
        return;
      }
      await dorme(50);
    }
    throw new Error("sem resposta ao comando do professor");
  }

  encerrar(): void {
    this.ws.close();
  }
}
