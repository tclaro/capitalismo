/**
 * `/professor`: criar uma sala (com a chave de professor) ou reabrir uma existente (código + PIN).
 */
import type { InfoServidor } from "@simulador/compartilhado";
import { DoorOpen, Plus } from "lucide-react";
import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import { api } from "../cliente/api";
import { Aviso, Cabecalho, Carregando } from "../componentes/base";
import { formatarNumero } from "../formato";
import { navegar } from "../roteador";
import { configDoFormulario, duracaoDoMes, type FormularioSala, formularioPadrao, lembrarPin, nomeDaEstrategia, VELOCIDADES } from "./regras";

export function TelaInicioProfessor() {
  const [info, setInfo] = useState<InfoServidor | null>(null);
  const [erroInfo, setErroInfo] = useState<string | null>(null);
  useEffect(() => {
    void api.servidor().then((r) => (r.corpo.ok ? setInfo(r.corpo) : setErroInfo(r.corpo.motivo)));
  }, []);

  return (
    <>
      <Cabecalho />
      <main className="conteudo pilha">
        <h1>Professor</h1>
        {erroInfo && <Aviso tipo="erro">{erroInfo}</Aviso>}
        {!info && !erroInfo && <Carregando />}
        {info && (
          <div className="grade">
            <CriarSala info={info} />
            <ReabrirSala />
          </div>
        )}
      </main>
    </>
  );
}

function Campo({ id, rotulo, children, ajuda }: { id: string; rotulo: string; children: ReactNode; ajuda?: string }) {
  return (
    <div className="campo">
      <label htmlFor={id}>{rotulo}</label>
      {children}
      {ajuda && <span className="pequeno texto-2">{ajuda}</span>}
    </div>
  );
}

