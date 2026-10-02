import { describe, expect, test } from "bun:test";
import { PRESET_CADEIA_MINIMA } from "@simulador/catalogo";
import fc from "fast-check";
import {
  balanco,
  capacidadeDeEstoque,
  criarPartida,
  DIAS_CHEIO_PARA_ALERTA,
  type Decisao,
  type EstadoPartida,
  passo,
  qualidadeDaFazenda,
  type ResultadoTick,
  ratear,
  validarDecisao,
} from "../src";
import { criarContexto } from "../src/contexto";
import { empresa, rodar } from "./ajuda";

/**
 * Partida da cadeia mínima com valores fixos nas atividades usadas, para os resultados poderem ser
 * calculados à mão (o preset sorteia custos e qualidades por semente).
 */
function partida(nomes: readonly string[] = ["Alfa"], ajustes: { diasDeArmazenagem?: number } = {}): EstadoPartida {
  const estado = criarPartida({ preset: PRESET_CADEIA_MINIMA, semente: "fazendas", empresas: nomes.map((nome) => ({ nome })), modulos: ["cadeia_produtiva"] });
  const preco = (id: string, centavos: number) => {
    estado.parametros.produtos.find((p) => p.id === id)!.fornecedor!.preco = centavos;
  };
  preco("carne_bovina_congelada", 2000);
  preco("couro", 1000);
  preco("leite", 300);
  for (const a of estado.parametros.cadeia!.atividades) {
    a.qualidadeBase = 50;
    a.prazoConstrucaoDias = 30;
    a.diasDeArmazenagem = ajustes.diasDeArmazenagem ?? 1000;
    if (a.id === "gado_de_corte") {
      a.custoVariavelPorUnidade = 400;
      a.capacidadeUnidadesPorDia = 150;
    }
    if (a.id === "gado_leiteiro") {
      a.custoVariavelPorUnidade = 100;
      a.capacidadeUnidadesPorDia = 400;
    }
  }
  estado.parametros.cadeia!.experiencia = { ganhoQualidadePorMes: 1.5, qualidadeMaxima: 90 };
  return estado;
}

const construir = (empresaId: string, atividade: string, producaoMensal?: number): Decisao => ({
  tipo: "construirFazenda",
  empresa: empresaId,
  atividade,
  ...(producaoMensal === undefined ? {} : { producaoMensal }),
});

/**
 * Constrói as fazendas num tick e as põe em operação na hora (sem esperar a obra). O tick da construção
 * fica no histórico, mas a série de estoque é zerada para os testes começarem do zero.
 */
function comFazendasProntas(estado: EstadoPartida, ...fazendas: readonly [empresa: string, atividade: string, producaoMensal: number][]): void {
  const r = passo(estado, { decisoes: fazendas.map(([e, a, q]) => construir(e, a, q)) });
  Object.assign(estado, r.estado);
  for (const e of estado.empresas) {
    for (const f of e.fazendas) f.operaDesdeTick = 0;
    for (const m of Object.values(e.materiasPrimas)) m.serie = [];
  }
}

/** Roda ticks com o `passo` puro: cada resultado guarda o seu próprio estado (`rodar` reaproveita o mesmo objeto). */
function passos(estado: EstadoPartida, ticks: number): ResultadoTick[] {
  const resultados: ResultadoTick[] = [];
  let atual = estado;
  for (let i = 0; i < ticks; i++) {
    const r = passo(atual);
    resultados.push(r);
    atual = r.estado;
  }
  return resultados;
}

