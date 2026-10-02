/**
 * `/s/<código>`: tela do aluno. Sem sessão de aluno nesta sala, mostra a entrada (nome + equipe);
 * com sessão, a tela de jogo em painel único, sem rolagem: HUD no topo, produtos à esquerda, o
 * console do produto no centro, ranking e avisos à direita e a barra de atalhos embaixo.
 */
import type { DecisaoDoAluno, FechamentoMensal, VisaoAluno } from "@simulador/compartilhado";
import { useEffect, useRef, useState } from "react";
import { api } from "../cliente/api";
import type { ConexaoSala } from "../cliente/conexao";
import { useConexao } from "../cliente/useConexao";
import { Aviso, Cabecalho, Carregando } from "../componentes/base";
import { formatarVelocidade } from "../formato";
import { explicarRecusa } from "../professor/regras";
import type { ResultadoDoEnvio } from "./CampoDecisao";
import { type AbaDaCadeia, VistaDaCadeia } from "./cadeia/Vista";
import { ConsoleDoProduto } from "./Console";
import { EntrarNaSala } from "./Entrar";
import { useAvisosAcumulados, useHistorico } from "./ganchos";
import { Hud } from "./Hud";
import { Fechamento, FimDaPartida, Graficos, Janela, Resultados } from "./Janelas";
import { avisoDoPrimeiroLugar, novosEsgotados, posicaoNoRanking, produtosEsgotados, semanaGlobal } from "./jogo";
import { ListaDeAvisos, RankingDoMercado } from "./Lateral";
import { ProvedorDeNotificacoes, useNotificar } from "./notificacoes";
import { BlocoDaEmpresa, CartoesDosProdutos } from "./Produtos";
import { decisoesEfetivas } from "./regras";

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

function Jogo({ codigo, aoSair }: { codigo: string; aoSair: () => void }) {
  const { instantaneo, conexao } = useConexao<VisaoAluno>(codigo, "aluno");
  const v = instantaneo.visao;
  async function sair() {
    await api.sair(codigo);
    aoSair();
  }
  if (!v) {
    return (
      <main className="conteudo pilha">
        {instantaneo.motivo ? (
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
        ) : (
          <Carregando texto="Conectando à sala…" />
        )}
      </main>
    );
  }
  return (
    <ProvedorDeNotificacoes>
      <TelaDeJogo v={v} codigo={codigo} conexao={conexao} instantaneo={instantaneo} aoSair={() => void sair()} aoEntrarDeNovo={aoSair} />
    </ProvedorDeNotificacoes>
  );
}

type JanelaAberta = null | "resultados" | "graficos" | { tipo: "fechamento"; f: FechamentoMensal; posicaoAntes: number | null } | "fim";

