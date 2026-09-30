/**
 * Estratégias dos robôs (seção 10, item 2), camada 1.
 *
 * Cada estratégia declara as faixas da sua **intensidade** (sorteada por semente ao criar a partida,
 * para que as simulações de balanceamento não repitam sempre a mesma partida) e uma função que decide
 * a partir da visão da empresa. Decisões são reavaliadas no fim de cada semana (ver `index.ts`).
 *
 * O preço de cada estratégia é uma função do **custo unitário completo** (custo variável ponderado
 * entre produção própria e compra pronta, mais o rateio dos custos fixos), calculado pelo plano de
 * abastecimento em `decisoesDoPlano`.
 */
import { type Gerador, aleatorio, uniforme } from "../aleatorio";
import { DIAS_POR_MES, type Decisao } from "../tipos";
import type { ProdutoVisivel, VisaoEmpresa } from "../visao";
import {
  abastecimentoMensal,
  custoPronto,
  decisoesDoPlano,
  demandaEsperadaMensal,
  type PlanoProduto,
  precoDeReferencia,
  precoValido,
} from "./comum";

export type Intensidade = Record<string, number>;

export interface Estrategia {
  id: string;
  nome: string;
  descricao: string;
  /** Faixa [mínimo, máximo] de cada parâmetro de intensidade. */
  faixas: Record<string, readonly [number, number]>;
  decidir: (visao: VisaoEmpresa, intensidade: Intensidade, gerador: Gerador) => Decisao[];
}

type Plano = Omit<PlanoProduto, "produto" | "demandaMensal">;

const planosPara = (visao: VisaoEmpresa, f: (p: ProdutoVisivel, referencia: number) => Plano): PlanoProduto[] =>
  visao.produtos.map((p) => ({ produto: p.id, demandaMensal: demandaEsperadaMensal(visao, p), ...f(p, precoDeReferencia(visao, p)) }));

export const PRECO_BAIXO: Estrategia = {
  id: "preco_baixo",
  nome: "Preço baixo",
  descricao: "Margem mínima sobre o custo completo e volume alto; fabrica quando a fábrica se paga rápido.",
  faixas: { margem: [0.04, 0.12], paybackMaximo: [8, 14], publicidade: [0, 0.02] },
  decidir: (v, i) =>
    decisoesDoPlano(
      v,
      planosPara(v, () => ({ preco: (c) => c * (1 + i.margem!), fabricar: true, publicidadeFracao: i.publicidade!, pdFracao: 0, folga: 0.15 })),
      { politicaFabrica: { paybackMaximo: i.paybackMaximo!, folgaDeCaixa: 0.2 }, gerirPontosDeVenda: true },
    ),
};

export const PREMIUM: Estrategia = {
  id: "premium",
  nome: "Premium",
  descricao: "Fabrica tudo, investe pesado em P&D e cobra acima do mercado.",
  faixas: { premio: [0.15, 0.35], pd: [0.08, 0.15], publicidade: [0.02, 0.06] },
  decidir: (v, i) =>
    decisoesDoPlano(
      v,
      planosPara(v, (_p, ref) => ({
        preco: (c) => Math.max(c * 1.25, ref) * (1 + i.premio!),
        fabricar: true,
        publicidadeFracao: i.publicidade!,
        pdFracao: i.pd!,
        folga: 0.1,
      })),
      { politicaFabrica: { paybackMaximo: 36, folgaDeCaixa: 0.1 }, gerirPontosDeVenda: true },
    ),
};

export const MARCA: Estrategia = {
  id: "marca",
  nome: "Marca",
  descricao: "Publicidade intensa e preço um pouco acima do mercado.",
  faixas: { publicidade: [0.12, 0.22], premio: [0.03, 0.12], paybackMaximo: [8, 12] },
  decidir: (v, i) =>
    decisoesDoPlano(
      v,
      planosPara(v, (_p, ref) => ({ preco: (c) => Math.max(c * 1.05, ref * (1 + i.premio!)), fabricar: true, publicidadeFracao: i.publicidade!, pdFracao: 0.01, folga: 0.15 })),
      { politicaFabrica: { paybackMaximo: i.paybackMaximo!, folgaDeCaixa: 0.3 }, gerirPontosDeVenda: true },
    ),
};

export const EQUILIBRADA: Estrategia = {
  id: "equilibrada",
  nome: "Equilibrada",
  descricao: "Acompanha o preço dos concorrentes, com verbas moderadas de publicidade e P&D.",
  faixas: { ajuste: [-0.03, 0.05], publicidade: [0.03, 0.07], pd: [0.02, 0.05], paybackMaximo: [10, 14] },
  decidir: (v, i) =>
    decisoesDoPlano(
      v,
      planosPara(v, (_p, ref) => ({
        preco: (c) => Math.max(c * 1.1, ref * (1 + i.ajuste!)),
        fabricar: true,
        publicidadeFracao: i.publicidade!,
        pdFracao: i.pd!,
        folga: 0.15,
      })),
      { politicaFabrica: { paybackMaximo: i.paybackMaximo!, folgaDeCaixa: 0.3 }, gerirPontosDeVenda: true },
    ),
};

