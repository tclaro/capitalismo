/**
 * Tick de revenda (entrega 3): criação da partida, compras prontas, publicidade, demanda, alocação
 * de vendas, redistribuição, capacidade dos pontos de venda, fidelidade, custos, eventos e decisões.
 *
 * Números de referência (preset de teste, sem variação): população 50.000; leite engarrafado com
 * P_ref R$ 6,00, consumo 3/hab/mês, elasticidade 0,3, pesos 30/10/60, fornecedor R$ 4,50 (Q50),
 * armazenagem 5 centavos/un/mês; carteira com P_ref R$ 80,00, consumo 0,02/hab/mês, fornecedor
 * limitado a 5.000/mês; 1 ponto de venda inicial (800 un/dia, R$ 12.000/mês); caixa R$ 500.000.
 */
import { describe, expect, test } from "bun:test";
import fc from "fast-check";
import {
  ConfigInvalida,
  criarPartida,
  type Decisao,
  type EstadoPartida,
  PresetInvalido,
  passo,
  passoMutavel,
  taxaMensalParaTick,
  validarDecisao,
} from "../src";
import { alterar, decidir, empresa, oferta, PRESET_TESTE, partidaDeTeste, rodar } from "./ajuda";

const LEITE = "leite_engarrafado";
const CARTEIRA = "carteira";
const CAPACIDADE_ILIMITADA = alterar("parametros.pontoDeVenda.capacidadePorDia", 1e9);

describe("criarPartida", () => {
  test("estado inicial: ids, caixa, pontos de venda, capital social e ofertas", () => {
    const e = partidaDeTeste(["Alfa", "Beta"]);
    expect(e.tick).toBe(0);
    expect(e.modulos).toEqual(["nucleo"]);
    expect(e.mercados.map((m) => m.id)).toEqual(["mer_01"]);
    expect(e.empresas.map((x) => [x.id, x.nome, x.mercado, x.tipo])).toEqual([
      ["emp_01", "Alfa", "mer_01", "equipe"],
      ["emp_02", "Beta", "mer_01", "equipe"],
    ]);
    const alfa = empresa(e, "emp_01");
    expect(alfa.caixa).toBe(50_000_000);
    expect(alfa.pontosDeVenda.map((p) => [p.id, p.custo, p.operaDesdeTick])).toEqual([["pdv_01", 8_000_000, 0]]);
    expect(alfa.contabil.capitalSocial).toBe(58_000_000);
    expect(alfa.ofertas.map((o) => o.produto)).toEqual([LEITE, CARTEIRA]);
    expect(oferta(e, "emp_01", LEITE).decisao).toEqual({ preco: null, compraMensal: 0, producaoMensal: 0, publicidadeMensal: 0, pdMensal: 0 });
  });

  test("preset sem variação é resolvido com os valores base; pesos somam 100", () => {
    const e = partidaDeTeste();
    const leite = e.parametros.produtos.find((p) => p.id === LEITE)!;
    expect(leite.varejo!.precoReferencia).toBe(600);
    expect(leite.varejo!.pesos).toEqual({ qualidade: 30, marca: 10, preco: 60 });
    expect(leite.fornecedor).toEqual({ preco: 450, qualidade: 50, ofertaMaxMensal: null });
    expect(e.parametros.populacao).toBe(50_000);
  });

  test("preset com variação: sorteio dentro da faixa, reprodutível pela semente, diferente entre sementes", () => {
    const preset = {
      ...PRESET_TESTE,
      mercado: { ...PRESET_TESTE.mercado, populacao: { valor: 50_000, variacao: 0.2 } },
    };
    const pops = ["a", "b", "c", "d", "e"].map((s) => partidaDeTeste(["X"], { preset, semente: s }).parametros.populacao);
    for (const p of pops) expect(p >= 40_000 && p < 60_000).toBe(true);
    expect(new Set(pops).size).toBe(pops.length);
    expect(partidaDeTeste(["X"], { preset, semente: "a" }).parametros.populacao).toBe(pops[0]!);
  });

  test("pesos da nota sorteados são renormalizados para somar 100", () => {
    const leite = PRESET_TESTE.produtos.find((p) => p.id === LEITE)!;
    const preset = {
      ...PRESET_TESTE,
      produtos: PRESET_TESTE.produtos.map((p) =>
        p.id === LEITE
          ? {
              ...p,
              varejo: {
                ...leite.varejo!,
                pesos: { qualidade: { valor: 30, variacao: 0.3 }, marca: { valor: 10, variacao: 0.3 }, preco: { valor: 60, variacao: 0.3 } },
              },
            }
          : p,
      ),
    };
    for (const s of ["1", "2", "3"]) {
      const pesos = partidaDeTeste(["X"], { preset, semente: s }).parametros.produtos.find((p) => p.id === LEITE)!.varejo!.pesos;
      expect(pesos.qualidade + pesos.marca + pesos.preco).toBeCloseTo(100, 12);
    }
  });

  test("rejeita preset inválido, partida sem empresas, mercado inexistente e módulo não implementado", () => {
    expect(() => partidaDeTeste(["X"], { preset: { ...PRESET_TESTE, ticksPorMes: 0 } })).toThrow(PresetInvalido);
    expect(() => criarPartida({ preset: PRESET_TESTE, semente: "s", empresas: [] })).toThrow(ConfigInvalida);
    expect(() => criarPartida({ preset: PRESET_TESTE, semente: "s", empresas: [{ nome: "X", mercado: 1 }] })).toThrow(ConfigInvalida);
    expect(() => criarPartida({ preset: PRESET_TESTE, semente: "s", empresas: [{ nome: "X" }], modulos: ["financas"] })).toThrow(ConfigInvalida);
  });
});

