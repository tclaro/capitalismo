/**
 * Renderização das telas no DOM (happy-dom), com WebSocket falso: garante que as rotas montam sem
 * erro, que a tela conectada reage ao snapshot e que o roteador e o tema funcionam no navegador.
 * O DOM é registrado só durante este arquivo (os testes do servidor usam fetch e WebSocket reais).
 */
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";

class WebSocketFalso {
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
}

let React: typeof import("react");
let criarRaiz: typeof import("react-dom/client").createRoot;
let App: typeof import("../src/app").App;
let raiz: ReturnType<typeof criarRaiz> | null = null;
let recipiente: HTMLElement;

beforeAll(async () => {
  GlobalRegistrator.register({ url: "http://servidor:47800/" });
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  // Importados depois do DOM: o React DOM detecta o navegador ao carregar.
  React = await import("react");
  criarRaiz = (await import("react-dom/client")).createRoot;
  App = (await import("../src/app")).App;
});

afterAll(async () => {
  await GlobalRegistrator.unregister();
});

afterEach(async () => {
  await React.act(async () => raiz?.unmount());
  raiz = null;
  recipiente?.remove();
  WebSocketFalso.criados = [];
});

async function montarEm(caminho: string): Promise<HTMLElement> {
  window.history.replaceState(null, "", caminho);
  (globalThis as { WebSocket: unknown }).WebSocket = WebSocketFalso;
  recipiente = document.createElement("div");
  document.body.appendChild(recipiente);
  await React.act(async () => {
    raiz = criarRaiz(recipiente);
    raiz.render(React.createElement(App));
  });
  return recipiente;
}

const relogio = (tick: number, status: string) => ({ tick, ticksPorMes: 30, status, mes: 1, dia: tick, motivoPausa: null });

describe("renderização", () => {
  test("entrada: formulário do código e link do professor", async () => {
    const r = await montarEm("/?codigo=abcde");
    expect(r.querySelector("h1")!.textContent).toBe("Entrar na sala");
    expect((r.querySelector("#codigo") as HTMLInputElement).value).toBe("ABCDE");
    expect(r.querySelector("label[for=codigo]")!.textContent).toBe("Código da sala");
    expect(r.textContent).toContain("Simulador de Mercado");
  });

  test("navegar pelo link troca a tela sem recarregar", async () => {
    const r = await montarEm("/");
    const link = [...r.querySelectorAll("a")].find((a) => a.textContent === "Criar ou abrir uma sala")!;
    await React.act(async () => link.click());
    expect(window.location.pathname).toBe("/professor");
    expect(r.querySelector("h1")!.textContent).toBe("Criar ou abrir uma sala");
    await React.act(async () => {
      window.history.back();
      await new Promise((ok) => setTimeout(ok, 20));
    });
    expect(r.querySelector("h1")!.textContent).toBe("Entrar na sala");
  });

  test("tela do aluno: conecta como aluno e mostra o relógio do snapshot", async () => {
    const r = await montarEm("/s/ABCDE");
    expect(r.querySelector("h1")!.textContent).toBe("Sua empresa");
    expect(r.textContent).toContain("Conectando…");
    const ws = WebSocketFalso.criados.at(-1)!;
    expect(ws.url).toBe("ws://servidor:47800/ws?codigo=ABCDE&papel=aluno");
    await React.act(async () => {
      ws.readyState = 1;
      ws.onopen?.({});
      ws.onmessage?.({ data: JSON.stringify({ tipo: "snapshot", papel: "aluno", visao: { relogio: relogio(3, "rodando") } }) });
    });
    expect(r.textContent).toContain("Conectado");
    expect(r.textContent).toContain("Ano 1, jan, dia 3 · Rodando");
  });

  test("telão: conecta com o token do link; fechamento definitivo mostra o motivo", async () => {
    const r = await montarEm("/telao/ABCDE?t=tok-123");
    const ws = WebSocketFalso.criados.at(-1)!;
    expect(ws.url).toBe("ws://servidor:47800/ws?codigo=ABCDE&papel=telao&t=tok-123");
    await React.act(async () => {
      ws.onclose?.({ code: 4003, reason: "" });
    });
    expect(r.textContent).toContain("Desconectado");
    expect(r.querySelector("[role=alert]")!.textContent).toContain("revogado");
  });

  test("rota desconhecida e painel do professor", async () => {
    expect((await montarEm("/nao/existe/mesmo")).querySelector("h1")!.textContent).toBe("Página não encontrada");
    await React.act(async () => raiz?.unmount());
    const r = await montarEm("/professor/ABCDE");
    expect(r.querySelector("h1")!.textContent).toBe("Painel do professor");
    expect(WebSocketFalso.criados.at(-1)!.url).toContain("papel=professor");
  });

  test("botão de tema: sistema → claro → escuro → sistema, no atributo do <html>", async () => {
    const r = await montarEm("/");
    const botao = r.querySelector("button[aria-label*=tema]") as HTMLButtonElement;
    const vistos: (string | undefined)[] = [];
    for (let i = 0; i < 3; i++) {
      await React.act(async () => botao.click());
      vistos.push(document.documentElement.dataset.tema);
    }
    expect(vistos).toEqual(["claro", "escuro", undefined]);
  });
});