export const REVENDA: Estrategia = {
  id: "revenda",
  nome: "Revenda",
  descricao: "Só compra pronto, nunca fabrica; preço próximo ao do mercado.",
  faixas: { ajuste: [-0.05, 0.05], publicidade: [0.02, 0.05] },
  decidir: (v, i) =>
    decisoesDoPlano(
      v,
      planosPara(v, (_p, ref) => ({ preco: (c) => Math.max(c * 1.08, ref * (1 + i.ajuste!)), fabricar: false, publicidadeFracao: i.publicidade!, pdFracao: 0, folga: 0.15 })),
      { politicaFabrica: null, gerirPontosDeVenda: true },
    ),
};

export const PASSIVA: Estrategia = {
  id: "passiva",
  nome: "Passiva",
  descricao: "Linha de base: define preço e compra uma vez, dentro da capacidade de venda, e nunca mais decide.",
  faixas: { markup: [1.25, 1.4] },
  decidir: (v, i) => {
    // Só decide enquanto nenhum produto tem preço definido (primeira decisão da partida).
    if (v.empresa.ofertas.some((o) => o.decisao.preco !== null)) return [];
    const produtos = v.produtos.filter((p) => p.fornecedor);
    const estimativas = produtos.map((p) => demandaEsperadaMensal(v, p));
    let uso = 0;
    produtos.forEach((p, k) => (uso += estimativas[k]! * p.fatorCapacidade));
    const capacidade = v.empresa.pontosDeVendaOperando * v.custos.pontoDeVenda.capacidadePorDia * DIAS_POR_MES * 0.9;
    const escala = uso > capacidade ? capacidade / uso : 1;
    return produtos.map((p, k) => ({
      tipo: "produto" as const,
      empresa: v.empresa.id,
      produto: p.id,
      preco: precoValido(p, custoPronto(p) * i.markup!),
      compraMensal: Math.round(estimativas[k]! * escala),
    }));
  },
};

export const ALEATORIA: Estrategia = {
  id: "aleatoria",
  nome: "Aleatória",
  descricao: "Decisões ao acaso, dentro de limites razoáveis.",
  faixas: { probabilidadeInvestir: [0.02, 0.08] },
  decidir: (v, i, g) => {
    const decisoes: Decisao[] = [];
    for (const p of v.produtos) {
      if (!p.fornecedor) continue;
      const demanda = demandaEsperadaMensal(v, p) * uniforme(g, 0.3, 2);
      const preco = precoValido(p, uniforme(g, custoPronto(p) * 0.95, p.precoMaximo));
      const receita = demanda * preco;
      decisoes.push({
        tipo: "produto",
        empresa: v.empresa.id,
        produto: p.id,
        preco,
        compraMensal: abastecimentoMensal(v, p, demanda, 0),
        publicidadeMensal: Math.round(uniforme(g, 0, 0.2) * receita),
      });
      if (p.fabricacao && aleatorio(g) < i.probabilidadeInvestir! && v.empresa.caixa > p.fabricacao.capex * 1.5) {
        decisoes.push({ tipo: "construirFabrica", empresa: v.empresa.id, produto: p.id });
      }
    }
    if (aleatorio(g) < i.probabilidadeInvestir! && v.empresa.caixa > v.custos.pontoDeVenda.custoAbertura * 3) {
      decisoes.push({ tipo: "abrirPontoDeVenda", empresa: v.empresa.id, quantidade: 1 });
    }
    // Produção nas fábricas que por acaso tenha construído.
    for (const o of v.empresa.ofertas) {
      if (o.fabricasOperando > 0) {
        decisoes.push({ tipo: "produto", empresa: v.empresa.id, produto: o.produto, producaoMensal: Math.round(o.capacidadeProducaoPorTick * v.ticksPorMes * uniforme(g, 0.2, 1)) });
      }
    }
    return decisoes;
  },
};

/** Registro das estratégias, por id. */
export const ESTRATEGIAS: Readonly<Record<string, Estrategia>> = Object.fromEntries(
  [PRECO_BAIXO, PREMIUM, MARCA, EQUILIBRADA, REVENDA, PASSIVA, ALEATORIA].map((e) => [e.id, e]),
);

/** Estratégias "razoáveis" (seção 10.4): todas menos a passiva e a aleatória. */
export const ESTRATEGIAS_RAZOAVEIS: readonly string[] = ["preco_baixo", "premium", "marca", "equilibrada", "revenda"];
