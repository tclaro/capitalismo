import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ARVORE, type ProdutoDaArvore, produtoDaArvore, validarArvore } from "../src";

const ANEXO = readFileSync(join(import.meta.dir, "..", "..", "..", "docs", "arvore-de-produtos.md"), "utf8");

/** Linhas de tabela (sem cabeçalho e separador) entre um título e o próximo título do mesmo nível ou superior. */
function linhasDaSecao(titulo: string): string[][] {
  const inicio = ANEXO.indexOf(titulo);
  if (inicio < 0) throw new Error(`seção não encontrada no anexo: ${titulo}`);
  const resto = ANEXO.slice(inicio + titulo.length);
  const fim = resto.search(/\n#{2,3} /);
  const corpo = fim < 0 ? resto : resto.slice(0, fim);
  const linhas = corpo
    .split("\n")
    .filter((l) => l.trim().startsWith("|"))
    .map((l) =>
      l
        .trim()
        .replace(/^\||\|$/g, "")
        .split("|")
        .map((c) => c.trim()),
    );
  return linhas.slice(2); // cabeçalho + separador
}

/** "Aço (Steel)" → { nome: "Aço", manual: "Steel" }; "Desktop" → { nome: "Desktop" }. */
function separarNome(celula: string): { nome: string; manual?: string } {
  const m = /^(.*?)\s*\(([^)]+)\)\s*$/.exec(celula);
  return m ? { nome: m[1]!.trim(), manual: m[2]!.trim() } : { nome: celula.trim() };
}

const normalizar = (s: string) => s.trim().toLocaleLowerCase("pt-BR");
const porNome = new Map(ARVORE.map((p) => [normalizar(p.nome), p]));

function acharPorNome(nome: string): ProdutoDaArvore {
  const p = porNome.get(normalizar(nome));
  if (!p) throw new Error(`produto do anexo não está na árvore: "${nome}"`);
  return p;
}

const listaDeInsumos = (celula: string) => celula.split(",").map((s) => acharPorNome(s).id).sort();

describe("árvore de produtos", () => {
  test("é estruturalmente válida", () => {
    expect(validarArvore(ARVORE)).toEqual([]);
  });

  test("nomes são únicos (sem ambiguidade para o anexo)", () => {
    expect(porNome.size).toBe(ARVORE.length);
  });

  test("produtoDaArvore encontra e rejeita ids", () => {
    expect(produtoDaArvore("sapato").insumos).toEqual(["couro", "tecido"]);
    expect(() => produtoDaArvore("queijo")).toThrow('"queijo"');
  });
});

describe("árvore confere com o anexo arvore-de-produtos.md", () => {
  const vistos = new Set<string>();

  test("2.1 lavoura: cada produto colhido existe, vem de lavoura", () => {
    const linhas = linhasDaSecao("### 2.1 Lavoura");
    expect(linhas.length).toBe(12);
    for (const [, colhido] of linhas) {
      const p = acharPorNome(separarNome(colhido!).nome);
      expect({ id: p.id, nivel: p.nivel, origem: p.origem?.tipo }).toEqual({ id: p.id, nivel: "materia_prima", origem: "lavoura" });
      vistos.add(p.id);
    }
  });

  test("2.2 pecuária: cada produto possível existe e vem do rebanho indicado; varejo direto quando o anexo diz", () => {
    const rebanhoPorNome: Record<string, string> = { Gado: "gado", Frango: "frango", Porco: "porco", Ovelha: "ovelha" };
    const linhas = linhasDaSecao("### 2.2 Pecuária");
    expect(linhas.length).toBe(4);
    for (const [rebanhoCelula, produtos, varejo] of linhas) {
      const rebanho = rebanhoPorNome[separarNome(rebanhoCelula!).nome]!;
      const varejoTodos = varejo!.startsWith("Sim");
      for (const nome of produtos!.split(",")) {
        const p = acharPorNome(nome);
        expect(p.origem?.tipo).toBe("pecuaria");
        expect(p.origem?.tipo === "pecuaria" && p.origem.rebanhos.includes(rebanho)).toBe(true);
        const ehCarne = normalizar(nome).startsWith("carne");
        expect(p.classe).toBe(varejoTodos || ehCarne ? "Alimentos" : undefined);
        vistos.add(p.id);
      }
    }
  });

  test("2.3 extração: cada recurso existe e vem da instalação indicada", () => {
    const instalacaoPorNome: Record<string, string> = { Mina: "mina", "Poço de petróleo": "poco_de_petroleo", Madeireira: "madeireira" };
    let instalacao = "";
    let total = 0;
    for (const [inst, recurso] of linhasDaSecao("### 2.3 Extração")) {
      if (inst) instalacao = instalacaoPorNome[separarNome(inst).nome]!;
      const { nome, manual } = separarNome(recurso!);
      const p = acharPorNome(nome);
      expect(p.origem).toEqual({ tipo: "extracao", instalacao: instalacao as "mina" });
      if (manual) expect(p.nomeManual).toBe(manual);
      vistos.add(p.id);
      total++;
    }
    expect(total).toBe(9);
  });

  test("3 semiacabados: mesmos insumos e nome do manual", () => {
    const linhas = linhasDaSecao("## 3. Semiacabados");
    expect(linhas.length).toBe(19);
    for (const [produto, insumos] of linhas) {
      const { nome, manual } = separarNome(produto!);
      const p = acharPorNome(nome);
      expect({ id: p.id, nivel: p.nivel, insumos: [...p.insumos].sort() }).toEqual({
        id: p.id,
        nivel: "semiacabado",
        insumos: listaDeInsumos(insumos!),
      });
      if (manual) expect(p.nomeManual).toBe(manual);
      vistos.add(p.id);
    }
  });

  test("4 produtos finais: mesma classe, mesmos insumos e nome do manual", () => {
    let classe = "";
    let total = 0;
    for (const [classeCelula, produto, insumos] of linhasDaSecao("## 4. Produtos finais")) {
      if (classeCelula) classe = classeCelula.replaceAll("*", "").trim();
      if (insumos === "Direto da pecuária") continue;
      const { nome, manual } = separarNome(produto!);
      const p = acharPorNome(nome);
      expect({ id: p.id, nivel: p.nivel, classe: p.classe, insumos: [...p.insumos].sort() }).toEqual({
        id: p.id,
        nivel: "final",
        classe,
        insumos: listaDeInsumos(insumos!),
      });
      if (manual) expect(p.nomeManual).toBe(manual);
      vistos.add(p.id);
      total++;
    }
    expect(total).toBe(71);
  });

  test("todo produto da árvore aparece no anexo (sem produtos inventados)", () => {
    const faltando = ARVORE.map((p) => p.id).filter((id) => !vistos.has(id));
    expect(faltando).toEqual([]);
  });
});

