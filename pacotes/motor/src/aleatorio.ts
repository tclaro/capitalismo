/**
 * Gerador de números pseudoaleatórios com semente (seção 3, princípio 3).
 *
 * Algoritmo sfc32 (Chris Doty-Humphrey, PractRand), só com operações inteiras de 32 bits, que são
 * exatas em qualquer motor JavaScript. O estado são 4 inteiros sem sinal, serializável em JSON.
 *
 * Cada entidade que sorteia algo (cenário, robô, mercado) usa um **fluxo** próprio, derivado de
 * `hash(semente, nomeDoFluxo)`: acrescentar um robô ou um mercado não altera os sorteios dos outros.
 */

/** Estado do gerador: 4 inteiros de 32 bits sem sinal. */
export interface Gerador {
  s: [number, number, number, number];
}

const DESCARTE_INICIAL = 15;
const DOIS_A_32 = 4294967296;

/** Hash de texto em 128 bits (cyrb128), usado para derivar o estado inicial de um fluxo. */
export function hash128(texto: string): [number, number, number, number] {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < texto.length; i++) {
    const k = texto.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

/** Cria o gerador de um fluxo. O separador evita colisões como ("ab","c") × ("a","bc"). */
export function criarGerador(semente: string, fluxo: string): Gerador {
  const g: Gerador = { s: hash128(`${semente}\u0000${fluxo}`) };
  for (let i = 0; i < DESCARTE_INICIAL; i++) proximoInteiro(g);
  return g;
}

/**
 * Próximo inteiro de 32 bits sem sinal. Avança o gerador.
 * Referência em C: `tmp = a + b + counter++; a = b ^ (b >> 9); b = c + (c << 3); c = rotl(c, 21) + tmp;`
 * (o contador entra com o valor **anterior** ao incremento).
 */
export function proximoInteiro(g: Gerador): number {
  let [a, b, c, d] = g.s;
  const t = (((a + b) | 0) + d) | 0;
  d = (d + 1) | 0;
  a = b ^ (b >>> 9);
  b = (c + (c << 3)) | 0;
  c = (c << 21) | (c >>> 11);
  c = (c + t) | 0;
  g.s = [a >>> 0, b >>> 0, c >>> 0, d >>> 0];
  return t >>> 0;
}

/** Número em [0, 1). Avança o gerador. */
export function aleatorio(g: Gerador): number {
  return proximoInteiro(g) / DOIS_A_32;
}

/** Número em [minimo, maximo). */
export function uniforme(g: Gerador, minimo: number, maximo: number): number {
  return minimo + (maximo - minimo) * aleatorio(g);
}

/** Inteiro em [minimo, maximo], inclusive. */
export function inteiroEntre(g: Gerador, minimo: number, maximo: number): number {
  if (!Number.isInteger(minimo) || !Number.isInteger(maximo) || maximo < minimo) {
    throw new RangeError(`inteiroEntre: intervalo inválido [${minimo}, ${maximo}]`);
  }
  return minimo + Math.floor(aleatorio(g) * (maximo - minimo + 1));
}
