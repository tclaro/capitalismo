/**
 * `/admin`: administração do servidor, só no próprio computador servidor (localhost). Lista,
 * encerra e exclui as salas de todos os professores; define ou troca a chave de professor.
 */
import type { ListaDoAdmin } from "@simulador/compartilhado";
import { KeyRound, Server } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { api } from "../cliente/api";
import { Aviso, BotaoConfirmar, Cabecalho, Carregando, Secao } from "../componentes/base";

const STATUS = { preparacao: "em preparação", rodando: "rodando", pausada: "pausada", encerrada: "encerrada" } as const;

export function TelaAdmin() {
  const [lista, setLista] = useState<ListaDoAdmin | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [negado, setNegado] = useState(false);

  const carregar = useCallback(async () => {
    const r = await api.admin.salas();
    if (r.status === 403) setNegado(true);
    else if (r.corpo.ok) {
      setLista(r.corpo);
      setErro(null);
    } else setErro(r.corpo.motivo);
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function acao(p: Promise<{ corpo: { ok: boolean; motivo?: string } }>) {
    const r = await p;
    if (!r.corpo.ok) setErro(r.corpo.motivo ?? "falhou");
    await carregar();
  }

  if (negado) {
    return (
      <>
        <Cabecalho />
        <main className="conteudo estreito pilha">
          <h1>Administração</h1>
          <Aviso tipo="alerta">A administração só abre no próprio computador servidor, pelo endereço http://localhost.</Aviso>
        </main>
      </>
    );
  }

  return (
    <>
      <Cabecalho />
      <main className="conteudo pilha">
        <h1>Administração do servidor</h1>
        {erro && <Aviso tipo="erro">{erro}</Aviso>}
        {!lista ? (
          <Carregando />
        ) : (
          <>
            <ChaveDeProfessor definida={lista.chaveDefinida} aoMudar={() => void carregar()} />
            <Secao titulo="Salas" icone={<Server aria-hidden size={20} />} acoes={<button type="button" className="botao" onClick={() => void carregar()}>Atualizar</button>}>
              {lista.salas.length === 0 ? (
                <p className="texto-2" style={{ margin: 0 }}>
                  Nenhuma sala.
                </p>
              ) : (
                <div className="tabela-rolagem">
                  <table className="tabela">
                    <thead>
                      <tr>
                        <th scope="col">Código</th>
                        <th scope="col">Situação</th>
                        <th scope="col">Cenário</th>
                        <th scope="col" className="num">
                          Dia
                        </th>
                        <th scope="col" className="num">
                          Alunos
                        </th>
                        <th scope="col" className="num">
                          Conexões
                        </th>
                        <th scope="col">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lista.salas.map((s) => (
                        <tr key={s.id}>
                          <td className="codigo-sala">{s.codigo}</td>
                          <td>{STATUS[s.status]}</td>
                          <td>{s.presetId}</td>
                          <td className="num">{s.tick}</td>
                          <td className="num">{s.membros}</td>
                          <td className="num">{s.conexoes}</td>
                          <td>
                            <span className="linha">
                              {s.status !== "encerrada" && (
                                <BotaoConfirmar confirmar={`Encerrar ${s.codigo}?`} aoConfirmar={() => void acao(api.admin.encerrar(s.codigo))}>
                                  Encerrar
                                </BotaoConfirmar>
                              )}
                              <BotaoConfirmar perigo confirmar={`Excluir ${s.codigo} e todos os dados dela?`} aoConfirmar={() => void acao(api.admin.excluir(s.codigo))}>
                                Excluir
                              </BotaoConfirmar>
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Secao>
          </>
        )}
      </main>
    </>
  );
}

function ChaveDeProfessor({ definida, aoMudar }: { definida: boolean; aoMudar: () => void }) {
  const [chave, setChave] = useState("");
  const [repetida, setRepetida] = useState("");
  const [mensagem, setMensagem] = useState<{ tipo: "erro" | "sucesso"; texto: string } | null>(null);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (chave !== repetida) return setMensagem({ tipo: "erro", texto: "As duas chaves não conferem." });
    const r = await api.admin.definirChave(chave);
    if (!r.corpo.ok) return setMensagem({ tipo: "erro", texto: r.corpo.motivo });
    setChave("");
    setRepetida("");
    setMensagem({ tipo: "sucesso", texto: "Chave de professor salva. As salas existentes não são afetadas." });
    aoMudar();
  }

  return (
    <Secao titulo="Chave de professor" icone={<KeyRound aria-hidden size={20} />}>
      {!definida && <Aviso tipo="alerta">Ainda não há chave: nenhum professor consegue criar salas.</Aviso>}
      <form className="pilha" onSubmit={salvar} style={{ maxWidth: "24rem" }}>
        <div className="campo">
          <label htmlFor="nova-chave">{definida ? "Nova chave" : "Chave"} (mínimo 8 caracteres)</label>
          <input id="nova-chave" type="password" autoComplete="new-password" minLength={8} maxLength={200} required value={chave} onChange={(e) => setChave(e.target.value)} />
        </div>
        <div className="campo">
          <label htmlFor="repetir-chave">Repita a chave</label>
          <input id="repetir-chave" type="password" autoComplete="new-password" required value={repetida} onChange={(e) => setRepetida(e.target.value)} />
        </div>
        {mensagem && <Aviso tipo={mensagem.tipo}>{mensagem.texto}</Aviso>}
        <button type="submit" className="botao primario" disabled={chave.length < 8}>
          {definida ? "Trocar chave" : "Definir chave"}
        </button>
      </form>
    </Secao>
  );
}
