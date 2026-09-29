// Message shapes exchanged between student and host. Everything coming from the
// network is untrusted: the host runs it through the sanitize* functions.

import { PROTO } from "./config";
import type { LatencyStats } from "./stats";

export type ClientKind = "navegador" | "executavel";
/** How the student reached the room: UDP discovery list, or an address typed by hand. */
export type Via = "udp" | "digitado";

export interface DiscoverMessage {
  proto: typeof PROTO;
  v: number;
  type: "discover";
  machine: string;
  appVersion: string;
}

export interface RoomAnnouncement {
  proto: typeof PROTO;
  v: number;
  type: "room";
  appVersion: string;
  roomName: string;
  code: string;
  machine: string;
  roomPort: number | null;
  openPorts: number[];
  addresses: string[];
}

export interface PortProbe {
  port: number;
  ok: boolean;
  ms?: number;
  error?: string;
}

export interface TestResult {
  clientId: string;
  kind: ClientKind;
  machine: string;
  via: Via;
  userAgent: string;
  http: { ok: boolean; ms?: number; error?: string };
  ws: { ok: boolean; ms?: number; error?: string };
  latency: LatencyStats | null;
  ports: PortProbe[];
}

export interface LoadSummary {
  machine: string;
  requested: number;
  opened: number;
  failed: number;
  drops: number;
  durationS: number;
  latency: LatencyStats | null;
  errors: string[];
}

const str = (x: unknown, max = 80): string => (typeof x === "string" ? x.slice(0, max) : "");
const num = (x: unknown): number | undefined => (typeof x === "number" && Number.isFinite(x) ? x : undefined);
const int = (x: unknown, fallback = 0): number => {
  const n = num(x);
  return n === undefined ? fallback : Math.max(0, Math.min(1_000_000, Math.round(n)));
};

export const sanitizeKind = (x: unknown): ClientKind => (x === "executavel" ? "executavel" : "navegador");
export const sanitizeVia = (x: unknown): Via => (x === "udp" ? "udp" : "digitado");
export const sanitizeText = str;

function sanitizeLatency(x: unknown): LatencyStats | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  const n = int(o.n);
  if (n === 0) return null;
  return { n, min: num(o.min) ?? 0, avg: num(o.avg) ?? 0, p95: num(o.p95) ?? 0, max: num(o.max) ?? 0 };
}

function sanitizeCheck(x: unknown): { ok: boolean; ms?: number; error?: string } {
  const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
  return { ok: o.ok === true, ms: num(o.ms), error: str(o.error, 200) || undefined };
}

export function sanitizeResult(body: unknown): TestResult {
  const o = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const ports = Array.isArray(o.ports) ? o.ports.slice(0, 20) : [];
  return {
    clientId: str(o.clientId, 100),
    kind: sanitizeKind(o.kind),
    machine: str(o.machine) || "(sem nome)",
    via: sanitizeVia(o.via),
    userAgent: str(o.userAgent, 300),
    http: sanitizeCheck(o.http),
    ws: sanitizeCheck(o.ws),
    latency: sanitizeLatency(o.latency),
    ports: ports.map((p) => {
      const c = sanitizeCheck(p);
      return { port: int((p as Record<string, unknown>)?.port), ...c };
    }),
  };
}

export function sanitizeLoadSummary(body: unknown): LoadSummary {
  const o = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  return {
    machine: str(o.machine) || "(sem nome)",
    requested: int(o.requested),
    opened: int(o.opened),
    failed: int(o.failed),
    drops: int(o.drops),
    durationS: int(o.durationS),
    latency: sanitizeLatency(o.latency),
    errors: Array.isArray(o.errors) ? o.errors.slice(0, 20).map((e) => str(e, 200)) : [],
  };
}
