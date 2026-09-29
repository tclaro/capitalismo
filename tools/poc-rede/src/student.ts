// "Aluno" mode: a page served only on 127.0.0.1 (never triggers the firewall),
// UDP discovery by broadcast question/answer, connection tests and a load generator.

import os from "node:os";
import type { Server } from "bun";
import { APP_VERSION, PROTO, PROTOCOL_VERSION, TIMEOUTS, type Options } from "./config";
import { css, html, isLocalRequest, json, readJson } from "./http";
import { errMsg, fileStamp, log, logEntries, type LogEntry } from "./log";
import type { LoadSummary, PortProbe, RoomAnnouncement, TestResult, Via } from "./protocol";
import { reportDir, saveReport, studentReportText } from "./report";
import { summarize, type LatencyStats } from "./stats";
import { collectSysInfo, listIPv4, type Iface, type SysInfo } from "./sysinfo";
import studentPage from "./pages/student.html" with { type: "text" };
import stylePage from "./pages/style.css" with { type: "text" };

const STUDENT_HTML = studentPage as unknown as string;
const STYLE_CSS = stylePage as unknown as string;

export interface FoundRoom {
  code: string;
  roomName: string;
  machine: string;
  ip: string;
  seenFrom: string[];
  roomPort: number | null;
  openPorts: number[];
  appVersion: string;
  v: number;
  compatible: boolean;
  replyMs: number;
}

export interface DiscoveryRun {
  at: string;
  udpPort: number;
  sentTo: string[];
  errors: string[];
  rooms: FoundRoom[];
}

export interface ExeTest {
  at: string;
  ip: string;
  port: number;
  result: TestResult;
  sentToHost: boolean;
  sendError?: string;
  browserUrl: string;
}

export interface LoadRun {
  ip: string;
  port: number;
  requested: number;
  durationS: number;
  startedAt: string;
  endedAt: string | null;
  phase: "abrindo" | "rodando" | "encerrado";
  opened: number;
  failed: number;
  active: number;
  drops: number;
  latency: LatencyStats | null;
  errors: string[];
  sentToHost: boolean | null;
}

export interface StudentSnapshot {
  appVersion: string;
  machine: string;
  startedAt: string;
  now: string;
  sys: SysInfo | null;
  discoveries: DiscoveryRun[];
  tests: ExeTest[];
  loads: LoadRun[];
  reportDir: string;
  log: LogEntry[];
}

const ipToInt = (a: string) => a.split(".").reduce((acc, p) => ((acc << 8) | Number(p)) >>> 0, 0);

function sameSubnet(ip: string, iface: Iface): boolean {
  const m = ipToInt(iface.netmask);
  return ((ipToInt(ip) & m) >>> 0) === ((ipToInt(iface.address) & m) >>> 0);
}

/** `lan` is already ranked (lab LAN first, virtual adapters last). */
function preferredAddress(candidates: string[], lan: Iface[]): string | null {
  for (const iface of lan) {
    const hit = candidates.find((c) => !c.startsWith("127.") && sameSubnet(c, iface));
    if (hit) return hit;
  }
  return candidates.find((c) => !c.startsWith("127.")) ?? candidates[0] ?? null;
}

const HOST_RE = /^[a-zA-Z0-9.-]{1,253}$/;

function validTarget(ip: unknown, port: unknown): { ip: string; port: number } {
  if (typeof ip !== "string" || !HOST_RE.test(ip)) throw new Error("endereço inválido");
  const p = Number(port);
  if (!Number.isInteger(p) || p < 1 || p > 65535) throw new Error("porta inválida");
  return { ip, port: p };
}

function openWs(url: string, timeoutMs: number): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const timer = setTimeout(() => {
      reject(new Error(`tempo esgotado (${timeoutMs / 1000} s)`));
      try {
        ws.close();
      } catch {}
    }, timeoutMs);
    ws.onopen = () => {
      clearTimeout(timer);
      resolve(ws);
    };
    ws.onerror = () => {
      clearTimeout(timer);
      reject(new Error("falha ao conectar"));
    };
    ws.onclose = (e) => {
      clearTimeout(timer);
      reject(new Error(`conexão fechada (código ${e.code})`));
    };
  });
}

