import { describe, expect, test } from "bun:test";
import { ESTRATEGIAS_DO_CONFRONTO, type ResultadoSimulacao, type ResumoEmpresaSimulada } from "@simulador/motor";
import { lerArgumentos } from "../src/cli";
import { robosDoConfronto, sementeDaPartida } from "../src/confronto";
import { executarLote } from "../src/execucao";
import { combinacoes, gradePadrao } from "../src/melhorResposta";
import { calcularMetricas, LIMITES, porcentagem } from "../src/metricas";
import { executarEmParalelo, PoolDeTrabalhadores } from "../src/paralelo";
import { relatorioCsv, relatorioMarkdown } from "../src/relatorio";

describe("confrontos", () => {
  test("todos: as 7 estratégias, em ordem canônica", () => {
    expect(robosDoConfronto("todos", "x").map((r) => r.estrategia)).toEqual([...ESTRATEGIAS_DO_CONFRONTO]);
  });

  test("extremo: as 7 mais o preço mínimo", () => {
    expect(robosDoConfronto("extremo", "x").map((r) => r.estrategia)).toEqual([...ESTRATEGIAS_DO_CONFRONTO, "preco_minimo"]);
  });

  test("subconjuntos: 4 ou 5 estratégias distintas, em ordem canônica, reprodutíveis pela semente", () => {
    const tamanhos = new Set<number>();
    for (let i = 0; i < 60; i++) {
      const s = sementeDaPartida("t", i);
      const r = robosDoConfronto("subconjuntos", s).map((x) => x.estrategia);
      tamanhos.add(r.length);
      expect(new Set(r).size).toBe(r.length);
      expect(r).toEqual(ESTRATEGIAS_DO_CONFRONTO.filter((e) => r.includes(e)));
      expect(robosDoConfronto("subconjuntos", s)).toEqual(robosDoConfronto("subconjuntos", s));
    }
    expect([...tamanhos].sort()).toEqual([4, 5]);
  });

  test("sementes numeradas com 4 dígitos", () => {
    expect([sementeDaPartida("b", 0), sementeDaPartida("b", 499)]).toEqual(["b-0001", "b-0500"]);
  });
});

/** Monta uma simulação sintética: `vencedor` ganha; participações e crédito informados por estratégia. */
function simulacao(i: number, vencedor: string, extra: Partial<Record<string, Partial<ResumoEmpresaSimulada>>> = {}): ResultadoSimulacao {
  const estrategias = ["equilibrada", "marca", "passiva", "preco_baixo", "premium", "revenda", "aleatoria"];
  const ordem = [vencedor, ...estrategias.filter((e) => e !== vencedor)];
  const empresas: ResumoEmpresaSimulada[] = estrategias.map((estrategia, k) => ({
    id: `emp_0${k + 1}`,
    nome: estrategia,
    mercado: "mer_01",
    estrategia,
    intensidade: {},
    posicao: ordem.indexOf(estrategia) + 1,
    pontuacao: 100 - ordem.indexOf(estrategia),
    // A revenda lucra mais que a passiva por padrão (critério de referência); os testes sobrescrevem quando precisam.
    lucroAcumulado: estrategia === "revenda" ? 1_000_000 : (100 - ordem.indexOf(estrategia)) * 100,
    receitaAcumulada: 1000,
    participacaoReceita: 1 / 7,
    creditoFinal: 0,
    mesesComCredito: 0,
    maiorSequenciaDeMesesComCredito: 0,
    fotografias: { 4: { lucroAcumulado: 0, receitaAcumulada: 0, participacaoReceita: estrategia === vencedor ? 0.3 : 0.7 / 6 } },
    ...extra[estrategia],
  }));
  return { semente: `s${i}`, meses: 24, ticks: 720, mercados: [{ id: "mer_01", vencedor: empresas.find((e) => e.estrategia === vencedor)!.id, estrategiaVencedora: vencedor }], empresas };
}

