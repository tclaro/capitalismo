/**
 * Indicadores e critérios dos caminhos da cadeia (fase 1b, entrega 9).
 *
 * Na camada 1 o premium domina o confronto (limitação registrada em 30/09/2026, fronteira tecnológica
 * pendente), então os critérios da cadeia são **relativos**: cada caminho é comparado com a estratégia
 * equivalente **sem** fazendas, que joga no mesmo mercado com as mesmas sementes.
 *
 *   - integrada vs. equilibrada (a mesma estratégia, com fazendas que abastecem as fábricas);
 *   - só fazenda vs. revenda (a mesma estratégia, que produz a carne e o frango que vende);
 *   - fazenda para a cooperativa vs. equilibrada (a saída que não pode ser a melhor).
 */
import type { Preset, ValorVariavel } from "@simulador/motor";
import { type Criterio, type Metricas, porcentagem } from "./metricas";

/** Limites dos critérios da cadeia (definidos em 02/10/2026, entrega 9; ver docs/balanceamento/cadeia-minima). */
export const LIMITES_DA_CADEIA = {
  /** A cadeia tem de compensar para quem a usa bem... */
  razaoMinimaDoCaminho: 1.05,
  /** ...sem virar o atalho: o ganho sobre a estratégia sem fazendas fica abaixo disto. */
  razaoMaximaDoCaminho: 1.6,
  /** A saída pela cooperativa rende menos que a mesma equipe sem fazendas, por esta fração (ou mais). */
  razaoMaximaDaCooperativa: 0.95,
  /** Vitórias máximas da saída pela cooperativa ("nunca é a melhor saída"). */
  vitoriaMaximaDaCooperativa: 0.02,
  /** Nenhum caminho da cadeia vence mais que isto das partidas. */
  vitoriaMaximaDeUmCaminho: 0.4,
  /** Fração máxima dos caminhos úteis com caixa negativo prolongado. */
  creditoProlongadoMaximo: 0.1,
} as const;

export const CAMINHOS_UTEIS = ["cadeia_integrada", "cadeia_so_fazenda"] as const;

export interface IndicadoresDaCadeia {
  lucro: Record<string, number>;
  vitorias: Record<string, number>;
  creditoProlongado: Record<string, number>;
  razaoIntegrada: number | null;
  razaoSoFazenda: number | null;
  razaoCooperativa: number | null;
}

export function indicadoresDaCadeia(m: Metricas): IndicadoresDaCadeia {
  const lucro: Record<string, number> = {};
  const vitorias: Record<string, number> = {};
  const creditoProlongado: Record<string, number> = {};
  for (const e of m.porEstrategia) {
    lucro[e.estrategia] = e.lucroMedio;
    vitorias[e.estrategia] = e.taxaVitoria;
    creditoProlongado[e.estrategia] = e.fracaoCreditoProlongado;
  }
  const razao = (a: string, b: string) => (lucro[a] !== undefined && lucro[b] !== undefined && lucro[b]! > 0 ? lucro[a]! / lucro[b]! : null);
  return {
    lucro,
    vitorias,
    creditoProlongado,
    razaoIntegrada: razao("cadeia_integrada", "equilibrada"),
    razaoSoFazenda: razao("cadeia_so_fazenda", "revenda"),
    razaoCooperativa: razao("cadeia_cooperativa", "equilibrada"),
  };
}

const x = (r: number | null) => (r === null ? "—" : r.toFixed(2).replace(".", ","));

