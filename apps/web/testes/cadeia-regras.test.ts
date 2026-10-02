/**
 * Regras da tela da cadeia sem React: instalações, decisões efetivas (vigentes + pendentes), estados,
 * desova da troca de atividade, fios e desenho da linha de evolução. Visões reais do servidor, e a
 * paridade com o motor onde a tela prevê o que o motor vai fazer.
 */
import { describe, expect, test } from "bun:test";
import type { DecisaoDoAluno, VisaoAluno } from "@simulador/compartilhado";
import {
  DIAS_DE_REFERENCIA_DA_FABRICA,
  diasDeProducao,
  efetivasDaCadeia,
  estadoDaFabrica,
  estadoDaFazenda,
  estoqueCheio,
  estoqueEmAlerta,
  estoqueQueSai,
  fracaoDoEstoque,
  idDaFabrica,
  idDaFazenda,
  ID_LOJA,
  ID_NOVA_FABRICA,
  ID_NOVA_FAZENDA,
  instalacaoValida,
  instalacoes,
  ligacoes,
  materiaPrima,
  materiasDoAtacado,
  ofertasDosOutros,
  orfaosDaTroca,
  origemEfetiva,
  ponta,
  valorDaDesova,
  type VisaoDaCadeia,
} from "../src/aluno/cadeia/modelo";
import { celulasAcesas, pontosDaSerie } from "../src/aluno/cadeia/pecas";
import { salaDeExemplo } from "./fixtures";

type Cenario = ReturnType<typeof salaDeExemplo>;
const visao = (s: Cenario) => s.visaoAluno(s.membros.ana);
const cadeia = (v: VisaoAluno) => v.visao.cadeia!;
const comPendentes = (v: VisaoAluno, pendentes: DecisaoDoAluno[]): VisaoAluno => ({ ...v, pendentes });

/** Sala da cadeia com duas fazendas (leiteira e de corte) encomendadas e a partida iniciada. */
function cenario(): Cenario {
  const s = salaDeExemplo({ presetId: "cadeia/minima", vagasPorMercado: 3 });
  const r = s.sala.decidir(s.id(), s.membros.ana, [
    { tipo: "construirFazenda", atividade: "gado_leiteiro", producaoMensal: 6000 },
    { tipo: "construirFazenda", atividade: "gado_de_corte", producaoMensal: 3000 },
  ]);
  expect(r).toEqual({ ok: true });
  s.jogar(2);
  return s;
}

/** O mesmo cenário com as obras concluídas (30 dias). */
function cenarioPronto(): Cenario {
  const s = cenario();
  s.jogar(40);
  return s;
}

const decidir = (s: Cenario, d: DecisaoDoAluno[]) => expect(s.sala.decidir(s.id(), s.membros.ana, d)).toEqual({ ok: true });
const estoqueDe = (s: Cenario, mp: string) => s.sala.estado.empresas.find((e) => e.id === "emp_01")!.materiasPrimas[mp]!.estoque;

describe("instalações", () => {
  test("ordem das teclas: fazendas, nova fazenda, fábricas, nova fábrica, loja", () => {
    const s = cenario();
    const v = visao(s);
    const faz = cadeia(v).fazendas.map((f) => f.id);
    expect(faz).toHaveLength(2);
    expect(instalacoes(v).map((i) => i.id)).toEqual([...faz.map(idDaFazenda), ID_NOVA_FAZENDA, ID_NOVA_FABRICA, ID_LOJA]);

    decidir(s, [{ tipo: "construirFabrica", produto: "sorvete" }]);
    s.jogar(1);
    const v2 = visao(s);
    const ids = instalacoes(v2).map((i) => i.id);
    expect(ids).toEqual([...faz.map(idDaFazenda), ID_NOVA_FAZENDA, idDaFabrica("sorvete"), ID_NOVA_FABRICA, ID_LOJA]);
    expect(instalacoes(v2).map((i) => i.coluna)).toEqual(["origem", "origem", "origem", "fabrica", "fabrica", "loja"]);
  });

  test("sem o módulo da cadeia não há instalações; a escolhida que sumiu cai na primeira", () => {
    const s = salaDeExemplo();
    expect(visao(s).visao.cadeia).toBeNull();
    expect(instalacoes(visao(s))).toEqual([]);
    const c = cenario();
    const v = visao(c);
    expect(instalacaoValida(v, "faz:nao_existe")).toBe(idDaFazenda(cadeia(v).fazendas[0]!.id));
    expect(instalacaoValida(v, ID_LOJA)).toBe(ID_LOJA);
    expect(instalacaoValida(v, "")).toBe(idDaFazenda(cadeia(v).fazendas[0]!.id));
  });
});

