/**
 * Telas da entrega 4: a estrutura (rota, conexão, estado) já funciona; o conteúdo de cada tela vem
 * nas entregas 5 (professor), 6 (aluno e entrada) e 7 (telão).
 */
import type { Papel } from "@simulador/compartilhado";
import { type FormEvent, useState } from "react";
import { api } from "../cliente/api";
import { useConexao } from "../cliente/useConexao";
import { Aviso, Cabecalho, Carregando, IndicadorConexao, ResumoRelogio } from "../componentes/base";
import { navegar } from "../roteador";

export function TelaEntrada({ codigoInicial }: { codigoInicial: string | null }) {
  const [codigo, setCodigo] = useState(codigoInicial ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function entrar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    const r = await api.infoSala(codigo.trim());
    setEnviando(false);
    if (!r.corpo.ok) setErro(r.status === 404 ? "Não há sala com esse código. Confira no telão." : r.corpo.motivo);
    else navegar({ tela: "aluno", codigo: codigo.trim().toUpperCase() });
  }

  return (
    <>
      <Cabecalho />
      <main className="conteudo estreito">
        <form className="cartao pilha" onSubmit={entrar}>
          <h1>Entrar na sala</h1>
          <div className="campo">
            <label htmlFor="codigo">Código da sala</label>
            <input
              id="codigo"
              className="codigo-sala"
              autoComplete="off"
              autoCapitalize="characters"
              maxLength={5}
              required
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.toUpperCase())}
            />
          </div>
          {erro && <Aviso tipo="erro">{erro}</Aviso>}
          <button className="botao primario" type="submit" disabled={enviando || codigo.trim().length !== 5}>
            Continuar
          </button>
          <p className="pequeno texto-2">
            É professor?{" "}
            <a
              href="/professor"
              onClick={(e) => {
                e.preventDefault();
                navegar("/professor");
              }}
            >
              Criar ou abrir uma sala
            </a>
          </p>
        </form>
      </main>
    </>
  );
}

/** Tela conectada à sala (aluno, professor ou telão), por enquanto só com o estado da conexão. */
export function TelaConectada({ codigo, papel, token = null, titulo }: { codigo: string; papel: Papel; token?: string | null; titulo: string }) {
  const { instantaneo } = useConexao(codigo, papel, token);
  return (
    <>
      <Cabecalho>
        <span className="codigo-sala">{codigo}</span>
        <IndicadorConexao instantaneo={instantaneo} />
      </Cabecalho>
      <main className="conteudo pilha">
        <h1>{titulo}</h1>
        {instantaneo.motivo && <Aviso tipo="erro">{instantaneo.motivo}</Aviso>}
        {instantaneo.visao ? <ResumoRelogio relogio={instantaneo.visao.relogio} /> : instantaneo.estado !== "encerrada" && <Carregando />}
        <p className="texto-2 pequeno">Tela em construção.</p>
      </main>
    </>
  );
}

export function TelaNaoEncontrada() {
  return (
    <>
      <Cabecalho />
      <main className="conteudo estreito pilha">
        <h1>Página não encontrada</h1>
        <p>
          <a
            href="/"
            onClick={(e) => {
              e.preventDefault();
              navegar("/");
            }}
          >
            Voltar ao início
          </a>
        </p>
      </main>
    </>
  );
}
