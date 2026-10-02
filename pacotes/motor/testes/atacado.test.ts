import { describe, expect, test } from "bun:test";
import { PRESET_CADEIA_MINIMA } from "@simulador/catalogo";
import fc from "fast-check";
import { criarPartida, type Decisao, type EstadoPartida, passo, precoDaCooperativa, validarDecisao } from "../src";
import { empresa, rodar } from "./ajuda";

/**
 * Valores fixos para calcular à mão: leite do fornecedor a R$ 3,00/L (teto do atacado); piso da
 * cooperativa 60% = R$ 1,80/L.
 */
function partida(nomes: readonly string[] = ["Alfa", "Beta"], mercados?: number[]): EstadoPartida {
  const estado = criarPartida({
    preset: PRESET_CADEIA_MINIMA,
    semente: "atacado",
    empresas: nomes.map((nome, i) => ({ nome, ...(mercados ? { mercado: mercados[i]! } : {}) })),
    ...(mercados ? { mercados: [{ nome: "M1" }, { nome: "M2" }] } : {}),
    modulos: ["cadeia_produtiva"],
  });
  estado.parametros.produtos.find((p) => p.id === "leite")!.fornecedor = { preco: 300, qualidade: 50, ofertaMaxMensal: null };
  estado.parametros.cadeia!.cooperativa.fatorPiso = 0.6;
  return estado;
}

/** Estoque de leite posto direto (o caixa desce no mesmo valor, para o balanço seguir fechando). */
function estocar(estado: EstadoPartida, id: string, quantidade: number, valor: number, qualidade: number): void {
  const e = empresa(estado, id);
  Object.assign(e.materiasPrimas.leite!.estoque, { quantidade, valor, qualidade });
  e.caixa -= valor;
}

const ofertar = (e: string, preco: number, quantidadeMensal: number): Decisao => ({ tipo: "ofertarNoAtacado", empresa: e, produto: "leite", preco, quantidadeMensal });
const comprar = (e: string, vendedor: string, quantidadeMensal: number): Decisao => ({ tipo: "comprarNoAtacado", empresa: e, produto: "leite", vendedor, quantidadeMensal });
const cooperativa = (e: string, quantidade: number): Decisao => ({ tipo: "venderParaCooperativa", empresa: e, produto: "leite", quantidade });
const leite = (estado: EstadoPartida, id: string) => empresa(estado, id).materiasPrimas.leite!;
const lancamentos = (r: ReturnType<typeof passo>, descricao: string, id?: string) => r.lancamentos.filter((l) => l.descricao === descricao && (id === undefined || l.empresa === id));

