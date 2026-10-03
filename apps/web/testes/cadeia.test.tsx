/**
 * Tela da cadeia no DOM (happy-dom, fase 1b, entrega 8): visões reais do servidor com o preset
 * `cadeia/minima`; cada decisão da tela é conferida pelo que chega ao servidor (o comando enviado).
 * A conferência de layout (sem rolagem, sem tremor, 1366×768) é visual, feita pelo autor; aqui ficam as
 * regras que a garantem (estrutura, classes, CSS sem rolagem).
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { VisaoAluno } from "@simulador/compartilhado";
import { formatarReais } from "../src/formato";
import { prepararDom } from "./dom";
import { LEITE, salaDaCadeia, salaDeExemplo } from "./fixtures";

const dom = prepararDom();

async function jogo(v: VisaoAluno) {
  dom.rotas.set("GET /api/salas/ABCDE/sessao", { corpo: { professor: false, aluno: { membro: "mem_1", nome: "Ana", empresa: v.empresa } } });
  dom.rotas.set("GET /api/salas/ABCDE/historico", { corpo: { ok: true, semanas: [], mercado: [] } });
  const r = await dom.montar("/s/ABCDE");
  await dom.servidorEnvia({ tipo: "snapshot", papel: "aluno", visao: v });
  return r;
}

const esperar = (ms: number) => dom.agir(() => new Promise((ok) => setTimeout(ok, ms)));
const tecla = (key: string, alvo: EventTarget = document.body) => dom.agir(() => alvo.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true })));
const texto = (r: ParentNode, s: string) => (r.querySelector(s)?.textContent ?? "").replace(/ /g, " ");
const notificacoes = (r: ParentNode) => [...r.querySelectorAll(".j-notificacao")].map((n) => n.textContent!.replace(/ /g, " "));
const atualizar = (s: ReturnType<typeof salaDeExemplo>) => dom.servidorEnvia({ tipo: "atualizacao", papel: "aluno", visao: s.visaoAluno(s.membros.ana) });
const clonar = (v: VisaoAluno) => JSON.parse(JSON.stringify(v)) as VisaoAluno;
const painel = (r: ParentNode) => r.querySelector(".j-painel-cadeia")!;
const cartao = (r: ParentNode, id: string) => r.querySelector(`[data-instalacao="${id}"]`) as HTMLButtonElement;
const clicar = (el: Element | null) => dom.agir(() => (el as HTMLElement).click());
const ultimoComando = () => dom.ws().comandos.at(-1)!;

async function responder(ok: boolean, motivo?: string) {
  const ultimo = ultimoComando();
  await dom.servidorEnvia({ tipo: "resposta", idComando: ultimo.idComando, ok, ...(motivo ? { motivo } : {}) });
  return ultimo;
}

/** Digita e deixa a pausa da digitação enviar. */
async function digitarEEnviar(campo: Element | null, valor: string) {
  await dom.digitar(campo, valor);
  await esperar(800);
}

const cadeiaDe = (v: VisaoAluno) => v.visao.cadeia!;
const mp = (v: VisaoAluno, produto: string) => cadeiaDe(v).materiasPrimas.find((m) => m.produto === produto)!;
const comEstoque = (v: VisaoAluno, produto: string, quantidade: number, valor = Math.round(quantidade * 100)) => {
  const m = mp(v, produto);
  m.estoque = { quantidade, valor, qualidade: 61 };
  return v;
};

describe("visões da tela", () => {
  test("com o módulo da cadeia abre na cadeia; botões e teclas alternam para Produtos e voltam", async () => {
    const s = salaDaCadeia();
    const v = s.visaoAluno(s.membros.ana);
    const r = await jogo(v);
    expect(r.querySelector(".j-palco-cadeia")).not.toBeNull();
    expect(r.querySelector(".j-principal")!.classList.contains("cadeia")).toBe(true);
    expect(r.querySelector(".j-cartao")).toBeNull();
    expect(r.querySelector(".j-palco h1")).toBeNull();
    const botoes = [...r.querySelectorAll(".j-vistas button")];
    expect(botoes.map((b) => b.textContent?.replace(/\s+/g, " ").trim())).toEqual(["Cadeia C", "Produtos V"]);
    expect(botoes.map((b) => b.getAttribute("aria-pressed"))).toEqual(["true", "false"]);
    // O ranking e os avisos continuam à direita.
    expect(r.querySelector(".j-ranking")).not.toBeNull();
    expect(r.textContent).toContain("Avisos");

    await clicar(dom.botao(r, /^Produtos/));
    expect(r.querySelector(".j-palco-cadeia")).toBeNull();
    expect(r.querySelectorAll(".j-cartao")).toHaveLength(v.visao.produtos.length);
    expect(r.querySelector(".j-palco h1")).not.toBeNull();
    expect([...r.querySelectorAll(".j-vistas button")].map((b) => b.getAttribute("aria-pressed"))).toEqual(["false", "true"]);

    await tecla("c");
    expect(r.querySelector(".j-palco-cadeia")).not.toBeNull();
    await tecla("v");
    expect(r.querySelector(".j-palco-cadeia")).toBeNull();
    await tecla("C");
    expect(r.querySelector(".j-palco-cadeia")).not.toBeNull();
  });

  test("teclas de visão e de instalação não valem com o foco num campo", async () => {
    const s = salaDaCadeia(40);
    const r = await jogo(s.visaoAluno(s.membros.ana));
    const campo = r.querySelector("#campo-producao-fazenda") as HTMLInputElement;
    expect(campo).not.toBeNull();
    await tecla("v", campo);
    expect(r.querySelector(".j-palco-cadeia")).not.toBeNull();
    await tecla("2", campo);
    expect(cartao(r, "faz:faz_03").getAttribute("aria-current")).toBe("true");
  });

  test("sem o módulo da cadeia nada muda: sem botões de visão, console de produtos, C e V não fazem nada", async () => {
    const s = salaDeExemplo();
    s.jogar(2);
    const r = await jogo(s.visaoAluno(s.membros.ana));
    expect(r.querySelector(".j-vistas")).toBeNull();
    expect(r.querySelector(".j-palco-cadeia")).toBeNull();
    expect(r.querySelector(".j-principal")!.classList.contains("cadeia")).toBe(false);
    expect(r.querySelectorAll(".j-cartao").length).toBeGreaterThan(0);
    await tecla("c");
    expect(r.querySelector(".j-palco-cadeia")).toBeNull();
    expect(texto(r, ".j-palco h1")).toBe("Leite engarrafado");
    expect(r.querySelector(".j-ind-acoes")!.classList.contains("com-vistas")).toBe(false);
  });

  test("o aviso de produto esgotado leva ao console de Produtos mesmo estando na cadeia", async () => {
    const s = salaDaCadeia();
    s.sala.decidir(s.id(), s.membros.ana, [{ tipo: "produto", produto: LEITE, preco: 560, compraMensal: 30 }]);
    s.jogar(1);
    const v0 = s.visaoAluno(s.membros.ana);
    const r = await jogo(v0);
    const com = (q: number, tick: number) => {
      const v = clonar(v0);
      v.relogio.tick = tick;
      v.visao.empresa.ofertas.find((o) => o.produto === LEITE)!.estoque.quantidade = q;
      return v;
    };
    await dom.servidorEnvia({ tipo: "atualizacao", papel: "aluno", visao: com(10, v0.relogio.tick + 1) });
    await dom.servidorEnvia({ tipo: "atualizacao", papel: "aluno", visao: com(0, v0.relogio.tick + 2) });
    expect(notificacoes(r).some((t) => t.startsWith("Leite engarrafado esgotou"))).toBe(true);
    await clicar(dom.botao(r, "Ver"));
    expect(r.querySelector(".j-palco-cadeia")).toBeNull();
    expect(texto(r, ".j-palco h1")).toBe("Leite engarrafado");
  });
});

