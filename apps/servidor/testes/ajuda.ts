/**
 * Utilitários dos testes do servidor: agendador de tempo falso e fábrica de salas.
 */
import { type ConfigSalaEntrada, ConfigSala, validar } from "@simulador/compartilhado";
import type { Agendador } from "../src/sala/relogio";
import { type Observador, Sala } from "../src/sala/sala";

/** Agendador com tempo controlado pelo teste: `avancar(ms)` dispara os timers vencidos, em ordem. */
export class AgendadorFalso implements Agendador {
  private t = 0;
  private proximoId = 0;
  private timers: { id: number; quando: number; fn: () => void }[] = [];

  agora(): number {
    return this.t;
  }

  agendar(ms: number, fn: () => void): () => void {
    const id = this.proximoId++;
    this.timers.push({ id, quando: this.t + ms, fn });
    return () => {
      this.timers = this.timers.filter((x) => x.id !== id);
    };
  }

  /** Avança o tempo, disparando cada timer vencido no seu instante. */
  avancar(ms: number): void {
    const fim = this.t + ms;
    for (;;) {
      this.timers.sort((a, b) => a.quando - b.quando || a.id - b.id);
      const proximo = this.timers[0];
      if (!proximo || proximo.quando > fim) break;
      this.timers.shift();
      // Tempo monotônico: um timer atrasado (processo travado) dispara "agora", não no passado.
      this.t = Math.max(this.t, proximo.quando);
      proximo.fn();
    }
    this.t = fim;
  }

  /** Pula o tempo sem disparar nada (simula o processo travado) e depois dispara o que venceu. */
  travarPor(ms: number): void {
    this.t += ms;
    this.avancar(0);
  }

  get pendentes(): number {
    return this.timers.length;
  }
}

export function configSala(extra: Partial<ConfigSalaEntrada> = {}): ConfigSala {
  const r = validar(ConfigSala, { presetId: "teste/congelado", vagasPorMercado: 3, segundosPorTick: 1, ...extra });
  if (!r.ok) throw new Error(r.erro);
  return r.valor;
}

let contador = 0;

export function novaSala(extra: Partial<ConfigSalaEntrada> = {}, observador: Observador = {}): { sala: Sala; relogio: AgendadorFalso } {
  const relogio = new AgendadorFalso();
  contador++;
  const sala = Sala.criar({ id: `sala_${contador}`, codigo: `TST${String(contador).padStart(2, "0")}`.slice(0, 5), semente: "semente-teste", config: configSala(extra) }, relogio, observador);
  return { sala, relogio };
}

/** Cria uma equipe na vaga e devolve o id do membro fundador. */
export function criarEquipe(sala: Sala, empresa: string, nomeEquipe: string, cor: string, aluno: string): string {
  const r = sala.entrarAluno(aluno, { tipo: "nova", empresa, nome: nomeEquipe, cor });
  if (!r.ok) throw new Error(r.motivo);
  return r.membro.id;
}

let comando = 0;
/** Id de comando único para os testes. */
export const cmd = () => `cmd-${String(++comando).padStart(6, "0")}`;