describe("construir e ajustar fazendas", () => {
  test("construir paga o capex na hora, cria a fazenda em obra e avisa quando fica pronta", () => {
    const estado = partida();
    const caixa = empresa(estado, "emp_01").caixa;
    const capex = estado.parametros.cadeia!.atividades.find((a) => a.id === "gado_leiteiro")!.capex;
    const r = passo(estado, { decisoes: [construir("emp_01", "gado_leiteiro", 6000)] });
    const e = empresa(r.estado, "emp_01");
    expect(r.rejeicoes).toEqual([]);
    expect(e.fazendas).toHaveLength(1);
    expect(e.fazendas[0]).toMatchObject({ id: "faz_03", atividade: "gado_leiteiro", custo: capex, depreciacaoAcumulada: 0, operaDesdeTick: 31, experiencia: 0, conversaoAteTick: null, producaoMensal: 6000 });
    expect(r.lancamentos).toContainEqual({ empresa: "emp_01", valor: -capex, classe: "investimento", descricao: "construção de fazenda", origem: "emp_01", destino: "construtora" });
    expect(e.caixa).toBeLessThan(caixa);
    // Em obra: não produz, e o capex fica nas obras em andamento.
    expect(balanco(e, r.estado.tick).obrasEmAndamento).toBe(capex);
    expect(e.materiasPrimas.leite!.estoque.quantidade).toBe(0);

    const { resultados } = rodar(r.estado, 30);
    expect(resultados[28]!.avisos.filter((a) => a.tipo === "fazenda_concluida")).toEqual([]);
    expect(resultados[29]!.avisos).toContainEqual({ tipo: "fazenda_concluida", empresa: "emp_01", atividade: "gado_leiteiro" });
  });

  test("sem a produção informada, a fazenda nasce com produção 0; ajustar muda a decisão, em obra ou não", () => {
    const estado = partida();
    const r1 = passo(estado, { decisoes: [construir("emp_01", "frango")] });
    expect(empresa(r1.estado, "emp_01").fazendas[0]!.producaoMensal).toBe(0);
    const id = empresa(r1.estado, "emp_01").fazendas[0]!.id;
    const r2 = passo(r1.estado, { decisoes: [{ tipo: "ajustarFazenda", empresa: "emp_01", fazenda: id, producaoMensal: 4500 }] });
    expect(r2.rejeicoes).toEqual([]);
    expect(empresa(r2.estado, "emp_01").fazendas[0]!.producaoMensal).toBe(4500);
  });

  test("rejeita atividade inexistente, produção inválida, fazenda de outra empresa e módulo desligado", () => {
    const estado = partida(["Alfa", "Beta"]);
    const r = passo(estado, { decisoes: [construir("emp_01", "gado_leiteiro")] });
    const idAlfa = empresa(r.estado, "emp_01").fazendas[0]!.id;
    const motivo = (d: Decisao) => validarDecisao(r.estado, d);
    expect(motivo(construir("emp_01", "plantacao_de_ouro"))).toContain("não existe");
    expect(motivo(construir("emp_01", "frango", -1))).toContain("inválida");
    expect(motivo(construir("emp_01", "frango", Number.NaN))).toContain("inválida");
    expect(motivo({ tipo: "ajustarFazenda", empresa: "emp_02", fazenda: idAlfa, producaoMensal: 10 })).toContain("não tem a fazenda");
    expect(motivo({ tipo: "ajustarFazenda", empresa: "emp_01", fazenda: idAlfa, producaoMensal: Number.POSITIVE_INFINITY })).toContain("inválida");
    expect(motivo({ tipo: "ajustarFazenda", empresa: "emp_01", fazenda: idAlfa, producaoMensal: 10 })).toBeNull();

    const desligado = criarPartida({ preset: PRESET_CADEIA_MINIMA, semente: "x", empresas: [{ nome: "Alfa" }] });
    expect(validarDecisao(desligado, construir("emp_01", "frango"))).toContain("não está ativa");
    expect(validarDecisao(desligado, { tipo: "ajustarFazenda", empresa: "emp_01", fazenda: "faz_03", producaoMensal: 1 })).toContain("não está ativa");
    const rejeitada = passo(desligado, { decisoes: [construir("emp_01", "frango")] });
    expect(rejeitada.rejeicoes).toHaveLength(1);
    expect(empresa(rejeitada.estado, "emp_01").fazendas).toEqual([]);
  });
});

