import { describe, expect, test } from "bun:test";
import { PRESET_CADEIA_MINIMA, PRESET_INTRODUTORIO } from "@simulador/catalogo";
import { criarPartida, type Decisao, type EstadoPartida, passo, visaoDaEmpresa } from "../src";
import { empresa, rodar } from "./ajuda";

function partida(): EstadoPartida {
  const estado = criarPartida({ preset: PRESET_CADEIA_MINIMA, semente: "visao", empresas: [{ nome: "Alfa" }, { nome: "Beta" }, { nome: "Gama" }], modulos: ["cadeia_produtiva"] });
  estado.parametros.produtos.find((p) => p.id === "leite")!.fornecedor = { preco: 300, qualidade: 50, ofertaMaxMensal: null };
  estado.parametros.cadeia!.cooperativa.fatorPiso = 0.6;
  return estado;
}

const construir = (e: string, atividade: string, producaoMensal: number): Decisao => ({ tipo: "construirFazenda", empresa: e, atividade, producaoMensal });

describe("visão da cadeia", () => {
  test("sem o módulo, a visão não tem cadeia (campo null) e o resto fica como era", () => {
    const estado = criarPartida({ preset: PRESET_CADEIA_MINIMA, semente: "x", empresas: [{ nome: "Alfa" }] });
    expect(visaoDaEmpresa(estado, "emp_01").cadeia).toBeNull();
    const intro = criarPartida({ preset: PRESET_INTRODUTORIO, semente: "x", empresas: [{ nome: "Alfa" }] });
    expect(visaoDaEmpresa(intro, "emp_01").cadeia).toBeNull();
  });

  test("com o módulo, traz as regras das atividades, as fazendas e os estoques da própria empresa", () => {
    const estado = partida();
    const { estado: depois } = rodar(estado, 3, (t) => ({ decisoes: t === 1 ? [construir("emp_01", "gado_leiteiro", 6000)] : [] }));
    const v = visaoDaEmpresa(depois, "emp_01").cadeia!;
    expect(v.atividades.map((a) => a.id)).toEqual(["gado_de_corte", "gado_leiteiro", "frango", "morango", "cana_de_acucar"]);
    expect(v.atividades[0]!.produz).toEqual([{ produto: "carne_bovina_congelada", proporcao: 1 }, { produto: "couro", proporcao: 0.5 }]);
    expect(v.cooperativa.fatorPiso).toBe(0.6);
    expect(v.completaComFornecedor).toBe(true);
    expect(v.fazendas).toHaveLength(1);
    expect(v.fazendas[0]).toMatchObject({ id: "faz_03", atividade: "gado_leiteiro", producaoMensal: 6000, emObra: true, emConversao: false, produzindo: false });
    expect(v.materiasPrimas.map((m) => m.produto)).toEqual(["acucar", "carne_bovina_congelada", "couro", "frango_congelado", "leite", "morango"]);
    const leite = v.materiasPrimas.find((m) => m.produto === "leite")!;
    expect(leite).toMatchObject({ nome: "Leite", precoFornecedor: 300, precoCooperativa: 180, capacidade: 0, diasCheio: 0, ofertaAtacado: null, pedidoAtacado: null });
    expect(leite.serie).toEqual([0, 0, 0]);
    expect(v.faixaDoAtacado.leite).toEqual({ piso: 180, teto: 300 });
  });

  test("a fazenda aparece produzindo quando a obra termina e em conversão quando troca de atividade", () => {
    const estado = partida();
    const { estado: pronta } = rodar(estado, 31, (t) => ({ decisoes: t === 1 ? [construir("emp_01", "gado_leiteiro", 6000)] : [] })); // obra: 30 dias
    expect(visaoDaEmpresa(pronta, "emp_01").cadeia!.fazendas[0]).toMatchObject({ emObra: false, produzindo: true });
    const troca = passo(pronta, { decisoes: [{ tipo: "trocarAtividade", empresa: "emp_01", fazenda: "faz_03", atividade: "frango", desova: "destruir" }] });
    expect(visaoDaEmpresa(troca.estado, "emp_01").cadeia!.fazendas[0]).toMatchObject({ atividade: "frango", emConversao: true, produzindo: false, experiencia: 0 });
  });

  test("a visão é uma cópia: alterar o que ela devolve não altera o estado", () => {
    const estado = partida();
    const r = passo(estado, { decisoes: [{ tipo: "produto", empresa: "emp_01", produto: "carteira", origemInsumos: { couro: "propria" } }] });
    const v = visaoDaEmpresa(r.estado, "emp_01");
    v.empresa.ofertas.find((o) => o.produto === "carteira")!.decisao.origemInsumos.couro = "fornecedor";
    v.cadeia!.materiasPrimas[0]!.serie.push(99);
    v.cadeia!.atividades[0]!.produz[0]!.proporcao = 7;
    expect(empresa(r.estado, "emp_01").ofertas.find((o) => o.produto === "carteira")!.decisao.origemInsumos).toEqual({ couro: "propria" });
    expect(empresa(r.estado, "emp_01").materiasPrimas.acucar!.serie).toEqual([0]);
    expect(r.estado.parametros.cadeia!.atividades[0]!.produz[0]!.proporcao).toBe(1);
  });
});

