/**
 * Aba do atacado: para cada matéria-prima, quem vende (fornecedor externo no teto, outras equipes, a
 * própria oferta, cooperativa no piso) e o pedido de compra da equipe. Uma matéria-prima por vez, para
 * a tabela caber sem rolagem.
 */
import type { VisaoAluno } from "@simulador/compartilhado";
import { useState } from "react";
import { formatarNumero, formatarReais } from "../../formato";
import { CampoDecisao } from "../CampoDecisao";
import type { Comandar } from "../Console";
import { empresasDoMercado } from "../jogo";
import { useNotificar } from "../notificacoes";
import { lerQuantidade } from "../regras";
import { efetivasDaCadeia, type MateriaPrima, materiasDoAtacado, ofertasDosOutros, temPendencia, unidadeCurta } from "./modelo";
import { passoDaCapacidade } from "./Paineis";

interface Linha {
  chave: string;
  quem: string;
  preco: number;
  qualidade: number | null;
  quantidade: string;
  classe: "" | "faixa" | "nos";
  vendedor?: string;
}

export function PainelDoAtacado({ v, comandar }: { v: VisaoAluno; comandar: Comandar }) {
  const c = v.visao.cadeia!;
  const ef = efetivasDaCadeia(v);
  const materias = materiasDoAtacado(c);
  const nomes = new Map(empresasDoMercado(v).map((e) => [e.id, e.nome]));
  const comOfertas = (m: MateriaPrima) => c.atacado.some((o) => o.produto === m.produto) || ef.oferta[m.produto] !== null;
  const [escolhida, setEscolhida] = useState<string | null>(null);
  const [vendedores, setVendedores] = useState<Record<string, string>>({});
  const notificar = useNotificar();
  const editavel = v.relogio.podeEditar;

  const m = materias.find((x) => x.produto === escolhida) ?? materias.find(comOfertas) ?? materias[0];
  if (!m) return <p className="j-dica">Esta partida não tem matérias-primas para o atacado.</p>;

  const faixa = c.faixaDoAtacado[m.produto];
  const outros = ofertasDosOutros(c, m.produto);
  const minha = ef.oferta[m.produto];
  const pedido = ef.pedido[m.produto];
  const vendedor = vendedores[m.produto] ?? pedido?.vendedor ?? null;
  const qtdDoPedido = pedido && pedido.vendedor === vendedor ? pedido.quantidadeMensal : 0;
  const pendentePedido = temPendencia(v.pendentes, "comprarNoAtacado", (d) => d.tipo === "comprarNoAtacado" && d.produto === m.produto);

  const linhas: Linha[] = [
    { chave: "externo", quem: "Fornecedor externo (teto)", preco: m.precoFornecedor, qualidade: m.qualidadeFornecedor, quantidade: "ilimitado", classe: "faixa" },
    ...outros.map((o): Linha => ({ chave: o.vendedor, quem: nomes.get(o.vendedor) ?? o.vendedor, preco: o.preco, qualidade: o.qualidade, quantidade: `${formatarNumero(o.quantidadeMensal)}/mês`, classe: "", vendedor: o.vendedor })),
    ...(minha && minha.preco !== null ? [{ chave: "nos", quem: "Vocês", preco: minha.preco, qualidade: m.estoque.qualidade, quantidade: `${formatarNumero(minha.quantidadeMensal)}/mês`, classe: "nos" } satisfies Linha] : []),
    { chave: "coop", quem: "Cooperativa (piso)", preco: m.precoCooperativa, qualidade: null, quantidade: "só por ordem", classe: "faixa" },
  ];
  // Do mais caro (teto) ao mais barato (piso); empate: a ordem em que entraram.
  linhas.sort((a, b) => b.preco - a.preco);

  return (
    <>
      <h2 className="j-painel-titulo">
        <span>Atacado entre equipes</span>
      </h2>
      <div className="j-chips" role="tablist" aria-label="Matéria-prima">
        {materias.map((x) => (
          <button key={x.produto} type="button" role="tab" aria-selected={x.produto === m.produto} className={`j-chip${x.produto === m.produto ? " sel" : ""}${comOfertas(x) ? " com" : ""}`} onClick={() => setEscolhida(x.produto)}>
            {x.nome}
          </button>
        ))}
      </div>
      <table className="j-tabela-atacado">
        <thead>
          <tr>
            <th scope="col">{m.nome}</th>
            <th scope="col" className="d">
              Preço
            </th>
            <th scope="col" className="d">
              Qualid.
            </th>
            <th scope="col" className="d">
              Oferta
            </th>
            <th scope="col" />
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.chave} className={`${l.classe}${l.vendedor && l.vendedor === vendedor ? " alvo" : ""}`}>
              <td>{l.quem}</td>
              <td className="d">{formatarReais(l.preco)}</td>
              <td className="d">{l.qualidade === null ? "—" : formatarNumero(l.qualidade, 0)}</td>
              <td className="d">{l.quantidade}</td>
              <td className="d">
                {l.vendedor && (
                  <button type="button" className="botao" disabled={!editavel} aria-label={`Comprar ${m.nome} de ${l.quem}`} onClick={() => setVendedores((s) => ({ ...s, [m.produto]: l.vendedor! }))}>
                    Comprar
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {outros.length === 0 && <p className="j-dica">Nenhuma outra equipe oferece {m.nome.toLowerCase()} agora. A oferta de vocês fica na fazenda que produz; o preço vai de {faixa ? `${formatarReais(faixa.piso)} a ${formatarReais(faixa.teto)}` : "—"}.</p>}

      {vendedor !== null ? (
        <div className="j-pedido">
          <CampoDecisao
            key={`pedido-${m.produto}-${vendedor}`}
            id={`campo-pedido-${m.produto}`}
            rotulo={`Pedido a ${nomes.get(vendedor) ?? vendedor}`}
            ajuda="Quanto vocês pedem por mês. O que chega entra no estoque de matéria-prima e a fábrica usa pela origem “estoque próprio”. É um pedido contínuo, com um vendedor por matéria-prima; zero cancela."
            sufixo={`${unidadeCurta(m.unidade)}/mês`}
            efetivo={formatarNumero(qtdDoPedido)}
            antes={pendentePedido ? formatarNumero(m.pedidoAtacado?.quantidadeMensal ?? 0) : null}
            pendente={pendentePedido}
            desabilitado={!editavel}
            inputMode="numeric"
            passo={(t, sinal) => formatarNumero(Math.max(0, (lerQuantidade(t) ?? 0) + sinal * passoDaCapacidade(Math.max(100, qtdDoPedido))))}
            enviar={async (texto) => {
              const q = lerQuantidade(texto);
              if (q === null) return { motivo: "digite um número inteiro" };
              if (q === qtdDoPedido) return null;
              const r = await comandar([{ tipo: "comprarNoAtacado", produto: m.produto, vendedor, quantidadeMensal: q }]);
              if (r === true && q === 0) setVendedores((s) => Object.fromEntries(Object.entries(s).filter(([k]) => k !== m.produto)));
              return r;
            }}
          />
          {pedido && (
            <button type="button" className="botao" disabled={!editavel} onClick={() => void comandar([{ tipo: "comprarNoAtacado", produto: m.produto, vendedor: pedido.vendedor, quantidadeMensal: 0 }]).then((r) => notificar(r === true ? "Pedido cancelado. Vale amanhã." : `Não deu: ${r.motivo}`))}>
              Cancelar pedido
            </button>
          )}
        </div>
      ) : (
        <p className="j-dica">Para comprar, toque em “Comprar” na linha de uma equipe. A compra entra no estoque de matéria-prima de vocês, pelo preço dela.</p>
      )}
      <p className="j-dica">Preço e quantidade da oferta de vocês se mudam na fazenda que produz {m.nome.toLowerCase()}, no painel da instalação.</p>
    </>
  );
}
