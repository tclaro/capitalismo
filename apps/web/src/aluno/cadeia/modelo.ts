/**
 * Regras da tela da cadeia sem React (testadas à parte): lista de instalações, decisões efetivas
 * (vigentes + pendentes), estado de cada instalação, estimativa da desova na troca de atividade.
 *
 * O servidor continua sendo quem decide: aqui só se organiza o que a visão já traz e se prevê, com as
 * mesmas fórmulas do motor, o que a equipe vai ver acontecer.
 */
import type { DecisaoDoAluno, VisaoAluno } from "@simulador/compartilhado";
import { decisoesEfetivas } from "../regras";

type Visao = VisaoAluno["visao"];
export type VisaoDaCadeia = NonNullable<Visao["cadeia"]>;
export type Fazenda = VisaoDaCadeia["fazendas"][number];
export type MateriaPrima = VisaoDaCadeia["materiasPrimas"][number];
export type Atividade = VisaoDaCadeia["atividades"][number];
export type OfertaDeAtacado = VisaoDaCadeia["atacado"][number];
type Produto = Visao["produtos"][number];
type OfertaPropria = Visao["empresa"]["ofertas"][number];

export type OrigemDoInsumo = "fornecedor" | "propria";

// ---------------------------------------------------------------------------------------------
// Instalações (os cartões do palco)
// ---------------------------------------------------------------------------------------------

export type Coluna = "origem" | "fabrica" | "loja";

export interface Instalacao {
  /** "faz:<id>", "fab:<produto>", "loja", "nova:fazenda" ou "nova:fabrica". */
  id: string;
  coluna: Coluna;
}

export const ID_LOJA = "loja";
export const ID_NOVA_FAZENDA = "nova:fazenda";
export const ID_NOVA_FABRICA = "nova:fabrica";
export const idDaFazenda = (id: string) => `faz:${id}`;
export const idDaFabrica = (produto: string) => `fab:${produto}`;

/** Produtos com fábrica própria (operando ou em obra), na ordem do preset. */
export function fabricasDaEmpresa(v: VisaoAluno): OfertaPropria[] {
  return v.visao.empresa.ofertas.filter((o) => o.fabricasOperando + o.fabricasEmObra > 0);
}

/** Instalações na ordem em que aparecem (coluna por coluna, de cima para baixo): a ordem das teclas 1–9. */
export function instalacoes(v: VisaoAluno): Instalacao[] {
  const c = v.visao.cadeia;
  if (!c) return [];
  return [
    ...c.fazendas.map((f): Instalacao => ({ id: idDaFazenda(f.id), coluna: "origem" })),
    { id: ID_NOVA_FAZENDA, coluna: "origem" },
    ...fabricasDaEmpresa(v).map((o): Instalacao => ({ id: idDaFabrica(o.produto), coluna: "fabrica" })),
    { id: ID_NOVA_FABRICA, coluna: "fabrica" },
    { id: ID_LOJA, coluna: "loja" },
  ];
}

/** A instalação escolhida, ou a primeira se ela deixou de existir. */
export function instalacaoValida(v: VisaoAluno, id: string): string {
  const lista = instalacoes(v);
  return lista.some((i) => i.id === id) ? id : (lista[0]?.id ?? ID_LOJA);
}

// ---------------------------------------------------------------------------------------------
// Decisões efetivas (vigentes + pendentes na ordem em que foram enviadas)
// ---------------------------------------------------------------------------------------------

export interface OfertaDeAtacadoEfetiva {
  preco: number | null;
  quantidadeMensal: number;
}

