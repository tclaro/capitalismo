/**
 * Um tick da simulação (seção 6.15).
 *
 * `passo` é puro: copia o estado de entrada e nunca o altera. `passoMutavel` trabalha sobre o estado
 * recebido; serve a quem já é dono do estado (ex.: a simulação em massa) e evita a cópia.
 *
 * As etapas ficam num registro por módulo (seção 5): módulo desligado = etapa não executa. As etapas
 * da camada 3 já estão registradas, vazias, para que o módulo entre sem reescrever o tick.
 */
import { type Contexto, criarContexto } from "./contexto";
import {
  etapaComprasProntas,
  etapaCustosOperacionais,
  etapaDecisoes,
  etapaEventos,
  etapaObras,
  etapaPublicidade,
} from "./etapas";
import { etapaCustoFixoFabricas, etapaFabricacao } from "./fabricacao";
import { etapaCustosDasFazendas, etapaEvolucaoDoEstoque, etapaProducaoDasFazendas } from "./fazendas";
import { etapaCreditoEmergencial, etapaDepreciacaoEIR, etapaFechamentoMensal, etapaJurosEmergenciais } from "./financeiro";
import { etapaRobos } from "./robos";
import type { EntradasTick, EstadoPartida, ModuloId, ResultadoTick } from "./tipos";
import { type ResultadoVendaOferta, etapaFidelidade, etapaVendas } from "./vendas";

interface Memoria {
  vendas: ResultadoVendaOferta[];
}

interface Etapa {
  passo: number;
  nome: string;
  modulo: ModuloId;
  executar: (ctx: Contexto, entradas: EntradasTick, memoria: Memoria) => void;
}

const nada = () => {};

/** Registro das etapas, na ordem da seção 6.15. */
export const ETAPAS: readonly Etapa[] = [
  { passo: 1, nome: "eventos", modulo: "nucleo", executar: (ctx, e) => etapaEventos(ctx, e) },
  { passo: 2, nome: "decisões", modulo: "nucleo", executar: (ctx, e) => etapaDecisoes(ctx, e) },
  { passo: 3, nome: "obras", modulo: "nucleo", executar: (ctx) => etapaObras(ctx) },
  { passo: 4, nome: "matérias-primas (lavoura, pecuária, extração)", modulo: "cadeia_produtiva", executar: (ctx) => etapaProducaoDasFazendas(ctx) },
  { passo: 5, nome: "atacado entre empresas", modulo: "cadeia_produtiva", executar: nada },
  { passo: 6, nome: "compras prontas", modulo: "nucleo", executar: (ctx) => etapaComprasProntas(ctx) },
  { passo: 6, nome: "P&D e fabricação", modulo: "nucleo", executar: (ctx) => etapaFabricacao(ctx) },
  { passo: 7, nome: "publicidade e reconhecimento", modulo: "nucleo", executar: (ctx) => etapaPublicidade(ctx) },
  { passo: 9, nome: "demanda e vendas", modulo: "nucleo", executar: (ctx, _e, m) => void (m.vendas = etapaVendas(ctx)) },
  { passo: 10, nome: "fidelidade", modulo: "nucleo", executar: (ctx, _e, m) => etapaFidelidade(ctx, m.vendas) },
  { passo: 11, nome: "custos operacionais", modulo: "nucleo", executar: (ctx) => etapaCustosOperacionais(ctx) },
  { passo: 11, nome: "custo fixo das fábricas", modulo: "nucleo", executar: (ctx) => etapaCustoFixoFabricas(ctx) },
  { passo: 11, nome: "custos das fazendas", modulo: "cadeia_produtiva", executar: (ctx) => etapaCustosDasFazendas(ctx) },
  { passo: 11, nome: "evolução do estoque de matéria-prima", modulo: "cadeia_produtiva", executar: (ctx) => etapaEvolucaoDoEstoque(ctx) },
  { passo: 11, nome: "juros do crédito emergencial", modulo: "nucleo", executar: (ctx) => etapaJurosEmergenciais(ctx) },
  { passo: 12, nome: "depreciação e imposto de renda", modulo: "nucleo", executar: (ctx) => etapaDepreciacaoEIR(ctx) },
  { passo: 11, nome: "crédito emergencial", modulo: "nucleo", executar: (ctx) => etapaCreditoEmergencial(ctx) },
  { passo: 12, nome: "fechamento mensal", modulo: "nucleo", executar: (ctx) => etapaFechamentoMensal(ctx) },
  { passo: 13, nome: "decisões dos robôs", modulo: "nucleo", executar: (ctx) => etapaRobos(ctx) },
];

/** Cópia profunda de um valor JSON. O estado é JSON puro por contrato (ver `tipos.ts`). */
export function clonarEstado(estado: EstadoPartida): EstadoPartida {
  return JSON.parse(JSON.stringify(estado)) as EstadoPartida;
}

export function passoMutavel(estado: EstadoPartida, entradas: EntradasTick = {}): ResultadoTick {
  estado.tick += 1;
  const ctx = criarContexto(estado);
  const memoria: Memoria = { vendas: [] };
  for (const etapa of ETAPAS) {
    if (estado.modulos.includes(etapa.modulo)) etapa.executar(ctx, entradas, memoria);
  }
  if (ctx.fimDoMes) ctx.avisos.push({ tipo: "fim_de_mes", mes: ctx.mes });
  return {
    estado,
    avisos: ctx.avisos,
    rejeicoes: ctx.rejeicoes,
    lancamentos: ctx.lancamentos,
    historico: ctx.historico,
    fechamentos: ctx.fechamentos,
  };
}

/**
 * Processa um tick sobre uma cópia do estado. O estado recebido não é alterado.
 * As entradas não são copiadas: o motor só as lê (as rejeições referenciam os objetos recebidos).
 */
export function passo(estado: EstadoPartida, entradas: EntradasTick = {}): ResultadoTick {
  return passoMutavel(clonarEstado(estado), entradas);
}
