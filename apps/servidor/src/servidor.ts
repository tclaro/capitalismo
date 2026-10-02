/**
 * Servidor HTTP + WebSocket (seções 9.6 e 9.8).
 *
 * Autenticação:
 * - professor cria a sala com a chave compartilhada e recebe um cookie; reabre com código + PIN;
 * - aluno entra com código + nome/apelido (+ equipe) e recebe um cookie;
 * - telão usa o token do link (`?t=`), somente leitura;
 * - `/api/admin/*` só em localhost.
 * Cookies por sala e por papel (`sm_a_<código>`, `sm_p_<código>`), `HttpOnly; SameSite=Strict`.
 * `Origin` conferido no upgrade do WebSocket e nos pedidos que mudam algo.
 *
 * Envio: pub/sub do Bun, com a mensagem serializada uma vez por tópico. Tópicos por sala:
 * `<sala>:eq:<empresa>` (alunos da equipe), `<sala>:telao`, `<sala>:prof`. Várias mudanças no mesmo
 * turno do laço de eventos viram um envio só.
 */
import type { Server, ServerWebSocket } from "bun";
import {
  type AlunoEntrou,
  CodigoSala,
  ConfigSala,
  CriarSala,
  type Diagnostico,
  EntrarAluno,
  EntrarProfessor,
  type HistoricoDaSala,
  type InfoPublicaSala,
  type InfoServidor,
  type ListaDoAdmin,
  MENSAGENS_DO_ALUNO,
  MENSAGENS_DO_PROFESSOR,
  MensagemCliente,
  type MensagemServidor,
  PALETA_EQUIPES,
  type Papel,
  type RegistroDeTeste,
  RelatorioTeste,
  type SalaCriada,
  type SessaoNaSala,
  VERSAO_PROTOCOLO,
  validar,
} from "@simulador/compartilhado";
import { PRESETS } from "@simulador/catalogo";
import { ESTRATEGIAS_RAZOAVEIS } from "@simulador/motor";
import { DURACAO_SESSAO_MS, type PapelComSessao, type RegraDeLimite } from "./dados/acessos";
import type { Gerente } from "./gerente";
import { apagarCookie, cookieDeSessao, ErroHttp, ehPedidoLocal, erro, ipDoCliente, json, lerCookies, lerJson, origemPermitida } from "./http/util";
import { listarIPv4 } from "./rede";
import { infoDe, projetarEquipe, projetarProfessor, projetarTelao, relogioDe, vagasPublicas } from "./sala/projecoes";
import { ErroDeSala, type Resposta, type Sala } from "./sala/sala";

export const PORTA_PADRAO = 47800;

const MINUTO = 60_000;
/** Regras do limite de tentativas (por IP e, para o PIN, também por sala). */
export const REGRAS: Record<"chave" | "pinIp" | "pinSala" | "codigo" | "entrada" | "teste", RegraDeLimite> = {
  chave: { maxFalhas: 5, janelaMs: 10 * MINUTO, bloqueioMs: MINUTO, bloqueioMaxMs: 30 * MINUTO },
  pinIp: { maxFalhas: 5, janelaMs: 10 * MINUTO, bloqueioMs: MINUTO, bloqueioMaxMs: 30 * MINUTO },
  pinSala: { maxFalhas: 20, janelaMs: 10 * MINUTO, bloqueioMs: 5 * MINUTO, bloqueioMaxMs: 30 * MINUTO },
  codigo: { maxFalhas: 20, janelaMs: 10 * MINUTO, bloqueioMs: MINUTO, bloqueioMaxMs: 10 * MINUTO },
  entrada: { maxFalhas: 30, janelaMs: 10 * MINUTO, bloqueioMs: MINUTO, bloqueioMaxMs: 10 * MINUTO },
  // Não são falhas: cada relatório de teste de conexão conta (uma sala inteira testando cabe folgado).
  teste: { maxFalhas: 20, janelaMs: 10 * MINUTO, bloqueioMs: MINUTO, bloqueioMaxMs: 10 * MINUTO },
};

