/**
 * Regras da tela de jogo do aluno, sem DOM: cores das empresas, fatias e séries da participação,
 * validação campo a campo (concordando com o servidor), avisos de esgotado e de 1º lugar, e os
 * formatos de largura estável.
 */
import { describe, expect, test } from "bun:test";
import { PALETA_EQUIPES, type ParticipacaoSemanal, type SemanaDaOferta, type VisaoAluno } from "@simulador/compartilhado";
import fc from "fast-check";
import {
  avisoDoPrimeiroLugar,
  cobertura,
  dataPorExtenso,
  destaquesDoMes,
  empresasDoMercado,
  fatiasDoProduto,
  novosEsgotados,
  ofertasDoProduto,
  passoDeQuantidade,
  plural,
  posicaoDaNota,
  produtosEsgotados,
  quantidadeCom,
  reaisCurtos,
  reaisDoEixo,
  semanaGlobal,
  seriesDeParticipacao,
  subtituloDaData,
  topoDoEixo,
  validarCampo,
} from "../src/aluno/jogo";
import { CAMPOS_PRODUTO } from "../src/aluno/regras";
import { LEITE, salaDeExemplo } from "./fixtures";

const CARTEIRA = "carteira";

describe("empresas do mercado e cores", () => {
  test("equipes com a cor escolhida; robôs com cores livres, todas diferentes; a equipe marcada", () => {
    const s = salaDeExemplo();
    s.jogar(2); // a vaga livre vira robô ao iniciar
    const v = s.visaoAluno(s.membros.ana);
    const e = empresasDoMercado(v);
    expect(e.map((x) => x.id)).toEqual(["emp_01", "emp_02", "emp_03"]);
    expect(e[0]).toMatchObject({ nome: "Alfa", nos: true, robo: false, cor: PALETA_EQUIPES.find((c) => c.id === "azul")!.hex });
    expect(e[1]).toMatchObject({ nome: "Beta", nos: false, cor: PALETA_EQUIPES.find((c) => c.id === "verde")!.hex });
    expect(e[2]!.robo).toBe(true);
    expect(new Set(e.map((x) => x.cor)).size).toBe(3);
    expect(["azul", "verde"].map((id) => PALETA_EQUIPES.find((c) => c.id === id)!.hex)).not.toContain(e[2]!.cor);
  });

  test("ofertas em ordem fixa (a equipe primeiro) e fatias que somam 1, na ordem das vagas", () => {
    const s = salaDeExemplo();
    s.sala.decidir(s.id(), s.membros.ana, [{ tipo: "produto", produto: LEITE, preco: 560, compraMensal: 20_000 }]);
    s.sala.decidir(s.id(), s.membros.caio, [{ tipo: "produto", produto: LEITE, preco: 590, compraMensal: 20_000 }]);
    s.jogar(5);
    const v = s.visaoAluno(s.membros.ana);
    const o = ofertasDoProduto(v, LEITE);
    expect(o[0]!.empresa.nos).toBe(true);
    expect(o.map((x) => x.empresa.id).sort()).toEqual(["emp_01", "emp_02", "emp_03"]);
    const f = fatiasDoProduto(v, LEITE);
    expect(Math.abs(f.reduce((t, x) => t + x.fracao, 0) - 1)).toBeLessThan(1e-9);
    expect(f.map((x) => x.empresa.id)).toEqual([...f.map((x) => x.empresa.id)].sort());
    // Fatia proporcional à participação pública de ontem.
    const nos = v.visao.empresa.ofertas.find((x) => x.produto === LEITE)!.participacaoAnterior;
    const total = o.reduce((t, x) => t + x.participacao, 0);
    expect(f.find((x) => x.empresa.nos)!.fracao).toBeCloseTo(nos / total, 9);
    // Posição da nota: 1 + quantos vendem com nota maior.
    const pos = posicaoDaNota(v, LEITE)!;
    const vendem = o.filter((x) => x.preco !== null);
    expect(pos).toEqual({ posicao: 1 + vendem.filter((x) => x.nota > o[0]!.nota).length, de: vendem.length });
    // Carteira: só o robô vende. A fatia dele é tudo; a equipe (fora de venda) não tem posição na nota.
    expect(fatiasDoProduto(v, CARTEIRA).map((x) => [x.empresa.id, x.fracao])).toEqual([["emp_03", 1]]);
    expect(posicaoDaNota(v, CARTEIRA)).toBeNull();
  });
});

