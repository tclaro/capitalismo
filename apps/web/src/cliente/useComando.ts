/**
 * Envio de comandos pela conexão com estado para a tela: `enviando` enquanto espera a resposta e
 * `erro` com o motivo da recusa (já traduzido).
 */
import { useCallback, useState } from "react";
import { explicarRecusa } from "../professor/regras";
import type { ComandoSemId, ConexaoSala } from "./conexao";

export function useComando(conexao: ConexaoSala<never> | ConexaoSala | null) {
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const executar = useCallback(
    async (c: ComandoSemId): Promise<boolean> => {
      if (!conexao) return false;
      setEnviando(true);
      setErro(null);
      const r = await conexao.comando(c);
      setEnviando(false);
      if (!r.ok) setErro(explicarRecusa(r.motivo));
      return r.ok;
    },
    [conexao],
  );
  return { executar, enviando, erro, limparErro: () => setErro(null) };
}