/** Mensagens por conexão: balde de 30, recarga de 10 por segundo. */
const BALDE_CAPACIDADE = 30;
const BALDE_RECARGA_POR_S = 10;
/** Mensagens recusadas por excesso antes de fechar a conexão. */
const EXCESSOS_ATE_FECHAR = 20;

/** Relatórios da página /teste guardados em memória para o diagnóstico (os mais recentes). */
const TESTES_GUARDADOS = 200;
/** O WebSocket de teste fecha sozinho depois disso. */
const DURACAO_WS_TESTE_MS = 20_000;

/**
 * Presets oferecidos na criação da sala (os de teste só por API). Os que trazem o bloco `cadeia` ficam
 * de fora até a tela da cadeia existir (fase 1b, entrega 8): o motor, o protocolo e as projeções já
 * funcionam (a sala liga o módulo sozinha), mas sem a tela o aluno não vê nem comanda as fazendas.
 */
const PRESETS_JOGAVEIS = Object.values(PRESETS)
  .filter((p) => !p.id.startsWith("teste/") && p.cadeia === undefined)
  .map((p) => ({ id: p.id, nome: p.nome }));

export interface DadosConexao {
  /** Vazio no WebSocket da página /teste. */
  salaId: string;
  papel: Papel | "teste";
  membro: string | null;
  empresa: string | null;
  fichas: number;
  ultimaRecarga: number;
  excessos: number;
  /** Timer que fecha o WebSocket de teste. */
  fim: ReturnType<typeof setTimeout> | null;
}

export interface OpcoesServidor {
  gerente: Gerente;
  porta?: number;
  hostname?: string;
  /** Desenvolvimento: aceita a origem do Vite (porta 5173). */
  dev?: boolean;
  versao?: string;
  /** Arquivos estáticos da interface (entrega 4); `null` = não é um deles. */
  estaticos?: (req: Request) => Response | null | Promise<Response | null>;
}

export interface ServidorDoSimulador {
  server: Server<DadosConexao>;
  porta: number;
  parar(): Promise<void>;
}

const ORIGENS_DEV = ["http://localhost:5173", "http://127.0.0.1:5173"];

const nomeCookie = (papel: PapelComSessao, codigo: string) => `sm_${papel === "aluno" ? "a" : "p"}_${codigo}`;
export const topico = {
  equipe: (salaId: string, empresa: string) => `${salaId}:eq:${empresa}`,
  telao: (salaId: string) => `${salaId}:telao`,
  professor: (salaId: string) => `${salaId}:prof`,
};

/** Cabeçalhos de segurança em todas as respostas; `no-referrer` evita vazar o token do telão. */
const CABECALHOS_SEGURANCA: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
};