describe("palco: cartões das instalações", () => {
  test("em obra: cartões das fazendas com os dias que faltam; nova fazenda, nova fábrica e loja", async () => {
    const s = salaDaCadeia();
    const v = s.visaoAluno(s.membros.ana);
    const r = await jogo(v);
    const [f1, f2] = cadeiaDe(v).fazendas;
    expect(cartao(r, `faz:${f1!.id}`).textContent).toContain("Gado leiteiro");
    expect(cartao(r, `faz:${f2!.id}`).textContent).toContain("Gado de corte");
    for (const f of [f1!, f2!]) expect(texto(cartao(r, `faz:${f.id}`), ".j-pilula")).toBe(`em obra · ${f.operaDesdeTick - v.relogio.tick} d`);
    expect(cartao(r, "nova:fazenda").textContent).toContain("Nova fazenda");
    expect(cartao(r, "nova:fabrica").textContent).toContain("Nova fábrica");
    expect(cartao(r, "loja").textContent).toContain("Loja");
    // Uma coluna por tipo.
    expect([...r.querySelectorAll(".j-col")].map((c) => c.getAttribute("data-coluna"))).toEqual(["origem", "fabrica", "loja"]);
    expect(r.querySelector('[data-coluna="origem"]')!.querySelectorAll(".j-inst")).toHaveLength(3);
    // A primeira instalação já vem escolhida.
    expect(cartao(r, `faz:${f1!.id}`).getAttribute("aria-current")).toBe("true");
    expect(texto(painel(r), ".j-painel-titulo")).toContain("Gado leiteiro");
  });

  test("em operação: estoque com 14 células, linha de evolução e produção por mês; o nome do estoque cheio fica vermelho só depois de 3 dias", async () => {
    const s = salaDaCadeia(45);
    const v = s.visaoAluno(s.membros.ana);
    const r = await jogo(v);
    const leiteira = cartao(r, "faz:faz_03");
    expect(texto(leiteira, ".j-pilula")).toBe("produzindo");
    expect(leiteira.querySelectorAll(".j-celulas i")).toHaveLength(14);
    const pontos = leiteira.querySelector(".j-spark polyline")!.getAttribute("points")!.trim().split(/\s+/);
    expect(pontos.length).toBe(Math.min(30, mp(v, "leite").serie.length));
    expect(leiteira.querySelector(".j-linha-est .nome")!.classList.contains("cheio")).toBe(false);
    expect(leiteira.textContent).toContain("6.000 L/mês");

    // Estoque no teto há 3 dias: nome e linha vermelhos, estado "parada · cheio".
    const cheio = clonar(v);
    const m = mp(cheio, "leite");
    Object.assign(m, { diasCheio: 3, serie: [0.9, 1, 1, 1] });
    m.estoque = { quantidade: m.capacidade, valor: 1000, qualidade: 55 };
    await dom.servidorEnvia({ tipo: "atualizacao", papel: "aluno", visao: cheio });
    expect(leiteira.querySelector(".j-linha-est .nome")!.classList.contains("cheio")).toBe(true);
    expect(leiteira.querySelector(".j-spark")!.getAttribute("class")).toContain("cheio");
    expect(texto(leiteira, ".j-pilula")).toBe("parada · cheio");
    expect(leiteira.querySelector(".j-pilula")!.classList.contains("erro")).toBe(true);

    // Cheio há 2 dias: ainda sem alerta no nome.
    const dois = clonar(cheio);
    mp(dois, "leite").diasCheio = 2;
    await dom.servidorEnvia({ tipo: "atualizacao", papel: "aluno", visao: dois });
    expect(leiteira.querySelector(".j-linha-est .nome")!.classList.contains("cheio")).toBe(false);
  });

  test("a fazenda de corte mostra os dois coprodutos; a produção digitada ainda não enviada aparece no cartão", async () => {
    const s = salaDaCadeia(45);
    const v = s.visaoAluno(s.membros.ana);
    const r = await jogo(v);
    const corte = cartao(r, "faz:faz_04");
    expect([...corte.querySelectorAll(".j-linha-est .nome")].map((n) => n.textContent)).toEqual(["Carne bovina congelada", "Couro"]);
    s.sala.decidir(s.id(), s.membros.ana, [{ tipo: "ajustarFazenda", fazenda: "faz_04", producaoMensal: 1234 }]);
    await atualizar(s);
    expect(corte.textContent).toContain("1.234");
  });

  test("com mais de 3 fazendas os cartões ficam compactos (sem a linha de evolução) para caber sem rolar", async () => {
    const s = salaDaCadeia(45);
    const v = s.visaoAluno(s.membros.ana);
    const r = await jogo(v);
    expect(r.querySelectorAll(".j-inst.compacto")).toHaveLength(0);
    const quatro = clonar(v);
    const c = cadeiaDe(quatro);
    c.fazendas.push({ ...c.fazendas[0]!, id: "faz_05" }, { ...c.fazendas[0]!, id: "faz_06" });
    await dom.servidorEnvia({ tipo: "atualizacao", papel: "aluno", visao: quatro });
    expect(r.querySelectorAll('[data-coluna="origem"] .j-inst.compacto')).toHaveLength(4);
  });

  test("a loja lista o que está à venda, com preço, e conta os fora de venda", async () => {
    const s = salaDaCadeia(2);
    s.sala.decidir(s.id(), s.membros.ana, [{ tipo: "produto", produto: LEITE, preco: 560, compraMensal: 30 }]);
    s.jogar(1);
    const v = s.visaoAluno(s.membros.ana);
    const r = await jogo(v);
    const loja = cartao(r, "loja");
    expect(loja.querySelectorAll(".j-linha-est.loja")).toHaveLength(1);
    expect(loja.textContent).toContain("Leite engarrafado");
    expect(loja.textContent).toContain(formatarReais(560));
    expect(loja.textContent).toContain(`${v.visao.produtos.length - 1} fora de venda`);
  });
});

