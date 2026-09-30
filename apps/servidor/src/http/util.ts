/**
 * Utilitários HTTP do servidor (adaptados da PoC de rede, `tools/poc-rede/src/http.ts`).
 */
/** O que os utilitários usam do servidor do Bun. */
export interface ComIP {
  requestIP(req: Request): { address: string } | null;
}

export function json(dados: unknown, status = 200, cabecalhos: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(dados), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...cabecalhos },
  });
}

export const erro = (status: number, motivo: string, extra: Record<string, unknown> = {}) => json({ ok: false, motivo, ...extra }, status);

export class ErroHttp extends Error {
  constructor(
    readonly status: number,
    motivo: string,
  ) {
    super(motivo);
  }
}

/** Lê o corpo JSON com limite de tamanho; exige `Content-Type: application/json` (força preflight CORS). */
export async function lerJson(req: Request, maxBytes = 20_000): Promise<unknown> {
  if (!(req.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) throw new ErroHttp(415, "envie JSON");
  const declarado = Number(req.headers.get("content-length") ?? "0");
  if (declarado > maxBytes) throw new ErroHttp(413, "corpo grande demais");
  const texto = await req.text();
  if (texto.length > maxBytes) throw new ErroHttp(413, "corpo grande demais");
  try {
    return JSON.parse(texto);
  } catch {
    throw new ErroHttp(400, "JSON inválido");
  }
}

export function ipDoCliente(server: ComIP, req: Request): string {
  return (server.requestIP(req)?.address ?? "?").replace(/^::ffff:/, "");
}

export const ehLoopback = (ip: string) => ip.startsWith("127.") || ip === "::1";

/**
 * Verdadeiro só para pedidos feitos neste computador a um nome de loopback. Conferir o `Host` bloqueia
 * DNS rebinding.
 */
export function ehPedidoLocal(server: ComIP, req: Request): boolean {
  if (!ehLoopback(ipDoCliente(server, req))) return false;
  const host = (req.headers.get("host") ?? "").replace(/:\d+$/, "").toLowerCase();
  return ["127.0.0.1", "localhost", "[::1]"].includes(host);
}

/**
 * `Origin` aceito: ausente (cliente que não é navegador) ou igual ao próprio servidor (`http://<Host>`).
 * Em desenvolvimento, aceita também o servidor do Vite.
 */
export function origemPermitida(req: Request, extras: readonly string[] = []): boolean {
  const origem = req.headers.get("origin");
  if (origem === null) return true;
  const host = req.headers.get("host");
  if (host && origem.toLowerCase() === `http://${host.toLowerCase()}`) return true;
  return extras.includes(origem);
}

// ---------------------------------------------------------------------------------------------
// Cookies
// ---------------------------------------------------------------------------------------------

export function lerCookies(req: Request): Map<string, string> {
  const mapa = new Map<string, string>();
  for (const parte of (req.headers.get("cookie") ?? "").split(";")) {
    const i = parte.indexOf("=");
    if (i <= 0) continue;
    const nome = parte.slice(0, i).trim();
    const valor = parte.slice(i + 1).trim();
    if (!mapa.has(nome)) mapa.set(nome, valor);
  }
  return mapa;
}

/**
 * Cookie de sessão: `HttpOnly` (o JavaScript da página não lê), `SameSite=Strict` (não vai em pedidos
 * de outros sites). Sem `Secure`: a rede do laboratório é http.
 */
export function cookieDeSessao(nome: string, valor: string, maxAgeS: number): string {
  return `${nome}=${valor}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeS}`;
}

export const apagarCookie = (nome: string) => `${nome}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`;
