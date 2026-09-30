/**
 * Worker do balanceamento: recebe lotes (com um id), simula e devolve os resultados. Fica vivo para
 * atender vários lotes: o pool reaproveita os mesmos workers em toda a execução (criar e encerrar
 * workers a cada lote vazava memória no Bun, ~10 MB por worker).
 */
import { executarLote, type Lote } from "./execucao";

declare const self: Worker;

self.onmessage = (evento: MessageEvent<{ id: number; lote: Lote }>) => {
  const { id, lote } = evento.data;
  try {
    self.postMessage({ id, ok: true, resultados: executarLote(lote) });
  } catch (erro) {
    self.postMessage({ id, ok: false, erro: erro instanceof Error ? `${erro.message}\n${erro.stack}` : String(erro) });
  }
};
