import { describe, expect, test } from "bun:test";
import { PRESET_CADEIA_MINIMA } from "@simulador/catalogo";
import fc from "fast-check";
import { criarPartida, type Decisao, type EstadoFazenda, type EstadoPartida, passo, type ResultadoTick, validarDecisao } from "../src";
import { empresa, rodar } from "./ajuda";

/**
 * Valores fixos para calcular à mão: carne R$ 20,00/kg e couro R$ 10,00/kg no fornecedor (piso da
 * cooperativa 60%: R$ 12,00 e R$ 6,00); conversão custa R$ 400,00 e leva 10 dias; descarte R$ 0,50/unidade.
 */
function partida(nomes: readonly string[] = ["Alfa", "Beta"], mercados?: number[]): EstadoPartida {
  const estado = criarPartida({
    preset: PRESET_CADEIA_MINIMA,
    semente: "troca",
    empresas: nomes.map((nome, i) => ({ nome, ...(mercados ? { mercado: mercados[i]! } : {}) })),
    ...(mercados ? { mercados: [{ nome: "M1" }, { nome: "M2" }] } : {}),
    modulos: ["cadeia_produtiva"],
  });
  const preco = (id: string, centavos: number) => {
    estado.parametros.produtos.find((p) => p.id === id)!.fornecedor!.preco = centavos;
  };
  preco("carne_bovina_congelada", 2000);
  preco("couro", 1000);
  const c = estado.parametros.cadeia!;
  c.cooperativa.fatorPiso = 0.6;
  c.conversao = { custo: 40_000, prazoDias: 10 };
  c.descarte.custoPorUnidade = 50;
  for (const a of c.atividades) {
    a.diasDeArmazenagem = 1000;
    a.prazoConstrucaoDias = 30;
  }
  return estado;
}

/** Fazenda de gado de corte já em operação, com o caixa descontado do capex (o balanço continua fechando). */
function comFazenda(estado: EstadoPartida, id: string, campos: Partial<EstadoFazenda> = {}): EstadoFazenda {
  const e = empresa(estado, id);
  const f: EstadoFazenda = { id: `faz_0${e.fazendas.length + 3}`, custo: 350_000, depreciacaoAcumulada: 0, operaDesdeTick: 0, vidaUtilMeses: 120, atividade: "gado_de_corte", experiencia: 5, conversaoAteTick: null, producaoMensal: 3000, ...campos };
  e.caixa -= f.custo;
  e.fazendas.push(f);
  return f;
}

function estocar(estado: EstadoPartida, id: string, produto: string, quantidade: number, valor: number, qualidade: number): void {
  const e = empresa(estado, id);
  Object.assign(e.materiasPrimas[produto]!.estoque, { quantidade, valor, qualidade });
  e.caixa -= valor;
}

/** Alfa com uma fazenda de gado de corte e estoque de 100 kg de carne (R$ 1.600,00) e 50 kg de couro (R$ 200,00). */
function alfaComGado(nomes: readonly string[] = ["Alfa", "Beta"]): EstadoPartida {
  const estado = partida(nomes);
  comFazenda(estado, "emp_01");
  estocar(estado, "emp_01", "carne_bovina_congelada", 100, 160_000, 60);
  estocar(estado, "emp_01", "couro", 50, 20_000, 60);
  return estado;
}

/** Roda ticks com o `passo` puro: cada resultado guarda o seu próprio estado (`rodar` reaproveita o mesmo objeto). */
function passos(estado: EstadoPartida, ticks: number, entradas: (tick: number) => { decisoes: Decisao[] } = () => ({ decisoes: [] })): ResultadoTick[] {
  const resultados: ResultadoTick[] = [];
  let atual = estado;
  for (let i = 0; i < ticks; i++) {
    const r = passo(atual, entradas(atual.tick + 1));
    resultados.push(r);
    atual = r.estado;
  }
  return resultados;
}

