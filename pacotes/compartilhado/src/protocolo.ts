/**
 * Protocolo entre as telas e o servidor (seção 9.8): esquemas das mensagens do WebSocket e dos corpos
 * HTTP, com valibot. Os esquemas são a fonte dos tipos (`v.InferOutput`), e servidor e telas usam os
 * mesmos. A validação aqui é **estrutural**; a semântica (teto de preço, produto vendido, etc.) é do
 * motor (`validarDecisao`).
 *
 * As decisões do aluno **não têm o campo `empresa`**: o servidor o preenche a partir da sessão. Os
 * objetos são estritos, então uma mensagem com `empresa` é rejeitada já aqui.
 */
import * as v from "valibot";
import { IDS_CORES, TAMANHO_MAXIMO_NOME } from "./equipes";

export const VERSAO_PROTOCOLO = 1;

const inteiro = (min: number, max: number) => v.pipe(v.number(), v.integer(), v.minValue(min), v.maxValue(max));
const centavos = inteiro(0, 1e12);
const quantidade = v.pipe(v.number(), v.finite(), v.minValue(0), v.maxValue(1e9));
const idProduto = v.pipe(v.string(), v.regex(/^[a-z][a-z0-9_]{0,40}$/));
const idEmpresa = v.pipe(v.string(), v.regex(/^emp_\d{2,4}$/));
const texto = (max: number) => v.pipe(v.string(), v.minLength(1), v.maxLength(max));

/** Identificador de comando gerado no cliente (UUID ou similar): torna o comando idempotente. */
export const IdComando = v.pipe(v.string(), v.regex(/^[A-Za-z0-9-]{8,64}$/));

export const DecisaoDoAluno = v.variant("tipo", [
  v.strictObject({
    tipo: v.literal("produto"),
    produto: idProduto,
    preco: v.optional(v.nullable(inteiro(1, 1e12))),
    compraMensal: v.optional(quantidade),
    producaoMensal: v.optional(quantidade),
    publicidadeMensal: v.optional(centavos),
    pdMensal: v.optional(centavos),
  }),
  v.strictObject({ tipo: v.literal("construirFabrica"), produto: idProduto }),
  v.strictObject({ tipo: v.literal("abrirPontoDeVenda"), quantidade: inteiro(1, 20) }),
  v.strictObject({ tipo: v.literal("fecharPontoDeVenda"), quantidade: inteiro(1, 20) }),
]);
export type DecisaoDoAluno = v.InferOutput<typeof DecisaoDoAluno>;

export const MODOS_RELOGIO = ["continuo", "rodada"] as const;
export const VISIBILIDADES_RANKING = ["completo", "propria", "oculto"] as const;
export const CRITERIOS_PONTUACAO = ["lucro_acumulado", "participacao_receita"] as const;
export const ACOES_RELOGIO = ["iniciar", "pausar", "retomar", "avancar"] as const;
export const UNIDADES_AVANCO = ["tick", "semana", "mes"] as const;

export const SEGUNDOS_POR_TICK_MIN = 0.5;
export const SEGUNDOS_POR_TICK_MAX = 10;

/** Configuração de uma sala, escolhida pelo professor na criação. */
export const ConfigSala = v.strictObject({
  presetId: texto(80),
  /** Mercados paralelos (seção 2). */
  mercados: v.optional(inteiro(1, 3), 1),
  /** Vagas de equipe por mercado; os alunos criam as equipes nessas vagas. */
  vagasPorMercado: v.optional(inteiro(2, 8), 6),
  /** Estratégia dos robôs que ocupam as vagas vazias ao iniciar; `null` = vagas vazias ficam inativas. */
  robosNasVagasVazias: v.optional(v.nullable(texto(40)), null),
  duracaoMeses: v.optional(inteiro(1, 120), 24),
  segundosPorTick: v.optional(v.pipe(v.number(), v.minValue(SEGUNDOS_POR_TICK_MIN), v.maxValue(SEGUNDOS_POR_TICK_MAX)), 3),
  modo: v.optional(v.picklist(MODOS_RELOGIO), "continuo"),
  /** Alunos podem editar decisões na pausa manual do professor (a pausa de fim de mês sempre libera). */
  edicaoNaPausa: v.optional(v.boolean(), false),
  rankingVisivel: v.optional(v.picklist(VISIBILIDADES_RANKING), "completo"),
  /** No modo rodada, retoma sozinho quando todas as equipes humanas marcam "pronto". */
  avancoQuandoProntas: v.optional(v.boolean(), false),
  criterio: v.optional(v.picklist(CRITERIOS_PONTUACAO), "lucro_acumulado"),
});
export type ConfigSala = v.InferOutput<typeof ConfigSala>;
export type ConfigSalaEntrada = v.InferInput<typeof ConfigSala>;

// ---------------------------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------------------------

export const CodigoSala = v.pipe(v.string(), v.toUpperCase(), v.regex(/^[A-Z0-9]{5}$/));

