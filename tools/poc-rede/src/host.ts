// "Professor" mode: the room server. Listens on the room port and every candidate
// port (all interfaces) plus the UDP discovery port, and records who got through.

import os from "node:os";
import type { Server, ServerWebSocket, WebSocketHandler } from "bun";
import { APP_VERSION, AUTOSAVE_MS, HOST_PING_MS, PROTO, PROTOCOL_VERSION, type Options } from "./config";
import { clientIp, CORS_HEADERS, css, html, isLocalRequest, isLoopbackIp, json, readJson } from "./http";
import { errMsg, fileStamp, log, logEntries, type LogEntry } from "./log";
import {
  sanitizeKind,
  sanitizeLoadSummary,
  sanitizeResult,
  sanitizeText,
  sanitizeVia,
  type ClientKind,
  type LoadSummary,
  type RoomAnnouncement,
  type TestResult,
  type Via,
} from "./protocol";
import { hostReportText, reportDir, saveReport } from "./report";
import { summarize, type LatencyStats } from "./stats";
import { collectSysInfo, listIPv4, type Iface, type SysInfo } from "./sysinfo";
import hostPage from "./pages/host.html" with { type: "text" };
import testPage from "./pages/test.html" with { type: "text" };
import stylePage from "./pages/style.css" with { type: "text" };

const HOST_HTML = hostPage as unknown as string;
const TEST_HTML = testPage as unknown as string;
const STYLE_CSS = stylePage as unknown as string;

const MAX_CLIENTS = 1000;
const MAX_DISCOVERIES = 500;

interface WsData {
  role: "client" | "load";
  ip: string;
  port: number;
  clientId: string;
  kind: ClientKind;
  machine: string;
  via: Via;
}

interface ClientRecord {
  id: string;
  kind: ClientKind;
  machine: string;
  ip: string;
  via: Via;
  userAgent: string;
  port: number;
  firstSeen: string;
  lastSeen: string;
  openSockets: number;
  rtt: number[];
  lastRtt: number | null;
  result: TestResult | null;
  resultAt: string | null;
}

interface PortStatus {
  port: number;
  ok: boolean;
  error?: string;
  externalIps: Set<string>;
}

export interface DiscoveryRecord {
  at: string;
  ip: string;
  port: number;
  machine: string;
  external: boolean;
}

export interface HostSnapshot {
  appVersion: string;
  roomName: string;
  code: string;
  machine: string;
  startedAt: string;
  now: string;
  primaryPort: number | null;
  addresses: Iface[];
  ports: { port: number; ok: boolean; error?: string; externalIps: string[] }[];
  udp: { port: number; ok: boolean; error?: string };
  sys: SysInfo | null;
  discoveries: DiscoveryRecord[];
  clients: (Omit<ClientRecord, "rtt"> & { external: boolean; live: LatencyStats | null })[];
  load: { active: number; peak: number; peakAt: string | null; total: number; drops: number; summaries: (LoadSummary & { ip: string; at: string })[] };
  summary: HostSummary;
  reportDir: string;
  log: LogEntry[];
}

export interface HostSummary {
  studentMachines: { ip: string; names: string[]; viaUdp: boolean; httpOk: boolean; wsOk: boolean }[];
  udpQueryIps: string[];
  udpConnectedIps: string[];
  portsReached: { port: number; machines: number }[];
  loadPeak: number;
  loadDrops: number;
}

function randomCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  return [...bytes].map((b) => alphabet[b % alphabet.length]).join("");
}

