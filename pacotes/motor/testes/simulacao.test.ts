import { describe, expect, test } from "bun:test";
import { PRESET_INTRODUTORIO } from "@simulador/catalogo";
import { criarPartida, ESTRATEGIAS_DO_CONFRONTO, passoMutavel, ranking, simularPartida } from "../src";

const ROBOS = ESTRATEGIAS_DO_CONFRONTO.map((estrategia) => ({ estrategia }));

describe("simularPartida", () => {
  const r = simularPartida({ preset: PRESET_INTRODUTORIO, semente: "sim", robos: ROBOS, meses: 6 });

  test("roda o horizonte pedido e resume todas as empresas", () => {
    expect(r.ticks).toBe(180);
    expect(r.empresas.map((e) => e.estrategia)).toEqual([...ESTRATEGIAS_DO_CONFRONTO]);
    expect(r.empresas.map((e) => e.posicao).sort()).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  test("o resumo bate com rodar a partida tick a tick", () => {
    let e = criarPartida({ preset: PRESET_INTRODUTORIO, semente: "sim", empresas: ESTRATEGIAS_DO_CONFRONTO.map((x) => ({ nome: x, robo: { estrategia: x } })) });
    for (let t = 1; t <= 180; t++) e = passoMutavel(e).estado;
    const rk = ranking(e, "mer_01");
    expect(r.mercados).toEqual([{ id: "mer_01", vencedor: rk[0]!.empresa, estrategiaVencedora: e.empresas.find((x) => x.id === rk[0]!.empresa)!.robo!.estrategia }]);
    for (const resumo of r.empresas) {
      const x = e.empresas.find((y) => y.id === resumo.id)!;
      expect([resumo.lucroAcumulado, resumo.receitaAcumulada, resumo.creditoFinal]).toEqual([x.contabil.lucrosAcumulados, x.contabil.receitaAcumulada, x.creditoEmergencial]);
    }
  });

  test("participações na receita somam 1; fotografia do mês 4 presente", () => {
    expect(r.empresas.reduce((s, e) => s + e.participacaoReceita, 0)).toBeCloseTo(1, 12);
    expect(r.empresas.reduce((s, e) => s + e.fotografias[4]!.participacaoReceita, 0)).toBeCloseTo(1, 12);
  });

  test("a maior sequência de meses com crédito não passa do total de meses com crédito", () => {
    for (const e of r.empresas) expect(e.maiorSequenciaDeMesesComCredito).toBeLessThanOrEqual(e.mesesComCredito);
  });

  test("determinística pela semente; sementes diferentes dão partidas diferentes", () => {
    expect(simularPartida({ preset: PRESET_INTRODUTORIO, semente: "sim", robos: ROBOS, meses: 6 })).toEqual(r);
    expect(simularPartida({ preset: PRESET_INTRODUTORIO, semente: "outra", robos: ROBOS, meses: 6 }).empresas.map((e) => e.lucroAcumulado)).not.toEqual(
      r.empresas.map((e) => e.lucroAcumulado),
    );
  });

  test("mercados paralelos com o mesmo conjunto de robôs e um vencedor por mercado", () => {
    const p = simularPartida({ preset: PRESET_INTRODUTORIO, semente: "par", robos: ROBOS.slice(0, 3), meses: 2, mercados: 2 });
    expect(p.mercados.map((m) => m.id)).toEqual(["mer_01", "mer_02"]);
    expect(p.empresas.map((e) => [e.mercado, e.estrategia])).toEqual([
      ["mer_01", "preco_baixo"],
      ["mer_01", "premium"],
      ["mer_01", "marca"],
      ["mer_02", "preco_baixo"],
      ["mer_02", "premium"],
      ["mer_02", "marca"],
    ]);
  });

  test("estratégia repetida recebe nome com sufixo; intensidade informada é usada", () => {
    const p = simularPartida({ preset: PRESET_INTRODUTORIO, semente: "rep", robos: [{ estrategia: "revenda" }, { estrategia: "revenda", intensidade: { ajuste: 0.01 } }], meses: 1 });
    expect(p.empresas.map((e) => e.nome)).toEqual(["revenda", "revenda_2"]);
    expect(p.empresas[1]!.intensidade.ajuste).toBe(0.01);
  });

  test("rejeita configuração inválida", () => {
    expect(() => simularPartida({ preset: PRESET_INTRODUTORIO, semente: "x", robos: ROBOS, meses: 0 })).toThrow(RangeError);
    expect(() => simularPartida({ preset: PRESET_INTRODUTORIO, semente: "x", robos: [], meses: 1 })).toThrow(RangeError);
    expect(() => simularPartida({ preset: PRESET_INTRODUTORIO, semente: "x", robos: [{ estrategia: "nenhuma" }], meses: 1 })).toThrow(RangeError);
  });
});

describe("desempenho (seção 13)", () => {
  test("2 mercados × 8 empresas × 5 produtos: tick muito abaixo da meta de 300 ms", () => {
    const robos = [...ESTRATEGIAS_DO_CONFRONTO, "equilibrada"].map((estrategia) => ({ nome: estrategia, robo: { estrategia } }));
    let e = criarPartida({
      preset: PRESET_INTRODUTORIO,
      semente: "desempenho",
      mercados: [{ nome: "M1" }, { nome: "M2" }],
      empresas: [...robos.map((x) => ({ ...x, mercado: 0 })), ...robos.map((x) => ({ ...x, mercado: 1 }))],
    });
    for (let t = 1; t <= 30; t++) e = passoMutavel(e).estado; // aquecimento
    const inicio = performance.now();
    const ticks = 90;
    for (let t = 1; t <= ticks; t++) e = passoMutavel(e).estado;
    const msPorTick = (performance.now() - inicio) / ticks;
    // Meta do documento: < 300 ms. Exigimos 30 ms (10× de folga) para detectar regressões grandes.
    expect(msPorTick).toBeLessThan(30);
  });
});
