/**
 * Avisos flutuantes da tela de jogo. Poucos de propósito: produto esgotado, 1º lugar do ranking e
 * "desfazer" de uma decisão. Os demais acontecimentos vão só para a lista de avisos.
 */
import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react";

export interface Notificacao {
  id: number;
  texto: string;
  acao?: { rotulo: string; executar: () => void };
}

type Notificar = (texto: string, acao?: Notificacao["acao"]) => void;

const Contexto = createContext<Notificar>(() => {});

export const MAXIMO_DE_NOTIFICACOES = 3;
const DURACAO_MS = 3500;
const DURACAO_COM_ACAO_MS = 6000;

export function ProvedorDeNotificacoes({ children }: { children: ReactNode }) {
  const [lista, setLista] = useState<Notificacao[]>([]);
  const proximo = useRef(1);
  const prazos = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const remover = useCallback((id: number) => {
    clearTimeout(prazos.current.get(id));
    prazos.current.delete(id);
    setLista((l) => l.filter((n) => n.id !== id));
  }, []);
  const notificar = useCallback<Notificar>(
    (texto, acao) => {
      const id = proximo.current++;
      setLista((l) => [...l, { id, texto, ...(acao ? { acao } : {}) }].slice(-MAXIMO_DE_NOTIFICACOES));
      prazos.current.set(
        id,
        setTimeout(() => remover(id), acao ? DURACAO_COM_ACAO_MS : DURACAO_MS),
      );
    },
    [remover],
  );
  useEffect(() => {
    const p = prazos.current;
    return () => p.forEach((t) => clearTimeout(t));
  }, []);
  return (
    <Contexto.Provider value={notificar}>
      {children}
      <div className="j-notificacoes" aria-live="polite">
        {lista.map((n) => (
          <div key={n.id} className="j-notificacao">
            <span>{n.texto}</span>
            {n.acao && (
              <button
                type="button"
                onClick={() => {
                  remover(n.id);
                  n.acao!.executar();
                }}
              >
                {n.acao.rotulo}
              </button>
            )}
          </div>
        ))}
      </div>
    </Contexto.Provider>
  );
}

export const useNotificar = () => useContext(Contexto);
