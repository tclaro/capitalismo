/**
 * Corpos das respostas HTTP do servidor (seção 9.8). Como as visões, só tipos: o servidor é a fonte
 * confiável e usa `satisfies` para garantir o formato.
 */
import type { PALETA_EQUIPES } from "./equipes";
import type { EstadoRelogio, InfoSala, StatusSala, VagaPublica } from "./visoes";

/** Toda resposta de erro traz `ok: false` e um motivo em português para mostrar ao usuário. */
export interface RespostaErro {
  ok: false;
  motivo: string;
  /** Presente no 429: segundos até poder tentar de novo. */
  esperaS?: number;
}

export interface InfoServidor {
  versao: string;
  protocolo: number;
  porta: number;
  /** Endereços para os alunos digitarem (ex.: `http://10.1.2.30:47800`). */
  enderecos: string[];
  chaveDefinida: boolean;
  estrategiasDeRobo: readonly string[];
  /** Presets jogáveis (os de teste ficam de fora). */
  presets: { id: string; nome: string }[];
}

export interface SalaCriada {
  ok: true;
  codigo: string;
  /** PIN do professor: só aparece aqui e ao gerar outro. */
  pin: string;
  /** Caminho relativo do telão, com o token (`/telao/<código>?t=...`). */
  linkTelao: string;
  enderecos: string[];
}

/** Informação pública da sala, para a tela de entrada. */
export interface InfoPublicaSala {
  sala: InfoSala;
  relogio: EstadoRelogio;
  vagas: VagaPublica[];
  cores: typeof PALETA_EQUIPES;
}

export interface SessaoNaSala {
  professor: boolean;
  aluno: { membro: string; nome: string; empresa: string } | null;
}

export interface AlunoEntrou {
  ok: true;
  codigo: string;
  membro: string;
  nome: string;
  empresa: string;
}

export interface SalaNoAdmin {
  id: string;
  codigo: string;
  status: StatusSala;
  tick: number;
  presetId: string;
  membros: number;
  conexoes: number;
}

export interface ListaDoAdmin {
  ok: true;
  chaveDefinida: boolean;
  salas: SalaNoAdmin[];
}

/** Um teste de conexão recebido (página /teste), como o professor vê no diagnóstico. */
export interface RegistroDeTeste {
  quando: string;
  ip: string;
  navegador: string;
  maquina: string;
  http: { ok: boolean; amostras: number; mediaMs: number | null; maxMs: number | null };
  ws: { ok: boolean; ms: number | null; erro?: string | undefined };
}

export interface Diagnostico {
  ok: true;
  versao: string;
  porta: number;
  enderecos: string[];
  /** Mais recentes primeiro. */
  testes: RegistroDeTeste[];
}
