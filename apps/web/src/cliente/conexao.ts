/**
 * Conexão com a sala por WebSocket (seção 9.8), sem React e com dependências injetáveis (testada
 * com socket e relógio falsos).
 *
 * - Reconexão automática com espera exponencial (0,5 s → 10 s, com variação aleatória para os 60
 *   navegadores não voltarem todos no mesmo instante).
 * - Snapshot na conexão; atualizações com tick anterior ao da visão atual são descartadas.
 * - Comandos levam `idComando`; os que ainda não tiveram resposta são reenviados com o **mesmo** id
 *   ao reconectar (o servidor é idempotente), e podem ser guardados no navegador (`armazenamento`)
 *   para sobreviver a um recarregamento da página.
 * - Vigia: ping da aplicação a cada 15 s; sem nenhuma mensagem por 40 s, a conexão é dada como
 *   morta e refeita.
 * - Fechamentos definitivos (aluno removido, telão revogado, sala excluída) e acesso recusado
 *   encerram sem tentar de novo.
 */
import type { MensagemCliente, MensagemServidor, Papel, Visao } from "@simulador/compartilhado";

/** O que a conexão usa do WebSocket do navegador. */
export interface SocketLike {
  readonly readyState: number;
  send(dados: string): void;
  close(codigo?: number, motivo?: string): void;
  onopen: ((e: unknown) => void) | null;
  onmessage: ((e: { data: unknown }) => void) | null;
  onclose: ((e: { code: number; reason: string }) => void) | null;
  onerror: ((e: unknown) => void) | null;
}

export interface Relogio {
  agora(): number;
  agendar(ms: number, fn: () => void): () => void;
}

/** Guarda os comandos pendentes (ex.: `localStorage`), para reenviar depois de recarregar a página. */
export interface Armazenamento {
  ler(): ComandoPendente[];
  gravar(pendentes: ComandoPendente[]): void;
}

export type EstadoConexao = "conectando" | "aberta" | "reconectando" | "encerrada";

export interface Instantaneo<V extends Visao = Visao> {
  estado: EstadoConexao;
  /** Tentativas seguidas sem sucesso (0 quando aberta). */
  falhas: number;
  papel: Papel | null;
  visao: V | null;
  /** Por que a conexão foi encerrada de vez (mostrado ao usuário). */
  motivo: string | null;
  /** Último erro enviado pelo servidor (mensagem inválida, excesso de mensagens...). */
  erro: string | null;
  /** Comandos enviados que ainda não tiveram resposta. */
  pendentes: number;
}

export type ComandoSemId = MensagemCliente extends infer M ? (M extends { idComando: string } ? Omit<M, "idComando"> : never) : never;
export type ComandoPendente = ComandoSemId & { idComando: string };
export interface RespostaComando {
  ok: boolean;
  motivo?: string;
}

export interface OpcoesConexao {
  url: string;
  criarSocket: (url: string) => SocketLike;
  relogio?: Relogio;
  /** Consultado depois de falhas seguidas: `false` = sem acesso (sessão vencida), para de tentar. */
  verificarAcesso?: () => Promise<boolean>;
  armazenamento?: Armazenamento;
  aleatorio?: () => number;
  gerarId?: () => string;
}

export const ESPERA_INICIAL_MS = 500;
export const ESPERA_MAXIMA_MS = 10_000;
export const INTERVALO_PING_MS = 15_000;
export const SILENCIO_MAXIMO_MS = 40_000;
/** Falhas seguidas antes de perguntar ao servidor se ainda há acesso. */
export const FALHAS_ATE_VERIFICAR = 2;

/** Códigos de fechamento definitivos (servidor.ts) e o que dizer ao usuário. */
export const FECHAMENTOS_DEFINITIVOS: Record<number, string> = {
  4001: "Você não faz mais parte desta equipe. Entre de novo na sala.",
  4003: "Este link do telão foi revogado pelo professor.",
  4004: "Esta sala foi excluída.",
};

const ABERTO = 1;

const relogioReal: Relogio = {
  agora: () => Date.now(),
  agendar: (ms, fn) => {
    const t = setTimeout(fn, ms);
    return () => clearTimeout(t);
  },
};

