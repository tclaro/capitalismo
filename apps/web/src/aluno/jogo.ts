/**
 * Regras da tela de jogo do aluno sem React (testadas à parte):
 * - empresas do mercado com uma cor cada (equipes: a escolhida; robôs: as livres da paleta);
 * - fatias da participação e séries semanais para a rosca e as linhas;
 * - validação de um campo isolado (as mesmas regras do rascunho, que concordam com o servidor);
 * - produtos que esgotaram e mudanças que envolvem o 1º lugar (avisos flutuantes);
 * - formatos de largura estável (casas decimais fixas: o número não "pula" de largura).
 */
import {
  type Aviso as AvisoDoMotor,
  dataDoTick,
  type DecisaoDoAluno,
  type EstadoRelogio,
  fronteirasDeSemana,
  PALETA_EQUIPES,
  type ParticipacaoSemanal,
  type SemanaDaOferta,
  type VisaoAluno,
} from "@simulador/compartilhado";
import { formatarNumero } from "../formato";
import { type CampoProduto, decisoesDoRascunho, decisoesEfetivas } from "./regras";

type Visao = VisaoAluno["visao"];

// ---------------------------------------------------------------------------------------------
// Empresas e cores
// ---------------------------------------------------------------------------------------------

export interface EmpresaDoMercado {
  id: string;
  nome: string;
  /** Cor em hexadecimal. */
  cor: string;
  nos: boolean;
  robo: boolean;
}

const CINZA = "#6B6B6B";

/**
 * Empresas do mercado da equipe, na ordem das vagas. Equipes usam a cor que escolheram; robôs e
 * vagas sem equipe recebem as cores livres da paleta, em ordem (até 8 empresas, nenhuma repete).
 */
export function empresasDoMercado(v: VisaoAluno): EmpresaDoMercado[] {
  const nomes = new Map<string, string>([[v.empresa, v.equipe.nome], ...v.visao.concorrentes.map((c) => [c.id, c.nome] as const)]);
  const usadas = new Set(v.vagas.filter((x) => x.equipe).map((x) => x.equipe!.cor));
  const livres = PALETA_EQUIPES.filter((c) => !usadas.has(c.id));
  let k = 0;
  return v.vagas
    .filter((x) => nomes.has(x.empresa))
    .map((x) => {
      const escolhida = x.equipe ? PALETA_EQUIPES.find((c) => c.id === x.equipe!.cor)?.hex : undefined;
      const cor = escolhida ?? livres[k++]?.hex ?? CINZA;
      return { id: x.empresa, nome: nomes.get(x.empresa)!, cor, nos: x.empresa === v.empresa, robo: x.robo };
    });
}

// ---------------------------------------------------------------------------------------------
// Oferta de um produto no mercado
// ---------------------------------------------------------------------------------------------

export interface OfertaNoMercado {
  empresa: EmpresaDoMercado;
  preco: number | null;
  qualidade: number;
  marca: number;
  nota: number;
  participacao: number;
}

/** A oferta da equipe e as dos concorrentes para um produto, em ordem fixa (a equipe primeiro). */
export function ofertasDoProduto(v: VisaoAluno, produto: string): OfertaNoMercado[] {
  const empresas = empresasDoMercado(v);
  const propria = v.visao.empresa.ofertas.find((o) => o.produto === produto);
  const linhas: OfertaNoMercado[] = [];
  for (const e of [...empresas.filter((x) => x.nos), ...empresas.filter((x) => !x.nos)]) {
    if (e.nos) {
      if (propria) linhas.push({ empresa: e, preco: propria.decisao.preco, qualidade: propria.qualidade, marca: propria.marca, nota: propria.notaAnterior, participacao: propria.participacaoAnterior });
      continue;
    }
    const o = v.visao.concorrentes.find((c) => c.id === e.id)?.ofertas.find((x) => x.produto === produto);
    if (o) linhas.push({ empresa: e, preco: o.preco, qualidade: o.qualidade, marca: o.marca, nota: o.notaAnterior, participacao: o.participacaoAnterior });
  }
  return linhas;
}

export interface Fatia {
  empresa: EmpresaDoMercado;
  /** Fração da rosca (as fatias somam 1). */
  fracao: number;
}

