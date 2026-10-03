/**
 * Controle do Edge sem janela pelo protocolo de depuração (CDP): navegar, clicar, digitar, medir e fotografar.
 * Só o necessário para a conferência da tela; nada de dependências externas.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";

export const dorme = (ms: number) => new Promise((r) => setTimeout(r, ms));

const CAMINHOS_DO_EDGE = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];

/** Executável do Edge: a variável `EDGE`, ou os dois lugares de instalação padrão do Windows. */
export function localizarEdge(existe: (caminho: string) => boolean, ambiente: Record<string, string | undefined> = process.env): string | null {
  if (ambiente.EDGE && existe(ambiente.EDGE)) return ambiente.EDGE;
  return CAMINHOS_DO_EDGE.find(existe) ?? null;
}

export interface Medidas {
  janela: [number, number];
  documento: [number, number];
  /** Contêineres cujo conteúdo passa do tamanho (algo cortado ou rolável). */
  cortes: string[];
  cartoesForaDaColuna: string[];
  painelCortado: string[];
}

/** Expressão avaliada na página: mede estouros de altura e largura nos contêineres da tela de jogo. */
export const EXPRESSAO_DE_MEDIDAS = `(() => {
  const q = (s) => document.querySelector(s);
  const sels = [".j-app", ".j-principal", ".j-palco-cadeia", ".j-colunas", ".j-cadeia-lateral", ".j-painel-cadeia", ".j-hud", ".j-rodape", ".j-console", ".j-paineis"];
  const cortes = [];
  for (const s of sels) { const e = q(s); if (e && (e.scrollHeight > e.clientHeight + 1 || e.scrollWidth > e.clientWidth + 1)) cortes.push(s + " sh=" + e.scrollHeight + "/" + e.clientHeight + " sw=" + e.scrollWidth + "/" + e.clientWidth); }
  const col = q(".j-colunas"); const cb = col ? col.getBoundingClientRect().bottom : 0;
  const fora = [...document.querySelectorAll(".j-col > *")].filter((c) => c.getBoundingClientRect().bottom > cb + 1).map((c) => c.getAttribute("data-instalacao") || c.className);
  const painel = q(".j-painel-cadeia"); const pb = painel ? painel.getBoundingClientRect().bottom : 0;
  const filhoFora = painel ? [...painel.children].filter((c) => c.getBoundingClientRect().bottom > pb + 1).map((c) => c.className || c.tagName) : [];
  const de = document.documentElement;
  return { janela: [innerWidth, innerHeight], documento: [de.scrollWidth, de.scrollHeight], cortes, cartoesForaDaColuna: fora, painelCortado: filhoFora };
})()`;

/** A medida é ruim se o documento passa da janela ou algo está cortado. */
export function medidaRuim(m: Medidas): boolean {
  return m.documento[0] > m.janela[0] || m.documento[1] > m.janela[1] || m.cortes.length > 0 || m.cartoesForaDaColuna.length > 0 || m.painelCortado.length > 0;
}

export class Pagina {
  private id = 0;
  private pendentes = new Map<number, (r: { error?: { message: string }; result?: any }) => void>();

  constructor(private ws: WebSocket, private pastaDeFotos: string) {
    ws.onmessage = (e) => {
      const m = JSON.parse(String(e.data));
      if (m.id && this.pendentes.has(m.id)) this.pendentes.get(m.id)!(m);
    };
  }

