/**
 * Fazendas (camada 3, seção 6.16): produção de matéria-prima, coprodutos, qualidade por experiência,
 * custos e evolução do estoque.
 *
 * Passo 4 do tick (`etapaProducaoDasFazendas`): cada fazenda em operação produz, por dia, o menor entre
 * a decisão (`producaoMensal` / ticks do mês), a capacidade nominal e o que ainda cabe no estoque de cada
 * produto da atividade. A produção de uma fazenda só depende do estado da própria empresa, então a
 * ordem das empresas não altera o resultado.
 *
 * - O custo variável do dia entra no estoque e chega à DRE pelo CPV, na venda (custeio por competência);
 *   é repartido entre os coprodutos pelo valor de referência (preço do fornecedor externo × quantidade).
 * - A qualidade da produção cresce com a experiência da fazenda (meses de produção à capacidade nominal).
 * - Capacidade do estoque de uma matéria-prima = Σ (capacidade diária × proporção × dias de armazenagem)
 *   das fazendas em operação que a produzem. Estoque cheio para a produção; o custo fixo continua.
 */
import { movimentarCaixa, reconhecerResultado } from "./contabilidade";
import { type Contexto, prazoEmTicks } from "./contexto";
import { arredondarCentavos, darEntrada, darSaida, parcelaDoDia } from "./dinheiro";
import {
  type AtividadeResolvida,
  DIAS_CHEIO_PARA_ALERTA,
  DIAS_DA_SERIE_DE_ESTOQUE,
  DIAS_POR_MES,
  type Decisao,
  type EstadoEmpresa,
  type EstadoFazenda,
} from "./tipos";

/** Quantidade abaixo da qual a produção do dia é descartada (ruído de ponto flutuante). */
const QUANTIDADE_MINIMA = 1e-9;
/** Fração da capacidade a partir da qual o estoque conta como cheio (a soma de frações não dá 1 exato). */
const TOLERANCIA_CHEIO = 1e-9;

export function atividadeDaFazenda(fazenda: EstadoFazenda, ctx: Contexto): AtividadeResolvida {
  const atividade = ctx.estado.parametros.cadeia?.atividades.find((a) => a.id === fazenda.atividade);
  if (!atividade) throw new Error(`fazenda ${fazenda.id}: atividade "${fazenda.atividade}" não existe no preset`);
  return atividade;
}

/** Fazenda que produz neste tick: obra concluída e sem troca de atividade em curso. */
export function fazendaProduzindo(fazenda: EstadoFazenda, tick: number): boolean {
  return fazenda.operaDesdeTick <= tick && (fazenda.conversaoAteTick === null || fazenda.conversaoAteTick < tick);
}

/** A fazenda está em conversão no tick (não produz)? */
export function emConversao(fazenda: EstadoFazenda, tick: number): boolean {
  return fazenda.conversaoAteTick !== null && fazenda.conversaoAteTick >= tick;
}

/** Capacidade do estoque da matéria-prima na empresa (soma das fazendas em operação que a produzem). */
export function capacidadeDeEstoque(empresa: EstadoEmpresa, produto: string, ctx: Contexto): number {
  let capacidade = 0;
  for (const f of empresa.fazendas) {
    if (f.operaDesdeTick > ctx.tick) continue;
    const a = atividadeDaFazenda(f, ctx);
    const x = a.produz.find((y) => y.produto === produto);
    if (x) capacidade += a.capacidadeUnidadesPorDia * x.proporcao * a.diasDeArmazenagem;
  }
  return capacidade;
}

/** Qualidade da produção da fazenda: base da atividade mais o ganho por mês de experiência, até o teto. */
export function qualidadeDaFazenda(fazenda: EstadoFazenda, atividade: AtividadeResolvida, ctx: Contexto): number {
  const e = ctx.estado.parametros.cadeia!.experiencia;
  return Math.min(Math.max(e.qualidadeMaxima, atividade.qualidadeBase), atividade.qualidadeBase + e.ganhoQualidadePorMes * fazenda.experiencia);
}