export function criteriosDaCadeia(i: IndicadoresDaCadeia): Criterio[] {
  const L = LIMITES_DA_CADEIA;
  const dentro = (r: number | null) => r !== null && r >= L.razaoMinimaDoCaminho && r <= L.razaoMaximaDoCaminho;
  const criterios: Criterio[] = [
    {
      id: "cadeia_integrada_compensa",
      descricao: "Integrada (fazendas → fábricas) rende mais que a equilibrada sem fazendas, sem virar o atalho",
      valor: `${x(i.razaoIntegrada)}× o lucro médio`,
      limite: `entre ${x(L.razaoMinimaDoCaminho)}× e ${x(L.razaoMaximaDoCaminho)}×`,
      passou: dentro(i.razaoIntegrada),
    },
    {
      id: "cadeia_so_fazenda_compensa",
      descricao: "Só fazenda (carne e frango para a loja) rende mais que a revenda sem fazendas, sem virar o atalho",
      valor: `${x(i.razaoSoFazenda)}× o lucro médio`,
      limite: `entre ${x(L.razaoMinimaDoCaminho)}× e ${x(L.razaoMaximaDoCaminho)}×`,
      passou: dentro(i.razaoSoFazenda),
    },
    {
      id: "cadeia_cooperativa_perde",
      descricao: "Produzir só para a cooperativa rende menos que a mesma equipe sem fazendas",
      valor: `${x(i.razaoCooperativa)}× o lucro médio`,
      limite: `≤ ${x(L.razaoMaximaDaCooperativa)}×`,
      passou: i.razaoCooperativa !== null && i.razaoCooperativa <= L.razaoMaximaDaCooperativa,
    },
    {
      id: "cadeia_cooperativa_nunca_vence",
      descricao: "A saída pela cooperativa nunca é a melhor",
      valor: porcentagem(i.vitorias.cadeia_cooperativa ?? 0),
      limite: `≤ ${porcentagem(L.vitoriaMaximaDaCooperativa)} das partidas`,
      passou: (i.vitorias.cadeia_cooperativa ?? 0) <= L.vitoriaMaximaDaCooperativa,
    },
    {
      id: "cadeia_cooperativa_abaixo_dos_uteis",
      descricao: "A cooperativa rende menos que os dois caminhos úteis",
      valor: `${Math.round(i.lucro.cadeia_cooperativa ?? 0).toLocaleString("pt-BR")} contra ${CAMINHOS_UTEIS.map((c) => Math.round(i.lucro[c] ?? 0).toLocaleString("pt-BR")).join(" e ")}`,
      limite: "menor que ambos",
      passou: CAMINHOS_UTEIS.every((c) => (i.lucro.cadeia_cooperativa ?? 0) < (i.lucro[c] ?? 0)),
    },
    {
      id: "cadeia_nenhum_domina",
      descricao: "Nenhum caminho da cadeia vence a maioria das partidas",
      valor: [...CAMINHOS_UTEIS].map((c) => `${c.replace("cadeia_", "")}: ${porcentagem(i.vitorias[c] ?? 0)}`).join("; "),
      limite: `≤ ${porcentagem(L.vitoriaMaximaDeUmCaminho)} cada`,
      passou: CAMINHOS_UTEIS.every((c) => (i.vitorias[c] ?? 0) <= L.vitoriaMaximaDeUmCaminho),
    },
    {
      id: "cadeia_sem_caixa_negativo",
      descricao: "Os caminhos úteis não levam a caixa negativo prolongado",
      valor: CAMINHOS_UTEIS.map((c) => `${c.replace("cadeia_", "")}: ${porcentagem(i.creditoProlongado[c] ?? 0)}`).join("; "),
      limite: `≤ ${porcentagem(L.creditoProlongadoMaximo)} cada`,
      passou: CAMINHOS_UTEIS.every((c) => (i.creditoProlongado[c] ?? 0) <= L.creditoProlongadoMaximo),
    },
  ];
  return criterios;
}

// ---------------------------------------------------------------------------------------------
// Economia das atividades (valores base, sem a variação por semente)
// ---------------------------------------------------------------------------------------------


const base = (v: ValorVariavel) => (typeof v === "number" ? v : v.valor);

export interface LinhaDeEconomia {
  atividade: string;
  /** "todos os produtos", ou só a parte do rebanho que a equipe aproveita. */
  aproveitamento: string;
  /** Produção mensal em unidades-base, à capacidade nominal. */
  producaoMensal: number;
  /** Reais por mês: o que se pagaria ao fornecedor pelo que a fazenda entrega. */
  valor: number;
  /** Reais por mês. */
  custoVariavel: number;
  custoFixo: number;
  /** Economia líquida por mês, a 100% e a 60% de uso. */
  liquido100: number;
  liquido60: number;
  capex: number;
  /** Meses para pagar o capex só pela economia de custo (`Infinity` se não paga). */
  payback100: number;
  payback60: number;
}

