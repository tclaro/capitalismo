/**
 * CLI de balanceamento (seção 10).
 *
 *   bun run balancear [confronto] [opções]
 *   bun run balancear melhor-resposta --estrategia <id> [opções]
 *
 * Opções:
 *   --preset <id>          preset do catálogo (padrão: introdutorio/padrao)
 *   --sementes <n>         partidas simuladas (padrão: 500; melhor resposta: 40 por ponto da grade)
 *   --meses <n>            horizonte de cada partida (padrão: 24)
 *   --confronto <tipo>     todos | subconjuntos | extremo | completo (padrão: completo = os três)
 *   --prefixo <texto>      prefixo das sementes (padrão: balanceamento)
 *   --trabalhadores <n>    workers em paralelo (padrão: núcleos da máquina)
 *   --saida <pasta>        onde gravar (padrão: ferramentas/balanceamento/saida/<preset>)
 *   --exigir-aprovacao     sai com código 1 se algum critério falhar
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PRESETS, VERSAO_CATALOGO } from "@simulador/catalogo";
import { VERSAO_MOTOR } from "@simulador/motor";
import { CONFRONTOS_DE_APROVACAO, TIPOS_CONFRONTO, TODOS_OS_TIPOS_DE_CONFRONTO, type TipoConfronto } from "./confronto";
import { criteriosDaCadeia, economiaDasAtividades, indicadoresDaCadeia, tabelaDeEconomia } from "./cadeia";
import { calcularMetricas } from "./metricas";
import { buscarMelhorResposta, relatorioMelhorResposta } from "./melhorResposta";
import { executarEmParalelo } from "./paralelo";
import { relatorioCsv, relatorioMarkdown } from "./relatorio";

export interface OpcoesCli {
  comando: "confronto" | "melhor-resposta";
  preset: string;
  sementes: number;
  meses: number;
  confrontos: TipoConfronto[];
  prefixo: string;
  trabalhadores: number;
  saida: string;
  estrategia?: string;
  exigirAprovacao: boolean;
}

export function lerArgumentos(argv: readonly string[], nucleos: number): OpcoesCli {
  const args = [...argv];
  const comando = args[0] === "melhor-resposta" ? "melhor-resposta" : "confronto";
  if (args[0] === "melhor-resposta" || args[0] === "confronto") args.shift();
  const valor = (nome: string): string | undefined => {
    const i = args.indexOf(`--${nome}`);
    if (i < 0) return undefined;
    const v = args[i + 1];
    if (v === undefined || v.startsWith("--")) throw new Error(`--${nome} precisa de um valor`);
    return v;
  };
  const inteiro = (nome: string, padrao: number) => {
    const v = valor(nome);
    if (v === undefined) return padrao;
    const n = Number(v);
    if (!Number.isInteger(n) || n < 1) throw new Error(`--${nome} deve ser um inteiro ≥ 1 (recebido "${v}")`);
    return n;
  };
  const preset = valor("preset") ?? "introdutorio/padrao";
  if (!PRESETS[preset]) throw new Error(`preset desconhecido: "${preset}" (disponíveis: ${Object.keys(PRESETS).join(", ")})`);
  const tipo = valor("confronto") ?? "completo";
  // O "completo" são os confrontos da camada 1, mais o da cadeia nos presets que trazem o bloco da cadeia.
  const confrontos = tipo === "completo" ? [...TIPOS_CONFRONTO, ...(PRESETS[preset]!.cadeia ? (["cadeia"] as const) : [])] : [tipo as TipoConfronto];
  if (!confrontos.every((c) => TODOS_OS_TIPOS_DE_CONFRONTO.includes(c))) throw new Error(`confronto desconhecido: "${tipo}" (use ${[...TODOS_OS_TIPOS_DE_CONFRONTO, "completo"].join(", ")})`);
  if (confrontos.includes("cadeia") && !PRESETS[preset]!.cadeia) throw new Error(`o confronto "cadeia" exige um preset com o bloco da cadeia (${preset} não tem)`);
  const estrategia = valor("estrategia");
  if (comando === "melhor-resposta" && !estrategia) throw new Error("melhor-resposta precisa de --estrategia <id>");
  return {
    comando,
    preset,
    sementes: inteiro("sementes", comando === "melhor-resposta" ? 40 : 500),
    meses: inteiro("meses", 24),
    confrontos,
    prefixo: valor("prefixo") ?? "balanceamento",
    trabalhadores: inteiro("trabalhadores", Math.max(1, nucleos)),
    saida: valor("saida") ?? join(import.meta.dir, "..", "saida", preset.replaceAll("/", "-")),
    ...(estrategia ? { estrategia } : {}),
    exigirAprovacao: args.includes("--exigir-aprovacao"),
  };
}

async function principal(): Promise<number> {
  const o = lerArgumentos(process.argv.slice(2), navigator.hardwareConcurrency ?? 1);
  mkdirSync(o.saida, { recursive: true });
  const preset = PRESETS[o.preset]!;

  if (o.comando === "melhor-resposta") {
    console.log(`melhor resposta: ${o.estrategia} em ${o.preset}, ${o.sementes} partidas por ponto, ${o.meses} meses`);
    const r = await buscarMelhorResposta({
      presetId: o.preset,
      estrategia: o.estrategia!,
      partidas: o.sementes,
      meses: o.meses,
      prefixo: o.prefixo,
      trabalhadores: o.trabalhadores,
      aoProgredir: (feitos, total) => process.stdout.write(`\r  ${feitos}/${total} pontos da grade`),
    });
    process.stdout.write("\n");
    const arquivo = join(o.saida, `melhor-resposta-${o.estrategia}.md`);
    writeFileSync(arquivo, relatorioMelhorResposta(r, { presetId: o.preset, partidas: o.sementes, meses: o.meses }));
    console.log(`${r.alerta ? "ALERTA" : "ok"}: melhor ${JSON.stringify(r.melhor.intensidade)} vence ${(100 * r.melhor.taxaVitoria).toFixed(1)}% → ${arquivo}`);
    return o.exigirAprovacao && r.alerta ? 1 : 0;
  }

  let aprovado = true;
  for (const confronto of o.confrontos) {
    const inicio = performance.now();
    const resultados = await executarEmParalelo({ presetId: o.preset, confronto, prefixo: o.prefixo, meses: o.meses }, o.sementes, o.trabalhadores);
    const duracaoSegundos = (performance.now() - inicio) / 1000;
    const metricas = calcularMetricas(resultados, confronto === "extremo" ? { estrategiaExtrema: "preco_minimo" } : {});
    if (confronto === "cadeia") {
      // No confronto da cadeia a aprovação é relativa (cada caminho contra a estratégia sem fazendas);
      // os critérios gerais da seção 10.4 aparecem como diagnóstico (o premium da camada 1 domina).
      for (const c of metricas.criterios) c.diagnostico = true;
      metricas.criterios.unshift(...criteriosDaCadeia(indicadoresDaCadeia(metricas)));
      metricas.aprovado = metricas.criterios.every((c) => c.passou || c.diagnostico === true);
    }
    const info = {
      presetId: o.preset,
      presetVersao: preset.versao,
      versaoMotor: VERSAO_MOTOR,
      versaoCatalogo: VERSAO_CATALOGO,
      confronto,
      partidas: o.sementes,
      meses: o.meses,
      prefixo: o.prefixo,
      trabalhadores: o.trabalhadores,
      duracaoSegundos,
      ticksSimulados: resultados.reduce((s, r) => s + r.ticks, 0),
      diagnostico: !CONFRONTOS_DE_APROVACAO.includes(confronto),
    };
    const base = join(o.saida, confronto);
    writeFileSync(`${base}.md`, relatorioMarkdown(info, metricas, confronto === "cadeia" ? { economiaDasAtividades: tabelaDeEconomia(economiaDasAtividades(preset)) } : {}));
    writeFileSync(`${base}.csv`, relatorioCsv(resultados));
    if (!info.diagnostico) aprovado &&= metricas.aprovado;
    const situacao = info.diagnostico ? "diagnóstico" : metricas.aprovado ? "APROVADO " : "REPROVADO";
    const deAprovacao = metricas.criterios.filter((c) => !c.diagnostico);
    console.log(`${confronto.padEnd(12)} ${situacao} ${deAprovacao.filter((c) => c.passou).length}/${deAprovacao.length} critérios, ${o.sementes} partidas em ${duracaoSegundos.toFixed(1)} s → ${base}.md`);
    for (const c of metricas.criterios.filter((x) => !x.passou)) console.log(`   ${c.diagnostico || info.diagnostico ? "fora (diagnóstico)" : "falhou"}: ${c.descricao}: ${c.valor} (limite ${c.limite})`);
  }
  return o.exigirAprovacao && !aprovado ? 1 : 0;
}

if (import.meta.main) {
  principal()
    .then((codigo) => process.exit(codigo))
    .catch((erro) => {
      console.error(erro instanceof Error ? erro.message : erro);
      process.exit(2);
    });
}
