/**
 * Janela da troca de atividade de uma fazenda: escolhe a nova atividade e o destino do estoque que sai
 * (cooperativa, atacado barato ou destruição), com o caixa estimado de cada via e o custo da conversão.
 */
import type { VisaoAluno } from "@simulador/compartilhado";
import { useState } from "react";
import { formatarNumero, formatarReais } from "../../formato";
import type { Comandar } from "../Console";
import { Janela } from "../Janelas";
import { quantidadeCom } from "../jogo";
import { useNotificar } from "../notificacoes";
import { atividadeDe, estoqueQueSai, type Fazenda, materiaPrima, valorDaDesova, type ViaDeDesova } from "./modelo";

const VIAS: { via: ViaDeDesova; nome: string; detalhe: (piso: number) => string }[] = [
  { via: "cooperativa", nome: "Vender para a cooperativa", detalhe: () => "recebe o piso, amanhã, sem depender de ninguém" },
  { via: "atacado", nome: "Vender barato no atacado", detalhe: () => "lote único, a um preço abaixo do externo; as outras equipes dividem o que quiserem" },
  { via: "destruir", nome: "Destruir o estoque", detalhe: () => "sem receita e com custo de descarte" },
];

const dinheiro = (centavos: number) => `${centavos >= 0 ? "+" : "−"}${formatarReais(Math.abs(centavos))}`;

export function TrocaDeAtividade({ v, comandar, fazenda, aoFechar }: { v: VisaoAluno; comandar: Comandar; fazenda: Fazenda; aoFechar: () => void }) {
  const c = v.visao.cadeia!;
  const atual = atividadeDe(c, fazenda.atividade)!;
  const outras = c.atividades.filter((a) => a.id !== atual.id);
  const [nova, setNova] = useState(outras[0]!.id);
  const [via, setVia] = useState<ViaDeDesova>("cooperativa");
  const piso = Math.ceil(c.cooperativa.fatorPiso * 100);
  const [percentual, setPercentual] = useState("80");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const notificar = useNotificar();

  const itens = estoqueQueSai(c, fazenda.id, nova);
  const fator = Number(percentual) / 100;
  const fatorValido = /^\d{1,3}$/.test(percentual.trim()) && Number(percentual) >= piso && Number(percentual) <= 100;
  const alvo = atividadeDe(c, nova)!;
  const semEstoque = itens.length === 0;
  const viaEfetiva: ViaDeDesova = semEstoque ? "destruir" : via;
  const podeEnviar = !enviando && (semEstoque || via !== "atacado" || fatorValido);

  async function trocar() {
    setEnviando(true);
    setErro(null);
    const r = await comandar([{ tipo: "trocarAtividade", fazenda: fazenda.id, atividade: nova, desova: viaEfetiva, ...(viaEfetiva === "atacado" ? { fatorPrecoAtacado: fator } : {}) }]);
    setEnviando(false);
    if (r === true) {
      notificar(`Troca para ${alvo.nome.toLowerCase()} enviada: a fazenda para por ${c.conversao.prazoDias} dias a partir de amanhã.`);
      aoFechar();
    } else setErro(r.motivo);
  }

  return (
    <Janela titulo={`Trocar ${atual.nome.toLowerCase()} para ${alvo.nome.toLowerCase()}`} aoFechar={aoFechar} classe="estreita">
      <div className="j-troca">
        <div className="j-opcoes coluna" role="radiogroup" aria-label="Nova atividade">
          {outras.map((a) => (
            <button key={a.id} type="button" role="radio" aria-checked={a.id === nova} className={`j-opcao${a.id === nova ? " sel" : ""}`} data-atividade={a.id} onClick={() => setNova(a.id)}>
              <span>
                <b>{a.nome}</b>
                <small>produz {a.produz.map((x) => materiaPrima(c, x.produto)?.nome.toLowerCase() ?? x.produto).join(" + ")}</small>
              </span>
            </button>
          ))}
        </div>
        <p className="j-aviso-troca">
          A conversão custa <b>{formatarReais(c.conversao.custo)}</b> e deixa a fazenda parada por <b>{c.conversao.prazoDias} dias</b>. A experiência volta a zero e a produção mensal também: depois da troca, é preciso defini-la de novo.
        </p>
        {semEstoque ? (
          <p className="j-dica" data-testid="sem-estoque-na-troca">
            Não há estoque a desovar: o que a fazenda produz hoje continua a ser produzido por outra fazenda de vocês ou pela nova atividade.
          </p>
        ) : (
          <>
            <p>
              Do estoque, saem {itens.map((i) => `${quantidadeCom(i.quantidade, i.unidade)} de ${i.nome.toLowerCase()}`).join(" e ")}. O que fazer com ele?
            </p>
            <div className="j-opcoes coluna" role="radiogroup" aria-label="Destino do estoque">
              {VIAS.map((o) => {
                const valor = valorDaDesova(c, itens, o.via, o.via === "atacado" && fatorValido ? fator : c.cooperativa.fatorPiso);
                return (
                  <button key={o.via} type="button" role="radio" aria-checked={o.via === via} className={`j-opcao${o.via === via ? " sel" : ""}`} data-via={o.via} onClick={() => setVia(o.via)}>
                    <span>
                      <b>{o.nome}</b>
                      <small>{o.detalhe(piso)}</small>
                    </span>
                    <span className="preco">{dinheiro(valor)}</span>
                  </button>
                );
              })}
            </div>
            {via === "atacado" && (
              <label className="j-campo-simples">
                <span className="j-rotulo">Preço do lote, em % do preço do fornecedor ({piso}% a 100%)</span>
                <input id="campo-fator-atacado" inputMode="numeric" autoComplete="off" value={percentual} onChange={(e) => setPercentual(e.target.value)} aria-invalid={!fatorValido} />
                {!fatorValido && <small className="negativo">digite um número inteiro entre {piso} e 100</small>}
              </label>
            )}
          </>
        )}
        {erro && (
          <p className="j-alerta-caixa" role="alert">
            {erro}
          </p>
        )}
        <div className="j-linha-botoes fim">
          <button type="button" className="botao" onClick={aoFechar}>
            Cancelar <kbd>Esc</kbd>
          </button>
          <button type="button" className="botao primario" data-foco disabled={!podeEnviar} onClick={() => void trocar()}>
            {semEstoque ? "Trocar" : "Trocar e desovar"}
          </button>
        </div>
      </div>
    </Janela>
  );
}
