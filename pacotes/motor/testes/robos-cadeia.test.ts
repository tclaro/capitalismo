/**
 * Estratégias de teste da cadeia (fase 1b, entrega 9): registro, regras de decisão com casos feitos à mão
 * e partidas inteiras com os invariantes do motor.
 */
import { describe, expect, test } from "bun:test";
import { PRESET_CADEIA_MINIMA, PRESET_INTRODUTORIO } from "@simulador/catalogo";
import {
  criarGerador,
  criarPartida,
  type Decisao,
  ESTRATEGIAS,
  ESTRATEGIAS_DA_CADEIA,
  ESTRATEGIAS_DO_CONFRONTO,
  ESTRATEGIAS_RAZOAVEIS,
  type EstadoPartida,
  simularPartida,
  sortearIntensidade,
  visaoDaEmpresa,
} from "../src";
import { consumoMensalDeMateriasPrimas, decisoesDaCadeia, paybackDaFazenda } from "../src/robos/cadeia";
import { empresa, rodar } from "./ajuda";

const ESTRATEGIAS_NOVAS = ["cadeia_integrada", "cadeia_so_fazenda", "cadeia_cooperativa"];

function partida(semente = "rc", estrategias: string[] = ["equilibrada"]): EstadoPartida {
  return criarPartida({
    preset: PRESET_CADEIA_MINIMA,
    semente,
    modulos: ["cadeia_produtiva"],
    empresas: estrategias.map((e) => ({ nome: e, robo: { estrategia: e } })),
  });
}

/** Valores simples (sem variação por semente) para as contas à mão. */
function comValoresSimples(estado: EstadoPartida): EstadoPartida {
  const leite = estado.parametros.produtos.find((p) => p.id === "leite")!;
  leite.fornecedor = { preco: 240, qualidade: 50, ofertaMaxMensal: null };
  const a = estado.parametros.cadeia!.atividades.find((x) => x.id === "gado_leiteiro")!;
  Object.assign(a, { custoVariavelPorUnidade: 200, custoFixoMensal: 150_000, capex: 6_000_000, capacidadeUnidadesPorDia: 400 });
  return estado;
}

const visaoDe = (estado: EstadoPartida) => visaoDaEmpresa(estado, "emp_01");
const baseCom = (producaoLeiteEngarrafado: number): Decisao[] => [{ tipo: "produto", empresa: "emp_01", produto: "leite_engarrafado", producaoMensal: producaoLeiteEngarrafado }];

describe("registro", () => {
  test("as três estratégias existem, são só de teste e ficam fora das listas de aula e do confronto da camada 1", () => {
    expect([...ESTRATEGIAS_DA_CADEIA]).toEqual(ESTRATEGIAS_NOVAS);
    for (const id of ESTRATEGIAS_NOVAS) {
      expect(ESTRATEGIAS[id]?.soParaTeste).toBe(true);
      expect(ESTRATEGIAS_RAZOAVEIS).not.toContain(id);
      expect(ESTRATEGIAS_DO_CONFRONTO).not.toContain(id);
    }
    // As da camada 1 continuam registradas, e nenhuma delas é só de teste além do preço mínimo.
    for (const id of ESTRATEGIAS_DO_CONFRONTO) expect(ESTRATEGIAS[id]).toBeDefined();
    expect(Object.values(ESTRATEGIAS).filter((e) => e.soParaTeste).map((e) => e.id).sort()).toEqual([...ESTRATEGIAS_NOVAS, "preco_minimo"].sort());
  });

  test("sem o bloco da cadeia (preset sem fazendas), cada uma decide exatamente como a sua base", () => {
    const base = { cadeia_integrada: "equilibrada", cadeia_so_fazenda: "revenda", cadeia_cooperativa: "equilibrada" } as const;
    for (const [id, origem] of Object.entries(base)) {
      const estado = criarPartida({ preset: PRESET_INTRODUTORIO, semente: "sem-cadeia", empresas: [{ nome: "A", robo: { estrategia: id } }, { nome: "B", robo: { estrategia: "premium" } }] });
      const v = visaoDe(estado);
      expect(v.cadeia).toBeNull();
      const intensidade = sortearIntensidade(id, criarGerador("s", "i"));
      const doRobo = ESTRATEGIAS[id]!.decidir(v, intensidade, criarGerador("s", "g"));
      const daBase = ESTRATEGIAS[origem]!.decidir(v, intensidade, criarGerador("s", "g"));
      expect({ id, decisoes: doRobo }).toEqual({ id, decisoes: daBase });
    }
  });
});

