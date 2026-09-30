/**
 * Tipos do estado da partida, das entradas de um tick e do resultado.
 *
 * O estado é **JSON puro**: sem `Map`, `Set`, `undefined` significativo, `NaN` ou `-0`. Listas são
 * mantidas ordenadas por id (`mer_01`, `emp_01`, ...), e o motor sempre itera sobre elas em ordem.
 * Assim, `JSON.parse(JSON.stringify(estado))` é um estado equivalente, e é isso que o servidor grava
 * a cada tick (seção 9.7).
 */
import type { Gerador } from "./aleatorio";
import type { Centavos, Estoque } from "./dinheiro";
import type { PesosNotaResolvidos } from "./formulas/nota";
import type { InsumoReceita, NivelProduto } from "./preset";

export const VERSAO_ESTADO = 1;

/** Dias de um mês de jogo. Prazos e capacidades "por dia" são convertidos para ticks com base nele. */
export const DIAS_POR_MES = 30;

// ---------------------------------------------------------------------------------------------
// Parâmetros resolvidos (preset depois do sorteio por semente)
// ---------------------------------------------------------------------------------------------

export interface VarejoResolvido {
  precoReferencia: Centavos;
  consumoMensalPorHabitante: number;
  elasticidade: number;
  pesos: PesosNotaResolvidos;
  fatorCapacidade: number;
}

export interface FornecedorResolvido {
  preco: Centavos;
  qualidade: number;
  ofertaMaxMensal: number | null;
}

export interface FabricacaoResolvida {
  unidadesPorLote: number;
  receita: InsumoReceita[];
  pesoTecnologia: number;
  custoMaoDeObraPorUnidade: number;
  capex: Centavos;
  prazoConstrucaoDias: number;
  custoFixoMensal: Centavos;
  capacidadeUnidadesPorDia: number;
  vidaUtilMeses: number;
}

export interface ProdutoResolvido {
  id: string;
  nome: string;
  unidade: string;
  nivel: NivelProduto;
  custoArmazenagemMensal: number;
  /** Ausente = o produto não é vendido no varejo. JSON não guarda `undefined`, então usamos `null`. */
  varejo: VarejoResolvido | null;
  fornecedor: FornecedorResolvido | null;
  fabricacao: FabricacaoResolvida | null;
}

export interface ParametrosResolvidos {
  presetId: string;
  presetVersao: string;
  ticksPorMes: number;
  populacao: number;
  fatorCicloInicial: number;
  /** Na ordem do preset. */
  produtos: ProdutoResolvido[];
  marca: {
    reconhecimentoInicial: number;
    decaimentoReconhecimentoMensal: number;
    taxaReconhecimentoMensal: number;
    verbaReferenciaPorHabitanteMensal: number;
    fidelidadeInicial: number;
    fidelidadeMinima: number;
    decaimentoFidelidadeMensal: number;
    taxaFidelidadeMensal: number;
    penalidadeRupturaMensal: number;
    pesoReconhecimento: number;
    pesoFidelidade: number;
  };
  tecnologia: {
    tecnologiaInicial: number;
    tecnologiaBase: number;
    taxaTecnologiaMensal: number;
    verbaReferenciaMensal: Centavos;
  };
  vendas: { sensibilidadeNota: number; perdaSubstituicao: number; multiploTetoPreco: number };
  pontoDeVenda: {
    custoAbertura: Centavos;
    prazoAberturaDias: number;
    custoFixoMensal: Centavos;
    capacidadePorDia: number;
    vidaUtilMeses: number;
    iniciais: number;
  };
  financeiro: {
    caixaInicial: Centavos;
    aliquotaIR: number;
    travaCompensacaoPrejuizo: number;
    jurosEmergencialMensal: number;
    penalidadeFalenciaMensal: number;
  };
}

// ---------------------------------------------------------------------------------------------
// Estado
// ---------------------------------------------------------------------------------------------

export type ModuloId = "nucleo" | "financas" | "cadeia_produtiva";

export interface EstadoMercado {
  id: string;
  nome: string;
  populacao: number;
  fatorCiclo: number;
}

