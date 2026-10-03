/**
 * Pedidos de envio às telas, agrupados por sala: vários pedidos no mesmo instante viram um envio só.
 *
 * Um pedido pode ser **parcial** (só uma equipe e o professor: uma decisão que entrou na fila só aparece
 * para quem decidiu) ou **total** (tick, status, equipes, conexões). Parciais da mesma sala se somam; um
 * pedido total vence qualquer parcial.
 */
export class PedidosDeEnvio {
  private readonly porSala = new Map<string, Set<string> | null>();

  /** Registra o pedido; devolve `true` se é o primeiro da sala (quem pediu deve agendar o envio). */
  pedir(salaId: string, soEquipe?: string): boolean {
    if (!this.porSala.has(salaId)) {
      this.porSala.set(salaId, soEquipe === undefined ? null : new Set([soEquipe]));
      return true;
    }
    const atual = this.porSala.get(salaId);
    if (atual === null) return false;
    if (soEquipe === undefined) this.porSala.set(salaId, null);
    else atual!.add(soEquipe);
    return false;
  }

  /** Entrega e esquece o pedido da sala: o conjunto de equipes, ou `undefined` para enviar a todos. */
  retirar(salaId: string): ReadonlySet<string> | undefined {
    const so = this.porSala.get(salaId);
    this.porSala.delete(salaId);
    return so ?? undefined;
  }
}