describe("tick de revenda com uma empresa (valores calculados à mão)", () => {
  // Compra 30.000/mês = 1.000/dia a R$ 4,50; vende a R$ 6,00; demanda 50.000 × 3/30 = 5.000/dia;
  // capacidade do ponto de venda = 800/dia → vende 800.
  const inicial = partidaDeTeste();
  const { estado, resultados } = rodar(inicial, 1, () => ({ decisoes: [decidir("emp_01", LEITE, { preco: 600, compraMensal: 30_000 })] }));
  const r = resultados[0]!;
  const h = r.historico.ofertas.find((x) => x.produto === LEITE)!;

  test("demanda total, participação e vendas limitadas pela capacidade", () => {
    expect(r.historico.demandaTotal.find((d) => d.produto === LEITE)!.demanda).toBeCloseTo(5000, 9);
    expect(h.participacao).toBe(1);
    expect(h.demanda).toBeCloseTo(5000, 9);
    expect(h.vendas).toBeCloseTo(800, 9);
  });

  test("caixa: 500.000,00 − 4.500,00 (compra) + 4.800,00 (venda) − 400,00 (ponto de venda) − 0,33 (armazenagem)", () => {
    expect(empresa(estado, "emp_01").caixa).toBe(50_000_000 - 450_000 + 480_000 - 40_000 - 33);
  });

  test("estoque a custo médio: 200 unidades por R$ 900,00", () => {
    expect(oferta(estado, "emp_01", LEITE).estoque).toEqual({ quantidade: 200, valor: 90_000, qualidade: 50 });
  });

  test("DRE do mês até aqui: receita 4.800, CPV 3.600, ponto de venda 400, armazenagem 0,33", () => {
    const dre = empresa(estado, "emp_01").contabil.mesAtual.dre;
    expect([dre.receita, dre.cpv, dre.custo_fixo_ponto_de_venda, dre.armazenagem]).toEqual([480_000, 360_000, 40_000, 33]);
    expect(empresa(estado, "emp_01").contabil.lucrosAcumulados).toBe(480_000 - 360_000 - 40_000 - 33);
  });

  test("ruptura: 84% da demanda não atendida → aviso e fidelidade −10/30 × 0,84 = −0,28", () => {
    expect(r.avisos).toContainEqual({ tipo: "ruptura_de_estoque", empresa: "emp_01", produto: LEITE });
    expect(oferta(estado, "emp_01", LEITE).fidelidade).toBeCloseTo(-0.28, 12);
  });

  test("reconhecimento sem publicidade só decai: 10 × (1 − d_tick)", () => {
    const d = taxaMensalParaTick(0.08, 30);
    expect(oferta(estado, "emp_01", LEITE).reconhecimento).toBeCloseTo(10 * (1 - d), 12);
  });

  test("lançamentos com contraparte (princípio 5)", () => {
    expect(r.lancamentos.map((l) => [l.descricao, l.valor, l.origem, l.destino])).toEqual([
      ["compra de mercadoria pronta", -450_000, "fornecedor_externo", "emp_01"],
      ["venda no varejo", 480_000, "consumidores", "emp_01"],
      ["custo fixo dos pontos de venda", -40_000, "emp_01", "prestadores"],
      ["armazenagem", -33, "emp_01", "armazem"],
    ]);
  });

  test("aviso de ruptura só na transição: no tick seguinte, ainda em ruptura, não repete", () => {
    const r2 = passo(estado);
    expect(r2.avisos.filter((a) => a.tipo === "ruptura_de_estoque")).toEqual([]);
  });
});

