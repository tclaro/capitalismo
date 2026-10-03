/**
 * Variações do preset da cadeia para a varredura de calibração (fase 1b, entrega 9). São dados simples
 * (passam entre workers) e valem só para a simulação: o preset do catálogo não é alterado.
 */
import type { AtividadeDeFazenda, Preset, ValorVariavel } from "@simulador/motor";

export interface AjustesDeAtividade {
  /** Custo variável por unidade-base, em reais (mantém a variação por semente do original). */
  custoVariavel?: number;
  /** Capex, em reais. */
  capex?: number;
  /** Custo fixo mensal, em reais. */
  custoFixo?: number;
  capacidadePorDia?: number;
  qualidadeBase?: number;
}

export interface AjustesDaCadeia {
  fatorPiso?: number;
  /** Ajustes por id de atividade; `"*"` vale para todas as que não têm ajuste próprio. */
  atividades?: Record<string, AjustesDeAtividade>;
  ganhoQualidadePorMes?: number;
  qualidadeMaxima?: number;
  /** Preço do fornecedor externo por matéria-prima, em reais (mantém a variação por semente). */
  precoFornecedor?: Record<string, number>;
}

const reais = (x: number) => Math.round(x * 100);

function trocaValor(original: ValorVariavel, novo: number): ValorVariavel {
  return typeof original === "number" ? novo : { valor: novo, variacao: original.variacao };
}

export function aplicarAjustes(preset: Preset, ajustes: AjustesDaCadeia | undefined): Preset {
  if (!ajustes || !preset.cadeia) return preset;
  const c = preset.cadeia;
  const atividades = c.atividades.map((a): AtividadeDeFazenda => {
    const x = ajustes.atividades?.[a.id] ?? ajustes.atividades?.["*"];
    if (!x) return a;
    return {
      ...a,
      ...(x.custoVariavel !== undefined ? { custoVariavelPorUnidade: trocaValor(a.custoVariavelPorUnidade, reais(x.custoVariavel)) } : {}),
      ...(x.capex !== undefined ? { capex: reais(x.capex) } : {}),
      ...(x.custoFixo !== undefined ? { custoFixoMensal: reais(x.custoFixo) } : {}),
      ...(x.capacidadePorDia !== undefined ? { capacidadeUnidadesPorDia: x.capacidadePorDia } : {}),
      ...(x.qualidadeBase !== undefined ? { qualidadeBase: trocaValor(a.qualidadeBase, x.qualidadeBase) } : {}),
    };
  });
  const produtos = ajustes.precoFornecedor
    ? preset.produtos.map((p) => {
        const novo = ajustes.precoFornecedor![p.id];
        if (novo === undefined || !p.fornecedor) return p;
        return { ...p, fornecedor: { ...p.fornecedor, preco: trocaValor(p.fornecedor.preco, reais(novo)) } };
      })
    : preset.produtos;
  return {
    ...preset,
    produtos,
    cadeia: {
      ...c,
      atividades,
      experiencia: { ganhoQualidadePorMes: ajustes.ganhoQualidadePorMes ?? c.experiencia.ganhoQualidadePorMes, qualidadeMaxima: ajustes.qualidadeMaxima ?? c.experiencia.qualidadeMaxima },
      cooperativa: { fatorPiso: ajustes.fatorPiso ?? c.cooperativa.fatorPiso },
    },
  };
}
