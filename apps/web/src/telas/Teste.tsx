/**
 * `/teste`: teste de conexão de um computador do laboratório com o servidor (seção 9.5). Mede o
 * HTTP (5 pedidos) e o WebSocket (um ping) e envia o resultado, que aparece no diagnóstico do
 * professor. Não precisa de sala nem de login.
 */
import type { RelatorioTeste } from "@simulador/compartilhado";
import { CircleCheck, CircleX } from "lucide-react";
import { type FormEvent, useState } from "react";
import { pedir } from "../cliente/api";
import { Aviso, Cabecalho } from "../componentes/base";
import { formatarNumero } from "../formato";

const CHAVE_MAQUINA = "simulador:maquina";
const AMOSTRAS_HTTP = 5;
const LIMITE_WS_MS = 5000;

function lembrada(): string {
  try {
    return localStorage.getItem(CHAVE_MAQUINA) ?? "";
  } catch {
    return "";
  }
}

export async function medirHttp(amostras = AMOSTRAS_HTTP): Promise<RelatorioTeste["http"]> {
  const tempos: number[] = [];
  for (let i = 0; i < amostras; i++) {
    const t0 = performance.now();
    const r = await pedir<object>("/api/teste/ping");
    if (!r.corpo.ok) return { ok: false, amostras: tempos.length, mediaMs: null, maxMs: null };
    tempos.push(performance.now() - t0);
  }
  const media = tempos.reduce((a, b) => a + b, 0) / tempos.length;
  return { ok: true, amostras: tempos.length, mediaMs: Math.round(media * 10) / 10, maxMs: Math.round(Math.max(...tempos) * 10) / 10 };
}

export function medirWebSocket(url: string, limiteMs = LIMITE_WS_MS): Promise<RelatorioTeste["ws"]> {
  return new Promise((resolver) => {
    let ws: WebSocket;
    const t0 = performance.now();
    const fim = (r: RelatorioTeste["ws"]) => {
      clearTimeout(timer);
      try {
        ws.close();
      } catch {}
      resolver(r);
    };
    const timer = setTimeout(() => fim({ ok: false, ms: null, erro: `sem resposta em ${limiteMs / 1000} s` }), limiteMs);
    try {
      ws = new WebSocket(url);
    } catch (e) {
      fim({ ok: false, ms: null, erro: e instanceof Error ? e.message.slice(0, 200) : "falha ao abrir" });
      return;
    }
    let inicioPing = 0;
    ws.onopen = () => {
      inicioPing = performance.now();
      ws.send(JSON.stringify({ tipo: "ping" }));
    };
    ws.onmessage = () => fim({ ok: true, ms: Math.round((performance.now() - (inicioPing || t0)) * 10) / 10 });
    ws.onerror = () => fim({ ok: false, ms: null, erro: "conexão recusada ou bloqueada (proxy ou firewall?)" });
  });
}

type Resultado = { http: RelatorioTeste["http"]; ws: RelatorioTeste["ws"]; enviado: boolean; ip: string | null };

export function TelaTeste() {
  const [maquina, setMaquina] = useState(lembrada);
  const [rodando, setRodando] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  async function testar(e: FormEvent) {
    e.preventDefault();
    try {
      localStorage.setItem(CHAVE_MAQUINA, maquina.trim());
    } catch {}
    setRodando(true);
    setResultado(null);
    const http = await medirHttp();
    const ws = await medirWebSocket(`${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}/ws?papel=teste`);
    const r = await pedir<{ ip: string }>("/api/teste", { corpo: { maquina: maquina.trim(), http, ws } satisfies RelatorioTeste });
    setResultado({ http, ws, enviado: r.corpo.ok, ip: r.corpo.ok ? r.corpo.ip : null });
    setRodando(false);
  }

  const tudoOk = resultado?.http.ok && resultado.ws.ok;
  return (
    <>
      <Cabecalho />
      <main className="conteudo estreito pilha">
        <h1>Teste de conexão</h1>
        <p className="texto-2">Verifica se este computador consegue jogar: acesso ao servidor e conexão em tempo real.</p>
        <form className="cartao pilha" onSubmit={testar}>
          <div className="campo">
            <label htmlFor="maquina">Nome ou número deste computador</label>
            <input id="maquina" required maxLength={60} placeholder="ex.: LAB2-PC07" autoComplete="off" value={maquina} onChange={(e) => setMaquina(e.target.value)} />
            <span className="pequeno texto-2">O navegador não sabe o nome da máquina: use o da etiqueta do computador.</span>
          </div>
          <button type="submit" className="botao primario" disabled={rodando || maquina.trim() === ""}>
            {rodando ? "Testando…" : "Testar"}
          </button>
        </form>
        {resultado && (
          <section className="cartao pilha" aria-label="Resultado do teste" aria-live="polite">
            {tudoOk ? <Aviso tipo="sucesso">Tudo certo: este computador pode jogar.</Aviso> : <Aviso tipo="erro">Há um problema de conexão. Avise o professor.</Aviso>}
            <ul className="lista-simples" style={{ listStyle: "none", padding: 0 }}>
              <li className="linha">
                {resultado.http.ok ? <CircleCheck aria-hidden className="positivo" size={18} /> : <CircleX aria-hidden className="negativo" size={18} />}
                Acesso ao servidor: {resultado.http.ok ? `ok (média ${formatarNumero(resultado.http.mediaMs ?? 0, 1)} ms)` : "falhou"}
              </li>
              <li className="linha">
                {resultado.ws.ok ? <CircleCheck aria-hidden className="positivo" size={18} /> : <CircleX aria-hidden className="negativo" size={18} />}
                Tempo real (WebSocket): {resultado.ws.ok ? `ok (${formatarNumero(resultado.ws.ms ?? 0, 1)} ms)` : `falhou: ${resultado.ws.erro ?? ""}`}
              </li>
            </ul>
            <p className="pequeno texto-2" style={{ margin: 0 }}>
              {resultado.enviado ? `Resultado enviado ao professor (IP deste computador: ${resultado.ip}).` : "Não foi possível enviar o resultado ao professor."}
            </p>
          </section>
        )}
      </main>
    </>
  );
}
