/**
 * Relógio da sala (seção 7.3): dispara um tick a cada intervalo, com alvo absoluto
 * (`base + n × intervalo`) para não acumular atraso.
 *
 * Se o processo atrasar mais de um intervalo inteiro (máquina travou, laptop dormiu), o relógio
 * **não** recupera os ticks perdidos em rajada: ele reancora a base no instante atual e segue.
 *
 * O agendador é injetável, para que os testes controlem o tempo sem esperar.
 */

export interface Agendador {
  /** Instante atual em ms (monotônico). */
  agora(): number;
  /** Agenda `fn` para daqui a `ms`; devolve a função que cancela. */
  agendar(ms: number, fn: () => void): () => void;
}

export const agendadorReal: Agendador = {
  agora: () => performance.now(),
  agendar: (ms, fn) => {
    const h = setTimeout(fn, ms);
    return () => clearTimeout(h);
  },
};

export class Relogio {
  private ativo = false;
  private intervaloMs = 0;
  private base = 0;
  private n = 0;
  private alvo = 0;
  private cancelar: (() => void) | null = null;

  constructor(
    private readonly agendador: Agendador,
    private readonly aoTick: () => void,
  ) {}

  get rodando(): boolean {
    return this.ativo;
  }

  /** Começa (ou recomeça) a contar a partir de agora. O primeiro tick sai depois de um intervalo. */
  iniciar(intervaloMs: number): void {
    if (!(intervaloMs > 0)) throw new RangeError(`intervalo inválido: ${intervaloMs}`);
    this.parar();
    this.ativo = true;
    this.intervaloMs = intervaloMs;
    this.base = this.agendador.agora();
    this.n = 0;
    this.agendarProximo();
  }

  parar(): void {
    this.ativo = false;
    this.cancelar?.();
    this.cancelar = null;
  }

  /** Muda a velocidade; se estiver rodando, recomeça a contagem a partir de agora. */
  alterarIntervalo(intervaloMs: number): void {
    if (this.ativo) this.iniciar(intervaloMs);
    else this.intervaloMs = intervaloMs;
  }

  /** Tempo até o próximo tick, em ms; `null` se parado. */
  proximoTickEmMs(): number | null {
    if (!this.ativo) return null;
    return Math.max(0, Math.round(this.alvo - this.agendador.agora()));
  }

  private agendarProximo(): void {
    this.n += 1;
    this.alvo = this.base + this.n * this.intervaloMs;
    const espera = Math.max(0, this.alvo - this.agendador.agora());
    this.cancelar = this.agendador.agendar(espera, () => {
      this.cancelar = null;
      if (!this.ativo) return;
      const agora = this.agendador.agora();
      if (agora - this.alvo > this.intervaloMs) {
        // Atraso maior que um intervalo: não recupera ticks perdidos; reancora.
        this.base = agora;
        this.n = 0;
      }
      this.aoTick();
      // O tick pode ter parado o relógio (pausa automática); só agenda o próximo se continuar ativo.
      if (this.ativo && this.cancelar === null) this.agendarProximo();
    });
  }
}
