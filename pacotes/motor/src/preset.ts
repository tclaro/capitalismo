/**
 * Contrato do preset: os parâmetros de cenário que o motor recebe ao criar uma partida.
 *
 * Convenções:
 * - Dinheiro em **centavos inteiros** (ex.: R$ 6,00 = 600).
 * - Taxas e decaimentos são **mensais**; o motor converte para o tick (seção 6.1).
 * - Pesos em **pontos percentuais** (somam 100), como no manual do Capitalism II.
 * - Um `ValorVariavel` pode trazer uma variação relativa: ao criar a partida, cada semente sorteia
 *   o valor em `valor × (1 ± variacao)` (seção 10.3). Sem variação, o valor é fixo.
 */

/** Número fixo ou número com variação relativa sorteada por semente (ex.: `{ valor: 600, variacao: 0.1 }` = ±10%). */
export type ValorVariavel = number | { readonly valor: number; readonly variacao: number };

/** Variação relativa máxima aceita num `ValorVariavel`. */
export const VARIACAO_MAXIMA = 0.5;

export type NivelProduto = "materia_prima" | "semiacabado" | "final";

export interface PesosNota {
  /** Peso da qualidade (PQ), em pontos percentuais. */
  readonly qualidade: ValorVariavel;
  /** Peso da marca (PM), em pontos percentuais. */
  readonly marca: ValorVariavel;
  /** Peso do preço (PP), em pontos percentuais. Depois do sorteio, os três são renormalizados para somar 100. */
  readonly preco: ValorVariavel;
}

/** Venda ao consumidor final (seções 6.3, 6.4 e 6.11). */
export interface ParametrosVarejo {
  /** Preço padrão interno (P_ref), em centavos. Não é exibido aos alunos. */
  readonly precoReferencia: ValorVariavel;
  /** Consumo base por habitante por mês, em unidades do produto. */
  readonly consumoMensalPorHabitante: ValorVariavel;
  /** Elasticidade-preço da demanda total (positiva; entra com sinal negativo na fórmula). */
  readonly elasticidade: ValorVariavel;
  readonly pesos: PesosNota;
  /** Capacidade de ponto de venda consumida por unidade vendida (1 = padrão). */
  readonly fatorCapacidade: number;
}

/** Fornecedor externo: compra pronta (produto final) ou compra de insumo (seções 6.6 e 6.10). */
export interface ParametrosFornecedor {
  /** Preço por unidade, em centavos. */
  readonly preco: ValorVariavel;
  /** Qualidade (0–100). */
  readonly qualidade: ValorVariavel;
  /** Limite mensal de unidades, dividido proporcionalmente entre os pedidos; `null` = sem limite. */
  readonly ofertaMaxMensal: number | null;
}

export interface InsumoReceita {
  readonly produto: string;
  /** Quantidade do insumo por lote. */
  readonly quantidadePorLote: number;
  /** Peso do insumo na qualidade final, em pontos percentuais. */
  readonly pesoQualidade: number;
}

/** Fabricação própria (seção 6.6). As proporções da receita vêm do Apêndice B do manual. */
export interface ParametrosFabricacao {
  /** Unidades produzidas por lote da receita. */
  readonly unidadesPorLote: number;
  /** Até 3 insumos. Σ pesoQualidade + pesoTecnologia = 100. */
  readonly receita: readonly InsumoReceita[];
  /** Peso da tecnologia na qualidade final, em pontos percentuais. */
  readonly pesoTecnologia: number;
  /** Custo de mão de obra por unidade produzida, em centavos. */
  readonly custoMaoDeObraPorUnidade: ValorVariavel;
  /** Investimento para construir a fábrica, em centavos. */
  readonly capex: number;
  readonly prazoConstrucaoDias: number;
  /** Custo fixo mensal da fábrica em operação, em centavos. */
  readonly custoFixoMensal: number;
  readonly capacidadeUnidadesPorDia: number;
  readonly vidaUtilMeses: number;
}

export interface ProdutoDoPreset {
  /** Id do produto na árvore do catálogo. */
  readonly id: string;
  readonly nome: string;
  readonly unidade: string;
  readonly nivel: NivelProduto;
  /** Custo de armazenagem por unidade por mês, em centavos (pode ser fracionário por unidade). */
  readonly custoArmazenagemMensal: number;
  readonly varejo?: ParametrosVarejo;
  readonly fornecedor?: ParametrosFornecedor;
  readonly fabricacao?: ParametrosFabricacao;
}

