/**
 * Console do produto escolhido (centro da tela de jogo): palco com a imagem e os números do dia, e
 * quatro painéis — preço e concorrência, estoque e suprimento, marketing e P&D, participação.
 * As decisões são enviadas campo a campo, sozinhas (ver `CampoDecisao`).
 */
import { type DecisaoDoAluno, lerReais, type ParticipacaoSemanal, type VisaoAluno } from "@simulador/compartilhado";
import { useState } from "react";
import { formatarNumero, formatarReais } from "../formato";
import { AJUDA } from "./ajuda";
import { CampoDecisao, type ResultadoDoEnvio } from "./CampoDecisao";
import { useConfirmacao } from "./ganchos";
import { ImagemDoProduto } from "./imagens";
import { cobertura, ofertasDoProduto, passoDeQuantidade, pctInteiro, plural, posicaoDaNota, quantidadeCom, reaisCurtos, validarCampo } from "./jogo";
import { useNotificar } from "./notificacoes";
import { Participacao } from "./Participacao";
import { type CampoProduto, camposPendentes, decisoesEfetivas, decomporNota, lerQuantidade } from "./regras";

export type Comandar = (decisoes: DecisaoDoAluno[]) => Promise<ResultadoDoEnvio>;

interface Props {
  v: VisaoAluno;
  produto: string;
  comandar: Comandar;
  /** Último preço com que a equipe vendeu cada produto (para "voltar a vender"). */
  ultimoPreco: ReadonlyMap<string, number>;
  mercado: readonly ParticipacaoSemanal[];
  trocou: boolean;
}

const reaisNoCampo = (c: number | null) => (c === null ? "" : formatarReais(c, { simbolo: false }));
const qtdNoCampo = (n: number) => formatarNumero(n);

