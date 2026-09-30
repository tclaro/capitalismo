/**
 * Relatórios (seção 8): DRE mensal em colunas, balanço resumido do último mês e gráficos de caixa,
 * lucro e participação (semanal, pelo histórico HTTP).
 */
import { PALETA_EQUIPES, type VisaoAluno } from "@simulador/compartilhado";
import { useEffect, useState } from "react";
import { pedir } from "../cliente/api";
import { Secao } from "../componentes/base";
import { Ajuda, GraficoLinhas, type Serie } from "../componentes/interativos";
import { formatarPercentual, formatarReais } from "../formato";
import { AJUDA } from "./ajuda";
import { linhasDRE } from "./regras";

interface Semana {
  semana: number;
  produto: string;
  participacao: number;
}

const classe = (v: number) => (v > 0 ? "positivo" : v < 0 ? "negativo" : "");
const reaisCurtos = (centavos: number) => {
  const r = centavos / 100;
  if (Math.abs(r) >= 1e6) return `R$ ${(r / 1e6).toFixed(1).replace(".", ",")} mi`;
  if (Math.abs(r) >= 1e3) return `R$ ${(r / 1e3).toFixed(0)} mil`;
  return `R$ ${r.toFixed(0)}`;
};

export function RelatoriosDaEmpresa({ v, codigo }: { v: VisaoAluno; codigo: string }) {
  const fechamentos = v.fechamentos;
  const [semanas, setSemanas] = useState<Semana[]>([]);
  const mes = v.relogio.mes;
  const semana = Math.floor(v.relogio.tick / 7);
  useEffect(() => {
    let vivo = true;
    void pedir<{ semanas: Semana[] }>(`/api/salas/${codigo}/historico`).then((r) => vivo && r.corpo.ok && setSemanas(r.corpo.semanas));
    return () => {
      vivo = false;
    };
    // Recarrega quando fecha uma semana (o histórico é semanal).
  }, [codigo, semana]);

  if (fechamentos.length === 0) {
    return (
      <Secao titulo="Relatórios">
        <p className="texto-2" style={{ margin: 0 }}>
          Os relatórios aparecem quando o primeiro mês fechar{v.relogio.tick > 0 ? ` (fim do mês ${mes})` : ""}.
        </p>
      </Secao>
    );
  }

  const linhas = linhasDRE(fechamentos);
  const ultimo = fechamentos.at(-1)!;
  const b = ultimo.balanco;
  const cores = PALETA_EQUIPES.map((c) => c.hex);
  const seriesParticipacao: Serie[] = v.visao.produtos.map((p, i) => ({
    nome: p.nome,
    cor: cores[i % cores.length]!,
    tracejado: i % 2 === 1,
    pontos: semanas.filter((s) => s.produto === p.id).map((s) => [s.semana, s.participacao] as const),
  }));

  return (
    <>
      <Secao titulo="Demonstração do resultado (DRE)" acoes={<Ajuda titulo="DRE">{AJUDA.dre}</Ajuda>}>
        <div className="tabela-rolagem">
          <table className="tabela">
            <thead>
              <tr>
                <th scope="col">Conta</th>
                {fechamentos.map((f) => (
                  <th key={f.mes} scope="col" className="num">
                    Mês {f.mes}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l.rotulo} style={l.total ? { fontWeight: 700 } : undefined}>
                  <th scope="row" style={{ fontWeight: l.total ? 700 : 400, color: "var(--cor-texto)" }}>
                    {l.rotulo}
                  </th>
                  {l.valores.map((x, i) => (
                    <td key={i} className={`num ${l.total ? classe(x) : ""}`}>
                      {formatarReais(x)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Secao>

      <div className="grade">
        <Secao titulo={`Balanço no fim do mês ${ultimo.mes}`} acoes={<Ajuda titulo="balanço">{AJUDA.balanco}</Ajuda>}>
          <table className="tabela">
            <tbody>
              <LinhaBalanco rotulo="Caixa" valor={b.caixa} />
              <LinhaBalanco rotulo="Estoques" valor={b.estoques} />
              <LinhaBalanco rotulo="Imobilizado (líquido)" valor={b.imobilizadoLiquido} />
              <LinhaBalanco rotulo="Obras em andamento" valor={b.obrasEmAndamento} />
              <LinhaBalanco rotulo="Ativo total" valor={b.ativoTotal} total />
              <LinhaBalanco rotulo="Crédito emergencial" valor={b.creditoEmergencial} />
              <LinhaBalanco rotulo="Passivo total" valor={b.passivoTotal} total />
              <LinhaBalanco rotulo="Capital social" valor={b.capitalSocial} />
              <LinhaBalanco rotulo="Lucros acumulados" valor={b.lucrosAcumulados} />
              <LinhaBalanco rotulo="Patrimônio líquido" valor={b.patrimonioLiquido} total />
            </tbody>
          </table>
        </Secao>
        <Secao titulo="Evolução">
          <GraficoLinhas
            titulo="Caixa e lucro líquido por mês"
            formatarX={(x) => `m${x}`}
            formatarY={reaisCurtos}
            series={[
              { nome: "Caixa no fim do mês", cor: "#0072B2", pontos: fechamentos.map((f) => [f.mes, f.balanco.caixa] as const) },
              { nome: "Lucro líquido do mês", cor: "#D55E00", tracejado: true, pontos: fechamentos.map((f) => [f.mes, f.lucroLiquido] as const) },
            ]}
          />
        </Secao>
      </div>
      <Secao titulo="Participação de mercado">
        <GraficoLinhas titulo="Participação por semana" formatarX={(x) => `s${x}`} formatarY={(y) => formatarPercentual(y, 0)} series={seriesParticipacao} />
      </Secao>
    </>
  );
}

function LinhaBalanco({ rotulo, valor, total = false }: { rotulo: string; valor: number; total?: boolean }) {
  return (
    <tr style={total ? { fontWeight: 700 } : undefined}>
      <th scope="row" style={{ fontWeight: total ? 700 : 400, color: "var(--cor-texto)" }}>
        {rotulo}
      </th>
      <td className={`num ${total ? classe(valor) : ""}`}>{formatarReais(valor)}</td>
    </tr>
  );
}