describe("decisões efetivas (vigentes + pendentes)", () => {
  test("cada tipo de pendência vale por cima do vigente, na ordem enviada", () => {
    const s = cenarioPronto();
    const v = visao(s);
    const [f1, f2] = cadeia(v).fazendas;
    const teto = cadeia(v).faixaDoAtacado.leite!.teto;
    const base = efetivasDaCadeia(v);
    expect(base.producaoDaFazenda).toEqual({ [f1!.id]: 6000, [f2!.id]: 3000 });
    expect(base.oferta.leite).toBeNull();
    expect(base.pedido.couro).toBeNull();

    const ef = efetivasDaCadeia(
      comPendentes(v, [
        { tipo: "ajustarFazenda", fazenda: f1!.id, producaoMensal: 111 },
        { tipo: "ajustarFazenda", fazenda: f1!.id, producaoMensal: 222 },
        { tipo: "construirFazenda", atividade: "frango" },
        { tipo: "ofertarNoAtacado", produto: "leite", preco: teto, quantidadeMensal: 500 },
        { tipo: "comprarNoAtacado", produto: "couro", vendedor: "emp_02", quantidadeMensal: 40 },
        { tipo: "venderParaCooperativa", produto: "leite", quantidade: 30 },
        { tipo: "venderParaCooperativa", produto: "leite", quantidade: 12 },
        { tipo: "trocarAtividade", fazenda: f2!.id, atividade: "frango", desova: "destruir" },
        { tipo: "construirFabrica", produto: "sorvete" },
      ]),
    );
    expect(ef.producaoDaFazenda[f1!.id]).toBe(222); // o último vale
    expect(ef.producaoDaFazenda[f2!.id]).toBe(3000);
    expect(ef.construcoes).toEqual([{ atividade: "frango", producaoMensal: null }]);
    expect(ef.oferta.leite).toEqual({ preco: teto, quantidadeMensal: 500 });
    expect(ef.pedido.couro).toEqual({ vendedor: "emp_02", quantidadeMensal: 40 });
    expect(ef.cooperativa.leite).toBe(42); // as ordens do mesmo dia somam
    expect(ef.trocas).toEqual({ [f2!.id]: "frango" });
    expect(ef.fabricasPendentes).toEqual({ sorvete: 1 });
  });

  test("quantidade 0 retira a oferta e cancela o pedido", () => {
    const s = cenarioPronto();
    const v = visao(s);
    const teto = cadeia(v).faixaDoAtacado.leite!.teto;
    const ef = efetivasDaCadeia(
      comPendentes(v, [
        { tipo: "ofertarNoAtacado", produto: "leite", preco: teto, quantidadeMensal: 500 },
        { tipo: "ofertarNoAtacado", produto: "leite", preco: teto, quantidadeMensal: 0 },
        { tipo: "comprarNoAtacado", produto: "couro", vendedor: "emp_02", quantidadeMensal: 40 },
        { tipo: "comprarNoAtacado", produto: "couro", vendedor: "emp_02", quantidadeMensal: 0 },
      ]),
    );
    expect(ef.oferta.leite).toBeNull();
    expect(ef.pedido.couro).toBeNull();
  });

  test("paridade com o motor: o que a tela mostra como efetivo é o que a visão traz no dia seguinte", () => {
    const s = cenarioPronto();
    const antes = visao(s);
    const f1 = cadeia(antes).fazendas[0]!.id;
    const teto = cadeia(antes).faixaDoAtacado.leite!.teto;
    decidir(s, [
      { tipo: "ajustarFazenda", fazenda: f1, producaoMensal: 4500 },
      { tipo: "ofertarNoAtacado", produto: "leite", preco: teto, quantidadeMensal: 1234 },
      { tipo: "comprarNoAtacado", produto: "couro", vendedor: "emp_02", quantidadeMensal: 321 },
      { tipo: "produto", produto: "carteira", origemInsumos: { couro: "propria" } },
      { tipo: "produto", produto: "carne_bovina_congelada", origemCompraPronta: "propria" },
    ]);
    const prevista = visao(s); // com as pendências na fila
    expect(prevista.pendentes).toHaveLength(5);
    const efPrevisto = efetivasDaCadeia(prevista);
    s.jogar(1);
    const depois = visao(s);
    expect(depois.pendentes).toEqual([]);
    const efReal = efetivasDaCadeia(depois);
    expect(efPrevisto.producaoDaFazenda).toEqual(efReal.producaoDaFazenda);
    expect(efPrevisto.oferta).toEqual(efReal.oferta);
    expect(efPrevisto.pedido).toEqual(efReal.pedido);
    expect(origemEfetiva(prevista, "carteira")).toEqual(origemEfetiva(depois, "carteira"));
    expect(origemEfetiva(prevista, "carne_bovina_congelada")).toEqual(origemEfetiva(depois, "carne_bovina_congelada"));
    expect(origemEfetiva(depois, "carteira")).toEqual({ insumos: { couro: "propria" }, compraPronta: "fornecedor" });
  });

  test("origem do insumo: voltar ao fornecedor sobrepõe a escolha anterior", () => {
    const s = cenarioPronto();
    decidir(s, [{ tipo: "produto", produto: "carteira", origemInsumos: { couro: "propria" } }]);
    s.jogar(1);
    const v = visao(s);
    expect(origemEfetiva(v, "carteira").insumos).toEqual({ couro: "propria" });
    const volta = comPendentes(v, [{ tipo: "produto", produto: "carteira", origemInsumos: { couro: "fornecedor" } }]);
    expect(origemEfetiva(volta, "carteira").insumos.couro).toBe("fornecedor");
    // O motor remove a escolha do estado quando volta ao fornecedor: a visão seguinte concorda.
    decidir(s, [{ tipo: "produto", produto: "carteira", origemInsumos: { couro: "fornecedor" } }]);
    s.jogar(1);
    expect(origemEfetiva(visao(s), "carteira").insumos.couro ?? "fornecedor").toBe("fornecedor");
  });
});

