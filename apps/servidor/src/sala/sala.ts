/**
 * Agregado da sala: a partida, as vagas e equipes, a fila de decisões, os comandos e o relógio.
 * Não conhece rede nem banco: a gravação é delegada ao `Observador` (entrega 2 implementa com SQLite)
 * e o envio às telas acontece em quem escuta `aoMudar` (entrega 3).
 *
 * Regras principais (plano da fase 1):
 * - Estados: preparacao → rodando ⇄ pausada → encerrada.
 * - Na preparação (tick 0), mudanças de equipes recriam a partida com a **mesma semente e a mesma
 *   ordem de vagas**: os ids das empresas não mudam e as decisões já enviadas continuam valendo.
 * - Ao iniciar, vagas vazias viram robôs (estratégia da configuração) ou ficam inativas.
 * - Pausa manual: alunos só editam se `edicaoNaPausa`. Pausa de fim de mês (modo rodada): sempre
 *   podem editar. Duração atingida: pausa, e o professor encerra ou estende.
 * - Comandos idempotentes: o mesmo `idComando` devolve a mesma resposta; comandos de relógio exigem
 *   `tickEsperado` igual ao tick atual (duas abas não avançam duas vezes).
 * - O tick usa `passo` (puro): se a gravação falhar, o estado em memória fica igual ao do banco.
 */
import { PRESETS } from "@simulador/catalogo";
import {
  type ConfigSala,
  chaveDeNome,
  type DecisaoDoAluno,
  ehFimDoMes,
  MAXIMO_DE_ROBOS,
  type MotivoPausa,
  nomeDoRobo,
  normalizarNome,
  pareceNomeDeRobo,
  type StatusSala,
  ticksAteProxima,
} from "@simulador/compartilhado";
import {
  type Aviso,
  criarPartida,
  type Decisao,
  ESTRATEGIAS_RAZOAVEIS,
  type EstadoPartida,
  type FechamentoMensal,
  passo,
  type Preset,
  type ResultadoTick,
  validarDecisao,
} from "@simulador/motor";
import { type AcumuladorSemanal, acumularTick, novoAcumulador, type RegistroSemanal } from "./historico";
import { type Agendador, Relogio } from "./relogio";

export interface Equipe {
  nome: string;
  cor: string;
}

export interface Vaga {
  empresa: string;
  mercado: number;
  equipe: Equipe | null;
  /** Estratégia do robô que ocupou a vaga ao iniciar; `null` se não é robô. */
  robo: string | null;
  inativa: boolean;
}

export interface Membro {
  id: string;
  nome: string;
  empresa: string;
}

export interface DecisaoNaFila {
  empresa: string;
  membro: string;
  idComando: string;
  decisao: Decisao;
}

export interface Resposta {
  ok: boolean;
  motivo?: string;
}

/**
 * Recebe os fatos da sala para gravar (entrega 2). Pode lançar exceção: o tick é descartado.
 * `gravarTick` é chamado **antes** de a sala atualizar a memória (`sala.estado` e `sala.fila` ainda
 * são os de antes do tick); o que muda com o tick vem nos argumentos.
 */
export interface Observador {
  gravarTick?(sala: Sala, resultado: ResultadoTick, semanaFechada: RegistroSemanal[] | null, acumulador: AcumuladorSemanal): void;
  gravarComando?(sala: Sala, idComando: string, resposta: Resposta): void;
  gravarDecisao?(sala: Sala, item: DecisaoNaFila): void;
  gravarSala?(sala: Sala): void;
  /** Algo visível mudou (tick, status, equipes, fila): as telas devem ser atualizadas. */
  aoMudar?(sala: Sala, motivo: "tick" | "status" | "equipes" | "fila" | "config", empresa?: string): void;
  /** Um tick falhou (motor ou gravação): a sala foi pausada com motivo "erro". */
  aoErro?(sala: Sala, erro: unknown): void;
}

export class ErroDeSala extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ErroDeSala";
  }
}

const PREFIXO_MEMBRO = "mem_";

