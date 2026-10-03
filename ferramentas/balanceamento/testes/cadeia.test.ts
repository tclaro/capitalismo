/**
 * Balanceamento da cadeia (fase 1b, entrega 9): confronto, variações do preset, indicadores e critérios
 * relativos, economia das atividades. Contas à mão onde há número.
 */
import { describe, expect, test } from "bun:test";
import { PRESET_CADEIA_MINIMA, PRESET_INTRODUTORIO } from "@simulador/catalogo";
import { ESTRATEGIAS_DA_CADEIA, ESTRATEGIAS_DO_CONFRONTO, type Preset, simularPartida } from "@simulador/motor";
import { aplicarAjustes } from "../src/ajustes";
import { CAMINHOS_UTEIS, criteriosDaCadeia, economiaDasAtividades, indicadoresDaCadeia, LIMITES_DA_CADEIA, tabelaDeEconomia } from "../src/cadeia";
import { lerArgumentos } from "../src/cli";
import { robosDoConfronto, sementeDaPartida, TIPOS_CONFRONTO } from "../src/confronto";
import { executarLote } from "../src/execucao";
import type { Metricas, MetricaEstrategia } from "../src/metricas";
import { relatorioMarkdown } from "../src/relatorio";

describe("confronto da cadeia", () => {
  test("as 7 estratégias da camada 1 e os três caminhos da cadeia, em ordem fixa", () => {
    expect(robosDoConfronto("cadeia", "x").map((r) => r.estrategia)).toEqual([...ESTRATEGIAS_DO_CONFRONTO, ...ESTRATEGIAS_DA_CADEIA]);
    expect(robosDoConfronto("cadeia", "x")).toHaveLength(10);
  });

  test("o 'completo' inclui o confronto da cadeia só nos presets que trazem o bloco da cadeia", () => {
    expect(lerArgumentos(["--preset", "cadeia/minima"], 4).confrontos).toEqual([...TIPOS_CONFRONTO, "cadeia"]);
    expect(lerArgumentos(["--preset", "introdutorio/padrao"], 4).confrontos).toEqual([...TIPOS_CONFRONTO]);
    expect(lerArgumentos(["--preset", "cadeia/minima", "--confronto", "cadeia"], 4).confrontos).toEqual(["cadeia"]);
  });

  test("o confronto da cadeia exige um preset com cadeia", () => {
    expect(() => lerArgumentos(["--preset", "introdutorio/padrao", "--confronto", "cadeia"], 4)).toThrow('exige um preset com o bloco da cadeia');
    expect(() => lerArgumentos(["--confronto", "xyz"], 4)).toThrow("confronto desconhecido");
  });
});