describe("o que a visão não revela", () => {
  /** Alfa tem fazenda, estoque, oferta e pedido; Beta e Gama olham. */
  function cenario() {
    const estado = partida();
    const alfa = empresa(estado, "emp_01");
    Object.assign(alfa.materiasPrimas.leite!.estoque, { quantidade: 777, valor: 123_457, qualidade: 66 });
    alfa.caixa -= 123_457;
    const r = passo(estado, {
      decisoes: [
        construir("emp_01", "gado_leiteiro", 4242),
        { tipo: "ofertarNoAtacado", empresa: "emp_01", produto: "leite", preco: 250, quantidadeMensal: 3000 },
        { tipo: "comprarNoAtacado", empresa: "emp_01", produto: "couro", vendedor: "emp_02", quantidadeMensal: 913.37 },
        { tipo: "produto", empresa: "emp_01", produto: "carteira", origemInsumos: { couro: "propria" }, publicidadeMensal: 87_654 },
      ],
    });
    return r.estado;
  }

  test("os concorrentes veem só a oferta pública de atacado (vendedor, produto, preço, quantidade e qualidade)", () => {
    const estado = cenario();
    const v = visaoDaEmpresa(estado, "emp_02").cadeia!;
    expect(v.atacado).toHaveLength(1);
    expect(Object.keys(v.atacado[0]!).sort()).toEqual(["preco", "produto", "qualidade", "quantidadeMensal", "vendedor"]);
    expect(v.atacado[0]).toMatchObject({ vendedor: "emp_01", produto: "leite", preco: 250, quantidadeMensal: 3000 });
    // O vendedor não vê a própria oferta na lista dos outros.
    expect(visaoDaEmpresa(estado, "emp_01").cadeia!.atacado).toEqual([]);
  });

  test("nada do estoque, das fazendas, dos pedidos e das decisões internas de uma empresa aparece na visão de outra", () => {
    const estado = cenario();
    const texto = JSON.stringify(visaoDaEmpresa(estado, "emp_02"));
    // Valores que só existem na empresa 1.
    for (const segredo of ["777", "123457", "4242", "87654", "913.37", "faz_03", "\"pedidoAtacado\":{", "propria"]) {
      expect({ segredo, vazou: texto.includes(segredo) }).toEqual({ segredo, vazou: false });
    }
    // A visão de Beta tem as próprias fazendas, estoques e pedidos, mas vazios.
    const beta = visaoDaEmpresa(estado, "emp_02").cadeia!;
    expect(beta.fazendas).toEqual([]);
    expect(beta.materiasPrimas.every((m) => m.estoque.quantidade === 0 && m.pedidoAtacado === null && m.ofertaAtacado === null)).toBe(true);
    expect(visaoDaEmpresa(estado, "emp_01").cadeia!.materiasPrimas.find((m) => m.produto === "leite")!.estoque.quantidade).toBeGreaterThan(700);
  });

  test("a oferta de atacado de outro mercado não aparece", () => {
    const estado = criarPartida({
      preset: PRESET_CADEIA_MINIMA,
      semente: "m",
      mercados: [{ nome: "M1" }, { nome: "M2" }],
      empresas: [{ nome: "Alfa", mercado: 0 }, { nome: "Beta", mercado: 1 }],
      modulos: ["cadeia_produtiva"],
    });
    const teto = visaoDaEmpresa(estado, "emp_01").cadeia!.faixaDoAtacado.leite!.teto;
    const r = passo(estado, { decisoes: [{ tipo: "ofertarNoAtacado", empresa: "emp_01", produto: "leite", preco: teto, quantidadeMensal: 3000 }] });
    expect(r.rejeicoes).toEqual([]);
    expect(r.estado.empresas[0]!.materiasPrimas.leite!.ofertaAtacado).not.toBeNull();
    expect(visaoDaEmpresa(r.estado, "emp_02").cadeia!.atacado).toEqual([]);
  });
});