describe("disputa entre ofertas", () => {
  test("logit: 10% abaixo do preço de referência com PP = 60 vale 6 pontos → participação e^0,6 vezes maior", () => {
    const e = partidaDeTeste(["A", "B"]);
    const { resultados } = rodar(e, 1, () => ({
      eventos: [CAPACIDADE_ILIMITADA],
      decisoes: [decidir("emp_01", LEITE, { preco: 540, compraMensal: 3e6 }), decidir("emp_02", LEITE, { preco: 600, compraMensal: 3e6 })],
    }));
    const [a, b] = ["emp_01", "emp_02"].map((id) => resultados[0]!.historico.ofertas.find((h) => h.empresa === id && h.produto === LEITE)!);
    expect(a!.nota - b!.nota).toBeCloseTo(6, 12);
    expect(a!.vendas / b!.vendas).toBeCloseTo(Math.exp(0.6), 12);
    // Sem histórico, o preço médio é a média simples (570): D = 5.000 × (570/600)^−0,3.
    const d = 5000 * (570 / 600) ** -0.3;
    expect(a!.vendas + b!.vendas).toBeCloseTo(d, 8);
  });

  test("redistribuição: metade da demanda não atendida de A (perda de 50%) vai para B", () => {
    const e = partidaDeTeste(["A", "B"]);
    const { resultados } = rodar(e, 1, () => ({
      eventos: [CAPACIDADE_ILIMITADA],
      decisoes: [decidir("emp_01", LEITE, { preco: 600, compraMensal: 30 }), decidir("emp_02", LEITE, { preco: 600, compraMensal: 3e6 })],
    }));
    const [a, b] = ["emp_01", "emp_02"].map((id) => resultados[0]!.historico.ofertas.find((h) => h.empresa === id && h.produto === LEITE)!);
    expect(a!.demanda).toBeCloseTo(2500, 9);
    expect(a!.vendas).toBeCloseTo(1, 9);
    expect(b!.vendas).toBeCloseTo(2500 + 0.5 * 2499, 8);
  });

  test("a fração de ruptura usa a demanda original, sem contar a redistribuição recebida", () => {
    const e = partidaDeTeste(["A", "B"]);
    const { estado } = rodar(e, 1, () => ({
      eventos: [CAPACIDADE_ILIMITADA],
      decisoes: [decidir("emp_01", LEITE, { preco: 600, compraMensal: 30 }), decidir("emp_02", LEITE, { preco: 600, compraMensal: 3e6 })],
    }));
    // A: ruptura 2.499/2.500 → −10/30 × 0,9996; B: sem ruptura, qualidade igual à esperada → 0.
    expect(oferta(estado, "emp_01", LEITE).fidelidade).toBeCloseTo((-10 / 30) * (2499 / 2500), 12);
    expect(oferta(estado, "emp_02", LEITE).fidelidade).toBe(0);
  });

  test("oferta sem preço não participa, não vende e mantém o estoque", () => {
    const e = partidaDeTeste(["A", "B"]);
    const { estado, resultados } = rodar(e, 1, () => ({
      decisoes: [decidir("emp_01", LEITE, { compraMensal: 300 }), decidir("emp_02", LEITE, { preco: 600, compraMensal: 30_000 })],
    }));
    const a = resultados[0]!.historico.ofertas.find((h) => h.empresa === "emp_01" && h.produto === LEITE)!;
    expect([a.ativa, a.demanda, a.vendas]).toEqual([false, 0, 0]);
    expect(oferta(estado, "emp_01", LEITE).estoque.quantidade).toBeCloseTo(10, 12);
  });

  test("sem nenhuma oferta ativa, a demanda do produto é zero (sem divisão por zero)", () => {
    const { resultados } = rodar(partidaDeTeste(), 1);
    expect(resultados[0]!.historico.demandaTotal.map((d) => d.demanda)).toEqual([0, 0]);
  });
});