describe("validação", () => {
  test("oferta: preço inteiro entre o piso da cooperativa e o preço do fornecedor; quantidade 0 retira", () => {
    const estado = partida();
    expect(precoDaCooperativa(300, 0.6)).toBe(180);
    const v = (preco: number, q: number, produto = "leite") => validarDecisao(estado, { tipo: "ofertarNoAtacado", empresa: "emp_01", produto, preco, quantidadeMensal: q });
    expect(v(180, 100)).toBeNull();
    expect(v(300, 100)).toBeNull();
    expect(v(179, 100)).toContain("entre 180");
    expect(v(301, 100)).toContain("300");
    expect(v(200.5, 100)).toContain("inteiro");
    expect(v(1, 0)).toBeNull(); // retirar não olha o preço
    expect(v(200, -1)).toContain("inválida");
    expect(v(200, Number.NaN)).toContain("inválida");
    expect(v(200, 100, "carteira")).toContain("não é matéria-prima");
    expect(v(200, 100, "inexistente")).toContain("não é matéria-prima");
  });

  test("pedido: o vendedor precisa existir, ser outra empresa e do mesmo mercado; 0 cancela", () => {
    const estado = partida(["Alfa", "Beta", "Gama"], [0, 0, 1]);
    const v = (vendedor: string, q: number) => validarDecisao(estado, comprar("emp_01", vendedor, q));
    expect(v("emp_02", 100)).toBeNull();
    expect(v("emp_01", 100)).toContain("de si mesma");
    expect(v("emp_03", 100)).toContain("outro mercado");
    expect(v("emp_99", 100)).toContain("não existe");
    expect(v("emp_99", 0)).toBeNull();
    expect(v("emp_02", -5)).toContain("inválida");
  });

  test("cooperativa: quantidade positiva; módulo desligado rejeita tudo", () => {
    const estado = partida();
    expect(validarDecisao(estado, cooperativa("emp_01", 10))).toBeNull();
    expect(validarDecisao(estado, cooperativa("emp_01", 0))).toContain("inválida");
    expect(validarDecisao(estado, cooperativa("emp_01", -1))).toContain("inválida");
    const desligado = criarPartida({ preset: PRESET_CADEIA_MINIMA, semente: "x", empresas: [{ nome: "A" }, { nome: "B" }] });
    for (const d of [ofertar("emp_01", 200, 10), comprar("emp_01", "emp_02", 10), cooperativa("emp_01", 10)]) expect(validarDecisao(desligado, d)).toContain("não está ativa");
  });

  test("oferta e pedido ficam no estado, e quantidade 0 os remove", () => {
    const estado = partida();
    const r1 = passo(estado, { decisoes: [ofertar("emp_01", 250, 900), comprar("emp_02", "emp_01", 300)] });
    expect(leite(r1.estado, "emp_01").ofertaAtacado).toEqual({ preco: 250, quantidadeMensal: 900 });
    expect(leite(r1.estado, "emp_02").pedidoAtacado).toEqual({ vendedor: "emp_01", quantidadeMensal: 300 });
    const r2 = passo(r1.estado, { decisoes: [ofertar("emp_01", 250, 0), comprar("emp_02", "emp_01", 0)] });
    expect(leite(r2.estado, "emp_01").ofertaAtacado).toBeNull();
    expect(leite(r2.estado, "emp_02").pedidoAtacado).toBeNull();
  });
});

