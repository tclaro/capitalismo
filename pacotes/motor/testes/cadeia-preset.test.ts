import { describe, expect, test } from "bun:test";
import { PRESET_CADEIA_MINIMA, PRESET_INTRODUTORIO, PRESET_TESTE } from "@simulador/catalogo";
import { type Preset, resolverPreset, valorBase } from "../src";

const SEMENTES = ["a", "b", "semente-3", "quarta", "x1y2"];

describe("resolução do bloco da cadeia", () => {
  test("presets sem a camada 3 resolvem com cadeia nula", () => {
    expect(resolverPreset(PRESET_TESTE, "s").cadeia).toBeNull();
    expect(resolverPreset(PRESET_INTRODUTORIO, "s").cadeia).toBeNull();
  });

  test("a cadeia resolvida é JSON puro e não muda ao passar por JSON", () => {
    const r = resolverPreset(PRESET_CADEIA_MINIMA, "s");
    expect(r.cadeia).not.toBeNull();
    expect(JSON.parse(JSON.stringify(r.cadeia))).toEqual(r.cadeia!);
  });

  test("mesma semente dá a mesma cadeia; sementes diferentes variam os custos", () => {
    const a = resolverPreset(PRESET_CADEIA_MINIMA, "s").cadeia!;
    const b = resolverPreset(PRESET_CADEIA_MINIMA, "s").cadeia!;
    expect(b).toEqual(a);
    const custos = new Set(SEMENTES.map((s) => resolverPreset(PRESET_CADEIA_MINIMA, s).cadeia!.atividades[0]!.custoVariavelPorUnidade));
    expect(custos.size).toBeGreaterThan(1);
  });

  test("custo variável e qualidade ficam dentro da faixa do preset, em centavos inteiros", () => {
    for (const s of SEMENTES) {
      const r = resolverPreset(PRESET_CADEIA_MINIMA, s).cadeia!;
      r.atividades.forEach((a, i) => {
        const base = PRESET_CADEIA_MINIMA.cadeia!.atividades[i]!;
        const cv = base.custoVariavelPorUnidade as { valor: number; variacao: number };
        const q = base.qualidadeBase as { valor: number; variacao: number };
        expect(Number.isInteger(a.custoVariavelPorUnidade)).toBe(true);
        expect(a.custoVariavelPorUnidade).toBeGreaterThanOrEqual(Math.floor(cv.valor * (1 - cv.variacao)));
        expect(a.custoVariavelPorUnidade).toBeLessThanOrEqual(Math.ceil(cv.valor * (1 + cv.variacao)));
        expect(a.qualidadeBase).toBeGreaterThanOrEqual(q.valor * (1 - q.variacao));
        expect(a.qualidadeBase).toBeLessThan(q.valor * (1 + q.variacao));
      });
    }
  });

  test("a cadeia não muda os sorteios dos produtos nem do mercado (fluxos independentes)", () => {
    const { cadeia: _removida, ...semCadeia } = PRESET_CADEIA_MINIMA;
    for (const s of SEMENTES) {
      const com = resolverPreset(PRESET_CADEIA_MINIMA, s);
      const sem = resolverPreset(semCadeia, s);
      expect(com.produtos).toEqual(sem.produtos);
      expect(com.populacao).toBe(sem.populacao);
    }
  });

  test("acrescentar uma atividade não muda os sorteios das existentes", () => {
    const cadeia = PRESET_CADEIA_MINIMA.cadeia!;
    const extra = { ...cadeia.atividades[1]!, id: "gado_leiteiro_2", nome: "Gado leiteiro 2" };
    const maior: Preset = { ...PRESET_CADEIA_MINIMA, cadeia: { ...cadeia, atividades: [...cadeia.atividades, extra] } };
    const clonadaDiferiu: boolean[] = [];
    for (const s of SEMENTES) {
      const a = resolverPreset(PRESET_CADEIA_MINIMA, s).cadeia!.atividades;
      const b = resolverPreset(maior, s).cadeia!.atividades;
      expect(b.slice(0, a.length)).toEqual(a);
      // A clone tem a mesma configuração que "gado_leiteiro", mas o fluxo é próprio (pelo id): sorteia outros valores.
      clonadaDiferiu.push(b[5]!.custoVariavelPorUnidade !== b[1]!.custoVariavelPorUnidade || b[5]!.qualidadeBase !== b[1]!.qualidadeBase);
    }
    expect(clonadaDiferiu.some(Boolean)).toBe(true);
  });

  test("os parâmetros fixos passam intactos e os coprodutos preservam a proporção", () => {
    const r = resolverPreset(PRESET_CADEIA_MINIMA, "s").cadeia!;
    const base = PRESET_CADEIA_MINIMA.cadeia!;
    expect(r.conversao).toEqual(base.conversao);
    expect(r.cooperativa).toEqual(base.cooperativa);
    expect(r.descarte).toEqual(base.descarte);
    expect(r.experiencia).toEqual(base.experiencia);
    const corte = r.atividades.find((a) => a.id === "gado_de_corte")!;
    expect(corte.produz).toEqual([
      { produto: "carne_bovina_congelada", proporcao: 1 },
      { produto: "couro", proporcao: valorBase(0.5) },
    ]);
    // A resolução copia as listas: mexer no resultado não altera o preset.
    corte.produz.push({ produto: "x", proporcao: 1 });
    expect(PRESET_CADEIA_MINIMA.cadeia!.atividades[0]!.produz).toHaveLength(2);
  });
});
