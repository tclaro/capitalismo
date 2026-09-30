/**
 * Como entrar na sala: código e endereço para os alunos, PIN do professor e link do telão.
 */
import type { VisaoProfessor } from "@simulador/compartilhado";
import { KeyRound, MonitorPlay, Users } from "lucide-react";
import { useState } from "react";
import { api } from "../cliente/api";
import { Aviso, BotaoConfirmar, Secao } from "../componentes/base";
import { lembrarPin, pinLembrado } from "./regras";

export function AcessoDaSala({ visao, enderecos }: { visao: VisaoProfessor; enderecos: string[] }) {
  const codigo = visao.sala.codigo;
  const [pin, setPin] = useState(() => pinLembrado(codigo));
  const [erro, setErro] = useState<string | null>(null);
  const base = enderecos[0] ?? window.location.origin;
  const linkTelao = `${base}${visao.linkTelao}`;

  async function gerarPin() {
    setErro(null);
    const r = await api.novoPin(codigo);
    if (!r.corpo.ok) return setErro(r.corpo.motivo);
    lembrarPin(codigo, r.corpo.pin);
    setPin(r.corpo.pin);
  }

  async function revogar() {
    setErro(null);
    const r = await api.revogarTelao(codigo);
    if (!r.corpo.ok) setErro(r.corpo.motivo);
    // O link novo chega também pela atualização da visão.
  }

  return (
    <Secao titulo="Acesso à sala">
      <div className="pilha">
        <h3 className="linha">
          <Users aria-hidden size={18} /> Alunos
        </h3>
        <p style={{ margin: 0 }}>No navegador, abrir:</p>
        {enderecos.length > 0 ? (
          <ul className="lista-simples">
            {enderecos.map((e) => (
              <li key={e} className="selecionavel">
                {e}
              </li>
            ))}
          </ul>
        ) : (
          <p className="selecionavel">{window.location.origin}</p>
        )}
        <p style={{ margin: 0 }}>
          e digitar o código <span className="codigo-grande">{codigo}</span>
        </p>
        {enderecos.length > 1 && <p className="pequeno texto-2">Mais de um endereço: o primeiro costuma ser o da rede do laboratório. Se um não funcionar, tente o outro.</p>}
      </div>

      <div className="pilha">
        <h3 className="linha">
          <KeyRound aria-hidden size={18} /> PIN do professor
        </h3>
        {pin ? (
          <p style={{ margin: 0 }}>
            <span className="codigo-grande">{pin}</span>
          </p>
        ) : (
          <p className="texto-2 pequeno" style={{ margin: 0 }}>
            Por segurança, o PIN só aparece na aba em que foi criado. Se não anotou, gere outro.
          </p>
        )}
        <p className="pequeno texto-2" style={{ margin: 0 }}>
          Com o código e o PIN você reabre este painel em qualquer computador. Anote e não mostre no telão.
        </p>
        <div>
          <BotaoConfirmar confirmar="O PIN atual deixará de valer." aoConfirmar={() => void gerarPin()}>
            Gerar novo PIN
          </BotaoConfirmar>
        </div>
      </div>

      <div className="pilha">
        <h3 className="linha">
          <MonitorPlay aria-hidden size={18} /> Telão (projetor)
        </h3>
        <p className="selecionavel pequeno" style={{ margin: 0 }}>
          {linkTelao}
        </p>
        <div className="linha">
          <a className="botao" href={visao.linkTelao} target="_blank" rel="noreferrer">
            Abrir telão numa nova aba
          </a>
          <BotaoConfirmar confirmar="Os telões abertos serão desconectados." aoConfirmar={() => void revogar()}>
            Trocar link
          </BotaoConfirmar>
        </div>
        <p className="pequeno texto-2" style={{ margin: 0 }}>
          O telão só mostra informação pública. Troque o link se ele for parar em mãos erradas.
        </p>
      </div>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
    </Secao>
  );
}
