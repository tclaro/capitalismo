/**
 * Palco da cadeia: três colunas (fazendas → fábricas → loja) com um cartão por instalação, e os fios de
 * fluxo da instalação escolhida. Os cartões mostram o estado; as decisões ficam no painel ao lado.
 */
import type { VisaoAluno } from "@simulador/compartilhado";
import { type ReactNode, useLayoutEffect, useRef, useState } from "react";
import { formatarNumero, formatarReais } from "../../formato";
import { pctInteiro, plural } from "../jogo";
import { decisoesEfetivas } from "../regras";
import {
  atividadeDe,
  diasDeProducao,
  DIAS_DE_REFERENCIA_DA_FABRICA,
  type EfetivasDaCadeia,
  efetivasDaCadeia,
  estadoDaFabrica,
  estadoDaFazenda,
  fabricasDaEmpresa,
  ID_LOJA,
  ID_NOVA_FABRICA,
  ID_NOVA_FAZENDA,
  idDaFabrica,
  idDaFazenda,
  ligacoes,
  materiaPrima,
  origemEfetiva,
  ponta,
  produtosEmVenda,
  unidadeCurta,
} from "./modelo";
import { Celulas, LinhaDeEstoque, Pilula } from "./pecas";

interface Props {
  v: VisaoAluno;
  selecionada: string;
  aoSelecionar: (id: string) => void;
}

/** A partir de quantos cartões numa coluna os detalhes (linhas de evolução) saem para caber sem rolar. */
export const CARTOES_ANTES_DE_COMPACTAR = 3;

function Cartao({ id, cor, selecionada, aoSelecionar, compacto, atalho, titulo, sub, children, nome }: { id: string; cor: string; selecionada: boolean; aoSelecionar: (id: string) => void; compacto: boolean; atalho: number | null; titulo: string; sub?: ReactNode; children: ReactNode; nome: string }) {
  return (
    <button
      type="button"
      className={`j-inst${selecionada ? " sel" : ""}${compacto ? " compacto" : ""}`}
      style={{ "--c": `var(--cor-${cor})` } as React.CSSProperties}
      data-instalacao={id}
      aria-current={selecionada}
      aria-label={nome}
      aria-keyshortcuts={atalho !== null && atalho <= 9 ? String(atalho) : undefined}
      onClick={() => aoSelecionar(id)}
    >
      <span className="cab">
        <b>{titulo}</b>
        {sub !== undefined && <span className="sub">{sub}</span>}
        {atalho !== null && atalho <= 9 && <span className="j-tecla">{atalho}</span>}
      </span>
      {children}
    </button>
  );
}

function CartaoNovo({ id, texto, selecionada, aoSelecionar, atalho }: { id: string; texto: string; selecionada: boolean; aoSelecionar: (id: string) => void; atalho: number | null }) {
  return (
    <button type="button" className={`j-inst nova${selecionada ? " sel" : ""}`} data-instalacao={id} aria-current={selecionada} aria-keyshortcuts={atalho !== null && atalho <= 9 ? String(atalho) : undefined} onClick={() => aoSelecionar(id)}>
      <span>+ {texto}</span>
      {atalho !== null && atalho <= 9 && <span className="j-tecla">{atalho}</span>}
    </button>
  );
}

