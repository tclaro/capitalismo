/**
 * Arcabouço dos testes de tela: DOM do happy-dom registrado só durante o arquivo de teste (os testes
 * do servidor, no mesmo processo, usam fetch e WebSocket reais), WebSocket e fetch falsos com
 * registro do que a tela enviou, e montagem do App numa rota.
 */
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, afterEach, beforeAll } from "bun:test";

export class WebSocketFalso {
  static criados: WebSocketFalso[] = [];
  readyState = 0;
  onopen: ((e: unknown) => void) | null = null;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onclose: ((e: { code: number; reason: string }) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  enviadas: string[] = [];
  constructor(readonly url: string) {
    WebSocketFalso.criados.push(this);
  }
  send(d: string) {
    this.enviadas.push(d);
  }
  close() {
    this.readyState = 3;
  }
  /** Mensagens enviadas pela tela, já em objeto (sem os pings do vigia). */
  get comandos(): Record<string, unknown>[] {
    return this.enviadas.map((t) => JSON.parse(t)).filter((m) => m.tipo !== "ping");
  }
}

export interface PedidoFeito {
  metodo: string;
  caminho: string;
  corpo: unknown;
}

type Resposta = { status?: number; corpo: unknown };
type Rota = Resposta | ((p: PedidoFeito) => Resposta);

export interface Dom {
  React: typeof import("react");
  /** Respostas do "servidor": chave `MÉTODO /caminho` (caminho com a busca). */
  rotas: Map<string, Rota>;
  pedidos: PedidoFeito[];
  montar(caminho: string): Promise<HTMLElement>;
  /** Roda algo dentro do `act` e espera as promessas pendentes. */
  agir(f: () => unknown): Promise<void>;
  ws(): WebSocketFalso;
  /** Abre o último WebSocket e entrega uma mensagem do servidor. */
  servidorEnvia(m: unknown, ws?: WebSocketFalso): Promise<void>;
  abrirWs(ws?: WebSocketFalso): Promise<void>;
  /** Digita num campo controlado pelo React. */
  digitar(el: Element | null, valor: string): Promise<void>;
  escolher(el: Element | null, valor: string): Promise<void>;
  botao(r: ParentNode, texto: string | RegExp): HTMLButtonElement;
}

export function prepararDom(): Dom {
  const rotas = new Map<string, Rota>();
  const pedidos: PedidoFeito[] = [];
  let raiz: import("react-dom/client").Root | null = null;
  let recipiente: HTMLElement | null = null;
  let criarRaiz: typeof import("react-dom/client").createRoot;
  let App: typeof import("../src/app").App;

  const dom = {
    rotas,
    pedidos,
  } as Dom;

  beforeAll(async () => {
    GlobalRegistrator.register({ url: "http://servidor:47800/" });
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    // Depois do DOM: o React DOM detecta o navegador ao carregar.
    dom.React = await import("react");
    criarRaiz = (await import("react-dom/client")).createRoot;
    App = (await import("../src/app")).App;
  });

  afterAll(async () => {
    await GlobalRegistrator.unregister();
  });

  afterEach(async () => {
    await dom.React.act(async () => raiz?.unmount());
    raiz = null;
    recipiente?.remove();
    WebSocketFalso.criados = [];
    rotas.clear();
    pedidos.length = 0;
    try {
      sessionStorage.clear();
      localStorage.clear();
    } catch {}
  });

  const buscarFalso = async (entrada: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(entrada instanceof Request ? entrada.url : entrada), "http://servidor:47800");
    const metodo = (init?.method ?? "GET").toUpperCase();
    const pedido = { metodo, caminho: url.pathname + url.search, corpo: typeof init?.body === "string" ? JSON.parse(init.body) : null };
    pedidos.push(pedido);
    const rota = rotas.get(`${metodo} ${pedido.caminho}`) ?? rotas.get(`${metodo} ${url.pathname}`);
    const r = typeof rota === "function" ? rota(pedido) : (rota ?? { status: 404, corpo: { ok: false, motivo: "rota não encontrada" } });
    return new Response(JSON.stringify(r.corpo), { status: r.status ?? 200, headers: { "content-type": "application/json" } });
  };

  dom.agir = async (f) => {
    await dom.React.act(async () => {
      await f();
      // Deixa as promessas encadeadas (fetch → json → setState) terminarem dentro do act.
      for (let i = 0; i < 5; i++) await new Promise((ok) => setTimeout(ok, 0));
    });
  };

  dom.montar = async (caminho) => {
    window.history.replaceState(null, "", caminho);
    (globalThis as { WebSocket: unknown }).WebSocket = WebSocketFalso;
    (globalThis as { fetch: unknown }).fetch = buscarFalso;
    recipiente = document.createElement("div");
    document.body.appendChild(recipiente);
    await dom.agir(() => {
      raiz = criarRaiz(recipiente!);
      raiz.render(dom.React.createElement(App));
    });
    return recipiente;
  };

  dom.ws = () => {
    const w = WebSocketFalso.criados.at(-1);
    if (!w) throw new Error("nenhum WebSocket foi aberto");
    return w;
  };

  dom.abrirWs = async (ws = dom.ws()) => {
    await dom.agir(() => {
      ws.readyState = 1;
      ws.onopen?.({});
    });
  };

  dom.servidorEnvia = async (m, ws = dom.ws()) => {
    if (ws.readyState !== 1) await dom.abrirWs(ws);
    await dom.agir(() => ws.onmessage?.({ data: JSON.stringify(m) }));
  };

  // Campos controlados: o React ouve o evento "input" e lê o valor pelo setter nativo.
  const definirValor = (el: HTMLInputElement | HTMLSelectElement, valor: string) => {
    const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, valor);
  };

  dom.digitar = async (el, valor) => {
    if (!el) throw new Error("campo não encontrado");
    await dom.agir(() => {
      definirValor(el as HTMLInputElement, valor);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
  };

  dom.escolher = async (el, valor) => {
    if (!el) throw new Error("seleção não encontrada");
    await dom.agir(() => {
      definirValor(el as HTMLSelectElement, valor);
      el.dispatchEvent(new Event("change", { bubbles: true }));
    });
  };

  dom.botao = (r, texto) => {
    const b = [...r.querySelectorAll("button")].find((x) => (typeof texto === "string" ? x.textContent?.trim() === texto : texto.test(x.textContent ?? "")));
    if (!b) throw new Error(`botão não encontrado: ${texto}. Botões: ${[...r.querySelectorAll("button")].map((x) => x.textContent?.trim()).join(" | ")}`);
    return b as HTMLButtonElement;
  };

  return dom;
}
