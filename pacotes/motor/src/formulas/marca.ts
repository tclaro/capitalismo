/**
 * Marca = reconhecimento + fidelidade (seção 6.5). Todas as funções recebem parâmetros **por tick**
 * (ver `formulas/tempo.ts`).
 */
import { limitar, saturacao } from "../matematica";

export interface ParametrosReconhecimentoTick {
  readonly decaimento: number;
  readonly taxa: number;
  /** Verba de referência do tick, na mesma escala da verba do tick. */
  readonly verbaReferencia: number;
}

/** A' = A × (1 − decaimento) + (100 − A) × taxa × (1 − e^(−verba/verbaRef)), limitado a [0, 100]. */
export function reconhecimentoNovo(reconhecimento: number, verba: number, p: ParametrosReconhecimentoTick): number {
  const novo = reconhecimento * (1 - p.decaimento) + (100 - reconhecimento) * p.taxa * saturacao(verba, p.verbaReferencia);
  return limitar(novo, 0, 100);
}

export interface ParametrosFidelidadeTick {
  readonly decaimento: number;
  /** Pontos por tick com reconhecimento 100 e qualidade 100 pontos acima da esperada. */
  readonly taxa: number;
  /** Pontos perdidos por tick com ruptura total. */
  readonly penalidadeRuptura: number;
  readonly minima: number;
}

/**
 * L' = L × (1 − decaimento) + taxa × (A/100) × (Q − Q_esperada)/100 − penalidade × fração_de_ruptura,
 * limitado a [mínima, 100].
 *
 * `fracaoRuptura` = demanda não atendida da oferta / demanda da oferta (0 se não houve demanda).
 */
export function fidelidadeNova(
  fidelidade: number,
  reconhecimento: number,
  qualidade: number,
  qualidadeEsperada: number,
  fracaoRuptura: number,
  p: ParametrosFidelidadeTick,
): number {
  const novo =
    fidelidade * (1 - p.decaimento) +
    p.taxa * (reconhecimento / 100) * ((qualidade - qualidadeEsperada) / 100) -
    p.penalidadeRuptura * limitar(fracaoRuptura, 0, 1);
  return limitar(novo, p.minima, 100);
}

/** M = limitar(pesoA × A + pesoL × L, 0, 100). */
export function marca(reconhecimento: number, fidelidade: number, pesoReconhecimento: number, pesoFidelidade: number): number {
  return limitar(pesoReconhecimento * reconhecimento + pesoFidelidade * fidelidade, 0, 100);
}