function CriarSala({ info }: { info: InfoServidor }) {
  const [chave, setChave] = useState("");
  const [f, setF] = useState<FormularioSala>(() => formularioPadrao(info.presets[0]?.id ?? "", info.estrategiasDeRobo));
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const mudar = <K extends keyof FormularioSala>(k: K, valor: FormularioSala[K]) => setF((x) => ({ ...x, [k]: valor }));

  async function criar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    const c = configDoFormulario(f);
    if (!c.ok) {
      setErro(c.erro);
      return;
    }
    setEnviando(true);
    const r = await api.criarSala(chave, c.config);
    setEnviando(false);
    if (!r.corpo.ok) {
      setErro(r.corpo.motivo);
      return;
    }
    lembrarPin(r.corpo.codigo, r.corpo.pin);
    navegar({ tela: "professor", codigo: r.corpo.codigo });
  }

  if (!info.chaveDefinida) {
    return (
      <section className="cartao pilha" aria-label="Criar sala">
        <h2>Criar sala</h2>
        <Aviso tipo="alerta">
          A chave de professor ainda não foi definida. No computador servidor, abra <strong>http://localhost:{info.porta}/admin</strong> ou rode o executável com <code>--definir-chave</code>.
        </Aviso>
      </section>
    );
  }

  const total = f.mercados * f.vagasPorMercado;
  return (
    <form className="cartao pilha" onSubmit={criar} aria-label="Criar sala">
      <h2>
        <Plus aria-hidden size={20} /> Criar sala
      </h2>
      <Campo id="chave" rotulo="Chave de professor" ajuda="A mesma para todos os professores deste servidor.">
        <input id="chave" type="password" autoComplete="current-password" required value={chave} onChange={(e) => setChave(e.target.value)} />
      </Campo>
      <Campo id="preset" rotulo="Cenário">
        <select id="preset" value={f.presetId} onChange={(e) => mudar("presetId", e.target.value)}>
          {info.presets.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome}
            </option>
          ))}
        </select>
      </Campo>
      <div className="grade" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <Campo id="mercados" rotulo="Mercados paralelos">
          <select id="mercados" value={f.mercados} onChange={(e) => mudar("mercados", Number(e.target.value))}>
            {[1, 2, 3].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </Campo>
        <Campo id="vagas" rotulo="Equipes por mercado">
          <select id="vagas" value={f.vagasPorMercado} onChange={(e) => mudar("vagasPorMercado", Number(e.target.value))}>
            {[2, 3, 4, 5, 6, 7, 8].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </Campo>
      </div>
      <Campo id="robos" rotulo="Vagas que ficarem sem equipe" ajuda={`${total} vaga(s) no total. Ao iniciar, as vazias viram robôs ou ficam fora do jogo.`}>
        <select id="robos" value={f.robos} onChange={(e) => mudar("robos", e.target.value)}>
          {info.estrategiasDeRobo.map((s) => (
            <option key={s} value={s}>
              Robô: {nomeDaEstrategia(s)}
            </option>
          ))}
          <option value="">Ficam inativas</option>
        </select>
      </Campo>
      <div className="grade" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <Campo id="duracao" rotulo="Duração (meses de jogo)">
          <input id="duracao" type="number" min={1} max={120} required value={f.duracaoMeses} onChange={(e) => mudar("duracaoMeses", Math.trunc(Number(e.target.value)))} />
        </Campo>
        <Campo id="velocidade" rotulo="Velocidade" ajuda={duracaoDoMes(f.segundosPorTick)}>
          <select id="velocidade" value={f.segundosPorTick} onChange={(e) => mudar("segundosPorTick", Number(e.target.value))}>
            {VELOCIDADES.map((s) => (
              <option key={s} value={s}>
                {formatarNumero(s, s % 1 === 0 ? 0 : 1)} s por dia
              </option>
            ))}
          </select>
        </Campo>
      </div>
      <Campo id="modo" rotulo="Modo do relógio">
        <select id="modo" value={f.modo} onChange={(e) => mudar("modo", e.target.value as FormularioSala["modo"])}>
          <option value="continuo">Contínuo (só para quando o professor pausa)</option>
          <option value="rodada">Rodada (pausa sozinho no fim de cada mês)</option>
        </select>
      </Campo>
      {f.modo === "rodada" && (
        <label className="campo-linha">
          <input type="checkbox" checked={f.avancoQuandoProntas} onChange={(e) => mudar("avancoQuandoProntas", e.target.checked)} />
          Retomar sozinho quando todas as equipes marcarem "pronto"
        </label>
      )}
      <label className="campo-linha">
        <input type="checkbox" checked={f.edicaoNaPausa} onChange={(e) => mudar("edicaoNaPausa", e.target.checked)} />
        Alunos podem mudar decisões quando o professor pausa
      </label>
      <Campo id="ranking" rotulo="Ranking para os alunos">
        <select id="ranking" value={f.rankingVisivel} onChange={(e) => mudar("rankingVisivel", e.target.value as FormularioSala["rankingVisivel"])}>
          <option value="completo">Completo (também no telão)</option>
          <option value="propria">Só a posição da própria equipe</option>
          <option value="oculto">Oculto</option>
        </select>
      </Campo>
      <Campo id="criterio" rotulo="Critério de pontuação">
        <select id="criterio" value={f.criterio} onChange={(e) => mudar("criterio", e.target.value as FormularioSala["criterio"])}>
          <option value="lucro_acumulado">Lucro acumulado</option>
          <option value="participacao_receita">Participação na receita do mercado</option>
        </select>
      </Campo>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      <button className="botao primario" type="submit" disabled={enviando || chave.length === 0}>
        {enviando ? "Criando…" : "Criar sala"}
      </button>
    </form>
  );
}

function ReabrirSala() {
  const [codigo, setCodigo] = useState("");
  const [pin, setPin] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function reabrir(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    const r = await api.entrarProfessor(codigo.trim(), pin.trim());
    setEnviando(false);
    if (!r.corpo.ok) setErro(r.corpo.motivo);
    else navegar({ tela: "professor", codigo: r.corpo.codigo });
  }

  return (
    <form className="cartao pilha" onSubmit={reabrir} aria-label="Reabrir sala" style={{ alignSelf: "start" }}>
      <h2>
        <DoorOpen aria-hidden size={20} /> Reabrir sala
      </h2>
      <p className="texto-2 pequeno">Para voltar a uma sala de outro computador ou na aula seguinte.</p>
      <Campo id="codigo-reabrir" rotulo="Código da sala">
        <input id="codigo-reabrir" className="codigo-sala" maxLength={5} required autoComplete="off" value={codigo} onChange={(e) => setCodigo(e.target.value.toUpperCase())} />
      </Campo>
      <Campo id="pin" rotulo="PIN do professor">
        <input id="pin" inputMode="numeric" pattern="\d{6}" maxLength={6} required autoComplete="off" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} />
      </Campo>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      <button className="botao primario" type="submit" disabled={enviando || codigo.length !== 5 || pin.length !== 6}>
        Abrir painel
      </button>
    </form>
  );
}
