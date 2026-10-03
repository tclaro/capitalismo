/**
 * Teste de carga: contas puras (plano de equipes, percentis, critérios) e uma carga pequena de verdade,
 * com o servidor num processo próprio em 127.0.0.1.
 */
import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { lerArgumentos, relatorioDaCarga } from "../src/cli";
import { criteriosDeCarga, type EntradaDosCriterios, idDaEmpresa, LIMITES, percentil, planoDeEquipes, resumir } from "../src/metricas";

describe("plano de equipes", () => {
  test("60 alunos em 2 mercados de 8 vagas: 16 equipes, os 16 primeiros as criam, os outros entram em rodízio", () => {
    const p = planoDeEquipes(60, 2, 8);
    expect(p).toHaveLength(60);
    expect(p.filter((x) => x.tipo === "nova")).toHaveLength(16);
    expect(p.slice(0, 16).every((x) => x.tipo === "nova")).toBe(true);
    expect(p.slice(16).every((x) => x.tipo === "existente")).toBe(true);
    // O aluno 17 entra na equipe 1, o 18 na 2, e assim por diante (60 − 16 = 44 entram).
    expect(p[16]!.empresa).toBe("emp_01");
    expect(p[31]!.empresa).toBe("emp_16");
    expect(p[32]!.empresa).toBe("emp_01");
    const porEquipe = new Map<string, number>();
    for (const x of p) porEquipe.set(x.empresa, (porEquipe.get(x.empresa) ?? 0) + 1);
    expect(porEquipe.size).toBe(16);
    expect([...porEquipe.values()].sort((a, b) => a - b)).toEqual([3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4]); // 60 = 12×4 + 4×3
  });

  test("poucos alunos: uma equipe por aluno; mais alunos que vagas: equipes = vagas", () => {
    expect(planoDeEquipes(3, 1, 8).map((x) => [x.tipo, x.empresa])).toEqual([
      ["nova", "emp_01"],
      ["nova", "emp_02"],
      ["nova", "emp_03"],
    ]);
    expect(planoDeEquipes(10, 1, 4).filter((x) => x.tipo === "nova")).toHaveLength(4);
    expect(() => planoDeEquipes(0, 1, 4)).toThrow();
  });

  test("cada mercado usa cada cor uma vez (as cores se repetem de um mercado para o outro)", () => {
    const novas = planoDeEquipes(16, 2, 8).filter((x) => x.tipo === "nova");
    const primeiro = novas.slice(0, 8).map((x) => x.cor);
    const segundo = novas.slice(8).map((x) => x.cor);
    expect(new Set(primeiro).size).toBe(8);
    expect(primeiro).toEqual(segundo);
  });

  test("nomes únicos e ids de empresa com dois dígitos", () => {
    const p = planoDeEquipes(30, 2, 8);
    expect(new Set(p.map((x) => x.nome)).size).toBe(30);
    expect(idDaEmpresa(3)).toBe("emp_03");
  });
});

describe("percentis e resumo (à mão)", () => {
  test("vizinho mais próximo: 1..10 → p50 = 5, p95 = 10, p10 = 1", () => {
    const v = [3, 1, 2, 5, 4, 7, 6, 9, 8, 10];
    expect([percentil(v, 50), percentil(v, 95), percentil(v, 10), percentil(v, 100), percentil(v, 0)]).toEqual([5, 10, 1, 10, 1]);
    expect(percentil([], 50)).toBeNaN();
  });

  test("resumo: média, p50, p95 e máximo", () => {
    expect(resumir([2, 4, 6, 8])).toEqual({ n: 4, media: 5, p50: 4, p95: 8, max: 8 });
    expect(resumir([]).n).toBe(0);
    expect(resumir([]).media).toBeNaN();
  });
});

const boa: EntradaDosCriterios = {
  alunos: 60,
  falhasDeEntrada: 0,
  quedas: 0,
  latencias: [1, 2, 3, 4, 5],
  comandosEnviados: 1000,
  comandosComProblema: 0,
  ticksEsperados: 100,
  ticksJogados: 100,
  intervalosMs: [980, 1000, 1010],
  segundosPorTick: 1,
};
const situacao = (e: EntradaDosCriterios, id: string) => criteriosDeCarga(e).find((c) => c.id === id)!.passou;