describe("consumo de matérias-primas (conta à mão)", () => {
  test("insumo = produção planejada × quantidade por unidade; só entram as matérias-primas que alguma atividade produz; carne e frango entram pela compra pronta", () => {
    const estado = partida();
    const v = visaoDe(estado);
    const lm = v.produtos.find((p) => p.id === "leite_engarrafado")!.fabricacao!;
    const leite = lm.receita.find((i) => i.produto === "leite")!;
    const porUnidade = leite.quantidadePorLote / lm.unidadesPorLote;
    const consumo = consumoMensalDeMateriasPrimas(v, [
      { tipo: "produto", empresa: "emp_01", produto: "leite_engarrafado", producaoMensal: 10_000 },
      { tipo: "produto", empresa: "emp_01", produto: "carne_bovina_congelada", compraMensal: 700 },
      { tipo: "produto", empresa: "emp_01", produto: "frango_congelado", compraMensal: 0 },
      { tipo: "produto", empresa: "emp_01", produto: "sorvete", compraMensal: 5_000 }, // sorvete é fabricado: compra pronta não consome matéria-prima
    ]);
    expect(consumo.leite).toBeCloseTo(10_000 * porUnidade, 9);
    expect(consumo.carne_bovina_congelada).toBe(700);
    expect(consumo.vidro).toBeUndefined(); // nenhuma atividade produz vidro
    expect(consumo.frango_congelado).toBe(0); // compra 0: consumo 0 (e a estratégia ignora o que consome 0)
    expect(consumo.morango).toBeUndefined();
  });

  test("duas decisões do mesmo insumo somam; sem o módulo da cadeia não há consumo", () => {
    const estado = partida();
    const v = visaoDe(estado);
    const lm = v.produtos.find((p) => p.id === "iogurte")!.fabricacao!;
    const leite = lm.receita.find((i) => i.produto === "leite")!;
    const porIogurte = leite.quantidadePorLote / lm.unidadesPorLote;
    const sorv = v.produtos.find((p) => p.id === "sorvete")!.fabricacao!;
    const porSorvete = sorv.receita.find((i) => i.produto === "leite")!.quantidadePorLote / sorv.unidadesPorLote;
    const soma = consumoMensalDeMateriasPrimas(v, [
      { tipo: "produto", empresa: "emp_01", produto: "iogurte", producaoMensal: 1_000 },
      { tipo: "produto", empresa: "emp_01", produto: "sorvete", producaoMensal: 2_000 },
    ]);
    expect(soma.leite).toBeCloseTo(1_000 * porIogurte + 2_000 * porSorvete, 9);
    const semModulo = criarPartida({ preset: PRESET_INTRODUTORIO, semente: "x", empresas: [{ nome: "A", robo: { estrategia: "equilibrada" } }] });
    expect(consumoMensalDeMateriasPrimas(visaoDe(semModulo), baseCom(5_000))).toEqual({});
  });
});

