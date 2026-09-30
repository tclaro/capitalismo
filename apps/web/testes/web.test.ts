/**
 * Interface: rotas (ida e volta), cliente HTTP e contraste dos tokens do tema (WCAG AA).
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import fc from "fast-check";
import { pedir } from "../src/cliente/api";
import { caminhoDe, type Rota, rotaDe } from "../src/roteador";

describe("rotas", () => {
  test("caminhos conhecidos", () => {
    expect(rotaDe("/")).toEqual({ tela: "entrada", codigo: null });
    expect(rotaDe("/", "?codigo=abcde")).toEqual({ tela: "entrada", codigo: "ABCDE" });
    expect(rotaDe("/", "?codigo=abc")).toEqual({ tela: "entrada", codigo: null });
    expect(rotaDe("/s/k7qm2")).toEqual({ tela: "aluno", codigo: "K7QM2" });
    expect(rotaDe("/s/k7qm2/")).toEqual({ tela: "aluno", codigo: "K7QM2" });
    expect(rotaDe("/professor")).toEqual({ tela: "professor", codigo: null });
    expect(rotaDe("/professor/ABCDE")).toEqual({ tela: "professor", codigo: "ABCDE" });
    expect(rotaDe("/telao/ABCDE", "?t=xyz")).toEqual({ tela: "telao", codigo: "ABCDE", token: "xyz" });
    expect(rotaDe("/telao/ABCDE")).toEqual({ tela: "telao", codigo: "ABCDE", token: null });
    expect(rotaDe("/admin")).toEqual({ tela: "admin" });
  });

  test("caminhos inválidos não quebram: página não encontrada", () => {
    for (const c of ["/s", "/s/ABC", "/s/ABCDEF", "/s/AB CD", "/professor/x", "/admin/x", "/nada", "/s/ABCDE/extra", "/telao"]) {
      expect(rotaDe(c)).toEqual({ tela: "nao-encontrada" });
    }
    fc.assert(
      fc.property(fc.string(), fc.string(), (caminho, busca) => {
        let r: Rota;
        try {
          r = rotaDe(`/${caminho}`, busca);
        } catch (e) {
          // decodeURIComponent de sequência inválida: não pode acontecer com o navegador, que já normaliza.
          return e instanceof URIError;
        }
        return typeof r.tela === "string";
      }),
    );
  });

  test("ida e volta: rotaDe(caminhoDe(r)) = r", () => {
    const codigo = fc.stringMatching(/^[A-Z0-9]{5}$/);
    const rota: fc.Arbitrary<Rota> = fc.oneof(
      fc.record({ tela: fc.constant("entrada" as const), codigo: fc.option(codigo, { nil: null }) }),
      fc.record({ tela: fc.constant("aluno" as const), codigo }),
      fc.record({ tela: fc.constant("professor" as const), codigo: fc.option(codigo, { nil: null }) }),
      fc.record({ tela: fc.constant("telao" as const), codigo, token: fc.option(fc.string({ minLength: 1 }), { nil: null }) }),
      fc.constant({ tela: "admin" as const }),
    );
    fc.assert(
      fc.property(rota, (r) => {
        const c = caminhoDe(r);
        const i = c.indexOf("?");
        expect(i < 0 ? rotaDe(c) : rotaDe(c.slice(0, i), c.slice(i))).toEqual(r);
      }),
    );
  });
});

describe("cliente HTTP", () => {
  const resposta = (status: number, corpo: unknown) => async () => new Response(typeof corpo === "string" ? corpo : JSON.stringify(corpo), { status });

  test("sucesso ganha ok: true; erro traz o motivo do servidor", async () => {
    expect(await pedir<{ vagas: unknown[] }>("/x", { buscar: resposta(200, { vagas: [] }) })).toEqual({ status: 200, corpo: { ok: true, vagas: [] } });
    expect(await pedir("/x", { buscar: resposta(401, { ok: false, motivo: "PIN incorreto" }) })).toEqual({ status: 401, corpo: { ok: false, motivo: "PIN incorreto" } });
    expect((await pedir("/x", { buscar: resposta(429, { ok: false, motivo: "aguarde", esperaS: 30 }) })).corpo).toEqual({ ok: false, motivo: "aguarde", esperaS: 30 });
  });

  test("falha de rede e resposta que não é JSON viram motivos legíveis, sem exceção", async () => {
    const r = await pedir("/x", {
      buscar: async () => {
        throw new TypeError("Failed to fetch");
      },
    });
    expect(r).toEqual({ status: 0, corpo: { ok: false, motivo: "sem conexão com o servidor" } });
    expect((await pedir("/x", { buscar: resposta(502, "<html>Bad Gateway</html>") })).corpo).toEqual({ ok: false, motivo: "resposta inesperada do servidor (502)" });
    expect((await pedir("/x", { buscar: resposta(500, { erro: 1 }) })).corpo).toMatchObject({ ok: false, motivo: "erro 500" });
  });

  test("corpo vai como JSON e método padrão é POST; sem corpo, GET", async () => {
    const vistos: { metodo: string | undefined; tipo: string | null; corpo: unknown }[] = [];
    const buscar = async (_: string, init?: RequestInit) => {
      vistos.push({ metodo: init?.method, tipo: new Headers(init?.headers).get("content-type"), corpo: init?.body ?? null });
      return new Response("{}");
    };
    await pedir("/a", { buscar, corpo: { x: 1 } });
    await pedir("/b", { buscar });
    await pedir("/c", { buscar, metodo: "DELETE" });
    expect(vistos).toEqual([
      { metodo: "POST", tipo: "application/json", corpo: '{"x":1}' },
      { metodo: "GET", tipo: null, corpo: null },
      { metodo: "DELETE", tipo: null, corpo: null },
    ]);
  });
});

describe("tema: contraste WCAG AA", () => {
  const css = readFileSync(join(import.meta.dir, "..", "src", "tema", "tokens.css"), "utf8");

  /** Variáveis de cor de um bloco CSS (o primeiro bloco que casa com o seletor). */
  function coresDoBloco(seletor: RegExp): Record<string, string> {
    const m = seletor.exec(css);
    if (!m) throw new Error(`bloco não encontrado: ${seletor}`);
    const inicio = css.indexOf("{", m.index) + 1;
    const corpo = css.slice(inicio, css.indexOf("}", inicio));
    return Object.fromEntries([...corpo.matchAll(/--(cor-[a-z0-9-]+):\s*(#[0-9a-f]{6})/gi)].map((x) => [x[1]!, x[2]!.toLowerCase()]));
  }

  function luminancia(hex: string): number {
    const [r, g, b] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    }) as [number, number, number];
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  const contraste = (a: string, b: string) => {
    const [x, y] = [luminancia(a), luminancia(b)].sort((p, q) => q - p) as [number, number];
    return (x + 0.05) / (y + 0.05);
  };

  const claro = coresDoBloco(/^:root \{/m);
  const escuroSistema = { ...claro, ...coresDoBloco(/:root:not\(\[data-tema="claro"\]\)/) };
  const escuroEscolhido = { ...claro, ...coresDoBloco(/:root\[data-tema="escuro"\]/) };

  // [texto, fundo, mínimo]: 4,5 para texto normal; 3 para foco e bordas de componentes (1.4.11).
  const PARES: [string, string, number][] = [
    ["cor-texto", "cor-fundo", 4.5],
    ["cor-texto", "cor-superficie", 4.5],
    ["cor-texto", "cor-superficie-2", 4.5],
    ["cor-texto-2", "cor-superficie", 4.5],
    ["cor-texto-2", "cor-fundo", 4.5],
    ["cor-texto-2", "cor-superficie-2", 4.5],
    ["cor-primaria", "cor-superficie", 4.5],
    ["cor-primaria", "cor-fundo", 4.5],
    ["cor-texto-na-primaria", "cor-primaria", 4.5],
    ["cor-texto-na-primaria", "cor-primaria-hover", 4.5],
    ["cor-lucro", "cor-superficie", 4.5],
    ["cor-prejuizo", "cor-superficie", 4.5],
    ["cor-alerta", "cor-superficie", 4.5],
    ["cor-neutro", "cor-superficie", 4.5],
    ["cor-lucro", "cor-fundo-lucro", 4.5],
    ["cor-prejuizo", "cor-fundo-prejuizo", 4.5],
    ["cor-alerta", "cor-fundo-alerta", 4.5],
    ["cor-texto", "cor-borda", 3],
    ["cor-foco", "cor-fundo", 3],
    ["cor-foco", "cor-superficie", 3],
  ];

  for (const [nome, tema] of [
    ["claro", claro],
    ["escuro (sistema)", escuroSistema],
    ["escuro (escolhido)", escuroEscolhido],
  ] as const) {
    test(`tema ${nome}`, () => {
      const falhas = PARES.filter(([t, f, min]) => contraste(tema[t]!, tema[f]!) < min).map(([t, f, min]) => `${t} sobre ${f}: ${contraste(tema[t]!, tema[f]!).toFixed(2)} < ${min}`);
      expect(falhas).toEqual([]);
    });
  }

  test("os dois blocos do tema escuro são idênticos (sistema e escolha)", () => {
    expect(coresDoBloco(/:root:not\(\[data-tema="claro"\]\)/)).toEqual(coresDoBloco(/:root\[data-tema="escuro"\]/));
    expect(Object.keys(coresDoBloco(/:root\[data-tema="escuro"\]/)).sort()).toEqual(Object.keys(claro).sort());
  });
});
