/**
 * Decisões das empresas.
 *
 * `validarDecisao` verifica estrutura e limites que não dependem do momento (produto existe e é
 * vendido, preço dentro do teto, valores inteiros, etc.). Não verifica caixa: o caixa muda até o
 * tick, e caixa negativo vira crédito emergencial (seção 6.12). O servidor usa a mesma função para
 * responder ao aluno na hora; o `passo` revalida ao aplicar e devolve rejeições.
 */
import { movimentarCaixa, reconhecerResultado } from "./contabilidade";
import { type Contexto, prazoEmTicks } from "./contexto";
import { tetoDePreco } from "./formulas/nota";
import { idSequencial } from "./partida";
import type { Decisao, EstadoPartida } from "./tipos";

/** Limites de sanidade (não são regras de jogo): evitam números absurdos vindos da rede. */
export const LIMITE_QUANTIDADE_MENSAL = 1e9;
export const LIMITE_VERBA_MENSAL = 1e12;
export const LIMITE_PONTOS_DE_VENDA_POR_DECISAO = 20;

function inteiroNaoNegativo(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 0;
}

function quantidadeValida(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= LIMITE_QUANTIDADE_MENSAL;
}

/** Devolve `null` se a decisão é válida, ou o motivo da rejeição. */
export function validarDecisao(estado: EstadoPartida, d: Decisao): string | null {
  const empresa = estado.empresas.find((e) => e.id === d.empresa);
  if (!empresa) return `empresa "${d.empresa}" não existe`;

  switch (d.tipo) {
    case "produto": {
      const produto = estado.parametros.produtos.find((p) => p.id === d.produto);
      if (!produto || !produto.varejo) return `produto "${d.produto}" não é vendido nesta partida`;
      const campos = ["preco", "compraMensal", "producaoMensal", "publicidadeMensal", "pdMensal"] as const;
      if (!campos.some((c) => d[c] !== undefined)) return "decisão de produto sem nenhum campo";
      if (d.preco !== undefined && d.preco !== null) {
        if (!Number.isInteger(d.preco) || d.preco <= 0) return "preço deve ser um valor positivo em centavos inteiros";
        const teto = tetoDePreco(produto.varejo.precoReferencia, estado.parametros.vendas.multiploTetoPreco);
        if (d.preco > teto) return `preço acima do teto (${teto} centavos)`;
      }
      if (d.compraMensal !== undefined) {
        if (!quantidadeValida(d.compraMensal)) return "quantidade de compra inválida";
        if (d.compraMensal > 0 && !produto.fornecedor) return "este produto não pode ser comprado pronto";
      }
      if (d.producaoMensal !== undefined) {
        if (!quantidadeValida(d.producaoMensal)) return "quantidade de produção inválida";
        if (d.producaoMensal > 0 && !produto.fabricacao) return "este produto não pode ser fabricado";
      }
      if (d.publicidadeMensal !== undefined && (!inteiroNaoNegativo(d.publicidadeMensal) || d.publicidadeMensal > LIMITE_VERBA_MENSAL)) {
        return "verba de publicidade deve ser centavos inteiros não negativos";
      }
      if (d.pdMensal !== undefined) {
        if (!inteiroNaoNegativo(d.pdMensal) || d.pdMensal > LIMITE_VERBA_MENSAL) return "verba de P&D deve ser centavos inteiros não negativos";
        if (d.pdMensal > 0 && !produto.fabricacao) return "P&D só se aplica a produtos fabricados";
      }
      return null;
    }
    case "construirFabrica": {
      const produto = estado.parametros.produtos.find((p) => p.id === d.produto);
      if (!produto || !produto.varejo) return `produto "${d.produto}" não é vendido nesta partida`;
      if (!produto.fabricacao) return "este produto não pode ser fabricado";
      return null;
    }
    case "abrirPontoDeVenda":
    case "fecharPontoDeVenda": {
      if (!Number.isInteger(d.quantidade) || d.quantidade < 1 || d.quantidade > LIMITE_PONTOS_DE_VENDA_POR_DECISAO) {
        return `quantidade deve ser inteira entre 1 e ${LIMITE_PONTOS_DE_VENDA_POR_DECISAO}`;
      }
      if (d.tipo === "fecharPontoDeVenda" && d.quantidade > empresa.pontosDeVenda.length) {
        return `a empresa tem só ${empresa.pontosDeVenda.length} ponto(s) de venda`;
      }
      return null;
    }
    default: {
      const tipo: never = d;
      return `tipo de decisão desconhecido: ${JSON.stringify(tipo)}`;
    }
  }
}

/** Valida e aplica a decisão no estado do contexto; em caso de erro, registra a rejeição. */
export function aplicarDecisao(ctx: Contexto, d: Decisao): void {
  const motivo = validarDecisao(ctx.estado, d);
  if (motivo !== null) {
    ctx.rejeicoes.push({ decisao: d, motivo });
    return;
  }
  const empresa = ctx.empresas.get(d.empresa)!;
  const p = ctx.estado.parametros;

  switch (d.tipo) {
    case "produto": {
      const oferta = empresa.ofertas.find((o) => o.produto === d.produto)!;
      if (d.preco !== undefined) oferta.decisao.preco = d.preco;
      if (d.compraMensal !== undefined) oferta.decisao.compraMensal = d.compraMensal;
      if (d.producaoMensal !== undefined) oferta.decisao.producaoMensal = d.producaoMensal;
      if (d.publicidadeMensal !== undefined) oferta.decisao.publicidadeMensal = d.publicidadeMensal;
      if (d.pdMensal !== undefined) oferta.decisao.pdMensal = d.pdMensal;
      return;
    }
    case "construirFabrica": {
      const fab = ctx.produtos.get(d.produto)!.fabricacao!;
      const id = idSequencial("fab", empresa.proximoAtivo++);
      empresa.fabricas.push({
        id,
        produto: d.produto,
        custo: fab.capex,
        depreciacaoAcumulada: 0,
        operaDesdeTick: ctx.tick + prazoEmTicks(fab.prazoConstrucaoDias, ctx),
        vidaUtilMeses: fab.vidaUtilMeses,
      });
      movimentarCaixa(empresa, ctx.lancamentos, -fab.capex, "investimento", "construção de fábrica", empresa.id, "construtora", d.produto);
      return;
    }
    case "abrirPontoDeVenda": {
      for (let i = 0; i < d.quantidade; i++) {
        const id = idSequencial("pdv", empresa.proximoAtivo++);
        empresa.pontosDeVenda.push({
          id,
          custo: p.pontoDeVenda.custoAbertura,
          depreciacaoAcumulada: 0,
          operaDesdeTick: ctx.tick + prazoEmTicks(p.pontoDeVenda.prazoAberturaDias, ctx),
          vidaUtilMeses: p.pontoDeVenda.vidaUtilMeses,
        });
        movimentarCaixa(empresa, ctx.lancamentos, -p.pontoDeVenda.custoAbertura, "investimento", "abertura de ponto de venda", empresa.id, `mercado:${empresa.mercado}`);
      }
      return;
    }
    case "fecharPontoDeVenda": {
      // Fecha os mais recentes primeiro; o valor contábil restante vira baixa de ativos (sem caixa).
      for (let i = 0; i < d.quantidade; i++) {
        const ativo = empresa.pontosDeVenda.pop()!;
        reconhecerResultado(empresa, "baixa_de_ativos", ativo.custo - ativo.depreciacaoAcumulada);
      }
      return;
    }
  }
}