/** Fatias da participação de ontem, na ordem das vagas (as fatias não trocam de lugar entre dias). */
export function fatiasDoProduto(v: VisaoAluno, produto: string): Fatia[] {
  const porId = new Map(ofertasDoProduto(v, produto).map((o) => [o.empresa.id, o]));
  const linhas = empresasDoMercado(v)
    .map((e) => ({ empresa: e, p: Math.max(0, porId.get(e.id)?.participacao ?? 0) }))
    .filter((l) => l.p > 0);
  const total = linhas.reduce((s, l) => s + l.p, 0);
  return total > 0 ? linhas.map((l) => ({ empresa: l.empresa, fracao: l.p / total })) : [];
}

/** Posição da nota da equipe entre as empresas que vendem o produto (1 = melhor), ou `null`. */
export function posicaoDaNota(v: VisaoAluno, produto: string): { posicao: number; de: number } | null {
  const vendendo = ofertasDoProduto(v, produto).filter((o) => o.preco !== null);
  const nos = vendendo.find((o) => o.empresa.nos);
  if (!nos) return null;
  return { posicao: 1 + vendendo.filter((o) => o.nota > nos.nota).length, de: vendendo.length };
}

// ---------------------------------------------------------------------------------------------
// Séries semanais
// ---------------------------------------------------------------------------------------------

/** Semana global da partida (1 = primeira semana do mês 1), como no histórico do servidor. */
export function semanaGlobal(tick: number, ticksPorMes: number): number {
  if (tick <= 0) return 0;
  const { mes, semana } = dataDoTick(tick, ticksPorMes);
  return (mes - 1) * 4 + semana;
}

/** Participação semanal de cada empresa em um produto, alinhada pelas semanas (0 onde faltar). */
export function seriesDeParticipacao(mercado: readonly ParticipacaoSemanal[], produto: string, empresas: readonly string[]): { semanas: number[]; valores: Record<string, number[]> } {
  const doProduto = mercado.filter((r) => r.produto === produto);
  const semanas = [...new Set(doProduto.map((r) => r.semana))].sort((a, b) => a - b);
  const indice = new Map(semanas.map((s, i) => [s, i]));
  const valores: Record<string, number[]> = {};
  for (const e of empresas) valores[e] = semanas.map(() => 0);
  for (const r of doProduto) {
    const linha = valores[r.empresa];
    if (linha) linha[indice.get(r.semana)!] = r.participacao;
  }
  return { semanas, valores };
}

/** Topo do eixo das linhas (múltiplo de 10%), que só cresce: eixo que encolhe e cresce faz a grade pular. */
export function topoDoEixo(anterior: number, valores: readonly number[]): number {
  const maximo = Math.max(0.1, ...valores);
  return Math.max(anterior, Math.min(1, Math.ceil(maximo * 10 - 1e-9) / 10));
}

/** Produto que mais e que menos faturou no mês (pelo histórico semanal), entre os que faturaram. */
export function destaquesDoMes(semanas: readonly SemanaDaOferta[], mes: number, empresa: string): { melhor: { produto: string; receita: number } | null; pior: { produto: string; receita: number } | null } {
  const receita = new Map<string, number>();
  for (const s of semanas) if (s.mes === mes && s.empresa === empresa) receita.set(s.produto, (receita.get(s.produto) ?? 0) + s.receita);
  const ordem = [...receita].filter(([, r]) => r > 0).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const para = (x: [string, number] | undefined) => (x ? { produto: x[0], receita: x[1] } : null);
  return { melhor: para(ordem[0]), pior: ordem.length > 1 ? para(ordem.at(-1)) : null };
}

// ---------------------------------------------------------------------------------------------
// Campos de decisão
// ---------------------------------------------------------------------------------------------

export type ResultadoDoCampo = { tipo: "erro"; motivo: string } | { tipo: "sem-mudanca" } | { tipo: "decisao"; decisao: DecisaoDoAluno };

/**
 * Valida um campo digitado com as regras do rascunho (as mesmas que concordam com o servidor):
 * erro, nada a mudar (igual ao que já vale) ou a decisão a enviar.
 */
