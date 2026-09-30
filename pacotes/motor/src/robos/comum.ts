/**
 * Estimativas e regras de gestão compartilhadas pelas estratégias dos robôs.
 * Tudo aqui usa **somente** a `VisaoEmpresa` (a mesma informação de uma equipe).
 */
import { DIAS_POR_MES, type Decisao } from "../tipos";
import type { OfertaPropria, ProdutoVisivel, VisaoEmpresa } from "../visao";

/** Markup usado como referência de preço quando nenhum concorrente tem preço (≈ preço de mercado típico). */
export const MARKUP_REFERENCIA = 1.35;

export function produto(visao: VisaoEmpresa, id: string): ProdutoVisivel {
  return visao.produtos.find((p) => p.id === id)!;
}

export function ofertaPropria(visao: VisaoEmpresa, id: string): OfertaPropria {
  return visao.empresa.ofertas.find((o) => o.produto === id)!;
}

/** Custo unitário de comprar pronto, em centavos (Infinity se não há fornecedor). */
export function custoPronto(p: ProdutoVisivel): number {
  return p.fornecedor ? p.fornecedor.preco : Infinity;
}

/**
 * Custo variável unitário de fabricar (insumos + mão de obra), em centavos (Infinity se não é fabricável).
 * `multiplicadorMaoDeObra` vem da curva de aprendizado (1 = fábrica experiente).
 */
export function custoFabricado(p: ProdutoVisivel, multiplicadorMaoDeObra = 1): number {
  if (!p.fabricacao) return Infinity;
  let insumos = 0;
  for (const i of p.fabricacao.receita) insumos += i.quantidadePorLote * i.precoFornecedor;
  return insumos / p.fabricacao.unidadesPorLote + p.fabricacao.custoMaoDeObraPorUnidade * multiplicadorMaoDeObra;
}

/** Média de uma lista (a curva de aprendizado vista como "média dos níveis" pelo primeiro ano de uma fábrica nova). */
const media = (xs: readonly number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 1);

/** Média dos preços dos concorrentes que vendem o produto; `null` se nenhum vende. */
export function precoMedioConcorrentes(visao: VisaoEmpresa, produtoId: string): number | null {
  let soma = 0;
  let n = 0;
  for (const c of visao.concorrentes) {
    const o = c.ofertas.find((x) => x.produto === produtoId);
    if (o && o.preco !== null) {
      soma += o.preco;
      n++;
    }
  }
  return n > 0 ? soma / n : null;
}

/** Preço de referência do mercado para o robô: média dos concorrentes ou custo pronto × markup típico. */
export function precoDeReferencia(visao: VisaoEmpresa, p: ProdutoVisivel): number {
  return precoMedioConcorrentes(visao, p.id) ?? Math.min(custoPronto(p), custoFabricado(p)) * MARKUP_REFERENCIA;
}

/** Preço válido: inteiro em centavos, entre 1 e o preço máximo do produto. */
export function precoValido(p: ProdutoVisivel, preco: number): number {
  return Math.max(1, Math.min(p.precoMaximo, Math.round(preco)));
}

/**
 * Demanda mensal esperada para a própria oferta: a demanda recebida no último tick; sem histórico,
 * a demanda total do mercado (ou a pesquisa de mercado) dividida pelo número de empresas.
 */
export function demandaEsperadaMensal(visao: VisaoEmpresa, p: ProdutoVisivel): number {
  const n = visao.ticksPorMes;
  const o = ofertaPropria(visao, p.id);
  if (o.demandaAnterior > 0) return o.demandaAnterior * n;
  const total = visao.demandaTotalAnterior[p.id] ?? 0;
  const empresas = Math.max(1, visao.mercado.empresas);
  if (total > 0) return (total * n) / empresas;
  return (visao.mercado.populacao * p.consumoMensalPorHabitante * visao.mercado.fatorCiclo) / empresas;
}

/**
 * Abastecimento mensal: demanda esperada com folga, descontando o estoque acima da cobertura desejada.
 * Nunca negativo; arredondado para unidades inteiras.
 */
export function abastecimentoMensal(visao: VisaoEmpresa, p: ProdutoVisivel, demandaMensal: number, folga: number, diasDeCobertura = 7): number {
  const o = ofertaPropria(visao, p.id);
  const diaria = demandaMensal / DIAS_POR_MES;
  const excesso = Math.max(0, o.estoque.quantidade - diaria * diasDeCobertura);
  return Math.max(0, Math.round(demandaMensal * (1 + folga) - excesso));
}

/** Vendas mensais que a capacidade dos pontos de venda permite, dado o uso por produto. */
function capacidadeMensalTotal(visao: VisaoEmpresa, pontos: number): number {
  return pontos * visao.custos.pontoDeVenda.capacidadePorDia * DIAS_POR_MES;
}

