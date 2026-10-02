/**
 * Etapas do tick da camada 1 (seção 6.15), exceto vendas e fidelidade (`vendas.ts`).
 */
import { movimentarCaixa, reconhecerResultado } from "./contabilidade";
import type { Contexto } from "./contexto";
import { aplicarDecisao } from "./decisoes";
import { arredondarCentavos, darEntrada, parcelaDoDia } from "./dinheiro";
import { aplicarEvento } from "./eventos";
import { reconhecimentoNovo } from "./formulas/marca";
import { taxaMensalParaTick } from "./formulas/tempo";
import type { EntradasTick } from "./tipos";

/** Passo 1: eventos do cenário. */
export function etapaEventos(ctx: Contexto, entradas: EntradasTick): void {
  for (const evento of entradas.eventos ?? []) {
    const motivo = aplicarEvento(ctx.estado, evento);
    if (motivo !== null) ctx.rejeicoes.push({ decisao: evento, motivo });
    else if (evento.descricao) ctx.avisos.push({ tipo: "evento", descricao: evento.descricao });
  }
}

/** Passo 2: decisões dos robôs (geradas no tick anterior) e das equipes. */
export function etapaDecisoes(ctx: Contexto, entradas: EntradasTick): void {
  const pendentes = ctx.estado.decisoesPendentes;
  ctx.estado.decisoesPendentes = [];
  for (const d of pendentes) aplicarDecisao(ctx, d);
  for (const d of entradas.decisoes ?? []) aplicarDecisao(ctx, d);
}

/** Passo 3: obras concluídas neste tick (pontos de venda; fábricas na etapa de fabricação). */
export function etapaObras(ctx: Contexto): void {
  for (const empresa of ctx.estado.empresas) {
    const abertos = empresa.pontosDeVenda.filter((a) => a.operaDesdeTick === ctx.tick).length;
    if (abertos > 0) ctx.avisos.push({ tipo: "ponto_de_venda_aberto", empresa: empresa.id, quantidade: abertos });
    for (const f of empresa.fabricas) {
      if (f.operaDesdeTick === ctx.tick) ctx.avisos.push({ tipo: "fabrica_concluida", empresa: empresa.id, produto: f.produto });
    }
    for (const f of empresa.fazendas) {
      if (f.operaDesdeTick === ctx.tick) ctx.avisos.push({ tipo: "fazenda_concluida", empresa: empresa.id, atividade: f.atividade });
    }
  }
}

/**
 * Passo 6 (parte): compras prontas do fornecedor externo para revenda. O limite mensal do
 * fornecedor, quando existe, é dividido proporcionalmente aos pedidos de cada mercado.
 */
export function etapaComprasProntas(ctx: Contexto): void {
  const n = ctx.ticksPorMes;
  for (const mercado of ctx.estado.mercados) {
    const empresas = ctx.estado.empresas.filter((e) => e.mercado === mercado.id);
    for (const produto of ctx.estado.parametros.produtos) {
      if (!produto.varejo || !produto.fornecedor) continue;
      const fornecedor = produto.fornecedor;
      const pedidos = empresas.map((e) => ({ empresa: e, oferta: e.ofertas.find((o) => o.produto === produto.id)! }))
        .map((x) => ({ ...x, quantidade: x.oferta.decisao.compraMensal / n }))
        .filter((x) => x.quantidade > 0);
      if (pedidos.length === 0) continue;
      let total = 0;
      for (const x of pedidos) total += x.quantidade;
      const limite = fornecedor.ofertaMaxMensal === null ? Infinity : fornecedor.ofertaMaxMensal / n;
      const escala = total > limite ? limite / total : 1;
      for (const x of pedidos) {
        const q = x.quantidade * escala;
        const custo = arredondarCentavos(q * fornecedor.preco);
        darEntrada(x.oferta.estoque, q, custo, fornecedor.qualidade);
        movimentarCaixa(x.empresa, ctx.lancamentos, -custo, "operacional", "compra de mercadoria pronta", "fornecedor_externo", x.empresa.id, produto.id);
      }
    }
  }
}

/** Passo 7: publicidade do dia e reconhecimento de marca. */
export function etapaPublicidade(ctx: Contexto): void {
  const p = ctx.estado.parametros;
  const n = ctx.ticksPorMes;
  const decaimento = taxaMensalParaTick(p.marca.decaimentoReconhecimentoMensal, n);
  const taxa = taxaMensalParaTick(p.marca.taxaReconhecimentoMensal, n);
  for (const empresa of ctx.estado.empresas) {
    const mercado = ctx.mercados.get(empresa.mercado)!;
    const verbaReferencia = (p.marca.verbaReferenciaPorHabitanteMensal * mercado.populacao) / n;
    for (const oferta of empresa.ofertas) {
      const verba = parcelaDoDia(oferta.decisao.publicidadeMensal, ctx.dia, n);
      if (verba > 0) {
        movimentarCaixa(empresa, ctx.lancamentos, -verba, "operacional", "publicidade", empresa.id, "veiculos_de_midia", oferta.produto);
        reconhecerResultado(empresa, "publicidade", verba);
      }
      oferta.reconhecimento = reconhecimentoNovo(oferta.reconhecimento, verba, { decaimento, taxa, verbaReferencia });
    }
  }
}

/** Passo 11 (parte): custos fixos dos pontos de venda e armazenagem do estoque que sobrou. */
export function etapaCustosOperacionais(ctx: Contexto): void {
  const p = ctx.estado.parametros;
  const n = ctx.ticksPorMes;
  for (const empresa of ctx.estado.empresas) {
    const operando = empresa.pontosDeVenda.filter((a) => a.operaDesdeTick <= ctx.tick).length;
    const fixoPdv = parcelaDoDia(operando * p.pontoDeVenda.custoFixoMensal, ctx.dia, n);
    if (fixoPdv > 0) {
      movimentarCaixa(empresa, ctx.lancamentos, -fixoPdv, "operacional", "custo fixo dos pontos de venda", empresa.id, "prestadores", undefined);
      reconhecerResultado(empresa, "custo_fixo_ponto_de_venda", fixoPdv);
    }
    for (const oferta of empresa.ofertas) {
      const produto = ctx.produtos.get(oferta.produto)!;
      const custo = arredondarCentavos((oferta.estoque.quantidade * produto.custoArmazenagemMensal) / n);
      if (custo > 0) {
        movimentarCaixa(empresa, ctx.lancamentos, -custo, "operacional", "armazenagem", empresa.id, "armazem", oferta.produto);
        reconhecerResultado(empresa, "armazenagem", custo);
      }
    }
  }
}