export function iniciarServidor(opcoes: OpcoesServidor): ServidorDoSimulador {
  const { gerente } = opcoes;
  const { acessos, limites } = gerente;
  const origensExtras = opcoes.dev ? ORIGENS_DEV : [];
  const conexoes = new Map<string, Set<ServerWebSocket<DadosConexao>>>();
  const testes: RegistroDeTeste[] = [];
  let server!: Server<DadosConexao>;

  const linkTelao = (sala: Sala) => `/telao/${sala.codigo}?t=${acessos.tokenTelao(sala.id) ?? ""}`;
  const enderecos = () =>
    listarIPv4()
      .filter((i) => !i.interna)
      .map((i) => `http://${i.endereco}:${server.port}`);

  // -------------------------------------------------------------------------------------------
  // Projeções e envio
  // -------------------------------------------------------------------------------------------

  const conectados = (sala: Sala) => {
    const ids = new Set<string>();
    for (const ws of conexoes.get(sala.id) ?? []) if (ws.data.membro) ids.add(ws.data.membro);
    return ids;
  };

  function visaoDe(sala: Sala, d: DadosConexao & { papel: Papel }) {
    switch (d.papel) {
      case "aluno":
        return projetarEquipe(sala, d.empresa!);
      case "telao":
        return projetarTelao(sala);
      case "professor":
        return projetarProfessor(sala, linkTelao(sala), null, conectados(sala));
    }
  }

  const enviar = (ws: ServerWebSocket<DadosConexao>, m: MensagemServidor) => ws.send(JSON.stringify(m));

  function enviarSnapshot(ws: ServerWebSocket<DadosConexao>, sala: Sala): void {
    const d = ws.data;
    if (d.papel === "teste") return;
    enviar(ws, { tipo: "snapshot", papel: d.papel, visao: visaoDe(sala, { ...d, papel: d.papel }) });
  }

  function publicar(sala: Sala): void {
    for (const v of sala.vagas) {
      const t = topico.equipe(sala.id, v.empresa);
      if (server.subscriberCount(t) > 0) server.publish(t, JSON.stringify({ tipo: "atualizacao", papel: "aluno", visao: projetarEquipe(sala, v.empresa) } satisfies MensagemServidor));
    }
    const t = topico.telao(sala.id);
    if (server.subscriberCount(t) > 0) server.publish(t, JSON.stringify({ tipo: "atualizacao", papel: "telao", visao: projetarTelao(sala) } satisfies MensagemServidor));
    const p = topico.professor(sala.id);
    if (server.subscriberCount(p) > 0) {
      server.publish(p, JSON.stringify({ tipo: "atualizacao", papel: "professor", visao: projetarProfessor(sala, linkTelao(sala), null, conectados(sala)) } satisfies MensagemServidor));
    }
  }

  const agendadas = new Set<string>();
  function agendarEnvio(salaId: string): void {
    if (agendadas.has(salaId)) return;
    agendadas.add(salaId);
    queueMicrotask(() => {
      agendadas.delete(salaId);
      const sala = gerente.sala(salaId);
      if (!sala) return;
      try {
        publicar(sala);
      } catch (e) {
        gerente.log("erro", `sala ${sala.codigo}: falha ao enviar às telas`, e);
      }
    });
  }

  /** Alunos movidos pelo professor passam a ouvir a nova equipe; removidos são desconectados. */
  function realocarAlunos(sala: Sala): void {
    for (const ws of conexoes.get(sala.id) ?? []) {
      if (ws.data.papel !== "aluno") continue;
      const m = sala.membro(ws.data.membro!);
      if (!m) {
        ws.close(4001, "aluno removido");
        continue;
      }
      if (m.empresa === ws.data.empresa) continue;
      ws.unsubscribe(topico.equipe(sala.id, ws.data.empresa!));
      ws.data.empresa = m.empresa;
      ws.subscribe(topico.equipe(sala.id, m.empresa));
      enviarSnapshot(ws, sala);
    }
  }

  gerente.ouvinte = (sala, motivo) => {
    if (motivo === "equipes") realocarAlunos(sala);
    agendarEnvio(sala.id);
  };
  gerente.aoExcluir = (sala) => {
    for (const ws of conexoes.get(sala.id) ?? []) ws.close(4004, "sala excluída");
    conexoes.delete(sala.id);
  };

  // -------------------------------------------------------------------------------------------
  // Sessões e limites
  // -------------------------------------------------------------------------------------------

  function sessaoDe(req: Request, sala: Sala, papel: PapelComSessao) {
    const token = lerCookies(req).get(nomeCookie(papel, sala.codigo));
    if (!token) return null;
    const s = acessos.sessao(token);
    if (!s || s.salaId !== sala.id || s.papel !== papel) return null;
    if (papel === "aluno" && (!s.membro || !sala.membro(s.membro))) return null;
    return s;
  }

  function novaSessao(sala: Sala, papel: PapelComSessao, membro: string | null): string {
    const token = acessos.criarSessao({ salaId: sala.id, papel, membro });
    return cookieDeSessao(nomeCookie(papel, sala.codigo), token, Math.floor(DURACAO_SESSAO_MS / 1000));
  }

  /** Resposta 429 se alguma das chaves está bloqueada. */
  function bloqueado(chaves: readonly string[]): Response | null {
    for (const k of chaves) {
      const falta = limites.bloqueio(k);
      if (falta !== null) {
        const s = Math.ceil(falta / 1000);
        return json({ ok: false, motivo: `muitas tentativas; aguarde ${s} s`, esperaS: s }, 429, { "Retry-After": String(s) });
      }
    }
    return null;
  }

  // -------------------------------------------------------------------------------------------
  // Rotas HTTP
  // -------------------------------------------------------------------------------------------

  async function rotear(req: Request, url: URL): Promise<Response | undefined> {
    const ip = ipDoCliente(server, req);
    const { pathname: caminho } = url;
    const metodo = req.method;
    const mutavel = metodo !== "GET" && metodo !== "HEAD";
    if (mutavel && !origemPermitida(req, origensExtras)) return erro(403, "origem não permitida");

    if (caminho === "/ws" && metodo === "GET") return upgrade(req, url);

    if (caminho === "/api/servidor" && metodo === "GET") {
      return json({
        versao: opcoes.versao ?? "dev",
        protocolo: VERSAO_PROTOCOLO,
        porta: server.port ?? 0,
        enderecos: enderecos(),
        chaveDefinida: acessos.chaveDefinida(),
        estrategiasDeRobo: ESTRATEGIAS_RAZOAVEIS,
        presets: PRESETS_JOGAVEIS,
      } satisfies InfoServidor);
    }

    // Teste de conexão (página /teste): ping HTTP e registro do resultado para o diagnóstico.
    if (caminho === "/api/teste/ping" && metodo === "GET") return json({ ok: true });
    if (caminho === "/api/teste" && metodo === "POST") {
      // Conta o pedido antes de conferir: o limite vale para o próprio pedido que o estoura.
      limites.registrarFalha(`teste:ip:${ip}`, REGRAS.teste);
      const b = bloqueado([`teste:ip:${ip}`]);
      if (b) return b;
      const corpo = validar(RelatorioTeste, await lerJson(req, 2_000));
      if (!corpo.ok) return erro(400, corpo.erro);
      testes.unshift({ quando: new Date().toISOString(), ip, navegador: (req.headers.get("user-agent") ?? "?").slice(0, 200), ...corpo.valor });
      testes.length = Math.min(testes.length, TESTES_GUARDADOS);
      return json({ ok: true, ip });
    }

    // Criar sala (professor, com a chave compartilhada).
    if (caminho === "/api/salas" && metodo === "POST") {
      const b = bloqueado([`chave:ip:${ip}`]);
      if (b) return b;
      const corpo = validar(CriarSala, await lerJson(req));
      if (!corpo.ok) return erro(400, corpo.erro);
      if (!acessos.chaveDefinida()) return erro(409, "a chave de professor ainda não foi definida (abra /admin neste computador)");
      if (!(await acessos.conferirChave(corpo.valor.chave))) {
        limites.registrarFalha(`chave:ip:${ip}`, REGRAS.chave);
        return erro(401, "chave de professor incorreta");
      }
      limites.limpar(`chave:ip:${ip}`);
      let criada: Awaited<ReturnType<Gerente["criarSala"]>>;
      try {
        criada = await gerente.criarSala(corpo.valor.config);
      } catch (e) {
        if (e instanceof ErroDeSala) return erro(400, e.message);
        throw e;
      }
      const { sala, pin } = criada;
      return json({ ok: true, codigo: sala.codigo, pin, linkTelao: linkTelao(sala), enderecos: enderecos() } satisfies SalaCriada, 201, { "Set-Cookie": novaSessao(sala, "professor", null) });
    }

    // Reabrir como professor (código + PIN).
    if (caminho === "/api/professor/entrar" && metodo === "POST") {
      const corpo = validar(EntrarProfessor, await lerJson(req));
      if (!corpo.ok) return erro(400, corpo.erro);
      const b = bloqueado([`pin:ip:${ip}`, `codigo:ip:${ip}`]);
      if (b) return b;
      const sala = gerente.salaPorCodigo(corpo.valor.codigo);
      if (!sala) {
        limites.registrarFalha(`codigo:ip:${ip}`, REGRAS.codigo);
        return erro(404, "sala não encontrada");
      }
      const bs = bloqueado([`pin:sala:${sala.id}`]);
      if (bs) return bs;
      if (!(await acessos.conferirPin(sala.id, corpo.valor.pin))) {
        limites.registrarFalha(`pin:ip:${ip}`, REGRAS.pinIp);
        limites.registrarFalha(`pin:sala:${sala.id}`, REGRAS.pinSala);
        return erro(401, "PIN incorreto");
      }
      limites.limpar(`pin:ip:${ip}`);
      return json({ ok: true, codigo: sala.codigo }, 200, { "Set-Cookie": novaSessao(sala, "professor", null) });
    }

    // Entrada do aluno (código + nome + equipe existente ou nova).
    if (caminho === "/api/alunos/entrar" && metodo === "POST") {
      const b = bloqueado([`entrada:ip:${ip}`, `codigo:ip:${ip}`]);
      if (b) return b;
      const corpo = validar(EntrarAluno, await lerJson(req));
      if (!corpo.ok) return erro(400, corpo.erro);
      const sala = gerente.salaPorCodigo(corpo.valor.codigo);
      if (!sala) {
        limites.registrarFalha(`codigo:ip:${ip}`, REGRAS.codigo);
        return erro(404, "sala não encontrada");
      }
      const r = sala.entrarAluno(corpo.valor.nome, corpo.valor.equipe);
      if (!r.ok) {
        limites.registrarFalha(`entrada:ip:${ip}`, REGRAS.entrada);
        return erro(409, r.motivo);
      }
      return json({ ok: true, codigo: sala.codigo, membro: r.membro.id, nome: r.membro.nome, empresa: r.membro.empresa } satisfies AlunoEntrou, 200, {
        "Set-Cookie": novaSessao(sala, "aluno", r.membro.id),
      });
    }

    if (caminho.startsWith("/api/admin/")) return rotearAdmin(req, caminho, metodo);

    // Rotas de uma sala: /api/salas/<código>[/...]
    const m = /^\/api\/salas\/([^/]+)(\/.*)?$/.exec(caminho);
    if (m) {
      const codigo = validar(CodigoSala, m[1]);
      const resto = m[2] ?? "";
      const b = bloqueado([`codigo:ip:${ip}`]);
      if (b) return b;
      const sala = codigo.ok ? gerente.salaPorCodigo(codigo.valor) : undefined;
      if (!sala) {
        limites.registrarFalha(`codigo:ip:${ip}`, REGRAS.codigo);
        return erro(404, "sala não encontrada");
      }
      return rotearSala(req, url, sala, resto, metodo);
    }

    if (caminho.startsWith("/api/")) return erro(404, "rota não encontrada");
    const estatico = await opcoes.estaticos?.(req);
    return estatico ?? new Response("Não encontrado", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }

  async function rotearSala(req: Request, url: URL, sala: Sala, resto: string, metodo: string): Promise<Response> {
    // Informação pública para a tela de entrada: equipes formadas, vagas livres e cores.
    if (resto === "" && metodo === "GET") {
      return json({ sala: infoDe(sala), relogio: relogioDe(sala), vagas: vagasPublicas(sala), cores: PALETA_EQUIPES } satisfies InfoPublicaSala);
    }

    // Quem sou eu nesta sala (a interface usa para decidir a tela).
    if (resto === "/sessao" && metodo === "GET") {
      const aluno = sessaoDe(req, sala, "aluno");
      const membro = aluno ? sala.membro(aluno.membro!)! : null;
      return json({ professor: sessaoDe(req, sala, "professor") !== null, aluno: membro ? { membro: membro.id, nome: membro.nome, empresa: membro.empresa } : null } satisfies SessaoNaSala);
    }

    if (resto === "/sair" && metodo === "POST") {
      const cookies = lerCookies(req);
      for (const papel of ["aluno", "professor"] as const) {
        const token = cookies.get(nomeCookie(papel, sala.codigo));
        if (token) acessos.encerrarSessao(token);
      }
      const h = new Headers({ "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
      h.append("Set-Cookie", apagarCookie(nomeCookie("aluno", sala.codigo)));
      h.append("Set-Cookie", apagarCookie(nomeCookie("professor", sala.codigo)));
      return new Response(JSON.stringify({ ok: true }), { headers: h });
    }

    // Séries semanais para os gráficos: o aluno só da própria empresa; o professor, de todas. O aluno
    // recebe também a participação semanal (pública) das empresas do seu mercado, e nada mais delas.
    if (resto === "/historico" && metodo === "GET") {
      const professor = sessaoDe(req, sala, "professor");
      const aluno = professor ? null : sessaoDe(req, sala, "aluno");
      if (!professor && !aluno) return erro(401, "entre na sala primeiro");
      const empresa = aluno ? sala.membro(aluno.membro!)!.empresa : (url.searchParams.get("empresa") ?? undefined);
      const semanas = gerente.repositorio.historicoSemanal(sala.id, empresa);
      const mercadoDoAluno = aluno ? sala.estado.empresas.find((e) => e.id === empresa)?.mercado : undefined;
      const mercado = mercadoDoAluno === undefined ? [] : gerente.repositorio.historicoSemanal(sala.id).filter((r) => r.mercado === mercadoDoAluno).map((r) => ({ semana: r.semana, empresa: r.empresa, produto: r.produto, participacao: r.participacao }));
      return json({ ok: true, semanas, mercado } satisfies HistoricoDaSala);
    }

    // Ações do professor por HTTP (as que devolvem segredo, que não vai pelo pub/sub).
    // O telão confere o próprio link (no navegador, o 401 do upgrade aparece só como queda).
    // Diagnóstico de rede do painel do professor: endereços e testes de conexão recebidos.
    if (resto === "/diagnostico" && metodo === "GET") {
      if (!sessaoDe(req, sala, "professor")) return erro(401, "só o professor da sala");
      return json({ ok: true, versao: opcoes.versao ?? "dev", porta: server.port ?? 0, enderecos: enderecos(), testes } satisfies Diagnostico);
    }

    if (resto === "/telao" && metodo === "GET") {
      const valido = acessos.conferirTelao(sala.id, url.searchParams.get("t") ?? "");
      return valido ? json({ ok: true }) : erro(401, "link do telão inválido ou revogado");
    }

    if (resto === "/pin" && metodo === "POST") {
      if (!sessaoDe(req, sala, "professor")) return erro(401, "só o professor da sala");
      return json({ ok: true, pin: await acessos.novoPin(sala.id) });
    }
    if (resto === "/telao/revogar" && metodo === "POST") {
      if (!sessaoDe(req, sala, "professor")) return erro(401, "só o professor da sala");
      acessos.revogarTelao(sala.id);
      for (const ws of conexoes.get(sala.id) ?? []) if (ws.data.papel === "telao") ws.close(4003, "link do telão revogado");
      agendarEnvio(sala.id);
      return json({ ok: true, linkTelao: linkTelao(sala) });
    }

    return erro(404, "rota não encontrada");
  }

  async function rotearAdmin(req: Request, caminho: string, metodo: string): Promise<Response> {
    if (!ehPedidoLocal(server, req)) return erro(403, "administração só neste computador (localhost)");
    if (caminho === "/api/admin/salas" && metodo === "GET") {
      return json({
        ok: true,
        chaveDefinida: acessos.chaveDefinida(),
        salas: gerente.todas().map((s) => ({ id: s.id, codigo: s.codigo, status: s.status, tick: s.estado.tick, presetId: s.config.presetId, membros: s.membros.length, conexoes: conexoes.get(s.id)?.size ?? 0 })),
      } satisfies ListaDoAdmin);
    }
    if (caminho === "/api/admin/chave" && metodo === "POST") {
      const corpo = (await lerJson(req)) as { chave?: unknown };
      if (typeof corpo?.chave !== "string" || corpo.chave.length < 8 || corpo.chave.length > 200) return erro(400, "a chave precisa ter de 8 a 200 caracteres");
      await acessos.definirChave(corpo.chave);
      gerente.log("info", "chave de professor definida");
      return json({ ok: true });
    }
    const m = /^\/api\/admin\/salas\/([^/]+)(\/encerrar)?$/.exec(caminho);
    const sala = m ? gerente.salaPorCodigo(m[1]!) : undefined;
    if (m && !sala) return erro(404, "sala não encontrada");
    if (sala && m![2] === "/encerrar" && metodo === "POST") {
      const r = sala.encerrar(`admin-${crypto.randomUUID()}`);
      return json(r, r.ok ? 200 : 409);
    }
    if (sala && !m![2] && metodo === "DELETE") {
      gerente.excluirSala(sala.id);
      return json({ ok: true });
    }
    return erro(404, "rota não encontrada");
  }

  // -------------------------------------------------------------------------------------------
  // WebSocket
  // -------------------------------------------------------------------------------------------

  function upgrade(req: Request, url: URL): Response | undefined {
    if (!origemPermitida(req, origensExtras)) return erro(403, "origem não permitida");
    // WebSocket da página /teste: sem sala nem sessão; só responde a pings e fecha sozinho.
    if (url.searchParams.get("papel") === "teste") {
      const ok = server.upgrade(req, { data: { salaId: "", papel: "teste", membro: null, empresa: null, fichas: BALDE_CAPACIDADE, ultimaRecarga: performance.now(), excessos: 0, fim: null } });
      return ok ? undefined : erro(400, "upgrade falhou");
    }
    const codigo = validar(CodigoSala, url.searchParams.get("codigo") ?? "");
    const sala = codigo.ok ? gerente.salaPorCodigo(codigo.valor) : undefined;
    if (!sala) return erro(404, "sala não encontrada");
    const papel = url.searchParams.get("papel");
    let dados: Pick<DadosConexao, "papel" | "membro" | "empresa">;
    if (papel === "aluno") {
      const s = sessaoDe(req, sala, "aluno");
      if (!s) return erro(401, "entre na sala primeiro");
      dados = { papel, membro: s.membro, empresa: sala.membro(s.membro!)!.empresa };
    } else if (papel === "professor") {
      if (!sessaoDe(req, sala, "professor")) return erro(401, "entre como professor primeiro");
      dados = { papel, membro: null, empresa: null };
    } else if (papel === "telao") {
      if (!acessos.conferirTelao(sala.id, url.searchParams.get("t") ?? "")) return erro(401, "link do telão inválido");
      dados = { papel, membro: null, empresa: null };
    } else {
      return erro(400, "papel inválido");
    }
    const ok = server.upgrade(req, { data: { ...dados, salaId: sala.id, fichas: BALDE_CAPACIDADE, ultimaRecarga: performance.now(), excessos: 0, fim: null } });
    return ok ? undefined : erro(400, "upgrade falhou");
  }

  /** Balde de fichas por conexão: devolve `false` se a mensagem deve ser recusada. */
  function consumirFicha(d: DadosConexao): boolean {
    const t = performance.now();
    d.fichas = Math.min(BALDE_CAPACIDADE, d.fichas + ((t - d.ultimaRecarga) / 1000) * BALDE_RECARGA_POR_S);
    d.ultimaRecarga = t;
    if (d.fichas < 1) return false;
    d.fichas -= 1;
    return true;
  }

  function tratar(ws: ServerWebSocket<DadosConexao>, sala: Sala, m: MensagemCliente): void {
    const d = ws.data;
    if (m.tipo === "ping") {
      enviar(ws, { tipo: "pong" });
      return;
    }
    const responder = (r: Resposta) => {
      enviar(ws, { tipo: "resposta", idComando: m.idComando, ok: r.ok, ...(r.motivo !== undefined ? { motivo: r.motivo } : {}) });
      if (r.motivo === "desatualizado") enviarSnapshot(ws, sala);
    };
    if (d.papel === "telao" || (MENSAGENS_DO_PROFESSOR.includes(m.tipo) && d.papel !== "professor") || (MENSAGENS_DO_ALUNO.includes(m.tipo) && d.papel !== "aluno")) {
      responder({ ok: false, motivo: "sem permissão" });
      return;
    }
    switch (m.tipo) {
      case "decidir":
        return responder(sala.decidir(m.idComando, d.membro!, m.decisoes));
      case "pronto":
        return responder(sala.marcarPronto(m.idComando, d.membro!, m.pronto));
      case "relogio":
        return responder(sala.comandoRelogio(m.idComando, m.tickEsperado, m.acao, m.unidade ?? "tick"));
      case "configurar": {
        const { tipo: _, idComando, ...mudancas } = m;
        return responder(sala.configurar(idComando, mudancas));
      }
      case "estender":
        return responder(sala.estender(m.idComando, m.meses));
      case "encerrar":
        return responder(sala.encerrar(m.idComando));
      case "renomearEquipe":
        return responder(sala.renomearEquipe(m.idComando, m.empresa, m.nome));
      case "moverAluno":
        return responder(sala.moverAluno(m.idComando, m.membro, m.empresa));
    }
  }

  server = Bun.serve<DadosConexao>({
    port: opcoes.porta ?? PORTA_PADRAO,
    hostname: opcoes.hostname ?? "0.0.0.0",
    async fetch(req) {
      const url = new URL(req.url);
      let resposta: Response | undefined;
      try {
        resposta = await rotear(req, url);
      } catch (e) {
        if (e instanceof ErroHttp) resposta = erro(e.status, e.message);
        else {
          gerente.log("erro", `${req.method} ${url.pathname}`, e);
          resposta = erro(500, "falha interna do servidor");
        }
      }
      if (resposta === undefined) return undefined; // upgrade do WebSocket
      for (const [k, v] of Object.entries(CABECALHOS_SEGURANCA)) resposta.headers.set(k, v);
      return resposta;
    },
    websocket: {
      maxPayloadLength: 16 * 1024,
      idleTimeout: 120,
      sendPings: true,
      backpressureLimit: 1024 * 1024,
      closeOnBackpressureLimit: true,
      open(ws) {
        if (ws.data.papel === "teste") {
          ws.data.fim = setTimeout(() => ws.close(1000, "fim do teste"), DURACAO_WS_TESTE_MS);
          return;
        }
        const sala = gerente.sala(ws.data.salaId);
        if (!sala) {
          ws.close(4004, "sala excluída");
          return;
        }
        let lista = conexoes.get(sala.id);
        if (!lista) conexoes.set(sala.id, (lista = new Set()));
        lista.add(ws);
        const d = ws.data;
        ws.subscribe(d.papel === "aluno" ? topico.equipe(sala.id, d.empresa!) : d.papel === "telao" ? topico.telao(sala.id) : topico.professor(sala.id));
        enviarSnapshot(ws, sala);
        // O painel do professor mostra quem está conectado.
        if (d.papel === "aluno") agendarEnvio(sala.id);
      },
      message(ws, bruto) {
        if (!consumirFicha(ws.data)) {
          if (++ws.data.excessos > EXCESSOS_ATE_FECHAR) ws.close(1008, "muitas mensagens");
          else enviar(ws, { tipo: "erro", motivo: "muitas mensagens; aguarde" });
          return;
        }
        if (ws.data.papel === "teste") {
          // Eco do teste de conexão: qualquer mensagem vira pong.
          enviar(ws, { tipo: "pong" });
          return;
        }
        const sala = gerente.sala(ws.data.salaId);
        if (!sala) {
          ws.close(4004, "sala excluída");
          return;
        }
        let entrada: unknown;
        try {
          entrada = JSON.parse(typeof bruto === "string" ? bruto : new TextDecoder().decode(bruto));
        } catch {
          enviar(ws, { tipo: "erro", motivo: "JSON inválido" });
          return;
        }
        const m = validar(MensagemCliente, entrada);
        if (!m.ok) {
          enviar(ws, { tipo: "erro", motivo: m.erro });
          return;
        }
        try {
          tratar(ws, sala, m.valor);
        } catch (e) {
          gerente.log("erro", `sala ${sala.codigo}: falha ao tratar "${m.valor.tipo}"`, e);
          enviar(ws, { tipo: "erro", motivo: "falha interna do servidor" });
        }
      },
      close(ws) {
        if (ws.data.fim) clearTimeout(ws.data.fim);
        if (ws.data.papel === "teste") return;
        const lista = conexoes.get(ws.data.salaId);
        lista?.delete(ws);
        if (ws.data.papel === "aluno" && gerente.sala(ws.data.salaId)) agendarEnvio(ws.data.salaId);
      },
    },
  });

  return {
    server,
    porta: server.port!,
    async parar() {
      gerente.ouvinte = null;
      gerente.aoExcluir = null;
      await server.stop(true);
    },
  };
}

/** Configuração validada a partir de um objeto parcial (atalho para testes e para a CLI). */
export function configDe(entrada: unknown) {
  return validar(ConfigSala, entrada);
}
