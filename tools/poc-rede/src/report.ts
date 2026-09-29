// Report files (.txt for people, .json for tooling). Saved next to the executable
// when that folder is writable (e.g. the pen drive), else in %LOCALAPPDATA%.

import { mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import { dirname, join } from "node:path";
import type { HostSnapshot } from "./host";
import { formatDateTime } from "./log";
import { formatLatency } from "./stats";
import type { StudentSnapshot } from "./student";
import { isCompiled, type SysInfo } from "./sysinfo";

let cachedDir: string | null = null;

export function reportDir(): string {
  if (cachedDir) return cachedDir;
  const base = isCompiled() ? dirname(process.execPath) : process.cwd();
  const candidates = [join(base, "relatorios-poc-rede"), join(process.env.LOCALAPPDATA ?? os.tmpdir(), "poc-rede", "relatorios")];
  for (const dir of candidates) {
    try {
      mkdirSync(dir, { recursive: true });
      const probe = join(dir, ".teste-gravacao");
      writeFileSync(probe, "ok");
      unlinkSync(probe);
      cachedDir = dir;
      return dir;
    } catch {}
  }
  cachedDir = os.tmpdir();
  return cachedDir;
}

export function saveReport(baseName: string, data: unknown, text: string): { dir: string; txt: string; json: string } {
  const dir = reportDir();
  const txt = join(dir, `${baseName}.txt`);
  const jsonPath = join(dir, `${baseName}.json`);
  // CRLF + BOM so Notepad on older Windows shows accents and line breaks correctly.
  writeFileSync(txt, "﻿" + text.replace(/\r?\n/g, "\r\n"), "utf8");
  writeFileSync(jsonPath, JSON.stringify(data, null, 2), "utf8");
  return { dir, txt, json: jsonPath };
}

const when = (iso: string | null | undefined) => (iso ? formatDateTime(new Date(iso)) : "—");
const yesNo = (b: boolean | null | undefined) => (b === true ? "sim" : b === false ? "não" : "não foi possível verificar");
const section = (title: string) => `\n== ${title} ==\n`;

function sysLines(sys: SysInfo | null): string[] {
  if (!sys) return ["(informações do sistema ainda não coletadas)"];
  const lines = [
    `Nome da máquina: ${sys.hostname}`,
    `Usuário: ${sys.user}`,
    `Membro do grupo Administradores: ${yesNo(sys.admin.member)}`,
    `Executando como administrador (elevado): ${yesNo(sys.admin.elevated)}`,
    `Domínio: ${sys.domain ? (sys.domain.partOfDomain ? `sim (${sys.domain.name})` : `não (grupo de trabalho ${sys.domain.name})`) : "não verificado"}`,
    `Windows: ${sys.osName} (build ${sys.osBuild})`,
    `Política de AppLocker presente: ${yesNo(sys.appLockerPolicy)}`,
    `Executável: ${sys.execPath}`,
    `Pasta atual: ${sys.cwd}`,
    `Bun: ${sys.bunVersion}`,
    "",
    "Interfaces de rede (IPv4):",
    ...sys.interfaces.map((i) => `  - ${i.name}: ${i.address} (sub-rede ${i.cidr}, broadcast ${i.broadcast})${i.internal ? " [interna]" : ""}`),
    "",
    "Perfil de rede do Windows:",
    ...(sys.profiles?.length ? sys.profiles.map((p) => `  - ${p.alias} (${p.name}): ${p.category}`) : ["  (não foi possível ler)"]),
    "",
    "Firewall do Windows (somente leitura):",
    ...(sys.firewall?.length
      ? sys.firewall.map(
          (f) =>
            `  - ${f.name}: ativo=${f.enabled}, entrada padrão=${f.defaultInbound}, regras locais de entrada permitidas=${f.allowInboundRules}, avisar ao escutar=${f.notifyOnListen}`,
        )
      : sys.firewallRaw
        ? sys.firewallRaw.split(/\r?\n/).map((l) => `  ${l}`)
        : ["  (não foi possível ler)"]),
  ];
  if (sys.errors.length) lines.push("", "Avisos na coleta:", ...sys.errors.map((e) => `  - ${e}`));
  return lines;
}

export function hostReportText(s: HostSnapshot): string {
  const sum = s.summary;
  const out: string[] = [];
  out.push("RELATÓRIO DA PoC DE REDE — MODO PROFESSOR (computador host)");
  out.push(`Gerado em: ${when(s.now)}   ·   Sala aberta em: ${when(s.startedAt)}   ·   Versão ${s.appVersion}`);
  out.push(`Sala: ${s.roomName}   ·   Código: ${s.code}   ·   Máquina: ${s.machine}`);
  out.push(`Endereço para os alunos: ${s.primaryPort ? s.addresses.map((a) => `http://${a.address}:${s.primaryPort}`).join("  ou  ") : "(nenhuma porta abriu)"}`);

  out.push(section("CONCLUSÕES PRELIMINARES"));
  out.push("1. O executável roda no computador do professor?  SIM (este relatório foi gerado por ele).");
  if (sum.studentMachines.length) {
    out.push(`2. Os alunos conseguem se conectar?  SIM — ${sum.studentMachines.length} outra(s) máquina(s) conectaram:`);
    for (const m of sum.studentMachines) {
      out.push(`     ${m.ip} (${m.names.join(", ")}): HTTP ${m.httpOk ? "ok" : "sem teste completo"}, WebSocket ${m.wsOk ? "ok" : "não"}, achou pela lista UDP: ${m.viaUdp ? "sim" : "não"}`);
    }
  } else {
    out.push("2. Os alunos conseguem se conectar?  NÃO REGISTRADO — nenhuma outra máquina chegou a este computador.");
    out.push("     Se os alunos tentaram, o firewall de entrada provavelmente está bloqueando (ver roteiro).");
  }
  const reached = sum.portsReached.filter((p) => p.machines > 0);
  out.push(
    `   Portas TCP alcançadas por outras máquinas: ${reached.length ? reached.map((p) => `${p.port} (${p.machines} máquina(s))`).join(", ") : "nenhuma"}` +
      `; portas abertas aqui: ${sum.portsReached.map((p) => p.port).join(", ") || "nenhuma"}`,
  );
  if (!s.udp.ok) out.push(`3. Descoberta automática (UDP):  porta UDP ${s.udp.port} NÃO abriu (${s.udp.error}).`);
  else if (sum.udpQueryIps.length)
    out.push(`3. Descoberta automática (UDP):  SIM — perguntas recebidas de ${sum.udpQueryIps.length} máquina(s); ${sum.udpConnectedIps.length} conectaram pela lista.`);
  else out.push("3. Descoberta automática (UDP):  NENHUMA pergunta chegou de outra máquina (sub-rede separada, isolamento ou firewall).");
  out.push(
    `4. Teste de carga:  pico de ${sum.loadPeak} conexão(ões) simultâneas; ${sum.loadDrops} queda(s); ${s.load.summaries.length} resumo(s) recebido(s).`,
  );

  out.push(section("COMPUTADOR DO PROFESSOR"));
  out.push(...sysLines(s.sys));

  out.push(section("PORTAS"));
  for (const p of s.ports) {
    out.push(
      `  TCP ${p.port}: ${p.ok ? "aberta" : `NÃO abriu (${p.error})`}` +
        (p.ok ? ` — conexões de outras máquinas: ${p.externalIps.length ? p.externalIps.join(", ") : "nenhuma"}` : ""),
    );
  }
  out.push(`  UDP ${s.udp.port}: ${s.udp.ok ? "aberta" : `NÃO abriu (${s.udp.error})`}`);

  out.push(section("DESCOBERTA UDP — perguntas recebidas"));
  if (!s.discoveries.length) out.push("  nenhuma");
  const byIp = new Map<string, { machine: string; n: number; first: string; external: boolean }>();
  for (const d of s.discoveries) {
    const e = byIp.get(d.ip) ?? { machine: d.machine, n: 0, first: d.at, external: d.external };
    e.n++;
    byIp.set(d.ip, e);
  }
  for (const [ip, e] of byIp) out.push(`  ${ip} (${e.machine})${e.external ? "" : " [este computador]"}: ${e.n} pergunta(s), primeira às ${when(e.first)}`);

  out.push(section("CLIENTES (navegadores e executáveis de aluno)"));
  if (!s.clients.length) out.push("  nenhum");
  for (const c of s.clients) {
    out.push(
      `  - ${c.machine} (${c.ip})${c.external ? "" : " [este computador]"} — ${c.kind === "navegador" ? "navegador" : "executável"}, via ${c.via === "udp" ? "lista UDP" : "endereço digitado"}, porta ${c.port}`,
    );
    out.push(`      visto de ${when(c.firstSeen)} a ${when(c.lastSeen)}; conectado agora: ${c.openSockets > 0 ? "sim" : "não"}`);
    if (c.userAgent) out.push(`      navegador/programa: ${c.userAgent}`);
    if (c.result) {
      const r = c.result;
      out.push(`      HTTP: ${r.http.ok ? `ok (${r.http.ms} ms)` : `FALHOU (${r.http.error ?? "?"})`}; WebSocket: ${r.ws.ok ? `ok (${r.ws.ms} ms)` : `FALHOU (${r.ws.error ?? "?"})`}`);
      out.push(`      latência no teste: ${formatLatency(r.latency)}`);
      out.push(`      portas: ${r.ports.map((p) => `${p.port} ${p.ok ? "ok" : `falhou (${p.error ?? "?"})`}`).join("; ") || "—"}`);
    } else out.push("      (sem resultado de teste enviado)");
    if (c.live) out.push(`      latência medida pelo professor: ${formatLatency(c.live)}`);
  }

  out.push(section("TESTE DE CARGA"));
  out.push(`  Conexões ativas agora: ${s.load.active}; pico: ${s.load.peak} (${when(s.load.peakAt)}); total aberto: ${s.load.total}; quedas: ${s.load.drops}`);
  for (const l of s.load.summaries) {
    out.push(
      `  - ${l.machine} (${l.ip}) às ${when(l.at)}: ${l.opened}/${l.requested} abertas, ${l.failed} falharam, ${l.drops} caíram, ${l.durationS} s; ${formatLatency(l.latency)}`,
    );
    for (const e of l.errors) out.push(`      erro: ${e}`);
  }

  out.push(section("REGISTRO DE EVENTOS"));
  for (const e of s.log) out.push(`  ${when(e.at)}  ${e.msg}`);
  out.push("");
  return out.join("\n");
}

export function studentReportText(s: StudentSnapshot): string {
  const out: string[] = [];
  out.push("RELATÓRIO DA PoC DE REDE — MODO ALUNO");
  out.push(`Gerado em: ${when(s.now)}   ·   Aberto em: ${when(s.startedAt)}   ·   Versão ${s.appVersion}   ·   Máquina: ${s.machine}`);

  out.push(section("RESUMO"));
  const found = s.discoveries.some((d) => d.rooms.length > 0);
  out.push(`O executável roda neste computador: SIM (este relatório foi gerado por ele).`);
  out.push(`Sala encontrada pela busca UDP: ${s.discoveries.length ? (found ? "SIM" : "NÃO") : "busca não executada"}`);
  const okTest = s.tests.find((t) => t.result.http.ok && t.result.ws.ok);
  out.push(`Conexão com o professor (HTTP + WebSocket): ${s.tests.length ? (okTest ? `SIM (${okTest.ip}:${okTest.port})` : "NÃO") : "teste não executado"}`);
  const lastLoad = s.loads.at(-1);
  if (lastLoad) out.push(`Último teste de carga: ${lastLoad.opened}/${lastLoad.requested} abertas, ${lastLoad.failed} falharam, ${lastLoad.drops} caíram`);

  out.push(section("ESTE COMPUTADOR"));
  out.push(...sysLines(s.sys));

  out.push(section("BUSCAS UDP"));
  if (!s.discoveries.length) out.push("  nenhuma");
  for (const d of s.discoveries) {
    out.push(`  - ${when(d.at)}, porta ${d.udpPort}, enviada para: ${d.sentTo.join(", ")}`);
    for (const r of d.rooms)
      out.push(`      sala "${r.roomName}" (${r.machine}) em ${r.ip}:${r.roomPort}, código ${r.code}, versão ${r.appVersion}${r.compatible ? "" : " [INCOMPATÍVEL]"}, resposta em ${r.replyMs} ms`);
    if (!d.rooms.length) out.push("      nenhuma sala respondeu");
    for (const e of d.errors) out.push(`      erro: ${e}`);
  }

  out.push(section("TESTES DE CONEXÃO"));
  if (!s.tests.length) out.push("  nenhum");
  for (const t of s.tests) {
    const r = t.result;
    out.push(`  - ${when(t.at)} → ${t.ip}:${t.port} (via ${r.via === "udp" ? "lista UDP" : "endereço digitado"})`);
    out.push(`      HTTP: ${r.http.ok ? `ok (${r.http.ms} ms)` : `FALHOU (${r.http.error ?? "?"})`}; WebSocket: ${r.ws.ok ? `ok (${r.ws.ms} ms)` : `FALHOU (${r.ws.error ?? "?"})`}`);
    out.push(`      latência: ${formatLatency(r.latency)}`);
    out.push(`      portas: ${r.ports.map((p) => `${p.port} ${p.ok ? "ok" : `falhou (${p.error ?? "?"})`}`).join("; ")}`);
    out.push(`      resultado entregue ao professor: ${t.sentToHost ? "sim" : `não (${t.sendError ?? "?"})`}`);
  }

  out.push(section("TESTES DE CARGA"));
  if (!s.loads.length) out.push("  nenhum");
  for (const l of s.loads) {
    out.push(
      `  - ${when(l.startedAt)} → ${l.ip}:${l.port}: ${l.opened}/${l.requested} abertas, ${l.failed} falharam, ${l.drops} caíram, ${l.durationS} s (${l.phase}); ${formatLatency(l.latency)}; resumo entregue ao professor: ${yesNo(l.sentToHost)}`,
    );
    for (const e of l.errors) out.push(`      erro: ${e}`);
  }

  out.push(section("REGISTRO DE EVENTOS"));
  for (const e of s.log) out.push(`  ${when(e.at)}  ${e.msg}`);
  out.push("");
  return out.join("\n");
}
