import { describe, expect, test } from "bun:test";
import fc from "fast-check";
import { arredondarCentavos, darEntrada, darSaida, estoqueVazio, parcelaDoDia } from "../src";

describe("arredondarCentavos", () => {
  test("meio centavo para longe de zero, simétrico", () => {
    expect(arredondarCentavos(2.5)).toBe(3);
    expect(arredondarCentavos(-2.5)).toBe(-3);
    expect(arredondarCentavos(2.4999)).toBe(2);
    expect(arredondarCentavos(-2.4999)).toBe(-2);
  });

  test("nunca devolve −0 (quebraria a igualdade após ida e volta pelo JSON)", () => {
    expect(Object.is(arredondarCentavos(-0.4), 0)).toBe(true);
    expect(Object.is(arredondarCentavos(-0), 0)).toBe(true);
  });

  test("rejeita valores não finitos", () => {
    expect(() => arredondarCentavos(Number.NaN)).toThrow(RangeError);
    expect(() => arredondarCentavos(Infinity)).toThrow(RangeError);
  });
});

describe("parcelaDoDia", () => {
  test("R$ 1,00 em 30 dias: parcelas de 3 ou 4 centavos somando 100", () => {
    const parcelas = Array.from({ length: 30 }, (_, i) => parcelaDoDia(100, i + 1, 30));
    expect(parcelas.reduce((s, p) => s + p, 0)).toBe(100);
    expect(new Set(parcelas)).toEqual(new Set([3, 4]));
  });

  test("soma exata e diferença máxima de 1 centavo (propriedade)", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1e11 }), fc.integer({ min: 1, max: 60 }), (v, n) => {
        const ps = Array.from({ length: n }, (_, i) => parcelaDoDia(v, i + 1, n));
        const soma = ps.reduce((s, p) => s + p, 0);
        return soma === v && ps.every((p) => Number.isInteger(p) && p >= 0) && Math.max(...ps) - Math.min(...ps) <= 1;
      }),
    );
  });

  test("rejeita valor negativo, fracionário ou dia fora do mês", () => {
    expect(() => parcelaDoDia(-1, 1, 30)).toThrow(RangeError);
    expect(() => parcelaDoDia(1.5, 1, 30)).toThrow(RangeError);
    expect(() => parcelaDoDia(100, 0, 30)).toThrow(RangeError);
    expect(() => parcelaDoDia(100, 31, 30)).toThrow(RangeError);
  });
});

describe("estoque a custo médio", () => {
  test("média ponderada de qualidade e custo; última baixa leva o valor restante", () => {
    const e = estoqueVazio();
    darEntrada(e, 10, 1000, 50);
    darEntrada(e, 30, 3300, 70);
    expect(e).toEqual({ quantidade: 40, valor: 4300, qualidade: 65 });
    expect(darSaida(e, 20)).toBe(2150);
    expect(e).toEqual({ quantidade: 20, valor: 2150, qualidade: 65 });
    expect(darSaida(e, 20)).toBe(2150);
    expect(e).toEqual({ quantidade: 0, valor: 0, qualidade: 0 });
  });

  test("custo arredondado: 3 unidades por 100 centavos, baixas de 1 → 33, 34 (67/2 = 33,5), 33 (resto)", () => {
    const e = estoqueVazio();
    darEntrada(e, 3, 100, 50);
    expect([darSaida(e, 1), darSaida(e, 1), darSaida(e, 1)]).toEqual([33, 34, 33]);
    expect(e.valor).toBe(0);
  });

  test("baixa de quase tudo (ruído de ponto flutuante) zera o estoque", () => {
    const e = estoqueVazio();
    darEntrada(e, 0.1 + 0.2, 999, 40);
    expect(darSaida(e, 0.3)).toBe(999);
    expect(e.quantidade).toBe(0);
  });

  test("rejeita retirada maior que o estoque e valor fracionário", () => {
    const e = estoqueVazio();
    darEntrada(e, 5, 500, 50);
    expect(() => darSaida(e, 6)).toThrow(RangeError);
    expect(() => darEntrada(e, 1, 10.5, 50)).toThrow(RangeError);
    expect(() => darEntrada(e, -1, 10, 50)).toThrow(RangeError);
  });

  test("conservação: custos baixados + valor restante = valor de entrada, exato (propriedade)", () => {
    const operacao = fc.oneof(
      fc.record({ tipo: fc.constant("entrada" as const), q: fc.double({ min: 0, max: 1e5, noNaN: true }), v: fc.integer({ min: 0, max: 1e9 }), qual: fc.double({ min: 0, max: 100, noNaN: true }) }),
      fc.record({ tipo: fc.constant("saida" as const), fracao: fc.double({ min: 0, max: 1, noNaN: true }) }),
    );
    fc.assert(
      fc.property(fc.array(operacao, { maxLength: 60 }), (ops) => {
        const e = estoqueVazio();
        let entrou = 0;
        let saiu = 0;
        for (const op of ops) {
          if (op.tipo === "entrada") {
            darEntrada(e, op.q, op.v, op.qual);
            entrou += op.v;
          } else {
            saiu += darSaida(e, e.quantidade * op.fracao);
          }
          if (!(e.valor >= 0 && Number.isInteger(e.valor) && e.quantidade >= 0 && e.qualidade >= 0 && e.qualidade <= 100 + 1e-9)) return false;
        }
        return saiu + e.valor === entrou;
      }),
    );
  });
});
