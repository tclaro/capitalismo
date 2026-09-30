/**
 * Vendas no varejo e fidelidade (seções 6.3, 6.4, 6.5 e 6.11; passos 8, 9 e 10 da seção 6.15).
 *
 * A alocação é feita por mercado, sobre todas as ofertas de todos os produtos de uma vez, em fases,
 * para que o resultado **não dependa da ordem** de processamento das empresas ou dos produtos:
 *
 * 1. Demanda total de cada produto e participação de cada oferta ativa (logit sobre a nota).
 * 2. Primeira alocação: `min(demanda, estoque)`; se a soma de uma empresa passar da capacidade dos
 *    pontos de venda (em unidades-equivalentes), todas as ofertas dela são reduzidas na mesma proporção.
 * 3. Redistribuição única: a demanda não atendida de cada produto, menos a perda por substituição,
 *    vai para as ofertas do mesmo produto que ainda têm estoque e capacidade, na proporção das
 *    participações; de novo com redução proporcional pela capacidade restante de cada empresa.
 * 4. O que sobra se perde. A ruptura usada na fidelidade é medida sobre a demanda original da oferta.
 */
import { movimentarCaixa, reconhecerResultado } from "./contabilidade";
import type { Contexto } from "./contexto";
import { arredondarCentavos, darSaida } from "./dinheiro";
import { demandaTotal, precoMedio } from "./formulas/demanda";
import { fidelidadeNova, marca } from "./formulas/marca";
import { nota, participacoes } from "./formulas/nota";
import { taxaMensalParaTick } from "./formulas/tempo";
import type { EstadoEmpresa, EstadoMercado, EstadoOferta, ProdutoResolvido } from "./tipos";

/** Tolerância para considerar uma quantidade como zero (ruído de ponto flutuante). */
const QUASE_ZERO = 1e-9;

export interface ResultadoVendaOferta {
  empresa: EstadoEmpresa;
  oferta: EstadoOferta;
  produto: ProdutoResolvido;
  ativa: boolean;
  qualidade: number;
  marca: number;
  nota: number;
  participacao: number;
  demanda: number;
  /** Vendas da primeira alocação (sem redistribuição). */
  vendasPrimarias: number;
  vendas: number;
  receita: number;
  fracaoRuptura: number;
}

/** Capacidade de venda da empresa no tick, em unidades-equivalentes. */
export function capacidadeDeVenda(empresa: EstadoEmpresa, ctx: Contexto): number {
  let operando = 0;
  for (const pdv of empresa.pontosDeVenda) if (pdv.operaDesdeTick <= ctx.tick) operando++;
  return operando * ctx.estado.parametros.pontoDeVenda.capacidadePorDia * ctx.diasPorTick;
}

/** Há fábrica em operação para o produto? */
export function temFabricaOperando(empresa: EstadoEmpresa, produto: string, tick: number): boolean {
  return empresa.fabricas.some((f) => f.produto === produto && f.operaDesdeTick <= tick);
}

/**
 * Oferta ativa = preço definido e (estoque > 0 ou abastecimento programado). Uma oferta ativa sem
 * estoque participa da disputa e sofre ruptura, que é justamente a lição de abastecimento.
 */
export function ofertaAtiva(empresa: EstadoEmpresa, oferta: EstadoOferta, tick: number): boolean {
  if (oferta.decisao.preco === null) return false;
  if (oferta.estoque.quantidade > QUASE_ZERO) return true;
  if (oferta.decisao.compraMensal > 0) return true;
  return oferta.decisao.producaoMensal > 0 && temFabricaOperando(empresa, oferta.produto, tick);
}

