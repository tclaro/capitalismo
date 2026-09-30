/**
 * Acesso às salas (seção 9.6): chave de professor, PIN por sala, token do telão, sessões de cookie e
 * limite de tentativas. Tudo no SQLite, para sobreviver a reinícios.
 *
 * - Chave de professor: uma só, compartilhada (decisão 24), guardada com `Bun.password` (argon2id).
 * - PIN: 6 dígitos por sala, guardado com `Bun.password`; só é mostrado na criação ou ao gerar outro.
 * - Token do telão: 32 bytes aleatórios, somente leitura, revogável; guardado em claro.
 * - Sessão: token de 32 bytes no cookie; no banco fica só o SHA-256.
 */
import type { Database } from "bun:sqlite";

export type PapelComSessao = "aluno" | "professor";

export interface Sessao {
  salaId: string;
  papel: PapelComSessao;
  /** Id do membro (aluno); `null` para o professor. */
  membro: string | null;
}

/** Duração das sessões: um dia letivo com folga. */
export const DURACAO_SESSAO_MS = 16 * 60 * 60 * 1000;

const CHAVE_PROFESSOR = "chave_professor";

export function tokenAleatorio(bytes = 32): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(bytes))).toString("base64url");
}

export function pinAleatorio(): string {
  // Rejeição para não enviesar: 4 294 000 000 é múltiplo de 1 000 000.
  const limite = 4_294_000_000;
  for (;;) {
    const [n] = crypto.getRandomValues(new Uint32Array(1));
    if (n! < limite) return String(n! % 1_000_000).padStart(6, "0");
  }
}

const sha256 = (texto: string) => new Bun.CryptoHasher("sha256").update(texto).digest("hex");

export class Acessos {
  constructor(
    readonly db: Database,
    private readonly agora: () => number = Date.now,
  ) {}

  // -------------------------------------------------------------------------------------------
  // Chave de professor
  // -------------------------------------------------------------------------------------------

  chaveDefinida(): boolean {
    return this.lerConfig(CHAVE_PROFESSOR) !== null;
  }

  async definirChave(chave: string): Promise<void> {
    if (chave.length < 8) throw new Error("a chave precisa ter pelo menos 8 caracteres");
    const hash = await Bun.password.hash(chave);
    this.db.query("INSERT INTO configuracao_servidor (chave, valor) VALUES (?, ?) ON CONFLICT (chave) DO UPDATE SET valor = excluded.valor").run(CHAVE_PROFESSOR, hash);
  }

  async conferirChave(chave: string): Promise<boolean> {
    const hash = this.lerConfig(CHAVE_PROFESSOR);
    if (hash === null) return false;
    return Bun.password.verify(chave, hash);
  }

  private lerConfig(chave: string): string | null {
    const r = this.db.query("SELECT valor FROM configuracao_servidor WHERE chave = ?").get(chave) as { valor: string } | null;
    return r?.valor ?? null;
  }

  // -------------------------------------------------------------------------------------------
  // PIN e token do telão
  // -------------------------------------------------------------------------------------------

  /** Cria os acessos de uma sala nova; devolve o PIN em claro (a única vez que ele existe). */
  async criarAcessos(salaId: string): Promise<{ pin: string; tokenTelao: string }> {
    const pin = pinAleatorio();
    const tokenTelao = tokenAleatorio();
    const hash = await Bun.password.hash(pin);
    this.db.query("INSERT INTO acessos_sala (sala_id, pin_hash, token_telao) VALUES (?, ?, ?)").run(salaId, hash, tokenTelao);
    return { pin, tokenTelao };
  }

  async novoPin(salaId: string): Promise<string> {
    const pin = pinAleatorio();
    this.db.query("UPDATE acessos_sala SET pin_hash = ? WHERE sala_id = ?").run(await Bun.password.hash(pin), salaId);
    return pin;
  }

  async conferirPin(salaId: string, pin: string): Promise<boolean> {
    const r = this.db.query("SELECT pin_hash FROM acessos_sala WHERE sala_id = ?").get(salaId) as { pin_hash: string } | null;
    return r !== null && Bun.password.verify(pin, r.pin_hash);
  }

  tokenTelao(salaId: string): string | null {
    const r = this.db.query("SELECT token_telao FROM acessos_sala WHERE sala_id = ?").get(salaId) as { token_telao: string } | null;
    return r?.token_telao ?? null;
  }

