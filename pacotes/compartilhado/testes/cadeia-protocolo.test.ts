import { describe, expect, test } from "bun:test";
import { DecisaoDoAluno, MensagemCliente, validar } from "../src";

describe("decisões da cadeia no protocolo", () => {
  const validas = [
    { tipo: "construirFazenda", atividade: "gado_de_corte" },
    { tipo: "construirFazenda", atividade: "frango", producaoMensal: 4500 },
    { tipo: "ajustarFazenda", fazenda: "faz_03", producaoMensal: 0 },
    { tipo: "trocarAtividade", fazenda: "faz_03", atividade: "morango", desova: "destruir" },
    { tipo: "trocarAtividade", fazenda: "faz_03", atividade: "morango", desova: "cooperativa" },
    { tipo: "trocarAtividade", fazenda: "faz_03", atividade: "morango", desova: "atacado", fatorPrecoAtacado: 0.8 },
    { tipo: "ofertarNoAtacado", produto: "leite", preco: 250, quantidadeMensal: 900 },
    { tipo: "ofertarNoAtacado", produto: "leite", preco: 250, quantidadeMensal: 0 },
    { tipo: "comprarNoAtacado", produto: "leite", vendedor: "emp_02", quantidadeMensal: 300 },
    { tipo: "venderParaCooperativa", produto: "couro", quantidade: 12.5 },
    { tipo: "produto", produto: "carteira", origemInsumos: { couro: "propria" } },
    { tipo: "produto", produto: "carteira", origemInsumos: { couro: "fornecedor" }, origemCompraPronta: "propria" },
    { tipo: "produto", produto: "carne_bovina_congelada", origemCompraPronta: "propria", compraMensal: 3000 },
  ];

  test("aceita as decisões novas bem formadas", () => {
    for (const d of validas) expect({ d, ok: validar(DecisaoDoAluno, d).ok }).toEqual({ d, ok: true });
  });

  test("rejeita o campo empresa (o servidor o preenche) em todas elas", () => {
    for (const d of validas) expect({ d, ok: validar(DecisaoDoAluno, { ...d, empresa: "emp_02" }).ok }).toEqual({ d, ok: false });
  });

  test("rejeita as malformadas", () => {
    for (const d of [
      { tipo: "construirFazenda" },
      { tipo: "construirFazenda", atividade: "Gado De Corte" },
      { tipo: "construirFazenda", atividade: "frango", producaoMensal: -1 },
      { tipo: "construirFazenda", atividade: "frango", producaoMensal: Number.NaN },
      { tipo: "ajustarFazenda", fazenda: "fazenda_1", producaoMensal: 10 },
      { tipo: "ajustarFazenda", fazenda: "faz_03" },
      { tipo: "ajustarFazenda", fazenda: "faz_03", producaoMensal: 2e9 },
      { tipo: "trocarAtividade", fazenda: "faz_03", atividade: "morango", desova: "doar" },
      { tipo: "trocarAtividade", fazenda: "faz_03", atividade: "morango" },
      { tipo: "trocarAtividade", fazenda: "faz_03", atividade: "morango", desova: "atacado", fatorPrecoAtacado: 1.5 },
      { tipo: "trocarAtividade", fazenda: "faz_03", atividade: "morango", desova: "atacado", fatorPrecoAtacado: -0.1 },
      { tipo: "ofertarNoAtacado", produto: "leite", preco: 250.5, quantidadeMensal: 10 },
      { tipo: "ofertarNoAtacado", produto: "leite", preco: -1, quantidadeMensal: 10 },
      { tipo: "ofertarNoAtacado", produto: "leite", preco: 250 },
      { tipo: "comprarNoAtacado", produto: "leite", vendedor: "Beta", quantidadeMensal: 300 },
      { tipo: "comprarNoAtacado", produto: "leite", quantidadeMensal: 300 },
      { tipo: "venderParaCooperativa", produto: "couro", quantidade: -3 },
      { tipo: "produto", produto: "carteira", origemInsumos: { couro: "atacado" } },
      { tipo: "produto", produto: "carteira", origemInsumos: { couro: { equipe: "emp_02" } } },
      { tipo: "produto", produto: "carteira", origemInsumos: { "Couro Bom": "propria" } },
      { tipo: "produto", produto: "carteira", origemInsumos: null },
      { tipo: "produto", produto: "carteira", origemCompraPronta: "atacado" },
    ]) {
      expect({ d, ok: validar(DecisaoDoAluno, d).ok }).toEqual({ d, ok: false });
    }
  });

  test("limita o tamanho do mapa de origens", () => {
    const origens = Object.fromEntries(Array.from({ length: 13 }, (_, i) => [`insumo_${i}`, "propria"]));
    expect(validar(DecisaoDoAluno, { tipo: "produto", produto: "carteira", origemInsumos: origens }).ok).toBe(false);
    expect(validar(DecisaoDoAluno, { tipo: "produto", produto: "carteira", origemInsumos: Object.fromEntries(Object.entries(origens).slice(0, 12)) }).ok).toBe(true);
  });

  test("passam pela mensagem decidir, e a de 21 decisões continua rejeitada", () => {
    expect(validar(MensagemCliente, { tipo: "decidir", idComando: "abc-12345", decisoes: validas.slice(0, 5) }).ok).toBe(true);
    expect(validar(MensagemCliente, { tipo: "decidir", idComando: "abc-12345", decisoes: Array.from({ length: 21 }, () => validas[0]) }).ok).toBe(false);
  });
});
