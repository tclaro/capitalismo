/**
 * Contabilidade (entrega 5): depreciação, IR com compensação de prejuízo, crédito emergencial,
 * fechamento mensal (DRE, fluxo de caixa, balanço) e pontuação.
 */
import { describe, expect, test } from "bun:test";
import fc from "fast-check";
import {
  balanco,
  calcularIR,
  calcularPontuacao,
  type Decisao,
  type EstadoPartida,
  jurosMensalParaTick,
  passoMutavel,
  quotaDeDepreciacao,
  ranking,
  type ResultadoTick,
} from "../src";
import { decidir, empresa, PRESET_TESTE, partidaDeTeste, rodar } from "./ajuda";

const LEITE = "leite_engarrafado";
const CARTEIRA = "carteira";

describe("imposto de renda com compensação de prejuízo (alíquota 34%, trava 30%)", () => {
  test("lucro sem prejuízo acumulado: 34% do lucro", () => {
    expect(calcularIR(1000, 0, 0.34, 0.3)).toEqual({ ir: 340, compensado: 0, prejuizoFiscalFinal: 0 });
  });

  test("prejuízo: sem imposto; soma ao prejuízo fiscal", () => {
    expect(calcularIR(-500, 200, 0.34, 0.3)).toEqual({ ir: 0, compensado: 0, prejuizoFiscalFinal: 700 });
  });

  test("lucro com prejuízo acumulado: compensa até 30% do lucro (300 de 500); base 700 → IR 238", () => {
    expect(calcularIR(1000, 500, 0.34, 0.3)).toEqual({ ir: 238, compensado: 300, prejuizoFiscalFinal: 200 });
  });

  test("prejuízo menor que a trava: compensa tudo", () => {
    expect(calcularIR(1000, 100, 0.34, 0.3)).toEqual({ ir: 306, compensado: 100, prejuizoFiscalFinal: 0 });
  });

  test("lucro zero: sem imposto e sem mudar o prejuízo", () => {
    expect(calcularIR(0, 100, 0.34, 0.3)).toEqual({ ir: 0, compensado: 0, prejuizoFiscalFinal: 100 });
  });
});

describe("depreciação linear", () => {
  const ativo = (custo: number, vidaUtilMeses: number, depreciacaoAcumulada = 0) => ({ id: "x", custo, vidaUtilMeses, depreciacaoAcumulada, operaDesdeTick: 0 });

  test("quota = custo / vida útil, arredondada; a última leva o resto", () => {
    expect(quotaDeDepreciacao(ativo(8_000_000, 60))).toBe(133_333);
    expect(quotaDeDepreciacao(ativo(8_000_000, 3))).toBe(2_666_667);
    expect(quotaDeDepreciacao(ativo(8_000_000, 3, 5_333_334))).toBe(2_666_666);
    expect(quotaDeDepreciacao(ativo(8_000_000, 3, 8_000_000))).toBe(0);
  });

  test("ponto de venda inicial deprecia no fim de cada mês até zerar", () => {
    const preset = { ...PRESET_TESTE, pontoDeVenda: { ...PRESET_TESTE.pontoDeVenda, vidaUtilMeses: 3 } };
    const { estado, resultados } = rodar(partidaDeTeste(["A"], { preset }), 120);
    const quotas = resultados.flatMap((r) => r.fechamentos.map((f) => f.fechamento.dre.depreciacao));
    expect(quotas).toEqual([2_666_667, 2_666_667, 2_666_666, 0]);
    expect(empresa(estado, "emp_01").pontosDeVenda[0]!.depreciacaoAcumulada).toBe(8_000_000);
  });

  test("fábrica em obra não deprecia; começa no primeiro fim de mês em operação", () => {
    const { resultados } = rodar(partidaDeTeste(), 60, (t) => (t === 1 ? { decisoes: [{ tipo: "construirFabrica", empresa: "emp_01", produto: LEITE }] } : {}));
    const [m1, m2] = resultados.flatMap((r) => r.fechamentos.map((f) => f.fechamento));
    expect(m1!.dre.depreciacao).toBe(133_333); // só o ponto de venda
    expect(m1!.balanco.obrasEmAndamento).toBe(30_000_000);
    expect(m2!.dre.depreciacao).toBe(133_333 + 500_000); // + fábrica: 30.000.000 / 60
    expect(m2!.balanco.obrasEmAndamento).toBe(0);
  });
});

