/**
 * Visão de uma empresa: tudo o que a equipe (ou um robô) pode ver para decidir.
 *
 * Contém os dados completos da própria empresa e só a informação pública do mercado: preço, qualidade,
 * marca, nota e participação dos concorrentes (seção 8) e as condições do fornecedor externo. **Não**
 * contém o preço de referência interno (P_ref, seção 6.4), a elasticidade, nem caixa, estoque, custos
 * ou verbas dos concorrentes. Os robôs recebem só esta visão, com a mesma informação das equipes.
 */
import { capacidadeDeProducao, multiplicadorMaoDeObra } from "./fabricacao";
import { atividadeDaFazenda, capacidadeDeEstoque, emConversao, fazendaProduzindo, qualidadeDaFazenda } from "./fazendas";
import { faixaDePrecoNoAtacado } from "./decisoes";
import { precoDaCooperativa } from "./atacado";
import { marca as calcularMarca } from "./formulas/marca";
import { tetoDePreco } from "./formulas/nota";
import { lucroAntesIR } from "./contabilidade";
import { type Contexto, criarContexto } from "./contexto";
import type { Centavos } from "./dinheiro";
import type { AtividadeResolvida, DecisaoProdutoVigente, EstadoPartida, FechamentoMensal, OfertaAtacado, PedidoAtacado } from "./tipos";
import { capacidadeDeVenda } from "./vendas";

export interface InsumoReceitaVisao {
  produto: string;
  quantidadePorLote: number;
  pesoQualidade: number;
  /** Preço do insumo no fornecedor externo, em centavos por unidade do insumo. */
  precoFornecedor: Centavos;
  qualidadeFornecedor: number;
}

export interface ProdutoVisivel {
  id: string;
  nome: string;
  unidade: string;
  /** Consumo de mercado por habitante por mês (pesquisa de mercado pública). */
  consumoMensalPorHabitante: number;
  /** Pesos que os consumidores dão a qualidade, marca e preço (como os relatórios do jogo). */
  pesos: { qualidade: number; marca: number; preco: number };
  fatorCapacidade: number;
  /** Preço máximo permitido, em centavos. */
  precoMaximo: Centavos;
  fornecedor: { preco: Centavos; qualidade: number } | null;
  fabricacao: {
    unidadesPorLote: number;
    receita: InsumoReceitaVisao[];
    pesoTecnologia: number;
    custoMaoDeObraPorUnidade: number;
    capex: Centavos;
    prazoConstrucaoDias: number;
    custoFixoMensal: Centavos;
    capacidadeUnidadesPorDia: number;
  } | null;
}

export interface OfertaPropria {
  produto: string;
  decisao: DecisaoProdutoVigente;
  estoque: { quantidade: number; valor: Centavos; qualidade: number };
  reconhecimento: number;
  fidelidade: number;
  marca: number;
  tecnologia: number;
  qualidade: number;
  demandaAnterior: number;
  vendasAnterior: number;
  notaAnterior: number;
  participacaoAnterior: number;
  fabricasOperando: number;
  fabricasEmObra: number;
  capacidadeProducaoPorTick: number;
  /** Multiplicador atual do custo de mão de obra (curva de aprendizado das fábricas em operação). */
  multiplicadorMaoDeObra: number;
}

export interface OfertaConcorrente {
  produto: string;
  preco: Centavos | null;
  qualidade: number;
  marca: number;
  notaAnterior: number;
  participacaoAnterior: number;
}

/** Fazenda da própria empresa (camada 3). */
export interface FazendaPropria {
  id: string;
  atividade: string;
  producaoMensal: number;
  /** Meses de produção à capacidade nominal. */
  experiencia: number;
  /** Qualidade que a produção de hoje teria. */
  qualidade: number;
  operaDesdeTick: number;
  /** Último tick sem produção da troca de atividade em curso; `null` = sem conversão. */
  conversaoAteTick: number | null;
  emObra: boolean;
  emConversao: boolean;
  /** Produz no próximo tick (obra pronta e sem conversão). */
  produzindo: boolean;
}

/** Estoque de matéria-prima da própria empresa (camada 3). */
export interface MateriaPrimaPropria {
  produto: string;
  nome: string;
  unidade: string;
  estoque: { quantidade: number; valor: Centavos; qualidade: number };
  /** Capacidade do estoque (das fazendas em operação que a produzem); 0 sem fazenda. */
  capacidade: number;
  /** Dias seguidos com o estoque em 100% da capacidade. */
  diasCheio: number;
  /** Fração da capacidade (0 a 1) ao fim de cada um dos últimos dias, a mais recente por último. */
  serie: number[];
  ofertaAtacado: OfertaAtacado | null;
  pedidoAtacado: PedidoAtacado | null;
  /** Preço e qualidade do fornecedor externo (teto do atacado). */
  precoFornecedor: Centavos;
  qualidadeFornecedor: number;
  /** O que a cooperativa paga por unidade (piso do atacado). */
  precoCooperativa: Centavos;
}

