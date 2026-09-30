/**
 * Visão da empresa e robôs (entrega 6).
 */
import { describe, expect, test } from "bun:test";
import { PRESET_INTRODUTORIO } from "@simulador/catalogo";
import fc from "fast-check";
import {
  ConfigInvalida,
  criarPartida,
  decidirRobo,
  diaDeDecisaoDosRobos,
  ESTRATEGIAS,
  type EstadoPartida,
  passoMutavel,
  validarDecisao,
  visaoDaEmpresa,
} from "../src";
import { empresa, PRESET_TESTE, rodar } from "./ajuda";

const TODAS = ["preco_baixo", "premium", "marca", "equilibrada", "revenda", "passiva", "aleatoria"];

function partidaComRobos(semente = "robos", estrategias = TODAS, preset = PRESET_INTRODUTORIO): EstadoPartida {
  return criarPartida({ preset, semente, empresas: estrategias.map((e) => ({ nome: e, robo: { estrategia: e } })) });
}

const idDe = (estado: EstadoPartida, estrategia: string) => estado.empresas.find((e) => e.robo?.estrategia === estrategia)!.id;

describe("visão da empresa", () => {
  const { estado } = rodar(partidaComRobos(), 45, () => ({}), false);
  const visao = visaoDaEmpresa(estado, "emp_01");
  const texto = JSON.stringify(visao);

  test("não expõe o preço de referência interno nem a elasticidade (seção 6.4)", () => {
    expect(texto.includes("precoReferencia")).toBe(false);
    expect(texto.includes("elasticidade")).toBe(false);
  });

  test("dos concorrentes, só informação pública: preço, qualidade, marca, nota e participação", () => {
    expect(visao.concorrentes).toHaveLength(6);
    for (const c of visao.concorrentes) {
      expect(Object.keys(c).sort()).toEqual(["id", "nome", "ofertas"]);
      for (const o of c.ofertas) expect(Object.keys(o).sort()).toEqual(["marca", "notaAnterior", "participacaoAnterior", "preco", "produto", "qualidade"]);
    }
  });

  test("da própria empresa, tudo: caixa, estoques, decisões, tecnologia, fechamento", () => {
    const e = empresa(estado, "emp_01");
    expect(visao.empresa.caixa).toBe(e.caixa);
    expect(visao.empresa.ofertas.map((o) => o.estoque)).toEqual(e.ofertas.map((o) => o.estoque));
    expect(visao.empresa.ofertas.map((o) => o.decisao)).toEqual(e.ofertas.map((o) => o.decisao));
    expect(visao.empresa.ultimoFechamento).toEqual(e.contabil.ultimoFechamento);
  });

  test("dados privados de um concorrente não mudam a visão de outra empresa", () => {
    const alterado = JSON.parse(JSON.stringify(estado)) as EstadoPartida;
    const rival = alterado.empresas[3]!;
    rival.caixa += 999_999;
    rival.creditoEmergencial += 5;
    rival.ofertas[0]!.estoque.quantidade += 1234;
    rival.ofertas[0]!.decisao.publicidadeMensal += 777;
    rival.ofertas[0]!.tecnologia += 3;
    rival.contabil.lucrosAcumulados -= 10;
    // A qualidade do estoque é visível (qualidade da oferta); a quantidade e o valor, não.
    expect(visaoDaEmpresa(alterado, "emp_01")).toEqual(visao);
  });

  test("montar a visão não altera o estado", () => {
    const antes = JSON.stringify(estado);
    visaoDaEmpresa(estado, "emp_02");
    expect(JSON.stringify(estado)).toBe(antes);
  });
});

describe("robôs decidem só pela visão", () => {
  test("mudar dados privados dos concorrentes não muda as decisões de nenhum robô", () => {
    const { estado } = rodar(partidaComRobos("privacidade"), 50, () => ({}), false);
    for (const alvo of estado.empresas) {
      const alterado = JSON.parse(JSON.stringify(estado)) as EstadoPartida;
      for (const e of alterado.empresas) {
        if (e.id === alvo.id) continue;
        e.caixa = 1;
        e.ofertas.forEach((o) => {
          o.estoque.quantidade *= 3;
          o.decisao.compraMensal = 0;
          o.decisao.pdMensal = 42;
        });
      }
      const original = decidirRobo(JSON.parse(JSON.stringify(estado)) as EstadoPartida, alvo.id);
      expect(decidirRobo(alterado, alvo.id)).toEqual(original);
    }
  });
});

