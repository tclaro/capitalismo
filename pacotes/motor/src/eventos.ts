/**
 * Eventos do cenário (seção 6.15, passo 1): um evento genérico altera um parâmetro numérico do
 * estado, identificado por um caminho. Eventos específicos (recessão, alta do insumo, ...) são
 * montados sobre este na fase 2.
 */
import type { EstadoPartida, EventoAlterarParametro } from "./tipos";

const RAIZES_PERMITIDAS = new Set(["parametros", "mercados"]);
/** Parâmetros estruturais que não podem mudar com a partida em andamento. */
const CAMINHOS_BLOQUEADOS = new Set(["parametros.ticksPorMes"]);

type No = Record<string, unknown> | unknown[];

function filho(no: No, segmento: string): unknown {
  if (Array.isArray(no)) return no.find((x) => typeof x === "object" && x !== null && (x as { id?: unknown }).id === segmento);
  return Object.hasOwn(no, segmento) ? no[segmento] : undefined;
}

/**
 * Aplica o evento ao estado. Devolve `null` se aplicou, ou o motivo da rejeição.
 * Regras: o caminho deve existir e apontar para um número; o novo valor deve ser finito e não pode
 * trocar o sinal do valor atual (parâmetros negativos, como a fidelidade mínima, continuam negativos).
 */
export function aplicarEvento(estado: EstadoPartida, evento: EventoAlterarParametro): string | null {
  const segmentos = evento.caminho.split(".");
  if (segmentos.length < 2 || !RAIZES_PERMITIDAS.has(segmentos[0]!)) {
    return `caminho "${evento.caminho}" deve começar por parametros. ou mercados.`;
  }
  if (CAMINHOS_BLOQUEADOS.has(evento.caminho)) return `"${evento.caminho}" não pode mudar com a partida em andamento`;
  if (!Number.isFinite(evento.valor)) return `valor não finito (${evento.valor})`;

  let no: unknown = estado as unknown as Record<string, unknown>;
  for (const s of segmentos.slice(0, -1)) {
    if (typeof no !== "object" || no === null) return `caminho "${evento.caminho}" não existe`;
    no = filho(no as No, s);
  }
  const ultimo = segmentos[segmentos.length - 1]!;
  if (typeof no !== "object" || no === null || Array.isArray(no)) return `caminho "${evento.caminho}" não existe`;
  const alvo = no as Record<string, unknown>;
  if (!Object.hasOwn(alvo, ultimo)) return `caminho "${evento.caminho}" não existe`;
  const atual = alvo[ultimo];
  if (typeof atual !== "number") return `caminho "${evento.caminho}" não é um parâmetro numérico`;
  if ((atual >= 0 && evento.valor < 0) || (atual < 0 && evento.valor > 0)) {
    return `valor ${evento.valor} troca o sinal do parâmetro (atual ${atual})`;
  }
  alvo[ultimo] = evento.valor === 0 ? 0 : evento.valor;
  return null;
}
