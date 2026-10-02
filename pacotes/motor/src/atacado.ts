/**
 * Atacado entre equipes e cooperativa (camada 3, seção 6.16; passo 5 do tick).
 *
 * Ordem do passo, para o resultado não depender da ordem das empresas:
 * 1. Vendas à cooperativa (ordens dadas no passo 2): cada empresa vende o menor entre o pedido e o seu
 *    estoque, ao preço-piso. Só depende da própria empresa.
 * 2. Estoque de cada vendedor medido depois da cooperativa e antes de qualquer entrega do atacado (assim,
 *    o que uma empresa compra neste tick não pode ser revendido no mesmo tick).
 * 3. Lotes únicos de desova (troca de atividade), aos pedidos vigentes, a preço reduzido.
 * 4. Atacado do dia: disponível = menor entre a quantidade diária ofertada e o estoque medido em 2 (menos o
 *    lote); pedidos atendidos proporcionalmente quando o excedem. Vendedores em ordem de id, produtos em
 *    ordem alfabética, compradores em ordem de id.
 *
 * Venda e compra usam o mesmo valor em centavos, então o dinheiro entre as empresas soma zero. O
 * vendedor reconhece receita e CPV (custo médio); o comprador põe a mercadoria no estoque de
 * matéria-prima, pelo preço pago e com a qualidade do vendedor. A cooperativa não tem caixa próprio.
 */
import { movimentarCaixa, reconhecerResultado } from "./contabilidade";
import type { Contexto } from "./contexto";
import { arredondarCentavos, type Centavos, darEntrada, darSaida } from "./dinheiro";
import type { EstadoEmpresa } from "./tipos";

/** Quantidade abaixo da qual uma entrega do dia é descartada (ruído de ponto flutuante). */
const QUANTIDADE_MINIMA = 1e-9;

/** Preço por unidade que a cooperativa paga por uma matéria-prima: `fatorPiso` × preço do fornecedor externo. */
export function precoDaCooperativa(precoDoFornecedor: Centavos, fatorPiso: number): Centavos {
  return arredondarCentavos(precoDoFornecedor * fatorPiso);
}

