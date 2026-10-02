import { describe, expect, test } from "bun:test";
import { PRESET_CADEIA_MINIMA, PRESET_INTRODUTORIO } from "@simulador/catalogo";
import {
  balanco,
  ConfigInvalida,
  CONTAS_DRE,
  criarPartida,
  darEntrada,
  type EstadoFazenda,
  type EstadoPartida,
  lucroAntesIR,
  migrarEstado,
  passo,
  VERSAO_ESTADO,
} from "../src";
import { empresa, numerosInvalidos, rodar } from "./ajuda";

const MATERIAS_PRIMAS = ["acucar", "carne_bovina_congelada", "couro", "frango_congelado", "leite", "morango"];

function partidaComCadeia(robo = false): EstadoPartida {
  return criarPartida({
    preset: PRESET_CADEIA_MINIMA,
    semente: "cadeia",
    empresas: [{ nome: "Alfa" }, { nome: "Beta" }, ...(robo ? [{ nome: "Marx (robô)", robo: { estrategia: "equilibrada" } }] : [])],
    modulos: ["cadeia_produtiva"],
  });
}

function fazenda(campos: Partial<EstadoFazenda> = {}): EstadoFazenda {
  return {
    id: "faz_01",
    custo: 600_000,
    depreciacaoAcumulada: 0,
    operaDesdeTick: 0,
    vidaUtilMeses: 6,
    atividade: "gado_leiteiro",
    experiencia: 0,
    conversaoAteTick: null,
    producaoMensal: 0,
    ...campos,
  };
}

/** Compra uma fazenda à vista: o caixa cai e o ativo sobe no mesmo valor (o balanço continua fechando). */
function comFazenda(estado: EstadoPartida, empresaId: string, campos: Partial<EstadoFazenda> = {}): EstadoFazenda {
  const e = empresa(estado, empresaId);
  const f = fazenda({ id: `faz_0${e.fazendas.length + 1}`, ...campos });
  e.caixa -= f.custo;
  e.fazendas.push(f);
  return f;
}

describe("criação da partida com a cadeia", () => {
  test("com o módulo ligado, cada empresa nasce com as matérias-primas das atividades, em ordem alfabética", () => {
    const estado = partidaComCadeia();
    expect(estado.versaoEstado).toBe(VERSAO_ESTADO);
    expect(estado.modulos).toEqual(["nucleo", "cadeia_produtiva"]);
    expect(estado.parametros.cadeia).not.toBeNull();
    for (const e of estado.empresas) {
      expect(e.fazendas).toEqual([]);
      expect(Object.keys(e.materiasPrimas)).toEqual(MATERIAS_PRIMAS);
      for (const m of Object.values(e.materiasPrimas)) {
        expect(m).toEqual({ estoque: { quantidade: 0, valor: 0, qualidade: 0 }, ofertaAtacado: null, diasCheio: 0, serie: [] });
      }
    }
  });

  test("cada empresa tem objetos próprios (alterar uma não altera a outra)", () => {
    const estado = partidaComCadeia();
    empresa(estado, "emp_01").materiasPrimas.leite!.diasCheio = 5;
    empresa(estado, "emp_01").materiasPrimas.leite!.serie.push(0.5);
    expect(empresa(estado, "emp_02").materiasPrimas.leite).toEqual({ estoque: { quantidade: 0, valor: 0, qualidade: 0 }, ofertaAtacado: null, diasCheio: 0, serie: [] });
  });

  test("com o módulo desligado, o mesmo preset não cria fazendas nem estoques de matéria-prima", () => {
    const estado = criarPartida({ preset: PRESET_CADEIA_MINIMA, semente: "cadeia", empresas: [{ nome: "Alfa" }] });
    expect(estado.modulos).toEqual(["nucleo"]);
    expect(empresa(estado, "emp_01").materiasPrimas).toEqual({});
    expect(empresa(estado, "emp_01").fazendas).toEqual([]);
  });

  test("módulo sem o bloco cadeia no preset é recusado; finanças continua não implementado", () => {
    expect(() => criarPartida({ preset: PRESET_INTRODUTORIO, semente: "s", empresas: [{ nome: "X" }], modulos: ["cadeia_produtiva"] })).toThrow(ConfigInvalida);
    expect(() => criarPartida({ preset: PRESET_CADEIA_MINIMA, semente: "s", empresas: [{ nome: "X" }], modulos: ["financas"] })).toThrow(ConfigInvalida);
  });

  test("o estado é JSON puro e passa ileso por JSON", () => {
    const estado = partidaComCadeia(true);
    expect(numerosInvalidos(estado)).toEqual([]);
    expect(JSON.parse(JSON.stringify(estado))).toEqual(estado);
  });
});

