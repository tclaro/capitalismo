import { describe, expect, test } from "bun:test";
import { type Preset, valorBase, validarPreset } from "@simulador/motor";
import { ARVORE, PRESET_CADEIA_MINIMA, PRESET_INTRODUTORIO, PRESETS, validarPresetContraArvore } from "../src";

/** Cópia profunda mutável de um preset, para montar casos inválidos. */
type Mutavel<T> = T extends readonly (infer U)[]
  ? Mutavel<U>[]
  : T extends object
    ? { -readonly [K in keyof T]: Mutavel<T[K]> }
    : T;
const copiar = () => structuredClone(PRESET_CADEIA_MINIMA) as unknown as Mutavel<Preset>;
const produto = (p: Mutavel<Preset>, id: string) => p.produtos.find((x) => x.id === id)!;
const atividade = (p: Mutavel<Preset>, id: string) => p.cadeia!.atividades.find((a) => a.id === id)!;

describe("preset cadeia/minima", () => {
  const P = PRESET_CADEIA_MINIMA;
  const doPreset = (id: string) => P.produtos.find((x) => x.id === id)!;

  test("está publicado, é válido e coerente com a árvore", () => {
    expect(PRESETS["cadeia/minima"]).toBe(P);
    expect(validarPreset(P)).toEqual([]);
    expect(validarPresetContraArvore(P, ARVORE)).toEqual([]);
  });

  test("recorte decidido (decisão 28): os cinco do introdutório, jaqueta, carne bovina e frango no varejo", () => {
    const varejo = P.produtos.filter((p) => p.varejo).map((p) => p.id);
    expect(varejo).toEqual([
      "leite_engarrafado",
      "iogurte",
      "sorvete",
      "sapato",
      "carteira",
      "jaqueta_de_couro",
      "carne_bovina_congelada",
      "frango_congelado",
    ]);
  });

  test("os produtos do introdutório continuam idênticos (a cadeia só acrescenta)", () => {
    expect(P.produtos.slice(0, PRESET_INTRODUTORIO.produtos.length)).toEqual([...PRESET_INTRODUTORIO.produtos]);
  });

  test("semiacabados (vidro, ácido cítrico, tecido) só do fornecedor externo: nenhum é produzido pela cadeia", () => {
    const produzidos = new Set(P.cadeia!.atividades.flatMap((a) => a.produz.map((x) => x.produto)));
    for (const id of ["vidro", "acido_citrico", "tecido"]) {
      expect(produzidos.has(id)).toBe(false);
      expect(doPreset(id).fornecedor).toBeDefined();
      expect(doPreset(id).nivel).toBe("semiacabado");
    }
  });

  test("jaqueta de couro: 4 de couro para 1 de tecido e índice de sucesso 35/35/30", () => {
    const j = doPreset("jaqueta_de_couro");
    const [couro, tecido] = j.fabricacao!.receita;
    expect(couro!.produto).toBe("couro");
    expect(tecido!.produto).toBe("tecido");
    expect(couro!.quantidadePorLote / tecido!.quantidadePorLote).toBeCloseTo(4, 10);
    expect(j.fabricacao!.unidadesPorLote).toBe(1);
    expect([valorBase(j.varejo!.pesos.qualidade), valorBase(j.varejo!.pesos.marca), valorBase(j.varejo!.pesos.preco)]).toEqual([35, 35, 30]);
  });

  test("carne e frango vão direto da fazenda ao varejo: matéria-prima com varejo e sem fabricação", () => {
    for (const id of ["carne_bovina_congelada", "frango_congelado"]) {
      const p = doPreset(id);
      expect(p.nivel).toBe("materia_prima");
      expect(p.varejo).toBeDefined();
      expect(p.fabricacao).toBeUndefined();
      expect(p.fornecedor).toBeDefined();
    }
  });

  test("as cinco atividades decididas; só o gado de corte tem coproduto (carne + couro)", () => {
    const a = P.cadeia!.atividades;
    expect(a.map((x) => [x.id, x.tipo])).toEqual([
      ["gado_de_corte", "pecuaria"],
      ["gado_leiteiro", "pecuaria"],
      ["frango", "pecuaria"],
      ["morango", "lavoura"],
      ["cana_de_acucar", "lavoura"],
    ]);
    expect(a.filter((x) => x.produz.length > 1).map((x) => x.id)).toEqual(["gado_de_corte"]);
    expect(a[0]!.produz).toEqual([
      { produto: "carne_bovina_congelada", proporcao: 1 },
      { produto: "couro", proporcao: 0.5 },
    ]);
  });

  test("todo insumo de fábrica de matéria-prima é produzido por alguma atividade, exceto os semiacabados", () => {
    const produzidos = new Set(P.cadeia!.atividades.flatMap((a) => a.produz.map((x) => x.produto)));
    for (const p of P.produtos.filter((x) => x.fabricacao)) {
      for (const i of p.fabricacao!.receita) {
        const alvo = doPreset(i.produto);
        if (alvo.nivel === "materia_prima") expect({ produto: i.produto, produzido: produzidos.has(i.produto) }).toEqual({ produto: i.produto, produzido: true });
      }
    }
  });

  test("cooperativa paga 60% do fornecedor e a conversão é igual para qualquer troca (decisões do autor)", () => {
    expect(P.cadeia!.cooperativa.fatorPiso).toBe(0.6);
    expect(Object.keys(P.cadeia!.conversao).sort()).toEqual(["custo", "prazoDias"]);
  });

  test("o introdutório continua sem bloco de cadeia", () => {
    expect("cadeia" in PRESET_INTRODUTORIO).toBe(false);
  });
});