describe("séries semanais", () => {
  const r = (semana: number, empresa: string, participacao: number, produto = LEITE): ParticipacaoSemanal => ({ semana, empresa, produto, participacao });

  test("alinha as semanas e põe 0 onde a empresa não aparece", () => {
    const { semanas, valores } = seriesDeParticipacao([r(2, "emp_01", 0.3), r(1, "emp_01", 0.2), r(2, "emp_02", 0.5), r(1, "emp_01", 0.9, CARTEIRA)], LEITE, ["emp_01", "emp_02"]);
    expect(semanas).toEqual([1, 2]);
    expect(valores).toEqual({ emp_01: [0.2, 0.3], emp_02: [0, 0.5] });
  });

  test("topo do eixo: múltiplo de 10%, cobre os valores e nunca encolhe", () => {
    fc.assert(
      fc.property(fc.array(fc.array(fc.double({ min: 0, max: 1, noNaN: true }), { maxLength: 8 }), { minLength: 1, maxLength: 10 }), (lotes) => {
        let topo = 0;
        for (const valores of lotes) {
          const novo = topoDoEixo(topo, valores);
          if (novo < topo) return false;
          if (Math.abs(novo * 10 - Math.round(novo * 10)) > 1e-9) return false;
          if (valores.some((x) => x > novo + 1e-9)) return false;
          topo = novo;
        }
        return topo <= 1 && topo >= 0.1;
      }),
    );
  });

  test("semana global igual à do histórico do servidor (4 por mês)", () => {
    expect(semanaGlobal(0, 30)).toBe(0);
    expect(semanaGlobal(1, 30)).toBe(1);
    expect(semanaGlobal(7, 30)).toBe(1);
    expect(semanaGlobal(8, 30)).toBe(2);
    expect(semanaGlobal(30, 30)).toBe(4);
    expect(semanaGlobal(31, 30)).toBe(5);
  });

  test("destaques do mês: mais e menos faturou, só da equipe e do mês", () => {
    const sem = (mes: number, empresa: string, produto: string, receita: number) => ({ semana: 1, mes, empresa, mercado: "m", produto, receita }) as SemanaDaOferta;
    const h = [sem(1, "emp_01", "a", 100), sem(1, "emp_01", "b", 300), sem(1, "emp_01", "a", 50), sem(1, "emp_02", "c", 999), sem(2, "emp_01", "c", 999), sem(1, "emp_01", "d", 0)];
    expect(destaquesDoMes(h, 1, "emp_01")).toEqual({ melhor: { produto: "b", receita: 300 }, pior: { produto: "a", receita: 150 } });
    expect(destaquesDoMes([sem(1, "emp_01", "a", 10)], 1, "emp_01")).toEqual({ melhor: { produto: "a", receita: 10 }, pior: null });
    expect(destaquesDoMes([], 1, "emp_01")).toEqual({ melhor: null, pior: null });
  });
});