/** Reconhecimento e fidelidade (seção 6.5). */
export interface ParametrosMarca {
  readonly reconhecimentoInicial: number;
  readonly decaimentoReconhecimentoMensal: number;
  readonly taxaReconhecimentoMensal: number;
  /** Verba mensal de publicidade que leva a 63% do efeito máximo, por habitante, em centavos. */
  readonly verbaReferenciaPorHabitanteMensal: number;
  readonly fidelidadeInicial: number;
  readonly fidelidadeMinima: number;
  readonly decaimentoFidelidadeMensal: number;
  /** Pontos de fidelidade por mês com reconhecimento 100 e qualidade 100 pontos acima da esperada. */
  readonly taxaFidelidadeMensal: number;
  /** Pontos de fidelidade perdidos por mês com ruptura total. */
  readonly penalidadeRupturaMensal: number;
  readonly pesoReconhecimento: number;
  readonly pesoFidelidade: number;
}

/** Tecnologia e P&D (seção 6.6). */
export interface ParametrosTecnologia {
  readonly tecnologiaInicial: number;
  /** Piso de T_max, para não dividir por zero e para que P&D sempre importe. */
  readonly tecnologiaBase: number;
  /** Pontos de tecnologia por mês com verba saturada. */
  readonly taxaTecnologiaMensal: number;
  /** Verba mensal de P&D que leva a 63% do efeito máximo, em centavos. */
  readonly verbaReferenciaMensal: number;
  /**
   * Difusão tecnológica: fração da distância até a tecnologia líder do mercado que cada empresa fecha
   * por mês, por imitação (0 = sem difusão). A liderança em P&D se dissipa sem investimento contínuo.
   */
  readonly difusaoTecnologicaMensal: number;
}

/**
 * Curva de aprendizado das fábricas (seção 6.6; manual do Capitalism II: "a produtividade e a capacidade
 * de uma unidade de fabricação aumentam quando o nível da unidade aumenta").
 *
 * A experiência de cada fábrica é medida em **meses de produção à capacidade nominal**, para valer igual
 * para produtos de volumes muito diferentes. O nível é o maior `i` com `experiencia ≥ limites[i]`.
 */
export interface ParametrosAprendizado {
  /** Experiência mínima (meses equivalentes) de cada nível; começa em 0 e é crescente. */
  readonly limitesMeses: readonly number[];
  /** Multiplicador da capacidade nominal em cada nível (o último costuma ser 1). */
  readonly capacidade: readonly number[];
  /** Multiplicador do custo de mão de obra por unidade em cada nível (o último costuma ser 1). */
  readonly maoDeObra: readonly number[];
}

/** Alocação das vendas no varejo (seção 6.11). */
export interface ParametrosVendas {
  /** Sensibilidade do logit à nota (β). */
  readonly sensibilidadeNota: number;
  /** Fração da demanda não atendida que desiste da compra na redistribuição. */
  readonly perdaSubstituicao: number;
  /** Teto de preço como múltiplo de P_ref. */
  readonly multiploTetoPreco: number;
}

export interface ParametrosPontoDeVenda {
  readonly custoAbertura: number;
  readonly prazoAberturaDias: number;
  readonly custoFixoMensal: number;
  /** Capacidade de venda por dia, em unidades-equivalentes (unidade × fatorCapacidade). */
  readonly capacidadePorDia: number;
  readonly vidaUtilMeses: number;
  /** Pontos de venda já abertos no início da partida. */
  readonly iniciais: number;
}

/** Contabilidade e caixa (seção 6.12). */
export interface ParametrosFinanceiros {
  readonly caixaInicial: number;
  readonly aliquotaIR: number;
  /** Fração máxima do lucro do mês que pode ser abatida por prejuízo fiscal acumulado. */
  readonly travaCompensacaoPrejuizo: number;
  readonly jurosEmergencialMensal: number;
  /** Pontos descontados da pontuação por mês com crédito emergencial em aberto (princípio 7). */
  readonly penalidadeFalenciaMensal: number;
}

