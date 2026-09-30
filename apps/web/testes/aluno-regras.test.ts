/**
 * Regras da tela do aluno, sem DOM: nota decomposta, decisões efetivas, rascunho → decisões (com
 * concordância com o servidor), DRE e cores livres.
 */
import { describe, expect, test } from "bun:test";
import type { VisaoAluno } from "@simulador/compartilhado";
import fc from "fast-check";
import { coresLivres, decisoesDoRascunho, decisoesEfetivas, decomporNota, lerQuantidade, linhasDRE, type Rascunho, textoDoStatusAluno } from "../src/aluno/regras";
import { LEITE, salaDeExemplo } from "./fixtures";

const CARTEIRA = "carteira";

describe("nota decomposta", () => {
  test("as três parcelas somam a nota; qualidade e marca seguem os pesos", () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 100, noNaN: true }), fc.double({ min: 0, max: 100, noNaN: true }), fc.double({ min: -200, max: 200, noNaN: true }), fc.integer({ min: 0, max: 100 }), (q, m, n, pq) => {
        const pesos = { qualidade: pq, marca: 100 - pq };
        const d = decomporNota(q, m, n, pesos);
        return Math.abs(d.qualidade + d.marca + d.preco - n) < 1e-9 && Math.abs(d.qualidade - (q * pq) / 60) < 1e-9 && d.total === n;
      }),
    );
  });

  test("confere com a nota que o motor calculou (parcela do preço = fórmula com o P_ref)", () => {
    const s = salaDeExemplo();
    s.sala.decidir(s.id(), s.membros.ana, [{ tipo: "produto", produto: LEITE, preco: 540, compraMensal: 30_000 }]);
    s.jogar(3);
    const v = s.visaoAluno(s.membros.ana);
    const p = v.visao.produtos.find((x) => x.id === LEITE)!;
    const o = v.visao.empresa.ofertas.find((x) => x.produto === LEITE)!;
    const d = decomporNota(o.qualidade, o.marca, o.notaAnterior, p.pesos);
    // P_ref do leite no preset de teste: R$ 6,00. Parcela do preço = (Pref − P)/Pref × PP.
    const esperado = ((600 - 540) / 600) * p.pesos.preco;
    expect(Math.abs(d.preco - esperado)).toBeLessThan(0.5);
  });
});