export interface EfetivasDaCadeia {
  /** Produção mensal que vale amanhã, por fazenda. */
  producaoDaFazenda: Record<string, number>;
  /** Fazendas já encomendadas (pendentes), ainda sem id. */
  construcoes: { atividade: string; producaoMensal: number | null }[];
  /** Fazendas com troca de atividade pendente. */
  trocas: Record<string, string>;
  /** Oferta de atacado por matéria-prima (`null` = sem oferta). */
  oferta: Record<string, OfertaDeAtacadoEfetiva | null>;
  /** Pedido de atacado por matéria-prima (`null` = sem pedido). */
  pedido: Record<string, { vendedor: string; quantidadeMensal: number } | null>;
  /** Venda à cooperativa ordenada para amanhã, por matéria-prima. */
  cooperativa: Record<string, number>;
  /** Fábricas encomendadas e ainda não iniciadas, por produto. */
  fabricasPendentes: Record<string, number>;
}

export function efetivasDaCadeia(v: VisaoAluno): EfetivasDaCadeia {
  const c = v.visao.cadeia;
  const r: EfetivasDaCadeia = { producaoDaFazenda: {}, construcoes: [], trocas: {}, oferta: {}, pedido: {}, cooperativa: {}, fabricasPendentes: {} };
  if (!c) return r;
  for (const f of c.fazendas) r.producaoDaFazenda[f.id] = f.producaoMensal;
  for (const m of c.materiasPrimas) {
    r.oferta[m.produto] = m.ofertaAtacado ? { preco: m.ofertaAtacado.preco, quantidadeMensal: m.ofertaAtacado.quantidadeMensal } : null;
    r.pedido[m.produto] = m.pedidoAtacado ? { vendedor: m.pedidoAtacado.vendedor, quantidadeMensal: m.pedidoAtacado.quantidadeMensal } : null;
  }
  for (const d of v.pendentes) {
    switch (d.tipo) {
      case "construirFazenda":
        r.construcoes.push({ atividade: d.atividade, producaoMensal: d.producaoMensal ?? null });
        break;
      case "ajustarFazenda":
        r.producaoDaFazenda[d.fazenda] = d.producaoMensal;
        break;
      case "trocarAtividade":
        r.trocas[d.fazenda] = d.atividade;
        break;
      case "ofertarNoAtacado":
        r.oferta[d.produto] = d.quantidadeMensal > 0 ? { preco: d.preco, quantidadeMensal: d.quantidadeMensal } : null;
        break;
      case "comprarNoAtacado":
        r.pedido[d.produto] = d.quantidadeMensal > 0 ? { vendedor: d.vendedor, quantidadeMensal: d.quantidadeMensal } : null;
        break;
      case "venderParaCooperativa":
        r.cooperativa[d.produto] = (r.cooperativa[d.produto] ?? 0) + d.quantidade;
        break;
      case "construirFabrica":
        r.fabricasPendentes[d.produto] = (r.fabricasPendentes[d.produto] ?? 0) + 1;
        break;
      default:
        break;
    }
  }
  return r;
}

/** Quem mudou a oferta ou o pedido desde a visão (para o "vale amanhã" do campo). */
export const temPendencia = (pendentes: readonly DecisaoDoAluno[], tipo: DecisaoDoAluno["tipo"], chave: (d: DecisaoDoAluno) => boolean = () => true) => pendentes.some((d) => d.tipo === tipo && chave(d));

/** Origem de cada insumo e da compra pronta que vale amanhã para um produto (vigente + pendentes). */
export function origemEfetiva(v: VisaoAluno, produto: string): { insumos: Record<string, OrigemDoInsumo>; compraPronta: OrigemDoInsumo } {
  const o = v.visao.empresa.ofertas.find((x) => x.produto === produto);
  const insumos: Record<string, OrigemDoInsumo> = { ...(o?.decisao.origemInsumos ?? {}) };
  let compraPronta: OrigemDoInsumo = o?.decisao.origemCompraPronta ?? "fornecedor";
  for (const d of v.pendentes) {
    if (d.tipo !== "produto" || d.produto !== produto) continue;
    if (d.origemInsumos) for (const [insumo, origem] of Object.entries(d.origemInsumos)) insumos[insumo] = origem;
    if (d.origemCompraPronta) compraPronta = d.origemCompraPronta;
  }
  return { insumos, compraPronta };
}