describe("contabilidade com fazendas e estoques de matéria-prima", () => {
  test("DRE: as duas contas novas entram no lucro antes do IR com sinal de despesa", () => {
    expect(CONTAS_DRE).toContain("custo_fixo_fazenda");
    expect(CONTAS_DRE).toContain("perda_de_estoque");
    const dre = Object.fromEntries(CONTAS_DRE.map((c) => [c, 0])) as Parameters<typeof lucroAntesIR>[0];
    dre.receita = 1_000;
    dre.custo_fixo_fazenda = 300;
    dre.perda_de_estoque = 200;
    expect(lucroAntesIR(dre)).toBe(500);
  });

  test("balanço: estoque de matéria-prima entra em estoques; fazenda em operação, no imobilizado líquido; obra, ao custo", () => {
    const estado = partidaComCadeia();
    const e = empresa(estado, "emp_01");
    const antes = balanco(e, 0);
    // Compra de 1.000 L de leite por R$ 2.500,00 pagos à vista.
    darEntrada(e.materiasPrimas.leite!.estoque, 1_000, 250_000, 50);
    e.caixa -= 250_000;
    comFazenda(estado, "emp_01", { id: "faz_01", custo: 600_000, depreciacaoAcumulada: 100_000 });
    comFazenda(estado, "emp_01", { id: "faz_02", custo: 400_000, operaDesdeTick: 40 });
    const depois = balanco(e, 0);
    expect(depois.estoques - antes.estoques).toBe(250_000);
    expect(depois.imobilizadoLiquido - antes.imobilizadoLiquido).toBe(500_000);
    expect(depois.obrasEmAndamento - antes.obrasEmAndamento).toBe(400_000);
    // A única mudança no ativo total é a depreciação adiantada da primeira fazenda (R$ 1.000,00 saem do
    // ativo líquido sem passar pelo caixa); as compras à vista só trocam caixa por estoque, fazenda e obra.
    expect(depois.ativoTotal - antes.ativoTotal).toBe(-100_000);
    // Sem depreciação adiantada, o balanço continua fechando exatamente.
    comFazenda(estado, "emp_02", { custo: 600_000 });
    const b2 = balanco(empresa(estado, "emp_02"), 0);
    expect(b2.ativoTotal).toBe(b2.passivoTotal + b2.patrimonioLiquido);
  });

  test("a fazenda deprecia ao fim do mês só depois de entrar em operação, e a última quota zera o valor", () => {
    const base = partidaComCadeia();
    const com = partidaComCadeia();
    comFazenda(com, "emp_01", { custo: 600_000, vidaUtilMeses: 6 }); // quota de R$ 1.000,00 por mês
    comFazenda(com, "emp_02", { custo: 600_000, vidaUtilMeses: 6, operaDesdeTick: 45 }); // em obra no fim do mês 1

    const r0 = rodar(base, 30);
    const r1 = rodar(com, 30);
    const dep = (s: EstadoPartida, id: string) => empresa(s, id).contabil.ultimoFechamento!.dre.depreciacao;
    expect(dep(r1.estado, "emp_01") - dep(r0.estado, "emp_01")).toBe(100_000);
    expect(dep(r1.estado, "emp_02") - dep(r0.estado, "emp_02")).toBe(0);

    // Mês 2: a segunda fazenda já opera (tick 45) e começa a depreciar; as invariantes (balanço exato) valem a cada tick.
    const r2 = rodar(r1.estado, 30);
    expect(dep(r2.estado, "emp_02") - dep(r0.estado, "emp_02")).toBe(100_000);

    // Depois de 6 meses a primeira fazenda está inteira depreciada, sem sobra de centavos.
    const fim = rodar(r2.estado, 4 * 30);
    const f = empresa(fim.estado, "emp_01").fazendas[0]!;
    expect(f.depreciacaoAcumulada).toBe(f.custo);
    const b = balanco(empresa(fim.estado, "emp_01"), fim.estado.tick);
    expect(b.ativoTotal).toBe(b.passivoTotal + b.patrimonioLiquido);
  });

  test("partida com o módulo ligado, uma equipe e um robô roda 90 ticks respeitando todas as invariantes", () => {
    const estado = partidaComCadeia(true);
    comFazenda(estado, "emp_01", { custo: 700_000, vidaUtilMeses: 12 });
    const { estado: fim } = rodar(estado, 90);
    expect(fim.tick).toBe(90);
    expect(numerosInvalidos(fim)).toEqual([]);
    expect(empresa(fim, "emp_03").tipo).toBe("robo");
  });
});

