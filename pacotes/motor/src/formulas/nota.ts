/**
 * Nota de uma oferta (seção 6.4), fórmula do manual do Capitalism II ("Calculating the Overall Rating"):
 *
 *   N = (Q × PQ) / 60 + (M × PM) / 60 + ((P_ref − P) / P_ref) × PP
 *
 * Q e M em 0–100; PQ, PM e PP em pontos percentuais que somam 100. Preço abaixo do padrão soma
 * pontos; acima, subtrai. A nota não é limitada: pode ser negativa com preço muito alto, e o logit
 * das vendas aceita qualquer valor real.
 */
import { softmax } from "../matematica";

export interface PesosNotaResolvidos {
  readonly qualidade: number;
  readonly marca: number;
  readonly preco: number;
}

export function nota(qualidade: number, marca: number, preco: number, precoReferencia: number, pesos: PesosNotaResolvidos): number {
  if (precoReferencia <= 0) throw new RangeError(`nota: preço de referência deve ser positivo (${precoReferencia})`);
  return (qualidade * pesos.qualidade) / 60 + (marca * pesos.marca) / 60 + ((precoReferencia - preco) / precoReferencia) * pesos.preco;
}

/**
 * Participação de cada oferta na demanda do produto (seção 6.11), por logit:
 * `exp(β × N_i) / Σ exp(β × N_j)`. Soma 1; lista vazia devolve lista vazia.
 */
export function participacoes(notas: readonly number[], sensibilidade: number): number[] {
  return softmax(notas, sensibilidade);
}

/** Preço máximo permitido: `multiplo × P_ref`, arredondado para baixo em centavos. */
export function tetoDePreco(precoReferencia: number, multiplo: number): number {
  return Math.floor(precoReferencia * multiplo);
}
