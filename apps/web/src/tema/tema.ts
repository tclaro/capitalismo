/**
 * Escolha do tema (claro, escuro ou o do sistema), lembrada no navegador. O CSS faz o resto
 * (tokens.css): sem `data-tema`, vale a preferência do sistema.
 */
export type EscolhaDeTema = "sistema" | "claro" | "escuro";

const CHAVE = "simulador:tema";

export function temaSalvo(): EscolhaDeTema {
  try {
    const v = localStorage.getItem(CHAVE);
    return v === "claro" || v === "escuro" ? v : "sistema";
  } catch {
    return "sistema";
  }
}

export function aplicarTema(escolha: EscolhaDeTema): void {
  const raiz = document.documentElement;
  if (escolha === "sistema") delete raiz.dataset.tema;
  else raiz.dataset.tema = escolha;
  try {
    if (escolha === "sistema") localStorage.removeItem(CHAVE);
    else localStorage.setItem(CHAVE, escolha);
  } catch {
    // Navegador sem armazenamento (modo privado restrito): o tema vale só nesta página.
  }
}

export function proximoTema(atual: EscolhaDeTema): EscolhaDeTema {
  return atual === "sistema" ? "claro" : atual === "claro" ? "escuro" : "sistema";
}
