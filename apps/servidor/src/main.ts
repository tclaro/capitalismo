/**
 * Ponto de entrada do servidor (modo B).
 *
 * Uso: simulador [--porta 47800] [--dados <pasta>] [--host 0.0.0.0] [--dev] [--definir-chave [chave]]
 * - `--definir-chave` define a chave de professor e sai (sem valor, pergunta no console).
 * - Sem `--dados`, usa a pasta ao lado do executável ou `%LOCALAPPDATA%\SimuladorDeMercado`.
 */
import { join } from "node:path";
import pacote from "../package.json" with { type: "json" };
import { abrirBanco, pastaDeDados } from "./dados/banco";
import { Gerente } from "./gerente";
import { logDoConsole } from "./log";
import { iniciarServidor, PORTA_PADRAO } from "./servidor";

export interface Argumentos {
  porta: number;
  dados: string | null;
  host: string;
  dev: boolean;
  definirChave: string | true | null;
}

export function lerArgumentos(argv: readonly string[]): Argumentos {
  const a: Argumentos = { porta: PORTA_PADRAO, dados: null, host: "0.0.0.0", dev: false, definirChave: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    const valor = () => {
      const v = argv[++i];
      if (v === undefined || v.startsWith("--")) throw new Error(`${arg} precisa de um valor`);
      return v;
    };
    switch (arg) {
      case "--porta": {
        const p = Number(valor());
        if (!Number.isInteger(p) || p < 0 || p > 65535) throw new Error("--porta inválida");
        a.porta = p;
        break;
      }
      case "--dados":
        a.dados = valor();
        break;
      case "--host":
        a.host = valor();
        break;
      case "--dev":
        a.dev = true;
        break;
      case "--definir-chave": {
        const proximo = argv[i + 1];
        a.definirChave = proximo !== undefined && !proximo.startsWith("--") ? argv[++i]! : true;
        break;
      }
      default:
        throw new Error(`argumento desconhecido: ${arg}`);
    }
  }
  return a;
}

async function lerLinha(pergunta: string): Promise<string> {
  process.stdout.write(pergunta);
  for await (const linha of console) return linha.trim();
  return "";
}

async function principal(): Promise<void> {
  const args = lerArgumentos(process.argv.slice(2));
  const pasta = args.dados ?? pastaDeDados(process.execPath);
  const db = abrirBanco(join(pasta, "simulador.db"));
  const gerente = new Gerente({ db, log: logDoConsole });

  if (args.definirChave !== null) {
    const chave = args.definirChave === true ? await lerLinha("Nova chave de professor (mínimo 8 caracteres): ") : args.definirChave;
    await gerente.acessos.definirChave(chave);
    console.log("Chave de professor definida.");
    db.close();
    return;
  }

  gerente.carregar();
  const servidor = iniciarServidor({ gerente, porta: args.porta, hostname: args.host, dev: args.dev, versao: pacote.version });
  logDoConsole("info", `Simulador de Mercado ${pacote.version} na porta ${servidor.porta}; dados em ${pasta}`);
  if (!gerente.acessos.chaveDefinida()) logDoConsole("aviso", `defina a chave de professor em http://localhost:${servidor.porta}/admin ou com --definir-chave`);

  let saindo = false;
  const sair = async () => {
    if (saindo) return;
    saindo = true;
    logDoConsole("info", "encerrando: as salas em andamento voltam pausadas na próxima inicialização");
    gerente.desligar();
    await servidor.parar();
    db.close();
    process.exit(0);
  };
  process.on("SIGINT", sair);
  process.on("SIGTERM", sair);
}

if (import.meta.main) {
  principal().catch((e) => {
    logDoConsole("erro", e instanceof Error ? e.message : String(e));
    process.exit(1);
  });
}
