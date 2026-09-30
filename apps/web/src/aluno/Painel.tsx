/**
 * Painel da empresa (seção 8): caixa, lucro do mês e acumulado, alertas; por produto, participação,
 * vendas, estoque, capacidade e a nota decomposta ao lado da dos concorrentes.
 */
import type { VisaoAluno } from "@simulador/compartilhado";
import { TriangleAlert } from "lucide-react";
import { Aviso, CorEquipe, Secao } from "../componentes/base";
import { Ajuda } from "../componentes/interativos";
import { formatarNumero, formatarPercentual, formatarReais } from "../formato";
import { AJUDA } from "./ajuda";
import { decomporNota } from "./regras";

const classe = (v: number | null | undefined) => (v === null || v === undefined ? "" : v > 0 ? "positivo" : v < 0 ? "negativo" : "");

export function PainelDaEmpresa({ v }: { v: VisaoAluno }) {
  const e = v.visao.empresa;
  const tpm = v.visao.ticksPorMes;
  const lucroMes = e.ultimoFechamento?.lucroLiquido ?? null;
  const semEstoque = e.ofertas.filter((o) => o.decisao.preco !== null && o.estoque.quantidade <= 0);

  return (
    <>
      <div className="indicadores">
        <Indicador rotulo="Caixa" valor={formatarReais(e.caixa)} classe={classe(e.caixa)} />
        <Indicador rotulo={e.ultimoFechamento ? `Lucro do mês ${e.ultimoFechamento.mes}` : "Lucro do último mês"} valor={lucroMes === null ? "—" : formatarReais(lucroMes)} classe={classe(lucroMes)} />
        <Indicador rotulo="Lucro acumulado" valor={formatarReais(e.lucrosAcumulados)} classe={classe(e.lucrosAcumulados)} />
        <Indicador
          rotulo="Pontos de venda"
          valor={`${e.pontosDeVendaOperando}${e.pontosDeVendaEmObra > 0 ? ` (+${e.pontosDeVendaEmObra} em obra)` : ""}`}
          detalhe={`até ${formatarNumero(e.capacidadeVendaPorTick)} vendas por dia`}
        />
      </div>

      {e.creditoEmergencial > 0 && (
        <Aviso tipo="erro">
          Caixa negativo: a empresa está usando {formatarReais(e.creditoEmergencial)} de crédito emergencial, com juros de {formatarPercentual(v.visao.custos.jurosEmergencialMensal)} ao mês. Reduza gastos ou aumente as vendas.
        </Aviso>
      )}
      {semEstoque.length > 0 && (
        <Aviso tipo="alerta">
          Sem estoque: {semEstoque.map((o) => v.visao.produtos.find((p) => p.id === o.produto)?.nome ?? o.produto).join(", ")}. Os clientes vão para os concorrentes.
        </Aviso>
      )}
      {e.pontosDeVendaOperando === 0 && e.pontosDeVendaEmObra === 0 && <Aviso tipo="alerta">A empresa não tem pontos de venda: não consegue vender nada. Abra ao menos um em Decisões.</Aviso>}

      {v.visao.produtos.map((p) => {
        const o = e.ofertas.find((x) => x.produto === p.id);
        if (!o) return null;
        return (
          <Secao key={p.id} titulo={p.nome}>
            <div className="indicadores">
              <Indicador rotulo="Preço" valor={o.decisao.preco === null ? "fora de venda" : formatarReais(o.decisao.preco)} />
              <Indicador rotulo="Participação" valor={formatarPercentual(o.participacaoAnterior)} detalhe={`ontem: vendeu ${formatarNumero(o.vendasAnterior)} de ${formatarNumero(o.demandaAnterior)} procuradas`} />
              <Indicador
                rotulo="Estoque"
                valor={`${formatarNumero(o.estoque.quantidade)} ${p.unidade}`}
                detalhe={o.estoque.quantidade > 0 ? `custo médio ${formatarReais(Math.round(o.estoque.valor / o.estoque.quantidade))}` : undefined}
                classe={o.decisao.preco !== null && o.estoque.quantidade <= 0 ? "negativo" : ""}
              />
              {(o.fabricasOperando > 0 || o.fabricasEmObra > 0) && (
                <Indicador
                  rotulo="Fábricas"
                  valor={`${o.fabricasOperando}${o.fabricasEmObra > 0 ? ` (+${o.fabricasEmObra} em obra)` : ""}`}
                  detalhe={`produz até ${formatarNumero(o.capacidadeProducaoPorTick * tpm)} por mês`}
                />
              )}
            </div>
            <ComparacaoDeNotas v={v} produto={p.id} />
          </Secao>
        );
      })}
    </>
  );
}

