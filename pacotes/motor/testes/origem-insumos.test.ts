import { describe, expect, test } from "bun:test";
import { PRESET_CADEIA_MINIMA, PRESET_INTRODUTORIO } from "@simulador/catalogo";
import fc from "fast-check";
import { balanco, criarPartida, type Decisao, type EstadoPartida, passo, validarDecisao } from "../src";
import { empresa, oferta, rodar } from "./ajuda";

/**
 * Valores fixos para calcular à mão (o preset sorteia custos e qualidades por semente):
 * - carteira e sapato: 1 kg de couro por unidade, sem mão de obra, couro do fornecedor a R$ 10,00/kg com qualidade 40;
 * - carne do fornecedor a R$ 20,00/kg com qualidade 50;
 * - sem P&D, a tecnologia relativa é 10/20 = 0,5, então Q = 50 × 0,5 + 50% × qualidade do couro = 25 + 0,5 × Qcouro.
 */
function partida(nomes: readonly string[] = ["Alfa"]): EstadoPartida {
  const estado = criarPartida({ preset: PRESET_CADEIA_MINIMA, semente: "origem", empresas: nomes.map((nome) => ({ nome })), modulos: ["cadeia_produtiva"] });
  const produto = (id: string) => estado.parametros.produtos.find((p) => p.id === id)!;
  produto("couro").fornecedor = { preco: 1000, qualidade: 40, ofertaMaxMensal: null };
  produto("carne_bovina_congelada").fornecedor = { preco: 2000, qualidade: 50, ofertaMaxMensal: null };
  for (const id of ["carteira", "sapato"]) {
    const fab = produto(id).fabricacao!;
    fab.unidadesPorLote = 3;
    fab.receita = [{ produto: "couro", quantidadePorLote: 3, pesoQualidade: 50 }];
    fab.pesoTecnologia = 50;
    fab.custoMaoDeObraPorUnidade = 0;
    fab.capacidadeUnidadesPorDia = 100_000;
  }
  return estado;
}

/** Fábricas prontas (compradas à vista) e estoque próprio de couro, ajustando o caixa para o balanço seguir fechando. */
function preparar(estado: EstadoPartida, empresaId: string, opcoes: { fabricas?: string[]; couro?: { quantidade: number; valor: number; qualidade: number }; carne?: { quantidade: number; valor: number; qualidade: number } }): void {
  const e = empresa(estado, empresaId);
  for (const produto of opcoes.fabricas ?? []) {
    const custo = 1_000_000;
    e.caixa -= custo;
    e.fabricas.push({ id: `fab_0${e.fabricas.length + 3}`, produto, custo, depreciacaoAcumulada: 0, operaDesdeTick: 0, vidaUtilMeses: 60, experiencia: 0 });
  }
  for (const [id, estoque] of [["couro", opcoes.couro], ["carne_bovina_congelada", opcoes.carne]] as const) {
    if (!estoque) continue;
    Object.assign(e.materiasPrimas[id]!.estoque, estoque);
    e.caixa -= estoque.valor;
  }
}

const decisao = (empresaId: string, produto: string, campos: Record<string, unknown>): Decisao => ({ tipo: "produto", empresa: empresaId, produto, ...campos }) as Decisao;
const compras = (r: ReturnType<typeof passo>, descricao: string) => r.lancamentos.filter((l) => l.descricao === descricao).reduce((s, l) => s - l.valor, 0);