export class ConexaoSala<V extends Visao = Visao> {
  private socket: SocketLike | null = null;
  private atual: Instantaneo<V> = { estado: "conectando", falhas: 0, papel: null, visao: null, motivo: null, erro: null, pendentes: 0 };
  private readonly ouvintes = new Set<() => void>();
  private readonly pendentes = new Map<string, { mensagem: ComandoPendente; resolver: ((r: RespostaComando) => void) | null }>();
  private cancelarEspera: (() => void) | null = null;
  private cancelarVigia: (() => void) | null = null;
  private ultimaMensagem = 0;
  private abriuNestaTentativa = false;
  private readonly relogio: Relogio;
  private readonly aleatorio: () => number;
  private readonly gerarId: () => string;

  constructor(private readonly opcoes: OpcoesConexao) {
    this.relogio = opcoes.relogio ?? relogioReal;
    this.aleatorio = opcoes.aleatorio ?? Math.random;
    this.gerarId = opcoes.gerarId ?? (() => crypto.randomUUID());
    for (const m of opcoes.armazenamento?.ler() ?? []) this.pendentes.set(m.idComando, { mensagem: m, resolver: null });
    this.atual = { ...this.atual, pendentes: this.pendentes.size };
  }

  // -------------------------------------------------------------------------------------------
  // Leitura (useSyncExternalStore)
  // -------------------------------------------------------------------------------------------

  instantaneo = (): Instantaneo<V> => this.atual;

  assinar = (f: () => void): (() => void) => {
    this.ouvintes.add(f);
    return () => this.ouvintes.delete(f);
  };

  private mudar(parcial: Partial<Instantaneo<V>>): void {
    this.atual = { ...this.atual, ...parcial, pendentes: this.pendentes.size };
    for (const f of this.ouvintes) f();
  }

  // -------------------------------------------------------------------------------------------
  // Ciclo de vida
  // -------------------------------------------------------------------------------------------

  iniciar(): void {
    if (this.atual.estado === "encerrada") return;
    this.abrir();
  }

  /** Encerra de vez (a tela saiu): nada de reconectar. */
  encerrar(motivo: string | null = null): void {
    this.limparTimers();
    const s = this.socket;
    this.socket = null;
    if (s) {
      s.onopen = s.onmessage = s.onclose = s.onerror = null;
      s.close(1000, "saiu");
    }
    this.mudar({ estado: "encerrada", motivo });
  }

  private abrir(): void {
    this.abriuNestaTentativa = false;
    let s: SocketLike;
    try {
      s = this.opcoes.criarSocket(this.opcoes.url);
    } catch {
      this.aoFechar(1006);
      return;
    }
    this.socket = s;
    s.onopen = () => {
      this.abriuNestaTentativa = true;
      this.ultimaMensagem = this.relogio.agora();
      this.mudar({ estado: "aberta", falhas: 0, motivo: null });
      for (const { mensagem } of this.pendentes.values()) s.send(JSON.stringify(mensagem));
      this.vigiar();
    };
    s.onmessage = (e) => this.aoReceber(String(e.data));
    s.onclose = (e) => {
      if (this.socket !== s) return;
      this.socket = null;
      this.aoFechar(e.code);
    };
    // O navegador sempre chama onclose depois de onerror.
    s.onerror = () => {};
  }

  private aoFechar(codigo: number): void {
    this.limparTimers();
    if (this.atual.estado === "encerrada") return;
    const definitivo = FECHAMENTOS_DEFINITIVOS[codigo];
    if (definitivo) {
      this.falharPendentes("conexão encerrada");
      this.mudar({ estado: "encerrada", motivo: definitivo });
      return;
    }
    const falhas = this.abriuNestaTentativa ? 1 : this.atual.falhas + 1;
    this.mudar({ estado: "reconectando", falhas });
    // Sem nunca ter aberto: pode ser falta de acesso (o navegador não mostra o 401 do upgrade).
    if (!this.abriuNestaTentativa && falhas >= FALHAS_ATE_VERIFICAR && this.opcoes.verificarAcesso) {
      this.opcoes.verificarAcesso().then(
        (ok) => {
          if (this.atual.estado !== "reconectando") return;
          if (ok) this.agendarReconexao(falhas);
          else {
            this.falharPendentes("sem acesso à sala");
            this.mudar({ estado: "encerrada", motivo: "Sua sessão nesta sala terminou. Entre de novo." });
          }
        },
        // Servidor inacessível: continua tentando.
        () => this.agendarReconexao(falhas),
      );
      return;
    }
    this.agendarReconexao(falhas);
  }

