/**
 * Decisões da equipe (seção 8): por produto, com os valores que vão valer no próximo dia já
 * preenchidos e as mudanças pendentes destacadas; construir fábrica e abrir/fechar pontos de venda.
 * O que é digitado fica num rascunho no navegador até ser enviado.
 */
import type { DecisaoDoAluno, VisaoAluno } from "@simulador/compartilhado";
import { Factory, Send, Store, Trash2 } from "lucide-react";
import { useState } from "react";
import type { ConexaoSala } from "../cliente/conexao";
import { useComando } from "../cliente/useComando";
import { Aviso, BotaoConfirmar, Secao } from "../componentes/base";
import { Ajuda } from "../componentes/interativos";
import { formatarNumero, formatarReais } from "../formato";
import { AJUDA } from "./ajuda";
import { useRascunho } from "./ganchos";
import { type CampoProduto, camposPendentes, decisoesDoRascunho, decisoesEfetivas, type Rascunho } from "./regras";

type Props = { v: VisaoAluno; conexao: ConexaoSala<VisaoAluno> | null; codigo: string };

const reaisSemSimbolo = (c: number) => formatarReais(c, { simbolo: false });

export function DecisoesDaEquipe({ v, conexao, codigo }: Props) {
  const { rascunho, mudar, limpar } = useRascunho(`simulador:rascunho:${codigo}:${v.empresa}`);
  const { executar, enviando, erro } = useComando(conexao);
  const [enviado, setEnviado] = useState(false);
  const efetivas = decisoesEfetivas(v.visao, v.pendentes);
  const { decisoes, erros } = decisoesDoRascunho(rascunho, v.visao, efetivas);
  const temErros = Object.keys(erros).length > 0;
  const podeEditar = v.relogio.podeEditar;

  async function enviar() {
    setEnviado(false);
    if (await executar({ tipo: "decidir", decisoes })) {
      limpar();
      setEnviado(true);
    }
  }

  return (
    <>
      {!podeEditar && (
        <Aviso tipo="alerta">
          {v.relogio.status === "encerrada" ? "A partida foi encerrada." : "Decisões bloqueadas neste momento. O que você digitar fica guardado neste navegador para enviar depois."}
        </Aviso>
      )}
      {v.visao.produtos.map((p) => (
        <FormularioProduto key={p.id} v={v} produto={p.id} rascunho={rascunho} efetivas={efetivas} erros={erros[p.id] ?? {}} mudar={mudar} />
      ))}

      <div className="barra-relogio" style={{ position: "sticky", bottom: 0, top: "auto" }} role="region" aria-label="Enviar decisões">
        <span>
          {decisoes.length === 0 ? "Nenhuma mudança no rascunho." : `${decisoes.length} produto(s) com mudanças no rascunho.`}
          {temErros && <span className="negativo"> Corrija os campos marcados.</span>}
        </span>
        <span className="espaco" />
        {Object.keys(rascunho).length > 0 && (
          <button type="button" className="botao" onClick={limpar}>
            <Trash2 aria-hidden size={16} /> Descartar rascunho
          </button>
        )}
        <button type="button" className="botao primario" disabled={decisoes.length === 0 || temErros || !podeEditar || enviando} onClick={() => void enviar()}>
          <Send aria-hidden size={16} /> {enviando ? "Enviando…" : "Enviar decisões"}
        </button>
      </div>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {enviado && !erro && <Aviso tipo="sucesso">Decisões enviadas: valem a partir do próximo dia.</Aviso>}

      <Pendentes v={v} />
      <AcoesDaEmpresa v={v} conexao={conexao} />
    </>
  );
}

