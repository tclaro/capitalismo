/**
 * Banco SQLite do servidor (seção 9.7): abertura com WAL, migrações embutidas no executável, backup
 * antes de migrar e escolha da pasta de dados.
 */
import { Database } from "bun:sqlite";
import { accessSync, constants, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import m001 from "./migracoes/001_inicial.sql" with { type: "text" };

/** Migrações em ordem; cada uma roda uma única vez, registrada em `schema_version`. */
export const MIGRACOES: readonly { versao: number; sql: string }[] = [{ versao: 1, sql: m001 }];

export const BACKUPS_MANTIDOS = 5;

/** Abre (ou cria) o banco com as configurações recomendadas e aplica as migrações pendentes. */
export function abrirBanco(caminho: string, opcoes: { backup?: boolean } = {}): Database {
  if (caminho !== ":memory:") mkdirSync(dirname(caminho), { recursive: true });
  const existia = caminho !== ":memory:" && existsSync(caminho);
  const db = new Database(caminho, { create: true, strict: true });
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA synchronous = NORMAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec("PRAGMA busy_timeout = 5000;");
  if (existia && opcoes.backup !== false) fazerBackup(db, caminho);
  migrar(db);
  return db;
}

export function versaoDoEsquema(db: Database): number {
  db.exec("CREATE TABLE IF NOT EXISTS schema_version (versao INTEGER NOT NULL)");
  const r = db.query("SELECT MAX(versao) AS v FROM schema_version").get() as { v: number | null };
  return r.v ?? 0;
}

export function migrar(db: Database): void {
  const atual = versaoDoEsquema(db);
  for (const m of MIGRACOES) {
    if (m.versao <= atual) continue;
    db.transaction(() => {
      db.exec(m.sql);
      db.query("INSERT INTO schema_version (versao) VALUES (?)").run(m.versao);
    })();
  }
}

/** Cópia consistente do banco (VACUUM INTO) numa subpasta `backups`, mantendo as mais recentes. */
export function fazerBackup(db: Database, caminho: string): string {
  const pasta = join(dirname(caminho), "backups");
  mkdirSync(pasta, { recursive: true });
  const carimbo = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "-");
  let destino = join(pasta, `simulador-${carimbo}.db`);
  for (let i = 2; existsSync(destino); i++) destino = join(pasta, `simulador-${carimbo}-${i}.db`);
  db.query("VACUUM INTO ?").run(destino);
  const antigos = readdirSync(pasta)
    .filter((f) => f.startsWith("simulador-") && f.endsWith(".db"))
    .sort()
    .reverse()
    .slice(BACKUPS_MANTIDOS);
  for (const f of antigos) rmSync(join(pasta, f));
  return destino;
}

/**
 * Pasta de dados (seção 9.7): ao lado do executável, se for gravável; senão, a pasta de dados do
 * usuário (`%LOCALAPPDATA%\SimuladorDeMercado`), que sempre aceita gravação sem administrador.
 */
export function pastaDeDados(execPath: string, ambiente: Record<string, string | undefined> = process.env): string {
  const aoLado = join(dirname(execPath), "dados-simulador");
  if (podeGravar(dirname(execPath))) return aoLado;
  const base = ambiente.LOCALAPPDATA ?? ambiente.XDG_DATA_HOME ?? join(ambiente.HOME ?? ".", ".local", "share");
  return join(base, "SimuladorDeMercado");
}

function podeGravar(pasta: string): boolean {
  try {
    accessSync(pasta, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}
