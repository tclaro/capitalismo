/**
 * Liga a sala ao repositório: implementa o `Observador` da sala gravando cada fato no SQLite, e
 * carrega as salas gravadas na inicialização (retomada pausada).
 */
import type { ResultadoTick } from "@simulador/motor";
import type { AcumuladorSemanal, RegistroSemanal } from "../sala/historico";
import type { Agendador } from "../sala/relogio";
import { type DecisaoNaFila, type Observador, type Resposta, Sala } from "../sala/sala";
import type { Repositorio } from "./repositorio";

/** Observador que grava no banco e repassa `aoMudar`/`aoErro` para quem estiver ouvindo (as telas). */
export class ObservadorPersistente implements Observador {
  constructor(
    private readonly repositorio: Repositorio,
    private readonly repassar: Pick<Observador, "aoMudar" | "aoErro"> = {},
  ) {}

  gravarSala(sala: Sala): void {
    this.repositorio.gravarSala(sala);
    if (sala.status !== "rodando") this.repositorio.checkpoint();
  }

  gravarTick(sala: Sala, resultado: ResultadoTick, semana: RegistroSemanal[] | null, acumulador: AcumuladorSemanal): void {
    this.repositorio.gravarTick(sala, resultado, semana, acumulador);
  }

  gravarDecisao(sala: Sala, item: DecisaoNaFila): void {
    this.repositorio.gravarDecisao(sala, item);
  }

  gravarComando(sala: Sala, idComando: string, resposta: Resposta): void {
    this.repositorio.gravarComando(sala, idComando, resposta);
  }

  aoMudar(sala: Sala, motivo: Parameters<NonNullable<Observador["aoMudar"]>>[1], empresa?: string): void {
    this.repassar.aoMudar?.(sala, motivo, empresa);
  }

  aoErro(sala: Sala, erro: unknown): void {
    this.repassar.aoErro?.(sala, erro);
  }
}

/** Carrega todas as salas gravadas; as que estavam rodando voltam pausadas (seção 7.3). */
export function carregarSalas(repositorio: Repositorio, agendador: Agendador, observador: (sala: string) => Observador): Sala[] {
  return repositorio.carregarSalas().map(({ dados, comandos }) => {
    const sala = Sala.retomar(dados, agendador, observador(dados.id));
    sala.lembrarComandos(comandos);
    // Grava o status corrigido (rodando → pausada), para o banco refletir a retomada.
    sala.observador.gravarSala?.(sala);
    return sala;
  });
}
