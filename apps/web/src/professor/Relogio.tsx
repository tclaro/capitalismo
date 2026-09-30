/**
 * Relógio do professor: data do jogo, estado, controles (iniciar, pausar, retomar, avançar,
 * estender, encerrar) e as opções que podem mudar durante a partida.
 */
import { descreverData, type VisaoProfessor } from "@simulador/compartilhado";
import { FastForward, Pause, Play, Square } from "lucide-react";
import { useState } from "react";
import type { ComandoSemId, ConexaoSala } from "../cliente/conexao";
import { useComando } from "../cliente/useComando";
import { Aviso, BotaoConfirmar, Secao } from "../componentes/base";
import { formatarNumero } from "../formato";
import { acoesDoRelogio, duracaoDoMes, textoDoStatus, VELOCIDADES } from "./regras";

type Props = { visao: VisaoProfessor; conexao: ConexaoSala<VisaoProfessor> | null };

export function BarraRelogio({ visao, conexao }: Props) {
  const { relogio } = visao;
  const acoes = acoesDoRelogio(relogio);
  const { executar, enviando, erro } = useComando(conexao);
  const [meses, setMeses] = useState(6);
  const relogioCmd = (acao: "iniciar" | "pausar" | "retomar" | "avancar", unidade?: "tick" | "semana" | "mes") =>
    void executar({ tipo: "relogio", tickEsperado: relogio.tick, acao, ...(unidade ? { unidade } : {}) });
  const mesAtual = relogio.tick === 0 ? 0 : relogio.mes;

  return (
    <div className="pilha" style={{ position: "sticky", top: 0, zIndex: 5 }}>
      <div className="barra-relogio" role="region" aria-label="Relógio da partida">
        <div>
          <div className="data">{descreverData(relogio.tick, relogio.ticksPorMes)}</div>
          <div className="pequeno texto-2">
            Mês {mesAtual} de {relogio.duracaoMeses} · {formatarNumero(relogio.segundosPorTick, relogio.segundosPorTick % 1 === 0 ? 0 : 1)} s por dia
          </div>
        </div>
        <span className={`selo ${relogio.status === "rodando" ? "sucesso" : relogio.status === "pausada" ? "alerta" : ""}`} role="status">
          {textoDoStatus(relogio)}
        </span>
        <span className="espaco" />
        {acoes.iniciar && (
          <button type="button" className="botao primario" disabled={enviando} onClick={() => relogioCmd("iniciar")}>
            <Play aria-hidden size={18} /> Iniciar partida
          </button>
        )}
        {acoes.pausar && (
          <button type="button" className="botao primario" disabled={enviando} onClick={() => relogioCmd("pausar")}>
            <Pause aria-hidden size={18} /> Pausar
          </button>
        )}
        {acoes.retomar && (
          <button type="button" className="botao primario" disabled={enviando} onClick={() => relogioCmd("retomar")}>
            <Play aria-hidden size={18} /> Retomar
          </button>
        )}
        {acoes.avancar && (
          <span className="linha" role="group" aria-label="Avançar manualmente">
            <FastForward aria-hidden size={18} />
            <button type="button" className="botao" disabled={enviando} onClick={() => relogioCmd("avancar", "tick")}>
              1 dia
            </button>
            <button type="button" className="botao" disabled={enviando} onClick={() => relogioCmd("avancar", "semana")}>
              Até o fim da semana
            </button>
            <button type="button" className="botao" disabled={enviando} onClick={() => relogioCmd("avancar", "mes")}>
              Até o fim do mês
            </button>
          </span>
        )}
      </div>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {relogio.motivoPausa === "duracao_atingida" && (
        <Aviso tipo="alerta">
          A partida chegou aos {relogio.duracaoMeses} meses combinados. Estenda para continuar ou encerre para congelar os resultados.
        </Aviso>
      )}
      {acoes.estender && relogio.motivoPausa === "duracao_atingida" && (
        <div className="linha">
          <label htmlFor="meses-extra">Estender por</label>
          <input id="meses-extra" type="number" min={1} max={60} value={meses} onChange={(e) => setMeses(Math.max(1, Math.min(60, Math.trunc(Number(e.target.value)) || 1)))} style={{ width: "5rem" }} />
          <span>meses</span>
          <button type="button" className="botao" disabled={enviando} onClick={() => void executar({ tipo: "estender", meses })}>
            Estender
          </button>
        </div>
      )}
    </div>
  );
}