/** Oferta de atacado de outra empresa do mercado: informação pública por desenho (seção 6.10). */
export interface OfertaDeAtacado {
  vendedor: string;
  produto: string;
  preco: Centavos;
  quantidadeMensal: number;
  /** Qualidade do estoque do vendedor (0 se está sem estoque). */
  qualidade: number;
}

/** Parte da visão que só existe com o módulo `cadeia_produtiva` ligado. */
export interface VisaoCadeia {
  /** Regras das atividades das fazendas (públicas, como os custos dos pontos de venda). */
  atividades: {
    id: string;
    nome: string;
    tipo: AtividadeResolvida["tipo"];
    produz: { produto: string; proporcao: number }[];
    capex: Centavos;
    prazoConstrucaoDias: number;
    custoFixoMensal: Centavos;
    custoVariavelPorUnidade: Centavos;
    capacidadeUnidadesPorDia: number;
    diasDeArmazenagem: number;
    qualidadeBase: number;
  }[];
  experiencia: { ganhoQualidadePorMes: number; qualidadeMaxima: number };
  conversao: { custo: Centavos; prazoDias: number };
  cooperativa: { fatorPiso: number };
  descarte: { custoPorUnidade: number };
  completaComFornecedor: boolean;
  fazendas: FazendaPropria[];
  materiasPrimas: MateriaPrimaPropria[];
  /** Ofertas de atacado das outras empresas do mesmo mercado (só as com quantidade positiva). */
  atacado: OfertaDeAtacado[];
  /** Faixa de preço permitida no atacado, por matéria-prima. */
  faixaDoAtacado: Record<string, { piso: Centavos; teto: Centavos }>;
}

/** Visão após o último tick processado (`tick`, `mes` e `dia` são os desse tick; 0 = partida recém-criada). */
export interface VisaoEmpresa {
  tick: number;
  mes: number;
  dia: number;
  ticksPorMes: number;
  mercado: { id: string; populacao: number; fatorCiclo: number; empresas: number };
  produtos: ProdutoVisivel[];
  /** Demanda total do tick anterior por produto (pública, como os relatórios de mercado). */
  demandaTotalAnterior: Record<string, number>;
  empresa: {
    id: string;
    nome: string;
    caixa: Centavos;
    creditoEmergencial: Centavos;
    pontosDeVendaOperando: number;
    pontosDeVendaEmObra: number;
    capacidadeVendaPorTick: number;
    lucrosAcumulados: Centavos;
    /** Lucro do mês corrente até o último dia processado, antes do IR (zera no fechamento do mês). */
    lucroDoMesAteAgora: Centavos;
    ultimoFechamento: FechamentoMensal | null;
    ofertas: OfertaPropria[];
  };
  concorrentes: { id: string; nome: string; ofertas: OfertaConcorrente[] }[];
  custos: {
    pontoDeVenda: { custoAbertura: Centavos; prazoAberturaDias: number; custoFixoMensal: Centavos; capacidadePorDia: number };
    aliquotaIR: number;
    jurosEmergencialMensal: number;
    /** Curva de aprendizado das fábricas (pública: é regra do jogo). */
    aprendizado: { limitesMeses: number[]; capacidade: number[]; maoDeObra: number[] };
  };
  /** `null` com o módulo `cadeia_produtiva` desligado. */
  cadeia: VisaoCadeia | null;
}

