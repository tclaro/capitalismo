/**
 * Cliente WebSocket (conexao.ts) com socket e relógio falsos: reconexão, descarte de ticks antigos,
 * reenvio idempotente, vigia de conexão morta e fechamentos definitivos.
 */
import { describe, expect, test } from "bun:test";
import type { Visao } from "@simulador/compartilhado";
import {
  type Armazenamento,
  type ComandoPendente,
  ConexaoSala,
  ESPERA_MAXIMA_MS,
  INTERVALO_PING_MS,
  type Relogio,
  SILENCIO_MAXIMO_MS,
  type SocketLike,
  urlDoWebSocket,
} from "../src/cliente/conexao";

class RelogioFalso implements Relogio {
  t = 0;
  private timers: { quando: number; fn: () => void; id: number }[] = [];
  private id = 0;
  agora = () => this.t;
  agendar = (ms: number, fn: () => void) => {
    const id = this.id++;
    this.timers.push({ quando: this.t + ms, fn, id });
    return () => {
      this.timers = this.timers.filter((x) => x.id !== id);
    };
  };
  avancar(ms: number): void {
    const fim = this.t + ms;
    for (;;) {
      this.timers.sort((a, b) => a.quando - b.quando || a.id - b.id);
      const p = this.timers[0];
      if (!p || p.quando > fim) break;
      this.timers.shift();
      this.t = p.quando;
      p.fn();
    }
    this.t = fim;
  }
  proximo(): number | null {
    const q = this.timers.map((x) => x.quando - this.t);
    return q.length ? Math.min(...q) : null;
  }
}

