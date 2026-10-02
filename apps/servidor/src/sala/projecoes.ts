/**
 * Projeções da sala para cada papel (seção 9.6), como funções puras:
 * - aluno: a própria empresa (via `visaoDaEmpresa` do motor, que já filtra o que é privado dos
 *   concorrentes) + ranking conforme a visibilidade + avisos da equipe e públicos;
 * - telão: só informação pública (ranking, participação, preço e nota por oferta);
 * - professor: tudo.
 */
import type { EstadoRelogio, InfoSala, VagaPublica, VisaoAluno, VisaoProfessor, VisaoTelao } from "@simulador/compartilhado";
import { dataDoTick } from "@simulador/compartilhado";
import { type Aviso, calcularPontuacao, marca, ranking, visaoDaEmpresa } from "@simulador/motor";
import type { Sala } from "./sala";

/** Avisos que qualquer equipe pode ver (os demais só a equipe citada). */
const AVISOS_PUBLICOS: readonly Aviso["tipo"][] = ["evento", "fim_de_mes"];

export function relogioDe(sala: Sala): EstadoRelogio {
  const { mes, dia } = dataDoTick(sala.estado.tick, sala.ticksPorMes);
  return {
    status: sala.status,
    motivoPausa: sala.motivoPausa,
    tick: sala.estado.tick,
    mes,
    dia,
    ticksPorMes: sala.ticksPorMes,
    duracaoMeses: sala.config.duracaoMeses,
    segundosPorTick: sala.config.segundosPorTick,
    modo: sala.config.modo,
    proximoTickEmMs: sala.proximoTickEmMs(),
    podeEditar: sala.podeEditar(),
  };
}

/** Matérias-primas que as fazendas da partida produzem (vazio sem o módulo `cadeia_produtiva`). */
function materiasPrimasDaSala(sala: Sala): InfoSala["materiasPrimas"] {
  if (!sala.estado.modulos.includes("cadeia_produtiva")) return [];
  const ids = new Set(Object.keys(sala.estado.empresas[0]?.materiasPrimas ?? {}));
  return sala.estado.parametros.produtos
    .filter((p) => ids.has(p.id))
    .map((p) => ({ id: p.id, nome: p.nome, unidade: p.unidade }))
    .sort((a, b) => (a.id < b.id ? -1 : 1));
}

export function infoDe(sala: Sala): InfoSala {
  return {
    codigo: sala.codigo,
    presetId: sala.preset.id,
    presetNome: sala.preset.nome,
    mercados: sala.estado.mercados.map((m) => ({ id: m.id, nome: m.nome })),
    produtos: sala.estado.parametros.produtos.filter((p) => p.varejo !== null).map((p) => ({ id: p.id, nome: p.nome, unidade: p.unidade })),
    materiasPrimas: materiasPrimasDaSala(sala),
    atividades: sala.estado.modulos.includes("cadeia_produtiva") ? (sala.estado.parametros.cadeia?.atividades ?? []).map((a) => ({ id: a.id, nome: a.nome })) : [],
    criterio: sala.config.criterio,
    duracaoMeses: sala.config.duracaoMeses,
    rankingVisivel: sala.config.rankingVisivel,
    edicaoNaPausa: sala.config.edicaoNaPausa,
    avancoQuandoProntas: sala.config.avancoQuandoProntas,
  };
}

export function vagasPublicas(sala: Sala): VagaPublica[] {
  return sala.vagas.map((v) => ({
    empresa: v.empresa,
    mercado: sala.estado.mercados[v.mercado]!.id,
    equipe: v.equipe ? { nome: v.equipe.nome, cor: v.equipe.cor } : null,
    robo: v.robo !== null,
    inativa: v.inativa,
    membros: sala.membros.filter((m) => m.empresa === v.empresa).length,
  }));
}

function rankingDoMercado(sala: Sala, mercado: string) {
  return ranking(sala.estado, mercado, sala.config.criterio);
}

/** Visão de um aluno: igual para todos os membros da equipe (é enviada uma vez por equipe). */
export function projetarAluno(sala: Sala, membroId: string): VisaoAluno {
  const membro = sala.membro(membroId);
  if (!membro) throw new Error(`membro ${membroId} não existe`);
  return projetarEquipe(sala, membro.empresa);
}