/** Opções que o professor muda durante a partida (velocidade, modo, edição, ranking, duração). */
export function OpcoesDaPartida({ visao, conexao }: Props) {
  const { relogio, sala } = visao;
  const { executar, enviando, erro } = useComando(conexao);
  const acoes = acoesDoRelogio(relogio);
  const [meses, setMeses] = useState(6);
  const encerrada = relogio.status === "encerrada";
  const configurar = (mudancas: Omit<Extract<ComandoSemId, { tipo: "configurar" }>, "tipo">) => void executar({ tipo: "configurar", ...mudancas });

  return (
    <Secao titulo="Opções da partida">
      <div className="campo">
        <label htmlFor="op-velocidade">Velocidade</label>
        <select id="op-velocidade" disabled={encerrada || enviando} value={relogio.segundosPorTick} onChange={(e) => configurar({ segundosPorTick: Number(e.target.value) })}>
          {!VELOCIDADES.includes(relogio.segundosPorTick as (typeof VELOCIDADES)[number]) && <option value={relogio.segundosPorTick}>{relogio.segundosPorTick} s por dia</option>}
          {VELOCIDADES.map((s) => (
            <option key={s} value={s}>
              {formatarNumero(s, s % 1 === 0 ? 0 : 1)} s por dia ({duracaoDoMes(s, relogio.ticksPorMes)})
            </option>
          ))}
        </select>
      </div>
      <div className="campo">
        <label htmlFor="op-modo">Modo do relógio</label>
        <select id="op-modo" disabled={encerrada || enviando} value={relogio.modo} onChange={(e) => configurar({ modo: e.target.value as "continuo" | "rodada" })}>
          <option value="continuo">Contínuo</option>
          <option value="rodada">Rodada (pausa no fim de cada mês)</option>
        </select>
      </div>
      {relogio.modo === "rodada" && (
        <label className="campo-linha">
          <input type="checkbox" disabled={encerrada || enviando} checked={sala.avancoQuandoProntas} onChange={(e) => configurar({ avancoQuandoProntas: e.target.checked })} />
          Retomar sozinho quando todas as equipes marcarem "pronto"
        </label>
      )}
      <label className="campo-linha">
        <input type="checkbox" disabled={encerrada || enviando} checked={sala.edicaoNaPausa} onChange={(e) => configurar({ edicaoNaPausa: e.target.checked })} />
        Alunos podem mudar decisões quando o professor pausa
      </label>
      <div className="campo">
        <label htmlFor="op-ranking">Ranking para os alunos</label>
        <select id="op-ranking" disabled={encerrada || enviando} value={sala.rankingVisivel} onChange={(e) => configurar({ rankingVisivel: e.target.value as "completo" | "propria" | "oculto" })}>
          <option value="completo">Completo (também no telão)</option>
          <option value="propria">Só a posição da própria equipe</option>
          <option value="oculto">Oculto</option>
        </select>
      </div>
      {acoes.estender && relogio.motivoPausa !== "duracao_atingida" && (
        <div className="linha">
          <span>Duração: {relogio.duracaoMeses} meses.</span>
          <label htmlFor="op-meses" className="pequeno">
            Mais
          </label>
          <input id="op-meses" type="number" min={1} max={60} value={meses} onChange={(e) => setMeses(Math.max(1, Math.min(60, Math.trunc(Number(e.target.value)) || 1)))} style={{ width: "4.5rem" }} />
          <button type="button" className="botao" disabled={enviando} onClick={() => void executar({ tipo: "estender", meses })}>
            Estender
          </button>
        </div>
      )}
      {acoes.encerrar && (
        <div>
          <BotaoConfirmar perigo confirmar="Encerrar congela os resultados e não tem volta." aoConfirmar={() => void executar({ tipo: "encerrar" })} desabilitado={enviando}>
            <Square aria-hidden size={16} /> Encerrar partida
          </BotaoConfirmar>
        </div>
      )}
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
    </Secao>
  );
}
