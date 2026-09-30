/**
 * Preset `introdutorio/padrao` (camada 1): laticínios e couro (anexo, seção 5; decisão 3).
 *
 * Receitas: Apêndice B do manual. Demais números: hipóteses iniciais, a calibrar na etapa de
 * balanceamento. A origem e o raciocínio de cada valor estão em `docs/calibracao-introdutorio.md`.
 */
import type { ProdutoDoPreset, Preset } from "@simulador/motor";
import { produtoDaArvore } from "../arvore";
import { fabricacaoDoManual, faixa, reais } from "./comum";

const VARIACAO_PRECO = 0.1;
const VARIACAO_PESOS = 0.15;
const VARIACAO_QUALIDADE_FORNECEDOR = 0.1;

/** Insumo comprado do fornecedor externo no momento da produção (não fica em estoque). */
const insumo = (id: string, unidade: string, precoReais: number): ProdutoDoPreset => ({
  id,
  nome: produtoDaArvore(id).nome,
  unidade,
  nivel: produtoDaArvore(id).nivel,
  custoArmazenagemMensal: 0,
  fornecedor: {
    preco: faixa(reais(precoReais), VARIACAO_PRECO),
    qualidade: faixa(50, VARIACAO_QUALIDADE_FORNECEDOR),
    ofertaMaxMensal: null,
  },
});

