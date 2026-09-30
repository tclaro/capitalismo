/**
 * Formatação para as telas (padrão brasileiro). Dinheiro sempre por `formatarReais` (centavos
 * inteiros, sem float).
 */
import { formatarReais, type InfoSala } from "@simulador/compartilhado";

export { formatarReais };

/** Fração (0..1) como porcentagem: 0,123 → "12,3%". */
export function formatarPercentual(fracao: number, casas = 1): string {
  return `${(fracao * 100).toFixed(casas).replace(".", ",")}%`;
}

/** Número com separador de milhar: 12345,6 → "12.345,6". */
export function formatarNumero(n: number, casas = 0): string {
  const [inteiro, decimal] = Math.abs(n).toFixed(casas).split(".") as [string, string | undefined];
  const comMilhar = inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${n < 0 && Number(n.toFixed(casas)) !== 0 ? "-" : ""}${comMilhar}${decimal ? `,${decimal}` : ""}`;
}

/** Pontuação do ranking na unidade do critério (reais ou pontos de participação). */
export function formatarPontuacao(pontuacao: number, criterio: InfoSala["criterio"]): string {
  return criterio === "lucro_acumulado" ? formatarReais(Math.round(pontuacao * 100)) : `${formatarNumero(pontuacao, 1)} pts`;
}

/** Segundos por tick como texto: 0,5 → "0,5 s por dia". */
export function formatarVelocidade(segundosPorTick: number): string {
  return `${formatarNumero(segundosPorTick, segundosPorTick % 1 === 0 ? 0 : 1)} s por dia`;
}

/** Hora local de um instante ISO: "14:05:09". */
export function formatarHora(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "?" : d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