describe("estado das instalações", () => {
  test("em obra: dias que faltam; depois produzindo; sem produção quando a decisão é zero", () => {
    const s = cenario();
    const v = visao(s);
    const f = cadeia(v).fazendas[0]!;
    expect(f.emObra).toBe(true);
    const e = estadoDaFazenda(v, f);
    expect(e.classe).toBe("neutro");
    expect(e.texto).toBe(`em obra · ${f.operaDesdeTick - v.relogio.tick} d`);

    s.jogar(40);
    const pronta = visao(s);
    const fp = cadeia(pronta).fazendas[0]!;
    expect(estadoDaFazenda(pronta, fp)).toEqual({ classe: "ok", texto: "produzindo" });
    expect(estadoDaFazenda(pronta, fp, 0)).toEqual({ classe: "alerta", texto: "sem produção" });
  });

  test("estoque a 85% da capacidade ou mais: quase cheio; no teto: parada (erro); o nome só fica vermelho após 3 dias", () => {
    const s = cenarioPronto();
    const f = cadeia(visao(s)).fazendas.find((x) => x.atividade === "gado_leiteiro")!;
    const cap = materiaPrima(cadeia(visao(s)), "leite")!.capacidade;
    expect(cap).toBeGreaterThan(0);

    Object.assign(estoqueDe(s, "leite"), { quantidade: cap * 0.9, valor: 1000 });
    let v = visao(s);
    expect(fracaoDoEstoque(materiaPrima(cadeia(v), "leite")!)).toBeCloseTo(0.9, 9);
    expect(estadoDaFazenda(v, cadeia(v).fazendas.find((x) => x.id === f.id)!)).toEqual({ classe: "alerta", texto: "quase cheio" });

    Object.assign(estoqueDe(s, "leite"), { quantidade: cap, valor: 1000 });
    v = visao(s);
    const m = materiaPrima(cadeia(v), "leite")!;
    expect(estoqueCheio(m)).toBe(true);
    expect(estadoDaFazenda(v, cadeia(v).fazendas.find((x) => x.id === f.id)!)).toEqual({ classe: "erro", texto: "parada · cheio" });
    expect(estoqueEmAlerta(m)).toBe(false); // ainda não houve 3 dias seguidos

    s.jogar(3); // a produção para (estoque cheio) e o motor conta os dias
    const depois = materiaPrima(cadeia(visao(s)), "leite")!;
    expect(depois.diasCheio).toBeGreaterThanOrEqual(3);
    expect(estoqueEmAlerta(depois)).toBe(true);
  });

  test("conversão: dias que faltam, contados como o motor", () => {
    const s = cenarioPronto();
    const v0 = visao(s);
    const f = cadeia(v0).fazendas.find((x) => x.atividade === "gado_de_corte")!;
    const prazo = cadeia(v0).conversao.prazoDias;
    decidir(s, [{ tipo: "trocarAtividade", fazenda: f.id, atividade: "frango", desova: "destruir" }]);
    s.jogar(1);
    const v1 = visao(s);
    const convertida = cadeia(v1).fazendas.find((x) => x.id === f.id)!;
    expect(convertida.emConversao).toBe(true);
    expect(estadoDaFazenda(v1, convertida)).toEqual({ classe: "alerta", texto: `convertendo · ${prazo - 1} d` });
    // Passa o prazo: volta a produzir (produção mensal zerada pelo motor: "sem produção" até redefinir).
    s.jogar(prazo);
    const v2 = visao(s);
    const volta = cadeia(v2).fazendas.find((x) => x.id === f.id)!;
    expect(volta.emConversao).toBe(false);
    expect(volta.atividade).toBe("frango");
    expect(estadoDaFazenda(v2, volta)).toEqual({ classe: "alerta", texto: "sem produção" });
  });

  test("fábrica: dias de produção em estoque e estados (à mão)", () => {
    const o = { fabricasOperando: 1, fabricasEmObra: 0, capacidadeProducaoPorTick: 50, estoque: { quantidade: 200, valor: 0, qualidade: 50 } } as Parameters<typeof diasDeProducao>[0];
    expect(diasDeProducao(o)).toBe(4);
    expect(estadoDaFabrica(o, 1000)).toEqual({ classe: "ok", texto: "produzindo" });
    expect(estadoDaFabrica(o, 0)).toEqual({ classe: "alerta", texto: "sem produção" });
    const cheia = { ...o, estoque: { quantidade: 50 * DIAS_DE_REFERENCIA_DA_FABRICA, valor: 0, qualidade: 50 } };
    expect(estadoDaFabrica(cheia, 1000)).toEqual({ classe: "alerta", texto: "estoque alto" });
    const quase = { ...o, estoque: { quantidade: 50 * DIAS_DE_REFERENCIA_DA_FABRICA - 1, valor: 0, qualidade: 50 } };
    expect(estadoDaFabrica(quase, 1000).texto).toBe("produzindo");
    expect(estadoDaFabrica({ ...o, fabricasOperando: 0, fabricasEmObra: 1 }, 1000)).toEqual({ classe: "neutro", texto: "em obra" });
    expect(diasDeProducao({ ...o, capacidadeProducaoPorTick: 0 })).toBeNull();
  });
});

