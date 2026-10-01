/**
 * Projeções por papel (seção 9.6): o aluno só vê a própria empresa e o que é público; o telão só o
 * que é público; o professor, tudo.
 */
import { describe, expect, test } from "bun:test";
import { projetarAluno, projetarProfessor, projetarTelao, relogioDe } from "../src/sala/projecoes";
import { cmd, criarEquipe, novaSala } from "./ajuda";

/** Monta uma sala com duas equipes humanas e um robô, e roda um mês. */
function salaRodada(extra: Parameters<typeof novaSala>[0] = {}) {
  const { sala, relogio } = novaSala({ robosNasVagasVazias: "premium", ...extra });
  const ana = criarEquipe(sala, "emp_01", "Alfa", "azul", "Ana");
  const bia = criarEquipe(sala, "emp_02", "Beta", "verde", "Bia");
  sala.decidir(cmd(), ana, [{ tipo: "produto", produto: "leite_engarrafado", preco: 580, compraMensal: 20_000, publicidadeMensal: 500_000 }]);
  sala.decidir(cmd(), bia, [{ tipo: "produto", produto: "leite_engarrafado", preco: 620, compraMensal: 25_000 }]);
  sala.comandoRelogio(cmd(), 0, "iniciar");
  relogio.avancar(30_000);
  return { sala, ana, bia };
}

/** Todas as chaves (caminhos) presentes num valor JSON. */
function caminhos(valor: unknown, prefixo = ""): string[] {
  if (Array.isArray(valor)) return valor.flatMap((v) => caminhos(v, `${prefixo}[]`));
  if (valor !== null && typeof valor === "object") {
    return Object.entries(valor).flatMap(([k, v]) => [`${prefixo}.${k}`, ...caminhos(v, `${prefixo}.${k}`)]);
  }
  return [];
}

describe("projeção do aluno", () => {
  const { sala, ana } = salaRodada();
  const v = projetarAluno(sala, ana);

  test("vê a própria empresa por inteiro", () => {
    expect(v.empresa).toBe("emp_01");
    expect(v.visao.empresa.id).toBe("emp_01");
    expect(v.visao.empresa.caixa).toBe(sala.estado.empresas[0]!.caixa);
    expect(v.fechamentos).toHaveLength(1);
    expect(v.membros).toEqual(["Ana"]);
  });

  test("dos concorrentes, só preço, qualidade, marca, nota e participação (lista permitida)", () => {
    const permitidas = new Set(["produto", "preco", "qualidade", "marca", "notaAnterior", "participacaoAnterior"]);
    for (const c of v.visao.concorrentes) {
      for (const o of c.ofertas) expect(Object.keys(o).filter((k) => !permitidas.has(k))).toEqual([]);
    }
    // Nenhum caminho da projeção expõe dados privados de outra empresa fora de visao.empresa.
    const texto = JSON.stringify({ ...v, visao: { ...v.visao, empresa: null } });
    for (const outra of sala.estado.empresas.slice(1)) {
      expect(texto.includes(`"caixa":${outra.caixa}`)).toBe(false);
    }
    expect(caminhos(v).some((c) => c.startsWith(".visao.concorrentes") && /caixa|estoque|decisao|credito|lucros|tecnologia/.test(c))).toBe(false);
  });

  test("não expõe o preço de referência nem a elasticidade", () => {
    const texto = JSON.stringify(v);
    expect(texto.includes("precoReferencia")).toBe(false);
    expect(texto.includes("elasticidade")).toBe(false);
  });

  test("avisos: só os da própria equipe e os públicos", () => {
    for (const a of v.avisos) {
      if ("empresa" in a) expect(a.empresa).toBe("emp_01");
      else expect(["evento", "fim_de_mes"]).toContain(a.tipo);
    }
  });

  test("ranking conforme a visibilidade: completo, só a própria posição, oculto", () => {
    expect(v.ranking!.map((p) => p.empresa).sort()).toEqual(["emp_01", "emp_02", "emp_03"]);
    const propria = salaRodada({ rankingVisivel: "propria" });
    expect(projetarAluno(propria.sala, propria.ana).ranking!.map((p) => p.empresa)).toEqual(["emp_01"]);
    const oculto = salaRodada({ rankingVisivel: "oculto" });
    expect(projetarAluno(oculto.sala, oculto.ana).ranking).toBeNull();
  });

  test("vagas do próprio mercado, sem nomes de alunos", () => {
    expect(v.vagas.map((x) => [x.empresa, x.equipe?.nome ?? null, x.robo, x.membros])).toEqual([
      ["emp_01", "Alfa", false, 1],
      ["emp_02", "Beta", false, 1],
      ["emp_03", null, true, 0],
    ]);
    expect(JSON.stringify(v.vagas).includes("Bia")).toBe(false);
  });
});

describe("projeção do telão", () => {
  const { sala } = salaRodada();
  const t = projetarTelao(sala);

  test("só informação pública: nada de caixa, estoque, decisões, lucros ou nomes de alunos", () => {
    const proibidas = /caixa|estoque|decisao|credito|lucros|receitaAcumulada|tecnologia|fidelidade|reconhecimento/;
    expect(caminhos(t).filter((c) => proibidas.test(c.split(".").at(-1)!))).toEqual([]);
    // Das vagas, só a contagem de membros (número), nunca os nomes.
    for (const vaga of t.vagas) expect(typeof vaga.membros).toBe("number");
    const texto = JSON.stringify(t);
    expect(texto.includes("Ana") || texto.includes("Bia")).toBe(false);
  });

  test("ranking e participação por mercado e produto", () => {
    expect(t.ranking).toHaveLength(1);
    expect(t.ranking[0]!.posicoes).toHaveLength(3);
    const leite = t.participacao.find((p) => p.produto === "leite_engarrafado")!;
    expect(leite.nomeProduto).toBe("Leite engarrafado");
    expect(leite.ofertas.reduce((s, o) => s + o.participacao, 0)).toBeCloseTo(1, 9);
  });

  test("ranking não aparece no telão se não for completo para os alunos", () => {
    expect(projetarTelao(salaRodada({ rankingVisivel: "propria" }).sala).ranking).toEqual([]);
  });
});

describe("projeção do professor e relógio", () => {
  const { sala } = salaRodada();

  test("professor vê tudo, inclusive robôs, membros e PIN", () => {
    const p = projetarProfessor(sala, "http://servidor/telao/X?t=abc", "123456");
    expect(p.pin).toBe("123456");
    expect(p.empresas.map((e) => [e.empresa, e.nome, e.robo, e.membros.map((m) => m.nome)])).toEqual([
      ["emp_01", "Alfa", false, ["Ana"]],
      ["emp_02", "Beta", false, ["Bia"]],
      ["emp_03", "Marx (robô)", true, []],
    ]);
    expect(p.empresas[0]!.caixa).toBe(sala.estado.empresas[0]!.caixa);
    expect(p.empresas[0]!.lucroUltimoMes).toBe(sala.estado.empresas[0]!.contabil.ultimoFechamento!.lucroLiquido);
  });

  test("relógio: data do jogo, status e se pode editar", () => {
    const r = relogioDe(sala);
    expect([r.tick, r.mes, r.dia, r.status, r.podeEditar, r.proximoTickEmMs !== null]).toEqual([30, 1, 30, "rodando", true, true]);
  });
});
