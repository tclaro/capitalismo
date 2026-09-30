/**
 * Preset `teste/congelado`: usado só pelos testes (golden, propriedades, desempenho).
 *
 * Números fixos (sem variação) e independentes da calibração do `introdutorio`, para que ajustes de
 * balanceamento não mudem os resultados esperados dos testes. Não alterar sem atualizar os goldens.
 */
import type { Preset } from "@simulador/motor";
import { fabricacaoDoManual, reais } from "./comum";

export const PRESET_TESTE: Preset = {
  id: "teste/congelado",
  nome: "Teste — congelado",
  versao: "1.0.0",
  moeda: "BRL",
  ticksPorMes: 30,
  mercado: { populacao: 50_000, fatorCiclo: 1 },
  produtos: [
    {
      id: "leite_engarrafado",
      nome: "Leite engarrafado",
      unidade: "garrafa",
      nivel: "final",
      custoArmazenagemMensal: 5,
      varejo: {
        precoReferencia: reais(6),
        consumoMensalPorHabitante: 3,
        elasticidade: 0.3,
        pesos: { qualidade: 30, marca: 10, preco: 60 },
        fatorCapacidade: 1,
      },
      fornecedor: { preco: reais(4.5), qualidade: 50, ofertaMaxMensal: null },
      fabricacao: fabricacaoDoManual("leite_engarrafado", {
        custoMaoDeObraPorUnidade: reais(1.4),
        capex: reais(300_000),
        prazoConstrucaoDias: 30,
        custoFixoMensal: reais(10_000),
        capacidadeUnidadesPorDia: 1500,
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
        precoReferencia: reais(80),
        consumoMensalPorHabitante: 0.02,
        elasticidade: 1.2,
        pesos: { qualidade: 35, marca: 40, preco: 25 },
        fatorCapacidade: 2,
      },
      fornecedor: { preco: reais(55), qualidade: 50, ofertaMaxMensal: 5_000 },
      fabricacao: fabricacaoDoManual("carteira", {
        custoMaoDeObraPorUnidade: reais(15),
        capex: reais(60_000),
        prazoConstrucaoDias: 30,
        custoFixoMensal: reais(2_000),
        capacidadeUnidadesPorDia: 20,
        vidaUtilMeses: 60,
      }),
    },
    {
      id: "leite",
      nome: "Leite",
      unidade: "litro",
      nivel: "materia_prima",
      custoArmazenagemMensal: 0,
      fornecedor: { preco: reais(2.4), qualidade: 50, ofertaMaxMensal: null },
    },
    {
      id: "vidro",
      nome: "Vidro",
      unidade: "kg",
      nivel: "semiacabado",
      custoArmazenagemMensal: 0,
      fornecedor: { preco: reais(4), qualidade: 60, ofertaMaxMensal: null },
    },
    {
      id: "couro",
      nome: "Couro",
      unidade: "kg",
      nivel: "materia_prima",
      custoArmazenagemMensal: 0,
      fornecedor: { preco: reais(60), qualidade: 40, ofertaMaxMensal: null },
    },
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
  tecnologia: { tecnologiaInicial: 10, tecnologiaBase: 20, taxaTecnologiaMensal: 5, verbaReferenciaMensal: reais(20_000) },
  vendas: { sensibilidadeNota: 0.1, perdaSubstituicao: 0.5, multiploTetoPreco: 2 },
  pontoDeVenda: {
    custoAbertura: reais(80_000),
    prazoAberturaDias: 15,
    custoFixoMensal: reais(12_000),
    capacidadePorDia: 800,
    vidaUtilMeses: 60,
    iniciais: 1,
  },
  financeiro: {
    caixaInicial: reais(500_000),
    aliquotaIR: 0.34,
    travaCompensacaoPrejuizo: 0.3,
    jurosEmergencialMensal: 0.08,
    penalidadeFalenciaMensal: 0,
  },
};
