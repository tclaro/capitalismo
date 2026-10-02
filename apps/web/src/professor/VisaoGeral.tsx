/**
 * Visão geral do professor (vê tudo): ranking por mercado, situação de cada empresa, ofertas por
 * produto e avisos do último dia.
 */
import type { Aviso as AvisoDoMotor, VisaoProfessor } from "@simulador/compartilhado";
import { Bell, ChartColumn, Trophy } from "lucide-react";
import { CorEquipe, Secao } from "../componentes/base";
import { formatarNumero, formatarPercentual, formatarPontuacao, formatarReais } from "../formato";

type Empresa = VisaoProfessor["empresas"][number];

const classeDoValor = (v: number | null) => (v === null ? "" : v > 0 ? "positivo" : v < 0 ? "negativo" : "");

export function RankingDaSala({ visao }: { visao: VisaoProfessor }) {
  const porId = new Map(visao.empresas.map((e) => [e.empresa, e]));
  return (
    <Secao titulo="Ranking" icone={<Trophy aria-hidden size={20} />}>
      <p className="pequeno texto-2" style={{ margin: 0 }}>
        Critério: {visao.sala.criterio === "lucro_acumulado" ? "lucro acumulado" : "participação na receita do mercado"}. Para os alunos:{" "}
        {visao.sala.rankingVisivel === "completo" ? "completo" : visao.sala.rankingVisivel === "propria" ? "só a própria posição" : "oculto"}.
      </p>
      {visao.ranking.map((r) => (
        <div key={r.mercado} className="tabela-rolagem">
          {visao.ranking.length > 1 && <h3>{visao.sala.mercados.find((m) => m.id === r.mercado)?.nome ?? r.mercado}</h3>}
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
              {r.posicoes.map((p) => {
                const e = porId.get(p.empresa);
                return (
                  <tr key={p.empresa}>
                    <td className="num">{p.posicao}º</td>
                    <td>{e?.robo ? `${p.nome} (robô)` : <CorEquipe cor={e?.cor ?? null} nome={p.nome} />}</td>
                    <td className={`num ${classeDoValor(p.pontuacao)}`}>{formatarPontuacao(p.pontuacao, visao.sala.criterio)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
    </Secao>
  );
}

export function EmpresasDaSala({ visao }: { visao: VisaoProfessor }) {
  const ativas = visao.empresas.filter((e) => !e.inativa);
  const nomeProduto = new Map(visao.sala.produtos.map((p) => [p.id, p.nome]));
  const nomeMercado = new Map(visao.sala.mercados.map((m) => [m.id, m.nome]));
  const variosMercados = visao.sala.mercados.length > 1;

  return (
    <Secao titulo="Empresas" icone={<ChartColumn aria-hidden size={20} />}>
      <div className="tabela-rolagem">
        <table className="tabela">
          <thead>
            <tr>
              <th scope="col">Empresa</th>
              {variosMercados && <th scope="col">Mercado</th>}
              <th scope="col" className="num">
                Caixa
              </th>
              <th scope="col" className="num">
                Lucro no último mês
              </th>
              <th scope="col" className="num">
                Lucro acumulado
              </th>
              <th scope="col" className="num">
                Receita acumulada
              </th>
              <th scope="col" className="num">
                Pontos de venda
              </th>
              <th scope="col" className="num">
                Fábricas
              </th>
            </tr>
          </thead>
          <tbody>
            {ativas.map((e) => (
              <tr key={e.empresa}>
                <td>
                  <NomeDaEmpresa e={e} />
                </td>
                {variosMercados && <td>{nomeMercado.get(e.mercado) ?? e.mercado}</td>}
                <td className={`num ${classeDoValor(e.caixa)}`}>
                  {formatarReais(e.caixa)}
                  {e.creditoEmergencial > 0 && (
                    <div className="pequeno negativo" title="Crédito emergencial em aberto">
                      crédito: {formatarReais(e.creditoEmergencial)}
                    </div>
                  )}
                </td>
                <td className={`num ${classeDoValor(e.lucroUltimoMes)}`}>{e.lucroUltimoMes === null ? "—" : formatarReais(e.lucroUltimoMes)}</td>
                <td className={`num ${classeDoValor(e.lucroAcumulado)}`}>{formatarReais(e.lucroAcumulado)}</td>
                <td className="num">{formatarReais(e.receitaAcumulada)}</td>
                <td className="num">{e.pontosDeVenda}</td>
                <td className="num">{e.fabricas}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <details>
        <summary>Ofertas por produto (preço, participação, nota, estoque, qualidade, marca)</summary>
        <div className="tabela-rolagem" style={{ marginTop: "0.75rem" }}>
          <table className="tabela">
            <thead>
              <tr>
                <th scope="col">Produto</th>
                <th scope="col">Empresa</th>
                <th scope="col" className="num">
                  Preço
                </th>
                <th scope="col" className="num">
                  Participação
                </th>
                <th scope="col" className="num">
                  Nota
                </th>
                <th scope="col" className="num">
                  Estoque
                </th>
                <th scope="col" className="num">
                  Qualidade
                </th>
                <th scope="col" className="num">
                  Marca
                </th>
              </tr>
            </thead>
            <tbody>
              {visao.sala.produtos.flatMap((p) =>
                ativas.map((e) => {
                  const o = e.ofertas.find((x) => x.produto === p.id);
                  if (!o) return null;
                  return (
                    <tr key={`${p.id}|${e.empresa}`}>
                      <td>{nomeProduto.get(p.id)}</td>
                      <td>
                        <NomeDaEmpresa e={e} />
                      </td>
                      <td className="num">{o.preco === null ? "fora de venda" : formatarReais(o.preco)}</td>
                      <td className="num">{formatarPercentual(o.participacao)}</td>
                      <td className="num">{formatarNumero(o.nota, 1)}</td>
                      <td className="num">{formatarNumero(o.estoque)}</td>
                      <td className="num">{formatarNumero(o.qualidade, 1)}</td>
                      <td className="num">{formatarNumero(o.marca, 1)}</td>
                    </tr>
                  );
                }),
              )}
            </tbody>
          </table>
        </div>
      </details>
    </Secao>
  );
}

function NomeDaEmpresa({ e }: { e: Empresa }) {
  return e.robo ? <span>{e.nome} (robô)</span> : <CorEquipe cor={e.cor} nome={e.nome} />;
}

/** Aviso do motor em texto para o professor. */
export function textoDoAviso(a: AvisoDoMotor, nomeEmpresa: (id: string) => string, nomeProduto: (id: string) => string): string {
  switch (a.tipo) {
    case "evento":
      return a.descricao;
    case "fim_de_mes":
      return `Fim do mês ${a.mes}: relatórios mensais fechados.`;
    case "ponto_de_venda_aberto":
      return `${nomeEmpresa(a.empresa)} abriu ${a.quantidade} ponto(s) de venda.`;
    case "fabrica_concluida":
      return `${nomeEmpresa(a.empresa)} concluiu a fábrica de ${nomeProduto(a.produto)}.`;
    case "fazenda_concluida":
      return `${nomeEmpresa(a.empresa)} concluiu a fazenda de ${a.atividade.replaceAll("_", " ")}.`;
    case "estoque_cheio":
      return `${nomeEmpresa(a.empresa)} está com o estoque de ${nomeProduto(a.produto).replaceAll("_", " ")} cheio há dias.`;
    case "ruptura_de_estoque":
      return `${nomeEmpresa(a.empresa)} ficou sem estoque de ${nomeProduto(a.produto)}.`;
    case "caixa_negativo":
      return `${nomeEmpresa(a.empresa)} está com caixa negativo (crédito emergencial).`;
  }
}

export function AvisosDaSala({ visao }: { visao: VisaoProfessor }) {
  const nomeEmpresa = (id: string) => visao.empresas.find((e) => e.empresa === id)?.nome ?? id;
  const nomeProduto = (id: string) => visao.sala.produtos.find((p) => p.id === id)?.nome ?? id;
  return (
    <Secao titulo="Avisos do último dia" icone={<Bell aria-hidden size={20} />}>
      {visao.avisos.length === 0 ? (
        <p className="texto-2" style={{ margin: 0 }}>
          Nenhum aviso.
        </p>
      ) : (
        <ul className="lista-simples">
          {visao.avisos.map((a, i) => (
            <li key={i}>{textoDoAviso(a, nomeEmpresa, nomeProduto)}</li>
          ))}
        </ul>
      )}
    </Secao>
  );
}
