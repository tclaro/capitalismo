/**
 * CLI do teste de carga.
 *
 *   bun run carga [opções]
 *
 * Sem `--url`, sobe um servidor próprio (127.0.0.1, porta livre, dados temporários) e o derruba no fim.
 * Com `--url`, usa o servidor indicado e a chave `--chave` (nesse caso o servidor é de quem pediu: nada é
 * derrubado). Os relatórios vão para `ferramentas/teste-de-carga/saida/` (fora do git).
 *
 * Opções:
 *   --alunos <n>         clientes simulados (padrão: 60)
 *   --mercados <n>       mercados da sala, 1 a 3 (padrão: 2)
 *   --vagas <n>          vagas por mercado, 2 a 8 (padrão: 8)
 *   --preset <id>        cenário (padrão: cadeia/minima)
 *   --duracao <s>        segundos de jogo medido (padrão: 60)
 *   --velocidade <s>     segundos reais por dia de jogo (padrão: 0,5, o mais rápido permitido)
 *   --intervalo <ms>     intervalo médio entre decisões de um aluno (padrão: 8000)
 *   --robos <estratégia> robôs nas vagas vazias (padrão: nenhum)
 *   --url <endereço>     servidor existente (ex.: http://10.1.2.30:47800)
 *   --chave <texto>      chave de professor do servidor existente
 *   --exigir-aprovacao   sai com código 1 se algum critério falhar
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { executarCarga, type OpcoesDeCarga, type ResultadoDeCarga } from "./carga";
import { LIMITES } from "./metricas";

const RAIZ = join(import.meta.dir, "..", "..", "..");
const CHAVE_LOCAL = "chave-do-teste-de-carga";

export interface ArgumentosDaCarga {
  alunos: number;
  mercados: number;
  vagas: number;
  preset: string;
  duracao: number;
  velocidade: number;
  intervalo: number;
  robos: string | null;
  url: string | null;
  chave: string | null;
  exigirAprovacao: boolean;
}

export function lerArgumentos(argv: readonly string[]): ArgumentosDaCarga {
  const valor = (nome: string): string | undefined => {
    const i = argv.indexOf(`--${nome}`);
    if (i < 0) return undefined;
    const v = argv[i + 1];
    if (v === undefined || v.startsWith("--")) throw new Error(`--${nome} precisa de um valor`);
    return v;
  };
  const numero = (nome: string, padrao: number, min: number, max: number) => {
    const v = valor(nome);
    if (v === undefined) return padrao;
    const n = Number(v.replace(",", "."));
    if (!Number.isFinite(n) || n < min || n > max) throw new Error(`--${nome} deve estar entre ${min} e ${max} (recebido "${v}")`);
    return n;
  };
  const inteiro = (nome: string, padrao: number, min: number, max: number) => {
    const n = numero(nome, padrao, min, max);
    if (!Number.isInteger(n)) throw new Error(`--${nome} deve ser inteiro`);
    return n;
  };
  const url = valor("url") ?? null;
  const chave = valor("chave") ?? null;
  if (url && !chave) throw new Error("--url exige --chave (a chave de professor desse servidor)");
  return {
    alunos: inteiro("alunos", 60, 1, 400),
    mercados: inteiro("mercados", 2, 1, 3),
    vagas: inteiro("vagas", 8, 2, 8),
    preset: valor("preset") ?? "cadeia/minima",
    duracao: numero("duracao", 60, 5, 3600),
    velocidade: numero("velocidade", 0.5, 0.5, 10),
    intervalo: inteiro("intervalo", 8000, 200, 600_000),
    robos: valor("robos") ?? null,
    url: url ? url.replace(/\/$/, "") : null,
    chave,
    exigirAprovacao: argv.includes("--exigir-aprovacao"),
  };
}

/** Sobe o servidor local (executável do repositório) e devolve o endereço e uma função para derrubá-lo. */
async function subirServidorLocal(): Promise<{ base: string; pid: number; derrubar: () => Promise<void> }> {
  const dados = mkdtempSync(join(tmpdir(), "simulador-carga-"));
  const comando = ["bun", join(RAIZ, "apps", "servidor", "src", "main.ts")];
  const definir = Bun.spawnSync([...comando, "--dados", dados, "--definir-chave", CHAVE_LOCAL], { cwd: RAIZ });
  if (definir.exitCode !== 0) throw new Error(`não definiu a chave: ${definir.stderr}`);
  const web = join(RAIZ, "apps", "web", "dist");
  const proc = Bun.spawn([...comando, "--dados", dados, "--porta", "0", "--host", "127.0.0.1", "--web", web], { cwd: RAIZ, stdout: "pipe", stderr: "pipe" });
  const derrubar = async () => {
    Bun.spawnSync(["taskkill", "/PID", String(proc.pid), "/T", "/F"], { stdout: "ignore", stderr: "ignore" });
    for (let i = 0; i < 5; i++) {
      try {
        rmSync(dados, { recursive: true, force: true });
        return;
      } catch {
        await Bun.sleep(300);
      }
    }
  };
  try {
    const leitor = proc.stdout.getReader();
    let texto = "";
    const fim = Date.now() + 20_000;
    // Uma única leitura pendente por vez (outra leitura em paralelo perderia pedaços da saída).
    let leitura: ReturnType<typeof leitor.read> | null = null;
    while (Date.now() < fim) {
      leitura ??= leitor.read();
      const p = await Promise.race([leitura, Bun.sleep(500).then(() => null)]);
      if (!p) continue;
      leitura = null;
      if (p.done) break;
      texto += new TextDecoder().decode(p.value);
      const m = /na porta (\d+)/.exec(texto);
      if (m) {
        // Continua drenando a saída (senão o processo trava ao encher o buffer).
        void (async () => {
          for (;;) if ((await leitor.read()).done) return;
        })();
        return { base: `http://127.0.0.1:${m[1]}`, pid: proc.pid, derrubar };
      }
    }
    throw new Error(`o servidor não anunciou a porta: ${texto}`);
  } catch (e) {
    await derrubar();
    throw e;
  }
}