describe("decisões efetivas e rascunho", () => {
  const base = () => {
    const s = salaDeExemplo();
    return { s, v: s.visaoAluno(s.membros.ana) };
  };

  test("efetivas: vigente + pendentes em ordem; a última vence", () => {
    const { v } = base();
    const ef = decisoesEfetivas(v.visao, [
      { tipo: "produto", produto: LEITE, preco: 500, compraMensal: 100 },
      { tipo: "construirFabrica", produto: LEITE },
      { tipo: "produto", produto: LEITE, preco: 510 },
    ]);
    expect(ef[LEITE]).toMatchObject({ preco: 510, compraMensal: 100 });
    expect(ef[CARTEIRA]).toEqual(v.visao.empresa.ofertas.find((o) => o.produto === CARTEIRA)!.decisao);
  });

  test("só os campos que mudam viram decisão; valores digitados em formato brasileiro", () => {
    const { v } = base();
    const ef = decisoesEfetivas(v.visao, []);
    const leite = ef[LEITE]!;
    const r: Rascunho = {
      [LEITE]: { preco: "5,90", compraMensal: "12.000", publicidadeMensal: "1.500,00", pdMensal: leite.pdMensal === 0 ? "0" : "0" },
      [CARTEIRA]: { compraMensal: String(ef[CARTEIRA]!.compraMensal) },
    };
    const { decisoes, erros } = decisoesDoRascunho(r, v.visao, ef);
    expect(erros).toEqual({});
    expect(decisoes).toEqual([{ tipo: "produto", produto: LEITE, preco: 590, compraMensal: 12000, publicidadeMensal: 150000 }]);
  });

  test("digitar o mesmo valor que já vale (vigente ou pendente) não gera decisão", () => {
    const { s } = base();
    s.sala.decidir(s.id(), s.membros.ana, [{ tipo: "produto", produto: LEITE, preco: 600, compraMensal: 1000, publicidadeMensal: 50_000 }]);
    const v = s.visaoAluno(s.membros.ana);
    const ef = decisoesEfetivas(v.visao, v.pendentes);
    const r: Rascunho = { [LEITE]: { vender: true, preco: "6,00", compraMensal: "1.000", publicidadeMensal: "500" } };
    expect(decisoesDoRascunho(r, v.visao, ef)).toEqual({ decisoes: [], erros: {} });
  });

  test("erros por campo e nada enviado do produto com erro", () => {
    const { v } = base();
    const ef = decisoesEfetivas(v.visao, []);
    const teto = v.visao.produtos.find((p) => p.id === LEITE)!.precoMaximo;
    const r: Rascunho = { [LEITE]: { preco: String((teto + 100) / 100).replace(".", ","), compraMensal: "12,5" }, [CARTEIRA]: { preco: "abc", publicidadeMensal: "-10" } };
    const { decisoes, erros } = decisoesDoRascunho(r, v.visao, ef);
    expect(decisoes).toEqual([]);
    expect(erros[LEITE]).toEqual({ preco: "acima do preço máximo", compraMensal: expect.stringContaining("inteiro") });
    expect(Object.keys(erros[CARTEIRA]!).sort()).toEqual(["preco", "publicidadeMensal"]);
  });

  test("parar de vender e voltar a vender (exige preço)", () => {
    const { s, v } = base();
    // Sala nova: o produto começa fora de venda. Marcar sem preço é erro; com preço, decide.
    const ef = decisoesEfetivas(v.visao, []);
    expect(ef[LEITE]!.preco).toBeNull();
    expect(decisoesDoRascunho({ [LEITE]: { vender: true } }, v.visao, ef).erros[LEITE]).toEqual({ preco: expect.any(String) });
    expect(decisoesDoRascunho({ [LEITE]: { vender: true, preco: "6" } }, v.visao, ef).decisoes).toEqual([{ tipo: "produto", produto: LEITE, preco: 600 }]);
    // Vendendo (preço pendente já conta como efetivo): desmarcar vira preço null.
    s.sala.decidir(s.id(), s.membros.ana, [{ tipo: "produto", produto: LEITE, preco: 600 }]);
    const v2 = s.visaoAluno(s.membros.ana);
    const ef2 = decisoesEfetivas(v2.visao, v2.pendentes);
    expect(ef2[LEITE]!.preco).toBe(600);
    expect(decisoesDoRascunho({ [LEITE]: { vender: false } }, v2.visao, ef2).decisoes).toEqual([{ tipo: "produto", produto: LEITE, preco: null }]);
    // Desmarcar o que já está fora de venda não gera decisão.
    expect(decisoesDoRascunho({ [LEITE]: { vender: false } }, v.visao, ef).decisoes).toEqual([]);
  });

  test("compra sem fornecedor, produção e P&D sem fabricação: erro na tela", () => {
    const { v } = base();
    const visao: VisaoAluno["visao"] = JSON.parse(JSON.stringify(v.visao));
    const p = visao.produtos.find((x) => x.id === LEITE)!;
    p.fornecedor = null;
    p.fabricacao = null;
    const ef = decisoesEfetivas(visao, []);
    const { erros } = decisoesDoRascunho({ [LEITE]: { compraMensal: "10", producaoMensal: "10", pdMensal: "100" } }, visao, ef);
    expect(Object.keys(erros[LEITE]!).sort()).toEqual(["compraMensal", "pdMensal", "producaoMensal"]);
    // Zero continua valendo (desligar uma compra que já não se aplica).
    expect(decisoesDoRascunho({ [LEITE]: { compraMensal: "0" } }, visao, ef).erros).toEqual({});
  });

  test("tudo o que a tela aceita o servidor também aceita", () => {
    const campo = fc.oneof(
      fc.constant(undefined),
      fc.constant(""),
      fc.integer({ min: 0, max: 20_000 }).map(String),
      fc.integer({ min: 0, max: 2_000_000 }).map((c) => (c / 100).toFixed(2).replace(".", ",")),
      fc.string({ maxLength: 6 }),
    );
    const produto = fc.record({ vender: fc.option(fc.boolean(), { nil: undefined }), preco: campo, compraMensal: campo, producaoMensal: campo, publicidadeMensal: campo, pdMensal: campo });
    fc.assert(
      fc.property(produto, produto, (a, b) => {
        const s = salaDeExemplo();
        const v = s.visaoAluno(s.membros.ana);
        const limpar = (x: typeof a) => Object.fromEntries(Object.entries(x).filter(([, y]) => y !== undefined));
        const { decisoes, erros } = decisoesDoRascunho({ [LEITE]: limpar(a), [CARTEIRA]: limpar(b) }, v.visao, decisoesEfetivas(v.visao, v.pendentes));
        if (decisoes.length === 0) return true;
        const r = s.sala.decidir(s.id(), s.membros.ana, decisoes);
        return r.ok || (console.error({ decisoes, erros, r }), false);
      }),
      { numRuns: 150 },
    );
  });

  test("quantidades", () => {
    expect(lerQuantidade("12.000")).toBe(12000);
    expect(lerQuantidade(" 7 ")).toBe(7);
    expect(lerQuantidade("0")).toBe(0);
    for (const ruim of ["", "-1", "1,5", "abc", "1e3", "1234567890"]) expect(lerQuantidade(ruim)).toBeNull();
  });
});

