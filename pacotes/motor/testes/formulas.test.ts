/**
 * Fórmulas da seção 6 com valores calculados à mão.
 * Constantes: 1 − e^(−1) = 0,6321205588285577; ln 2 = 0,6931471805599453.
 */
import { describe, expect, test } from "bun:test";
import fc from "fast-check";
import {
  demandaTotal,
  fidelidadeNova,
  jurosMensalParaTick,
  marca,
  nota,
  participacoes,
  potencia,
  precoMedio,
  qualidadeFabricada,
  reconhecimentoNovo,
  saturacao,
  softmax,
  taxaMensalParaTick,
  tecnologiaNova,
  tecnologiaRelativa,
  tetoDePreco,
} from "../src";

const UM_MENOS_E_MENOS_1 = 0.6321205588285577;
const PRECISAO = 12;

describe("matemática", () => {
  test("saturação: 0 sem verba, 1 − e^(−1) na verba de referência, tende a 1", () => {
    expect(saturacao(0, 100)).toBe(0);
    expect(saturacao(-5, 100)).toBe(0);
    expect(saturacao(100, 100)).toBeCloseTo(UM_MENOS_E_MENOS_1, PRECISAO);
    expect(saturacao(1e6, 1)).toBe(1);
  });

  test("potência: casos exatos e base inválida", () => {
    expect(potencia(7, 0)).toBe(1);
    expect(potencia(7, 1)).toBe(7);
    expect(potencia(4, 0.5)).toBeCloseTo(2, PRECISAO);
    expect(potencia(2, -1)).toBeCloseTo(0.5, PRECISAO);
    expect(() => potencia(0, 2)).toThrow(RangeError);
    expect(() => potencia(-1, 2)).toThrow(RangeError);
  });

  test("softmax: valores conhecidos, estabilidade numérica e lista vazia", () => {
    const [a, b] = softmax([0, 10 * Math.LN2], 0.1);
    expect(a).toBeCloseTo(1 / 3, PRECISAO);
    expect(b).toBeCloseTo(2 / 3, PRECISAO);
    expect(softmax([1000, 1000], 1)).toEqual([0.5, 0.5]);
    expect(softmax([-1e6, 0], 1)).toEqual([0, 1]);
    expect(softmax([], 1)).toEqual([]);
    expect(softmax([3, 7, -2], 0)).toEqual([1 / 3, 1 / 3, 1 / 3]);
  });

  test("softmax soma 1 e nunca produz NaN (propriedade)", () => {
    fc.assert(
      fc.property(fc.array(fc.double({ min: -1e4, max: 1e4, noNaN: true }), { minLength: 1, maxLength: 20 }), fc.double({ min: 0, max: 10, noNaN: true }), (xs, beta) => {
        const p = softmax(xs, beta);
        const soma = p.reduce((s, x) => s + x, 0);
        return p.every((x) => Number.isFinite(x) && x >= 0 && x <= 1) && Math.abs(soma - 1) < 1e-12;
      }),
    );
  });
});

describe("tempo (seção 6.1)", () => {
  test("taxa mensal para tick: caso exato e extremos", () => {
    expect(taxaMensalParaTick(0.5, 2)).toBeCloseTo(1 - Math.SQRT1_2, PRECISAO);
    expect(taxaMensalParaTick(0, 30)).toBe(0);
    expect(taxaMensalParaTick(1, 30)).toBe(1);
    expect(taxaMensalParaTick(0.3, 1)).toBeCloseTo(0.3, PRECISAO);
    expect(() => taxaMensalParaTick(1.2, 30)).toThrow(RangeError);
  });

  test("taxa por tick composta ao longo do mês reproduz a mensal (propriedade)", () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 0.99, noNaN: true }), fc.integer({ min: 1, max: 60 }), (d, n) => {
        const t = taxaMensalParaTick(d, n);
        let restante = 1;
        for (let i = 0; i < n; i++) restante *= 1 - t;
        return Math.abs(restante - (1 - d)) < 1e-12;
      }),
    );
  });

  test("juros mensais para tick: 1,1² = 1,21", () => {
    expect(jurosMensalParaTick(0.21, 2)).toBeCloseTo(0.1, PRECISAO);
    expect(jurosMensalParaTick(0, 30)).toBe(0);
  });
});

describe("demanda (seção 6.3)", () => {
  const base = { populacao: 1000, consumoPorHabitante: 2, fatorCiclo: 1, precoReferencia: 100, elasticidade: 0.5 };

  test("preço médio igual ao de referência: população × consumo × ciclo", () => {
    expect(demandaTotal({ ...base, precoMedio: 100 })).toBeCloseTo(2000, PRECISAO);
  });

  test("preço médio 2× o de referência com elasticidade 0,5: 2000 / √2", () => {
    expect(demandaTotal({ ...base, precoMedio: 200 })).toBeCloseTo(1414.213562373095, 9);
  });

  test("recessão (ciclo 0,8) reduz a demanda proporcionalmente", () => {
    expect(demandaTotal({ ...base, fatorCiclo: 0.8, precoMedio: 100 })).toBeCloseTo(1600, PRECISAO);
  });

  test("elasticidade zero: demanda não depende do preço", () => {
    expect(demandaTotal({ ...base, elasticidade: 0, precoMedio: 900 })).toBe(2000);
  });

  test("preço médio: ponderado pela demanda anterior, depois média simples, depois referência", () => {
    expect(precoMedio([{ preco: 600, demandaAnterior: 100 }, { preco: 400, demandaAnterior: 300 }], 999)).toBe(450);
    expect(precoMedio([{ preco: 600, demandaAnterior: 0 }, { preco: 400, demandaAnterior: 0 }], 999)).toBe(500);
    expect(precoMedio([], 999)).toBe(999);
  });
});