describe("origem própria dos insumos da fábrica", () => {
  test("padrão (fornecedor): compra todo o couro a R$ 10,00/kg e não mexe no estoque próprio", () => {
    const estado = partida();
    preparar(estado, "emp_01", { fabricas: ["carteira"], couro: { quantidade: 100, valor: 80_000, qualidade: 70 } });
    const r = passo(estado, { decisoes: [decisao("emp_01", "carteira", { producaoMensal: 6000 })] }); // 200 carteiras por dia, 200 kg de couro
    expect(compras(r, "compra de insumo")).toBe(200_000);
    expect(oferta(r.estado, "emp_01", "carteira").estoque).toEqual({ quantidade: 200, valor: 200_000, qualidade: 45 });
    expect(empresa(r.estado, "emp_01").materiasPrimas.couro!.estoque).toEqual({ quantidade: 100, valor: 80_000, qualidade: 70 });
  });

  test("origem própria que cobre tudo: sai do estoque pelo custo médio, sem caixa, com a qualidade do estoque", () => {
    const estado = partida();
    preparar(estado, "emp_01", { fabricas: ["carteira"], couro: { quantidade: 100, valor: 80_000, qualidade: 70 } });
    const r = passo(estado, { decisoes: [decisao("emp_01", "carteira", { producaoMensal: 3000, origemInsumos: { couro: "propria" } })] }); // 100 kg
    expect(r.rejeicoes).toEqual([]);
    expect(compras(r, "compra de insumo")).toBe(0);
    expect(oferta(r.estado, "emp_01", "carteira").estoque).toEqual({ quantidade: 100, valor: 80_000, qualidade: 60 }); // 25 + 0,5 × 70
    expect(empresa(r.estado, "emp_01").materiasPrimas.couro!.estoque).toEqual({ quantidade: 0, valor: 0, qualidade: 0 });
    expect(oferta(r.estado, "emp_01", "carteira").decisao.origemInsumos).toEqual({ couro: "propria" });
  });

  test("origem própria que não cobre, com o preset completando: o resto vem do fornecedor; qualidade e custo ponderados", () => {
    const estado = partida();
    preparar(estado, "emp_01", { fabricas: ["carteira"], couro: { quantidade: 100, valor: 80_000, qualidade: 70 } });
    const r = passo(estado, { decisoes: [decisao("emp_01", "carteira", { producaoMensal: 6000, origemInsumos: { couro: "propria" } })] }); // precisa de 200 kg
    expect(compras(r, "compra de insumo")).toBe(100_000); // só os 100 kg que faltam
    // Custo: 80.000 do estoque + 100.000 comprados. Qualidade do couro: (100 × 70 + 100 × 40) / 200 = 55 → 25 + 27,5.
    expect(oferta(r.estado, "emp_01", "carteira").estoque).toEqual({ quantidade: 200, valor: 180_000, qualidade: 52.5 });
    expect(empresa(r.estado, "emp_01").materiasPrimas.couro!.estoque.quantidade).toBe(0);
  });

  test("com completaComFornecedor desligado, a produção cai ao que o estoque próprio cobre", () => {
    const estado = partida();
    estado.parametros.cadeia!.completaComFornecedor = false;
    preparar(estado, "emp_01", { fabricas: ["carteira"], couro: { quantidade: 100, valor: 80_000, qualidade: 70 } });
    const r = passo(estado, { decisoes: [decisao("emp_01", "carteira", { producaoMensal: 6000, origemInsumos: { couro: "propria" } })] });
    expect(compras(r, "compra de insumo")).toBe(0);
    expect(oferta(r.estado, "emp_01", "carteira").estoque).toEqual({ quantidade: 100, valor: 80_000, qualidade: 60 });
    // Sem estoque nenhum, não produz nada (e não quebra).
    const vazio = partida();
    vazio.parametros.cadeia!.completaComFornecedor = false;
    preparar(vazio, "emp_01", { fabricas: ["carteira"] });
    const r2 = passo(vazio, { decisoes: [decisao("emp_01", "carteira", { producaoMensal: 6000, origemInsumos: { couro: "propria" } })] });
    expect(oferta(r2.estado, "emp_01", "carteira").estoque.quantidade).toBe(0);
  });

  test("duas ofertas disputam o mesmo estoque próprio: a primeira na ordem das ofertas leva, a outra completa com o fornecedor", () => {
    const estado = partida();
    preparar(estado, "emp_01", { fabricas: ["sapato", "carteira"], couro: { quantidade: 100, valor: 80_000, qualidade: 70 } });
    const proprio = { producaoMensal: 3000, origemInsumos: { couro: "propria" } };
    const r = passo(estado, { decisoes: [decisao("emp_01", "sapato", proprio), decisao("emp_01", "carteira", proprio)] });
    expect(empresa(r.estado, "emp_01").ofertas.map((o) => o.produto).indexOf("sapato")).toBeLessThan(empresa(r.estado, "emp_01").ofertas.map((o) => o.produto).indexOf("carteira"));
    expect(oferta(r.estado, "emp_01", "sapato").estoque).toEqual({ quantidade: 100, valor: 80_000, qualidade: 60 });
    expect(oferta(r.estado, "emp_01", "carteira").estoque).toEqual({ quantidade: 100, valor: 100_000, qualidade: 45 });
    expect(compras(r, "compra de insumo")).toBe(100_000);
  });

  test("mudar a origem de volta para fornecedor remove a escolha; as demais ficam", () => {
    const estado = partida();
    const r1 = passo(estado, { decisoes: [decisao("emp_01", "carteira", { origemInsumos: { couro: "propria" } })] });
    expect(oferta(r1.estado, "emp_01", "carteira").decisao.origemInsumos).toEqual({ couro: "propria" });
    const r2 = passo(r1.estado, { decisoes: [decisao("emp_01", "carteira", { preco: 100, origemInsumos: { couro: "fornecedor" } })] });
    expect(oferta(r2.estado, "emp_01", "carteira").decisao.origemInsumos).toEqual({});
  });

  test("o balanço continua fechando exatamente depois de usar estoque próprio e do fornecedor", () => {
    const estado = partida();
    preparar(estado, "emp_01", { fabricas: ["carteira"], couro: { quantidade: 100.37, valor: 80_123, qualidade: 66.6 } });
    const decisoes = [decisao("emp_01", "carteira", { producaoMensal: 6001, origemInsumos: { couro: "propria" } })];
    const { estado: fim } = rodar(estado, 5, (t) => ({ decisoes: t === 1 ? decisoes : [] }));
    const b = balanco(empresa(fim, "emp_01"), fim.tick);
    expect(b.ativoTotal).toBe(b.passivoTotal + b.patrimonioLiquido);
  });
});