describe("métricas de aceite (seção 10.4)", () => {
  test("taxas de vitória, posição média e critérios reprovados", () => {
    const vencedores = ["premium", "premium", "premium", "premium", "premium", "equilibrada", "equilibrada", "equilibrada", "marca", "revenda"];
    const m = calcularMetricas(vencedores.map((v, i) => simulacao(i, v)));
    const taxa = Object.fromEntries(m.porEstrategia.map((x) => [x.estrategia, x.taxaVitoria]));
    expect(taxa).toEqual({ aleatoria: 0, equilibrada: 0.3, marca: 0.1, passiva: 0, preco_baixo: 0, premium: 0.5, revenda: 0.1 });
    const falhas = m.criterios.filter((c) => !c.passou).map((c) => c.id);
    expect(falhas).toEqual(["vitoria_maxima", "vitoria_minima:preco_baixo"]);
    expect(m.aprovado).toBe(false);
    // Premium: 1º em 5 partidas; nas outras, fica atrás do vencedor e das estratégias que vêm antes dele na lista
    // sintética: 5º quando vence equilibrada (3×) ou marca (1×), 6º quando vence revenda (1×).
    expect(m.porEstrategia.find((x) => x.estrategia === "premium")!.posicaoMedia).toBeCloseTo((5 * 1 + 4 * 5 + 1 * 6) / 10, 12);
  });

  test("tudo equilibrado entre as razoáveis → aprovado", () => {
    const vencedores = ["premium", "premium", "equilibrada", "equilibrada", "marca", "marca", "revenda", "revenda", "preco_baixo", "preco_baixo"];
    const m = calcularMetricas(vencedores.map((v, i) => simulacao(i, v)));
    expect(m.criterios.filter((c) => !c.passou)).toEqual([]);
    expect(m.aprovado).toBe(true);
  });

  test("revenda (referência na camada 1): não precisa vencer 10%, mas precisa superar a passiva", () => {
    const vencedores = ["premium", "premium", "equilibrada", "equilibrada", "marca", "marca", "preco_baixo", "preco_baixo", "premium", "equilibrada"];
    // Revenda nunca vence, mas lucra mais que a passiva → aprovado.
    const acima = calcularMetricas(vencedores.map((v, i) => simulacao(i, v, { revenda: { lucroAcumulado: 100_000 }, passiva: { lucroAcumulado: 50_000 } })));
    expect(acima.criterios.map((c) => c.id)).not.toContain("vitoria_minima:revenda");
    expect(acima.criterios.find((c) => c.id === "referencia:revenda")!.passou).toBe(true);
    // Revenda lucra menos que a passiva → reprovado.
    const abaixo = calcularMetricas(vencedores.map((v, i) => simulacao(i, v, { revenda: { lucroAcumulado: 10_000 }, passiva: { lucroAcumulado: 50_000 } })));
    expect(abaixo.criterios.find((c) => c.id === "referencia:revenda")!.passou).toBe(false);
  });

  test("linha de base que vence reprova", () => {
    const vencedores = ["passiva", "premium", "equilibrada", "marca", "revenda", "preco_baixo", "premium", "equilibrada", "marca", "revenda"];
    const falhas = calcularMetricas(vencedores.map((v, i) => simulacao(i, v))).criterios.filter((c) => !c.passou).map((c) => c.id);
    expect(falhas).toEqual(["linha_de_base:passiva"]);
  });

  test("diferenças não visíveis no mês 4 reprovam", () => {
    const sem = { 4: { lucroAcumulado: 0, receitaAcumulada: 0, participacaoReceita: 1 / 7 } };
    const extra = Object.fromEntries(["equilibrada", "marca", "passiva", "preco_baixo", "premium", "revenda", "aleatoria"].map((e) => [e, { fotografias: sem }]));
    const vencedores = ["premium", "equilibrada", "marca", "revenda", "preco_baixo"];
    const m = calcularMetricas(vencedores.map((v, i) => simulacao(i, v, extra)));
    expect(m.fracaoPartidasComDiferencaVisivel).toBe(0);
    expect(m.criterios.find((c) => c.id === "diferencas_visiveis")!.passou).toBe(false);
  });

  test("crédito prolongado conta só as razoáveis e usa a maior sequência", () => {
    const extra = { preco_baixo: { maiorSequenciaDeMesesComCredito: LIMITES.mesesDeCreditoProlongado }, aleatoria: { maiorSequenciaDeMesesComCredito: 20 } };
    const vencedores = ["premium", "equilibrada", "marca", "revenda", "preco_baixo"];
    const m = calcularMetricas(vencedores.map((v, i) => simulacao(i, v, extra)));
    expect(m.fracaoRazoaveisComCreditoProlongado).toBeCloseTo(1 / 5, 12);
    expect(m.criterios.find((c) => c.id === "credito_prolongado")!.passou).toBe(false);
  });

  test("estratégia extrema: critério próprio e fora do critério de vitória máxima", () => {
    const vencedores = ["preco_minimo", "preco_minimo", "premium", "equilibrada", "marca", "revenda", "preco_baixo", "premium", "equilibrada", "marca"];
    const resultados = vencedores.map((v, i) => {
      const r = simulacao(i, v === "preco_minimo" ? "premium" : v);
      r.empresas.push({ ...r.empresas[0]!, id: "emp_08", nome: "preco_minimo", estrategia: "preco_minimo", posicao: v === "preco_minimo" ? 1 : 8 });
      if (v === "preco_minimo") r.mercados[0] = { id: "mer_01", vencedor: "emp_08", estrategiaVencedora: "preco_minimo" };
      return r;
    });
    const m = calcularMetricas(resultados, { estrategiaExtrema: "preco_minimo" });
    const criterio = m.criterios.find((c) => c.id === "melhor_resposta_extrema")!;
    expect([criterio.valor, criterio.passou]).toEqual(["20,0%", false]);
    expect(m.criterios.find((c) => c.id === "vitoria_maxima")!.valor.startsWith("preco_minimo")).toBe(false);
  });

  test("porcentagem em pt-BR", () => {
    expect([porcentagem(0.7), porcentagem(0.1234), porcentagem(0)]).toEqual(["70,0%", "12,3%", "0,0%"]);
  });
});

