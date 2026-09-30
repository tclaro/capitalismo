/**
 * Log mínimo do servidor. Pouca saída no console: no Windows, selecionar texto no console (QuickEdit)
 * congela o processo enquanto houver escrita pendente.
 */
export type NivelLog = "info" | "aviso" | "erro";
export type Log = (nivel: NivelLog, mensagem: string, detalhe?: unknown) => void;

export const logDoConsole: Log = (nivel, mensagem, detalhe) => {
  const linha = `${new Date().toISOString()} [${nivel}] ${mensagem}`;
  const extra = detalhe instanceof Error ? (detalhe.stack ?? detalhe.message) : detalhe;
  if (nivel === "erro") console.error(linha, extra ?? "");
  else console.log(linha, extra ?? "");
};

export const logSilencioso: Log = () => {};
