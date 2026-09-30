/**
 * `/s/<código>`: tela do aluno. Sem sessão de aluno nesta sala, mostra a entrada (nome + equipe);
 * com sessão, conecta e mostra relógio, painel, decisões, relatórios, mercado e avisos.
 */
import { descreverData, type VisaoAluno } from "@simulador/compartilhado";
import { CircleCheck, CircleDashed, LogOut } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../cliente/api";
import { useComando } from "../cliente/useComando";
import { useConexao } from "../cliente/useConexao";
import { Aviso, Cabecalho, Carregando, CorEquipe, IndicadorConexao } from "../componentes/base";
import { Abas, Ajuda, PainelDaAba } from "../componentes/interativos";
import { formatarVelocidade } from "../formato";
import { navegar } from "../roteador";
import { AJUDA } from "./ajuda";
import { DecisoesDaEquipe } from "./Decisoes";
import { EntrarNaSala } from "./Entrar";
import { useAvisosAcumulados } from "./ganchos";
import { AvisosDaEquipe, MercadoDaEquipe } from "./Mercado";
import { PainelDaEmpresa } from "./Painel";
import { textoDoStatusAluno } from "./regras";
import { RelatoriosDaEmpresa } from "./Relatorios";

type Sessao = "verificando" | "aluno" | "sem-sessao" | { erro: string };

export function TelaAluno({ codigo }: { codigo: string }) {
  const [sessao, setSessao] = useState<Sessao>("verificando");
  useEffect(() => {
    let vivo = true;
    void api.sessao(codigo).then((r) => {
      if (!vivo) return;
      if (r.status === 404) setSessao({ erro: "Não há sala com esse código. Confira no telão." });
      else if (!r.corpo.ok) setSessao({ erro: r.corpo.motivo });
      else setSessao(r.corpo.aluno ? "aluno" : "sem-sessao");
    });
    return () => {
      vivo = false;
    };
  }, [codigo]);

  if (sessao === "aluno") return <Jogo codigo={codigo} aoSair={() => setSessao("sem-sessao")} />;
  return (
    <>
      <Cabecalho>
        <span className="codigo-sala">{codigo}</span>
      </Cabecalho>
      <main className="conteudo pilha">
        {sessao === "verificando" && <Carregando />}
        {typeof sessao === "object" && <Aviso tipo="erro">{sessao.erro}</Aviso>}
        {sessao === "sem-sessao" && <EntrarNaSala codigo={codigo} aoEntrar={() => setSessao("aluno")} />}
      </main>
    </>
  );
}

const ABAS = ["painel", "decisoes", "relatorios", "mercado", "avisos"] as const;
type AbaId = (typeof ABAS)[number];

function Jogo({ codigo, aoSair }: { codigo: string; aoSair: () => void }) {
  const { instantaneo, conexao } = useConexao<VisaoAluno>(codigo, "aluno");
  const [aba, setAba] = useState<AbaId>("painel");
  const v = instantaneo.visao;
  const avisos = useAvisosAcumulados(v?.relogio.tick, v?.avisos);
  const [avisosVistos, setAvisosVistos] = useState(0);
  useEffect(() => {
    if (aba === "avisos") setAvisosVistos(avisos.length);
  }, [aba, avisos.length]);

  async function sair() {
    await api.sair(codigo);
    aoSair();
  }

  return (
    <>
      <Cabecalho>
        {v && <CorEquipe cor={v.equipe.cor} nome={v.equipe.nome} />}
        <span className="codigo-sala">{codigo}</span>
        <IndicadorConexao instantaneo={instantaneo} />
        <button type="button" className="botao" onClick={() => void sair()} title="Sair desta sala neste computador">
          <LogOut aria-hidden size={16} /> Sair
        </button>
      </Cabecalho>
      <main className="conteudo pilha">
        {instantaneo.motivo && (
          <Aviso tipo="erro">
            {instantaneo.motivo}{" "}
            <a
              href={`/s/${codigo}`}
              onClick={(e) => {
                e.preventDefault();
                aoSair();
              }}
            >
              Entrar de novo
            </a>
          </Aviso>
        )}
        {instantaneo.erro && <Aviso tipo="alerta">{instantaneo.erro}</Aviso>}
        {!v ? (
          instantaneo.estado !== "encerrada" && <Carregando texto="Conectando à sala…" />
        ) : (
          <>
            <BarraDoAluno v={v} conexao={conexao} reconectando={instantaneo.estado === "reconectando"} />
            <Abas
              rotulo="Seções da empresa"
              atual={aba}
              aoMudar={(id) => setAba(id as AbaId)}
              abas={[
                { id: "painel", rotulo: "Painel" },
                { id: "decisoes", rotulo: "Decisões", selo: v.pendentes.length || null },
                { id: "relatorios", rotulo: "Relatórios" },
                { id: "mercado", rotulo: "Mercado" },
                { id: "avisos", rotulo: "Avisos", selo: avisos.length - avisosVistos || null },
              ]}
            />
            <PainelDaAba id={aba}>
              {aba === "painel" && <PainelDaEmpresa v={v} />}
              {aba === "decisoes" && <DecisoesDaEquipe v={v} conexao={conexao} codigo={codigo} />}
              {aba === "relatorios" && <RelatoriosDaEmpresa v={v} codigo={codigo} />}
              {aba === "mercado" && <MercadoDaEquipe v={v} />}
              {aba === "avisos" && <AvisosDaEquipe v={v} avisos={avisos} />}
            </PainelDaAba>
          </>
        )}
      </main>
    </>
  );
}

function BarraDoAluno({ v, conexao, reconectando }: { v: VisaoAluno; conexao: ReturnType<typeof useConexao<VisaoAluno>>["conexao"]; reconectando: boolean }) {
  const { executar, enviando, erro } = useComando(conexao);
  const r = v.relogio;
  const jogando = r.status === "rodando" || r.status === "pausada";
  return (
    <div className="pilha" style={{ position: "sticky", top: 0, zIndex: 5 }}>
      <div className="barra-relogio" role="region" aria-label="Relógio da partida">
        <div>
          <div className="data">{descreverData(r.tick, r.ticksPorMes)}</div>
          <div className="pequeno texto-2">
            Mês {r.tick === 0 ? 0 : r.mes} de {r.duracaoMeses} · {formatarVelocidade(r.segundosPorTick)}
          </div>
        </div>
        <span className={`selo ${r.status === "rodando" ? "sucesso" : r.status === "pausada" ? "alerta" : ""}`} role="status">
          {textoDoStatusAluno(r)}
        </span>
        {reconectando && <span className="selo alerta">sem conexão: os dados podem estar atrasados</span>}
        <span className="espaco" />
        {jogando && (
          <span className="linha">
            <button
              type="button"
              className={`botao${v.pronto ? "" : " primario"}`}
              aria-pressed={v.pronto}
              disabled={enviando}
              onClick={() => void executar({ tipo: "pronto", pronto: !v.pronto })}
            >
              {v.pronto ? <CircleCheck aria-hidden size={18} /> : <CircleDashed aria-hidden size={18} />}
              {v.pronto ? "Equipe pronta (desfazer)" : "Marcar equipe como pronta"}
            </button>
            <Ajuda titulo="pronto">{AJUDA.pronto}</Ajuda>
          </span>
        )}
      </div>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
    </div>
  );
}
