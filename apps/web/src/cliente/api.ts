/**
 * Cliente HTTP do servidor. Nunca lança exceção: falha de rede vira `status: 0` com motivo legível.
 */
import type {
  AlunoEntrou,
  ConfigSalaEntrada,
  EntrarAluno,
  InfoPublicaSala,
  InfoServidor,
  ListaDoAdmin,
  RespostaErro,
  SalaCriada,
  SessaoNaSala,
} from "@simulador/compartilhado";

export type RespostaApi<T> = ({ ok: true } & T) | RespostaErro;

export interface Resultado<T> {
  status: number;
  corpo: RespostaApi<T>;
}

export type Buscar = (entrada: string, init?: RequestInit) => Promise<Response>;

/** Faz o pedido; `buscar` é injetável para testes. */
export async function pedir<T>(caminho: string, opcoes: { metodo?: string; corpo?: unknown; buscar?: Buscar } = {}): Promise<Resultado<T>> {
  const buscar = opcoes.buscar ?? ((e, i) => fetch(e, i));
  let res: Response;
  try {
    res = await buscar(caminho, {
      method: opcoes.metodo ?? (opcoes.corpo === undefined ? "GET" : "POST"),
      credentials: "same-origin",
      headers: opcoes.corpo === undefined ? {} : { "Content-Type": "application/json" },
      ...(opcoes.corpo === undefined ? {} : { body: JSON.stringify(opcoes.corpo) }),
    });
  } catch {
    return { status: 0, corpo: { ok: false, motivo: "sem conexão com o servidor" } };
  }
  let corpo: unknown;
  try {
    corpo = await res.json();
  } catch {
    return { status: res.status, corpo: { ok: false, motivo: `resposta inesperada do servidor (${res.status})` } };
  }
  if (!res.ok) {
    const motivo = (corpo as { motivo?: unknown })?.motivo;
    return { status: res.status, corpo: { ...(corpo as object), ok: false, motivo: typeof motivo === "string" ? motivo : `erro ${res.status}` } };
  }
  // Respostas de sucesso sem `ok` (ex.: informação pública) ganham `ok: true`.
  return { status: res.status, corpo: { ok: true, ...(corpo as object) } as RespostaApi<T> };
}

const sala = (codigo: string) => `/api/salas/${encodeURIComponent(codigo)}`;

export const api = {
  servidor: () => pedir<InfoServidor>("/api/servidor"),
  infoSala: (codigo: string) => pedir<InfoPublicaSala>(sala(codigo)),
  sessao: (codigo: string) => pedir<SessaoNaSala>(`${sala(codigo)}/sessao`),
  criarSala: (chave: string, config: ConfigSalaEntrada) => pedir<SalaCriada>("/api/salas", { corpo: { chave, config } }),
  entrarProfessor: (codigo: string, pin: string) => pedir<{ codigo: string }>("/api/professor/entrar", { corpo: { codigo, pin } }),
  entrarAluno: (corpo: EntrarAluno) => pedir<AlunoEntrou>("/api/alunos/entrar", { corpo }),
  sair: (codigo: string) => pedir<object>(`${sala(codigo)}/sair`, { corpo: {} }),
  novoPin: (codigo: string) => pedir<{ pin: string }>(`${sala(codigo)}/pin`, { corpo: {} }),
  revogarTelao: (codigo: string) => pedir<{ linkTelao: string }>(`${sala(codigo)}/telao/revogar`, { corpo: {} }),
  conferirTelao: (codigo: string, token: string) => pedir<object>(`${sala(codigo)}/telao?t=${encodeURIComponent(token)}`),
  admin: {
    salas: () => pedir<ListaDoAdmin>("/api/admin/salas"),
    definirChave: (chave: string) => pedir<object>("/api/admin/chave", { corpo: { chave } }),
    encerrar: (codigo: string) => pedir<object>(`/api/admin/salas/${encodeURIComponent(codigo)}/encerrar`, { corpo: {} }),
    excluir: (codigo: string) => pedir<object>(`/api/admin/salas/${encodeURIComponent(codigo)}`, { metodo: "DELETE" }),
  },
};