  send(method: string, params: object = {}): Promise<any> {
    const id = ++this.id;
    return new Promise((ok, erro) => {
      this.pendentes.set(id, (m) => (m.error ? erro(new Error(`${method}: ${m.error.message}`)) : ok(m.result)));
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async ev<T = any>(expressao: string): Promise<T> {
    const r = await this.send("Runtime.evaluate", { expression: expressao, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(`ev: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
    return r.result.value;
  }

  async navegar(url: string): Promise<void> {
    await this.send("Page.navigate", { url });
  }

  async espera(seletor: string, ms = 8000): Promise<void> {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      if (await this.ev<boolean>(`!!document.querySelector(${JSON.stringify(seletor)})`)) return;
      await dorme(100);
    }
    throw new Error(`não apareceu em ${ms} ms: ${seletor}`);
  }

  private async centro(seletor: string) {
    const r = await this.ev<{ x: number; y: number } | null>(`(() => { const e = document.querySelector(${JSON.stringify(seletor)}); if (!e) return null; e.scrollIntoView({block:'nearest'}); const r = e.getBoundingClientRect(); return { x: r.left + r.width/2, y: r.top + r.height/2 }; })()`);
    if (!r) throw new Error(`sem elemento: ${seletor}`);
    return r;
  }

  async clica(seletor: string): Promise<void> {
    const { x, y } = await this.centro(seletor);
    await this.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
    await this.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
    await this.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
    await dorme(150);
  }

  /** Clica no primeiro elemento do seletor cujo texto casa com a expressão regular. */
  async clicaTexto(seletor: string, regex: string): Promise<void> {
    const achou = await this.ev<boolean>(`(() => { const e = [...document.querySelectorAll(${JSON.stringify(seletor)})].find((x) => new RegExp(${JSON.stringify(regex)}).test(x.textContent)); if (!e) return false; e.setAttribute('data-e2e', 'alvo'); return true; })()`);
    if (!achou) throw new Error(`sem ${seletor} com /${regex}/`);
    await this.clica('[data-e2e="alvo"]');
    await this.ev(`document.querySelector('[data-e2e=alvo]')?.removeAttribute('data-e2e')`);
  }

  async digita(seletor: string, texto: string): Promise<void> {
    await this.ev(`(() => { const e = document.querySelector(${JSON.stringify(seletor)}); e.focus(); e.select(); })()`);
    await this.send("Input.insertText", { text: texto });
    await dorme(120);
  }

  async tecla(key: string): Promise<void> {
    await this.send("Input.dispatchKeyEvent", { type: "keyDown", key, code: key, text: key.length === 1 ? key : undefined });
    await this.send("Input.dispatchKeyEvent", { type: "keyUp", key, code: key });
    await dorme(150);
  }

  async tamanho(largura: number, altura: number): Promise<void> {
    await this.send("Emulation.setDeviceMetricsOverride", { width: largura, height: altura, deviceScaleFactor: 1, mobile: false });
    await dorme(250);
  }

  async foto(nome: string): Promise<void> {
    const r = await this.send("Page.captureScreenshot", { format: "png" });
    writeFileSync(join(this.pastaDeFotos, `${nome}.png`), Buffer.from(r.data, "base64"));
  }

  medidas(): Promise<Medidas> {
    return this.ev<Medidas>(EXPRESSAO_DE_MEDIDAS);
  }

  async retangulos(seletor: string): Promise<number[][]> {
    return this.ev(`[...document.querySelectorAll(${JSON.stringify(seletor)})].map((e) => { const r = e.getBoundingClientRect(); return [Math.round(r.left*10)/10, Math.round(r.top*10)/10, Math.round(r.width*10)/10, Math.round(r.height*10)/10]; })`);
  }
}

/** Conecta ao primeiro alvo de página do Edge que escuta na porta de depuração. */
export async function conectar(porta: number, pastaDeFotos: string, tentativas = 100): Promise<Pagina> {
  for (let i = 0; i < tentativas; i++) {
    try {
      const alvos = (await (await fetch(`http://127.0.0.1:${porta}/json`)).json()) as { type: string; webSocketDebuggerUrl: string }[];
      const alvo = alvos.find((a) => a.type === "page");
      if (alvo) {
        const ws = new WebSocket(alvo.webSocketDebuggerUrl);
        await new Promise((ok, erro) => {
          ws.onopen = ok;
          ws.onerror = erro;
        });
        const pagina = new Pagina(ws, pastaDeFotos);
        await pagina.send("Page.enable");
        await pagina.send("Runtime.enable");
        return pagina;
      }
    } catch {}
    await dorme(150);
  }
  throw new Error("o Edge não respondeu na porta de depuração");
}