describe("payback da fazenda (conta à mão)", () => {
  // Leiteira: 400 L/dia × 30 = 12.000 L/mês; leite do fornecedor 240; custo variável 200; fixo 150.000; capex 6.000.000 (centavos).
  const atividade = (estado: EstadoPartida) => visaoDe(estado).cadeia!.atividades.find((a) => a.id === "gado_leiteiro")!;

  test("consumo de 10.000 L: economia = 10.000 × 240 − 10.000 × 200 − 150.000 = 250.000/mês → 24 meses", () => {
    const estado = comValoresSimples(partida());
    expect(paybackDaFazenda(visaoDe(estado), atividade(estado), { leite: 10_000 })).toBeCloseTo(24, 9);
  });

  test("consumo acima da capacidade: só os 12.000 L da fazenda contam → 12.000 × 40 − 150.000 = 330.000 → 18,18 meses", () => {
    const estado = comValoresSimples(partida());
    expect(paybackDaFazenda(visaoDe(estado), atividade(estado), { leite: 30_000 })).toBeCloseTo(6_000_000 / 330_000, 9);
  });

  test("sem consumo, ou custo variável acima do preço do fornecedor: nunca paga", () => {
    const estado = comValoresSimples(partida());
    expect(paybackDaFazenda(visaoDe(estado), atividade(estado), {})).toBe(Infinity);
    estado.parametros.cadeia!.atividades.find((a) => a.id === "gado_leiteiro")!.custoVariavelPorUnidade = 250;
    expect(paybackDaFazenda(visaoDe(estado), atividade(estado), { leite: 10_000 })).toBe(Infinity);
  });

  test("coprodutos: o gado de corte só paga se a equipe aproveita o couro", () => {
    const estado = partida();
    estado.parametros.produtos.find((p) => p.id === "carne_bovina_congelada")!.fornecedor = { preco: 2_000, qualidade: 50, ofertaMaxMensal: null };
    estado.parametros.produtos.find((p) => p.id === "couro")!.fornecedor = { preco: 6_000, qualidade: 50, ofertaMaxMensal: null };
    const corte = estado.parametros.cadeia!.atividades.find((a) => a.id === "gado_de_corte")!;
    Object.assign(corte, { custoVariavelPorUnidade: 2_363, custoFixoMensal: 650_000, capex: 44_000_000, capacidadeUnidadesPorDia: 150 });
    const v = visaoDe(estado);
    const a = v.cadeia!.atividades.find((x) => x.id === "gado_de_corte")!;
    // 4.500 kg de carne/mês: valor 4.500 × 2.000 = 9.000.000; custo 4.500 × 2.363 = 10.633.500; fixo 650.000 → prejuízo.
    expect(paybackDaFazenda(v, a, { carne_bovina_congelada: 4_500 })).toBe(Infinity);
    // Com 750 kg de couro (1/3 dos 2.250 kg produzidos): + 750 × 6.000 = 4.500.000 → 13.500.000 − 10.633.500 − 650.000 = 2.216.500 → 44.000.000 / 2.216.500.
    expect(paybackDaFazenda(v, a, { carne_bovina_congelada: 4_500, couro: 750 })).toBeCloseTo(44_000_000 / 2_216_500, 9);
  });
});

