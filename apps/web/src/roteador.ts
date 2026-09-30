/**
 * Roteador mínimo (sem biblioteca): rotas como dados, com `rotaDe` e `caminhoDe` puros (testados)
 * e o histórico do navegador ligado por `useSyncExternalStore`.
 *
 * Rotas:
 * - `/`                     entrada do aluno (`?codigo=` preenche o código)
 * - `/s/<código>`           aluno na sala
 * - `/professor`            criar sala ou reabrir (código + PIN)
 * - `/professor/<código>`   painel do professor
 * - `/telao/<código>?t=`    telão (somente leitura)
 * - `/admin`                administração (só no computador servidor)
 */
import { useSyncExternalStore } from "react";

export type Rota =
  | { tela: "entrada"; codigo: string | null }
  | { tela: "aluno"; codigo: string }
  | { tela: "professor"; codigo: string | null }
  | { tela: "telao"; codigo: string; token: string | null }
  | { tela: "admin" }
  | { tela: "nao-encontrada" };

const CODIGO = /^[A-Za-z0-9]{5}$/;
const codigoOuNull = (s: string | null | undefined) => (s && CODIGO.test(s) ? s.toUpperCase() : null);

export function rotaDe(caminho: string, busca = ""): Rota {
  const partes = caminho.split("/").filter(Boolean).map(decodeURIComponent);
  const params = new URLSearchParams(busca);
  const [a, b, ...resto] = partes;
  if (resto.length > 0) return { tela: "nao-encontrada" };
  if (a === undefined) return { tela: "entrada", codigo: codigoOuNull(params.get("codigo")) };
  if (a === "admin" && b === undefined) return { tela: "admin" };
  if (a === "professor") {
    if (b === undefined) return { tela: "professor", codigo: null };
    const codigo = codigoOuNull(b);
    return codigo ? { tela: "professor", codigo } : { tela: "nao-encontrada" };
  }
  const codigo = codigoOuNull(b);
  if (a === "s" && codigo) return { tela: "aluno", codigo };
  if (a === "telao" && codigo) return { tela: "telao", codigo, token: params.get("t") };
  return { tela: "nao-encontrada" };
}

export function caminhoDe(rota: Rota): string {
  switch (rota.tela) {
    case "entrada":
      return rota.codigo ? `/?codigo=${rota.codigo}` : "/";
    case "aluno":
      return `/s/${rota.codigo}`;
    case "professor":
      return rota.codigo ? `/professor/${rota.codigo}` : "/professor";
    case "telao":
      return rota.token ? `/telao/${rota.codigo}?t=${encodeURIComponent(rota.token)}` : `/telao/${rota.codigo}`;
    case "admin":
      return "/admin";
    case "nao-encontrada":
      return "/";
  }
}

// ---------------------------------------------------------------------------------------------
// Ligação com o navegador
// ---------------------------------------------------------------------------------------------

const ouvintes = new Set<() => void>();
const avisar = () => {
  for (const f of ouvintes) f();
};

function assinar(f: () => void): () => void {
  ouvintes.add(f);
  if (ouvintes.size === 1) window.addEventListener("popstate", avisar);
  return () => {
    ouvintes.delete(f);
    if (ouvintes.size === 0) window.removeEventListener("popstate", avisar);
  };
}

const local = () => window.location.pathname + window.location.search;

export function navegar(destino: Rota | string, opcoes: { substituir?: boolean } = {}): void {
  const caminho = typeof destino === "string" ? destino : caminhoDe(destino);
  if (caminho === local()) return;
  if (opcoes.substituir) window.history.replaceState(null, "", caminho);
  else window.history.pushState(null, "", caminho);
  avisar();
}

export function useRota(): Rota {
  const atual = useSyncExternalStore(assinar, local);
  const i = atual.indexOf("?");
  return i < 0 ? rotaDe(atual) : rotaDe(atual.slice(0, i), atual.slice(i));
}