const trocar = (desova: "cooperativa" | "atacado" | "destruir", extra: { fatorPrecoAtacado?: number; atividade?: string; fazenda?: string } = {}): Decisao =>
  ({ tipo: "trocarAtividade", empresa: "emp_01", fazenda: extra.fazenda ?? "faz_03", atividade: extra.atividade ?? "morango", desova, ...(extra.fatorPrecoAtacado === undefined ? {} : { fatorPrecoAtacado: extra.fatorPrecoAtacado }) }) as Decisao;
const pedir = (comprador: string, produto: string, quantidadeMensal: number): Decisao => ({ tipo: "comprarNoAtacado", empresa: comprador, produto, vendedor: "emp_01", quantidadeMensal });
const mp = (estado: EstadoPartida, id: string, produto: string) => empresa(estado, id).materiasPrimas[produto]!;
const lanc = (r: ResultadoTick, descricao: string, id = "emp_01") => r.lancamentos.filter((l) => l.descricao === descricao && l.empresa === id);
const dre = (estado: EstadoPartida, id = "emp_01") => empresa(estado, id).contabil.mesAtual.dre;

describe("a troca em si", () => {
  test("cobra a conversão, zera experiência e produção, e a fazenda não produz até o prazo (e avisa quando volta)", () => {
    const estado = alfaComGado();
    const r1 = passo(estado, { decisoes: [trocar("destruir"), { tipo: "ajustarFazenda", empresa: "emp_01", fazenda: "faz_03", producaoMensal: 3000 }] });
    expect(r1.rejeicoes).toEqual([]);
    const f = empresa(r1.estado, "emp_01").fazendas[0]!;
    expect(f).toMatchObject({ atividade: "morango", experiencia: 0, producaoMensal: 3000, conversaoAteTick: 10 }); // decidida no tick 1: volta a produzir no tick 11
    expect(lanc(r1, "conversão de fazenda")).toEqual([{ empresa: "emp_01", valor: -40_000, classe: "operacional", descricao: "conversão de fazenda", origem: "emp_01", destino: "prestadores" }]);
    // O custo da conversão vai à DRE junto do custo fixo do dia da atividade nova.
    const fixoMorango = r1.estado.parametros.cadeia!.atividades.find((a) => a.id === "morango")!.custoFixoMensal;
    expect(dre(r1.estado).custo_fixo_fazenda).toBe(40_000 + Math.floor(fixoMorango / 30));

    const resultados = passos(r1.estado, 10);
    const morango = (i: number) => mp(resultados[i]!.estado, "emp_01", "morango").estoque.quantidade;
    // Os ticks 2 a 10 (índices 0 a 8) ainda são de conversão; no 11 (índice 9) volta.
    for (let i = 0; i < 9; i++) expect(morango(i)).toBe(0);
    expect(resultados.map((r) => r.avisos.filter((a) => a.tipo === "conversao_concluida").length)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 1]);
    expect(resultados[9]!.avisos).toContainEqual({ tipo: "conversao_concluida", empresa: "emp_01", atividade: "morango" });
    expect(empresa(resultados[9]!.estado, "emp_01").fazendas[0]!.conversaoAteTick).toBeNull();
  });

  test("a produção volta no tick calculado, com a experiência recomeçando do zero", () => {
    const estado = alfaComGado();
    const inicial = passo(estado, { decisoes: [trocar("destruir")] }).estado; // tick 1
    const resultados = passos(inicial, 12, (t) => ({ decisoes: t === 2 ? [{ tipo: "ajustarFazenda", empresa: "emp_01", fazenda: "faz_03", producaoMensal: 3000 }] : [] }));
    const quantidade = (i: number) => mp(resultados[i]!.estado, "emp_01", "morango").estoque.quantidade;
    expect(quantidade(8)).toBe(0); // tick 10
    expect(quantidade(9)).toBeGreaterThan(0); // tick 11
    expect(empresa(resultados[11]!.estado, "emp_01").fazendas[0]!.experiencia).toBeGreaterThan(0);
  });

  test("com prazo zero a fazenda produz no mesmo tick", () => {
    const estado = alfaComGado();
    estado.parametros.cadeia!.conversao.prazoDias = 0;
    const r = passo(estado, { decisoes: [trocar("destruir"), { tipo: "ajustarFazenda", empresa: "emp_01", fazenda: "faz_03", producaoMensal: 3000 }] });
    expect(mp(r.estado, "emp_01", "morango").estoque.quantidade).toBeGreaterThan(0);
    expect(r.avisos).toContainEqual({ tipo: "conversao_concluida", empresa: "emp_01", atividade: "morango" });
  });

  test("só o estoque que fica sem produtor sai: se outra fazenda ainda produz o produto, ele fica", () => {
    const estado = alfaComGado();
    comFazenda(estado, "emp_01"); // segunda fazenda de gado de corte (faz_04)
    const r = passo(estado, { decisoes: [trocar("destruir")] });
    expect(lanc(r, "descarte de estoque")).toEqual([]);
    expect(mp(r.estado, "emp_01", "carne_bovina_congelada").estoque.quantidade).toBeGreaterThan(0);
    expect(dre(r.estado).perda_de_estoque).toBe(0);
    // Trocando a segunda também, agora sim o estoque não tem mais produtor e sai.
    const r2 = passo(r.estado, { decisoes: [trocar("destruir", { fazenda: "faz_04" })] });
    expect(mp(r2.estado, "emp_01", "carne_bovina_congelada").estoque.quantidade).toBe(0);
    expect(dre(r2.estado).perda_de_estoque).toBeGreaterThan(0);
  });
});

