/**
 * Painéis de decisão da cadeia (coluna ao lado do palco): um para cada tipo de instalação. Os campos
 * enviam sozinhos, como no console de produtos (`CampoDecisao`); o que o servidor recusar volta no campo.
 */
import { type DecisaoDoAluno, lerReais, type VisaoAluno } from "@simulador/compartilhado";
import { useState } from "react";
import { formatarNumero, formatarReais } from "../../formato";
import { CampoDecisao, type ResultadoDoEnvio } from "../CampoDecisao";
import type { Comandar } from "../Console";
import { useConfirmacao } from "../ganchos";
import { passoDeQuantidade, plural, quantidadeCom, reaisCurtos, validarCampo } from "../jogo";
import { useNotificar } from "../notificacoes";
import { camposPendentes, decisoesEfetivas, lerQuantidade } from "../regras";
import {
  atividadeDe,
  capacidadeMensal,
  efetivasDaCadeia,
  estadoDaFabrica,
  estadoDaFazenda,
  type Fazenda,
  materiaPrima,
  type MateriaPrima,
  origemEfetiva,
  type OrigemDoInsumo,
  produtosEmVenda,
  unidadeCurta,
  produzivel,
  temPendencia,
  vemDaFazenda,
} from "./modelo";
import { Pilula } from "./pecas";

export interface PropsDoPainel {
  v: VisaoAluno;
  comandar: Comandar;
}

const reaisNoCampo = (c: number) => formatarReais(c, { simbolo: false });
const limitar = (x: number, min: number, max: number) => Math.max(min, Math.min(max, x));

/** Passo do +/−: potência de 10 perto de 5% da capacidade. */
export const passoDaCapacidade = (capacidade: number) => Math.max(1, 10 ** Math.floor(Math.log10(Math.max(10, capacidade * 0.05))));

function useEnvio(comandar: Comandar) {
  const notificar = useNotificar();
  return async (decisoes: DecisaoDoAluno[], ok?: string): Promise<ResultadoDoEnvio> => {
    const r = await comandar(decisoes);
    if (r === true) {
      if (ok) notificar(ok);
    } else notificar(`Não deu: ${r.motivo}`);
    return r;
  };
}

function Titulo({ cor, texto, sub }: { cor: string; texto: string; sub?: string }) {
  return (
    <h2 className="j-painel-titulo" style={{ "--c": `var(--cor-${cor})` } as React.CSSProperties}>
      <i />
      <span>{texto}</span>
      {sub && <small>{sub}</small>}
    </h2>
  );
}

function Resumo({ itens }: { itens: [string, string][] }) {
  return (
    <div className="j-resumo">
      {itens.map(([rotulo, valor]) => (
        <div key={rotulo}>
          <span className="j-rotulo">{rotulo}</span>
          <b>{valor}</b>
        </div>
      ))}
    </div>
  );
}

/** Campo de um dos cinco campos de produto (preço, compra, produção…) com a mesma validação do console. */
function CampoDeProduto({ v, produto, campo, rotulo, sufixo, ajuda, comandar }: PropsDoPainel & { produto: string; campo: "compraMensal" | "producaoMensal"; rotulo: string; sufixo: string; ajuda: string }) {
  const ef = decisoesEfetivas(v.visao, v.pendentes)[produto]!;
  const o = v.visao.empresa.ofertas.find((x) => x.produto === produto)!;
  const pend = camposPendentes(v.pendentes, produto).has(campo);
  const passo = passoDeQuantidade(v.visao, produto);
  return (
    <CampoDecisao
      key={`${produto}-${campo}`}
      id={`campo-${campo}-${produto}`}
      rotulo={rotulo}
      ajuda={ajuda}
      sufixo={sufixo}
      efetivo={formatarNumero(ef[campo] ?? 0)}
      antes={pend ? formatarNumero(o.decisao[campo] ?? 0) : null}
      pendente={pend}
      desabilitado={!v.relogio.podeEditar}
      inputMode="numeric"
      passo={(t, sinal) => formatarNumero(Math.max(0, (lerQuantidade(t) ?? 0) + sinal * passo))}
      enviar={async (texto) => {
        const r = validarCampo(v.visao, v.pendentes, produto, campo, texto);
        if (r.tipo === "erro") return { motivo: r.motivo };
        if (r.tipo === "sem-mudanca") return null;
        return comandar([r.decisao]);
      }}
    />
  );
}

