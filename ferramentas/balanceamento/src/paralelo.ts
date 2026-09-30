/**
 * Distribui as partidas entre workers e junta os resultados na ordem das sementes (o resultado não
 * depende do número de workers).
 */
import type { ResultadoSimulacao } from "@simulador/motor";
import { executarLote, type Lote } from "./execucao";

export async function executarEmParalelo(base: Omit<Lote, "indices">, partidas: number, trabalhadores: number): Promise<ResultadoSimulacao[]> {
  const indices = Array.from({ length: partidas }, (_, i) => i);
  if (trabalhadores <= 1 || partidas <= 1) return executarLote({ ...base, indices });

  const n = Math.min(trabalhadores, partidas);
  const lotes: number[][] = Array.from({ length: n }, () => []);
  indices.forEach((i) => lotes[i % n]!.push(i));

  const porIndice = new Map<number, ResultadoSimulacao>();
  await Promise.all(
    lotes.map(
      (idx) =>
        new Promise<void>((resolver, rejeitar) => {
          const w = new Worker(new URL("./trabalhador.ts", import.meta.url).href);
          w.onmessage = (e: MessageEvent<{ ok: true; resultados: ResultadoSimulacao[] } | { ok: false; erro: string }>) => {
            w.terminate();
            if (!e.data.ok) return rejeitar(new Error(e.data.erro));
            e.data.resultados.forEach((r, k) => porIndice.set(idx[k]!, r));
            resolver();
          };
          w.onerror = (e) => {
            w.terminate();
            rejeitar(new Error(e.message));
          };
          w.postMessage({ ...base, indices: idx } satisfies Lote);
        }),
    ),
  );
  return indices.map((i) => porIndice.get(i)!);
}
