/**
 * Cadeia produtiva no servidor (fase 1b, entrega 7): a sala liga o módulo quando o preset traz o bloco
 * da cadeia, aceita as decisões novas, e as projeções mostram a cada papel só o que é dele.
 */
import { describe, expect, test } from "bun:test";
import { projetarAluno, projetarProfessor, projetarTelao } from "../src/sala/projecoes";
import { cmd, criarEquipe, novaSala } from "./ajuda";

function salaCadeia() {
  const { sala, relogio } = novaSala({ presetId: "cadeia/minima", vagasPorMercado: 3 });
  const ana = criarEquipe(sala, "emp_01", "Alfa", "azul", "Ana");
  const bia = criarEquipe(sala, "emp_02", "Beta", "verde", "Bia");
  return { sala, relogio, ana, bia };
}

/** Todas as chaves (caminhos) presentes num valor JSON. */
function caminhos(valor: unknown, prefixo = ""): string[] {
  if (Array.isArray(valor)) return valor.flatMap((v) => caminhos(v, `${prefixo}[]`));
  if (valor !== null && typeof valor === "object") return Object.entries(valor).flatMap(([k, v]) => [`${prefixo}.${k}`, ...caminhos(v, `${prefixo}.${k}`)]);
  return [];
}

describe("sala com o preset da cadeia", () => {
  test("liga o módulo e informa as matérias-primas e atividades; sem o bloco da cadeia, nada disso aparece", () => {
    const { sala, ana } = salaCadeia();
    expect(sala.estado.modulos).toEqual(["nucleo", "cadeia_produtiva"]);
    const v = projetarAluno(sala, ana);
    expect(v.sala.materiasPrimas.map((m) => m.id)).toEqual(["acucar", "carne_bovina_congelada", "couro", "frango_congelado", "leite", "morango"]);
    expect(v.sala.atividades.map((a) => a.id)).toContain("gado_de_corte");
    expect(v.visao.cadeia).not.toBeNull();

    const { sala: comum } = novaSala();
    const aluno = criarEquipe(comum, "emp_01", "Alfa", "azul", "Ana");
    expect(comum.estado.modulos).toEqual(["nucleo"]);
    const vc = projetarAluno(comum, aluno);
    expect([vc.sala.materiasPrimas, vc.sala.atividades, vc.visao.cadeia]).toEqual([[], [], null]);
  });

  test("o aluno constrói e ajusta fazendas; as decisões inválidas voltam com o motivo e nada entra na fila", () => {
    const { sala, relogio, ana } = salaCadeia();
    expect(sala.decidir(cmd(), ana, [{ tipo: "construirFazenda", atividade: "plantacao_de_ouro" }])).toEqual({ ok: false, motivo: 'atividade "plantacao_de_ouro" não existe nesta partida' });
    expect(sala.decidir(cmd(), ana, [{ tipo: "ajustarFazenda", fazenda: "faz_09", producaoMensal: 10 }])).toMatchObject({ ok: false });
    expect(sala.decidir(cmd(), ana, [{ tipo: "comprarNoAtacado", produto: "leite", vendedor: "emp_01", quantidadeMensal: 10 }])).toMatchObject({ ok: false, motivo: "a empresa não pode comprar de si mesma" });
    expect(sala.pendentes("emp_01")).toEqual([]);

    expect(sala.decidir(cmd(), ana, [{ tipo: "construirFazenda", atividade: "gado_leiteiro", producaoMensal: 6000 }])).toEqual({ ok: true });
    expect(sala.pendentes("emp_01")).toEqual([{ tipo: "construirFazenda", atividade: "gado_leiteiro", producaoMensal: 6000 }]); // sem o campo empresa
    sala.comandoRelogio(cmd(), 0, "iniciar");
    relogio.avancar(2_000);
    expect(sala.estado.empresas[0]!.fazendas).toHaveLength(1);
    expect(sala.decidir(cmd(), ana, [{ tipo: "ajustarFazenda", fazenda: "faz_03", producaoMensal: 3000 }])).toEqual({ ok: true });
    relogio.avancar(1_000);
    expect(sala.estado.empresas[0]!.fazendas[0]!.producaoMensal).toBe(3000);
    expect(projetarAluno(sala, ana).visao.cadeia!.fazendas[0]).toMatchObject({ id: "faz_03", emObra: true });
  });

  test("a fazenda concluída avisa só a equipe dona", () => {
    const { sala, relogio, ana, bia } = salaCadeia();
    sala.decidir(cmd(), ana, [{ tipo: "construirFazenda", atividade: "morango", producaoMensal: 3000 }]);
    sala.comandoRelogio(cmd(), 0, "iniciar");
    relogio.avancar(21_000); // obra de 20 dias do morango, decidida no tick 1: pronta no tick 21
    expect(projetarAluno(sala, ana).avisos).toContainEqual({ tipo: "fazenda_concluida", empresa: "emp_01", atividade: "morango" });
    expect(projetarAluno(sala, bia).avisos.some((a) => a.tipo === "fazenda_concluida")).toBe(false);
  });
});