function alocarMercado(ctx: Contexto, mercado: EstadoMercado, empresas: readonly EstadoEmpresa[]): ResultadoVendaOferta[] {
  const p = ctx.estado.parametros;
  const n = ctx.ticksPorMes;
  const resultados: ResultadoVendaOferta[] = [];
  const porProduto = new Map<string, ResultadoVendaOferta[]>();

  // Fase 1: notas, participações e demanda de cada oferta ativa.
  for (const produto of p.produtos) {
    const varejo = produto.varejo;
    if (!varejo) continue;
    const doProduto: ResultadoVendaOferta[] = [];
    for (const empresa of empresas) {
      const oferta = empresa.ofertas.find((o) => o.produto === produto.id)!;
      const ativa = ofertaAtiva(empresa, oferta, ctx.tick);
      const qualidade = oferta.estoque.quantidade > QUASE_ZERO ? oferta.estoque.qualidade : oferta.qualidadeReferencia;
      const m = marca(oferta.reconhecimento, oferta.fidelidade, p.marca.pesoReconhecimento, p.marca.pesoFidelidade);
      const r: ResultadoVendaOferta = {
        empresa,
        oferta,
        produto,
        ativa,
        qualidade,
        marca: m,
        nota: ativa ? nota(qualidade, m, oferta.decisao.preco!, varejo.precoReferencia, varejo.pesos) : 0,
        participacao: 0,
        demanda: 0,
        vendasPrimarias: 0,
        vendas: 0,
        receita: 0,
        fracaoRuptura: 0,
      };
      doProduto.push(r);
      resultados.push(r);
    }
    porProduto.set(produto.id, doProduto);

    const ativas = doProduto.filter((r) => r.ativa);
    const pm = precoMedio(
      ativas.map((r) => ({ preco: r.oferta.decisao.preco!, demandaAnterior: r.oferta.demandaAnterior })),
      varejo.precoReferencia,
    );
    const total =
      ativas.length === 0
        ? 0
        : demandaTotal({
            populacao: mercado.populacao,
            consumoPorHabitante: varejo.consumoMensalPorHabitante / n,
            fatorCiclo: mercado.fatorCiclo,
            precoMedio: pm,
            precoReferencia: varejo.precoReferencia,
            elasticidade: varejo.elasticidade,
          });
    ctx.historico.demandaTotal.push({ mercado: mercado.id, produto: produto.id, demanda: total, precoMedio: pm });

    const shares = participacoes(
      ativas.map((r) => r.nota),
      p.vendas.sensibilidadeNota,
    );
    ativas.forEach((r, i) => {
      r.participacao = shares[i]!;
      r.demanda = total * r.participacao;
    });
  }

  // Fase 2: primeira alocação, limitada por estoque e pela capacidade de cada empresa.
  const capacidadeRestante = new Map<EstadoEmpresa, number>();
  for (const empresa of empresas) {
    const doEmpresa = resultados.filter((r) => r.empresa === empresa && r.ativa);
    let uso = 0;
    for (const r of doEmpresa) {
      r.vendasPrimarias = Math.min(r.demanda, r.oferta.estoque.quantidade);
      uso += r.vendasPrimarias * r.produto.varejo!.fatorCapacidade;
    }
    const capacidade = capacidadeDeVenda(empresa, ctx);
    const escala = uso > capacidade ? (uso > 0 ? capacidade / uso : 0) : 1;
    let usado = 0;
    for (const r of doEmpresa) {
      r.vendasPrimarias *= escala;
      r.vendas = r.vendasPrimarias;
      usado += r.vendasPrimarias * r.produto.varejo!.fatorCapacidade;
    }
    capacidadeRestante.set(empresa, Math.max(0, capacidade - usado));
  }

  // Fase 3: redistribuição única da demanda não atendida, por produto.
  const pedidosExtras = new Map<ResultadoVendaOferta, number>();
  for (const doProduto of porProduto.values()) {
    const ativas = doProduto.filter((r) => r.ativa);
    let naoAtendida = 0;
    for (const r of ativas) naoAtendida += r.demanda - r.vendasPrimarias;
    naoAtendida *= 1 - p.vendas.perdaSubstituicao;
    if (naoAtendida <= QUASE_ZERO) continue;
    const candidatas = ativas.filter(
      (r) => r.oferta.estoque.quantidade - r.vendasPrimarias > QUASE_ZERO && capacidadeRestante.get(r.empresa)! > QUASE_ZERO,
    );
    let somaParticipacoes = 0;
    for (const r of candidatas) somaParticipacoes += r.participacao;
    if (somaParticipacoes <= 0) continue;
    for (const r of candidatas) {
      const sobra = r.oferta.estoque.quantidade - r.vendasPrimarias;
      pedidosExtras.set(r, Math.min(sobra, (naoAtendida * r.participacao) / somaParticipacoes));
    }
  }

  // Fase 4: limite da capacidade restante na redistribuição.
  for (const empresa of empresas) {
    const doEmpresa = resultados.filter((r) => r.empresa === empresa && pedidosExtras.has(r));
    let uso = 0;
    for (const r of doEmpresa) uso += pedidosExtras.get(r)! * r.produto.varejo!.fatorCapacidade;
    const restante = capacidadeRestante.get(empresa)!;
    const escala = uso > restante ? (uso > 0 ? restante / uso : 0) : 1;
    for (const r of doEmpresa) r.vendas = r.vendasPrimarias + pedidosExtras.get(r)! * escala;
  }

  for (const r of resultados) {
    if (r.ativa && r.demanda > QUASE_ZERO) r.fracaoRuptura = Math.max(0, (r.demanda - r.vendasPrimarias) / r.demanda);
  }
  return resultados;
}

