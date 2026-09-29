// poc-rede.exe — network proof of concept (design doc, section 9.9).
// No arguments: start screen in the browser + console menu. Or --professor / --aluno.

import { parseArgs } from "node:util";
import type { Server } from "bun";
import { APP_VERSION, DEFAULTS, type Options } from "./config";
import { startHost } from "./host";
import { css, html, isLocalRequest, json, readJson } from "./http";
import { errMsg, log } from "./log";
import { openBrowser } from "./openBrowser";
import { startStudent } from "./student";
import launcherPage from "./pages/launcher.html" with { type: "text" };
import stylePage from "./pages/style.css" with { type: "text" };

const LAUNCHER_HTML = launcherPage as unknown as string;
const STYLE_CSS = stylePage as unknown as string;

type Mode = "professor" | "aluno";

const HELP = `poc-rede ${APP_VERSION} — teste de rede do Simulador de Mercado

Uso: poc-rede.exe [--professor | --aluno] [opções]

  --professor           inicia a sala (computador do professor)
  --aluno               procura salas na rede (computador do aluno)
  --porta N             porta TCP da sala (padrão ${DEFAULTS.roomPort})
  --porta-udp N         porta UDP de descoberta (padrão ${DEFAULTS.udpPort})
  --candidatas A,B,C    outras portas TCP a testar (padrão ${DEFAULTS.candidatePorts.join(",")})
  --nome "Texto"        nome da sala exibido aos alunos
  --sem-navegador       não abre o navegador automaticamente
  --ajuda               mostra esta ajuda

Sem --professor/--aluno, abre uma tela inicial para escolher.`;

function parsePort(v: string | undefined, fallback: number, flag: string): number {
  if (v === undefined) return fallback;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > 65535) throw new Error(`${flag}: porta inválida "${v}"`);
  return n;
}

function parseOptions(): { mode: Mode | null; opts: Options } | null {
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      professor: { type: "boolean" },
      aluno: { type: "boolean" },
      porta: { type: "string" },
      "porta-udp": { type: "string" },
      candidatas: { type: "string" },
      nome: { type: "string" },
      "sem-navegador": { type: "boolean" },
      ajuda: { type: "boolean", short: "h" },
    },
    strict: true,
  });
  if (values.ajuda) return null;
  if (values.professor && values.aluno) throw new Error("use --professor ou --aluno, não os dois");
  const opts: Options = {
    ...DEFAULTS,
    roomPort: parsePort(values.porta, DEFAULTS.roomPort, "--porta"),
    udpPort: parsePort(values["porta-udp"], DEFAULTS.udpPort, "--porta-udp"),
    candidatePorts:
      values.candidatas !== undefined
        ? values.candidatas
            .split(",")
            .filter((s) => s.trim())
            .map((s) => parsePort(s.trim(), 0, "--candidatas"))
        : DEFAULTS.candidatePorts,
    roomName: values.nome?.slice(0, 80) || null,
    openBrowser: !values["sem-navegador"],
  };
  return { mode: values.professor ? "professor" : values.aluno ? "aluno" : null, opts };
}

async function main() {
  let parsed;
  try {
    parsed = parseOptions();
  } catch (e) {
    console.error(`Erro nos argumentos: ${errMsg(e)}\n`);
    console.log(HELP);
    process.exit(2);
  }
  if (!parsed) {
    console.log(HELP);
    return;
  }
  const { mode, opts } = parsed;

  console.log(`poc-rede ${APP_VERSION} — teste de rede do Simulador de Mercado`);
  console.log("Mantenha esta janela aberta durante o teste. Para encerrar, feche-a ou pressione Ctrl+C.\n");

  let chosen: Promise<string> | null = null;
  const choose = (m: Mode): Promise<string> =>
    (chosen ??= (m === "professor" ? startHost(opts) : startStudent(opts)).then(({ url }) => url));

  if (mode) {
    const url = await choose(mode);
    if (opts.openBrowser) openBrowser(url);
    return;
  }

  // Start screen on loopback only (does not trigger the firewall).
  const launcherFetch = async (req: Request, server: Server<unknown>) => {
    if (!isLocalRequest(server, req)) return new Response("Proibido", { status: 403 });
    const path = new URL(req.url).pathname;
    if (path === "/") return html(LAUNCHER_HTML);
    if (path === "/estilo.css") return css(STYLE_CSS);
    if (path === "/api/modo" && req.method === "POST") {
      try {
        const body = (await readJson(req)) as { mode?: unknown };
        if (body.mode !== "professor" && body.mode !== "aluno") return json({ error: "modo inválido" }, { status: 400 });
        const url = await choose(body.mode);
        setTimeout(() => launcher.stop(), 3000);
        return json({ url });
      } catch (e) {
        return json({ error: errMsg(e) }, { status: 500 });
      }
    }
    return new Response("Não encontrado", { status: 404 });
  };
  let launcher: Server<unknown>;
  try {
    launcher = Bun.serve({ hostname: "127.0.0.1", port: opts.launcherPort, fetch: launcherFetch });
  } catch {
    launcher = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: launcherFetch });
  }
  const launcherUrl = `http://127.0.0.1:${launcher.port}/`;
  log(`Tela inicial: ${launcherUrl}`);
  if (opts.openBrowser) openBrowser(launcherUrl);

  console.log("\nEscolha no navegador ou digite aqui:");
  console.log("  1 + Enter  →  Professor (criar sala)");
  console.log("  2 + Enter  →  Aluno (entrar em sala)\n");
  for await (const line of console) {
    if (chosen) break;
    const m = line.trim() === "1" ? "professor" : line.trim() === "2" ? "aluno" : null;
    if (!m) {
      console.log("Digite 1 (Professor) ou 2 (Aluno) e pressione Enter.");
      continue;
    }
    const url = await choose(m);
    launcher.stop();
    if (opts.openBrowser) openBrowser(url);
    break;
  }
}

main().catch((e) => {
  log(`ERRO FATAL: ${errMsg(e)}`);
  console.log("\nPressione Enter para fechar.");
  // Keep the console open when started by double click, so the message can be read or photographed.
  (async () => {
    for await (const _ of console) break;
    process.exit(1);
  })();
});