describe("intensidade das estratégias", () => {
  test("sorteada dentro da faixa, reprodutível pela semente e diferente entre sementes", () => {
    const a = partidaComRobos("s1");
    const b = partidaComRobos("s1");
    const c = partidaComRobos("s2");
    for (const e of a.empresas) {
      const faixas = ESTRATEGIAS[e.robo!.estrategia]!.faixas;
      for (const [nome, [min, max]] of Object.entries(faixas)) {
        const v = e.robo!.intensidade[nome]!;
        expect(v >= min && v < max).toBe(true);
      }
    }
    expect(a.empresas.map((e) => e.robo!.intensidade)).toEqual(b.empresas.map((e) => e.robo!.intensidade));
    expect(a.empresas.map((e) => e.robo!.intensidade)).not.toEqual(c.empresas.map((e) => e.robo!.intensidade));
  });

  test("intensidade informada na configuração é respeitada", () => {
    const e = criarPartida({ preset: PRESET_INTRODUTORIO, semente: "x", empresas: [{ nome: "R", robo: { estrategia: "preco_baixo", intensidade: { margem: 0.07 } } }] });
    expect(e.empresas[0]!.robo!.intensidade.margem).toBe(0.07);
    expect(e.empresas[0]!.robo!.intensidade.paybackMaximo).toBeDefined();
  });

  test("estratégia desconhecida é rejeitada", () => {
    expect(() => criarPartida({ preset: PRESET_INTRODUTORIO, semente: "x", empresas: [{ nome: "R", robo: { estrategia: "monopolio" } }] })).toThrow(ConfigInvalida);
  });
});

describe("cadência e latência", () => {
  test("robôs já têm decisões pendentes na criação e operam desde o tick 1", () => {
    const e = partidaComRobos();
    expect(e.decisoesPendentes.length).toBeGreaterThan(0);
    const r = passoMutavel(e);
    expect(r.rejeicoes).toEqual([]);
    const ativas = new Set(r.historico.ofertas.filter((h) => h.ativa).map((h) => h.empresa));
    expect(ativas.size).toBe(7);
  });

  test("revisam as decisões no fim de cada semana e no último dia do mês", () => {
    expect([1, 6, 7, 8, 14, 21, 28, 29, 30].map((d) => diaDeDecisaoDosRobos(d, 30))).toEqual([false, false, true, false, true, true, true, false, true]);
    // passoMutavel reaproveita o objeto de estado: registrar as pendências logo depois de cada tick.
    let e = partidaComRobos();
    const comPendentes: number[] = [];
    for (let t = 1; t <= 30; t++) {
      e = passoMutavel(e).estado;
      if (e.decisoesPendentes.length > 0) comPendentes.push(t);
    }
    expect(comPendentes).toEqual([7, 14, 21, 28, 30]);
  });
});

describe("todas as estratégias geram só decisões válidas", () => {
  test("partidas com os 7 robôs, várias sementes, nos dois presets: nenhuma rejeição e invariantes em todo tick", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 8 }), fc.constantFrom(PRESET_INTRODUTORIO, PRESET_TESTE), (semente, preset) => {
        const { resultados } = rodar(partidaComRobos(semente, [...TODAS, "preco_minimo"], preset), 75);
        const rejeicoes = resultados.flatMap((r) => r.rejeicoes);
        if (rejeicoes.length > 0) throw new Error(`rejeições de robô: ${JSON.stringify(rejeicoes.slice(0, 3))}`);
        return true;
      }),
      { numRuns: 12 },
    );
  });

  test("decisões dos robôs também passam em validarDecisao isoladamente", () => {
    const { estado } = rodar(partidaComRobos("validar"), 100, () => ({}), false);
    for (const e of estado.empresas) for (const d of decidirRobo(estado, e.id)) expect(validarDecisao(estado, d)).toBeNull();
  });
});