function FormularioProduto({
  v,
  produto,
  rascunho,
  efetivas,
  erros,
  mudar,
}: {
  v: VisaoAluno;
  produto: string;
  rascunho: Rascunho;
  efetivas: ReturnType<typeof decisoesEfetivas>;
  erros: Partial<Record<CampoProduto, string>>;
  mudar: (produto: string, campo: CampoProduto | "vender", valor: string | boolean) => void;
}) {
  const p = v.visao.produtos.find((x) => x.id === produto)!;
  const o = v.visao.empresa.ofertas.find((x) => x.produto === produto)!;
  const ef = efetivas[produto]!;
  const r = rascunho[produto] ?? {};
  const pend = camposPendentes(v.pendentes, produto);
  const vender = r.vender ?? ef.preco !== null;
  const temFabrica = o.fabricasOperando + o.fabricasEmObra > 0;
  const id = (c: string) => `${produto}-${c}`;

  const campo = (c: CampoProduto, rotulo: string, valorAtual: string, ajuda: string, dica?: string, tipo: "reais" | "unidades" = "reais") => (
    <div className={`campo${pend.has(c) ? " pendente" : ""}`}>
      <label htmlFor={id(c)} className="linha" style={{ gap: "0.25rem" }}>
        {rotulo} {tipo === "reais" ? "(R$)" : `(${p.unidade})`} <Ajuda titulo={rotulo}>{ajuda}</Ajuda>
      </label>
      <input
        id={id(c)}
        inputMode={tipo === "reais" ? "decimal" : "numeric"}
        autoComplete="off"
        value={r[c] ?? valorAtual}
        aria-invalid={erros[c] ? true : undefined}
        aria-describedby={`${id(c)}-dica`}
        onChange={(e) => mudar(produto, c, e.target.value)}
      />
      <span id={`${id(c)}-dica`} className="pequeno texto-2">
        {pend.has(c) ? "Mudança enviada: vale no próximo dia. " : ""}
        {dica}
      </span>
      {erros[c] && <span className="erro">{erros[c]}</span>}
    </div>
  );

  return (
    <Secao titulo={p.nome}>
      <label className="campo-linha">
        <input type="checkbox" checked={vender} onChange={(e) => mudar(produto, "vender", e.target.checked)} />
        Vender este produto <Ajuda titulo="vender">{AJUDA.vender}</Ajuda>
      </label>
      <div className="grade" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(14rem, 1fr))" }}>
        {vender && campo("preco", "Preço", ef.preco === null ? "" : reaisSemSimbolo(ef.preco), AJUDA.preco, `Máximo ${formatarReais(p.precoMaximo)}.`)}
        {p.fornecedor &&
          campo("compraMensal", "Compra pronta por mês", formatarNumero(ef.compraMensal), AJUDA.compraMensal, `Fornecedor: ${formatarReais(p.fornecedor.preco)} por ${p.unidade}, qualidade ${formatarNumero(p.fornecedor.qualidade)}.`, "unidades")}
        {p.fabricacao &&
          temFabrica &&
          campo(
            "producaoMensal",
            "Produção própria por mês",
            formatarNumero(ef.producaoMensal),
            AJUDA.producaoMensal,
            o.fabricasOperando > 0 ? `Capacidade atual: ${formatarNumero(o.capacidadeProducaoPorTick * v.visao.ticksPorMes)} por mês.` : "Fábrica em obra.",
            "unidades",
          )}
        {campo("publicidadeMensal", "Publicidade por mês", reaisSemSimbolo(ef.publicidadeMensal), AJUDA.publicidadeMensal)}
        {p.fabricacao && campo("pdMensal", "P&D por mês", reaisSemSimbolo(ef.pdMensal), AJUDA.pdMensal, `Tecnologia atual: ${formatarNumero(o.tecnologia, 1)}.`)}
      </div>
    </Secao>
  );
}

/** Descrição de uma decisão pendente, para o aluno conferir o que vai valer. */
export function textoDaDecisao(d: DecisaoDoAluno, nomeProduto: (id: string) => string): string {
  switch (d.tipo) {
    case "produto": {
      const partes: string[] = [];
      if (d.preco === null) partes.push("parar de vender");
      else if (d.preco !== undefined) partes.push(`preço ${formatarReais(d.preco)}`);
      if (d.compraMensal !== undefined) partes.push(`comprar ${formatarNumero(d.compraMensal)} por mês`);
      if (d.producaoMensal !== undefined) partes.push(`produzir ${formatarNumero(d.producaoMensal)} por mês`);
      if (d.publicidadeMensal !== undefined) partes.push(`publicidade ${formatarReais(d.publicidadeMensal)} por mês`);
      if (d.pdMensal !== undefined) partes.push(`P&D ${formatarReais(d.pdMensal)} por mês`);
      return `${nomeProduto(d.produto)}: ${partes.join(", ")}`;
    }
    case "construirFabrica":
      return `Construir fábrica de ${nomeProduto(d.produto)}`;
    case "abrirPontoDeVenda":
      return `Abrir ${d.quantidade} ponto(s) de venda`;
    case "fecharPontoDeVenda":
      return `Fechar ${d.quantidade} ponto(s) de venda`;
  }
}

