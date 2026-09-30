/**
 * Utilitários dos testes do motor: montagem de partidas e verificação de invariantes.
 */
import { expect } from "bun:test";
import { PRESET_TESTE } from "@simulador/catalogo";
import {
  balanco,
  type ConfigPartida,
  criarPartida,
  type Decisao,
  type EntradasTick,
  type EstadoEmpresa,
  type EstadoOferta,
  type EstadoPartida,
  type Preset,
  passoMutavel,
  type ResultadoTick,
} from "../src";

export { PRESET_TESTE };

export function partidaDeTeste(
  nomes: readonly string[] = ["Alfa"],
  extra: Partial<Omit<ConfigPartida, "empresas">> & { preset?: Preset } = {},
): EstadoPartida {
  return criarPartida({
    preset: extra.preset ?? PRESET_TESTE,
    semente: extra.semente ?? "teste",
    empresas: nomes.map((nome) => ({ nome })),
    ...(extra.mercados ? { mercados: extra.mercados } : {}),
  });
}

export function empresa(estado: EstadoPartida, id: string): EstadoEmpresa {
  const e = estado.empresas.find((x) => x.id === id);
  if (!e) throw new Error(`empresa ${id} não existe`);
  return e;
}

export function oferta(estado: EstadoPartida, empresaId: string, produto: string): EstadoOferta {
  const o = empresa(estado, empresaId).ofertas.find((x) => x.produto === produto);
  if (!o) throw new Error(`oferta ${empresaId}/${produto} não existe`);
  return o;
}

/** Decisão de produto (atalho). */
export function decidir(empresaId: string, produto: string, campos: Omit<Extract<Decisao, { tipo: "produto" }>, "tipo" | "empresa" | "produto">): Decisao {
  return { tipo: "produto", empresa: empresaId, produto, ...campos };
}

/** Evento que altera um parâmetro (atalho). */
export function alterar(caminho: string, valor: number): NonNullable<EntradasTick["eventos"]>[number] {
  return { tipo: "alterarParametro", caminho, valor };
}

/** Procura números não finitos (NaN, ±Infinity) e −0 em qualquer lugar de um valor. */
export function numerosInvalidos(valor: unknown, caminho = "$"): string[] {
  if (typeof valor === "number") {
    if (!Number.isFinite(valor)) return [`${caminho} = ${valor}`];
    if (Object.is(valor, -0)) return [`${caminho} = -0`];
    return [];
  }
  if (Array.isArray(valor)) return valor.flatMap((v, i) => numerosInvalidos(v, `${caminho}[${i}]`));
  if (valor !== null && typeof valor === "object") {
    return Object.entries(valor).flatMap(([k, v]) => numerosInvalidos(v, `${caminho}.${k}`));
  }
  return [];
}

/**
 * Verifica, depois de um tick, os invariantes que valem sempre:
 * - caixa final − caixa inicial = soma dos lançamentos da empresa (exato);
 * - ativo = passivo + patrimônio líquido (exato);
 * - dinheiro em centavos inteiros; nenhum número inválido no estado;
 * - estoques não negativos; qualidade, reconhecimento e fidelidade dentro dos limites;
 * - participações das ofertas ativas somam 1 por (mercado, produto).
 */
export function verificarInvariantes(anterior: EstadoPartida, resultado: ResultadoTick): void {
  const { estado } = resultado;
  expect(numerosInvalidos(estado)).toEqual([]);
  expect(estado.tick).toBe(anterior.tick + 1);

  for (const e of estado.empresas) {
    const antes = anterior.empresas.find((x) => x.id === e.id)!;
    let soma = 0;
    for (const l of resultado.lancamentos) if (l.empresa === e.id) soma += l.valor;
    expect({ empresa: e.id, variacao: e.caixa - antes.caixa }).toEqual({ empresa: e.id, variacao: soma });
    expect(Number.isInteger(e.caixa)).toBe(true);

    const b = balanco(e, estado.tick);
    expect({ empresa: e.id, tick: estado.tick, ativo: b.ativoTotal }).toEqual({
      empresa: e.id,
      tick: estado.tick,
      ativo: b.passivoTotal + b.patrimonioLiquido,
    });

    for (const o of e.ofertas) {
      expect(o.estoque.quantidade).toBeGreaterThanOrEqual(0);
      expect(o.estoque.valor).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(o.estoque.valor)).toBe(true);
      expect(o.estoque.qualidade).toBeGreaterThanOrEqual(0);
      expect(o.estoque.qualidade).toBeLessThanOrEqual(100 + 1e-9);
      expect(o.reconhecimento).toBeGreaterThanOrEqual(0);
      expect(o.reconhecimento).toBeLessThanOrEqual(100);
      expect(o.fidelidade).toBeGreaterThanOrEqual(estado.parametros.marca.fidelidadeMinima);
      expect(o.fidelidade).toBeLessThanOrEqual(100);
    }
  }

  const somas = new Map<string, { soma: number; ativas: number }>();
  for (const h of resultado.historico.ofertas) {
    if (!h.ativa) continue;
    const k = `${h.mercado}|${h.produto}`;
    const s = somas.get(k) ?? { soma: 0, ativas: 0 };
    s.soma += h.participacao;
    s.ativas++;
    somas.set(k, s);
  }
  for (const [k, s] of somas) expect({ k, soma: Math.round(s.soma * 1e9) / 1e9 }).toEqual({ k, soma: 1 });
}

/** Roda `ticks` ticks verificando invariantes; `entradas(t)` fornece as entradas do tick t (1-based). */
export function rodar(
  estado: EstadoPartida,
  ticks: number,
  entradas: (tick: number, estado: EstadoPartida) => EntradasTick = () => ({}),
  verificar = true,
): { estado: EstadoPartida; resultados: ResultadoTick[] } {
  const resultados: ResultadoTick[] = [];
  let atual = estado;
  for (let i = 0; i < ticks; i++) {
    const anterior = verificar ? (JSON.parse(JSON.stringify(atual)) as EstadoPartida) : atual;
    const r = passoMutavel(atual, entradas(atual.tick + 1, atual));
    if (verificar) verificarInvariantes(anterior, r);
    resultados.push(r);
    atual = r.estado;
  }
  return { estado: atual, resultados };
}
