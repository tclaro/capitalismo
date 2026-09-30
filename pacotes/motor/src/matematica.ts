/**
 * Único módulo do motor que usa funções transcendentais (exp, ln, potência).
 *
 * Soma, subtração, multiplicação, divisão e raiz quadrada são exatas pelo padrão IEEE 754, mas
 * `Math.exp`, `Math.log` e `Math.pow` não têm garantia bit a bit entre motores JavaScript,
 * plataformas e versões. Concentrá-las aqui deixa explícito o limite da garantia de determinismo:
 * **mesmo binário = mesmo resultado**. Um teste impede o uso dessas funções fora deste arquivo.
 */

export function exp(x: number): number {
  return Math.exp(x);
}

export function ln(x: number): number {
  return Math.log(x);
}

/** `base ^ expoente` para base > 0, calculado como exp(expoente × ln(base)). */
export function potencia(base: number, expoente: number): number {
  if (base <= 0) throw new RangeError(`potencia: base deve ser positiva (recebido ${base})`);
  if (expoente === 0) return 1;
  if (expoente === 1) return base;
  return Math.exp(expoente * Math.log(base));
}

/** Fração do efeito máximo de uma verba com retorno decrescente: 1 − e^(−verba/referência). */
export function saturacao(verba: number, referencia: number): number {
  if (verba <= 0) return 0;
  return -Math.expm1(-verba / referencia);
}

export function limitar(x: number, minimo: number, maximo: number): number {
  return x < minimo ? minimo : x > maximo ? maximo : x;
}

/**
 * Softmax numericamente estável: `exp(β·x_i) / Σ exp(β·x_j)`, subtraindo o máximo antes da
 * exponencial para não estourar. Lista vazia devolve lista vazia; a soma do resultado é 1.
 */
export function softmax(valores: readonly number[], beta: number): number[] {
  if (valores.length === 0) return [];
  let maximo = -Infinity;
  for (const v of valores) if (beta * v > maximo) maximo = beta * v;
  const pesos = valores.map((v) => Math.exp(beta * v - maximo));
  let soma = 0;
  for (const p of pesos) soma += p;
  return pesos.map((p) => p / soma);
}
