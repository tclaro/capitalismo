// Read-only facts about this computer. Nothing here changes any setting.
// Every probe may fail (locked-down lab machines block PowerShell, for example);
// failures are recorded as information, never thrown.

import os from "node:os";
import { basename, join } from "node:path";
import { TIMEOUTS } from "./config";
import { errMsg } from "./log";

export interface Iface {
  name: string;
  address: string;
  netmask: string;
  cidr: string;
  broadcast: string;
  internal: boolean;
  mac: string;
}

export interface NetProfile {
  alias: string;
  name: string;
  category: string;
  ipv4: string;
}

export interface FirewallProfile {
  name: string;
  enabled: string;
  defaultInbound: string;
  allowInboundRules: string;
  notifyOnListen: string;
}

export interface SysInfo {
  collectedAt: string;
  hostname: string;
  user: string;
  osName: string;
  osBuild: string;
  domain: { partOfDomain: boolean; name: string } | null;
  admin: { member: boolean | null; elevated: boolean | null };
  interfaces: Iface[];
  profiles: NetProfile[] | null;
  firewall: FirewallProfile[] | null;
  firewallRaw: string | null;
  appLockerPolicy: boolean | null;
  execPath: string;
  cwd: string;
  compiled: boolean;
  bunVersion: string;
  errors: string[];
}

// Absolute paths: PATH may put look-alikes first (Git for Windows ships its own whoami).
export const WINDOWS_DIR = process.env.SystemRoot ?? "C:\\Windows";
export const SYSTEM32 = join(WINDOWS_DIR, "System32");
const POWERSHELL = join(SYSTEM32, "WindowsPowerShell", "v1.0", "powershell.exe");

const toInt = (ip: string) => ip.split(".").reduce((acc, part) => ((acc << 8) | Number(part)) >>> 0, 0);
const fromInt = (n: number) => [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join(".");

export function broadcastOf(ip: string, mask: string): string {
  const m = toInt(mask);
  return fromInt(((toInt(ip) & m) | ~m) >>> 0);
}

function cidrOf(ip: string, mask: string): string {
  const m = toInt(mask);
  const bits = m.toString(2).replace(/0/g, "").length;
  return `${fromInt((toInt(ip) & m) >>> 0)}/${bits}`;
}

export function listIPv4(): Iface[] {
  const out: Iface[] = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const a of list ?? []) {
      if (a.family !== "IPv4") continue;
      out.push({
        name,
        address: a.address,
        netmask: a.netmask,
        cidr: cidrOf(a.address, a.netmask),
        broadcast: broadcastOf(a.address, a.netmask),
        internal: a.internal,
        mac: a.mac,
      });
    }
  }
  return rankInterfaces(out);
}

const VIRTUAL_NAME = /vethernet|virtualbox|vmware|wsl|hyper-v|docker|loopback|bluetooth|tailscale|zerotier|vpn/i;

/** Likely lab LAN addresses first; virtual adapters and link-local (169.254) last. */
export function rankInterfaces(list: Iface[]): Iface[] {
  const score = (i: Iface) => {
    if (i.internal) return 9;
    let s = 0;
    if (VIRTUAL_NAME.test(i.name)) s += 3;
    if (i.address.startsWith("169.254.")) s += 5;
    if (!/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(i.address)) s += 1;
    return s;
  };
  return [...list].sort((a, b) => score(a) - score(b));
}

export function isCompiled(): boolean {
  return !/^bun(\.exe)?$/i.test(basename(process.execPath));
}

async function run(cmd: string[], timeoutMs = TIMEOUTS.sysCommandMs): Promise<{ ok: boolean; out: string; err: string }> {
  try {
    const proc = Bun.spawn(cmd, { stdout: "pipe", stderr: "pipe", stdin: "ignore", windowsHide: true });
    const timer = setTimeout(() => proc.kill(), timeoutMs);
    const [out, err] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
    const code = await proc.exited;
    clearTimeout(timer);
    return { ok: code === 0, out, err: err || (code !== 0 ? `código de saída ${code}` : "") };
  } catch (e) {
    return { ok: false, out: "", err: errMsg(e) };
  }
}