function Indicador({ rotulo, valor, detalhe, classe = "" }: { rotulo: string; valor: string; detalhe?: string | undefined; classe?: string }) {
  return (
    <div className="indicador">
      <div className="rotulo">{rotulo}</div>
      <div className={`valor ${classe}`}>{valor}</div>
      {detalhe && <div className="pequeno texto-2">{detalhe}</div>}
    </div>
  );
}

/** Nota decomposta (qualidade, marca, preço) da equipe e dos concorrentes, em barras e em números. */
export function ComparacaoDeNotas({ v, produto }: { v: VisaoAluno; produto: string }) {
  const p = v.visao.produtos.find((x) => x.id === produto)!;
  const propria = v.visao.empresa.ofertas.find((o) => o.produto === produto)!;
  const linhas = [
    { id: v.empresa, nome: v.equipe.nome, cor: v.equipe.cor, propria: true, preco: propria.decisao.preco, q: propria.qualidade, m: propria.marca, nota: propria.notaAnterior, part: propria.participacaoAnterior },
    ...v.visao.concorrentes.map((c) => {
      const o = c.ofertas.find((x) => x.produto === produto)!;
      const vaga = v.vagas.find((x) => x.empresa === c.id);
      return { id: c.id, nome: c.nome, cor: vaga?.equipe?.cor ?? null, propria: false, preco: o.preco, q: o.qualidade, m: o.marca, nota: o.notaAnterior, part: o.participacaoAnterior };
    }),
  ].filter((l) => l.preco !== null || l.propria);
  const partes = linhas.map((l) => decomporNota(l.q, l.m, l.nota, p.pesos));
  // Escala comum: a maior soma de partes positivas ocupa a barra toda.
  const escala = Math.max(1, ...partes.map((d) => Math.max(0, d.qualidade) + Math.max(0, d.marca) + Math.max(0, d.preco)));
  const largura = (x: number) => `${(Math.max(0, x) / escala) * 100}%`;
  const algumaNegativa = partes.some((d, i) => d.preco < 0 && linhas[i]!.preco !== null);

  return (
    <div className="pilha">
      <h3 className="linha" style={{ margin: 0 }}>
        Nota do produto no mercado <Ajuda titulo="nota do produto">{AJUDA.nota}</Ajuda>
      </h3>
      <p className="pequeno texto-2" style={{ margin: 0 }}>
        <span className="amostra-legenda parte-qualidade" aria-hidden /> Qualidade (peso {p.pesos.qualidade}) · <span className="amostra-legenda parte-marca" aria-hidden /> Marca (peso {p.pesos.marca}) ·{" "}
        <span className="amostra-legenda parte-preco" aria-hidden /> Preço (peso {p.pesos.preco})
      </p>
      <div className="tabela-rolagem">
        <table className="tabela">
          <thead>
            <tr>
              <th scope="col">Empresa</th>
              <th scope="col" className="num">
                Preço
              </th>
              <th scope="col" className="num">
                Qualidade
              </th>
              <th scope="col" className="num">
                Marca
              </th>
              <th scope="col">Composição da nota</th>
              <th scope="col" className="num">
                Nota
              </th>
              <th scope="col" className="num">
                Participação
              </th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l, i) => {
              const d = partes[i]!;
              return (
                <tr key={l.id} style={l.propria ? { fontWeight: 600 } : undefined}>
                  <td>
                    <CorEquipe cor={l.cor} nome={l.propria ? `${l.nome} (você)` : l.nome} />
                  </td>
                  <td className="num">{l.preco === null ? "—" : formatarReais(l.preco)}</td>
                  <td className="num">{formatarNumero(l.q, 1)}</td>
                  <td className="num">{formatarNumero(l.m, 1)}</td>
                  <td>
                    {l.preco === null ? (
                      <span className="texto-2">fora de venda</span>
                    ) : (
                    <>
                    <div
                      className="barra-nota"
                      role="img"
                      aria-label={`qualidade ${formatarNumero(d.qualidade, 1)}, marca ${formatarNumero(d.marca, 1)}, preço ${formatarNumero(d.preco, 1)} pontos`}
                    >
                      <span className="parte-qualidade" style={{ width: largura(d.qualidade) }} />
                      <span className="parte-marca" style={{ width: largura(d.marca) }} />
                      <span className="parte-preco" style={{ width: largura(d.preco) }} />
                    </div>
                    {d.preco < 0 && (
                      <span className="pequeno negativo">
                        <TriangleAlert aria-hidden size={12} /> preço tira {formatarNumero(-d.preco, 1)} pontos
                      </span>
                    )}
                    </>
                    )}
                  </td>
                  <td className="num">{l.preco === null ? "—" : formatarNumero(l.nota, 1)}</td>
                  <td className="num">{formatarPercentual(l.part)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {algumaNegativa && <p className="pequeno texto-2">Preço acima do que os consumidores consideram normal tira pontos da nota.</p>}
    </div>
  );
}
