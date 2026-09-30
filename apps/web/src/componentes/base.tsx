/**
 * Componentes reutilizáveis de todas as telas (seção 8.1). Estilos em tema/base.css.
 */
import { descreverData, type EstadoRelogio } from "@simulador/compartilhado";
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
