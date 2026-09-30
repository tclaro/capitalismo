/**
 * Tela do aluno no DOM (happy-dom): entrada, painel, decisões com rascunho, relatórios, mercado,
 * pronto e avisos, com visões reais geradas pelo servidor.
 */
import { describe, expect, test } from "bun:test";
import type { VisaoAluno } from "@simulador/compartilhado";
import { prepararDom } from "./dom";
import { LEITE, salaDeExemplo } from "./fixtures";

const dom = prepararDom();

function infoPublica(s: ReturnType<typeof salaDeExemplo>) {
  const v = s.visaoAluno(s.membros.ana);
  return { sala: v.sala, relogio: v.relogio, vagas: s.visao().vagas, cores: [] };
}

/** Tela do aluno já na sala, com o snapshot entregue. */
async function jogo(v: VisaoAluno, historico: unknown[] = []) {
  dom.rotas.set("GET /api/salas/ABCDE/sessao", { corpo: { professor: false, aluno: { membro: "mem_1", nome: "Ana", empresa: v.empresa } } });
  dom.rotas.set("GET /api/salas/ABCDE/historico", { corpo: { ok: true, semanas: historico } });
  const r = await dom.montar("/s/ABCDE");
  expect(dom.ws().url).toBe("ws://servidor:47800/ws?codigo=ABCDE&papel=aluno");
  await dom.servidorEnvia({ tipo: "snapshot", papel: "aluno", visao: v });
  return r;
}

const aba = async (r: HTMLElement, nome: string) => dom.agir(() => ([...r.querySelectorAll("[role=tab]")].find((t) => t.textContent?.startsWith(nome)) as HTMLButtonElement).click());

async function responder(ok: boolean, motivo?: string) {
  const ultimo = dom.ws().comandos.at(-1)!;
  await dom.servidorEnvia({ tipo: "resposta", idComando: ultimo.idComando, ok, ...(motivo ? { motivo } : {}) });
  return ultimo;
}

describe("entrada do aluno", () => {
  test("criar equipe nova: nome, cor livre; envia e conecta", async () => {
    const s = salaDeExemplo();
    dom.rotas.set("GET /api/salas/ABCDE/sessao", { corpo: { professor: false, aluno: null } });
    dom.rotas.set("GET /api/salas/ABCDE", { corpo: infoPublica(s) });
    dom.rotas.set("POST /api/alunos/entrar", { corpo: { ok: true, codigo: "ABCDE", membro: "mem_9", nome: "Duda", empresa: "emp_03" } });
    const r = await dom.montar("/s/ABCDE");
    const form = r.querySelector("form[aria-label='Entrar na sala']")!;
    // Equipes existentes aparecem com nome, cor e número de alunos (sem nomes de alunos).
    expect(form.textContent).toContain("Alfa");
    expect(form.textContent).toContain("2 aluno(s)");
    await dom.digitar(form.querySelector("#nome-aluno"), "Duda");
    const nova = [...form.querySelectorAll("label")].find((l) => l.textContent?.includes("Criar uma equipe nova"))!.querySelector("input")!;
    await dom.agir(() => nova.click());
    // Azul (Alfa) e verde (Beta) já foram escolhidas neste mercado.
    const cores = [...form.querySelectorAll(".escolha-cor label")].map((l) => l.textContent);
    expect(cores).not.toContain("Azul");
    expect(cores).not.toContain("Verde");
    expect(dom.botao(form, "Entrar").disabled).toBe(true);
    await dom.digitar(form.querySelector("#nome-equipe"), "Gama");
    await dom.agir(() => ([...form.querySelectorAll(".escolha-cor label")].find((l) => l.textContent === "Laranja")!.querySelector("input") as HTMLInputElement).click());
    await dom.agir(() => dom.botao(form, "Entrar").click());
    expect(dom.pedidos.find((p) => p.caminho === "/api/alunos/entrar")!.corpo).toEqual({ codigo: "ABCDE", nome: "Duda", equipe: { tipo: "nova", empresa: "emp_03", nome: "Gama", cor: "laranja" } });
    expect(dom.ws().url).toContain("papel=aluno");
  });

  test("entrar em equipe existente; recusa do servidor aparece e as vagas recarregam", async () => {
    const s = salaDeExemplo();
    dom.rotas.set("GET /api/salas/ABCDE/sessao", { corpo: { professor: false, aluno: null } });
    dom.rotas.set("GET /api/salas/ABCDE", { corpo: infoPublica(s) });
    dom.rotas.set("POST /api/alunos/entrar", { status: 409, corpo: { ok: false, motivo: "já existe um aluno com esse nome em outra equipe" } });
    const r = await dom.montar("/s/ABCDE");
    await dom.digitar(r.querySelector("#nome-aluno"), "Caio");
    const alfa = [...r.querySelectorAll("label")].find((l) => l.textContent?.includes("Alfa"))!.querySelector("input")!;
    await dom.agir(() => alfa.click());
    await dom.agir(() => dom.botao(r, "Entrar").click());
    expect(dom.pedidos.find((p) => p.caminho === "/api/alunos/entrar")!.corpo).toEqual({ codigo: "ABCDE", nome: "Caio", equipe: { tipo: "existente", empresa: "emp_01" } });
    expect(r.querySelector("[role=alert]")!.textContent).toContain("outra equipe");
    expect(dom.pedidos.filter((p) => p.caminho === "/api/salas/ABCDE")).toHaveLength(2);
  });

  test("partida já iniciada: não oferece criar equipe", async () => {
    const s = salaDeExemplo();
    s.jogar(2);
    dom.rotas.set("GET /api/salas/ABCDE/sessao", { corpo: { professor: false, aluno: null } });
    dom.rotas.set("GET /api/salas/ABCDE", { corpo: infoPublica(s) });
    const r = await dom.montar("/s/ABCDE");
    expect(r.textContent).not.toContain("Criar uma equipe nova");
    expect(r.textContent).toContain("já começou");
  });
});