describe("escolha da instalação e abas", () => {
  test("teclas 1–9 escolhem a instalação na ordem do palco; I e A alternam as abas", async () => {
    const s = salaDaCadeia(45);
    const r = await jogo(s.visaoAluno(s.membros.ana));
    expect(texto(painel(r), ".j-painel-titulo")).toContain("Gado leiteiro");
    await tecla("2");
    expect(cartao(r, "faz:faz_04").getAttribute("aria-current")).toBe("true");
    expect(texto(painel(r), ".j-painel-titulo")).toContain("Gado de corte");
    await tecla("3");
    expect(texto(painel(r), ".j-painel-titulo")).toContain("Nova fazenda");
    await tecla("4");
    expect(texto(painel(r), ".j-painel-titulo")).toContain("Nova fábrica");
    await tecla("5");
    expect(texto(painel(r), ".j-painel-titulo")).toContain("Loja");
    await tecla("9"); // além da última: nada muda
    expect(texto(painel(r), ".j-painel-titulo")).toContain("Loja");

    await tecla("a");
    expect(r.querySelector(".j-tabela-atacado")).not.toBeNull();
    expect([...r.querySelectorAll(".j-abas button")].map((b) => b.getAttribute("aria-selected"))).toEqual(["false", "true"]);
    await tecla("i");
    expect(r.querySelector(".j-tabela-atacado")).toBeNull();
    // Escolher um cartão volta à aba da instalação.
    await tecla("a");
    await clicar(cartao(r, "faz:faz_03"));
    expect(r.querySelector(".j-tabela-atacado")).toBeNull();
  });
});