describe("crédito emergencial", () => {
  const presetPobre = { ...PRESET_TESTE, financeiro: { ...PRESET_TESTE.financeiro, caixaInicial: 100_000 } };
  const juros = jurosMensalParaTick(0.08, 30);

  test("saque no valor exato do déficit, com aviso só na primeira vez", () => {
    // Tick 1: compra 2.000/dia (R$ 9.000), vende 800 (R$ 4.800), ponto de venda R$ 400, armazenagem 1.200 × 5/30 = 200.
    const { estado, resultados } = rodar(partidaDeTeste(["A"], { preset: presetPobre }), 2, () => ({
      decisoes: [decidir("emp_01", LEITE, { preco: 600, compraMensal: 60_000 })],
    }));
    const saque1 = 900_000 - 100_000 - 480_000 + 40_000 + 200;
    expect(resultados[0]!.lancamentos.at(-1)).toEqual({
      empresa: "emp_01",
      valor: saque1,
      classe: "financiamento",
      descricao: "saque de crédito emergencial",
      origem: "banco_credito_emergencial",
      destino: "emp_01",
    });
    expect(resultados[0]!.avisos).toContainEqual({ tipo: "caixa_negativo", empresa: "emp_01" });
    expect(resultados[1]!.avisos.filter((a) => a.tipo === "caixa_negativo")).toEqual([]);
    // Tick 2: juros sobre o saldo anterior, capitalizados; novo déficit: 9.000 − 4.800 + 400 + armazenagem de 2.400 un (400).
    const juros2 = Math.round(saque1 * juros);
    expect(empresa(estado, "emp_01").creditoEmergencial).toBe(saque1 + juros2 + (900_000 - 480_000 + 40_000 + 400));
    expect(empresa(estado, "emp_01").caixa).toBe(0);
    expect(empresa(estado, "emp_01").contabil.mesAtual.dre.juros).toBe(juros2);
  });

  test("amortização automática assim que sobra caixa", () => {
    const { estado, resultados } = rodar(partidaDeTeste(["A"], { preset: presetPobre }), 3, (t) => ({
      decisoes: [decidir("emp_01", LEITE, { preco: 600, compraMensal: t <= 2 ? 60_000 : 0 })],
    }));
    const tick3 = resultados[2]!;
    const amortizacao = tick3.lancamentos.find((l) => l.descricao === "amortização de crédito emergencial")!;
    // Tick 3: vende 800 do estoque (R$ 4.800), ponto de venda R$ 400, armazenagem 1.600 × 5/30 = 266,67 → 267.
    expect(amortizacao.valor).toBe(-(480_000 - 40_000 - 267));
    expect(amortizacao.classe).toBe("financiamento");
    expect(empresa(estado, "emp_01").caixa).toBe(0);
    expect(empresa(estado, "emp_01").creditoEmergencial).toBeGreaterThan(0);
  });

  test("IR de um mês lucrativo com crédito em aberto é coberto pelo crédito: o caixa fecha o mês em zero", () => {
    // Compra 2.000/dia e vende 800/dia a R$ 6,00: lucra na margem, mas o estoque cresce e o caixa fica negativo.
    const { estado, resultados } = rodar(partidaDeTeste(["A"], { preset: presetPobre }), 30, () => ({
      decisoes: [decidir("emp_01", LEITE, { preco: 600, compraMensal: 60_000 })],
    }));
    const f = resultados[29]!.fechamentos[0]!.fechamento;
    expect(f.dre.ir).toBeGreaterThan(0);
    expect(f.lucroAntesIR).toBeGreaterThan(0);
    expect(f.balanco.creditoEmergencial).toBeGreaterThan(0);
    expect(f.balanco.caixa).toBe(0);
    expect(empresa(estado, "emp_01").caixa).toBe(0);
  });

  test("a empresa nunca é eliminada: continua operando com crédito emergencial por meses", () => {
    const { estado } = rodar(partidaDeTeste(["A"], { preset: presetPobre }), 90, () => ({
      decisoes: [decidir("emp_01", LEITE, { preco: 300, compraMensal: 30_000, publicidadeMensal: 5_000_000 })],
    }));
    const e = empresa(estado, "emp_01");
    expect(e.creditoEmergencial).toBeGreaterThan(0);
    expect(e.contabil.mesesComCreditoEmergencial).toBe(3);
    expect(e.caixa).toBe(0);
  });

  test("penalidade de pontuação por mês com crédito emergencial (parâmetro)", () => {
    const preset = { ...presetPobre, financeiro: { ...presetPobre.financeiro, penalidadeFalenciaMensal: 1000 } };
    const { estado } = rodar(partidaDeTeste(["A"], { preset }), 60, () => ({ decisoes: [decidir("emp_01", LEITE, { preco: 300, compraMensal: 30_000 })] }));
    expect(empresa(estado, "emp_01").penalidadePontuacao).toBe(2000);
  });
});

