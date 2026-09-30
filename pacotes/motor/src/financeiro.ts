/**
 * Crédito emergencial, depreciação, imposto de renda e fechamento mensal (seção 6.12; passos 11 e 12
 * da seção 6.15).
 *
 * Ordem no tick, depois de todos os outros lançamentos:
 * 1. Juros diários sobre o saldo do crédito emergencial vindo do tick anterior (capitalizados no saldo).
 * 2. Se for o último dia do mês: depreciação e IR (pago em caixa), antes de fechar a DRE.
 * 3. Crédito emergencial: saca o déficit se o caixa ficou negativo; senão, amortiza com o caixa disponível.
 * 4. Se for o último dia do mês: DRE, fluxo de caixa e balanço fechados; acumuladores do mês zerados.
 */
import { balanco, lucroAntesIR, movimentarCaixa, novoAcumuladoMes, reconhecerResultado } from "./contabilidade";
import type { Contexto } from "./contexto";
import { type Centavos, arredondarCentavos } from "./dinheiro";
import { jurosMensalParaTick } from "./formulas/tempo";
import type { EstadoAtivo, FechamentoMensal } from "./tipos";

const BANCO = "banco_credito_emergencial";

/** Passo 11 (parte): juros do dia sobre o crédito emergencial em aberto. */
export function etapaJurosEmergenciais(ctx: Contexto): void {
  const taxa = jurosMensalParaTick(ctx.estado.parametros.financeiro.jurosEmergencialMensal, ctx.ticksPorMes);
  for (const empresa of ctx.estado.empresas) {
    if (empresa.creditoEmergencial <= 0) continue;
    const juros = arredondarCentavos(empresa.creditoEmergencial * taxa);
    if (juros <= 0) continue;
    empresa.creditoEmergencial += juros;
    reconhecerResultado(empresa, "juros", juros);
  }
}

/** Quota mensal de depreciação linear; a última quota leva o que falta para zerar o valor contábil. */
export function quotaDeDepreciacao(ativo: EstadoAtivo): Centavos {
  const restante = ativo.custo - ativo.depreciacaoAcumulada;
  if (restante <= 0) return 0;
  return Math.min(restante, arredondarCentavos(ativo.custo / ativo.vidaUtilMeses));
}

export interface CalculoIR {
  ir: Centavos;
  compensado: Centavos;
  prejuizoFiscalFinal: Centavos;
}

/**
 * IR do mês com compensação de prejuízo fiscal (decidido em 29/09/2026):
 * - lucro antes do IR ≤ 0: sem imposto; o prejuízo soma ao prejuízo fiscal acumulado;
 * - lucro > 0: abate o prejuízo acumulado, limitado a `trava × lucro`; imposto = alíquota × base.
 */
export function calcularIR(lucroAntesDoIR: Centavos, prejuizoFiscal: Centavos, aliquota: number, trava: number): CalculoIR {
  if (lucroAntesDoIR <= 0) return { ir: 0, compensado: 0, prejuizoFiscalFinal: prejuizoFiscal - lucroAntesDoIR };
  const compensado = Math.min(prejuizoFiscal, Math.floor(trava * lucroAntesDoIR));
  const base = lucroAntesDoIR - compensado;
  return { ir: arredondarCentavos(base * aliquota), compensado, prejuizoFiscalFinal: prejuizoFiscal - compensado };
}

/** Passo 12 (parte): depreciação e IR do mês, no último dia, antes do crédito emergencial. */
export function etapaDepreciacaoEIR(ctx: Contexto): void {
  if (!ctx.fimDoMes) return;
  const f = ctx.estado.parametros.financeiro;
  for (const empresa of ctx.estado.empresas) {
    for (const ativo of [...empresa.pontosDeVenda, ...empresa.fabricas]) {
      if (ativo.operaDesdeTick > ctx.tick) continue;
      const quota = quotaDeDepreciacao(ativo);
      if (quota <= 0) continue;
      ativo.depreciacaoAcumulada += quota;
      reconhecerResultado(empresa, "depreciacao", quota);
    }
    const calculo = calcularIR(lucroAntesIR(empresa.contabil.mesAtual.dre), empresa.contabil.prejuizoFiscalAcumulado, f.aliquotaIR, f.travaCompensacaoPrejuizo);
    empresa.contabil.prejuizoFiscalAcumulado = calculo.prejuizoFiscalFinal;
    if (calculo.ir > 0) {
      reconhecerResultado(empresa, "ir", calculo.ir);
      movimentarCaixa(empresa, ctx.lancamentos, -calculo.ir, "operacional", "imposto de renda", empresa.id, "fisco");
    }
  }
}

/** Passo 11 (parte): saque ou amortização do crédito emergencial (sem limite; princípio 7). */
export function etapaCreditoEmergencial(ctx: Contexto): void {
  for (const empresa of ctx.estado.empresas) {
    if (empresa.caixa < 0) {
      const saque = -empresa.caixa;
      const estavaEmDia = empresa.creditoEmergencial === 0;
      empresa.creditoEmergencial += saque;
      movimentarCaixa(empresa, ctx.lancamentos, saque, "financiamento", "saque de crédito emergencial", BANCO, empresa.id);
      if (estavaEmDia) ctx.avisos.push({ tipo: "caixa_negativo", empresa: empresa.id });
    } else if (empresa.caixa > 0 && empresa.creditoEmergencial > 0) {
      const amortizacao = Math.min(empresa.caixa, empresa.creditoEmergencial);
      empresa.creditoEmergencial -= amortizacao;
      movimentarCaixa(empresa, ctx.lancamentos, -amortizacao, "financiamento", "amortização de crédito emergencial", empresa.id, BANCO);
    }
  }
}

/** Passo 12 (parte): demonstrações do mês e abertura do mês seguinte. */
export function etapaFechamentoMensal(ctx: Contexto): void {
  if (!ctx.fimDoMes) return;
  const f = ctx.estado.parametros.financeiro;
  for (const empresa of ctx.estado.empresas) {
    const c = empresa.contabil;
    const dre = { ...c.mesAtual.dre };
    const lair = lucroAntesIR(dre);
    const fechamento: FechamentoMensal = {
      mes: ctx.mes,
      dre,
      lucroAntesIR: lair,
      lucroLiquido: lair - dre.ir,
      fluxo: { ...c.mesAtual.fluxo },
      balanco: balanco(empresa, ctx.tick),
    };
    c.ultimoFechamento = fechamento;
    c.mesAtual = novoAcumuladoMes();
    if (empresa.creditoEmergencial > 0) {
      c.mesesComCreditoEmergencial += 1;
      empresa.penalidadePontuacao += f.penalidadeFalenciaMensal;
    } else {
      c.mesesComCreditoEmergencial = 0;
    }
    ctx.fechamentos.push({ empresa: empresa.id, fechamento });
  }
}