describe("troca de atividade: o que sai do estoque", () => {
  test("órfãos (à mão): carne e couro saem juntos; com outra fazenda de corte, nada sai", () => {
    const s = cenarioPronto();
    const c = cadeia(visao(s));
    const corte = c.fazendas.find((f) => f.atividade === "gado_de_corte")!;
    expect(orfaosDaTroca(c, corte.id, "frango")).toEqual(["carne_bovina_congelada", "couro"]);
    expect(orfaosDaTroca(c, corte.id, "gado_leiteiro")).toEqual(["carne_bovina_congelada", "couro"]); // o leite da outra não cobre a carne
    const leiteira = c.fazendas.find((f) => f.atividade === "gado_leiteiro")!;
    expect(orfaosDaTroca(c, leiteira.id, "frango")).toEqual(["leite"]);
    expect(orfaosDaTroca(c, leiteira.id, "gado_leiteiro")).toEqual([]); // a mesma atividade mantém o que produz
    expect(orfaosDaTroca(c, "faz_inexistente", "frango")).toEqual([]);
    expect(orfaosDaTroca(c, corte.id, "atividade_inexistente")).toEqual([]);
  });

  test("com duas fazendas de corte, trocar uma não deixa órfão", () => {
    const s = cenarioPronto();
    decidir(s, [{ tipo: "construirFazenda", atividade: "gado_de_corte" }]);
    s.jogar(35);
    const c = cadeia(visao(s));
    const cortes = c.fazendas.filter((f) => f.atividade === "gado_de_corte");
    expect(cortes).toHaveLength(2);
    expect(orfaosDaTroca(c, cortes[0]!.id, "frango")).toEqual([]);
    expect(estoqueQueSai(c, cortes[0]!.id, "frango")).toEqual([]);
  });

  test("paridade com o motor: o estoque que a tela diz que sai é o que some, e só ele", () => {
    const s = cenarioPronto();
    Object.assign(estoqueDe(s, "leite"), { quantidade: 500, valor: 50_000, qualidade: 60 });
    Object.assign(estoqueDe(s, "carne_bovina_congelada"), { quantidade: 300, valor: 30_000, qualidade: 60 });
    Object.assign(estoqueDe(s, "couro"), { quantidade: 150, valor: 15_000, qualidade: 60 });
    const c = cadeia(visao(s));
    const corte = c.fazendas.find((f) => f.atividade === "gado_de_corte")!;
    const previsto = estoqueQueSai(c, corte.id, "gado_leiteiro");
    expect(previsto.map((i) => [i.produto, i.quantidade])).toEqual([
      ["carne_bovina_congelada", 300],
      ["couro", 150],
    ]);

    decidir(s, [{ tipo: "trocarAtividade", fazenda: corte.id, atividade: "gado_leiteiro", desova: "destruir" }]);
    s.jogar(1);
    expect(estoqueDe(s, "carne_bovina_congelada").quantidade).toBe(0);
    expect(estoqueDe(s, "couro").quantidade).toBe(0);
    expect(estoqueDe(s, "leite").quantidade).toBeGreaterThanOrEqual(500); // o leite ficou (e a leiteira segue produzindo)
  });

  test("valor da desova (à mão): cooperativa ao piso, atacado ao fator do preço do fornecedor, destruição pelo descarte", () => {
    const fake = {
      materiasPrimas: [{ produto: "leite", precoCooperativa: 180, precoFornecedor: 300 }],
      descarte: { custoPorUnidade: 7 },
    } as unknown as VisaoDaCadeia;
    const itens = [{ produto: "leite", nome: "Leite", unidade: "L", quantidade: 100.5 }];
    expect(valorDaDesova(fake, itens, "cooperativa", 0.6)).toBe(18_090); // 100,5 × 180
    expect(valorDaDesova(fake, itens, "atacado", 0.8)).toBe(24_120); // 100,5 × round(300 × 0,8) = 100,5 × 240
    expect(valorDaDesova(fake, itens, "destruir", 0.8)).toBe(-704); // 100,5 × 7 = 703,5 → 704, saindo do caixa
    expect(valorDaDesova(fake, [], "cooperativa", 0.6)).toBe(0);
  });
});

