/**
 * Razão contábil simplificado (seção 6.12).
 *
 * Duas operações cobrem todos os fatos do jogo:
 * - `movimentarCaixa`: entrada ou saída de dinheiro, com classe do fluxo de caixa e contraparte;
 * - `reconhecerResultado`: receita ou despesa na DRE (competência), que muda o lucro acumulado.
 *
 * Todo fato combina essas duas com variações de ativos e passivos (estoque, imobilizado, crédito),
 * de forma que `ativo = passivo + patrimônio líquido` vale com igualdade exata em centavos.
 */
import type { Centavos } from "./dinheiro";
import type {
  AcumuladoMes,
  Balanco,
  ClasseFluxo,
  ContaDRE,
  EstadoAtivo,
  EstadoEmpresa,
  Lancamento,
} from "./tipos";

/** Ordem fixa das contas: também é a ordem de exibição na DRE. */
export const CONTAS_DRE: readonly ContaDRE[] = [
  "receita",
  "cpv",
  "publicidade",
  "pd",
  "custo_fixo_fabrica",
  "custo_fixo_ponto_de_venda",
  "armazenagem",
  "depreciacao",
  "baixa_de_ativos",
  "juros",
  "ir",
];

export const CLASSES_FLUXO: readonly ClasseFluxo[] = ["operacional", "investimento", "financiamento"];

export function novoAcumuladoMes(): AcumuladoMes {
  const dre = {} as Record<ContaDRE, Centavos>;
  for (const c of CONTAS_DRE) dre[c] = 0;
  const fluxo = {} as Record<ClasseFluxo, Centavos>;
  for (const c of CLASSES_FLUXO) fluxo[c] = 0;
  return { dre, fluxo };
}

function exigirCentavos(valor: number, onde: string): void {
  if (!Number.isInteger(valor)) throw new RangeError(`${onde}: valor deve ser centavos inteiros (recebido ${valor})`);
}

/** Movimenta o caixa (valor com sinal) e registra o lançamento. */
export function movimentarCaixa(
  empresa: EstadoEmpresa,
  lancamentos: Lancamento[],
  valor: Centavos,
  classe: ClasseFluxo,
  descricao: string,
  origem: string,
  destino: string,
  produto?: string,
): void {
  exigirCentavos(valor, `movimentarCaixa(${descricao})`);
  if (valor === 0) return;
  empresa.caixa += valor;
  empresa.contabil.mesAtual.fluxo[classe] += valor;
  const l: Lancamento = { empresa: empresa.id, valor, classe, descricao, origem, destino };
  if (produto !== undefined) l.produto = produto;
  lancamentos.push(l);
}

/** Reconhece receita (conta `receita`) ou despesa (demais contas) na DRE. `valor` é sempre ≥ 0. */
export function reconhecerResultado(empresa: EstadoEmpresa, conta: ContaDRE, valor: Centavos): void {
  exigirCentavos(valor, `reconhecerResultado(${conta})`);
  if (valor < 0) throw new RangeError(`reconhecerResultado(${conta}): valor negativo (${valor})`);
  if (valor === 0) return;
  empresa.contabil.mesAtual.dre[conta] += valor;
  empresa.contabil.lucrosAcumulados += conta === "receita" ? valor : -valor;
}

/** Lucro antes do IR de um acumulado (receita − demais contas, exceto IR). */
export function lucroAntesIR(dre: Record<ContaDRE, Centavos>): Centavos {
  let lucro = 0;
  for (const c of CONTAS_DRE) {
    if (c === "ir") continue;
    lucro += c === "receita" ? dre[c] : -dre[c];
  }
  return lucro;
}

function valorLiquido(a: EstadoAtivo): Centavos {
  return a.custo - a.depreciacaoAcumulada;
}

/** Balanço patrimonial da empresa no tick informado (ativo em operação × obra em andamento). */
export function balanco(empresa: EstadoEmpresa, tick: number): Balanco {
  let estoques = 0;
  for (const o of empresa.ofertas) estoques += o.estoque.valor;
  let imobilizadoLiquido = 0;
  let obrasEmAndamento = 0;
  for (const a of [...empresa.pontosDeVenda, ...empresa.fabricas]) {
    if (a.operaDesdeTick <= tick) imobilizadoLiquido += valorLiquido(a);
    else obrasEmAndamento += a.custo;
  }
  const ativoTotal = empresa.caixa + estoques + imobilizadoLiquido + obrasEmAndamento;
  const passivoTotal = empresa.creditoEmergencial;
  const patrimonioLiquido = empresa.contabil.capitalSocial + empresa.contabil.lucrosAcumulados;
  return {
    caixa: empresa.caixa,
    estoques,
    imobilizadoLiquido,
    obrasEmAndamento,
    ativoTotal,
    creditoEmergencial: empresa.creditoEmergencial,
    passivoTotal,
    capitalSocial: empresa.contabil.capitalSocial,
    lucrosAcumulados: empresa.contabil.lucrosAcumulados,
    patrimonioLiquido,
  };
}
