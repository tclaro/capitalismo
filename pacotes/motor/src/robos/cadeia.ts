/**
 * Estratégias de teste da cadeia produtiva (fase 1b, entrega 9): **só para o balanceamento**, nunca
 * oferecidas em aula. Os robôs de aula seguem na camada 1 (decisão 14 do plano); estas estratégias
 * existem para medir se cada caminho da cadeia dá um resultado plausível:
 *
 * - `cadeia_integrada`: a "equilibrada" com fazendas que abastecem as próprias fábricas (origem própria);
 * - `cadeia_so_fazenda`: a "revenda" (nunca fabrica) com fazendas de carne e frango que abastecem a loja;
 * - `cadeia_cooperativa`: a "equilibrada" que constrói fazendas, produz no máximo e despeja tudo na
 *   cooperativa, sem usar a produção (a saída que **não** pode ser a melhor).
 *
 * Como as demais estratégias, usam só a `VisaoEmpresa`: a mesma informação de uma equipe.
 */
import type { Decisao } from "../tipos";
import type { VisaoCadeia, VisaoEmpresa } from "../visao";
import { produto } from "./comum";
import { EQUILIBRADA, type Estrategia, type Intensidade, REVENDA } from "./estrategias";

type Atividade = VisaoCadeia["atividades"][number];

/** Caixa mínimo que sobra depois de pagar a fazenda, como fração do capex (como a folga das fábricas). */
const FOLGA_DE_CAIXA = 0.3;
/** Dias de consumo que o estoque de matéria-prima pode guardar antes de a produção encolher. */
const DIAS_DE_COBERTURA = 7;

/** Consumo mensal esperado de cada matéria-prima, a partir das decisões do robô-base. */
export function consumoMensalDeMateriasPrimas(visao: VisaoEmpresa, base: readonly Decisao[]): Record<string, number> {
  const c = visao.cadeia;
  const consumo: Record<string, number> = {};
  if (!c) return consumo;
  const produzivel = (id: string) => c.atividades.some((a) => a.produz.some((x) => x.produto === id));
  for (const d of base) {
    if (d.tipo !== "produto") continue;
    const p = produto(visao, d.produto);
    // Insumos das fábricas: produção planejada × quantidade por unidade.
    if (d.producaoMensal !== undefined && d.producaoMensal > 0 && p.fabricacao) {
      for (const i of p.fabricacao.receita) {
        if (produzivel(i.produto)) consumo[i.produto] = (consumo[i.produto] ?? 0) + (d.producaoMensal * i.quantidadePorLote) / p.fabricacao.unidadesPorLote;
      }
    }
    // Carne e frango: compra pronta que a fazenda pode substituir.
    if (p.fabricacao === null && produzivel(p.id) && d.compraMensal !== undefined) consumo[p.id] = (consumo[p.id] ?? 0) + d.compraMensal;
  }
  return consumo;
}

const capacidadeMensal = (a: Atividade, ticksPorMes: number) => a.capacidadeUnidadesPorDia * ticksPorMes;

/** Atividade preferida para produzir a matéria-prima: a que produz menos coprodutos (as outras só se não houver). */
function atividadePara(c: VisaoCadeia, mp: string): Atividade | undefined {
  return c.atividades.filter((a) => a.produz.some((x) => x.produto === mp)).sort((a, b) => a.produz.length - b.produz.length || a.id.localeCompare(b.id))[0];
}

/** Unidades-base por mês que a atividade precisa produzir para entregar `quantidades` de cada produto. */
function produzirPara(a: Atividade, quantidades: Readonly<Record<string, number>>): number {
  let q = 0;
  for (const x of a.produz) q = Math.max(q, (quantidades[x.produto] ?? 0) / x.proporcao);
  return q;
}

/**
 * Economia mensal e payback de uma fazenda nova para a demanda dada: o que se deixa de pagar ao fornecedor
 * pelos produtos que a equipe realmente usa, menos o custo variável e o fixo.
 */
export function paybackDaFazenda(visao: VisaoEmpresa, a: Atividade, demanda: Readonly<Record<string, number>>): number {
  const c = visao.cadeia!;
  const cap = capacidadeMensal(a, visao.ticksPorMes);
  const usado: Record<string, number> = {};
  for (const x of a.produz) usado[x.produto] = Math.min(demanda[x.produto] ?? 0, cap * x.proporcao);
  const q = Math.min(cap, produzirPara(a, usado));
  let valor = 0;
  for (const x of a.produz) {
    const m = c.materiasPrimas.find((y) => y.produto === x.produto);
    valor += (usado[x.produto] ?? 0) * (m?.precoFornecedor ?? 0);
  }
  const economia = valor - q * a.custoVariavelPorUnidade - a.custoFixoMensal;
  return economia > 0 ? a.capex / economia : Infinity;
}

