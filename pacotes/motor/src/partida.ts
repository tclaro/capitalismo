/**
 * Criação da partida: resolve o preset, cria mercados e empresas no estado inicial.
 */
import { criarGerador } from "./aleatorio";
import { novoAcumuladoMes } from "./contabilidade";
import { estoqueVazio } from "./dinheiro";
import type { Preset } from "./preset";
import { resolverPreset } from "./resolucao";
import {
  type EstadoAtivo,
  type EstadoEmpresa,
  type EstadoMercado,
  type EstadoOferta,
  type EstadoPartida,
  type ModuloId,
  type ParametrosResolvidos,
  VERSAO_ESTADO,
} from "./tipos";
import { VERSAO_MOTOR } from "./versao";

export interface ConfigEmpresa {
  nome: string;
  /** Índice do mercado em `ConfigPartida.mercados` (padrão 0). */
  mercado?: number;
  /** Presente = empresa controlada por robô. */
  robo?: { estrategia: string; intensidade?: Record<string, number> };
}

export interface ConfigPartida {
  preset: Preset;
  semente: string;
  /** Mercados paralelos com os mesmos parâmetros (seção 2). Padrão: um mercado. */
  mercados?: readonly { nome: string }[];
  empresas: readonly ConfigEmpresa[];
  /** Módulos ativos além do núcleo (seção 5). Nesta versão, só o núcleo está implementado. */
  modulos?: readonly ModuloId[];
}

export const MODULOS_IMPLEMENTADOS: readonly ModuloId[] = ["nucleo"];

export class ConfigInvalida extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ConfigInvalida";
  }
}

/** Id sequencial com prefixo e ao menos 2 dígitos: `emp_01`, `emp_12`, `emp_123`. */
export function idSequencial(prefixo: string, numero: number): string {
  return `${prefixo}_${String(numero).padStart(2, "0")}`;
}

function novaOferta(produto: string, p: ParametrosResolvidos): EstadoOferta {
  return {
    produto,
    decisao: { preco: null, compraMensal: 0, producaoMensal: 0, publicidadeMensal: 0, pdMensal: 0 },
    estoque: estoqueVazio(),
    reconhecimento: p.marca.reconhecimentoInicial,
    fidelidade: p.marca.fidelidadeInicial,
    tecnologia: p.tecnologia.tecnologiaInicial,
    qualidadeReferencia: 0,
    demandaAnterior: 0,
    emRuptura: false,
  };
}

export function criarPartida(config: ConfigPartida): EstadoPartida {
  const modulos: ModuloId[] = ["nucleo"];
  for (const m of config.modulos ?? []) {
    if (!MODULOS_IMPLEMENTADOS.includes(m)) throw new ConfigInvalida(`módulo "${m}" ainda não implementado`);
    if (!modulos.includes(m)) modulos.push(m);
  }
  if (config.semente.length === 0) throw new ConfigInvalida("semente vazia");
  if (config.empresas.length === 0) throw new ConfigInvalida("a partida precisa de pelo menos uma empresa");

  const parametros = resolverPreset(config.preset, config.semente);
  const configMercados = config.mercados && config.mercados.length > 0 ? config.mercados : [{ nome: "Mercado 1" }];

  const mercados: EstadoMercado[] = configMercados.map((m, i) => ({
    id: idSequencial("mer", i + 1),
    nome: m.nome,
    populacao: parametros.populacao,
    fatorCiclo: parametros.fatorCicloInicial,
  }));

  const produtosVarejo = parametros.produtos.filter((p) => p.varejo !== null).map((p) => p.id);
  const pv = parametros.pontoDeVenda;

  const empresas: EstadoEmpresa[] = config.empresas.map((e, i) => {
    const id = idSequencial("emp", i + 1);
    const indiceMercado = e.mercado ?? 0;
    const mercado = mercados[indiceMercado];
    if (!mercado) throw new ConfigInvalida(`empresa "${e.nome}": mercado ${indiceMercado} não existe`);
    if (e.nome.trim().length === 0) throw new ConfigInvalida(`empresa ${i + 1}: nome vazio`);

    const pontosDeVenda: EstadoAtivo[] = Array.from({ length: pv.iniciais }, (_, k) => ({
      id: idSequencial("pdv", k + 1),
      custo: pv.custoAbertura,
      depreciacaoAcumulada: 0,
      operaDesdeTick: 0,
      vidaUtilMeses: pv.vidaUtilMeses,
    }));
    const capitalSocial = parametros.financeiro.caixaInicial + pv.iniciais * pv.custoAbertura;

    return {
      id,
      nome: e.nome,
      mercado: mercado.id,
      tipo: e.robo ? "robo" : "equipe",
      caixa: parametros.financeiro.caixaInicial,
      creditoEmergencial: 0,
      ofertas: produtosVarejo.map((p) => novaOferta(p, parametros)),
      pontosDeVenda,
      fabricas: [],
      contabil: {
        capitalSocial,
        lucrosAcumulados: 0,
        prejuizoFiscalAcumulado: 0,
        mesAtual: novoAcumuladoMes(),
        ultimoFechamento: null,
        mesesComCreditoEmergencial: 0,
      },
      penalidadePontuacao: 0,
      robo: e.robo
        ? { estrategia: e.robo.estrategia, intensidade: { ...(e.robo.intensidade ?? {}) }, gerador: criarGerador(config.semente, `robo:${id}`) }
        : null,
      proximoAtivo: pv.iniciais + 1,
    };
  });

  return {
    versaoEstado: VERSAO_ESTADO,
    versaoMotor: VERSAO_MOTOR,
    semente: config.semente,
    tick: 0,
    modulos,
    parametros,
    mercados,
    empresas,
    decisoesPendentes: [],
  };
}
