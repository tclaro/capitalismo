/**
 * Coluna da esquerda da tela de jogo: um cartão por produto (imagem, participação, tendência,
 * alertas, tecla de atalho) e a empresa (pontos de venda, capacidade de venda, fábricas).
 */
import type { ParticipacaoSemanal, VisaoAluno } from "@simulador/compartilhado";
import { formatarNumero, formatarPercentual } from "../formato";
import type { Comandar } from "./Console";
import { useConfirmacao } from "./ganchos";
import { ImagemDoProduto } from "./imagens";
import { cobertura, pctInteiro, plural, reaisCurtos } from "./jogo";
import { useNotificar } from "./notificacoes";
import { camposPendentes } from "./regras";

export function CartoesDosProdutos({ v, selecionado, aoSelecionar, mercado }: { v: VisaoAluno; selecionado: string; aoSelecionar: (id: string) => void; mercado: readonly ParticipacaoSemanal[] }) {
  return (
    <div className="j-produtos">
      {v.visao.produtos.map((p, i) => {
        const o = v.visao.empresa.ofertas.find((x) => x.produto === p.id)!;
        const vende = o.decisao.preco !== null;
        const semanas = mercado.filter((r) => r.produto === p.id && r.empresa === v.empresa).sort((a, b) => a.semana - b.semana);
        const ultimaSemana = semanas.at(-1)?.participacao;
        const t = vende && ultimaSemana !== undefined ? o.participacaoAnterior - ultimaSemana : 0;
        const pend = camposPendentes(v.pendentes, p.id).size > 0;
        let selo: { classe: string; texto: string } | null = null;
        if (!vende) selo = pend ? { classe: "neutro", texto: "começa amanhã" } : { classe: "neutro", texto: "fora de venda" };
        else if (o.estoque.quantidade <= 0) selo = { classe: "erro", texto: "esgotado" };
        else if (cobertura(o.estoque.quantidade, o.vendasAnterior) < 3) selo = { classe: "alerta", texto: "estoque baixo" };
        else if (pend) selo = { classe: "neutro", texto: "mudança enviada" };
        return (
          <button key={p.id} type="button" className={`j-cartao${vende ? "" : " fora"}`} aria-current={p.id === selecionado} aria-keyshortcuts={i < 9 ? String(i + 1) : undefined} onClick={() => aoSelecionar(p.id)}>
            <span className="j-mini">
              <ImagemDoProduto produto={p.id} nome={p.nome} />
            </span>
            <span style={{ minWidth: 0 }}>
              <span className="j-nome">{p.nome}</span>
              <span className="j-sub">{selo ? <span className={`j-selo ${selo.classe}`}>{selo.texto}</span> : `${formatarNumero(o.vendasAnterior)} ${plural(p.unidade)}/dia`}</span>
            </span>
            <span className="j-part">
              <b>{vende ? pctInteiro(o.participacaoAnterior) : "—"}</b>
              <span className="j-sub">
                <span className="j-seta">{Math.abs(t) < 0.005 ? "" : t > 0 ? <span className="positivo" aria-label="subindo">▲</span> : <span className="negativo" aria-label="caindo">▼</span>}</span>
                {i < 9 && <span className="j-tecla">{i + 1}</span>}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function BlocoDaEmpresa({ v, comandar }: { v: VisaoAluno; comandar: Comandar }) {
  const e = v.visao.empresa;
  const pdv = v.visao.custos.pontoDeVenda;
  const abrir = useConfirmacao();
  const fechar = useConfirmacao();
  const notificar = useNotificar();
  const editavel = v.relogio.podeEditar;
  const vendidoOntem = e.ofertas.reduce((s, o) => s + o.vendasAnterior, 0);
  const uso = e.capacidadeVendaPorTick > 0 ? Math.min(1, vendidoOntem / e.capacidadeVendaPorTick) : 0;
  const fabricas = e.ofertas.filter((o) => o.fabricasOperando + o.fabricasEmObra > 0);
  const nome = (id: string) => v.visao.produtos.find((p) => p.id === id)?.nome ?? id;
  const resultado = (ok: string) => (r: Awaited<ReturnType<Comandar>>) => notificar(r === true ? ok : `Não deu: ${r.motivo}`);

  return (
    <section className="j-bloco" aria-labelledby="t-empresa">
      <h2>
        <span className="j-rotulo" id="t-empresa">
          Empresa
        </span>
      </h2>
      <div className="j-empresa-linha">
        <span>
          <b>{e.pontosDeVendaOperando}</b> pontos de venda {e.pontosDeVendaEmObra > 0 && <span className="j-selo neutro">+{e.pontosDeVendaEmObra} em obra</span>}
        </span>
        <span className="j-botoes">
          <button
            ref={fechar.ref}
            type="button"
            className={`botao${fechar.armado ? " j-confirmar" : ""}`}
            aria-label={fechar.armado ? undefined : "Fechar um ponto de venda"}
            disabled={!editavel || e.pontosDeVendaOperando + e.pontosDeVendaEmObra === 0}
            onClick={() => fechar.clicar(() => void comandar([{ tipo: "fecharPontoDeVenda", quantidade: 1 }]).then(resultado("Ponto de venda fechado.")))}
          >
            {fechar.armado ? "Fechar 1 loja?" : "−"}
          </button>
          <button
            ref={abrir.ref}
            type="button"
            className={`botao${abrir.armado ? " j-confirmar" : ""}`}
            disabled={!editavel}
            onClick={() => abrir.clicar(() => void comandar([{ tipo: "abrirPontoDeVenda", quantidade: 1 }]).then(resultado(`Ponto de venda em obra: fica pronto em ${pdv.prazoAberturaDias} dias.`)))}
          >
            {abrir.armado ? `Abrir por ${reaisCurtos(pdv.custoAbertura)}?` : "+ Abrir"}
          </button>
        </span>
        <small>
          Abrir custa {reaisCurtos(pdv.custoAbertura)} e leva {pdv.prazoAberturaDias} dias · {reaisCurtos(pdv.custoFixoMensal)}/mês cada
        </small>
        <div className="j-medidor" title="Uso da capacidade de venda">
          <i style={{ width: `${(uso * 100).toFixed(0)}%`, background: uso > 0.9 ? "var(--cor-alerta)" : undefined }} />
        </div>
        <small>
          Capacidade de venda: {formatarNumero(e.capacidadeVendaPorTick)} itens/dia · usando {formatarPercentual(uso, 0)}
        </small>
      </div>
      <div className="j-empresa-linha">
        <span>Fábricas</span>
        <span />
        <small>{fabricas.length ? fabricas.map((o) => `${nome(o.produto)}: ${o.fabricasOperando} operando${o.fabricasEmObra ? `, ${o.fabricasEmObra} em obra` : ""}`).join(" · ") : "Nenhuma. Construa no painel de cada produto."}</small>
      </div>
      {e.creditoEmergencial > 0 && (
        <p className="j-alerta-caixa" role="alert">
          Caixa negativo: usando {reaisCurtos(e.creditoEmergencial)} de crédito emergencial, com juros de {formatarPercentual(v.visao.custos.jurosEmergencialMensal)} ao mês.
        </p>
      )}
    </section>
  );
}
