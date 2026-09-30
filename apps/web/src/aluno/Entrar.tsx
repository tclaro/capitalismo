/**
 * Entrada do aluno na sala: nome/apelido e equipe. Entra numa equipe existente ou, antes do
 * início, cria a equipe numa vaga livre (nome + cor da paleta acessível). Voltar com o mesmo nome
 * na mesma equipe recupera o acesso.
 */
import { type InfoPublicaSala, TAMANHO_MAXIMO_NOME, type VagaPublica } from "@simulador/compartilhado";
import { Plus, Users } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { api } from "../cliente/api";
import { Aviso, Carregando, CorEquipe } from "../componentes/base";
import { coresLivres } from "./regras";

type Escolha = { tipo: "existente"; empresa: string } | { tipo: "nova"; empresa: string };

export function EntrarNaSala({ codigo, aoEntrar }: { codigo: string; aoEntrar: () => void }) {
  const [info, setInfo] = useState<InfoPublicaSala | null>(null);
  const [erroInfo, setErroInfo] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [escolha, setEscolha] = useState<Escolha | null>(null);
  const [nomeEquipe, setNomeEquipe] = useState("");
  const [cor, setCor] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const carregar = () =>
    void api.infoSala(codigo).then((r) => {
      if (r.corpo.ok) setInfo(r.corpo);
      else setErroInfo(r.status === 404 ? "Não há sala com esse código. Confira no telão." : r.corpo.motivo);
    });
  useEffect(carregar, [codigo]);

  if (erroInfo) return <Aviso tipo="erro">{erroInfo}</Aviso>;
  if (!info) return <Carregando />;

  const preparacao = info.relogio.status === "preparacao";
  const encerrada = info.relogio.status === "encerrada";
  const nomeMercado = new Map(info.sala.mercados.map((m) => [m.id, m.nome]));
  const variosMercados = info.sala.mercados.length > 1;
  const existentes = info.vagas.filter((v) => v.equipe && !v.robo);
  const livres = preparacao ? info.vagas.filter((v) => !v.equipe && !v.robo && !v.inativa) : [];
  const vagaNova = escolha?.tipo === "nova" ? info.vagas.find((v) => v.empresa === escolha.empresa) : undefined;
  const cores = vagaNova ? coresLivres(info.vagas, vagaNova) : [];

  async function entrar(e: FormEvent) {
    e.preventDefault();
    if (!escolha) return;
    setErro(null);
    setEnviando(true);
    const r = await api.entrarAluno({
      codigo,
      nome: nome.trim(),
      equipe: escolha.tipo === "existente" ? escolha : { tipo: "nova", empresa: escolha.empresa, nome: nomeEquipe.trim(), cor: cor ?? "" },
    });
    setEnviando(false);
    if (r.corpo.ok) aoEntrar();
    else {
      setErro(r.corpo.motivo);
      // A situação das vagas pode ter mudado (outra equipe pegou a vaga ou a cor).
      carregar();
    }
  }

  const rotuloVaga = (v: VagaPublica) => (variosMercados ? ` · ${nomeMercado.get(v.mercado)}` : "");
  const pronto = nome.trim() !== "" && escolha !== null && (escolha.tipo === "existente" || (nomeEquipe.trim() !== "" && cor !== null));

  return (
    <form className="cartao pilha" onSubmit={entrar} style={{ maxWidth: "36rem" }} aria-label="Entrar na sala">
      <h1>Sala {codigo}</h1>
      <p className="texto-2" style={{ margin: 0 }}>
        {info.sala.presetNome}
      </p>
      {encerrada && <Aviso tipo="alerta">Esta partida já foi encerrada.</Aviso>}
      <div className="campo">
        <label htmlFor="nome-aluno">Seu nome ou apelido</label>
        <input id="nome-aluno" required maxLength={TAMANHO_MAXIMO_NOME} autoComplete="nickname" value={nome} onChange={(e) => setNome(e.target.value)} />
        <span className="pequeno texto-2">Para voltar depois (ou em outro computador), use o mesmo nome e a mesma equipe.</span>
      </div>

      <fieldset className="pilha" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend style={{ fontWeight: 550, marginBottom: "0.5rem" }}>Equipe</legend>
        {existentes.length === 0 && livres.length === 0 && <p className="texto-2">Nenhuma equipe disponível nesta sala.</p>}
        {existentes.map((v) => (
          <label key={v.empresa} className="campo-linha">
            <input type="radio" name="equipe" checked={escolha?.tipo === "existente" && escolha.empresa === v.empresa} onChange={() => setEscolha({ tipo: "existente", empresa: v.empresa })} />
            <Users aria-hidden size={16} />
            <CorEquipe cor={v.equipe!.cor} nome={v.equipe!.nome} />
            <span className="pequeno texto-2">
              {v.membros} aluno(s){rotuloVaga(v)}
            </span>
          </label>
        ))}
        {livres.length > 0 && (
          <label className="campo-linha">
            <input
              type="radio"
              name="equipe"
              checked={escolha?.tipo === "nova"}
              onChange={() => {
                setEscolha({ tipo: "nova", empresa: livres[0]!.empresa });
                setCor(null);
              }}
            />
            <Plus aria-hidden size={16} /> Criar uma equipe nova ({livres.length} vaga(s) livre(s))
          </label>
        )}
        {!preparacao && !encerrada && <p className="pequeno texto-2">A partida já começou: só dá para entrar numa equipe existente.</p>}
      </fieldset>

      {escolha?.tipo === "nova" && (
        <div className="pilha" style={{ paddingLeft: "1.5rem" }}>
          {variosMercados && (
            <div className="campo">
              <label htmlFor="vaga-nova">Mercado</label>
              <select
                id="vaga-nova"
                value={escolha.empresa}
                onChange={(e) => {
                  setEscolha({ tipo: "nova", empresa: e.target.value });
                  setCor(null);
                }}
              >
                {livres.map((v) => (
                  <option key={v.empresa} value={v.empresa}>
                    {nomeMercado.get(v.mercado)}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="campo">
            <label htmlFor="nome-equipe">Nome da equipe</label>
            <input id="nome-equipe" required maxLength={TAMANHO_MAXIMO_NOME} autoComplete="off" value={nomeEquipe} onChange={(e) => setNomeEquipe(e.target.value)} />
          </div>
          <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="pequeno" style={{ fontWeight: 550, marginBottom: "0.5rem" }}>
              Cor da equipe
            </legend>
            <div className="escolha-cor">
              {cores.map((c) => (
                <label key={c.id}>
                  <input type="radio" name="cor" className="sr-only" checked={cor === c.id} onChange={() => setCor(c.id)} />
                  <span className="amostra-legenda amostra" style={{ background: c.hex, border: "1px solid var(--cor-texto)" }} aria-hidden />
                  {c.nome}
                </label>
              ))}
            </div>
          </fieldset>
        </div>
      )}

      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      <button type="submit" className="botao primario" disabled={!pronto || enviando || encerrada}>
        {enviando ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
