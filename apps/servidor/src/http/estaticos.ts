/**
 * Arquivos da interface (build do Vite). No executável, vêm embutidos (`with { type: "file" }`,
 * manifesto gerado por scripts/empacotar.ts); em desenvolvimento, de uma pasta (`--web`).
 *
 * - `index.html`: `no-store` (uma versão nova do executável aparece no próximo recarregamento) e CSP.
 * - `/assets/*`: nomes com hash, `immutable` por um ano.
 * - Qualquer outro caminho sem extensão cai no `index.html` (rotas da interface: `/s/ABCDE`...).
 */
import { readdirSync, statSync } from "node:fs";
import { extname, join, relative, sep } from "node:path";

/** Caminho publicado (`/assets/index-abc.js`) → caminho do arquivo (no disco ou embutido). */
export type MapaDeArquivos = ReadonlyMap<string, string>;

/**
 * Sem scripts inline nem de fora; estilos inline permitidos (o React usa `style=`); conexões só com
 * a própria origem (inclui o WebSocket).
 */
export const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'";

const TIPOS: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json",
};

export function arquivosDaPasta(pasta: string): Map<string, string> {
  const mapa = new Map<string, string>();
  const visitar = (dir: string) => {
    for (const nome of readdirSync(dir)) {
      const caminho = join(dir, nome);
      if (statSync(caminho).isDirectory()) visitar(caminho);
      else mapa.set(`/${relative(pasta, caminho).split(sep).join("/")}`, caminho);
    }
  };
  visitar(pasta);
  return mapa;
}

export function criarEstaticos(arquivos: MapaDeArquivos): (req: Request) => Response | null {
  const indice = arquivos.get("/index.html");

  function responder(publicado: string, caminho: string, metodo: string): Response {
    const ehIndice = publicado === "/index.html";
    const cabecalhos: Record<string, string> = {
      "Content-Type": TIPOS[extname(publicado).toLowerCase()] ?? "application/octet-stream",
      "Cache-Control": ehIndice ? "no-store" : publicado.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "no-cache",
    };
    if (ehIndice) cabecalhos["Content-Security-Policy"] = CSP;
    return new Response(metodo === "HEAD" ? null : Bun.file(caminho), { headers: cabecalhos });
  }

  return (req) => {
    if (req.method !== "GET" && req.method !== "HEAD") return null;
    let caminho: string;
    try {
      caminho = decodeURIComponent(new URL(req.url).pathname);
    } catch {
      return null;
    }
    if (caminho.startsWith("/api/") || caminho === "/ws") return null;
    const publicado = caminho === "/" ? "/index.html" : caminho;
    const arquivo = arquivos.get(publicado);
    if (arquivo) return responder(publicado, arquivo, req.method);
    // Arquivo que não existe (asset antigo, favicon...): 404, não a página.
    if (caminho.startsWith("/assets/") || extname(caminho) !== "") return null;
    return indice ? responder("/index.html", indice, req.method) : null;
  };
}
