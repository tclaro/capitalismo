/**
 * Mensagens do servidor para as telas e as projeções de cada papel (seção 9.6):
 * - aluno: a própria empresa + informação pública do mercado (derivada de `visaoDaEmpresa` do motor);
 * - telão: só informação pública;
 * - professor: tudo.
 *
 * O servidor é a fonte confiável dessas mensagens, então aqui ficam só os tipos (sem esquemas).
 */
import type { Aviso, Centavos, FechamentoMensal, PosicaoRanking, VisaoEmpresa } from "@simulador/motor";
/** Tipos do motor que aparecem nas visões, reexportados para as telas não dependerem do motor. */
export type { Aviso, Centavos, FechamentoMensal, PosicaoRanking, VisaoEmpresa } from "@simulador/motor";
import type { CRITERIOS_PONTUACAO, DecisaoDoAluno, MODOS_RELOGIO, VISIBILIDADES_RANKING } from "./protocolo";

export type StatusSala = "preparacao" | "rodando" | "pausada" | "encerrada";
export type MotivoPausa = "manual" | "fim_do_mes" | "duracao_atingida" | "erro";
export type Papel = "aluno" | "professor" | "telao";

export interface EstadoRelogio {
  status: StatusSala;
  motivoPausa: MotivoPausa | null;
  tick: number;
  mes: number;
  dia: number;
  ticksPorMes: number;
  duracaoMeses: number;
  segundosPorTick: number;
  modo: (typeof MODOS_RELOGIO)[number];
  /** Tempo até o próximo tick, em ms, relativo ao envio (nunca horário absoluto); `null` se parado. */
  proximoTickEmMs: number | null;
  /** Alunos podem enviar decisões agora? */
  podeEditar: boolean;
}

export interface InfoSala {
  codigo: string;
  presetId: string;
  presetNome: string;
  mercados: { id: string; nome: string }[];
  /** Produtos vendidos no varejo (nomes e unidades para as telas). */
  produtos: { id: string; nome: string; unidade: string }[];
  criterio: (typeof CRITERIOS_PONTUACAO)[number];
  duracaoMeses: number;
  rankingVisivel: (typeof VISIBILIDADES_RANKING)[number];
  edicaoNaPausa: boolean;
  avancoQuandoProntas: boolean;
}

/** Vaga de equipe vista por todos (sem nomes de alunos). */
export interface VagaPublica {
  empresa: string;
  mercado: string;
  equipe: { nome: string; cor: string } | null;
  robo: boolean;
  /** Vaga que ficou vazia ao iniciar e não recebeu robô: a empresa não opera. */
  inativa: boolean;
  membros: number;
}

export interface VisaoAluno {
  sala: InfoSala;
  relogio: EstadoRelogio;
  empresa: string;
  equipe: { nome: string; cor: string };
  membros: string[];
  visao: VisaoEmpresa;
  /** Decisões enviadas pela equipe que ainda vão valer no próximo tick. */
  pendentes: DecisaoDoAluno[];
  pronto: boolean;
  /** Ranking do mercado da equipe; `null` se oculto. Com visibilidade "propria", só a linha da equipe. */
  ranking: PosicaoRanking[] | null;
  vagas: VagaPublica[];
  avisos: Aviso[];
  fechamentos: FechamentoMensal[];
}

export interface OfertaNoTelao {
  empresa: string;
  participacao: number;
  preco: Centavos | null;
  nota: number;
}

export interface VisaoTelao {
  sala: InfoSala;
  relogio: EstadoRelogio;
  vagas: VagaPublica[];
  ranking: { mercado: string; posicoes: PosicaoRanking[] }[];
  participacao: { mercado: string; produto: string; nomeProduto: string; ofertas: OfertaNoTelao[] }[];
}

export interface EmpresaNoPainel {
  empresa: string;
  mercado: string;
  nome: string;
  cor: string | null;
  robo: boolean;
  inativa: boolean;
  caixa: Centavos;
  creditoEmergencial: Centavos;
  lucroAcumulado: Centavos;
  receitaAcumulada: Centavos;
  lucroUltimoMes: Centavos | null;
  pontosDeVenda: number;
  fabricas: number;
  membros: { id: string; nome: string; conectado: boolean }[];
  pronto: boolean;
  pendentes: number;
  ofertas: { produto: string; preco: Centavos | null; participacao: number; nota: number; estoque: number; qualidade: number; marca: number }[];
}

export interface VisaoProfessor {
  sala: InfoSala;
  relogio: EstadoRelogio;
  pin: string | null;
  linkTelao: string;
  /** Estratégia dos robôs que ocupam as vagas vazias ao iniciar; `null` = ficam inativas. */
  robosNasVagasVazias: string | null;
  vagas: VagaPublica[];
  empresas: EmpresaNoPainel[];
  ranking: { mercado: string; posicoes: PosicaoRanking[] }[];
  avisos: Aviso[];
}

export type Visao = VisaoAluno | VisaoTelao | VisaoProfessor;

export type MensagemServidor =
  | { tipo: "snapshot"; papel: Papel; visao: Visao }
  | { tipo: "atualizacao"; papel: Papel; visao: Visao }
  | { tipo: "resposta"; idComando: string; ok: boolean; motivo?: string }
  | { tipo: "erro"; motivo: string }
  | { tipo: "pong" };
