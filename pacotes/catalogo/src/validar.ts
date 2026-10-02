import { type Preset, validarPreset } from "@simulador/motor";
import type { ProdutoDaArvore } from "./arvore";

const ID_VALIDO = /^[a-z][a-z0-9_]*$/;
const MAX_INSUMOS = 3;

/**
 * Valida a estrutura da árvore de produtos. Devolve a lista de erros (vazia = válida).
 *
 * Regras: ids únicos e em snake_case; insumos existem e não são produtos finais; matéria-prima tem
 * origem e nenhum insumo; semiacabado e final têm de 1 a 3 insumos; final tem classe; sem ciclos;
 * todo semiacabado é usado por algum produto; toda matéria-prima é usada ou vendida no varejo.
 */
export function validarArvore(arvore: readonly ProdutoDaArvore[]): string[] {
  const erros: string[] = [];
  const porId = new Map<string, ProdutoDaArvore>();

  for (const p of arvore) {
    if (porId.has(p.id)) erros.push(`${p.id}: id duplicado`);
    porId.set(p.id, p);
    if (!ID_VALIDO.test(p.id)) erros.push(`${p.id}: id deve ser snake_case sem acentos`);
    if (p.nome.trim().length === 0) erros.push(`${p.id}: nome vazio`);
    if (p.nomeManual.trim().length === 0) erros.push(`${p.id}: nome do manual vazio`);
  }

  const usados = new Set<string>();
  for (const p of arvore) {
    for (const i of p.insumos) {
      usados.add(i);
      const alvo = porId.get(i);
      if (!alvo) erros.push(`${p.id}: insumo "${i}" não existe`);
      else if (alvo.nivel === "final") erros.push(`${p.id}: insumo "${i}" é produto final`);
    }
    if (new Set(p.insumos).size !== p.insumos.length) erros.push(`${p.id}: insumo repetido`);

    switch (p.nivel) {
      case "materia_prima":
        if (p.insumos.length > 0) erros.push(`${p.id}: matéria-prima não tem insumos`);
        if (!p.origem) erros.push(`${p.id}: matéria-prima precisa de origem (lavoura, pecuária ou extração)`);
        if (p.classe !== undefined && p.origem?.tipo !== "pecuaria") {
          erros.push(`${p.id}: só matéria-prima da pecuária vai direto ao varejo`);
        }
        break;
      case "semiacabado":
        if (p.insumos.length < 1 || p.insumos.length > MAX_INSUMOS) erros.push(`${p.id}: precisa de 1 a ${MAX_INSUMOS} insumos`);
        if (p.classe !== undefined) erros.push(`${p.id}: semiacabado não vai ao varejo`);
        if (p.origem) erros.push(`${p.id}: semiacabado não tem origem de matéria-prima`);
        break;
      case "final":
        if (p.insumos.length < 1 || p.insumos.length > MAX_INSUMOS) erros.push(`${p.id}: precisa de 1 a ${MAX_INSUMOS} insumos`);
        if (!p.classe) erros.push(`${p.id}: produto final precisa de classe`);
        if (p.origem) erros.push(`${p.id}: produto final não tem origem de matéria-prima`);
        break;
    }
  }

  for (const p of arvore) {
    if (p.nivel === "semiacabado" && !usados.has(p.id)) erros.push(`${p.id}: semiacabado não é usado por nenhum produto`);
    if (p.nivel === "materia_prima" && !usados.has(p.id) && p.classe === undefined) {
      erros.push(`${p.id}: matéria-prima não é usada nem vendida no varejo`);
    }
  }

  // Ciclos: busca em profundidade com três estados.
  const estado = new Map<string, "visitando" | "feito">();
  const visitar = (id: string, caminho: string[]): void => {
    const e = estado.get(id);
    if (e === "feito") return;
    if (e === "visitando") {
      erros.push(`ciclo na árvore: ${[...caminho, id].join(" → ")}`);
      return;
    }
    estado.set(id, "visitando");
    for (const i of porId.get(id)?.insumos ?? []) if (porId.has(i)) visitar(i, [...caminho, id]);
    estado.set(id, "feito");
  };
  for (const p of arvore) visitar(p.id, []);

  return erros;
}

/**
 * Valida um preset: regras do motor (`validarPreset`) e coerência com a árvore
 * (produto existe, mesmo nível e nome, varejo só para produto com classe, receita com os insumos da árvore).
 */
export function validarPresetContraArvore(preset: Preset, arvore: readonly ProdutoDaArvore[]): string[] {
  const erros = validarPreset(preset).map((e) => `${preset.id}: ${e}`);
  const porId = new Map(arvore.map((p) => [p.id, p]));

  for (const p of preset.produtos) {
    const onde = `${preset.id}: produto ${p.id}`;
    const daArvore = porId.get(p.id);
    if (!daArvore) {
      erros.push(`${onde}: não existe na árvore`);
      continue;
    }
    if (p.nivel !== daArvore.nivel) erros.push(`${onde}: nível "${p.nivel}" difere da árvore ("${daArvore.nivel}")`);
    if (p.nome !== daArvore.nome) erros.push(`${onde}: nome "${p.nome}" difere da árvore ("${daArvore.nome}")`);
    if (p.varejo && daArvore.classe === undefined) erros.push(`${onde}: não é vendido no varejo segundo a árvore`);
    if (p.fabricacao) {
      const doPreset = p.fabricacao.receita.map((i) => i.produto).sort();
      const daReceita = [...daArvore.insumos].sort();
      if (doPreset.join(",") !== daReceita.join(",")) {
        erros.push(`${onde}: receita usa [${doPreset.join(", ")}], mas a árvore diz [${daReceita.join(", ")}]`);
      }
    }
  }

  // Cadeia: cada atividade produz matérias-primas da origem certa (lavoura ou pecuária) e, na pecuária,
  // de um rebanho em comum (gado de corte: carne e couro vêm do gado).
  for (const a of preset.cadeia?.atividades ?? []) {
    const onde = `${preset.id}: atividade ${a.id}`;
    const origens = a.produz.map((pr) => porId.get(pr.produto)?.origem);
    origens.forEach((o, k) => {
      const alvo = a.produz[k]!.produto;
      if (!o) erros.push(`${onde}: "${alvo}" não é matéria-prima de fazenda na árvore`);
      else if (o.tipo === "extracao") erros.push(`${onde}: "${alvo}" vem de extração, e a cadeia mínima não tem extração`);
      else if (o.tipo !== a.tipo) erros.push(`${onde}: "${alvo}" vem de ${o.tipo}, mas a atividade é de ${a.tipo}`);
    });
    const rebanhos = origens.map((o) => (o?.tipo === "pecuaria" ? o.rebanhos : null));
    if (a.tipo === "pecuaria" && rebanhos.every((r) => r !== null)) {
      const comuns = (rebanhos[0] ?? []).filter((r) => rebanhos.every((x) => x!.includes(r)));
      if (comuns.length === 0) erros.push(`${onde}: os produtos não têm um rebanho em comum na árvore`);
    }
  }

  return erros;
}