export function PalcoDaCadeia({ v, selecionada, aoSelecionar }: Props) {
  const c = v.visao.cadeia!;
  const ef = efetivasDaCadeia(v);
  const fabricas = fabricasDaEmpresa(v);
  const palco = useRef<HTMLDivElement>(null);
  let n = 0;
  const proximo = () => ++n;

  const nFazendas = c.fazendas.length + ef.construcoes.length;
  const compactoOrigem = nFazendas > CARTOES_ANTES_DE_COMPACTAR;
  const compactoFabrica = fabricas.length > CARTOES_ANTES_DE_COMPACTAR;

  return (
    <div className="j-palco-cadeia" ref={palco} data-testid="palco-da-cadeia">
      <div className="j-colunas-cab">
        <div style={{ "--c": "var(--cor-fazenda)" } as React.CSSProperties}>
          <i />
          <span className="j-rotulo">Origem · fazendas</span>
        </div>
        <div style={{ "--c": "var(--cor-fabrica)" } as React.CSSProperties}>
          <i />
          <span className="j-rotulo">Fábricas</span>
        </div>
        <div style={{ "--c": "var(--cor-loja)" } as React.CSSProperties}>
          <i />
          <span className="j-rotulo">Loja</span>
        </div>
      </div>

      <div className="j-colunas">
        <div className="j-col" data-coluna="origem">
          {c.fazendas.map((f, k) => (
            <CartaoDaFazenda key={f.id} v={v} indice={k} f={f} ef={ef} selecionada={selecionada === idDaFazenda(f.id)} aoSelecionar={aoSelecionar} compacto={compactoOrigem} atalho={proximo()} />
          ))}
          {ef.construcoes.map((x, k) => (
            <div key={`obra-${k}`} className="j-inst encomenda" aria-label="Fazenda encomendada">
              <span className="cab">
                <b>{atividadeDe(c, x.atividade)?.nome ?? x.atividade}</b>
                <span className="sub">encomendada</span>
              </span>
              <span className="j-pilula neutro">começa amanhã</span>
            </div>
          ))}
          <CartaoNovo id={ID_NOVA_FAZENDA} texto="Nova fazenda" selecionada={selecionada === ID_NOVA_FAZENDA} aoSelecionar={aoSelecionar} atalho={proximo()} />
        </div>

        <div className="j-col" data-coluna="fabrica">
          {fabricas.map((o) => (
            <CartaoDaFabrica key={o.produto} v={v} produto={o.produto} ef={ef} selecionada={selecionada === idDaFabrica(o.produto)} aoSelecionar={aoSelecionar} compacto={compactoFabrica} atalho={proximo()} />
          ))}
          <CartaoNovo id={ID_NOVA_FABRICA} texto="Nova fábrica" selecionada={selecionada === ID_NOVA_FABRICA} aoSelecionar={aoSelecionar} atalho={proximo()} />
        </div>

        <div className="j-col" data-coluna="loja">
          <CartaoDaLoja v={v} selecionada={selecionada === ID_LOJA} aoSelecionar={aoSelecionar} atalho={proximo()} />
        </div>
      </div>

      <div className="j-externos">
        <div style={{ "--c": "var(--cor-externo)" } as React.CSSProperties}>
          <i />
          <span>
            <b>Fornecedor externo</b> · sempre tem estoque; é o teto do preço no atacado
          </span>
        </div>
        <div style={{ "--c": "var(--cor-coop)" } as React.CSSProperties}>
          <i />
          <span>
            <b>Cooperativa</b> · compra pelo piso ({pctInteiro(c.cooperativa.fatorPiso)} do externo), só quando vocês mandam vender
          </span>
        </div>
      </div>

      <Fios v={v} selecionada={selecionada} palco={palco} />
    </div>
  );
}

function CartaoDaFazenda({ v, f, indice, ef, selecionada, aoSelecionar, compacto, atalho }: { v: VisaoAluno; f: NonNullable<VisaoAluno["visao"]["cadeia"]>["fazendas"][number]; indice: number; ef: EfetivasDaCadeia; selecionada: boolean; aoSelecionar: (id: string) => void; compacto: boolean; atalho: number }) {
  const c = v.visao.cadeia!;
  const a = atividadeDe(c, f.atividade);
  const estado = estadoDaFazenda(v, f, ef.producaoDaFazenda[f.id]);
  const trocando = ef.trocas[f.id];
  const mps = (a?.produz ?? []).flatMap((x) => materiaPrima(c, x.produto) ?? []);
  const producao = ef.producaoDaFazenda[f.id] ?? f.producaoMensal;
  return (
    <Cartao id={idDaFazenda(f.id)} cor="fazenda" selecionada={selecionada} aoSelecionar={aoSelecionar} compacto={compacto} atalho={atalho} titulo={a?.nome ?? f.atividade} sub={`fazenda ${indice + 1}`} nome={`${a?.nome ?? f.atividade}, fazenda ${indice + 1}`}>
      {!f.emObra &&
        mps.map((m) => (
          <LinhaDeEstoque key={m.produto} m={m} saida={ponta(idDaFazenda(f.id), m.produto)} />
        ))}
      <span className="j-fluxo-linha">
        <span>{f.emObra ? "obra em andamento" : trocando ? `troca para ${atividadeDe(c, trocando)?.nome.toLowerCase() ?? trocando} amanhã` : `${formatarNumero(producao)} ${unidadeCurta(mps[0]?.unidade ?? "")}/mês`}</span>
        <Pilula estado={estado} />
      </span>
    </Cartao>
  );
}

function CartaoDaFabrica({ v, produto, ef, selecionada, aoSelecionar, compacto, atalho }: { v: VisaoAluno; produto: string; ef: EfetivasDaCadeia; selecionada: boolean; aoSelecionar: (id: string) => void; compacto: boolean; atalho: number }) {
  const c = v.visao.cadeia!;
  const p = v.visao.produtos.find((x) => x.id === produto)!;
  const o = v.visao.empresa.ofertas.find((x) => x.produto === produto)!;
  const origem = origemEfetiva(v, produto);
  const producao = decisoesEfetivas(v.visao, v.pendentes)[produto]?.producaoMensal ?? o.decisao.producaoMensal;
  const dias = diasDeProducao(o);
  const estado = estadoDaFabrica(o, producao);
  return (
    <Cartao id={idDaFabrica(produto)} cor="fabrica" selecionada={selecionada} aoSelecionar={aoSelecionar} compacto={compacto} atalho={atalho} titulo={`Fábrica de ${p.nome.toLowerCase()}`} sub={`${o.fabricasOperando}${o.fabricasEmObra > 0 ? `+${o.fabricasEmObra}` : ""}`} nome={`Fábrica de ${p.nome}`}>
      {p.fabricacao!.receita.map((i) => {
        const mp = materiaPrima(c, i.produto);
        const propria = mp !== undefined && origem.insumos[i.produto] === "propria";
        const nome = mp?.nome ?? v.sala.produtos.find((x) => x.id === i.produto)?.nome ?? v.sala.materiasPrimas.find((x) => x.id === i.produto)?.nome ?? i.produto;
        return (
          <span key={i.produto} className="j-insumo" data-entrada={ponta(idDaFabrica(produto), i.produto)}>
            <span>
              {nome}
              {propria && mp && <small> · {formatarNumero(mp.estoque.quantidade)} em estoque</small>}
            </span>
            <span className={`tag ${propria ? "propria" : "externo"}`}>{propria ? "própria" : "externo"}</span>
          </span>
        );
      })}
      <span className="j-bloco-est">
        <span className="j-linha-est" data-saida={ponta(idDaFabrica(produto), produto)}>
          <span className="nome">{p.nome}</span>
          <Celulas fracao={dias === null ? 0 : dias / DIAS_DE_REFERENCIA_DA_FABRICA} />
          <span className="qtd">
            {formatarNumero(o.estoque.quantidade)} {plural(p.unidade)}
          </span>
        </span>
      </span>
      <span className="j-fluxo-linha">
        <span>{dias === null ? "sem capacidade" : `${formatarNumero(dias, 1)} d de produção em estoque`}</span>
        <Pilula estado={estado} />
      </span>
    </Cartao>
  );
}

