/**
 * Recorte do fundo com uma imagem sintética que reproduz os casos difíceis dos originais:
 * fundo cinza em degradê, objeto com contorno escuro e interior cinza-claro (como a tampa de
 * alumínio do iogurte), objeto colorido e sombra de contato que escurece até abaixo do limite
 * da 1ª etapa.
 */
import { describe, expect, test } from "bun:test";
import { enquadrar, recortar } from "../src/preparar";

const L = 200;

function sintetica() {
  const rgb = new Uint8Array(L * L * 3);
  const pintar = (x: number, y: number, c: number[]) => rgb.set(c, (y * L + x) * 3);
  for (let y = 0; y < L; y++) for (let x = 0; x < L; x++) {
    const v = 214 + Math.round((6 * x) / L); // degradê suave como o dos originais
    pintar(x, y, [v, v, v]);
  }
  // Sombra de contato sob o objeto: escurece até 95 no centro (abaixo do limite de 120).
  for (let y = 150; y < 170; y++) for (let x = 40; x < 160; x++) {
    const d = Math.max(Math.abs(x - 100) / 60, Math.abs(y - 152) / 18);
    const v = Math.round(95 + (217 - 95) * Math.min(1, d));
    pintar(x, y, [v, v, v]);
  }
  // "Tampa": quadrado cinza-claro neutro (210) dentro de contorno escuro neutro (70).
  for (let y = 40; y < 100; y++) for (let x = 40; x < 100; x++) {
    const borda = x < 43 || x >= 97 || y < 43 || y >= 97;
    pintar(x, y, borda ? [70, 70, 70] : [210, 210, 210]);
  }
  // Objeto colorido encostado na sombra.
  for (let y = 100; y < 152; y++) for (let x = 60; x < 140; x++) pintar(x, y, [200, 40, 30]);
  return rgb;
}

const alfa = (r: ReturnType<typeof recortar>, x: number, y: number) => r.rgba[(y * L + x) * 4 + 3]!;

describe("recorte do fundo", () => {
  const r = recortar(sintetica(), L, L, 3);

  test("fundo some; objeto colorido e interior neutro atrás do contorno ficam opacos", () => {
    for (const [x, y] of [[0, 0], [199, 0], [10, 120], [190, 190], [150, 50]] as const) expect(alfa(r, x, y)).toBe(0);
    expect(alfa(r, 100, 120)).toBe(255);
    expect(alfa(r, 70, 70)).toBe(255); // a "tampa"
    // Contorno neutro escuro encostado no fundo vira preto semitransparente: continua um traço escuro.
    expect(alfa(r, 41, 70)).toBeGreaterThan(150);
    expect(r.rgba[(70 * L + 41) * 4]).toBe(0);
    expect([...r.rgba.subarray((70 * L + 70) * 4, (70 * L + 70) * 4 + 3)]).toEqual([210, 210, 210]);
  });

  test("sombra vira preto semitransparente, inclusive o miolo mais escuro", () => {
    const miolo = (152 * L + 100) * 4;
    expect([...r.rgba.subarray(miolo, miolo + 3)]).toEqual([0, 0, 0]);
    expect(alfa(r, 100, 152)).toBeGreaterThan(100);
    expect(alfa(r, 100, 152)).toBeLessThan(255);
    expect(alfa(r, 100, 165)).toBeLessThan(alfa(r, 100, 155));
  });

  test("composto sobre o cinza do fundo, reproduz o original", () => {
    const original = sintetica();
    for (const [x, y] of [[100, 152], [100, 160], [60, 165], [5, 5]] as const) {
      const p = (y * L + x) * 4;
      const a = r.rgba[p + 3]! / 255;
      const composto = r.rgba[p]! * a + r.luminanciaDoFundo * (1 - a);
      expect(Math.abs(composto - original[(y * L + x) * 3]!)).toBeLessThanOrEqual(8);
    }
  });

  test("enquadramento: quadrado com o objeto e a sombra, centralizado", () => {
    const q = enquadrar(r);
    expect(q.width).toBe(q.height);
    expect(q.left).toBeLessThanOrEqual(40);
    expect(q.left + q.width).toBeGreaterThanOrEqual(160);
    expect(q.top).toBeLessThanOrEqual(40);
    expect(q.top + q.height).toBeGreaterThanOrEqual(160);
  });
});
