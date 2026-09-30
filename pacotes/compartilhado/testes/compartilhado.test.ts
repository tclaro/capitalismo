import { describe, expect, test } from "bun:test";
import fc from "fast-check";
import {
  chaveDeNome,
  ConfigSala,
  CriarSala,
  DecisaoDoAluno,
  dataDoTick,
  descreverData,
  EntrarAluno,
  ehFimDoMes,
  ehFronteiraDeSemana,
  formatarReais,
  fronteirasDeSemana,
  lerReais,
  MensagemCliente,
  normalizarNome,
  PALETA_EQUIPES,
  ticksAteProxima,
  validar,
} from "../src";

describe("dinheiro na interface", () => {
  test("formatar: milhar com ponto, decimal com vírgula, negativo", () => {
    expect(formatarReais(0)).toBe("R$ 0,00");
    expect(formatarReais(5)).toBe("R$ 0,05");
    expect(formatarReais(123456)).toBe("R$ 1.234,56");
    expect(formatarReais(100000000)).toBe("R$ 1.000.000,00");
    expect(formatarReais(-5)).toBe("-R$ 0,05");
    expect(formatarReais(123456, { simbolo: false })).toBe("1.234,56");
    expect(() => formatarReais(1.5)).toThrow(RangeError);
  });

  test("ler: formatos aceitos", () => {
    const casos: [string, number | null][] = [
      ["6", 600],
      ["6,5", 650],
      ["6,50", 650],
      ["R$ 1.234,56", 123456],
      ["1.234", 123400],
      ["1.234.567,8", 123456780],
      ["12.5", 1250],
      ["12.50", 1250],
      [",99", 99],
      ["  R$  7 ", 700],
      ["-3,20", -320],
      ["-R$ 0,05", -5],
      ["R$ -0,05", -5],
      ["0", 0],
    ];
    for (const [entrada, esperado] of casos) expect({ entrada, valor: lerReais(entrada) }).toEqual({ entrada, valor: esperado });
  });

  test("ler: formatos inválidos devolvem null", () => {
    for (const entrada of ["", "abc", "1,2,3", "1,234", "12.345,6.7", "1.23.4", "6,555", "12.345.6", "R$", "--1", "-R$-1", "1e5", "Infinity"]) {
      expect({ entrada, valor: lerReais(entrada) }).toEqual({ entrada, valor: null });
    }
  });

  test("ida e volta: lerReais(formatarReais(c)) = c, para qualquer centavo (propriedade)", () => {
    fc.assert(
      fc.property(fc.integer({ min: -1e13, max: 1e13 }), (c) => lerReais(formatarReais(c)) === c && lerReais(formatarReais(c, { simbolo: false })) === c),
    );
  });

  test("nunca lança exceção com texto arbitrário (propriedade)", () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        const r = lerReais(s);
        return r === null || Number.isSafeInteger(r);
      }),
    );
  });
});

