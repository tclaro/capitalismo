/**
 * API pública do motor de simulação.
 *
 * O motor é uma função pura e determinística (seção 3, princípio 3, do documento de design):
 * sem acesso a banco, rede, relógio ou APIs de runtime. A garantia de determinismo é
 * "mesmo binário = mesmo resultado" (ver `matematica.ts`).
 */

/** Versão do motor. Um replay só é garantido na mesma versão. */
export const VERSAO_MOTOR = "0.0.0";