export function validarCampo(visao: Visao, pendentes: readonly DecisaoDoAluno[], produto: string, campo: CampoProduto, texto: string): ResultadoDoCampo {
  const efetivas = decisoesEfetivas(visao, pendentes);
  const { decisoes, erros } = decisoesDoRascunho({ [produto]: { [campo]: texto } }, visao, efetivas);
  const erro = erros[produto]?.[campo];
  if (erro) return { tipo: "erro", motivo: erro };
  const d = decisoes[0];
  return d ? { tipo: "decisao", decisao: d } : { tipo: "sem-mudanca" };
}

/** Passo do botão +/− das quantidades: uma potência de 10 perto de 2% da demanda mensal por empresa. */
export function passoDeQuantidade(visao: Visao, produto: string): number {
  const p = visao.produtos.find((x) => x.id === produto);
  if (!p) return 1;
  const porEmpresa = (p.consumoMensalPorHabitante * visao.mercado.populacao) / Math.max(1, visao.mercado.empresas);
  return Math.max(1, 10 ** Math.floor(Math.log10(Math.max(1, porEmpresa * 0.02))));
}

/** Dias de venda que o estoque cobre ao ritmo de ontem (`Infinity` sem vendas, 0 sem estoque). */
export function cobertura(estoque: number, vendasOntem: number): number {
  if (estoque <= 0) return 0;
  return vendasOntem > 0 ? estoque / vendasOntem : Infinity;
}

// ---------------------------------------------------------------------------------------------
// Avisos flutuantes
// ---------------------------------------------------------------------------------------------

/** Produtos à venda que terminaram o último dia sem estoque. */
export function produtosEsgotados(v: VisaoAluno): Set<string> {
  return new Set(v.visao.empresa.ofertas.filter((o) => o.decisao.preco !== null && o.estoque.quantidade <= 0).map((o) => o.produto));
}

/**
 * Esgotados que merecem aviso: os que não estavam esgotados na visão anterior. Na primeira visão
 * (`antes` nulo) não avisa nada; quem continua esgotado não avisa de novo; quem se recuperou e
 * esgotou outra vez avisa.
 */
export function novosEsgotados(antes: ReadonlySet<string> | null, agora: ReadonlySet<string>): string[] {
  if (antes === null) return [];
  return [...agora].filter((p) => !antes.has(p));
}

export function posicaoNoRanking(v: VisaoAluno): number | null {
  return v.ranking?.find((p) => p.empresa === v.empresa)?.posicao ?? null;
}

/** Aviso de ranking só quando envolve o 1º lugar (chegar ou perder). */
export function avisoDoPrimeiroLugar(antes: number | null, depois: number | null): string | null {
  if (antes === null || depois === null || antes === depois) return null;
  if (depois === 1) return "Vocês assumiram o 1º lugar do ranking!";
  if (antes === 1) return `Vocês perderam o 1º lugar: agora estão em ${depois}º.`;
  return null;
}

export function textoDoAviso(a: AvisoDoMotor, v: VisaoAluno): string {
  const produto = (id: string) => v.visao.produtos.find((p) => p.id === id)?.nome ?? v.sala.materiasPrimas.find((m) => m.id === id)?.nome ?? id;
  const atividade = (id: string) => (v.sala.atividades.find((x) => x.id === id)?.nome ?? id).toLowerCase();
  switch (a.tipo) {
    case "evento":
      return a.descricao;
    case "fim_de_mes":
      return `${nomeDoMes(a.mes, true)} fechado: veja os resultados (tecla R).`;
    case "ponto_de_venda_aberto":
      return `${a.quantidade} ponto(s) de venda começaram a funcionar.`;
    case "fabrica_concluida":
      return `A fábrica de ${produto(a.produto).toLowerCase()} ficou pronta: já dá para produzir.`;
    case "fazenda_concluida":
      return `A fazenda de ${atividade(a.atividade)} ficou pronta: já dá para produzir.`;
    case "conversao_concluida":
      return `A fazenda virou ${atividade(a.atividade)}: já dá para produzir.`;
    case "estoque_cheio":
      return `O estoque de ${produto(a.produto).toLowerCase()} está cheio há dias: a produção da fazenda vai parar.`;
    case "ruptura_de_estoque":
      return `${produto(a.produto)} esgotou: faltou produto para vender.`;
    case "caixa_negativo":
      return "O caixa ficou negativo: a empresa entrou no crédito emergencial.";
  }
}