describe("fechamento mensal", () => {
  const roteiro = (t: number): { decisoes?: Decisao[] } => {
    if (t === 1)
      return {
        decisoes: [
          decidir("emp_01", LEITE, { preco: 620, compraMensal: 24_000, publicidadeMensal: 1_500_000 }),
          decidir("emp_02", LEITE, { preco: 580, compraMensal: 30_000 }),
          decidir("emp_02", CARTEIRA, { preco: 8000, compraMensal: 600 }),
          { tipo: "construirFabrica", empresa: "emp_01", produto: LEITE },
        ],
      };
    if (t === 31) return { decisoes: [decidir("emp_01", LEITE, { producaoMensal: 30_000, compraMensal: 0, pdMensal: 600_000 })] };
    return {};
  };
  const inicial = partidaDeTeste(["A", "B"]);
  const caixaInicial = inicial.empresas.map((e) => e.caixa);
  const { estado, resultados } = rodar(inicial, 90, roteiro);
  const fechamentos = resultados.flatMap((r) => r.fechamentos);

  test("um fechamento por empresa no último dia de cada mês", () => {
    expect(resultados.map((r, i) => [i + 1, r.fechamentos.length]).filter(([, n]) => n! > 0)).toEqual([
      [30, 2],
      [60, 2],
      [90, 2],
    ]);
    expect(fechamentos.map((f) => [f.empresa, f.fechamento.mes])).toEqual([
      ["emp_01", 1],
      ["emp_02", 1],
      ["emp_01", 2],
      ["emp_02", 2],
      ["emp_01", 3],
      ["emp_02", 3],
    ]);
  });

  test("fluxo de caixa do mês = variação do caixa no mês (exato)", () => {
    for (const id of ["emp_01", "emp_02"]) {
      const doEmpresa = fechamentos.filter((f) => f.empresa === id).map((f) => f.fechamento);
      let caixaAnterior = caixaInicial[id === "emp_01" ? 0 : 1]!;
      for (const f of doEmpresa) {
        const soma = f.fluxo.operacional + f.fluxo.investimento + f.fluxo.financiamento;
        expect({ id, mes: f.mes, soma }).toEqual({ id, mes: f.mes, soma: f.balanco.caixa - caixaAnterior });
        caixaAnterior = f.balanco.caixa;
      }
    }
  });

  test("balanço fechado: ativo = passivo + patrimônio líquido (exato)", () => {
    for (const { fechamento: f } of fechamentos) expect(f.balanco.ativoTotal).toBe(f.balanco.passivoTotal + f.balanco.patrimonioLiquido);
  });

  test("lucro líquido = lucro antes do IR − IR; lucros acumulados = soma dos lucros líquidos", () => {
    for (const { fechamento: f } of fechamentos) expect(f.lucroLiquido).toBe(f.lucroAntesIR - f.dre.ir);
    for (const id of ["emp_01", "emp_02"]) {
      const soma = fechamentos.filter((f) => f.empresa === id).reduce((s, f) => s + f.fechamento.lucroLiquido, 0);
      expect(empresa(estado, id).contabil.lucrosAcumulados).toBe(soma);
    }
  });

  test("IR do mês bate com calcularIR sobre o lucro e o prejuízo fiscal acumulado", () => {
    for (const id of ["emp_01", "emp_02"]) {
      let prejuizo = 0;
      for (const { fechamento: f } of fechamentos.filter((x) => x.empresa === id)) {
        const esperado = calcularIR(f.lucroAntesIR, prejuizo, 0.34, 0.3);
        expect({ id, mes: f.mes, ir: f.dre.ir }).toEqual({ id, mes: f.mes, ir: esperado.ir });
        prejuizo = esperado.prejuizoFiscalFinal;
      }
      expect(empresa(estado, id).contabil.prejuizoFiscalAcumulado).toBe(prejuizo);
    }
  });

  test("o acumulado do mês zera depois do fechamento", () => {
    for (const e of estado.empresas) {
      expect(Object.values(e.contabil.mesAtual.dre).every((v) => v === 0)).toBe(true);
      expect(Object.values(e.contabil.mesAtual.fluxo).every((v) => v === 0)).toBe(true);
    }
  });

  test("golden: resultado de 3 meses do preset de teste (regressão)", () => {
    // Valores gravados na primeira execução desta versão do motor. Se mudarem, alguma regra mudou:
    // conferir a mudança e só então atualizar, junto com a versão do motor.
    const resumo = fechamentos.map(({ empresa: id, fechamento: f }) => [id, f.mes, f.dre.receita, f.lucroLiquido, f.balanco.caixa, f.balanco.creditoEmergencial]);
    expect(resumo).toEqual(GOLDEN_3_MESES);
  });
});