describe("calendário", () => {
  test("data do tick: mês, dia, semana", () => {
    expect(dataDoTick(0, 30)).toEqual({ mes: 1, dia: 0, semana: 1 });
    expect(dataDoTick(1, 30)).toEqual({ mes: 1, dia: 1, semana: 1 });
    expect(dataDoTick(7, 30)).toEqual({ mes: 1, dia: 7, semana: 1 });
    expect(dataDoTick(8, 30)).toEqual({ mes: 1, dia: 8, semana: 2 });
    expect(dataDoTick(30, 30)).toEqual({ mes: 1, dia: 30, semana: 4 });
    expect(dataDoTick(31, 30)).toEqual({ mes: 2, dia: 1, semana: 1 });
  });

  test("fronteiras de semana: 7, 14, 21 e o último dia (escaladas para outros tamanhos de mês)", () => {
    expect(fronteirasDeSemana(30)).toEqual([7, 14, 21, 30]);
    expect(fronteirasDeSemana(60)).toEqual([14, 28, 42, 60]);
    expect(fronteirasDeSemana(4)).toEqual([1, 2, 3, 4]);
    expect([7, 14, 21, 30, 37].map((t) => ehFronteiraDeSemana(t, 30))).toEqual([true, true, true, true, true]);
    expect([0, 6, 8, 29].map((t) => ehFronteiraDeSemana(t, 30))).toEqual([false, false, false, false]);
    expect([30, 60, 31, 0].map((t) => ehFimDoMes(t, 30))).toEqual([true, true, false, false]);
  });

  test("ticks até a próxima fronteira", () => {
    expect(ticksAteProxima(0, 30, "tick")).toBe(1);
    expect(ticksAteProxima(0, 30, "semana")).toBe(7);
    expect(ticksAteProxima(7, 30, "semana")).toBe(7);
    expect(ticksAteProxima(21, 30, "semana")).toBe(9);
    expect(ticksAteProxima(0, 30, "mes")).toBe(30);
    expect(ticksAteProxima(30, 30, "mes")).toBe(30);
    expect(ticksAteProxima(45, 30, "mes")).toBe(15);
  });

  test("descrição da data", () => {
    expect(descreverData(0, 30)).toBe("Antes do início");
    expect(descreverData(1, 30)).toBe("Ano 1, jan, dia 1");
    expect(descreverData(12 * 30 + 45, 30)).toBe("Ano 2, fev, dia 15");
  });
});

describe("equipes", () => {
  test("paleta: 8 cores com ids únicos", () => {
    expect(PALETA_EQUIPES).toHaveLength(8);
    expect(new Set(PALETA_EQUIPES.map((c) => c.id)).size).toBe(8);
  });

  test("normalizar nome: espaços, controle, tamanho e caracteres", () => {
    expect(normalizarNome("  Os   Vencedores  ")).toBe("Os Vencedores");
    expect(normalizarNome("Ágil & Cia.")).toBe("Ágil & Cia.");
    expect(normalizarNome("a\u0000b​c")).toBe("abc");
    expect(normalizarNome("")).toBeNull();
    expect(normalizarNome("   ")).toBeNull();
    expect(normalizarNome("x".repeat(25))).toBeNull();
    expect(normalizarNome("<script>")).toBeNull();
    expect(normalizarNome("😀 grupo")).toBeNull();
  });

  test("chave de nome ignora caixa e acentos", () => {
    expect(chaveDeNome("Equipe Ágil")).toBe(chaveDeNome("equipe agil"));
  });
});