export interface DadosSala {
  id: string;
  codigo: string;
  semente: string;
  config: ConfigSala;
  status: StatusSala;
  motivoPausa: MotivoPausa | null;
  estado: EstadoPartida;
  vagas: Vaga[];
  membros: Membro[];
  fila: DecisaoNaFila[];
  prontos: string[];
  fechamentos: Record<string, FechamentoMensal[]>;
  acumulador: AcumuladorSemanal;
  proximoMembro: number;
}

export class Sala {
  readonly id: string;
  readonly codigo: string;
  readonly semente: string;
  readonly preset: Preset;
  config: ConfigSala;
  status: StatusSala;
  motivoPausa: MotivoPausa | null;
  estado: EstadoPartida;
  vagas: Vaga[];
  membros: Membro[];
  fila: DecisaoNaFila[];
  prontos: Set<string>;
  fechamentos: Record<string, FechamentoMensal[]>;
  acumulador: AcumuladorSemanal;
  /** Avisos do último tick processado (para as telas). */
  avisosRecentes: Aviso[] = [];
  private proximoMembro: number;
  private readonly comandos = new Map<string, Resposta>();
  private readonly relogio: Relogio;
  observador: Observador;

  private constructor(dados: DadosSala, agendador: Agendador, observador: Observador) {
    const preset = PRESETS[dados.config.presetId];
    if (!preset) throw new ErroDeSala(`preset desconhecido: "${dados.config.presetId}"`);
    this.id = dados.id;
    this.codigo = dados.codigo;
    this.semente = dados.semente;
    this.preset = preset;
    this.config = dados.config;
    this.status = dados.status;
    this.motivoPausa = dados.motivoPausa;
    this.estado = dados.estado;
    this.vagas = dados.vagas;
    this.membros = dados.membros;
    this.fila = dados.fila;
    this.prontos = new Set(dados.prontos);
    this.fechamentos = dados.fechamentos;
    this.acumulador = dados.acumulador;
    this.proximoMembro = dados.proximoMembro;
    this.observador = observador;
    this.relogio = new Relogio(agendador, () => this.aoTickDoRelogio());
  }

  /** Cria uma sala nova, em preparação, com a partida no tick 0. */
  static criar(p: { id: string; codigo: string; semente: string; config: ConfigSala }, agendador: Agendador, observador: Observador = {}): Sala {
    if (!PRESETS[p.config.presetId]) throw new ErroDeSala(`preset desconhecido: "${p.config.presetId}"`);
    if (p.config.robosNasVagasVazias !== null && !ESTRATEGIAS_RAZOAVEIS.includes(p.config.robosNasVagasVazias)) {
      throw new ErroDeSala(`estratégia de robô inválida: "${p.config.robosNasVagasVazias}" (use ${ESTRATEGIAS_RAZOAVEIS.join(", ")})`);
    }
    const vagas: Vaga[] = [];
    for (let m = 0; m < p.config.mercados; m++) {
      for (let k = 0; k < p.config.vagasPorMercado; k++) {
        vagas.push({ empresa: `emp_${String(vagas.length + 1).padStart(2, "0")}`, mercado: m, equipe: null, robo: null, inativa: false });
      }
    }
    const dados: DadosSala = {
      ...p,
      status: "preparacao",
      motivoPausa: null,
      estado: montarPartida(PRESETS[p.config.presetId]!, p.semente, p.config, vagas),
      vagas,
      membros: [],
      fila: [],
      prontos: [],
      fechamentos: {},
      acumulador: novoAcumulador(),
      proximoMembro: 1,
    };
    const sala = new Sala(dados, agendador, observador);
    sala.observador.gravarSala?.(sala);
    return sala;
  }

  /** Reconstrói uma sala gravada (retomada após reinício): se estava rodando, volta pausada. */
  static retomar(dados: DadosSala, agendador: Agendador, observador: Observador = {}): Sala {
    const sala = new Sala(dados, agendador, observador);
    if (sala.status === "rodando") {
      sala.status = "pausada";
      sala.motivoPausa = "manual";
    }
    return sala;
  }