// Each section has its own try/catch so one blocked cmdlet does not hide the others.
const PS_SCRIPT = `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$r = @{}
try { $r.profiles = @(Get-NetConnectionProfile | ForEach-Object { @{ alias = [string]$_.InterfaceAlias; name = [string]$_.Name; category = $_.NetworkCategory.ToString(); ipv4 = $_.IPv4Connectivity.ToString() } }) } catch { $r.profilesError = $_.Exception.Message }
try {
  try { $fw = Get-NetFirewallProfile -PolicyStore ActiveStore } catch { $fw = Get-NetFirewallProfile }
  $r.firewall = @($fw | ForEach-Object { @{ name = [string]$_.Name; enabled = $_.Enabled.ToString(); defaultInbound = $_.DefaultInboundAction.ToString(); allowInboundRules = $_.AllowInboundRules.ToString(); notifyOnListen = $_.NotifyOnListen.ToString() } })
} catch { $r.firewallError = $_.Exception.Message }
try { $cs = Get-CimInstance Win32_ComputerSystem; $r.domain = @{ partOfDomain = [bool]$cs.PartOfDomain; name = [string]$cs.Domain } } catch { $r.domainError = $_.Exception.Message }
try { $o = Get-CimInstance Win32_OperatingSystem; $r.os = @{ caption = [string]$o.Caption; build = [string]$o.BuildNumber } } catch { $r.osError = $_.Exception.Message }
$r.appLocker = Test-Path 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\SrpV2'
$r | ConvertTo-Json -Depth 5 -Compress
`;

const asArray = <T>(x: unknown): T[] | null => (Array.isArray(x) ? (x as T[]) : x ? [x as T] : null);

export async function collectSysInfo(): Promise<SysInfo> {
  const info: SysInfo = {
    collectedAt: new Date().toISOString(),
    hostname: os.hostname(),
    user: safe(() => os.userInfo().username, "?"),
    osName: `${os.type()} ${os.release()}`,
    osBuild: os.release(),
    domain: null,
    admin: { member: null, elevated: null },
    interfaces: listIPv4(),
    profiles: null,
    firewall: null,
    firewallRaw: null,
    appLockerPolicy: null,
    execPath: process.execPath,
    cwd: process.cwd(),
    compiled: isCompiled(),
    bunVersion: Bun.version,
    errors: [],
  };
  if (process.platform !== "win32") return info;

  const encoded = Buffer.from(PS_SCRIPT, "utf16le").toString("base64");
  const [ps, who] = await Promise.all([
    run([POWERSHELL, "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded]),
    run([join(SYSTEM32, "whoami.exe"), "/groups", "/fo", "csv", "/nh"]),
  ]);

  if (ps.out.trim()) {
    try {
      const r = JSON.parse(ps.out.trim().split(/\r?\n/).pop()!);
      info.profiles = asArray<NetProfile>(r.profiles);
      info.firewall = asArray<FirewallProfile>(r.firewall);
      if (r.domain) info.domain = { partOfDomain: !!r.domain.partOfDomain, name: String(r.domain.name ?? "") };
      if (r.os) {
        info.osName = String(r.os.caption || info.osName);
        info.osBuild = String(r.os.build || info.osBuild);
      }
      info.appLockerPolicy = typeof r.appLocker === "boolean" ? r.appLocker : null;
      for (const k of ["profilesError", "firewallError", "domainError", "osError"]) {
        if (r[k]) info.errors.push(`PowerShell (${k.replace("Error", "")}): ${r[k]}`);
      }
    } catch (e) {
      info.errors.push(`PowerShell: resposta inesperada (${errMsg(e)})`);
    }
  } else {
    info.errors.push(`PowerShell não executou: ${ps.err.trim().slice(0, 300) || "sem saída"}`);
  }

  if (who.ok) {
    // S-1-5-32-544 = Administrators group (listed even when UAC filters it out);
    // S-1-16-12288 = high integrity level, i.e. this process is elevated.
    info.admin = { member: who.out.includes("S-1-5-32-544"), elevated: who.out.includes("S-1-16-12288") };
  } else {
    info.errors.push(`whoami não executou: ${who.err.trim().slice(0, 300)}`);
  }

  if (!info.firewall) {
    const ns = await run([join(SYSTEM32, "netsh.exe"),"advfirewall", "show", "allprofiles", "state"]);
    info.firewallRaw = ns.ok ? ns.out.trim() : null;
    if (!ns.ok) info.errors.push(`netsh não executou: ${ns.err.trim().slice(0, 300)}`);
  }
  return info;
}

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}
