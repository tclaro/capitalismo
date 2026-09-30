/**
 * Métricas de aceite do balanceamento (seção 10.4), com as definições operacionais do plano da fase 0.
 */
import { ESTRATEGIAS_RAZOAVEIS, type ResultadoSimulacao } from "@simulador/motor";

/** Limites dos critérios de aceite. Valores iniciais a discutir (seção 10.4). */
export const LIMITES = {
  /** Nenhuma estratégia vence mais que isto no confronto equilibrado. */
  vitoriaMaxima: 0.4,
  /** Toda estratégia razoável vence pelo menos isto. */
  vitoriaMinimaRazoavel: 0.1,
  /** Passiva e aleatória "quase nunca" vencem. */
  vitoriaMaximaLinhaDeBase: 0.05,
  /** Diferença mínima de participação na receita (1ª − última) no mês de checagem. */
  diferencaVisivel: 0.05,
  /** Fração mínima das partidas em que essa diferença já aparece. */
  fracaoPartidasComDiferenca: 0.9,
  /** Meses seguidos com crédito emergencial a partir dos quais o caixa negativo é "prolongado". */
  mesesDeCreditoProlongado: 2,
  /** Fração máxima das empresas razoáveis com caixa negativo prolongado. */
  fracaoCreditoProlongado: 0.1,
  /** A estratégia degenerada do teste de melhor resposta não pode vencer mais que isto. */
  vitoriaMaximaExtrema: 0.15,
} as const;

export const MES_DE_CHECAGEM = 4;
const LINHA_DE_BASE = ["passiva", "aleatoria"];

export interface MetricaEstrategia {
  estrategia: string;
  partidas: number;
  vitorias: number;
  taxaVitoria: number;
  posicaoMedia: number;
  /** Reais. */
  lucroMedio: number;
  lucroMediano: number;
  receitaMedia: number;
  participacaoMedia: number;
  fracaoCreditoProlongado: number;
}

export interface Criterio {
  id: string;
  descricao: string;
  valor: string;
  limite: string;
  passou: boolean;
}

export interface Metricas {
  partidas: number;
  porEstrategia: MetricaEstrategia[];
  fracaoPartidasComDiferencaVisivel: number;
  fracaoRazoaveisComCreditoProlongado: number;
  criterios: Criterio[];
  aprovado: boolean;
}

/** Fração formatada como porcentagem em pt-BR, com uma casa (ex.: 0,7 → "70,0%"). */
export const porcentagem = (x: number) => `${(100 * x).toFixed(1).replace(".", ",")}%`;
const pct = porcentagem;