interface OpcoesDaCadeia {
  paybackMaximo: number;
  folgaDeProducao: number;
  /** Só considera estas matérias-primas (padrão: todas as que alguma atividade produz). */
  alvos?: readonly string[];
  /** Vende à cooperativa o que passa do necessário (evita a parada por estoque cheio dos coprodutos). */
  vendeExcedente: boolean;
}

/** Decisões da cadeia para o robô-base: constrói, ajusta a produção, escolhe as origens e vende o excedente. */
export function decisoesDaCadeia(visao: VisaoEmpresa, base: readonly Decisao[], o: OpcoesDaCadeia): Decisao[] {
  const c = visao.cadeia;
  if (!c) return [];
  const empresa = visao.empresa.id;
  const n = visao.ticksPorMes;
  const decisoes: Decisao[] = [];
  const consumo = consumoMensalDeMateriasPrimas(visao, base);
  const alvos = (o.alvos ?? c.materiasPrimas.map((m) => m.produto)).filter((mp) => (consumo[mp] ?? 0) > 0);
  let caixa = visao.empresa.caixa;

  // 1. Construir: uma fazenda por vez (por atividade), só se compensa e se o caixa aguenta.
  const emObra = new Set(c.fazendas.filter((f) => f.emObra).map((f) => f.atividade));
  const capacidadeInstalada: Record<string, number> = {};
  for (const f of c.fazendas) {
    const a = c.atividades.find((x) => x.id === f.atividade)!;
    for (const x of a.produz) capacidadeInstalada[x.produto] = (capacidadeInstalada[x.produto] ?? 0) + capacidadeMensal(a, n) * x.proporcao;
  }
  for (const mp of alvos) {
    const a = atividadePara(c, mp);
    if (!a || emObra.has(a.id) || visao.empresa.creditoEmergencial > 0) continue;
    const necessario = consumo[mp]! * (1 + o.folgaDeProducao);
    if ((capacidadeInstalada[mp] ?? 0) >= necessario * 0.9) continue;
    if (paybackDaFazenda(visao, a, consumo) > o.paybackMaximo) continue;
    if (caixa < a.capex * (1 + FOLGA_DE_CAIXA)) continue;
    caixa -= a.capex;
    emObra.add(a.id);
    decisoes.push({ tipo: "construirFazenda", empresa, atividade: a.id, producaoMensal: Math.round(Math.min(capacidadeMensal(a, n), produzirPara(a, { [mp]: necessario }))) });
  }

  // 2. Produção das fazendas em operação: o que falta para o consumo, descontado o estoque acima da cobertura.
  const faltaDe: Record<string, number> = {};
  for (const m of c.materiasPrimas) {
    const diario = (consumo[m.produto] ?? 0) / n;
    const excesso = Math.max(0, m.estoque.quantidade - diario * DIAS_DE_COBERTURA);
    faltaDe[m.produto] = Math.max(0, (consumo[m.produto] ?? 0) * (1 + o.folgaDeProducao) - excesso);
  }
  for (const f of [...c.fazendas].sort((a, b) => a.id.localeCompare(b.id))) {
    if (f.emObra || f.emConversao) continue;
    const a = c.atividades.find((x) => x.id === f.atividade)!;
    const q = Math.min(capacidadeMensal(a, n), produzirPara(a, faltaDe));
    for (const x of a.produz) faltaDe[x.produto] = Math.max(0, (faltaDe[x.produto] ?? 0) - q * x.proporcao);
    const alvo = Math.round(q);
    if (alvo !== f.producaoMensal) decisoes.push({ tipo: "ajustarFazenda", empresa, fazenda: f.id, producaoMensal: alvo });
  }

  // 3. Origem: própria onde há fazenda (operando ou em obra); o que faltar completa com o fornecedor.
  const temFazenda = (mp: string) => c.fazendas.some((f) => c.atividades.find((a) => a.id === f.atividade)!.produz.some((x) => x.produto === mp));
  for (const p of visao.produtos) {
    if (p.fabricacao) {
      const insumos: Record<string, "propria" | "fornecedor"> = {};
      for (const i of p.fabricacao.receita) {
        if (c.atividades.some((a) => a.produz.some((x) => x.produto === i.produto))) insumos[i.produto] = temFazenda(i.produto) ? "propria" : "fornecedor";
      }
      if (Object.keys(insumos).length > 0) decisoes.push({ tipo: "produto", empresa, produto: p.id, origemInsumos: insumos });
    } else if (c.atividades.some((a) => a.produz.some((x) => x.produto === p.id))) {
      decisoes.push({ tipo: "produto", empresa, produto: p.id, origemCompraPronta: temFazenda(p.id) ? "propria" : "fornecedor" });
    }
  }

  // 4. Excedente: estoque cheio para a produção (e, nos coprodutos, para os dois); vende o que passa de 2 meses de consumo.
  if (o.vendeExcedente) {
    for (const m of c.materiasPrimas) {
      if (m.capacidade <= 0 || m.estoque.quantidade < m.capacidade * 0.8) continue;
      const reserva = Math.max(consumo[m.produto] ?? 0, 0) * 0.5;
      const sobra = Math.floor(m.estoque.quantidade - reserva);
      if (sobra > 0) decisoes.push({ tipo: "venderParaCooperativa", empresa, produto: m.produto, quantidade: sobra });
    }
  }
  return decisoes;
}