describe("variações do preset (ajustes)", () => {
  const atividade = (p: Preset, id: string) => p.cadeia!.atividades.find((a) => a.id === id)!;

  test("sem ajustes, ou num preset sem cadeia, o preset é o mesmo objeto", () => {
    expect(aplicarAjustes(PRESET_CADEIA_MINIMA, undefined)).toBe(PRESET_CADEIA_MINIMA);
    expect(aplicarAjustes(PRESET_INTRODUTORIO, { fatorPiso: 0.5 })).toBe(PRESET_INTRODUTORIO);
  });

  test("troca só o que foi pedido, mantém a variação por semente e não altera o original", () => {
    const antes = JSON.stringify(PRESET_CADEIA_MINIMA);
    const p = aplicarAjustes(PRESET_CADEIA_MINIMA, {
      fatorPiso: 0.5,
      ganhoQualidadePorMes: 0.1,
      atividades: { gado_leiteiro: { custoVariavel: 3, capex: 1000, custoFixo: 20, capacidadePorDia: 500, qualidadeBase: 55 } },
      precoFornecedor: { leite: 9 },
    });
    expect(JSON.stringify(PRESET_CADEIA_MINIMA)).toBe(antes);
    const leiteira = atividade(p, "gado_leiteiro");
    const original = atividade(PRESET_CADEIA_MINIMA, "gado_leiteiro");
    expect(leiteira.custoVariavelPorUnidade).toEqual({ valor: 300, variacao: (original.custoVariavelPorUnidade as { variacao: number }).variacao });
    expect(leiteira.qualidadeBase).toEqual({ valor: 55, variacao: (original.qualidadeBase as { variacao: number }).variacao });
    expect([leiteira.capex, leiteira.custoFixoMensal, leiteira.capacidadeUnidadesPorDia]).toEqual([100_000, 2_000, 500]);
    expect(p.cadeia!.cooperativa.fatorPiso).toBe(0.5);
    expect(p.cadeia!.experiencia).toEqual({ ganhoQualidadePorMes: 0.1, qualidadeMaxima: PRESET_CADEIA_MINIMA.cadeia!.experiencia.qualidadeMaxima });
    const leite = p.produtos.find((x) => x.id === "leite")!;
    expect((leite.fornecedor!.preco as { valor: number }).valor).toBe(900);
    // As outras atividades e produtos ficam como estavam.
    expect(atividade(p, "frango")).toEqual(atividade(PRESET_CADEIA_MINIMA, "frango"));
    expect(p.produtos.find((x) => x.id === "morango")).toEqual(PRESET_CADEIA_MINIMA.produtos.find((x) => x.id === "morango"));
  });

  test("o ajuste '*' vale para as atividades sem ajuste próprio", () => {
    const p = aplicarAjustes(PRESET_CADEIA_MINIMA, { atividades: { "*": { capex: 50 }, frango: { capex: 70 } } });
    expect(atividade(p, "frango").capex).toBe(7_000);
    expect(atividade(p, "morango").capex).toBe(5_000);
    expect(atividade(p, "gado_de_corte").capex).toBe(5_000);
  });

  test("um lote com ajustes simula o preset ajustado (e é diferente do original)", () => {
    const ajustes = { fatorPiso: 0.3, atividades: { "*": { custoVariavel: 50 } } };
    const lote = { presetId: "cadeia/minima", confronto: "cadeia" as const, prefixo: "aj", meses: 4, indices: [0] };
    const com = executarLote({ ...lote, ajustes })[0]!;
    const sem = executarLote(lote)[0]!;
    const manual = simularPartida({ preset: aplicarAjustes(PRESET_CADEIA_MINIMA, ajustes), semente: sementeDaPartida("aj", 0), robos: robosDoConfronto("cadeia", sementeDaPartida("aj", 0)), meses: 4 });
    expect(JSON.stringify(com)).toBe(JSON.stringify(manual));
    expect(JSON.stringify(com)).not.toBe(JSON.stringify(sem));
  });
});

// ---------------------------------------------------------------------------------------------
// Indicadores e critérios
// ---------------------------------------------------------------------------------------------

function metrica(estrategia: string, lucroMedio: number, taxaVitoria = 0, fracaoCreditoProlongado = 0): MetricaEstrategia {
  return { estrategia, partidas: 100, vitorias: Math.round(taxaVitoria * 100), taxaVitoria, posicaoMedia: 5, lucroMedio, lucroMediano: lucroMedio, receitaMedia: 0, participacaoMedia: 0.1, fracaoCreditoProlongado };
}

function metricas(m: Partial<Record<string, [number, number?, number?]>>): Metricas {
  const base: Record<string, [number, number?, number?]> = {
    equilibrada: [1_000_000],
    revenda: [1_000_000],
    cadeia_integrada: [1_200_000, 0.3],
    cadeia_so_fazenda: [1_100_000, 0.05],
    cadeia_cooperativa: [600_000, 0],
    ...m,
  };
  return { partidas: 100, porEstrategia: Object.entries(base).map(([e, v]) => metrica(e, ...v)), fracaoPartidasComDiferencaVisivel: 1, fracaoRazoaveisComCreditoProlongado: 0, criterios: [], aprovado: true };
}

const criterio = (m: Metricas, id: string) => criteriosDaCadeia(indicadoresDaCadeia(m)).find((c) => c.id === id)!;

describe("indicadores da cadeia", () => {
  test("razões de lucro médio: cada caminho contra a estratégia sem fazendas", () => {
    const i = indicadoresDaCadeia(metricas({ equilibrada: [2_000_000], revenda: [500_000], cadeia_integrada: [2_600_000], cadeia_so_fazenda: [650_000], cadeia_cooperativa: [1_000_000] }));
    expect(i.razaoIntegrada).toBeCloseTo(1.3, 12);
    expect(i.razaoSoFazenda).toBeCloseTo(1.3, 12);
    expect(i.razaoCooperativa).toBeCloseTo(0.5, 12);
  });

  test("sem a estratégia de comparação, ou com lucro de comparação não positivo, a razão é nula e o critério falha", () => {
    const sem = metricas({});
    sem.porEstrategia = sem.porEstrategia.filter((x) => x.estrategia !== "equilibrada");
    expect(indicadoresDaCadeia(sem).razaoIntegrada).toBeNull();
    expect(criterio(sem, "cadeia_integrada_compensa").passou).toBe(false);
    expect(indicadoresDaCadeia(metricas({ equilibrada: [-5] })).razaoIntegrada).toBeNull();
  });
});