  /** Dados JSON da sala para gravar (sem relógio nem comandos em memória). */
  dados(): DadosSala {
    return {
      id: this.id,
      codigo: this.codigo,
      semente: this.semente,
      config: this.config,
      status: this.status,
      motivoPausa: this.motivoPausa,
      estado: this.estado,
      vagas: this.vagas,
      membros: this.membros,
      fila: this.fila,
      prontos: [...this.prontos].sort(),
      fechamentos: this.fechamentos,
      acumulador: this.acumulador,
      proximoMembro: this.proximoMembro,
    };
  }

  motivoAtual(): MotivoPausa | null {
    return this.motivoPausa;
  }

  get relogioRodando(): boolean {
    return this.relogio.rodando;
  }

  proximoTickEmMs(): number | null {
    return this.relogio.proximoTickEmMs();
  }

  /** Alunos podem enviar decisões agora? */
  podeEditar(): boolean {
    switch (this.status) {
      case "preparacao":
      case "rodando":
        return true;
      case "pausada":
        if (this.motivoPausa === "fim_do_mes") return true;
        if (this.motivoPausa === "manual") return this.config.edicaoNaPausa;
        return false;
      case "encerrada":
        return false;
    }
  }

  vaga(empresa: string): Vaga | undefined {
    return this.vagas.find((v) => v.empresa === empresa);
  }

  membro(id: string): Membro | undefined {
    return this.membros.find((m) => m.id === id);
  }

  /** Equipes humanas que jogam (têm equipe e não são robô nem inativas). */
  equipesHumanas(): Vaga[] {
    return this.vagas.filter((v) => v.equipe !== null && v.robo === null && !v.inativa);
  }

  // -------------------------------------------------------------------------------------------
  // Entrada de alunos e equipes
  // -------------------------------------------------------------------------------------------

  /**
   * Entrada de um aluno numa equipe existente ou criação de uma equipe numa vaga livre.
   * Voltar com o mesmo nome na mesma equipe recupera o mesmo membro.
   */
  entrarAluno(nomeDigitado: string, equipe: { tipo: "existente"; empresa: string } | { tipo: "nova"; empresa: string; nome: string; cor: string }): { ok: true; membro: Membro } | { ok: false; motivo: string } {
    if (this.status === "encerrada") return { ok: false, motivo: "a partida já foi encerrada" };
    const nome = normalizarNome(nomeDigitado);
    if (!nome) return { ok: false, motivo: "nome inválido (até 24 letras, números e pontuação simples)" };
    const vaga = this.vaga(equipe.empresa);
    if (!vaga) return { ok: false, motivo: "equipe não existe nesta sala" };

    const mesmoNome = this.membros.find((m) => chaveDeNome(m.nome) === chaveDeNome(nome));
    if (equipe.tipo === "existente") {
      if (!vaga.equipe || vaga.robo !== null) return { ok: false, motivo: "essa vaga ainda não tem equipe" };
      if (mesmoNome) {
        if (mesmoNome.empresa === vaga.empresa) return { ok: true, membro: mesmoNome };
        return { ok: false, motivo: "já existe um aluno com esse nome em outra equipe" };
      }
      return { ok: true, membro: this.novoMembro(nome, vaga.empresa) };
    }

    if (this.status !== "preparacao") return { ok: false, motivo: "novas equipes só podem ser criadas antes do início" };
    if (vaga.equipe) return { ok: false, motivo: "essa vaga já tem equipe" };
    if (mesmoNome) return { ok: false, motivo: "já existe um aluno com esse nome nesta sala" };
    const nomeEquipe = normalizarNome(equipe.nome);
    if (!nomeEquipe) return { ok: false, motivo: "nome de equipe inválido" };
    if (pareceNomeDeRobo(nomeEquipe)) return { ok: false, motivo: NOME_RESERVADO };
    if (this.vagas.some((v) => v.equipe && chaveDeNome(v.equipe.nome) === chaveDeNome(nomeEquipe))) {
      return { ok: false, motivo: "já existe uma equipe com esse nome" };
    }
    if (this.vagas.some((v) => v.mercado === vaga.mercado && v.equipe?.cor === equipe.cor)) {
      return { ok: false, motivo: "essa cor já foi escolhida por outra equipe do mercado" };
    }
    vaga.equipe = { nome: nomeEquipe, cor: equipe.cor };
    this.recriarPartida();
    return { ok: true, membro: this.novoMembro(nome, vaga.empresa) };
  }