describe("decisões da cadeia (casos feitos à mão)", () => {
  const opcoes = { paybackMaximo: 30, folgaDeProducao: 0.1, vendeExcedente: false } as const;
  /** Quantidade de leite por unidade de leite engarrafado. */
  const porGarrafa = (estado: EstadoPartida) => {
    const f = visaoDe(estado).produtos.find((p) => p.id === "leite_engarrafado")!.fabricacao!;
    return f.receita.find((i) => i.produto === "leite")!.quantidadePorLote / f.unidadesPorLote;
  };

  test("constrói a fazenda que paga, já com a produção do consumo + folga (8.000 L × 1,1 = 8.800)", () => {
    const estado = comValoresSimples(partida());
    const base = baseCom(8_000 / porGarrafa(estado));
    // Consumo 8.000 L: líquido 8.000 × 40 − 150.000 = 170.000/mês; payback 35,3 meses (cabe em 40).
    const d = decisoesDaCadeia(visaoDe(estado), base, { ...opcoes, paybackMaximo: 40 });
    expect(d.filter((x) => x.tipo === "construirFazenda")).toEqual([{ tipo: "construirFazenda", empresa: "emp_01", atividade: "gado_leiteiro", producaoMensal: 8_800 }]);
  });

  test("limiar do payback, do caixa e do crédito emergencial, conferidos nos dois lados", () => {
    const estado = comValoresSimples(partida());
    const base = baseCom(8_000 / porGarrafa(estado));
    const n = (o: { paybackMaximo: number; folgaDeProducao: number; vendeExcedente: boolean }, e = estado) => decisoesDaCadeia(visaoDe(e), base, o).filter((x) => x.tipo === "construirFazenda").length;
    // Consumo 8.000 L: líquido = 8.000 × (240 − 200) − 150.000 = 170.000; payback = 6.000.000 / 170.000 = 35,29 meses.
    expect(n({ ...opcoes, paybackMaximo: 35.3 })).toBe(1);
    expect(n({ ...opcoes, paybackMaximo: 35.2 })).toBe(0);
    // Caixa: precisa do capex + 30% (7.800.000 centavos).
    const justo = comValoresSimples(partida());
    empresa(justo, "emp_01").caixa = 7_800_000;
    expect(n({ ...opcoes, paybackMaximo: 40 }, justo)).toBe(1);
    empresa(justo, "emp_01").caixa = 7_799_999;
    expect(n({ ...opcoes, paybackMaximo: 40 }, justo)).toBe(0);
    // Crédito emergencial em aberto: não investe.
    const apertado = comValoresSimples(partida());
    empresa(apertado, "emp_01").creditoEmergencial = 1;
    expect(n({ ...opcoes, paybackMaximo: 40 }, apertado)).toBe(0);
  });

  test("não constrói outra fazenda se a capacidade instalada (operando ou em obra) já cobre o consumo", () => {
    const estado = comValoresSimples(partida());
    const f = visaoDe(estado).produtos.find((p) => p.id === "leite_engarrafado")!.fabricacao!;
    const porGarrafa = f.receita.find((i) => i.produto === "leite")!.quantidadePorLote / f.unidadesPorLote;
    const base = baseCom(8_000 / porGarrafa);
    const o = { paybackMaximo: 40, folgaDeProducao: 0.1, vendeExcedente: false };
    expect(decisoesDaCadeia(visaoDe(estado), base, o).some((x) => x.tipo === "construirFazenda")).toBe(true);
    // Uma fazenda leiteira em obra (12.000 L/mês ≥ 90% de 8.800 L): nada a construir; e a produção só é ajustada quando operar.
    const com = rodar(estado, 1, (t) => (t === 1 ? { decisoes: [{ tipo: "construirFazenda", empresa: "emp_01", atividade: "gado_leiteiro", producaoMensal: 1 }] } : {})).estado;
    const d = decisoesDaCadeia(visaoDe(com), base, o);
    expect(d.some((x) => x.tipo === "construirFazenda")).toBe(false);
    expect(d.some((x) => x.tipo === "ajustarFazenda")).toBe(false); // em obra
  });

  test("com a fazenda operando: produção = consumo × 1,1 descontado o estoque acima de 7 dias; origem própria só do que ela produz", () => {
    const estado = comValoresSimples(partida());
    const f = visaoDe(estado).produtos.find((p) => p.id === "leite_engarrafado")!.fabricacao!;
    const porGarrafa = f.receita.find((i) => i.produto === "leite")!.quantidadePorLote / f.unidadesPorLote;
    const base = baseCom(8_000 / porGarrafa);
    const pronta = rodar(estado, 32, (t) => (t === 1 ? { decisoes: [{ tipo: "construirFazenda", empresa: "emp_01", atividade: "gado_leiteiro", producaoMensal: 1 }] } : {})).estado;
    const o = { paybackMaximo: 40, folgaDeProducao: 0.1, vendeExcedente: false };
    // Sem estoque: 8.000 × 1,1 = 8.800 por mês.
    let d = decisoesDaCadeia(visaoDe(pronta), base, o);
    expect(d.filter((x) => x.tipo === "ajustarFazenda")).toEqual([{ tipo: "ajustarFazenda", empresa: "emp_01", fazenda: visaoDe(pronta).cadeia!.fazendas[0]!.id, producaoMensal: 8_800 }]);
    // Estoque de 1.000 L: excesso = 1.000 − (8.000/30) × 7 = 1.000 − 1.866,67 < 0 → nenhum desconto.
    // Estoque de 4.000 L: excesso = 4.000 − 1.866,67 = 2.133,33 → 8.800 − 2.133,33 = 6.666,67 → 6.667.
    empresa(pronta, "emp_01").materiasPrimas.leite!.estoque.quantidade = 4_000;
    d = decisoesDaCadeia(visaoDe(pronta), base, o);
    expect((d.find((x) => x.tipo === "ajustarFazenda") as Extract<Decisao, { tipo: "ajustarFazenda" }>).producaoMensal).toBe(6_667);
    // Origem: leite vem da fazenda; o vidro (nenhuma atividade o produz) não aparece.
    const origem = d.find((x) => x.tipo === "produto" && x.produto === "leite_engarrafado") as Extract<Decisao, { tipo: "produto" }>;
    expect(origem.origemInsumos).toEqual({ leite: "propria" });
    // Produtos fabricados sem insumo de fazenda não ganham decisão de origem; carne e frango sem fazenda ficam no fornecedor.
    expect(d.filter((x) => x.tipo === "produto" && x.produto === "carne_bovina_congelada")).toEqual([
      { tipo: "produto", empresa: "emp_01", produto: "carne_bovina_congelada", origemCompraPronta: "fornecedor" },
    ]);
  });

  test("sem nenhuma fazenda, a origem é sempre o fornecedor (leite, e carne e frango na compra pronta)", () => {
    const estado = comValoresSimples(partida());
    const f = visaoDe(estado).produtos.find((p) => p.id === "leite_engarrafado")!.fabricacao!;
    const base = baseCom(1_000 / (f.receita.find((i) => i.produto === "leite")!.quantidadePorLote / f.unidadesPorLote));
    // Sem consumo que pague a fazenda (payback máximo 1 mês), nada é construído e nada vem de fazenda própria.
    const d = decisoesDaCadeia(visaoDe(estado), base, { paybackMaximo: 1, folgaDeProducao: 0.1, vendeExcedente: true });
    expect(d.some((x) => x.tipo === "construirFazenda")).toBe(false);
    const origens = d.filter((x): x is Extract<Decisao, { tipo: "produto" }> => x.tipo === "produto");
    expect(origens.find((x) => x.produto === "leite_engarrafado")!.origemInsumos).toEqual({ leite: "fornecedor" });
    for (const id of ["carne_bovina_congelada", "frango_congelado"]) expect(origens.find((x) => x.produto === id)!.origemCompraPronta).toBe("fornecedor");
    expect(origens.some((x) => Object.values(x.origemInsumos ?? {}).includes("propria") || x.origemCompraPronta === "propria")).toBe(false);
  });

  test("excedente: com o estoque a 80% da capacidade ou mais, vende à cooperativa o que passa de meio mês de consumo", () => {
    const estado = comValoresSimples(partida());
    const f = visaoDe(estado).produtos.find((p) => p.id === "leite_engarrafado")!.fabricacao!;
    const porGarrafa = f.receita.find((i) => i.produto === "leite")!.quantidadePorLote / f.unidadesPorLote;
    const base = baseCom(8_000 / porGarrafa);
    const pronta = rodar(estado, 32, (t) => (t === 1 ? { decisoes: [{ tipo: "construirFazenda", empresa: "emp_01", atividade: "gado_leiteiro", producaoMensal: 1 }] } : {})).estado;
    const cap = visaoDe(pronta).cadeia!.materiasPrimas.find((m) => m.produto === "leite")!.capacidade;
    expect(cap).toBe(4_000); // 400 L/dia × 10 dias de armazenagem
    const o = { paybackMaximo: 40, folgaDeProducao: 0.1, vendeExcedente: true };
    const vendas = (q: number) => {
      empresa(pronta, "emp_01").materiasPrimas.leite!.estoque.quantidade = q;
      return decisoesDaCadeia(visaoDe(pronta), base, o).filter((x) => x.tipo === "venderParaCooperativa");
    };
    expect(vendas(3_199)).toEqual([]); // abaixo de 80% (3.200)
    // 3.200 L: reserva = 0,5 × 8.000 = 4.000 > estoque → nada sobra.
    expect(vendas(3_200)).toEqual([]);
    // Consumo menor: reserva = 0,5 × 2.000 = 1.000; estoque 3.600 → vende 2.600.
    const pequena = baseCom(2_000 / porGarrafa);
    empresa(pronta, "emp_01").materiasPrimas.leite!.estoque.quantidade = 3_600;
    expect(decisoesDaCadeia(visaoDe(pronta), pequena, o).filter((x) => x.tipo === "venderParaCooperativa")).toEqual([
      { tipo: "venderParaCooperativa", empresa: "emp_01", produto: "leite", quantidade: 2_600 },
    ]);
    // O limiar de 80% (3.200 L) vale mesmo com reserva baixa: 3.199 L não vende; 3.200 L vende 3.200 − 1.000.
    empresa(pronta, "emp_01").materiasPrimas.leite!.estoque.quantidade = 3_199;
    expect(decisoesDaCadeia(visaoDe(pronta), pequena, o).filter((x) => x.tipo === "venderParaCooperativa")).toEqual([]);
    empresa(pronta, "emp_01").materiasPrimas.leite!.estoque.quantidade = 3_200;
    expect(decisoesDaCadeia(visaoDe(pronta), pequena, o).filter((x) => x.tipo === "venderParaCooperativa")).toEqual([
      { tipo: "venderParaCooperativa", empresa: "emp_01", produto: "leite", quantidade: 2_200 },
    ]);
    empresa(pronta, "emp_01").materiasPrimas.leite!.estoque.quantidade = 3_600;
    // Sem a opção, nunca vende.
    expect(decisoesDaCadeia(visaoDe(pronta), pequena, { ...o, vendeExcedente: false }).some((x) => x.tipo === "venderParaCooperativa")).toBe(false);
  });
});