describe("origem própria da compra pronta (carne e frango da fazenda)", () => {
  const carne = { quantidade: 50, valor: 100_000, qualidade: 80 };

  test("transfere do estoque da fazenda pelo custo médio e compra do fornecedor só o que falta", () => {
    const estado = partida();
    preparar(estado, "emp_01", { carne });
    const r = passo(estado, { decisoes: [decisao("emp_01", "carne_bovina_congelada", { compraMensal: 3000, origemCompraPronta: "propria" })] }); // 100 kg por dia
    expect(r.rejeicoes).toEqual([]);
    expect(compras(r, "compra de mercadoria pronta")).toBe(100_000); // 50 kg × R$ 20,00
    // 50 kg a R$ 1.000,00 (da fazenda, qualidade 80) + 50 kg a R$ 1.000,00 (fornecedor, qualidade 50).
    expect(oferta(r.estado, "emp_01", "carne_bovina_congelada").estoque).toEqual({ quantidade: 100, valor: 200_000, qualidade: 65 });
    expect(empresa(r.estado, "emp_01").materiasPrimas.carne_bovina_congelada!.estoque).toEqual({ quantidade: 0, valor: 0, qualidade: 0 });
  });

  test("com completaComFornecedor desligado, só entra o que a fazenda tem", () => {
    const estado = partida();
    estado.parametros.cadeia!.completaComFornecedor = false;
    preparar(estado, "emp_01", { carne });
    const r = passo(estado, { decisoes: [decisao("emp_01", "carne_bovina_congelada", { compraMensal: 3000, origemCompraPronta: "propria" })] });
    expect(compras(r, "compra de mercadoria pronta")).toBe(0);
    expect(oferta(r.estado, "emp_01", "carne_bovina_congelada").estoque).toEqual({ quantidade: 50, valor: 100_000, qualidade: 80 });
  });

  test("a origem própria de uma empresa não afeta a compra de outra empresa (a escala do fornecedor vale só para o que ele vende)", () => {
    const estado = partida(["Alfa", "Beta"]);
    preparar(estado, "emp_01", { carne });
    const d = (e: string, campos: Record<string, unknown>) => decisao(e, "carne_bovina_congelada", { compraMensal: 3000, ...campos });
    const r = passo(estado, { decisoes: [d("emp_01", { origemCompraPronta: "propria" }), d("emp_02", {})] });
    expect(r.lancamentos.filter((l) => l.descricao === "compra de mercadoria pronta" && l.empresa === "emp_02").map((l) => l.valor)).toEqual([-200_000]);
    expect(oferta(r.estado, "emp_02", "carne_bovina_congelada").estoque).toEqual({ quantidade: 100, valor: 200_000, qualidade: 50 });
  });
});

describe("validação da origem", () => {
  const motivo = (estado: EstadoPartida, campos: Record<string, unknown>, produto = "carteira") => validarDecisao(estado, decisao("emp_01", produto, campos));

  test("aceita só insumos da receita, origens conhecidas e matérias-primas que alguma fazenda produz", () => {
    const estado = partida();
    expect(motivo(estado, { origemInsumos: { couro: "propria" } })).toBeNull();
    expect(motivo(estado, { origemCompraPronta: "propria" }, "carne_bovina_congelada")).toBeNull();
    expect(motivo(estado, { origemInsumos: { leite: "propria" } })).toContain("não é insumo da receita");
    expect(motivo(estado, { origemInsumos: { couro: "atacado" } })).toContain("desconhecida");
    expect(motivo(estado, { origemInsumos: { couro: { equipe: "emp_02" } } })).toContain("desconhecida");
    expect(motivo(estado, { origemInsumos: null })).toContain("inválida");
    expect(motivo(estado, { origemInsumos: [] })).toContain("inválida");
    expect(motivo(estado, { origemCompraPronta: "atacado" })).toContain("desconhecida");
    // Tecido não é produzido por nenhuma atividade das fazendas.
    estado.parametros.produtos.find((p) => p.id === "carteira")!.fabricacao!.receita.push({ produto: "tecido", quantidadePorLote: 1, pesoQualidade: 0 });
    expect(motivo(estado, { origemInsumos: { tecido: "propria" } })).toContain("nenhuma atividade");
    // Produto sem estoque de matéria-prima próprio (carteira não é matéria-prima).
    expect(motivo(estado, { origemCompraPronta: "propria" })).toContain("nenhuma atividade");
  });

  test("com o módulo desligado, só o fornecedor vale", () => {
    const estado = criarPartida({ preset: PRESET_CADEIA_MINIMA, semente: "x", empresas: [{ nome: "Alfa" }] });
    expect(motivo(estado, { origemInsumos: { couro: "propria" } })).toContain("não está ativa");
    expect(motivo(estado, { origemInsumos: { couro: "fornecedor" } })).toBeNull();
    expect(motivo(estado, { origemCompraPronta: "propria" }, "carne_bovina_congelada")).toContain("não está ativa");
    const r = passo(estado, { decisoes: [decisao("emp_01", "carteira", { origemInsumos: { couro: "propria" } })] });
    expect(r.rejeicoes).toHaveLength(1);
    expect(oferta(r.estado, "emp_01", "carteira").decisao.origemInsumos).toEqual({});
  });

  test("preset sem cadeia: a decisão só com origem do fornecedor passa; produto sem receita rejeita insumo", () => {
    const estado = criarPartida({ preset: PRESET_INTRODUTORIO, semente: "x", empresas: [{ nome: "Alfa" }] });
    expect(motivo(estado, { origemInsumos: {} })).toBeNull();
    expect(motivo(estado, { origemInsumos: { couro: "fornecedor" } })).toBeNull();
    expect(motivo(estado, { origemInsumos: { couro: "propria" } })).toContain("não está ativa");
  });
});

