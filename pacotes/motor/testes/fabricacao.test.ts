/**
 * Fabricação, P&D e qualidade (entrega 4).
 *
 * Preset de teste — leite engarrafado: fábrica com capex R$ 300.000, prazo 30 dias, custo fixo
 * R$ 10.000/mês, capacidade 1.500 un/dia, mão de obra R$ 1,40/un. Receita do Apêndice B por
 * unidade: leite 2 qt / 8 = 0,2365882365 L (R$ 2,40/L, Q50) e vidro 1 lb / 8 = 0,05669904625 kg
 * (R$ 4,00/kg, Q60); pesos 65% / 5% / tecnologia 30%. Tecnologia inicial 10, piso de T_max 20,
 * até 5 pontos/mês com verba de referência R$ 20.000/mês.
 */
import { describe, expect, test } from "bun:test";
import fc from "fast-check";
import { KG_POR_LB, LITROS_POR_QUART } from "@simulador/catalogo";
import { type Decisao, type EstadoPartida, nivelDaFabrica, passoMutavel, validarPreset, visaoDaEmpresa } from "../src";
import { decidir, empresa, oferta, PRESET_TESTE, partidaDeTeste, rodar } from "./ajuda";

const LEITE = "leite_engarrafado";
const CARTEIRA = "carteira";
const LEITE_POR_UNIDADE = (2 * LITROS_POR_QUART) / 8;
const VIDRO_POR_UNIDADE = (1 * KG_POR_LB) / 8;
const construir = (id: string, produto = LEITE): Decisao => ({ tipo: "construirFabrica", empresa: id, produto });

/** Constrói a fábrica no tick 1 com a decisão dada e roda até o primeiro tick de operação (31). */
function comFabrica(campos: Parameters<typeof decidir>[2], nomes = ["Alfa"], preset = PRESET_TESTE) {
  return rodar(partidaDeTeste(nomes, { preset }), 31, (t) => (t === 1 ? { decisoes: [construir("emp_01"), decidir("emp_01", LEITE, campos)] } : {}));
}

describe("produção", () => {
  const { estado, resultados } = comFabrica({ producaoMensal: 30_000 });
  const tick31 = resultados[30]!;

  test("nada é produzido durante a obra (ticks 1–30)", () => {
    for (const r of resultados.slice(0, 30)) expect(r.lancamentos.some((l) => l.descricao === "compra de insumo")).toBe(false);
  });

  test("tick 31: 1.000 unidades; insumos pela receita do manual; mão de obra R$ 1.400,00", () => {
    const valores = tick31.lancamentos.filter((l) => l.descricao !== "custo fixo dos pontos de venda").map((l) => [l.descricao, l.produto, l.valor]);
    expect(valores).toEqual([
      ["compra de insumo", "leite", -Math.round(1000 * LEITE_POR_UNIDADE * 240)],
      ["compra de insumo", "vidro", -Math.round(1000 * VIDRO_POR_UNIDADE * 400)],
      ["mão de obra da produção", LEITE, -140_000],
      ["armazenagem", LEITE, -167], // 1.000 un × 5 centavos / 30 = 166,67
      ["custo fixo das fábricas", undefined, -33_333],
    ]);
    expect(valores.slice(0, 2).map((v) => v[2])).toEqual([-56_781, -22_680]);
  });

  test("lote no estoque: custo = insumos + mão de obra (R$ 2.194,61), qualidade 0,65×50 + 0,05×60 + 30×10/20 = 50,5", () => {
    expect(oferta(estado, "emp_01", LEITE).estoque).toEqual({ quantidade: 1000, valor: 56_781 + 22_680 + 140_000, qualidade: 50.5 });
  });

  test("insumos e mão de obra não passam pela DRE até a venda (vão para o CPV)", () => {
    const dre = empresa(estado, "emp_01").contabil.mesAtual.dre;
    expect([dre.cpv, dre.custo_fixo_fabrica]).toEqual([0, 33_333]);
  });

  test("custo fixo da fábrica só começa quando ela entra em operação", () => {
    expect(resultados.slice(0, 30).some((r) => r.lancamentos.some((l) => l.descricao === "custo fixo das fábricas"))).toBe(false);
  });

  test("a venda leva o custo de fabricação ao CPV", () => {
    const r = passoMutavel(JSON.parse(JSON.stringify(estado)) as EstadoPartida, { decisoes: [decidir("emp_01", LEITE, { preco: 600, producaoMensal: 0 })] });
    const vendas = r.historico.ofertas.find((h) => h.produto === LEITE)!.vendas;
    expect(vendas).toBeCloseTo(800, 9);
    expect(empresa(r.estado, "emp_01").contabil.mesAtual.dre.cpv).toBe(Math.round((219_461 * 800) / 1000));
  });
});