describe("campo a campo", () => {
  test("erro, nada a mudar ou a decisão só daquele campo", () => {
    const s = salaDeExemplo();
    const v = s.visaoAluno(s.membros.ana);
    const teto = v.visao.produtos.find((p) => p.id === LEITE)!.precoMaximo;
    expect(validarCampo(v.visao, v.pendentes, LEITE, "preco", "5,90")).toEqual({ tipo: "decisao", decisao: { tipo: "produto", produto: LEITE, preco: 590 } });
    expect(validarCampo(v.visao, v.pendentes, LEITE, "preco", String((teto + 100) / 100).replace(".", ","))).toEqual({ tipo: "erro", motivo: "acima do preço máximo" });
    expect(validarCampo(v.visao, v.pendentes, LEITE, "compraMensal", "1.000")).toEqual({ tipo: "decisao", decisao: { tipo: "produto", produto: LEITE, compraMensal: 1000 } });
    expect(validarCampo(v.visao, v.pendentes, LEITE, "compraMensal", "0")).toEqual({ tipo: "sem-mudanca" });
    expect(validarCampo(v.visao, v.pendentes, LEITE, "publicidadeMensal", "dez").tipo).toBe("erro");
    // Igual ao pendente (que já vale amanhã): nada a mudar.
    s.sala.decidir(s.id(), s.membros.ana, [{ tipo: "produto", produto: LEITE, preco: 590 }]);
    const v2 = s.visaoAluno(s.membros.ana);
    expect(validarCampo(v2.visao, v2.pendentes, LEITE, "preco", "5,90")).toEqual({ tipo: "sem-mudanca" });
  });

  test("tudo o que um campo aceita o servidor também aceita", () => {
    const texto = fc.oneof(
      fc.integer({ min: 0, max: 30_000 }).map(String),
      fc.integer({ min: 0, max: 3_000_000 }).map((c) => (c / 100).toFixed(2).replace(".", ",")),
      fc.integer({ min: 1, max: 999_999 }).map((n) => n.toLocaleString("pt-BR")),
      fc.string({ maxLength: 6 }),
    );
    fc.assert(
      fc.property(fc.constantFrom(LEITE, CARTEIRA), fc.constantFrom(...CAMPOS_PRODUTO), texto, (produto, campo, t) => {
        const s = salaDeExemplo();
        const v = s.visaoAluno(s.membros.ana);
        const r = validarCampo(v.visao, v.pendentes, produto, campo, t);
        if (r.tipo !== "decisao") return true;
        if (Object.keys(r.decisao).filter((k) => k !== "tipo" && k !== "produto").join() !== campo) return false;
        const resp = s.sala.decidir(s.id(), s.membros.ana, [r.decisao]);
        return resp.ok || (console.error({ produto, campo, t, r, resp }), false);
      }),
      { numRuns: 200 },
    );
  });

  test("passo das quantidades: potência de 10; cobertura do estoque", () => {
    const s = salaDeExemplo();
    const v = s.visaoAluno(s.membros.ana);
    for (const p of v.visao.produtos) {
      const passo = passoDeQuantidade(v.visao, p.id);
      expect(Number.isInteger(Math.log10(passo))).toBe(true);
    }
    expect(passoDeQuantidade(v.visao, "inexistente")).toBe(1);
    expect(cobertura(0, 10)).toBe(0);
    expect(cobertura(50, 10)).toBe(5);
    expect(cobertura(50, 0)).toBe(Infinity);
  });
});

describe("avisos flutuantes", () => {
  test("esgotado: não avisa na primeira visão; avisa uma vez; repete só depois de recuperar", () => {
    expect(novosEsgotados(null, new Set(["a"]))).toEqual([]);
    expect(novosEsgotados(new Set(), new Set(["a"]))).toEqual(["a"]);
    expect(novosEsgotados(new Set(["a"]), new Set(["a"]))).toEqual([]);
    expect(novosEsgotados(new Set(["a"]), new Set())).toEqual([]);
    expect(novosEsgotados(new Set(), new Set(["a", "b"]))).toEqual(["a", "b"]);
  });

  test("esgotados são só os produtos à venda que terminaram o dia sem estoque", () => {
    const s = salaDeExemplo();
    s.sala.decidir(s.id(), s.membros.ana, [{ tipo: "produto", produto: LEITE, preco: 560, compraMensal: 30 }]);
    s.jogar(3);
    const v = s.visaoAluno(s.membros.ana);
    expect(v.visao.empresa.ofertas.find((o) => o.produto === LEITE)!.estoque.quantidade).toBe(0);
    expect([...produtosEsgotados(v)]).toEqual([LEITE]); // a carteira está fora de venda: não conta
  });

  test("ranking: só quando envolve o 1º lugar", () => {
    expect(avisoDoPrimeiroLugar(2, 1)).toContain("assumiram o 1º");
    expect(avisoDoPrimeiroLugar(1, 3)).toContain("perderam o 1º lugar: agora estão em 3º");
    expect(avisoDoPrimeiroLugar(2, 3)).toBeNull();
    expect(avisoDoPrimeiroLugar(3, 2)).toBeNull();
    expect(avisoDoPrimeiroLugar(1, 1)).toBeNull();
    expect(avisoDoPrimeiroLugar(null, 1)).toBeNull();
  });
});

