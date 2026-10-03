import { describe, expect, test } from "bun:test";
import { EXPRESSAO_DE_MEDIDAS, localizarEdge, type Medidas, medidaRuim } from "../src/cdp";
import { lerArgumentos } from "../src/e2e";

describe("localizar o Edge", () => {
  const padrao = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
  const outro = "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe";
  test("a variável EDGE vale se o arquivo existe; senão, as duas instalações padrão, na ordem", () => {
    expect(localizarEdge((c) => c === "D:\\meu\\msedge.exe", { EDGE: "D:\\meu\\msedge.exe" })).toBe("D:\\meu\\msedge.exe");
    expect(localizarEdge((c) => c === padrao || c === outro, { EDGE: "D:\\nao\\existe.exe" })).toBe(padrao);
    expect(localizarEdge((c) => c === outro, {})).toBe(outro);
    expect(localizarEdge(() => false, {})).toBeNull();
  });
});

describe("medidas de estouro", () => {
  const boa: Medidas = { janela: [1366, 768], documento: [1366, 768], cortes: [], cartoesForaDaColuna: [], painelCortado: [] };
  test("boa quando o documento cabe na janela e nada está cortado", () => {
    expect(medidaRuim(boa)).toBe(false);
  });
  test("ruim se o documento passa da janela em largura ou altura, ou se algo está cortado", () => {
    expect(medidaRuim({ ...boa, documento: [1367, 768] })).toBe(true);
    expect(medidaRuim({ ...boa, documento: [1366, 769] })).toBe(true);
    expect(medidaRuim({ ...boa, cortes: [".j-painel-cadeia sh=700/539"] })).toBe(true);
    expect(medidaRuim({ ...boa, cartoesForaDaColuna: ["faz:faz_03"] })).toBe(true);
    expect(medidaRuim({ ...boa, painelCortado: ["j-venda-mp"] })).toBe(true);
  });
  test("a expressão avaliada na página é uma função anônima chamada na hora (devolve o objeto das medidas)", () => {
    expect(EXPRESSAO_DE_MEDIDAS.trim().startsWith("(() => {")).toBe(true);
    expect(EXPRESSAO_DE_MEDIDAS.trim().endsWith("})()")).toBe(true);
    for (const campo of ["janela", "documento", "cortes", "cartoesForaDaColuna", "painelCortado"]) expect(EXPRESSAO_DE_MEDIDAS).toContain(campo);
  });
});

describe("argumentos", () => {
  test("padrões e opções", () => {
    expect(lerArgumentos([]).semBuild).toBe(false);
    expect(lerArgumentos(["--sem-build", "--saida", "X:\\fotos"])).toEqual({ semBuild: true, saida: "X:\\fotos" });
    expect(() => lerArgumentos(["--saida"])).toThrow("precisa de um valor");
  });
});
