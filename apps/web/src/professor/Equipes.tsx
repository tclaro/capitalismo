/**
 * Equipes por mercado: vagas livres, equipes formadas pelos alunos, robôs e vagas inativas; quem
 * está conectado e pronto; renomear equipe e mover aluno.
 */
import { TAMANHO_MAXIMO_NOME, type VisaoProfessor } from "@simulador/compartilhado";
import { Bot, CircleCheck, CircleDashed, Pencil, Users, Wifi, WifiOff } from "lucide-react";
import { type FormEvent, useState } from "react";
import type { ConexaoSala } from "../cliente/conexao";
import { useComando } from "../cliente/useComando";
import { Aviso, CorEquipe, Secao } from "../componentes/base";
import { nomeDaEstrategia } from "./regras";

type Props = { visao: VisaoProfessor; conexao: ConexaoSala<VisaoProfessor> | null };
type Empresa = VisaoProfessor["empresas"][number];

export function EquipesDaSala({ visao, conexao }: Props) {
  const { executar, enviando, erro } = useComando(conexao);
  const vagaDe = new Map(visao.vagas.map((v) => [v.empresa, v]));
  const humanas = visao.empresas.filter((e) => vagaDe.get(e.empresa)?.equipe && !e.robo && !e.inativa);
  const emPreparacao = visao.relogio.status === "preparacao";
  const livres = visao.vagas.filter((v) => !v.equipe && !v.robo && !v.inativa).length;
  const alunos = visao.empresas.reduce((n, e) => n + e.membros.length, 0);
  const conectados = visao.empresas.reduce((n, e) => n + e.membros.filter((m) => m.conectado).length, 0);

  return (
    <Secao titulo="Equipes" icone={<Users aria-hidden size={20} />}>
      <p className="texto-2" style={{ margin: 0 }}>
        {humanas.length} equipe(s) de alunos · {alunos} aluno(s), {conectados} conectado(s)
        {emPreparacao && livres > 0 ? ` · ${livres} vaga(s) livre(s)` : ""}
      </p>
      {emPreparacao && livres > 0 && (
        <p className="pequeno texto-2" style={{ margin: 0 }}>
          Ao iniciar, as vagas livres {visao.robosNasVagasVazias ? `viram robôs (${nomeDaEstrategia(visao.robosNasVagasVazias)})` : "ficam inativas (fora do jogo)"}.
        </p>
      )}
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {visao.sala.mercados.map((m) => (
        <div key={m.id} className="pilha">
          {visao.sala.mercados.length > 1 && <h3>{m.nome}</h3>}
          <div className="tabela-rolagem">
            <table className="tabela">
              <thead>
                <tr>
                  <th scope="col">Equipe</th>
                  <th scope="col">Alunos</th>
                  <th scope="col">Situação</th>
                </tr>
              </thead>
              <tbody>
                {visao.empresas
                  .filter((e) => e.mercado === m.id)
                  .map((e) => (
                    <LinhaEquipe key={e.empresa} empresa={e} livre={!vagaDe.get(e.empresa)?.equipe && !e.robo && !e.inativa} destinos={humanas} enviando={enviando} executar={executar} />
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </Secao>
  );
}

function LinhaEquipe({ empresa: e, livre, destinos, enviando, executar }: { empresa: Empresa; livre: boolean; destinos: Empresa[]; enviando: boolean; executar: ReturnType<typeof useComando>["executar"] }) {
  const [editando, setEditando] = useState(false);
  const [nome, setNome] = useState(e.nome);

  async function renomear(ev: FormEvent) {
    ev.preventDefault();
    if (await executar({ tipo: "renomearEquipe", empresa: e.empresa, nome })) setEditando(false);
  }

  let equipe;
  if (livre) equipe = <span className="texto-2">Vaga livre</span>;
  else if (e.robo)
    equipe = (
      <span className="linha">
        <Bot aria-hidden size={16} /> {e.nome} <span className="selo">robô</span>
      </span>
    );
  else if (e.inativa) equipe = <span className="texto-2">{e.nome} (inativa)</span>;
  else if (editando)
    equipe = (
      <form className="linha" onSubmit={renomear} aria-label={`Renomear ${e.nome}`}>
        <input aria-label="Novo nome da equipe" maxLength={TAMANHO_MAXIMO_NOME} required value={nome} onChange={(x) => setNome(x.target.value)} />
        <button type="submit" className="botao primario" disabled={enviando}>
          Salvar
        </button>
        <button
          type="button"
          className="botao"
          onClick={() => {
            setEditando(false);
            setNome(e.nome);
          }}
        >
          Cancelar
        </button>
      </form>
    );
  else
    equipe = (
      <span className="linha">
        <CorEquipe cor={e.cor} nome={e.nome} />
        <button type="button" className="botao" aria-label={`Renomear ${e.nome}`} title="Renomear" onClick={() => setEditando(true)} style={{ minHeight: "2rem", padding: "0 0.5rem" }}>
          <Pencil aria-hidden size={14} />
        </button>
      </span>
    );

  return (
    <tr>
      <td>{equipe}</td>
      <td>
        {e.membros.length === 0 ? (
          <span className="texto-2">—</span>
        ) : (
          <ul className="lista-simples" style={{ listStyle: "none", padding: 0 }}>
            {e.membros.map((m) => (
              <li key={m.id} className="linha" style={{ gap: "0.5rem" }}>
                <span className={m.conectado ? "positivo" : "texto-2"} title={m.conectado ? "conectado" : "desconectado"}>
                  {m.conectado ? <Wifi aria-hidden size={14} /> : <WifiOff aria-hidden size={14} />}
                </span>
                <span>
                  {m.nome}
                  <span className="sr-only">{m.conectado ? " (conectado)" : " (desconectado)"}</span>
                </span>
                {destinos.length > 1 && (
                  <select
                    aria-label={`Mover ${m.nome} para outra equipe`}
                    value=""
                    disabled={enviando}
                    onChange={(x) => {
                      if (x.target.value) void executar({ tipo: "moverAluno", membro: m.id, empresa: x.target.value });
                    }}
                  >
                    <option value="">Mover para…</option>
                    {destinos
                      .filter((d) => d.empresa !== e.empresa)
                      .map((d) => (
                        <option key={d.empresa} value={d.empresa}>
                          {d.nome}
                        </option>
                      ))}
                  </select>
                )}
              </li>
            ))}
          </ul>
        )}
      </td>
      <td>
        {!livre && !e.robo && !e.inativa && (
          <span className="linha">
            {e.pronto ? (
              <span className="selo sucesso">
                <CircleCheck aria-hidden size={12} /> pronta
              </span>
            ) : (
              <span className="selo">
                <CircleDashed aria-hidden size={12} /> decidindo
              </span>
            )}
            {e.pendentes > 0 && <span className="selo alerta">{e.pendentes} decisão(ões) na fila</span>}
          </span>
        )}
      </td>
    </tr>
  );
}