// ---------------------------------------------------------------------------------------------
// Datas e formatos de largura estável
// ---------------------------------------------------------------------------------------------

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export function nomeDoMes(mes: number, maiuscula = false): string {
  const n = MESES[(mes - 1 + 1200) % 12]!;
  return maiuscula ? n[0]!.toUpperCase() + n.slice(1) : n;
}

/** "16 de março" (o ano do jogo começa em janeiro); antes do primeiro dia, "Antes do início". */
export function dataPorExtenso(tick: number, ticksPorMes: number): string {
  if (tick <= 0) return "Antes do início";
  const { mes, dia } = dataDoTick(tick, ticksPorMes);
  return `${dia} de ${nomeDoMes(mes)}`;
}

/** "16/mar" para a lista de avisos. */
export function dataCurta(tick: number, ticksPorMes: number): string {
  if (tick <= 0) return "início";
  const { mes, dia } = dataDoTick(tick, ticksPorMes);
  return `${dia}/${MESES_CURTOS[(mes - 1) % 12]}`;
}

export function subtituloDaData(r: Pick<EstadoRelogio, "tick" | "mes" | "duracaoMeses">): string {
  if (r.tick <= 0) return `${r.duracaoMeses} meses de partida`;
  if (r.mes > r.duracaoMeses) return `Prorrogação · mês ${r.mes}`;
  return `Mês ${r.mes} de ${r.duracaoMeses} · ano ${Math.floor((r.mes - 1) / 12) + 1}`;
}

/** Dias que fecham semana no mês (para as marcas da barra do mês). */
export const diasDeFimDeSemana = (ticksPorMes: number) => new Set(fronteirasDeSemana(ticksPorMes).filter((d) => d < ticksPorMes));

/**
 * Reais em forma curta, com casas fixas: "R$ 930,0 mil", "R$ 1,25 mi", "−R$ 4.512". As casas não
 * variam dentro de cada faixa, para o número não mudar de largura de um dia para o outro.
 */
export function reaisCurtos(centavos: number): string {
  const r = Math.abs(centavos) / 100;
  const sinal = centavos < 0 && r >= 0.5 ? "−" : "";
  // A faixa é decidida depois de arredondar: R$ 999.950 vira "R$ 1,00 mi" (e não "R$ 1.000,0 mil").
  if (r >= 999_950) return `${sinal}R$ ${formatarNumero(r / 1e6, 2)} mi`;
  if (r >= 9_999.5) return `${sinal}R$ ${formatarNumero(r / 1e3, 1)} mil`;
  return `${sinal}R$ ${formatarNumero(r, 0)}`;
}

/** Reais para rótulo de eixo (cabe na margem do gráfico): "−R$ 500 mil", "R$ 1,5 mi", "R$ 0". */
export function reaisDoEixo(centavos: number): string {
  const r = Math.abs(centavos) / 100;
  const sinal = centavos < 0 && r >= 0.5 ? "−" : "";
  if (r >= 1e6) return `${sinal}R$ ${formatarNumero(r / 1e6, 1)} mi`;
  if (r >= 1e3) return `${sinal}R$ ${formatarNumero(r / 1e3, 0)} mil`;
  return `${sinal}R$ ${formatarNumero(r, 0)}`;
}

/** Plural simples da unidade do produto: "garrafa" → "garrafas", "par" → "pares", "unidade" → "unidades". */
export function plural(unidade: string): string {
  if (/^(kg|g|l|ml)$/i.test(unidade)) return unidade; // abreviações não variam
  if (/[rsz]$/.test(unidade)) return `${unidade}es`;
  if (/m$/.test(unidade)) return `${unidade.slice(0, -1)}ns`;
  return `${unidade}s`;
}

/** "1 garrafa", "0 garrafas", "1.234 garrafas". */
export const quantidadeCom = (n: number, unidade: string) => `${formatarNumero(n)} ${Math.round(n) === 1 ? unidade : plural(unidade)}`;

/** Fração como porcentagem inteira ("23%"). */
export const pctInteiro = (f: number) => `${formatarNumero(f * 100, 0)}%`;
