/**
 * P&D e fabricação própria (seção 6.6; passo 6 da seção 6.15).
 *
 * Ordem, para não depender da ordem das empresas:
 * 1. P&D do dia de todas as ofertas → nova tecnologia T' de cada uma (verba sem fábrica também
 *    acumula tecnologia, para quando a fábrica ficar pronta).
 * 2. T_max por (mercado, produto), com todas as empresas do mercado.
 * 3. Produção desejada de cada oferta, limitada pela capacidade das fábricas em operação.
 * 4. Insumos comprados do fornecedor externo no momento da produção. Se um insumo tem limite
 *    mensal, ele é dividido proporcionalmente entre todos os pedidos do mercado, e a produção de
 *    cada oferta é reduzida pelo insumo mais escasso da sua receita.
 * 5. O lote entra no estoque com custo = insumos + mão de obra e qualidade fixada na produção.
 */
import { movimentarCaixa, reconhecerResultado } from "./contabilidade";
import type { Contexto } from "./contexto";
import { arredondarCentavos, darEntrada, parcelaDoDia } from "./dinheiro";
import { qualidadeFabricada, tecnologiaNova, tecnologiaRelativa } from "./formulas/qualidade";
import { taxaMensalParaTick } from "./formulas/tempo";
import type { EstadoEmpresa, EstadoOferta, ProdutoResolvido } from "./tipos";
import { temFabricaOperando } from "./vendas";

interface PedidoProducao {
  empresa: EstadoEmpresa;
  oferta: EstadoOferta;
  produto: ProdutoResolvido;
  quantidade: number;
}

/** Capacidade de produção do produto no tick (soma das fábricas em operação). */
export function capacidadeDeProducao(empresa: EstadoEmpresa, produto: ProdutoResolvido, ctx: Contexto): number {
  if (!produto.fabricacao) return 0;
  let fabricas = 0;
  for (const f of empresa.fabricas) if (f.produto === produto.id && f.operaDesdeTick <= ctx.tick) fabricas++;
  return fabricas * produto.fabricacao.capacidadeUnidadesPorDia * ctx.diasPorTick;
}