describe("as três vias de desova", () => {
  test("destruir: perda na DRE (valor do estoque mais o descarte) e o descarte em caixa, sem receita (calculado à mão)", () => {
    const estado = alfaComGado();
    const r = passo(estado, { decisoes: [trocar("destruir")] });
    // Descarte: 100 kg × R$ 0,50 = R$ 50,00 e 50 kg × R$ 0,50 = R$ 25,00. Perda: 160.000 + 5.000 e 20.000 + 2.500.
    expect(lanc(r, "descarte de estoque").map((l) => [l.produto, l.valor])).toEqual([["carne_bovina_congelada", -5_000], ["couro", -2_500]]);
    expect(dre(r.estado).perda_de_estoque).toBe(187_500);
    expect(dre(r.estado).receita).toBe(0);
    expect(mp(r.estado, "emp_01", "carne_bovina_congelada").estoque).toEqual({ quantidade: 0, valor: 0, qualidade: 0 });
    expect(mp(r.estado, "emp_01", "couro").estoque).toEqual({ quantidade: 0, valor: 0, qualidade: 0 });
  });

  test("cooperativa: vende tudo ao piso (R$ 12,00 e R$ 6,00), com receita, CPV e prejuízo (calculado à mão)", () => {
    const estado = alfaComGado();
    const r = passo(estado, { decisoes: [trocar("cooperativa")] });
    expect(lanc(r, "venda à cooperativa").map((l) => [l.produto, l.valor, l.origem])).toEqual([["carne_bovina_congelada", 120_000, "cooperativa"], ["couro", 30_000, "cooperativa"]]);
    expect(dre(r.estado).receita).toBe(150_000);
    expect(dre(r.estado).cpv).toBe(180_000);
    expect(dre(r.estado).perda_de_estoque).toBe(0);
    expect(mp(r.estado, "emp_01", "carne_bovina_congelada").estoque.quantidade).toBe(0);
    expect(mp(r.estado, "emp_01", "couro").estoque.quantidade).toBe(0);
  });

  test("atacado: lote único a 80% do preço do fornecedor aos pedidos vigentes; o que ninguém pede fica no estoque", () => {
    const estado = alfaComGado(["Alfa", "Beta", "Gama"]);
    // Beta quer 200 kg de carne e 20 kg de couro (por mês); Gama quer 100 kg de carne (por mês).
    const decisoes = [pedir("emp_02", "carne_bovina_congelada", 200), pedir("emp_02", "couro", 20), pedir("emp_03", "carne_bovina_congelada", 100), trocar("atacado", { fatorPrecoAtacado: 0.8 })];
    const r = passo(estado, { decisoes });
    expect(r.rejeicoes).toEqual([]);
    // Carne: 100 kg para 300 pedidos → 2/3 e 1/3, a R$ 16,00. Couro: Beta leva os 20 kg pedidos, a R$ 8,00; sobram 30 kg.
    expect(mp(r.estado, "emp_02", "carne_bovina_congelada").estoque.quantidade).toBeCloseTo(200 / 3, 9);
    expect(mp(r.estado, "emp_03", "carne_bovina_congelada").estoque.quantidade).toBeCloseTo(100 / 3, 9);
    expect(mp(r.estado, "emp_01", "carne_bovina_congelada").estoque.quantidade).toBeLessThan(1e-9);
    expect(mp(r.estado, "emp_02", "couro").estoque).toEqual({ quantidade: 20, valor: 16_000, qualidade: 60 });
    expect(mp(r.estado, "emp_01", "couro").estoque).toEqual({ quantidade: 30, valor: 12_000, qualidade: 60 });
    // Receita do lote: carne 160.000 (100 kg × R$ 16,00); couro 16.000. CPV: 160.000 e 8.000.
    const vendas = lanc(r, "venda no atacado");
    expect(vendas.filter((l) => l.produto === "carne_bovina_congelada").reduce((s, l) => s + l.valor, 0)).toBe(160_000);
    expect(dre(r.estado).receita).toBe(176_000);
    expect(dre(r.estado).cpv).toBe(168_000);
  });

  test("atacado sem nenhum pedido vigente: nada é vendido e o estoque fica", () => {
    const estado = alfaComGado();
    const r = passo(estado, { decisoes: [trocar("atacado", { fatorPrecoAtacado: 0.8 })] });
    expect(lanc(r, "venda no atacado")).toEqual([]);
    expect(mp(r.estado, "emp_01", "carne_bovina_congelada").estoque.quantidade).toBe(100);
  });

  test("o lote sai antes da oferta do dia, e o estoque que sobra não é vendido duas vezes", () => {
    const estado = alfaComGado();
    // Oferta regular de 100 kg por dia de carne a R$ 15,00 e pedido de 3.000 kg/mês (100/dia); lote de 100 kg a R$ 16,00.
    const decisoes = [{ tipo: "ofertarNoAtacado", empresa: "emp_01", produto: "carne_bovina_congelada", preco: 1500, quantidadeMensal: 3000 } as Decisao, pedir("emp_02", "carne_bovina_congelada", 3000), trocar("atacado", { fatorPrecoAtacado: 0.8 })];
    const r = passo(estado, { decisoes });
    // O lote leva todos os 100 kg (o pedido mensal é 3.000); não sobra nada para a oferta do dia.
    expect(mp(r.estado, "emp_02", "carne_bovina_congelada").estoque.quantidade).toBe(100);
    expect(mp(r.estado, "emp_01", "carne_bovina_congelada").estoque.quantidade).toBe(0);
    expect(lanc(r, "venda no atacado", "emp_01").map((l) => l.valor)).toEqual([160_000]);
  });

  test("o que sobra do lote é dividido na proporção entre os compradores da oferta do dia, sem favorecer o primeiro", () => {
    const estado = alfaComGado(["Alfa", "Gama", "Delta"]);
    const oferta = { tipo: "ofertarNoAtacado", empresa: "emp_01", produto: "carne_bovina_congelada", preco: 1500, quantidadeMensal: 3000 } as Decisao; // até 100 kg por dia
    // Cada um pede 49 kg por mês: o lote entrega 49 + 49 e sobram 2 kg, contra um pedido do dia de 2 × 49/30 ≈ 3,27 kg.
    const r = passo(estado, { decisoes: [oferta, pedir("emp_02", "carne_bovina_congelada", 49), pedir("emp_03", "carne_bovina_congelada", 49), trocar("atacado", { fatorPrecoAtacado: 0.8 })] });
    expect(mp(r.estado, "emp_02", "carne_bovina_congelada").estoque.quantidade).toBeCloseTo(50, 9);
    expect(mp(r.estado, "emp_03", "carne_bovina_congelada").estoque.quantidade).toBeCloseTo(50, 9);
    expect(mp(r.estado, "emp_01", "carne_bovina_congelada").estoque.quantidade).toBeLessThan(1e-9);
  });

  test("a ordem para a cooperativa e o lote de atacado dividem o mesmo estoque sem vender mais do que existe", () => {
    const estado = alfaComGado();
    const r = passo(estado, { decisoes: [pedir("emp_02", "carne_bovina_congelada", 1000), { tipo: "venderParaCooperativa", empresa: "emp_01", produto: "carne_bovina_congelada", quantidade: 60 }, trocar("atacado", { fatorPrecoAtacado: 0.8 })] });
    expect(mp(r.estado, "emp_01", "carne_bovina_congelada").estoque.quantidade).toBeLessThan(1e-9);
    expect(mp(r.estado, "emp_02", "carne_bovina_congelada").estoque.quantidade).toBeCloseTo(40, 9); // 100 − 60 da cooperativa
  });
});

