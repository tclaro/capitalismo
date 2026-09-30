/**
 * Diagnóstico de rede (seção 9.5): endereços do servidor e os testes de conexão feitos pelos
 * alunos na página /teste. Atualiza a cada 5 s enquanto aberto.
 */
import type { Diagnostico } from "@simulador/compartilhado";
import { Network } from "lucide-react";
import { useEffect, useState } from "react";
import { pedir } from "../cliente/api";
import { Aviso, Secao } from "../componentes/base";
import { formatarHora, formatarNumero } from "../formato";

const INTERVALO_MS = 5000;

export function DiagnosticoDeRede({ codigo }: { codigo: string }) {
  const [aberto, setAberto] = useState(false);
  const [dados, setDados] = useState<Diagnostico | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!aberto) return;
    let vivo = true;
    const buscar = async () => {
      const r = await pedir<Diagnostico>(`/api/salas/${codigo}/diagnostico`);
      if (!vivo) return;
      if (r.corpo.ok) {
        setDados(r.corpo);
        setErro(null);
      } else setErro(r.corpo.motivo);
    };
    void buscar();
    const t = setInterval(() => void buscar(), INTERVALO_MS);
    return () => {
      vivo = false;
      clearInterval(t);
    };
  }, [aberto, codigo]);

  const paginaTeste = `${dados?.enderecos[0] ?? window.location.origin}/teste`;

  return (
    <Secao titulo="Diagnóstico de rede" icone={<Network aria-hidden size={20} />}>
      <details open={aberto} onToggle={(e) => setAberto((e.target as HTMLDetailsElement).open)}>
        <summary>Mostrar endereços e testes de conexão dos alunos</summary>
        <div className="pilha" style={{ marginTop: "0.75rem" }}>
          {erro && <Aviso tipo="erro">{erro}</Aviso>}
          {dados && (
            <>
              <p style={{ margin: 0 }}>
                Servidor {dados.versao}, porta {dados.porta}. Endereços desta máquina:
              </p>
              <ul className="lista-simples">
                {dados.enderecos.length === 0 ? <li>nenhum endereço de rede encontrado (só localhost)</li> : dados.enderecos.map((e) => <li key={e} className="selecionavel">{e}</li>)}
              </ul>
              <p style={{ margin: 0 }}>
                Para testar um computador do laboratório, abra nele <span className="selecionavel">{paginaTeste}</span>. O resultado aparece aqui.
              </p>
              <p className="pequeno texto-2" style={{ margin: 0 }}>
                Se a página não abrir em nenhum computador, a porta {dados.porta} provavelmente está bloqueada no firewall do servidor: veja o guia para a TI.
              </p>
              {dados.testes.length > 0 ? (
                <div className="tabela-rolagem">
                  <table className="tabela">
                    <thead>
                      <tr>
                        <th scope="col">Hora</th>
                        <th scope="col">Computador</th>
                        <th scope="col">IP</th>
                        <th scope="col">HTTP</th>
                        <th scope="col">WebSocket</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dados.testes.map((t, i) => (
                        <tr key={`${t.quando}-${i}`}>
                          <td>{formatarHora(t.quando)}</td>
                          <td>{t.maquina}</td>
                          <td className="selecionavel">{t.ip}</td>
                          <td className={t.http.ok ? "positivo" : "negativo"}>
                            {t.http.ok ? "ok" : "falhou"}
                            {t.http.mediaMs !== null && ` · média ${formatarNumero(t.http.mediaMs, 1)} ms`}
                          </td>
                          <td className={t.ws.ok ? "positivo" : "negativo"}>
                            {t.ws.ok ? `ok${t.ws.ms !== null ? ` · ${formatarNumero(t.ws.ms, 1)} ms` : ""}` : `falhou${t.ws.erro ? `: ${t.ws.erro}` : ""}`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="texto-2" style={{ margin: 0 }}>
                  Nenhum teste recebido ainda.
                </p>
              )}
            </>
          )}
        </div>
      </details>
    </Secao>
  );
}