describe("pontuação e ranking", () => {
  const { estado } = rodar(partidaDeTeste(["A", "B", "C"]), 30, (t) =>
    t === 1
      ? {
          decisoes: [
            decidir("emp_01", LEITE, { preco: 600, compraMensal: 24_000 }),
            decidir("emp_02", LEITE, { preco: 560, compraMensal: 24_000 }),
          ],
        }
      : {},
  );

  test("lucro acumulado em reais, menos a penalidade", () => {
    const e = empresa(estado, "emp_01");
    expect(calcularPontuacao(estado, e)).toBe(e.contabil.lucrosAcumulados / 100);
  });

  test("ranking ordena pela pontuação e desempata pelo id", () => {
    const r = ranking(estado, "mer_01");
    expect(r.map((x) => x.posicao)).toEqual([1, 2, 3]);
    for (let i = 1; i < r.length; i++) expect(r[i - 1]!.pontuacao).toBeGreaterThanOrEqual(r[i]!.pontuacao);
    const empatado = JSON.parse(JSON.stringify(estado)) as EstadoPartida;
    for (const e of empatado.empresas) e.contabil.lucrosAcumulados = 0;
    expect(ranking(empatado, "mer_01").map((x) => x.empresa)).toEqual(["emp_01", "emp_02", "emp_03"]);
  });

  test("participação na receita soma 100 no mercado", () => {
    const soma = estado.empresas.reduce((s, e) => s + calcularPontuacao(estado, e, "participacao_receita"), 0);
    expect(soma).toBeCloseTo(100, 9);
    expect(calcularPontuacao(estado, empresa(estado, "emp_03"), "participacao_receita")).toBe(0);
  });
});