describe("fazenda: produção, oferta no atacado e cooperativa", () => {
  test("produção mensal: envia ajustarFazenda, valida a capacidade e mostra o valor pendente", async () => {
    const s = salaDaCadeia(45);
    const v = s.visaoAluno(s.membros.ana);
    const r = await jogo(v);
    const campo = r.querySelector("#campo-producao-fazenda") as HTMLInputElement;
    expect(campo.value).toBe("6.000");
    const cap = cadeiaDe(v).atividades.find((a) => a.id === "gado_leiteiro")!.capacidadeUnidadesPorDia * v.visao.ticksPorMes;
    expect(cap).toBe(12_000);

    await dom.digitar(campo, "12.001");
    await tecla("Enter", campo);
    expect(texto(r, "#campo-producao-fazenda-estado")).toBe("a capacidade é 12.000 por mês");
    expect(dom.ws().comandos).toEqual([]);

    await digitarEEnviar(campo, "4.500");
    expect(ultimoComando()).toMatchObject({ tipo: "decidir", decisoes: [{ tipo: "ajustarFazenda", fazenda: "faz_03", producaoMensal: 4500 }] });
    await responder(true);
    s.sala.decidir(s.id(), s.membros.ana, [{ tipo: "ajustarFazenda", fazenda: "faz_03", producaoMensal: 4500 }]);
    await atualizar(s);
    expect(texto(r, "#campo-producao-fazenda-estado")).toBe("✓ enviado · vale a partir de amanhãantes: 6.000");
    expect(cartao(r, "faz:faz_03").textContent).toContain("4.500 L/mês");
  });

  test("oferta no atacado: quantidade publica a oferta ao preço do fornecedor; preço fora da faixa é recusado antes de enviar", async () => {
    const s = salaDaCadeia(45);
    const v = s.visaoAluno(s.membros.ana);
    const r = await jogo(v);
    const { piso, teto } = cadeiaDe(v).faixaDoAtacado.leite!;
    const preco = r.querySelector("#campo-preco-atacado-leite") as HTMLInputElement;
    const qtd = r.querySelector("#campo-qtd-atacado-leite") as HTMLInputElement;
    expect(preco.value).toBe(formatarReais(teto, { simbolo: false })); // sem oferta, o preço sugerido é o teto
    expect(texto(r, "#campo-preco-atacado-leite-estado")).toContain("sem oferta");

    // Preço antes da quantidade: pede a quantidade.
    await dom.digitar(preco, formatarReais(piso, { simbolo: false }));
    await tecla("Enter", preco);
    expect(texto(r, "#campo-preco-atacado-leite-estado")).toBe("defina antes a quantidade oferecida");
    await tecla("Escape", preco);

    await digitarEEnviar(qtd, "900");
    expect(ultimoComando()).toMatchObject({ decisoes: [{ tipo: "ofertarNoAtacado", produto: "leite", preco: teto, quantidadeMensal: 900 }] });
    await responder(true);
    s.sala.decidir(s.id(), s.membros.ana, [{ tipo: "ofertarNoAtacado", produto: "leite", preco: teto, quantidadeMensal: 900 }]);
    await atualizar(s);

    // Agora há oferta: o preço é enviado com a quantidade vigente; abaixo do piso ou acima do teto, não.
    const enviados = dom.ws().comandos.length;
    await dom.digitar(preco, formatarReais(piso - 1, { simbolo: false }));
    await tecla("Enter", preco);
    expect(texto(r, "#campo-preco-atacado-leite-estado")).toBe(`entre ${formatarReais(piso)} e ${formatarReais(teto)}`);
    await dom.digitar(preco, formatarReais(teto + 1, { simbolo: false }));
    await tecla("Enter", preco);
    expect(texto(r, "#campo-preco-atacado-leite-estado")).toBe(`entre ${formatarReais(piso)} e ${formatarReais(teto)}`);
    expect(dom.ws().comandos.length).toBe(enviados);
    const meio = Math.round((piso + teto) / 2);
    await digitarEEnviar(preco, formatarReais(meio, { simbolo: false }));
    expect(ultimoComando()).toMatchObject({ decisoes: [{ tipo: "ofertarNoAtacado", produto: "leite", preco: meio, quantidadeMensal: 900 }] });
  });

  test("quantidade 0 retira a oferta; a recusa do servidor aparece no campo", async () => {
    const s = salaDaCadeia(45);
    const v0 = s.visaoAluno(s.membros.ana);
    const teto = cadeiaDe(v0).faixaDoAtacado.leite!.teto;
    s.sala.decidir(s.id(), s.membros.ana, [{ tipo: "ofertarNoAtacado", produto: "leite", preco: teto, quantidadeMensal: 900 }]);
    s.jogar(1);
    const r = await jogo(s.visaoAluno(s.membros.ana));
    const qtd = r.querySelector("#campo-qtd-atacado-leite") as HTMLInputElement;
    expect(qtd.value).toBe("900");
    await digitarEEnviar(qtd, "0");
    expect(ultimoComando()).toMatchObject({ decisoes: [{ tipo: "ofertarNoAtacado", produto: "leite", preco: teto, quantidadeMensal: 0 }] });
    await responder(false, "decisões bloqueadas neste momento");
    expect(texto(r, "#campo-qtd-atacado-leite-estado")).toBe("decisões bloqueadas neste momento");
  });

  test("cooperativa: vende uma quantidade (ordem de um dia só), recusa mais do que o estoque e mostra a ordem enviada", async () => {
    const s = salaDaCadeia(45);
    const v = comEstoque(s.visaoAluno(s.membros.ana), "leite", 777);
    const r = await jogo(v);
    const entrada = r.querySelector('input[aria-label^="Quantidade de Leite"]') as HTMLInputElement;
    const bloco = r.querySelector(".j-venda-mp")!;
    expect(bloco.textContent).toContain(formatarReais(mp(v, "leite").precoCooperativa));
    expect(texto(bloco, "h3")).toContain("777");

    await dom.digitar(entrada, "778");
    await clicar(dom.botao(bloco, "Vender"));
    expect(dom.ws().comandos).toEqual([]);
    expect(notificacoes(r).at(-1)).toBe("Só há 777 litros em estoque.");

    await clicar(dom.botao(bloco, "Tudo"));
    expect(entrada.value).toBe("777");
    await dom.digitar(entrada, "120");
    await clicar(dom.botao(bloco, "Vender"));
    expect(ultimoComando()).toMatchObject({ decisoes: [{ tipo: "venderParaCooperativa", produto: "leite", quantidade: 120 }] });
    await responder(true);
    expect(entrada.value).toBe("");
    expect(notificacoes(r).at(-1)).toContain("Ordem enviada: 120 litros de leite à cooperativa");

    // A ordem na fila aparece (vem das pendências da visão).
    const pendente = clonar(v);
    pendente.pendentes = [{ tipo: "venderParaCooperativa", produto: "leite", quantidade: 120 }];
    await dom.servidorEnvia({ tipo: "atualizacao", papel: "aluno", visao: pendente });
    expect(texto(r, ".j-coop small")).toBe("Ordem enviada: 120 L à cooperativa amanhã.");
    // Sem número ou zero: avisa e não envia.
    const antes = dom.ws().comandos.length;
    await dom.digitar(entrada, "0");
    await clicar(dom.botao(bloco, "Vender"));
    expect(dom.ws().comandos.length).toBe(antes);
  });

  test("durante a obra o painel não oferece venda; pausa do professor trava campos e botões", async () => {
    const s = salaDaCadeia(2);
    const emObra = await jogo(s.visaoAluno(s.membros.ana));
    expect(emObra.querySelector(".j-venda-mp")).toBeNull();
    expect(dom.botao(emObra, "Trocar atividade…").disabled).toBe(true);
  });

  test("pausa do professor: campos da fazenda e da cooperativa travados, com a faixa avisando", async () => {
    const s = salaDaCadeia(45);
    s.sala.comandoRelogio(s.id(), s.sala.estado.tick, "pausar");
    const r = await jogo(comEstoque(s.visaoAluno(s.membros.ana), "leite", 100));
    expect(texto(r, ".j-faixa")).toContain("decisões estão travadas");
    for (const id of ["#campo-producao-fazenda", "#campo-preco-atacado-leite", "#campo-qtd-atacado-leite"]) expect((r.querySelector(id) as HTMLInputElement).disabled).toBe(true);
    expect(texto(r, "#campo-producao-fazenda-estado")).toBe("travado na pausa");
    expect(dom.botao(r, "Vender").disabled).toBe(true);
    expect(dom.botao(r, "Trocar atividade…").disabled).toBe(true);
  });
});

describe("fazenda com dois coprodutos (gado de corte)", () => {
  test("uma matéria-prima por vez, em abas: carne e couro; cada aba tem a sua oferta e a sua cooperativa", async () => {
    const s = salaDaCadeia(45);
    const v = comEstoque(comEstoque(s.visaoAluno(s.membros.ana), "carne_bovina_congelada", 300), "couro", 150);
    const r = await jogo(v);
    await clicar(cartao(r, "faz:faz_04"));
    const abas = [...painel(r).querySelectorAll('[aria-label="Matéria-prima da fazenda"] button')];
    expect(abas.map((b) => b.textContent)).toEqual(["Carne bovina congelada", "Couro"]);
    expect(abas.map((b) => b.getAttribute("aria-selected"))).toEqual(["true", "false"]);
    expect(painel(r).querySelectorAll(".j-venda-mp")).toHaveLength(1);
    expect(texto(painel(r), ".j-venda-mp h3")).toContain("Carne bovina congelada");
    expect(painel(r).querySelector("#campo-preco-atacado-carne_bovina_congelada")).not.toBeNull();
    expect(painel(r).querySelector("#campo-preco-atacado-couro")).toBeNull();

    await clicar(abas[1]!);
    expect(painel(r).querySelectorAll(".j-venda-mp")).toHaveLength(1);
    expect(texto(painel(r), ".j-venda-mp h3")).toContain("Couro");
    expect(painel(r).querySelector("#campo-preco-atacado-couro")).not.toBeNull();
    await dom.digitar(painel(r).querySelector('input[aria-label^="Quantidade de Couro"]'), "40");
    await clicar(dom.botao(painel(r), "Vender"));
    expect(ultimoComando()).toMatchObject({ decisoes: [{ tipo: "venderParaCooperativa", produto: "couro", quantidade: 40 }] });
  });

  test("fazenda de um produto só não mostra abas", async () => {
    const s = salaDaCadeia(45);
    const r = await jogo(s.visaoAluno(s.membros.ana));
    expect(painel(r).querySelector('[aria-label="Matéria-prima da fazenda"]')).toBeNull();
    expect(painel(r).querySelectorAll(".j-venda-mp")).toHaveLength(1);
  });
});

