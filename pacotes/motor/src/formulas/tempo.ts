/**
 * Conversão de parâmetros mensais para o tick (seção 6.1).
 *
 * Os presets definem taxas e decaimentos **por mês**; o motor aplica a taxa equivalente por tick,
 * de forma que o efeito composto ao longo do mês seja o mesmo para qualquer `ticksPorMes`.
 */
import { potencia } from "../matematica";

/**
 * Taxa por tick equivalente a uma taxa mensal composta: `1 − (1 − taxaMensal)^(1/ticksPorMes)`.
 * Vale para decaimentos e para a fração do gap fechada por período (reconhecimento).
 */
export function taxaMensalParaTick(taxaMensal: number, ticksPorMes: number): number {
  if (taxaMensal < 0 || taxaMensal > 1) throw new RangeError(`taxaMensalParaTick: taxa fora de [0, 1] (${taxaMensal})`);
  if (taxaMensal === 0) return 0;
  if (taxaMensal === 1) return 1;
  return 1 - potencia(1 - taxaMensal, 1 / ticksPorMes);
}

/** Juros por tick equivalentes a juros mensais compostos: `(1 + jurosMensal)^(1/ticksPorMes) − 1`. */
export function jurosMensalParaTick(jurosMensal: number, ticksPorMes: number): number {
  if (jurosMensal < 0) throw new RangeError(`jurosMensalParaTick: juros negativos (${jurosMensal})`);
  if (jurosMensal === 0) return 0;
  return potencia(1 + jurosMensal, 1 / ticksPorMes) - 1;
}