// ---------------------------------------------------------------------------------------------
// Matérias-primas e atividades
// ---------------------------------------------------------------------------------------------

export const atividadeDe = (c: VisaoDaCadeia, id: string): Atividade | undefined => c.atividades.find((a) => a.id === id);

/** Unidade abreviada para os números dos cartões e dos campos ("litro" → "L"); nas frases vale o nome por extenso. */
export const unidadeCurta = (u: string) => (u === "litro" ? "L" : u);

export const materiaPrima = (c: VisaoDaCadeia, produto: string): MateriaPrima | undefined => c.materiasPrimas.find((m) => m.produto === produto);

/** Alguma atividade do preset produz esta matéria-prima? (só então a origem "própria" vale) */
export const produzivel = (c: VisaoDaCadeia, produto: string) => c.atividades.some((a) => a.produz.some((x) => x.produto === produto));

/** Fração da capacidade do estoque ocupada (0 a 1; 0 sem capacidade). */
export function fracaoDoEstoque(m: MateriaPrima): number {
  return m.capacidade > 0 ? Math.min(1, Math.max(0, m.estoque.quantidade / m.capacidade)) : 0;
}

/** Estoque no teto da capacidade (a produção para). Mesma tolerância do motor. */
export const estoqueCheio = (m: MateriaPrima) => m.capacidade > 0 && m.estoque.quantidade >= m.capacidade * (1 - 1e-9);

/** O nome do estoque fica vermelho depois de tantos dias seguidos cheio (o motor avisa na mesma conta). */
export const DIAS_CHEIO_PARA_ALERTA = 3;
export const estoqueEmAlerta = (m: MateriaPrima) => m.diasCheio >= DIAS_CHEIO_PARA_ALERTA;

/** Capacidade de produção mensal da atividade (unidades-base por mês). */
export const capacidadeMensal = (a: Atividade, ticksPorMes: number) => a.capacidadeUnidadesPorDia * ticksPorMes;

// ---------------------------------------------------------------------------------------------
// Estado de cada instalação (a pílula do cartão)
// ---------------------------------------------------------------------------------------------

export type ClasseDoEstado = "ok" | "alerta" | "erro" | "neutro";
export interface Estado {
  classe: ClasseDoEstado;
  texto: string;
}

export function estadoDaFazenda(v: VisaoAluno, f: Fazenda, producaoEfetiva = f.producaoMensal): Estado {
  const c = v.visao.cadeia!;
  const tick = v.relogio.tick;
  if (f.emObra) return { classe: "neutro", texto: `em obra · ${Math.max(1, f.operaDesdeTick - tick)} d` };
  if (f.emConversao) return { classe: "alerta", texto: `convertendo · ${Math.max(1, (f.conversaoAteTick ?? tick) - tick)} d` };
  const a = atividadeDe(c, f.atividade);
  const estoques = (a?.produz ?? []).map((x) => materiaPrima(c, x.produto)).filter((m): m is MateriaPrima => m !== undefined);
  if (producaoEfetiva <= 0) return { classe: "alerta", texto: "sem produção" };
  if (estoques.some(estoqueCheio)) return { classe: "erro", texto: "parada · cheio" };
  if (estoques.some((m) => fracaoDoEstoque(m) >= 0.85)) return { classe: "alerta", texto: "quase cheio" };
  return { classe: "ok", texto: "produzindo" };
}

/** Dias de produção, à capacidade nominal, que o estoque de produto acabado cobre (indicador da fábrica). */
export function diasDeProducao(o: OfertaPropria): number | null {
  return o.capacidadeProducaoPorTick > 0 ? o.estoque.quantidade / o.capacidadeProducaoPorTick : null;
}