describe("capacidade e insumos escassos", () => {
  test("produção limitada pela capacidade da fábrica (1.500/dia)", () => {
    const { estado } = comFabrica({ producaoMensal: 90_000 });
    expect(oferta(estado, "emp_01", LEITE).estoque.quantidade).toBeCloseTo(1500, 9);
  });

  test("duas fábricas do mesmo produto somam capacidade", () => {
    const { estado } = rodar(partidaDeTeste(), 31, (t) =>
      t === 1 ? { decisoes: [construir("emp_01"), construir("emp_01"), decidir("emp_01", LEITE, { producaoMensal: 90_000 })] } : {},
    );
    expect(oferta(estado, "emp_01", LEITE).estoque.quantidade).toBeCloseTo(3000, 9);
  });

  const presetLeiteEscasso = {
    ...PRESET_TESTE,
    produtos: PRESET_TESTE.produtos.map((p) => (p.id === "leite" ? { ...p, fornecedor: { ...p.fornecedor!, ofertaMaxMensal: 3000 } } : p)),
  };

  test("insumo com limite mensal: 100 L/dia de leite produzem 100 / 0,23659 = 422,68 unidades", () => {
    const { estado } = comFabrica({ producaoMensal: 30_000 }, ["Alfa"], presetLeiteEscasso);
    expect(oferta(estado, "emp_01", LEITE).estoque.quantidade).toBeCloseTo(100 / LEITE_POR_UNIDADE, 9);
  });

  test("insumo escasso dividido proporcionalmente entre empresas do mercado", () => {
    const { estado } = rodar(partidaDeTeste(["A", "B"], { preset: presetLeiteEscasso }), 31, (t) =>
      t === 1
        ? {
            decisoes: [
              construir("emp_01"),
              construir("emp_02"),
              decidir("emp_01", LEITE, { producaoMensal: 30_000 }),
              decidir("emp_02", LEITE, { producaoMensal: 15_000 }),
            ],
          }
        : {},
    );
    const total = 100 / LEITE_POR_UNIDADE;
    expect(oferta(estado, "emp_01", LEITE).estoque.quantidade).toBeCloseTo((total * 2) / 3, 9);
    expect(oferta(estado, "emp_02", LEITE).estoque.quantidade).toBeCloseTo(total / 3, 9);
  });
});

describe("P&D e tecnologia", () => {
  test("um dia de P&D: T = 10 + (5/30) × (1 − e^(−20.000 / 66.666,67))", () => {
    const { estado, resultados } = rodar(partidaDeTeste(), 1, () => ({ decisoes: [decidir("emp_01", LEITE, { pdMensal: 600_000 })] }));
    expect(resultados[0]!.lancamentos.find((l) => l.descricao === "pesquisa e desenvolvimento")!.valor).toBe(-20_000);
    expect(oferta(estado, "emp_01", LEITE).tecnologia).toBeCloseTo(10 + (5 / 30) * (1 - Math.exp(-0.3)), 12);
    expect(empresa(estado, "emp_01").contabil.mesAtual.dre.pd).toBe(20_000);
  });

  test("P&D sem fábrica acumula tecnologia para quando ela ficar pronta", () => {
    const { estado } = rodar(partidaDeTeste(), 30, (t) => (t === 1 ? { decisoes: [decidir("emp_01", LEITE, { pdMensal: 2_000_000 })] } : {}));
    expect(empresa(estado, "emp_01").fabricas).toEqual([]);
    expect(oferta(estado, "emp_01", LEITE).tecnologia).toBeGreaterThan(12);
  });

  test("qualidade usa a tecnologia relativa à maior do mercado (acima do piso de 20)", () => {
    // A investe pesado em P&D desde o início; B não. Ambas constroem fábrica e produzem a partir do tick 91.
    const { estado } = rodar(partidaDeTeste(["A", "B"]), 91, (t) => {
      if (t === 1) return { decisoes: [decidir("emp_01", LEITE, { pdMensal: 100_000_000 })] };
      if (t === 61) return { decisoes: [construir("emp_01"), construir("emp_02"), decidir("emp_01", LEITE, { producaoMensal: 3000 }), decidir("emp_02", LEITE, { producaoMensal: 3000 })] };
      return {};
    });
    const ta = oferta(estado, "emp_01", LEITE).tecnologia;
    const tb = oferta(estado, "emp_02", LEITE).tecnologia;
    expect(ta).toBeGreaterThan(20);
    expect(tb).toBe(10);
    // Lotes produzidos no tick 91 (um dia de produção = 100 un). Qualidade dos insumos: 0,65×50 + 0,05×60 = 35,5.
    expect(oferta(estado, "emp_01", LEITE).estoque.qualidade).toBeCloseTo(35.5 + 30 * 1, 9);
    expect(oferta(estado, "emp_02", LEITE).estoque.qualidade).toBeCloseTo(35.5 + 30 * (tb / ta), 9);
  });
});

