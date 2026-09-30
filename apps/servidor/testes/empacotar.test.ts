/**
 * Gerador da entrada do executável: um import `type: "file"` por arquivo, caminhos relativos em
 * barras normais, ordem estável.
 */
import { expect, test } from "bun:test";
import { join } from "node:path";
import { gerarEntrada } from "../scripts/empacotar";

test("entrada gerada: imports de arquivo relativos e mapa ordenado", () => {
  const raiz = join("C:", "projeto", "apps");
  const arquivos = new Map([
    ["/index.html", join(raiz, "web", "dist", "index.html")],
    ["/assets/a-1.js", join(raiz, "web", "dist", "assets", "a-1.js")],
  ]);
  const codigo = gerarEntrada(arquivos, join(raiz, "servidor", "build"));
  expect(codigo).toContain('import { principal } from "../src/main";');
  expect(codigo).toContain('import a0 from "../../web/dist/assets/a-1.js" with { type: "file" };');
  expect(codigo).toContain('import a1 from "../../web/dist/index.html" with { type: "file" };');
  expect(codigo.indexOf('["/assets/a-1.js", a0]')).toBeLessThan(codigo.indexOf('["/index.html", a1]'));
  expect(codigo).toContain("principal(process.argv.slice(2), ARQUIVOS)");
  expect(codigo).not.toContain("\\");
});