/**
 * Quantos pontos de venda abrir para atender `usoMensal` (em unidades-equivalentes) com a utilização
 * alvo, contando os que já estão em obra. No máximo `maximo` por decisão, e só com caixa folgado.
 */
export function pontosDeVendaAAbrir(visao: VisaoEmpresa, usoMensal: number, utilizacaoAlvo: number, maximo: number, reservaDeCaixa: number): number {
  const existentes = visao.empresa.pontosDeVendaOperando + visao.empresa.pontosDeVendaEmObra;
  const capacidade = capacidadeMensalTotal(visao, existentes);
  if (usoMensal <= capacidade * utilizacaoAlvo) return 0;
  const porPonto = capacidadeMensalTotal(visao, 1);
  const faltam = Math.ceil((usoMensal / utilizacaoAlvo - capacidade) / porPonto);
  const custo = visao.custos.pontoDeVenda.custoAbertura;
  const podePagar = Math.floor(Math.max(0, visao.empresa.caixa - reservaDeCaixa) / custo);
  return Math.max(0, Math.min(faltam, maximo, podePagar));
}

/**
 * Payback (meses) de uma fábrica para o volume mensal esperado: capex / (economia por unidade × volume −
 * custo fixo). `Infinity` se não compensa.
 */
export function paybackDaFabrica(p: ProdutoVisivel, volumeMensal: number, aprendizado?: VisaoEmpresa["custos"]["aprendizado"]): number {
  if (!p.fabricacao || !p.fornecedor) return Infinity;
  // Fábrica nova: capacidade e mão de obra na média da curva de aprendizado.
  const capacidade = p.fabricacao.capacidadeUnidadesPorDia * DIAS_POR_MES * (aprendizado ? media(aprendizado.capacidade) : 1);
  const volume = Math.min(volumeMensal, capacidade);
  const ganho = (custoPronto(p) - custoFabricado(p, aprendizado ? media(aprendizado.maoDeObra) : 1)) * volume - p.fabricacao.custoFixoMensal;
  return ganho > 0 ? p.fabricacao.capex / ganho : Infinity;
}

export interface PoliticaFabrica {
  /** Payback máximo aceito, em meses (Infinity = qualquer fábrica que dê lucro). */
  paybackMaximo: number;
  /** Caixa mínimo após pagar o capex, como múltiplo do capex. */
  folgaDeCaixa: number;
}

/**
 * Deve construir (mais) uma fábrica para o produto agora? `caixaDisponivel` é o caixa ainda não
 * comprometido com outros investimentos da mesma rodada de decisões.
 */
export function deveConstruirFabrica(visao: VisaoEmpresa, p: ProdutoVisivel, volumeMensal: number, politica: PoliticaFabrica, caixaDisponivel: number): boolean {
  if (!p.fabricacao || visao.empresa.creditoEmergencial > 0) return false;
  const o = ofertaPropria(visao, p.id);
  if (o.fabricasEmObra > 0) return false;
  const capacidadeMensal = (o.fabricasOperando * p.fabricacao.capacidadeUnidadesPorDia * DIAS_POR_MES);
  if (o.fabricasOperando > 0 && volumeMensal <= capacidadeMensal * 1.1) return false;
  const volumeAdicional = o.fabricasOperando > 0 ? volumeMensal - capacidadeMensal : volumeMensal;
  if (paybackDaFabrica(p, volumeAdicional, visao.custos.aprendizado) > politica.paybackMaximo) return false;
  return caixaDisponivel >= p.fabricacao.capex * (1 + politica.folgaDeCaixa);
}

export interface PlanoProduto {
  produto: string;
  /** Preço a partir do custo unitário completo (variável ponderado pelo abastecimento + rateio de fixos). */
  preco: (custoUnitario: number) => number;
  demandaMensal: number;
  fabricar: boolean;
  publicidadeFracao: number;
  pdFracao: number;
  folga: number;
}

/** Utilização da capacidade usada para ratear os custos fixos por unidade. */
const UTILIZACAO_DE_RATEIO = 0.8;

/**
 * Custo fixo mensal por unidade-equivalente de venda: pontos de venda e fábricas em operação, rateados
 * pela capacidade de venda a 80% de utilização (estimativa estável, que não explode com demanda baixa).
 */
export function custoFixoPorUnidadeEquivalente(visao: VisaoEmpresa): number {
  const pontos = visao.empresa.pontosDeVendaOperando + visao.empresa.pontosDeVendaEmObra;
  let fixos = pontos * visao.custos.pontoDeVenda.custoFixoMensal;
  for (const o of visao.empresa.ofertas) {
    const fab = produto(visao, o.produto).fabricacao;
    if (fab) fixos += o.fabricasOperando * fab.custoFixoMensal;
  }
  const capacidade = capacidadeMensalTotal(visao, Math.max(1, pontos)) * UTILIZACAO_DE_RATEIO;
  return fixos / capacidade;
}

