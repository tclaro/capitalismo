/**
 * API pública do motor de simulação.
 *
 * O motor é uma função pura e determinística (seção 3, princípio 3, do documento de design):
 * sem acesso a banco, rede, relógio ou APIs de runtime. A garantia de determinismo é
 * "mesmo binário = mesmo resultado" (ver `matematica.ts`).
 *
 * Uso típico:
 *   const estado = criarPartida({ preset, semente, empresas });
 *   const { estado: proximo, avisos, historico } = passo(estado, { decisoes });
 */

export { VERSAO_MOTOR } from "./versao";

export * from "./preset";
export * from "./tipos";
export * from "./aleatorio";
export * from "./dinheiro";
export * from "./matematica";
export * from "./formulas/tempo";
export * from "./formulas/demanda";
export * from "./formulas/nota";
export * from "./formulas/marca";
export * from "./formulas/qualidade";
export { PresetInvalido, resolverPreset, sortearValor } from "./resolucao";
export { ConfigInvalida, type ConfigEmpresa, type ConfigPartida, criarPartida, idSequencial, MODULOS_IMPLEMENTADOS } from "./partida";
export { balanco, CLASSES_FLUXO, CONTAS_DRE, lucroAntesIR } from "./contabilidade";
export { LIMITE_QUANTIDADE_MENSAL, LIMITE_VERBA_MENSAL, validarDecisao } from "./decisoes";
export { aplicarEvento } from "./eventos";
export { tempoDoTick } from "./contexto";
export { capacidadeDeVenda, ofertaAtiva, temFabricaOperando } from "./vendas";
export { capacidadeDeProducao } from "./fabricacao";
export { clonarEstado, ETAPAS, passo, passoMutavel } from "./passo";