export interface ParametrosMercado {
  readonly populacao: ValorVariavel;
  /** Fator do ciclo econômico (1 = normal); alterado por eventos. */
  readonly fatorCiclo: number;
}

export type TipoDeFazenda = "lavoura" | "pecuaria";

/** O que uma atividade de fazenda produz. A primeira entrada é o produto principal e tem proporção 1. */
export interface ProducaoDaAtividade {
  /** Matéria-prima produzida (id do produto no preset). */
  readonly produto: string;
  /** Unidades deste produto por unidade-base produzida (1 = principal; 0,5 = coproduto na metade da quantidade). */
  readonly proporcao: number;
}

/**
 * Atividade de uma fazenda (seção 6.16): gado de corte, gado leiteiro, frango, uma cultura. Cada fazenda
 * tem uma atividade por vez, e os custos da instalação são os da atividade.
 */
export interface AtividadeDeFazenda {
  readonly id: string;
  readonly nome: string;
  readonly tipo: TipoDeFazenda;
  readonly produz: readonly ProducaoDaAtividade[];
  /** Custo variável por unidade-base produzida (a do produto principal), em centavos. */
  readonly custoVariavelPorUnidade: ValorVariavel;
  /** Qualidade da produção de uma fazenda nova (0–100). */
  readonly qualidadeBase: ValorVariavel;
  /** Investimento para construir a fazenda, em centavos. */
  readonly capex: number;
  readonly prazoConstrucaoDias: number;
  /** Custo fixo mensal da fazenda em operação, em centavos. */
  readonly custoFixoMensal: number;
  /** Produção máxima por dia, em unidades-base. */
  readonly capacidadeUnidadesPorDia: number;
  /** Dias de produção à capacidade nominal que cabem no estoque de cada produto da fazenda. */
  readonly diasDeArmazenagem: number;
  readonly vidaUtilMeses: number;
}

/**
 * Cadeia produtiva mínima (camada 3, seção 6.16). Bloco opcional: sem ele o preset não tem fazendas, e o
 * módulo `cadeia_produtiva` não faz sentido.
 */
export interface ParametrosCadeia {
  readonly atividades: readonly AtividadeDeFazenda[];
  /** A qualidade da produção cresce com a experiência da fazenda, medida em meses de produção à capacidade nominal. */
  readonly experiencia: {
    /** Pontos de qualidade ganhos por mês de experiência. */
    readonly ganhoQualidadePorMes: number;
    /** Teto da qualidade (0–100). */
    readonly qualidadeMaxima: number;
  };
  /** Troca de atividade de uma fazenda: custo e prazo iguais para qualquer troca. */
  readonly conversao: { readonly custo: number; readonly prazoDias: number };
  /** Comprador de último recurso: paga `fatorPiso` × o preço do fornecedor externo, só quando a equipe manda vender. */
  readonly cooperativa: { readonly fatorPiso: number };
  /** Destruição de estoque: custo por unidade destruída, em centavos (pode ser fracionário). */
  readonly descarte: { readonly custoPorUnidade: number };
  /**
   * Origem própria que não basta: `true` completa o que falta com o fornecedor externo (a produção segue);
   * `false` reduz a produção ao que o estoque próprio cobre.
   */
  readonly completaComFornecedor: boolean;
}

export interface Preset {
  readonly id: string;
  readonly nome: string;
  readonly versao: string;
  readonly moeda: "BRL";
  readonly ticksPorMes: number;
  readonly mercado: ParametrosMercado;
  readonly produtos: readonly ProdutoDoPreset[];
  readonly marca: ParametrosMarca;
  readonly tecnologia: ParametrosTecnologia;
  readonly aprendizado: ParametrosAprendizado;
  readonly vendas: ParametrosVendas;
  readonly pontoDeVenda: ParametrosPontoDeVenda;
  readonly financeiro: ParametrosFinanceiros;
  /** Presente só nos presets com a camada 3 (cadeia produtiva). */
  readonly cadeia?: ParametrosCadeia;
}

// ---------------------------------------------------------------------------------------------
// Validação
// ---------------------------------------------------------------------------------------------

const TOLERANCIA_SOMA = 1e-9;

/** Valor base de um `ValorVariavel` (sem sorteio). */
export function valorBase(v: ValorVariavel): number {
  return typeof v === "number" ? v : v.valor;
}