function CartaoDaLoja({ v, selecionada, aoSelecionar, atalho }: { v: VisaoAluno; selecionada: boolean; aoSelecionar: (id: string) => void; atalho: number }) {
  const e = v.visao.empresa;
  const vendendo = produtosEmVenda(v);
  const foraDeVenda = v.visao.produtos.length - vendendo.length;
  return (
    <Cartao id={ID_LOJA} cor="loja" selecionada={selecionada} aoSelecionar={aoSelecionar} compacto={false} atalho={atalho} titulo="Loja" sub={`${e.pontosDeVendaOperando} ponto(s) de venda`} nome="Loja">
      {vendendo.map(({ produto: p, oferta: o }) => (
        <span key={p.id} className="j-linha-est loja" data-entrada={ponta(ID_LOJA, p.id)}>
          <span className="nome">{p.nome}</span>
          <span className="vendas">
            {formatarNumero(o.vendasAnterior)} {plural(p.unidade)}
          </span>
          <span className="qtd">{formatarReais(o.decisao.preco!)}</span>
        </span>
      ))}
      <span className="j-fluxo-linha">
        <span>{vendendo.length === 0 ? "nada à venda" : "vendas de ontem e preço"}</span>
        {foraDeVenda > 0 && <span className="j-pilula neutro">{foraDeVenda} fora de venda</span>}
      </span>
    </Cartao>
  );
}

/** Fios (curvas) só da instalação escolhida, entre as pontas que os cartões marcam com `data-saida` e `data-entrada`. */
function Fios({ v, selecionada, palco }: { v: VisaoAluno; selecionada: string; palco: React.RefObject<HTMLDivElement | null> }) {
  const [caminhos, setCaminhos] = useState<{ d: string; pulso: boolean }[]>([]);
  const [medida, setMedida] = useState({ largura: 0, altura: 0 });
  const lista = ligacoes(v).filter((l) => l.instalacoes.includes(selecionada));
  const chave = lista.map((l) => `${l.de}>${l.para}`).join(",");
  const tick = v.relogio.tick;

  useLayoutEffect(() => {
    const raiz = palco.current;
    if (!raiz) return;
    const desenhar = () => {
      const base = raiz.getBoundingClientRect();
      const ancora = (atributo: string, valor: string, lado: "d" | "e") => {
        const el = [...raiz.querySelectorAll(`[${atributo}]`)].find((x) => x.getAttribute(atributo) === valor);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: (lado === "d" ? r.right : r.left) - base.left, y: r.top + r.height / 2 - base.top };
      };
      const novos: { d: string; pulso: boolean }[] = [];
      for (const l of lista) {
        const a = ancora("data-saida", l.de, "d");
        const b = ancora("data-entrada", l.para, "e");
        if (!a || !b || (a.x === 0 && b.x === 0)) continue;
        const dx = (b.x - a.x) * 0.5;
        novos.push({ d: `M${a.x},${a.y} C${a.x + dx},${a.y} ${b.x - dx},${b.y} ${b.x},${b.y}`, pulso: true });
      }
      setMedida({ largura: base.width, altura: base.height });
      setCaminhos(novos);
    };
    desenhar();
    if (typeof ResizeObserver === "undefined") return;
    const o = new ResizeObserver(desenhar);
    o.observe(raiz);
    return () => o.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave, selecionada, tick]);

  return (
    <svg className="j-fios" viewBox={`0 0 ${medida.largura} ${medida.altura}`} aria-hidden="true" data-fios={lista.length}>
      {caminhos.map((p, k) => (
        <g key={k}>
          <path d={p.d} strokeWidth={3} />
          {p.pulso && <path d={p.d} strokeWidth={1.6} className="pulso" />}
        </g>
      ))}
    </svg>
  );
}