describe("migração do estado gravado", () => {
  /** Reconstrói como seria o estado gravado pela versão 1 do motor. */
  function comoVersao1(estado: EstadoPartida): unknown {
    const v1 = JSON.parse(JSON.stringify(estado)) as Record<string, any>;
    v1.versaoEstado = 1;
    delete v1.parametros.cadeia;
    for (const e of v1.empresas) {
      for (const o of e.ofertas) {
        delete o.decisao.origemInsumos;
        delete o.decisao.origemCompraPronta;
      }
      delete e.fazendas;
      delete e.materiasPrimas;
      for (const dre of [e.contabil.mesAtual.dre, e.contabil.ultimoFechamento?.dre]) {
        if (!dre) continue;
        delete dre.custo_fixo_fazenda;
        delete dre.perda_de_estoque;
      }
    }
    return v1;
  }

  const base = rodar(
    criarPartida({ preset: PRESET_INTRODUTORIO, semente: "migracao", empresas: [{ nome: "Alfa" }, { nome: "Beta", robo: { estrategia: "equilibrada" } }] }),
    45,
  ).estado;

  test("estado da versão atual passa sem mudança (e é uma cópia)", () => {
    const m = migrarEstado(base);
    expect(m).toEqual(base);
    expect(m === base).toBe(false);
  });

  test("estado da versão 1 ganha os campos novos e vira idêntico ao estado atual", () => {
    const v1 = comoVersao1(base);
    expect((v1 as { versaoEstado: number }).versaoEstado).toBe(1);
    expect(migrarEstado(v1)).toEqual(base);
  });

  test("a partida migrada continua igual à original: o próximo mês dá o mesmo resultado, byte a byte", () => {
    const migrado = migrarEstado(comoVersao1(base));
    const a = rodar(JSON.parse(JSON.stringify(base)) as EstadoPartida, 30);
    const b = rodar(migrado, 30);
    expect(JSON.stringify(b.estado)).toBe(JSON.stringify(a.estado));
  });

  test("estado da versão 2, com a cadeia, ganha a origem dos insumos e o completar com o fornecedor", () => {
    const comCadeia = rodar(partidaComCadeia(true), 20).estado;
    const v2 = JSON.parse(JSON.stringify(comCadeia)) as Record<string, any>;
    v2.versaoEstado = 2;
    delete v2.parametros.cadeia.completaComFornecedor;
    for (const e of v2.empresas) {
      for (const o of e.ofertas) {
        delete o.decisao.origemInsumos;
        delete o.decisao.origemCompraPronta;
      }
    }
    expect(migrarEstado(v2)).toEqual(comCadeia);
    expect(JSON.stringify(migrarEstado(v2))).toBe(JSON.stringify(comCadeia));
  });

  test("migrar não altera a entrada", () => {
    const v1 = comoVersao1(base);
    const antes = JSON.stringify(v1);
    migrarEstado(v1);
    expect(JSON.stringify(v1)).toBe(antes);
  });

  test("recusa estado sem versão, com versão inválida ou mais nova que o motor", () => {
    expect(() => migrarEstado({})).toThrow("sem versaoEstado");
    expect(() => migrarEstado(null)).toThrow("sem versaoEstado");
    expect(() => migrarEstado({ versaoEstado: 0 })).toThrow("inválida");
    expect(() => migrarEstado({ versaoEstado: 1.5 })).toThrow("inválida");
    expect(() => migrarEstado({ versaoEstado: VERSAO_ESTADO + 1 })).toThrow("mais novo");
  });

  test("o passo não depende de objeto compartilhado entre migrações", () => {
    const m1 = migrarEstado(comoVersao1(base));
    const m2 = migrarEstado(comoVersao1(base));
    const r = passo(m1, {});
    expect(JSON.stringify(m2)).toBe(JSON.stringify(base));
    expect(r.estado.tick).toBe(m1.tick + 1);
  });
});
