/**
 * Catálogo de produtos, receitas e presets.
 *
 * Só dados e validação: nenhum comportamento de simulação mora aqui.
 */
import type { Preset } from "@simulador/motor";
import { PRESET_CADEIA_MINIMA } from "./presets/cadeia-minima";
import { PRESET_INTRODUTORIO } from "./presets/introdutorio";
import { PRESET_TESTE } from "./presets/teste";

/** Versão do catálogo; muda quando a estrutura ou os números de um preset mudam. */
export const VERSAO_CATALOGO = "0.3.0";

export { ARVORE, produtoDaArvore, type OrigemMateriaPrima, type ProdutoDaArvore } from "./arvore";
export { KG_POR_LB, LITROS_POR_QUART, paraMetrico, RECEITAS_MANUAL, receitaManual } from "./receitas";
export type { InsumoManual, ReceitaManual, UnidadeManual } from "./receitas";
export { PRESET_CADEIA_MINIMA } from "./presets/cadeia-minima";
export { PRESET_INTRODUTORIO } from "./presets/introdutorio";
export { PRESET_TESTE } from "./presets/teste";
export { validarArvore, validarPresetContraArvore } from "./validar";

/** Presets disponíveis, por id. */
export const PRESETS: Readonly<Record<string, Preset>> = {
  [PRESET_INTRODUTORIO.id]: PRESET_INTRODUTORIO,
  [PRESET_CADEIA_MINIMA.id]: PRESET_CADEIA_MINIMA,
  [PRESET_TESTE.id]: PRESET_TESTE,
};