describe("protocolo", () => {
  test("decisão de produto válida; campo empresa é rejeitado (objeto estrito)", () => {
    expect(validar(DecisaoDoAluno, { tipo: "produto", produto: "leite_engarrafado", preco: 600 }).ok).toBe(true);
    expect(validar(DecisaoDoAluno, { tipo: "produto", produto: "leite_engarrafado", preco: null }).ok).toBe(true);
    expect(validar(DecisaoDoAluno, { tipo: "produto", produto: "leite_engarrafado", preco: 600, empresa: "emp_02" }).ok).toBe(false);
  });

  test("decisões inválidas: preço fracionário, verba negativa, quantidade de PV fora da faixa, tipo desconhecido", () => {
    for (const d of [
      { tipo: "produto", produto: "leite", preco: 6.5 },
      { tipo: "produto", produto: "leite", publicidadeMensal: -1 },
      { tipo: "produto", produto: "Leite Grande" },
      { tipo: "abrirPontoDeVenda", quantidade: 0 },
      { tipo: "abrirPontoDeVenda", quantidade: 21 },
      { tipo: "comprarConcorrente" },
    ]) {
      expect({ d, ok: validar(DecisaoDoAluno, d).ok }).toEqual({ d, ok: false });
    }
  });

  test("configuração da sala: padrões aplicados", () => {
    const r = validar(ConfigSala, { presetId: "introdutorio/padrao" });
    expect(r).toEqual({
      ok: true,
      valor: {
        presetId: "introdutorio/padrao",
        mercados: 1,
        vagasPorMercado: 6,
        robosNasVagasVazias: null,
        duracaoMeses: 24,
        segundosPorTick: 3,
        modo: "continuo",
        edicaoNaPausa: false,
        rankingVisivel: "completo",
        avancoQuandoProntas: false,
        criterio: "lucro_acumulado",
      },
    });
    expect(validar(ConfigSala, { presetId: "x", vagasPorMercado: 9 }).ok).toBe(false);
    expect(validar(ConfigSala, { presetId: "x", segundosPorTick: 0.1 }).ok).toBe(false);
    expect(validar(CriarSala, { chave: "segredo", config: { presetId: "x" } }).ok).toBe(true);
  });

  test("entrar como aluno: código normalizado para maiúsculas, equipe nova com cor da paleta", () => {
    const r = validar(EntrarAluno, { codigo: "k7qmz", nome: "Ana", equipe: { tipo: "nova", empresa: "emp_01", nome: "Leiteria", cor: "verde" } });
    expect(r.ok && r.valor.codigo).toBe("K7QMZ");
    expect(validar(EntrarAluno, { codigo: "K7QMZ", nome: "Ana", equipe: { tipo: "nova", empresa: "emp_01", nome: "L", cor: "roxo" } }).ok).toBe(false);
    expect(validar(EntrarAluno, { codigo: "K7Q", nome: "Ana", equipe: { tipo: "existente", empresa: "emp_01" } }).ok).toBe(false);
  });

  test("mensagens do cliente: válidas e inválidas", () => {
    expect(validar(MensagemCliente, { tipo: "decidir", idComando: "abc-12345", decisoes: [{ tipo: "produto", produto: "leite", preco: 600 }] }).ok).toBe(true);
    expect(validar(MensagemCliente, { tipo: "relogio", idComando: "abc-12345", tickEsperado: 30, acao: "avancar", unidade: "mes" }).ok).toBe(true);
    expect(validar(MensagemCliente, { tipo: "ping" }).ok).toBe(true);
    expect(validar(MensagemCliente, { tipo: "decidir", idComando: "curto", decisoes: [{ tipo: "produto", produto: "leite" }] }).ok).toBe(false);
    expect(validar(MensagemCliente, { tipo: "decidir", idComando: "abc-12345", decisoes: [] }).ok).toBe(false);
    expect(validar(MensagemCliente, { tipo: "relogio", idComando: "abc-12345", tickEsperado: 3, acao: "acelerar" }).ok).toBe(false);
  });

  test("a mensagem de erro aponta o campo", () => {
    const r = validar(MensagemCliente, { tipo: "relogio", idComando: "abc-12345", tickEsperado: -1, acao: "pausar" });
    expect(r).toEqual({ ok: false, erro: 'campo "tickEsperado" inválido' });
  });

  test("nenhum JSON arbitrário faz o validador lançar exceção (propriedade)", () => {
    fc.assert(
      fc.property(fc.jsonValue(), (x) => {
        validar(MensagemCliente, x);
        validar(EntrarAluno, x);
        validar(ConfigSala, x);
        return true;
      }),
      { numRuns: 500 },
    );
  });

  test("mensagens quase válidas (objeto com campos sorteados) também não lançam exceção (propriedade)", () => {
    const quase = fc.record({
      tipo: fc.constantFrom("decidir", "relogio", "pronto", "configurar", "estender", "encerrar", "ping", "outra"),
      idComando: fc.oneof(fc.string(), fc.uuid(), fc.integer()),
      tickEsperado: fc.oneof(fc.integer(), fc.double(), fc.string()),
      decisoes: fc.array(fc.dictionary(fc.string(), fc.jsonValue()), { maxLength: 3 }),
    });
    fc.assert(
      fc.property(quase, (x) => {
        validar(MensagemCliente, x);
        return true;
      }),
      { numRuns: 500 },
    );
  });
});