export async function startHost(opts: Options): Promise<{ url: string }> {
  const machine = os.hostname();
  const code = randomCode();
  const roomName = opts.roomName || `Sala de ${machine}`;
  const startedAt = new Date();
  const autosaveName = `relatorio-professor-${machine}-${fileStamp(startedAt)}-automatico`;

  let sys: SysInfo | null = null;
  const ports: PortStatus[] = [];
  const clients = new Map<string, ClientRecord>();
  const discoveries: DiscoveryRecord[] = [];
  const loadSummaries: (LoadSummary & { ip: string; at: string })[] = [];
  const load = { active: 0, peak: 0, peakAt: null as string | null, total: 0, drops: 0 };
  const clientSockets = new Set<ServerWebSocket<WsData>>();
  let udpStatus: { port: number; ok: boolean; error?: string } = { port: opts.udpPort, ok: false, error: "não iniciado" };
  let ownIps = new Set(listIPv4().map((i) => i.address));

  const isExternal = (ip: string) => !isLoopbackIp(ip) && !ownIps.has(ip);
  const openPorts = () => ports.filter((p) => p.ok).map((p) => p.port);
  const primaryPort = () => openPorts()[0] ?? null;

  log(`Modo PROFESSOR — ${roomName} — código ${code} — versão ${APP_VERSION}`);
  collectSysInfo().then((s) => {
    sys = s;
    const profiles = s.profiles?.map((p) => `${p.alias}: ${p.category}`).join(", ") || "não lido";
    log(`Informações do sistema coletadas (perfil de rede: ${profiles}; administrador: ${s.admin.member ?? "?"}, elevado: ${s.admin.elevated ?? "?"})`);
    for (const e of s.errors) log(`Aviso: ${e}`);
  });

  function upsertClient(d: { clientId: string; kind: ClientKind; machine: string; ip: string; via: Via; port: number }): ClientRecord {
    const id = d.clientId || `${d.kind}-${d.ip}`;
    let rec = clients.get(id);
    const now = new Date().toISOString();
    if (!rec) {
      if (clients.size >= MAX_CLIENTS) clients.delete(clients.keys().next().value!);
      rec = {
        id,
        kind: d.kind,
        machine: d.machine || "(sem nome)",
        ip: d.ip,
        via: d.via,
        userAgent: "",
        port: d.port,
        firstSeen: now,
        lastSeen: now,
        openSockets: 0,
        rtt: [],
        lastRtt: null,
        result: null,
        resultAt: null,
      };
      clients.set(id, rec);
      log(`Novo cliente: ${rec.machine} (${d.ip}) — ${d.kind}, via ${d.via === "udp" ? "lista UDP" : "endereço digitado"}, porta ${d.port}`);
    }
    rec.lastSeen = now;
    rec.ip = d.ip;
    if (d.machine) rec.machine = d.machine;
    return rec;
  }

  function computeSummary(): HostSummary {
    const byIp = new Map<string, HostSummary["studentMachines"][number]>();
    for (const c of clients.values()) {
      if (!isExternal(c.ip)) continue;
      const m = byIp.get(c.ip) ?? { ip: c.ip, names: [], viaUdp: false, httpOk: false, wsOk: false };
      if (!m.names.includes(c.machine)) m.names.push(c.machine);
      if (c.via === "udp") m.viaUdp = true;
      if (c.result?.http.ok) m.httpOk = true;
      if (c.result?.ws.ok || c.openSockets > 0 || c.lastRtt !== null) m.wsOk = true;
      byIp.set(c.ip, m);
    }
    const machines = [...byIp.values()];
    return {
      studentMachines: machines,
      udpQueryIps: [...new Set(discoveries.filter((d) => d.external).map((d) => d.ip))],
      udpConnectedIps: machines.filter((m) => m.viaUdp).map((m) => m.ip),
      portsReached: ports.filter((p) => p.ok).map((p) => ({ port: p.port, machines: p.externalIps.size })),
      loadPeak: load.peak,
      loadDrops: load.drops,
    };
  }

  function snapshot(fullLog = false): HostSnapshot {
    ownIps = new Set(listIPv4().map((i) => i.address));
    return {
      appVersion: APP_VERSION,
      roomName,
      code,
      machine,
      startedAt: startedAt.toISOString(),
      now: new Date().toISOString(),
      primaryPort: primaryPort(),
      addresses: listIPv4().filter((i) => !i.internal),
      ports: ports.map((p) => ({ port: p.port, ok: p.ok, error: p.error, externalIps: [...p.externalIps] })),
      udp: udpStatus,
      sys,
      discoveries: discoveries.slice(-100),
      clients: [...clients.values()].map(({ rtt, ...c }) => ({ ...c, external: isExternal(c.ip), live: summarize(rtt) })),
      load: { ...load, summaries: loadSummaries },
      summary: computeSummary(),
      reportDir: reportDir(),
      log: fullLog ? logEntries() : logEntries().slice(-40),
    };
  }

  function announcement(): RoomAnnouncement {
    return {
      proto: PROTO,
      v: PROTOCOL_VERSION,
      type: "room",
      appVersion: APP_VERSION,
      roomName,
      code,
      machine,
      roomPort: primaryPort(),
      openPorts: openPorts(),
      addresses: listIPv4()
        .filter((i) => !i.internal)
        .map((i) => i.address),
    };
  }

  function save(baseName: string) {
    const snap = snapshot(true);
    return saveReport(baseName, snap, hostReportText(snap));
  }

  const websocket: WebSocketHandler<WsData> = {
    idleTimeout: 60,
    open(ws) {
      if (ws.data.role === "load") {
        load.active++;
        load.total++;
        if (load.active > load.peak) {
          load.peak = load.active;
          load.peakAt = new Date().toISOString();
        }
        return;
      }
      const rec = upsertClient(ws.data);
      rec.openSockets++;
      clientSockets.add(ws);
    },
    message(ws, raw) {
      let m: Record<string, unknown>;
      try {
        m = JSON.parse(String(raw));
      } catch {
        return;
      }
      if (m.type === "ping") {
        ws.send(JSON.stringify({ type: "pong", t: m.t }));
      } else if (m.type === "hpong" && typeof m.t === "number") {
        const rec = clients.get(ws.data.clientId || `${ws.data.kind}-${ws.data.ip}`);
        if (!rec) return;
        const rtt = performance.now() - m.t;
        rec.lastRtt = Math.round(rtt * 10) / 10;
        rec.rtt.push(rtt);
        if (rec.rtt.length > 300) rec.rtt.shift();
        rec.lastSeen = new Date().toISOString();
      } else if (m.type === "hello") {
        const rec = clients.get(ws.data.clientId || `${ws.data.kind}-${ws.data.ip}`);
        if (rec) rec.userAgent = sanitizeText(m.userAgent, 300);
      }
    },
    close(ws, closeCode) {
      if (ws.data.role === "load") {
        load.active--;
        // The load generator always closes with 1000; anything else is a dropped connection.
        if (closeCode !== 1000) {
          load.drops++;
          log(`Teste de carga: conexão de ${ws.data.machine} (${ws.data.ip}) caiu (código ${closeCode})`);
        }
        return;
      }
      clientSockets.delete(ws);
      const rec = clients.get(ws.data.clientId || `${ws.data.kind}-${ws.data.ip}`);
      if (rec) {
        rec.openSockets = Math.max(0, rec.openSockets - 1);
        rec.lastSeen = new Date().toISOString();
      }
    },
  };

  function makeFetch(port: number) {
    return async (req: Request, server: Server<WsData>): Promise<Response | undefined> => {
      const url = new URL(req.url);
      const ip = clientIp(server, req);
      if (isExternal(ip)) {
        const p = ports.find((x) => x.port === port);
        if (p && !p.externalIps.has(ip)) {
          p.externalIps.add(ip);
          log(`Porta ${port}: primeira conexão vinda de ${ip}`);
        }
      }
      if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });

      switch (url.pathname) {
        case "/ws": {
          const q = url.searchParams;
          const data: WsData = {
            role: q.get("role") === "load" ? "load" : "client",
            ip,
            port,
            clientId: sanitizeText(q.get("clientId"), 100),
            kind: sanitizeKind(q.get("kind")),
            machine: sanitizeText(q.get("machine")),
            via: sanitizeVia(q.get("via")),
          };
          if (server.upgrade(req, { data })) return undefined;
          return new Response("Esperava uma conexão WebSocket", { status: 400 });
        }
        case "/ping":
          return json({ ok: true, proto: PROTO, v: PROTOCOL_VERSION, machine, port, t: Date.now() }, { headers: CORS_HEADERS });
        case "/api/info":
          return json(announcement(), { headers: CORS_HEADERS });
        case "/estilo.css":
          return css(STYLE_CSS);
        case "/teste":
          return html(TEST_HTML);
        case "/api/resultado": {
          if (req.method !== "POST") return new Response(null, { status: 405 });
          try {
            const r = sanitizeResult(await readJson(req));
            const rec = upsertClient({ ...r, ip, port });
            rec.kind = r.kind;
            rec.via = r.via;
            if (r.userAgent) rec.userAgent = r.userAgent;
            rec.result = r;
            rec.resultAt = new Date().toISOString();
            const reached = r.ports.filter((p) => p.ok).map((p) => p.port);
            log(
              `Resultado de ${r.machine} (${ip}, ${r.kind}): HTTP ${r.http.ok ? "ok" : "FALHOU"}, WebSocket ${r.ws.ok ? "ok" : "FALHOU"}` +
                (r.latency ? `, latência média ${r.latency.avg} ms` : "") +
                `, portas alcançadas: ${reached.join(", ") || "nenhuma"}`,
            );
            return json({ ok: true }, { headers: CORS_HEADERS });
          } catch (e) {
            return json({ ok: false, error: errMsg(e) }, { status: 400, headers: CORS_HEADERS });
          }
        }
        case "/api/carga": {
          if (req.method !== "POST") return new Response(null, { status: 405 });
          try {
            const s = { ...sanitizeLoadSummary(await readJson(req)), ip, at: new Date().toISOString() };
            loadSummaries.push(s);
            if (loadSummaries.length > 200) loadSummaries.shift();
            log(
              `Teste de carga de ${s.machine} (${ip}): ${s.opened}/${s.requested} abertas, ${s.failed} falharam, ${s.drops} caíram` +
                (s.latency ? `, latência média ${s.latency.avg} ms (máx ${s.latency.max} ms)` : ""),
            );
            return json({ ok: true });
          } catch (e) {
            return json({ ok: false, error: errMsg(e) }, { status: 400 });
          }
        }
        case "/":
        case "/painel":
          if (isLocalRequest(server, req)) return html(HOST_HTML);
          if (url.pathname === "/") return Response.redirect(`${url.origin}/teste`, 302);
          return html(
            `<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/estilo.css"><main class="narrow"><h1>Painel só no computador do professor</h1><p>Este painel abre apenas no próprio computador do professor. Para testar a conexão deste computador, abra <a href="/teste">a página de teste</a>.</p></main>`,
            403,
          );
        case "/api/estado":
          if (!isLocalRequest(server, req)) return json({ error: "só no computador do professor" }, { status: 403 });
          return json(snapshot());
        case "/api/relatorio":
          if (req.method !== "POST" || !isLocalRequest(server, req)) return json({ error: "só no computador do professor" }, { status: 403 });
          try {
            const saved = save(`relatorio-professor-${machine}-${fileStamp(new Date())}`);
            log(`Relatório salvo: ${saved.txt}`);
            return json({ ok: true, ...saved });
          } catch (e) {
            return json({ ok: false, error: errMsg(e) }, { status: 500 });
          }
        default:
          return new Response("Não encontrado", { status: 404 });
      }
    };
  }

  const order = [opts.roomPort, ...opts.candidatePorts.filter((p) => p !== opts.roomPort)];
  for (const port of order) {
    try {
      Bun.serve<WsData>({ hostname: "0.0.0.0", port, fetch: makeFetch(port), websocket });
      ports.push({ port, ok: true, externalIps: new Set() });
      log(`Porta TCP ${port}: aberta (escutando em todas as interfaces)`);
    } catch (e) {
      ports.push({ port, ok: false, error: errMsg(e), externalIps: new Set() });
      log(`Porta TCP ${port}: NÃO abriu — ${errMsg(e)}`);
    }
  }

  let udp: { close(): void } | null = null;
  try {
    udp = await Bun.udpSocket({
      hostname: "0.0.0.0",
      port: opts.udpPort,
      socket: {
        data(sock, buf, rport, raddr) {
          let m: Record<string, unknown>;
          try {
            m = JSON.parse(buf.toString());
          } catch {
            return;
          }
          if (m.proto !== PROTO || m.type !== "discover") return;
          const ip = raddr.replace(/^::ffff:/, "");
          const rec: DiscoveryRecord = { at: new Date().toISOString(), ip, port: rport, machine: sanitizeText(m.machine) || "?", external: isExternal(ip) };
          const last = discoveries.findLast((d) => d.ip === ip && d.machine === rec.machine);
          discoveries.push(rec);
          if (discoveries.length > MAX_DISCOVERIES) discoveries.shift();
          if (!last || Date.parse(rec.at) - Date.parse(last.at) > 10_000) log(`UDP: pergunta de descoberta de ${rec.machine} (${ip})`);
          sock.send(JSON.stringify(announcement()), rport, raddr);
        },
      },
    });
    udpStatus = { port: opts.udpPort, ok: true };
    log(`Porta UDP ${opts.udpPort}: aberta (descoberta de sala)`);
  } catch (e) {
    udpStatus = { port: opts.udpPort, ok: false, error: errMsg(e) };
    log(`Porta UDP ${opts.udpPort}: NÃO abriu — ${errMsg(e)}`);
  }

  // Latency as seen by the host, for every connected browser/exe.
  setInterval(() => {
    const msg = JSON.stringify({ type: "hping", t: performance.now() });
    for (const ws of clientSockets) ws.send(msg);
  }, HOST_PING_MS);

  setInterval(() => {
    try {
      save(autosaveName);
    } catch (e) {
      log(`Falha no salvamento automático: ${errMsg(e)}`);
    }
  }, AUTOSAVE_MS);

  const shutdown = () => {
    try {
      const saved = save(autosaveName);
      log(`Encerrando. Relatório salvo em ${saved.txt}`);
    } catch (e) {
      log(`Falha ao salvar relatório no encerramento: ${errMsg(e)}`);
    }
    udp?.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  let url: string;
  const primary = primaryPort();
  if (primary !== null) {
    url = `http://127.0.0.1:${primary}/`;
    const lan = listIPv4().filter((i) => !i.internal);
    log(`Painel do professor: ${url}`);
    for (const i of lan) log(`Endereço para os alunos (${i.name}): http://${i.address}:${primary}  — código ${code}`);
  } else {
    // No LAN port opened at all: still give the teacher a local dashboard to read the diagnosis.
    const fallback = Bun.serve<WsData>({ hostname: "127.0.0.1", port: 0, fetch: makeFetch(0), websocket });
    url = `http://127.0.0.1:${fallback.port}/`;
    log(`NENHUMA porta TCP abriu. Painel apenas local em ${url}`);
  }
  return { url };
}