export const PRESET_INTRODUTORIO: Preset = {
  id: "introdutorio/padrao",
  nome: "Introdutório — laticínios e couro",
  versao: "0.1.0",
  moeda: "BRL",
  ticksPorMes: 30,
  mercado: { populacao: faixa(100_000, 0.15), fatorCiclo: 1 },
  produtos: [
    {
      id: "leite_engarrafado",
      nome: "Leite engarrafado",
      unidade: "garrafa",
      nivel: "final",
      custoArmazenagemMensal: 5,
      varejo: {
        precoReferencia: faixa(reais(6), VARIACAO_PRECO),
        consumoMensalPorHabitante: faixa(3, 0.1),
        elasticidade: faixa(0.3, 0.1),
        pesos: { qualidade: faixa(30, VARIACAO_PESOS), marca: faixa(10, VARIACAO_PESOS), preco: faixa(60, VARIACAO_PESOS) },
        fatorCapacidade: 1,
      },
      fornecedor: { preco: faixa(reais(4.5), VARIACAO_PRECO), qualidade: faixa(50, VARIACAO_QUALIDADE_FORNECEDOR), ofertaMaxMensal: null },
      fabricacao: fabricacaoDoManual("leite_engarrafado", {
        custoMaoDeObraPorUnidade: faixa(reais(1.4), 0.1),
        capex: reais(650_000),
        prazoConstrucaoDias: 45,
        custoFixoMensal: reais(25_000),
        capacidadeUnidadesPorDia: 2000,
        vidaUtilMeses: 60,
      }),
    },
    {
      id: "iogurte",
      nome: "Iogurte",
      unidade: "pote",
      nivel: "final",
      custoArmazenagemMensal: 8,
      varejo: {
        precoReferencia: faixa(reais(9), VARIACAO_PRECO),
        consumoMensalPorHabitante: faixa(1, 0.1),
        elasticidade: faixa(0.9, 0.1),
        pesos: { qualidade: faixa(35, VARIACAO_PESOS), marca: faixa(40, VARIACAO_PESOS), preco: faixa(25, VARIACAO_PESOS) },
        fatorCapacidade: 1,
      },
      fornecedor: { preco: faixa(reais(6.5), VARIACAO_PRECO), qualidade: faixa(50, VARIACAO_QUALIDADE_FORNECEDOR), ofertaMaxMensal: null },
      fabricacao: fabricacaoDoManual("iogurte", {
        custoMaoDeObraPorUnidade: faixa(reais(2), 0.1),
        capex: reais(230_000),
        prazoConstrucaoDias: 45,
        custoFixoMensal: reais(8_000),
        capacidadeUnidadesPorDia: 800,
        vidaUtilMeses: 60,
      }),
    },
    {
      id: "sorvete",
      nome: "Sorvete",
      unidade: "pote",
      nivel: "final",
      custoArmazenagemMensal: 20,
      varejo: {
        precoReferencia: faixa(reais(18), VARIACAO_PRECO),
        consumoMensalPorHabitante: faixa(0.4, 0.1),
        elasticidade: faixa(1.4, 0.1),
        pesos: { qualidade: faixa(30, VARIACAO_PESOS), marca: faixa(45, VARIACAO_PESOS), preco: faixa(25, VARIACAO_PESOS) },
        fatorCapacidade: 1,
      },
      fornecedor: { preco: faixa(reais(13), VARIACAO_PRECO), qualidade: faixa(50, VARIACAO_QUALIDADE_FORNECEDOR), ofertaMaxMensal: null },
      fabricacao: fabricacaoDoManual("sorvete", {
        custoMaoDeObraPorUnidade: faixa(reais(6), 0.1),
        capex: reais(230_000),
        prazoConstrucaoDias: 45,
        custoFixoMensal: reais(8_000),
        capacidadeUnidadesPorDia: 350,
        vidaUtilMeses: 60,
      }),
    },
    {
      id: "sapato",
      nome: "Sapato",
      unidade: "par",
      nivel: "final",
      custoArmazenagemMensal: 100,
      varejo: {
        precoReferencia: faixa(reais(180), VARIACAO_PRECO),
        consumoMensalPorHabitante: faixa(0.04, 0.1),
        elasticidade: faixa(1, 0.1),
        pesos: { qualidade: faixa(50, VARIACAO_PESOS), marca: faixa(25, VARIACAO_PESOS), preco: faixa(25, VARIACAO_PESOS) },
        fatorCapacidade: 5,
      },
      fornecedor: { preco: faixa(reais(130), VARIACAO_PRECO), qualidade: faixa(50, VARIACAO_QUALIDADE_FORNECEDOR), ofertaMaxMensal: null },
      fabricacao: fabricacaoDoManual("sapato", {
        custoMaoDeObraPorUnidade: faixa(reais(40), 0.1),
        capex: reais(210_000),
        prazoConstrucaoDias: 45,
        custoFixoMensal: reais(7_000),
        capacidadeUnidadesPorDia: 40,
        vidaUtilMeses: 60,
      }),
    },
    {
      id: "carteira",
      nome: "Carteira",
      unidade: "unidade",
      nivel: "final",
      custoArmazenagemMensal: 30,
      varejo: {
        precoReferencia: faixa(reais(80), VARIACAO_PRECO),
        consumoMensalPorHabitante: faixa(0.02, 0.1),
        elasticidade: faixa(1.2, 0.1),
        pesos: { qualidade: faixa(35, VARIACAO_PESOS), marca: faixa(40, VARIACAO_PESOS), preco: faixa(25, VARIACAO_PESOS) },
        fatorCapacidade: 2,
      },
      fornecedor: { preco: faixa(reais(55), VARIACAO_PRECO), qualidade: faixa(50, VARIACAO_QUALIDADE_FORNECEDOR), ofertaMaxMensal: null },
      fabricacao: fabricacaoDoManual("carteira", {
        custoMaoDeObraPorUnidade: faixa(reais(15), 0.1),
        capex: reais(60_000),
        prazoConstrucaoDias: 30,
        custoFixoMensal: reais(2_000),
        capacidadeUnidadesPorDia: 20,
        vidaUtilMeses: 60,
      }),
    },
    insumo("leite", "litro", 2.4),
    insumo("vidro", "kg", 4),
    insumo("morango", "kg", 15),
    insumo("acido_citrico", "kg", 12),
    insumo("acucar", "kg", 4.5),
    insumo("couro", "kg", 60),
    insumo("tecido", "kg", 25),
  ],
  marca: {
    reconhecimentoInicial: 10,
    decaimentoReconhecimentoMensal: 0.08,
    taxaReconhecimentoMensal: 0.25,
    verbaReferenciaPorHabitanteMensal: 30,
    fidelidadeInicial: 0,
    fidelidadeMinima: -50,
    decaimentoFidelidadeMensal: 0.05,
    taxaFidelidadeMensal: 20,
    penalidadeRupturaMensal: 10,
    pesoReconhecimento: 0.5,
    pesoFidelidade: 0.5,
  },
  tecnologia: {
    tecnologiaInicial: 10,
    tecnologiaBase: 20,
    taxaTecnologiaMensal: 5,
    verbaReferenciaMensal: reais(20_000),
  },
  vendas: { sensibilidadeNota: 0.1, perdaSubstituicao: 0.5, multiploTetoPreco: 2 },
  pontoDeVenda: {
    custoAbertura: reais(80_000),
    prazoAberturaDias: 15,
    custoFixoMensal: reais(12_000),
    capacidadePorDia: 800,
    vidaUtilMeses: 60,
    iniciais: 2,
  },
  financeiro: {
    caixaInicial: reais(1_200_000),
    aliquotaIR: 0.34,
    travaCompensacaoPrejuizo: 0.3,
    jurosEmergencialMensal: 0.08,
    penalidadeFalenciaMensal: 0,
  },
};