/** Memória (MB) e tempo de CPU (s) do processo do servidor, quando é local. Só informativo. */
function recursosDoProcesso(pid: number): { memoriaMb: number; cpuSegundos: number } | null {
  const r = Bun.spawnSync(["powershell", "-NoProfile", "-Command", `$p = Get-Process -Id ${pid} -ErrorAction SilentlyContinue; if ($p) { "$($p.WorkingSet64);$($p.CPU)" }`], { stdout: "pipe", stderr: "ignore" });
  const t = new TextDecoder().decode(r.stdout).trim();
  const m = /^(\d+);([\d.,]+)$/.exec(t);
  return m ? { memoriaMb: Number(m[1]) / 1_048_576, cpuSegundos: Number(m[2]!.replace(",", ".")) } : null;
}

const n1 = (x: number, c = 1) => (Number.isFinite(x) ? x.toFixed(c).replace(".", ",") : "—");

export function relatorioDaCarga(r: ResultadoDeCarga, extras: { recursos: ReturnType<typeof recursosDoProcesso>; versao: string }): string {
  const o = r.opcoes;
  const linhas = [
    `# Teste de carga — ${o.presetId}`,
    "",
    `**Resultado: ${r.aprovado ? "APROVADO" : "REPROVADO"}** (${r.criterios.filter((c) => c.passou).length} de ${r.criterios.length} critérios)`,
    "",
    "| Execução | |",
    "|---|---|",
    `| Alunos | ${o.alunos} em ${Math.min(o.alunos, o.mercados * o.vagasPorMercado)} equipe(s), ${o.mercados} mercado(s) × ${o.vagasPorMercado} vagas |`,
    `| Cenário | \`${o.presetId}\`, robôs nas vagas vazias: ${o.robos ?? "nenhum"} |`,
    `| Ritmo | ${n1(o.segundosPorTick)} s por dia de jogo; decisões a cada ${n1(o.intervaloDecisaoMs / 1000)} s por aluno (em média) |`,
    `| Duração medida | ${o.duracaoSegundos} s (${r.ticksJogados} dias jogados, ${r.ticksEsperados} esperados) |`,
    `| Servidor | versão ${extras.versao}; ${o.base.includes("127.0.0.1") ? "local (127.0.0.1)" : o.base} |`,
    ...(extras.recursos ? [`| Recursos do servidor (ao fim) | ${n1(extras.recursos.memoriaMb, 0)} MB de memória; ${n1(extras.recursos.cpuSegundos, 1)} s de CPU |`] : []),
    `| Tráfego recebido | ${r.mensagensRecebidas.toLocaleString("pt-BR")} mensagens, ${n1(r.bytesRecebidos / 1_048_576, 1)} MB; mensagem típica ${n1(r.tamanhoDaMensagem.p50 / 1024, 1)} KB, máxima ${n1(r.tamanhoDaMensagem.max / 1024, 1)} KB |`,
    "",
    "## Critérios",
    "",
    "| Critério | Valor | Limite | Situação |",
    "|---|---|---|---|",
    ...r.criterios.map((c) => `| ${c.descricao} | ${c.valor} | ${c.limite} | ${c.passou ? "ok" : "**FALHOU**"} |`),
    "",
  ];
  if (Object.keys(r.recusas).length > 0) {
    linhas.push("## Recusas e comandos sem resposta", "", "| Motivo | Vezes |", "|---|---|", ...Object.entries(r.recusas).sort((a, b) => b[1] - a[1]).map(([m, v]) => `| ${m} | ${v} |`), "");
  }
  linhas.push(
    "Os limites (latência p95 ≤ " + LIMITES.latenciaP95Ms + " ms, nenhuma queda, atraso do relógio ≤ " + n1(100 * LIMITES.atrasoDoRelogio, 0) + "%) estão em `ferramentas/teste-de-carga/src/metricas.ts`. O teste mede o servidor e a rede; o tempo de desenho das telas no navegador não entra.",
    "",
  );
  return linhas.join("\n");
}