describe("propriedades", () => {
  const aleatoria = fc.oneof(
    fc.record({ tipo: fc.constant("construirFazenda" as const), empresa: fc.constantFrom("emp_01", "emp_02"), atividade: fc.constantFrom("gado_de_corte", "gado_leiteiro", "frango"), producaoMensal: fc.double({ min: 0, max: 20_000, noNaN: true }) }),
    fc.record({ tipo: fc.constant("construirFabrica" as const), empresa: fc.constantFrom("emp_01", "emp_02"), produto: fc.constantFrom("carteira", "sapato") }),
    fc.record({
      tipo: fc.constant("produto" as const),
      empresa: fc.constantFrom("emp_01", "emp_02"),
      produto: fc.constantFrom("carteira", "sapato", "carne_bovina_congelada"),
      preco: fc.integer({ min: 100, max: 40_000 }),
      producaoMensal: fc.double({ min: 0, max: 20_000, noNaN: true }),
      compraMensal: fc.double({ min: 0, max: 5_000, noNaN: true }),
      origemInsumos: fc.record({ couro: fc.constantFrom("propria" as const, "fornecedor" as const) }),
      origemCompraPronta: fc.constantFrom("propria" as const, "fornecedor" as const),
    }),
  );

  test("45 ticks com fazendas, fábricas e origens aleatórias: invariantes (balanço, estoques, caixa) valem", () => {
    fc.assert(
      fc.property(fc.array(fc.tuple(fc.integer({ min: 1, max: 40 }), aleatoria), { maxLength: 14 }), fc.boolean(), (lista, completa) => {
        const estado = partida(["Alfa", "Beta"]);
        estado.parametros.cadeia!.completaComFornecedor = completa;
        for (const a of estado.parametros.cadeia!.atividades) a.diasDeArmazenagem = 6;
        rodar(estado, 45, (t) => ({ decisoes: lista.filter(([tick]) => tick === t).map(([, d]) => d as Decisao) }));
      }),
      { numRuns: 25 },
    );
  });

  test("a ordem das empresas não altera o resultado de cada uma", () => {
    const monta = (nomes: string[]) => {
      const estado = partida(nomes);
      for (const e of estado.empresas) preparar(estado, e.id, { fabricas: ["carteira"], couro: { quantidade: 130, valor: 91_000, qualidade: 66 } });
      return estado;
    };
    const entrada = (a: string, b: string) => (t: number) => ({
      decisoes: t === 1 ? [decisao(a, "carteira", { producaoMensal: 6000, origemInsumos: { couro: "propria" } }), decisao(b, "carteira", { producaoMensal: 4500 })] : [],
    });
    const x = rodar(monta(["Alfa", "Beta"]), 8, entrada("emp_01", "emp_02")).estado;
    const y = rodar(monta(["Beta", "Alfa"]), 8, entrada("emp_02", "emp_01")).estado;
    const resumo = (s: EstadoPartida, id: string) => {
      const e = empresa(s, id);
      return JSON.stringify({ caixa: e.caixa, ofertas: e.ofertas, mp: e.materiasPrimas, contabil: e.contabil });
    };
    expect(resumo(x, "emp_01")).toBe(resumo(y, "emp_02"));
    expect(resumo(x, "emp_02")).toBe(resumo(y, "emp_01"));
  });
});