  /** Espera antes da tentativa `n` (1, 2, ...): exponencial com teto, entre 50% e 100% do valor. */
  esperaParaTentativa(n: number): number {
    const base = Math.min(ESPERA_MAXIMA_MS, ESPERA_INICIAL_MS * 2 ** (n - 1));
    return Math.round(base * (0.5 + 0.5 * this.aleatorio()));
  }

  private agendarReconexao(falhas: number): void {
    this.cancelarEspera = this.relogio.agendar(this.esperaParaTentativa(falhas), () => {
      this.cancelarEspera = null;
      if (this.atual.estado === "reconectando") this.abrir();
    });
  }

  private vigiar(): void {
    this.cancelarVigia = this.relogio.agendar(INTERVALO_PING_MS, () => {
      this.cancelarVigia = null;
      const s = this.socket;
      if (!s || this.atual.estado !== "aberta") return;
      if (this.relogio.agora() - this.ultimaMensagem > SILENCIO_MAXIMO_MS) {
        // Conexão morta sem aviso (cabo, Wi-Fi): fecha e reconecta.
        this.socket = null;
        s.onopen = s.onmessage = s.onclose = s.onerror = null;
        s.close(4000, "sem resposta");
        this.aoFechar(1006);
        return;
      }
      s.send(JSON.stringify({ tipo: "ping" }));
      this.vigiar();
    });
  }

  private limparTimers(): void {
    this.cancelarEspera?.();
    this.cancelarEspera = null;
    this.cancelarVigia?.();
    this.cancelarVigia = null;
  }

  // -------------------------------------------------------------------------------------------
  // Mensagens
  // -------------------------------------------------------------------------------------------

  private aoReceber(texto: string): void {
    this.ultimaMensagem = this.relogio.agora();
    let m: MensagemServidor;
    try {
      m = JSON.parse(texto) as MensagemServidor;
    } catch {
      return;
    }
    switch (m.tipo) {
      case "snapshot":
        this.mudar({ papel: m.papel, visao: m.visao as V, erro: null });
        return;
      case "atualizacao": {
        const tickAtual = this.atual.visao?.relogio.tick ?? -1;
        if (m.visao.relogio.tick < tickAtual) return;
        this.mudar({ papel: m.papel, visao: m.visao as V });
        return;
      }
      case "resposta": {
        const p = this.pendentes.get(m.idComando);
        if (!p) return;
        this.pendentes.delete(m.idComando);
        this.gravarPendentes();
        p.resolver?.({ ok: m.ok, ...(m.motivo !== undefined ? { motivo: m.motivo } : {}) });
        this.mudar({});
        return;
      }
      case "erro":
        this.mudar({ erro: m.motivo });
        return;
      case "pong":
        return;
    }
  }

  /** Envia um comando; resolve com a resposta do servidor (reenviado se a conexão cair antes). */
  comando(c: ComandoSemId): Promise<RespostaComando> {
    if (this.atual.estado === "encerrada") return Promise.resolve({ ok: false, motivo: "conexão encerrada" });
    const mensagem = { ...c, idComando: this.gerarId() } as ComandoPendente;
    return new Promise((resolver) => {
      this.pendentes.set(mensagem.idComando, { mensagem, resolver });
      this.gravarPendentes();
      if (this.socket?.readyState === ABERTO) this.socket.send(JSON.stringify(mensagem));
      this.mudar({});
    });
  }

  private gravarPendentes(): void {
    this.opcoes.armazenamento?.gravar([...this.pendentes.values()].map((p) => p.mensagem));
  }

  private falharPendentes(motivo: string): void {
    for (const p of this.pendentes.values()) p.resolver?.({ ok: false, motivo });
    this.pendentes.clear();
    this.gravarPendentes();
  }
}

/** URL do WebSocket na mesma origem da página. */
export function urlDoWebSocket(local: { protocol: string; host: string }, parametros: { codigo: string; papel: Papel; token?: string | null }): string {
  const q = new URLSearchParams({ codigo: parametros.codigo, papel: parametros.papel });
  if (parametros.token) q.set("t", parametros.token);
  return `${local.protocol === "https:" ? "wss" : "ws"}://${local.host}/ws?${q}`;
}
