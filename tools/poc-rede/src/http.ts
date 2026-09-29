import type { Server } from "bun";

export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export function json(data: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...init.headers },
  });
}

export function html(body: string, status = 200): Response {
  return new Response(body, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

export function css(body: string): Response {
  return new Response(body, { headers: { "Content-Type": "text/css; charset=utf-8" } });
}

export async function readJson(req: Request, maxBytes = 50_000): Promise<unknown> {
  const text = await req.text();
  if (text.length > maxBytes) throw new Error("corpo grande demais");
  return JSON.parse(text);
}

export function clientIp(server: Server<unknown>, req: Request): string {
  return (server.requestIP(req)?.address ?? "?").replace(/^::ffff:/, "");
}

export const isLoopbackIp = (ip: string) => ip.startsWith("127.") || ip === "::1";

/**
 * True only for requests made on this computer to a loopback name. The Host check
 * blocks DNS-rebinding; requiring JSON on POST forces a CORS preflight (which we
 * never grant) for cross-site requests.
 */
export function isLocalRequest(server: Server<unknown>, req: Request): boolean {
  if (!isLoopbackIp(clientIp(server, req))) return false;
  const host = (req.headers.get("host") ?? "").replace(/:\d+$/, "").toLowerCase();
  if (!["127.0.0.1", "localhost", "[::1]"].includes(host)) return false;
  if (req.method === "POST" && !(req.headers.get("content-type") ?? "").includes("application/json")) return false;
  return true;
}
