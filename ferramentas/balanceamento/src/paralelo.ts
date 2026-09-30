/**
 * Execução paralela com um pool fixo de workers.
 *
 * Os workers são criados uma vez e reaproveitados em todos os lotes da execução (uma busca de melhor
 * resposta faz centenas de rodadas). Criar e encerrar workers a cada rodada vazava memória no Bun:
 * ~40 MB por rodada de 4 workers, até esgotar a memória da máquina.
 *
 * Os resultados voltam na ordem das sementes: não dependem do número de workers.
 */
import type { ResultadoSimulacao } from "@simulador/motor";
import { executarLote, type Lote } from "./execucao";

type Resposta = { id: number; ok: true; resultados: ResultadoSimulacao[] } | { id: number; ok: false; erro: string };

export class PoolDeTrabalhadores {
  private readonly workers: Worker[];
  private readonly pendentes = new Map<number, { resolver: (r: ResultadoSimulacao[]) => void; rejeitar: (e: Error) => void }>();
  private proximoId = 0;

  constructor(readonly tamanho: number) {
    this.workers = Array.from({ length: tamanho }, () => {
      const w = new Worker(new URL("./trabalhador.ts", import.meta.url).href);
      w.onmessage = (e: MessageEvent<Resposta>) => {
        const p = this.pendentes.get(e.data.id);
        if (!p) return;
        this.pendentes.delete(e.data.id);
        if (e.data.ok) p.resolver(e.data.resultados);
        else p.rejeitar(new Error(e.data.erro));
      };
      w.onerror = (e) => {
        for (const p of this.pendentes.values()) p.rejeitar(new Error(e.message));
        this.pendentes.clear();
      };
      return w;
    });
  }

  private enviar(w: Worker, lote: Lote): Promise<ResultadoSimulacao[]> {
    const id = this.proximoId++;
    return new Promise((resolver, rejeitar) => {
      this.pendentes.set(id, { resolver, rejeitar });
      w.postMessage({ id, lote });
    });
  }

  /** Simula `partidas` partidas, divididas entre os workers; resultado na ordem das sementes. */
  async executar(base: Omit<Lote, "indices">, partidas: number): Promise<ResultadoSimulacao[]> {
    const indices = Array.from({ length: partidas }, (_, i) => i);
    const n = Math.min(this.tamanho, partidas);
    const lotes: number[][] = Array.from({ length: n }, () => []);
    indices.forEach((i) => lotes[i % n]!.push(i));
    const porIndice = new Map<number, ResultadoSimulacao>();
    await Promise.all(
      lotes.map(async (idx, k) => {
        const resultados = await this.enviar(this.workers[k]!, { ...base, indices: idx });
        resultados.forEach((r, j) => porIndice.set(idx[j]!, r));
      }),
    );
    return indices.map((i) => porIndice.get(i)!);
  }

  encerrar(): void {
    for (const w of this.workers) w.terminate();
    for (const p of this.pendentes.values()) p.rejeitar(new Error("pool encerrado"));
    this.pendentes.clear();
  }
}

/**
 * Execução avulsa: com 1 worker (ou 1 partida), roda no próprio processo; senão usa um pool
 * temporário. Para muitas execuções seguidas, crie um `PoolDeTrabalhadores` e reaproveite.
 */
export async function executarEmParalelo(base: Omit<Lote, "indices">, partidas: number, trabalhadores: number): Promise<ResultadoSimulacao[]> {
  if (trabalhadores <= 1 || partidas <= 1) return executarLote({ ...base, indices: Array.from({ length: partidas }, (_, i) => i) });
  const pool = new PoolDeTrabalhadores(Math.min(trabalhadores, partidas));
  try {
    return await pool.executar(base, partidas);
  } finally {
    pool.encerrar();
  }
}