/** Passo 6 (parte): P&D, tecnologia e fabricação. */
export function etapaFabricacao(ctx: Contexto): void {
  const p = ctx.estado.parametros;
  const n = ctx.ticksPorMes;
  const taxaTec = p.tecnologia.taxaTecnologiaMensal / n;
  const referenciaPD = p.tecnologia.verbaReferenciaMensal / n;
  const difusao = taxaMensalParaTick(p.tecnologia.difusaoTecnologicaMensal, n);

  // 1. P&D do dia e nova tecnologia.
  for (const empresa of ctx.estado.empresas) {
    for (const oferta of empresa.ofertas) {
      const verba = parcelaDoDia(oferta.decisao.pdMensal, ctx.dia, n);
      if (verba > 0) {
        movimentarCaixa(empresa, ctx.lancamentos, -verba, "operacional", "pesquisa e desenvolvimento", empresa.id, "laboratorio", oferta.produto);
        reconhecerResultado(empresa, "pd", verba);
      }
      oferta.tecnologia = tecnologiaNova(oferta.tecnologia, verba, taxaTec, referenciaPD);
    }
  }

  for (const mercado of ctx.estado.mercados) {
    const empresas = ctx.estado.empresas.filter((e) => e.mercado === mercado.id);

    // 2. Tecnologia máxima por produto no mercado; depois, difusão: cada empresa fecha uma fração da
    //    distância até a líder (a líder não muda, então T_max continua o mesmo).
    const tecnologiaMaxima = new Map<string, number>();
    for (const e of empresas) {
      for (const o of e.ofertas) tecnologiaMaxima.set(o.produto, Math.max(tecnologiaMaxima.get(o.produto) ?? 0, o.tecnologia));
    }
    if (difusao > 0) {
      for (const e of empresas) {
        for (const o of e.ofertas) o.tecnologia += difusao * (tecnologiaMaxima.get(o.produto)! - o.tecnologia);
      }
    }

    // 3. Produção desejada, limitada pela capacidade.
    const pedidos: PedidoProducao[] = [];
    for (const empresa of empresas) {
      for (const oferta of empresa.ofertas) {
        const produto = ctx.produtos.get(oferta.produto)!;
        if (!produto.fabricacao || oferta.decisao.producaoMensal <= 0) continue;
        if (!temFabricaOperando(empresa, produto.id, ctx.tick)) continue;
        const quantidade = Math.min(oferta.decisao.producaoMensal / n, capacidadeDeProducao(empresa, produto, ctx));
        if (quantidade > 0) pedidos.push({ empresa, oferta, produto, quantidade });
      }
    }
    if (pedidos.length === 0) continue;

    // 4. Insumos escassos: fração disponível de cada insumo com limite mensal.
    const necessidade = new Map<string, number>();
    for (const x of pedidos) {
      const fab = x.produto.fabricacao!;
      for (const i of fab.receita) {
        necessidade.set(i.produto, (necessidade.get(i.produto) ?? 0) + (x.quantidade * i.quantidadePorLote) / fab.unidadesPorLote);
      }
    }
    const fracaoDisponivel = new Map<string, number>();
    for (const [insumo, total] of necessidade) {
      const limite = ctx.produtos.get(insumo)!.fornecedor!.ofertaMaxMensal;
      fracaoDisponivel.set(insumo, limite === null || total <= limite / n ? 1 : limite / n / total);
    }

    // 5. Produção efetiva: compra dos insumos, mão de obra e entrada no estoque.
    for (const x of pedidos) {
      const fab = x.produto.fabricacao!;
      let escala = 1;
      for (const i of fab.receita) escala = Math.min(escala, fracaoDisponivel.get(i.produto)!);
      const quantidade = x.quantidade * escala;
      if (quantidade <= 0) continue;

      let custoInsumos = 0;
      const insumosDoLote: { peso: number; qualidade: number }[] = [];
      for (const i of fab.receita) {
        const fornecedor = ctx.produtos.get(i.produto)!.fornecedor!;
        const quantidadeInsumo = (quantidade * i.quantidadePorLote) / fab.unidadesPorLote;
        const custo = arredondarCentavos(quantidadeInsumo * fornecedor.preco);
        movimentarCaixa(x.empresa, ctx.lancamentos, -custo, "operacional", "compra de insumo", "fornecedor_externo", x.empresa.id, i.produto);
        custoInsumos += custo;
        insumosDoLote.push({ peso: i.pesoQualidade, qualidade: fornecedor.qualidade });
      }
      const maoDeObra = arredondarCentavos(quantidade * fab.custoMaoDeObraPorUnidade);
      movimentarCaixa(x.empresa, ctx.lancamentos, -maoDeObra, "operacional", "mão de obra da produção", x.empresa.id, "trabalhadores", x.produto.id);

      const relativa = tecnologiaRelativa(x.oferta.tecnologia, tecnologiaMaxima.get(x.produto.id)!, p.tecnologia.tecnologiaBase);
      const qualidade = qualidadeFabricada(insumosDoLote, fab.pesoTecnologia, relativa);
      darEntrada(x.oferta.estoque, quantidade, custoInsumos + maoDeObra, qualidade);
    }
  }
}

/** Passo 11 (parte): custo fixo das fábricas em operação. */
export function etapaCustoFixoFabricas(ctx: Contexto): void {
  const n = ctx.ticksPorMes;
  for (const empresa of ctx.estado.empresas) {
    let mensal = 0;
    for (const f of empresa.fabricas) {
      if (f.operaDesdeTick <= ctx.tick) mensal += ctx.produtos.get(f.produto)!.fabricacao!.custoFixoMensal;
    }
    const custo = parcelaDoDia(mensal, ctx.dia, n);
    if (custo > 0) {
      movimentarCaixa(empresa, ctx.lancamentos, -custo, "operacional", "custo fixo das fábricas", empresa.id, "prestadores");
      reconhecerResultado(empresa, "custo_fixo_fabrica", custo);
    }
  }
}
