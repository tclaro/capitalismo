/**
 * Regras da tela do professor e formatação, sem DOM.
 */
import { describe, expect, test } from "bun:test";
import { ConfigSala, type EstadoRelogio, validar } from "@simulador/compartilhado";
import fc from "fast-check";
import { formatarNumero, formatarPercentual, formatarPontuacao, formatarVelocidade } from "../src/formato";
import { acoesDoRelogio, configDoFormulario, duracaoDoMes, explicarRecusa, type FormularioSala, formularioPadrao, textoDoStatus, VELOCIDADES } from "../src/professor/regras";
import { salaDeExemplo } from "./fixtures";

const ESTRATEGIAS = ["preco_baixo", "premium", "marca", "equilibrada", "revenda"];

describe("ações do relógio", () => {
  test("tabela de estados", () => {
    const quais = (status: EstadoRelogio["status"], motivoPausa: EstadoRelogio["motivoPausa"] = null) =>
      Object.entries(acoesDoRelogio({ status, motivoPausa }))
        .filter(([, v]) => v)
        .map(([k]) => k);
    expect(quais("preparacao")).toEqual(["iniciar", "estender", "encerrar"]);
    expect(quais("rodando")).toEqual(["pausar", "estender", "encerrar"]);
    expect(quais("pausada", "manual")).toEqual(["retomar", "avancar", "estender", "encerrar"]);
    expect(quais("pausada", "fim_do_mes")).toEqual(["retomar", "avancar", "estender", "encerrar"]);
    expect(quais("pausada", "erro")).toEqual(["retomar", "avancar", "estender", "encerrar"]);
    expect(quais("pausada", "duracao_atingida")).toEqual(["estender", "encerrar"]);
    expect(quais("encerrada")).toEqual([]);
  });

  test("o que a tela oferece o servidor aceita (e o que ela esconde ele recusa)", () => {
    // Cada estado alcançável de uma sala real × cada ação: a tela e a Sala concordam.
    const estados: [string, (s: ReturnType<typeof salaDeExemplo>) => void][] = [
      ["preparação", () => {}],
      ["rodando", (s) => s.jogar(2)],
      ["pausa manual", (s) => (s.jogar(2), s.sala.comandoRelogio(s.id(), s.sala.estado.tick, "pausar"))],
      ["duração atingida", (s) => s.jogar(31)],
      ["encerrada", (s) => s.sala.encerrar(s.id())],
    ];
    for (const [nome, preparar] of estados) {
      for (const acao of ["iniciar", "pausar", "retomar", "avancar"] as const) {
        const s = salaDeExemplo({ duracaoMeses: 1 });
        preparar(s);
        const oferece = acoesDoRelogio(s.sala)[acao];
        const aceita = s.sala.comandoRelogio(s.id(), s.sala.estado.tick, acao, "tick").ok;
        expect({ estado: nome, acao, oferece }).toEqual({ estado: nome, acao, oferece: aceita });
      }
    }
  });

  test("textos de estado", () => {
    expect(textoDoStatus({ status: "pausada", motivoPausa: "fim_do_mes", modo: "rodada" })).toContain("podem decidir");
    expect(textoDoStatus({ status: "pausada", motivoPausa: "duracao_atingida", modo: "continuo" })).toContain("estenda");
    expect(textoDoStatus({ status: "pausada", motivoPausa: "erro", modo: "continuo" })).toContain("falha");
    expect(textoDoStatus({ status: "rodando", motivoPausa: null, modo: "rodada" })).toContain("fim do mês");
    expect(explicarRecusa("desatualizado")).toContain("desatualizada");
    expect(explicarRecusa("a partida já começou")).toBe("a partida já começou");
    expect(explicarRecusa(undefined)).toBe("O servidor recusou o comando.");
  });
});