// ---------------------------------------------------------------------------------------------
// Fazenda
// ---------------------------------------------------------------------------------------------

export function PainelDaFazenda({ v, comandar, fazenda, aoTrocar }: PropsDoPainel & { fazenda: Fazenda; aoTrocar: (f: Fazenda) => void }) {
  const c = v.visao.cadeia!;
  const ef = efetivasDaCadeia(v);
  const a = atividadeDe(c, fazenda.atividade)!;
  const editavel = v.relogio.podeEditar;
  const estado = estadoDaFazenda(v, fazenda, ef.producaoDaFazenda[fazenda.id]);
  const principal = materiaPrima(c, a.produz[0]!.produto);
  const unidade = principal?.unidade ?? "un";
  const cap = capacidadeMensal(a, v.visao.ticksPorMes);
  const efetiva = ef.producaoDaFazenda[fazenda.id] ?? fazenda.producaoMensal;
  const pend = temPendencia(v.pendentes, "ajustarFazenda", (d) => d.tipo === "ajustarFazenda" && d.fazenda === fazenda.id);
  const trocaPendente = ef.trocas[fazenda.id];
  const mps = a.produz.flatMap((x) => materiaPrima(c, x.produto) ?? []);

  return (
    <>
      <Titulo cor="fazenda" texto={a.nome} sub={fazenda.id} />
      <div className="j-linha-estado">
        <Pilula estado={estado} />
        {trocaPendente && <span className="j-dica-curta">troca para {atividadeDe(c, trocaPendente)?.nome.toLowerCase()} enviada: vale amanhã</span>}
      </div>
      <CampoDecisao
        key={`producao-${fazenda.id}`}
        id="campo-producao-fazenda"
        rotulo="Produção por mês"
        ajuda={`Quanto a fazenda produz por mês, em ${plural(unidade)}. A capacidade é ${formatarNumero(cap)} por mês; o estoque cheio para a produção, mas o custo fixo continua.`}
        sufixo={`${unidadeCurta(unidade)}/mês`}
        efetivo={formatarNumero(efetiva)}
        antes={pend ? formatarNumero(fazenda.producaoMensal) : null}
        pendente={pend}
        desabilitado={!editavel || fazenda.emConversao}
        inputMode="numeric"
        passo={(t, sinal) => formatarNumero(limitar((lerQuantidade(t) ?? 0) + sinal * passoDaCapacidade(cap), 0, cap))}
        enviar={async (texto) => {
          const q = lerQuantidade(texto);
          if (q === null) return { motivo: "digite um número inteiro" };
          if (q > cap) return { motivo: `a capacidade é ${formatarNumero(cap)} por mês` };
          if (q === efetiva) return null;
          return comandar([{ tipo: "ajustarFazenda", fazenda: fazenda.id, producaoMensal: q }]);
        }}
      />
      <Resumo
        itens={[
          ["Qualidade", formatarNumero(fazenda.qualidade, 0)],
          ["Capacidade", `${formatarNumero(cap)}/mês`],
          ["Custo fixo", `${reaisCurtos(a.custoFixoMensal)}/mês`],
        ]}
      />
      {a.produz.length > 1 && <p className="j-dica">Esta atividade produz {a.produz.map((x) => `${formatarNumero(x.proporcao, 1)} ${materiaPrima(c, x.produto)?.nome.toLowerCase() ?? x.produto}`).join(" e ")} para cada {unidade} de {principal?.nome.toLowerCase()}. O custo é repartido entre eles.</p>}
      {!fazenda.emObra && mps.map((m) => <VendaDaMateriaPrima key={m.produto} v={v} comandar={comandar} m={m} />)}
      <button type="button" className="botao" disabled={!editavel || fazenda.emObra || fazenda.emConversao || trocaPendente !== undefined} onClick={() => aoTrocar(fazenda)}>
        Trocar atividade…
      </button>
    </>
  );
}