export function projetarEquipe(sala: Sala, empresaId: string): VisaoAluno {
  const membro = { empresa: empresaId };
  const empresa = sala.estado.empresas.find((e) => e.id === empresaId);
  if (!empresa) throw new Error(`empresa ${empresaId} não existe`);
  const vaga = sala.vaga(empresaId)!;
  let rk: VisaoAluno["ranking"] = null;
  if (sala.config.rankingVisivel !== "oculto") {
    const completo = rankingDoMercado(sala, empresa.mercado);
    rk = sala.config.rankingVisivel === "completo" ? completo : completo.filter((p) => p.empresa === membro.empresa);
  }
  return {
    sala: infoDe(sala),
    relogio: relogioDe(sala),
    empresa: membro.empresa,
    equipe: vaga.equipe ? { ...vaga.equipe } : { nome: empresa.nome, cor: "cinza" },
    membros: sala.membros.filter((m) => m.empresa === membro.empresa).map((m) => m.nome),
    visao: visaoDaEmpresa(sala.estado, membro.empresa),
    pendentes: sala.pendentes(membro.empresa),
    pronto: sala.prontos.has(membro.empresa),
    ranking: rk,
    vagas: vagasPublicas(sala).filter((v) => v.mercado === empresa.mercado),
    avisos: sala.avisosRecentes.filter((a) => AVISOS_PUBLICOS.includes(a.tipo) || ("empresa" in a && a.empresa === membro.empresa)),
    fechamentos: sala.fechamentos[membro.empresa] ?? [],
  };
}

export function projetarTelao(sala: Sala): VisaoTelao {
  const nomeProduto = new Map(sala.estado.parametros.produtos.map((p) => [p.id, p.nome]));
  const mostrarRanking = sala.config.rankingVisivel === "completo";
  return {
    sala: infoDe(sala),
    relogio: relogioDe(sala),
    vagas: vagasPublicas(sala),
    ranking: mostrarRanking ? sala.estado.mercados.map((m) => ({ mercado: m.id, posicoes: rankingDoMercado(sala, m.id) })) : [],
    participacao: sala.estado.mercados.flatMap((m) =>
      sala.estado.parametros.produtos
        .filter((p) => p.varejo !== null)
        .map((p) => ({
          mercado: m.id,
          produto: p.id,
          nomeProduto: nomeProduto.get(p.id) ?? p.id,
          ofertas: sala.estado.empresas
            .filter((e) => e.mercado === m.id)
            .map((e) => {
              const o = e.ofertas.find((x) => x.produto === p.id)!;
              return { empresa: e.id, participacao: o.participacaoAnterior, preco: o.decisao.preco, nota: o.notaAnterior };
            }),
        })),
    ),
  };
}

export function projetarProfessor(sala: Sala, linkTelao: string, pin: string | null, conectados: ReadonlySet<string> = new Set()): VisaoProfessor {
  return {
    sala: infoDe(sala),
    relogio: relogioDe(sala),
    pin,
    linkTelao,
    robosNasVagasVazias: sala.config.robosNasVagasVazias,
    vagas: vagasPublicas(sala),
    empresas: sala.estado.empresas.map((e) => {
      const vaga = sala.vaga(e.id)!;
      const qualidade = (o: (typeof e.ofertas)[number]) => (o.estoque.quantidade > 0 ? o.estoque.qualidade : o.qualidadeReferencia);
      const p = sala.estado.parametros.marca;
      return {
        empresa: e.id,
        mercado: e.mercado,
        nome: e.nome,
        cor: vaga.equipe?.cor ?? null,
        robo: vaga.robo !== null,
        inativa: vaga.inativa,
        caixa: e.caixa,
        creditoEmergencial: e.creditoEmergencial,
        lucroAcumulado: e.contabil.lucrosAcumulados,
        receitaAcumulada: e.contabil.receitaAcumulada,
        lucroUltimoMes: e.contabil.ultimoFechamento?.lucroLiquido ?? null,
        pontosDeVenda: e.pontosDeVenda.length,
        fabricas: e.fabricas.length,
        fazendas: e.fazendas.length,
        materiasPrimas: Object.entries(e.materiasPrimas)
          .filter(([, m]) => m.estoque.quantidade > 0)
          .map(([produto, m]) => ({ produto, quantidade: m.estoque.quantidade, valor: m.estoque.valor })),
        membros: sala.membros.filter((m) => m.empresa === e.id).map((m) => ({ id: m.id, nome: m.nome, conectado: conectados.has(m.id) })),
        pronto: sala.prontos.has(e.id),
        pendentes: sala.fila.filter((f) => f.empresa === e.id).length,
        ofertas: e.ofertas.map((o) => ({
          produto: o.produto,
          preco: o.decisao.preco,
          participacao: o.participacaoAnterior,
          nota: o.notaAnterior,
          estoque: o.estoque.quantidade,
          qualidade: qualidade(o),
          marca: marca(o.reconhecimento, o.fidelidade, p.pesoReconhecimento, p.pesoFidelidade),
        })),
      };
    }),
    ranking: sala.estado.mercados.map((m) => ({ mercado: m.id, posicoes: rankingDoMercado(sala, m.id) })),
    avisos: sala.avisosRecentes,
  };
}

/** Pontuação de uma empresa pelo critério da sala (usada no histórico mensal). */
export function pontuacaoDe(sala: Sala, empresa: string): number {
  const e = sala.estado.empresas.find((x) => x.id === empresa)!;
  return calcularPontuacao(sala.estado, e, sala.config.criterio);
}
