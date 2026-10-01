/**
 * Coluna da direita da tela de jogo: ranking do mercado (conforme a visibilidade escolhida pelo
 * professor) e a lista de avisos da equipe.
 */
import type { VisaoAluno } from "@simulador/compartilhado";
import { formatarPontuacao } from "../formato";
import type { AvisoDatado } from "./ganchos";
import { dataCurta, empresasDoMercado, reaisCurtos, textoDoAviso } from "./jogo";

export function RankingDoMercado({ v }: { v: VisaoAluno }) {
  const cores = new Map(empresasDoMercado(v).map((e) => [e.id, e.cor]));
  const pontos = (p: number) => (v.sala.criterio === "lucro_acumulado" ? reaisCurtos(Math.round(p * 100)) : formatarPontuacao(p, v.sala.criterio));
  return (
    <section className="j-bloco" aria-labelledby="t-ranking">
      <h2>
        <span className="j-rotulo" id="t-ranking">
          Ranking · {v.sala.criterio === "lucro_acumulado" ? "lucro acumulado" : "participação na receita"}
        </span>
      </h2>
      {v.ranking === null ? (
        <p className="j-dica">O professor deixou o ranking oculto nesta partida.</p>
      ) : (
        <ol className="j-ranking">
          {v.ranking.map((p) => (
            <li key={p.empresa} className={p.empresa === v.empresa ? "nos" : ""}>
              <span className="j-lugar">{p.posicao}</span>
              <span className="j-nome-emp">
                <span className="j-cor" style={{ background: cores.get(p.empresa) ?? "var(--cor-neutro)" }} />
                {p.nome}
                {p.empresa === v.empresa && <small> (vocês)</small>}
              </span>
              <span className="j-num">{pontos(p.pontuacao)}</span>
            </li>
          ))}
        </ol>
      )}
      {v.sala.rankingVisivel === "propria" && <p className="j-dica">Nesta partida, vocês veem só a própria posição.</p>}
    </section>
  );
}

const TIPO_DO_AVISO: Record<string, string> = { ruptura_de_estoque: "ruim", caixa_negativo: "ruim", fabrica_concluida: "bom", ponto_de_venda_aberto: "bom", fim_de_mes: "info", evento: "alerta" };

export function ListaDeAvisos({ v, avisos }: { v: VisaoAluno; avisos: readonly AvisoDatado[] }) {
  return (
    <section className="j-bloco j-avisos" aria-labelledby="t-avisos">
      <h2>
        <span className="j-rotulo" id="t-avisos">
          Avisos
        </span>
        <small className="j-rotulo">{avisos.length > 0 ? `${avisos.length} desde que abriu` : ""}</small>
      </h2>
      {avisos.length === 0 ? (
        <p className="j-dica">Os avisos da partida aparecem aqui.</p>
      ) : (
        <ol aria-live="polite">
          {avisos.map((a, i) => (
            <li key={`${a.tick}-${i}`}>
              <time>{dataCurta(a.tick, v.visao.ticksPorMes)}</time>
              <span className={`t-${TIPO_DO_AVISO[a.aviso.tipo] ?? "info"}`}>{textoDoAviso(a.aviso, v)}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
