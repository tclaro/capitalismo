/**
 * Regras da tela do aluno sem React (testadas à parte).
 *
 * - Nota decomposta (seção 6.4): N = Q·PQ/60 + M·PM/60 + parcela do preço. Qualidade, marca, nota e
 *   pesos são públicos; a parcela do preço sai por diferença (como as barras do Capitalism).
 * - Decisões efetivas: as vigentes com as pendentes (ainda na fila) aplicadas por cima, na ordem.
 * - Rascunho: o que o aluno digitou, em texto; vira decisões só com os campos que mudam em relação
 *   às efetivas, com as mesmas validações do motor (o servidor continua sendo quem decide).
 */
import { type DecisaoDoAluno, type EstadoRelogio, type FechamentoMensal, lerReais, PALETA_EQUIPES, type VagaPublica, type VisaoAluno } from "@simulador/compartilhado";

type Visao = VisaoAluno["visao"];
type Vigente = Visao["empresa"]["ofertas"][number]["decisao"];

// ---------------------------------------------------------------------------------------------
// Nota
// ---------------------------------------------------------------------------------------------

export interface NotaDecomposta {
  qualidade: number;
  marca: number;
  preco: number;
  total: number;
}

export function decomporNota(qualidade: number, marca: number, nota: number, pesos: { qualidade: number; marca: number }): NotaDecomposta {
  const q = (qualidade * pesos.qualidade) / 60;
  const m = (marca * pesos.marca) / 60;
  return { qualidade: q, marca: m, preco: nota - q - m, total: nota };
}

// ---------------------------------------------------------------------------------------------
// Decisões efetivas
// ---------------------------------------------------------------------------------------------

export const CAMPOS_PRODUTO = ["preco", "compraMensal", "producaoMensal", "publicidadeMensal", "pdMensal"] as const;
export type CampoProduto = (typeof CAMPOS_PRODUTO)[number];

/** O que vale no próximo dia para cada produto: vigente + pendentes na ordem em que foram enviadas. */
export function decisoesEfetivas(visao: Visao, pendentes: readonly DecisaoDoAluno[]): Record<string, Vigente> {
  const efetivas: Record<string, Vigente> = {};
  for (const o of visao.empresa.ofertas) efetivas[o.produto] = { ...o.decisao };
  for (const p of pendentes) {
    if (p.tipo !== "produto") continue;
    const alvo = efetivas[p.produto];
    if (!alvo) continue;
    for (const c of CAMPOS_PRODUTO) {
      const v = p[c];
      if (v !== undefined) (alvo as Record<CampoProduto, number | null>)[c] = v;
    }
  }
  return efetivas;
}

/** Campos com mudança pendente (para destacar "vai valer no próximo dia"). */
export function camposPendentes(pendentes: readonly DecisaoDoAluno[], produto: string): Set<CampoProduto> {
  const s = new Set<CampoProduto>();
  for (const p of pendentes) if (p.tipo === "produto" && p.produto === produto) for (const c of CAMPOS_PRODUTO) if (p[c] !== undefined) s.add(c);
  return s;
}

// ---------------------------------------------------------------------------------------------
// Rascunho → decisões
// ---------------------------------------------------------------------------------------------

/** Campos digitados de um produto (texto como digitado; ausente = não mexeu). */
export interface RascunhoProduto {
  vender?: boolean;
  preco?: string;
  compraMensal?: string;
  producaoMensal?: string;
  publicidadeMensal?: string;
  pdMensal?: string;
}

export type Rascunho = Record<string, RascunhoProduto>;

export type ErrosDoRascunho = Record<string, Partial<Record<CampoProduto, string>>>;

/** Quantidade inteira não negativa digitada ("12.000" e "12000" valem). */
export function lerQuantidade(texto: string): number | null {
  const t = texto.trim().replace(/\./g, "");
  if (!/^\d{1,9}$/.test(t)) return null;
  return Number(t);
}

