/**
 * Renderização geral (happy-dom, WebSocket e fetch falsos): as rotas montam sem erro, a tela
 * conectada reage ao snapshot, o roteador e o tema funcionam no navegador.
 */
import { describe, expect, test } from "bun:test";
import { prepararDom } from "./dom";

const dom = prepararDom();

const relogio = (tick: number, status: string) => ({ tick, ticksPorMes: 30, status, mes: 1, dia: tick, motivoPausa: null });

describe("renderização", () => {
  test("entrada: formulário do código e link do professor", async () => {
    const r = await dom.montar("/?codigo=abcde");
    expect(r.querySelector("h1")!.textContent).toBe("Entrar na sala");
    expect((r.querySelector("#codigo") as HTMLInputElement).value).toBe("ABCDE");
    expect(r.querySelector("label[for=codigo]")!.textContent).toBe("Código da sala");
    expect(r.textContent).toContain("Simulador de Mercado");
  });

  test("navegar pelo link troca a tela sem recarregar; voltar funciona", async () => {
    const r = await dom.montar("/");
    const link = [...r.querySelectorAll("a")].find((a) => a.textContent === "Criar ou abrir uma sala")!;
    await dom.agir(() => link.click());
    expect(window.location.pathname).toBe("/professor");
    expect(r.querySelector("h1")!.textContent).toBe("Professor");
    await dom.agir(async () => {
      window.history.back();
      await new Promise((ok) => setTimeout(ok, 20));
    });
    expect(r.querySelector("h1")!.textContent).toBe("Entrar na sala");
  });

  test("tela do aluno: conecta como aluno e mostra o relógio do snapshot", async () => {
    const r = await dom.montar("/s/ABCDE");
    expect(r.querySelector("h1")!.textContent).toBe("Sua empresa");
    expect(r.textContent).toContain("Conectando…");
    expect(dom.ws().url).toBe("ws://servidor:47800/ws?codigo=ABCDE&papel=aluno");
    await dom.servidorEnvia({ tipo: "snapshot", papel: "aluno", visao: { relogio: relogio(3, "rodando") } });
    expect(r.textContent).toContain("Conectado");
    expect(r.textContent).toContain("Ano 1, jan, dia 3 · Rodando");
  });

  test("telão: conecta com o token do link; fechamento definitivo mostra o motivo", async () => {
    const r = await dom.montar("/telao/ABCDE?t=tok-123");
    const ws = dom.ws();
    expect(ws.url).toBe("ws://servidor:47800/ws?codigo=ABCDE&papel=telao&t=tok-123");
    await dom.agir(() => ws.onclose?.({ code: 4003, reason: "" }));
    expect(r.textContent).toContain("Desconectado");
    expect(r.querySelector("[role=alert]")!.textContent).toContain("revogado");
  });

  test("rota desconhecida", async () => {
    expect((await dom.montar("/nao/existe/mesmo")).querySelector("h1")!.textContent).toBe("Página não encontrada");
  });

  test("botão de tema: sistema → claro → escuro → sistema, no atributo do <html>", async () => {
    const r = await dom.montar("/");
    const botao = r.querySelector("button[aria-label*=tema]") as HTMLButtonElement;
    const vistos: (string | undefined)[] = [];
    for (let i = 0; i < 3; i++) {
      await dom.agir(() => botao.click());
      vistos.push(document.documentElement.dataset.tema);
    }
    expect(vistos).toEqual(["claro", "escuro", undefined]);
  });
});