describe("atacado e fios", () => {
  test("matérias-primas do atacado são as que alguma atividade produz; ofertas dos outros em ordem de preço", () => {
    const s = cenarioPronto();
    const c = cadeia(visao(s));
    expect(materiasDoAtacado(c).map((m) => m.produto)).toEqual(["acucar", "carne_bovina_congelada", "couro", "frango_congelado", "leite", "morango"]);
    const outras = { ...c, atacado: [
      { vendedor: "emp_03", produto: "leite", preco: 250, quantidadeMensal: 10, qualidade: 50 },
      { vendedor: "emp_02", produto: "leite", preco: 250, quantidadeMensal: 20, qualidade: 55 },
      { vendedor: "emp_02", produto: "couro", preco: 100, quantidadeMensal: 5, qualidade: 55 },
      { vendedor: "emp_04", produto: "leite", preco: 200, quantidadeMensal: 30, qualidade: 45 },
    ] };
    expect(ofertasDosOutros(outras, "leite").map((o) => o.vendedor)).toEqual(["emp_04", "emp_02", "emp_03"]); // preço e, no empate, vendedor
  });

  test("fios: fazenda → fábrica só com origem própria; fábrica → loja só se vende amanhã", () => {
    const s = cenarioPronto();
    decidir(s, [
      { tipo: "construirFabrica", produto: "sorvete" },
      { tipo: "produto", produto: "sorvete", origemInsumos: { leite: "propria" }, preco: 900 },
    ]);
    s.jogar(70); // a fábrica fica pronta
    const v = visao(s);
    expect(cadeia(v).fazendas.length).toBe(2);
    const leiteira = cadeia(v).fazendas.find((f) => f.atividade === "gado_leiteiro")!;
    const fios = ligacoes(v);
    expect(fios).toContainEqual({
      de: ponta(idDaFazenda(leiteira.id), "leite"),
      para: ponta(idDaFabrica("sorvete"), "leite"),
      instalacoes: [idDaFazenda(leiteira.id), idDaFabrica("sorvete")],
    });
    expect(fios).toContainEqual({ de: ponta(idDaFabrica("sorvete"), "sorvete"), para: ponta(ID_LOJA, "sorvete"), instalacoes: [idDaFabrica("sorvete"), ID_LOJA] });
    // Morango e açúcar do sorvete vêm do fornecedor (nenhuma fazenda de morango): sem fio.
    expect(fios.filter((f) => f.para.startsWith(idDaFabrica("sorvete") + "|"))).toHaveLength(1);

    // Voltando o leite ao fornecedor, o fio da fazenda some.
    const volta = comPendentes(v, [{ tipo: "produto", produto: "sorvete", origemInsumos: { leite: "fornecedor" } }]);
    expect(ligacoes(volta).some((f) => f.para.startsWith(idDaFabrica("sorvete") + "|"))).toBe(false);
    // Fora de venda, o fio da fábrica para a loja some.
    const fora = comPendentes(v, [{ tipo: "produto", produto: "sorvete", preco: null }]);
    expect(ligacoes(fora).some((f) => f.para === ponta(ID_LOJA, "sorvete"))).toBe(false);
  });
});

