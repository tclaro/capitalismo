/**
 * Simulação de uma partida completa só com robôs (seção 10): base da CLI de balanceamento e da
 * pré-visualização do professor ("simular partida com robôs", seção 10.6).
 *
 * Devolve um resumo por empresa: pontuação final, lucro e receita acumulados, participação na
 * receita, uso do crédito emergencial e fotografias em meses escolhidos (ex.: mês 4, para medir se as
 * diferenças entre empresas aparecem cedo).
 */
import { criarPartida } from "./partida";
import { passoMutavel } from "./passo";
import { type CriterioPontuacao, ranking } from "./pontuacao";
import type { Preset } from "./preset";
import { ESTRATEGIAS } from "./robos";
import type { Intensidade } from "./robos/estrategias";

export interface RoboDaSimulacao {
  estrategia: string;
  intensidade?: Intensidade;
  /** Nome da empresa; padrão: o id da estratégia (com sufixo se repetida). */
  nome?: string;
}

export interface ConfigSimulacao {
  preset: Preset;
  semente: string;
  robos: readonly RoboDaSimulacao[];
  meses: number;
  /** Mercados paralelos; cada mercado recebe o mesmo conjunto de robôs. Padrão: 1. */
  mercados?: number;
  /** Meses em que tirar uma fotografia do desempenho. Padrão: [4]. */
  fotografias?: readonly number[];
  criterio?: CriterioPontuacao;
}

export interface Fotografia {
  lucroAcumulado: number;
  receitaAcumulada: number;
  participacaoReceita: number;
}

export interface ResumoEmpresaSimulada {
  id: string;
  nome: string;
  mercado: string;
  estrategia: string;
  intensidade: Intensidade;
  posicao: number;
  pontuacao: number;
  /** Centavos. */
  lucroAcumulado: number;
  /** Centavos. */
  receitaAcumulada: number;
  /** Fração da receita acumulada do mercado (0–1). */
  participacaoReceita: number;
  /** Centavos. */
  creditoFinal: number;
  mesesComCredito: number;
  maiorSequenciaDeMesesComCredito: number;
  fotografias: Record<number, Fotografia>;
}

export interface ResultadoSimulacao {
  semente: string;
  meses: number;
  ticks: number;
  mercados: { id: string; vencedor: string; estrategiaVencedora: string }[];
  empresas: ResumoEmpresaSimulada[];
}

function participacoesDoMercado(receitas: readonly { mercado: string; receita: number }[], mercado: string, receita: number): number {
  let total = 0;
  for (const r of receitas) if (r.mercado === mercado) total += r.receita;
  return total > 0 ? receita / total : 0;
}

export function simularPartida(config: ConfigSimulacao): ResultadoSimulacao {
  if (!Number.isInteger(config.meses) || config.meses < 1) throw new RangeError(`meses deve ser inteiro ≥ 1 (recebido ${config.meses})`);
  if (config.robos.length === 0) throw new RangeError("a simulação precisa de pelo menos um robô");
  for (const r of config.robos) if (!ESTRATEGIAS[r.estrategia]) throw new RangeError(`estratégia desconhecida: "${r.estrategia}"`);

  const quantidadeMercados = config.mercados ?? 1;
  const fotografias = [...(config.fotografias ?? [4])].filter((m) => m >= 1 && m <= config.meses).sort((a, b) => a - b);
  const repeticoes = new Map<string, number>();
  const nomes = config.robos.map((r) => {
    if (r.nome) return r.nome;
    const n = (repeticoes.get(r.estrategia) ?? 0) + 1;
    repeticoes.set(r.estrategia, n);
    return n === 1 ? r.estrategia : `${r.estrategia}_${n}`;
  });

  let estado = criarPartida({
    preset: config.preset,
    semente: config.semente,
    mercados: Array.from({ length: quantidadeMercados }, (_, i) => ({ nome: `Mercado ${i + 1}` })),
    empresas: Array.from({ length: quantidadeMercados }).flatMap((_, m) =>
      config.robos.map((r, k) => ({
        nome: quantidadeMercados > 1 ? `${nomes[k]} (M${m + 1})` : nomes[k]!,
        mercado: m,
        robo: r.intensidade ? { estrategia: r.estrategia, intensidade: r.intensidade } : { estrategia: r.estrategia },
      })),
    ),
  });

  const ticks = config.meses * estado.parametros.ticksPorMes;
  const sequencia = new Map(estado.empresas.map((e) => [e.id, { atual: 0, maior: 0, total: 0 }]));
  const fotos = new Map<string, Record<number, Fotografia>>(estado.empresas.map((e) => [e.id, {}]));

  for (let t = 1; t <= ticks; t++) {
    const r = passoMutavel(estado);
    estado = r.estado;
    if (r.fechamentos.length === 0) continue;
    const mes = r.historico.mes;
    for (const e of estado.empresas) {
      const s = sequencia.get(e.id)!;
      if (e.creditoEmergencial > 0) {
        s.atual++;
        s.total++;
        s.maior = Math.max(s.maior, s.atual);
      } else s.atual = 0;
    }
    if (fotografias.includes(mes)) {
      const receitas = estado.empresas.map((e) => ({ mercado: e.mercado, receita: e.contabil.receitaAcumulada }));
      for (const e of estado.empresas) {
        fotos.get(e.id)![mes] = {
          lucroAcumulado: e.contabil.lucrosAcumulados,
          receitaAcumulada: e.contabil.receitaAcumulada,
          participacaoReceita: participacoesDoMercado(receitas, e.mercado, e.contabil.receitaAcumulada),
        };
      }
    }
  }

  const criterio = config.criterio ?? "lucro_acumulado";
  const posicoes = new Map<string, { posicao: number; pontuacao: number }>();
  const mercados = estado.mercados.map((m) => {
    const r = ranking(estado, m.id, criterio);
    for (const p of r) posicoes.set(p.empresa, { posicao: p.posicao, pontuacao: p.pontuacao });
    const vencedor = estado.empresas.find((e) => e.id === r[0]!.empresa)!;
    return { id: m.id, vencedor: vencedor.id, estrategiaVencedora: vencedor.robo!.estrategia };
  });
  const receitas = estado.empresas.map((e) => ({ mercado: e.mercado, receita: e.contabil.receitaAcumulada }));

  return {
    semente: config.semente,
    meses: config.meses,
    ticks,
    mercados,
    empresas: estado.empresas.map((e) => ({
      id: e.id,
      nome: e.nome,
      mercado: e.mercado,
      estrategia: e.robo!.estrategia,
      intensidade: { ...e.robo!.intensidade },
      posicao: posicoes.get(e.id)!.posicao,
      pontuacao: posicoes.get(e.id)!.pontuacao,
      lucroAcumulado: e.contabil.lucrosAcumulados,
      receitaAcumulada: e.contabil.receitaAcumulada,
      participacaoReceita: participacoesDoMercado(receitas, e.mercado, e.contabil.receitaAcumulada),
      creditoFinal: e.creditoEmergencial,
      mesesComCredito: sequencia.get(e.id)!.total,
      maiorSequenciaDeMesesComCredito: sequencia.get(e.id)!.maior,
      fotografias: fotos.get(e.id)!,
    })),
  };
}