/**
 * Reparte `total` centavos entre os pesos, em partes inteiras que somam exatamente `total`.
 * Todas as partes menos a última são arredondadas; a última leva o resto. Sem peso algum, parte igual.
 */
export function ratear(total: number, pesos: readonly number[]): number[] {
  const soma = pesos.reduce((s, p) => s + p, 0);
  const partes: number[] = [];
  let restante = total;
  pesos.forEach((p, k) => {
    if (k === pesos.length - 1) {
      partes.push(restante);
      return;
    }
    const base = soma > 0 ? (total * p) / soma : total / pesos.length;
    const parte = Math.min(restante, Math.max(0, arredondarCentavos(base)));
    partes.push(parte);
    restante -= parte;
  });
  return partes;
}

/**
 * Matérias-primas da atividade atual da fazenda que, depois da troca, ninguém mais produz na empresa
 * (nem a nova atividade, nem as outras fazendas, em qualquer estado). Em ordem alfabética.
 */
export function produtosOrfaos(empresa: EstadoEmpresa, fazenda: EstadoFazenda, novaAtividade: AtividadeResolvida, ctx: Contexto): string[] {
  const mantidos = new Set(novaAtividade.produz.map((x) => x.produto));
  for (const g of empresa.fazendas) if (g.id !== fazenda.id) for (const x of atividadeDaFazenda(g, ctx).produz) mantidos.add(x.produto);
  return atividadeDaFazenda(fazenda, ctx)
    .produz.map((x) => x.produto)
    .filter((produto) => !mantidos.has(produto))
    .sort();
}

/**
 * Troca de atividade (decisão `trocarAtividade`): cobra a conversão, para a fazenda pelo prazo e dá
 * saída ao estoque órfão pela via escolhida. A cooperativa e o atacado são executados no passo 5 do
 * mesmo tick; a destruição é imediata.
 */
export function trocarAtividade(ctx: Contexto, empresa: EstadoEmpresa, d: Extract<Decisao, { tipo: "trocarAtividade" }>): void {
  const cadeia = ctx.estado.parametros.cadeia!;
  const fazenda = empresa.fazendas.find((f) => f.id === d.fazenda)!;
  const nova = cadeia.atividades.find((a) => a.id === d.atividade)!;

  const orfaos = produtosOrfaos(empresa, fazenda, nova, ctx);
  for (const produto of orfaos) {
    const estoque = empresa.materiasPrimas[produto]!.estoque;
    if (estoque.quantidade <= 0) continue;
    if (d.desova === "cooperativa") {
      ctx.vendasCooperativa.push({ empresa: empresa.id, produto, quantidade: estoque.quantidade });
    } else if (d.desova === "atacado") {
      const preco = arredondarCentavos(ctx.produtos.get(produto)!.fornecedor!.preco * d.fatorPrecoAtacado!);
      ctx.lotesAtacado.push({ empresa: empresa.id, produto, quantidade: estoque.quantidade, preco });
    } else {
      const descarte = arredondarCentavos(estoque.quantidade * cadeia.descarte.custoPorUnidade);
      const perda = darSaida(estoque, estoque.quantidade) + descarte;
      movimentarCaixa(empresa, ctx.lancamentos, -descarte, "operacional", "descarte de estoque", empresa.id, "descarte", produto);
      reconhecerResultado(empresa, "perda_de_estoque", perda);
    }
  }

  movimentarCaixa(empresa, ctx.lancamentos, -cadeia.conversao.custo, "operacional", "conversão de fazenda", empresa.id, "prestadores");
  reconhecerResultado(empresa, "custo_fixo_fazenda", cadeia.conversao.custo);
  fazenda.atividade = nova.id;
  fazenda.experiencia = 0;
  fazenda.producaoMensal = 0;
  // Volta a produzir no tick `tick + prazo`, como uma obra que termina nesse tick.
  fazenda.conversaoAteTick = ctx.tick + prazoEmTicks(cadeia.conversao.prazoDias, ctx) - 1;
}