describe("atacado", () => {
  test("uma venda calculada à mão: valor, CPV, estoque, qualidade e caixa dos dois lados", () => {
    const estado = partida();
    estocar(estado, "emp_01", 300, 60_000, 70); // custo médio R$ 2,00/L
    // Oferta de 100 L por dia a R$ 2,50; pedido de 50 L por dia.
    const r = passo(estado, { decisoes: [ofertar("emp_01", 250, 3000), comprar("emp_02", "emp_01", 1500)] });
    expect(r.rejeicoes).toEqual([]);
    expect(lancamentos(r, "venda no atacado")).toEqual([{ empresa: "emp_01", valor: 12_500, classe: "operacional", descricao: "venda no atacado", origem: "emp_02", destino: "emp_01", produto: "leite" }]);
    expect(lancamentos(r, "compra no atacado")).toEqual([{ empresa: "emp_02", valor: -12_500, classe: "operacional", descricao: "compra no atacado", origem: "emp_01", destino: "emp_02", produto: "leite" }]);
    expect(leite(r.estado, "emp_01").estoque).toEqual({ quantidade: 250, valor: 50_000, qualidade: 70 });
    expect(leite(r.estado, "emp_02").estoque).toEqual({ quantidade: 50, valor: 12_500, qualidade: 70 });
    const dre = empresa(r.estado, "emp_01").contabil.mesAtual.dre;
    expect(dre.receita).toBe(12_500);
    expect(dre.cpv).toBe(10_000);
    expect(empresa(r.estado, "emp_02").contabil.mesAtual.dre.receita).toBe(0); // o comprador não tem receita nem despesa: é estoque
    // O caixa de cada lado variou exatamente pelos lançamentos do dia (o invariante de caixa do passo), e o atacado soma zero.
    expect(lancamentos(r, "venda no atacado")[0]!.valor + lancamentos(r, "compra no atacado")[0]!.valor).toBe(0);
  });

  test("pedidos acima da oferta são atendidos na proporção, sem depender da ordem dos compradores", () => {
    const estado = partida(["Alfa", "Beta", "Gama"]);
    estocar(estado, "emp_01", 1000, 100_000, 60);
    const decisoes = [ofertar("emp_01", 200, 3000), comprar("emp_02", "emp_01", 3000), comprar("emp_03", "emp_01", 1500)]; // 100 + 50 por dia contra 100 ofertados
    const r = rodar(estado, 1, () => ({ decisoes })).estado;
    expect(leite(r, "emp_02").estoque.quantidade).toBeCloseTo((100 * 2) / 3, 9);
    expect(leite(r, "emp_03").estoque.quantidade).toBeCloseTo((50 * 2) / 3, 9);
    expect(leite(r, "emp_01").estoque.quantidade).toBeCloseTo(900, 9);
    expect(leite(r, "emp_02").estoque.quantidade / leite(r, "emp_03").estoque.quantidade).toBeCloseTo(2, 9);
    // O mesmo com os pedidos em outra ordem de decisão.
    const r2 = rodar(partidaComEstoque(), 1, () => ({ decisoes: [decisoes[0]!, decisoes[2]!, decisoes[1]!] })).estado;
    expect(JSON.stringify(empresa(r2, "emp_02").materiasPrimas)).toBe(JSON.stringify(empresa(r, "emp_02").materiasPrimas));

    function partidaComEstoque() {
      const p = partida(["Alfa", "Beta", "Gama"]);
      estocar(p, "emp_01", 1000, 100_000, 60);
      return p;
    }
  });

  test("o vendedor entrega no máximo o estoque que tem", () => {
    const estado = partida();
    estocar(estado, "emp_01", 20, 4_000, 55);
    const r = passo(estado, { decisoes: [ofertar("emp_01", 250, 3000), comprar("emp_02", "emp_01", 3000)] });
    expect(leite(r.estado, "emp_02").estoque).toEqual({ quantidade: 20, valor: 5_000, qualidade: 55 });
    expect(leite(r.estado, "emp_01").estoque).toEqual({ quantidade: 0, valor: 0, qualidade: 0 });
    expect(empresa(r.estado, "emp_01").contabil.mesAtual.dre.cpv).toBe(4_000);
  });

  test("sem oferta do vendedor, ou com oferta retirada, nada acontece", () => {
    const estado = partida();
    estocar(estado, "emp_01", 500, 50_000, 60);
    const sem = passo(estado, { decisoes: [comprar("emp_02", "emp_01", 3000)] });
    expect(leite(sem.estado, "emp_02").estoque.quantidade).toBe(0);
    const com = passo(sem.estado, { decisoes: [ofertar("emp_01", 250, 3000)] });
    expect(leite(com.estado, "emp_02").estoque.quantidade).toBe(100); // o pedido seguiu valendo
    const retirada = passo(com.estado, { decisoes: [ofertar("emp_01", 250, 0)] });
    expect(leite(retirada.estado, "emp_02").estoque.quantidade).toBe(100);
  });

  test("o que uma empresa compra num tick não é revendido no mesmo tick", () => {
    const estado = partida(["Alfa", "Beta", "Gama"]);
    estocar(estado, "emp_01", 500, 50_000, 60);
    const decisoes = [ofertar("emp_01", 200, 3000), comprar("emp_02", "emp_01", 3000), ofertar("emp_02", 250, 3000), comprar("emp_03", "emp_02", 3000)];
    const r1 = passo(estado, { decisoes });
    expect(leite(r1.estado, "emp_02").estoque.quantidade).toBe(100);
    expect(leite(r1.estado, "emp_03").estoque.quantidade).toBe(0);
    const r2 = passo(r1.estado);
    expect(leite(r2.estado, "emp_03").estoque.quantidade).toBe(100); // no tick seguinte, sim (a empresa 2 recebeu mais 100 e repassou o que tinha)
    expect(leite(r2.estado, "emp_02").estoque.quantidade).toBe(100);
  });

  test("empresas de outro mercado não negociam entre si, mesmo com o estado adulterado", () => {
    const estado = partida(["Alfa", "Beta"], [0, 1]);
    estocar(estado, "emp_01", 500, 50_000, 60);
    leite(estado, "emp_01").ofertaAtacado = { preco: 200, quantidadeMensal: 3000 };
    leite(estado, "emp_02").pedidoAtacado = { vendedor: "emp_01", quantidadeMensal: 3000 };
    const r = passo(estado);
    expect(leite(r.estado, "emp_02").estoque.quantidade).toBe(0);
  });

  test("a empresa que compra paga com o crédito emergencial se faltar caixa, e o balanço fecha", () => {
    const estado = partida();
    estocar(estado, "emp_01", 100_000, 10_000_000, 60);
    const pobre = empresa(estado, "emp_02");
    pobre.contabil.capitalSocial -= pobre.caixa - 1_000; // quase sem caixa, com o balanço ainda fechando
    pobre.caixa = 1_000;
    const { estado: fim } = rodar(estado, 3, (t) => ({ decisoes: t === 1 ? [ofertar("emp_01", 250, 90_000), comprar("emp_02", "emp_01", 90_000)] : [] }));
    expect(empresa(fim, "emp_02").creditoEmergencial).toBeGreaterThan(0);
    expect(leite(fim, "emp_02").estoque.quantidade).toBeGreaterThan(0);
  });
});

