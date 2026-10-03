/**
 * Varredura de calibração da cadeia (fase 1b, entrega 9): simula o confronto da cadeia para cada variante
 * do preset e imprime, lado a lado, os indicadores dos caminhos.
 *
 *   bun ferramentas/balanceamento/src/varredura.ts <arquivo.json> [--sementes 48] [--meses 24] [--prefixo var]
 *
 * O arquivo é `{ "variantes": [{ "nome": "...", "ajustes": { ... } }] }` (ver `ajustes.ts`). As sementes
 * da calibração (`var-*`) não são as do relatório oficial (`balanceamento-*`).
 */
import { readFileSync } from "node:fs";
import type { AjustesDaCadeia } from "./ajustes";
import { type IndicadoresDaCadeia, indicadoresDaCadeia } from "./cadeia";
import { calcularMetricas } from "./metricas";
import { PoolDeTrabalhadores } from "./paralelo";

export interface Variante {
  nome: string;
  ajustes?: AjustesDaCadeia;
}

export const reaisMi = (x: number) => `${(x / 1e6).toFixed(2).replace(".", ",")} mi`;
const razao = (x: number | null) => (x === null ? "—" : x.toFixed(2).replace(".", ","));
const pct = (x: number) => `${(100 * x).toFixed(0)}%`;

export function linhaDaVariante(nome: string, i: IndicadoresDaCadeia): string {
  return [
    nome.padEnd(34),
    `int/eq ${razao(i.razaoIntegrada)}`.padEnd(13),
    `sf/rev ${razao(i.razaoSoFazenda)}`.padEnd(13),
    `coop/eq ${razao(i.razaoCooperativa)}`.padEnd(14),
    `vit int ${pct(i.vitorias.cadeia_integrada ?? 0)} sf ${pct(i.vitorias.cadeia_so_fazenda ?? 0)} coop ${pct(i.vitorias.cadeia_cooperativa ?? 0)}`.padEnd(34),
    `lucro eq ${reaisMi(i.lucro.equilibrada ?? 0)} int ${reaisMi(i.lucro.cadeia_integrada ?? 0)} rev ${reaisMi(i.lucro.revenda ?? 0)} sf ${reaisMi(i.lucro.cadeia_so_fazenda ?? 0)} coop ${reaisMi(i.lucro.cadeia_cooperativa ?? 0)}`,
  ].join(" | ");
}

async function principal() {
  const args = process.argv.slice(2);
  const arquivo = args[0];
  if (!arquivo || arquivo.startsWith("--")) throw new Error("uso: varredura.ts <arquivo.json> [--sementes n] [--meses n] [--prefixo texto]");
  const valor = (nome: string, padrao: string) => {
    const k = args.indexOf(`--${nome}`);
    return k >= 0 ? args[k + 1]! : padrao;
  };
  const sementes = Number(valor("sementes", "48"));
  const meses = Number(valor("meses", "24"));
  const prefixo = valor("prefixo", "var");
  const { variantes } = JSON.parse(readFileSync(arquivo, "utf8")) as { variantes: Variante[] };
  const pool = new PoolDeTrabalhadores(Math.max(1, navigator.hardwareConcurrency ?? 1));
  try {
    for (const v of variantes) {
      const resultados = await pool.executar({ presetId: "cadeia/minima", confronto: "cadeia", prefixo, meses, ...(v.ajustes ? { ajustes: v.ajustes } : {}) }, sementes);
      console.log(linhaDaVariante(v.nome, indicadoresDaCadeia(calcularMetricas(resultados))));
    }
  } finally {
    pool.encerrar();
  }
}

if (import.meta.main) {
  principal()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e instanceof Error ? e.message : e);
      process.exit(2);
    });
}