describe("critérios da cadeia (limites conferidos dos dois lados)", () => {
  test("a integrada tem de compensar (≥ 1,05×) sem virar o atalho (≤ 1,60×)", () => {
    const com = (r: number) => criterio(metricas({ equilibrada: [1_000_000], cadeia_integrada: [1_000_000 * r, 0.3] }), "cadeia_integrada_compensa").passou;
    expect([1.0499, 1.05, 1.3, 1.6, 1.6001].map(com)).toEqual([false, true, true, true, false]);
  });

  test("só fazenda: a mesma faixa, contra a revenda", () => {
    const com = (r: number) => criterio(metricas({ revenda: [1_000_000], cadeia_so_fazenda: [1_000_000 * r, 0.05] }), "cadeia_so_fazenda_compensa").passou;
    expect([1.0, 1.05, 1.59, 1.61].map(com)).toEqual([false, true, true, false]);
  });

  test("a cooperativa rende no máximo 0,95× da equilibrada, e nunca vence (≤ 2%) nem rende mais que os caminhos úteis", () => {
    const perde = (r: number) => criterio(metricas({ equilibrada: [1_000_000], cadeia_cooperativa: [1_000_000 * r, 0] }), "cadeia_cooperativa_perde").passou;
    expect([0.5, 0.95, 0.9501, 1.2].map(perde)).toEqual([true, true, false, false]);
    const vence = (t: number) => criterio(metricas({ cadeia_cooperativa: [600_000, t] }), "cadeia_cooperativa_nunca_vence").passou;
    expect([0, 0.02, 0.0201, 0.3].map(vence)).toEqual([true, true, false, false]);
    const abaixo = (l: number) => criterio(metricas({ cadeia_cooperativa: [l, 0] }), "cadeia_cooperativa_abaixo_dos_uteis").passou;
    expect([1_099_999, 1_100_000, 1_300_000].map(abaixo)).toEqual([true, false, false]); // precisa ser menor que os dois (1,1 e 1,2 milhão)
  });

  test("nenhum caminho útil vence mais de 40% das partidas nem tem caixa negativo prolongado em mais de 10%", () => {
    const domina = (t: number) => criterio(metricas({ cadeia_integrada: [1_200_000, t] }), "cadeia_nenhum_domina").passou;
    expect([0.4, 0.4001, 0.2].map(domina)).toEqual([true, false, true]);
    const caixa = (f: number) => criterio(metricas({ cadeia_so_fazenda: [1_100_000, 0.05, f] }), "cadeia_sem_caixa_negativo").passou;
    expect([0, 0.1, 0.1001].map(caixa)).toEqual([true, true, false]);
  });

  test("os limites e a lista de caminhos úteis são os documentados", () => {
    expect(LIMITES_DA_CADEIA).toEqual({
      razaoMinimaDoCaminho: 1.05,
      razaoMaximaDoCaminho: 1.6,
      razaoMaximaDaCooperativa: 0.95,
      vitoriaMaximaDaCooperativa: 0.02,
      vitoriaMaximaDeUmCaminho: 0.4,
      creditoProlongadoMaximo: 0.1,
    });
    expect([...CAMINHOS_UTEIS]).toEqual(["cadeia_integrada", "cadeia_so_fazenda"]);
  });
});

// ---------------------------------------------------------------------------------------------
// Economia das atividades
// ---------------------------------------------------------------------------------------------

/** Preset mínimo com uma atividade de um produto (preço 5, custo 2) e uma com coproduto (preços 5 e 10). */
const presetPequeno = {
  produtos: [
    { id: "a", fornecedor: { preco: 500 } },
    { id: "b", fornecedor: { preco: 1000 } },
  ],
  cadeia: {
    atividades: [
      { id: "simples", nome: "Simples", produz: [{ produto: "a", proporcao: 1 }], custoVariavelPorUnidade: { valor: 200, variacao: 0.2 }, capex: 3_000_000, custoFixoMensal: 100_000, capacidadeUnidadesPorDia: 100 },
      {
        id: "conjunta",
        nome: "Conjunta",
        produz: [
          { produto: "a", proporcao: 1 },
          { produto: "b", proporcao: 0.5 },
        ],
        custoVariavelPorUnidade: 300,
        capex: 6_000_000,
        custoFixoMensal: 200_000,
        capacidadeUnidadesPorDia: 100,
      },
    ],
  },
} as unknown as Preset;

