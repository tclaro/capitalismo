/**
 * Robôs: sorteio da intensidade, cadência de decisão e etapa do tick (passo 13 da seção 6.15).
 *
 * Os robôs decidem no fim de cada semana (dias 7, 14, 21 e último dia do mês) e ao criar a partida.
 * As decisões ficam em `decisoesPendentes` e valem a partir do tick seguinte, a mesma latência das
 * equipes. Assim, o replay de uma partida só precisa do log das decisões humanas.
 */
import { type Gerador, uniforme } from "../aleatorio";
import type { Contexto } from "../contexto";
import type { Decisao, EstadoPartida } from "../tipos";
import { visaoDaEmpresa } from "../visao";
import { ESTRATEGIAS, type Intensidade } from "./estrategias";

export { ESTRATEGIAS, ESTRATEGIAS_RAZOAVEIS, type Estrategia, type Intensidade } from "./estrategias";

export const DIAS_DE_DECISAO_NA_SEMANA = 7;

/** Sorteia a intensidade de uma estratégia; valores já informados são mantidos. */
export function sortearIntensidade(estrategiaId: string, g: Gerador, informada: Intensidade = {}): Intensidade {
  const estrategia = ESTRATEGIAS[estrategiaId];
  if (!estrategia) throw new Error(`estratégia de robô desconhecida: "${estrategiaId}"`);
  const intensidade: Intensidade = {};
  for (const [nome, [min, max]] of Object.entries(estrategia.faixas)) {
    const sorteado = uniforme(g, min, max); // sorteia sempre, para a sequência não depender do que foi informado
    intensidade[nome] = informada[nome] ?? sorteado;
  }
  return intensidade;
}

/** Decisões do robô para o estado atual (a partir da visão da empresa). */
export function decidirRobo(estado: EstadoPartida, empresaId: string): Decisao[] {
  const empresa = estado.empresas.find((e) => e.id === empresaId)!;
  const robo = empresa.robo!;
  const estrategia = ESTRATEGIAS[robo.estrategia]!;
  return estrategia.decidir(visaoDaEmpresa(estado, empresaId), robo.intensidade, robo.gerador);
}

/** Dia de revisão das decisões dos robôs? */
export function diaDeDecisaoDosRobos(dia: number, ticksPorMes: number): boolean {
  return dia === ticksPorMes || dia % DIAS_DE_DECISAO_NA_SEMANA === 0;
}

/** Passo 13: decisões dos robôs para o próximo tick. */
export function etapaRobos(ctx: Contexto): void {
  if (!diaDeDecisaoDosRobos(ctx.dia, ctx.ticksPorMes)) return;
  for (const empresa of ctx.estado.empresas) {
    if (empresa.robo) ctx.estado.decisoesPendentes.push(...decidirRobo(ctx.estado, empresa.id));
  }
}
