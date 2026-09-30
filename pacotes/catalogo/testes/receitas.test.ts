import { describe, expect, test } from "bun:test";
import { KG_POR_LB, LITROS_POR_QUART, PRESET_INTRODUTORIO, RECEITAS_MANUAL, paraMetrico, produtoDaArvore, receitaManual } from "../src";

/**
 * Valores lidos do Apêndice B do manual do Capitalism II (Manufacturer's Guide), escritos de novo
 * aqui como checagem independente da transcrição em `receitas.ts`.
 * Formato: [produto, unidades por lote, [insumo, quantidade, unidade, peso %]..., tecnologia %].
 */
const APENDICE_B: [string, number, [string, number, string, number][], number][] = [
  ["leite_engarrafado", 8, [["leite", 2, "quart", 65], ["vidro", 1, "lb", 5]], 30],
  ["iogurte", 8, [["leite", 2, "quart", 20], ["morango", 1, "lb", 20], ["acido_citrico", 1, "lb", 10]], 50],
  ["sorvete", 20, [["leite", 2, "quart", 20], ["morango", 2, "lb", 20], ["acucar", 1, "lb", 10]], 50],
  ["sapato", 4, [["couro", 5, "lb", 45], ["tecido", 1, "lb", 5]], 50],
  ["carteira", 3, [["couro", 1, "lb", 50]], 50],
];

describe("receitas do Apêndice B", () => {
  test("conferem com os valores lidos do manual", () => {
    for (const [produto, lote, insumos, tec] of APENDICE_B) {
      const r = receitaManual(produto);
      expect(r.unidadesPorLote).toBe(lote);
      expect(r.pesoTecnologia).toBe(tec);
      expect(r.insumos.map((i) => [i.produto, i.quantidade, i.unidade, i.pesoQualidade])).toEqual(insumos);
    }
    expect(RECEITAS_MANUAL.length).toBe(APENDICE_B.length);
  });

  test("pesos dos insumos + tecnologia somam 100 em toda receita", () => {
    for (const r of RECEITAS_MANUAL) {
      const soma = r.insumos.reduce((s, i) => s + i.pesoQualidade, r.pesoTecnologia);
      expect({ produto: r.produto, soma }).toEqual({ produto: r.produto, soma: 100 });
    }
  });

  test("insumos de cada receita são os mesmos da árvore", () => {
    for (const r of RECEITAS_MANUAL) {
      expect(r.insumos.map((i) => i.produto).sort()).toEqual([...produtoDaArvore(r.produto).insumos].sort());
    }
  });

  test("receitaManual rejeita produto sem receita", () => {
    expect(() => receitaManual("carro")).toThrow('"carro"');
  });
});

describe("conversão para o sistema métrico", () => {
  test("fatores exatos da definição", () => {
    expect(LITROS_POR_QUART).toBe(0.946352946);
    expect(KG_POR_LB).toBe(0.45359237);
  });

  test("quart → litro, lb → kg, demais unidades inalteradas", () => {
    expect(paraMetrico({ produto: "leite", quantidade: 2, unidade: "quart", pesoQualidade: 0 })).toBeCloseTo(1.892705892, 12);
    expect(paraMetrico({ produto: "couro", quantidade: 5, unidade: "lb", pesoQualidade: 0 })).toBeCloseTo(2.26796185, 12);
    expect(paraMetrico({ produto: "ovos", quantidade: 1, unidade: "duzia", pesoQualidade: 0 })).toBe(1);
  });

  test("o preset introdutório usa exatamente a receita convertida", () => {
    const sapato = PRESET_INTRODUTORIO.produtos.find((p) => p.id === "sapato")!.fabricacao!;
    expect(sapato.unidadesPorLote).toBe(4);
    expect(sapato.pesoTecnologia).toBe(50);
    expect(sapato.receita).toEqual([
      { produto: "couro", quantidadePorLote: 5 * KG_POR_LB, pesoQualidade: 45 },
      { produto: "tecido", quantidadePorLote: 1 * KG_POR_LB, pesoQualidade: 5 },
    ]);
  });
});
