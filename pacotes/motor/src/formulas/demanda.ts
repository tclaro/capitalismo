/**
 * Demanda total de um produto final num mercado, por tick (seção 6.3):
 *
 *   D_total = população × consumo_por_habitante × fator_ciclo × (P_medio / P_ref)^(−elasticidade)
 */
import { potencia } from "../matematica";

export interface EntradaDemanda {
  readonly populacao: number;
  /** Consumo por habitante **no tick** (o consumo mensal dividido por ticksPorMes). */
  readonly consumoPorHabitante: number;
  readonly fatorCiclo: number;
  /** Preço médio de referência do tick (ver `precoMedio`). */
  readonly precoMedio: number;
  readonly precoReferencia: number;
  readonly elasticidade: number;
}

export function demandaTotal(e: EntradaDemanda): number {
  if (e.precoMedio <= 0 || e.precoReferencia <= 0) {
    throw new RangeError(`demandaTotal: preços devem ser positivos (médio ${e.precoMedio}, referência ${e.precoReferencia})`);
  }
  const base = e.populacao * e.consumoPorHabitante * e.fatorCiclo;
  return base * potencia(e.precoMedio / e.precoReferencia, -e.elasticidade);
}

export interface OfertaParaPrecoMedio {
  readonly preco: number;
  /** Demanda que a oferta recebeu no tick anterior (antes de limites de estoque e capacidade). */
  readonly demandaAnterior: number;
}

/**
 * Preço médio usado na demanda total, sem cálculo circular (plano da fase 0):
 * 1. média ponderada pela demanda do tick anterior, se houver demanda anterior;
 * 2. senão, média simples dos preços das ofertas ativas;
 * 3. sem ofertas, o preço de referência.
 */
export function precoMedio(ofertas: readonly OfertaParaPrecoMedio[], precoReferencia: number): number {
  if (ofertas.length === 0) return precoReferencia;
  let somaDemanda = 0;
  let somaPonderada = 0;
  let somaSimples = 0;
  for (const o of ofertas) {
    somaDemanda += o.demandaAnterior;
    somaPonderada += o.preco * o.demandaAnterior;
    somaSimples += o.preco;
  }
  return somaDemanda > 0 ? somaPonderada / somaDemanda : somaSimples / ofertas.length;
}