describe("jogo", () => {
  test("painel: indicadores, alertas e nota decomposta ao lado dos concorrentes", async () => {
    const s = salaDeExemplo();
    s.sala.decidir(s.id(), s.membros.ana, [{ tipo: "produto", produto: LEITE, preco: 560, compraMensal: 20_000 }]);
    s.sala.decidir(s.id(), s.membros.caio, [{ tipo: "produto", produto: LEITE, preco: 590, compraMensal: 20_000 }]);
    s.jogar(35);
    const v = s.visaoAluno(s.membros.ana);
    const r = await jogo(v);
    expect(r.querySelector(".cabecalho")!.textContent).toContain("Alfa");
    expect(r.querySelector(".barra-relogio")!.textContent).toContain("Ano 1, fev, dia 5");
    const indicadores = [...r.querySelectorAll(".indicador")].map((x) => x.textContent);
    expect(indicadores[0]).toContain("Caixa");
    expect(indicadores[1]).toContain("Lucro do mês 1");
    // Vendeu tudo o que comprou: alerta de estoque.
    expect(r.textContent).toContain("Sem estoque: Leite engarrafado");
    // Produto fora de venda não tem nota: sem barra nem "preço tira pontos".
    const carteira = [...r.querySelectorAll("section")].find((x) => x.getAttribute("aria-label") === "Carteira")!.querySelector("tbody tr")!;
    expect(carteira.textContent).toContain("fora de venda");
    expect(carteira.querySelector(".barra-nota")).toBeNull();
    // Nota: a equipe e os concorrentes que vendem o leite, com barras rotuladas.
    const tabela = [...r.querySelectorAll("section")].find((x) => x.getAttribute("aria-label") === "Leite engarrafado")!.querySelector("table")!;
    const linhas = [...tabela.querySelectorAll("tbody tr")].map((tr) => tr.querySelector("td")!.textContent);
    expect(linhas[0]).toBe("Alfa (você)");
    expect(linhas).toContain("Beta");
    expect(tabela.querySelector(".barra-nota")!.getAttribute("aria-label")).toMatch(/qualidade .*, marca .*, preço .* pontos/);
    // Nada privado dos concorrentes na tela: o caixa do Beta não aparece.
    const caixaBeta = s.sala.estado.empresas.find((e) => e.id === "emp_02")!.caixa;
    expect(r.textContent).not.toContain(String(caixaBeta));
  });

  test("decisões: rascunho guardado, envio só do que mudou, pendente destacado", async () => {
    const s = salaDeExemplo();
    const v = s.visaoAluno(s.membros.ana);
    let r = await jogo(v);
    await aba(r, "Decisões");
    const preco = r.querySelector(`#${LEITE}-preco`);
    // Fora de venda de início: marcar "Vender" mostra o campo de preço.
    expect(preco).toBeNull();
    await dom.agir(() => ([...r.querySelectorAll("label")].find((l) => l.textContent?.startsWith("Vender este produto") && l.closest("section")?.getAttribute("aria-label") === "Leite engarrafado")!.querySelector("input") as HTMLInputElement).click());
    await dom.digitar(r.querySelector(`#${LEITE}-preco`), "5,70");
    await dom.digitar(r.querySelector(`#${LEITE}-compraMensal`), "18.000");
    expect(r.textContent).toContain("1 produto(s) com mudanças no rascunho");
    // Recarregar a página: o rascunho continua lá.
    await dom.agir(() => {});
    const guardado = JSON.parse(localStorage.getItem(`simulador:rascunho:ABCDE:${v.empresa}`)!);
    expect(guardado[LEITE]).toEqual({ vender: true, preco: "5,70", compraMensal: "18.000" });
    r = await jogo(v);
    await aba(r, "Decisões");
    expect((r.querySelector(`#${LEITE}-preco`) as HTMLInputElement).value).toBe("5,70");
    // Enviar: uma decisão só com os campos que mudaram.
    await dom.agir(() => dom.botao(r, /Enviar decisões/).click());
    const cmd = await responder(true);
    expect(cmd).toMatchObject({ tipo: "decidir", decisoes: [{ tipo: "produto", produto: LEITE, preco: 570, compraMensal: 18000 }] });
    expect(r.textContent).toContain("valem a partir do próximo dia");
    expect(localStorage.getItem(`simulador:rascunho:ABCDE:${v.empresa}`)).toBeNull();
    // O servidor manda a visão com a pendência: o campo aparece destacado e na lista.
    s.sala.decidir(s.id(), s.membros.ana, [{ tipo: "produto", produto: LEITE, preco: 570, compraMensal: 18000 }]);
    await dom.servidorEnvia({ tipo: "atualizacao", papel: "aluno", visao: s.visaoAluno(s.membros.ana) });
    expect(r.querySelector(`#${LEITE}-preco`)!.closest(".campo")!.classList.contains("pendente")).toBe(true);
    expect(r.textContent).toContain("Leite engarrafado: preço R$ 5,70, comprar 18.000 por mês");
    expect(r.querySelector("[role=tab][aria-selected=true]")!.textContent).toContain("1");
  });

  test("decisões: erro de campo impede envio; bloqueio na pausa mantém o rascunho", async () => {
    const s = salaDeExemplo();
    s.jogar(2);
    s.sala.comandoRelogio(s.id(), 2, "pausar");
    const v = s.visaoAluno(s.membros.ana);
    expect(v.relogio.podeEditar).toBe(false);
    const r = await jogo(v);
    await aba(r, "Decisões");
    expect(r.textContent).toContain("Decisões bloqueadas neste momento");
    await dom.digitar(r.querySelector(`#${LEITE}-publicidadeMensal`), "dez reais");
    expect(r.querySelector(`#${LEITE}-publicidadeMensal`)!.getAttribute("aria-invalid")).toBe("true");
    expect(dom.botao(r, /Enviar decisões/).disabled).toBe(true);
    await dom.digitar(r.querySelector(`#${LEITE}-publicidadeMensal`), "10,00");
    expect(dom.botao(r, /Enviar decisões/).disabled).toBe(true);
    expect(localStorage.getItem(`simulador:rascunho:ABCDE:${v.empresa}`)).toContain("10,00");
  });

  test("abrir ponto de venda e construir fábrica pedem confirmação", async () => {
    const s = salaDeExemplo();
    const r = await jogo(s.visaoAluno(s.membros.ana));
    await aba(r, "Decisões");
    await dom.digitar(r.querySelector("#abrir-pdv"), "2");
    await dom.agir(() => dom.botao(r, "Abrir pontos de venda").click());
    expect(dom.ws().comandos).toEqual([]);
    expect(r.textContent).toMatch(/Abrir 2 por R\$ /);
    await dom.agir(() => dom.botao(r, "Confirmar").click());
    expect(await responder(true)).toMatchObject({ tipo: "decidir", decisoes: [{ tipo: "abrirPontoDeVenda", quantidade: 2 }] });
    await dom.agir(() => dom.botao(r, "Construir fábrica").click());
    await dom.agir(() => dom.botao(r, "Confirmar").click());
    const cmd = await responder(false, "decisões bloqueadas neste momento");
    expect(cmd).toMatchObject({ decisoes: [{ tipo: "construirFabrica" }] });
    expect(r.textContent).toContain("decisões bloqueadas neste momento");
  });

  test("relatórios: DRE em colunas, balanço e gráficos", async () => {
    const s = salaDeExemplo();
    s.sala.decidir(s.id(), s.membros.ana, [{ tipo: "produto", produto: LEITE, preco: 580, compraMensal: 20_000 }, { tipo: "abrirPontoDeVenda", quantidade: 1 }]);
    s.jogar(60);
    const v = s.visaoAluno(s.membros.ana);
    const r = await jogo(v, [
      { semana: 1, produto: LEITE, participacao: 0.3 },
      { semana: 2, produto: LEITE, participacao: 0.35 },
    ]);
    await aba(r, "Relatórios");
    const dre = r.querySelector("section[aria-label='Demonstração do resultado (DRE)'] table")!;
    expect([...dre.querySelectorAll("thead th")].map((x) => x.textContent)).toEqual(["Conta", "Mês 1", "Mês 2"]);
    expect(dre.textContent).toContain("Lucro líquido");
    expect(r.textContent).toContain("Balanço no fim do mês 2");
    expect(r.querySelectorAll("figure.grafico svg polyline").length).toBeGreaterThanOrEqual(3);
    expect(dom.pedidos.some((p) => p.caminho === "/api/salas/ABCDE/historico")).toBe(true);
  });

  test("mercado: ranking conforme a visibilidade; oculto avisa", async () => {
    const s = salaDeExemplo();
    s.jogar(3);
    let r = await jogo(s.visaoAluno(s.membros.ana));
    await aba(r, "Mercado");
    expect(r.querySelectorAll("section[aria-label=Ranking] tbody tr")).toHaveLength(3);
    s.sala.configurar(s.id(), { rankingVisivel: "oculto" });
    await dom.servidorEnvia({ tipo: "atualizacao", papel: "aluno", visao: s.visaoAluno(s.membros.ana) });
    r = r as HTMLElement;
    expect(r.textContent).toContain("ranking oculto");
  });

  test("pronto: alterna e mostra o estado", async () => {
    const s = salaDeExemplo();
    s.jogar(2);
    const r = await jogo(s.visaoAluno(s.membros.ana));
    await dom.agir(() => dom.botao(r, "Marcar equipe como pronta").click());
    expect(await responder(true)).toMatchObject({ tipo: "pronto", pronto: true });
    s.sala.marcarPronto(s.id(), s.membros.ana, true);
    await dom.servidorEnvia({ tipo: "atualizacao", papel: "aluno", visao: s.visaoAluno(s.membros.ana) });
    expect(dom.botao(r, /Equipe pronta/).getAttribute("aria-pressed")).toBe("true");
  });

  test("avisos: acumulam entre os dias e o selo conta os novos", async () => {
    const s = salaDeExemplo();
    const v = s.visaoAluno(s.membros.ana);
    const comAvisos = (tick: number, avisos: VisaoAluno["avisos"]) => ({ ...v, relogio: { ...v.relogio, tick }, avisos });
    const r = await jogo(comAvisos(1, [{ tipo: "ruptura_de_estoque", empresa: v.empresa, produto: LEITE }]));
    await dom.servidorEnvia({ tipo: "atualizacao", papel: "aluno", visao: comAvisos(2, []) });
    await dom.servidorEnvia({ tipo: "atualizacao", papel: "aluno", visao: comAvisos(3, [{ tipo: "fim_de_mes", mes: 1 }]) });
    const abaAvisos = [...r.querySelectorAll("[role=tab]")].find((t) => t.textContent?.startsWith("Avisos"))!;
    expect(abaAvisos.textContent).toBe("Avisos2");
    await aba(r, "Avisos");
    const itens = [...r.querySelectorAll("section[aria-label=Avisos] li")].map((li) => li.textContent);
    expect(itens).toHaveLength(2);
    expect(itens[0]).toContain("Fim do mês 1");
    expect(itens[1]).toContain("Acabou o estoque de Leite engarrafado");
    expect(abaAvisos.textContent).toBe("Avisos");
  });

  test("abas pelo teclado (setas)", async () => {
    const s = salaDeExemplo();
    const r = await jogo(s.visaoAluno(s.membros.ana));
    const primeira = r.querySelector("[role=tab][aria-selected=true]") as HTMLButtonElement;
    expect(primeira.textContent).toBe("Painel");
    await dom.agir(() => primeira.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })));
    expect(r.querySelector("[role=tab][aria-selected=true]")!.textContent).toContain("Decisões");
    await dom.agir(() => r.querySelector("[role=tab][aria-selected=true]")!.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true })));
    expect(r.querySelector("[role=tab][aria-selected=true]")!.textContent).toContain("Avisos");
  });

  test("sair apaga a sessão e volta para a entrada", async () => {
    const s = salaDeExemplo();
    dom.rotas.set("POST /api/salas/ABCDE/sair", { corpo: { ok: true } });
    dom.rotas.set("GET /api/salas/ABCDE", { corpo: infoPublica(s) });
    const r = await jogo(s.visaoAluno(s.membros.ana));
    await dom.agir(() => dom.botao(r, /Sair/).click());
    expect(dom.pedidos.some((p) => p.metodo === "POST" && p.caminho === "/api/salas/ABCDE/sair")).toBe(true);
    expect(r.querySelector("form[aria-label='Entrar na sala']")).not.toBeNull();
  });
});
