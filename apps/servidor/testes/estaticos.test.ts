/**
 * Arquivos da interface: mapa da pasta, cache, CSP, fallback de SPA e o que não cai nele.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { arquivosDaPasta, CSP, criarEstaticos } from "../src/http/estaticos";
import { abrirBanco } from "../src/dados/banco";
import { Gerente } from "../src/gerente";
import { logSilencioso } from "../src/log";
import { iniciarServidor } from "../src/servidor";

const pasta = mkdtempSync(join(tmpdir(), "simulador-web-"));
mkdirSync(join(pasta, "assets"));
writeFileSync(join(pasta, "index.html"), '<!doctype html><div id="raiz"></div><script type="module" src="/assets/index-abc123.js"></script>');
writeFileSync(join(pasta, "assets", "index-abc123.js"), "console.log('oi')");
writeFileSync(join(pasta, "assets", "inter-latin.woff2"), "fonte");
writeFileSync(join(pasta, "icone.svg"), "<svg/>");
afterAll(() => rmSync(pasta, { recursive: true, force: true }));

const pedir = (caminho: string, metodo = "GET") => criarEstaticos(arquivosDaPasta(pasta))(new Request(`http://servidor${caminho}`, { method: metodo }));

describe("arquivos estáticos", () => {
  test("mapa da pasta com caminhos publicados em barras normais", () => {
    expect([...arquivosDaPasta(pasta).keys()].sort()).toEqual(["/assets/index-abc123.js", "/assets/inter-latin.woff2", "/icone.svg", "/index.html"]);
  });

  test("index.html: no-store e CSP; assets: immutable; outros: no-cache", async () => {
    const raiz = pedir("/")!;
    expect(raiz.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(raiz.headers.get("cache-control")).toBe("no-store");
    expect(raiz.headers.get("content-security-policy")).toBe(CSP);
    expect(await raiz.text()).toContain('id="raiz"');
    const js = pedir("/assets/index-abc123.js")!;
    expect([js.headers.get("content-type"), js.headers.get("cache-control")]).toEqual(["text/javascript; charset=utf-8", "public, max-age=31536000, immutable"]);
    expect(js.headers.get("content-security-policy")).toBeNull();
    expect(pedir("/assets/inter-latin.woff2")!.headers.get("content-type")).toBe("font/woff2");
    expect(pedir("/icone.svg")!.headers.get("cache-control")).toBe("no-cache");
  });

  test("rotas da interface caem no index.html; arquivos inexistentes, API e WS não", async () => {
    for (const rota of ["/s/ABCDE", "/professor", "/professor/ABCDE", "/telao/ABCDE", "/admin", "/qualquer/coisa"]) {
      const r = pedir(rota)!;
      expect(r.headers.get("cache-control")).toBe("no-store");
      expect(await r.text()).toContain('id="raiz"');
    }
    for (const nada of ["/assets/velho-999.js", "/assets/sem-extensao", "/favicon.ico", "/robots.txt", "/api/servidor", "/api/x", "/ws"]) {
      expect(pedir(nada)).toBeNull();
    }
    expect(pedir("/", "POST")).toBeNull();
    expect(pedir("/%E0%A4%A")).toBeNull();
  });

  test("HEAD: cabeçalhos sem corpo", async () => {
    const r = pedir("/", "HEAD")!;
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(await r.text()).toBe("");
  });

  test("sem index.html (build ausente), nada cai no fallback", () => {
    const soAsset = criarEstaticos(new Map([["/assets/a.js", join(pasta, "assets", "index-abc123.js")]]));
    expect(soAsset(new Request("http://x/s/ABCDE"))).toBeNull();
  });

  test("pelo servidor: interface servida, com os cabeçalhos de segurança; API continua na frente", async () => {
    const db = abrirBanco(":memory:");
    const gerente = new Gerente({ db, log: logSilencioso });
    const srv = iniciarServidor({ gerente, porta: 0, hostname: "127.0.0.1", estaticos: criarEstaticos(arquivosDaPasta(pasta)) });
    try {
      const base = `http://127.0.0.1:${srv.porta}`;
      const pagina = await fetch(`${base}/s/ABCDE`);
      expect(pagina.status).toBe(200);
      expect(pagina.headers.get("content-security-policy")).toBe(CSP);
      expect(pagina.headers.get("x-frame-options")).toBe("DENY");
      expect(pagina.headers.get("referrer-policy")).toBe("no-referrer");
      expect((await fetch(`${base}/api/servidor`)).headers.get("content-type")).toContain("application/json");
      expect((await fetch(`${base}/api/nada`)).status).toBe(404);
      expect((await fetch(`${base}/assets/velho.js`)).status).toBe(404);
    } finally {
      await srv.parar();
      db.close();
    }
  });
});
