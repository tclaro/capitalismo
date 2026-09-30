/**
 * Visões reais para os testes de tela: a mesma `Sala` e as mesmas projeções do servidor, com
 * relógio falso. Assim a tela é testada contra o formato que o servidor de fato envia.
 */
import type { VisaoAluno, VisaoProfessor } from "@simulador/compartilhado";
import { projetarAluno, projetarProfessor } from "../../servidor/src/sala/projecoes";
import { Sala } from "../../servidor/src/sala/sala";
import { AgendadorFalso, configSala, criarEquipe } from "../../servidor/testes/ajuda";

export const LEITE = "leite_engarrafado";

let n = 0;

/** Sala com Alfa (Ana, Bia), Beta (Caio) e uma vaga livre; robôs "premium" nas vazias. */
export function salaDeExemplo(extra: Parameters<typeof configSala>[0] = {}) {
  const relogio = new AgendadorFalso();
  const sala = Sala.criar({ id: `sala_web_${++n}`, codigo: "ABCDE", semente: "fixture", config: configSala({ robosNasVagasVazias: "premium", ...extra }) }, relogio);
  const ana = criarEquipe(sala, "emp_01", "Alfa", "azul", "Ana");
  const r = sala.entrarAluno("Bia", { tipo: "existente", empresa: "emp_01" });
  if (!r.ok) throw new Error(r.motivo);
  const caio = criarEquipe(sala, "emp_02", "Beta", "verde", "Caio");
  let cmd = 0;
  const id = () => `cmd-fixture-${String(++cmd).padStart(4, "0")}`;
  return {
    sala,
    relogio,
    membros: { ana, bia: r.membro.id, caio },
    id,
    visao: (conectados: string[] = []): VisaoProfessor => JSON.parse(JSON.stringify(projetarProfessor(sala, "/telao/ABCDE?t=token-do-telao", null, new Set(conectados)))),
    /** Visão do aluno exatamente como o servidor envia (JSON ida e volta). */
    visaoAluno: (membro: string): VisaoAluno => JSON.parse(JSON.stringify(projetarAluno(sala, membro))),
    /** Inicia e joga `dias` ticks. */
    jogar(dias: number) {
      if (sala.status === "preparacao") sala.comandoRelogio(id(), 0, "iniciar");
      relogio.avancar(dias * 1000);
    },
  };
}