describe("cooperativa", () => {
  test("compra ao preço-piso só quando a equipe manda: receita, CPV, estoque (calculado à mão)", () => {
    const estado = partida();
    estocar(estado, "emp_01", 100, 20_000, 60); // R$ 2,00/L de custo; piso R$ 1,80
    const r = passo(estado, { decisoes: [cooperativa("emp_01", 40)] });
    expect(lancamentos(r, "venda à cooperativa")).toEqual([{ empresa: "emp_01", valor: 7_200, classe: "operacional", descricao: "venda à cooperativa", origem: "cooperativa", destino: "emp_01", produto: "leite" }]);
    expect(leite(r.estado, "emp_01").estoque).toEqual({ quantidade: 60, valor: 12_000, qualidade: 60 });
    const dre = empresa(r.estado, "emp_01").contabil.mesAtual.dre;
    expect(dre.receita).toBe(7_200);
    expect(dre.cpv).toBe(8_000); // vendeu abaixo do custo: prejuízo de R$ 8,00 nesta venda
  });

  test("sem ordem, a cooperativa nunca compra, mesmo com estoque parado", () => {
    const estado = partida();
    estocar(estado, "emp_01", 100, 20_000, 60);
    const { resultados } = rodar(estado, 5);
    expect(resultados.flatMap((r) => lancamentos(r, "venda à cooperativa"))).toEqual([]);
  });

  test("a ordem é única: vale só no tick em que foi dada, e ordens somam até o estoque", () => {
    const estado = partida();
    estocar(estado, "emp_01", 100, 20_000, 60);
    const r1 = passo(estado, { decisoes: [cooperativa("emp_01", 30), cooperativa("emp_01", 50)] });
    expect(leite(r1.estado, "emp_01").estoque.quantidade).toBe(20);
    const r2 = passo(r1.estado);
    expect(lancamentos(r2, "venda à cooperativa")).toEqual([]);
    expect(leite(r2.estado, "emp_01").estoque.quantidade).toBe(20);
    const r3 = passo(r2.estado, { decisoes: [cooperativa("emp_01", 1_000)] });
    expect(leite(r3.estado, "emp_01").estoque).toEqual({ quantidade: 0, valor: 0, qualidade: 0 });
    // Sem estoque, a ordem não faz nada.
    expect(lancamentos(passo(r3.estado, { decisoes: [cooperativa("emp_01", 5)] }), "venda à cooperativa")).toEqual([]);
  });

  test("a ordem para a cooperativa tem prioridade sobre o atacado no estoque do vendedor", () => {
    const estado = partida();
    estocar(estado, "emp_01", 100, 20_000, 60);
    const r = passo(estado, { decisoes: [ofertar("emp_01", 250, 6000), comprar("emp_02", "emp_01", 6000), cooperativa("emp_01", 70)] });
    expect(leite(r.estado, "emp_02").estoque.quantidade).toBe(30); // sobraram 30 L para o atacado
    expect(leite(r.estado, "emp_01").estoque.quantidade).toBe(0);
  });

  test("com o piso no preço, vender no atacado rende mais que na cooperativa (a cooperativa é só último recurso)", () => {
    const estado = partida();
    const piso = precoDaCooperativa(300, estado.parametros.cadeia!.cooperativa.fatorPiso);
    expect(piso).toBeLessThan(250);
    expect(validarDecisao(estado, ofertar("emp_01", piso - 1, 10))).not.toBeNull();
    expect(validarDecisao(estado, ofertar("emp_01", piso, 10))).toBeNull();
  });
});

