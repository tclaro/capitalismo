/**
 * Gerente das salas em memória (modo B, várias salas simultâneas): cria, localiza pelo código,
 * retoma as gravadas na inicialização e exclui. Não conhece HTTP; quem envia às telas se registra em
 * `ouvinte`.
 */
import type { Database } from "bun:sqlite";
import type { ConfigSala } from "@simulador/compartilhado";
import { Acessos, LimiteDeTentativas, tokenAleatorio } from "./dados/acessos";
import { carregarSalas, ObservadorPersistente } from "./dados/persistencia";
import { Repositorio } from "./dados/repositorio";
import { type Log, logDoConsole } from "./log";
import { type Agendador, agendadorReal } from "./sala/relogio";
import { type Observador, Sala } from "./sala/sala";

/** Sem caracteres ambíguos (0/O, 1/I/L): o código é lido no projetor e digitado pelos alunos. */
export const ALFABETO_CODIGO = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const TAMANHO_CODIGO = 5;

export function codigoAleatorio(): string {
  const n = ALFABETO_CODIGO.length;
  // Rejeição: só aceita bytes abaixo do maior múltiplo de n.
  const limite = 256 - (256 % n);
  let codigo = "";
  while (codigo.length < TAMANHO_CODIGO) {
    for (const b of crypto.getRandomValues(new Uint8Array(8))) {
      if (b < limite && codigo.length < TAMANHO_CODIGO) codigo += ALFABETO_CODIGO[b % n];
    }
  }
  return codigo;
}

export type Ouvinte = (sala: Sala, motivo: Parameters<NonNullable<Observador["aoMudar"]>>[1]) => void;

export interface OpcoesGerente {
  db: Database;
  agendador?: Agendador;
  agora?: () => number;
  log?: Log;
}

export class Gerente {
  readonly repositorio: Repositorio;
  readonly acessos: Acessos;
  readonly limites: LimiteDeTentativas;
  readonly log: Log;
  private readonly agendador: Agendador;
  private readonly salas = new Map<string, Sala>();
  private readonly porCodigo = new Map<string, string>();
  /** Recebe as mudanças de todas as salas (o servidor usa para enviar às telas). */
  ouvinte: Ouvinte | null = null;
  /** Chamado quando uma sala é excluída (o servidor fecha as conexões dela). */
  aoExcluir: ((sala: Sala) => void) | null = null;

  constructor(opcoes: OpcoesGerente) {
    this.repositorio = new Repositorio(opcoes.db);
    this.acessos = new Acessos(opcoes.db, opcoes.agora);
    this.limites = new LimiteDeTentativas(opcoes.db, opcoes.agora);
    this.agendador = opcoes.agendador ?? agendadorReal;
    this.log = opcoes.log ?? logDoConsole;
  }

  /** Retoma as salas gravadas (as que rodavam voltam pausadas) e limpa sessões vencidas. */
  carregar(): Sala[] {
    const salas = carregarSalas(this.repositorio, this.agendador, () => this.observador());
    for (const s of salas) this.registrar(s);
    const vencidas = this.acessos.limparSessoesVencidas();
    if (salas.length > 0) this.log("info", `${salas.length} sala(s) retomada(s); ${vencidas} sessão(ões) vencida(s) removida(s)`);
    return salas;
  }

  private observador(): Observador {
    return new ObservadorPersistente(this.repositorio, {
      aoMudar: (sala, motivo) => this.ouvinte?.(sala, motivo),
      aoErro: (sala, erro) => this.log("erro", `sala ${sala.codigo}: falha no tick ${sala.estado.tick + 1}; partida pausada`, erro),
    });
  }

  private registrar(sala: Sala): void {
    this.salas.set(sala.id, sala);
    this.porCodigo.set(sala.codigo, sala.id);
  }

  /** Cria uma sala; devolve o PIN em claro (só existe neste momento) e o token do telão. */
  async criarSala(config: ConfigSala): Promise<{ sala: Sala; pin: string; tokenTelao: string }> {
    let codigo = codigoAleatorio();
    while (this.porCodigo.has(codigo) || this.codigoGravado(codigo)) codigo = codigoAleatorio();
    const sala = Sala.criar({ id: `sala_${tokenAleatorio(9)}`, codigo, semente: tokenAleatorio(12), config }, this.agendador, this.observador());
    const { pin, tokenTelao } = await this.acessos.criarAcessos(sala.id);
    this.registrar(sala);
    this.log("info", `sala ${codigo} criada (${config.presetId}, ${config.mercados}×${config.vagasPorMercado} vagas)`);
    return { sala, pin, tokenTelao };
  }

  private codigoGravado(codigo: string): boolean {
    return this.repositorio.db.query("SELECT 1 FROM salas WHERE codigo = ?").get(codigo) !== null;
  }

  sala(id: string): Sala | undefined {
    return this.salas.get(id);
  }

  salaPorCodigo(codigo: string): Sala | undefined {
    const id = this.porCodigo.get(codigo.toUpperCase());
    return id ? this.salas.get(id) : undefined;
  }

  todas(): Sala[] {
    return [...this.salas.values()];
  }

  /** Exclui a sala e tudo o que foi gravado dela (sessões e acessos saem em cascata). */
  excluirSala(id: string): boolean {
    const sala = this.salas.get(id);
    if (!sala) return false;
    sala.pararRelogio();
    this.aoExcluir?.(sala);
    this.salas.delete(id);
    this.porCodigo.delete(sala.codigo);
    this.repositorio.excluirSala(id);
    this.log("info", `sala ${sala.codigo} excluída`);
    return true;
  }

  /** Desligamento: para os relógios (as salas continuam "rodando" no banco e voltam pausadas). */
  desligar(): void {
    for (const s of this.salas.values()) s.pararRelogio();
    this.repositorio.checkpoint();
  }
}
