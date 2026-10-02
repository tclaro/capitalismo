/**
 * Visão da cadeia (substitui o console por produto quando o módulo está ativo): o palco com as
 * instalações à esquerda e, ao lado, o painel de decisões da instalação escolhida ou o atacado.
 * Atalhos: 1–9 escolhem a instalação, I e A alternam as abas.
 */
import type { VisaoAluno } from "@simulador/compartilhado";
import { useEffect, useRef, useState } from "react";
import type { Comandar } from "../Console";
import { PainelDoAtacado } from "./Atacado";
import { ID_LOJA, ID_NOVA_FABRICA, ID_NOVA_FAZENDA, type Fazenda, instalacaoValida, instalacoes } from "./modelo";
import { PalcoDaCadeia } from "./Palco";
import { PainelDaFabrica, PainelDaFazenda, PainelDaLoja, PainelNovaFabrica, PainelNovaFazenda } from "./Paineis";
import { TrocaDeAtividade } from "./TrocaDeAtividade";

export type AbaDaCadeia = "instalacao" | "atacado";

interface Props {
  v: VisaoAluno;
  comandar: Comandar;
  selecionada: string;
  aoSelecionar: (id: string) => void;
  aba: AbaDaCadeia;
  aoMudarAba: (a: AbaDaCadeia) => void;
  aoIrParaProdutos: (produto?: string) => void;
  /** Há uma janela do jogo aberta por cima (os atalhos ficam parados). */
  bloqueada?: boolean;
}

export function VistaDaCadeia({ v, comandar, selecionada, aoSelecionar, aba, aoMudarAba, aoIrParaProdutos, bloqueada = false }: Props) {
  const c = v.visao.cadeia!;
  const id = instalacaoValida(v, selecionada);
  const [trocando, setTrocando] = useState<string | null>(null);
  const fazendaDaTroca = c.fazendas.find((f) => f.id === trocando) ?? null;

  const atalhos = useRef<(e: KeyboardEvent) => void>(() => {});
  atalhos.current = (e) => {
    if (bloqueada || trocando !== null || e.ctrlKey || e.metaKey || e.altKey) return;
    const alvo = e.target as Element | null;
    if (alvo instanceof Element && alvo.matches("input, textarea, select")) return;
    const lista = instalacoes(v);
    const n = Number(e.key);
    if (Number.isInteger(n) && n >= 1 && n <= Math.min(9, lista.length)) {
      aoSelecionar(lista[n - 1]!.id);
      aoMudarAba("instalacao");
      e.preventDefault();
    } else if (e.key === "i" || e.key === "I") aoMudarAba("instalacao");
    else if (e.key === "a" || e.key === "A") aoMudarAba("atacado");
  };
  useEffect(() => {
    const ouvir = (e: KeyboardEvent) => atalhos.current(e);
    document.addEventListener("keydown", ouvir);
    return () => document.removeEventListener("keydown", ouvir);
  }, []);

  const escolher = (x: string) => {
    aoSelecionar(x);
    aoMudarAba("instalacao");
  };

  const fazenda: Fazenda | undefined = id.startsWith("faz:") ? c.fazendas.find((f) => `faz:${f.id}` === id) : undefined;
  const produtoDaFabrica = id.startsWith("fab:") ? id.slice(4) : null;

  return (
    <>
      <section className="j-cadeia-palco" aria-label="Cadeia produtiva">
        <PalcoDaCadeia v={v} selecionada={id} aoSelecionar={escolher} />
      </section>
      <section className="j-cadeia-lateral" aria-label="Decisões da cadeia">
        <div className="j-abas" role="tablist">
          <button type="button" role="tab" aria-selected={aba === "instalacao"} className={aba === "instalacao" ? "sel" : ""} onClick={() => aoMudarAba("instalacao")}>
            Instalação <kbd>I</kbd>
          </button>
          <button type="button" role="tab" aria-selected={aba === "atacado"} className={aba === "atacado" ? "sel" : ""} onClick={() => aoMudarAba("atacado")}>
            Atacado <kbd>A</kbd>
          </button>
        </div>
        <div className="j-painel-cadeia" role="tabpanel">
          {aba === "atacado" ? (
            <PainelDoAtacado v={v} comandar={comandar} />
          ) : fazenda ? (
            <PainelDaFazenda v={v} comandar={comandar} fazenda={fazenda} aoTrocar={(f) => setTrocando(f.id)} />
          ) : produtoDaFabrica !== null ? (
            <PainelDaFabrica v={v} comandar={comandar} produto={produtoDaFabrica} aoIrParaProdutos={aoIrParaProdutos} />
          ) : id === ID_NOVA_FAZENDA ? (
            <PainelNovaFazenda v={v} comandar={comandar} />
          ) : id === ID_NOVA_FABRICA ? (
            <PainelNovaFabrica v={v} comandar={comandar} />
          ) : id === ID_LOJA ? (
            <PainelDaLoja v={v} comandar={comandar} aoIrParaProdutos={aoIrParaProdutos} />
          ) : null}
        </div>
      </section>
      {fazendaDaTroca && <TrocaDeAtividade v={v} comandar={comandar} fazenda={fazendaDaTroca} aoFechar={() => setTrocando(null)} />}
    </>
  );
}
