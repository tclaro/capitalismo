import type { ParametrosFabricacao, ValorVariavel } from "@simulador/motor";
import { paraMetrico, receitaManual } from "../receitas";

/** Valor com variação relativa sorteada por semente (seção 10.3). */
export const faixa = (valor: number, variacao: number): ValorVariavel => ({ valor, variacao });

/** Converte reais para centavos inteiros (ex.: `reais(6)` = 600). */
export const reais = (valor: number): number => Math.round(valor * 100);

type CustosFabrica = Omit<ParametrosFabricacao, "unidadesPorLote" | "receita" | "pesoTecnologia">;

/**
 * Parâmetros de fabricação com a receita do Apêndice B do manual (proporções e pesos),
 * convertida para litro e quilograma. Os custos da fábrica são do preset.
 */
export function fabricacaoDoManual(produto: string, custos: CustosFabrica): ParametrosFabricacao {
  const r = receitaManual(produto);
  return {
    unidadesPorLote: r.unidadesPorLote,
    receita: r.insumos.map((i) => ({ produto: i.produto, quantidadePorLote: paraMetrico(i), pesoQualidade: i.pesoQualidade })),
    pesoTecnologia: r.pesoTecnologia,
    ...custos,
  };
}