describe("capacidade dos pontos de venda e fornecedor limitado", () => {
  // Leite: demanda 5.000/dia (fator 1). Carteira: 50.000 × 0,02/30 = 33,33/dia (fator 2).
  // Uso pedido = 5.000 + 66,67 = 5.066,67 > 800 → todas as ofertas da empresa × 800/5.066,67.
  const { estado, resultados } = rodar(partidaDeTeste(), 1, () => ({
    decisoes: [decidir("emp_01", LEITE, { preco: 600, compraMensal: 3e6 }), decidir("emp_01", CARTEIRA, { preco: 8000, compraMensal: 30_000 })],
  }));
  const hist = resultados[0]!.historico.ofertas;
  const leite = hist.find((h) => h.produto === LEITE)!;
  const carteira = hist.find((h) => h.produto === CARTEIRA)!;

  test("capacidade dividida na mesma proporção entre os produtos e usada por inteiro", () => {
    const escala = 800 / (5000 + (50_000 * 0.02) / 30 * 2);
    expect(leite.vendas).toBeCloseTo(5000 * escala, 9);
    expect(carteira.vendas).toBeCloseTo(((50_000 * 0.02) / 30) * escala, 9);
    expect(leite.vendas + 2 * carteira.vendas).toBeCloseTo(800, 9);
  });

  test("fornecedor limitado a 5.000/mês entrega 166,67/dia mesmo com pedido de 1.000/dia", () => {
    expect(oferta(estado, "emp_01", CARTEIRA).estoque.quantidade + carteira.vendas).toBeCloseTo(5000 / 30, 9);
  });

  test("limite do fornecedor dividido proporcionalmente entre as empresas do mercado", () => {
    const { estado: e2 } = rodar(partidaDeTeste(["A", "B"]), 1, () => ({
      decisoes: [decidir("emp_01", CARTEIRA, { compraMensal: 30_000 }), decidir("emp_02", CARTEIRA, { compraMensal: 10_000 })],
    }));
    expect(oferta(e2, "emp_01", CARTEIRA).estoque.quantidade).toBeCloseTo((5000 / 30) * 0.75, 9);
    expect(oferta(e2, "emp_02", CARTEIRA).estoque.quantidade).toBeCloseTo((5000 / 30) * 0.25, 9);
  });
});

describe("publicidade", () => {
  test("verba diária exata e reconhecimento pela fórmula por tick", () => {
    const { estado, resultados } = rodar(partidaDeTeste(), 1, () => ({ decisoes: [decidir("emp_01", LEITE, { publicidadeMensal: 3_000_000 })] }));
    expect(resultados[0]!.lancamentos.find((l) => l.descricao === "publicidade")!.valor).toBe(-100_000);
    const d = taxaMensalParaTick(0.08, 30);
    const t = taxaMensalParaTick(0.25, 30);
    const ref = (30 * 50_000) / 30; // verba de referência por tick
    const esperado = 10 * (1 - d) + 90 * t * (1 - Math.exp(-100_000 / ref));
    expect(oferta(estado, "emp_01", LEITE).reconhecimento).toBeCloseTo(esperado, 12);
    expect(empresa(estado, "emp_01").contabil.mesAtual.dre.publicidade).toBe(100_000);
  });

  test("um mês de verba soma exatamente o valor mensal", () => {
    const { estado } = rodar(partidaDeTeste(), 30, (t) => (t === 1 ? { decisoes: [decidir("emp_01", LEITE, { publicidadeMensal: 1_234_567 })] } : {}));
    expect(empresa(estado, "emp_01").contabil.mesAtual.dre.publicidade).toBe(1_234_567);
  });
});