describe("validação", () => {
  const estado = alfaComGado();
  const motivo = (d: Decisao, e: EstadoPartida = estado) => validarDecisao(e, d);

  test("aceita uma troca válida e rejeita as inválidas com o motivo", () => {
    expect(motivo(trocar("destruir"))).toBeNull();
    expect(motivo(trocar("cooperativa"))).toBeNull();
    expect(motivo(trocar("atacado", { fatorPrecoAtacado: 0.6 }))).toBeNull();
    expect(motivo(trocar("atacado", { fatorPrecoAtacado: 1 }))).toBeNull();
    expect(motivo(trocar("destruir", { fazenda: "faz_99" }))).toContain("não tem a fazenda");
    expect(motivo(trocar("destruir", { atividade: "plantacao_de_ouro" }))).toContain("não existe");
    expect(motivo(trocar("destruir", { atividade: "gado_de_corte" }))).toContain("já é desta atividade");
    expect(motivo(trocar("atacado"))).toContain("fator de preço");
    expect(motivo(trocar("atacado", { fatorPrecoAtacado: 0.59 }))).toContain("fator de preço");
    expect(motivo(trocar("atacado", { fatorPrecoAtacado: 1.01 }))).toContain("fator de preço");
    expect(motivo(trocar("atacado", { fatorPrecoAtacado: Number.NaN }))).toContain("fator de preço");
    expect(motivo({ ...trocar("destruir"), desova: "doar" } as unknown as Decisao)).toContain("desconhecida");
  });

  test("fazenda em obra ou já em conversão não pode trocar de atividade; outra empresa não troca a fazenda alheia", () => {
    const e = alfaComGado();
    comFazenda(e, "emp_01", { operaDesdeTick: 50 }); // faz_04 em obra
    expect(motivo(trocar("destruir", { fazenda: "faz_04" }), e)).toContain("em obra");
    const r = passo(e, { decisoes: [trocar("destruir")] });
    expect(motivo(trocar("destruir", { atividade: "frango" }), r.estado)).toContain("já está em conversão");
    expect(motivo({ ...trocar("destruir"), empresa: "emp_02" } as Decisao, e)).toContain("não tem a fazenda");
    const rejeitada = passo(r.estado, { decisoes: [trocar("destruir", { atividade: "frango" })] });
    expect(rejeitada.rejeicoes).toHaveLength(1);
  });

  test("com o módulo desligado, rejeita", () => {
    const desligado = criarPartida({ preset: PRESET_CADEIA_MINIMA, semente: "x", empresas: [{ nome: "A" }] });
    expect(motivo(trocar("destruir"), desligado)).toContain("não está ativa");
  });
});