export const CriarSala = v.strictObject({ chave: texto(200), config: ConfigSala });
export type CriarSala = v.InferOutput<typeof CriarSala>;

export const EntrarAluno = v.strictObject({
  codigo: CodigoSala,
  nome: texto(TAMANHO_MAXIMO_NOME * 2),
  equipe: v.variant("tipo", [
    v.strictObject({ tipo: v.literal("existente"), empresa: idEmpresa }),
    v.strictObject({ tipo: v.literal("nova"), empresa: idEmpresa, nome: texto(TAMANHO_MAXIMO_NOME * 2), cor: v.picklist(IDS_CORES as [string, ...string[]]) }),
  ]),
});
export type EntrarAluno = v.InferOutput<typeof EntrarAluno>;

export const EntrarProfessor = v.strictObject({ codigo: CodigoSala, pin: v.pipe(v.string(), v.regex(/^\d{6}$/)) });
export type EntrarProfessor = v.InferOutput<typeof EntrarProfessor>;

// ---------------------------------------------------------------------------------------------
// WebSocket: cliente → servidor
// ---------------------------------------------------------------------------------------------

export const MensagemCliente = v.variant("tipo", [
  v.strictObject({ tipo: v.literal("decidir"), idComando: IdComando, decisoes: v.pipe(v.array(DecisaoDoAluno), v.minLength(1), v.maxLength(20)) }),
  v.strictObject({ tipo: v.literal("pronto"), idComando: IdComando, pronto: v.boolean() }),
  v.strictObject({
    tipo: v.literal("relogio"),
    idComando: IdComando,
    tickEsperado: inteiro(0, 1e7),
    acao: v.picklist(ACOES_RELOGIO),
    unidade: v.optional(v.picklist(UNIDADES_AVANCO)),
  }),
  v.strictObject({
    tipo: v.literal("configurar"),
    idComando: IdComando,
    segundosPorTick: v.optional(v.pipe(v.number(), v.minValue(SEGUNDOS_POR_TICK_MIN), v.maxValue(SEGUNDOS_POR_TICK_MAX))),
    modo: v.optional(v.picklist(MODOS_RELOGIO)),
    edicaoNaPausa: v.optional(v.boolean()),
    rankingVisivel: v.optional(v.picklist(VISIBILIDADES_RANKING)),
    avancoQuandoProntas: v.optional(v.boolean()),
  }),
  v.strictObject({ tipo: v.literal("estender"), idComando: IdComando, meses: inteiro(1, 60) }),
  v.strictObject({ tipo: v.literal("encerrar"), idComando: IdComando }),
  v.strictObject({ tipo: v.literal("renomearEquipe"), idComando: IdComando, empresa: idEmpresa, nome: texto(TAMANHO_MAXIMO_NOME * 2) }),
  v.strictObject({ tipo: v.literal("moverAluno"), idComando: IdComando, membro: texto(64), empresa: idEmpresa }),
  v.strictObject({ tipo: v.literal("ping") }),
]);
export type MensagemCliente = v.InferOutput<typeof MensagemCliente>;

/** Mensagens que só o professor pode enviar. */
export const MENSAGENS_DO_PROFESSOR: readonly MensagemCliente["tipo"][] = ["relogio", "configurar", "estender", "encerrar", "renomearEquipe", "moverAluno"];
/** Mensagens que só um aluno (membro de equipe) pode enviar. */
export const MENSAGENS_DO_ALUNO: readonly MensagemCliente["tipo"][] = ["decidir", "pronto"];

// ---------------------------------------------------------------------------------------------
// Validação
// ---------------------------------------------------------------------------------------------

export type Validado<T> = { ok: true; valor: T } | { ok: false; erro: string };

/** Valida sem lançar exceção, com uma mensagem curta em português para a primeira falha. */
export function validar<S extends v.GenericSchema>(esquema: S, entrada: unknown): Validado<v.InferOutput<S>> {
  const r = v.safeParse(esquema, entrada);
  if (r.success) return { ok: true, valor: r.output };
  const problema = r.issues[0];
  const caminho = problema.path?.map((p) => String(p.key)).join(".") ?? "";
  return { ok: false, erro: caminho ? `campo "${caminho}" inválido` : "mensagem inválida" };
}

// ---------------------------------------------------------------------------------------------
// Teste de conexão (página /teste, diagnóstico do professor)
// ---------------------------------------------------------------------------------------------

const milissegundos = v.pipe(v.number(), v.finite(), v.minValue(0), v.maxValue(600_000));

/** Resultado que a página /teste envia ao servidor. */
export const RelatorioTeste = v.strictObject({
  maquina: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(60)),
  http: v.strictObject({ ok: v.boolean(), amostras: inteiro(0, 100), mediaMs: v.nullable(milissegundos), maxMs: v.nullable(milissegundos) }),
  ws: v.strictObject({ ok: v.boolean(), ms: v.nullable(milissegundos), erro: v.optional(v.pipe(v.string(), v.maxLength(200))) }),
});
export type RelatorioTeste = v.InferOutput<typeof RelatorioTeste>;
