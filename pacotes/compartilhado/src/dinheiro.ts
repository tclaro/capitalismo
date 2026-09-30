/**
 * Dinheiro na interface: conversão entre centavos inteiros (o motor) e texto em reais (o aluno).
 *
 * Tudo por manipulação de texto, sem ponto flutuante: "0,1 + 0,2" nunca vira 0,30000000000000004.
 */

const MAXIMO_CENTAVOS = 1e15; // R$ 10 trilhões: muito além de qualquer partida

/** 123456 → "R$ 1.234,56"; -5 → "-R$ 0,05". */
export function formatarReais(centavos: number, opcoes: { simbolo?: boolean } = {}): string {
  if (!Number.isInteger(centavos)) throw new RangeError(`formatarReais: centavos deve ser inteiro (recebido ${centavos})`);
  const negativo = centavos < 0;
  const absoluto = String(Math.abs(centavos)).padStart(3, "0");
  const inteiro = absoluto.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const texto = `${inteiro},${absoluto.slice(-2)}`;
  const comSimbolo = opcoes.simbolo === false ? texto : `R$ ${texto}`;
  return negativo ? `-${comSimbolo}` : comSimbolo;
}

/**
 * Lê um valor em reais digitado pelo aluno e devolve centavos inteiros, ou `null` se o texto não for
 * um valor válido. Aceita "R$", espaços, separador de milhar "." e decimal "," (padrão brasileiro).
 * Sem vírgula, um ponto seguido de 1 ou 2 dígitos é lido como decimal ("12.5" = R$ 12,50); pontos
 * em grupos de 3 dígitos são milhar ("1.234" = R$ 1.234,00). Mais de 2 casas decimais é inválido.
 */
export function lerReais(texto: string): number | null {
  // Sinal antes do símbolo: formatarReais escreve "-R$ 0,05", e o aluno pode digitar "R$ -0,05".
  let s = texto.replace(/\s+/g, "");
  let negativo = false;
  if (s.startsWith("-")) {
    negativo = true;
    s = s.slice(1);
  }
  s = s.replace(/^R\$/i, "");
  if (!negativo && s.startsWith("-")) {
    negativo = true;
    s = s.slice(1);
  }
  if (s.length === 0) return null;
  let inteiro: string;
  let decimal = "";
  if (s.includes(",")) {
    const partes = s.split(",");
    if (partes.length !== 2) return null;
    [inteiro, decimal] = partes as [string, string];
    if (inteiro.includes(".")) {
      if (!/^\d{1,3}(\.\d{3})+$/.test(inteiro)) return null;
      inteiro = inteiro.replaceAll(".", "");
    }
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    inteiro = s.replaceAll(".", "");
  } else if (/^\d+\.\d{1,2}$/.test(s)) {
    [inteiro, decimal] = s.split(".") as [string, string];
  } else {
    inteiro = s;
  }
  if (inteiro === "") inteiro = "0";
  if (!/^\d+$/.test(inteiro) || !/^\d{0,2}$/.test(decimal)) return null;
  const centavos = Number(inteiro) * 100 + Number(decimal.padEnd(2, "0"));
  if (!Number.isSafeInteger(centavos) || centavos > MAXIMO_CENTAVOS) return null;
  return negativo ? -centavos : centavos;
}