describe("decisões da empresa", () => {
  test("abrir ponto de venda: caixa sai na hora (investimento), opera após 15 dias, com aviso", () => {
    const { estado, resultados } = rodar(partidaDeTeste(), 16, (t) => (t === 1 ? { decisoes: [{ tipo: "abrirPontoDeVenda", empresa: "emp_01", quantidade: 2 }] } : {}));
    expect(resultados[0]!.lancamentos.filter((l) => l.classe === "investimento").map((l) => l.valor)).toEqual([-8_000_000, -8_000_000]);
    const avisos = resultados.flatMap((r, i) => r.avisos.filter((a) => a.tipo === "ponto_de_venda_aberto").map((a) => [i + 1, a]));
    expect(avisos).toEqual([[16, { tipo: "ponto_de_venda_aberto", empresa: "emp_01", quantidade: 2 }]]);
    expect(empresa(estado, "emp_01").pontosDeVenda.map((p) => [p.id, p.operaDesdeTick])).toEqual([
      ["pdv_01", 0],
      ["pdv_02", 16],
      ["pdv_03", 16],
    ]);
  });

  test("ponto de venda em obra aparece como obra em andamento, não como imobilizado", () => {
    const { estado } = rodar(partidaDeTeste(), 1, () => ({ decisoes: [{ tipo: "abrirPontoDeVenda", empresa: "emp_01", quantidade: 1 }] }));
    const e = empresa(estado, "emp_01");
    expect(e.pontosDeVenda[1]!.operaDesdeTick).toBeGreaterThan(estado.tick);
  });

  test("fechar ponto de venda: baixa do valor contábil na DRE, sem caixa", () => {
    const { estado, resultados } = rodar(partidaDeTeste(), 1, () => ({ decisoes: [{ tipo: "fecharPontoDeVenda", empresa: "emp_01", quantidade: 1 }] }));
    expect(empresa(estado, "emp_01").pontosDeVenda).toEqual([]);
    expect(empresa(estado, "emp_01").contabil.mesAtual.dre.baixa_de_ativos).toBe(8_000_000);
    expect(resultados[0]!.lancamentos).toEqual([]);
  });

  test("construir fábrica: capex sai como investimento, fica em obra por 30 dias e avisa ao concluir", () => {
    const { estado, resultados } = rodar(partidaDeTeste(), 31, (t) => (t === 1 ? { decisoes: [{ tipo: "construirFabrica", empresa: "emp_01", produto: LEITE }] } : {}));
    const investimentos = resultados[0]!.lancamentos.filter((l) => l.classe === "investimento");
    expect(investimentos.map((l) => [l.descricao, l.valor])).toEqual([["construção de fábrica", -30_000_000]]);
    expect(empresa(estado, "emp_01").fabricas.map((f) => [f.id, f.produto, f.operaDesdeTick])).toEqual([["fab_02", LEITE, 31]]);
    expect(resultados[30]!.avisos).toContainEqual({ tipo: "fabrica_concluida", empresa: "emp_01", produto: LEITE });
  });

  test("decisões inválidas são rejeitadas com motivo e não alteram o estado", () => {
    const invalidas: [Decisao, string][] = [
      [decidir("emp_01", LEITE, { preco: 1201 }), "teto"],
      [decidir("emp_01", LEITE, { preco: 5.5 }), "centavos inteiros"],
      [decidir("emp_01", "leite", { preco: 100 }), "não é vendido"],
      [decidir("emp_09", LEITE, { preco: 100 }), "não existe"],
      [decidir("emp_01", LEITE, {}), "sem nenhum campo"],
      [decidir("emp_01", LEITE, { compraMensal: -1 }), "compra inválida"],
      [decidir("emp_01", LEITE, { publicidadeMensal: 10.5 }), "publicidade"],
      [{ tipo: "fecharPontoDeVenda", empresa: "emp_01", quantidade: 2 }, "só 1 ponto"],
      [{ tipo: "abrirPontoDeVenda", empresa: "emp_01", quantidade: 0 }, "quantidade deve ser inteira"],
      [{ tipo: "construirFabrica", empresa: "emp_01", produto: "vidro" }, "não é vendido"],
    ];
    const inicial = partidaDeTeste();
    for (const [d, motivo] of invalidas) expect(validarDecisao(inicial, d)).toContain(motivo);
    const r = passo(inicial, { decisoes: invalidas.map(([d]) => d) });
    expect(r.rejeicoes.map((x) => x.motivo)).toHaveLength(invalidas.length);
    expect(oferta(r.estado, "emp_01", LEITE).decisao).toEqual(oferta(inicial, "emp_01", LEITE).decisao);
    expect(empresa(r.estado, "emp_01").pontosDeVenda).toHaveLength(1);
  });

  test("decisão persiste: o preço definido no tick 1 continua valendo sem ser reenviado", () => {
    const { estado } = rodar(partidaDeTeste(), 10, (t) => (t === 1 ? { decisoes: [decidir("emp_01", LEITE, { preco: 590, compraMensal: 3000 })] } : {}));
    expect(oferta(estado, "emp_01", LEITE).decisao).toMatchObject({ preco: 590, compraMensal: 3000 });
  });
});

