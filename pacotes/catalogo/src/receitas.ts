/**
 * Receitas do Apêndice B do manual do Capitalism II ("Manufacturer's Guide"), nas unidades originais.
 *
 * Servem como **ponto de partida da calibração** (decisão 13), não como valores finais. Por ora só
 * os produtos fabricados de algum preset; acrescentar outros é incluir dados aqui.
 */

export type UnidadeManual = "unidade" | "par" | "quart" | "lb" | "oz" | "barril" | "duzia";

export interface InsumoManual {
  readonly produto: string;
  readonly quantidade: number;
  readonly unidade: UnidadeManual;
  /** Peso na qualidade final, em pontos percentuais. */
  readonly pesoQualidade: number;
}

export interface ReceitaManual {
  readonly produto: string;
  readonly unidadesPorLote: number;
  readonly unidadeLote: UnidadeManual;
  readonly insumos: readonly InsumoManual[];
  /** Peso da tecnologia na qualidade final, em pontos percentuais. */
  readonly pesoTecnologia: number;
}

export const RECEITAS_MANUAL: readonly ReceitaManual[] = [
  {
    produto: "leite_engarrafado",
    unidadesPorLote: 8,
    unidadeLote: "unidade",
    insumos: [
      { produto: "leite", quantidade: 2, unidade: "quart", pesoQualidade: 65 },
      { produto: "vidro", quantidade: 1, unidade: "lb", pesoQualidade: 5 },
    ],
    pesoTecnologia: 30,
  },
  {
    produto: "iogurte",
    unidadesPorLote: 8,
    unidadeLote: "unidade",
    insumos: [
      { produto: "leite", quantidade: 2, unidade: "quart", pesoQualidade: 20 },
      { produto: "morango", quantidade: 1, unidade: "lb", pesoQualidade: 20 },
      { produto: "acido_citrico", quantidade: 1, unidade: "lb", pesoQualidade: 10 },
    ],
    pesoTecnologia: 50,
  },
  {
    produto: "sorvete",
    unidadesPorLote: 20,
    unidadeLote: "unidade",
    insumos: [
      { produto: "leite", quantidade: 2, unidade: "quart", pesoQualidade: 20 },
      { produto: "morango", quantidade: 2, unidade: "lb", pesoQualidade: 20 },
      { produto: "acucar", quantidade: 1, unidade: "lb", pesoQualidade: 10 },
    ],
    pesoTecnologia: 50,
  },
  {
    produto: "sapato",
    unidadesPorLote: 4,
    unidadeLote: "par",
    insumos: [
      { produto: "couro", quantidade: 5, unidade: "lb", pesoQualidade: 45 },
      { produto: "tecido", quantidade: 1, unidade: "lb", pesoQualidade: 5 },
    ],
    pesoTecnologia: 50,
  },
  {
    produto: "carteira",
    unidadesPorLote: 3,
    unidadeLote: "unidade",
    insumos: [{ produto: "couro", quantidade: 1, unidade: "lb", pesoQualidade: 50 }],
    pesoTecnologia: 50,
  },
];

/** Fatores de conversão das unidades do manual para o sistema métrico. */
export const LITROS_POR_QUART = 0.946352946;
export const KG_POR_LB = 0.45359237;

export function receitaManual(produto: string): ReceitaManual {
  const r = RECEITAS_MANUAL.find((x) => x.produto === produto);
  if (!r) throw new Error(`não há receita do manual para "${produto}"`);
  return r;
}

/** Quantidade de um insumo do manual convertida para litro (quart) ou quilograma (lb); demais unidades inalteradas. */
export function paraMetrico(insumo: InsumoManual): number {
  switch (insumo.unidade) {
    case "quart":
      return insumo.quantidade * LITROS_POR_QUART;
    case "lb":
      return insumo.quantidade * KG_POR_LB;
    default:
      return insumo.quantidade;
  }
}
