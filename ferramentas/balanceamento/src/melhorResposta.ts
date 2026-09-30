/**
 * Teste de melhor resposta (seção 10.4): otimiza por busca em grade a intensidade de uma estratégia
 * contra as demais (confronto equilibrado) e verifica se a melhor combinação é uma decisão extrema e
 * trivial (no limite da grade) que vence demais.
 */
import { ESTRATEGIAS, type Intensidade } from "@simulador/motor";
import { calcularMetricas, LIMITES, porcentagem as pct } from "./metricas";
import { executarEmParalelo } from "./paralelo";

export type Grade = Record<string, readonly number[]>;

/** Grade padrão: cada parâmetro no mínimo e no máximo da faixa, no meio, e meia faixa além de cada ponta. */
export function gradePadrao(estrategia: string): Grade {
  const e = ESTRATEGIAS[estrategia];
  if (!e) throw new Error(`estratégia desconhecida: "${estrategia}"`);
  const grade: Record<string, number[]> = {};
  for (const [nome, [min, max]] of Object.entries(e.faixas)) {
    const meia = (max - min) / 2;
    const abaixo = min - meia;
    grade[nome] = [min >= 0 ? Math.max(0, abaixo) : abaixo, min, (min + max) / 2, max, max + meia];
  }
  return grade;
}

/** Produto cartesiano da grade, em ordem determinística (parâmetros em ordem alfabética). */
export function combinacoes(grade: Grade): Intensidade[] {
  const nomes = Object.keys(grade).sort();
  let saida: Intensidade[] = [{}];
  for (const nome of nomes) saida = saida.flatMap((c) => grade[nome]!.map((v) => ({ ...c, [nome]: v })));
  return saida;
}

export interface PontoDaGrade {
  intensidade: Intensidade;
  taxaVitoria: number;
  posicaoMedia: number;
  lucroMedio: number;
  /** Algum parâmetro está numa ponta da grade. */
  naBorda: boolean;
}

export interface ResultadoMelhorResposta {
  estrategia: string;
  grade: Grade;
  pontos: PontoDaGrade[];
  melhor: PontoDaGrade;
  /** A melhor resposta é trivial (na borda da grade) e vence mais que o limite: rebalancear. */
  alerta: boolean;
}

export async function buscarMelhorResposta(opcoes: {
  presetId: string;
  estrategia: string;
  grade?: Grade;
  partidas: number;
  meses: number;
  prefixo: string;
  trabalhadores: number;
  aoProgredir?: (feitos: number, total: number) => void;
}): Promise<ResultadoMelhorResposta> {
  const grade = opcoes.grade ?? gradePadrao(opcoes.estrategia);
  const pontos: PontoDaGrade[] = [];
  const todas = combinacoes(grade);
  for (const [k, intensidade] of todas.entries()) {
    const resultados = await executarEmParalelo(
      { presetId: opcoes.presetId, confronto: "todos", prefixo: opcoes.prefixo, meses: opcoes.meses, intensidadeFixa: { estrategia: opcoes.estrategia, intensidade } },
      opcoes.partidas,
      opcoes.trabalhadores,
    );
    const m = calcularMetricas(resultados).porEstrategia.find((x) => x.estrategia === opcoes.estrategia)!;
    const naBorda = Object.entries(intensidade).some(([nome, v]) => {
      const valores = grade[nome]!;
      return v === Math.min(...valores) || v === Math.max(...valores);
    });
    pontos.push({ intensidade, taxaVitoria: m.taxaVitoria, posicaoMedia: m.posicaoMedia, lucroMedio: m.lucroMedio, naBorda });
    opcoes.aoProgredir?.(k + 1, todas.length);
  }
  const melhor = [...pontos].sort((a, b) => b.taxaVitoria - a.taxaVitoria || a.posicaoMedia - b.posicaoMedia)[0]!;
  return { estrategia: opcoes.estrategia, grade, pontos, melhor, alerta: melhor.naBorda && melhor.taxaVitoria > LIMITES.vitoriaMaxima };
}

export function relatorioMelhorResposta(r: ResultadoMelhorResposta, info: { presetId: string; partidas: number; meses: number }): string {
  const linhas = [`# Melhor resposta — ${r.estrategia} (${info.presetId})`, ""];
  linhas.push(
    r.alerta
      ? `**ALERTA:** a melhor intensidade está na borda da grade e vence ${pct(r.melhor.taxaVitoria)} (> ${pct(LIMITES.vitoriaMaxima)}). Uma decisão extrema domina: rebalancear.`
      : `Sem alerta: a melhor intensidade vence ${pct(r.melhor.taxaVitoria)}${r.melhor.naBorda ? " (na borda da grade, mas dentro do limite)" : ""}.`,
    "",
  );
  linhas.push(`${info.partidas} partidas por ponto, ${info.meses} meses, confronto com as 7 estratégias.`, "");
  const nomes = Object.keys(r.grade).sort();
  linhas.push(`| ${nomes.join(" | ")} | Vitórias | Posição média | Lucro médio | Borda |`);
  linhas.push(`|${nomes.map(() => "---").join("|")}|---|---|---|---|`);
  for (const p of [...r.pontos].sort((a, b) => b.taxaVitoria - a.taxaVitoria)) {
    linhas.push(
      `| ${nomes.map((n) => p.intensidade[n]!.toFixed(3)).join(" | ")} | ${pct(p.taxaVitoria)} | ${p.posicaoMedia.toFixed(2)} | R$ ${p.lucroMedio.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} | ${p.naBorda ? "sim" : ""} |`,
    );
  }
  return `${linhas.join("\n")}\n`;
}