describe("produção das fazendas", () => {
  test("um dia de gado de corte: carne e couro nas proporções, custo rateado pelo valor de referência (calculado à mão)", () => {
    const estado = partida();
    comFazendasProntas(estado, ["emp_01", "gado_de_corte", 3000]); // 100 unidades-base por dia
    const caixa = empresa(estado, "emp_01").caixa;
    const r = passo(estado);
    const e = empresa(r.estado, "emp_01");
    // 100 kg de carne e 50 kg de couro; custo variável 100 × R$ 4,00 = R$ 400,00 = 40.000 centavos.
    // Valor de referência: carne 100 × 2.000 = 200.000; couro 50 × 1.000 = 50.000 → 80% / 20%.
    expect(e.materiasPrimas.carne_bovina_congelada!.estoque).toEqual({ quantidade: 100, valor: 32_000, qualidade: 50 });
    expect(e.materiasPrimas.couro!.estoque).toEqual({ quantidade: 50, valor: 8_000, qualidade: 50 });
    expect(r.lancamentos.filter((l) => l.empresa === "emp_01" && l.descricao === "custo variável da fazenda")).toEqual([
      { empresa: "emp_01", valor: -40_000, classe: "operacional", descricao: "custo variável da fazenda", origem: "emp_01", destino: "insumos_agropecuarios", produto: "carne_bovina_congelada" },
    ]);
    // O custo variável não vai à DRE: fica no estoque até a venda.
    expect(e.contabil.mesAtual.dre.cpv).toBe(0);
    expect(e.caixa).toBeLessThan(caixa - 40_000 + 1); // além do custo variável há o custo fixo do dia
    expect(e.fazendas[0]!.experiencia).toBeCloseTo(100 / (150 * 30), 12);
  });

  test("a produção é limitada pela capacidade nominal da fazenda", () => {
    const estado = partida();
    comFazendasProntas(estado, ["emp_01", "gado_leiteiro", 1e9]);
    const r = passo(estado);
    expect(empresa(r.estado, "emp_01").materiasPrimas.leite!.estoque.quantidade).toBe(400);
  });

  test("a qualidade cresce com a experiência (1,5 ponto por mês à capacidade nominal) e para no teto", () => {
    const estado = partida();
    comFazendasProntas(estado, ["emp_01", "gado_leiteiro", 12_000]); // 400/dia = capacidade nominal
    const { estado: mes1 } = rodar(estado, 30);
    const f = empresa(mes1, "emp_01").fazendas[0]!;
    expect(f.experiencia).toBeCloseTo(1, 9);
    const a = mes1.parametros.cadeia!.atividades.find((x) => x.id === "gado_leiteiro")!;
    const ctx = criarContexto(mes1);
    expect(qualidadeDaFazenda(f, a, ctx)).toBeCloseTo(51.5, 6);
    // O estoque mistura lotes: a qualidade média fica entre a primeira e a última produzida.
    const q = empresa(mes1, "emp_01").materiasPrimas.leite!.estoque.qualidade;
    expect(q).toBeGreaterThan(50);
    expect(q).toBeLessThan(51.5);
    expect(qualidadeDaFazenda({ ...f, experiencia: 1000 }, a, ctx)).toBe(90);
  });

  test("com o estoque cheio a produção para, mas o custo fixo continua, e o aviso sai ao 3º dia seguido em 100%", () => {
    const estado = partida(["Alfa"], { diasDeArmazenagem: 2 }); // cabem 2 dias de produção: 800 L
    comFazendasProntas(estado, ["emp_01", "gado_leiteiro", 12_000]);
    const resultados = passos(estado, 6);
    const leite = (i: number) => empresa(resultados[i]!.estado, "emp_01").materiasPrimas.leite!;
    expect(leite(0).estoque.quantidade).toBe(400);
    expect(leite(0).serie).toEqual([0.5]);
    expect(leite(1).estoque.quantidade).toBe(800);
    expect(leite(1).diasCheio).toBe(1);
    for (let i = 2; i < 6; i++) expect(leite(i).estoque.quantidade).toBe(800); // não passa da capacidade
    expect(leite(5).serie).toEqual([0.5, 1, 1, 1, 1, 1]);
    expect(leite(5).diasCheio).toBe(5);
    const avisos = resultados.map((r) => r.avisos.filter((a) => a.tipo === "estoque_cheio").length);
    expect(avisos).toEqual([0, 0, 0, 1, 0, 0]); // 100% desde o 2º dia; o aviso sai no 3º dia seguido
    expect(resultados[3]!.avisos).toContainEqual({ tipo: "estoque_cheio", empresa: "emp_01", produto: "leite" });
    expect(DIAS_CHEIO_PARA_ALERTA).toBe(3);
    // Parada, a fazenda ainda paga o custo fixo.
    const fixo = resultados[5]!.estado.parametros.cadeia!.atividades.find((a) => a.id === "gado_leiteiro")!.custoFixoMensal;
    expect(empresa(resultados[5]!.estado, "emp_01").contabil.mesAtual.dre.custo_fixo_fazenda).toBe(Math.floor((fixo * 7) / 30) - Math.floor(fixo / 30)); // dias 2 a 7 (o 1º é o da obra)
  });

  test("o contador zera quando o estoque sai de 100%, e a série guarda só os últimos 30 dias", () => {
    const estado = partida(["Alfa"], { diasDeArmazenagem: 2 });
    comFazendasProntas(estado, ["emp_01", "gado_leiteiro", 12_000]);
    const cheio = rodar(estado, 4).estado;
    expect(empresa(cheio, "emp_01").materiasPrimas.leite!.diasCheio).toBe(3);
    empresa(cheio, "emp_01").materiasPrimas.leite!.estoque.quantidade = 100; // saída (ex.: venda) deixa de estar cheio
    empresa(cheio, "emp_01").materiasPrimas.leite!.estoque.valor = 1_000;
    const folga = passo(cheio, { decisoes: [{ tipo: "ajustarFazenda", empresa: "emp_01", fazenda: "faz_03", producaoMensal: 0 }] });
    const m = empresa(folga.estado, "emp_01").materiasPrimas.leite!;
    expect(m.diasCheio).toBe(0);
    expect(m.serie.at(-1)).toBe(100 / 800);
    const novo = partida(["Alfa"], { diasDeArmazenagem: 2 });
    comFazendasProntas(novo, ["emp_01", "gado_leiteiro", 12_000]);
    const longa = rodar(novo, 45).estado;
    expect(empresa(longa, "emp_01").materiasPrimas.leite!.serie).toHaveLength(30);
  });

  test("sem fazendas, a série registra zero e o contador não anda", () => {
    const { estado } = rodar(partida(), 3);
    const m = empresa(estado, "emp_01").materiasPrimas.leite!;
    expect(m.serie).toEqual([0, 0, 0]);
    expect(m.diasCheio).toBe(0);
    expect(capacidadeDeEstoque(empresa(estado, "emp_01"), "leite", criarContexto(estado))).toBe(0);
  });

  test("duas fazendas da mesma matéria-prima dividem o estoque, e cada uma entra na capacidade", () => {
    const estado = partida(["Alfa"], { diasDeArmazenagem: 1 });
    comFazendasProntas(estado, ["emp_01", "gado_leiteiro", 12_000], ["emp_01", "gado_leiteiro", 12_000]);
    const r = passo(estado);
    // Capacidade 2 × 400 × 1 dia = 800 L: as duas produzem 400 L cada.
    expect(empresa(r.estado, "emp_01").materiasPrimas.leite!.estoque.quantidade).toBe(800);
    expect(capacidadeDeEstoque(empresa(r.estado, "emp_01"), "leite", criarContexto(r.estado))).toBe(800);
    const de = rodar(r.estado, 2).estado;
    expect(empresa(de, "emp_01").materiasPrimas.leite!.estoque.quantidade).toBe(800);
  });

  test("custo de armazenagem do estoque de matéria-prima entra na DRE", () => {
    const estado = partida();
    comFazendasProntas(estado, ["emp_01", "gado_leiteiro", 12_000]);
    const leite = estado.parametros.produtos.find((p) => p.id === "leite")!;
    leite.custoArmazenagemMensal = 90;
    const custo = leite.custoArmazenagemMensal;
    const r = passo(estado);
    const armazenagem = r.lancamentos.find((l) => l.descricao === "armazenagem" && l.produto === "leite");
    expect(armazenagem?.valor).toBe(-Math.round((400 * custo) / 30));
    expect(empresa(r.estado, "emp_01").contabil.mesAtual.dre.armazenagem).toBe(Math.round((400 * custo) / 30));
  });
});

