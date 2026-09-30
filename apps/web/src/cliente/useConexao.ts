/**
 * Liga a `ConexaoSala` ao React. A conexão é criada dentro do efeito (e não na renderização), para
 * o modo estrito do React em desenvolvimento, que monta e desmonta duas vezes, não deixar uma
 * conexão encerrada no lugar.
 */
import type { Papel, Visao } from "@simulador/compartilhado";
import { useEffect, useState, useSyncExternalStore } from "react";
import { api } from "./api";
import { type Armazenamento, type ComandoPendente, ConexaoSala, type Instantaneo, type SocketLike, urlDoWebSocket } from "./conexao";

/** Comandos pendentes no `localStorage`, por sala e papel (sobrevivem a recarregar a página). */
export function armazenamentoLocal(chave: string): Armazenamento {
  return {
    ler() {
      try {
        const v: unknown = JSON.parse(localStorage.getItem(chave) ?? "[]");
        return Array.isArray(v) ? (v.filter((x) => typeof x?.idComando === "string" && typeof x?.tipo === "string") as ComandoPendente[]) : [];
      } catch {
        return [];
      }
    },
    gravar(pendentes) {
      try {
        if (pendentes.length === 0) localStorage.removeItem(chave);
        else localStorage.setItem(chave, JSON.stringify(pendentes));
      } catch {
        // Sem armazenamento: os pendentes valem só enquanto a página estiver aberta.
      }
    },
  };
}

function verificador(codigo: string, papel: Papel, token: string | null): () => Promise<boolean> {
  return async () => {
    const r = papel === "telao" ? await api.conferirTelao(codigo, token ?? "") : await api.sessao(codigo);
    // Sem resposta do servidor: não dá para saber; continua tentando.
    if (r.status === 0 || r.status >= 500) throw new Error("servidor inacessível");
    if (!r.corpo.ok) return false;
    if (papel === "telao") return true;
    const s = r.corpo as unknown as { professor: boolean; aluno: unknown };
    return papel === "professor" ? s.professor : s.aluno !== null;
  };
}

const INICIAL: Instantaneo = { estado: "conectando", falhas: 0, papel: null, visao: null, motivo: null, erro: null, pendentes: 0 };
const nada = () => () => {};

export function useConexao<V extends Visao>(codigo: string, papel: Papel, token: string | null = null): { instantaneo: Instantaneo<V>; conexao: ConexaoSala<V> | null } {
  const [conexao, setConexao] = useState<ConexaoSala<V> | null>(null);
  useEffect(() => {
    const c = new ConexaoSala<V>({
      url: urlDoWebSocket(window.location, { codigo, papel, token }),
      criarSocket: (url) => new WebSocket(url) as unknown as SocketLike,
      verificarAcesso: verificador(codigo, papel, token),
      // O telão não envia comandos.
      ...(papel === "telao" ? {} : { armazenamento: armazenamentoLocal(`simulador:pendentes:${codigo}:${papel}`) }),
    });
    c.iniciar();
    setConexao(c);
    return () => c.encerrar();
  }, [codigo, papel, token]);
  const instantaneo = useSyncExternalStore(conexao?.assinar ?? nada, conexao?.instantaneo ?? (() => INICIAL as Instantaneo<V>));
  return { instantaneo, conexao };
}
