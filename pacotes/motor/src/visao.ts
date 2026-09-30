/**
 * Visão de uma empresa: tudo o que a equipe (ou um robô) pode ver para decidir.
 *
 * Contém os dados completos da própria empresa e só a informação pública do mercado: preço, qualidade,
 * marca, nota e participação dos concorrentes (seção 8) e as condições do fornecedor externo. **Não**
 * contém o preço de referência interno (P_ref, seção 6.4), a elasticidade, nem caixa, estoque, custos
 * ou verbas dos concorrentes. Os robôs recebem só esta visão, com a mesma informação das equipes.
 */
import { capacidadeDeProducao } from "./fabricacao";
import { marca as calcularMarca } from "./formulas/marca";
import { tetoDePreco } from "./formulas/nota";
import { criarContexto } from "./contexto";
import type { Centavos } from "./dinheiro";
import type { DecisaoProdutoVigente, EstadoPartida, FechamentoMensal } from "./tipos";
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
}

export interface OfertaConcorrente {
  produto: string;
  preco: Centavos | null;
  qualidade: number;
  marca: number;
  notaAnterior: number;
  participacaoAnterior: number;
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
    ultimoFechamento: FechamentoMensal | null;
    ofertas: OfertaPropria[];
  };
  concorrentes: { id: string; nome: string; ofertas: OfertaConcorrente[] }[];
  custos: {
    pontoDeVenda: { custoAbertura: Centavos; prazoAberturaDias: number; custoFixoMensal: Centavos; capacidadePorDia: number };
    aliquotaIR: number;
    jurosEmergencialMensal: number;
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
      ultimoFechamento: empresa.contabil.ultimoFechamento ? JSON.parse(JSON.stringify(empresa.contabil.ultimoFechamento)) : null,
      ofertas: empresa.ofertas.map((o) => {
        const produto = ctx.produtos.get(o.produto)!;
        const operando = empresa.fabricas.filter((f) => f.produto === o.produto && f.operaDesdeTick <= estado.tick).length;
        return {
          produto: o.produto,
          decisao: { ...o.decisao },
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
    },
  };
}
