/**
 * Identidade das equipes (seção 8.1): nome e cor escolhidos pelos alunos.
 *
 * Paleta de 8 cores baseada em Okabe-Ito (segura para daltonismo) mais duas complementares; a
 * interface sempre mostra o nome junto da cor, nunca só a cor.
 */

export const PALETA_EQUIPES = [
  { id: "laranja", nome: "Laranja", hex: "#E69F00" },
  { id: "azul-ceu", nome: "Azul-céu", hex: "#56B4E9" },
  { id: "verde", nome: "Verde", hex: "#009E73" },
  { id: "amarelo", nome: "Amarelo", hex: "#F0E442" },
  { id: "azul", nome: "Azul", hex: "#0072B2" },
  { id: "vermelho", nome: "Vermelho", hex: "#D55E00" },
  { id: "rosa", nome: "Rosa", hex: "#CC79A7" },
  { id: "cinza", nome: "Cinza", hex: "#6B6B6B" },
] as const;

export type CorEquipe = (typeof PALETA_EQUIPES)[number]["id"];

export const IDS_CORES: readonly string[] = PALETA_EQUIPES.map((c) => c.id);

export const TAMANHO_MAXIMO_NOME = 24;

/**
 * Normaliza um nome digitado (equipe ou aluno): tira espaços extras e caracteres de controle.
 * Devolve `null` se ficar vazio, passar do tamanho ou tiver caracteres fora de letras, números,
 * espaço e pontuação simples.
 */
export function normalizarNome(texto: string): string | null {
  const s = texto
    .normalize("NFC")
    .replace(/[\p{Cc}\p{Cf}]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  if (s.length === 0 || [...s].length > TAMANHO_MAXIMO_NOME) return null;
  if (!/^[\p{L}\p{N} .,'!?&()-]+$/u.test(s)) return null;
  return s;
}

/** Chave de comparação de nomes (sem caixa nem acentos): "Equipe Ágil" ≡ "equipe agil". */
export function chaveDeNome(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("pt-BR");
}