describe("troca de atividade", () => {
  async function abrirTroca(estoques: Record<string, number> = { carne_bovina_congelada: 300, couro: 150 }) {
    const s = salaDaCadeia(45);
    const v = s.visaoAluno(s.membros.ana);
    for (const [p, q] of Object.entries(estoques)) comEstoque(v, p, q);
    const r = await jogo(v);
    await clicar(cartao(r, "faz:faz_04")); // gado de corte
    await clicar(dom.botao(painel(r), "Trocar atividade…"));
    return { s, v, r };
  }

  test("abre a janela com a conversão, o estoque que sai e o caixa estimado de cada via (conta à mão)", async () => {
    const { v, r } = await abrirTroca();
    expect(texto(r, "#j-titulo")).toBe("Trocar gado de corte para gado leiteiro");
    const c = cadeiaDe(v);
    expect(texto(r, ".j-aviso-troca")).toContain(formatarReais(c.conversao.custo));
    expect(texto(r, ".j-aviso-troca")).toContain(`${c.conversao.prazoDias} dias`);
    expect(texto(r, ".j-troca")).toContain("300 kg de carne bovina congelada e 150 kg de couro");
    const coop = Math.round(300 * mp(v, "carne_bovina_congelada").precoCooperativa) + Math.round(150 * mp(v, "couro").precoCooperativa);
    expect(texto(r, '[data-via="cooperativa"] .preco')).toBe(`+${formatarReais(coop)}`);
    const atacado = Math.round(300 * Math.round(mp(v, "carne_bovina_congelada").precoFornecedor * 0.8)) + Math.round(150 * Math.round(mp(v, "couro").precoFornecedor * 0.8));
    expect(texto(r, '[data-via="atacado"] .preco')).toBe(`+${formatarReais(atacado)}`);
    const descarte = Math.round(300 * c.descarte.custoPorUnidade) + Math.round(150 * c.descarte.custoPorUnidade);
    expect(texto(r, '[data-via="destruir"] .preco')).toBe(`−${formatarReais(descarte)}`);
  });

  test("cooperativa é a via inicial; enviar manda trocarAtividade e fecha a janela", async () => {
    const { r } = await abrirTroca();
    expect(r.querySelector('[data-via="cooperativa"]')!.getAttribute("aria-checked")).toBe("true");
    await clicar(r.querySelector('.j-troca [data-atividade="frango"]'));
    expect(texto(r, "#j-titulo")).toBe("Trocar gado de corte para frango");
    await clicar(dom.botao(r, "Trocar e desovar"));
    expect(ultimoComando()).toMatchObject({ decisoes: [{ tipo: "trocarAtividade", fazenda: "faz_04", atividade: "frango", desova: "cooperativa" }] });
    expect(JSON.stringify(ultimoComando())).not.toContain("fatorPrecoAtacado");
    await responder(true);
    expect(r.querySelector(".j-veu")).toBeNull();
    expect(notificacoes(r).at(-1)).toContain("Troca para frango enviada");
  });

  test("atacado: o percentual precisa estar entre o piso e 100; vai como fração; a recusa do servidor aparece na janela", async () => {
    const { v, r } = await abrirTroca();
    const piso = Math.ceil(cadeiaDe(v).cooperativa.fatorPiso * 100);
    await clicar(r.querySelector('[data-via="atacado"]'));
    const campo = r.querySelector("#campo-fator-atacado") as HTMLInputElement;
    expect(campo.value).toBe("80");
    const enviar = dom.botao(r, "Trocar e desovar");
    for (const ruim of [String(piso - 1), "101", "", "abc", "80,5"]) {
      await dom.digitar(campo, ruim);
      expect({ ruim, desabilitado: enviar.disabled }).toEqual({ ruim, desabilitado: true });
      expect(r.querySelector("#campo-fator-atacado")!.getAttribute("aria-invalid")).toBe("true");
    }
    await dom.digitar(campo, String(piso));
    expect(enviar.disabled).toBe(false);
    await dom.digitar(campo, "75");
    await clicar(enviar);
    expect(ultimoComando()).toMatchObject({ decisoes: [{ tipo: "trocarAtividade", fazenda: "faz_04", atividade: "gado_leiteiro", desova: "atacado", fatorPrecoAtacado: 0.75 }] });
    await responder(false, "a fazenda já está em conversão");
    expect(texto(r, ".j-troca [role=alert]")).toBe("a fazenda já está em conversão");
    expect(r.querySelector(".j-veu")).not.toBeNull();
  });

  test("destruir envia a desova destruir; sem estoque a sair não há escolha de via", async () => {
    const { r } = await abrirTroca();
    await clicar(r.querySelector('[data-via="destruir"]'));
    await clicar(dom.botao(r, "Trocar e desovar"));
    expect(ultimoComando()).toMatchObject({ decisoes: [{ tipo: "trocarAtividade", desova: "destruir" }] });
    await responder(true);

    // Sem estoque: não pergunta pela via e envia "destruir" (nada a destruir).
    const { r: r2 } = await abrirTroca({ carne_bovina_congelada: 0, couro: 0 });
    expect(r2.querySelector('[data-testid="sem-estoque-na-troca"]')).not.toBeNull();
    expect(r2.querySelector("[data-via]")).toBeNull();
    await clicar(dom.botao(r2, "Trocar"));
    expect(ultimoComando()).toMatchObject({ decisoes: [{ tipo: "trocarAtividade", desova: "destruir" }] });
  });

  test("Esc e Cancelar fecham; com a janela aberta as teclas do jogo ficam paradas", async () => {
    const { r } = await abrirTroca();
    await tecla("1");
    expect(cartao(r, "faz:faz_04").getAttribute("aria-current")).toBe("true"); // não mudou para a primeira
    await tecla("v");
    expect(r.querySelector(".j-palco-cadeia")).not.toBeNull();
    await tecla("Escape");
    expect(r.querySelector(".j-veu")).toBeNull();
    expect(dom.ws().comandos).toEqual([]);
    await clicar(dom.botao(painel(r), "Trocar atividade…"));
    await clicar(dom.botao(r, /^Cancelar/));
    expect(r.querySelector(".j-veu")).toBeNull();
    // Depois de fechar as teclas voltam.
    await tecla("1");
    expect(cartao(r, "faz:faz_03").getAttribute("aria-current")).toBe("true");
  });

  test("troca já enviada: o botão fica parado e o cartão avisa", async () => {
    const s = salaDaCadeia(45);
    s.sala.decidir(s.id(), s.membros.ana, [{ tipo: "trocarAtividade", fazenda: "faz_04", atividade: "frango", desova: "destruir" }]);
    const r = await jogo(s.visaoAluno(s.membros.ana));
    expect(cartao(r, "faz:faz_04").textContent).toContain("troca para frango amanhã");
    await clicar(cartao(r, "faz:faz_04"));
    expect(dom.botao(painel(r), "Trocar atividade…").disabled).toBe(true);
    expect(painel(r).textContent).toContain("troca para frango enviada: vale amanhã");
  });
});

