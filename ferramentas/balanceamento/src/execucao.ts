/**
 * Execução de um lote de simulações (usada tanto no processo principal quanto nos workers).
 */
import { PRESETS } from "@simulador/catalogo";
import { type Intensidade, type ResultadoSimulacao, simularPartida } from "@simulador/motor";
import { robosDoConfronto, sementeDaPartida, type TipoConfronto } from "./confronto";

export interface Lote {
  presetId: string;
  confronto: TipoConfronto;
  prefixo: string;
  /** Índices (0-based) das partidas deste lote. */
  indices: number[];
  meses: number;
  /** Intensidade fixa para uma estratégia (busca de melhor resposta). */
  intensidadeFixa?: { estrategia: string; intensidade: Intensidade };
}

export function executarLote(lote: Lote): ResultadoSimulacao[] {
  const preset = PRESETS[lote.presetId];
  if (!preset) throw new Error(`preset desconhecido: "${lote.presetId}" (disponíveis: ${Object.keys(PRESETS).join(", ")})`);
  return lote.indices.map((i) => {
    const semente = sementeDaPartida(lote.prefixo, i);
    const robos = robosDoConfronto(lote.confronto, semente).map((r) =>
      lote.intensidadeFixa && r.estrategia === lote.intensidadeFixa.estrategia ? { ...r, intensidade: lote.intensidadeFixa.intensidade } : r,
    );
    return simularPartida({ preset, semente, robos, meses: lote.meses });
  });
}