  /** Troca o token do telão: o link antigo deixa de funcionar. */
  revogarTelao(salaId: string): string {
    const token = tokenAleatorio();
    this.db.query("UPDATE acessos_sala SET token_telao = ? WHERE sala_id = ?").run(token, salaId);
    return token;
  }

  conferirTelao(salaId: string, token: string): boolean {
    const atual = this.tokenTelao(salaId);
    return atual !== null && token.length === atual.length && crypto.timingSafeEqual(Buffer.from(token), Buffer.from(atual));
  }

  // -------------------------------------------------------------------------------------------
  // Sessões
  // -------------------------------------------------------------------------------------------

  criarSessao(s: Sessao): string {
    const token = tokenAleatorio();
    const t = this.agora();
    this.db
      .query("INSERT INTO sessoes (token_hash, sala_id, papel, membro, criada_em, expira_em) VALUES (?, ?, ?, ?, ?, ?)")
      .run(sha256(token), s.salaId, s.papel, s.membro, t, t + DURACAO_SESSAO_MS);
    return token;
  }

  sessao(token: string): Sessao | null {
    const r = this.db.query("SELECT sala_id, papel, membro, expira_em FROM sessoes WHERE token_hash = ?").get(sha256(token)) as {
      sala_id: string;
      papel: PapelComSessao;
      membro: string | null;
      expira_em: number;
    } | null;
    if (!r || r.expira_em <= this.agora()) return null;
    return { salaId: r.sala_id, papel: r.papel, membro: r.membro };
  }

  encerrarSessao(token: string): void {
    this.db.query("DELETE FROM sessoes WHERE token_hash = ?").run(sha256(token));
  }

  /** Remove as sessões vencidas (chamado na inicialização). */
  limparSessoesVencidas(): number {
    return this.db.query("DELETE FROM sessoes WHERE expira_em <= ?").run(this.agora()).changes;
  }
}

// ---------------------------------------------------------------------------------------------
// Limite de tentativas
// ---------------------------------------------------------------------------------------------

export interface RegraDeLimite {
  /** Falhas permitidas dentro da janela antes do bloqueio. */
  maxFalhas: number;
  janelaMs: number;
  /** Bloqueio após estourar; dobra a cada novo estouro seguido (até `bloqueioMaxMs`). */
  bloqueioMs: number;
  bloqueioMaxMs: number;
}

/**
 * Janela fixa de falhas por chave (ex.: `pin:ip:10.0.0.5`, `pin:sala:sala_x`). Persistido: reiniciar o
 * servidor não zera o contador de quem tenta adivinhar o PIN.
 */
export class LimiteDeTentativas {
  constructor(
    private readonly db: Database,
    private readonly agora: () => number = Date.now,
  ) {}

  /** `null` se pode tentar; senão, quantos ms faltam para liberar. */
  bloqueio(chave: string): number | null {
    const r = this.linha(chave);
    if (!r) return null;
    const falta = r.bloqueado_ate - this.agora();
    return falta > 0 ? falta : null;
  }

  registrarFalha(chave: string, regra: RegraDeLimite): void {
    const t = this.agora();
    const r = this.linha(chave);
    let falhas = 1;
    let inicio = t;
    let bloqueadoAte = 0;
    if (r && t - r.janela_inicio < regra.janelaMs) {
      falhas = r.falhas + 1;
      inicio = r.janela_inicio;
      bloqueadoAte = r.bloqueado_ate;
    }
    if (falhas > regra.maxFalhas) {
      // Estouros seguidos dobram o bloqueio: 1º = bloqueioMs, 2º = 2×, ...
      const estouros = falhas - regra.maxFalhas;
      bloqueadoAte = t + Math.min(regra.bloqueioMs * 2 ** (estouros - 1), regra.bloqueioMaxMs);
    }
    this.db
      .query(
        `INSERT INTO tentativas (chave, falhas, janela_inicio, bloqueado_ate) VALUES (?, ?, ?, ?)
         ON CONFLICT (chave) DO UPDATE SET falhas = excluded.falhas, janela_inicio = excluded.janela_inicio, bloqueado_ate = excluded.bloqueado_ate`,
      )
      .run(chave, falhas, inicio, bloqueadoAte);
  }

  limpar(chave: string): void {
    this.db.query("DELETE FROM tentativas WHERE chave = ?").run(chave);
  }

  private linha(chave: string) {
    return this.db.query("SELECT falhas, janela_inicio, bloqueado_ate FROM tentativas WHERE chave = ?").get(chave) as {
      falhas: number;
      janela_inicio: number;
      bloqueado_ate: number;
    } | null;
  }
}
