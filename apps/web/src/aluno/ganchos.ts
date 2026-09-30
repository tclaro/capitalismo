/**
 * Ganchos da tela do aluno: rascunho de decisões guardado no navegador e histórico de avisos.
 */
import type { Aviso as AvisoDoMotor } from "@simulador/compartilhado";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CampoProduto, Rascunho } from "./regras";

function ler(chave: string): Rascunho {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(chave) ?? "{}");
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Rascunho) : {};
  } catch {
    return {};
  }
}

/**
 * Rascunho das decisões (o que foi digitado e ainda não enviado), no `localStorage` por sala e
 * equipe: sobrevive a recarregar a página e à queda da rede (seção 8).
 */
export function useRascunho(chave: string) {
  const [rascunho, setRascunho] = useState<Rascunho>(() => ler(chave));
  useEffect(() => setRascunho(ler(chave)), [chave]);
  const gravar = useCallback(
    (r: Rascunho) => {
      setRascunho(r);
      try {
        if (Object.keys(r).length === 0) localStorage.removeItem(chave);
        else localStorage.setItem(chave, JSON.stringify(r));
      } catch {}
    },
    [chave],
  );
  const mudar = useCallback(
    (produto: string, campo: CampoProduto | "vender", valor: string | boolean) => {
      const atual = ler(chave);
      gravar({ ...atual, [produto]: { ...atual[produto], [campo]: valor } });
    },
    [chave, gravar],
  );
  const limpar = useCallback(() => gravar({}), [gravar]);
  return { rascunho, mudar, limpar };
}

export interface AvisoDatado {
  tick: number;
  aviso: AvisoDoMotor;
}

/** Avisos chegam só no tick em que acontecem: a tela guarda os últimos para o aluno rever. */
export function useAvisosAcumulados(tick: number | undefined, avisos: readonly AvisoDoMotor[] | undefined, limite = 50): AvisoDatado[] {
  const [lista, setLista] = useState<AvisoDatado[]>([]);
  const visto = useRef(-1);
  useEffect(() => {
    if (tick === undefined || !avisos || tick <= visto.current) return;
    visto.current = tick;
    if (avisos.length === 0) return;
    setLista((l) => [...avisos.map((aviso) => ({ tick, aviso })), ...l].slice(0, limite));
  }, [tick, avisos, limite]);
  return lista;
}