describe("atacado: comprar das outras equipes", () => {
  function comOfertas(v: VisaoAluno) {
    cadeiaDe(v).atacado = [
      { vendedor: "emp_02", produto: "leite", preco: 250, quantidadeMensal: 3000, qualidade: 62 },
      { vendedor: "emp_03", produto: "leite", preco: 230, quantidade_mensal: 100, quantidadeMensal: 100, qualidade: 48 } as never,
    ];
    return v;
  }

  test("tabela do leite: fornecedor no teto, as outras equipes, vocês e a cooperativa no piso, do mais caro ao mais barato", async () => {
    const s = salaDaCadeia(45);
    const v = comOfertas(s.visaoAluno(s.membros.ana));
    const teto = cadeiaDe(v).faixaDoAtacado.leite!.teto;
    const r = await jogo(v);
    await tecla("a");
    expect([...r.querySelectorAll(".j-chip")].map((c) => c.textContent)).toEqual(["Açúcar", "Carne bovina congelada", "Couro", "Frango congelado", "Leite", "Morango"]);
    expect(r.querySelector(".j-chip.sel")!.textContent).toBe("Leite"); // a primeira com ofertas
    const linhas = [...r.querySelectorAll(".j-tabela-atacado tbody tr")].map((tr) => [...tr.querySelectorAll("td")].slice(0, 4).map((td) => td.textContent));
    const robo = v.visao.concorrentes.find((c) => c.id === "emp_03")!.nome;
    expect(linhas.map((l) => l[0])).toEqual(["Fornecedor (teto)", "Beta", robo.includes("(robô)") ? robo : `${robo} (robô)`, "Cooperativa (piso)"]);
    expect(linhas[0]![1]).toBe(formatarReais(teto));
    expect(linhas[1]).toEqual(["Beta", formatarReais(250), "62", "3.000/mês"]);
    expect(linhas.at(-1)![1]).toBe(formatarReais(mp(v, "leite").precoCooperativa));
    expect(linhas.at(-1)![3]).toBe("por ordem");
    // Preço da cooperativa abaixo de todas as ofertas, e o teto acima.
    const precos = linhas.map((l) => Number(l[1]!.replace(/[^\d]/g, "")));
    expect([...precos].sort((a, b) => b - a)).toEqual(precos);
  });

  test("Comprar escolhe o vendedor; o pedido vai como comprarNoAtacado e Cancelar pedido manda quantidade 0", async () => {
    const s = salaDaCadeia(45);
    const v = comOfertas(s.visaoAluno(s.membros.ana));
    const r = await jogo(v);
    await tecla("a");
    expect(r.querySelector(".j-pedido")).toBeNull();
    await clicar(r.querySelector('button[aria-label="Comprar Leite de Beta"]'));
    expect(texto(r, "#campo-pedido-leite-estado")).toContain("valendo");
    expect(r.querySelector('label[for="campo-pedido-leite"]')!.textContent).toContain("Pedido a Beta");
    await digitarEEnviar(r.querySelector("#campo-pedido-leite"), "321");
    expect(ultimoComando()).toMatchObject({ decisoes: [{ tipo: "comprarNoAtacado", produto: "leite", vendedor: "emp_02", quantidadeMensal: 321 }] });
    await responder(true);

    // Com o pedido vigente: o campo mostra a quantidade e há como cancelar.
    const pedido = clonar(v);
    cadeiaDe(pedido).materiasPrimas.find((m) => m.produto === "leite")!.pedidoAtacado = { vendedor: "emp_02", quantidadeMensal: 321 };
    await dom.servidorEnvia({ tipo: "atualizacao", papel: "aluno", visao: pedido });
    expect((r.querySelector("#campo-pedido-leite") as HTMLInputElement).value).toBe("321");
    await clicar(dom.botao(r, "Cancelar pedido"));
    expect(ultimoComando()).toMatchObject({ decisoes: [{ tipo: "comprarNoAtacado", produto: "leite", vendedor: "emp_02", quantidadeMensal: 0 }] });
    await responder(true);
    expect(notificacoes(r).at(-1)).toBe("Pedido cancelado. Vale amanhã.");
  });

  test("sem ofertas dos outros a aba explica; a oferta própria aparece na tabela como vocês", async () => {
    const s = salaDaCadeia(45);
    const v0 = s.visaoAluno(s.membros.ana);
    const teto = cadeiaDe(v0).faixaDoAtacado.leite!.teto;
    s.sala.decidir(s.id(), s.membros.ana, [{ tipo: "ofertarNoAtacado", produto: "leite", preco: teto - 10, quantidadeMensal: 800 }]);
    s.jogar(1);
    const r = await jogo(s.visaoAluno(s.membros.ana));
    await tecla("a");
    expect(r.querySelector(".j-chip.sel")!.textContent).toBe("Leite"); // tem oferta própria
    expect(texto(r, ".j-tabela-atacado tr.nos")).toContain("Vocês");
    expect(texto(r, ".j-tabela-atacado tr.nos")).toContain("800/mês");
    expect(painel(r).textContent).toContain("Nenhuma outra equipe oferece leite agora");
    expect(painel(r).textContent).toContain("Para comprar, toque em “Comprar”");
  });
});