class Coletor {
  readonly erros: string[] = [];

  exigir(condicao: boolean, mensagem: string): void {
    if (!condicao) this.erros.push(mensagem);
  }

  finito(v: number, onde: string): boolean {
    const ok = Number.isFinite(v);
    this.exigir(ok, `${onde}: deve ser um número finito (recebido ${v})`);
    return ok;
  }

  naoNegativo(v: number, onde: string): void {
    if (this.finito(v, onde)) this.exigir(v >= 0, `${onde}: não pode ser negativo (recebido ${v})`);
  }

  positivo(v: number, onde: string): void {
    if (this.finito(v, onde)) this.exigir(v > 0, `${onde}: deve ser maior que zero (recebido ${v})`);
  }

  inteiroNaoNegativo(v: number, onde: string): void {
    if (this.finito(v, onde)) {
      this.exigir(Number.isInteger(v) && v >= 0, `${onde}: deve ser inteiro e não negativo (recebido ${v})`);
    }
  }

  inteiroPositivo(v: number, onde: string): void {
    if (this.finito(v, onde)) this.exigir(Number.isInteger(v) && v > 0, `${onde}: deve ser inteiro e maior que zero (recebido ${v})`);
  }

  fracao(v: number, onde: string): void {
    if (this.finito(v, onde)) this.exigir(v >= 0 && v <= 1, `${onde}: deve estar entre 0 e 1 (recebido ${v})`);
  }

  entre(v: number, min: number, max: number, onde: string): void {
    if (this.finito(v, onde)) this.exigir(v >= min && v <= max, `${onde}: deve estar entre ${min} e ${max} (recebido ${v})`);
  }

  /** Valida a variação e aplica `checar` ao valor base e aos extremos da faixa. */
  variavel(v: ValorVariavel, onde: string, checar: (x: number, onde: string) => void): void {
    if (typeof v === "number") {
      checar(v, onde);
      return;
    }
    checar(v.valor, onde);
    if (this.finito(v.variacao, `${onde}.variacao`)) {
      this.exigir(
        v.variacao >= 0 && v.variacao <= VARIACAO_MAXIMA,
        `${onde}.variacao: deve estar entre 0 e ${VARIACAO_MAXIMA} (recebido ${v.variacao})`,
      );
    }
  }
}

