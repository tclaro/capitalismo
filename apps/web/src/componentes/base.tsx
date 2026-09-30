/**
 * Componentes reutilizáveis de todas as telas (seção 8.1). Estilos em tema/base.css.
 */
import { descreverData, type EstadoRelogio, PALETA_EQUIPES } from "@simulador/compartilhado";
import { ChartNoAxesColumnIncreasing, CircleAlert, CircleCheck, Loader, Monitor, Moon, Sun, WifiOff } from "lucide-react";
import { type ReactNode, useState } from "react";
import type { Instantaneo } from "../cliente/conexao";
import { navegar } from "../roteador";
import { aplicarTema, type EscolhaDeTema, proximoTema, temaSalvo } from "../tema/tema";

export const NOME_DO_PRODUTO = "Simulador de Mercado";

export function Cabecalho({ children }: { children?: ReactNode }) {
  return (
    <header className="cabecalho">
      <a
        className="marca"
        href="/"
        onClick={(e) => {
          e.preventDefault();
          navegar("/");
        }}
      >
        <ChartNoAxesColumnIncreasing aria-hidden size={22} />
        {NOME_DO_PRODUTO}
      </a>
      <span className="espaco" />
      {children}
      <BotaoTema />
    </header>
  );
}

const ROTULO_TEMA: Record<EscolhaDeTema, string> = { sistema: "Tema do sistema", claro: "Tema claro", escuro: "Tema escuro" };

export function BotaoTema() {
  const [tema, setTema] = useState(temaSalvo);
  const Icone = tema === "claro" ? Sun : tema === "escuro" ? Moon : Monitor;
  return (
    <button
      type="button"
      className="botao"
      title={`${ROTULO_TEMA[tema]} (clique para trocar)`}
      aria-label={`${ROTULO_TEMA[tema]}; trocar tema`}
      onClick={() => {
        const novo = proximoTema(tema);
        aplicarTema(novo);
        setTema(novo);
      }}
    >
      <Icone aria-hidden size={18} />
    </button>
  );
}

export function Aviso({ tipo, children }: { tipo: "erro" | "alerta" | "sucesso"; children: ReactNode }) {
  const Icone = tipo === "sucesso" ? CircleCheck : CircleAlert;
  return (
    <div className={`aviso ${tipo}`} role={tipo === "erro" ? "alert" : "status"}>
      <Icone aria-hidden size={20} />
      <div>{children}</div>
    </div>
  );
}

const TEXTO_CONEXAO = { conectando: "Conectando…", aberta: "Conectado", reconectando: "Reconectando…", encerrada: "Desconectado" } as const;

/** Estado da conexão com ícone e texto (nunca só cor). */
export function IndicadorConexao({ instantaneo }: { instantaneo: Instantaneo }) {
  const { estado, falhas } = instantaneo;
  const Icone = estado === "aberta" ? CircleCheck : estado === "encerrada" ? WifiOff : Loader;
  return (
    <span className={`conexao ${estado}`} role="status" aria-live="polite">
      <Icone aria-hidden size={16} />
      {TEXTO_CONEXAO[estado]}
      {estado === "reconectando" && falhas > 2 ? ` (tentativa ${falhas})` : ""}
    </span>
  );
}

const TEXTO_STATUS = { preparacao: "Em preparação", rodando: "Rodando", pausada: "Pausada", encerrada: "Encerrada" } as const;

/** Resumo do relógio (a barra completa vem na tela do aluno). */
export function ResumoRelogio({ relogio }: { relogio: EstadoRelogio }) {
  return (
    <p className="texto-2">
      {descreverData(relogio.tick, relogio.ticksPorMes)} · {TEXTO_STATUS[relogio.status]}
    </p>
  );
}

export function Carregando({ texto = "Carregando…" }: { texto?: string }) {
  return (
    <p className="conexao" role="status">
      <Loader aria-hidden size={16} /> {texto}
    </p>
  );
}

/** Cartão de seção com título. */
export function Secao({ titulo, icone, children, acoes }: { titulo: string; icone?: ReactNode; children: ReactNode; acoes?: ReactNode }) {
  return (
    <section className="cartao pilha secao" aria-label={titulo}>
      <div className="linha">
        <h2 style={{ margin: 0, flex: 1 }}>
          {icone}
          {titulo}
        </h2>
        {acoes}
      </div>
      {children}
    </section>
  );
}

/** Amostra da cor + nome da equipe (a cor nunca aparece sozinha). */
export function CorEquipe({ cor, nome }: { cor: string | null; nome: string }) {
  const hex = PALETA_EQUIPES.find((c) => c.id === cor)?.hex ?? "transparent";
  return (
    <span className="cor-equipe">
      <span className="amostra" style={{ background: hex }} aria-hidden />
      {nome}
    </span>
  );
}

/**
 * Botão de ação irreversível com confirmação na própria página (dois cliques): o primeiro mostra
 * "Confirmar" e "Cancelar"; nada acontece sem o segundo.
 */
export function BotaoConfirmar({ children, confirmar, aoConfirmar, desabilitado = false, perigo = false }: { children: ReactNode; confirmar: string; aoConfirmar: () => void; desabilitado?: boolean; perigo?: boolean }) {
  const [perguntando, setPerguntando] = useState(false);
  if (!perguntando) {
    return (
      <button type="button" className="botao" disabled={desabilitado} onClick={() => setPerguntando(true)}>
        {children}
      </button>
    );
  }
  return (
    <span className="linha" role="group" aria-label={confirmar}>
      <span className={perigo ? "negativo" : ""}>{confirmar}</span>
      <button
        type="button"
        className="botao primario"
        onClick={() => {
          setPerguntando(false);
          aoConfirmar();
        }}
      >
        Confirmar
      </button>
      <button type="button" className="botao" onClick={() => setPerguntando(false)}>
        Cancelar
      </button>
    </span>
  );
}