/** Passo 5: cooperativa e atacado. */
export function etapaAtacado(ctx: Contexto): void {
  const n = ctx.ticksPorMes;
  const cadeia = ctx.estado.parametros.cadeia!;
  const empresas = ctx.estado.empresas;

  // 1. Cooperativa. As ordens do mesmo (empresa, produto) somam; o resultado não depende da ordem delas.
  const ordens = new Map<string, number>();
  for (const o of ctx.vendasCooperativa) ordens.set(`${o.empresa}|${o.produto}`, (ordens.get(`${o.empresa}|${o.produto}`) ?? 0) + o.quantidade);
  for (const empresa of empresas) {
    for (const [produto, m] of Object.entries(empresa.materiasPrimas)) {
      const pedido = ordens.get(`${empresa.id}|${produto}`);
      if (pedido === undefined) continue;
      const quantidade = Math.min(pedido, m.estoque.quantidade);
      if (quantidade < QUANTIDADE_MINIMA) continue;
      const preco = precoDaCooperativa(ctx.produtos.get(produto)!.fornecedor!.preco, cadeia.cooperativa.fatorPiso);
      const receita = arredondarCentavos(quantidade * preco);
      const custo = darSaida(m.estoque, quantidade);
      movimentarCaixa(empresa, ctx.lancamentos, receita, "operacional", "venda à cooperativa", "cooperativa", empresa.id, produto);
      reconhecerResultado(empresa, "receita", receita);
      reconhecerResultado(empresa, "cpv", custo);
    }
  }

  // 2. Estoque de cada vendedor depois da cooperativa e antes de qualquer entrega do atacado.
  const estoqueInicial = new Map<string, number>();
  for (const empresa of empresas) for (const [produto, m] of Object.entries(empresa.materiasPrimas)) estoqueInicial.set(`${empresa.id}|${produto}`, m.estoque.quantidade);

  // Pedidos vigentes por (vendedor, produto), na ordem dos compradores.
  const pedidos = new Map<string, { comprador: EstadoEmpresa; mensal: number }[]>();
  for (const comprador of empresas) {
    for (const [produto, m] of Object.entries(comprador.materiasPrimas)) {
      const p = m.pedidoAtacado;
      if (!p || p.quantidadeMensal <= 0) continue;
      const vendedor = ctx.empresas.get(p.vendedor);
      if (!vendedor || vendedor.id === comprador.id || vendedor.mercado !== comprador.mercado) continue;
      const chave = `${vendedor.id}|${produto}`;
      if (!pedidos.has(chave)) pedidos.set(chave, []);
      pedidos.get(chave)!.push({ comprador, mensal: p.quantidadeMensal });
    }
  }

  // 3. Lotes únicos de desova (troca de atividade): cada pedido vigente leva até a sua quantidade mensal,
  //    na proporção quando o lote não basta. Quem já recebeu o lote ainda pode comprar a parte do dia.
  const lotes = new Map<string, { quantidade: number; preco: Centavos }>();
  for (const l of ctx.lotesAtacado) lotes.set(`${l.empresa}|${l.produto}`, { quantidade: l.quantidade, preco: l.preco });
  const vendidoNoLote = new Map<string, number>();
  for (const vendedor of empresas) {
    for (const [produto, m] of Object.entries(vendedor.materiasPrimas)) {
      const chave = `${vendedor.id}|${produto}`;
      const lote = lotes.get(chave);
      const lista = pedidos.get(chave);
      if (!lote || !lista) continue;
      const total = soma(lista.map((x) => x.mensal));
      const disponivelNoLote = Math.min(lote.quantidade, m.estoque.quantidade);
      const escala = total > disponivelNoLote ? disponivelNoLote / total : 1;
      const qualidade = m.estoque.qualidade;
      let vendido = 0;
      for (const x of lista) vendido += negociar(ctx, vendedor, x.comprador, produto, x.mensal * escala, lote.preco, qualidade);
      vendidoNoLote.set(chave, vendido);
    }
  }

  // 4. Atacado do dia: disponível = menor entre a oferta diária e o estoque medido antes das entregas
  //    (menos o que saiu no lote), atendido na proporção quando os pedidos o excedem.
  for (const vendedor of empresas) {
    for (const [produto, m] of Object.entries(vendedor.materiasPrimas)) {
      const chave = `${vendedor.id}|${produto}`;
      const lista = pedidos.get(chave);
      if (!lista || !m.ofertaAtacado) continue;
      const limite = Math.min(m.ofertaAtacado.quantidadeMensal / n, estoqueInicial.get(chave)! - (vendidoNoLote.get(chave) ?? 0));
      const total = soma(lista.map((x) => x.mensal / n));
      const escala = total > limite ? limite / total : 1;
      const qualidade = m.estoque.qualidade;
      for (const x of lista) negociar(ctx, vendedor, x.comprador, produto, (x.mensal / n) * escala, m.ofertaAtacado.preco, qualidade);
    }
  }
}

function soma(valores: readonly number[]): number {
  let total = 0;
  for (const v of valores) total += v;
  return total;
}

/**
 * Uma entrega do vendedor ao comprador, limitada ao estoque do vendedor. Devolve a quantidade entregue.
 * O mesmo valor em centavos sai do comprador e entra no vendedor.
 */
function negociar(ctx: Contexto, vendedor: EstadoEmpresa, comprador: EstadoEmpresa, produto: string, quantidadePedida: number, preco: Centavos, qualidade: number): number {
  const estoque = vendedor.materiasPrimas[produto]!.estoque;
  const quantidade = Math.min(quantidadePedida, estoque.quantidade);
  if (quantidade < QUANTIDADE_MINIMA) return 0;
  const valor = arredondarCentavos(quantidade * preco);
  const custo = darSaida(estoque, quantidade);
  movimentarCaixa(vendedor, ctx.lancamentos, valor, "operacional", "venda no atacado", comprador.id, vendedor.id, produto);
  reconhecerResultado(vendedor, "receita", valor);
  reconhecerResultado(vendedor, "cpv", custo);
  movimentarCaixa(comprador, ctx.lancamentos, -valor, "operacional", "compra no atacado", vendedor.id, comprador.id, produto);
  darEntrada(comprador.materiasPrimas[produto]!.estoque, quantidade, valor, qualidade);
  return quantidade;
}
