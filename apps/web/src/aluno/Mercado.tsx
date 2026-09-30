/**
 * Mercado: ranking (conforme a visibilidade escolhida pelo professor), comparação por produto com os
 * concorrentes e os avisos da equipe.
 */
import type { Aviso as AvisoDoMotor, VisaoAluno } from "@simulador/compartilhado";
import { descreverData } from "@simulador/compartilhado";
import { Bell, Trophy } from "lucide-react";
import { CorEquipe, Secao } from "../componentes/base";
import { formatarPontuacao } from "../formato";
import type { AvisoDatado } from "./ganchos";
import { ComparacaoDeNotas } from "./Painel";

export function MercadoDaEquipe({ v }: { v: VisaoAluno }) {
  const corDe = new Map(v.vagas.map((x) => [x.empresa, x.equipe?.cor ?? null]));
  return (
    <>
      <Secao titulo="Ranking" icone={<Trophy aria-hidden size={20} />}>
        {v.ranking === null ? (
          <p className="texto-2" style={{ margin: 0 }}>
            O professor deixou o ranking oculto nesta partida.
          </p>
        ) : (
          <>
            <p className="pequeno texto-2" style={{ margin: 0 }}>
              Critério: {v.sala.criterio === "lucro_acumulado" ? "lucro acumulado" : "participação na receita do mercado"}.
              {v.sala.rankingVisivel === "propria" ? " Nesta partida, você vê só a posição da sua equipe." : ""}
            </p>
            <table className="tabela">
              <thead>
                <tr>
                  <th scope="col" className="num">
                    #
                  </th>
                  <th scope="col">Equipe</th>
                  <th scope="col" className="num">
                    Pontuação
                  </th>
                </tr>
              </thead>
              <tbody>
                {v.ranking.map((p) => (
                  <tr key={p.empresa} style={p.empresa === v.empresa ? { fontWeight: 700 } : undefined}>
                    <td className="num">{p.posicao}º</td>
                    <td>
                      <CorEquipe cor={corDe.get(p.empresa) ?? null} nome={p.empresa === v.empresa ? `${p.nome} (você)` : p.nome} />
                    </td>
                    <td className="num">{formatarPontuacao(p.pontuacao, v.sala.criterio)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </Secao>
      {v.visao.produtos.map((p) => (
        <Secao key={p.id} titulo={p.nome}>
          <ComparacaoDeNotas v={v} produto={p.id} />
        </Secao>
      ))}
    </>
  );
}

export function textoDoAvisoAluno(a: AvisoDoMotor, v: VisaoAluno): string {
  const produto = (id: string) => v.visao.produtos.find((p) => p.id === id)?.nome ?? id;
  switch (a.tipo) {
    case "evento":
      return a.descricao;
    case "fim_de_mes":
      return `Fim do mês ${a.mes}: a DRE e o balanço do mês estão em Relatórios.`;
    case "ponto_de_venda_aberto":
      return `${a.quantidade} ponto(s) de venda começaram a funcionar.`;
    case "fabrica_concluida":
      return `A fábrica de ${produto(a.produto)} ficou pronta: já dá para produzir.`;
    case "ruptura_de_estoque":
      return `Acabou o estoque de ${produto(a.produto)}: clientes foram para os concorrentes.`;
    case "caixa_negativo":
      return "O caixa ficou negativo: a empresa entrou no crédito emergencial.";
  }
}

export function AvisosDaEquipe({ v, avisos }: { v: VisaoAluno; avisos: readonly AvisoDatado[] }) {
  return (
    <Secao titulo="Avisos" icone={<Bell aria-hidden size={20} />}>
      {avisos.length === 0 ? (
        <p className="texto-2" style={{ margin: 0 }}>
          Nenhum aviso desde que você abriu esta página.
        </p>
      ) : (
        <ul className="lista-simples" aria-live="polite">
          {avisos.map((x, i) => (
            <li key={`${x.tick}-${i}`}>
              <span className="pequeno texto-2">{descreverData(x.tick, v.visao.ticksPorMes)}:</span> {textoDoAvisoAluno(x.aviso, v)}
            </li>
          ))}
        </ul>
      )}
    </Secao>
  );
}
