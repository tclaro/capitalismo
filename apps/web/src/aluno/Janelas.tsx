/**
 * Janelas sobre a tela de jogo: resultados (DRE e balanço), gráficos, fechamento do mês (modo
 * rodada) e fim da partida. Esc ou clique fora fecha; o foco volta para onde estava.
 */
import type { FechamentoMensal, HistoricoDaSala, VisaoAluno } from "@simulador/compartilhado";
import { type ReactNode, useEffect, useRef } from "react";
import { GraficoLinhas, type Serie } from "../componentes/interativos";
import { formatarPercentual, formatarReais } from "../formato";
import { ImagemDoProduto } from "./imagens";
import { destaquesDoMes, empresasDoMercado, nomeDoMes, reaisCurtos, reaisDoEixo } from "./jogo";
import { linhasDRE } from "./regras";

export function Janela({ titulo, extra, children, aoFechar, classe = "" }: { titulo: string; extra?: ReactNode; children: ReactNode; aoFechar: () => void; classe?: string }) {
  const caixa = useRef<HTMLDivElement>(null);
  const fechar = useRef(aoFechar);
  fechar.current = aoFechar;
  useEffect(() => {
    const antes = document.activeElement as HTMLElement | null;
    (caixa.current?.querySelector<HTMLElement>("[data-foco]") ?? caixa.current?.querySelector<HTMLElement>("button"))?.focus();
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        fechar.current();
      }
    };
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("keydown", tecla);
      antes?.focus?.();
    };
  }, []);
  return (
    <div className="j-veu" onPointerDown={(e) => e.target === e.currentTarget && aoFechar()}>
      <div ref={caixa} className={`j-janela ${classe}`} role="dialog" aria-modal="true" aria-labelledby="j-titulo">
        <header>
          <h2 id="j-titulo">{titulo}</h2>
          <span className="j-botoes">
            {extra}
            <button type="button" className="botao" onClick={aoFechar}>
              Fechar <kbd>Esc</kbd>
            </button>
          </span>
        </header>
        <div className="j-corpo">{children}</div>
      </div>
    </div>
  );
}

const classe = (x: number) => (x > 0 ? "positivo" : x < 0 ? "negativo" : "");