/** Passos 8 e 9: demanda, alocação, receita e custo das vendas. */
export function etapaVendas(ctx: Contexto): ResultadoVendaOferta[] {
  const todos: ResultadoVendaOferta[] = [];
  for (const mercado of ctx.estado.mercados) {
    const empresas = ctx.estado.empresas.filter((e) => e.mercado === mercado.id);
    todos.push(...alocarMercado(ctx, mercado, empresas));
  }

  for (const r of todos) {
    const { empresa, oferta } = r;
    if (r.vendas > QUASE_ZERO) {
      r.receita = arredondarCentavos(r.vendas * oferta.decisao.preco!);
      movimentarCaixa(empresa, ctx.lancamentos, r.receita, "operacional", "venda no varejo", "consumidores", empresa.id, r.produto.id);
      reconhecerResultado(empresa, "receita", r.receita);
      reconhecerResultado(empresa, "cpv", darSaida(oferta.estoque, Math.min(r.vendas, oferta.estoque.quantidade)));
    } else {
      r.vendas = 0;
    }
    oferta.demandaAnterior = r.ativa ? r.demanda : 0;
    oferta.vendasAnterior = r.vendas;
    oferta.notaAnterior = r.nota;
    oferta.participacaoAnterior = r.participacao;
    if (oferta.estoque.quantidade > QUASE_ZERO) oferta.qualidadeReferencia = oferta.estoque.qualidade;
    else if (r.vendas > 0) oferta.qualidadeReferencia = r.qualidade;

    const emRuptura = r.fracaoRuptura > QUASE_ZERO;
    if (emRuptura && !oferta.emRuptura) ctx.avisos.push({ tipo: "ruptura_de_estoque", empresa: empresa.id, produto: r.produto.id });
    oferta.emRuptura = emRuptura;
  }
  return todos;
}

/** Passo 10: fidelidade pela experiência de quem comprou (qualidade relativa e ruptura). */
export function etapaFidelidade(ctx: Contexto, resultados: readonly ResultadoVendaOferta[]): void {
  const p = ctx.estado.parametros;
  const n = ctx.ticksPorMes;
  const pf = {
    decaimento: taxaMensalParaTick(p.marca.decaimentoFidelidadeMensal, n),
    taxa: p.marca.taxaFidelidadeMensal / n,
    penalidadeRuptura: p.marca.penalidadeRupturaMensal / n,
    minima: p.marca.fidelidadeMinima,
  };

  // Qualidade esperada por (mercado, produto): média ponderada pelas vendas do tick; sem vendas,
  // média simples das ofertas ativas; sem ofertas, a qualidade do fornecedor (ou 50).
  const esperada = new Map<string, number>();
  const chave = (r: ResultadoVendaOferta) => `${r.empresa.mercado}|${r.produto.id}`;
  const grupos = new Map<string, ResultadoVendaOferta[]>();
  for (const r of resultados) {
    const k = chave(r);
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k)!.push(r);
  }
  for (const [k, grupo] of grupos) {
    let somaVendas = 0;
    let somaPonderada = 0;
    for (const r of grupo) {
      somaVendas += r.vendas;
      somaPonderada += r.vendas * r.qualidade;
    }
    const ativas = grupo.filter((r) => r.ativa);
    let q: number;
    if (somaVendas > QUASE_ZERO) q = somaPonderada / somaVendas;
    else if (ativas.length > 0) q = ativas.reduce((s, r) => s + r.qualidade, 0) / ativas.length;
    else q = grupo[0]!.produto.fornecedor?.qualidade ?? 50;
    esperada.set(k, q);
  }

  for (const r of resultados) {
    const o = r.oferta;
    // Sem venda não há experiência de compra: a fidelidade só decai (e sofre a ruptura, se houve).
    const qualidadeExperimentada = r.vendas > QUASE_ZERO ? r.qualidade : esperada.get(chave(r))!;
    o.fidelidade = fidelidadeNova(o.fidelidade, o.reconhecimento, qualidadeExperimentada, esperada.get(chave(r))!, r.fracaoRuptura, pf);

    ctx.historico.ofertas.push({
      empresa: r.empresa.id,
      mercado: r.empresa.mercado,
      produto: r.produto.id,
      ativa: r.ativa,
      preco: o.decisao.preco,
      nota: r.nota,
      participacao: r.participacao,
      demanda: r.demanda,
      vendas: r.vendas,
      receita: r.receita,
      estoqueFinal: o.estoque.quantidade,
      qualidade: r.qualidade,
      reconhecimento: o.reconhecimento,
      fidelidade: o.fidelidade,
      marca: marca(o.reconhecimento, o.fidelidade, p.marca.pesoReconhecimento, p.marca.pesoFidelidade),
      tecnologia: o.tecnologia,
    });
  }
}