export function ConsoleDoProduto({ v, produto, comandar, ultimoPreco, mercado, trocou }: Props) {
  const notificar = useNotificar();
  const [pedirPreco, setPedirPreco] = useState(false);
  const p = v.visao.produtos.find((x) => x.id === produto)!;
  const o = v.visao.empresa.ofertas.find((x) => x.produto === produto)!;
  const ef = decisoesEfetivas(v.visao, v.pendentes)[produto]!;
  const pend = camposPendentes(v.pendentes, produto);
  const editavel = v.relogio.podeEditar;
  const vende = o.decisao.preco !== null;
  const vendeAmanha = ef.preco !== null;
  const custo = o.estoque.quantidade > 0 ? o.estoque.valor / o.estoque.quantidade : (p.fornecedor?.preco ?? null);
  const nota = posicaoDaNota(v, produto);
  const temFabrica = o.fabricasOperando + o.fabricasEmObra > 0;
  const passoQtd = passoDeQuantidade(v.visao, produto);

  const ROTULOS: Record<CampoProduto, string> = {
    preco: "Preço de venda",
    compraMensal: "Compra do fornecedor",
    producaoMensal: "Produção da fábrica",
    publicidadeMensal: "Publicidade",
    pdMensal: "Pesquisa e desenvolvimento",
  };
  const legivel = (campo: CampoProduto, x: number | null) => (campo === "compraMensal" || campo === "producaoMensal" ? formatarNumero(x ?? 0) : x === null ? "fora de venda" : formatarReais(x));

  /** Envia uma decisão de um campo e oferece desfazer (volta ao valor que valia antes). */
  async function decidirCampo(campo: CampoProduto, decisao: DecisaoDoAluno, antes: number | null) {
    const r = await comandar([decisao]);
    if (r === true && decisao.tipo === "produto") {
      const novo = decisao[campo] as number | null;
      notificar(`${p.nome} · ${ROTULOS[campo].toLowerCase()}: ${legivel(campo, antes)} → ${legivel(campo, novo)}`, {
        rotulo: "Desfazer",
        executar: () => void comandar([{ tipo: "produto", produto, [campo]: antes } as DecisaoDoAluno]),
      });
    }
    return r;
  }

  const enviar = (campo: CampoProduto) => async (texto: string) => {
    const r = validarCampo(v.visao, v.pendentes, produto, campo, texto);
    if (r.tipo === "erro") return { motivo: r.motivo };
    if (r.tipo === "sem-mudanca") return null;
    if (campo === "preco") setPedirPreco(false);
    return decidirCampo(campo, r.decisao, ef[campo]);
  };

  const passoReais = (passo: number) => (t: string, sinal: 1 | -1) => {
    const atual = lerReais(t) ?? 0;
    return reaisNoCampo(Math.max(0, atual + sinal * passo));
  };
  const passoUnidades = (t: string, sinal: 1 | -1) => qtdNoCampo(Math.max(0, (lerQuantidade(t) ?? 0) + sinal * passoQtd));

  const campo = (c: CampoProduto, extra: { prefixo?: string; sufixo: string; ajuda: string; textoValendo?: string; mensagem?: string | null }) => {
    const dinheiro = c === "preco" || c === "publicidadeMensal" || c === "pdMensal";
    const fmt = (x: number | null) => (dinheiro ? reaisNoCampo(x) : qtdNoCampo(x ?? 0));
    return (
      <CampoDecisao
        key={`${produto}-${c}`}
        id={`campo-${c}`}
        rotulo={ROTULOS[c]}
        ajuda={extra.ajuda}
        {...(extra.prefixo ? { prefixo: extra.prefixo } : {})}
        sufixo={extra.sufixo}
        efetivo={fmt(ef[c])}
        antes={pend.has(c) ? legivel(c, o.decisao[c]) : null}
        pendente={pend.has(c)}
        desabilitado={!editavel}
        {...(extra.textoValendo ? { textoValendo: extra.textoValendo } : {})}
        mensagem={extra.mensagem ?? null}
        inputMode={dinheiro ? "decimal" : "numeric"}
        passo={c === "preco" ? passoReais(10) : dinheiro ? passoReais(50_000) : passoUnidades}
        enviar={enviar(c)}
      />
    );
  };

  function alternarVenda(ligar: boolean) {
    if (!ligar) void decidirCampo("preco", { tipo: "produto", produto, preco: null }, ef.preco);
    else {
      const preco = ultimoPreco.get(produto);
      if (preco !== undefined) void decidirCampo("preco", { tipo: "produto", produto, preco }, null);
      else {
        setPedirPreco(true);
        document.getElementById("campo-preco")?.focus();
      }
    }
  }

  const cob = cobertura(o.estoque.quantidade, o.vendasAnterior);
  const corDaCobertura = cob < 3 ? "var(--cor-prejuizo)" : cob < 6 ? "var(--cor-alerta)" : "var(--cor-lucro)";

  return (
    <>
      <div className={`j-palco${trocou ? " trocou" : ""}${vende ? "" : " fora"}`}>
        <div className="j-foto">
          <ImagemDoProduto produto={produto} nome={p.nome} />
        </div>
        <div style={{ minWidth: 0 }}>
          <h1>{p.nome}</h1>
          <div className="j-linha-status">
            <label className="j-interruptor">
              <input type="checkbox" role="switch" checked={vendeAmanha} disabled={!editavel} onChange={(e) => alternarVenda(e.target.checked)} />
              <span>{vendeAmanha ? "Vendendo" : "Fora de venda"}</span>
            </label>
            {vende && o.estoque.quantidade <= 0 && <span className="j-selo erro">esgotado</span>}
          </div>
        </div>
        <div className="j-kpis">
          <div>
            <b>{formatarNumero(o.vendasAnterior)}</b>
            <small>vendidos ontem</small>
          </div>
          <div>
            <b>{vende ? pctInteiro(o.participacaoAnterior) : "—"}</b>
            <small>participação</small>
          </div>
          <div>
            <b>
              {nota ? formatarNumero(o.notaAnterior, 0) : "—"}
              {nota && <small className="j-de"> {`${nota.posicao}º de ${nota.de}`}</small>}
            </b>
            <small>nota de compra</small>
          </div>
          <div>
            <b>{vende && custo !== null ? formatarReais(Math.round(o.decisao.preco! - custo)) : "—"}</b>
            <small>margem por {p.unidade}</small>
          </div>
        </div>
      </div>

      <div className="j-paineis">
        <section className="j-bloco" aria-labelledby="t-preco">
          <h2>
            <span className="j-rotulo" id="t-preco">
              Preço e concorrência
            </span>
            <span className="j-rotulo">máx. {formatarReais(p.precoMaximo)}</span>
          </h2>
          {campo("preco", { prefixo: "R$", sufixo: `por ${p.unidade}`, ajuda: AJUDA.preco, ...(ef.preco === null ? { textoValendo: "fora de venda" } : {}), mensagem: pedirPreco ? "Digite o preço para começar a vender." : null })}
          <TabelaDaNota v={v} produto={produto} />
        </section>

        <section className="j-bloco" aria-labelledby="t-estoque">
          <h2>
            <span className="j-rotulo" id="t-estoque">
              Estoque e suprimento
            </span>
            <span className="j-rotulo">{p.fornecedor ? `fornecedor ${formatarReais(p.fornecedor.preco)}/${p.unidade} · qual. ${formatarNumero(p.fornecedor.qualidade)}` : "sem fornecedor externo"}</span>
          </h2>
          <div className="j-estoque">
            <b>
              {quantidadeCom(o.estoque.quantidade, p.unidade)}
            </b>
            <span>{!vende ? "fora de venda" : cob === Infinity ? "sem vendas ontem" : cob === 0 ? "esgotado" : `cobre ${formatarNumero(cob, 1)} dias de venda`}</span>
            <div className="j-cobertura">
              <i style={{ width: `${Math.min(100, ((cob === Infinity ? 0 : cob) / 15) * 100)}%`, background: corDaCobertura }} />
            </div>
          </div>
          <div className={`j-campos${p.fornecedor && temFabrica && p.fabricacao ? " dois" : ""}`}>
            {p.fornecedor && campo("compraMensal", { sufixo: `${plural(p.unidade)}/mês`, ajuda: AJUDA.compraMensal })}
            {p.fabricacao && temFabrica && campo("producaoMensal", { sufixo: `${plural(p.unidade)}/mês`, ajuda: AJUDA.producaoMensal })}
          </div>
          {p.fabricacao && <Fabrica v={v} produto={produto} comandar={comandar} />}
        </section>

        <section className="j-bloco" aria-labelledby="t-marketing">
          <h2>
            <span className="j-rotulo" id="t-marketing">
              Marketing e P&amp;D
            </span>
          </h2>
          <div className={`j-campos${p.fabricacao ? " dois" : ""}`}>
            {campo("publicidadeMensal", { prefixo: "R$", sufixo: "/mês", ajuda: AJUDA.publicidadeMensal })}
            {p.fabricacao && campo("pdMensal", { prefixo: "R$", sufixo: "/mês", ajuda: AJUDA.pdMensal })}
          </div>
          <div className="j-metricas">
            <div>
              <small>Marca</small>
              <b>{formatarNumero(o.marca, 0)}</b>
            </div>
            <div>
              <small>Qualidade</small>
              <b>{formatarNumero(o.qualidade, 0)}</b>
            </div>
            <div>
              <small>Custo por {p.unidade}</small>
              <b>{custo === null ? "—" : formatarReais(Math.round(custo))}</b>
            </div>
          </div>
          <p className="j-dica">{p.fabricacao ? "Publicidade fortalece a marca; P&D sobe a qualidade dos produtos fabricados. Os dois agem aos poucos." : "Publicidade fortalece a marca aos poucos e se desgasta se a verba parar."}</p>
        </section>

        <section className="j-bloco" aria-labelledby="t-participacao">
          <h2>
            <span className="j-rotulo" id="t-participacao">
              Participação no mercado
            </span>
            <span className="j-rotulo">rosca: ontem · linhas: por semana</span>
          </h2>
          <Participacao v={v} produto={produto} mercado={mercado} />
        </section>
      </div>
    </>
  );
}