function visaoDaCadeia(estado: EstadoPartida, empresaId: string, ctx: Contexto): VisaoCadeia | null {
  const cadeia = estado.parametros.cadeia;
  if (!cadeia || !estado.modulos.includes("cadeia_produtiva")) return null;
  const empresa = estado.empresas.find((e) => e.id === empresaId)!;
  const proximo = estado.tick + 1; // o tick que vem: é nele que as decisões e a produção valem
  const faixaDoAtacado: VisaoCadeia["faixaDoAtacado"] = {};
  for (const produto of Object.keys(empresa.materiasPrimas)) faixaDoAtacado[produto] = faixaDePrecoNoAtacado(estado, produto);
  return {
    atividades: cadeia.atividades.map((a) => ({
      id: a.id,
      nome: a.nome,
      tipo: a.tipo,
      produz: a.produz.map((x) => ({ produto: x.produto, proporcao: x.proporcao })),
      capex: a.capex,
      prazoConstrucaoDias: a.prazoConstrucaoDias,
      custoFixoMensal: a.custoFixoMensal,
      custoVariavelPorUnidade: a.custoVariavelPorUnidade,
      capacidadeUnidadesPorDia: a.capacidadeUnidadesPorDia,
      diasDeArmazenagem: a.diasDeArmazenagem,
      qualidadeBase: a.qualidadeBase,
    })),
    experiencia: { ...cadeia.experiencia },
    conversao: { ...cadeia.conversao },
    cooperativa: { ...cadeia.cooperativa },
    descarte: { ...cadeia.descarte },
    completaComFornecedor: cadeia.completaComFornecedor,
    fazendas: empresa.fazendas.map((f) => ({
      id: f.id,
      atividade: f.atividade,
      producaoMensal: f.producaoMensal,
      experiencia: f.experiencia,
      qualidade: qualidadeDaFazenda(f, atividadeDaFazenda(f, ctx), ctx),
      operaDesdeTick: f.operaDesdeTick,
      conversaoAteTick: f.conversaoAteTick,
      emObra: f.operaDesdeTick > proximo,
      emConversao: emConversao(f, proximo),
      produzindo: fazendaProduzindo(f, proximo),
    })),
    materiasPrimas: Object.entries(empresa.materiasPrimas).map(([id, m]) => {
      const produto = ctx.produtos.get(id)!;
      return {
        produto: id,
        nome: produto.nome,
        unidade: produto.unidade,
        estoque: { ...m.estoque },
        capacidade: capacidadeDeEstoque(empresa, id, ctx),
        diasCheio: m.diasCheio,
        serie: [...m.serie],
        ofertaAtacado: m.ofertaAtacado ? { ...m.ofertaAtacado } : null,
        pedidoAtacado: m.pedidoAtacado ? { ...m.pedidoAtacado } : null,
        precoFornecedor: produto.fornecedor!.preco,
        qualidadeFornecedor: produto.fornecedor!.qualidade,
        precoCooperativa: precoDaCooperativa(produto.fornecedor!.preco, cadeia.cooperativa.fatorPiso),
      };
    }),
    atacado: estado.empresas
      .filter((e) => e.id !== empresaId && e.mercado === empresa.mercado)
      .flatMap((e) =>
        Object.entries(e.materiasPrimas).flatMap(([id, m]) =>
          m.ofertaAtacado && m.ofertaAtacado.quantidadeMensal > 0
            ? [{ vendedor: e.id, produto: id, preco: m.ofertaAtacado.preco, quantidadeMensal: m.ofertaAtacado.quantidadeMensal, qualidade: m.estoque.quantidade > 0 ? m.estoque.qualidade : 0 }]
            : [],
        ),
      ),
    faixaDoAtacado,
  };
}