function validarCadeia(c: Coletor, cadeia: ParametrosCadeia, porId: ReadonlyMap<string, ProdutoDoPreset>): void {
  c.exigir(cadeia.atividades.length >= 1, "cadeia.atividades: precisa de pelo menos uma atividade");
  const ids = new Set<string>();
  for (const a of cadeia.atividades) {
    const o = `cadeia.atividades[${a.id}]`;
    c.exigir(a.id.length > 0, "cadeia.atividades: id não pode ser vazio");
    c.exigir(!ids.has(a.id), `${o}: id duplicado`);
    ids.add(a.id);
    c.exigir(a.nome.length > 0, `${o}.nome: não pode ser vazio`);
    c.exigir(a.tipo === "lavoura" || a.tipo === "pecuaria", `${o}.tipo: deve ser "lavoura" ou "pecuaria" (recebido ${String(a.tipo)})`);

    c.exigir(a.produz.length >= 1, `${o}.produz: precisa de pelo menos um produto`);
    const vistos = new Set<string>();
    a.produz.forEach((pr, k) => {
      const op = `${o}.produz[${pr.produto}]`;
      c.exigir(!vistos.has(pr.produto), `${op}: produto repetido`);
      vistos.add(pr.produto);
      c.positivo(pr.proporcao, `${op}.proporcao`);
      if (k === 0) c.exigir(pr.proporcao === 1, `${op}.proporcao: o produto principal tem proporção 1 (recebido ${pr.proporcao})`);
      const alvo = porId.get(pr.produto);
      c.exigir(alvo !== undefined, `${op}: produto não existe no preset`);
      if (alvo) {
        c.exigir(alvo.nivel === "materia_prima", `${op}: a fazenda só produz matéria-prima (nível "${alvo.nivel}")`);
        c.exigir(alvo.fornecedor !== undefined, `${op}: matéria-prima precisa de fornecedor externo (é o teto de preço)`);
      }
    });

    c.variavel(a.custoVariavelPorUnidade, `${o}.custoVariavelPorUnidade`, (x, oo) => c.naoNegativo(x, oo));
    c.variavel(a.qualidadeBase, `${o}.qualidadeBase`, (x, oo) => c.entre(x, 0, 100, oo));
    c.inteiroNaoNegativo(a.capex, `${o}.capex`);
    c.inteiroNaoNegativo(a.prazoConstrucaoDias, `${o}.prazoConstrucaoDias`);
    c.inteiroNaoNegativo(a.custoFixoMensal, `${o}.custoFixoMensal`);
    c.positivo(a.capacidadeUnidadesPorDia, `${o}.capacidadeUnidadesPorDia`);
    c.positivo(a.diasDeArmazenagem, `${o}.diasDeArmazenagem`);
    c.inteiroPositivo(a.vidaUtilMeses, `${o}.vidaUtilMeses`);
  }

  c.naoNegativo(cadeia.experiencia.ganhoQualidadePorMes, "cadeia.experiencia.ganhoQualidadePorMes");
  c.entre(cadeia.experiencia.qualidadeMaxima, 0, 100, "cadeia.experiencia.qualidadeMaxima");
  c.inteiroNaoNegativo(cadeia.conversao.custo, "cadeia.conversao.custo");
  c.inteiroNaoNegativo(cadeia.conversao.prazoDias, "cadeia.conversao.prazoDias");
  if (c.finito(cadeia.cooperativa.fatorPiso, "cadeia.cooperativa.fatorPiso")) {
    c.exigir(
      cadeia.cooperativa.fatorPiso > 0 && cadeia.cooperativa.fatorPiso <= 1,
      `cadeia.cooperativa.fatorPiso: deve estar entre 0 (exclusivo) e 1 (recebido ${cadeia.cooperativa.fatorPiso})`,
    );
  }
  c.naoNegativo(cadeia.descarte.custoPorUnidade, "cadeia.descarte.custoPorUnidade");
  c.exigir(typeof cadeia.completaComFornecedor === "boolean", "cadeia.completaComFornecedor: deve ser verdadeiro ou falso");
}

/**
 * Valida um preset. Devolve a lista de erros (vazia = válido).
 * Verifica tipos numéricos, domínios, referências entre produtos e somas de pesos.
 */