describe("relatórios", () => {
  const resultados = ["premium", "revenda"].map((v, i) => simulacao(i, v));
  const metricas = calcularMetricas(resultados);
  const info = {
    presetId: "p",
    presetVersao: "1",
    versaoMotor: "m",
    versaoCatalogo: "c",
    confronto: "todos",
    partidas: 2,
    meses: 24,
    prefixo: "b",
    trabalhadores: 1,
    duracaoSegundos: 2,
    ticksSimulados: 1440,
  };

  test("markdown traz o resultado, os critérios e a tabela por estratégia", () => {
    const md = relatorioMarkdown(info, metricas);
    expect(md).toContain(`**Resultado: ${metricas.aprovado ? "APROVADO" : "REPROVADO"}**`);
    for (const c of metricas.criterios) expect(md).toContain(c.descricao);
    for (const e of ESTRATEGIAS_DO_CONFRONTO) expect(md).toContain(`| ${e} |`);
    expect(md).toContain("720 ticks/s");
  });

  test("confronto de diagnóstico: cabeçalho próprio, sem APROVADO/REPROVADO", () => {
    const md = relatorioMarkdown({ ...info, confronto: "subconjuntos", diagnostico: true }, metricas);
    expect(md).toContain("Confronto de diagnóstico — não entra na aprovação");
    expect(md).not.toContain("**Resultado:");
  });

  test("CSV: cabeçalho, uma linha por empresa por partida, campos com aspas escapados", () => {
    const linhas = relatorioCsv(resultados).trimEnd().split("\n");
    expect(linhas.length).toBe(1 + 2 * 7);
    expect(linhas[0]!.split(",").length).toBe(15);
    const comIntensidade = relatorioCsv([simulacao(9, "premium", { premium: { intensidade: { premio: 0.2, pd: 0.1 } } })]);
    expect(comIntensidade).toContain('"{""premio"":0.2,""pd"":0.1}"');
  });
});

