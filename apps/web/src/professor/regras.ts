/**
 * Regras da tela do professor sem React (testadas à parte): que ações do relógio cabem em cada
 * estado, como descrever o estado, e o formulário de criação da sala.
 *
 * As ações espelham `Sala.comandoRelogio` no servidor, que continua sendo quem decide: a tela só
 * evita oferecer botões que seriam recusados.
 */
import {
  ConfigSala,
  type ConfigSalaEntrada,
  type EstadoRelogio,
  SEGUNDOS_POR_TICK_MAX,
  SEGUNDOS_POR_TICK_MIN,
  validar,
} from "@simulador/compartilhado";

export interface AcoesDoRelogio {
  iniciar: boolean;
  pausar: boolean;
  retomar: boolean;
  avancar: boolean;
  estender: boolean;
  encerrar: boolean;
}

export function acoesDoRelogio(r: Pick<EstadoRelogio, "status" | "motivoPausa">): AcoesDoRelogio {
  const nada: AcoesDoRelogio = { iniciar: false, pausar: false, retomar: false, avancar: false, estender: false, encerrar: false };
  switch (r.status) {
    case "preparacao":
      return { ...nada, iniciar: true, estender: true, encerrar: true };
    case "rodando":
      return { ...nada, pausar: true, estender: true, encerrar: true };
    case "pausada":
      if (r.motivoPausa === "duracao_atingida") return { ...nada, estender: true, encerrar: true };
      return { ...nada, retomar: true, avancar: true, estender: true, encerrar: true };
    case "encerrada":
      return nada;
  }
}

export function textoDoStatus(r: Pick<EstadoRelogio, "status" | "motivoPausa" | "modo">): string {
  switch (r.status) {
    case "preparacao":
      return "Em preparação: os alunos estão formando as equipes";
    case "rodando":
      return r.modo === "rodada" ? "Rodando (pausa sozinha no fim do mês)" : "Rodando";
    case "encerrada":
      return "Partida encerrada: resultados congelados";
    case "pausada":
      switch (r.motivoPausa) {
        case "fim_do_mes":
          return "Pausada no fim do mês: os alunos podem decidir";
        case "duracao_atingida":
          return "Duração atingida: estenda a partida ou encerre";
        case "erro":
          return "Pausada por uma falha no processamento (veja o console do servidor); tente retomar";
        default:
          return "Pausada pelo professor";
      }
  }
}

/** Motivo de recusa de um comando, na linguagem do professor. */
export function explicarRecusa(motivo: string | undefined): string {
  if (motivo === "desatualizado") return "A tela estava desatualizada (outra aba agiu antes). Confira e tente de novo.";
  return motivo ?? "O servidor recusou o comando.";
}

// ---------------------------------------------------------------------------------------------
// Formulário de criação
// ---------------------------------------------------------------------------------------------

export const VELOCIDADES = [0.5, 1, 2, 3, 5, 10] as const;

export interface FormularioSala {
  presetId: string;
  mercados: number;
  vagasPorMercado: number;
  /** "" = vagas vazias ficam inativas. */
  robos: string;
  duracaoMeses: number;
  segundosPorTick: number;
  modo: "continuo" | "rodada";
  edicaoNaPausa: boolean;
  rankingVisivel: "completo" | "propria" | "oculto";
  avancoQuandoProntas: boolean;
  criterio: "lucro_acumulado" | "participacao_receita";
}

export function formularioPadrao(presetId: string, estrategias: readonly string[]): FormularioSala {
  return {
    presetId,
    mercados: 1,
    vagasPorMercado: 6,
    robos: estrategias.includes("equilibrada") ? "equilibrada" : (estrategias[0] ?? ""),
    duracaoMeses: 24,
    segundosPorTick: 3,
    modo: "continuo",
    edicaoNaPausa: false,
    rankingVisivel: "completo",
    avancoQuandoProntas: false,
    criterio: "lucro_acumulado",
  };
}

/** Configuração enviada ao servidor, validada com o mesmo esquema que ele usa. */
export function configDoFormulario(f: FormularioSala): { ok: true; config: ConfigSalaEntrada } | { ok: false; erro: string } {
  if (!Number.isFinite(f.segundosPorTick) || f.segundosPorTick < SEGUNDOS_POR_TICK_MIN || f.segundosPorTick > SEGUNDOS_POR_TICK_MAX) {
    return { ok: false, erro: `a velocidade vai de ${SEGUNDOS_POR_TICK_MIN} a ${SEGUNDOS_POR_TICK_MAX} segundos por dia` };
  }
  const config: ConfigSalaEntrada = {
    presetId: f.presetId,
    mercados: f.mercados,
    vagasPorMercado: f.vagasPorMercado,
    robosNasVagasVazias: f.robos === "" ? null : f.robos,
    duracaoMeses: f.duracaoMeses,
    segundosPorTick: f.segundosPorTick,
    modo: f.modo,
    edicaoNaPausa: f.edicaoNaPausa,
    rankingVisivel: f.rankingVisivel,
    // Só faz sentido no modo rodada (a pausa de fim de mês).
    avancoQuandoProntas: f.modo === "rodada" && f.avancoQuandoProntas,
    criterio: f.criterio,
  };
  const r = validar(ConfigSala, config);
  if (!r.ok) return { ok: false, erro: `configuração inválida (${r.erro})` };
  return { ok: true, config };
}

/** Tempo real de um mês de jogo, para o professor planejar a aula: "1 min 30 s por mês". */
export function duracaoDoMes(segundosPorTick: number, ticksPorMes = 30): string {
  const total = Math.round(segundosPorTick * ticksPorMes);
  const min = Math.floor(total / 60);
  const s = total % 60;
  return `${min > 0 ? `${min} min` : ""}${min > 0 && s > 0 ? " " : ""}${s > 0 || min === 0 ? `${s} s` : ""} por mês`;
}

// ---------------------------------------------------------------------------------------------
// PIN guardado na aba (sessionStorage): mostrado enquanto a aba estiver aberta
// ---------------------------------------------------------------------------------------------

const chavePin = (codigo: string) => `simulador:pin:${codigo}`;

export function lembrarPin(codigo: string, pin: string): void {
  try {
    sessionStorage.setItem(chavePin(codigo), pin);
  } catch {}
}

export function pinLembrado(codigo: string): string | null {
  try {
    return sessionStorage.getItem(chavePin(codigo));
  } catch {
    return null;
  }
}

/** Nomes das estratégias de robô para o professor escolher (ids em pacotes/motor/src/robos). */
export const NOMES_ESTRATEGIA: Record<string, string> = {
  preco_baixo: "Preço baixo",
  premium: "Premium (qualidade)",
  marca: "Marca (publicidade)",
  equilibrada: "Equilibrada",
  revenda: "Revenda (compra pronto)",
};

export const nomeDaEstrategia = (id: string) => NOMES_ESTRATEGIA[id] ?? id;