function TelaDeJogo({
  v,
  codigo,
  conexao,
  instantaneo,
  aoSair,
  aoEntrarDeNovo,
}: {
  v: VisaoAluno;
  codigo: string;
  conexao: ConexaoSala<VisaoAluno> | null;
  instantaneo: ReturnType<typeof useConexao<VisaoAluno>>["instantaneo"];
  aoSair: () => void;
  aoEntrarDeNovo: () => void;
}) {
  const notificar = useNotificar();
  const r = v.relogio;
  const produtos = v.visao.produtos;
  const [selecionado, setSelecionado] = useState(produtos[0]?.id ?? "");
  const sel = produtos.some((p) => p.id === selecionado) ? selecionado : (produtos[0]?.id ?? "");
  const [janela, setJanela] = useState<JanelaAberta>(null);
  // Com o módulo da cadeia ativo, a visão da cadeia substitui o console por produto (botões no HUD alternam).
  const temCadeia = v.visao.cadeia !== null;
  const [vista, setVista] = useState<"cadeia" | "produtos">(temCadeia ? "cadeia" : "produtos");
  const [instalacao, setInstalacao] = useState("");
  const [abaDaCadeia, setAbaDaCadeia] = useState<AbaDaCadeia>("instalacao");
  const naCadeia = temCadeia && vista === "cadeia";
  const irParaProdutos = (produto?: string) => {
    if (produto) setSelecionado(produto);
    setVista("produtos");
  };
  const historico = useHistorico(codigo, semanaGlobal(r.tick, r.ticksPorMes));
  const avisos = useAvisosAcumulados(r.tick, v.avisos);
  const [enviandoPronto, setEnviandoPronto] = useState(false);

  // Tela cheia sem rolagem (e a escala da fonte pela janela) só enquanto o jogo está aberto.
  useEffect(() => {
    document.documentElement.classList.add("j-modo-jogo");
    return () => document.documentElement.classList.remove("j-modo-jogo");
  }, []);

  // Último preço com que cada produto foi vendido (para "voltar a vender" sem redigitar).
  const ultimoPreco = useRef(new Map<string, number>());
  for (const [produto, d] of Object.entries(decisoesEfetivas(v.visao, v.pendentes))) if (d.preco !== null) ultimoPreco.current.set(produto, d.preco);

  async function comandar(decisoes: DecisaoDoAluno[]): Promise<ResultadoDoEnvio> {
    if (!conexao) return { motivo: "sem conexão com a sala" };
    const res = await conexao.comando({ tipo: "decidir", decisoes });
    return res.ok ? true : { motivo: explicarRecusa(res.motivo) };
  }

  async function alternarPronto() {
    if (!conexao || enviandoPronto) return;
    setEnviandoPronto(true);
    const res = await conexao.comando({ tipo: "pronto", pronto: !v.pronto });
    setEnviandoPronto(false);
    if (!res.ok) notificar(explicarRecusa(res.motivo));
  }

  // Avisos flutuantes: produto esgotado (uma vez até se recuperar) e o 1º lugar do ranking.
  const esgotados = useRef<Set<string> | null>(null);
  const posicao = useRef<number | null | undefined>(undefined);
  const tickVisto = useRef<number | null>(null);
  const posicaoAntesDoMes = useRef<number | null>(null);
  const janelasMostradas = useRef(new Set<string>());
  useEffect(() => {
    if (tickVisto.current === r.tick) return;
    const primeira = tickVisto.current === null;
    tickVisto.current = r.tick;
    const agora = produtosEsgotados(v);
    for (const p of novosEsgotados(esgotados.current, agora)) {
      const nome = produtos.find((x) => x.id === p)?.nome ?? p;
      notificar(`${nome} esgotou: há clientes sem produto. Ajuste a compra ou a produção.`, { rotulo: "Ver", executar: () => irParaProdutos(p) });
    }
    esgotados.current = agora;
    const pos = posicaoNoRanking(v);
    const texto = primeira ? null : avisoDoPrimeiroLugar(posicao.current ?? null, pos);
    if (texto) notificar(texto);

    // Fechamento do mês (só no modo rodada) e fim da partida: abrem uma vez cada.
    const f = v.fechamentos.at(-1);
    if (r.status === "pausada" && r.motivoPausa === "fim_do_mes" && r.modo === "rodada" && f && !janelasMostradas.current.has(`mes-${f.mes}`)) {
      janelasMostradas.current.add(`mes-${f.mes}`);
      setJanela({ tipo: "fechamento", f, posicaoAntes: posicaoAntesDoMes.current });
    }
    if (((r.status === "pausada" && r.motivoPausa === "duracao_atingida") || r.status === "encerrada") && !janelasMostradas.current.has(`fim-${r.status}`)) {
      janelasMostradas.current.add(`fim-${r.status}`);
      setJanela("fim");
    }
    if (r.dia === 1 || primeira) posicaoAntesDoMes.current = pos;
    posicao.current = pos;
  });

  // Atalhos: 1–9 produtos, R resultados, G gráficos, P pronto (modo rodada).
  const atalhos = useRef<(e: KeyboardEvent) => void>(() => {});
  atalhos.current = (e) => {
    if (janela !== null || e.ctrlKey || e.metaKey || e.altKey || document.querySelector(".j-veu")) return;
    const alvo = e.target as Element | null;
    if (alvo instanceof Element && alvo.matches("input, textarea, select")) return;
    const n = Number(e.key);
    if (temCadeia && (e.key === "c" || e.key === "C")) setVista("cadeia");
    else if (temCadeia && (e.key === "v" || e.key === "V")) setVista("produtos");
    else if (!naCadeia && Number.isInteger(n) && n >= 1 && n <= Math.min(9, produtos.length)) {
      setSelecionado(produtos[n - 1]!.id);
      e.preventDefault();
    } else if (e.key === "r" || e.key === "R") setJanela("resultados");
    else if (e.key === "g" || e.key === "G") setJanela("graficos");
    else if ((e.key === "p" || e.key === "P") && r.modo === "rodada") void alternarPronto();
  };
  useEffect(() => {
    const ouvir = (e: KeyboardEvent) => atalhos.current(e);
    document.addEventListener("keydown", ouvir);
    return () => document.removeEventListener("keydown", ouvir);
  }, []);

  const faixa =
    r.status === "preparacao"
      ? "Aguardando o professor iniciar a partida. Vocês já podem preparar as decisões."
      : r.status === "encerrada"
        ? "Partida encerrada: os resultados estão congelados."
        : r.status === "pausada" && r.motivoPausa === "manual"
          ? r.podeEditar
            ? "Pausado pelo professor: as decisões continuam liberadas."
            : "Pausado pelo professor: as decisões estão travadas até ele liberar."
          : r.status === "pausada" && r.motivoPausa === "duracao_atingida"
            ? "Fim do tempo previsto: aguardem o professor encerrar ou estender a partida."
            : null;

  return (
    <div className="j-app">
      <Hud v={v} instantaneo={instantaneo} aoSair={aoSair} vistas={temCadeia ? { atual: vista, aoMudar: setVista } : undefined} />
      {(instantaneo.motivo || instantaneo.erro || instantaneo.estado === "reconectando") && (
        <div className="j-faixa-conexao" role="alert">
          {instantaneo.motivo ? (
            <>
              {instantaneo.motivo}{" "}
              <a
                href={`/s/${codigo}`}
                onClick={(e) => {
                  e.preventDefault();
                  aoEntrarDeNovo();
                }}
              >
                Entrar de novo
              </a>
            </>
          ) : instantaneo.erro ? (
            instantaneo.erro
          ) : (
            "Sem conexão com o servidor: os números podem estar atrasados. Tentando reconectar…"
          )}
        </div>
      )}
      {naCadeia && faixa && (
        <div className="j-faixa" role="status">
          {faixa}
        </div>
      )}
      <main className={`j-principal${naCadeia ? " cadeia" : ""}`}>
        {naCadeia ? (
          <VistaDaCadeia v={v} comandar={comandar} selecionada={instalacao} aoSelecionar={setInstalacao} aba={abaDaCadeia} aoMudarAba={setAbaDaCadeia} aoIrParaProdutos={irParaProdutos} bloqueada={janela !== null} />
        ) : (
          <>
            <nav className="j-coluna" aria-label="Produtos e empresa">
              <CartoesDosProdutos v={v} selecionado={sel} aoSelecionar={setSelecionado} mercado={historico.mercado} />
              <BlocoDaEmpresa v={v} comandar={comandar} />
            </nav>
            <section className={`j-console${faixa ? " com-faixa" : ""}${!r.podeEditar ? " travado" : ""}`} aria-label="Produto escolhido">
              {faixa && (
                <div className="j-faixa" role="status">
                  {faixa}
                </div>
              )}
              {sel && <ConsoleDoProduto key={sel} v={v} produto={sel} comandar={comandar} ultimoPreco={ultimoPreco.current} mercado={historico.mercado} trocou />}
            </section>
          </>
        )}
        <aside className="j-coluna" aria-label="Mercado">
          <RankingDoMercado v={v} />
          <ListaDeAvisos v={v} avisos={avisos} />
        </aside>
      </main>
      <footer className="j-rodape">
        <span className="j-modo">
          {r.modo === "rodada" ? `Modo rodada: o mês para no dia ${r.ticksPorMes} para vocês decidirem · ${formatarVelocidade(r.segundosPorTick)}` : `Modo contínuo · ${formatarVelocidade(r.segundosPorTick)} · as mudanças valem a partir do dia seguinte`}
        </span>
        <span className="j-atalhos" aria-hidden="true">
          {naCadeia ? (
            <>
              <span>
                <kbd>1</kbd>–<kbd>9</kbd> instalações
              </span>
              <span>
                <kbd>I</kbd> <kbd>A</kbd> abas
              </span>
              <span>
                <kbd>V</kbd> produtos
              </span>
            </>
          ) : (
            <>
              <span>
                <kbd>1</kbd>–<kbd>{Math.min(9, produtos.length)}</kbd> produtos
              </span>
              {temCadeia && (
                <span>
                  <kbd>C</kbd> cadeia
                </span>
              )}
            </>
          )}
          <span>
            <kbd>R</kbd> resultados
          </span>
          <span>
            <kbd>G</kbd> gráficos
          </span>
          <span>
            <kbd>Esc</kbd> fechar
          </span>
        </span>
        <span className="j-botoes">
          <button type="button" className="botao" onClick={() => setJanela("resultados")}>
            Resultados <kbd>R</kbd>
          </button>
          <button type="button" className="botao" onClick={() => setJanela("graficos")}>
            Gráficos <kbd>G</kbd>
          </button>
          {r.modo === "rodada" && (r.status === "rodando" || r.status === "pausada") && (
            <button type="button" className={`botao j-pronto${v.pronto ? " sim" : ""}`} aria-pressed={v.pronto} disabled={enviandoPronto} onClick={() => void alternarPronto()}>
              {v.pronto ? "Pronto ✓" : "Pronto"} <kbd>P</kbd>
            </button>
          )}
        </span>
      </footer>

      {janela === "resultados" && (
        <Janela titulo="Resultados" aoFechar={() => setJanela(null)}>
          <Resultados v={v} />
        </Janela>
      )}
      {janela === "graficos" && (
        <Janela titulo="Gráficos" aoFechar={() => setJanela(null)}>
          <Graficos v={v} historico={historico} />
        </Janela>
      )}
      {janela !== null && typeof janela === "object" && <Fechamento v={v} f={janela.f} posicaoAntes={janela.posicaoAntes} historico={historico} aoFechar={() => setJanela(null)} aoVerResultados={() => setJanela("resultados")} />}
      {janela === "fim" && <FimDaPartida v={v} aoFechar={() => setJanela(null)} aoVerResultados={() => setJanela("resultados")} />}
    </div>
  );
}