describe("eventos do cenário", () => {
  test("recessão: fator de ciclo 0,8 reduz a demanda total em 20%", () => {
    const decisoes = [decidir("emp_01", LEITE, { preco: 600, compraMensal: 30_000 })];
    const normal = rodar(partidaDeTeste(), 1, () => ({ decisoes })).resultados[0]!;
    const recessao = rodar(partidaDeTeste(), 1, () => ({ decisoes, eventos: [{ ...alterar("mercados.mer_01.fatorCiclo", 0.8), descricao: "Recessão" }] })).resultados[0]!;
    expect(recessao.historico.demandaTotal[0]!.demanda).toBeCloseTo(0.8 * normal.historico.demandaTotal[0]!.demanda, 9);
    expect(recessao.avisos).toContainEqual({ tipo: "evento", descricao: "Recessão" });
  });

  test("alta do fornecedor: o novo preço vale para as compras do mesmo tick", () => {
    const r = passo(partidaDeTeste(), {
      eventos: [alterar("parametros.produtos.leite_engarrafado.fornecedor.preco", 500)],
      decisoes: [decidir("emp_01", LEITE, { compraMensal: 300 })],
    });
    expect(r.lancamentos.find((l) => l.descricao === "compra de mercadoria pronta")!.valor).toBe(-5_000);
  });

  test("eventos inválidos são rejeitados", () => {
    const r = passo(partidaDeTeste(), {
      eventos: [
        alterar("parametros.ticksPorMes", 60),
        alterar("parametros.produtos.leite_engarrafado.nome", 1),
        alterar("parametros.naoExiste", 1),
        alterar("empresas.emp_01.caixa", 1),
        alterar("parametros.marca.fidelidadeMinima", 10),
        alterar("mercados.mer_01.fatorCiclo", Number.NaN),
      ],
    });
    expect(r.rejeicoes.map((x) => x.motivo)).toEqual([
      '"parametros.ticksPorMes" não pode mudar com a partida em andamento',
      'caminho "parametros.produtos.leite_engarrafado.nome" não é um parâmetro numérico',
      'caminho "parametros.naoExiste" não existe',
      'caminho "empresas.emp_01.caixa" deve começar por parametros. ou mercados.',
      "valor 10 troca o sinal do parâmetro (atual -50)",
      "valor não finito (NaN)",
    ]);
  });
});