/** Monta a visão da empresa a partir do estado (sem alterá-lo). */
export function visaoDaEmpresa(estado: EstadoPartida, empresaId: string): VisaoEmpresa {
  const empresa = estado.empresas.find((e) => e.id === empresaId);
  if (!empresa) throw new Error(`empresa "${empresaId}" não existe`);
  // O contexto é só leitura aqui: tempo do tick corrente e índices.
  const ctx = criarContexto(estado);
  const p = estado.parametros;
  const mercado = ctx.mercados.get(empresa.mercado)!;
  const doMercado = estado.empresas.filter((e) => e.mercado === mercado.id);
  const marcaDe = (reconhecimento: number, fidelidade: number) => calcularMarca(reconhecimento, fidelidade, p.marca.pesoReconhecimento, p.marca.pesoFidelidade);
  const qualidadeDe = (o: (typeof empresa.ofertas)[number]) => (o.estoque.quantidade > 0 ? o.estoque.qualidade : o.qualidadeReferencia);

  const produtos: ProdutoVisivel[] = p.produtos
    .filter((x) => x.varejo !== null)
    .map((x) => ({
      id: x.id,
      nome: x.nome,
      unidade: x.unidade,
      consumoMensalPorHabitante: x.varejo!.consumoMensalPorHabitante,
      pesos: { ...x.varejo!.pesos },
      fatorCapacidade: x.varejo!.fatorCapacidade,
      precoMaximo: tetoDePreco(x.varejo!.precoReferencia, p.vendas.multiploTetoPreco),
      fornecedor: x.fornecedor ? { preco: x.fornecedor.preco, qualidade: x.fornecedor.qualidade } : null,
      fabricacao: x.fabricacao
        ? {
            unidadesPorLote: x.fabricacao.unidadesPorLote,
            receita: x.fabricacao.receita.map((i) => {
              const insumo = ctx.produtos.get(i.produto)!;
              return {
                produto: i.produto,
                quantidadePorLote: i.quantidadePorLote,
                pesoQualidade: i.pesoQualidade,
                precoFornecedor: insumo.fornecedor?.preco ?? 0,
                qualidadeFornecedor: insumo.fornecedor?.qualidade ?? 0,
              };
            }),
            pesoTecnologia: x.fabricacao.pesoTecnologia,
            custoMaoDeObraPorUnidade: x.fabricacao.custoMaoDeObraPorUnidade,
            capex: x.fabricacao.capex,
            prazoConstrucaoDias: x.fabricacao.prazoConstrucaoDias,
            custoFixoMensal: x.fabricacao.custoFixoMensal,
            capacidadeUnidadesPorDia: x.fabricacao.capacidadeUnidadesPorDia,
          }
        : null,
    }));

  const demandaTotalAnterior: Record<string, number> = {};
  for (const x of produtos) demandaTotalAnterior[x.id] = 0;
  for (const e of doMercado) for (const o of e.ofertas) demandaTotalAnterior[o.produto] = (demandaTotalAnterior[o.produto] ?? 0) + o.demandaAnterior;

  const pdvOperando = empresa.pontosDeVenda.filter((a) => a.operaDesdeTick <= estado.tick).length;

  return {
    tick: estado.tick,
    mes: ctx.mes,
    dia: ctx.dia,
    ticksPorMes: ctx.ticksPorMes,
    mercado: { id: mercado.id, populacao: mercado.populacao, fatorCiclo: mercado.fatorCiclo, empresas: doMercado.length },
    produtos,
    demandaTotalAnterior,
    empresa: {
      id: empresa.id,
      nome: empresa.nome,
      caixa: empresa.caixa,
      creditoEmergencial: empresa.creditoEmergencial,
      pontosDeVendaOperando: pdvOperando,
      pontosDeVendaEmObra: empresa.pontosDeVenda.length - pdvOperando,
      capacidadeVendaPorTick: capacidadeDeVenda(empresa, ctx),
      lucrosAcumulados: empresa.contabil.lucrosAcumulados,
      lucroDoMesAteAgora: lucroAntesIR(empresa.contabil.mesAtual.dre),
      ultimoFechamento: empresa.contabil.ultimoFechamento ? JSON.parse(JSON.stringify(empresa.contabil.ultimoFechamento)) : null,
      ofertas: empresa.ofertas.map((o) => {
        const produto = ctx.produtos.get(o.produto)!;
        const operando = empresa.fabricas.filter((f) => f.produto === o.produto && f.operaDesdeTick <= estado.tick).length;
        return {
          produto: o.produto,
          decisao: { ...o.decisao, origemInsumos: { ...o.decisao.origemInsumos } },
          estoque: { ...o.estoque },
          reconhecimento: o.reconhecimento,
          fidelidade: o.fidelidade,
          marca: marcaDe(o.reconhecimento, o.fidelidade),
          tecnologia: o.tecnologia,
          qualidade: qualidadeDe(o),
          demandaAnterior: o.demandaAnterior,
          vendasAnterior: o.vendasAnterior,
          notaAnterior: o.notaAnterior,
          participacaoAnterior: o.participacaoAnterior,
          fabricasOperando: operando,
          fabricasEmObra: empresa.fabricas.filter((f) => f.produto === o.produto).length - operando,
          capacidadeProducaoPorTick: capacidadeDeProducao(empresa, produto, ctx),
          multiplicadorMaoDeObra: multiplicadorMaoDeObra(empresa, produto, ctx),
        };
      }),
    },
    concorrentes: doMercado
      .filter((e) => e.id !== empresa.id)
      .map((e) => ({
        id: e.id,
        nome: e.nome,
        ofertas: e.ofertas.map((o) => ({
          produto: o.produto,
          preco: o.decisao.preco,
          qualidade: qualidadeDe(o),
          marca: marcaDe(o.reconhecimento, o.fidelidade),
          notaAnterior: o.notaAnterior,
          participacaoAnterior: o.participacaoAnterior,
        })),
      })),
    custos: {
      pontoDeVenda: {
        custoAbertura: p.pontoDeVenda.custoAbertura,
        prazoAberturaDias: p.pontoDeVenda.prazoAberturaDias,
        custoFixoMensal: p.pontoDeVenda.custoFixoMensal,
        capacidadePorDia: p.pontoDeVenda.capacidadePorDia,
      },
      aliquotaIR: p.financeiro.aliquotaIR,
      jurosEmergencialMensal: p.financeiro.jurosEmergencialMensal,
      aprendizado: {
        limitesMeses: [...p.aprendizado.limitesMeses],
        capacidade: [...p.aprendizado.capacidade],
        maoDeObra: [...p.aprendizado.maoDeObra],
      },
    },
    cadeia: visaoDaCadeia(estado, empresaId, ctx),
  };
}