class SocketFalso implements SocketLike {
  readyState = 0;
  enviadas: unknown[] = [];
  fechadoCom: number | null = null;
  onopen: ((e: unknown) => void) | null = null;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onclose: ((e: { code: number; reason: string }) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  constructor(readonly url: string) {}
  send(dados: string): void {
    if (this.readyState !== 1) throw new Error("socket não está aberto");
    this.enviadas.push(JSON.parse(dados));
  }
  close(codigo = 1000): void {
    this.fechadoCom = codigo;
    this.readyState = 3;
  }
  // Ações do "servidor"
  abrir(): void {
    this.readyState = 1;
    this.onopen?.({});
  }
  receber(m: unknown): void {
    this.onmessage?.({ data: JSON.stringify(m) });
  }
  cair(codigo = 1006): void {
    this.readyState = 3;
    this.onerror?.({});
    this.onclose?.({ code: codigo, reason: "" });
  }
}

const visao = (tick: number, extra: Record<string, unknown> = {}) => ({ relogio: { tick }, ...extra }) as unknown as Visao;

function montar(opcoes: { verificarAcesso?: () => Promise<boolean>; armazenamento?: Armazenamento } = {}) {
  const relogio = new RelogioFalso();
  const sockets: SocketFalso[] = [];
  let n = 0;
  const conexao = new ConexaoSala({
    url: "ws://servidor/ws?codigo=ABCDE&papel=aluno",
    criarSocket: (url) => {
      const s = new SocketFalso(url);
      sockets.push(s);
      return s;
    },
    relogio,
    aleatorio: () => 1,
    gerarId: () => `cmd-teste-${String(++n).padStart(4, "0")}`,
    ...opcoes,
  });
  const ultimo = () => sockets.at(-1)!;
  return { relogio, sockets, conexao, ultimo };
}

describe("conexão", () => {
  test("abre, recebe snapshot e atualizações; descarta tick antigo", () => {
    const { conexao, ultimo } = montar();
    const mudancas: string[] = [];
    conexao.assinar(() => mudancas.push(conexao.instantaneo().estado));
    conexao.iniciar();
    expect(conexao.instantaneo().estado).toBe("conectando");
    ultimo().abrir();
    expect(conexao.instantaneo().estado).toBe("aberta");
    ultimo().receber({ tipo: "snapshot", papel: "aluno", visao: visao(5) });
    expect(conexao.instantaneo()).toMatchObject({ papel: "aluno", visao: { relogio: { tick: 5 } } });
    ultimo().receber({ tipo: "atualizacao", papel: "aluno", visao: visao(6, { marca: "nova" }) });
    ultimo().receber({ tipo: "atualizacao", papel: "aluno", visao: visao(4, { marca: "velha" }) });
    expect(conexao.instantaneo().visao).toMatchObject({ relogio: { tick: 6 }, marca: "nova" });
    // Atualização do mesmo tick vale (ex.: uma decisão pendente nova).
    ultimo().receber({ tipo: "atualizacao", papel: "aluno", visao: visao(6, { marca: "mesmo tick" }) });
    expect(conexao.instantaneo().visao).toMatchObject({ marca: "mesmo tick" });
    // Snapshot sempre vale (ex.: após comando desatualizado).
    ultimo().receber({ tipo: "snapshot", papel: "aluno", visao: visao(3) });
    expect(conexao.instantaneo().visao!.relogio.tick).toBe(3);
    // Mensagem que não é JSON: ignorada.
    ultimo().onmessage?.({ data: "{quebrado" });
    ultimo().receber({ tipo: "erro", motivo: "muitas mensagens; aguarde" });
    expect(conexao.instantaneo().erro).toBe("muitas mensagens; aguarde");
    expect(mudancas[0]).toBe("aberta");
  });

  test("instantâneo estável entre mudanças (exigência do useSyncExternalStore)", () => {
    const { conexao, ultimo } = montar();
    conexao.iniciar();
    ultimo().abrir();
    const a = conexao.instantaneo();
    expect(conexao.instantaneo()).toBe(a);
    ultimo().receber({ tipo: "pong" });
    expect(conexao.instantaneo()).toBe(a);
    ultimo().receber({ tipo: "snapshot", papel: "aluno", visao: visao(1) });
    expect(conexao.instantaneo()).not.toBe(a);
  });

  test("reconexão com espera exponencial até o teto; zera depois de abrir", () => {
    const { conexao, sockets, relogio, ultimo } = montar();
    conexao.iniciar();
    const esperas: number[] = [];
    for (let i = 0; i < 7; i++) {
      ultimo().cair();
      expect(conexao.instantaneo().estado).toBe("reconectando");
      esperas.push(relogio.proximo()!);
      relogio.avancar(relogio.proximo()!);
    }
    expect(esperas).toEqual([500, 1000, 2000, 4000, 8000, ESPERA_MAXIMA_MS, ESPERA_MAXIMA_MS]);
    expect(sockets).toHaveLength(8);
    ultimo().abrir();
    expect(conexao.instantaneo()).toMatchObject({ estado: "aberta", falhas: 0 });
    ultimo().cair();
    // Abriu e caiu: volta à primeira espera (e o timer do ping foi cancelado).
    expect(relogio.proximo()).toBe(500);
  });

  test("variação aleatória: entre 50% e 100% da espera", () => {
    for (const r of [0, 0.3, 1]) {
      const c = new ConexaoSala({ url: "ws://x", criarSocket: (u) => new SocketFalso(u), aleatorio: () => r });
      expect(c.esperaParaTentativa(1)).toBe(Math.round(500 * (0.5 + 0.5 * r)));
      expect(c.esperaParaTentativa(30)).toBe(Math.round(ESPERA_MAXIMA_MS * (0.5 + 0.5 * r)));
    }
  });

  test("comandos: enviados com id; reenviados com o MESMO id após reconectar; resolvem na resposta", async () => {
    const { conexao, ultimo, relogio } = montar();
    conexao.iniciar();
    // Comando antes de abrir: fica na fila e sai ao abrir.
    const p1 = conexao.comando({ tipo: "pronto", pronto: true });
    expect(conexao.instantaneo().pendentes).toBe(1);
    ultimo().abrir();
    expect(ultimo().enviadas).toEqual([{ tipo: "pronto", pronto: true, idComando: "cmd-teste-0001" }]);
    const p2 = conexao.comando({ tipo: "decidir", decisoes: [{ tipo: "produto", produto: "leite", preco: 500 }] });
    expect(ultimo().enviadas).toHaveLength(2);
    // Cai antes das respostas: ao reconectar, os dois saem de novo, com os mesmos ids.
    ultimo().cair();
    relogio.avancar(500);
    ultimo().abrir();
    expect(ultimo().enviadas.map((m) => (m as ComandoPendente).idComando)).toEqual(["cmd-teste-0001", "cmd-teste-0002"]);
    ultimo().receber({ tipo: "resposta", idComando: "cmd-teste-0002", ok: false, motivo: "preço acima do teto" });
    ultimo().receber({ tipo: "resposta", idComando: "cmd-teste-0001", ok: true });
    // Resposta repetida (o servidor responde de novo ao reenvio): ignorada.
    ultimo().receber({ tipo: "resposta", idComando: "cmd-teste-0001", ok: true });
    expect(await p1).toEqual({ ok: true });
    expect(await p2).toEqual({ ok: false, motivo: "preço acima do teto" });
    expect(conexao.instantaneo().pendentes).toBe(0);
  });

  test("pendentes guardados no navegador sobrevivem a recarregar a página", () => {
    let guardado: ComandoPendente[] = [];
    const armazenamento: Armazenamento = { ler: () => guardado, gravar: (p) => (guardado = p) };
    const a = montar({ armazenamento });
    a.conexao.iniciar();
    void a.conexao.comando({ tipo: "pronto", pronto: true });
    expect(guardado).toEqual([{ tipo: "pronto", pronto: true, idComando: "cmd-teste-0001" }]);
    a.conexao.encerrar();
    // "Recarrega a página": nova conexão lê o que ficou guardado e reenvia com o mesmo id.
    const b = montar({ armazenamento });
    expect(b.conexao.instantaneo().pendentes).toBe(1);
    b.conexao.iniciar();
    b.ultimo().abrir();
    expect(b.ultimo().enviadas).toEqual([{ tipo: "pronto", pronto: true, idComando: "cmd-teste-0001" }]);
    b.ultimo().receber({ tipo: "resposta", idComando: "cmd-teste-0001", ok: true });
    expect(guardado).toEqual([]);
  });

  test("vigia: ping periódico; silêncio longo derruba e reconecta", () => {
    const { conexao, sockets, relogio, ultimo } = montar();
    conexao.iniciar();
    ultimo().abrir();
    relogio.avancar(INTERVALO_PING_MS);
    expect(ultimo().enviadas).toEqual([{ tipo: "ping" }]);
    ultimo().receber({ tipo: "pong" });
    relogio.avancar(INTERVALO_PING_MS);
    expect(ultimo().enviadas).toHaveLength(2);
    // Servidor some sem fechar: sem nenhuma mensagem por mais de SILENCIO_MAXIMO_MS.
    const antigo = ultimo();
    relogio.avancar(SILENCIO_MAXIMO_MS);
    expect(antigo.fechadoCom).toBe(4000);
    expect(conexao.instantaneo().estado).toBe("reconectando");
    relogio.avancar(500);
    expect(sockets).toHaveLength(2);
  });

  test("fechamentos definitivos encerram sem tentar de novo e falham os pendentes", async () => {
    for (const [codigo, trecho] of [
      [4001, "equipe"],
      [4003, "telão"],
      [4004, "excluída"],
    ] as const) {
      const { conexao, sockets, relogio, ultimo } = montar();
      conexao.iniciar();
      ultimo().abrir();
      const p = conexao.comando({ tipo: "pronto", pronto: true });
      ultimo().cair(codigo);
      expect(conexao.instantaneo().estado).toBe("encerrada");
      expect(conexao.instantaneo().motivo).toContain(trecho);
      expect(await p).toEqual({ ok: false, motivo: "conexão encerrada" });
      relogio.avancar(60_000);
      expect(sockets).toHaveLength(1);
      expect(await conexao.comando({ tipo: "pronto", pronto: false })).toEqual({ ok: false, motivo: "conexão encerrada" });
    }
  });

  test("sem nunca abrir: depois de 2 falhas pergunta se ainda há acesso", async () => {
    let perguntas = 0;
    let resposta = true;
    const { conexao, sockets, relogio, ultimo } = montar({
      verificarAcesso: async () => {
        perguntas++;
        return resposta;
      },
    });
    conexao.iniciar();
    ultimo().cair();
    expect(perguntas).toBe(0);
    relogio.avancar(500);
    ultimo().cair();
    await Bun.sleep(0);
    expect(perguntas).toBe(1);
    // Com acesso (ex.: servidor reiniciando): continua tentando.
    relogio.avancar(1000);
    expect(sockets).toHaveLength(3);
    resposta = false;
    ultimo().cair();
    await Bun.sleep(0);
    expect(conexao.instantaneo()).toMatchObject({ estado: "encerrada", motivo: expect.stringContaining("sessão") });
    relogio.avancar(60_000);
    expect(sockets).toHaveLength(3);
  });

  test("verificação que falha (servidor fora): continua tentando", async () => {
    const { conexao, sockets, relogio, ultimo } = montar({ verificarAcesso: () => Promise.reject(new Error("fora")) });
    conexao.iniciar();
    ultimo().cair();
    relogio.avancar(500);
    ultimo().cair();
    await Bun.sleep(0);
    relogio.avancar(1000);
    expect(sockets).toHaveLength(3);
    expect(conexao.instantaneo().estado).toBe("reconectando");
  });

  test("encerrar pela tela: fecha o socket, sem reconectar e sem eventos tardios", () => {
    const { conexao, sockets, relogio, ultimo } = montar();
    conexao.iniciar();
    const s = ultimo();
    s.abrir();
    conexao.encerrar();
    expect(s.fechadoCom).toBe(1000);
    s.cair();
    relogio.avancar(60_000);
    expect(sockets).toHaveLength(1);
    expect(conexao.instantaneo().estado).toBe("encerrada");
    conexao.iniciar();
    expect(sockets).toHaveLength(1);
  });

  test("URL do WebSocket na mesma origem, com token só quando há", () => {
    expect(urlDoWebSocket({ protocol: "http:", host: "10.0.0.5:47800" }, { codigo: "ABCDE", papel: "aluno" })).toBe("ws://10.0.0.5:47800/ws?codigo=ABCDE&papel=aluno");
    expect(urlDoWebSocket({ protocol: "https:", host: "x" }, { codigo: "ABCDE", papel: "telao", token: "a+b/c" })).toBe("wss://x/ws?codigo=ABCDE&papel=telao&t=a%2Bb%2Fc");
  });
});