/** Custo variável unitário médio de um abastecimento que mistura produção própria e compra pronta. */
export function custoVariavelPonderado(p: ProdutoVisivel, producao: number, compra: number, multiplicadorMaoDeObra = 1): number {
  const total = producao + compra;
  if (total <= 0) return Math.min(custoPronto(p), custoFabricado(p, multiplicadorMaoDeObra));
  const fabricado = producao > 0 ? custoFabricado(p, multiplicadorMaoDeObra) : 0;
  const pronto = compra > 0 ? custoPronto(p) : 0;
  return (producao * fabricado + compra * pronto) / total;
}

/**
 * Transforma um plano por produto em decisões: abastecimento (produção própria até a capacidade e
 * compra pronta para o resto), preço sobre o custo completo desse abastecimento, verbas proporcionais
 * à receita esperada, fábricas e pontos de venda.
 */
export function decisoesDoPlano(
  visao: VisaoEmpresa,
  planos: readonly PlanoProduto[],
  opcoes: { politicaFabrica: PoliticaFabrica | null; gerirPontosDeVenda: boolean; utilizacaoAlvo?: number },
): Decisao[] {
  const decisoes: Decisao[] = [];
  const emAperto = visao.empresa.creditoEmergencial > 0;
  const corteVerbas = emAperto ? 0.3 : 1;
  const fixoPorEquivalente = custoFixoPorUnidadeEquivalente(visao);
  const utilizacao = opcoes.utilizacaoAlvo ?? 0.9;
  let reservaCaixa = 0;

  // 1. Pontos de venda primeiro: são o gargalo das vendas. Reserva o caixa deles antes das fábricas.
  let usoDemandado = 0;
  for (const plano of planos) usoDemandado += plano.demandaMensal * produto(visao, plano.produto).fatorCapacidade;
  if (opcoes.gerirPontosDeVenda && !emAperto) {
    const abrir = pontosDeVendaAAbrir(visao, usoDemandado, utilizacao, 3, visao.custos.pontoDeVenda.custoAbertura);
    if (abrir > 0) {
      decisoes.push({ tipo: "abrirPontoDeVenda", empresa: visao.empresa.id, quantidade: abrir });
      reservaCaixa += abrir * visao.custos.pontoDeVenda.custoAbertura;
    }
  }

  // 2. Volume que dá para vender: a demanda, limitada pela capacidade dos pontos em operação ou em obra.
  const pontos = visao.empresa.pontosDeVendaOperando + visao.empresa.pontosDeVendaEmObra;
  const capacidadeVendavel = capacidadeMensalTotal(visao, pontos);
  const escalaVendavel = usoDemandado > capacidadeVendavel ? capacidadeVendavel / usoDemandado : 1;

  for (const plano of planos) {
    const p = produto(visao, plano.produto);
    const o = ofertaPropria(visao, p.id);
    const volumeMensal = plano.demandaMensal * escalaVendavel;
    const alvo = abastecimentoMensal(visao, p, volumeMensal, plano.folga);
    const capacidadeProducaoMensal = o.capacidadeProducaoPorTick * visao.ticksPorMes;
    const producao = plano.fabricar && p.fabricacao ? Math.min(alvo, Math.floor(capacidadeProducaoMensal)) : 0;
    const compra = p.fornecedor ? Math.max(0, alvo - producao) : 0;
    const custoUnitario = custoVariavelPonderado(p, producao, compra, o.multiplicadorMaoDeObra) + fixoPorEquivalente * p.fatorCapacidade;
    const preco = precoValido(p, plano.preco(custoUnitario));
    const receitaEsperada = volumeMensal * preco;
    const publicidade = Math.max(0, Math.round(plano.publicidadeFracao * receitaEsperada * corteVerbas));
    const pd = plano.fabricar && p.fabricacao ? Math.max(0, Math.round(plano.pdFracao * receitaEsperada * corteVerbas)) : 0;

    decisoes.push({
      tipo: "produto",
      empresa: visao.empresa.id,
      produto: p.id,
      preco,
      compraMensal: compra,
      producaoMensal: producao,
      publicidadeMensal: publicidade,
      pdMensal: pd,
    });

    // 3. Fábricas com o caixa que sobra depois dos pontos de venda e das fábricas já decididas.
    if (plano.fabricar && opcoes.politicaFabrica && deveConstruirFabrica(visao, p, volumeMensal, opcoes.politicaFabrica, visao.empresa.caixa - reservaCaixa)) {
      decisoes.push({ tipo: "construirFabrica", empresa: visao.empresa.id, produto: p.id });
      reservaCaixa += p.fabricacao!.capex;
    }
  }
  return decisoes;
}