describe("relatórios e entrada", () => {
  test("DRE: as linhas fecham com os totais do motor em cada mês", () => {
    const s = salaDeExemplo();
    s.sala.decidir(s.id(), s.membros.ana, [{ tipo: "produto", produto: LEITE, preco: 580, compraMensal: 25_000, publicidadeMensal: 200_000 }, { tipo: "abrirPontoDeVenda", quantidade: 1 }]);
    s.jogar(60);
    const f = s.visaoAluno(s.membros.ana).fechamentos;
    expect(f.map((x) => x.mes)).toEqual([1, 2]);
    const linhas = linhasDRE(f);
    const valor = (rotulo: string) => linhas.find((l) => l.rotulo === rotulo)!.valores;
    for (let i = 0; i < f.length; i++) {
      const despesas = linhas.filter((l) => l.rotulo.startsWith("(−)") && l.rotulo !== "(−) Imposto de renda").reduce((t, l) => t + l.valores[i]!, 0);
      expect(valor("Receita de vendas")[i]! + despesas).toBe(f[i]!.lucroAntesIR);
      expect(valor("Lucro antes do IR")[i]! + valor("(−) Imposto de renda")[i]!).toBe(f[i]!.lucroLiquido);
      expect(valor("Lucro bruto")[i]).toBe(valor("Receita de vendas")[i]! + valor("(−) Custo dos produtos vendidos")[i]!);
    }
    expect(valor("Receita de vendas")[0]).toBeGreaterThan(0);
  });

  test("cores livres: as do mercado da vaga, sem as já escolhidas", () => {
    const s = salaDeExemplo();
    const v = s.visaoAluno(s.membros.ana);
    const livre = v.vagas.find((x) => !x.equipe)!;
    const cores = coresLivres(v.vagas, livre).map((c) => c.id);
    expect(cores).not.toContain("azul");
    expect(cores).not.toContain("verde");
    expect(cores).toHaveLength(6);
  });

  test("status para o aluno", () => {
    expect(textoDoStatusAluno({ status: "pausada", motivoPausa: "fim_do_mes", podeEditar: true })).toContain("hora de decidir");
    expect(textoDoStatusAluno({ status: "pausada", motivoPausa: "manual", podeEditar: false })).toBe("Pausada pelo professor");
    expect(textoDoStatusAluno({ status: "pausada", motivoPausa: "manual", podeEditar: true })).toContain("liberadas");
    expect(textoDoStatusAluno({ status: "preparacao", motivoPausa: null, podeEditar: true })).toContain("Aguardando");
  });
});
