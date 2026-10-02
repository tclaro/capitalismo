/**
 * Resolução do preset: sorteia cada `ValorVariavel` dentro da faixa (seção 10.3) e devolve
 * parâmetros com números fixos, que ficam no estado da partida.
 *
 * Cada produto usa um fluxo aleatório próprio (`cenario:produto:<id>`), e o mercado usa
 * `cenario:mercado`: acrescentar um produto ao preset não muda os sorteios dos demais.
 */
import { type Gerador, criarGerador, uniforme } from "./aleatorio";
import { arredondarCentavos } from "./dinheiro";
import { type ParametrosCadeia, type Preset, type ProdutoDoPreset, type ValorVariavel, validarPreset } from "./preset";
import type { CadeiaResolvida, ParametrosResolvidos, ProdutoResolvido } from "./tipos";

export class PresetInvalido extends Error {
  constructor(readonly erros: readonly string[]) {
    super(`preset inválido:\n- ${erros.join("\n- ")}`);
    this.name = "PresetInvalido";
  }
}

/** Sorteia um valor em `valor × [1 − variacao, 1 + variacao)`; número fixo volta igual. */
export function sortearValor(v: ValorVariavel, g: Gerador): number {
  if (typeof v === "number") return v;
  if (v.variacao === 0) return v.valor;
  return v.valor * uniforme(g, 1 - v.variacao, 1 + v.variacao);
}

function sortearCentavos(v: ValorVariavel, g: Gerador): number {
  return Math.max(1, arredondarCentavos(sortearValor(v, g)));
}

function resolverProduto(p: ProdutoDoPreset, semente: string): ProdutoResolvido {
  const g = criarGerador(semente, `cenario:produto:${p.id}`);
  // A ordem dos sorteios abaixo é parte do contrato de determinismo: não reordenar sem mudar a versão do motor.
  let varejo: ProdutoResolvido["varejo"] = null;
  if (p.varejo) {
    const precoReferencia = sortearCentavos(p.varejo.precoReferencia, g);
    const consumoMensalPorHabitante = sortearValor(p.varejo.consumoMensalPorHabitante, g);
    const elasticidade = sortearValor(p.varejo.elasticidade, g);
    const q = sortearValor(p.varejo.pesos.qualidade, g);
    const m = sortearValor(p.varejo.pesos.marca, g);
    const pp = sortearValor(p.varejo.pesos.preco, g);
    const soma = q + m + pp;
    varejo = {
      precoReferencia,
      consumoMensalPorHabitante,
      elasticidade,
      pesos: { qualidade: (100 * q) / soma, marca: (100 * m) / soma, preco: (100 * pp) / soma },
      fatorCapacidade: p.varejo.fatorCapacidade,
    };
  }
  const fornecedor: ProdutoResolvido["fornecedor"] = p.fornecedor
    ? {
        preco: sortearCentavos(p.fornecedor.preco, g),
        qualidade: Math.min(100, Math.max(0, sortearValor(p.fornecedor.qualidade, g))),
        ofertaMaxMensal: p.fornecedor.ofertaMaxMensal,
      }
    : null;
  const fabricacao: ProdutoResolvido["fabricacao"] = p.fabricacao
    ? {
        unidadesPorLote: p.fabricacao.unidadesPorLote,
        receita: p.fabricacao.receita.map((i) => ({ produto: i.produto, quantidadePorLote: i.quantidadePorLote, pesoQualidade: i.pesoQualidade })),
        pesoTecnologia: p.fabricacao.pesoTecnologia,
        custoMaoDeObraPorUnidade: Math.max(0, sortearValor(p.fabricacao.custoMaoDeObraPorUnidade, g)),
        capex: p.fabricacao.capex,
        prazoConstrucaoDias: p.fabricacao.prazoConstrucaoDias,
        custoFixoMensal: p.fabricacao.custoFixoMensal,
        capacidadeUnidadesPorDia: p.fabricacao.capacidadeUnidadesPorDia,
        vidaUtilMeses: p.fabricacao.vidaUtilMeses,
      }
    : null;
  return {
    id: p.id,
    nome: p.nome,
    unidade: p.unidade,
    nivel: p.nivel,
    custoArmazenagemMensal: p.custoArmazenagemMensal,
    varejo,
    fornecedor,
    fabricacao,
  };
}

/**
 * Cada atividade usa um fluxo próprio (`cenario:atividade:<id>`): acrescentar uma atividade não muda os
 * sorteios das demais, nem os dos produtos. A ordem dos sorteios abaixo é contrato de determinismo.
 */
function resolverCadeia(cadeia: ParametrosCadeia, semente: string): CadeiaResolvida {
  return {
    atividades: cadeia.atividades.map((a) => {
      const g = criarGerador(semente, `cenario:atividade:${a.id}`);
      const custoVariavelPorUnidade = Math.max(0, arredondarCentavos(sortearValor(a.custoVariavelPorUnidade, g)));
      const qualidadeBase = Math.min(100, Math.max(0, sortearValor(a.qualidadeBase, g)));
      return {
        id: a.id,
        nome: a.nome,
        tipo: a.tipo,
        produz: a.produz.map((p) => ({ produto: p.produto, proporcao: p.proporcao })),
        custoVariavelPorUnidade,
        qualidadeBase,
        capex: a.capex,
        prazoConstrucaoDias: a.prazoConstrucaoDias,
        custoFixoMensal: a.custoFixoMensal,
        capacidadeUnidadesPorDia: a.capacidadeUnidadesPorDia,
        diasDeArmazenagem: a.diasDeArmazenagem,
        vidaUtilMeses: a.vidaUtilMeses,
      };
    }),
    experiencia: { ...cadeia.experiencia },
    conversao: { ...cadeia.conversao },
    cooperativa: { ...cadeia.cooperativa },
    descarte: { ...cadeia.descarte },
    completaComFornecedor: cadeia.completaComFornecedor,
  };
}

/** Valida o preset e sorteia os valores variáveis. Lança `PresetInvalido` se houver erros. */
export function resolverPreset(preset: Preset, semente: string): ParametrosResolvidos {
  const erros = validarPreset(preset);
  if (erros.length > 0) throw new PresetInvalido(erros);

  const gMercado = criarGerador(semente, "cenario:mercado");
  const populacao = sortearValor(preset.mercado.populacao, gMercado);

  return {
    presetId: preset.id,
    presetVersao: preset.versao,
    ticksPorMes: preset.ticksPorMes,
    populacao,
    fatorCicloInicial: preset.mercado.fatorCiclo,
    produtos: preset.produtos.map((p) => resolverProduto(p, semente)),
    marca: { ...preset.marca },
    tecnologia: { ...preset.tecnologia },
    aprendizado: {
      limitesMeses: [...preset.aprendizado.limitesMeses],
      capacidade: [...preset.aprendizado.capacidade],
      maoDeObra: [...preset.aprendizado.maoDeObra],
    },
    vendas: { ...preset.vendas },
    pontoDeVenda: { ...preset.pontoDeVenda },
    financeiro: { ...preset.financeiro },
    cadeia: preset.cadeia ? resolverCadeia(preset.cadeia, semente) : null,
  };
}
