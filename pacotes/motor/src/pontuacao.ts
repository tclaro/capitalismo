/**
 * Pontuação e ranking (seção 6.14). Padrão decidido: lucro acumulado (decisão 7), que também é o
 * critério de vitória do balanceamento.
 *
 * Unidade: reais. A penalidade por falência (princípio 7) é descontada em reais por mês terminado
 * com crédito emergencial em aberto.
 */
import type { EstadoEmpresa, EstadoPartida } from "./tipos";

export type CriterioPontuacao = "lucro_acumulado" | "participacao_receita";

export function calcularPontuacao(estado: EstadoPartida, empresa: EstadoEmpresa, criterio: CriterioPontuacao = "lucro_acumulado"): number {
  switch (criterio) {
    case "lucro_acumulado":
      return empresa.contabil.lucrosAcumulados / 100 - empresa.penalidadePontuacao;
    case "participacao_receita": {
      let total = 0;
      for (const e of estado.empresas) if (e.mercado === empresa.mercado) total += e.contabil.receitaAcumulada;
      const participacao = total > 0 ? empresa.contabil.receitaAcumulada / total : 0;
      return 100 * participacao - empresa.penalidadePontuacao;
    }
  }
}

export interface PosicaoRanking {
  posicao: number;
  empresa: string;
  nome: string;
  pontuacao: number;
}

/** Ranking de um mercado, da maior para a menor pontuação; empate decidido pelo id da empresa. */
export function ranking(estado: EstadoPartida, mercado: string, criterio: CriterioPontuacao = "lucro_acumulado"): PosicaoRanking[] {
  return estado.empresas
    .filter((e) => e.mercado === mercado)
    .map((e) => ({ empresa: e.id, nome: e.nome, pontuacao: calcularPontuacao(estado, e, criterio) }))
    .sort((a, b) => b.pontuacao - a.pontuacao || (a.empresa < b.empresa ? -1 : a.empresa > b.empresa ? 1 : 0))
    .map((x, i) => ({ posicao: i + 1, ...x }));
}