describe("curva de aprendizado da fábrica", () => {
  // 3 níveis: experiência (meses à capacidade nominal) 0 / 1 / 3; capacidade 50% / 80% / 100%;
  // mão de obra 150% / 120% / 100%. Leite engarrafado: 1.500 un/dia nominais, mão de obra R$ 1,40.
  const presetAprendizado = { ...PRESET_TESTE, aprendizado: { limitesMeses: [0, 1, 3], capacidade: [0.5, 0.8, 1], maoDeObra: [1.5, 1.2, 1] } };
  const correr = (ticks: number, producaoMensal = 30_000) =>
    rodar(partidaDeTeste(["Alfa"], { preset: presetAprendizado }), ticks, (t) => (t === 1 ? { decisoes: [construir("emp_01"), decidir("emp_01", LEITE, { producaoMensal })] } : {}));

  test("fábrica nova (nível 0): metade da capacidade e mão de obra 1,5×", () => {
    const { estado, resultados } = correr(31);
    expect(oferta(estado, "emp_01", LEITE).estoque.quantidade).toBeCloseTo(750, 9);
    expect(resultados[30]!.lancamentos.find((l) => l.descricao === "mão de obra da produção")!.valor).toBe(-(750 * 140 * 1.5));
    expect(empresa(estado, "emp_01").fabricas[0]!.experiencia).toBeCloseTo(750 / (1500 * 30), 12);
  });

  test("sobe de nível após 1 mês equivalente (45.000 un = 60 dias a 750/dia): capacidade 1.200, mão de obra 1,2×", () => {
    const { estado, resultados } = correr(91);
    const tick91 = resultados[90]!;
    expect(empresa(estado, "emp_01").fabricas[0]!.experiencia).toBeCloseTo(1 + 1000 / 45_000, 9);
    expect(tick91.lancamentos.find((l) => l.descricao === "mão de obra da produção")!.valor).toBe(-(1000 * 140 * 1.2));
    // No tick 90 ainda era nível 0 (750 un a 1,5×).
    expect(resultados[89]!.lancamentos.find((l) => l.descricao === "mão de obra da produção")!.valor).toBe(-(750 * 140 * 1.5));
  });

  test("nível pelo limiar, com tolerância ao ruído de ponto flutuante na soma da experiência", () => {
    const fabrica = (experiencia: number) => ({ id: "f", produto: LEITE, custo: 0, depreciacaoAcumulada: 0, operaDesdeTick: 0, vidaUtilMeses: 1, experiencia });
    const a = presetAprendizado.aprendizado;
    expect([0, 0.5, 0.9999999999999998, 1, 2.9, 3, 50].map((x) => nivelDaFabrica(fabrica(x), a))).toEqual([0, 0, 1, 1, 1, 2, 2]);
  });

  test("a experiência cresce com o volume produzido, não com o tempo: fábrica parada não aprende", () => {
    const { estado } = correr(90, 0);
    expect(empresa(estado, "emp_01").fabricas[0]!.experiencia).toBe(0);
  });

  test("duas fábricas em níveis diferentes: produção dividida pela capacidade, mão de obra pelo nível de cada uma", () => {
    // Fábrica 1 desde o tick 1 (opera no 31); fábrica 2 construída no tick 61 (opera no 91).
    const { estado, resultados } = rodar(partidaDeTeste(["Alfa"], { preset: presetAprendizado }), 91, (t) => {
      if (t === 1) return { decisoes: [construir("emp_01"), decidir("emp_01", LEITE, { producaoMensal: 90_000 })] };
      if (t === 61) return { decisoes: [construir("emp_01")] };
      return {};
    });
    // Tick 91: fábrica 1 no nível 1 (1.200/dia), fábrica 2 no nível 0 (750/dia); pedido 3.000/dia > 1.950.
    const [f1, f2] = empresa(estado, "emp_01").fabricas;
    expect(resultados[90]!.lancamentos.find((l) => l.descricao === "mão de obra da produção")!.valor).toBe(-(1200 * 140 * 1.2 + 750 * 140 * 1.5));
    expect(f2!.experiencia).toBeCloseTo(750 / 45_000, 12);
    expect(f1!.experiencia).toBeGreaterThan(1);
  });

  test("a visão mostra o multiplicador atual de mão de obra e a curva do jogo", () => {
    const { estado } = correr(31);
    const v = visaoDaEmpresa(estado, "emp_01");
    expect(v.empresa.ofertas.find((o) => o.produto === LEITE)!.multiplicadorMaoDeObra).toBe(1.5);
    expect(v.custos.aprendizado).toEqual(presetAprendizado.aprendizado);
  });

  test("preset inválido: níveis de tamanhos diferentes, limite inicial ≠ 0, limites não crescentes", () => {
    const erros = (aprendizado: object) => validarPreset({ ...PRESET_TESTE, aprendizado } as typeof PRESET_TESTE);
    expect(erros({ limitesMeses: [0, 1], capacidade: [1], maoDeObra: [1, 1] }).join()).toContain("mesmo número de níveis");
    expect(erros({ limitesMeses: [1], capacidade: [1], maoDeObra: [1] }).join()).toContain("começa em 0");
    expect(erros({ limitesMeses: [0, 2, 2], capacidade: [1, 1, 1], maoDeObra: [1, 1, 1] }).join()).toContain("crescente");
    expect(erros({ limitesMeses: [0], capacidade: [0], maoDeObra: [1] }).join()).toContain("capacidade[0]");
  });

  test("invariantes com a curva de aprendizado e decisões aleatórias (propriedade)", () => {
    const decisao = fc.oneof(
      fc.record({
        tipo: fc.constant("produto" as const),
        empresa: fc.constantFrom("emp_01", "emp_02"),
        produto: fc.constantFrom(LEITE, CARTEIRA),
        preco: fc.option(fc.integer({ min: 1, max: 1200 }), { nil: null }),
        producaoMensal: fc.double({ min: 0, max: 80_000, noNaN: true }),
      }),
      fc.record({ tipo: fc.constant("construirFabrica" as const), empresa: fc.constantFrom("emp_01", "emp_02"), produto: fc.constantFrom(LEITE, CARTEIRA) }),
    );
    fc.assert(
      fc.property(fc.array(fc.array(decisao, { maxLength: 3 }), { minLength: 90, maxLength: 90 }), (porTick) => {
        rodar(partidaDeTeste(["A", "B"], { preset: presetAprendizado }), 90, (t) => ({ decisoes: porTick[t - 1] as Decisao[] }));
        return true;
      }),
      { numRuns: 10 },
    );
  });
});