describe("validarArvore rejeita árvores inválidas", () => {
  const base: ProdutoDaArvore[] = [
    { id: "a", nome: "A", nomeManual: "A", nivel: "materia_prima", insumos: [], origem: { tipo: "extracao", instalacao: "mina" } },
    { id: "b", nome: "B", nomeManual: "B", nivel: "semiacabado", insumos: ["a"] },
    { id: "c", nome: "C", nomeManual: "C", nivel: "final", insumos: ["b"], classe: "X" },
  ];

  test("a árvore mínima é válida", () => {
    expect(validarArvore(base)).toEqual([]);
  });

  const casos: [string, (a: ProdutoDaArvore[]) => ProdutoDaArvore[], string][] = [
    ["id duplicado", (a) => [...a, { ...a[0]! }], "id duplicado"],
    ["id fora do padrão", (a) => a.map((p) => (p.id === "c" ? { ...p, id: "Café" } : p)), "snake_case"],
    ["insumo inexistente", (a) => a.map((p) => (p.id === "c" ? { ...p, insumos: ["z"] } : p)), 'insumo "z" não existe'],
    ["final como insumo", (a) => [...a, { id: "d", nome: "D", nomeManual: "D", nivel: "final", insumos: ["c"], classe: "X" }], "é produto final"],
    ["matéria-prima sem origem", (a) => a.map((p) => (p.id === "a" ? { id: "a", nome: "A", nomeManual: "A", nivel: "materia_prima", insumos: [] } : p)), "precisa de origem"],
    ["final sem classe", (a) => a.map((p) => (p.id === "c" ? { id: "c", nome: "C", nomeManual: "C", nivel: "final", insumos: ["b"] } : p)), "precisa de classe"],
    ["quatro insumos", (a) => a.map((p) => (p.id === "c" ? { ...p, insumos: ["a", "b", "e", "f"] } : p)), "1 a 3 insumos"],
    ["semiacabado sem uso", (a) => [...a, { id: "e", nome: "E", nomeManual: "E", nivel: "semiacabado", insumos: ["a"] }], "não é usado"],
    [
      "ciclo",
      (a) => [
        ...a.filter((p) => p.id !== "b"),
        { id: "b", nome: "B", nomeManual: "B", nivel: "semiacabado", insumos: ["a", "g"] },
        { id: "g", nome: "G", nomeManual: "G", nivel: "semiacabado", insumos: ["b"] },
      ],
      "ciclo",
    ],
  ];

  for (const [nome, mutar, esperado] of casos) {
    test(nome, () => {
      const erros = validarArvore(mutar(base));
      expect(erros.some((e) => e.includes(esperado))).toBe(true);
    });
  }
});
