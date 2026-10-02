/**
 * Migração de estados gravados para a versão atual (`VERSAO_ESTADO`).
 *
 * O servidor grava o estado como JSON a cada tick e o recarrega depois de um reinício; um estado
 * gravado por uma versão anterior do motor precisa dos campos novos antes de voltar a jogar. A
 * migração é pura: devolve uma cópia e não altera a entrada.
 */
import { CONTAS_DRE } from "./contabilidade";
import { VERSAO_ESTADO, type EstadoPartida } from "./tipos";

/** Campos de uma empresa na ordem em que `criarPartida` os cria: o JSON migrado sai idêntico, byte a byte, ao de uma partida nova. */
const ORDEM_DA_EMPRESA = [
  "id",
  "nome",
  "mercado",
  "tipo",
  "caixa",
  "creditoEmergencial",
  "ofertas",
  "pontosDeVenda",
  "fabricas",
  "fazendas",
  "materiasPrimas",
  "contabil",
  "penalidadePontuacao",
  "robo",
  "proximoAtivo",
];

/** Contas da DRE acrescentadas na versão 2. */
const CONTAS_NOVAS_V2 = ["custo_fixo_fazenda", "perda_de_estoque"] as const;

type Objeto = Record<string, unknown>;

const ehObjeto = (v: unknown): v is Objeto => typeof v === "object" && v !== null && !Array.isArray(v);

/** Copia `o` com as chaves de `ordem` primeiro (na ordem dada) e as demais depois, na ordem original. */
function reordenar(o: Objeto, ordem: readonly string[]): Objeto {
  const novo: Objeto = {};
  for (const k of ordem) if (k in o) novo[k] = o[k];
  for (const k of Object.keys(o)) if (!(k in novo)) novo[k] = o[k];
  return novo;
}

/** Acrescenta as contas novas (zeradas) e põe a DRE na ordem de `CONTAS_DRE`. */
function ajustarDRE(pai: Objeto): void {
  const dre = pai.dre;
  if (!ehObjeto(dre)) return;
  for (const c of CONTAS_NOVAS_V2) if (dre[c] === undefined) dre[c] = 0;
  pai.dre = reordenar(dre, CONTAS_DRE);
}

function migrarDe1Para2(e: Objeto): void {
  if (ehObjeto(e.parametros) && e.parametros.cadeia === undefined) e.parametros.cadeia = null;
  if (Array.isArray(e.empresas)) {
    e.empresas = e.empresas.map((emp: unknown) => {
      if (!ehObjeto(emp)) return emp;
      if (emp.fazendas === undefined) emp.fazendas = [];
      if (emp.materiasPrimas === undefined) emp.materiasPrimas = {};
      const contabil = emp.contabil;
      if (ehObjeto(contabil)) {
        if (ehObjeto(contabil.mesAtual)) ajustarDRE(contabil.mesAtual);
        if (ehObjeto(contabil.ultimoFechamento)) ajustarDRE(contabil.ultimoFechamento);
      }
      return reordenar(emp, ORDEM_DA_EMPRESA);
    });
  }
  e.versaoEstado = 2;
}

/**
 * Devolve o estado na versão atual. Lança erro se a entrada não tiver versão ou se for de uma versão
 * mais nova que este motor (um motor antigo não sabe ler estado novo).
 */
export function migrarEstado(entrada: unknown): EstadoPartida {
  if (!ehObjeto(entrada) || typeof entrada.versaoEstado !== "number") throw new Error("estado sem versaoEstado");
  const versao = entrada.versaoEstado;
  if (versao > VERSAO_ESTADO) throw new Error(`estado da versão ${versao} é mais novo que este motor (${VERSAO_ESTADO})`);
  if (!Number.isInteger(versao) || versao < 1) throw new Error(`versaoEstado inválida: ${versao}`);
  const copia = JSON.parse(JSON.stringify(entrada)) as Objeto;
  if (versao === 1) migrarDe1Para2(copia);
  return copia as unknown as EstadoPartida;
}