describe("comportamento de cada estratégia (direção esperada)", () => {
  const { estado, resultados } = rodar(partidaComRobos("comportamento"), 180, () => ({}), false);
  const doRobo = (estrategia: string) => empresa(estado, idDe(estado, estrategia));
  const precoMedio = (estrategia: string) => {
    const e = doRobo(estrategia);
    const precos = e.ofertas.map((o) => o.decisao.preco).filter((p): p is number => p !== null);
    return precos.reduce((s, p) => s + p, 0) / precos.length;
  };
  const precoRelativo = (estrategia: string) => {
    // preço médio relativo ao custo pronto de cada produto
    const e = doRobo(estrategia);
    const rel = e.ofertas.map((o) => o.decisao.preco! / estado.parametros.produtos.find((p) => p.id === o.produto)!.fornecedor!.preco);
    return rel.reduce((s, x) => s + x, 0) / rel.length;
  };

  test("revenda nunca fabrica nem gasta com P&D", () => {
    const e = doRobo("revenda");
    expect(e.fabricas).toEqual([]);
    for (const o of e.ofertas) expect([o.decisao.producaoMensal, o.decisao.pdMensal]).toEqual([0, 0]);
  });

  test("premium constrói fábricas e investe em P&D", () => {
    const e = doRobo("premium");
    expect(e.fabricas.length).toBeGreaterThan(0);
    expect(e.ofertas.some((o) => o.decisao.pdMensal > 0)).toBe(true);
  });

  test("premium cobra mais que preço baixo e que revenda (relativo ao custo pronto)", () => {
    expect(precoRelativo("premium")).toBeGreaterThan(precoRelativo("preco_baixo"));
    expect(precoRelativo("premium")).toBeGreaterThan(precoRelativo("revenda"));
    expect(precoMedio("premium")).toBeGreaterThan(0);
  });

  test("marca gasta com publicidade uma fração da receita maior que as demais razoáveis", () => {
    const fracao = (estrategia: string) => {
      const fechamentos = resultados.flatMap((r) => r.fechamentos).filter((f) => f.empresa === idDe(estado, estrategia));
      const pub = fechamentos.reduce((s, f) => s + f.fechamento.dre.publicidade, 0);
      const receita = fechamentos.reduce((s, f) => s + f.fechamento.dre.receita, 0);
      return pub / Math.max(1, receita);
    };
    for (const outra of ["preco_baixo", "premium", "equilibrada", "revenda"]) expect(fracao("marca")).toBeGreaterThan(fracao(outra));
  });

  test("passiva decide uma única vez e nunca muda", () => {
    const inicial = partidaComRobos("comportamento");
    const primeira = passoMutavel(inicial).estado;
    const e0 = primeira.empresas.find((e) => e.robo!.estrategia === "passiva")!;
    expect(doRobo("passiva").ofertas.map((o) => o.decisao)).toEqual(e0.ofertas.map((o) => o.decisao));
    expect(doRobo("passiva").pontosDeVenda).toHaveLength(estado.parametros.pontoDeVenda.iniciais);
  });

  test("aleatória: sementes diferentes levam a decisões diferentes", () => {
    const decisao = (s: string) => {
      const e = partidaComRobos(s, ["aleatoria"]);
      return passoMutavel(e).estado.empresas[0]!.ofertas.map((o) => o.decisao.preco);
    };
    expect(decisao("a")).not.toEqual(decisao("b"));
  });
});