describe("propriedades", () => {
  const aleatoria = fc.oneof(
    fc.record({ tipo: fc.constant("construirFazenda" as const), empresa: fc.constantFrom("emp_01", "emp_02", "emp_03"), atividade: fc.constantFrom("gado_leiteiro", "gado_de_corte"), producaoMensal: fc.double({ min: 0, max: 15_000, noNaN: true }) }),
    fc.record({
      tipo: fc.constant("ofertarNoAtacado" as const),
      empresa: fc.constantFrom("emp_01", "emp_02", "emp_03"),
      produto: fc.constantFrom("leite", "couro"),
      preco: fc.integer({ min: 20, max: 400 }),
      quantidadeMensal: fc.double({ min: 0, max: 20_000, noNaN: true }),
    }),
    fc.record({
      tipo: fc.constant("comprarNoAtacado" as const),
      empresa: fc.constantFrom("emp_01", "emp_02", "emp_03"),
      produto: fc.constantFrom("leite", "couro"),
      vendedor: fc.constantFrom("emp_01", "emp_02", "emp_03"),
      quantidadeMensal: fc.double({ min: 0, max: 20_000, noNaN: true }),
    }),
    fc.record({ tipo: fc.constant("venderParaCooperativa" as const), empresa: fc.constantFrom("emp_01", "emp_02", "emp_03"), produto: fc.constantFrom("leite", "couro"), quantidade: fc.double({ min: 0.001, max: 5_000, noNaN: true }) }),
  );

  test("45 ticks de decisões aleatórias com 3 empresas: invariantes (balanço, soma zero do atacado, estoques) valem", () => {
    fc.assert(
      fc.property(fc.array(fc.tuple(fc.integer({ min: 1, max: 40 }), aleatoria), { maxLength: 24 }), (lista) => {
        const estado = partida(["Alfa", "Beta", "Gama"]);
        for (const a of estado.parametros.cadeia!.atividades) a.diasDeArmazenagem = 8;
        const fazendas = [construirDe("emp_01"), construirDe("emp_02")];
        rodar(estado, 45, (t) => ({ decisoes: [...(t === 1 ? fazendas : []), ...lista.filter(([tick]) => tick === t).map(([, d]) => d as Decisao)] }));
      }),
      { numRuns: 25 },
    );
    function construirDe(e: string): Decisao {
      return { tipo: "construirFazenda", empresa: e, atividade: "gado_leiteiro", producaoMensal: 9000 };
    }
  });

  test("a ordem das empresas não altera o resultado de cada uma", () => {
    const monta = (nomes: string[]) => {
      const estado = partida(nomes);
      for (const e of estado.empresas) estocar(estado, e.id, 200, 40_000, 60);
      return estado;
    };
    // Alfa vende a Beta e Gama; Gama compra também de Beta; Beta manda 30 L à cooperativa.
    const entrada = (a: string, b: string, c: string) => (t: number) => ({
      decisoes:
        t === 1
          ? [ofertar(a, 250, 3000), ofertar(b, 220, 1500), comprar(b, a, 4500), comprar(c, a, 3000), cooperativa(b, 30)]
          : [],
    });
    const x = rodar(monta(["Alfa", "Beta", "Gama"]), 6, entrada("emp_01", "emp_02", "emp_03")).estado;
    const y = rodar(monta(["Gama", "Alfa", "Beta"]), 6, entrada("emp_02", "emp_03", "emp_01")).estado; // Alfa = emp_02, Beta = emp_03, Gama = emp_01
    const resumo = (s: EstadoPartida, id: string) => {
      const e = empresa(s, id);
      const nome = (vendedorId: string) => empresa(s, vendedorId).nome; // o id do vendedor depende da ordem; o nome, não
      const mp = JSON.parse(JSON.stringify(e.materiasPrimas)) as typeof e.materiasPrimas;
      for (const m of Object.values(mp)) if (m.pedidoAtacado) m.pedidoAtacado.vendedor = nome(m.pedidoAtacado.vendedor);
      return JSON.stringify({ caixa: e.caixa, mp, contabil: e.contabil });
    };
    expect(resumo(x, "emp_01")).toBe(resumo(y, "emp_02"));
    expect(resumo(x, "emp_02")).toBe(resumo(y, "emp_03"));
    expect(resumo(x, "emp_03")).toBe(resumo(y, "emp_01"));
  });
});