describe("projeções com a cadeia", () => {
  /** Alfa tem estoque, oferta, pedido e fazenda; Beta e o telão olham. */
  function salaComSegredos() {
    const { sala, relogio, ana, bia } = salaCadeia();
    const teto = projetarAluno(sala, ana).visao.cadeia!.faixaDoAtacado.leite!.teto;
    const resposta = sala.decidir(cmd(), ana, [
      { tipo: "construirFazenda", atividade: "gado_leiteiro", producaoMensal: 4242 },
      { tipo: "ofertarNoAtacado", produto: "leite", preco: teto, quantidadeMensal: 3000 },
      { tipo: "comprarNoAtacado", produto: "couro", vendedor: "emp_02", quantidadeMensal: 913.37 },
      { tipo: "produto", produto: "carteira", origemInsumos: { couro: "propria" }, publicidadeMensal: 87_654 },
    ]);
    expect(resposta).toEqual({ ok: true });
    sala.comandoRelogio(cmd(), 0, "iniciar");
    relogio.avancar(2_000);
    // O estoque é posto depois de iniciar (iniciar recria a partida).
    Object.assign(sala.estado.empresas[0]!.materiasPrimas.leite!.estoque, { quantidade: 777.25, valor: 123_457, qualidade: 66 });
    return { sala, ana, bia };
  }

  test("aluno: vê a própria cadeia por inteiro e dos outros só a oferta pública de atacado", () => {
    const { sala, ana, bia } = salaComSegredos();
    const propria = projetarAluno(sala, ana).visao.cadeia!;
    expect(propria.fazendas).toHaveLength(1);
    expect(propria.materiasPrimas.find((m) => m.produto === "couro")!.pedidoAtacado).toEqual({ vendedor: "emp_02", quantidadeMensal: 913.37 });

    const doOutro = projetarAluno(sala, bia);
    expect(doOutro.visao.cadeia!.atacado).toHaveLength(1);
    expect(Object.keys(doOutro.visao.cadeia!.atacado[0]!).sort()).toEqual(["preco", "produto", "qualidade", "quantidadeMensal", "vendedor"]);
    const texto = JSON.stringify(doOutro);
    for (const segredo of ["777.25", "123457", "4242", "87654", "913.37", "faz_03", "propria"]) expect({ segredo, vazou: texto.includes(segredo) }).toEqual({ segredo, vazou: false });
    // Fora de visao.empresa e visao.cadeia (as próprias), nenhuma chave da cadeia aparece nos dados dos outros.
    expect(caminhos(doOutro.visao.concorrentes).some((c) => /fazenda|materiasPrimas|atacado|pedido|estoque|origem/i.test(c))).toBe(false);
  });

  test("telão: nada de fazendas, estoques de matéria-prima, ofertas ou pedidos de atacado", () => {
    const { sala } = salaComSegredos();
    const t = projetarTelao(sala);
    // `sala.materiasPrimas` e `sala.atividades` são só nomes (informação pública, como os produtos).
    expect(caminhos(t).filter((c) => !c.startsWith(".sala.") && /fazenda|materiasPrimas|atacado|pedido|origem|conversao/i.test(c))).toEqual([]);
    const texto = JSON.stringify(t);
    for (const segredo of ["777.25", "123457", "4242", "87654", "913.37"]) expect({ segredo, vazou: texto.includes(segredo) }).toEqual({ segredo, vazou: false });
  });

  test("professor: vê o número de fazendas e o estoque de matéria-prima de cada empresa", () => {
    const { sala } = salaComSegredos();
    const p = projetarProfessor(sala, "http://x/telao", "123456");
    const alfa = p.empresas.find((e) => e.empresa === "emp_01")!;
    expect(alfa.fazendas).toBe(1);
    expect(alfa.materiasPrimas).toEqual([{ produto: "leite", quantidade: 777.25, valor: 123_457 }]);
    expect(p.empresas.find((e) => e.empresa === "emp_02")!.materiasPrimas).toEqual([]);
    expect(p.sala.materiasPrimas).toHaveLength(6);
  });
});
