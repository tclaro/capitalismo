/**
 * `/professor/<código>`: painel da sala. Sem sessão de professor neste navegador, pede o PIN ali
 * mesmo (o código já está na rota).
 */
import type { InfoServidor, VisaoProfessor } from "@simulador/compartilhado";
import { type FormEvent, useEffect, useState } from "react";
import { api } from "../cliente/api";
import { useConexao } from "../cliente/useConexao";
import { Aviso, Cabecalho, Carregando, IndicadorConexao } from "../componentes/base";
import { navegar } from "../roteador";
import { AcessoDaSala } from "./Acesso";
import { DiagnosticoDeRede } from "./Diagnostico";
import { EquipesDaSala } from "./Equipes";
import { BarraRelogio, OpcoesDaPartida } from "./Relogio";
import { AvisosDaSala, EmpresasDaSala, RankingDaSala } from "./VisaoGeral";

type Sessao = "verificando" | "professor" | "sem-sessao" | "sala-inexistente" | { erro: string };

export function PainelProfessor({ codigo }: { codigo: string }) {
  const [sessao, setSessao] = useState<Sessao>("verificando");
  useEffect(() => {
    let vivo = true;
    void api.sessao(codigo).then((r) => {
      if (!vivo) return;
      if (r.status === 404) setSessao("sala-inexistente");
      else if (!r.corpo.ok) setSessao({ erro: r.corpo.motivo });
      else setSessao(r.corpo.professor ? "professor" : "sem-sessao");
    });
    return () => {
      vivo = false;
    };
  }, [codigo]);

  return (
    <>
      <Cabecalho>
        <span className="codigo-sala">{codigo}</span>
      </Cabecalho>
      <main className="conteudo pilha">
        {sessao === "verificando" && <Carregando />}
        {sessao === "sala-inexistente" && (
          <Aviso tipo="erro">
            Não há sala com o código {codigo}.{" "}
            <a
              href="/professor"
              onClick={(e) => {
                e.preventDefault();
                navegar("/professor");
              }}
            >
              Criar ou abrir outra sala
            </a>
          </Aviso>
        )}
        {typeof sessao === "object" && <Aviso tipo="erro">{sessao.erro}</Aviso>}
        {sessao === "sem-sessao" && <PedirPin codigo={codigo} aoEntrar={() => setSessao("professor")} />}
        {sessao === "professor" && <PainelConectado codigo={codigo} />}
      </main>
    </>
  );
}

function PedirPin({ codigo, aoEntrar }: { codigo: string; aoEntrar: () => void }) {
  const [pin, setPin] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  async function entrar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    const r = await api.entrarProfessor(codigo, pin);
    if (r.corpo.ok) aoEntrar();
    else setErro(r.corpo.motivo);
  }
  return (
    <form className="cartao pilha" onSubmit={entrar} style={{ maxWidth: "24rem" }} aria-label="Entrar como professor">
      <h1>Sala {codigo}</h1>
      <p className="texto-2">Digite o PIN do professor para abrir o painel neste computador.</p>
      <div className="campo">
        <label htmlFor="pin-painel">PIN do professor</label>
        <input id="pin-painel" inputMode="numeric" maxLength={6} required autoComplete="off" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} />
      </div>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      <button type="submit" className="botao primario" disabled={pin.length !== 6}>
        Abrir painel
      </button>
    </form>
  );
}

function PainelConectado({ codigo }: { codigo: string }) {
  const { instantaneo, conexao } = useConexao<VisaoProfessor>(codigo, "professor");
  const [servidor, setServidor] = useState<InfoServidor | null>(null);
  useEffect(() => {
    void api.servidor().then((r) => r.corpo.ok && setServidor(r.corpo));
  }, []);
  const visao = instantaneo.visao;

  return (
    <>
      <div className="linha">
        <h1 style={{ margin: 0, flex: 1 }}>{visao ? `${visao.sala.presetNome}` : "Painel do professor"}</h1>
        <IndicadorConexao instantaneo={instantaneo} />
      </div>
      {instantaneo.motivo && <Aviso tipo="erro">{instantaneo.motivo}</Aviso>}
      {instantaneo.erro && <Aviso tipo="alerta">{instantaneo.erro}</Aviso>}
      {!visao ? (
        instantaneo.estado !== "encerrada" && <Carregando texto="Conectando à sala…" />
      ) : (
        <>
          <BarraRelogio visao={visao} conexao={conexao} />
          <div className="grade">
            <AcessoDaSala visao={visao} enderecos={servidor?.enderecos ?? []} />
            <OpcoesDaPartida visao={visao} conexao={conexao} />
          </div>
          <EquipesDaSala visao={visao} conexao={conexao} />
          {visao.relogio.status !== "preparacao" && (
            <>
              <RankingDaSala visao={visao} />
              <EmpresasDaSala visao={visao} />
              <AvisosDaSala visao={visao} />
            </>
          )}
          <DiagnosticoDeRede codigo={codigo} />
        </>
      )}
    </>
  );
}