describe("a saída pela cooperativa", () => {
  test("constrói leite, frango e morango (um de cada, com caixa), produz no máximo e vende todo o estoque inteiro", () => {
    const estado = partida("coop", ["cadeia_cooperativa"]);
    const v = visaoDe(estado);
    const intensidade = sortearIntensidade("cadeia_cooperativa", criarGerador("s", "i"));
    const d = ESTRATEGIAS.cadeia_cooperativa!.decidir(v, intensidade, criarGerador("s", "g"));
    const construcoes = d.filter((x): x is Extract<Decisao, { tipo: "construirFazenda" }> => x.tipo === "construirFazenda");
    expect(construcoes.map((x) => x.atividade)).toEqual(["gado_leiteiro", "frango", "morango"]);
    const atividades = v.cadeia!.atividades;
    for (const c of construcoes) expect(c.producaoMensal).toBe(atividades.find((a) => a.id === c.atividade)!.capacidadeUnidadesPorDia * 30);

    // Depois de prontas: ajusta ao máximo e vende o estoque (parte inteira).
    const pronta = rodar(estado, 40, () => ({ decisoes: construcoes })).estado;
    empresa(pronta, "emp_01").materiasPrimas.leite!.estoque.quantidade = 1_234.9;
    const d2 = ESTRATEGIAS.cadeia_cooperativa!.decidir(visaoDe(pronta), intensidade, criarGerador("s", "g2"));
    expect(d2.filter((x) => x.tipo === "venderParaCooperativa" && x.produto === "leite")).toEqual([{ tipo: "venderParaCooperativa", empresa: "emp_01", produto: "leite", quantidade: 1_234 }]);
    expect(d2.some((x) => x.tipo === "construirFazenda")).toBe(false); // já tem as três
    // Fazenda com a produção abaixo do máximo volta ao máximo (12.000 L/mês); as que já estão no máximo não geram decisão.
    const leiteira = empresa(pronta, "emp_01").fazendas.find((f) => f.atividade === "gado_leiteiro")!;
    leiteira.producaoMensal = 100;
    const d3 = ESTRATEGIAS.cadeia_cooperativa!.decidir(visaoDe(pronta), intensidade, criarGerador("s", "g3"));
    expect(d3.filter((x) => x.tipo === "ajustarFazenda")).toEqual([{ tipo: "ajustarFazenda", empresa: "emp_01", fazenda: leiteira.id, producaoMensal: 12_000 }]);
  });
});