describe("validarPreset rejeita cadeia inválida", () => {
  const casos: [string, (p: Mutavel<Preset>) => void, string][] = [
    ["sem atividades", (p) => void (p.cadeia!.atividades = []), "precisa de pelo menos uma atividade"],
    ["id de atividade duplicado", (p) => void (atividade(p, "frango").id = "morango"), "id duplicado"],
    ["tipo de atividade inválido", (p) => void ((atividade(p, "frango") as { tipo: string }).tipo = "mineracao"), 'deve ser "lavoura" ou "pecuaria"'],
    ["atividade sem produto", (p) => void (atividade(p, "frango").produz = []), "precisa de pelo menos um produto"],
    ["produto principal com proporção diferente de 1", (p) => void (atividade(p, "frango").produz[0]!.proporcao = 2), "o produto principal tem proporção 1"],
    ["proporção do coproduto zero", (p) => void (atividade(p, "gado_de_corte").produz[1]!.proporcao = 0), "proporcao: deve ser maior que zero"],
    ["produto repetido na atividade", (p) => void atividade(p, "gado_de_corte").produz.push({ produto: "couro", proporcao: 1 }), "produto repetido"],
    ["produto inexistente", (p) => void (atividade(p, "frango").produz[0]!.produto = "ovos"), "produto não existe no preset"],
    ["fazenda produzindo produto final", (p) => void (atividade(p, "frango").produz[0]!.produto = "sorvete"), "a fazenda só produz matéria-prima"],
    ["matéria-prima sem teto de preço", (p) => void delete produto(p, "frango_congelado").fornecedor, "matéria-prima precisa de fornecedor externo"],
    ["custo variável negativo", (p) => void (atividade(p, "frango").custoVariavelPorUnidade = -1), "custoVariavelPorUnidade: não pode ser negativo"],
    ["qualidade base acima de 100", (p) => void (atividade(p, "frango").qualidadeBase = 120), "qualidadeBase: deve estar entre 0 e 100"],
    ["capex fracionário", (p) => void (atividade(p, "frango").capex = 100.5), "capex: deve ser inteiro"],
    ["capacidade zero", (p) => void (atividade(p, "frango").capacidadeUnidadesPorDia = 0), "capacidadeUnidadesPorDia: deve ser maior que zero"],
    ["armazenagem zero", (p) => void (atividade(p, "frango").diasDeArmazenagem = 0), "diasDeArmazenagem: deve ser maior que zero"],
    ["vida útil fracionária", (p) => void (atividade(p, "frango").vidaUtilMeses = 12.5), "vidaUtilMeses: deve ser inteiro"],
    ["qualidade máxima acima de 100", (p) => void (p.cadeia!.experiencia.qualidadeMaxima = 101), "qualidadeMaxima"],
    ["conversão com custo fracionário", (p) => void (p.cadeia!.conversao.custo = 10.5), "conversao.custo: deve ser inteiro"],
    ["conversão com prazo negativo", (p) => void (p.cadeia!.conversao.prazoDias = -1), "conversao.prazoDias"],
    ["piso da cooperativa zero", (p) => void (p.cadeia!.cooperativa.fatorPiso = 0), "fatorPiso"],
    ["piso da cooperativa acima do fornecedor", (p) => void (p.cadeia!.cooperativa.fatorPiso = 1.2), "fatorPiso"],
    ["piso da cooperativa NaN", (p) => void (p.cadeia!.cooperativa.fatorPiso = Number.NaN), "fatorPiso: deve ser um número finito"],
    ["custo de descarte negativo", (p) => void (p.cadeia!.descarte.custoPorUnidade = -1), "descarte.custoPorUnidade"],
    ["completaComFornecedor que não é verdadeiro ou falso", (p) => void ((p.cadeia as { completaComFornecedor: unknown }).completaComFornecedor = "sim"), "completaComFornecedor"],
  ];

  test("o preset é válido antes das mutações", () => {
    expect(validarPreset(PRESET_CADEIA_MINIMA)).toEqual([]);
  });

  for (const [nome, mutar, esperado] of casos) {
    test(nome, () => {
      const p = copiar();
      mutar(p);
      const erros = validarPreset(p as unknown as Preset);
      expect(erros.some((e) => e.includes(esperado))).toBe(true);
    });
  }
});

describe("validarPresetContraArvore rejeita atividades incoerentes com a árvore", () => {
  const casos: [string, (p: Mutavel<Preset>) => void, string][] = [
    ["lavoura produzindo matéria-prima de pecuária", (p) => void (atividade(p, "morango").produz[0]!.produto = "couro"), "vem de pecuaria, mas a atividade é de lavoura"],
    ["pecuária produzindo matéria-prima de lavoura", (p) => void (atividade(p, "frango").produz[0]!.produto = "morango"), "vem de lavoura, mas a atividade é de pecuaria"],
    [
      "pecuária sem rebanho em comum (carne bovina e frango)",
      (p) => void (atividade(p, "gado_de_corte").produz[1]!.produto = "frango_congelado"),
      "não têm um rebanho em comum",
    ],
    ["produto fora da árvore numa atividade", (p) => void (atividade(p, "frango").produz[0]!.produto = "queijo"), "não é matéria-prima de fazenda na árvore"],
  ];

  test("o preset é coerente antes das mutações", () => {
    expect(validarPresetContraArvore(PRESET_CADEIA_MINIMA, ARVORE)).toEqual([]);
  });

  for (const [nome, mutar, esperado] of casos) {
    test(nome, () => {
      const p = copiar();
      mutar(p);
      const erros = validarPresetContraArvore(p as unknown as Preset, ARVORE);
      expect(erros.some((e) => e.includes(esperado))).toBe(true);
    });
  }
});
