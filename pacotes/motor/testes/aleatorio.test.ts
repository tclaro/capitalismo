import { describe, expect, test } from "bun:test";
import { aleatorio, criarGerador, hash128, inteiroEntre, proximoInteiro, uniforme } from "../src";

const sequencia = (semente: string, fluxo: string, n: number) => {
  const g = criarGerador(semente, fluxo);
  return Array.from({ length: n }, () => proximoInteiro(g));
};

describe("gerador com semente", () => {
  test("mesma semente e fluxo → mesma sequência", () => {
    expect(sequencia("aula-1", "mercado:m1", 50)).toEqual(sequencia("aula-1", "mercado:m1", 50));
  });

  test("sementes ou fluxos diferentes → sequências diferentes", () => {
    const base = sequencia("aula-1", "mercado:m1", 10);
    expect(sequencia("aula-2", "mercado:m1", 10)).not.toEqual(base);
    expect(sequencia("aula-1", "mercado:m2", 10)).not.toEqual(base);
  });

  test("o separador impede colisão entre (\"ab\", \"c\") e (\"a\", \"bc\")", () => {
    expect(sequencia("ab", "c", 5)).not.toEqual(sequencia("a", "bc", 5));
  });

  test("estado serializável: continuar depois de ida e volta pelo JSON dá a mesma sequência", () => {
    const g = criarGerador("s", "f");
    for (let i = 0; i < 7; i++) proximoInteiro(g);
    const copia = JSON.parse(JSON.stringify(g));
    expect(Array.from({ length: 20 }, () => proximoInteiro(copia))).toEqual(Array.from({ length: 20 }, () => proximoInteiro(g)));
  });

  test("saídas são inteiros de 32 bits sem sinal e o estado continua em 32 bits", () => {
    const g = criarGerador("x", "y");
    for (let i = 0; i < 1000; i++) {
      const v = proximoInteiro(g);
      expect(Number.isInteger(v) && v >= 0 && v < 2 ** 32).toBe(true);
    }
    expect(g.s.every((w) => Number.isInteger(w) && w >= 0 && w < 2 ** 32)).toBe(true);
  });

  test("aleatorio fica em [0, 1) com média ≈ 0,5 e uniformidade razoável em 10 faixas", () => {
    const g = criarGerador("uniformidade", "teste");
    const n = 100_000;
    const faixas = new Array(10).fill(0);
    let soma = 0;
    for (let i = 0; i < n; i++) {
      const x = aleatorio(g);
      expect(x >= 0 && x < 1).toBe(true);
      soma += x;
      faixas[Math.floor(x * 10)]++;
    }
    expect(Math.abs(soma / n - 0.5)).toBeLessThan(0.005);
    // qui-quadrado com 9 graus de liberdade: p = 0,001 em 27,88
    const esperado = n / 10;
    const quiQuadrado = faixas.reduce((s, o) => s + (o - esperado) ** 2 / esperado, 0);
    expect(quiQuadrado).toBeLessThan(27.88);
  });

  test("inteiroEntre cobre o intervalo inclusive e rejeita intervalos inválidos", () => {
    const g = criarGerador("inteiros", "teste");
    const vistos = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const v = inteiroEntre(g, -2, 3);
      expect(v >= -2 && v <= 3 && Number.isInteger(v)).toBe(true);
      vistos.add(v);
    }
    expect([...vistos].sort((a, b) => a - b)).toEqual([-2, -1, 0, 1, 2, 3]);
    expect(() => inteiroEntre(g, 3, 2)).toThrow(RangeError);
    expect(() => inteiroEntre(g, 0.5, 2)).toThrow(RangeError);
  });

  test("uniforme respeita [mínimo, máximo)", () => {
    const g = criarGerador("u", "t");
    for (let i = 0; i < 1000; i++) {
      const x = uniforme(g, 0.9, 1.1);
      expect(x >= 0.9 && x < 1.1).toBe(true);
    }
  });

  test("confere com uma implementação de referência do sfc32 (tradução direta do C, com uint32 via BigInt)", () => {
    const M = 0xffffffffn;
    const referencia = (s: [number, number, number, number], n: number) => {
      let [a, b, c, d] = s.map(BigInt) as [bigint, bigint, bigint, bigint];
      const saida: number[] = [];
      for (let i = 0; i < n; i++) {
        const tmp = (a + b + d) & M;
        d = (d + 1n) & M;
        a = b ^ (b >> 9n);
        b = (c + (c << 3n)) & M;
        c = ((((c << 21n) | (c >> 11n)) & M) + tmp) & M;
        saida.push(Number(tmp));
      }
      return saida;
    };
    for (const estado of [
      [1, 2, 3, 4],
      [0xffffffff, 0x12345678, 0x9abcdef0, 0xffffffff],
      hash128("qualquer"),
    ] as [number, number, number, number][]) {
      const g = { s: [...estado] as [number, number, number, number] };
      expect(Array.from({ length: 50 }, () => proximoInteiro(g))).toEqual(referencia(estado, 50));
    }
  });

  test("hash128 é determinístico e sensível a qualquer caractere", () => {
    expect(hash128("abc")).toEqual(hash128("abc"));
    expect(hash128("abc")).not.toEqual(hash128("abd"));
  });

  test("regressão: a sequência de referência não muda (mudar o algoritmo quebra replays)", () => {
    // Valores gravados na primeira execução desta versão do gerador. Se este teste falhar, uma mudança
    // no gerador alterou todas as partidas: só aceitar junto com uma nova versão do motor.
    expect(sequencia("referencia", "fluxo", 4)).toEqual(REFERENCIA);
  });
});

const REFERENCIA: number[] = [2656164875, 2543193450, 3637744326, 631964301];