describe("fábrica: origem dos insumos", () => {
  async function comFabrica() {
    const s = salaDaCadeia(45);
    s.sala.decidir(s.id(), s.membros.ana, [{ tipo: "construirFabrica", produto: "sorvete" }, { tipo: "construirFabrica", produto: LEITE }]);
    s.jogar(80);
    const v = s.visaoAluno(s.membros.ana);
    comEstoque(v, "leite", 500, 60_000);
    const r = await jogo(v);
    return { s, v, r };
  }

  test("cartão da fábrica: insumos com a origem (própria ou externo), estoque em dias de produção e estado", async () => {
    const { s, r } = await comFabrica();
    s.sala.decidir(s.id(), s.membros.ana, [{ tipo: "produto", produto: "sorvete", origemInsumos: { leite: "propria" }, producaoMensal: 3000 }]);
    await atualizar(s);
    const card = cartao(r, "fab:sorvete");
    expect(card.textContent).toContain("Fábrica de sorvete");
    const insumos = [...card.querySelectorAll(".j-insumo")].map((i) => [i.textContent!.replace(/\s+/g, " "), i.querySelector(".tag")!.textContent]);
    expect(insumos.map((i) => i[1])).toEqual(["própria", "externo", "externo"]);
    expect(insumos[0]![0]).toContain("Leite");
    expect(texto(card, ".j-fluxo-linha")).toContain("d de produção em estoque");
    expect(texto(card, ".j-pilula")).toBe("produzindo");
  });

  test("painel da fábrica: escolher estoque próprio manda a origem; voltar ao fornecedor manda fornecedor; insumo sem fazenda só tem o fornecedor", async () => {
    const { r } = await comFabrica();
    await clicar(cartao(r, "fab:leite_engarrafado"));
    const vidro = r.querySelector('.j-origem[data-insumo="vidro"]')!;
    const botoesVidro = [...vidro.querySelectorAll("button")];
    expect(botoesVidro.map((b) => b.textContent)).toHaveLength(1); // vidro: nenhuma atividade o produz
    expect(botoesVidro[0]!.disabled).toBe(true);

    const leite = r.querySelector('.j-origem[data-insumo="leite"]')!;
    const [propria, fornecedor] = [...leite.querySelectorAll("button")];
    expect(propria!.getAttribute("aria-pressed")).toBe("false");
    expect(fornecedor!.getAttribute("aria-pressed")).toBe("true");
    expect(propria!.textContent).toContain("500 L em estoque");
    await clicar(propria!);
    expect(ultimoComando()).toMatchObject({ decisoes: [{ tipo: "produto", produto: LEITE, origemInsumos: { leite: "propria" } }] });
    await responder(true);
    expect(notificacoes(r).at(-1)).toContain("agora vem de estoque próprio");
    // Já é a escolha: clicar de novo não envia.
    const n = dom.ws().comandos.length;
    await clicar(fornecedor!); // ainda é o fornecedor (a visão não mudou): não envia
    expect(dom.ws().comandos.length).toBe(n);
  });

  test("origem pendente aparece como escolhida e a mensagem sobre completar com o fornecedor segue o preset", async () => {
    const { s, v, r } = await comFabrica();
    await clicar(cartao(r, "fab:leite_engarrafado"));
    s.sala.decidir(s.id(), s.membros.ana, [{ tipo: "produto", produto: LEITE, origemInsumos: { leite: "propria" } }]);
    await atualizar(s);
    const leite = r.querySelector('.j-origem[data-insumo="leite"]')!;
    expect([...leite.querySelectorAll("button")].map((b) => b.getAttribute("aria-pressed"))).toEqual(["true", "false"]);
    expect(painel(r).textContent).toContain("o que falta vem do fornecedor externo");
    const sem = clonar(v);
    cadeiaDe(sem).completaComFornecedor = false;
    await dom.servidorEnvia({ tipo: "atualizacao", papel: "aluno", visao: sem });
    expect(painel(r).textContent).toContain("a produção diminui até o que o estoque cobre");
  });

  test("produção da fábrica envia producaoMensal do produto; construir outra fábrica pede confirmação", async () => {
    const { r } = await comFabrica();
    await clicar(cartao(r, "fab:sorvete"));
    await digitarEEnviar(r.querySelector("#campo-producaoMensal-sorvete"), "2.500");
    expect(ultimoComando()).toMatchObject({ decisoes: [{ tipo: "produto", produto: "sorvete", producaoMensal: 2500 }] });
    await responder(true);
    await clicar(dom.botao(painel(r), "Mais uma fábrica"));
    expect(dom.botao(painel(r), /^Construir por /)).toBeTruthy();
    await clicar(dom.botao(painel(r), /^Construir por /));
    expect(ultimoComando()).toMatchObject({ decisoes: [{ tipo: "construirFabrica", produto: "sorvete" }] });
  });

  test("fios: ao escolher a fazenda aparece o fio até a fábrica que usa o leite próprio; sem origem própria, nenhum", async () => {
    const { s, r } = await comFabrica();
    const fios = () => Number(r.querySelector(".j-fios")!.getAttribute("data-fios"));
    await clicar(cartao(r, "faz:faz_03"));
    expect(fios()).toBe(0);
    s.sala.decidir(s.id(), s.membros.ana, [{ tipo: "produto", produto: "sorvete", origemInsumos: { leite: "propria" }, preco: 900 }]);
    await atualizar(s);
    expect(fios()).toBe(1); // fazenda leiteira → fábrica de sorvete
    await clicar(cartao(r, "faz:faz_04")); // a de corte não alimenta ninguém
    expect(fios()).toBe(0);
    await clicar(cartao(r, "fab:sorvete"));
    expect(fios()).toBe(2); // da fazenda para a fábrica e da fábrica para a loja (está à venda)
    await clicar(cartao(r, "loja"));
    expect(fios()).toBe(1);
  });
});

