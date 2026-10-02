/**
 * Contexto de um tick: o estado (já copiado, mutável), o tempo do tick, índices e as saídas que
 * as etapas vão preenchendo. Nada daqui além do `estado` é persistido.
 */
import {
  type Aviso,
  DIAS_POR_MES,
  type EstadoEmpresa,
  type EstadoMercado,
  type EstadoPartida,
  type FechamentoMensal,
  type HistoricoTick,
  type Lancamento,
  type ProdutoResolvido,
  type Rejeicao,
} from "./tipos";

export interface Contexto {
  estado: EstadoPartida;
  /** Tick sendo processado (1 = primeiro). */
  tick: number;
  mes: number;
  /** Dia do mês, 1..ticksPorMes. */
  dia: number;
  ticksPorMes: number;
  fimDoMes: boolean;
  /** Dias de jogo por tick (30 / ticksPorMes). */
  diasPorTick: number;
  produtos: Map<string, ProdutoResolvido>;
  mercados: Map<string, EstadoMercado>;
  empresas: Map<string, EstadoEmpresa>;
  avisos: Aviso[];
  rejeicoes: Rejeicao[];
  lancamentos: Lancamento[];
  fechamentos: { empresa: string; fechamento: FechamentoMensal }[];
  /** Ordens de venda à cooperativa dadas neste tick (decisões do passo 2), executadas no passo 5. */
  vendasCooperativa: { empresa: string; produto: string; quantidade: number }[];
  /** Lotes únicos de desova no atacado dados neste tick (troca de atividade), vendidos no passo 5. */
  lotesAtacado: { empresa: string; produto: string; quantidade: number; preco: number }[];
  historico: HistoricoTick;
}

export function tempoDoTick(tick: number, ticksPorMes: number): { mes: number; dia: number; fimDoMes: boolean } {
  const mes = Math.floor((tick - 1) / ticksPorMes) + 1;
  const dia = tick - (mes - 1) * ticksPorMes;
  return { mes, dia, fimDoMes: dia === ticksPorMes };
}

export function criarContexto(estado: EstadoPartida): Contexto {
  const n = estado.parametros.ticksPorMes;
  const tick = estado.tick;
  const { mes, dia, fimDoMes } = tempoDoTick(tick, n);
  return {
    estado,
    tick,
    mes,
    dia,
    ticksPorMes: n,
    fimDoMes,
    diasPorTick: DIAS_POR_MES / n,
    produtos: new Map(estado.parametros.produtos.map((p) => [p.id, p])),
    mercados: new Map(estado.mercados.map((m) => [m.id, m])),
    empresas: new Map(estado.empresas.map((e) => [e.id, e])),
    avisos: [],
    rejeicoes: [],
    lancamentos: [],
    fechamentos: [],
    vendasCooperativa: [],
    lotesAtacado: [],
    historico: { tick, mes, dia, ofertas: [], demandaTotal: [] },
  };
}

/** Converte um prazo em dias de jogo para ticks (arredondando para cima). */
export function prazoEmTicks(dias: number, ctx: Contexto): number {
  return Math.ceil(dias / ctx.diasPorTick - 1e-9);
}