async function timedFetch(url: string, timeoutMs: number, init: RequestInit = {}): Promise<{ ok: boolean; ms: number; body?: unknown; error?: string }> {
  const t0 = performance.now();
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    const ms = Math.round((performance.now() - t0) * 10) / 10;
    if (!res.ok) return { ok: false, ms, error: `HTTP ${res.status}` };
    return { ok: true, ms, body: await res.json().catch(() => null) };
  } catch (e) {
    const name = (e as Error)?.name;
    const error = name === "TimeoutError" || name === "AbortError" ? `sem resposta em ${timeoutMs / 1000} s` : errMsg(e);
    return { ok: false, ms: Math.round(performance.now() - t0), error };
  }
}

export async function startStudent(opts: Options): Promise<{ url: string }> {
  const machine = os.hostname();
  const clientId = `exe-${machine}-${process.pid}`;
  const startedAt = new Date();
  const autosaveName = `relatorio-aluno-${machine}-${fileStamp(startedAt)}`;
  let sys: SysInfo | null = null;
  const discoveries: DiscoveryRun[] = [];
  const tests: ExeTest[] = [];
  const loads: LoadRun[] = [];
  let discovering: Promise<DiscoveryRun> | null = null;

  log(`Modo ALUNO — máquina ${machine} — versão ${APP_VERSION}`);
  collectSysInfo().then((s) => {
    sys = s;
    for (const e of s.errors) log(`Aviso: ${e}`);
  });

  function snapshot(fullLog = false): StudentSnapshot {
    return {
      appVersion: APP_VERSION,
      machine,
      startedAt: startedAt.toISOString(),
      now: new Date().toISOString(),
      sys,
      discoveries: discoveries.slice(-10),
      tests,
      loads,
      reportDir: reportDir(),
      log: fullLog ? logEntries() : logEntries().slice(-30),
    };
  }

  function save(baseName = autosaveName) {
    const snap = snapshot(true);
    return saveReport(baseName, snap, studentReportText(snap));
  }

  function autosave() {
    try {
      save();
    } catch (e) {
      log(`Falha ao salvar relatório local: ${errMsg(e)}`);
    }
  }

  async function discover(): Promise<DiscoveryRun> {
    const run: DiscoveryRun = { at: new Date().toISOString(), udpPort: opts.udpPort, sentTo: [], errors: [], rooms: [] };
    const rooms = new Map<string, FoundRoom>();
    const errors = new Set<string>();
    const lan = listIPv4().filter((i) => !i.internal);
    // Directed broadcasts reach every adapter; 255.255.255.255 alone leaves only one on Windows.
    // 127.0.0.1 finds a room running on this same computer.
    run.sentTo = [...new Set(["255.255.255.255", ...lan.map((i) => i.broadcast), "127.0.0.1"])];
    const t0 = performance.now();
    const msg = JSON.stringify({ proto: PROTO, v: PROTOCOL_VERSION, type: "discover", machine, appVersion: APP_VERSION });

    let sock;
    try {
      sock = await Bun.udpSocket({
        port: 0,
        socket: {
          data(_s, buf, _rport, raddr) {
            let m: RoomAnnouncement;
            try {
              m = JSON.parse(buf.toString());
            } catch {
              return;
            }
            if (m.proto !== PROTO || m.type !== "room" || typeof m.code !== "string") return;
            const from = raddr.replace(/^::ffff:/, "");
            const existing = rooms.get(m.code);
            if (existing) {
              if (!existing.seenFrom.includes(from)) existing.seenFrom.push(from);
              if (existing.ip.startsWith("127.") && !from.startsWith("127.")) existing.ip = from;
              return;
            }
            rooms.set(m.code, {
              code: String(m.code).slice(0, 8),
              roomName: String(m.roomName ?? "").slice(0, 80),
              machine: String(m.machine ?? "").slice(0, 80),
              ip: from,
              seenFrom: [from],
              roomPort: typeof m.roomPort === "number" ? m.roomPort : null,
              openPorts: Array.isArray(m.openPorts) ? m.openPorts.filter((p) => typeof p === "number").slice(0, 20) : [],
              appVersion: String(m.appVersion ?? "?").slice(0, 20),
              v: Number(m.v),
              compatible: m.v === PROTOCOL_VERSION,
              replyMs: Math.round(performance.now() - t0),
            });
          },
        },
      });
      sock.setBroadcast(true);
    } catch (e) {
      run.errors.push(`Não foi possível abrir o socket UDP: ${errMsg(e)}`);
      discoveries.push(run);
      log(`Busca UDP falhou: ${run.errors[0]}`);
      return run;
    }

    for (let round = 0; round < 3; round++) {
      for (const target of run.sentTo) {
        try {
          sock.send(msg, opts.udpPort, target);
        } catch (e) {
          errors.add(`${target}: ${errMsg(e)}`);
        }
      }
      await Bun.sleep(800);
    }
    await Bun.sleep(600);
    sock.close();

    run.errors = [...errors];
    // A host with several adapters answers from each; prefer the address on our best LAN subnet.
    for (const room of rooms.values()) room.ip = preferredAddress(room.seenFrom, lan) ?? room.ip;
    run.rooms = [...rooms.values()];
    discoveries.push(run);
    if (discoveries.length > 50) discoveries.shift();
    log(
      `Busca UDP (porta ${opts.udpPort}, enviada para ${run.sentTo.join(", ")}): ` +
        (run.rooms.length ? run.rooms.map((r) => `${r.roomName} em ${r.ip}:${r.roomPort}`).join("; ") : "nenhuma sala encontrada") +
        (run.errors.length ? ` — erros: ${run.errors.join("; ")}` : ""),
    );
    autosave();
    return run;
  }

  async function runTest(ip: string, port: number, via: Via, knownPorts: number[] | null): Promise<ExeTest> {
    log(`Testando ${ip}:${port} (via ${via === "udp" ? "lista UDP" : "endereço digitado"})...`);
    const base = `http://${ip}:${port}`;
    const httpRes = await timedFetch(`${base}/ping`, TIMEOUTS.httpMs);

    let openPorts = knownPorts;
    if (!openPorts && httpRes.ok) {
      const info = await timedFetch(`${base}/api/info`, TIMEOUTS.httpMs);
      const ann = info.body as RoomAnnouncement | null;
      openPorts = Array.isArray(ann?.openPorts) ? ann.openPorts.filter((p) => typeof p === "number") : null;
    }

    const wsUrl = `ws://${ip}:${port}/ws?role=client&kind=executavel&clientId=${encodeURIComponent(clientId)}&machine=${encodeURIComponent(machine)}&via=${via}`;
    let wsCheck: TestResult["ws"] = { ok: false };
    const rtts: number[] = [];
    const t0 = performance.now();
    try {
      const ws = await openWs(wsUrl, TIMEOUTS.wsOpenMs);
      wsCheck = { ok: true, ms: Math.round((performance.now() - t0) * 10) / 10 };
      ws.onclose = null;
      ws.onmessage = (ev) => {
        try {
          const m = JSON.parse(String(ev.data));
          if (m.type === "pong" && typeof m.t === "number") rtts.push(performance.now() - m.t);
          else if (m.type === "hping") ws.send(JSON.stringify({ type: "hpong", t: m.t }));
        } catch {}
      };
      ws.send(JSON.stringify({ type: "hello", userAgent: `poc-rede.exe ${APP_VERSION} (Bun ${Bun.version})` }));
      for (let i = 0; i < 20; i++) {
        ws.send(JSON.stringify({ type: "ping", t: performance.now() }));
        await Bun.sleep(100);
      }
      await Bun.sleep(500);
      ws.close(1000, "fim do teste");
    } catch (e) {
      wsCheck = { ok: false, error: errMsg(e) };
    }

    const ports: PortProbe[] = [];
    for (const p of openPorts ?? []) {
      if (p === port) {
        ports.push({ port: p, ok: httpRes.ok, ms: httpRes.ms, error: httpRes.error });
        continue;
      }
      const r = await timedFetch(`http://${ip}:${p}/ping`, TIMEOUTS.portProbeMs);
      ports.push({ port: p, ok: r.ok, ms: r.ms, error: r.error });
    }
    if (!ports.some((p) => p.port === port)) ports.unshift({ port, ok: httpRes.ok, ms: httpRes.ms, error: httpRes.error });

    const result: TestResult = {
      clientId,
      kind: "executavel",
      machine,
      via,
      userAgent: `poc-rede.exe ${APP_VERSION} (Bun ${Bun.version})`,
      http: { ok: httpRes.ok, ms: httpRes.ms, error: httpRes.error },
      ws: wsCheck,
      latency: summarize(rtts),
      ports,
    };

    const test: ExeTest = {
      at: new Date().toISOString(),
      ip,
      port,
      result,
      sentToHost: false,
      browserUrl: `${base}/teste?via=${via}&maquina=${encodeURIComponent(machine)}`,
    };
    const sent = await timedFetch(`${base}/api/resultado`, TIMEOUTS.httpMs, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(result),
    });
    test.sentToHost = sent.ok;
    if (!sent.ok) test.sendError = sent.error;

    tests.push(test);
    log(
      `Resultado ${ip}:${port}: HTTP ${httpRes.ok ? "ok" : `FALHOU (${httpRes.error})`}, WebSocket ${wsCheck.ok ? "ok" : `FALHOU (${wsCheck.error})`}` +
        (result.latency ? `, latência média ${result.latency.avg} ms` : "") +
        `, portas: ${ports.map((p) => `${p.port} ${p.ok ? "ok" : "falhou"}`).join(", ")}`,
    );
    autosave();
    return test;
  }

  async function runLoad(run: LoadRun) {
    const rtts: number[] = [];
    const errorCounts = new Map<string, number>();
    const addError = (e: string) => errorCounts.set(e, (errorCounts.get(e) ?? 0) + 1);
    const sockets: WebSocket[] = [];
    const timers: ReturnType<typeof setInterval>[] = [];
    let ending = false;

    log(`Teste de carga: abrindo ${run.requested} conexões para ${run.ip}:${run.port} por ${run.durationS} s`);
    const openOne = (i: number) =>
      new Promise<void>((resolve) => {
        let opened = false;
        let settled = false;
        const fail = (why: string) => {
          if (settled) return;
          settled = true;
          run.failed++;
          addError(why);
          resolve();
        };
        const ws = new WebSocket(
          `ws://${run.ip}:${run.port}/ws?role=load&machine=${encodeURIComponent(machine)}&clientId=${encodeURIComponent(`${clientId}-carga-${i}`)}`,
        );
        const timer = setTimeout(() => {
          fail("tempo esgotado ao abrir");
          try {
            ws.close();
          } catch {}
        }, TIMEOUTS.loadOpenMs);
        ws.onopen = () => {
          clearTimeout(timer);
          if (settled) return ws.close(1000);
          settled = true;
          opened = true;
          run.opened++;
          run.active++;
          sockets.push(ws);
          timers.push(
            setInterval(() => {
              if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "ping", t: performance.now() }));
            }, 1000),
          );
          resolve();
        };
        ws.onmessage = (ev) => {
          try {
            const m = JSON.parse(String(ev.data));
            if (m.type === "pong" && typeof m.t === "number" && rtts.length < 200_000) rtts.push(performance.now() - m.t);
          } catch {}
        };
        ws.onerror = () => {
          clearTimeout(timer);
          if (!opened) fail("falha ao conectar");
        };
        ws.onclose = (e) => {
          clearTimeout(timer);
          if (!opened) return fail(`fechada antes de abrir (código ${e.code})`);
          run.active--;
          if (!ending) {
            run.drops++;
            addError(`conexão caiu (código ${e.code})`);
          }
        };
      });

    const pending: Promise<void>[] = [];
    for (let i = 0; i < run.requested; i++) {
      pending.push(openOne(i));
      await Bun.sleep(10);
    }
    await Promise.all(pending);
    run.phase = "rodando";
    log(`Teste de carga: ${run.opened} abertas, ${run.failed} falharam; mantendo por ${run.durationS} s`);

    const deadline = Date.now() + run.durationS * 1000;
    while (Date.now() < deadline) {
      run.latency = summarize(rtts);
      run.errors = [...errorCounts].map(([e, n]) => (n > 1 ? `${e} (×${n})` : e));
      await Bun.sleep(1000);
    }
    ending = true;
    for (const t of timers) clearInterval(t);
    for (const ws of sockets) ws.close(1000, "fim do teste de carga");
    await Bun.sleep(500);

    run.latency = summarize(rtts);
    run.errors = [...errorCounts].map(([e, n]) => (n > 1 ? `${e} (×${n})` : e));
    run.phase = "encerrado";
    run.endedAt = new Date().toISOString();

    const summary: LoadSummary = {
      machine,
      requested: run.requested,
      opened: run.opened,
      failed: run.failed,
      drops: run.drops,
      durationS: run.durationS,
      latency: run.latency,
      errors: run.errors,
    };
    const sent = await timedFetch(`http://${run.ip}:${run.port}/api/carga`, TIMEOUTS.httpMs, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(summary),
    });
    run.sentToHost = sent.ok;
    log(
      `Teste de carga encerrado: ${run.opened}/${run.requested} abertas, ${run.failed} falharam, ${run.drops} caíram` +
        (run.latency ? `, latência média ${run.latency.avg} ms (máx ${run.latency.max} ms)` : "") +
        (sent.ok ? "" : ` — resumo NÃO chegou ao professor (${sent.error})`),
    );
    autosave();
  }

  const fetchHandler = async (req: Request, server: Server<unknown>): Promise<Response> => {
    const url = new URL(req.url);
    if (!isLocalRequest(server, req)) return new Response("Proibido", { status: 403 });
    try {
      switch (url.pathname) {
        case "/":
          return html(STUDENT_HTML);
        case "/estilo.css":
          return css(STYLE_CSS);
        case "/api/estado":
          return json(snapshot());
        case "/api/procurar":
          if (req.method !== "POST") break;
          discovering ??= discover().finally(() => (discovering = null));
          return json(await discovering);
        case "/api/testar": {
          if (req.method !== "POST") break;
          const body = (await readJson(req)) as Record<string, unknown>;
          const { ip, port } = validTarget(body.ip, body.port);
          const known = Array.isArray(body.openPorts) ? body.openPorts.filter((p): p is number => typeof p === "number").slice(0, 20) : null;
          return json(await runTest(ip, port, body.via === "udp" ? "udp" : "digitado", known));
        }
        case "/api/carga": {
          if (req.method !== "POST") break;
          if (loads.some((l) => l.phase !== "encerrado")) return json({ error: "Já existe um teste de carga em andamento." }, { status: 409 });
          const body = (await readJson(req)) as Record<string, unknown>;
          const { ip, port } = validTarget(body.ip, body.port);
          const run: LoadRun = {
            ip,
            port,
            requested: Math.max(1, Math.min(500, Math.round(Number(body.n) || 25))),
            durationS: Math.max(10, Math.min(600, Math.round(Number(body.durationS) || 60))),
            startedAt: new Date().toISOString(),
            endedAt: null,
            phase: "abrindo",
            opened: 0,
            failed: 0,
            active: 0,
            drops: 0,
            latency: null,
            errors: [],
            sentToHost: null,
          };
          loads.push(run);
          runLoad(run).catch((e) => {
            run.phase = "encerrado";
            run.errors.push(errMsg(e));
            log(`Teste de carga interrompido: ${errMsg(e)}`);
          });
          return json(run);
        }
        case "/api/relatorio": {
          if (req.method !== "POST") break;
          const saved = save(`relatorio-aluno-${machine}-${fileStamp(new Date())}`);
          log(`Relatório salvo: ${saved.txt}`);
          return json({ ok: true, ...saved });
        }
      }
      return new Response("Não encontrado", { status: 404 });
    } catch (e) {
      return json({ error: errMsg(e) }, { status: 400 });
    }
  };

  let server: Server<unknown>;
  try {
    server = Bun.serve({ hostname: "127.0.0.1", port: opts.studentPort, fetch: fetchHandler, idleTimeout: 60 });
  } catch (e) {
    log(`Porta local ${opts.studentPort} ocupada (${errMsg(e)}); usando outra porta local`);
    server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: fetchHandler, idleTimeout: 60 });
  }
  const url = `http://127.0.0.1:${server.port}/`;
  log(`Página do aluno (só neste computador): ${url}`);

  const shutdown = () => {
    autosave();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  return { url };
}