/** Decisão persistente de uma empresa para um produto de varejo (vale até ser alterada). */
export interface DecisaoProdutoVigente {
  /** Preço de venda em centavos; `null` = não vende o produto. */
  preco: Centavos | null;
  /** Unidades por mês compradas prontas do fornecedor externo. */
  compraMensal: number;
  /** Unidades por mês a produzir nas fábricas próprias. */
  producaoMensal: number;
  publicidadeMensal: Centavos;
  pdMensal: Centavos;
}

export interface EstadoOferta {
  produto: string;
  decisao: DecisaoProdutoVigente;
  estoque: Estoque;
  reconhecimento: number;
  fidelidade: number;
  tecnologia: number;
  /** Qualidade da última unidade disponível; usada na nota quando o estoque está vazio. */
  qualidadeReferencia: number;
  /** Demanda recebida no tick anterior, antes dos limites de estoque e capacidade (para o preço médio). */
  demandaAnterior: number;
  /** Havia ruptura no tick anterior (para emitir aviso só na transição). */
  emRuptura: boolean;
}

/** Ativo imobilizado (ponto de venda ou fábrica), com custo histórico e depreciação acumulada. */
export interface EstadoAtivo {
  id: string;
  custo: Centavos;
  depreciacaoAcumulada: Centavos;
  /** Tick em que o ativo entra (ou entrou) em operação. Até lá, é obra em andamento. */
  operaDesdeTick: number;
  vidaUtilMeses: number;
}

export interface EstadoFabrica extends EstadoAtivo {
  produto: string;
}

/**
 * Contas da DRE. Insumos e mão de obra da fabricação entram no custo do estoque e chegam à DRE
 * pelo CPV, na venda (custeio por competência); o custo fixo da fábrica é despesa do período.
 */
export type ContaDRE =
  | "receita"
  | "cpv"
  | "publicidade"
  | "pd"
  | "custo_fixo_fabrica"
  | "custo_fixo_ponto_de_venda"
  | "armazenagem"
  | "depreciacao"
  | "baixa_de_ativos"
  | "juros"
  | "ir";

export type ClasseFluxo = "operacional" | "investimento" | "financiamento";

export interface AcumuladoMes {
  /** Valores positivos; o sinal (receita × despesa) vem da conta. */
  dre: Record<ContaDRE, Centavos>;
  /** Variação de caixa por classe (com sinal). */
  fluxo: Record<ClasseFluxo, Centavos>;
}

export interface FechamentoMensal {
  mes: number;
  dre: Record<ContaDRE, Centavos>;
  lucroAntesIR: Centavos;
  lucroLiquido: Centavos;
  fluxo: Record<ClasseFluxo, Centavos>;
  balanco: Balanco;
}

export interface Balanco {
  caixa: Centavos;
  estoques: Centavos;
  imobilizadoLiquido: Centavos;
  obrasEmAndamento: Centavos;
  ativoTotal: Centavos;
  creditoEmergencial: Centavos;
  passivoTotal: Centavos;
  capitalSocial: Centavos;
  lucrosAcumulados: Centavos;
  patrimonioLiquido: Centavos;
}

export interface EstadoContabil {
  capitalSocial: Centavos;
  /** Lucro acumulado desde o início (DRE), inclusive o mês corrente. */
  lucrosAcumulados: Centavos;
  prejuizoFiscalAcumulado: Centavos;
  mesAtual: AcumuladoMes;
  ultimoFechamento: FechamentoMensal | null;
  /** Meses consecutivos terminados com crédito emergencial em aberto. */
  mesesComCreditoEmergencial: number;
}

export interface EstadoEmpresa {
  id: string;
  nome: string;
  mercado: string;
  tipo: "equipe" | "robo";
  caixa: Centavos;
  creditoEmergencial: Centavos;
  /** Uma oferta por produto de varejo do preset, na ordem do preset. */
  ofertas: EstadoOferta[];
  pontosDeVenda: EstadoAtivo[];
  fabricas: EstadoFabrica[];
  contabil: EstadoContabil;
  /** Pontos de penalidade acumulados (princípio 7). */
  penalidadePontuacao: number;
  /** Robô: estratégia, intensidade sorteada e gerador próprio. */
  robo: EstadoRobo | null;
  /** Próximo número sequencial para ids de ativos (pdv_01, fab_01, ...). */
  proximoAtivo: number;
}