describe("economia das atividades (conta à mão)", () => {
  const linhas = economiaDasAtividades(presetPequeno);

  test("atividade de um produto: 3.000/mês; valor 15.000; custo 6.000; fixo 1.000 → líquido 8.000 (100%) e 4.400 (60%); payback 3,75 e 6,82 meses", () => {
    const l = linhas[0]!;
    expect([l.atividade, l.aproveitamento, l.producaoMensal, l.valor, l.custoVariavel, l.custoFixo, l.capex]).toEqual(["Simples", "—", 3_000, 15_000, 6_000, 1_000, 30_000]);
    expect(l.liquido100).toBe(8_000); // 15.000 − 6.000 − 1.000
    expect(l.liquido60).toBeCloseTo(4_400, 9); // 0,6 × 9.000 − 1.000
    expect(l.payback100).toBeCloseTo(3.75, 12);
    expect(l.payback60).toBeCloseTo(30_000 / 4_400, 12);
  });

  test("coprodutos: só o primeiro (15.000), o primeiro e 1/3 do outro (15.000 + 5.000) e todos (15.000 + 15.000)", () => {
    const c = linhas.slice(1);
    expect(c.map((l) => l.aproveitamento)).toEqual(["só a", "tudo do primeiro e 1/3 dos coprodutos", "todos os produtos (limite teórico)"]);
    expect(c.map((l) => l.valor)).toEqual([15_000, 20_000, 30_000]);
    // custo variável 3.000 × 3 = 9.000; fixo 2.000; capex 60.000
    expect(c.map((l) => l.liquido100)).toEqual([4_000, 9_000, 19_000]); // 15.000−9.000−2.000; 20.000−11.000; 30.000−11.000
    expect(c.map((l) => Number.isFinite(l.payback100))).toEqual([true, true, true]);
    expect(c[0]!.payback100).toBeCloseTo(15, 12); // 60.000 / 4.000
  });

  test("atividade que não paga: payback infinito, escrito como 'não paga' na tabela", () => {
    const ruim = { ...presetPequeno, cadeia: { ...presetPequeno.cadeia!, atividades: [{ ...presetPequeno.cadeia!.atividades[0]!, custoVariavelPorUnidade: 600 }] } } as Preset;
    const l = economiaDasAtividades(ruim)[0]!;
    expect(l.payback100).toBe(Infinity);
    expect(tabelaDeEconomia([l])).toContain("não paga");
  });

  test("sem bloco da cadeia não há linhas; o preset real tem 5 atividades (a de coprodutos aparece 3 vezes)", () => {
    expect(economiaDasAtividades(PRESET_INTRODUTORIO)).toEqual([]);
    const reais = economiaDasAtividades(PRESET_CADEIA_MINIMA);
    expect(reais).toHaveLength(7);
    expect(reais.filter((l) => l.atividade === "Gado de corte")).toHaveLength(3);
  });
});

describe("relatório do confronto da cadeia", () => {
  const info = { presetId: "cadeia/minima", presetVersao: "0.2.0", versaoMotor: "m", versaoCatalogo: "c", confronto: "cadeia", partidas: 10, meses: 24, prefixo: "p", trabalhadores: 1, duracaoSegundos: 1, ticksSimulados: 100 };

  test("título próprio e seção de economia só quando pedida", () => {
    const m = metricas({});
    m.criterios = criteriosDaCadeia(indicadoresDaCadeia(m));
    const com = relatorioMarkdown(info, m, { economiaDasAtividades: "| tabela |" });
    expect(com).toContain("## Critérios de aceite da cadeia");
    expect(com).toContain("## Economia das atividades");
    expect(com).toContain("| tabela |");
    const sem = relatorioMarkdown(info, m);
    expect(sem).not.toContain("## Economia das atividades");
    expect(relatorioMarkdown({ ...info, confronto: "todos" }, m)).toContain("## Critérios de aceite (seção 10.4)");
  });
});