  private novoMembro(nome: string, empresa: string): Membro {
    const membro = { id: `${PREFIXO_MEMBRO}${this.proximoMembro++}`, nome, empresa };
    this.membros.push(membro);
    this.observador.gravarSala?.(this);
    this.observador.aoMudar?.(this, "equipes");
    return membro;
  }

  /** Professor renomeia uma equipe. */
  renomearEquipe(idComando: string, empresa: string, nomeDigitado: string): Resposta {
    return this.comando(idComando, () => {
      const vaga = this.vaga(empresa);
      if (!vaga?.equipe) return { ok: false, motivo: "equipe não existe" };
      const nome = normalizarNome(nomeDigitado);
      if (!nome) return { ok: false, motivo: "nome de equipe inválido" };
      if (pareceNomeDeRobo(nome)) return { ok: false, motivo: NOME_RESERVADO };
      if (this.vagas.some((v) => v !== vaga && v.equipe && chaveDeNome(v.equipe.nome) === chaveDeNome(nome))) {
        return { ok: false, motivo: "já existe uma equipe com esse nome" };
      }
      vaga.equipe.nome = nome;
      const empresaNoEstado = this.estado.empresas.find((e) => e.id === empresa);
      if (empresaNoEstado) empresaNoEstado.nome = nome;
      this.observador.gravarSala?.(this);
      this.observador.aoMudar?.(this, "equipes");
      return { ok: true };
    });
  }

  /** Professor move um aluno para outra equipe (com equipe formada). */
  moverAluno(idComando: string, membroId: string, empresa: string): Resposta {
    return this.comando(idComando, () => {
      const membro = this.membro(membroId);
      if (!membro) return { ok: false, motivo: "aluno não existe" };
      const vaga = this.vaga(empresa);
      if (!vaga?.equipe || vaga.robo !== null) return { ok: false, motivo: "destino não é uma equipe de alunos" };
      membro.empresa = empresa;
      this.observador.gravarSala?.(this);
      this.observador.aoMudar?.(this, "equipes");
      return { ok: true };
    });
  }

  // -------------------------------------------------------------------------------------------
  // Decisões e prontidão
  // -------------------------------------------------------------------------------------------

  /** Decisões de um aluno (todas ou nenhuma): a empresa vem do membro, nunca da mensagem. */
  decidir(idComando: string, membroId: string, decisoes: readonly DecisaoDoAluno[]): Resposta {
    return this.comando(idComando, () => {
      const membro = this.membro(membroId);
      if (!membro) return { ok: false, motivo: "aluno não encontrado" };
      const vaga = this.vaga(membro.empresa);
      if (!vaga || vaga.robo !== null || vaga.inativa) return { ok: false, motivo: "esta empresa não aceita decisões de alunos" };
      if (!this.podeEditar()) return { ok: false, motivo: "decisões bloqueadas neste momento" };
      const completas = decisoes.map((d) => ({ ...d, empresa: membro.empresa }) as Decisao);
      for (const d of completas) {
        const motivo = validarDecisao(this.estado, d);
        if (motivo !== null) return { ok: false, motivo };
      }
      for (const decisao of completas) {
        const item = { empresa: membro.empresa, membro: membro.id, idComando, decisao };
        this.fila.push(item);
        this.observador.gravarDecisao?.(this, item);
      }
      // Só a equipe de quem decidiu (e o professor) vê a pendência: as outras telas não mudam.
      this.observador.aoMudar?.(this, "fila", membro.empresa);
      return { ok: true };
    });
  }