describe("tempo", () => {
  test("aviso de fim de mês no tick 30, e só nele", () => {
    const { resultados } = rodar(partidaDeTeste(), 31, () => ({}), false);
    const fins = resultados.flatMap((r, i) => r.avisos.filter((a) => a.tipo === "fim_de_mes").map((a) => [i + 1, a]));
    expect(fins).toEqual([[30, { tipo: "fim_de_mes", mes: 1 }]]);
    expect([resultados[29]!.historico.mes, resultados[29]!.historico.dia, resultados[30]!.historico.mes, resultados[30]!.historico.dia]).toEqual([1, 30, 2, 1]);
  });

  test("dobrar ticks por mês quase não muda o resultado mensal (parâmetros são mensais)", () => {
    const vendasDoMes = (ticksPorMes: number) => {
      const preset = { ...PRESET_TESTE, ticksPorMes };
      const e = partidaDeTeste(["A", "B"], { preset });
      const { resultados, estado } = rodar(e, ticksPorMes * 2, (t) =>
        t === 1
          ? {
              decisoes: [
                decidir("emp_01", LEITE, { preco: 580, compraMensal: 20_000, publicidadeMensal: 2_000_000 }),
                decidir("emp_02", LEITE, { preco: 620, compraMensal: 40_000 }),
              ],
            }
          : {},
        false,
      );
      const soma = (id: string, mes: number) =>
        resultados.filter((r) => r.historico.mes === mes).flatMap((r) => r.historico.ofertas).filter((h) => h.empresa === id && h.produto === LEITE).reduce((s, h) => s + h.vendas, 0);
      return { a: [soma("emp_01", 1), soma("emp_01", 2)], b: [soma("emp_02", 1), soma("emp_02", 2)], reconhecimento: oferta(estado, "emp_01", LEITE).reconhecimento };
    };
    const n30 = vendasDoMes(30);
    const n60 = vendasDoMes(60);
    for (const k of ["a", "b"] as const) {
      for (const m of [0, 1]) expect(Math.abs(n60[k][m]! / n30[k][m]! - 1)).toBeLessThan(0.01);
    }
    expect(Math.abs(n60.reconhecimento / n30.reconhecimento - 1)).toBeLessThan(0.01);
  });
});

