/**
 * Integração HTTP + WebSocket (entrega 3): servidor real em porta livre, banco temporário e relógio
 * da partida falso. Fluxo completo, matriz de permissões, vazamento de dados, limites e reinício.
 */
import { afterAll, afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { MensagemServidor, VisaoAluno, VisaoProfessor, VisaoTelao } from "@simulador/compartilhado";
import { type Ambiente, CHAVE, type ClienteWs, montar, type Navegador, respirar } from "./rede-ajuda";

const LEITE = "leite_engarrafado";
const CONFIG = { presetId: "teste/congelado", vagasPorMercado: 3, segundosPorTick: 1, robosNasVagasVazias: "premium" };

let id = 0;
const cmd = () => `cmd-rede-${String(++id).padStart(6, "0")}`;

type Atualizacao<V> = Extract<MensagemServidor, { tipo: "snapshot" | "atualizacao" }> & { visao: V };
const ehVisao = (m: MensagemServidor) => m.tipo === "snapshot" || m.tipo === "atualizacao";

/** Sala pronta para jogar: professor, Ana (cria Alfa), Bia (entra em Alfa), Caio (cria Beta). */
async function salaComEquipes(amb: Ambiente) {
  const prof = amb.navegador();
  const criada = await prof.post("/api/salas", { chave: CHAVE, config: CONFIG });
  expect(criada.status).toBe(201);
  const { codigo, pin, linkTelao } = criada.corpo as { codigo: string; pin: string; linkTelao: string };
  const tokenTelao = new URL(linkTelao, amb.base).searchParams.get("t")!;
  const entrar = async (nome: string, equipe: unknown) => {
    const nav = amb.navegador();
    const r = await nav.post("/api/alunos/entrar", { codigo, nome, equipe });
    expect(r.status).toBe(200);
    return { nav, membro: r.corpo.membro as string, empresa: r.corpo.empresa as string };
  };
  const ana = await entrar("Ana", { tipo: "nova", empresa: "emp_01", nome: "Alfa", cor: "azul" });
  const bia = await entrar("Bia", { tipo: "existente", empresa: "emp_01" });
  const caio = await entrar("Caio", { tipo: "nova", empresa: "emp_02", nome: "Beta", cor: "verde" });
  return { prof, codigo, pin, tokenTelao, linkTelao, ana, bia, caio };
}

let amb: Ambiente;
beforeEach(async () => {
  amb = await montar();
});
afterEach(async () => {
  await amb.fechar();
});

describe("fluxo da sala", () => {
  test("criar, entrar, decidir, iniciar, jogar um mês: a DRE chega ao aluno", async () => {
    const s = await salaComEquipes(amb);
    expect(s.codigo).toMatch(/^[A-Z2-9]{5}$/);
    expect(s.pin).toMatch(/^\d{6}$/);

    const publico = await amb.navegador().pedir(`/api/salas/${s.codigo.toLowerCase()}`);
    expect(publico.status).toBe(200);
    expect(publico.corpo.vagas.map((v: { equipe: { nome: string } | null }) => v.equipe?.nome ?? null)).toEqual(["Alfa", "Beta", null]);
    expect(JSON.stringify(publico.corpo)).not.toMatch(/Ana|Bia|Caio/);

    const wsAna = await s.ana.nav.ws({ codigo: s.codigo, papel: "aluno" });
    const wsProf = await s.prof.ws({ codigo: s.codigo, papel: "professor" });
    const snap = await wsAna.esperar<Atualizacao<VisaoAluno>>((m) => m.tipo === "snapshot");
    expect([snap.papel, snap.visao.empresa, snap.visao.equipe.nome, snap.visao.membros]).toEqual(["aluno", "emp_01", "Alfa", ["Ana", "Bia"]]);
    const snapProf = await wsProf.esperar<Atualizacao<VisaoProfessor>>((m) => m.tipo === "snapshot");
    expect(snapProf.visao.empresas.find((e) => e.empresa === "emp_01")!.membros).toEqual([
      { id: s.ana.membro, nome: "Ana", conectado: true },
      { id: s.bia.membro, nome: "Bia", conectado: false },
    ]);

    const c = cmd();
    wsAna.enviar({ tipo: "decidir", idComando: c, decisoes: [{ tipo: "produto", produto: LEITE, preco: 580, compraMensal: 20_000 }] });
    expect(await wsAna.resposta(c)).toEqual({ tipo: "resposta", idComando: c, ok: true });
    const comPendente = await wsAna.esperar<Atualizacao<VisaoAluno>>((m) => ehVisao(m) && (m as Atualizacao<VisaoAluno>).visao.pendentes.length === 1);
    expect(comPendente.visao.pendentes[0]).toEqual({ tipo: "produto", produto: LEITE, preco: 580, compraMensal: 20_000 });
    await wsProf.esperar<Atualizacao<VisaoProfessor>>((m) => ehVisao(m) && (m as Atualizacao<VisaoProfessor>).visao.empresas[0]!.pendentes === 1);

    const iniciar = cmd();
    wsProf.enviar({ tipo: "relogio", idComando: iniciar, tickEsperado: 0, acao: "iniciar" });
    expect((await wsProf.resposta(iniciar)).ok).toBe(true);
    await wsAna.esperar<Atualizacao<VisaoAluno>>((m) => ehVisao(m) && (m as Atualizacao<VisaoAluno>).visao.relogio.status === "rodando");

    amb.relogio.avancar(30_000);
    const fimDoMes = await wsAna.esperar<Atualizacao<VisaoAluno>>((m) => ehVisao(m) && (m as Atualizacao<VisaoAluno>).visao.relogio.tick === 30);
    expect(fimDoMes.visao.fechamentos).toHaveLength(1);
    expect(fimDoMes.visao.fechamentos[0]!.mes).toBe(1);
    expect(fimDoMes.visao.visao.empresa.ofertas.find((o) => o.produto === LEITE)!.decisao.preco).toBe(580);

    // Histórico por HTTP: o aluno vê só a própria empresa; o professor, todas.
    const hAluno = await s.ana.nav.pedir(`/api/salas/${s.codigo}/historico`);
    expect(hAluno.status).toBe(200);
    expect(new Set(hAluno.corpo.semanas.map((r: { empresa: string }) => r.empresa))).toEqual(new Set(["emp_01"]));
    const hAlunoForjado = await s.ana.nav.pedir(`/api/salas/${s.codigo}/historico?empresa=emp_02`);
    expect(new Set(hAlunoForjado.corpo.semanas.map((r: { empresa: string }) => r.empresa))).toEqual(new Set(["emp_01"]));
    // Participação pública do mercado: todas as empresas do mercado, e só a participação delas.
    for (const h of [hAluno, hAlunoForjado]) {
      expect(new Set(h.corpo.mercado.map((r: { empresa: string }) => r.empresa))).toEqual(new Set(["emp_01", "emp_02", "emp_03"]));
      expect(new Set(h.corpo.mercado.flatMap((r: object) => Object.keys(r)))).toEqual(new Set(["semana", "empresa", "produto", "participacao"]));
    }
    const doMercado = (h: typeof hAluno, e: string) => h.corpo.mercado.filter((r: { empresa: string }) => r.empresa === e).map((r: { participacao: number }) => r.participacao);
    const hProf = await s.prof.pedir(`/api/salas/${s.codigo}/historico`);
    expect(new Set(hProf.corpo.semanas.map((r: { empresa: string }) => r.empresa))).toEqual(new Set(["emp_01", "emp_02", "emp_03"]));
    // Os valores conferem com o registro completo (que só o professor vê).
    for (const e of ["emp_01", "emp_02", "emp_03"]) expect(doMercado(hAluno, e)).toEqual(hProf.corpo.semanas.filter((r: { empresa: string }) => r.empresa === e).map((r: { participacao: number }) => r.participacao));
    expect(hProf.corpo.mercado).toEqual([]);
    expect((await amb.navegador().pedir(`/api/salas/${s.codigo}/historico`)).status).toBe(401);
  });

  test("histórico com mercados paralelos: o aluno não recebe a participação do outro mercado", async () => {
    const prof = amb.navegador();
    const criada = await prof.post("/api/salas", { chave: CHAVE, config: { ...CONFIG, mercados: 2, vagasPorMercado: 2 } });
    expect(criada.status).toBe(201);
    const codigo = criada.corpo.codigo as string;
    const publico = await amb.navegador().pedir(`/api/salas/${codigo}`);
    const vagas = publico.corpo.vagas as { empresa: string; mercado: string }[];
    const mercadoUm = vagas[0]!.mercado;
    const nav = amb.navegador();
    expect((await nav.post("/api/alunos/entrar", { codigo, nome: "Ana", equipe: { tipo: "nova", empresa: vagas[0]!.empresa, nome: "Alfa", cor: "azul" } })).status).toBe(200);
    const ws = await prof.ws({ codigo, papel: "professor" });
    const c = cmd();
    ws.enviar({ tipo: "relogio", idComando: c, tickEsperado: 0, acao: "iniciar" });
    expect((await ws.resposta(c)).ok).toBe(true);
    amb.relogio.avancar(14_000);
    await ws.esperar((m) => ehVisao(m) && (m as Atualizacao<VisaoProfessor>).visao.relogio.tick === 14);
    const h = await nav.pedir(`/api/salas/${codigo}/historico`);
    expect(h.status).toBe(200);
    expect(h.corpo.mercado.length).toBeGreaterThan(0);
    expect(new Set(h.corpo.mercado.map((r: { empresa: string }) => r.empresa))).toEqual(new Set(vagas.filter((v) => v.mercado === mercadoUm).map((v) => v.empresa)));
  });

  test("comandos idempotentes e tickEsperado desatualizado devolve snapshot", async () => {
    const s = await salaComEquipes(amb);
    const ws = await s.ana.nav.ws({ codigo: s.codigo, papel: "aluno" });
    const c = cmd();
    const decisao = { tipo: "decidir", idComando: c, decisoes: [{ tipo: "produto", produto: LEITE, preco: 600 }] };
    ws.enviar(decisao);
    ws.enviar(decisao);
    await ws.resposta(c);
    await ws.resposta(c);
    expect(amb.gerente.salaPorCodigo(s.codigo)!.fila).toHaveLength(1);

    const prof = await s.prof.ws({ codigo: s.codigo, papel: "professor" });
    await prof.esperar((m) => m.tipo === "snapshot");
    const c2 = cmd();
    prof.enviar({ tipo: "relogio", idComando: c2, tickEsperado: 7, acao: "iniciar" });
    expect(await prof.resposta(c2)).toMatchObject({ ok: false, motivo: "desatualizado" });
    await prof.esperar((m) => m.tipo === "snapshot");
    expect(amb.gerente.salaPorCodigo(s.codigo)!.status).toBe("preparacao");
  });

  test("professor move um aluno: ele passa a ouvir a nova equipe", async () => {
    const s = await salaComEquipes(amb);
    const wsBia = await s.bia.nav.ws({ codigo: s.codigo, papel: "aluno" });
    await wsBia.esperar((m) => m.tipo === "snapshot");
    const prof = await s.prof.ws({ codigo: s.codigo, papel: "professor" });
    const c = cmd();
    prof.enviar({ tipo: "moverAluno", idComando: c, membro: s.bia.membro, empresa: "emp_02" });
    expect((await prof.resposta(c)).ok).toBe(true);
    const snap = await wsBia.esperar<Atualizacao<VisaoAluno>>((m) => m.tipo === "snapshot");
    expect([snap.visao.empresa, snap.visao.equipe.nome]).toEqual(["emp_02", "Beta"]);

    // Uma decisão da Beta chega à Bia; uma da Alfa, não.
    const wsAna = await s.ana.nav.ws({ codigo: s.codigo, papel: "aluno" });
    const wsCaio = await s.caio.nav.ws({ codigo: s.codigo, papel: "aluno" });
    const ca = cmd();
    wsAna.enviar({ tipo: "decidir", idComando: ca, decisoes: [{ tipo: "produto", produto: LEITE, preco: 555 }] });
    await wsAna.resposta(ca);
    const cc = cmd();
    wsCaio.enviar({ tipo: "decidir", idComando: cc, decisoes: [{ tipo: "produto", produto: LEITE, preco: 666 }] });
    await wsCaio.resposta(cc);
    const comPendente = await wsBia.esperar<Atualizacao<VisaoAluno>>((m) => ehVisao(m) && (m as Atualizacao<VisaoAluno>).visao.pendentes.length > 0);
    expect(comPendente.visao.pendentes).toEqual([{ tipo: "produto", produto: LEITE, preco: 666 }]);
    expect(wsBia.brutas.some((t) => t.includes('"preco":555') && t.includes('"pendentes":[{'))).toBe(false);
  });

  test("reinício do servidor: salas voltam pausadas e as sessões continuam valendo", async () => {
    const s = await salaComEquipes(amb);
    const prof = await s.prof.ws({ codigo: s.codigo, papel: "professor" });
    const c = cmd();
    prof.enviar({ tipo: "relogio", idComando: c, tickEsperado: 0, acao: "iniciar" });
    await prof.resposta(c);
    amb.relogio.avancar(5_000);
    await amb.reiniciar();
    for (const nav of [s.prof, s.ana.nav]) nav.base = nav.origem = amb.base;
    const wsAna = await s.ana.nav.ws({ codigo: s.codigo, papel: "aluno" });
    const snap = await wsAna.esperar<Atualizacao<VisaoAluno>>((m) => m.tipo === "snapshot");
    expect([snap.visao.relogio.status, snap.visao.relogio.motivoPausa, snap.visao.relogio.tick]).toEqual(["pausada", "manual", 5]);
    const wsProf = await s.prof.ws({ codigo: s.codigo, papel: "professor" });
    await wsProf.esperar((m) => m.tipo === "snapshot");
    // O mesmo idComando depois do reinício não repete o efeito.
    wsProf.enviar({ tipo: "relogio", idComando: c, tickEsperado: 5, acao: "iniciar" });
    expect((await wsProf.resposta(c)).ok).toBe(true);
    expect(amb.gerente.salaPorCodigo(s.codigo)!.status).toBe("pausada");
  });

  test("professor reabre a sala com código + PIN; sair apaga a sessão", async () => {
    const s = await salaComEquipes(amb);
    const outro = amb.navegador();
    expect((await outro.post("/api/professor/entrar", { codigo: s.codigo, pin: s.pin === "000000" ? "000001" : "000000" })).status).toBe(401);
    const r = await outro.post("/api/professor/entrar", { codigo: s.codigo, pin: s.pin });
    expect(r.status).toBe(200);
    expect((await outro.pedir(`/api/salas/${s.codigo}/sessao`)).corpo).toEqual({ professor: true, aluno: null });
    const ws = await outro.ws({ codigo: s.codigo, papel: "professor" });
    await ws.esperar((m) => m.tipo === "snapshot");
    await outro.post(`/api/salas/${s.codigo}/sair`);
    expect(await outro.conectar({ codigo: s.codigo, papel: "professor" })).toBe("recusado");
    expect((await s.ana.nav.pedir(`/api/salas/${s.codigo}/sessao`)).corpo.aluno).toEqual({ membro: s.ana.membro, nome: "Ana", empresa: "emp_01" });
  });
});

describe("atualizações às telas", () => {
  test("uma decisão aceita atualiza só a equipe de quem decidiu e o professor (não as outras equipes nem o telão)", async () => {
    const s = await salaComEquipes(amb);
    const wsAna = await s.ana.nav.ws({ codigo: s.codigo, papel: "aluno" });
    const wsBia = await s.bia.nav.ws({ codigo: s.codigo, papel: "aluno" });
    const wsCaio = await s.caio.nav.ws({ codigo: s.codigo, papel: "aluno" });
    const wsProf = await s.prof.ws({ codigo: s.codigo, papel: "professor" });
    const wsTelao = await amb.navegador().ws({ codigo: s.codigo, papel: "telao", t: s.tokenTelao });
    for (const w of [wsAna, wsBia, wsCaio, wsProf, wsTelao]) await w.esperar((m) => m.tipo === "snapshot");
    // Deixa assentar as atualizações de presença (cada conexão nova avisa o professor) antes de contar.
    await new Promise((ok) => setTimeout(ok, 300));
    for (const w of [wsAna, wsBia, wsCaio, wsProf, wsTelao]) w.descartar();
    const antes = [wsAna, wsBia, wsCaio, wsProf, wsTelao].map((w) => w.mensagens.length);

    const c = cmd();
    wsAna.enviar({ tipo: "decidir", idComando: c, decisoes: [{ tipo: "produto", produto: LEITE, preco: 580, compraMensal: 1000 }] });
    expect((await wsAna.resposta(c)).ok).toBe(true);
    // Os dois alunos da equipe e o professor recebem a pendência.
    for (const w of [wsAna, wsBia]) await w.esperar<Atualizacao<VisaoAluno>>((m) => ehVisao(m) && (m as Atualizacao<VisaoAluno>).visao.pendentes.length === 1);
    await wsProf.esperar<Atualizacao<VisaoProfessor>>((m) => ehVisao(m) && (m as Atualizacao<VisaoProfessor>).visao.empresas[0]!.pendentes === 1);
    await new Promise((ok) => setTimeout(ok, 150));
    // A outra equipe e o telão não receberam nada.
    expect(wsCaio.mensagens.length).toBe(antes[2]!);
    expect(wsTelao.mensagens.length).toBe(antes[4]!);

    // Um tick atualiza todos.
    const iniciar = cmd();
    wsProf.enviar({ tipo: "relogio", idComando: iniciar, tickEsperado: 0, acao: "iniciar" });
    expect((await wsProf.resposta(iniciar)).ok).toBe(true);
    amb.relogio.avancar(1_000);
    for (const w of [wsAna, wsBia, wsCaio, wsTelao, wsProf]) await w.esperar((m) => ehVisao(m) && (m as Atualizacao<VisaoAluno>).visao.relogio?.tick === 1);
  });

  test("decisões de equipes diferentes no mesmo instante: cada uma vê só a própria pendência", async () => {
    const s = await salaComEquipes(amb);
    const wsAna = await s.ana.nav.ws({ codigo: s.codigo, papel: "aluno" });
    const wsCaio = await s.caio.nav.ws({ codigo: s.codigo, papel: "aluno" });
    for (const w of [wsAna, wsCaio]) await w.esperar((m) => m.tipo === "snapshot");
    const [ca, cc] = [cmd(), cmd()];
    wsAna.enviar({ tipo: "decidir", idComando: ca, decisoes: [{ tipo: "produto", produto: LEITE, preco: 580 }] });
    wsCaio.enviar({ tipo: "decidir", idComando: cc, decisoes: [{ tipo: "produto", produto: LEITE, preco: 640 }] });
    expect((await wsAna.resposta(ca)).ok && (await wsCaio.resposta(cc)).ok).toBe(true);
    const daAna = await wsAna.esperar<Atualizacao<VisaoAluno>>((m) => ehVisao(m) && (m as Atualizacao<VisaoAluno>).visao.pendentes.length === 1);
    const doCaio = await wsCaio.esperar<Atualizacao<VisaoAluno>>((m) => ehVisao(m) && (m as Atualizacao<VisaoAluno>).visao.pendentes.length === 1);
    expect(daAna.visao.pendentes[0]).toMatchObject({ preco: 580 });
    expect(doCaio.visao.pendentes[0]).toMatchObject({ preco: 640 });
  });
});

describe("permissões (seção 9.6)", () => {
  test("matriz de conexão: quem pode abrir cada papel", async () => {
    const s = await salaComEquipes(amb);
    const outra = amb.navegador();
    const criada = await outra.post("/api/salas", { chave: CHAVE, config: CONFIG });
    const codigo2 = criada.corpo.codigo as string;
    const anonimo = amb.navegador();
    const casos: [string, Navegador, Record<string, string>, boolean][] = [
      ["anônimo como aluno", anonimo, { codigo: s.codigo, papel: "aluno" }, false],
      ["anônimo como professor", anonimo, { codigo: s.codigo, papel: "professor" }, false],
      ["anônimo como telão sem token", anonimo, { codigo: s.codigo, papel: "telao" }, false],
      ["anônimo como telão com token errado", anonimo, { codigo: s.codigo, papel: "telao", t: s.tokenTelao.slice(0, -1) + (s.tokenTelao.endsWith("A") ? "B" : "A") }, false],
      ["anônimo como telão com o token", anonimo, { codigo: s.codigo, papel: "telao", t: s.tokenTelao }, true],
      ["telão com o token de outra sala", anonimo, { codigo: codigo2, papel: "telao", t: s.tokenTelao }, false],
      ["aluno como aluno", s.ana.nav, { codigo: s.codigo, papel: "aluno" }, true],
      ["aluno como professor", s.ana.nav, { codigo: s.codigo, papel: "professor" }, false],
      ["aluno em outra sala", s.ana.nav, { codigo: codigo2, papel: "aluno" }, false],
      ["professor como professor", s.prof, { codigo: s.codigo, papel: "professor" }, true],
      ["professor de outra sala", outra, { codigo: s.codigo, papel: "professor" }, false],
      ["professor como aluno", s.prof, { codigo: s.codigo, papel: "aluno" }, false],
      ["sala inexistente", s.prof, { codigo: "ZZZZZ", papel: "professor" }, false],
      ["papel inválido", s.prof, { codigo: s.codigo, papel: "admin" }, false],
    ];
    const resultado: [string, boolean][] = [];
    for (const [nome, nav, params, _] of casos) {
      const c = await nav.conectar(params);
      resultado.push([nome, c !== "recusado"]);
      if (c !== "recusado") c.fechar();
    }
    expect(resultado).toEqual(casos.map(([nome, , , ok]) => [nome, ok]));
  });

  test("origem de outro endereço é recusada no WebSocket e nas ações HTTP", async () => {
    const s = await salaComEquipes(amb);
    expect(await s.ana.nav.conectar({ codigo: s.codigo, papel: "aluno" }, "http://127.0.0.1:9999")).toBe("recusado");
    expect(await s.ana.nav.conectar({ codigo: s.codigo, papel: "aluno" }, "http://atacante.exemplo")).toBe("recusado");
    const intruso = amb.navegador({ origem: "http://atacante.exemplo" });
    expect((await intruso.post("/api/salas", { chave: CHAVE, config: CONFIG })).status).toBe(403);
    // Sem JSON, nada feito (força preflight CORS, que o servidor nunca concede).
    const semJson = await amb.navegador().pedir("/api/salas", { metodo: "POST", corpo: { chave: CHAVE, config: CONFIG }, cabecalhos: { "content-type": "text/plain" } });
    expect(semJson.status).toBe(415);
  });

  test("mensagens por papel: cada um só faz o que lhe cabe", async () => {
    const s = await salaComEquipes(amb);
    const telao = await amb.navegador().ws({ codigo: s.codigo, papel: "telao", t: s.tokenTelao });
    const aluno = await s.ana.nav.ws({ codigo: s.codigo, papel: "aluno" });
    const prof = await s.prof.ws({ codigo: s.codigo, papel: "professor" });
    const tentar = async (ws: ClienteWs, m: Record<string, unknown>) => {
      const c = cmd();
      ws.enviar({ ...m, idComando: c });
      return (await ws.resposta(c)).motivo ?? "ok";
    };
    const decidir = { tipo: "decidir", decisoes: [{ tipo: "produto", produto: LEITE, preco: 600 }] };
    const relogio = { tipo: "relogio", tickEsperado: 0, acao: "iniciar" };
    const tabela = {
      "telão decide": await tentar(telao, decidir),
      "telão mexe no relógio": await tentar(telao, relogio),
      "aluno mexe no relógio": await tentar(aluno, relogio),
      "aluno encerra": await tentar(aluno, { tipo: "encerrar" }),
      "aluno renomeia equipe": await tentar(aluno, { tipo: "renomearEquipe", empresa: "emp_01", nome: "Hack" }),
      "aluno move aluno": await tentar(aluno, { tipo: "moverAluno", membro: s.caio.membro, empresa: "emp_01" }),
      "professor decide": await tentar(prof, decidir),
      "professor marca pronto": await tentar(prof, { tipo: "pronto", pronto: true }),
    };
    expect(Object.values(tabela).every((m) => m === "sem permissão")).toBe(true);
    const sala = amb.gerente.salaPorCodigo(s.codigo)!;
    expect([sala.status, sala.fila.length, sala.vaga("emp_01")!.equipe!.nome, sala.membro(s.caio.membro)!.empresa]).toEqual(["preparacao", 0, "Alfa", "emp_02"]);
  });

  test("aluno não consegue forjar a empresa da decisão", async () => {
    const s = await salaComEquipes(amb);
    const ws = await s.ana.nav.ws({ codigo: s.codigo, papel: "aluno" });
    ws.enviar({ tipo: "decidir", idComando: cmd(), decisoes: [{ tipo: "produto", empresa: "emp_02", produto: LEITE, preco: 1 }] });
    const e = await ws.esperar((m) => m.tipo === "erro");
    expect(e).toMatchObject({ tipo: "erro" });
    expect(amb.gerente.salaPorCodigo(s.codigo)!.fila).toEqual([]);
  });

  test("revogar o telão derruba a conexão e invalida o link antigo", async () => {
    const s = await salaComEquipes(amb);
    const telao = await amb.navegador().ws({ codigo: s.codigo, papel: "telao", t: s.tokenTelao });
    expect((await amb.navegador().post(`/api/salas/${s.codigo}/telao/revogar`)).status).toBe(401);
    expect((await s.ana.nav.post(`/api/salas/${s.codigo}/telao/revogar`)).status).toBe(401);
    const r = await s.prof.post(`/api/salas/${s.codigo}/telao/revogar`);
    expect(r.status).toBe(200);
    expect((await telao.fechado).codigo).toBe(4003);
    expect(await amb.navegador().conectar({ codigo: s.codigo, papel: "telao", t: s.tokenTelao })).toBe("recusado");
    expect((await amb.navegador().pedir(`/api/salas/${s.codigo}/telao?t=${s.tokenTelao}`)).status).toBe(401);
    const novo = new URL(r.corpo.linkTelao, amb.base).searchParams.get("t")!;
    expect((await amb.navegador().pedir(`/api/salas/${s.codigo}/telao?t=${novo}`)).status).toBe(200);
    const t2 = await amb.navegador().ws({ codigo: s.codigo, papel: "telao", t: novo });
    await t2.esperar((m) => m.tipo === "snapshot");
  });

  test("novo PIN: só o professor gera; o antigo deixa de valer", async () => {
    const s = await salaComEquipes(amb);
    expect((await s.ana.nav.post(`/api/salas/${s.codigo}/pin`)).status).toBe(401);
    const r = await s.prof.post(`/api/salas/${s.codigo}/pin`);
    expect(r.corpo.pin).toMatch(/^\d{6}$/);
    if (r.corpo.pin !== s.pin) expect((await amb.navegador().post("/api/professor/entrar", { codigo: s.codigo, pin: s.pin })).status).toBe(401);
    expect((await amb.navegador().post("/api/professor/entrar", { codigo: s.codigo, pin: r.corpo.pin })).status).toBe(200);
  });

  test("administração: lista, encerra e exclui (em localhost)", async () => {
    const s = await salaComEquipes(amb);
    const admin = amb.navegador();
    const lista = await admin.pedir("/api/admin/salas");
    expect(lista.corpo.salas.map((x: { codigo: string }) => x.codigo)).toEqual([s.codigo]);
    const ws = await s.ana.nav.ws({ codigo: s.codigo, papel: "aluno" });
    expect((await admin.post(`/api/admin/salas/${s.codigo}/encerrar`)).status).toBe(200);
    expect(amb.gerente.salaPorCodigo(s.codigo)!.status).toBe("encerrada");
    expect((await admin.pedir(`/api/admin/salas/${s.codigo}`, { metodo: "DELETE" })).status).toBe(200);
    expect((await ws.fechado).codigo).toBe(4004);
    expect(amb.gerente.salaPorCodigo(s.codigo)).toBeUndefined();
    expect((amb.db.query("SELECT COUNT(*) AS n FROM sessoes").get() as { n: number }).n).toBe(0);
    // Host de fora (DNS rebinding) não é local, mesmo vindo de 127.0.0.1.
    const rebind = await admin.pedir("/api/admin/salas", { cabecalhos: { host: "atacante.exemplo" } });
    expect(rebind.status).toBe(403);
  });

  test("chave: trocar pelo admin; a antiga para de valer", async () => {
    const admin = amb.navegador();
    expect((await admin.post("/api/admin/chave", { chave: "curta" })).status).toBe(400);
    expect((await admin.post("/api/admin/chave", { chave: "nova-chave-longa" })).status).toBe(200);
    expect((await admin.post("/api/salas", { chave: CHAVE, config: CONFIG })).status).toBe(401);
    expect((await admin.post("/api/salas", { chave: "nova-chave-longa", config: CONFIG })).status).toBe(201);
  });
});

describe("vazamento (lista permitida)", () => {
  test("aluno e telão nunca recebem dados privados de outros, nem segredos", async () => {
    const s = await salaComEquipes(amb);
    const telao = await amb.navegador().ws({ codigo: s.codigo, papel: "telao", t: s.tokenTelao });
    const ana = await s.ana.nav.ws({ codigo: s.codigo, papel: "aluno" });
    const caio = await s.caio.nav.ws({ codigo: s.codigo, papel: "aluno" });
    const prof = await s.prof.ws({ codigo: s.codigo, papel: "professor" });
    const cc = cmd();
    caio.enviar({ tipo: "decidir", idComando: cc, decisoes: [{ tipo: "produto", produto: LEITE, preco: 640, compraMensal: 12_345 }] });
    await caio.resposta(cc);
    const ci = cmd();
    prof.enviar({ tipo: "relogio", idComando: ci, tickEsperado: 0, acao: "iniciar" });
    await prof.resposta(ci);
    amb.relogio.avancar(35_000);
    await ana.esperar((m) => ehVisao(m) && (m as Atualizacao<VisaoAluno>).visao.relogio.tick === 35);
    await telao.esperar((m) => ehVisao(m) && (m as Atualizacao<VisaoTelao>).visao.relogio.tick === 35);
    await respirar();

    const permitidasConcorrente = new Set(["produto", "preco", "qualidade", "marca", "notaAnterior", "participacaoAnterior"]);
    expect(ana.mensagens.filter(ehVisao).length).toBeGreaterThan(3);
    for (const m of ana.mensagens.filter(ehVisao) as Atualizacao<VisaoAluno>[]) {
      expect(m.papel).toBe("aluno");
      expect(m.visao.empresa).toBe("emp_01");
      for (const c of m.visao.visao.concorrentes) {
        expect(Object.keys(c).sort()).toEqual(["id", "nome", "ofertas"]);
        for (const o of c.ofertas) expect(Object.keys(o).filter((k) => !permitidasConcorrente.has(k))).toEqual([]);
      }
      expect(m.visao.fechamentos.every((f) => f.mes >= 1)).toBe(true);
      expect(m.visao.avisos.every((a) => !("empresa" in a) || a.empresa === "emp_01")).toBe(true);
    }
    const textoAna = ana.brutas.join("\n");
    expect(textoAna).not.toContain("Caio");
    expect(textoAna).not.toContain(s.tokenTelao);
    expect(textoAna).not.toContain("12345");
    expect(textoAna).not.toMatch(/"pin"/);

    const textoTelao = telao.brutas.join("\n");
    // Texto: nomes de alunos, a compra privada do Caio e segredos nunca aparecem.
    for (const proibido of ["Ana", "Bia", "Caio", "12345", s.tokenTelao]) expect(textoTelao).not.toContain(proibido);
    // Campos: nenhum campo privado de empresa (o valor público "criterio": "lucro_acumulado" pode;
    // "membros" nas vagas é só a contagem, e os nomes já foram conferidos acima).
    const chavesTelao = new Set(telao.mensagens.flatMap((m) => chavesDe(m)));
    expect([...chavesTelao].filter((k) => /caixa|lucro|estoque|decisao|credito|fechamento|pin|custo|receita/i.test(k))).toEqual([]);
    // O professor vê tudo, mas nem ele recebe o PIN pelo WebSocket (só na criação ou ao gerar outro).
    const ultimaProf = prof.mensagens.filter(ehVisao).at(-1) as Atualizacao<VisaoProfessor>;
    expect(ultimaProf.visao.pin).toBeNull();
    expect(ultimaProf.visao.empresas.flatMap((e) => e.membros.map((x) => x.nome))).toEqual(["Ana", "Bia", "Caio"]);
  });
});

describe("limites", () => {
  test("PIN: 5 erros por IP bloqueiam, até com o PIN certo; libera depois do tempo", async () => {
    const s = await salaComEquipes(amb);
    const errado = s.pin === "000000" ? "000001" : "000000";
    const nav = amb.navegador();
    for (let i = 0; i < 6; i++) expect((await nav.post("/api/professor/entrar", { codigo: s.codigo, pin: errado })).status).toBe(401);
    const bloqueado = await nav.post("/api/professor/entrar", { codigo: s.codigo, pin: s.pin });
    expect(bloqueado.status).toBe(429);
    expect(Number(bloqueado.cabecalhos.get("retry-after"))).toBeGreaterThan(0);
    amb.tempo.agora += 61_000;
    expect((await nav.post("/api/professor/entrar", { codigo: s.codigo, pin: s.pin })).status).toBe(200);
  });

  test("chave errada repetida bloqueia a criação de salas", async () => {
    const nav = amb.navegador();
    for (let i = 0; i < 6; i++) expect((await nav.post("/api/salas", { chave: "chave-errada", config: CONFIG })).status).toBe(401);
    expect((await nav.post("/api/salas", { chave: CHAVE, config: CONFIG })).status).toBe(429);
  });

  test("códigos inexistentes em excesso bloqueiam o IP", async () => {
    const nav = amb.navegador();
    for (let i = 0; i < 21; i++) expect((await nav.pedir("/api/salas/ZZZZZ")).status).toBe(404);
    expect((await nav.pedir("/api/salas/ZZZZZ")).status).toBe(429);
  });

  test("rajada de mensagens no WebSocket: recusa o excesso e depois fecha", async () => {
    const s = await salaComEquipes(amb);
    const ws = await s.ana.nav.ws({ codigo: s.codigo, papel: "aluno" });
    for (let i = 0; i < 100; i++) ws.enviar({ tipo: "ping" });
    const fechado = await ws.fechado;
    expect(fechado.codigo).toBe(1008);
    const pongs = ws.mensagens.filter((m) => m.tipo === "pong").length;
    expect(pongs).toBeGreaterThanOrEqual(30);
    expect(pongs).toBeLessThan(40);
    expect(ws.mensagens.some((m) => m.tipo === "erro" && m.motivo.startsWith("muitas mensagens"))).toBe(true);
  });

  test("mensagem grande demais derruba a conexão; JSON inválido só gera erro", async () => {
    const s = await salaComEquipes(amb);
    const ws = await s.ana.nav.ws({ codigo: s.codigo, papel: "aluno" });
    ws.ws.send("{nao é json");
    expect(await ws.esperar((m) => m.tipo === "erro")).toEqual({ tipo: "erro", motivo: "JSON inválido" });
    ws.ws.send("x".repeat(20_000));
    expect((await ws.fechado).codigo).not.toBe(1000);
  });

  test("cabeçalhos de segurança em todas as respostas", async () => {
    const r = await amb.navegador().pedir("/api/servidor");
    expect(r.cabecalhos.get("referrer-policy")).toBe("no-referrer");
    expect(r.cabecalhos.get("x-content-type-options")).toBe("nosniff");
    expect(r.cabecalhos.get("x-frame-options")).toBe("DENY");
    expect(r.cabecalhos.get("cache-control")).toBe("no-store");
    expect(r.corpo).toMatchObject({ protocolo: 1, chaveDefinida: true });
    const cookie = (await amb.navegador().post("/api/salas", { chave: CHAVE, config: CONFIG })).cabecalhos.getSetCookie()[0]!;
    expect(cookie).toMatch(/^sm_p_[A-Z2-9]{5}=[A-Za-z0-9_-]{43}; Path=\/; HttpOnly; SameSite=Strict; Max-Age=\d+$/);
  });
});

describe("teste de conexão e diagnóstico", () => {
  const relatorio = (maquina: string) => ({ maquina, http: { ok: true, amostras: 5, mediaMs: 2.5, maxMs: 4 }, ws: { ok: true, ms: 3 } });

  test("ping HTTP e WebSocket de teste respondem sem sessão", async () => {
    const nav = amb.navegador();
    expect((await nav.pedir("/api/teste/ping")).corpo).toEqual({ ok: true });
    const ws = await nav.ws({ papel: "teste" });
    ws.enviar({ tipo: "ping" });
    expect(await ws.esperar((m) => m.tipo === "pong")).toEqual({ tipo: "pong" });
    ws.enviar({ qualquer: "coisa" });
    await ws.esperar((m) => m.tipo === "pong");
    // Não recebe nada de sala nenhuma.
    expect(ws.mensagens.every((m) => m.tipo === "pong")).toBe(true);
  });

  test("relatórios chegam ao diagnóstico do professor, mais recentes primeiro; só ele vê", async () => {
    const s = await salaComEquipes(amb);
    const aluno = amb.navegador();
    expect((await aluno.post("/api/teste", relatorio("LAB2-PC07"))).corpo).toEqual({ ok: true, ip: "127.0.0.1" });
    expect((await aluno.post("/api/teste", relatorio("LAB2-PC08"))).status).toBe(200);
    expect((await aluno.post("/api/teste", { ...relatorio("x"), extra: 1 })).status).toBe(400);
    expect((await aluno.post("/api/teste", relatorio("   "))).status).toBe(400);
    expect((await amb.navegador().pedir(`/api/salas/${s.codigo}/diagnostico`)).status).toBe(401);
    expect((await s.ana.nav.pedir(`/api/salas/${s.codigo}/diagnostico`)).status).toBe(401);
    const d = await s.prof.pedir(`/api/salas/${s.codigo}/diagnostico`);
    expect(d.status).toBe(200);
    expect(d.corpo.testes.map((t: { maquina: string }) => t.maquina)).toEqual(["LAB2-PC08", "LAB2-PC07"]);
    expect(d.corpo.testes[0]).toMatchObject({ ip: "127.0.0.1", http: { ok: true, amostras: 5 }, ws: { ok: true, ms: 3 } });
    expect(typeof d.corpo.testes[0].navegador).toBe("string");
    expect(d.corpo.porta).toBe(amb.servidor.porta);
  });

  test("relatórios em excesso do mesmo IP são recusados", async () => {
    const nav = amb.navegador();
    for (let i = 0; i < 20; i++) expect((await nav.post("/api/teste", relatorio(`PC${i}`))).status).toBe(200);
    expect((await nav.post("/api/teste", relatorio("PC20"))).status).toBe(429);
  });

  test("presets oferecidos: só os jogáveis", async () => {
    const r = await amb.navegador().pedir("/api/servidor");
    expect(r.corpo.presets).toEqual([
      { id: "introdutorio/padrao", nome: expect.any(String) },
      { id: "cadeia/minima", nome: expect.any(String) },
    ]);
  });
});

describe("executável de linha de comando", () => {
  const pasta = mkdtempSync(join(tmpdir(), "simulador-cli-"));
  afterAll(() => rmSync(pasta, { recursive: true, force: true }));

  test("--definir-chave e depois o servidor sobe numa porta livre e responde", async () => {
    const main = join(import.meta.dir, "..", "src", "main.ts");
    const definir = Bun.spawn(["bun", main, "--dados", pasta, "--definir-chave", "chave-da-cli"], { stdout: "pipe", stderr: "pipe" });
    expect(await definir.exited).toBe(0);
    const proc = Bun.spawn(["bun", main, "--dados", pasta, "--porta", "0", "--host", "127.0.0.1"], { stdout: "pipe", stderr: "pipe" });
    try {
      const leitor = proc.stdout.getReader();
      let saida = "";
      let porta: number | null = null;
      const limite = Date.now() + 15_000;
      while (porta === null && Date.now() < limite) {
        const { value, done } = await leitor.read();
        if (done) break;
        saida += new TextDecoder().decode(value);
        const m = /na porta (\d+)/.exec(saida);
        if (m) porta = Number(m[1]);
      }
      expect(porta).not.toBeNull();
      const r = await fetch(`http://127.0.0.1:${porta}/api/servidor`);
      expect(await r.json()).toMatchObject({ protocolo: 1, chaveDefinida: true });
      const criar = await fetch(`http://127.0.0.1:${porta}/api/salas`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chave: "chave-da-cli", config: CONFIG }),
      });
      expect(criar.status).toBe(201);
    } finally {
      proc.kill();
      await proc.exited;
    }
  }, 30_000);
});

/** Todos os nomes de campo presentes num valor JSON. */
function chavesDe(valor: unknown): string[] {
  if (Array.isArray(valor)) return valor.flatMap(chavesDe);
  if (valor && typeof valor === "object") return Object.entries(valor).flatMap(([k, v]) => [k, ...chavesDe(v)]);
  return [];
}