describe("critérios de aprovação (limites conferidos dos dois lados)", () => {
  test("uma execução boa passa em todos", () => {
    expect(criteriosDeCarga(boa).every((c) => c.passou)).toBe(true);
    expect(criteriosDeCarga(boa).map((c) => c.id)).toEqual(["entrada", "quedas", "latencia", "comandos", "relogio", "intervalo"]);
  });

  test("entrada e quedas: qualquer falha reprova", () => {
    expect([situacao({ ...boa, falhasDeEntrada: 0 }, "entrada"), situacao({ ...boa, falhasDeEntrada: 1 }, "entrada")]).toEqual([true, false]);
    expect([situacao({ ...boa, quedas: 0 }, "quedas"), situacao({ ...boa, quedas: 1 }, "quedas")]).toEqual([true, false]);
  });

  test("latência p95 até 250 ms; sem nenhuma medida, reprova", () => {
    const com = (ms: number) => situacao({ ...boa, latencias: Array.from({ length: 100 }, (_, i) => (i < 95 ? ms : 9999)) }, "latencia");
    expect([com(250), com(250.5)]).toEqual([true, false]);
    expect(situacao({ ...boa, latencias: [] }, "latencia")).toBe(false);
  });

  test("comandos com problema: até 1% (10 de 1000 passa, 11 reprova)", () => {
    expect([10, 11].map((n) => situacao({ ...boa, comandosComProblema: n }, "comandos"))).toEqual([true, false]);
    expect(situacao({ ...boa, comandosEnviados: 0, comandosComProblema: 0 }, "comandos")).toBe(true);
  });

  test("relógio: atraso de até 5% (95 de 100 passa, 94 reprova); adiantado não reprova", () => {
    expect([95, 94, 100, 103].map((j) => situacao({ ...boa, ticksJogados: j }, "relogio"))).toEqual([true, false, true, true]);
  });

  test("intervalo entre atualizações: p95 até 1,5× o nominal", () => {
    const com = (ms: number) => situacao({ ...boa, intervalosMs: Array.from({ length: 100 }, (_, i) => (i < 95 ? ms : 99_999)), segundosPorTick: 2 }, "intervalo");
    expect([com(3000), com(3001)]).toEqual([true, false]);
    expect(situacao({ ...boa, intervalosMs: [] }, "intervalo")).toBe(false);
  });

  test("os limites são os documentados", () => {
    expect(LIMITES).toEqual({ falhasDeEntrada: 0, quedas: 0, latenciaP95Ms: 250, fracaoDeComandosComProblema: 0.01, atrasoDoRelogio: 0.05, intervaloP95Relativo: 1.5 });
  });
});

describe("argumentos da linha de comando", () => {
  test("padrões: turma de 60 em 2 mercados de 8 vagas, cadeia mínima, servidor próprio", () => {
    expect(lerArgumentos([])).toEqual({ alunos: 60, mercados: 2, vagas: 8, preset: "cadeia/minima", duracao: 60, velocidade: 0.5, intervalo: 8000, robos: null, url: null, chave: null, exigirAprovacao: false });
  });

  test("valores válidos e inválidos", () => {
    expect(lerArgumentos(["--alunos", "30", "--velocidade", "1,5", "--exigir-aprovacao"])).toMatchObject({ alunos: 30, velocidade: 1.5, exigirAprovacao: true });
    expect(() => lerArgumentos(["--alunos", "0"])).toThrow("--alunos");
    expect(() => lerArgumentos(["--velocidade", "0.1"])).toThrow("--velocidade");
    expect(() => lerArgumentos(["--mercados", "4"])).toThrow("--mercados");
    expect(() => lerArgumentos(["--alunos", "2.5"])).toThrow("inteiro");
    expect(() => lerArgumentos(["--alunos"])).toThrow("precisa de um valor");
  });

  test("--url exige a chave de professor do servidor e perde a barra final", () => {
    expect(() => lerArgumentos(["--url", "http://10.0.0.1:47800"])).toThrow("--chave");
    expect(lerArgumentos(["--url", "http://10.0.0.1:47800/", "--chave", "x"])).toMatchObject({ url: "http://10.0.0.1:47800", chave: "x" });
  });
});

describe("relatório", () => {
  test("mostra o resultado, os critérios e as recusas", () => {
    const criterios = criteriosDeCarga({ ...boa, quedas: 2 });
    const r = {
      opcoes: { base: "http://127.0.0.1:1", chave: "x", alunos: 60, mercados: 2, vagasPorMercado: 8, presetId: "cadeia/minima", robos: null, segundosPorTick: 1, duracaoSegundos: 60, intervaloDecisaoMs: 8000, semente: 1 },
      codigo: "ABCDE",
      falhasDeEntrada: 0,
      quedas: 2,
      comandosEnviados: 10,
      comandosComProblema: 1,
      recusas: { "sem permissão": 1 },
      latencia: resumir([1]),
      intervalo: resumir([1000]),
      tamanhoDaMensagem: resumir([20_000]),
      mensagensRecebidas: 5,
      bytesRecebidos: 100_000,
      ticksEsperados: 60,
      ticksJogados: 60,
      criterios,
      aprovado: false,
    };
    const md = relatorioDaCarga(r, { recursos: { memoriaMb: 66, cpuSegundos: 3.1 }, versao: "0.1.0" });
    expect(md).toContain("**Resultado: REPROVADO** (5 de 6 critérios)");
    expect(md).toContain("**FALHOU**");
    expect(md).toContain("| sem permissão | 1 |");
    expect(md).toContain("66 MB de memória");
    expect(md).toContain("60 em 16 equipe(s)");
  });
});

describe("carga de verdade (servidor em processo próprio, 127.0.0.1)", () => {
  test("12 alunos em 4 equipes por 8 s: aprovado, sem queda, e o servidor é derrubado ao fim", async () => {
    const cli = join(import.meta.dir, "..", "src", "cli.ts");
    const proc = Bun.spawn(["bun", cli, "--alunos", "12", "--mercados", "1", "--vagas", "4", "--duracao", "8", "--intervalo", "1500", "--exigir-aprovacao"], { stdout: "pipe", stderr: "pipe" });
    const saida = await new Response(proc.stdout).text();
    expect(await proc.exited).toBe(0);
    expect(saida).toContain("**Resultado: APROVADO** (6 de 6 critérios)");
    expect(saida).toContain("12 de 12");
    expect(saida).toMatch(/0 de \d+ \(0,0%\)/);
    // O servidor local foi derrubado: a porta anunciada não responde mais.
    const porta = /em http:\/\/127\.0\.0\.1:(\d+)/.exec(saida)?.[1];
    expect(porta).toBeDefined();
    expect(await fetch(`http://127.0.0.1:${porta}/api/servidor`).then(() => "respondeu", () => "fechado")).toBe("fechado");
  }, 60_000);
});
