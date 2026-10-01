/**
 * Campo de decisão com envio automático ("se mudou, mudou"): envia sozinho depois de uma pausa na
 * digitação (700 ms), ao sair do campo ou com Enter; Esc desfaz o que foi digitado; −/+ e as setas
 * mudam pelo passo. O estado aparece embaixo: digitando, enviando, enviado (vale amanhã), valendo,
 * erro (do campo ou do servidor) ou travado na pausa.
 *
 * Depois de enviado, o valor digitado continua na tela até a visão do servidor trazer o novo valor
 * (para não piscar o valor antigo entre a resposta e a atualização).
 */
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Ajuda } from "../componentes/interativos";

export type ResultadoDoEnvio = true | { motivo: string };

export interface PropsCampo {
  id: string;
  rotulo: string;
  ajuda: ReactNode;
  /** "R$" à esquerda do valor (dinheiro). */
  prefixo?: string;
  sufixo: string;
  /** Valor que vale no próximo dia (vigente + pendentes), já formatado para o campo. */
  efetivo: string;
  /** Valor vigente hoje, formatado para leitura ("antes: ..."), quando há mudança pendente. */
  antes: string | null;
  pendente: boolean;
  desabilitado: boolean;
  /** Texto do estado "valendo" (ex.: "fora de venda" no preço vazio). */
  textoValendo?: string;
  /** Mensagem externa (ex.: "Digite o preço para começar a vender"). */
  mensagem?: string | null;
  inputMode: "decimal" | "numeric";
  /** Novo texto a partir do atual, um passo para cima (+1) ou para baixo (−1). */
  passo: (texto: string, sinal: 1 | -1) => string;
  /** Envia o texto; `null` = nada a mudar (igual ao que vale). Erro de validação vem como `{ motivo }`. */
  enviar: (texto: string) => Promise<ResultadoDoEnvio | null>;
}

const ESPERA_DIGITANDO_MS = 700;
const ESPERA_PASSO_MS = 600;

export function CampoDecisao(p: PropsCampo) {
  const [texto, setTexto] = useState<string | null>(null);
  const [estado, setEstado] = useState<{ tipo: "ocioso" } | { tipo: "enviando" } | { tipo: "erro"; motivo: string }>({ tipo: "ocioso" });
  const textoAtual = useRef<string | null>(null);
  const espera = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const aguardando = useRef<string | null>(null);
  // O envio roda depois de um temporizador: lê sempre o valor mais recente das props e do estado.
  const enviarRef = useRef(p.enviar);
  enviarRef.current = p.enviar;
  const efetivoRef = useRef(p.efetivo);
  efetivoRef.current = p.efetivo;
  const enviandoRef = useRef(false);

  const definirTexto = (t: string | null) => {
    textoAtual.current = t;
    setTexto(t);
  };

  // Enviado e aceito: solta o texto quando a visão trouxer o mesmo valor (ou desistir em 3 s).
  useEffect(() => {
    if (aguardando.current !== null && p.efetivo === aguardando.current) {
      aguardando.current = null;
      if (textoAtual.current !== null && textoAtual.current === p.efetivo) definirTexto(null);
    }
  }, [p.efetivo]);

  useEffect(() => () => clearTimeout(espera.current), []);

  async function confirmar() {
    clearTimeout(espera.current);
    const t = textoAtual.current;
    if (t === null || enviandoRef.current) return;
    if (t.trim() === efetivoRef.current.trim()) {
      definirTexto(null);
      setEstado({ tipo: "ocioso" });
      return;
    }
    setEstado({ tipo: "enviando" });
    enviandoRef.current = true;
    const r = await enviarRef.current(t).finally(() => (enviandoRef.current = false));
    if (r === null) {
      if (textoAtual.current === t) definirTexto(null);
      setEstado({ tipo: "ocioso" });
    } else if (r === true) {
      setEstado({ tipo: "ocioso" });
      aguardando.current = t;
      setTimeout(() => {
        if (aguardando.current === t) {
          aguardando.current = null;
          if (textoAtual.current === t) definirTexto(null);
        }
      }, 3000);
    } else setEstado({ tipo: "erro", motivo: r.motivo });
  }

  const agendar = (ms: number) => {
    clearTimeout(espera.current);
    espera.current = setTimeout(() => void confirmar(), ms);
  };

  const mudar = (t: string, ms: number) => {
    definirTexto(t);
    if (estado.tipo === "erro") setEstado({ tipo: "ocioso" });
    agendar(ms);
  };

  const darPasso = (sinal: 1 | -1) => mudar(p.passo(textoAtual.current ?? p.efetivo, sinal), ESPERA_PASSO_MS);

  const valor = texto ?? p.efetivo;
  const digitando = texto !== null && aguardando.current === null && estado.tipo !== "erro";
  let classe = "";
  let status: { classe: string; texto: string };
  if (estado.tipo === "erro") status = { classe: "erro", texto: estado.motivo };
  else if (p.mensagem) status = { classe: "erro", texto: p.mensagem };
  else if (estado.tipo === "enviando") status = { classe: "enviando", texto: "enviando…" };
  else if (digitando) status = { classe: "enviando", texto: "…" };
  else if (p.pendente || aguardando.current !== null) status = { classe: "enviado", texto: "✓ enviado · vale a partir de amanhã" };
  else if (p.desabilitado) status = { classe: "", texto: "travado na pausa" };
  else status = { classe: "valendo", texto: p.textoValendo ?? "✓ valendo" };
  if (estado.tipo === "erro" || p.mensagem) classe = " erro";
  else if (p.pendente || texto !== null) classe = " pendente";

  return (
    <div className={`j-campo${classe}${p.desabilitado ? " bloqueado" : ""}`}>
      <label htmlFor={p.id}>
        {p.rotulo} <Ajuda titulo={p.rotulo}>{p.ajuda}</Ajuda>
      </label>
      <div className="j-passo">
        <button type="button" tabIndex={-1} aria-label={`Diminuir ${p.rotulo.toLowerCase()}`} disabled={p.desabilitado} onClick={() => darPasso(-1)}>
          −
        </button>
        <span className="j-entrada">
          {p.prefixo && <span>{p.prefixo}</span>}
          <input
            id={p.id}
            inputMode={p.inputMode}
            autoComplete="off"
            value={valor}
            disabled={p.desabilitado}
            aria-invalid={estado.tipo === "erro" ? true : undefined}
            aria-describedby={`${p.id}-estado`}
            onChange={(e) => mudar(e.target.value, ESPERA_DIGITANDO_MS)}
            onBlur={() => void confirmar()}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void confirmar();
              } else if (e.key === "Escape") {
                e.stopPropagation();
                clearTimeout(espera.current);
                definirTexto(null);
                setEstado({ tipo: "ocioso" });
                e.currentTarget.blur();
              } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                e.preventDefault();
                darPasso(e.key === "ArrowUp" ? 1 : -1);
              }
            }}
          />
          <span>{p.sufixo}</span>
        </span>
        <button type="button" tabIndex={-1} aria-label={`Aumentar ${p.rotulo.toLowerCase()}`} disabled={p.desabilitado} onClick={() => darPasso(1)}>
          +
        </button>
      </div>
      <div className="j-estado-campo" id={`${p.id}-estado`}>
        <span className={`st ${status.classe}`} role={status.classe === "erro" ? "alert" : undefined}>
          {status.texto}
        </span>
        <span>{p.pendente && p.antes !== null ? `antes: ${p.antes}` : ""}</span>
      </div>
    </div>
  );
}
