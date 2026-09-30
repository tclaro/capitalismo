/**
 * Empacota o servidor num único executável para Windows, com a interface embutida:
 *
 * 1. `vite build` da interface (apps/web/dist).
 * 2. Gera `build/entrada.ts`: um `import … with { type: "file" }` por arquivo do build (o Bun embute
 *    cada um no executável) e o mapa caminho publicado → arquivo embutido.
 * 3. `bun build --compile --target=bun-windows-x64-baseline` (sem exigir AVX2: laboratórios antigos).
 * 4. Teste de fumaça do executável compilado (scripts/fumaca.ts).
 *
 * Uso: bun run empacotar [-- --sem-fumaca]
 */
import { mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import pacote from "../package.json" with { type: "json" };
import { arquivosDaPasta } from "../src/http/estaticos";
import { testarExecutavel } from "./fumaca";

const RAIZ_SERVIDOR = join(import.meta.dir, "..");
const WEB = join(RAIZ_SERVIDOR, "..", "web");
const DIST_WEB = join(WEB, "dist");
const BUILD = join(RAIZ_SERVIDOR, "build");
export const EXECUTAVEL = join(RAIZ_SERVIDOR, "dist", "simulador-de-mercado.exe");

function rodar(comando: string[], cwd: string): void {
  console.log(`$ ${comando.join(" ")}`);
  const r = Bun.spawnSync(comando, { cwd, stdout: "inherit", stderr: "inherit" });
  if (r.exitCode !== 0) throw new Error(`falhou (${r.exitCode}): ${comando.join(" ")}`);
}

/** Código da entrada do executável, com um import por arquivo da interface. */
export function gerarEntrada(arquivos: ReadonlyMap<string, string>, pastaDaEntrada: string): string {
  const linhas = ["// Gerado por scripts/empacotar.ts: não editar.", 'import { principal } from "../src/main";'];
  const pares: string[] = [];
  [...arquivos.keys()].sort().forEach((publicado, i) => {
    const caminho = relative(pastaDaEntrada, arquivos.get(publicado)!).split("\\").join("/");
    linhas.push(`import a${i} from ${JSON.stringify(caminho.startsWith(".") ? caminho : `./${caminho}`)} with { type: "file" };`);
    pares.push(`  [${JSON.stringify(publicado)}, a${i}],`);
  });
  linhas.push("", "const ARQUIVOS = new Map<string, string>([", ...pares, "]);", "");
  linhas.push("principal(process.argv.slice(2), ARQUIVOS).catch((e) => {", "  console.error(e instanceof Error ? e.message : e);", "  process.exit(1);", "});", "");
  return linhas.join("\n");
}

async function empacotar(): Promise<void> {
  const semFumaca = process.argv.includes("--sem-fumaca");
  rodar(["bun", "run", "build"], WEB);
  const arquivos = arquivosDaPasta(DIST_WEB);
  if (!arquivos.has("/index.html")) throw new Error("o build da interface não gerou index.html");

  rmSync(BUILD, { recursive: true, force: true });
  mkdirSync(BUILD, { recursive: true });
  writeFileSync(join(BUILD, "entrada.ts"), gerarEntrada(arquivos, BUILD));
  console.log(`manifesto: ${arquivos.size} arquivo(s) da interface`);

  mkdirSync(join(RAIZ_SERVIDOR, "dist"), { recursive: true });
  const versao = `${pacote.version}.0`;
  rodar(
    [
      "bun",
      "build",
      join(BUILD, "entrada.ts"),
      "--compile",
      "--minify",
      "--target=bun-windows-x64-baseline",
      "--outfile",
      EXECUTAVEL,
      "--windows-title",
      "Simulador de Mercado",
      "--windows-description",
      "Servidor do Simulador de Mercado (salas, professor, telão e alunos)",
      "--windows-version",
      versao,
    ],
    RAIZ_SERVIDOR,
  );
  console.log(`executável: ${EXECUTAVEL} (${(statSync(EXECUTAVEL).size / 1e6).toFixed(1)} MB)`);

  if (semFumaca) return;
  await testarExecutavel([EXECUTAVEL]);
  console.log("teste de fumaça do executável: ok");
}

if (import.meta.main) {
  empacotar().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
