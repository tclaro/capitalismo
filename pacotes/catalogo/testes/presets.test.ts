import { describe, expect, test } from "bun:test";
import { type Preset, validarPreset } from "@simulador/motor";
import { ARVORE, PRESET_INTRODUTORIO, PRESET_TESTE, PRESETS, validarPresetContraArvore } from "../src";

/** Cópia profunda mutável de um preset, para montar casos inválidos. */
type Mutavel<T> = T extends readonly (infer U)[]
  ? Mutavel<U>[]
  : T extends object
    ? { -readonly [K in keyof T]: Mutavel<T[K]> }
    : T;
const copiar = (p: Preset) => structuredClone(p) as unknown as Mutavel<Preset>;
const produto = (p: Mutavel<Preset>, id: string) => p.produtos.find((x) => x.id === id)!;

describe("presets publicados", () => {
  for (const [id, preset] of Object.entries(PRESETS)) {
    test(`${id} é válido e coerente com a árvore`, () => {
      expect(preset.id).toBe(id);
      expect(validarPresetContraArvore(preset, ARVORE)).toEqual([]);
    });
  }

  test("introdutório tem exatamente o recorte decidido (decisão 3), com insumos do fornecedor externo", () => {
    const varejo = PRESET_INTRODUTORIO.produtos.filter((p) => p.varejo).map((p) => p.id);
    expect(varejo).toEqual(["leite_engarrafado", "iogurte", "sorvete", "sapato", "carteira"]);
    const insumos = PRESET_INTRODUTORIO.produtos.filter((p) => !p.varejo).map((p) => p.id).sort();
    expect(insumos).toEqual(["acido_citrico", "acucar", "couro", "leite", "morango", "tecido", "vidro"]);
    for (const p of PRESET_INTRODUTORIO.produtos.filter((x) => !x.varejo)) expect(p.fornecedor).toBeDefined();
  });

  test("introdutório: todo produto de varejo pode ser comprado pronto e fabricado", () => {
    for (const p of PRESET_INTRODUTORIO.produtos.filter((x) => x.varejo)) {
      expect({ id: p.id, pronto: !!p.fornecedor, fabrica: !!p.fabricacao }).toEqual({ id: p.id, pronto: true, fabrica: true });
    }
  });

  test("preset de teste não tem variação (resultados de teste não dependem de sorteio de cenário)", () => {
    const temVariacao = JSON.stringify(PRESET_TESTE).includes('"variacao"');
    expect(temVariacao).toBe(false);
  });
});

describe("validarPreset rejeita presets inválidos", () => {
  const casos: [string, (p: Mutavel<Preset>) => void, string][] = [
    ["ticks por mês zero", (p) => void (p.ticksPorMes = 0), "ticksPorMes"],
    ["população NaN", (p) => void (p.mercado.populacao = Number.NaN), "mercado.populacao: deve ser um número finito"],
    ["variação acima do máximo", (p) => void (p.mercado.populacao = { valor: 1000, variacao: 0.9 }), "populacao.variacao"],
    ["pesos da nota não somam 100", (p) => void (produto(p, "carteira").varejo!.pesos.preco = 30), "devem somar 100"],
    ["preço de referência fracionário", (p) => void (produto(p, "carteira").varejo!.precoReferencia = 80.5), "precoReferencia: deve ser inteiro"],
    ["pesos da receita não somam 100", (p) => void (produto(p, "carteira").fabricacao!.pesoTecnologia = 40), "insumos + tecnologia devem somar 100"],
    [
      "insumo inexistente",
      (p) => void (produto(p, "carteira").fabricacao!.receita = [{ produto: "ouro", quantidadePorLote: 1, pesoQualidade: 50 }]),
      "insumo não existe no preset",
    ],
    ["insumo sem fornecedor", (p) => void delete produto(p, "couro").fornecedor, "precisa de fornecedor externo"],
    [
      "produto final como insumo",
      (p) => void (produto(p, "carteira").fabricacao!.receita = [{ produto: "leite_engarrafado", quantidadePorLote: 1, pesoQualidade: 50 }]),
      "produto final não pode ser insumo",
    ],
    ["id duplicado", (p) => void p.produtos.push(structuredClone(produto(p, "leite"))), "id duplicado"],
    [
      "varejo sem forma de abastecer",
      (p) => {
        delete produto(p, "carteira").fornecedor;
        delete produto(p, "carteira").fabricacao;
      },
      "precisa de fornecedor (comprar pronto) ou de fabricação",
    ],
    ["qualidade do fornecedor acima de 100", (p) => void (produto(p, "leite").fornecedor!.qualidade = 120), "qualidade: deve estar entre 0 e 100"],
    ["capex fracionário", (p) => void (produto(p, "carteira").fabricacao!.capex = 10.5), "capex: deve ser inteiro"],
    ["alíquota de IR acima de 1", (p) => void (p.financeiro.aliquotaIR = 1.5), "aliquotaIR"],
    ["teto de preço abaixo de 1", (p) => void (p.vendas.multiploTetoPreco = 0.5), "multiploTetoPreco"],
    ["fidelidade inicial abaixo do mínimo", (p) => void (p.marca.fidelidadeInicial = -80), "fidelidadeInicial"],
    ["sem produto de varejo", (p) => void (p.produtos = p.produtos.filter((x) => !x.varejo)), "pelo menos um produto vendido no varejo"],
  ];

  test("o preset de teste é válido antes das mutações", () => {
    expect(validarPreset(PRESET_TESTE)).toEqual([]);
  });

  for (const [nome, mutar, esperado] of casos) {
    test(nome, () => {
      const p = copiar(PRESET_TESTE);
      mutar(p);
      const erros = validarPreset(p as unknown as Preset);
      expect(erros.some((e) => e.includes(esperado))).toBe(true);
    });
  }
});

describe("validarPresetContraArvore rejeita incoerências com a árvore", () => {
  const casos: [string, (p: Mutavel<Preset>) => void, string][] = [
    ["produto fora da árvore", (p) => void (produto(p, "leite").id = "leite_de_cabra"), "não existe na árvore"],
    ["nome diferente", (p) => void (produto(p, "carteira").nome = "Carteira de couro"), "difere da árvore"],
    ["nível diferente", (p) => void (produto(p, "vidro").nivel = "materia_prima"), 'nível "materia_prima" difere'],
    [
      "varejo em produto sem classe",
      (p) => void (produto(p, "couro").varejo = structuredClone(produto(p, "carteira").varejo!)),
      "não é vendido no varejo",
    ],
    [
      "receita com insumos diferentes da árvore",
      (p) => void (produto(p, "carteira").fabricacao!.receita = [{ produto: "vidro", quantidadePorLote: 1, pesoQualidade: 50 }]),
      "mas a árvore diz [couro]",
    ],
  ];

  for (const [nome, mutar, esperado] of casos) {
    test(nome, () => {
      const p = copiar(PRESET_TESTE);
      mutar(p);
      const erros = validarPresetContraArvore(p as unknown as Preset, ARVORE);
      expect(erros.some((e) => e.includes(esperado))).toBe(true);
    });
  }
});