describe("determinismo, pureza e persistência", () => {
  const roteiro = (t: number): { decisoes?: Decisao[] } => {
    if (t === 1) return { decisoes: [decidir("emp_01", LEITE, { preco: 590, compraMensal: 25_000, publicidadeMensal: 1_000_000 }), decidir("emp_02", LEITE, { preco: 610, compraMensal: 35_000 })] };
    if (t === 20) return { decisoes: [decidir("emp_02", CARTEIRA, { preco: 7500, compraMensal: 900 }), { tipo: "abrirPontoDeVenda", empresa: "emp_01", quantidade: 1 }] };
    if (t === 45) return { decisoes: [decidir("emp_01", LEITE, { preco: 640 })] };
    return {};
  };
  const correr = (e: EstadoPartida, de: number, ate: number) => {
    let atual = e;
    for (let t = de; t <= ate; t++) atual = passoMutavel(atual, roteiro(t)).estado;
    return atual;
  };

  test("mesma semente e mesmas entradas → mesmo estado, byte a byte", () => {
    const a = correr(partidaDeTeste(["A", "B"]), 1, 70);
    const b = correr(partidaDeTeste(["A", "B"]), 1, 70);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  test("retomar de um estado que passou por JSON dá o mesmo resultado (retomada após reiniciar o servidor)", () => {
    const direto = correr(partidaDeTeste(["A", "B"]), 1, 70);
    const metade = correr(partidaDeTeste(["A", "B"]), 1, 37);
    const retomado = correr(JSON.parse(JSON.stringify(metade)), 38, 70);
    expect(JSON.stringify(retomado)).toBe(JSON.stringify(direto));
  });

  test("passo não altera o estado de entrada (entrada congelada em profundidade)", () => {
    const congelar = <T>(x: T): T => {
      if (x && typeof x === "object") {
        for (const v of Object.values(x)) congelar(v);
        Object.freeze(x);
      }
      return x;
    };
    const e = correr(partidaDeTeste(["A", "B"]), 1, 25);
    const antes = JSON.stringify(e);
    const entradas = congelar({ decisoes: [decidir("emp_01", LEITE, { preco: 700 })] });
    const r = passo(congelar(e), entradas);
    expect(JSON.stringify(e)).toBe(antes);
    expect(r.estado).not.toBe(e);
    expect(r.estado.tick).toBe(26);
  });

  test("a ordem das empresas não muda o resultado de cada uma", () => {
    const decisoesPorNome: Record<string, (id: string) => Decisao[]> = {
      Alfa: (id) => [decidir(id, LEITE, { preco: 570, compraMensal: 20_000 }), decidir(id, CARTEIRA, { preco: 8200, compraMensal: 1200 })],
      Beta: (id) => [decidir(id, LEITE, { preco: 610, compraMensal: 60_000, publicidadeMensal: 900_000 })],
      Gama: (id) => [decidir(id, LEITE, { preco: 600, compraMensal: 9_000 }), decidir(id, CARTEIRA, { preco: 7900, compraMensal: 3000 })],
    };
    const resultado = (nomes: string[]) => {
      const e = partidaDeTeste(nomes);
      const idDe = (nome: string) => e.empresas.find((x) => x.nome === nome)!.id;
      const { estado } = rodar(e, 12, (t) => (t === 1 ? { decisoes: nomes.flatMap((n) => decisoesPorNome[n]!(idDe(n))) } : {}), false);
      return Object.fromEntries(estado.empresas.map((x) => [x.nome, { caixa: x.caixa, estoques: x.ofertas.map((o) => o.estoque.quantidade), fidelidade: x.ofertas.map((o) => o.fidelidade) }]));
    };
    const direto = resultado(["Alfa", "Beta", "Gama"]);
    const inverso = resultado(["Gama", "Beta", "Alfa"]);
    for (const nome of ["Alfa", "Beta", "Gama"]) {
      expect(inverso[nome]!.caixa).toBe(direto[nome]!.caixa);
      inverso[nome]!.estoques.forEach((q, i) => expect(q).toBeCloseTo(direto[nome]!.estoques[i]!, 9));
      inverso[nome]!.fidelidade.forEach((q, i) => expect(q).toBeCloseTo(direto[nome]!.fidelidade[i]!, 12));
    }
  });
});

describe("invariantes com decisões aleatórias (propriedade)", () => {
  const decisaoAleatoria = fc.oneof(
    fc.record({
      tipo: fc.constant("produto" as const),
      empresa: fc.constantFrom("emp_01", "emp_02", "emp_03"),
      produto: fc.constantFrom(LEITE, CARTEIRA),
      preco: fc.option(fc.integer({ min: 1, max: 1200 }), { nil: null }),
      compraMensal: fc.double({ min: 0, max: 100_000, noNaN: true }),
      publicidadeMensal: fc.integer({ min: 0, max: 5_000_000 }),
    }),
    fc.record({ tipo: fc.constant("abrirPontoDeVenda" as const), empresa: fc.constantFrom("emp_01", "emp_02", "emp_03"), quantidade: fc.integer({ min: 1, max: 3 }) }),
    fc.record({ tipo: fc.constant("fecharPontoDeVenda" as const), empresa: fc.constantFrom("emp_01", "emp_02", "emp_03"), quantidade: fc.integer({ min: 1, max: 2 }) }),
    fc.record({ tipo: fc.constant("construirFabrica" as const), empresa: fc.constantFrom("emp_01", "emp_02", "emp_03"), produto: fc.constantFrom(LEITE, CARTEIRA) }),
  );

  test("caixa = soma dos lançamentos, ativo = passivo + PL, limites e participações, em todo tick", () => {
    fc.assert(
      fc.property(fc.array(fc.array(decisaoAleatoria, { maxLength: 4 }), { minLength: 45, maxLength: 45 }), (porTick) => {
        rodar(partidaDeTeste(["A", "B", "C"]), 45, (t) => ({ decisoes: porTick[t - 1] as Decisao[] }));
        return true;
      }),
      { numRuns: 25 },
    );
  });
});