function Pendentes({ v }: { v: VisaoAluno }) {
  if (v.pendentes.length === 0) return null;
  const nome = (id: string) => v.visao.produtos.find((p) => p.id === id)?.nome ?? id;
  return (
    <Secao titulo="Enviadas, valem no próximo dia">
      <ul className="lista-simples">
        {v.pendentes.map((d, i) => (
          <li key={i}>{textoDaDecisao(d, nome)}</li>
        ))}
      </ul>
    </Secao>
  );
}

function AcoesDaEmpresa({ v, conexao }: { v: VisaoAluno; conexao: ConexaoSala<VisaoAluno> | null }) {
  const { executar, enviando, erro } = useComando(conexao);
  const [abrir, setAbrir] = useState(1);
  const [fechar, setFechar] = useState(1);
  const e = v.visao.empresa;
  const pdv = v.visao.custos.pontoDeVenda;
  const podeEditar = v.relogio.podeEditar;
  const total = e.pontosDeVendaOperando + e.pontosDeVendaEmObra;
  const decidir = (d: DecisaoDoAluno) => void executar({ tipo: "decidir", decisoes: [d] });
  const quantidade = (n: number, max: number) => Math.max(1, Math.min(max, Math.trunc(n) || 1));

  return (
    <>
      <Secao titulo="Pontos de venda" icone={<Store aria-hidden size={20} />} acoes={<Ajuda titulo="pontos de venda">{AJUDA.pontoDeVenda}</Ajuda>}>
        <p style={{ margin: 0 }}>
          Você tem {e.pontosDeVendaOperando} funcionando{e.pontosDeVendaEmObra > 0 ? ` e ${e.pontosDeVendaEmObra} em obra` : ""}. Cada um: abertura {formatarReais(pdv.custoAbertura)}, fica pronto em {pdv.prazoAberturaDias} dia(s),
          custa {formatarReais(pdv.custoFixoMensal)} por mês e vende até {formatarNumero(pdv.capacidadePorDia)} unidades por dia.
        </p>
        <div className="linha">
          <label htmlFor="abrir-pdv">Abrir</label>
          <input id="abrir-pdv" type="number" min={1} max={20} value={abrir} onChange={(x) => setAbrir(quantidade(Number(x.target.value), 20))} style={{ width: "4.5rem" }} />
          <BotaoConfirmar confirmar={`Abrir ${abrir} por ${formatarReais(abrir * pdv.custoAbertura)}?`} desabilitado={!podeEditar || enviando} aoConfirmar={() => decidir({ tipo: "abrirPontoDeVenda", quantidade: abrir })}>
            Abrir pontos de venda
          </BotaoConfirmar>
        </div>
        {total > 0 && (
          <div className="linha">
            <label htmlFor="fechar-pdv">Fechar</label>
            <input id="fechar-pdv" type="number" min={1} max={total} value={fechar} onChange={(x) => setFechar(quantidade(Number(x.target.value), total))} style={{ width: "4.5rem" }} />
            <BotaoConfirmar perigo confirmar={`Fechar ${fechar}? O investimento não volta.`} desabilitado={!podeEditar || enviando} aoConfirmar={() => decidir({ tipo: "fecharPontoDeVenda", quantidade: fechar })}>
              Fechar pontos de venda
            </BotaoConfirmar>
          </div>
        )}
      </Secao>

      {v.visao.produtos.some((p) => p.fabricacao) && (
        <Secao titulo="Fábricas" icone={<Factory aria-hidden size={20} />} acoes={<Ajuda titulo="fábricas">{AJUDA.fabrica}</Ajuda>}>
          {v.visao.produtos
            .filter((p) => p.fabricacao)
            .map((p) => {
              const f = p.fabricacao!;
              const o = e.ofertas.find((x) => x.produto === p.id)!;
              return (
                <div key={p.id} className="linha">
                  <span style={{ flex: 1, minWidth: "16rem" }}>
                    <strong>{p.nome}</strong>: {o.fabricasOperando} funcionando{o.fabricasEmObra > 0 ? `, ${o.fabricasEmObra} em obra` : ""}. Nova fábrica: {formatarReais(f.capex)}, pronta em {f.prazoConstrucaoDias} dia(s),{" "}
                    {formatarReais(f.custoFixoMensal)} por mês, até {formatarNumero(f.capacidadeUnidadesPorDia)} {p.unidade} por dia.
                  </span>
                  <BotaoConfirmar confirmar={`Investir ${formatarReais(f.capex)}?`} desabilitado={!podeEditar || enviando} aoConfirmar={() => decidir({ tipo: "construirFabrica", produto: p.id })}>
                    Construir fábrica
                  </BotaoConfirmar>
                </div>
              );
            })}
        </Secao>
      )}
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
    </>
  );
}