export function validarPreset(preset: Preset): string[] {
  const c = new Coletor();

  c.exigir(preset.id.length > 0, "preset.id: não pode ser vazio");
  c.inteiroPositivo(preset.ticksPorMes, "preset.ticksPorMes");

  c.variavel(preset.mercado.populacao, "mercado.populacao", (x, o) => c.positivo(x, o));
  c.positivo(preset.mercado.fatorCiclo, "mercado.fatorCiclo");

  const porId = new Map<string, ProdutoDoPreset>();
  for (const p of preset.produtos) {
    c.exigir(!porId.has(p.id), `produto ${p.id}: id duplicado`);
    porId.set(p.id, p);
  }
  c.exigir(preset.produtos.some((p) => p.varejo !== undefined), "preset: precisa de pelo menos um produto vendido no varejo");

  for (const p of preset.produtos) {
    const onde = `produto ${p.id}`;
    c.exigir(p.nome.length > 0, `${onde}.nome: não pode ser vazio`);
    c.naoNegativo(p.custoArmazenagemMensal, `${onde}.custoArmazenagemMensal`);

    if (p.varejo) {
      const v = p.varejo;
      c.variavel(v.precoReferencia, `${onde}.varejo.precoReferencia`, (x, o) => c.inteiroPositivo(x, o));
      c.variavel(v.consumoMensalPorHabitante, `${onde}.varejo.consumoMensalPorHabitante`, (x, o) => c.positivo(x, o));
      c.variavel(v.elasticidade, `${onde}.varejo.elasticidade`, (x, o) => c.naoNegativo(x, o));
      c.variavel(v.pesos.qualidade, `${onde}.varejo.pesos.qualidade`, (x, o) => c.entre(x, 0, 100, o));
      c.variavel(v.pesos.marca, `${onde}.varejo.pesos.marca`, (x, o) => c.entre(x, 0, 100, o));
      c.variavel(v.pesos.preco, `${onde}.varejo.pesos.preco`, (x, o) => c.entre(x, 0, 100, o));
      const soma = valorBase(v.pesos.qualidade) + valorBase(v.pesos.marca) + valorBase(v.pesos.preco);
      c.exigir(Math.abs(soma - 100) <= TOLERANCIA_SOMA, `${onde}.varejo.pesos: devem somar 100 (somam ${soma})`);
      c.positivo(v.fatorCapacidade, `${onde}.varejo.fatorCapacidade`);
      c.exigir(
        p.fornecedor !== undefined || p.fabricacao !== undefined,
        `${onde}: produto de varejo precisa de fornecedor (comprar pronto) ou de fabricação`,
      );
    }

    if (p.fornecedor) {
      const f = p.fornecedor;
      c.variavel(f.preco, `${onde}.fornecedor.preco`, (x, o) => c.inteiroPositivo(x, o));
      c.variavel(f.qualidade, `${onde}.fornecedor.qualidade`, (x, o) => c.entre(x, 0, 100, o));
      if (f.ofertaMaxMensal !== null) c.positivo(f.ofertaMaxMensal, `${onde}.fornecedor.ofertaMaxMensal`);
    }

    if (p.fabricacao) {
      const fb = p.fabricacao;
      const o = `${onde}.fabricacao`;
      c.exigir(p.nivel !== "materia_prima", `${o}: matéria-prima não é fabricada`);
      c.positivo(fb.unidadesPorLote, `${o}.unidadesPorLote`);
      c.exigir(fb.receita.length >= 1 && fb.receita.length <= 3, `${o}.receita: precisa de 1 a 3 insumos (tem ${fb.receita.length})`);
      const vistos = new Set<string>();
      let somaPesos = fb.pesoTecnologia;
      for (const insumo of fb.receita) {
        const oi = `${o}.receita[${insumo.produto}]`;
        c.exigir(!vistos.has(insumo.produto), `${oi}: insumo repetido`);
        vistos.add(insumo.produto);
        c.exigir(insumo.produto !== p.id, `${oi}: produto não pode ser insumo de si mesmo`);
        c.positivo(insumo.quantidadePorLote, `${oi}.quantidadePorLote`);
        c.entre(insumo.pesoQualidade, 0, 100, `${oi}.pesoQualidade`);
        somaPesos += insumo.pesoQualidade;
        const alvo = porId.get(insumo.produto);
        c.exigir(alvo !== undefined, `${oi}: insumo não existe no preset`);
        if (alvo) {
          c.exigir(alvo.fornecedor !== undefined, `${oi}: insumo precisa de fornecedor externo (camada 1)`);
          c.exigir(alvo.nivel !== "final", `${oi}: produto final não pode ser insumo`);
        }
      }
      c.entre(fb.pesoTecnologia, 0, 100, `${o}.pesoTecnologia`);
      c.exigir(Math.abs(somaPesos - 100) <= TOLERANCIA_SOMA, `${o}: pesos dos insumos + tecnologia devem somar 100 (somam ${somaPesos})`);
      c.variavel(fb.custoMaoDeObraPorUnidade, `${o}.custoMaoDeObraPorUnidade`, (x, oo) => c.naoNegativo(x, oo));
      c.inteiroNaoNegativo(fb.capex, `${o}.capex`);
      c.inteiroNaoNegativo(fb.prazoConstrucaoDias, `${o}.prazoConstrucaoDias`);
      c.inteiroNaoNegativo(fb.custoFixoMensal, `${o}.custoFixoMensal`);
      c.positivo(fb.capacidadeUnidadesPorDia, `${o}.capacidadeUnidadesPorDia`);
      c.inteiroPositivo(fb.vidaUtilMeses, `${o}.vidaUtilMeses`);
    }

    c.exigir(
      p.varejo !== undefined || p.fornecedor !== undefined || p.fabricacao !== undefined,
      `${onde}: produto sem papel no preset (nem varejo, nem fornecedor, nem fabricação)`,
    );
  }

  const m = preset.marca;
  c.entre(m.reconhecimentoInicial, 0, 100, "marca.reconhecimentoInicial");
  c.fracao(m.decaimentoReconhecimentoMensal, "marca.decaimentoReconhecimentoMensal");
  c.fracao(m.taxaReconhecimentoMensal, "marca.taxaReconhecimentoMensal");
  c.positivo(m.verbaReferenciaPorHabitanteMensal, "marca.verbaReferenciaPorHabitanteMensal");
  c.entre(m.fidelidadeMinima, -100, 0, "marca.fidelidadeMinima");
  c.entre(m.fidelidadeInicial, m.fidelidadeMinima, 100, "marca.fidelidadeInicial");
  c.fracao(m.decaimentoFidelidadeMensal, "marca.decaimentoFidelidadeMensal");
  c.naoNegativo(m.taxaFidelidadeMensal, "marca.taxaFidelidadeMensal");
  c.naoNegativo(m.penalidadeRupturaMensal, "marca.penalidadeRupturaMensal");
  c.fracao(m.pesoReconhecimento, "marca.pesoReconhecimento");
  c.fracao(m.pesoFidelidade, "marca.pesoFidelidade");

  const t = preset.tecnologia;
  c.naoNegativo(t.tecnologiaInicial, "tecnologia.tecnologiaInicial");
  c.positivo(t.tecnologiaBase, "tecnologia.tecnologiaBase");
  c.naoNegativo(t.taxaTecnologiaMensal, "tecnologia.taxaTecnologiaMensal");
  c.positivo(t.verbaReferenciaMensal, "tecnologia.verbaReferenciaMensal");
  c.fracao(t.difusaoTecnologicaMensal, "tecnologia.difusaoTecnologicaMensal");

  const a = preset.aprendizado;
  const niveis = a.limitesMeses.length;
  c.exigir(niveis >= 1, "aprendizado.limitesMeses: precisa de pelo menos um nível");
  c.exigir(
    a.capacidade.length === niveis && a.maoDeObra.length === niveis,
    `aprendizado: limitesMeses, capacidade e maoDeObra devem ter o mesmo número de níveis (${niveis}, ${a.capacidade.length}, ${a.maoDeObra.length})`,
  );
  if (niveis >= 1) c.exigir(a.limitesMeses[0] === 0, "aprendizado.limitesMeses: o primeiro nível começa em 0");
  a.limitesMeses.forEach((x, i) => {
    c.naoNegativo(x, `aprendizado.limitesMeses[${i}]`);
    if (i > 0) c.exigir(x > a.limitesMeses[i - 1]!, `aprendizado.limitesMeses: deve ser crescente (posição ${i})`);
  });
  a.capacidade.forEach((x, i) => c.positivo(x, `aprendizado.capacidade[${i}]`));
  a.maoDeObra.forEach((x, i) => c.positivo(x, `aprendizado.maoDeObra[${i}]`));

  const v = preset.vendas;
  c.naoNegativo(v.sensibilidadeNota, "vendas.sensibilidadeNota");
  c.fracao(v.perdaSubstituicao, "vendas.perdaSubstituicao");
  c.exigir(Number.isFinite(v.multiploTetoPreco) && v.multiploTetoPreco >= 1, "vendas.multiploTetoPreco: deve ser pelo menos 1");

  const pv = preset.pontoDeVenda;
  c.inteiroNaoNegativo(pv.custoAbertura, "pontoDeVenda.custoAbertura");
  c.inteiroNaoNegativo(pv.prazoAberturaDias, "pontoDeVenda.prazoAberturaDias");
  c.inteiroNaoNegativo(pv.custoFixoMensal, "pontoDeVenda.custoFixoMensal");
  c.positivo(pv.capacidadePorDia, "pontoDeVenda.capacidadePorDia");
  c.inteiroPositivo(pv.vidaUtilMeses, "pontoDeVenda.vidaUtilMeses");
  c.inteiroNaoNegativo(pv.iniciais, "pontoDeVenda.iniciais");

  if (preset.cadeia) validarCadeia(c, preset.cadeia, porId);

  const f = preset.financeiro;
  c.inteiroNaoNegativo(f.caixaInicial, "financeiro.caixaInicial");
  c.fracao(f.aliquotaIR, "financeiro.aliquotaIR");
  c.fracao(f.travaCompensacaoPrejuizo, "financeiro.travaCompensacaoPrejuizo");
  c.naoNegativo(f.jurosEmergencialMensal, "financeiro.jurosEmergencialMensal");
  c.naoNegativo(f.penalidadeFalenciaMensal, "financeiro.penalidadeFalenciaMensal");

  return c.erros;
}