async function principal(): Promise<number> {
  const a = lerArgumentos(process.argv.slice(2));
  let local: Awaited<ReturnType<typeof subirServidorLocal>> | null = null;
  try {
    local = a.url ? null : await subirServidorLocal();
    const base = a.url ?? local!.base;
    const chave = a.chave ?? CHAVE_LOCAL;
    const info = (await (await fetch(`${base}/api/servidor`)).json()) as { versao?: string };
    const opcoes: OpcoesDeCarga = {
      base,
      chave,
      alunos: a.alunos,
      mercados: a.mercados,
      vagasPorMercado: a.vagas,
      presetId: a.preset,
      robos: a.robos,
      segundosPorTick: a.velocidade,
      duracaoSegundos: a.duracao,
      intervaloDecisaoMs: a.intervalo,
      semente: 20261003,
    };
    console.log(`teste de carga: ${a.alunos} alunos, ${a.mercados}×${a.vagas} vagas, ${a.preset}, ${a.duracao} s a ${a.velocidade} s/dia em ${base}`);
    const r = await executarCarga(opcoes);
    const recursos = local ? recursosDoProcesso(local.pid) : null;
    const md = relatorioDaCarga(r, { recursos, versao: info.versao ?? "?" });
    const pasta = join(import.meta.dir, "..", "saida");
    mkdirSync(pasta, { recursive: true });
    const carimbo = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    writeFileSync(join(pasta, `carga-${carimbo}.md`), md);
    writeFileSync(join(pasta, `carga-${carimbo}.json`), JSON.stringify({ ...r, recursos }, null, 2));
    console.log(md);
    return a.exigirAprovacao && !r.aprovado ? 1 : 0;
  } finally {
    if (local) await local.derrubar();
  }
}

if (import.meta.main) {
  principal()
    .then((c) => process.exit(c))
    .catch((e) => {
      console.error(e instanceof Error ? e.message : e);
      process.exit(2);
    });
}
