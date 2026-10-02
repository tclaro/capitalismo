/**
 * Preset `cadeia/minima` (camada 3 reduzida): fazendas, fábricas de um nível e lojas (seção 6.16 do
 * documento de design; decisão 28).
 *
 * Parte do `introdutorio/padrao` (mesmos cinco produtos, mesmas receitas e insumos do fornecedor externo)
 * e acrescenta a jaqueta de couro, a carne bovina e o frango congelados, e o bloco `cadeia` com as
 * atividades das fazendas.
 *
 * **Valores provisórios.** Os números novos (fazendas, jaqueta, carne, frango, caixa inicial) são
 * hipóteses de ordem de grandeza, sem calibração: a calibração e o balanceamento deste preset vêm depois
 * (plano da fase 1b, entrega 9). As exceções são a proporção da receita da jaqueta e os pesos do índice
 * de sucesso dela (35% qualidade, 35% marca, 30% preço), informados pelo autor a partir do manual.
 */
import type { Preset, ProdutoDoPreset } from "@simulador/motor";
import { PRESET_INTRODUTORIO } from "./introdutorio";
import { fabricacaoDoManual, faixa, reais } from "./comum";

const VARIACAO_PRECO_REFERENCIA = 0.1;
const VARIACAO_CUSTOS = 0.2;
const VARIACAO_PESOS = 0.15;
const VARIACAO_QUALIDADE_FORNECEDOR = 0.1;

/** Produto pronto do fornecedor externo, qualidade 50 (também é o teto de preço da matéria-prima no atacado). */
const pronto = (precoReais: number) => ({
  preco: faixa(reais(precoReais), VARIACAO_CUSTOS),
  qualidade: faixa(50, VARIACAO_QUALIDADE_FORNECEDOR),
  ofertaMaxMensal: null,
});

/** Matéria-prima vendida direto da fazenda para a loja (carnes congeladas, seção 6.7). */
const carneParaVarejo = (
  id: string,
  nome: string,
  precoReferenciaReais: number,
  consumo: number,
  elasticidade: number,
  fornecedorReais: number,
): ProdutoDoPreset => ({
  id,
  nome,
  unidade: "kg",
  nivel: "materia_prima",
  custoArmazenagemMensal: 40,
  varejo: {
    precoReferencia: faixa(reais(precoReferenciaReais), VARIACAO_PRECO_REFERENCIA),
    consumoMensalPorHabitante: faixa(consumo, 0.1),
    elasticidade: faixa(elasticidade, 0.1),
    pesos: { qualidade: faixa(40, VARIACAO_PESOS), marca: faixa(20, VARIACAO_PESOS), preco: faixa(40, VARIACAO_PESOS) },
    fatorCapacidade: 1,
  },
  fornecedor: pronto(fornecedorReais),
});

const jaqueta: ProdutoDoPreset = {
  id: "jaqueta_de_couro",
  nome: "Jaqueta de couro",
  unidade: "unidade",
  nivel: "final",
  custoArmazenagemMensal: 80,
  varejo: {
    precoReferencia: faixa(reais(450), VARIACAO_PRECO_REFERENCIA),
    consumoMensalPorHabitante: faixa(0.01, 0.1),
    elasticidade: faixa(1.1, 0.1),
    // Índice de sucesso do manual: qualidade 35%, marca 35%, preço 30%.
    pesos: { qualidade: faixa(35, VARIACAO_PESOS), marca: faixa(35, VARIACAO_PESOS), preco: faixa(30, VARIACAO_PESOS) },
    fatorCapacidade: 5,
  },
  fornecedor: pronto(315),
  fabricacao: fabricacaoDoManual("jaqueta_de_couro", {
    custoMaoDeObraPorUnidade: faixa(reais(90), VARIACAO_CUSTOS),
    capex: reais(120_000),
    prazoConstrucaoDias: 40,
    custoFixoMensal: reais(5_000),
    capacidadeUnidadesPorDia: 30,
    vidaUtilMeses: 60,
  }),
};