describe("linha de evolução e células", () => {
  test("células acesas: arredonda e fica entre 0 e 14", () => {
    expect([0, 0.5, 1, 1.7, -3].map(celulasAcesas)).toEqual([0, 7, 14, 14, 0]);
    expect(celulasAcesas(10 / 14)).toBe(10);
  });

  test("pontos da série (à mão): a mais recente à direita; 1 no teto, 0 na base", () => {
    expect(pontosDaSerie([])).toEqual([]);
    const passo = 120 / 29;
    const pts = pontosDaSerie([0, 0.5, 1]);
    expect(pts).toHaveLength(3);
    expect(pts[2]).toEqual([120, 1]); // 100% → perto do teto (y = 16 − 1 − 14)
    expect(pts[1]![0]).toBeCloseTo(120 - passo, 9);
    expect(pts[1]![1]).toBe(8); // 50% → 15 − 7
    expect(pts[0]![0]).toBeCloseTo(120 - 2 * passo, 9);
    expect(pts[0]![1]).toBe(15); // 0% → base
  });

  test("a linha guarda no máximo 30 dias", () => {
    const serie = Array.from({ length: 45 }, (_, k) => (k % 10) / 10);
    expect(pontosDaSerie(serie)).toHaveLength(30);
    expect(pontosDaSerie(serie)[0]![0]).toBeCloseTo(0, 9);
  });
});