/** Dias de produção a partir dos quais o estoque de uma fábrica conta como alto (referência da barra). */
export const DIAS_DE_REFERENCIA_DA_FABRICA = 15;

export function estadoDaFabrica(o: OfertaPropria, producaoEfetiva: number): Estado {
  if (o.fabricasOperando === 0) return { classe: "neutro", texto: "em obra" };
  if (producaoEfetiva <= 0) return { classe: "alerta", texto: "sem produção" };
  const dias = diasDeProducao(o);
  if (dias !== null && dias >= DIAS_DE_REFERENCIA_DA_FABRICA) return { classe: "alerta", texto: "estoque alto" };
  return { classe: "ok", texto: "produzindo" };
}

// ---------------------------------------------------------------------------------------------
// Troca de atividade e desova
// ---------------------------------------------------------------------------------------------

export type ViaDeDesova = "cooperativa" | "atacado" | "destruir";

/**
 * Matérias-primas que sobram da troca: as da atividade atual da fazenda que nem a nova atividade nem
 * outra fazenda da empresa (em qualquer estado) produz. Em ordem alfabética, como no motor.
 */
export function orfaosDaTroca(c: VisaoDaCadeia, fazenda: string, novaAtividade: string): string[] {
  const f = c.fazendas.find((x) => x.id === fazenda);
  const atual = f ? atividadeDe(c, f.atividade) : undefined;
  const nova = atividadeDe(c, novaAtividade);
  if (!f || !atual || !nova) return [];
  const mantidos = new Set(nova.produz.map((x) => x.produto));
  for (const g of c.fazendas) if (g.id !== fazenda) for (const x of atividadeDe(c, g.atividade)?.produz ?? []) mantidos.add(x.produto);
  return atual.produz
    .map((x) => x.produto)
    .filter((p) => !mantidos.has(p))
    .sort();
}

export interface EstimativaDaDesova {
  produto: string;
  nome: string;
  unidade: string;
  quantidade: number;
}

/** O que está em estoque e sai com a troca. */
export function estoqueQueSai(c: VisaoDaCadeia, fazenda: string, novaAtividade: string): EstimativaDaDesova[] {
  return orfaosDaTroca(c, fazenda, novaAtividade)
    .map((p) => materiaPrima(c, p))
    .filter((m): m is MateriaPrima => m !== undefined && m.estoque.quantidade > 0)
    .map((m) => ({ produto: m.produto, nome: m.nome, unidade: m.unidade, quantidade: m.estoque.quantidade }));
}

const arredondar = (x: number) => Math.round(x);

/**
 * Caixa estimado (em centavos) de cada via de desova: cooperativa e atacado entram (o atacado só se as
 * outras equipes comprarem tudo), a destruição sai (custo de descarte). Também o custo da conversão.
 */
export function valorDaDesova(c: VisaoDaCadeia, itens: readonly EstimativaDaDesova[], via: ViaDeDesova, fatorAtacado: number): number {
  let total = 0;
  for (const i of itens) {
    const m = materiaPrima(c, i.produto)!;
    if (via === "cooperativa") total += arredondar(i.quantidade * m.precoCooperativa);
    else if (via === "atacado") total += arredondar(i.quantidade * arredondar(m.precoFornecedor * fatorAtacado));
    else total -= arredondar(i.quantidade * c.descarte.custoPorUnidade);
  }
  return total;
}

// ---------------------------------------------------------------------------------------------
// Fios de fluxo
// ---------------------------------------------------------------------------------------------

/** Ponta de um fio: uma linha de produto dentro de um cartão (`<instalação>|<produto>`). */
export const ponta = (instalacao: string, produto: string) => `${instalacao}|${produto}`;

export interface Ligacao {
  de: string;
  para: string;
  /** Instalações que o fio liga (para destacar só os fios da instalação escolhida). */
  instalacoes: [string, string];
}