  /** Decisões pendentes (ainda não aplicadas) de uma empresa, sem o campo `empresa`. */
  pendentes(empresa: string): DecisaoDoAluno[] {
    return this.fila.filter((f) => f.empresa === empresa).map((f) => semEmpresa(f.decisao));
  }

  marcarPronto(idComando: string, membroId: string, pronto: boolean): Resposta {
    return this.comando(idComando, () => {
      const membro = this.membro(membroId);
      if (!membro) return { ok: false, motivo: "aluno não encontrado" };
      if (pronto) this.prontos.add(membro.empresa);
      else this.prontos.delete(membro.empresa);
      this.observador.gravarSala?.(this);
      this.observador.aoMudar?.(this, "equipes");
      if (this.todasProntas() && this.status === "pausada" && this.motivoPausa === "fim_do_mes" && this.config.avancoQuandoProntas) {
        this.retomarRelogio();
      }
      return { ok: true };
    });
  }

  private todasProntas(): boolean {
    const humanas = this.equipesHumanas();
    return humanas.length > 0 && humanas.every((v) => this.prontos.has(v.empresa));
  }

  // -------------------------------------------------------------------------------------------
  // Relógio e comandos do professor
  // -------------------------------------------------------------------------------------------

  comandoRelogio(idComando: string, tickEsperado: number, acao: "iniciar" | "pausar" | "retomar" | "avancar", unidade: "tick" | "semana" | "mes" = "tick"): Resposta {
    return this.comando(idComando, () => {
      if (tickEsperado !== this.estado.tick) return { ok: false, motivo: "desatualizado" };
      switch (acao) {
        case "iniciar": {
          if (this.status !== "preparacao") return { ok: false, motivo: "a partida já começou" };
          if (this.equipesHumanas().length === 0 && this.config.robosNasVagasVazias === null) {
            return { ok: false, motivo: "nenhuma equipe formada e sem robôs para as vagas vazias" };
          }
          this.prepararInicio();
          this.status = "rodando";
          this.motivoPausa = null;
          this.relogio.iniciar(this.intervaloMs());
          this.mudouStatus();
          return { ok: true };
        }
        case "pausar": {
          if (this.status !== "rodando") return { ok: false, motivo: "o relógio não está rodando" };
          this.pausar("manual");
          return { ok: true };
        }
        case "retomar": {
          if (this.status !== "pausada") return { ok: false, motivo: "a partida não está pausada" };
          if (this.motivoPausa === "duracao_atingida") return { ok: false, motivo: "duração atingida: estenda ou encerre" };
          this.retomarRelogio();
          return { ok: true };
        }
        case "avancar": {
          if (this.status !== "pausada") return { ok: false, motivo: "pause a partida para avançar manualmente" };
          if (this.motivoPausa === "duracao_atingida") return { ok: false, motivo: "duração atingida: estenda ou encerre" };
          const k = Math.min(ticksAteProxima(this.estado.tick, this.ticksPorMes, unidade), this.ticksRestantes());
          if (!this.executarTicks(k, "manual")) return { ok: false, motivo: "falha ao processar o tick; a partida foi pausada" };
          // executarTicks pode ter mudado o motivo (duração atingida): relê fora do estreitamento de tipo.
          if (this.status === "pausada" && this.motivoAtual() !== "duracao_atingida") {
            // Avançar até o fim do mês no modo rodada é o momento de decidir: libera edição.
            this.motivoPausa = this.config.modo === "rodada" && ehFimDoMes(this.estado.tick, this.ticksPorMes) ? "fim_do_mes" : "manual";
            this.mudouStatus();
          }
          return { ok: true };
        }
      }
    });
  }