/** Passo 4: produção das fazendas em operação. */
export function etapaProducaoDasFazendas(ctx: Contexto): void {
  const n = ctx.ticksPorMes;
  for (const empresa of ctx.estado.empresas) {
    for (const f of empresa.fazendas) {
      if (!fazendaProduzindo(f, ctx.tick)) continue;
      const a = atividadeDaFazenda(f, ctx);
      let q = Math.min(f.producaoMensal / n, a.capacidadeUnidadesPorDia * ctx.diasPorTick);
      for (const x of a.produz) {
        const espaco = capacidadeDeEstoque(empresa, x.produto, ctx) - empresa.materiasPrimas[x.produto]!.estoque.quantidade;
        q = Math.min(q, Math.max(0, espaco) / x.proporcao);
      }
      if (q < QUANTIDADE_MINIMA) continue;

      const custoVariavel = arredondarCentavos(q * a.custoVariavelPorUnidade);
      movimentarCaixa(empresa, ctx.lancamentos, -custoVariavel, "operacional", "custo variável da fazenda", empresa.id, "insumos_agropecuarios", a.produz[0]!.produto);
      const valores = ratear(
        custoVariavel,
        a.produz.map((x) => q * x.proporcao * (ctx.produtos.get(x.produto)!.fornecedor?.preco ?? 0)),
      );
      const qualidade = qualidadeDaFazenda(f, a, ctx);
      a.produz.forEach((x, k) => darEntrada(empresa.materiasPrimas[x.produto]!.estoque, q * x.proporcao, valores[k]!, qualidade));
      f.experiencia += q / (a.capacidadeUnidadesPorDia * DIAS_POR_MES);
    }
  }
}

/** Passo 11 (parte): custo fixo das fazendas em operação e armazenagem do estoque de matéria-prima. */
export function etapaCustosDasFazendas(ctx: Contexto): void {
  const n = ctx.ticksPorMes;
  for (const empresa of ctx.estado.empresas) {
    let mensal = 0;
    for (const f of empresa.fazendas) {
      if (f.operaDesdeTick <= ctx.tick) mensal += atividadeDaFazenda(f, ctx).custoFixoMensal;
    }
    const fixo = parcelaDoDia(mensal, ctx.dia, n);
    if (fixo > 0) {
      movimentarCaixa(empresa, ctx.lancamentos, -fixo, "operacional", "custo fixo das fazendas", empresa.id, "prestadores");
      reconhecerResultado(empresa, "custo_fixo_fazenda", fixo);
    }
    for (const [produto, m] of Object.entries(empresa.materiasPrimas)) {
      const custo = arredondarCentavos((m.estoque.quantidade * ctx.produtos.get(produto)!.custoArmazenagemMensal) / n);
      if (custo > 0) {
        movimentarCaixa(empresa, ctx.lancamentos, -custo, "operacional", "armazenagem", empresa.id, "armazem", produto);
        reconhecerResultado(empresa, "armazenagem", custo);
      }
    }
  }
}

/**
 * Passo 11 (parte): ao fim do tick, registra a fração da capacidade de cada estoque na série e conta os
 * dias seguidos em 100%. O aviso sai uma vez, quando o contador chega a `DIAS_CHEIO_PARA_ALERTA`.
 */
export function etapaEvolucaoDoEstoque(ctx: Contexto): void {
  for (const empresa of ctx.estado.empresas) {
    for (const [produto, m] of Object.entries(empresa.materiasPrimas)) {
      const capacidade = capacidadeDeEstoque(empresa, produto, ctx);
      const cheio = capacidade > 0 && m.estoque.quantidade >= capacidade * (1 - TOLERANCIA_CHEIO);
      const fracao = cheio ? 1 : capacidade > 0 ? m.estoque.quantidade / capacidade : 0;
      m.serie.push(fracao);
      if (m.serie.length > DIAS_DA_SERIE_DE_ESTOQUE) m.serie.shift();
      m.diasCheio = cheio ? m.diasCheio + 1 : 0;
      if (m.diasCheio === DIAS_CHEIO_PARA_ALERTA) ctx.avisos.push({ tipo: "estoque_cheio", empresa: empresa.id, produto });
    }
  }
}