describe("difusão tecnológica", () => {
  const comDifusao = (difusao: number) => ({ ...PRESET_TESTE, tecnologia: { ...PRESET_TESTE.tecnologia, difusaoTecnologicaMensal: difusao } });

  test("sem difusão, quem não investe fica parado; com difusão, fecha a fração mensal da distância até a líder", () => {
    // A investe (tecnologia sobe); B não investe. Com difusão de 50%/mês, depois de 30 ticks B fechou
    // (quase) metade da distância média — o valor exato depende da trajetória de A, então comparamos com a fórmula por tick.
    const rodarCom = (d: number) =>
      rodar(partidaDeTeste(["A", "B"], { preset: comDifusao(d) }), 30, (t) => (t === 1 ? { decisoes: [decidir("emp_01", LEITE, { pdMensal: 100_000_000 })] } : {})).estado;
    const sem = rodarCom(0);
    expect(oferta(sem, "emp_02", LEITE).tecnologia).toBe(10);
    const com = rodarCom(0.5);
    const ta = oferta(com, "emp_01", LEITE).tecnologia;
    const tb = oferta(com, "emp_02", LEITE).tecnologia;
    expect(ta).toBeCloseTo(oferta(sem, "emp_01", LEITE).tecnologia, 12); // a líder não é afetada
    expect(tb).toBeGreaterThan(10);
    expect(tb).toBeLessThan(ta);
  });

  test("um tick de difusão: T_B' = T_B + d_tick × (T_max − T_B)", () => {
    const e = partidaDeTeste(["A", "B"], { preset: comDifusao(0.3) });
    e.empresas[0]!.ofertas[0]!.tecnologia = 40; // líder artificial (ajuste de estado só para o teste)
    const { estado } = rodar(e, 1, () => ({}), false);
    const d = 1 - 0.7 ** (1 / 30);
    expect(oferta(estado, "emp_02", LEITE).tecnologia).toBeCloseTo(10 + d * 30, 12);
    expect(oferta(estado, "emp_01", LEITE).tecnologia).toBe(40);
  });

  test("difusão não depende da ordem das empresas", () => {
    const final = (nomes: string[]) => {
      const e = partidaDeTeste(nomes, { preset: comDifusao(0.2) });
      const verba: Record<string, number> = { Alfa: 50_000_000, Beta: 1_000_000, Gama: 2_000_000 };
      const decisoes = e.empresas.map((x) => decidir(x.id, LEITE, { pdMensal: verba[x.nome]! }));
      const { estado } = rodar(e, 45, (t) => (t === 1 ? { decisoes } : {}), false);
      return Object.fromEntries(estado.empresas.map((x) => [x.nome, x.ofertas[0]!.tecnologia]));
    };
    const a = final(["Alfa", "Beta", "Gama"]);
    const b = final(["Gama", "Alfa", "Beta"]);
    for (const nome of ["Alfa", "Beta", "Gama"]) expect(b[nome]!).toBeCloseTo(a[nome]!, 12);
  });
});