describe("regressões da gestão dos robôs (defeitos achados no teste de fumaça)", () => {
  const RAZOAVEIS = ["preco_baixo", "premium", "marca", "equilibrada", "revenda"];

  test("investimentos decididos numa mesma rodada nunca passam do caixa disponível", () => {
    for (const semente of ["r1", "r2", "r3"]) {
      let e = partidaComRobos(semente);
      for (let t = 1; t <= 360; t++) {
        e = passoMutavel(e).estado;
        if (e.decisoesPendentes.length === 0) continue;
        for (const x of e.empresas.filter((y) => RAZOAVEIS.includes(y.robo!.estrategia))) {
          let investimento = 0;
          for (const d of e.decisoesPendentes.filter((y) => y.empresa === x.id)) {
            if (d.tipo === "construirFabrica") investimento += e.parametros.produtos.find((p) => p.id === d.produto)!.fabricacao!.capex;
            if (d.tipo === "abrirPontoDeVenda") investimento += d.quantidade * e.parametros.pontoDeVenda.custoAbertura;
          }
          expect({ semente, t, empresa: x.nome, excede: investimento > x.caixa }).toEqual({ semente, t, empresa: x.nome, excede: false });
        }
      }
    }
  });

  test("abastecimento respeita a capacidade de venda: estoque nunca passa de 2 meses de capacidade", () => {
    // Só para quem revê decisões: a passiva compra a mesma quantidade para sempre (é a linha de base),
    // e a aleatória decide ao acaso; acumular estoque é consequência esperada nas duas.
    for (const semente of ["r1", "r2"]) {
      let e = partidaComRobos(semente);
      for (let t = 1; t <= 720; t++) {
        const r = passoMutavel(e);
        e = r.estado;
        if (r.fechamentos.length === 0) continue;
        for (const x of e.empresas.filter((y) => RAZOAVEIS.includes(y.robo!.estrategia))) {
          let estoqueEquivalente = 0;
          for (const o of x.ofertas) estoqueEquivalente += o.estoque.quantidade * e.parametros.produtos.find((p) => p.id === o.produto)!.varejo!.fatorCapacidade;
          const capacidadeMensal = x.pontosDeVenda.length * e.parametros.pontoDeVenda.capacidadePorDia * 30;
          expect({ semente, mes: t / 30, empresa: x.nome, excesso: estoqueEquivalente > 2 * capacidadeMensal }).toEqual({ semente, mes: t / 30, empresa: x.nome, excesso: false });
        }
      }
    }
  });

  test("preço dos robôs razoáveis nunca fica abaixo do custo variável do próprio abastecimento", () => {
    let e = partidaComRobos("custo");
    for (let t = 1; t <= 360; t++) {
      e = passoMutavel(e).estado;
      if (t % 30 !== 0) continue;
      for (const x of e.empresas.filter((y) => RAZOAVEIS.includes(y.robo!.estrategia))) {
        for (const o of x.ofertas) {
          const p = e.parametros.produtos.find((y) => y.id === o.produto)!;
          const { compraMensal: c, producaoMensal: f, preco } = o.decisao;
          if (preco === null || c + f <= 0) continue;
          const insumos = p.fabricacao!.receita.reduce((s, i) => s + i.quantidadePorLote * e.parametros.produtos.find((y) => y.id === i.produto)!.fornecedor!.preco, 0) / p.fabricacao!.unidadesPorLote;
          const custoFabricado = insumos + p.fabricacao!.custoMaoDeObraPorUnidade;
          const custoVariavel = (c * p.fornecedor!.preco + f * custoFabricado) / (c + f);
          expect({ t, empresa: x.nome, produto: o.produto, abaixo: preco < custoVariavel }).toEqual({ t, empresa: x.nome, produto: o.produto, abaixo: false });
        }
      }
    }
  });
});

describe("determinismo com robôs", () => {
  test("mesma semente → mesmo estado; retomar após JSON dá o mesmo resultado", () => {
    const correr = (e: EstadoPartida, ticks: number) => {
      for (let i = 0; i < ticks; i++) e = passoMutavel(e).estado;
      return e;
    };
    const direto = correr(partidaComRobos("replay"), 120);
    expect(JSON.stringify(correr(partidaComRobos("replay"), 120))).toBe(JSON.stringify(direto));
    const metade = correr(partidaComRobos("replay"), 53);
    expect(JSON.stringify(correr(JSON.parse(JSON.stringify(metade)), 67))).toBe(JSON.stringify(direto));
  });
});
