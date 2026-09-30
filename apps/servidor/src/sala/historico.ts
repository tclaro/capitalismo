/**
 * Histórico semanal por oferta para os gráficos (seção 9.7): soma vendas, demanda e receita dos ticks
 * da semana e guarda o último valor de preço, nota, participação, marca, qualidade e estoque. O
 * `HistoricoTick` de cada tick não é gravado (seriam ~18 MB por partida).
 *
 * O acumulador é JSON puro: o servidor o grava junto com o tick, para sobreviver a reinícios.
 */
import { dataDoTick, ehFronteiraDeSemana } from "@simulador/compartilhado";
import type { HistoricoTick } from "@simulador/motor";

export interface RegistroSemanal {
  /** Semana global da partida (1 = primeira semana do mês 1; 4 semanas por mês). */
  semana: number;
  mes: number;
  empresa: string;
  mercado: string;
  produto: string;
  vendas: number;
  demanda: number;
  receita: number;
  preco: number | null;
  nota: number;
  participacao: number;
  marca: number;
  qualidade: number;
  estoqueFinal: number;
}

export interface AcumuladorSemanal {
  /** Chave `empresa|produto` → registro parcial da semana em curso. */
  parciais: Record<string, RegistroSemanal>;
}

export function novoAcumulador(): AcumuladorSemanal {
  return { parciais: {} };
}

/** Soma um tick ao acumulador; se o tick fecha a semana, devolve os registros da semana e zera. */
export function acumularTick(acumulador: AcumuladorSemanal, historico: HistoricoTick, ticksPorMes: number): RegistroSemanal[] | null {
  const { mes, semana } = dataDoTick(historico.tick, ticksPorMes);
  const semanaGlobal = (mes - 1) * 4 + semana;
  for (const h of historico.ofertas) {
    const chave = `${h.empresa}|${h.produto}`;
    const r = (acumulador.parciais[chave] ??= {
      semana: semanaGlobal,
      mes,
      empresa: h.empresa,
      mercado: h.mercado,
      produto: h.produto,
      vendas: 0,
      demanda: 0,
      receita: 0,
      preco: null,
      nota: 0,
      participacao: 0,
      marca: 0,
      qualidade: 0,
      estoqueFinal: 0,
    });
    r.vendas += h.vendas;
    r.demanda += h.demanda;
    r.receita += h.receita;
    r.preco = h.preco;
    r.nota = h.nota;
    r.participacao = h.participacao;
    r.marca = h.marca;
    r.qualidade = h.qualidade;
    r.estoqueFinal = h.estoqueFinal;
  }
  if (!ehFronteiraDeSemana(historico.tick, ticksPorMes)) return null;
  const registros = Object.keys(acumulador.parciais)
    .sort()
    .map((k) => acumulador.parciais[k]!);
  acumulador.parciais = {};
  return registros;
}