export function decisoesDoRascunho(rascunho: Rascunho, visao: Visao, efetivas: Record<string, Vigente>): { decisoes: DecisaoDoAluno[]; erros: ErrosDoRascunho } {
  const decisoes: DecisaoDoAluno[] = [];
  const erros: ErrosDoRascunho = {};
  for (const produto of visao.produtos) {
    const r = rascunho[produto.id];
    const atual = efetivas[produto.id];
    if (!r || !atual) continue;
    const e: Partial<Record<CampoProduto, string>> = {};
    const d: Partial<Record<CampoProduto, number | null>> = {};

    if (r.vender === false) {
      if (atual.preco !== null) d.preco = null;
    } else if (r.preco !== undefined || (r.vender === true && atual.preco === null)) {
      const centavos = r.preco === undefined ? null : lerReais(r.preco);
      if (centavos === null || centavos <= 0) e.preco = "digite um preço em reais, ex.: 5,90";
      else if (centavos > produto.precoMaximo) e.preco = `acima do preço máximo`;
      else if (centavos !== atual.preco) d.preco = centavos;
    }

    for (const c of ["compraMensal", "producaoMensal"] as const) {
      if (r[c] === undefined) continue;
      const q = lerQuantidade(r[c]!);
      if (q === null) e[c] = "digite um número inteiro de unidades";
      else if (c === "compraMensal" && q > 0 && !produto.fornecedor) e[c] = "este produto não pode ser comprado pronto";
      else if (c === "producaoMensal" && q > 0 && !produto.fabricacao) e[c] = "este produto não pode ser fabricado";
      else if (q !== atual[c]) d[c] = q;
    }

    for (const c of ["publicidadeMensal", "pdMensal"] as const) {
      if (r[c] === undefined) continue;
      const centavos = r[c]!.trim() === "" ? 0 : lerReais(r[c]!);
      if (centavos === null || centavos < 0) e[c] = "digite um valor em reais, ex.: 1.500,00";
      else if (c === "pdMensal" && centavos > 0 && !produto.fabricacao) e[c] = "P&D só se aplica a produtos fabricados";
      else if (centavos !== atual[c]) d[c] = centavos;
    }

    if (Object.keys(e).length > 0) erros[produto.id] = e;
    else if (Object.keys(d).length > 0) decisoes.push({ tipo: "produto", produto: produto.id, ...d } as DecisaoDoAluno);
  }
  return { decisoes, erros };
}

// ---------------------------------------------------------------------------------------------
// Relógio do aluno
// ---------------------------------------------------------------------------------------------

export function textoDoStatusAluno(r: Pick<EstadoRelogio, "status" | "motivoPausa" | "podeEditar">): string {
  switch (r.status) {
    case "preparacao":
      return "Aguardando o professor iniciar a partida";
    case "rodando":
      return "Rodando";
    case "encerrada":
      return "Partida encerrada";
    case "pausada":
      if (r.motivoPausa === "fim_do_mes") return "Pausa de fim de mês: hora de decidir";
      if (r.motivoPausa === "duracao_atingida") return "Fim do tempo previsto: aguarde o professor";
      return r.podeEditar ? "Pausada pelo professor (decisões liberadas)" : "Pausada pelo professor";
  }
}

// ---------------------------------------------------------------------------------------------
// Relatórios
// ---------------------------------------------------------------------------------------------

export interface LinhaDRE {
  rotulo: string;
  valores: number[];
  /** Linha de total (negrito). */
  total?: boolean;
}

/** DRE em colunas (um mês por coluna): receita, custos e despesas com sinal, lucros. */
export function linhasDRE(fechamentos: readonly FechamentoMensal[]): LinhaDRE[] {
  const conta = (f: FechamentoMensal, c: keyof FechamentoMensal["dre"]) => f.dre[c] ?? 0;
  const neg = (c: keyof FechamentoMensal["dre"]) => fechamentos.map((f) => -conta(f, c));
  const lucroBruto = fechamentos.map((f) => conta(f, "receita") - conta(f, "cpv"));
  return [
    { rotulo: "Receita de vendas", valores: fechamentos.map((f) => conta(f, "receita")) },
    { rotulo: "(−) Custo dos produtos vendidos", valores: neg("cpv") },
    { rotulo: "Lucro bruto", valores: lucroBruto, total: true },
    { rotulo: "(−) Publicidade", valores: neg("publicidade") },
    { rotulo: "(−) Pesquisa e desenvolvimento", valores: neg("pd") },
    { rotulo: "(−) Custo fixo das fábricas", valores: neg("custo_fixo_fabrica") },
    { rotulo: "(−) Custo fixo dos pontos de venda", valores: neg("custo_fixo_ponto_de_venda") },
    { rotulo: "(−) Armazenagem", valores: neg("armazenagem") },
    { rotulo: "(−) Depreciação", valores: neg("depreciacao") },
    { rotulo: "(−) Baixa de ativos", valores: neg("baixa_de_ativos") },
    { rotulo: "(−) Juros", valores: neg("juros") },
    { rotulo: "Lucro antes do IR", valores: fechamentos.map((f) => f.lucroAntesIR), total: true },
    { rotulo: "(−) Imposto de renda", valores: neg("ir") },
    { rotulo: "Lucro líquido", valores: fechamentos.map((f) => f.lucroLiquido), total: true },
  ];
}

// ---------------------------------------------------------------------------------------------
// Entrada
// ---------------------------------------------------------------------------------------------

/** Cores ainda livres no mercado da vaga (cada equipe do mercado tem uma cor diferente). */
export function coresLivres(vagas: readonly VagaPublica[], vaga: VagaPublica): (typeof PALETA_EQUIPES)[number][] {
  const usadas = new Set(vagas.filter((v) => v.mercado === vaga.mercado && v.equipe).map((v) => v.equipe!.cor));
  return PALETA_EQUIPES.filter((c) => !usadas.has(c.id));
}