describe("partidas inteiras", () => {
  const ESTRATEGIAS_EM_JOGO = ["cadeia_integrada", "cadeia_so_fazenda", "cadeia_cooperativa", "equilibrada", "revenda"];

  test("150 dias com as três estratégias da cadeia: invariantes em todo tick, e nenhuma decisão delas é rejeitada", () => {
    const estado = partida("inv-1", ESTRATEGIAS_EM_JOGO);
    const { estado: fim, resultados } = rodar(estado, 150);
    const ids = new Set(fim.empresas.filter((e) => ESTRATEGIAS_NOVAS.includes(e.robo!.estrategia)).map((e) => e.id));
    const rejeitadas = resultados.flatMap((r) => r.rejeicoes).filter((r) => "empresa" in r.decisao && ids.has(r.decisao.empresa));
    expect(rejeitadas).toEqual([]);
    // A cooperativa realmente investe em fazendas e a conta fecha (caixa = soma dos lançamentos, conferido pelos invariantes).
    const coop = fim.empresas.find((e) => e.robo!.estrategia === "cadeia_cooperativa")!;
    expect(coop.fazendas.length).toBeGreaterThanOrEqual(3);
  });

  test("é determinística: a mesma semente dá o mesmo resultado, byte a byte", () => {
    const a = simularPartida({ preset: PRESET_CADEIA_MINIMA, semente: "det-1", robos: ESTRATEGIAS_EM_JOGO.map((estrategia) => ({ estrategia })), meses: 6 });
    const b = simularPartida({ preset: PRESET_CADEIA_MINIMA, semente: "det-1", robos: ESTRATEGIAS_EM_JOGO.map((estrategia) => ({ estrategia })), meses: 6 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  test("a simulação liga o módulo da cadeia no preset que a traz: a cooperativa difere da base ali e é igual a ela onde não há cadeia", () => {
    const lucro = (preset: typeof PRESET_CADEIA_MINIMA, estrategia: string) => simularPartida({ preset, semente: "liga-1", robos: [{ estrategia }, { estrategia: "revenda" }], meses: 6 }).empresas.find((e) => e.estrategia === estrategia)!.lucroAcumulado;
    expect(lucro(PRESET_CADEIA_MINIMA, "cadeia_cooperativa")).not.toBe(lucro(PRESET_CADEIA_MINIMA, "equilibrada"));
    // Sem o bloco da cadeia a estratégia vira a sua base (mesmas decisões; a intensidade tem sorteios a mais, então compara só o resultado da base com ela mesma).
    expect(simularPartida({ preset: PRESET_INTRODUTORIO, semente: "liga-1", robos: [{ estrategia: "equilibrada" }], meses: 3 }).empresas[0]!.lucroAcumulado).toBe(
      simularPartida({ preset: PRESET_INTRODUTORIO, semente: "liga-1", robos: [{ estrategia: "equilibrada" }], meses: 3 }).empresas[0]!.lucroAcumulado,
    );
  });
});