/** Equilibrada com fazendas que abastecem as próprias fábricas. */
export const CADEIA_INTEGRADA: Estrategia = {
  id: "cadeia_integrada",
  nome: "Cadeia integrada (teste)",
  descricao: "Equilibrada com fazendas que abastecem as próprias fábricas e a loja. Só para o balanceamento.",
  soParaTeste: true,
  faixas: { ...EQUILIBRADA.faixas, paybackFazenda: [18, 30], folgaProducao: [0.05, 0.2] },
  decidir: (v, i: Intensidade, g) => {
    const base = EQUILIBRADA.decidir(v, i, g);
    return [...base, ...decisoesDaCadeia(v, base, { paybackMaximo: i.paybackFazenda!, folgaDeProducao: i.folgaProducao!, vendeExcedente: true })];
  },
};

/** Revenda que produz a carne e o frango que vende, em vez de comprá-los prontos. */
export const CADEIA_SO_FAZENDA: Estrategia = {
  id: "cadeia_so_fazenda",
  nome: "Só fazenda (teste)",
  descricao: "Revenda que nunca fabrica, mas produz a própria carne e o próprio frango. Só para o balanceamento.",
  soParaTeste: true,
  faixas: { ...REVENDA.faixas, paybackFazenda: [18, 30], folgaProducao: [0.05, 0.2] },
  decidir: (v, i: Intensidade, g) => {
    const base = REVENDA.decidir(v, i, g);
    return [...base, ...decisoesDaCadeia(v, base, { paybackMaximo: i.paybackFazenda!, folgaDeProducao: i.folgaProducao!, vendeExcedente: true })];
  },
};

/**
 * A saída que não pode ser a melhor: constrói uma fazenda de cada atividade que paga e despeja tudo na
 * cooperativa ao piso, sem usar a produção nas fábricas nem na loja.
 */
export const CADEIA_COOPERATIVA: Estrategia = {
  id: "cadeia_cooperativa",
  nome: "Fazenda para a cooperativa (teste)",
  descricao: "Equilibrada que produz no máximo e vende tudo à cooperativa. Só para o balanceamento.",
  soParaTeste: true,
  faixas: { ...EQUILIBRADA.faixas },
  decidir: (v, i: Intensidade, g) => {
    const base = EQUILIBRADA.decidir(v, i, g);
    const c = v.cadeia;
    if (!c) return base;
    const extras: Decisao[] = [];
    const empresa = v.empresa.id;
    const tem = new Set(c.fazendas.map((f) => f.atividade));
    // Uma fazenda de leite, uma de frango e uma de morango, quando o caixa deixa.
    let caixa = v.empresa.caixa;
    for (const id of ["gado_leiteiro", "frango", "morango"]) {
      const a = c.atividades.find((x) => x.id === id);
      if (!a || tem.has(id) || v.empresa.creditoEmergencial > 0 || caixa < a.capex * (1 + FOLGA_DE_CAIXA)) continue;
      caixa -= a.capex;
      extras.push({ tipo: "construirFazenda", empresa, atividade: id, producaoMensal: Math.round(capacidadeMensal(a, v.ticksPorMes)) });
    }
    for (const f of c.fazendas) {
      const a = c.atividades.find((x) => x.id === f.atividade)!;
      const max = Math.round(capacidadeMensal(a, v.ticksPorMes));
      if (!f.emObra && !f.emConversao && f.producaoMensal !== max) extras.push({ tipo: "ajustarFazenda", empresa, fazenda: f.id, producaoMensal: max });
    }
    for (const m of c.materiasPrimas) {
      const q = Math.floor(m.estoque.quantidade);
      if (q > 0) extras.push({ tipo: "venderParaCooperativa", empresa, produto: m.produto, quantidade: q });
    }
    return [...base, ...extras];
  },
};

