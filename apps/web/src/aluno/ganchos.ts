/**
 * Ganchos da tela de jogo: avisos acumulados, número animado, histórico semanal e confirmação em
 * dois cliques que sobrevive à virada do dia.
 */
import type { Aviso as AvisoDoMotor, HistoricoDaSala } from "@simulador/compartilhado";
import { useCallback, useEffect, useRef, useState } from "react";
import { pedir } from "../cliente/api";

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

const semMovimento = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Valor que transita suavemente até o alvo (450 ms). A fração fica presa em [0, 1] (o primeiro
 * quadro pode chegar com carimbo anterior ao início) e o valor final é garantido mesmo que o
 * navegador não entregue o último quadro (aba em segundo plano).
 */
export function useNumeroAnimado(alvo: number): number {
  const [valor, setValor] = useState(alvo);
  const atual = useRef(alvo);
  useEffect(() => {
    const de = atual.current;
    if (de === alvo || semMovimento() || typeof requestAnimationFrame !== "function" || (typeof document !== "undefined" && document.hidden)) {
      atual.current = alvo;
      setValor(alvo);
      return;
    }
    const t0 = performance.now();
    const duracao = 450;
    let quadro = 0;
    const passo = (t: number) => {
      const k = Math.min(1, Math.max(0, (t - t0) / duracao));
      const v = de + (alvo - de) * (1 - (1 - k) ** 3);
      atual.current = v;
      setValor(v);
      if (k < 1) quadro = requestAnimationFrame(passo);
    };
    quadro = requestAnimationFrame(passo);
    const garantia = setTimeout(() => {
      atual.current = alvo;
      setValor(alvo);
    }, duracao + 100);
    return () => {
      cancelAnimationFrame(quadro);
      clearTimeout(garantia);
      atual.current = alvo;
    };
  }, [alvo]);
  return valor;
}

const VAZIO: HistoricoDaSala = { ok: true, semanas: [], mercado: [] };

/** Histórico semanal (próprio + participação pública do mercado), recarregado a cada semana fechada. */
export function useHistorico(codigo: string, semana: number): HistoricoDaSala {
  const [h, setH] = useState<HistoricoDaSala>(VAZIO);
  useEffect(() => {
    let vivo = true;
    void pedir<HistoricoDaSala>(`/api/salas/${codigo}/historico`).then((r) => {
      if (vivo && r.corpo.ok) setH({ ok: true, semanas: r.corpo.semanas ?? [], mercado: r.corpo.mercado ?? [] });
    });
    return () => {
      vivo = false;
    };
  }, [codigo, semana]);
  return h;
}

export const PRAZO_DA_CONFIRMACAO_MS = 6000;

/**
 * Confirmação em dois cliques: o 1º clique arma (o botão vira a pergunta), o 2º executa. Desarma
 * sozinha em 6 s, com Esc ou com um clique fora do botão. O estado é do React, então a virada do
 * dia (que só atualiza textos) não desarma.
 */
export function useConfirmacao(): { armado: boolean; ref: (el: HTMLElement | null) => void; clicar: (acao: () => void) => void } {
  const [armado, setArmado] = useState(false);
  const el = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!armado) return;
    const prazo = setTimeout(() => setArmado(false), PRAZO_DA_CONFIRMACAO_MS);
    const fora = (e: Event) => {
      if (!el.current?.contains(e.target as Node)) setArmado(false);
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") setArmado(false);
    };
    document.addEventListener("pointerdown", fora, true);
    document.addEventListener("keydown", tecla, true);
    return () => {
      clearTimeout(prazo);
      document.removeEventListener("pointerdown", fora, true);
      document.removeEventListener("keydown", tecla, true);
    };
  }, [armado]);
  const clicar = useCallback(
    (acao: () => void) => {
      if (armado) {
        setArmado(false);
        acao();
      } else setArmado(true);
    },
    [armado],
  );
  return { armado, ref: (x) => (el.current = x), clicar };
}
