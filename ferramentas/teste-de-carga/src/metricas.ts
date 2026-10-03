/**
 * Contas do teste de carga sem rede: plano de equipes, percentis, resumo e critérios de aprovação.
 */
import { PALETA_EQUIPES } from "@simulador/compartilhado";

export interface PlanoDeAluno {
  /** Índice do aluno (0-based). */
  aluno: number;
  nome: string;
  empresa: string;
  /** O primeiro aluno de cada equipe a cria; os demais entram nela. */
  tipo: "nova" | "existente";
  /** Só para equipe nova. */
  nomeDaEquipe?: string;
  cor?: string;
}

export const idDaEmpresa = (n: number) => `emp_${String(n).padStart(2, "0")}`;

/**
 * Distribui `alunos` em equipes: tantas quantas as vagas deixam (mercados × vagas), ou menos se há
 * poucos alunos. Os primeiros `equipes` alunos criam uma equipe cada (as empresas na ordem das vagas,
 * com uma cor diferente dentro de cada mercado); os demais entram nas equipes em rodízio.
 */
export function planoDeEquipes(alunos: number, mercados: number, vagasPorMercado: number): PlanoDeAluno[] {
  if (!Number.isInteger(alunos) || alunos < 1) throw new RangeError("alunos deve ser inteiro ≥ 1");
  const vagas = mercados * vagasPorMercado;
  const equipes = Math.min(alunos, vagas);
  const plano: PlanoDeAluno[] = [];
  for (let i = 0; i < alunos; i++) {
    const nome = `Aluno ${String(i + 1).padStart(2, "0")}`;
    if (i < equipes) {
      const vagaNoMercado = i % vagasPorMercado;
      plano.push({ aluno: i, nome, empresa: idDaEmpresa(i + 1), tipo: "nova", nomeDaEquipe: `Equipe ${String(i + 1).padStart(2, "0")}`, cor: PALETA_EQUIPES[vagaNoMercado % PALETA_EQUIPES.length]!.id });
    } else {
      plano.push({ aluno: i, nome, empresa: idDaEmpresa(((i - equipes) % equipes) + 1), tipo: "existente" });
    }
  }
  return plano;
}

/** Percentil `p` (0–100) pelo método do vizinho mais próximo; `NaN` para lista vazia. */
export function percentil(valores: readonly number[], p: number): number {
  if (valores.length === 0) return Number.NaN;
  const s = [...valores].sort((a, b) => a - b);
  const k = Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1));
  return s[k]!;
}

export interface ResumoNumerico {
  n: number;
  media: number;
  p50: number;
  p95: number;
  max: number;
}

export function resumir(valores: readonly number[]): ResumoNumerico {
  const n = valores.length;
  return { n, media: n ? valores.reduce((s, x) => s + x, 0) / n : Number.NaN, p50: percentil(valores, 50), p95: percentil(valores, 95), max: n ? Math.max(...valores) : Number.NaN };
}

/** Limites de aprovação do teste de carga (documentados em docs/guia-ti.md e no roteiro do piloto). */
export const LIMITES = {
  /** Falhas na entrada (HTTP) ou na abertura do WebSocket. */
  falhasDeEntrada: 0,
  /** Conexões que caíram durante o teste. */
  quedas: 0,
  /** Latência da resposta a um comando (decidir), no percentil 95, em ms. */
  latenciaP95Ms: 250,
  /** Fração máxima de comandos sem resposta ou recusados por limite de ritmo. */
  fracaoDeComandosComProblema: 0.01,
  /** Atraso máximo do relógio: ticks jogados abaixo do esperado, em fração. */
  atrasoDoRelogio: 0.05,
  /** Intervalo entre atualizações no percentil 95, em relação ao nominal. */
  intervaloP95Relativo: 1.5,
} as const;

export interface EntradaDosCriterios {
  alunos: number;
  falhasDeEntrada: number;
  quedas: number;
  latencias: readonly number[];
  comandosEnviados: number;
  comandosComProblema: number;
  ticksEsperados: number;
  ticksJogados: number;
  intervalosMs: readonly number[];
  segundosPorTick: number;
}

export interface CriterioDeCarga {
  id: string;
  descricao: string;
  valor: string;
  limite: string;
  passou: boolean;
}

const f = (x: number, casas = 1) => (Number.isFinite(x) ? x.toFixed(casas).replace(".", ",") : "—");

export function criteriosDeCarga(e: EntradaDosCriterios): CriterioDeCarga[] {
  const lat = resumir(e.latencias);
  const intervalo = resumir(e.intervalosMs);
  const atraso = e.ticksEsperados > 0 ? Math.max(0, (e.ticksEsperados - e.ticksJogados) / e.ticksEsperados) : 0;
  const fracaoProblema = e.comandosEnviados > 0 ? e.comandosComProblema / e.comandosEnviados : 0;
  const nominalMs = e.segundosPorTick * 1000;
  return [
    { id: "entrada", descricao: "Todos os alunos entram e abrem a conexão", valor: `${e.alunos - e.falhasDeEntrada} de ${e.alunos}`, limite: `${LIMITES.falhasDeEntrada} falhas`, passou: e.falhasDeEntrada <= LIMITES.falhasDeEntrada },
    { id: "quedas", descricao: "Nenhuma conexão cai durante o teste", valor: `${e.quedas} queda(s)`, limite: `${LIMITES.quedas}`, passou: e.quedas <= LIMITES.quedas },
    { id: "latencia", descricao: "Resposta a um comando no percentil 95", valor: `${f(lat.p95)} ms (mediana ${f(lat.p50)} ms, máx. ${f(lat.max)} ms)`, limite: `≤ ${LIMITES.latenciaP95Ms} ms`, passou: lat.n === 0 ? false : lat.p95 <= LIMITES.latenciaP95Ms },
    { id: "comandos", descricao: "Comandos sem resposta ou recusados", valor: `${e.comandosComProblema} de ${e.comandosEnviados} (${f(100 * fracaoProblema)}%)`, limite: `≤ ${f(100 * LIMITES.fracaoDeComandosComProblema)}%`, passou: fracaoProblema <= LIMITES.fracaoDeComandosComProblema },
    { id: "relogio", descricao: "O relógio acompanha o ritmo pedido", valor: `${e.ticksJogados} de ${e.ticksEsperados} dias (atraso ${f(100 * atraso)}%)`, limite: `atraso ≤ ${f(100 * LIMITES.atrasoDoRelogio)}%`, passou: atraso <= LIMITES.atrasoDoRelogio },
    { id: "intervalo", descricao: "Intervalo entre as atualizações recebidas no percentil 95", valor: `${f(intervalo.p95, 0)} ms (nominal ${f(nominalMs, 0)} ms)`, limite: `≤ ${f(LIMITES.intervaloP95Relativo * nominalMs, 0)} ms`, passou: intervalo.n === 0 ? false : intervalo.p95 <= LIMITES.intervaloP95Relativo * nominalMs },
  ];
}