describe("invariantes contábeis com decisões aleatórias (propriedade)", () => {
  const id = fc.constantFrom("emp_01", "emp_02");
  const produto = fc.constantFrom(LEITE, CARTEIRA);
  const decisao = fc.oneof(
    fc.record({
      tipo: fc.constant("produto" as const),
      empresa: id,
      produto,
      preco: fc.option(fc.integer({ min: 1, max: 1200 }), { nil: null }),
      compraMensal: fc.double({ min: 0, max: 80_000, noNaN: true }),
      producaoMensal: fc.double({ min: 0, max: 60_000, noNaN: true }),
      publicidadeMensal: fc.integer({ min: 0, max: 8_000_000 }),
      pdMensal: fc.integer({ min: 0, max: 8_000_000 }),
    }),
    fc.record({ tipo: fc.constant("construirFabrica" as const), empresa: id, produto }),
    fc.record({ tipo: fc.constant("abrirPontoDeVenda" as const), empresa: id, quantidade: fc.integer({ min: 1, max: 2 }) }),
    fc.record({ tipo: fc.constant("fecharPontoDeVenda" as const), empresa: id, quantidade: fc.constant(1) }),
  );

  test("fluxo = variação de caixa, balanço fechado e lucros acumulados = Σ lucros líquidos, em todo mês", () => {
    // Caixa inicial baixo (R$ 50.000) para exercitar o crédito emergencial com frequência.
    const inicial = partidaDeTeste(["A", "B"], { preset: { ...PRESET_TESTE, financeiro: { ...PRESET_TESTE.financeiro, caixaInicial: 5_000_000 } } });
    fc.assert(
      fc.property(fc.array(fc.array(decisao, { maxLength: 3 }), { minLength: 90, maxLength: 90 }), (porTick) => {
        verificarMeses(inicial, porTick as Decisao[][]);
        return true;
      }),
      { numRuns: 15 },
    );
  });
});

function verificarMeses(inicial: EstadoPartida, porTick: Decisao[][]): void {
  let atual = JSON.parse(JSON.stringify(inicial)) as EstadoPartida;
  const caixaInicio = new Map(atual.empresas.map((e) => [e.id, e.caixa]));
  const lucros = new Map(atual.empresas.map((e) => [e.id, 0]));
  for (let t = 1; t <= porTick.length; t++) {
    const r: ResultadoTick = passoMutavel(atual, { decisoes: porTick[t - 1]! });
    atual = r.estado;
    for (const { empresa: id, fechamento: f } of r.fechamentos) {
      expect(f.fluxo.operacional + f.fluxo.investimento + f.fluxo.financiamento).toBe(f.balanco.caixa - caixaInicio.get(id)!);
      expect(f.balanco.ativoTotal).toBe(f.balanco.passivoTotal + f.balanco.patrimonioLiquido);
      lucros.set(id, lucros.get(id)! + f.lucroLiquido);
      expect(empresa(atual, id).contabil.lucrosAcumulados).toBe(lucros.get(id)!);
      caixaInicio.set(id, f.balanco.caixa);
    }
    for (const e of atual.empresas) {
      const b = balanco(e, atual.tick);
      expect(b.ativoTotal).toBe(b.passivoTotal + b.patrimonioLiquido);
      expect(e.caixa).toBeGreaterThanOrEqual(0);
      expect(e.creditoEmergencial).toBeGreaterThanOrEqual(0);
      for (const a of [...e.pontosDeVenda, ...e.fabricas]) expect(a.depreciacaoAcumulada).toBeLessThanOrEqual(a.custo);
    }
  }
}

/**
 * [empresa, mês, receita, lucro líquido, caixa, crédito emergencial], em centavos. Conferido à mão no
 * mês 1 da emp_01: receita 24.000 × 6,20; CPV 24.000 × 4,50; LAIR 12.466,67; IR 34% = 4.238,67.
 */
const GOLDEN_3_MESES: (string | number)[][] = [
  ["emp_01", 1, 14_880_000, 822_800, 20_956_133, 0],
  ["emp_02", 1, 16_015_684, 1_618_067, 47_160_777, 0],
  ["emp_01", 2, 14_880_000, 3_078_307, 23_351_009, 0],
  ["emp_02", 2, 15_891_951, 1_563_362, 44_183_640, 0],
  ["emp_01", 3, 14_880_000, 3_058_506, 25_726_085, 0],
  ["emp_02", 3, 15_995_624, 1_558_002, 41_270_860, 0],
];