  configurar(idComando: string, mudancas: { [K in "segundosPorTick" | "modo" | "edicaoNaPausa" | "rankingVisivel" | "avancoQuandoProntas"]?: ConfigSala[K] | undefined }): Resposta {
    return this.comando(idComando, () => {
      if (this.status === "encerrada") return { ok: false, motivo: "a partida já foi encerrada" };
      const antes = this.config.segundosPorTick;
      this.config = { ...this.config, ...definidos(mudancas) };
      if (this.config.segundosPorTick !== antes && this.relogio.rodando) this.relogio.alterarIntervalo(this.intervaloMs());
      this.observador.gravarSala?.(this);
      this.observador.aoMudar?.(this, "config");
      return { ok: true };
    });
  }

  estender(idComando: string, meses: number): Resposta {
    return this.comando(idComando, () => {
      if (this.status === "encerrada") return { ok: false, motivo: "a partida já foi encerrada" };
      this.config = { ...this.config, duracaoMeses: this.config.duracaoMeses + meses };
      if (this.status === "pausada" && this.motivoPausa === "duracao_atingida") this.motivoPausa = "manual";
      this.mudouStatus();
      return { ok: true };
    });
  }

  encerrar(idComando: string): Resposta {
    return this.comando(idComando, () => {
      if (this.status === "encerrada") return { ok: true };
      this.relogio.parar();
      this.status = "encerrada";
      this.motivoPausa = null;
      this.mudouStatus();
      return { ok: true };
    });
  }

  /** Para o relógio sem mudar o status (desligamento do servidor). */
  pararRelogio(): void {
    this.relogio.parar();
  }

  // -------------------------------------------------------------------------------------------
  // Tick
  // -------------------------------------------------------------------------------------------

  get ticksPorMes(): number {
    return this.estado.parametros.ticksPorMes;
  }

  ticksRestantes(): number {
    return Math.max(0, this.config.duracaoMeses * this.ticksPorMes - this.estado.tick);
  }

  private intervaloMs(): number {
    return Math.round(this.config.segundosPorTick * 1000);
  }

  private aoTickDoRelogio(): void {
    if (this.status !== "rodando") return;
    this.executarTicks(1, "relogio");
  }

  /**
   * Executa até `k` ticks seguidos e avisa as telas uma vez no fim. Para antes se a duração for
   * atingida, se o modo rodada chegar ao fim do mês (só no relógio) ou se o tick falhar. Devolve
   * `false` se um tick falhou: nesse caso o estado em memória é o do último tick gravado, e a sala
   * fica pausada com motivo "erro" (nunca lança exceção: o relógio chama isto de dentro de um timer).
   */
  private executarTicks(k: number, origem: "relogio" | "manual"): boolean {
    let executou = false;
    for (let i = 0; i < k; i++) {
      const decisoes = this.fila.map((f) => f.decisao);
      let resultado: ResultadoTick;
      const acumulador = structuredClone(this.acumulador);
      try {
        resultado = passo(this.estado, { decisoes });
        const semana = acumularTick(acumulador, resultado.historico, this.ticksPorMes);
        this.observador.gravarTick?.(this, resultado, semana, acumulador);
      } catch (erro) {
        this.pausar("erro", false);
        this.observador.aoErro?.(this, erro);
        this.observador.aoMudar?.(this, "status");
        return false;
      }
      executou = true;
      this.estado = resultado.estado;
      this.acumulador = acumulador;
      this.fila = [];
      this.avisosRecentes = resultado.avisos;
      for (const { empresa, fechamento } of resultado.fechamentos) (this.fechamentos[empresa] ??= []).push(fechamento);
      if (resultado.fechamentos.length > 0) {
        this.prontos.clear();
        this.observador.gravarSala?.(this);
      }

      if (this.ticksRestantes() === 0) {
        this.pausar("duracao_atingida", false);
        break;
      }
      if (origem === "relogio" && this.config.modo === "rodada" && ehFimDoMes(this.estado.tick, this.ticksPorMes)) {
        this.pausar("fim_do_mes", false);
        break;
      }
    }
    if (executou) this.observador.aoMudar?.(this, "tick");
    return true;
  }

