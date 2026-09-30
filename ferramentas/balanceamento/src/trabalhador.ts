/**
 * Worker do balanceamento: recebe um lote, simula e devolve os resultados.
 */
import { executarLote, type Lote } from "./execucao";

declare const self: Worker;

self.onmessage = (evento: MessageEvent<Lote>) => {
  try {
    self.postMessage({ ok: true, resultados: executarLote(evento.data) });
  } catch (erro) {
    self.postMessage({ ok: false, erro: erro instanceof Error ? `${erro.message}\n${erro.stack}` : String(erro) });
  }
};
