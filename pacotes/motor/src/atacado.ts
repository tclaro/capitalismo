/**
 * Atacado entre equipes e cooperativa (camada 3, seção 6.16; passo 5 do tick).
 *
 * Ordem do passo, para o resultado não depender da ordem das empresas:
 * 1. Vendas à cooperativa (ordens dadas no passo 2): cada empresa vende o menor entre o pedido e o seu
 *    estoque, ao preço-piso. Só depende da própria empresa.
 * 2. Disponível de cada oferta de atacado = menor entre a quantidade diária ofertada e o estoque que
 *    sobrou, medido antes de qualquer entrega do atacado (assim, o que uma empresa compra neste tick
 *    não pode ser revendido no mesmo tick).
 * 3. Pedidos agregados por (vendedor, produto), atendidos proporcionalmente quando excedem o disponível;
 *    vendedores em ordem de id, produtos em ordem alfabética, compradores em ordem de id.
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

  // 2. Disponível de cada oferta de atacado, medido antes de qualquer entrega.
  const disponivel = new Map<string, number>();
  for (const empresa of empresas) {
    for (const [produto, m] of Object.entries(empresa.materiasPrimas)) {
      if (m.ofertaAtacado) disponivel.set(`${empresa.id}|${produto}`, Math.min(m.ofertaAtacado.quantidadeMensal / n, m.estoque.quantidade));
    }
  }

  // 3. Pedidos por (vendedor, produto), na ordem dos compradores.
  const pedidos = new Map<string, { comprador: EstadoEmpresa; quantidade: number }[]>();
  for (const comprador of empresas) {
    for (const [produto, m] of Object.entries(comprador.materiasPrimas)) {
      const p = m.pedidoAtacado;
      if (!p || p.quantidadeMensal <= 0) continue;
      const vendedor = ctx.empresas.get(p.vendedor);
      if (!vendedor || vendedor.id === comprador.id || vendedor.mercado !== comprador.mercado) continue;
      const chave = `${vendedor.id}|${produto}`;
      if (!disponivel.has(chave)) continue;
      if (!pedidos.has(chave)) pedidos.set(chave, []);
      pedidos.get(chave)!.push({ comprador, quantidade: p.quantidadeMensal / n });
    }
  }

  for (const vendedor of empresas) {
    for (const [produto, m] of Object.entries(vendedor.materiasPrimas)) {
      const lista = pedidos.get(`${vendedor.id}|${produto}`);
      if (!lista || !m.ofertaAtacado) continue;
      let total = 0;
      for (const x of lista) total += x.quantidade;
      const limite = disponivel.get(`${vendedor.id}|${produto}`)!;
      const escala = total > limite ? limite / total : 1;
      const qualidade = m.estoque.qualidade;
      for (const x of lista) {
        const quantidade = Math.min(x.quantidade * escala, m.estoque.quantidade);
        if (quantidade < QUANTIDADE_MINIMA) continue;
        const valor = arredondarCentavos(quantidade * m.ofertaAtacado.preco);
        const custo = darSaida(m.estoque, quantidade);
        movimentarCaixa(vendedor, ctx.lancamentos, valor, "operacional", "venda no atacado", x.comprador.id, vendedor.id, produto);
        reconhecerResultado(vendedor, "receita", valor);
        reconhecerResultado(vendedor, "cpv", custo);
        movimentarCaixa(x.comprador, ctx.lancamentos, -valor, "operacional", "compra no atacado", vendedor.id, x.comprador.id, produto);
        darEntrada(x.comprador.materiasPrimas[produto]!.estoque, quantidade, valor, qualidade);
      }
    }
  }
}
