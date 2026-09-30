/**
 * Teste de melhor resposta (seção 10.4): otimiza por busca em grade a intensidade de uma estratégia
 * contra as demais (confronto equilibrado) e verifica se a melhor combinação é uma decisão extrema e
 * trivial que vence demais.
 *
 * Quando a melhor combinação cai na borda da grade, a busca **estende** a grade um passo naquela
 * direção (até `MAX_EXTENSOES` vezes) e para quando o resultado deixa de melhorar. Assim, um ótimo que
 * fica logo além da grade (pico interior) não dispara alerta; só dispara quando a vitória continua
 * crescendo em direção ao extremo — o sinal de uma decisão extrema dominante.
 */
import { ESTRATEGIAS, type Intensidade } from "@simulador/motor";
import { calcularMetricas, LIMITES, porcentagem as pct } from "./metricas";
import { executarLote } from "./execucao";
import { PoolDeTrabalhadores } from "./paralelo";

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
  /** Grade final, incluindo as extensões. */
  grade: Grade;
  pontos: PontoDaGrade[];
  melhor: PontoDaGrade;
  /** Quantas vezes a grade foi estendida além da borda. */
  extensoes: number;
  /** A melhor resposta continua na borda depois das extensões e vence mais que o limite: rebalancear. */
  alerta: boolean;
}

export const MAX_EXTENSOES = 3;

const melhorPonto = (pontos: readonly PontoDaGrade[]) => [...pontos].sort((a, b) => b.taxaVitoria - a.taxaVitoria || a.posicaoMedia - b.posicaoMedia)[0]!;

/** Parâmetros em que a intensidade está na ponta da grade, com a direção para estender (+1 ou −1). */
export function bordasDe(intensidade: Intensidade, grade: Grade): { nome: string; direcao: 1 | -1 }[] {
  const saida: { nome: string; direcao: 1 | -1 }[] = [];
  for (const [nome, valores] of Object.entries(grade)) {
    if (valores.length < 2) continue;
    const v = intensidade[nome]!;
    if (v === Math.max(...valores)) saida.push({ nome, direcao: 1 });
    else if (v === Math.min(...valores)) saida.push({ nome, direcao: -1 });
  }
  return saida;
}

/**
 * Próximo valor além da ponta: um passo igual ao espaçamento entre os dois últimos valores daquele lado.
 * Devolve `null` se o passo cruzaria zero num parâmetro não negativo (ex.: publicidade, margem).
 */
export function proximoValor(valores: readonly number[], direcao: 1 | -1): number | null {
  const ordenados = [...valores].sort((a, b) => a - b);
  const [ponta, vizinho] = direcao === 1 ? [ordenados.at(-1)!, ordenados.at(-2)!] : [ordenados[0]!, ordenados[1]!];
  const passo = Math.abs(ponta - vizinho);
  if (passo === 0) return null;
  const novo = ponta + direcao * passo;
  if (ponta >= 0 && novo < 0) return ponta > 0 ? 0 : null;
  return novo;
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
  const grade: Record<string, number[]> = Object.fromEntries(Object.entries(opcoes.grade ?? gradePadrao(opcoes.estrategia)).map(([k, v]) => [k, [...v]]));
  const pontos: PontoDaGrade[] = [];
  const todas = combinacoes(grade);
  let extensoes = 0;
  // Um pool só para a busca inteira: os mesmos workers atendem todos os pontos.
  const pool = opcoes.trabalhadores > 1 && opcoes.partidas > 1 ? new PoolDeTrabalhadores(Math.min(opcoes.trabalhadores, opcoes.partidas)) : null;
  const avaliar = async (intensidade: Intensidade): Promise<PontoDaGrade> => {
    const base = { presetId: opcoes.presetId, confronto: "todos" as const, prefixo: opcoes.prefixo, meses: opcoes.meses, intensidadeFixa: { estrategia: opcoes.estrategia, intensidade } };
    const resultados = pool ? await pool.executar(base, opcoes.partidas) : executarLote({ ...base, indices: Array.from({ length: opcoes.partidas }, (_, i) => i) });
    const m = calcularMetricas(resultados).porEstrategia.find((x) => x.estrategia === opcoes.estrategia)!;
    return { intensidade, taxaVitoria: m.taxaVitoria, posicaoMedia: m.posicaoMedia, lucroMedio: m.lucroMedio, naBorda: false };
  };
  try {
    for (const [k, intensidade] of todas.entries()) {
      pontos.push(await avaliar(intensidade));
      opcoes.aoProgredir?.(k + 1, todas.length);
    }
    // Extensão: enquanto o melhor ponto estiver na borda, avança um passo em cada parâmetro de borda.
    let melhor = melhorPonto(pontos);
    while (extensoes < MAX_EXTENSOES) {
      const bordas = bordasDe(melhor.intensidade, grade);
      const novos: PontoDaGrade[] = [];
      for (const { nome, direcao } of bordas) {
        const valor = proximoValor(grade[nome]!, direcao);
        if (valor === null) continue;
        grade[nome]!.push(valor);
        novos.push(await avaliar({ ...melhor.intensidade, [nome]: valor }));
      }
      if (novos.length === 0) break;
      extensoes++;
      pontos.push(...novos);
      const novoMelhor = melhorPonto(pontos);
      if (novoMelhor === melhor) break; // estender não melhorou: o ótimo é interior
      melhor = novoMelhor;
    }
  } finally {
    pool?.encerrar();
  }
  for (const p of pontos) p.naBorda = bordasDe(p.intensidade, grade).length > 0;
  const melhor = melhorPonto(pontos);
  return { estrategia: opcoes.estrategia, grade, pontos, melhor, extensoes, alerta: melhor.naBorda && melhor.taxaVitoria > LIMITES.vitoriaMaxima };
}

export function relatorioMelhorResposta(r: ResultadoMelhorResposta, info: { presetId: string; partidas: number; meses: number }): string {
  const linhas = [`# Melhor resposta — ${r.estrategia} (${info.presetId})`, ""];
  linhas.push(
    r.alerta
      ? `**ALERTA:** mesmo depois de estender a grade, a melhor intensidade continua na borda e vence ${pct(r.melhor.taxaVitoria)} (> ${pct(LIMITES.vitoriaMaxima)}). Uma decisão extrema domina: rebalancear.`
      : `Sem alerta: a melhor intensidade vence ${pct(r.melhor.taxaVitoria)}${r.melhor.naBorda ? " (na borda da grade, mas dentro do limite)" : ""}.`,
    "",
  );
  linhas.push(
    `${info.partidas} partidas por ponto, ${info.meses} meses, confronto com as 7 estratégias. ` +
      (r.extensoes > 0 ? `A grade foi estendida ${r.extensoes} vez(es) além da borda para localizar o ótimo.` : "Sem extensão da grade."),
    "",
  );
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