export function Resultados({ v }: { v: VisaoAluno }) {
  const f = v.fechamentos;
  if (f.length === 0) return <p className="j-dica">Os resultados aparecem quando o primeiro mês fechar. Lucro do mês até agora: {formatarReais(v.visao.empresa.lucroDoMesAteAgora)}.</p>;
  const b = f.at(-1)!.balanco;
  return (
    <div className="j-resultados">
      <div className="tabela-rolagem">
        <table className="j-dre">
          <thead>
            <tr>
              <th scope="col">Demonstração do resultado</th>
              {f.map((x) => (
                <th key={x.mes} scope="col">
                  {nomeDoMes(x.mes).slice(0, 3)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {linhasDRE(f).map((l) => (
              <tr key={l.rotulo} className={l.total ? "total" : ""}>
                <th scope="row">{l.rotulo}</th>
                {l.valores.map((x, i) => (
                  <td key={i} className={l.total ? classe(x) : ""}>
                    {formatarReais(x)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="j-metricas">
        <div>
          <small>Caixa (fim de {nomeDoMes(f.at(-1)!.mes)})</small>
          <b>{formatarReais(b.caixa)}</b>
        </div>
        <div>
          <small>Estoques</small>
          <b>{formatarReais(b.estoques)}</b>
        </div>
        <div>
          <small>Imobilizado e obras</small>
          <b>{formatarReais(b.imobilizadoLiquido + b.obrasEmAndamento)}</b>
        </div>
        <div>
          <small>Crédito emergencial</small>
          <b>{formatarReais(b.creditoEmergencial)}</b>
        </div>
        <div>
          <small>Patrimônio líquido</small>
          <b className={classe(b.patrimonioLiquido)}>{formatarReais(b.patrimonioLiquido)}</b>
        </div>
        <div>
          <small>Lucros acumulados</small>
          <b className={classe(b.lucrosAcumulados)}>{formatarReais(b.lucrosAcumulados)}</b>
        </div>
      </div>
    </div>
  );
}

export function Graficos({ v, historico }: { v: VisaoAluno; historico: HistoricoDaSala }) {
  const f = v.fechamentos;
  const empresas = empresasDoMercado(v);
  const series: Serie[] = v.visao.produtos.map((p, i) => ({
    nome: p.nome,
    cor: ["#0072B2", "#D55E00", "#009E73", "#CC79A7", "#E69F00", "#56B4E9", "#6B6B6B", "#F0E442"][i % 8]!,
    tracejado: i % 2 === 1,
    pontos: historico.semanas.filter((s) => s.produto === p.id && s.empresa === v.empresa).map((s) => [s.semana, s.participacao] as const),
  }));
  return (
    <div className="j-graficos">
      <div>
        {f.length === 0 ? (
          <p className="j-dica">Caixa e lucro por mês: aparece quando o primeiro mês fechar.</p>
        ) : (
          <GraficoLinhas
            titulo="Caixa e lucro líquido por mês"
            formatarX={(x) => nomeDoMes(x).slice(0, 3)}
            formatarY={reaisDoEixo}
            series={[
              { nome: "Caixa no fim do mês", cor: empresas.find((e) => e.nos)?.cor ?? "#0072B2", pontos: f.map((x) => [x.mes, x.balanco.caixa] as const) },
              { nome: "Lucro líquido do mês", cor: "#6B6B6B", tracejado: true, pontos: f.map((x) => [x.mes, x.lucroLiquido] as const) },
            ]}
          />
        )}
      </div>
      <div>
        {series.every((s) => s.pontos.length === 0) ? (
          <p className="j-dica">Participação por semana: aparece quando a primeira semana fechar.</p>
        ) : (
          <GraficoLinhas titulo="Participação de vocês por produto, por semana" formatarX={(x) => `s${x}`} formatarY={(y) => formatarPercentual(y, 0)} series={series} />
        )}
      </div>
    </div>
  );
}

export function Fechamento({ v, f, posicaoAntes, historico, aoFechar, aoVerResultados }: { v: VisaoAluno; f: FechamentoMensal; posicaoAntes: number | null; historico: HistoricoDaSala; aoFechar: () => void; aoVerResultados: () => void }) {
  const pos = v.ranking?.find((p) => p.empresa === v.empresa)?.posicao ?? null;
  const { melhor, pior } = destaquesDoMes(historico.semanas, f.mes, v.empresa);
  const nome = (id: string) => v.visao.produtos.find((p) => p.id === id)?.nome ?? id;
  const sub =
    pos === null || posicaoAntes === null ? null : pos < posicaoAntes ? <span className="positivo">▲ subiram de {posicaoAntes}º</span> : pos > posicaoAntes ? <span className="negativo">▼ caíram de {posicaoAntes}º</span> : "mesma posição do mês anterior";
  const destaque = (x: { produto: string; receita: number } | null, rotulo: string) =>
    x && (
      <div className="j-fech-produto">
        <span className="j-mini">
          <ImagemDoProduto produto={x.produto} nome={nome(x.produto)} />
        </span>
        <span>
          <span className="j-rotulo">{rotulo}</span>
          <br />
          <b>{nome(x.produto)}</b>
          <br />
          <small>{reaisCurtos(x.receita)} de receita no mês</small>
        </span>
      </div>
    );
  return (
    <Janela titulo={`Fechamento de ${nomeDoMes(f.mes)}`} aoFechar={aoFechar} classe="j-fechamento" extra={<span className="j-status decidir">Hora de decidir</span>}>
      <div className="j-fech-topo">
        <div className="j-fech-cartao">
          <span className="j-rotulo">Lucro líquido do mês</span>
          <b className={classe(f.lucroLiquido)}>
            {f.lucroLiquido > 0 ? "+" : ""}
            {reaisCurtos(f.lucroLiquido)}
          </b>
          <small>
            receita {reaisCurtos(f.dre.receita ?? 0)} · imposto {reaisCurtos(f.dre.ir ?? 0)}
          </small>
        </div>
        <div className="j-fech-cartao">
          <span className="j-rotulo">Ranking</span>
          <b>{pos === null ? "—" : `${pos}º`}</b>
          <small>{sub}</small>
        </div>
      </div>
      {(melhor || pior) && (
        <div className="j-fech-produtos">
          {destaque(melhor, "Mais vendeu")}
          {destaque(pior, "Menos vendeu")}
        </div>
      )}
      <p className="j-dica">
        O relógio está parado. Mudem o que quiserem: as decisões valem quando o próximo mês começar. Marquem <b>Pronto</b> quando terminarem.
      </p>
      <div className="j-fech-acoes">
        <button type="button" className="botao" onClick={aoVerResultados}>
          Ver resultados completos
        </button>
        <button type="button" className="botao primario" data-foco onClick={aoFechar}>
          Decidir o próximo mês
        </button>
      </div>
    </Janela>
  );
}

export function FimDaPartida({ v, aoFechar, aoVerResultados }: { v: VisaoAluno; aoFechar: () => void; aoVerResultados: () => void }) {
  const cores = new Map(empresasDoMercado(v).map((e) => [e.id, e.cor]));
  const pos = v.ranking?.find((p) => p.empresa === v.empresa)?.posicao ?? null;
  const encerrada = v.relogio.status === "encerrada";
  return (
    <Janela titulo={encerrada ? "Partida encerrada" : "Fim da partida"} aoFechar={aoFechar} classe="j-fechamento">
      <div className="j-fech-topo">
        <div className="j-fech-cartao">
          <span className="j-rotulo">Colocação</span>
          <b>{pos === null ? "—" : `${pos}º`}</b>
          <small>{v.ranking && v.sala.rankingVisivel === "completo" ? `de ${v.ranking.length} empresas` : ""}</small>
        </div>
        <div className="j-fech-cartao">
          <span className="j-rotulo">Lucro acumulado</span>
          <b className={classe(v.visao.empresa.lucrosAcumulados)}>{reaisCurtos(v.visao.empresa.lucrosAcumulados)}</b>
          <small>{v.relogio.mes > 0 ? `${Math.min(v.relogio.mes, v.relogio.duracaoMeses)} meses jogados` : ""}</small>
        </div>
      </div>
      {v.ranking && (
        <ol className="j-ranking">
          {v.ranking.map((p) => (
            <li key={p.empresa} className={p.empresa === v.empresa ? "nos" : ""}>
              <span className="j-lugar">{p.posicao}</span>
              <span className="j-nome-emp">
                <span className="j-cor" style={{ background: cores.get(p.empresa) ?? "var(--cor-neutro)" }} />
                {p.nome}
              </span>
              <span className="j-num">{v.sala.criterio === "lucro_acumulado" ? reaisCurtos(Math.round(p.pontuacao * 100)) : `${p.pontuacao.toFixed(1)} pts`}</span>
            </li>
          ))}
        </ol>
      )}
      <p className="j-dica">{encerrada ? "O professor encerrou a partida: os resultados estão congelados." : "O tempo previsto acabou. O professor vai encerrar a partida ou estender por mais meses."}</p>
      <div className="j-fech-acoes">
        <button type="button" className="botao" onClick={aoVerResultados}>
          Ver resultados completos
        </button>
        <button type="button" className="botao primario" data-foco onClick={aoFechar}>
          Fechar
        </button>
      </div>
    </Janela>
  );
}
