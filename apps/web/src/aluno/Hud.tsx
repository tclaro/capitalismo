/**
 * Topo da tela de jogo (HUD): equipe, data com a barra do mês e do dia, estado do relógio, caixa
 * (animado, com a variação do dia), lucro do mês até agora e posição no ranking. Larguras fixas:
 * nada se mexe quando os números mudam de tamanho.
 */
import type { EstadoRelogio, VisaoAluno } from "@simulador/compartilhado";
import { LogOut } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Instantaneo } from "../cliente/conexao";
import { IndicadorConexao } from "../componentes/base";
import { useNumeroAnimado } from "./ganchos";
import { dataPorExtenso, diasDeFimDeSemana, empresasDoMercado, posicaoNoRanking, reaisCurtos, subtituloDaData } from "./jogo";

export function textoDoStatus(r: Pick<EstadoRelogio, "status" | "motivoPausa" | "podeEditar">): { classe: string; texto: string } {
  switch (r.status) {
    case "preparacao":
      return { classe: "pausa", texto: "Aguardando o início" };
    case "rodando":
      return { classe: "rodando", texto: "Rodando" };
    case "encerrada":
      return { classe: "pausa", texto: "Partida encerrada" };
    case "pausada":
      if (r.motivoPausa === "fim_do_mes") return { classe: "decidir", texto: "Fim do mês: hora de decidir" };
      if (r.motivoPausa === "duracao_atingida") return { classe: "pausa", texto: "Fim da partida" };
      return { classe: "pausa", texto: r.podeEditar ? "Pausa: decisões liberadas" : "Pausado pelo professor" };
  }
}

export function Hud({ v, instantaneo, aoSair }: { v: VisaoAluno; instantaneo: Instantaneo; aoSair: () => void }) {
  const r = v.relogio;
  const e = v.visao.empresa;
  const caixa = useNumeroAnimado(e.caixa);
  const lucro = e.lucroDoMesAteAgora;
  const st = textoDoStatus(r);
  const pos = posicaoNoRanking(v);
  const cor = empresasDoMercado(v).find((x) => x.nos)?.cor ?? "var(--cor-primaria)";
  const fimDeSemana = diasDeFimDeSemana(r.ticksPorMes);

  // Variação do caixa no último dia (aparece por um instante embaixo do valor).
  const anterior = useRef<{ tick: number; caixa: number } | null>(null);
  const [delta, setDelta] = useState<{ chave: number; valor: number } | null>(null);
  useEffect(() => {
    const a = anterior.current;
    if (a && r.tick === a.tick + 1 && e.caixa !== a.caixa) setDelta({ chave: r.tick, valor: e.caixa - a.caixa });
    anterior.current = { tick: r.tick, caixa: e.caixa };
  }, [r.tick, e.caixa]);

  const iniciais = v.equipe.nome
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <header className="j-hud" aria-label="Situação da empresa" style={{ borderTopColor: cor }}>
      <div className="j-equipe">
        <div className="j-brasao" aria-hidden="true" style={{ background: cor }}>
          {iniciais}
        </div>
        <div style={{ minWidth: 0 }}>
          <strong>{v.equipe.nome}</strong>
          <span>
            Sala {v.sala.codigo} · {v.membros.length} aluno(s)
          </span>
        </div>
      </div>
      <div className="j-tempo">
        <div className="j-data">
          <b>{dataPorExtenso(r.tick, r.ticksPorMes)}</b>
          <span>{subtituloDaData(r)}</span>
        </div>
        <div className="j-trilho" aria-hidden="true">
          <div className="j-mes-barra" style={{ gridTemplateColumns: `repeat(${r.ticksPorMes}, 1fr)` }}>
            {Array.from({ length: r.ticksPorMes }, (_, i) => (
              <i key={i} className={`${i + 1 < r.dia ? "passou" : i + 1 === r.dia ? "hoje" : ""}${fimDeSemana.has(i + 1) ? " semana" : ""}`} />
            ))}
          </div>
          <div className="j-dia-barra">
            {r.status === "rodando" && r.proximoTickEmMs !== null && <i key={r.tick} style={{ animationDuration: `${Math.max(0, r.proximoTickEmMs)}ms` }} />}
          </div>
          <div className="j-trilho-legenda">
            <span>dia 1</span>
            <span>semana 2</span>
            <span>semana 3</span>
            <span>fecha no dia {r.ticksPorMes}</span>
          </div>
        </div>
        <span className={`j-status ${st.classe}`} role="status">
          <span className="ponto" />
          {st.texto}
        </span>
      </div>
      <div className="j-indicadores">
        <div className="j-ind">
          <span className="j-rotulo">Caixa</span>
          <b className={e.caixa < 0 ? "negativo" : ""}>{reaisCurtos(Math.round(caixa))}</b>
          {delta && (
            <span key={delta.chave} className={`j-delta ${delta.valor >= 0 ? "positivo" : "negativo"}`} aria-hidden="true">
              {delta.valor >= 0 ? "+" : ""}
              {reaisCurtos(delta.valor)}
            </span>
          )}
        </div>
        <div className="j-ind">
          <span className="j-rotulo">Lucro no mês</span>
          <b className={lucro > 0 ? "positivo" : lucro < 0 ? "negativo" : ""}>
            {lucro > 0 ? "+" : ""}
            {reaisCurtos(lucro)}
          </b>
        </div>
        <div className="j-ind j-ind-pos">
          <span className="j-rotulo">Ranking</span>
          <b>
            {pos === null ? "—" : `${pos}º`} {pos !== null && v.ranking && v.sala.rankingVisivel === "completo" && <small>de {v.ranking.length}</small>}
          </b>
        </div>
        <div className="j-ind-acoes">
          <IndicadorConexao instantaneo={instantaneo} />
          <button type="button" className="j-sair" onClick={aoSair} title="Sair desta sala neste computador">
            <LogOut aria-hidden size={16} /> Sair
          </button>
        </div>
      </div>
    </header>
  );
}