/** Oferta no atacado e venda à cooperativa de uma matéria-prima. */
function VendaDaMateriaPrima({ v, comandar, m }: PropsDoPainel & { m: MateriaPrima }) {
  const c = v.visao.cadeia!;
  const ef = efetivasDaCadeia(v);
  const editavel = v.relogio.podeEditar;
  const faixa = c.faixaDoAtacado[m.produto];
  const oferta = ef.oferta[m.produto];
  const pend = temPendencia(v.pendentes, "ofertarNoAtacado", (d) => d.tipo === "ofertarNoAtacado" && d.produto === m.produto);
  const preco = oferta?.preco ?? faixa?.teto ?? m.precoFornecedor;
  const quantidade = oferta?.quantidadeMensal ?? 0;
  const vigente = m.ofertaAtacado;
  const [qtdCoop, setQtdCoop] = useState("");
  const notificar = useNotificar();
  const ordem = ef.cooperativa[m.produto] ?? 0;

  const enviarOferta = (novoPreco: number, novaQuantidade: number) => comandar([{ tipo: "ofertarNoAtacado", produto: m.produto, preco: novoPreco, quantidadeMensal: novaQuantidade }]);

  async function vender() {
    const q = lerQuantidade(qtdCoop);
    if (q === null || q <= 0) return notificar("Digite quantas unidades vender à cooperativa.");
    if (q > m.estoque.quantidade) return notificar(`Só há ${quantidadeCom(m.estoque.quantidade, m.unidade)} em estoque.`);
    const r = await comandar([{ tipo: "venderParaCooperativa", produto: m.produto, quantidade: q }]);
    if (r === true) {
      setQtdCoop("");
      notificar(`Ordem enviada: ${quantidadeCom(q, m.unidade)} de ${m.nome.toLowerCase()} à cooperativa, a ${formatarReais(m.precoCooperativa)}. Vale amanhã.`);
    } else notificar(`Não deu: ${r.motivo}`);
  }

  return (
    <section className="j-venda-mp" aria-label={`Venda de ${m.nome}`}>
      <h3>
        <span>{m.nome}</span>
        <small>
          {formatarNumero(m.estoque.quantidade)} {unidadeCurta(m.unidade)} · qualidade {formatarNumero(m.estoque.qualidade, 0)}
        </small>
      </h3>
      <div className="j-campos">
        <CampoDecisao
          key={`preco-${m.produto}`}
          id={`campo-preco-atacado-${m.produto}`}
          rotulo="Preço no atacado"
          ajuda={`Preço por ${m.unidade} para as outras equipes. Entre o piso da cooperativa e o preço do fornecedor externo; quanto mais perto do piso, mais elas compram.`}
          prefixo="R$"
          sufixo={`por ${m.unidade}`}
          efetivo={reaisNoCampo(preco)}
          antes={pend && vigente ? reaisNoCampo(vigente.preco) : null}
          pendente={pend}
          desabilitado={!editavel}
          {...(oferta === null ? { textoValendo: "sem oferta" } : {})}
          inputMode="decimal"
          passo={(t, sinal) => reaisNoCampo(limitar((lerReais(t) ?? preco) + sinal * 10, faixa?.piso ?? 0, faixa?.teto ?? preco))}
          enviar={async (texto) => {
            const centavos = lerReais(texto);
            if (centavos === null) return { motivo: "digite um preço em reais, ex.: 2,40" };
            if (faixa && (centavos < faixa.piso || centavos > faixa.teto)) return { motivo: `entre ${formatarReais(faixa.piso)} e ${formatarReais(faixa.teto)}` };
            if (quantidade <= 0) return { motivo: "defina antes a quantidade oferecida" };
            if (centavos === preco) return null;
            return enviarOferta(centavos, quantidade);
          }}
        />
        <CampoDecisao
          key={`qtd-${m.produto}`}
          id={`campo-qtd-atacado-${m.produto}`}
          rotulo="Quantidade oferecida"
          ajuda="Quanto vocês se dispõem a vender por mês às outras equipes. Zero retira a oferta. Vale a partir de amanhã e dá para mudar a qualquer dia."
          sufixo={`${unidadeCurta(m.unidade)}/mês`}
          efetivo={formatarNumero(quantidade)}
          antes={pend ? formatarNumero(vigente?.quantidadeMensal ?? 0) : null}
          pendente={pend}
          desabilitado={!editavel}
          inputMode="numeric"
          passo={(t, sinal) => formatarNumero(Math.max(0, (lerQuantidade(t) ?? 0) + sinal * passoDaCapacidade(Math.max(100, quantidade)))) }
          enviar={async (texto) => {
            const q = lerQuantidade(texto);
            if (q === null) return { motivo: "digite um número inteiro" };
            if (q === quantidade) return null;
            return enviarOferta(preco, q);
          }}
        />
      </div>
      <div className="j-coop">
        <span className="j-rotulo">Cooperativa · {formatarReais(m.precoCooperativa)} por {m.unidade}</span>
        <span className="j-coop-linha">
          <input aria-label={`Quantidade de ${m.nome} para vender à cooperativa`} inputMode="numeric" autoComplete="off" disabled={!editavel} value={qtdCoop} placeholder="0" onChange={(e) => setQtdCoop(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void vender()} />
          <button type="button" className="botao" disabled={!editavel || m.estoque.quantidade <= 0} onClick={() => setQtdCoop(String(Math.floor(m.estoque.quantidade)))}>
            Tudo
          </button>
          <button type="button" className="botao primario" disabled={!editavel} onClick={() => void vender()}>
            Vender
          </button>
        </span>
        {ordem > 0 && (
          <small className="j-dica-curta" role="status">
            Ordem enviada: {formatarNumero(ordem)} {unidadeCurta(m.unidade)} à cooperativa amanhã.
          </small>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------------------------
// Fábrica
// ---------------------------------------------------------------------------------------------

export function PainelDaFabrica({ v, comandar, produto, aoIrParaProdutos }: PropsDoPainel & { produto: string; aoIrParaProdutos: (p: string) => void }) {
  const c = v.visao.cadeia!;
  const p = v.visao.produtos.find((x) => x.id === produto)!;
  const f = p.fabricacao!;
  const o = v.visao.empresa.ofertas.find((x) => x.produto === produto)!;
  const origem = origemEfetiva(v, produto);
  const editavel = v.relogio.podeEditar;
  const envio = useEnvio(comandar);
  const producao = decisoesEfetivas(v.visao, v.pendentes)[produto]?.producaoMensal ?? 0;
  const estado = estadoDaFabrica(o, producao);
  const custo = o.estoque.quantidade > 0 ? o.estoque.valor / o.estoque.quantidade : null;

  const escolher = (insumo: string, nome: string, valor: OrigemDoInsumo) => {
    if (origem.insumos[insumo] === valor || (valor === "fornecedor" && origem.insumos[insumo] === undefined)) return;
    void envio([{ tipo: "produto", produto, origemInsumos: { [insumo]: valor } }], `${p.nome} · ${nome.toLowerCase()} agora vem de ${valor === "propria" ? "estoque próprio" : "fornecedor externo"}. Vale a partir de amanhã.`);
  };

  return (
    <>
      <Titulo cor="fabrica" texto={`Fábrica de ${p.nome.toLowerCase()}`} sub={`${o.fabricasOperando} operando${o.fabricasEmObra > 0 ? ` · ${o.fabricasEmObra} em obra` : ""}`} />
      <div className="j-linha-estado">
        <Pilula estado={estado} />
      </div>
      <CampoDeProduto v={v} comandar={comandar} produto={produto} campo="producaoMensal" rotulo="Produção por mês" sufixo={`${plural(p.unidade)}/mês`} ajuda={`Quanto a fábrica produz por mês. A capacidade é de até ${formatarNumero(o.capacidadeProducaoPorTick * v.visao.ticksPorMes)} por mês com as fábricas operando.`} />

      <div className="j-origens">
        <span className="j-rotulo">De onde vem cada insumo</span>
        {f.receita.map((i) => {
          const mp = materiaPrima(c, i.produto);
          const nome = mp?.nome ?? v.sala.produtos.find((x) => x.id === i.produto)?.nome ?? v.sala.materiasPrimas.find((x) => x.id === i.produto)?.nome ?? i.produto;
          const escolha = origem.insumos[i.produto] ?? "fornecedor";
          const porUnidade = i.quantidadePorLote / f.unidadesPorLote;
          const custoMedio = mp && mp.estoque.quantidade > 0 ? mp.estoque.valor / mp.estoque.quantidade : null;
          return (
            <div key={i.produto} className="j-origem" data-insumo={i.produto}>
              <span className="j-origem-nome">
                {nome} <small>{formatarNumero(porUnidade, 2)} {mp ? unidadeCurta(mp.unidade) : ""} por {p.unidade}</small>
              </span>
              <span className="j-opcoes">
                {mp && produzivel(c, i.produto) && (
                  <button type="button" className={`j-opcao${escolha === "propria" ? " sel" : ""}`} aria-pressed={escolha === "propria"} disabled={!editavel} onClick={() => escolher(i.produto, nome, "propria")}>
                    <span>
                      <b>Estoque próprio</b>
                      <small>{mp.estoque.quantidade > 0 ? `${formatarNumero(mp.estoque.quantidade)} ${unidadeCurta(mp.unidade)} em estoque` : "sem estoque agora"}</small>
                    </span>
                    <span className="preco">
                      {custoMedio === null ? "—" : formatarReais(Math.round(custoMedio))}
                      <small>qualidade {formatarNumero(mp.estoque.qualidade, 0)}</small>
                    </span>
                  </button>
                )}
                <button type="button" className={`j-opcao${escolha === "fornecedor" ? " sel" : ""}`} aria-pressed={escolha === "fornecedor"} disabled={!editavel || !(mp && produzivel(c, i.produto))} onClick={() => escolher(i.produto, nome, "fornecedor")}>
                  <span>
                    <b>Fornecedor externo</b>
                    <small>sempre disponível</small>
                  </span>
                  <span className="preco">
                    {formatarReais(i.precoFornecedor)}
                    <small>qualidade {formatarNumero(i.qualidadeFornecedor, 0)}</small>
                  </span>
                </button>
              </span>
            </div>
          );
        })}
        <p className="j-dica">{c.completaComFornecedor ? "Se a origem escolhida não tiver o bastante, o que falta vem do fornecedor externo." : "Sem estoque próprio suficiente, a produção diminui até o que o estoque cobre."}</p>
      </div>

      <Resumo
        itens={[
          ["Custo por " + p.unidade, custo === null ? "—" : formatarReais(Math.round(custo))],
          ["Qualidade", formatarNumero(o.qualidade, 0)],
          ["Capacidade", `${formatarNumero(o.capacidadeProducaoPorTick * v.visao.ticksPorMes)}/mês`],
        ]}
      />
      <div className="j-linha-botoes">
        <ConstruirFabrica v={v} comandar={comandar} produto={produto} rotulo={o.fabricasOperando + o.fabricasEmObra > 0 ? "Mais uma fábrica" : "Construir fábrica"} />
        <button type="button" className="botao" onClick={() => aoIrParaProdutos(produto)}>
          Preço e marketing <kbd>V</kbd>
        </button>
      </div>
    </>
  );
}

function ConstruirFabrica({ v, comandar, produto, rotulo }: PropsDoPainel & { produto: string; rotulo: string }) {
  const p = v.visao.produtos.find((x) => x.id === produto)!;
  const f = p.fabricacao!;
  const confirmacao = useConfirmacao();
  const envio = useEnvio(comandar);
  return (
    <button
      ref={confirmacao.ref}
      type="button"
      className={`botao${confirmacao.armado ? " j-confirmar" : ""}`}
      disabled={!v.relogio.podeEditar}
      title={`${reaisCurtos(f.capex)} · ${f.prazoConstrucaoDias} dias de obra · ${reaisCurtos(f.custoFixoMensal)}/mês`}
      onClick={() => confirmacao.clicar(() => void envio([{ tipo: "construirFabrica", produto }], `Fábrica de ${p.nome.toLowerCase()} em obra: fica pronta em ${f.prazoConstrucaoDias} dias.`))}
    >
      {confirmacao.armado ? `Construir por ${reaisCurtos(f.capex)}?` : rotulo}
    </button>
  );
}

export function PainelNovaFabrica({ v, comandar }: PropsDoPainel) {
  const fabricaveis = v.visao.produtos.filter((p) => p.fabricacao !== null);
  return (
    <>
      <Titulo cor="fabrica" texto="Nova fábrica" />
      <p className="j-dica">Fabricar pode sair mais barato que comprar pronto, e dá escolher a origem de cada insumo. Escolha o produto:</p>
      <ul className="j-lista-construcao">
        {fabricaveis.map((p) => {
          const o = v.visao.empresa.ofertas.find((x) => x.produto === p.id)!;
          const f = p.fabricacao!;
          const nelas = o.fabricasOperando + o.fabricasEmObra;
          return (
            <li key={p.id} data-produto={p.id}>
              <span>
                <b>{p.nome}</b>
                <small>
                  {reaisCurtos(f.capex)} · {f.prazoConstrucaoDias} dias de obra · {reaisCurtos(f.custoFixoMensal)}/mês · até {formatarNumero(f.capacidadeUnidadesPorDia)} {plural(p.unidade)}/dia
                  {nelas > 0 ? ` · já tem ${nelas}` : ""}
                </small>
              </span>
              <ConstruirFabrica v={v} comandar={comandar} produto={p.id} rotulo={nelas > 0 ? "Mais uma" : "Construir"} />
            </li>
          );
        })}
      </ul>
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// Nova fazenda
// ---------------------------------------------------------------------------------------------

export function PainelNovaFazenda({ v, comandar }: PropsDoPainel) {
  const c = v.visao.cadeia!;
  const [escolhida, setEscolhida] = useState(c.atividades[0]!.id);
  const [producao, setProducao] = useState<string | null>(null);
  const a = atividadeDe(c, escolhida) ?? c.atividades[0]!;
  const cap = capacidadeMensal(a, v.visao.ticksPorMes);
  const confirmacao = useConfirmacao();
  const envio = useEnvio(comandar);
  const texto = producao ?? formatarNumero(cap);
  const q = lerQuantidade(texto);
  const erro = q === null ? "digite um número inteiro" : q > cap ? `a capacidade é ${formatarNumero(cap)} por mês` : null;
  const un = (id: string) => materiaPrima(c, id)?.unidade ?? "un";

  return (
    <>
      <Titulo cor="fazenda" texto="Nova fazenda" />
      <p className="j-dica">A fazenda produz matéria-prima para as suas fábricas, para o atacado ou para a loja. Depois de pronta, trocar de atividade custa dinheiro e dias parada.</p>
      <div className="j-opcoes coluna" role="radiogroup" aria-label="Atividade da nova fazenda">
        {c.atividades.map((x) => (
          <button
            key={x.id}
            type="button"
            role="radio"
            aria-checked={x.id === a.id}
            className={`j-opcao${x.id === a.id ? " sel" : ""}`}
            data-atividade={x.id}
            onClick={() => {
              setEscolhida(x.id);
              setProducao(null);
            }}
          >
            <span>
              <b>{x.nome}</b>
              <small>
                produz {x.produz.map((y) => materiaPrima(c, y.produto)?.nome.toLowerCase() ?? y.produto).join(" + ")} · {x.prazoConstrucaoDias} dias de obra
              </small>
            </span>
            <span className="preco">
              {reaisCurtos(x.capex)}
              <small>{reaisCurtos(x.custoFixoMensal)}/mês</small>
            </span>
          </button>
        ))}
      </div>
      <label className="j-campo-simples">
        <span className="j-rotulo">Produção inicial por mês ({un(a.produz[0]!.produto)})</span>
        <input id="campo-producao-nova" inputMode="numeric" autoComplete="off" value={texto} onChange={(e) => setProducao(e.target.value)} aria-invalid={erro !== null} />
        <small className={erro ? "negativo" : "j-dica-curta"}>{erro ?? `capacidade: ${formatarNumero(cap)} por mês`}</small>
      </label>
      <button
        ref={confirmacao.ref}
        type="button"
        className={`botao primario${confirmacao.armado ? " j-confirmar" : ""}`}
        disabled={!v.relogio.podeEditar || erro !== null}
        onClick={() => confirmacao.clicar(() => void envio([{ tipo: "construirFazenda", atividade: a.id, producaoMensal: q! }], `Fazenda de ${a.nome.toLowerCase()} em obra: fica pronta em ${a.prazoConstrucaoDias} dias.`))}
      >
        {confirmacao.armado ? `Construir por ${reaisCurtos(a.capex)}?` : `Construir fazenda · ${reaisCurtos(a.capex)}`}
      </button>
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// Loja
// ---------------------------------------------------------------------------------------------

export function PainelDaLoja({ v, comandar, aoIrParaProdutos }: PropsDoPainel & { aoIrParaProdutos: (p: string) => void }) {
  const c = v.visao.cadeia!;
  const e = v.visao.empresa;
  const envio = useEnvio(comandar);
  const vendendo = produtosEmVenda(v);
  const daFazenda = v.visao.produtos.filter((p) => vemDaFazenda(c, p));
  const vendidoOntem = e.ofertas.reduce((s, o) => s + o.vendasAnterior, 0);
  const uso = e.capacidadeVendaPorTick > 0 ? Math.min(1, vendidoOntem / e.capacidadeVendaPorTick) : 0;

  return (
    <>
      <Titulo cor="loja" texto="Loja" sub={`${e.pontosDeVendaOperando} ponto(s) de venda`} />
      <p className="j-dica">A loja vende o que as fábricas e as fazendas entregam. Preço, publicidade e P&amp;D de cada produto ficam no console de Produtos.</p>
      <ul className="j-lista-loja">
        {v.visao.produtos.map((p) => {
          const o = e.ofertas.find((x) => x.produto === p.id)!;
          const vende = o.decisao.preco !== null;
          return (
            <li key={p.id} className={vende ? "" : "fora"} data-produto={p.id}>
              <span className="nome">{p.nome}</span>
              <span className="num">{vende ? formatarReais(o.decisao.preco!) : "fora de venda"}</span>
              <span className="num">
                {formatarNumero(o.estoque.quantidade)} {plural(p.unidade)}
              </span>
              <button type="button" className="botao" onClick={() => aoIrParaProdutos(p.id)} aria-label={`Abrir ${p.nome} no console de produtos`}>
                Abrir
              </button>
            </li>
          );
        })}
      </ul>
      {daFazenda.map((p) => {
        const origem = origemEfetiva(v, p.id).compraPronta;
        const mp = materiaPrima(c, p.id);
        return (
          <section key={p.id} className="j-origens" aria-label={`Origem de ${p.nome}`}>
            <span className="j-rotulo">{p.nome} · de onde vem</span>
            <span className="j-opcoes">
              <button type="button" className={`j-opcao${origem === "fornecedor" ? " sel" : ""}`} aria-pressed={origem === "fornecedor"} disabled={!v.relogio.podeEditar} onClick={() => origem !== "fornecedor" && void envio([{ tipo: "produto", produto: p.id, origemCompraPronta: "fornecedor" }], `${p.nome} agora vem do fornecedor externo. Vale amanhã.`)}>
                <span>
                  <b>Fornecedor externo</b>
                  <small>compra pronto</small>
                </span>
                <span className="preco">{p.fornecedor ? formatarReais(p.fornecedor.preco) : "—"}</span>
              </button>
              <button type="button" className={`j-opcao${origem === "propria" ? " sel" : ""}`} aria-pressed={origem === "propria"} disabled={!v.relogio.podeEditar} onClick={() => origem !== "propria" && void envio([{ tipo: "produto", produto: p.id, origemCompraPronta: "propria" }], `${p.nome} agora vem das fazendas de vocês. Vale amanhã.`)}>
                <span>
                  <b>Fazenda própria</b>
                  <small>{mp ? `${formatarNumero(mp.estoque.quantidade)} ${unidadeCurta(mp.unidade)} em estoque` : "sem estoque"}</small>
                </span>
                <span className="preco">{mp && mp.estoque.quantidade > 0 ? formatarReais(Math.round(mp.estoque.valor / mp.estoque.quantidade)) : "—"}</span>
              </button>
            </span>
            <CampoDeProduto v={v} comandar={comandar} produto={p.id} campo="compraMensal" rotulo="Abastecimento por mês" sufixo={`${plural(p.unidade)}/mês`} ajuda={`Quanto a loja recebe por mês, da origem escolhida. O que faltar na fazenda própria vem do fornecedor externo.`} />
          </section>
        );
      })}
      <div className="j-medidor" title="Uso da capacidade de venda">
        <i style={{ width: `${(uso * 100).toFixed(0)}%` }} />
      </div>
      <small className="j-dica-curta">
        Capacidade de venda: {formatarNumero(e.capacidadeVendaPorTick)} itens/dia · {vendendo.length} produto(s) à venda
      </small>
    </>
  );
}