describe("construir: nova fazenda e nova fábrica", () => {
  test("nova fazenda: escolhe a atividade, a produção inicial vai pela capacidade e a confirmação é em dois cliques", async () => {
    const s = salaDaCadeia(45);
    const v = s.visaoAluno(s.membros.ana);
    const r = await jogo(v);
    await clicar(cartao(r, "nova:fazenda"));
    const frango = cadeiaDe(v).atividades.find((a) => a.id === "frango")!;
    const cap = frango.capacidadeUnidadesPorDia * v.visao.ticksPorMes;
    await clicar(painel(r).querySelector('[data-atividade="frango"]'));
    expect(painel(r).querySelector('[data-atividade="frango"]')!.getAttribute("aria-checked")).toBe("true");
    const campo = r.querySelector("#campo-producao-nova") as HTMLInputElement;
    expect(campo.value).toBe(cap.toLocaleString("pt-BR"));
    await clicar(dom.botao(painel(r), /^Construir fazenda/));
    expect(dom.ws().comandos).toEqual([]); // 1º clique só pergunta
    await clicar(dom.botao(painel(r), /^Construir por /));
    expect(ultimoComando()).toMatchObject({ decisoes: [{ tipo: "construirFazenda", atividade: "frango", producaoMensal: cap }] });
    await responder(true);
    expect(notificacoes(r).at(-1)).toContain(`Fazenda de frango em obra: fica pronta em ${frango.prazoConstrucaoDias} dias.`);
  });

  test("produção inicial inválida desabilita o botão; fazenda encomendada aparece no palco como 'começa amanhã'", async () => {
    const s = salaDaCadeia(45);
    const r = await jogo(s.visaoAluno(s.membros.ana));
    await clicar(cartao(r, "nova:fazenda"));
    const campo = r.querySelector("#campo-producao-nova") as HTMLInputElement;
    await dom.digitar(campo, "abc");
    expect(dom.botao(painel(r), /^Construir fazenda/).disabled).toBe(true);
    await dom.digitar(campo, "999.999");
    expect(dom.botao(painel(r), /^Construir fazenda/).disabled).toBe(true);
    expect(painel(r).textContent).toContain("a capacidade é");

    s.sala.decidir(s.id(), s.membros.ana, [{ tipo: "construirFazenda", atividade: "morango", producaoMensal: 500 }]);
    await atualizar(s);
    const encomenda = r.querySelector(".j-inst.encomenda")!;
    expect(encomenda.textContent).toContain("Morango");
    expect(encomenda.textContent).toContain("começa amanhã");
  });

  test("nova fábrica: lista os produtos fabricáveis; construir pede confirmação e manda construirFabrica", async () => {
    const s = salaDaCadeia(45);
    const v = s.visaoAluno(s.membros.ana);
    const r = await jogo(v);
    await clicar(cartao(r, "nova:fabrica"));
    const itens = [...painel(r).querySelectorAll("li[data-produto]")].map((li) => li.getAttribute("data-produto"));
    expect(itens).toEqual(v.visao.produtos.filter((p) => p.fabricacao).map((p) => p.id));
    const li = painel(r).querySelector('li[data-produto="carteira"]')!;
    await clicar(dom.botao(li, "Construir"));
    expect(dom.ws().comandos).toEqual([]);
    await clicar(dom.botao(li, /^Construir por /));
    expect(ultimoComando()).toMatchObject({ decisoes: [{ tipo: "construirFabrica", produto: "carteira" }] });
  });
});

describe("loja", () => {
  test("lista todos os produtos; Abrir leva ao console do produto; carne e frango trazem a origem", async () => {
    const s = salaDaCadeia(45);
    const v = s.visaoAluno(s.membros.ana);
    const r = await jogo(v);
    await clicar(cartao(r, "loja"));
    expect(painel(r).querySelectorAll(".j-lista-loja li")).toHaveLength(v.visao.produtos.length);
    // Uma origem por vez (para caber sem rolar): abas para carne e frango; quem é fabricado não tem origem de compra pronta.
    expect([...painel(r).querySelectorAll('[aria-label="Produto que vem da fazenda"] button')].map((b) => b.textContent)).toEqual(["Carne bovina congelada", "Frango congelado"]);
    const carne = painel(r).querySelector('section[aria-label="Origem de Carne bovina congelada"]')!;
    expect(carne).not.toBeNull();
    expect(painel(r).querySelector('section[aria-label="Origem de Frango congelado"]')).toBeNull();
    expect(painel(r).querySelector('section[aria-label^="Origem de Leite"]')).toBeNull();

    const [fornecedor, propria] = [...carne.querySelectorAll("button")];
    expect(fornecedor!.getAttribute("aria-pressed")).toBe("true");
    await clicar(propria!);
    expect(ultimoComando()).toMatchObject({ decisoes: [{ tipo: "produto", produto: "carne_bovina_congelada", origemCompraPronta: "propria" }] });
    await responder(true);
    await digitarEEnviar(carne.querySelector("#campo-compraMensal-carne_bovina_congelada"), "1.200");
    expect(ultimoComando()).toMatchObject({ decisoes: [{ tipo: "produto", produto: "carne_bovina_congelada", compraMensal: 1200 }] });
    await responder(true);

    // A aba do frango mostra a origem do frango, com o abastecimento próprio dele.
    await clicar(dom.botao(painel(r), "Frango congelado"));
    expect(painel(r).querySelector('section[aria-label="Origem de Carne bovina congelada"]')).toBeNull();
    const frango = painel(r).querySelector('section[aria-label="Origem de Frango congelado"]')!;
    expect(frango.querySelector("#campo-compraMensal-frango_congelado")).not.toBeNull();
    await clicar(painel(r).querySelector('li[data-produto="sapato"] button'));
    expect(r.querySelector(".j-palco-cadeia")).toBeNull();
    expect(texto(r, ".j-palco h1")).toBe(v.visao.produtos.find((p) => p.id === "sapato")!.nome);
  });

  test("do console, o botão do cabeçalho e a tecla C voltam à cadeia na instalação em que estava", async () => {
    const s = salaDaCadeia(45);
    const r = await jogo(s.visaoAluno(s.membros.ana));
    await tecla("5"); // loja
    await tecla("v");
    await tecla("c");
    expect(cartao(r, "loja").getAttribute("aria-current")).toBe("true");
  });
});

describe("CSS da cadeia: sem rolagem e sem tremor", () => {
  const css = readFileSync(join(import.meta.dir, "..", "src", "tema", "cadeia.css"), "utf8");

  test("nenhuma regra cria rolagem; o que pode estourar é recortado", () => {
    expect(css).not.toMatch(/overflow(-[xy])?:\s*(auto|scroll)/);
    for (const seletor of [".j-palco-cadeia", ".j-painel-cadeia"]) {
      const bloco = css.slice(css.indexOf(`${seletor} {`));
      expect(bloco.slice(0, bloco.indexOf("}"))).toContain("overflow: hidden");
    }
  });

  test("larguras fixas onde o texto muda por dia: pílula, linha de estoque, botões de visão", () => {
    expect(css).toMatch(/\.j-pilula \{[^}]*min-width: 6\.2rem/);
    expect(css).toMatch(/\.j-linha-est \{[^}]*grid-template-columns: 5\.4rem minmax\(0, 1fr\) 5\.2rem/);
    expect(css).toMatch(/\.j-ind-acoes\.com-vistas \{[^}]*width: 13\.2rem/);
    expect(css).toMatch(/\.j-pilula \{[^}]*white-space: nowrap/);
    expect(css).toMatch(/\.j-linha-est \.qtd \{[^}]*white-space: nowrap/);
  });

  test("a animação dos fios respeita 'reduzir movimento'", () => {
    expect(css).toMatch(/prefers-reduced-motion: reduce\)[^}]*\{[^}]*\.j-fios path\.pulso/s);
  });
});