export const PRESET_CADEIA_MINIMA: Preset = {
  ...PRESET_INTRODUTORIO,
  id: "cadeia/minima",
  nome: "Cadeia mínima — fazendas, fábricas e lojas",
  versao: "0.1.0",
  produtos: [
    ...PRESET_INTRODUTORIO.produtos,
    jaqueta,
    carneParaVarejo("carne_bovina_congelada", "Carne bovina congelada", 28, 1, 0.5, 20),
    carneParaVarejo("frango_congelado", "Frango congelado", 14, 1.2, 0.6, 9),
  ],
  // Caixa maior que o do introdutório, para comportar fazendas além de fábricas e lojas.
  financeiro: { ...PRESET_INTRODUTORIO.financeiro, caixaInicial: reais(3_000_000) },
  cadeia: {
    atividades: [
      {
        id: "gado_de_corte",
        nome: "Gado de corte",
        tipo: "pecuaria",
        // Carne e couro saem juntos: 1 kg de carne para 0,5 kg de couro.
        produz: [
          { produto: "carne_bovina_congelada", proporcao: 1 },
          { produto: "couro", proporcao: 0.5 },
        ],
        custoVariavelPorUnidade: faixa(reais(4), VARIACAO_CUSTOS),
        qualidadeBase: faixa(50, 0.1),
        capex: reais(350_000),
        prazoConstrucaoDias: 30,
        custoFixoMensal: reais(9_000),
        capacidadeUnidadesPorDia: 150,
        diasDeArmazenagem: 10,
        vidaUtilMeses: 120,
      },
      {
        id: "gado_leiteiro",
        nome: "Gado leiteiro",
        tipo: "pecuaria",
        produz: [{ produto: "leite", proporcao: 1 }],
        custoVariavelPorUnidade: faixa(reais(1.1), VARIACAO_CUSTOS),
        qualidadeBase: faixa(50, 0.1),
        capex: reais(300_000),
        prazoConstrucaoDias: 30,
        custoFixoMensal: reais(8_000),
        capacidadeUnidadesPorDia: 400,
        diasDeArmazenagem: 10,
        vidaUtilMeses: 120,
      },
      {
        id: "frango",
        nome: "Frango",
        tipo: "pecuaria",
        produz: [{ produto: "frango_congelado", proporcao: 1 }],
        custoVariavelPorUnidade: faixa(reais(3.5), VARIACAO_CUSTOS),
        qualidadeBase: faixa(50, 0.1),
        capex: reais(250_000),
        prazoConstrucaoDias: 25,
        custoFixoMensal: reais(7_000),
        capacidadeUnidadesPorDia: 300,
        diasDeArmazenagem: 10,
        vidaUtilMeses: 120,
      },
      {
        id: "morango",
        nome: "Morango",
        tipo: "lavoura",
        produz: [{ produto: "morango", proporcao: 1 }],
        custoVariavelPorUnidade: faixa(reais(6), VARIACAO_CUSTOS),
        qualidadeBase: faixa(50, 0.1),
        capex: reais(200_000),
        prazoConstrucaoDias: 20,
        custoFixoMensal: reais(6_000),
        capacidadeUnidadesPorDia: 120,
        diasDeArmazenagem: 10,
        vidaUtilMeses: 120,
      },
      {
        id: "cana_de_acucar",
        nome: "Cana-de-açúcar",
        tipo: "lavoura",
        produz: [{ produto: "acucar", proporcao: 1 }],
        custoVariavelPorUnidade: faixa(reais(1.6), VARIACAO_CUSTOS),
        qualidadeBase: faixa(50, 0.1),
        capex: reais(180_000),
        prazoConstrucaoDias: 20,
        custoFixoMensal: reais(5_000),
        capacidadeUnidadesPorDia: 400,
        diasDeArmazenagem: 10,
        vidaUtilMeses: 120,
      },
    ],
    experiencia: { ganhoQualidadePorMes: 1.5, qualidadeMaxima: 90 },
    // Mesma conversão para qualquer troca de atividade (decisão do autor, 02/10/2026).
    conversao: { custo: reais(40_000), prazoDias: 10 },
    cooperativa: { fatorPiso: 0.6 },
    descarte: { custoPorUnidade: reais(0.5) },
    // Origem própria que não basta é completada com o fornecedor externo (pode ser desligado no preset).
    completaComFornecedor: true,
  },
};
