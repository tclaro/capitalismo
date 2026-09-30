/**
 * Tecnologia e qualidade de produtos fabricados (seção 6.6).
 */
import { limitar, saturacao } from "../matematica";

/** T' = T + taxa × (1 − e^(−verba/verbaRef)), com parâmetros por tick. */
export function tecnologiaNova(tecnologia: number, verba: number, taxa: number, verbaReferencia: number): number {
  return tecnologia + taxa * saturacao(verba, verbaReferencia);
}

/** Tecnologia relativa: `min(1, T / max(T_base, T_max))`, em [0, 1]. */
export function tecnologiaRelativa(tecnologia: number, tecnologiaMaxima: number, tecnologiaBase: number): number {
  return limitar(tecnologia / Math.max(tecnologiaBase, tecnologiaMaxima), 0, 1);
}

export interface InsumoQualidade {
  /** Peso do insumo na qualidade final, em pontos percentuais. */
  readonly peso: number;
  /** Qualidade do insumo usado (0–100). */
  readonly qualidade: number;
}

/**
 * Qualidade de um lote fabricado:
 *   Q = Σ (peso_k/100 × Q_insumo_k) + peso_tec/100 × 100 × tecnologiaRelativa
 * Com pesos que somam 100 e qualidades em 0–100, o resultado fica em 0–100.
 */
export function qualidadeFabricada(insumos: readonly InsumoQualidade[], pesoTecnologia: number, tecnologiaRelativaDoLote: number): number {
  let q = pesoTecnologia * limitar(tecnologiaRelativaDoLote, 0, 1);
  for (const i of insumos) q += (i.peso / 100) * i.qualidade;
  return limitar(q, 0, 100);
}