describe("formulário de criação", () => {
  test("padrão válido pelo mesmo esquema do servidor", () => {
    const c = configDoFormulario(formularioPadrao("introdutorio/padrao", ESTRATEGIAS));
    expect(c.ok).toBe(true);
    if (!c.ok) return;
    expect(validar(ConfigSala, c.config).ok).toBe(true);
    expect(c.config).toMatchObject({ robosNasVagasVazias: "equilibrada", vagasPorMercado: 6, duracaoMeses: 24, segundosPorTick: 3 });
  });

  test("vagas vazias inativas; avanço por prontas só no modo rodada", () => {
    const base = formularioPadrao("introdutorio/padrao", ESTRATEGIAS);
    const inativas = configDoFormulario({ ...base, robos: "" });
    expect(inativas.ok && inativas.config.robosNasVagasVazias).toBeNull();
    const continuo = configDoFormulario({ ...base, modo: "continuo", avancoQuandoProntas: true });
    expect(continuo.ok && continuo.config.avancoQuandoProntas).toBe(false);
    const rodada = configDoFormulario({ ...base, modo: "rodada", avancoQuandoProntas: true });
    expect(rodada.ok && rodada.config.avancoQuandoProntas).toBe(true);
  });

  test("qualquer combinação dos controles gera configuração aceita pelo servidor", () => {
    const formulario: fc.Arbitrary<FormularioSala> = fc.record({
      presetId: fc.constant("introdutorio/padrao"),
      mercados: fc.integer({ min: 1, max: 3 }),
      vagasPorMercado: fc.integer({ min: 2, max: 8 }),
      robos: fc.constantFrom("", ...ESTRATEGIAS),
      duracaoMeses: fc.integer({ min: 1, max: 120 }),
      segundosPorTick: fc.constantFrom(...VELOCIDADES),
      modo: fc.constantFrom("continuo" as const, "rodada" as const),
      edicaoNaPausa: fc.boolean(),
      rankingVisivel: fc.constantFrom("completo" as const, "propria" as const, "oculto" as const),
      avancoQuandoProntas: fc.boolean(),
      criterio: fc.constantFrom("lucro_acumulado" as const, "participacao_receita" as const),
    });
    fc.assert(
      fc.property(formulario, (f) => {
        const c = configDoFormulario(f);
        return c.ok && validar(ConfigSala, c.config).ok;
      }),
    );
  });

  test("fora da faixa: erro legível, sem chegar ao servidor", () => {
    const base = formularioPadrao("introdutorio/padrao", ESTRATEGIAS);
    expect(configDoFormulario({ ...base, segundosPorTick: 0.1 })).toEqual({ ok: false, erro: expect.stringContaining("velocidade") });
    expect(configDoFormulario({ ...base, duracaoMeses: 0 })).toEqual({ ok: false, erro: expect.stringContaining("duracaoMeses") });
    expect(configDoFormulario({ ...base, duracaoMeses: 2.5 }).ok).toBe(false);
  });

  test("duração do mês em tempo real", () => {
    expect(duracaoDoMes(3)).toBe("1 min 30 s por mês");
    expect(duracaoDoMes(2)).toBe("1 min por mês");
    expect(duracaoDoMes(0.5)).toBe("15 s por mês");
    expect(duracaoDoMes(10)).toBe("5 min por mês");
  });
});

describe("formatação", () => {
  test("números, porcentagens, pontuação e velocidade", () => {
    expect(formatarNumero(1234567.891, 1)).toBe("1.234.567,9");
    expect(formatarNumero(-1234)).toBe("-1.234");
    expect(formatarNumero(-0.04, 1)).toBe("0,0");
    expect(formatarNumero(0)).toBe("0");
    expect(formatarPercentual(0.1234)).toBe("12,3%");
    expect(formatarPercentual(1, 0)).toBe("100%");
    expect(formatarPontuacao(1234.5, "lucro_acumulado")).toBe("R$ 1.234,50");
    expect(formatarPontuacao(-10, "lucro_acumulado")).toBe("-R$ 10,00");
    expect(formatarPontuacao(33.333, "participacao_receita")).toBe("33,3 pts");
    expect(formatarVelocidade(0.5)).toBe("0,5 s por dia");
    expect(formatarVelocidade(3)).toBe("3 s por dia");
  });

  test("formatarNumero concorda com o Intl pt-BR", () => {
    fc.assert(
      fc.property(fc.double({ min: -1e9, max: 1e9, noNaN: true }), fc.integer({ min: 0, max: 2 }), (x, casas) => {
        const esperado = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas }).format(Number(x.toFixed(casas)));
        return formatarNumero(x, casas) === esperado.replace(/^-(0(,0+)?)$/, "$1");
      }),
    );
  });
});