  private pausar(motivo: MotivoPausa, avisar = true): void {
    this.relogio.parar();
    this.status = "pausada";
    this.motivoPausa = motivo;
    if (avisar) this.mudouStatus();
    else this.observador.gravarSala?.(this);
  }

  private retomarRelogio(): void {
    this.status = "rodando";
    this.motivoPausa = null;
    this.prontos.clear();
    this.relogio.iniciar(this.intervaloMs());
    this.mudouStatus();
  }

  private mudouStatus(): void {
    this.observador.gravarSala?.(this);
    this.observador.aoMudar?.(this, "status");
  }

  /**
   * Vagas vazias viram robôs até `MAXIMO_DE_ROBOS`, alternando entre os mercados (nenhum mercado
   * fica sem robô enquanto outro tem vários); as demais ficam inativas. A partida é recriada com a
   * configuração final.
   */
  private prepararInicio(): void {
    const vazias = this.vagas.filter((v) => !v.equipe);
    const estrategia = this.config.robosNasVagasVazias;
    if (estrategia !== null) {
      const filas = new Map<number, Vaga[]>();
      for (const v of vazias) filas.set(v.mercado, [...(filas.get(v.mercado) ?? []), v]);
      let restantes = MAXIMO_DE_ROBOS;
      for (let rodada = 0; restantes > 0 && [...filas.values()].some((f) => f.length > rodada); rodada++) {
        for (const fila of filas.values()) {
          const v = fila[rodada];
          if (v && restantes > 0) {
            v.robo = estrategia;
            restantes--;
          }
        }
      }
    }
    for (const v of vazias) if (v.robo === null) v.inativa = true;
    this.recriarPartida();
  }

  /** Só no tick 0: recria a partida com a mesma semente e ordem de vagas (ids estáveis). */
  private recriarPartida(): void {
    if (this.estado.tick !== 0) throw new ErroDeSala("a partida só pode ser recriada antes do primeiro tick");
    this.estado = montarPartida(this.preset, this.semente, this.config, this.vagas);
  }

  /** Executa um comando idempotente: o mesmo id devolve a mesma resposta, sem repetir o efeito. */
  private comando(idComando: string, executar: () => Resposta): Resposta {
    const anterior = this.comandos.get(idComando);
    if (anterior) return anterior;
    const resposta = executar();
    this.comandos.set(idComando, resposta);
    this.observador.gravarComando?.(this, idComando, resposta);
    return resposta;
  }

  /** Registra respostas de comandos já gravados (retomada). */
  lembrarComandos(comandos: Iterable<[string, Resposta]>): void {
    for (const [id, r] of comandos) this.comandos.set(id, r);
  }
}

const NOME_RESERVADO = 'nomes terminados em "(robô)" são reservados aos robôs';

/** Vagas com equipe usam o nome dela; robôs, os nomes da lista em ordem; vagas vazias, "Vaga N". */
function montarPartida(preset: Preset, semente: string, config: ConfigSala, vagas: readonly Vaga[]): EstadoPartida {
  let robos = 0;
  return criarPartida({
    preset,
    semente,
    mercados: Array.from({ length: config.mercados }, (_, i) => ({ nome: `Mercado ${i + 1}` })),
    // Um preset com o bloco da cadeia joga com o módulo `cadeia_produtiva` ligado.
    ...(preset.cadeia ? { modulos: ["cadeia_produtiva" as const] } : {}),
    empresas: vagas.map((v, i) => ({
      nome: v.equipe?.nome ?? (v.robo ? nomeDoRobo(robos++) : `Vaga ${i + 1}`),
      mercado: v.mercado,
      ...(v.robo ? { robo: { estrategia: v.robo } } : {}),
    })),
  });
}

function semEmpresa(d: Decisao): DecisaoDoAluno {
  const { empresa: _, ...resto } = d;
  return resto as DecisaoDoAluno;
}

function definidos<T extends object>(o: T): { [K in keyof T]?: Exclude<T[K], undefined> } {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as { [K in keyof T]?: Exclude<T[K], undefined> };
}
