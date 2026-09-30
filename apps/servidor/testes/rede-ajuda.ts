/**
 * Utilitários dos testes de integração: servidor real em porta livre, banco temporário, relógio da
 * partida falso, e clientes HTTP/WebSocket que se comportam como um navegador (cookies e `Origin`).
 */
import type { Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { MensagemServidor } from "@simulador/compartilhado";
import { abrirBanco } from "../src/dados/banco";
import { Gerente } from "../src/gerente";
import { logSilencioso } from "../src/log";
import { iniciarServidor, type ServidorDoSimulador } from "../src/servidor";
import { AgendadorFalso } from "./ajuda";

export const CHAVE = "chave-do-professor";

export interface Ambiente {
  pasta: string;
  caminho: string;
  db: Database;
  gerente: Gerente;
  relogio: AgendadorFalso;
  servidor: ServidorDoSimulador;
  base: string;
  /** Relógio de parede (sessões e limites), controlado pelo teste. */
  tempo: { agora: number };
  navegador(opcoes?: { origem?: string | null }): Navegador;
  /** Reinicia o servidor sobre o mesmo banco (retomada). */
  reiniciar(): Promise<void>;
  fechar(): Promise<void>;
}

export async function montar(pastaExistente?: string): Promise<Ambiente> {
  const pasta = pastaExistente ?? mkdtempSync(join(tmpdir(), "simulador-rede-"));
  const caminho = join(pasta, "simulador.db");
  const tempo = { agora: 1_700_000_000_000 };
  const abrir = () => {
    const db = abrirBanco(caminho, { backup: false });
    const relogio = new AgendadorFalso();
    const gerente = new Gerente({ db, agendador: relogio, agora: () => tempo.agora, log: logSilencioso });
    gerente.carregar();
    const servidor = iniciarServidor({ gerente, porta: 0, hostname: "127.0.0.1" });
    return { db, relogio, gerente, servidor };
  };
  const partes = abrir();
  if (!partes.gerente.acessos.chaveDefinida()) await partes.gerente.acessos.definirChave(CHAVE);
  const amb: Ambiente = {
    pasta,
    caminho,
    ...partes,
    base: `http://127.0.0.1:${partes.servidor.porta}`,
    tempo,
    navegador: (opcoes = {}) => new Navegador(amb.base, opcoes.origem === undefined ? amb.base : opcoes.origem),
    async reiniciar() {
      amb.gerente.desligar();
      await amb.servidor.parar();
      amb.db.close();
      Object.assign(amb, abrir());
      amb.base = `http://127.0.0.1:${amb.servidor.porta}`;
    },
    async fechar() {
      amb.gerente.desligar();
      await amb.servidor.parar();
      amb.db.close();
      if (!pastaExistente) rmSync(pasta, { recursive: true, force: true });
    },
  };
  return amb;
}

export interface RespostaHttp {
  status: number;
  corpo: any;
  cabecalhos: Headers;
}

/** Cliente HTTP com cookies, como um navegador na mesma origem do servidor. */
export class Navegador {
  readonly cookies = new Map<string, string>();

  constructor(
    public base: string,
    public origem: string | null,
  ) {}

  cabecalhoCookie(): string {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
  }

  async pedir(caminho: string, opcoes: { metodo?: string; corpo?: unknown; cabecalhos?: Record<string, string> } = {}): Promise<RespostaHttp> {
    const cabecalhos: Record<string, string> = { ...opcoes.cabecalhos };
    if (this.cookies.size > 0) cabecalhos.cookie = this.cabecalhoCookie();
    if (this.origem && opcoes.metodo && opcoes.metodo !== "GET") cabecalhos.origin = this.origem;
    if (opcoes.corpo !== undefined) cabecalhos["content-type"] ??= "application/json";
    const res = await fetch(this.base + caminho, {
      method: opcoes.metodo ?? "GET",
      headers: cabecalhos,
      ...(opcoes.corpo !== undefined ? { body: JSON.stringify(opcoes.corpo) } : {}),
    });
    for (const c of res.headers.getSetCookie()) {
      const [par, ...atributos] = c.split(";");
      const [nome, valor] = par!.split("=") as [string, string];
      if (atributos.some((a) => a.trim() === "Max-Age=0")) this.cookies.delete(nome.trim());
      else this.cookies.set(nome.trim(), valor.trim());
    }
    const texto = await res.text();
    let corpo: unknown = texto;
    try {
      corpo = JSON.parse(texto);
    } catch {}
    return { status: res.status, corpo, cabecalhos: res.headers };
  }

  post(caminho: string, corpo: unknown = {}) {
    return this.pedir(caminho, { metodo: "POST", corpo });
  }

  /** Abre o WebSocket; devolve "recusado" se o servidor não aceitou o upgrade. */
  conectar(parametros: Record<string, string>, origem: string | null = this.origem): Promise<ClienteWs | "recusado"> {
    const url = `${this.base.replace("http", "ws")}/ws?${new URLSearchParams(parametros)}`;
    const headers: Record<string, string> = {};
    if (this.cookies.size > 0) headers.cookie = this.cabecalhoCookie();
    if (origem) headers.origin = origem;
    const ws = new WebSocket(url, { headers } as unknown as string[]);
    const cliente = new ClienteWs(ws);
    return new Promise((resolver) => {
      ws.addEventListener("open", () => resolver(cliente));
      ws.addEventListener("error", () => resolver("recusado"));
      ws.addEventListener("close", () => resolver("recusado"));
    });
  }

  async ws(parametros: Record<string, string>): Promise<ClienteWs> {
    const c = await this.conectar(parametros);
    if (c === "recusado") throw new Error(`WebSocket recusado: ${JSON.stringify(parametros)}`);
    return c;
  }
}

export class ClienteWs {
  readonly mensagens: MensagemServidor[] = [];
  readonly brutas: string[] = [];
  private consumidas = 0;
  private ouvintes: (() => void)[] = [];
  readonly fechado: Promise<{ codigo: number; motivo: string }>;

  constructor(readonly ws: WebSocket) {
    ws.addEventListener("message", (e) => {
      const texto = String(e.data);
      this.brutas.push(texto);
      this.mensagens.push(JSON.parse(texto));
      for (const f of this.ouvintes) f();
    });
    this.fechado = new Promise((resolver) => ws.addEventListener("close", (e) => resolver({ codigo: e.code, motivo: e.reason })));
  }

  enviar(m: unknown): void {
    this.ws.send(JSON.stringify(m));
  }

  /** Próxima mensagem ainda não consumida que satisfaz o predicado (consome até ela). */
  esperar<T extends MensagemServidor = MensagemServidor>(pred: (m: MensagemServidor) => boolean, ms = 3000): Promise<T> {
    return new Promise((resolver, rejeitar) => {
      const procurar = () => {
        for (let i = this.consumidas; i < this.mensagens.length; i++) {
          if (pred(this.mensagens[i]!)) {
            this.consumidas = i + 1;
            limpar();
            resolver(this.mensagens[i] as T);
            return true;
          }
        }
        return false;
      };
      const timer = setTimeout(() => {
        limpar();
        rejeitar(new Error(`mensagem esperada não chegou em ${ms} ms; recebidas: ${this.mensagens.map((m) => m.tipo).join(", ")}`));
      }, ms);
      const limpar = () => {
        clearTimeout(timer);
        this.ouvintes = this.ouvintes.filter((f) => f !== ouvinte);
      };
      const ouvinte = () => void procurar();
      if (procurar()) return;
      this.ouvintes.push(ouvinte);
    });
  }

  resposta(idComando: string) {
    return this.esperar<Extract<MensagemServidor, { tipo: "resposta" }>>((m) => m.tipo === "resposta" && m.idComando === idComando);
  }

  /** Ignora o que chegou até agora (a próxima espera só olha mensagens novas). */
  descartar(): void {
    this.consumidas = this.mensagens.length;
  }

  fechar(): void {
    this.ws.close();
  }
}

/** Dá tempo para as mensagens em trânsito chegarem. */
export const respirar = (ms = 30) => Bun.sleep(ms);