describe("formatos de largura estável", () => {
  test("reais curtos: casas fixas por faixa (o número não muda de largura dentro da faixa)", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1_000_000, max: 99_994_999 }), fc.integer({ min: 1_000_000, max: 99_994_999 }), (a, b) => {
        // R$ 10 mil a R$ 999,9 mil: sempre uma casa; mesmo número de dígitos → mesma largura.
        const fa = reaisCurtos(a), fb = reaisCurtos(b);
        return /^R\$ \d{2,3},\d mil$/.test(fa) && (String(Math.round(a / 100_000)).length !== String(Math.round(b / 100_000)).length || fa.length === fb.length);
      }),
    );
    expect(reaisCurtos(125_000_000)).toBe("R$ 1,25 mi");
    expect(reaisCurtos(100_000_000)).toBe("R$ 1,00 mi");
    // Fronteiras: decide a faixa depois de arredondar.
    expect(reaisCurtos(99_995_000)).toBe("R$ 1,00 mi");
    expect(reaisCurtos(99_994_999)).toBe("R$ 999,9 mil");
    expect(reaisCurtos(999_950)).toBe("R$ 10,0 mil");
    expect(reaisCurtos(999_949)).toBe("R$ 9.999");
    expect(reaisCurtos(-930_000)).toBe("−R$ 9.300");
    expect(reaisCurtos(-9_300_000)).toBe("−R$ 93,0 mil");
    expect(reaisCurtos(0)).toBe("R$ 0");
    expect(reaisCurtos(-20)).toBe("R$ 0");
  });

  test("reais do eixo: curtos e com sinal", () => {
    expect(reaisDoEixo(-50_000_000)).toBe("−R$ 500 mil");
    expect(reaisDoEixo(150_000_000)).toBe("R$ 1,5 mi");
    expect(reaisDoEixo(0)).toBe("R$ 0");
  });

  test("datas e unidades", () => {
    expect(dataPorExtenso(0, 30)).toBe("Antes do início");
    expect(dataPorExtenso(1, 30)).toBe("1 de janeiro");
    expect(dataPorExtenso(330, 30)).toBe("30 de novembro");
    expect(dataPorExtenso(361, 30)).toBe("1 de janeiro");
    expect(subtituloDaData({ tick: 31, mes: 2, duracaoMeses: 12 })).toBe("Mês 2 de 12 · ano 1");
    expect(subtituloDaData({ tick: 400, mes: 14, duracaoMeses: 12 })).toBe("Prorrogação · mês 14");
    expect(subtituloDaData({ tick: 0, mes: 1, duracaoMeses: 12 })).toBe("12 meses de partida");
    expect(["garrafa", "pote", "par", "unidade", "litro"].map(plural)).toEqual(["garrafas", "potes", "pares", "unidades", "litros"]);
    expect(quantidadeCom(1, "par")).toBe("1 par");
    expect(quantidadeCom(0, "par")).toBe("0 pares");
    expect(quantidadeCom(12_345, "garrafa")).toBe("12.345 garrafas");
  });
});

// Garantia de tipo: as fixtures produzem a visão real.
const _v: (s: ReturnType<typeof salaDeExemplo>) => VisaoAluno = (s) => s.visaoAluno(s.membros.ana);
void _v;
