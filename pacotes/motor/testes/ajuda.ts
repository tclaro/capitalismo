/**
 * Utilitários dos testes do motor: montagem de partidas e verificação de invariantes.
 */
import { expect } from "bun:test";
import { PRESET_TESTE } from "@simulador/catalogo";
import {
  balanco,
  type ConfigPartida,
  criarPartida,
  DIAS_DA_SERIE_DE_ESTOQUE,
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
 * - caixa final − caixa inicial = soma dos lançamentos da empresa (exato); caixa nunca negativo;
 * - ativo = passivo + patrimônio líquido (exato);
 * - dinheiro em centavos inteiros; nenhum número inválido no estado;
 * - estoques (de varejo e de matéria-prima) não negativos; qualidade, reconhecimento e fidelidade dentro dos limites;
 * - camada 3: matérias-primas em ordem alfabética, séries de estoque limitadas, fazendas com depreciação coerente,
 *   atacado com soma zero entre as empresas;
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
    // O crédito emergencial cobre qualquer déficit: nenhum tick termina com caixa negativo.
    expect({ empresa: e.id, tick: estado.tick, caixaNegativo: e.caixa < 0 }).toEqual({ empresa: e.id, tick: estado.tick, caixaNegativo: false });
    expect(e.creditoEmergencial).toBeGreaterThanOrEqual(0);

    const b = balanco(e, estado.tick);
    expect({ empresa: e.id, tick: estado.tick, ativo: b.ativoTotal }).toEqual({
      empresa: e.id,
      tick: estado.tick,
      ativo: b.passivoTotal + b.patrimonioLiquido,
    });

    // Camada 3: estoques de matéria-prima e fazendas.
    expect(Object.keys(e.materiasPrimas)).toEqual(Object.keys(e.materiasPrimas).sort());
    for (const [produto, m] of Object.entries(e.materiasPrimas)) {
      const onde = { empresa: e.id, produto };
      expect({ ...onde, ok: m.estoque.quantidade >= 0 }).toEqual({ ...onde, ok: true });
      expect({ ...onde, ok: Number.isInteger(m.estoque.valor) && m.estoque.valor >= 0 }).toEqual({ ...onde, ok: true });
      expect({ ...onde, ok: m.estoque.qualidade >= 0 && m.estoque.qualidade <= 100 + 1e-9 }).toEqual({ ...onde, ok: true });
      expect({ ...onde, ok: Number.isInteger(m.diasCheio) && m.diasCheio >= 0 }).toEqual({ ...onde, ok: true });
      expect({ ...onde, ok: m.serie.length <= DIAS_DA_SERIE_DE_ESTOQUE && m.serie.every((x) => x >= 0 && x <= 1) }).toEqual({ ...onde, ok: true });
      if (m.pedidoAtacado) expect({ ...onde, ok: typeof m.pedidoAtacado.vendedor === "string" && m.pedidoAtacado.quantidadeMensal > 0 }).toEqual({ ...onde, ok: true });
      if (m.ofertaAtacado) expect({ ...onde, ok: Number.isInteger(m.ofertaAtacado.preco) && m.ofertaAtacado.preco > 0 && m.ofertaAtacado.quantidadeMensal >= 0 }).toEqual({ ...onde, ok: true });
    }
    for (const fz of e.fazendas) {
      const onde = { empresa: e.id, fazenda: fz.id };
      expect({ ...onde, ok: Number.isInteger(fz.custo) && fz.custo >= 0 }).toEqual({ ...onde, ok: true });
      expect({ ...onde, ok: fz.depreciacaoAcumulada >= 0 && fz.depreciacaoAcumulada <= fz.custo }).toEqual({ ...onde, ok: true });
      expect({ ...onde, ok: fz.experiencia >= 0 && fz.producaoMensal >= 0 }).toEqual({ ...onde, ok: true });
      expect({ ...onde, ok: estado.parametros.cadeia?.atividades.some((a) => a.id === fz.atividade) === true }).toEqual({ ...onde, ok: true });
    }

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

  // Atacado: o que as empresas pagam e o que recebem soma zero em cada tick.
  let atacado = 0;
  for (const l of resultado.lancamentos) if (l.descricao === "compra no atacado" || l.descricao === "venda no atacado") atacado += l.valor;
  expect({ tick: estado.tick, atacado }).toEqual({ tick: estado.tick, atacado: 0 });

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