/** Nota de compra decomposta da equipe e dos concorrentes que vendem, em ordem fixa (a equipe primeiro). */
function TabelaDaNota({ v, produto }: { v: VisaoAluno; produto: string }) {
  const p = v.visao.produtos.find((x) => x.id === produto)!;
  const linhas = ofertasDoProduto(v, produto).filter((l) => l.preco !== null || l.empresa.nos);
  const partes = linhas.map((l) => decomporNota(l.qualidade, l.marca, l.nota, p.pesos));
  const escala = Math.max(80, ...partes.map((d) => Math.max(0, d.qualidade) + Math.max(0, d.marca) + Math.max(0, d.preco)));
  const largura = (x: number) => `${((Math.max(0, x) / escala) * 100).toFixed(1)}%`;
  return (
    <>
      <table className="j-nota">
        <colgroup>
          <col />
          <col style={{ width: "4.9rem" }} />
          <col style={{ width: "2.9rem" }} />
          <col style={{ width: "3.3rem" }} />
          <col style={{ width: "27%" }} />
          <col style={{ width: "4.4rem" }} />
        </colgroup>
        <thead>
          <tr>
            <th scope="col">Empresa</th>
            <th scope="col" className="n">
              Preço
            </th>
            <th scope="col" className="n">
              Qual.
            </th>
            <th scope="col" className="n">
              Marca
            </th>
            <th scope="col" className="barra">
              Nota de compra
            </th>
            <th scope="col" className="n">
              Nota
            </th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l, i) => {
            const d = partes[i]!;
            const vende = l.preco !== null;
            return (
              <tr key={l.empresa.id} className={l.empresa.nos ? "nos" : ""}>
                <td title={l.empresa.nome}>
                  <span className="j-cor" style={{ background: l.empresa.cor }} />
                  {l.empresa.nos ? "Vocês" : l.empresa.nome}
                </td>
                <td className="n">{vende ? formatarReais(l.preco!) : "—"}</td>
                <td className="n">{formatarNumero(l.qualidade, 0)}</td>
                <td className="n">{formatarNumero(l.marca, 0)}</td>
                <td className="barra">
                  {vende ? (
                    <div className="j-barra-nota" role="img" aria-label={`qualidade ${formatarNumero(d.qualidade, 1)}, marca ${formatarNumero(d.marca, 1)}, preço ${formatarNumero(d.preco, 1)} pontos`}>
                      <i className="q" style={{ width: largura(d.qualidade) }} />
                      <i className="m" style={{ width: largura(d.marca) }} />
                      <i className="p" style={{ width: largura(d.preco) }} />
                    </div>
                  ) : (
                    <span className="j-fora">fora de venda</span>
                  )}
                </td>
                <td className="n">
                  {vende ? formatarNumero(l.nota, 0) : "—"}
                  {vende && d.preco < -0.5 && (
                    <small className="negativo" title="O preço acima do que os consumidores consideram normal tira pontos">
                      {" "}
                      ({formatarNumero(d.preco, 0)})
                    </small>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="j-legenda">
        <span>
          <i className="q" />
          qualidade (peso {formatarNumero(p.pesos.qualidade)})
        </span>
        <span>
          <i className="m" />
          marca (peso {formatarNumero(p.pesos.marca)})
        </span>
        <span>
          <i className="p" />
          preço (peso {formatarNumero(p.pesos.preco)})
        </span>
      </div>
    </>
  );
}

function Fabrica({ v, produto, comandar }: { v: VisaoAluno; produto: string; comandar: Comandar }) {
  const p = v.visao.produtos.find((x) => x.id === produto)!;
  const f = p.fabricacao!;
  const o = v.visao.empresa.ofertas.find((x) => x.produto === produto)!;
  const confirmacao = useConfirmacao();
  const notificar = useNotificar();
  const construir = () =>
    void comandar([{ tipo: "construirFabrica", produto }]).then((r) => {
      if (r === true) notificar(`Fábrica de ${p.nome.toLowerCase()} em obra: fica pronta em ${f.prazoConstrucaoDias} dias.`);
      else notificar(`Não deu para construir a fábrica: ${r.motivo}`);
    });
  const situacao =
    o.fabricasOperando > 0
      ? `${o.fabricasOperando} fábrica(s) operando: até ${formatarNumero(o.capacidadeProducaoPorTick * v.visao.ticksPorMes)} ${plural(p.unidade)}/mês.${o.fabricasEmObra > 0 ? ` Mais ${o.fabricasEmObra} em obra.` : ""}`
      : o.fabricasEmObra > 0
        ? `Fábrica em obra: fica pronta em até ${f.prazoConstrucaoDias} dias.`
        : p.fornecedor
          ? "Fabricar pode sair mais barato que comprar pronto."
          : "Este produto só pode ser fabricado.";
  return (
    <div className="j-fabrica">
      <span>{situacao}</span>
      <button ref={confirmacao.ref} type="button" className={`botao${confirmacao.armado ? " j-confirmar" : ""}`} disabled={!v.relogio.podeEditar} onClick={() => confirmacao.clicar(construir)}>
        {confirmacao.armado ? `Construir por ${reaisCurtos(f.capex)}?` : o.fabricasOperando + o.fabricasEmObra > 0 ? "Mais uma fábrica" : "Construir fábrica"}
      </button>
      <small>
        {reaisCurtos(f.capex)} · {f.prazoConstrucaoDias} dias de obra · {reaisCurtos(f.custoFixoMensal)}/mês · até {formatarNumero(f.capacidadeUnidadesPorDia)} {plural(p.unidade)}/dia
      </small>
    </div>
  );
}