describe("propriedades", () => {
  test("ratear reparte o total exatamente, sem parte negativa", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 10_000_000 }), fc.array(fc.double({ min: 0, max: 1e6, noNaN: true }), { minLength: 1, maxLength: 5 }), (total, pesos) => {
        const partes = ratear(total, pesos);
        expect(partes).toHaveLength(pesos.length);
        expect(partes.reduce((s, x) => s + x, 0)).toBe(total);
        expect(partes.every((x) => Number.isInteger(x) && x >= 0)).toBe(true);
      }),
    );
  });

  test("ratear proporcional: 80% / 20% e empate quando todos os pesos são zero", () => {
    expect(ratear(40_000, [200_000, 50_000])).toEqual([32_000, 8_000]);
    expect(ratear(10, [0, 0])).toEqual([5, 5]);
    expect(ratear(0, [3, 1])).toEqual([0, 0]);
  });

  const decisaoAleatoria = fc.oneof(
    fc.record({
      tipo: fc.constant("construirFazenda" as const),
      empresa: fc.constantFrom("emp_01", "emp_02"),
      atividade: fc.constantFrom("gado_de_corte", "gado_leiteiro", "frango", "morango", "cana_de_acucar"),
      producaoMensal: fc.double({ min: 0, max: 20_000, noNaN: true }),
    }),
    fc.record({
      tipo: fc.constant("ajustarFazenda" as const),
      empresa: fc.constantFrom("emp_01", "emp_02"),
      fazenda: fc.constantFrom("faz_03", "faz_04", "faz_05"),
      producaoMensal: fc.double({ min: 0, max: 20_000, noNaN: true }),
    }),
  );

  test("45 ticks de decisões aleatórias de fazenda: invariantes valem e o valor do estoque é exatamente o custo variável pago", () => {
    fc.assert(
      fc.property(fc.array(fc.tuple(fc.integer({ min: 1, max: 45 }), decisaoAleatoria), { maxLength: 12 }), (lista) => {
        const estado = partida(["Alfa", "Beta"], { diasDeArmazenagem: 5 });
        const { estado: fim, resultados } = rodar(estado, 45, (t) => ({ decisoes: lista.filter(([tick]) => tick === t).map(([, d]) => d) }));
        for (const e of fim.empresas) {
          let pagos = 0;
          for (const r of resultados) for (const l of r.lancamentos) if (l.empresa === e.id && l.descricao === "custo variável da fazenda") pagos -= l.valor;
          const emEstoque = Object.values(e.materiasPrimas).reduce((s, m) => s + m.estoque.valor, 0);
          expect({ empresa: e.id, valor: emEstoque }).toEqual({ empresa: e.id, valor: pagos });
          const ctx = criarContexto(fim);
          for (const [produto, m] of Object.entries(e.materiasPrimas)) {
            expect(m.estoque.quantidade).toBeLessThanOrEqual(capacidadeDeEstoque(e, produto, ctx) * (1 + 1e-9));
          }
        }
      }),
      { numRuns: 25 },
    );
  });

  test("a ordem das empresas não altera o resultado de cada uma", () => {
    const decisoes = (a: string, b: string): Decisao[] => [construir(a, "gado_de_corte", 3000), construir(b, "gado_leiteiro", 9000)];
    const x = partida(["Alfa", "Beta"]);
    const y = partida(["Beta", "Alfa"]); // ids trocados: Alfa = emp_02
    const rx = rodar(x, 60, (t) => ({ decisoes: t === 1 ? decisoes("emp_01", "emp_02") : [] })).estado;
    const ry = rodar(y, 60, (t) => ({ decisoes: t === 1 ? decisoes("emp_02", "emp_01") : [] })).estado;
    const resumo = (s: EstadoPartida, id: string) => {
      const e = empresa(s, id);
      return JSON.stringify({ caixa: e.caixa, fazendas: e.fazendas, mp: e.materiasPrimas, contabil: e.contabil });
    };
    expect(resumo(rx, "emp_01")).toBe(resumo(ry, "emp_02"));
    expect(resumo(rx, "emp_02")).toBe(resumo(ry, "emp_01"));
  });

  test("retomar de um JSON no meio da partida dá o mesmo resultado, byte a byte", () => {
    const estado = partida(["Alfa", "Beta"], { diasDeArmazenagem: 4 });
    const entrada = (t: number) => ({ decisoes: t === 1 ? [construir("emp_01", "gado_de_corte", 3000), construir("emp_02", "frango", 6000)] : [] });
    const meio = rodar(estado, 40, (t) => entrada(t)).estado;
    const retomado = JSON.parse(JSON.stringify(meio)) as EstadoPartida;
    const a = rodar(meio, 40, () => ({})).estado;
    const b = rodar(retomado, 40, () => ({})).estado;
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });
});