describe("nota e vendas (seções 6.4 e 6.11)", () => {
  test("nota no preço de referência e abaixo dele: 60×30/60 + 30×10/60 + 0,1×60 = 41", () => {
    expect(nota(60, 30, 90, 100, { qualidade: 30, marca: 10, preco: 60 })).toBeCloseTo(41, PRECISAO);
  });

  test("preço acima do padrão subtrai pontos: 41,667 + 8,333 − 12,5 = 37,5", () => {
    expect(nota(50, 20, 150, 100, { qualidade: 50, marca: 25, preco: 25 })).toBeCloseTo(37.5, PRECISAO);
  });

  test("nota pode ser negativa com preço muito alto", () => {
    expect(nota(0, 0, 300, 100, { qualidade: 0, marca: 0, preco: 100 })).toBe(-200);
  });

  test("participações: 10 pontos a mais com β = 0,1 dão e¹ ≈ 2,718× a participação", () => {
    const [a, b] = participacoes([40, 50], 0.1);
    expect(b! / a!).toBeCloseTo(Math.E, PRECISAO);
  });

  test("teto de preço arredondado para baixo em centavos", () => {
    expect(tetoDePreco(599, 2)).toBe(1198);
    expect(tetoDePreco(333, 1.5)).toBe(499);
  });
});

describe("marca (seção 6.5)", () => {
  test("reconhecimento: 10 × 0,9 + 90 × 0,5 × (1 − e^(−1)) = 37,4454…", () => {
    const r = reconhecimentoNovo(10, 100, { decaimento: 0.1, taxa: 0.5, verbaReferencia: 100 });
    expect(r).toBeCloseTo(9 + 45 * UM_MENOS_E_MENOS_1, PRECISAO);
  });

  test("reconhecimento sem verba só decai", () => {
    expect(reconhecimentoNovo(50, 0, { decaimento: 0.1, taxa: 0.5, verbaReferencia: 100 })).toBeCloseTo(45, PRECISAO);
  });

  test("reconhecimento fica em [0, 100] (propriedade)", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 100, noNaN: true }),
        fc.double({ min: 0, max: 1e9, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (a, verba, d, t) => {
          const r = reconhecimentoNovo(a, verba, { decaimento: d, taxa: t, verbaReferencia: 1000 });
          return r >= 0 && r <= 100;
        },
      ),
    );
  });

  const pf = { decaimento: 0.1, taxa: 20, penalidadeRuptura: 10, minima: -50 };

  test("fidelidade: 10 × 0,9 + 20 × 0,5 × 0,2 − 10 × 0,2 = 9", () => {
    expect(fidelidadeNova(10, 50, 70, 50, 0.2, pf)).toBeCloseTo(9, PRECISAO);
  });

  test("fidelidade cai com qualidade abaixo da esperada: 20 × 1 × (−0,2) = −4", () => {
    expect(fidelidadeNova(0, 100, 30, 50, 0, { ...pf, decaimento: 0 })).toBeCloseTo(-4, PRECISAO);
  });

  test("fidelidade respeita o mínimo (−69 → −50) e o máximo (100)", () => {
    expect(fidelidadeNova(-49, 100, 0, 100, 0, { ...pf, decaimento: 0 })).toBe(-50);
    expect(fidelidadeNova(99, 100, 100, 0, 0, { ...pf, decaimento: 0 })).toBe(100);
  });

  test("sem reconhecimento a fidelidade não anda pela qualidade (fator A/100)", () => {
    expect(fidelidadeNova(0, 0, 100, 0, 0, { ...pf, decaimento: 0 })).toBe(0);
  });

  test("marca = 0,5 A + 0,5 L, limitada a [0, 100]", () => {
    expect(marca(60, -20, 0.5, 0.5)).toBe(20);
    expect(marca(0, -50, 0.5, 0.5)).toBe(0);
    expect(marca(100, 100, 0.7, 0.7)).toBe(100);
  });
});

describe("tecnologia e qualidade (seção 6.6)", () => {
  test("tecnologia: 10 + 5 × (1 − e^(−1)) = 13,1606…", () => {
    expect(tecnologiaNova(10, 100, 5, 100)).toBeCloseTo(10 + 5 * UM_MENOS_E_MENOS_1, PRECISAO);
    expect(tecnologiaNova(10, 0, 5, 100)).toBe(10);
  });

  test("tecnologia relativa usa o piso T_base e fica em [0, 1]", () => {
    expect(tecnologiaRelativa(10, 10, 20)).toBe(0.5);
    expect(tecnologiaRelativa(30, 40, 20)).toBe(0.75);
    expect(tecnologiaRelativa(30, 20, 20)).toBe(1);
    expect(tecnologiaRelativa(0, 0, 20)).toBe(0);
  });

  test("leite engarrafado (Apêndice B: leite 65%, vidro 5%, tecnologia 30%)", () => {
    const insumos = [
      { peso: 65, qualidade: 50 },
      { peso: 5, qualidade: 60 },
    ];
    // 0,65×50 + 0,05×60 + 30×0,5 = 32,5 + 3 + 15
    expect(qualidadeFabricada(insumos, 30, tecnologiaRelativa(10, 10, 20))).toBeCloseTo(50.5, PRECISAO);
    // com tecnologia líder: 32,5 + 3 + 30
    expect(qualidadeFabricada(insumos, 30, 1)).toBeCloseTo(65.5, PRECISAO);
  });

  test("qualidade propaga a qualidade dos insumos: insumos 100 e tecnologia máxima dão 100", () => {
    expect(qualidadeFabricada([{ peso: 50, qualidade: 100 }], 50, 1)).toBe(100);
    expect(qualidadeFabricada([{ peso: 50, qualidade: 0 }], 50, 0)).toBe(0);
  });
});
