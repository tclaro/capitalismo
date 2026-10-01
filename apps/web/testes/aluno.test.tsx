/**
 * Tela do aluno no DOM (happy-dom): entrada e a tela de jogo (painel único, envio automático campo
 * a campo, confirmações, avisos flutuantes, fechamento do mês, atalhos e participação), com visões
 * reais geradas pelo servidor.
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
async function jogo(v: VisaoAluno, historico: { semanas: unknown[]; mercado: unknown[] } = { semanas: [], mercado: [] }) {
  dom.rotas.set("GET /api/salas/ABCDE/sessao", { corpo: { professor: false, aluno: { membro: "mem_1", nome: "Ana", empresa: v.empresa } } });
  dom.rotas.set("GET /api/salas/ABCDE/historico", { corpo: { ok: true, ...historico } });
  const r = await dom.montar("/s/ABCDE");
  expect(dom.ws().url).toBe("ws://servidor:47800/ws?codigo=ABCDE&papel=aluno");
  await dom.servidorEnvia({ tipo: "snapshot", papel: "aluno", visao: v });
  return r;
}

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

const esperar = (ms: number) => dom.agir(() => new Promise((ok) => setTimeout(ok, ms)));
const tecla = (key: string, alvo: EventTarget = document.body) => dom.agir(() => alvo.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true })));
const texto = (r: ParentNode, s: string) => (r.querySelector(s)?.textContent ?? "").replace(/ /g, " ");
const notificacoes = (r: ParentNode) => [...r.querySelectorAll(".j-notificacao")].map((n) => n.textContent!.replace(/ /g, " "));
const atualizar = (s: ReturnType<typeof salaDeExemplo>) => dom.servidorEnvia({ tipo: "atualizacao", papel: "aluno", visao: s.visaoAluno(s.membros.ana) });

describe("tela de jogo", () => {
  test("painel único: HUD, cartões dos produtos, console do produto, ranking; nada privado dos concorrentes", async () => {
    const s = salaDeExemplo();
    s.sala.decidir(s.id(), s.membros.ana, [{ tipo: "produto", produto: LEITE, preco: 560, compraMensal: 20_000 }]);
    s.sala.decidir(s.id(), s.membros.caio, [{ tipo: "produto", produto: LEITE, preco: 590, compraMensal: 20_000 }]);
    s.jogar(35);
    const v = s.visaoAluno(s.membros.ana);
    const r = await jogo(v);
    expect(texto(r, ".j-equipe strong")).toBe("Alfa");
    expect(texto(r, ".j-data b")).toBe("5 de fevereiro");
    expect(texto(r, ".j-data span")).toBe("Mês 2 de 24 · ano 1");
    expect(texto(r, ".j-status")).toBe("Rodando");
    expect(texto(r, ".j-ind b")).toMatch(/^R\$ [\d.,]+ (mil|mi)$/);
    // Lucro do mês até agora vem do motor (antes do IR).
    expect(texto(r, ".j-ind:nth-child(2) b")).not.toBe("");
    expect(r.querySelectorAll(".j-cartao")).toHaveLength(v.visao.produtos.length);
    expect(r.querySelector(".j-cartao[aria-current=true]")!.textContent).toContain("Leite engarrafado");
    expect(texto(r, ".j-palco h1")).toBe("Leite engarrafado");
    // Nota: a equipe primeiro, depois os concorrentes que vendem; barras rotuladas.
    const linhas = [...r.querySelectorAll(".j-nota tbody tr")].map((tr) => tr.querySelector("td")!.textContent);
    expect(linhas[0]).toBe("Vocês");
    expect(linhas).toContain("Beta");
    expect(r.querySelector(".j-barra-nota")!.getAttribute("aria-label")).toMatch(/qualidade .*, marca .*, preço .* pontos/);
    expect([...r.querySelectorAll(".j-ranking li")]).toHaveLength(3);
    // Nada privado dos concorrentes: o caixa do Beta não aparece.
    const caixaBeta = s.sala.estado.empresas.find((e) => e.id === "emp_02")!.caixa;
    expect(r.textContent).not.toContain(String(caixaBeta));
    expect(document.documentElement.classList.contains("j-modo-jogo")).toBe(true);
  });

  test("envio automático: digitou e parou, enviou só aquele campo; estado no campo; desfazer volta o valor", async () => {
    const s = salaDeExemplo();
    s.jogar(2);
    const r = await jogo(s.visaoAluno(s.membros.ana));
    const preco = r.querySelector("#campo-preco") as HTMLInputElement;
    await dom.digitar(preco, "5,70");
    expect(texto(r, "#campo-preco-estado")).toBe("…");
    expect(dom.ws().comandos).toEqual([]);
    await esperar(800); // sem Enter: a pausa na digitação envia
    expect(dom.ws().comandos.at(-1)).toMatchObject({ tipo: "decidir", decisoes: [{ tipo: "produto", produto: LEITE, preco: 570 }] });
    expect(texto(r, "#campo-preco-estado")).toBe("enviando…");
    await responder(true);
    expect(notificacoes(r)[0]).toBe("Leite engarrafado · preço de venda: fora de venda → R$ 5,70Desfazer");
    // O servidor manda a visão com a pendência: "vale a partir de amanhã", com o valor de antes.
    s.sala.decidir(s.id(), s.membros.ana, [{ tipo: "produto", produto: LEITE, preco: 570 }]);
    await atualizar(s);
    expect(preco.value).toBe("5,70");
    expect(texto(r, "#campo-preco-estado")).toBe("✓ enviado · vale a partir de amanhãantes: fora de venda");
    expect(r.querySelector("#campo-preco")!.closest(".j-campo")!.classList.contains("pendente")).toBe(true);
    // Desfazer: envia o valor anterior.
    await dom.agir(() => dom.botao(r, "Desfazer").click());
    expect(dom.ws().comandos.at(-1)).toMatchObject({ tipo: "decidir", decisoes: [{ tipo: "produto", produto: LEITE, preco: null }] });
  });

  test("Enter envia na hora; Esc desfaz o digitado; erro de campo não envia; recusa do servidor aparece no campo", async () => {
    const s = salaDeExemplo();
    s.jogar(2);
    const r = await jogo(s.visaoAluno(s.membros.ana));
    const compra = r.querySelector("#campo-compraMensal") as HTMLInputElement;
    await dom.digitar(compra, "12.000");
    await tecla("Enter", compra);
    expect(dom.ws().comandos.at(-1)).toMatchObject({ decisoes: [{ tipo: "produto", produto: LEITE, compraMensal: 12000 }] });
    await responder(false, "decisões bloqueadas neste momento");
    expect(texto(r, "#campo-compraMensal-estado")).toBe("decisões bloqueadas neste momento");
    expect(compra.getAttribute("aria-invalid")).toBe("true");
    const enviados = dom.ws().comandos.length;
    const teto = s.visaoAluno(s.membros.ana).visao.produtos.find((p) => p.id === LEITE)!.precoMaximo;
    const preco = r.querySelector("#campo-preco") as HTMLInputElement;
    await dom.digitar(preco, String((teto + 100) / 100).replace(".", ","));
    await tecla("Enter", preco);
    expect(texto(r, "#campo-preco-estado")).toBe("acima do preço máximo");
    expect(dom.ws().comandos.length).toBe(enviados);
    await tecla("Escape", preco);
    expect(preco.value).toBe("");
    expect(texto(r, "#campo-preco-estado")).toBe("fora de venda");
    await esperar(800);
    expect(dom.ws().comandos.length).toBe(enviados);
  });

  test("− e + mudam pelo passo e enviam sozinhos; interruptor de venda", async () => {
    const s = salaDeExemplo();
    s.jogar(2);
    const r = await jogo(s.visaoAluno(s.membros.ana));
    const campoPub = r.querySelector("#campo-publicidadeMensal")!.closest(".j-campo")!;
    await dom.agir(() => (campoPub.querySelector("button[aria-label^=Aumentar]") as HTMLButtonElement).click());
    await dom.agir(() => (campoPub.querySelector("button[aria-label^=Aumentar]") as HTMLButtonElement).click());
    expect((r.querySelector("#campo-publicidadeMensal") as HTMLInputElement).value).toBe("1.000,00");
    await esperar(700);
    expect(dom.ws().comandos.at(-1)).toMatchObject({ decisoes: [{ tipo: "produto", produto: LEITE, publicidadeMensal: 100_000 }] });
    await responder(true);
    // Ligar a venda sem preço conhecido: pede o preço e não envia nada.
    const n = dom.ws().comandos.length;
    await dom.agir(() => (r.querySelector(".j-interruptor input") as HTMLInputElement).click());
    expect(texto(r, "#campo-preco-estado")).toBe("Digite o preço para começar a vender.");
    expect(dom.ws().comandos.length).toBe(n);
    // Vendendo: desligar envia preço nulo.
    s.sala.decidir(s.id(), s.membros.ana, [{ tipo: "produto", produto: LEITE, preco: 600 }]);
    s.jogar(1);
    await atualizar(s);
    await dom.agir(() => (r.querySelector(".j-interruptor input") as HTMLInputElement).click());
    expect(dom.ws().comandos.at(-1)).toMatchObject({ decisoes: [{ tipo: "produto", produto: LEITE, preco: null }] });
  });

  test("pausa do professor: faixa, campos e botões travados", async () => {
    const s = salaDeExemplo();
    s.jogar(2);
    s.sala.comandoRelogio(s.id(), 2, "pausar");
    const r = await jogo(s.visaoAluno(s.membros.ana));
    expect(texto(r, ".j-faixa")).toContain("decisões estão travadas");
    expect(texto(r, ".j-status")).toBe("Pausado pelo professor");
    for (const id of ["#campo-preco", "#campo-compraMensal", "#campo-publicidadeMensal"]) expect((r.querySelector(id) as HTMLInputElement).disabled).toBe(true);
    expect(texto(r, "#campo-compraMensal-estado")).toBe("travado na pausa");
    expect(dom.botao(r, "+ Abrir").disabled).toBe(true);
  });

  test("confirmação em dois cliques sobrevive à virada do dia (abrir ponto de venda, fábrica)", async () => {
    const s = salaDeExemplo();
    s.jogar(2);
    const r = await jogo(s.visaoAluno(s.membros.ana));
    await dom.agir(() => dom.botao(r, "+ Abrir").click());
    expect(dom.ws().comandos).toEqual([]);
    expect(dom.botao(r, /^Abrir por R\$ /)).toBeTruthy();
    // Viram dois dias com a pergunta aberta: ela continua lá.
    s.jogar(1);
    await atualizar(s);
    s.jogar(1);
    await atualizar(s);
    await dom.agir(() => dom.botao(r, /^Abrir por R\$ /).click());
    expect(await responder(true)).toMatchObject({ tipo: "decidir", decisoes: [{ tipo: "abrirPontoDeVenda", quantidade: 1 }] });
    expect(notificacoes(r).some((t) => t.startsWith("Ponto de venda em obra"))).toBe(true);
    // Esc cancela; clique fora cancela.
    await dom.agir(() => dom.botao(r, "Construir fábrica").click());
    expect(dom.botao(r, /^Construir por /)).toBeTruthy();
    await tecla("Escape");
    expect(dom.botao(r, "Construir fábrica")).toBeTruthy();
    await dom.agir(() => dom.botao(r, "Construir fábrica").click());
    await dom.agir(() => r.querySelector(".j-hud")!.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })));
    expect(dom.botao(r, "Construir fábrica")).toBeTruthy();
    await dom.agir(() => dom.botao(r, "Construir fábrica").click());
    await dom.agir(() => dom.botao(r, /^Construir por /).click());
    expect(await responder(true)).toMatchObject({ decisoes: [{ tipo: "construirFabrica", produto: LEITE }] });
  });

  test("avisos flutuantes: esgotou uma vez (repete só depois de recuperar); 1º lugar", async () => {
    const s = salaDeExemplo();
    s.sala.decidir(s.id(), s.membros.ana, [{ tipo: "produto", produto: LEITE, preco: 560, compraMensal: 30 }]);
    s.jogar(1);
    const r = await jogo(s.visaoAluno(s.membros.ana));
    const v0 = s.visaoAluno(s.membros.ana);
    const comEstoque = (q: number, tick: number) => {
      const v = JSON.parse(JSON.stringify(v0)) as VisaoAluno;
      v.relogio.tick = tick;
      v.visao.empresa.ofertas.find((o) => o.produto === LEITE)!.estoque.quantidade = q;
      return v;
    };
    const esgotou = () => notificacoes(r).filter((t) => t.startsWith("Leite engarrafado esgotou")).length;
    await dom.servidorEnvia({ tipo: "atualizacao", papel: "aluno", visao: comEstoque(10, 2) });
    expect(esgotou()).toBe(0);
    await dom.servidorEnvia({ tipo: "atualizacao", papel: "aluno", visao: comEstoque(0, 3) });
    expect(esgotou()).toBe(1);
    await dom.servidorEnvia({ tipo: "atualizacao", papel: "aluno", visao: comEstoque(0, 4) });
    await dom.servidorEnvia({ tipo: "atualizacao", papel: "aluno", visao: comEstoque(0, 5) });
    expect(esgotou()).toBe(1);
    await dom.servidorEnvia({ tipo: "atualizacao", papel: "aluno", visao: comEstoque(50, 6) });
    await dom.servidorEnvia({ tipo: "atualizacao", papel: "aluno", visao: comEstoque(0, 7) });
    expect(esgotou()).toBe(2);
    // "Ver" leva ao produto.
    await dom.agir(() => (r.querySelector(".j-cartao:nth-child(2)") as HTMLButtonElement).click());
    await dom.agir(() => dom.botao(r, "Ver").click());
    expect(texto(r, ".j-palco h1")).toBe("Leite engarrafado");
    // Ranking: aviso só quando envolve o 1º.
    const comPosicao = (ordem: string[], tick: number) => {
      const v = comEstoque(50, tick);
      v.ranking = ordem.map((e, i) => ({ posicao: i + 1, empresa: e, nome: e, pontuacao: 100 - i }));
      return v;
    };
    await dom.servidorEnvia({ tipo: "atualizacao", papel: "aluno", visao: comPosicao(["emp_02", "emp_03", "emp_01"], 8) });
    await dom.servidorEnvia({ tipo: "atualizacao", papel: "aluno", visao: comPosicao(["emp_02", "emp_01", "emp_03"], 9) });
    expect(notificacoes(r).filter((t) => t.includes("lugar"))).toEqual([]);
    await dom.servidorEnvia({ tipo: "atualizacao", papel: "aluno", visao: comPosicao(["emp_01", "emp_02", "emp_03"], 10) });
    expect(notificacoes(r).some((t) => t === "Vocês assumiram o 1º lugar do ranking!")).toBe(true);
    await dom.servidorEnvia({ tipo: "atualizacao", papel: "aluno", visao: comPosicao(["emp_02", "emp_03", "emp_01"], 11) });
    expect(notificacoes(r).some((t) => t === "Vocês perderam o 1º lugar: agora estão em 3º.")).toBe(true);
    expect(r.querySelectorAll(".j-notificacao").length).toBeLessThanOrEqual(3);
  });

  test("modo rodada: fechamento do mês abre uma vez, libera as decisões; P marca pronto", async () => {
    const s = salaDeExemplo({ modo: "rodada" });
    s.sala.decidir(s.id(), s.membros.ana, [{ tipo: "produto", produto: LEITE, preco: 560, compraMensal: 20_000 }]);
    s.jogar(29);
    const r = await jogo(s.visaoAluno(s.membros.ana));
    expect(r.querySelector(".j-veu")).toBeNull();
    s.jogar(1);
    const v = s.visaoAluno(s.membros.ana);
    expect([v.relogio.status, v.relogio.motivoPausa]).toEqual(["pausada", "fim_do_mes"]);
    await atualizar(s);
    expect(texto(r, "#j-titulo")).toBe("Fechamento de janeiro");
    expect(texto(r, ".j-fech-cartao b")).toMatch(/R\$/);
    expect(texto(r, ".j-status")).toBe("Fim do mês: hora de decidir");
    expect((r.querySelector("#campo-preco") as HTMLInputElement).disabled).toBe(false);
    await tecla("Escape");
    expect(r.querySelector(".j-veu")).toBeNull();
    await atualizar(s);
    expect(r.querySelector(".j-veu")).toBeNull(); // não reabre
    await tecla("p");
    expect(await responder(true)).toMatchObject({ tipo: "pronto", pronto: true });
    s.sala.marcarPronto(s.id(), s.membros.ana, true);
    await atualizar(s);
    expect(dom.botao(r, /Pronto ✓/).getAttribute("aria-pressed")).toBe("true");
  });

  test("modo contínuo: o fechamento do mês não abre janela nem aviso flutuante", async () => {
    const s = salaDeExemplo();
    s.jogar(29);
    const r = await jogo(s.visaoAluno(s.membros.ana));
    s.jogar(1);
    await atualizar(s);
    expect(r.querySelector(".j-veu")).toBeNull();
    expect(notificacoes(r)).toEqual([]);
    expect(r.querySelector(".j-pronto")).toBeNull();
  });

  test("fim da partida: janela com a colocação; decisões travadas", async () => {
    const s = salaDeExemplo({ duracaoMeses: 1 });
    s.jogar(30);
    const v = s.visaoAluno(s.membros.ana);
    expect(v.relogio.motivoPausa).toBe("duracao_atingida");
    const r = await jogo(v);
    expect(texto(r, "#j-titulo")).toBe("Fim da partida");
    expect(texto(r, ".j-veu")).toContain("Colocação");
    expect((r.querySelector("#campo-preco") as HTMLInputElement).disabled).toBe(true);
  });

  test("atalhos: números trocam o produto; R resultados (DRE); G gráficos; Esc fecha; nada nos campos", async () => {
    const s = salaDeExemplo();
    s.sala.decidir(s.id(), s.membros.ana, [{ tipo: "produto", produto: LEITE, preco: 580, compraMensal: 20_000 }]);
    s.jogar(60);
    const v = s.visaoAluno(s.membros.ana);
    const r = await jogo(v, { semanas: [{ semana: 1, mes: 1, empresa: v.empresa, mercado: "m", produto: LEITE, vendas: 1, demanda: 1, receita: 1, preco: 580, nota: 1, participacao: 0.3, marca: 1, qualidade: 1, estoqueFinal: 1 }], mercado: [] });
    await tecla("2");
    expect(texto(r, ".j-palco h1")).toBe(v.visao.produtos[1]!.nome);
    await tecla("1");
    await tecla("r");
    expect([...r.querySelectorAll(".j-dre thead th")].map((x) => x.textContent)).toEqual(["Demonstração do resultado", "jan", "fev"]);
    expect(texto(r, ".j-dre")).toContain("Lucro líquido");
    await tecla("Escape");
    expect(r.querySelector(".j-veu")).toBeNull();
    await tecla("g");
    expect(r.querySelectorAll(".j-graficos polyline").length).toBeGreaterThanOrEqual(2);
    await tecla("Escape");
    // Digitando "2" num campo não troca de produto.
    const preco = r.querySelector("#campo-preco") as HTMLInputElement;
    await tecla("2", preco);
    expect(texto(r, ".j-palco h1")).toBe("Leite engarrafado");
    expect(dom.pedidos.some((p) => p.caminho === "/api/salas/ABCDE/historico")).toBe(true);
  });

  test("participação: rosca com fatia destacada, linhas por semana ao fundo e dica que sobrevive à virada do dia", async () => {
    const s = salaDeExemplo();
    s.sala.decidir(s.id(), s.membros.ana, [{ tipo: "produto", produto: LEITE, preco: 560, compraMensal: 20_000 }]);
    s.sala.decidir(s.id(), s.membros.caio, [{ tipo: "produto", produto: LEITE, preco: 590, compraMensal: 20_000 }]);
    s.jogar(10);
    const m = (semana: number, empresa: string, participacao: number) => ({ semana, empresa, produto: LEITE, participacao });
    const r = await jogo(s.visaoAluno(s.membros.ana), { semanas: [], mercado: [m(1, "emp_01", 0.3), m(1, "emp_02", 0.5), m(1, "emp_03", 0.2)] });
    const fatias = () => [...r.querySelectorAll(".j-fatia")].filter((f) => f.getAttribute("d"));
    expect(fatias().length).toBeGreaterThanOrEqual(2);
    expect(r.querySelector(".j-fatia.nos")!.getAttribute("d")).not.toBe("");
    expect(r.querySelectorAll(".j-linhas-fundo polyline").length).toBe(3);
    const beta = r.querySelector('.j-fatia[data-empresa="emp_02"]')!;
    await dom.agir(() => beta.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: 10, clientY: 10 })));
    expect(texto(r, ".j-dica-fatia")).toMatch(/^Beta · \d+,\d%$/);
    s.jogar(1);
    await atualizar(s);
    expect(r.querySelector('.j-fatia[data-empresa="emp_02"]') === beta).toBe(true); // mesmo elemento
    expect(texto(r, ".j-dica-fatia")).toMatch(/^Beta · /);
    // O React monta o "saiu" a partir do pointerout (o navegador dispara os dois).
    await dom.agir(() => r.querySelector(".j-pizza")!.dispatchEvent(new PointerEvent("pointerout", { bubbles: true, relatedTarget: document.body })));
    expect(!!r.querySelector(".j-dica-fatia")).toBe(false);
  });

  test("os cartões e os botões não são recriados quando o dia vira", async () => {
    const s = salaDeExemplo();
    s.jogar(2);
    const r = await jogo(s.visaoAluno(s.membros.ana));
    const cartao = r.querySelector(".j-cartao");
    const abrir = dom.botao(r, "+ Abrir");
    const campo = r.querySelector("#campo-preco");
    s.jogar(1);
    await atualizar(s);
    // Identidade com === (o toBe do Bun com elementos do happy-dom aceita elementos diferentes e iguais).
    expect(r.querySelector(".j-cartao") === cartao).toBe(true);
    expect(dom.botao(r, "+ Abrir") === abrir).toBe(true);
    expect(r.querySelector("#campo-preco") === campo).toBe(true);
  });

  test("sair apaga a sessão e volta para a entrada", async () => {
    const s = salaDeExemplo();
    dom.rotas.set("POST /api/salas/ABCDE/sair", { corpo: { ok: true } });
    dom.rotas.set("GET /api/salas/ABCDE", { corpo: infoPublica(s) });
    const r = await jogo(s.visaoAluno(s.membros.ana));
    await dom.agir(() => dom.botao(r, /Sair/).click());
    expect(dom.pedidos.some((p) => p.metodo === "POST" && p.caminho === "/api/salas/ABCDE/sair")).toBe(true);
    expect(r.querySelector("form[aria-label='Entrar na sala']")).not.toBeNull();
    expect(document.documentElement.classList.contains("j-modo-jogo")).toBe(false);
  });
});
