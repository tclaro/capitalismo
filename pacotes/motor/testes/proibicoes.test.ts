/**
 * Garante as regras de pureza do motor (seção 3, princípio 3, e plano da fase 0):
 * - sem APIs de runtime (Bun, Node), relógio ou aleatoriedade fora do gerador com semente;
 * - sem dependências: só imports relativos;
 * - funções transcendentais (exp, ln, pow, `**`) só em `matematica.ts`, para concentrar
 *   o único ponto sem garantia bit a bit entre plataformas.
 */
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const RAIZ_SRC = join(import.meta.dir, "..", "src");
const ARQUIVO_MATEMATICA = "matematica.ts";

/** Remove comentários e literais de string/template, mantendo o resto do código. */
export function removerComentariosEStrings(codigo: string): string {
  let saida = "";
  let i = 0;
  while (i < codigo.length) {
    const c = codigo[i]!;
    const prox = codigo[i + 1];
    if (c === "/" && prox === "/") {
      while (i < codigo.length && codigo[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && prox === "*") {
      i += 2;
      while (i < codigo.length && !(codigo[i] === "*" && codigo[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      const aspas = c;
      i++;
      while (i < codigo.length && codigo[i] !== aspas) {
        if (codigo[i] === "\\") i++;
        i++;
      }
      i++;
      saida += '""';
      continue;
    }
    saida += c;
    i++;
  }
  return saida;
}

function listarFontes(): string[] {
  return (readdirSync(RAIZ_SRC, { recursive: true }) as string[])
    .filter((f) => f.endsWith(".ts"))
    .map((f) => join(RAIZ_SRC, f))
    .sort();
}

const PROIBIDOS_EM_TODO_O_MOTOR: { nome: string; padrao: RegExp }[] = [
  { nome: "Math.random", padrao: /\bMath\s*\.\s*random\b/ },
  { nome: "Date", padrao: /\bDate\b/ },
  { nome: "performance", padrao: /\bperformance\b/ },
  { nome: "Bun", padrao: /\bBun\b/ },
  { nome: "process", padrao: /\bprocess\b/ },
  { nome: "globalThis", padrao: /\bglobalThis\b/ },
  { nome: "setTimeout/setInterval", padrao: /\bset(Timeout|Interval|Immediate)\b/ },
  { nome: "crypto", padrao: /\bcrypto\b/ },
  { nome: "console", padrao: /\bconsole\b/ },
  { nome: "require", padrao: /\brequire\s*\(/ },
];

const TRANSCENDENTAIS: { nome: string; padrao: RegExp }[] = [
  {
    nome: "Math.<transcendental>",
    padrao: /\bMath\s*\.\s*(exp|expm1|log|log1p|log2|log10|pow|sin|cos|tan|asin|acos|atan|atan2|sinh|cosh|tanh|cbrt|hypot)\b/,
  },
  { nome: "operador **", padrao: /\*\*/ },
];

describe("regras de pureza do motor", () => {
  const fontes = listarFontes();

  test("existe código-fonte para verificar", () => {
    expect(fontes.length).toBeGreaterThan(0);
  });

  for (const arquivo of fontes) {
    const nome = relative(RAIZ_SRC, arquivo).replaceAll("\\", "/");
    const bruto = readFileSync(arquivo, "utf8");
    const codigo = removerComentariosEStrings(bruto);

    test(`${nome}: sem APIs de runtime, relógio ou aleatoriedade externa`, () => {
      const violacoes = PROIBIDOS_EM_TODO_O_MOTOR.filter((p) => p.padrao.test(codigo)).map((p) => p.nome);
      expect(violacoes).toEqual([]);
    });

    test(`${nome}: só imports relativos`, () => {
      const especificadores = [...bruto.matchAll(/^\s*(?:import|export)\b[^;]*?\bfrom\s*["']([^"']+)["']/gm)].map(
        (m) => m[1]!,
      );
      const dinamicos = [...bruto.matchAll(/\bimport\s*\(\s*["']([^"']+)["']/g)].map((m) => m[1]!);
      const externos = [...especificadores, ...dinamicos].filter((s) => !s.startsWith("./") && !s.startsWith("../"));
      expect(externos).toEqual([]);
    });

    if (nome !== ARQUIVO_MATEMATICA) {
      test(`${nome}: funções transcendentais só em ${ARQUIVO_MATEMATICA}`, () => {
        const violacoes = TRANSCENDENTAIS.filter((p) => p.padrao.test(codigo)).map((p) => p.nome);
        expect(violacoes).toEqual([]);
      });
    }
  }
});

describe("removerComentariosEStrings", () => {
  test("remove comentários de linha e de bloco", () => {
    expect(removerComentariosEStrings("a // Date\nb /* Math.random() */ c")).toBe("a \nb  c");
  });

  test("troca strings por literal vazio, respeitando escapes", () => {
    expect(removerComentariosEStrings(`x("Date \\" process", 'Bun', \`console\`)`)).toBe(`x("", "", "")`);
  });

  test("mantém o operador ** fora de comentários", () => {
    expect(removerComentariosEStrings("/** doc */ a ** b")).toBe(" a ** b");
  });

  test("detecta violação real depois da limpeza", () => {
    const codigo = removerComentariosEStrings(`// ok\nconst t = Date.now();`);
    expect(/\bDate\b/.test(codigo)).toBe(true);
  });
});
