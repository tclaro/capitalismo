/**
 * Calendário do jogo visto pela interface e pelo servidor: meses de `ticksPorMes` dias e semanas em
 * 4 blocos por mês (dias 1–7, 8–14, 15–21 e 22 até o fim). São as fronteiras do histórico semanal e
 * do "avançar 1 semana" do professor. (Os robôs revisam decisões num calendário próprio, definido no
 * motor: `diaDeDecisaoDosRobos`.)
 */

export interface DataDoJogo {
  mes: number;
  dia: number;
  /** Semana do mês, 1 a 4. */
  semana: number;
}

/** Data do tick (1 = primeiro dia do mês 1). O tick 0 é o instante antes do primeiro dia. */
export function dataDoTick(tick: number, ticksPorMes: number): DataDoJogo {
  if (tick <= 0) return { mes: 1, dia: 0, semana: 1 };
  const mes = Math.floor((tick - 1) / ticksPorMes) + 1;
  const dia = tick - (mes - 1) * ticksPorMes;
  return { mes, dia, semana: semanaDoDia(dia, ticksPorMes) };
}

export function semanaDoDia(dia: number, ticksPorMes: number): number {
  const limites = fronteirasDeSemana(ticksPorMes);
  return limites.findIndex((limite) => dia <= limite) + 1 || limites.length;
}

/** Dias que fecham semana: 7, 14, 21 e o último dia do mês (escalados se o mês não tiver 30 dias). */
export function fronteirasDeSemana(ticksPorMes: number): number[] {
  const escala = ticksPorMes / 30;
  const internas = [7, 14, 21].map((d) => Math.max(1, Math.round(d * escala)));
  return [...new Set([...internas, ticksPorMes])].filter((d) => d <= ticksPorMes).sort((a, b) => a - b);
}

export function ehFronteiraDeSemana(tick: number, ticksPorMes: number): boolean {
  if (tick <= 0) return false;
  return fronteirasDeSemana(ticksPorMes).includes(dataDoTick(tick, ticksPorMes).dia);
}

export function ehFimDoMes(tick: number, ticksPorMes: number): boolean {
  return tick > 0 && tick % ticksPorMes === 0;
}

/** Quantos ticks faltam, a partir do tick atual, para chegar à próxima fronteira (sempre ≥ 1). */
export function ticksAteProxima(tick: number, ticksPorMes: number, unidade: "tick" | "semana" | "mes"): number {
  if (unidade === "tick") return 1;
  for (let t = tick + 1; ; t++) {
    if (unidade === "mes" ? ehFimDoMes(t, ticksPorMes) : ehFronteiraDeSemana(t, ticksPorMes)) return t - tick;
  }
}

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** "Mês 3 (mar), dia 14" — o ano do jogo começa em janeiro. */
export function descreverData(tick: number, ticksPorMes: number): string {
  const { mes, dia } = dataDoTick(tick, ticksPorMes);
  if (dia === 0) return "Antes do início";
  const ano = Math.floor((mes - 1) / 12) + 1;
  return `Ano ${ano}, ${MESES[(mes - 1) % 12]}, dia ${dia}`;
}