export interface EstadoRobo {
  estrategia: string;
  intensidade: Record<string, number>;
  gerador: Gerador;
}

export interface EstadoPartida {
  versaoEstado: number;
  versaoMotor: string;
  semente: string;
  /** Ticks já processados (0 = partida criada, nenhum tick). */
  tick: number;
  modulos: ModuloId[];
  parametros: ParametrosResolvidos;
  mercados: EstadoMercado[];
  empresas: EstadoEmpresa[];
  /** Decisões dos robôs geradas no fim do tick anterior, aplicadas no início do próximo. */
  decisoesPendentes: Decisao[];
}

// ---------------------------------------------------------------------------------------------
// Entradas de um tick
// ---------------------------------------------------------------------------------------------

export type Decisao =
  | {
      tipo: "produto";
      empresa: string;
      produto: string;
      preco?: Centavos | null;
      compraMensal?: number;
      producaoMensal?: number;
      publicidadeMensal?: Centavos;
      pdMensal?: Centavos;
    }
  | { tipo: "construirFabrica"; empresa: string; produto: string }
  | { tipo: "abrirPontoDeVenda"; empresa: string; quantidade: number }
  | { tipo: "fecharPontoDeVenda"; empresa: string; quantidade: number };

/** Evento do cenário: altera um parâmetro numérico (seção 6.15, passo 1). */
export interface EventoAlterarParametro {
  tipo: "alterarParametro";
  /**
   * Caminho a partir do estado, com segmentos separados por ponto. Em listas, o segmento é o id do
   * elemento. Raízes aceitas: `parametros` e `mercados`.
   * Ex.: `mercados.mer_01.fatorCiclo`, `parametros.produtos.leite.fornecedor.preco`.
   */
  caminho: string;
  valor: number;
  /** Texto exibido aos alunos. */
  descricao?: string;
}

export interface EntradasTick {
  decisoes?: readonly Decisao[];
  eventos?: readonly EventoAlterarParametro[];
}

// ---------------------------------------------------------------------------------------------
// Resultado de um tick
// ---------------------------------------------------------------------------------------------

export type Aviso =
  | { tipo: "evento"; descricao: string }
  | { tipo: "ponto_de_venda_aberto"; empresa: string; quantidade: number }
  | { tipo: "fabrica_concluida"; empresa: string; produto: string }
  | { tipo: "ruptura_de_estoque"; empresa: string; produto: string }
  | { tipo: "caixa_negativo"; empresa: string }
  | { tipo: "fim_de_mes"; mes: number };

export interface Rejeicao {
  decisao: Decisao | EventoAlterarParametro;
  motivo: string;
}

export interface Lancamento {
  empresa: string;
  /** Variação de caixa, com sinal. */
  valor: Centavos;
  classe: ClasseFluxo;
  descricao: string;
  /** Contraparte (princípio 5): `fornecedor_externo`, `consumidores`, `mercado:<id>`, ... */
  origem: string;
  destino: string;
  produto?: string;
}

export interface HistoricoOferta {
  empresa: string;
  mercado: string;
  produto: string;
  ativa: boolean;
  preco: Centavos | null;
  nota: number;
  participacao: number;
  demanda: number;
  vendas: number;
  receita: Centavos;
  estoqueFinal: number;
  qualidade: number;
  reconhecimento: number;
  fidelidade: number;
  marca: number;
  tecnologia: number;
}

export interface HistoricoTick {
  tick: number;
  mes: number;
  dia: number;
  ofertas: HistoricoOferta[];
  /** Demanda total por mercado e produto (antes da alocação). */
  demandaTotal: { mercado: string; produto: string; demanda: number; precoMedio: number }[];
}

export interface ResultadoTick {
  estado: EstadoPartida;
  avisos: Aviso[];
  rejeicoes: Rejeicao[];
  lancamentos: Lancamento[];
  historico: HistoricoTick;
  /** Fechamentos mensais produzidos neste tick (último dia do mês), por empresa. */
  fechamentos: { empresa: string; fechamento: FechamentoMensal }[];
}