function mediana(xs: readonly number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/**
 * Calcula as métricas sobre um conjunto de simulações. Uma "partida" é um mercado de uma simulação;
 * a vitória é da maior pontuação no mercado (empate pelo id da empresa, já resolvido no ranking).
 */
export function calcularMetricas(resultados: readonly ResultadoSimulacao[], opcoes: { estrategiaExtrema?: string } = {}): Metricas {
  const estrategias = [...new Set(resultados.flatMap((r) => r.empresas.map((e) => e.estrategia)))].sort();
  const porEstrategia: MetricaEstrategia[] = [];
  let partidas = 0;
  let comDiferenca = 0;

  for (const r of resultados) {
    for (const m of r.mercados) {
      partidas++;
      const doMercado = r.empresas.filter((e) => e.mercado === m.id);
      const participacoes = doMercado.map((e) => e.fotografias[MES_DE_CHECAGEM]?.participacaoReceita ?? e.participacaoReceita);
      if (Math.max(...participacoes) - Math.min(...participacoes) >= LIMITES.diferencaVisivel) comDiferenca++;
    }
  }

  for (const estrategia of estrategias) {
    const empresas = resultados.flatMap((r) => r.empresas.filter((e) => e.estrategia === estrategia));
    const vitorias = resultados.reduce((s, r) => s + r.mercados.filter((m) => m.estrategiaVencedora === estrategia).length, 0);
    const n = empresas.length;
    porEstrategia.push({
      estrategia,
      partidas: n,
      vitorias,
      taxaVitoria: n > 0 ? vitorias / n : 0,
      posicaoMedia: n > 0 ? empresas.reduce((s, e) => s + e.posicao, 0) / n : 0,
      lucroMedio: n > 0 ? empresas.reduce((s, e) => s + e.lucroAcumulado, 0) / n / 100 : 0,
      lucroMediano: mediana(empresas.map((e) => e.lucroAcumulado / 100)),
      receitaMedia: n > 0 ? empresas.reduce((s, e) => s + e.receitaAcumulada, 0) / n / 100 : 0,
      participacaoMedia: n > 0 ? empresas.reduce((s, e) => s + e.participacaoReceita, 0) / n : 0,
      fracaoCreditoProlongado: n > 0 ? empresas.filter((e) => e.maiorSequenciaDeMesesComCredito >= LIMITES.mesesDeCreditoProlongado).length / n : 0,
    });
  }

  const razoaveis = resultados.flatMap((r) => r.empresas.filter((e) => ESTRATEGIAS_RAZOAVEIS.includes(e.estrategia)));
  const fracaoRazoaveisComCreditoProlongado =
    razoaveis.length > 0 ? razoaveis.filter((e) => e.maiorSequenciaDeMesesComCredito >= LIMITES.mesesDeCreditoProlongado).length / razoaveis.length : 0;
  const fracaoPartidasComDiferencaVisivel = partidas > 0 ? comDiferenca / partidas : 0;

  const criterios: Criterio[] = [];
  const maior = [...porEstrategia].filter((m) => m.estrategia !== opcoes.estrategiaExtrema).sort((a, b) => b.taxaVitoria - a.taxaVitoria)[0];
  if (maior) {
    criterios.push({
      id: "vitoria_maxima",
      descricao: "Nenhuma estratégia vence mais de ~40% das partidas",
      valor: `${maior.estrategia}: ${pct(maior.taxaVitoria)}`,
      limite: `≤ ${pct(LIMITES.vitoriaMaxima)}`,
      passou: maior.taxaVitoria <= LIMITES.vitoriaMaxima,
    });
  }
  for (const m of porEstrategia.filter((x) => ESTRATEGIAS_RAZOAVEIS.includes(x.estrategia))) {
    criterios.push({
      id: `vitoria_minima:${m.estrategia}`,
      descricao: `Estratégia razoável "${m.estrategia}" vence pelo menos ~10%`,
      valor: pct(m.taxaVitoria),
      limite: `≥ ${pct(LIMITES.vitoriaMinimaRazoavel)}`,
      passou: m.taxaVitoria >= LIMITES.vitoriaMinimaRazoavel,
    });
  }
  for (const m of porEstrategia.filter((x) => LINHA_DE_BASE.includes(x.estrategia))) {
    criterios.push({
      id: `linha_de_base:${m.estrategia}`,
      descricao: `"${m.estrategia}" quase nunca vence (decidir bem precisa importar)`,
      valor: pct(m.taxaVitoria),
      limite: `≤ ${pct(LIMITES.vitoriaMaximaLinhaDeBase)}`,
      passou: m.taxaVitoria <= LIMITES.vitoriaMaximaLinhaDeBase,
    });
  }
  criterios.push({
    id: "diferencas_visiveis",
    descricao: `Diferenças visíveis até o mês ${MES_DE_CHECAGEM} (participação 1ª − última ≥ ${pct(LIMITES.diferencaVisivel)})`,
    valor: pct(fracaoPartidasComDiferencaVisivel),
    limite: `≥ ${pct(LIMITES.fracaoPartidasComDiferenca)} das partidas`,
    passou: fracaoPartidasComDiferencaVisivel >= LIMITES.fracaoPartidasComDiferenca,
  });
  criterios.push({
    id: "credito_prolongado",
    descricao: `Poucas empresas razoáveis com caixa negativo prolongado (≥ ${LIMITES.mesesDeCreditoProlongado} meses seguidos com crédito emergencial)`,
    valor: pct(fracaoRazoaveisComCreditoProlongado),
    limite: `≤ ${pct(LIMITES.fracaoCreditoProlongado)}`,
    passou: fracaoRazoaveisComCreditoProlongado <= LIMITES.fracaoCreditoProlongado,
  });
  if (opcoes.estrategiaExtrema) {
    const extrema = porEstrategia.find((m) => m.estrategia === opcoes.estrategiaExtrema);
    criterios.push({
      id: "melhor_resposta_extrema",
      descricao: `Decisão extrema e trivial ("${opcoes.estrategiaExtrema}") não vence`,
      valor: extrema ? pct(extrema.taxaVitoria) : "—",
      limite: `≤ ${pct(LIMITES.vitoriaMaximaExtrema)}`,
      passou: extrema ? extrema.taxaVitoria <= LIMITES.vitoriaMaximaExtrema : false,
    });
  }

  return {
    partidas,
    porEstrategia,
    fracaoPartidasComDiferencaVisivel,
    fracaoRazoaveisComCreditoProlongado,
    criterios,
    aprovado: criterios.every((c) => c.passou),
  };
}