/**
 * Fios do palco: fazenda → fábrica quando o insumo vem da origem própria, fábrica → loja para o que se
 * vende, fazenda → loja para a carne e o frango com origem própria. Só existe fio onde há decisão que o
 * justifique; a quantidade que corre não vem na visão, então os fios não têm espessura variável.
 */
export function ligacoes(v: VisaoAluno): Ligacao[] {
  const c = v.visao.cadeia;
  if (!c) return [];
  const saida: Ligacao[] = [];
  const emVenda = new Set(produtosEmVenda(v, true).map((x) => x.produto.id));
  for (const o of fabricasDaEmpresa(v)) {
    const p = v.visao.produtos.find((x) => x.id === o.produto);
    if (!p?.fabricacao) continue;
    const origem = origemEfetiva(v, o.produto);
    for (const i of p.fabricacao.receita) {
      if (origem.insumos[i.produto] !== "propria") continue;
      for (const f of c.fazendas) {
        if (atividadeDe(c, f.atividade)?.produz.some((x) => x.produto === i.produto)) {
          saida.push({ de: ponta(idDaFazenda(f.id), i.produto), para: ponta(idDaFabrica(o.produto), i.produto), instalacoes: [idDaFazenda(f.id), idDaFabrica(o.produto)] });
        }
      }
    }
    if (emVenda.has(o.produto)) saida.push({ de: ponta(idDaFabrica(o.produto), o.produto), para: ponta(ID_LOJA, o.produto), instalacoes: [idDaFabrica(o.produto), ID_LOJA] });
  }
  for (const { produto: p } of produtosEmVenda(v, true)) {
    if (!vemDaFazenda(c, p) || origemEfetiva(v, p.id).compraPronta !== "propria") continue;
    for (const f of c.fazendas) {
      if (atividadeDe(c, f.atividade)?.produz.some((x) => x.produto === p.id)) saida.push({ de: ponta(idDaFazenda(f.id), p.id), para: ponta(ID_LOJA, p.id), instalacoes: [idDaFazenda(f.id), ID_LOJA] });
    }
  }
  return saida;
}

// ---------------------------------------------------------------------------------------------
// Atacado
// ---------------------------------------------------------------------------------------------

/** Ofertas dos outros para uma matéria-prima, da mais barata para a mais cara (empate: vendedor). */
export function ofertasDosOutros(c: VisaoDaCadeia, produto: string): OfertaDeAtacado[] {
  return c.atacado.filter((o) => o.produto === produto).sort((a, b) => a.preco - b.preco || a.vendedor.localeCompare(b.vendedor));
}

/** Matérias-primas que a equipe pode comprar ou vender no atacado: as que alguma atividade produz. */
export const materiasDoAtacado = (c: VisaoDaCadeia): MateriaPrima[] => c.materiasPrimas.filter((m) => produzivel(c, m.produto));

// ---------------------------------------------------------------------------------------------
// Loja
// ---------------------------------------------------------------------------------------------

/**
 * Produtos que a empresa vende (preço definido), na ordem do preset. Por padrão os de hoje; com
 * `amanha`, os que valem a partir do próximo dia (vigente + pendentes).
 */
export const produtosEmVenda = (v: VisaoAluno, amanha = false): { produto: Produto; oferta: OfertaPropria }[] => {
  const efetivas = amanha ? decisoesEfetivas(v.visao, v.pendentes) : null;
  return v.visao.produtos.flatMap((p) => {
    const oferta = v.visao.empresa.ofertas.find((o) => o.produto === p.id);
    const preco = efetivas ? efetivas[p.id]?.preco : oferta?.decisao.preco;
    return oferta && preco !== null && preco !== undefined ? [{ produto: p, oferta }] : [];
  });
};

/** Produto de varejo que vem direto de uma fazenda (carne e frango): matéria-prima do preset que também é vendida. */
export const vemDaFazenda = (c: VisaoDaCadeia, p: Produto) => p.fabricacao === null && produzivel(c, p.id);
