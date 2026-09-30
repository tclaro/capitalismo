/**
 * Confrontos do balanceamento: quais robôs entram em cada partida simulada.
 */
import { criarGerador, ESTRATEGIAS_DO_CONFRONTO, inteiroEntre, type RoboDaSimulacao } from "@simulador/motor";

export type TipoConfronto = "todos" | "subconjuntos" | "extremo";

export const TIPOS_CONFRONTO: readonly TipoConfronto[] = ["todos", "subconjuntos", "extremo"];

/**
 * Confrontos que entram na aprovação. Os critérios da seção 10.4 são definidos para o confronto
 * equilibrado (todas as estratégias no mercado) e o teste de melhor resposta (extremo). Em
 * subconjuntos de 4–5 empresas, a taxa "justa" de vitória já passa de 20–30%, e o limite de 40%
 * perde o sentido: o relatório é diagnóstico.
 */
export const CONFRONTOS_DE_APROVACAO: readonly TipoConfronto[] = ["todos", "extremo"];

/** Semente da i-ésima partida (0-based) de uma execução. */
export function sementeDaPartida(prefixo: string, i: number): string {
  return `${prefixo}-${String(i + 1).padStart(4, "0")}`;
}

/**
 * Robôs de uma partida:
 * - `todos`: as 7 estratégias, uma empresa cada (confronto equilibrado);
 * - `subconjuntos`: 4 ou 5 estratégias sorteadas pela semente, para testar mercados menores;
 * - `extremo`: as 7 mais a estratégia degenerada `preco_minimo` (teste de melhor resposta).
 */
export function robosDoConfronto(tipo: TipoConfronto, semente: string): RoboDaSimulacao[] {
  switch (tipo) {
    case "todos":
      return ESTRATEGIAS_DO_CONFRONTO.map((estrategia) => ({ estrategia }));
    case "extremo":
      return [...ESTRATEGIAS_DO_CONFRONTO, "preco_minimo"].map((estrategia) => ({ estrategia }));
    case "subconjuntos": {
      const g = criarGerador(semente, "confronto:subconjunto");
      const disponiveis = [...ESTRATEGIAS_DO_CONFRONTO];
      const tamanho = inteiroEntre(g, 4, 5);
      const escolhidas: string[] = [];
      for (let k = 0; k < tamanho; k++) escolhidas.push(disponiveis.splice(inteiroEntre(g, 0, disponiveis.length - 1), 1)[0]!);
      // Ordem canônica: a posição na lista (e o id da empresa) não depende da ordem do sorteio.
      return ESTRATEGIAS_DO_CONFRONTO.filter((e) => escolhidas.includes(e)).map((estrategia) => ({ estrategia }));
    }
  }
}