describe("comprar pronto e fabricar ao mesmo tempo", () => {
  test("estoque mistura os lotes: custo e qualidade médios ponderados", () => {
    const { estado } = comFabrica({ producaoMensal: 30_000, compraMensal: 30_000 });
    // Tick 31: 1.000 prontas (Q50, R$ 4.500,00) + 1.000 fabricadas (Q50,5, R$ 2.194,61), mais o estoque comprado nos ticks 1–30.
    const o = oferta(estado, "emp_01", LEITE);
    expect(o.estoque.quantidade).toBeCloseTo(31 * 1000 + 1000, 6);
    expect(o.estoque.valor).toBe(31 * 450_000 + 219_461);
    expect(o.estoque.qualidade).toBeCloseTo((31_000 * 50 + 1000 * 50.5) / 32_000, 12);
  });
});

describe("independência da ordem e invariantes com fabricação", () => {
  test("produção com insumo escasso não depende da ordem das empresas", () => {
    const preset = {
      ...PRESET_TESTE,
      produtos: PRESET_TESTE.produtos.map((p) => (p.id === "couro" ? { ...p, fornecedor: { ...p.fornecedor!, ofertaMaxMensal: 60 } } : p)),
    };
    const porNome: Record<string, number> = { Alfa: 900, Beta: 300, Gama: 600 };
    const resultado = (nomes: string[]) => {
      const e = partidaDeTeste(nomes, { preset });
      const decisoes = e.empresas.flatMap((x) => [construir(x.id, CARTEIRA), decidir(x.id, CARTEIRA, { producaoMensal: porNome[x.nome]!, pdMensal: porNome[x.nome]! * 100 })]);
      const { estado } = rodar(e, 40, (t) => (t === 1 ? { decisoes } : {}), false);
      return Object.fromEntries(estado.empresas.map((x) => [x.nome, x.ofertas.find((o) => o.produto === CARTEIRA)!.estoque]));
    };
    const direto = resultado(["Alfa", "Beta", "Gama"]);
    const inverso = resultado(["Gama", "Alfa", "Beta"]);
    for (const nome of Object.keys(porNome)) {
      expect(inverso[nome]!.quantidade).toBeCloseTo(direto[nome]!.quantidade, 9);
      expect(inverso[nome]!.valor).toBe(direto[nome]!.valor);
      expect(inverso[nome]!.qualidade).toBeCloseTo(direto[nome]!.qualidade, 12);
    }
  });

  test("propriedade: invariantes valem com fábricas, produção e P&D aleatórios", () => {
    const empresaId = fc.constantFrom("emp_01", "emp_02");
    const produto = fc.constantFrom(LEITE, CARTEIRA);
    const decisao = fc.oneof(
      fc.record({
        tipo: fc.constant("produto" as const),
        empresa: empresaId,
        produto,
        preco: fc.option(fc.integer({ min: 1, max: 1200 }), { nil: null }),
        compraMensal: fc.double({ min: 0, max: 50_000, noNaN: true }),
        producaoMensal: fc.double({ min: 0, max: 80_000, noNaN: true }),
        pdMensal: fc.integer({ min: 0, max: 10_000_000 }),
      }),
      fc.record({ tipo: fc.constant("construirFabrica" as const), empresa: empresaId, produto }),
    );
    fc.assert(
      fc.property(fc.array(fc.array(decisao, { maxLength: 3 }), { minLength: 70, maxLength: 70 }), (porTick) => {
        rodar(partidaDeTeste(["A", "B"]), 70, (t) => ({ decisoes: porTick[t - 1] as Decisao[] }));
        return true;
      }),
      { numRuns: 15 },
    );
  });
});