/**
 * Economia de custo de cada atividade (sem o efeito da qualidade): o que a fazenda deixa de custar em
 * comparação com comprar do fornecedor externo, à capacidade nominal e a 60% dela. Atividades com
 * coprodutos aparecem duas vezes: aproveitando só o primeiro produto e aproveitando todos.
 */
export function economiaDasAtividades(preset: Preset, ticksPorMes = 30): LinhaDeEconomia[] {
  const c = preset.cadeia;
  if (!c) return [];
  const precoDe = (id: string) => {
    const f = preset.produtos.find((p) => p.id === id)?.fornecedor;
    return f ? base(f.preco) / 100 : 0;
  };
  const linhas: LinhaDeEconomia[] = [];
  for (const a of c.atividades) {
    const q = a.capacidadeUnidadesPorDia * ticksPorMes;
    const cv = (base(a.custoVariavelPorUnidade) / 100) * q;
    const fixo = a.custoFixoMensal / 100;
    const capex = a.capex / 100;
    // Com coprodutos: só o primeiro produto, o primeiro e 1/3 dos demais, e todos (o limite teórico: a
    // equipe raramente consegue usar ou vender todo o coproduto ao preço do fornecedor).
    const cenarios: { rotulo: string; fracaoDosDemais: number }[] =
      a.produz.length > 1
        ? [
            { rotulo: `só ${a.produz[0]!.produto.replaceAll("_", " ")}`, fracaoDosDemais: 0 },
            { rotulo: "tudo do primeiro e 1/3 dos coprodutos", fracaoDosDemais: 1 / 3 },
            { rotulo: "todos os produtos (limite teórico)", fracaoDosDemais: 1 },
          ]
        : [{ rotulo: "—", fracaoDosDemais: 1 }];
    for (const cenario of cenarios) {
      const valor = a.produz.reduce((soma, x, k) => soma + precoDe(x.produto) * x.proporcao * q * (k === 0 ? 1 : cenario.fracaoDosDemais), 0);
      const liquido = (uso: number) => uso * (valor - cv) - fixo;
      const payback = (uso: number) => (liquido(uso) > 0 ? capex / liquido(uso) : Infinity);
      linhas.push({
        atividade: a.nome,
        aproveitamento: cenario.rotulo,
        producaoMensal: q,
        valor,
        custoVariavel: cv,
        custoFixo: fixo,
        liquido100: liquido(1),
        liquido60: liquido(0.6),
        capex,
        payback100: payback(1),
        payback60: payback(0.6),
      });
    }
  }
  return linhas;
}

const mil = (x: number) => Math.round(x).toLocaleString("pt-BR");
const meses = (x: number) => (Number.isFinite(x) ? x.toFixed(1).replace(".", ",") : "não paga");

export function tabelaDeEconomia(linhas: readonly LinhaDeEconomia[]): string {
  const saida = [
    "| Atividade | Aproveita | Produção/mês | Valor ao preço do fornecedor | Custo variável | Custo fixo | Líquido/mês (100%) | Líquido/mês (60%) | Capex | Payback (100%) | Payback (60%) |",
    "|---|---|---|---|---|---|---|---|---|---|---|",
  ];
  for (const l of linhas) {
    saida.push(
      `| ${l.atividade} | ${l.aproveitamento} | ${mil(l.producaoMensal)} | R$ ${mil(l.valor)} | R$ ${mil(l.custoVariavel)} | R$ ${mil(l.custoFixo)} | R$ ${mil(l.liquido100)} | R$ ${mil(l.liquido60)} | R$ ${mil(l.capex)} | ${meses(l.payback100)} | ${meses(l.payback60)} |`,
    );
  }
  return saida.join("\n");
}