describe("propriedades", () => {
  const aleatoria = fc.oneof(
    fc.record({
      tipo: fc.constant("trocarAtividade" as const),
      empresa: fc.constantFrom("emp_01", "emp_02", "emp_03"),
      fazenda: fc.constantFrom("faz_03", "faz_04"),
      atividade: fc.constantFrom("gado_de_corte", "gado_leiteiro", "frango", "morango"),
      desova: fc.constantFrom("cooperativa" as const, "destruir" as const),
    }),
    fc.record({
      tipo: fc.constant("trocarAtividade" as const),
      empresa: fc.constantFrom("emp_01", "emp_02", "emp_03"),
      fazenda: fc.constantFrom("faz_03", "faz_04"),
      atividade: fc.constantFrom("gado_de_corte", "gado_leiteiro", "frango", "morango"),
      desova: fc.constant("atacado" as const),
      fatorPrecoAtacado: fc.double({ min: 0.6, max: 1, noNaN: true }),
    }),
    fc.record({ tipo: fc.constant("comprarNoAtacado" as const), empresa: fc.constantFrom("emp_01", "emp_02", "emp_03"), produto: fc.constantFrom("carne_bovina_congelada", "couro", "morango"), vendedor: fc.constantFrom("emp_01", "emp_02", "emp_03"), quantidadeMensal: fc.double({ min: 0, max: 9000, noNaN: true }) }),
    fc.record({ tipo: fc.constant("ajustarFazenda" as const), empresa: fc.constantFrom("emp_01", "emp_02", "emp_03"), fazenda: fc.constantFrom("faz_03", "faz_04"), producaoMensal: fc.double({ min: 0, max: 9000, noNaN: true }) }),
  );

  test("45 ticks de trocas e desovas aleatórias com 3 empresas: invariantes (balanço, caixa, soma zero do atacado) valem", () => {
    fc.assert(
      fc.property(fc.array(fc.tuple(fc.integer({ min: 1, max: 40 }), aleatoria), { maxLength: 24 }), (lista) => {
        const estado = partida(["Alfa", "Beta", "Gama"]);
        for (const id of ["emp_01", "emp_02", "emp_03"]) {
          comFazenda(estado, id, { atividade: "gado_de_corte" });
          comFazenda(estado, id, { atividade: "frango", producaoMensal: 6000 });
          estocar(estado, id, "carne_bovina_congelada", 80, 90_000, 55);
        }
        rodar(estado, 45, (t) => ({ decisoes: lista.filter(([tick]) => tick === t).map(([, d]) => d as Decisao) }));
      }),
      { numRuns: 30 },
    );
  });

  test("a ordem das empresas não altera o resultado de cada uma", () => {
    const monta = (nomes: string[]) => {
      const estado = partida(nomes);
      for (const e of estado.empresas) {
        comFazenda(estado, e.id);
        estocar(estado, e.id, "carne_bovina_congelada", 100, 160_000, 60);
        estocar(estado, e.id, "couro", 50, 20_000, 60);
      }
      return estado;
    };
    // Alfa desova no atacado a Beta e Gama; Beta desova na cooperativa; Gama destrói.
    const entrada = (a: string, b: string, c: string) => (t: number) => ({
      decisoes:
        t === 1
          ? [
              { tipo: "comprarNoAtacado", empresa: b, produto: "carne_bovina_congelada", vendedor: a, quantidadeMensal: 200 } as Decisao,
              { tipo: "comprarNoAtacado", empresa: c, produto: "carne_bovina_congelada", vendedor: a, quantidadeMensal: 100 } as Decisao,
              { ...trocar("atacado", { fatorPrecoAtacado: 0.8 }), empresa: a } as Decisao,
              { ...trocar("cooperativa"), empresa: b } as Decisao,
              { ...trocar("destruir"), empresa: c } as Decisao,
            ]
          : [],
    });
    const x = rodar(monta(["Alfa", "Beta", "Gama"]), 15, entrada("emp_01", "emp_02", "emp_03")).estado;
    const y = rodar(monta(["Gama", "Alfa", "Beta"]), 15, entrada("emp_02", "emp_03", "emp_01")).estado;
    const resumo = (s: EstadoPartida, id: string) => {
      const e = empresa(s, id);
      const mpJson = JSON.parse(JSON.stringify(e.materiasPrimas)) as typeof e.materiasPrimas;
      for (const m of Object.values(mpJson)) if (m.pedidoAtacado) m.pedidoAtacado.vendedor = empresa(s, m.pedidoAtacado.vendedor).nome;
      return JSON.stringify({ caixa: e.caixa, fazendas: e.fazendas, mp: mpJson, contabil: e.contabil });
    };
    expect(resumo(x, "emp_01")).toBe(resumo(y, "emp_02"));
    expect(resumo(x, "emp_02")).toBe(resumo(y, "emp_03"));
    expect(resumo(x, "emp_03")).toBe(resumo(y, "emp_01"));
  });
});