describe("melhor resposta", () => {
  test("grade padrão: faixa, meio e meia faixa além das pontas (sem negativos para parâmetros positivos)", () => {
    // margem na faixa [0,15; 0,35]: meia faixa = 0,10
    expect(gradePadrao("preco_baixo").margem).toEqual([0.05, 0.15, 0.25, 0.35, 0.45].map((x) => expect.closeTo(x, 12)));
    expect(gradePadrao("premium").pd).toEqual([0.045, 0.08, 0.115, 0.15, 0.185].map((x) => expect.closeTo(x, 12)));
    // publicidade na faixa [0; 0,02]: o ponto abaixo da faixa seria −0,01 e é cortado em 0
    expect(gradePadrao("preco_baixo").publicidade).toEqual([0, 0, 0.01, 0.02, 0.03].map((x) => expect.closeTo(x, 12)));
    expect(gradePadrao("equilibrada").ajuste).toEqual([-0.07, -0.03, 0.01, 0.05, 0.09].map((x) => expect.closeTo(x, 12)));
  });

  test("produto cartesiano determinístico", () => {
    expect(combinacoes({ b: [1, 2], a: [10] })).toEqual([
      { a: 10, b: 1 },
      { a: 10, b: 2 },
    ]);
    expect(combinacoes({})).toEqual([{}]);
  });
});

describe("execução", () => {
  test("o resultado não depende do número de workers", async () => {
    const base = { presetId: "introdutorio/padrao", confronto: "subconjuntos" as const, prefixo: "par", meses: 2 };
    const sequencial = executarLote({ ...base, indices: [0, 1, 2] });
    const paralelo = await executarEmParalelo(base, 3, 2);
    expect(paralelo).toEqual(sequencial);
  }, 60_000);

  test("pool reaproveitado em várias rodadas dá os mesmos resultados da execução sequencial", async () => {
    const pool = new PoolDeTrabalhadores(2);
    try {
      for (const confronto of ["todos", "subconjuntos"] as const) {
        const base = { presetId: "introdutorio/padrao", confronto, prefixo: "pool", meses: 1 };
        expect(await pool.executar(base, 3)).toEqual(executarLote({ ...base, indices: [0, 1, 2] }));
      }
    } finally {
      pool.encerrar();
    }
  }, 60_000);

  test("preset desconhecido é rejeitado", () => {
    expect(() => executarLote({ presetId: "nao/existe", confronto: "todos", prefixo: "x", indices: [0], meses: 1 })).toThrow("preset desconhecido");
  });
});

describe("argumentos da CLI", () => {
  test("padrões", () => {
    const o = lerArgumentos([], 8);
    expect([o.comando, o.preset, o.sementes, o.meses, o.confrontos, o.trabalhadores, o.exigirAprovacao]).toEqual([
      "confronto",
      "introdutorio/padrao",
      500,
      24,
      ["todos", "subconjuntos", "extremo"],
      8,
      false,
    ]);
  });

  test("opções explícitas e melhor resposta", () => {
    const o = lerArgumentos(["melhor-resposta", "--estrategia", "premium", "--sementes", "10", "--meses", "12", "--trabalhadores", "2", "--exigir-aprovacao"], 8);
    expect([o.comando, o.estrategia, o.sementes, o.meses, o.trabalhadores, o.exigirAprovacao]).toEqual(["melhor-resposta", "premium", 10, 12, 2, true]);
    expect(lerArgumentos(["--confronto", "todos"], 1).confrontos).toEqual(["todos"]);
  });

  test("erros claros", () => {
    expect(() => lerArgumentos(["--preset", "x"], 1)).toThrow("preset desconhecido");
    expect(() => lerArgumentos(["--sementes", "0"], 1)).toThrow("inteiro ≥ 1");
    expect(() => lerArgumentos(["--sementes"], 1)).toThrow("precisa de um valor");
    expect(() => lerArgumentos(["--confronto", "mundial"], 1)).toThrow("confronto desconhecido");
    expect(() => lerArgumentos(["melhor-resposta"], 1)).toThrow("--estrategia");
  });
});
