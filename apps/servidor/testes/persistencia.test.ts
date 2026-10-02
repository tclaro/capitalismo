/**
 * Persistência (entrega 2 da fase 1): migrações, gravação por tick, retomada pausada, rollback em
 * falha, replay, histórico, backup e queda real do processo.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { passo, VERSAO_ESTADO } from "@simulador/motor";
import { abrirBanco, BACKUPS_MANTIDOS, MIGRACOES, pastaDeDados, versaoDoEsquema } from "../src/dados/banco";
import { carregarSalas, ObservadorPersistente } from "../src/dados/persistencia";
import { Repositorio } from "../src/dados/repositorio";
import { projetarAluno } from "../src/sala/projecoes";
import { Sala } from "../src/sala/sala";
import { AgendadorFalso, cmd, configSala, criarEquipe } from "./ajuda";

const pastas: string[] = [];
function pastaTemporaria(): string {
  const p = mkdtempSync(join(tmpdir(), "simulador-teste-"));
  pastas.push(p);
  return p;
}
afterAll(() => {
  for (const p of pastas) rmSync(p, { recursive: true, force: true });
});

const LEITE = "leite_engarrafado";

/** Sala gravada em banco: 2 equipes humanas, robôs nas vagas vazias, 1 mês e 12 dias jogados. */
function salaGravada(caminho: string) {
  const db = abrirBanco(caminho);
  const repositorio = new Repositorio(db);
  const relogio = new AgendadorFalso();
  const sala = Sala.criar({ id: "sala_p", codigo: "PERS1", semente: "persistencia", config: configSala({ robosNasVagasVazias: "premium" }) }, relogio, new ObservadorPersistente(repositorio));
  const ana = criarEquipe(sala, "emp_01", "Alfa", "azul", "Ana");
  const bia = criarEquipe(sala, "emp_02", "Beta", "verde", "Bia");
  sala.decidir(cmd(), ana, [{ tipo: "produto", produto: LEITE, preco: 580, compraMensal: 25_000 }]);
  sala.decidir(cmd(), bia, [{ tipo: "produto", produto: LEITE, preco: 620, compraMensal: 20_000 }, { tipo: "construirFabrica", produto: LEITE }]);
  sala.comandoRelogio(cmd(), 0, "iniciar");
  relogio.avancar(42_000);
  const pendente = cmd();
  sala.decidir(pendente, ana, [{ tipo: "produto", produto: LEITE, preco: 570 }]);
  return { db, repositorio, sala, relogio, ana, bia, pendente };
}

describe("banco e migrações", () => {
  test("banco novo recebe o esquema; reabrir não repete migrações", () => {
    const caminho = join(pastaTemporaria(), "a.db");
    const db = abrirBanco(caminho);
    expect(versaoDoEsquema(db)).toBe(MIGRACOES.at(-1)!.versao);
    const tabelas = (db.query("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as { name: string }[]).map((t) => t.name);
    expect(tabelas).toEqual(expect.arrayContaining(["salas", "estado_atual", "estado_fim_mes", "entradas_tick", "decisoes", "comandos", "historico_oferta_semanal", "historico_empresa_mensal", "log_ticks", "configuracao_servidor"]));
    expect((db.query("PRAGMA journal_mode").get() as { journal_mode: string }).journal_mode).toBe("wal");
    db.close();
    const denovo = abrirBanco(caminho);
    expect((denovo.query("SELECT COUNT(*) AS n FROM schema_version").get() as { n: number }).n).toBe(MIGRACOES.length);
    denovo.close();
  });

  test("backup antes de migrar um banco existente, mantendo só os mais recentes", () => {
    const pasta = pastaTemporaria();
    const caminho = join(pasta, "b.db");
    abrirBanco(caminho).close();
    for (let i = 0; i < BACKUPS_MANTIDOS + 2; i++) abrirBanco(caminho).close();
    const backups = readdirSync(join(pasta, "backups"));
    expect(backups).toHaveLength(BACKUPS_MANTIDOS);
    expect(backups.every((f) => f.startsWith("simulador-") && f.endsWith(".db"))).toBe(true);
  });

  test("pasta de dados: ao lado do executável se gravável; senão, LOCALAPPDATA", () => {
    const pasta = pastaTemporaria();
    expect(pastaDeDados(join(pasta, "simulador.exe"))).toBe(join(pasta, "dados-simulador"));
    expect(pastaDeDados(join(pasta, "nao-existe", "simulador.exe"), { LOCALAPPDATA: "C:\\Usuarios\\x\\AppData\\Local" })).toBe(join("C:\\Usuarios\\x\\AppData\\Local", "SimuladorDeMercado"));
  });
});

describe("gravação e retomada", () => {
  test("reabrir o banco retoma a sala pausada, com o mesmo estado, fila, equipes e fechamentos", () => {
    const caminho = join(pastaTemporaria(), "c.db");
    const { db, sala } = salaGravada(caminho);
    const antes = JSON.stringify(sala.estado);
    const fila = sala.pendentes("emp_01");
    const fechamentos = JSON.stringify(sala.fechamentos);
    const acumulador = JSON.stringify(sala.acumulador);
    sala.pararRelogio();
    db.close();

    const db2 = abrirBanco(caminho);
    const repositorio = new Repositorio(db2);
    const [retomada] = carregarSalas(repositorio, new AgendadorFalso(), () => new ObservadorPersistente(repositorio));
    expect([retomada!.status, retomada!.motivoPausa, retomada!.estado.tick]).toEqual(["pausada", "manual", 42]);
    expect(JSON.stringify(retomada!.estado)).toBe(antes);
    expect(retomada!.pendentes("emp_01")).toEqual(fila);
    expect(JSON.stringify(retomada!.fechamentos)).toBe(fechamentos);
    expect(JSON.stringify(retomada!.acumulador)).toBe(acumulador);
    expect(retomada!.membros.map((m) => m.nome)).toEqual(["Ana", "Bia"]);
    expect(retomada!.vagas.map((v) => v.robo)).toEqual([null, null, "premium"]);
    expect((db2.query("SELECT status FROM salas").get() as { status: string }).status).toBe("pausada");
    db2.close();
  });

  test("sala gravada pela versão 1 do estado volta migrada: campos novos, mesma partida, e continua jogando", () => {
    const caminho = join(pastaTemporaria(), "v1.db");
    const { db, sala } = salaGravada(caminho);
    const esperado = JSON.stringify(sala.estado);
    sala.pararRelogio();

    /** Reescreve o estado gravado como a versão 1 o gravaria (sem os campos da camada 3). */
    const comoVersao1 = (json: string): string => {
      const e = JSON.parse(json) as Record<string, any>;
      e.versaoEstado = 1;
      delete e.parametros.cadeia;
      for (const emp of e.empresas) {
        for (const o of emp.ofertas) {
          delete o.decisao.origemInsumos;
          delete o.decisao.origemCompraPronta;
        }
        delete emp.fazendas;
        delete emp.materiasPrimas;
        for (const dre of [emp.contabil.mesAtual.dre, emp.contabil.ultimoFechamento?.dre]) {
          if (!dre) continue;
          delete dre.custo_fixo_fazenda;
          delete dre.perda_de_estoque;
        }
      }
      return JSON.stringify(e);
    };
    for (const tabela of ["estado_atual", "estado_fim_mes"]) {
      const linhas = db.query(`SELECT rowid AS id, estado_json FROM ${tabela}`).all() as { id: number; estado_json: string }[];
      for (const l of linhas) db.query(`UPDATE ${tabela} SET estado_json = ? WHERE rowid = ?`).run(comoVersao1(l.estado_json), l.id);
    }
    expect(JSON.parse((db.query("SELECT estado_json FROM estado_atual").get() as { estado_json: string }).estado_json).versaoEstado).toBe(1);
    db.close();

    const db2 = abrirBanco(caminho);
    const repositorio = new Repositorio(db2);
    const relogio2 = new AgendadorFalso();
    const [retomada] = carregarSalas(repositorio, relogio2, () => new ObservadorPersistente(repositorio));
    expect(JSON.stringify(retomada!.estado)).toBe(esperado);
    expect(retomada!.estado.versaoEstado).toBe(VERSAO_ESTADO);
    // O estado de referência de um mês também sai migrado (usado no replay).
    expect(repositorio.estadoDoMes("sala_p", 0)!.versaoEstado).toBe(VERSAO_ESTADO);
    // E a partida segue: com o relógio andando, os ticks avançam e o estado continua na versão atual.
    retomada!.comandoRelogio(cmd(), 42, "retomar");
    relogio2.avancar(18_000);
    expect(retomada!.estado.tick).toBeGreaterThan(42);
    expect(retomada!.estado.versaoEstado).toBe(VERSAO_ESTADO);
    db2.close();
  });

  test("comandos continuam idempotentes depois do reinício", () => {
    const caminho = join(pastaTemporaria(), "d.db");
    const { db, sala, ana, pendente } = salaGravada(caminho);
    sala.pararRelogio();
    db.close();
    const db2 = abrirBanco(caminho);
    const repositorio = new Repositorio(db2);
    const [retomada] = carregarSalas(repositorio, new AgendadorFalso(), () => new ObservadorPersistente(repositorio));
    retomada!.configurar(cmd(), { edicaoNaPausa: true });
    const antes = retomada!.fila.length;
    expect(retomada!.decidir(pendente, ana, [{ tipo: "produto", produto: LEITE, preco: 570 }])).toEqual({ ok: true });
    expect(retomada!.fila.length).toBe(antes);
    db2.close();
  });

  test("a retomada continua a partida do ponto exato", () => {
    const caminho = join(pastaTemporaria(), "e.db");
    const { db, sala, relogio } = salaGravada(caminho);
    // Referência: a mesma sala continua sem reiniciar.
    relogio.avancar(18_000);
    const referencia = JSON.stringify(sala.estado);
    sala.pararRelogio();
    db.close();

    const outro = join(pastaTemporaria(), "e2.db");
    const { db: dbB, sala: salaB } = salaGravada(outro);
    salaB.pararRelogio();
    dbB.close();
    const db2 = abrirBanco(outro);
    const repositorio = new Repositorio(db2);
    const relogio2 = new AgendadorFalso();
    const [retomada] = carregarSalas(repositorio, relogio2, () => new ObservadorPersistente(repositorio));
    retomada!.comandoRelogio(cmd(), 42, "retomar");
    relogio2.avancar(18_000);
    expect(JSON.stringify(retomada!.estado)).toBe(referencia);
    db2.close();
  });
});

describe("falha e replay", () => {
  test("falha dentro da transação do tick: rollback no banco e estado em memória intacto", () => {
    const caminho = join(pastaTemporaria(), "f.db");
    const { db, sala, relogio } = salaGravada(caminho);
    const tickAntes = sala.estado.tick;
    // Sabota a última instrução da transação: a transação inteira tem de ser desfeita.
    db.exec("DROP TABLE log_ticks");
    relogio.avancar(3000);
    expect([sala.status, sala.motivoPausa, sala.estado.tick]).toEqual(["pausada", "erro", tickAntes]);
    const gravado = db.query("SELECT tick FROM estado_atual").get() as { tick: number };
    expect(gravado.tick).toBe(tickAntes);
    expect((db.query("SELECT MAX(tick) AS t FROM entradas_tick").get() as { t: number }).t).toBe(tickAntes);
    expect((db.query("SELECT COUNT(*) AS n FROM decisoes WHERE aplicada_no_tick IS NULL").get() as { n: number }).n).toBe(1);
    db.close();
  });

  test("replay: estado do mês 0 + entradas gravadas reproduzem o estado atual, byte a byte", () => {
    const caminho = join(pastaTemporaria(), "g.db");
    const { db, repositorio, sala } = salaGravada(caminho);
    sala.pararRelogio();
    let estado = repositorio.estadoDoMes("sala_p", 0)!;
    expect(estado.tick).toBe(0);
    for (const { entradas } of repositorio.entradasDosTicks("sala_p")) estado = passo(estado, entradas as Parameters<typeof passo>[1]).estado;
    expect(JSON.stringify(estado)).toBe(JSON.stringify(sala.estado));
    const doMes1 = repositorio.estadoDoMes("sala_p", 1)!;
    expect(doMes1.tick).toBe(30);
    db.close();
  });

  test("histórico: 6 semanas fechadas × 3 empresas × 2 produtos; mensal com pontuação", () => {
    const caminho = join(pastaTemporaria(), "h.db");
    const { db, repositorio, sala } = salaGravada(caminho);
    sala.pararRelogio();
    const semanal = repositorio.historicoSemanal("sala_p");
    // Ticks 1..42: semanas fecham nos ticks 7, 14, 21, 30 (mês 1) e 37 (dia 7 do mês 2).
    expect([...new Set(semanal.map((r) => r.semana))]).toEqual([1, 2, 3, 4, 5]);
    expect(semanal.length).toBe(5 * 3 * 2);
    expect(repositorio.historicoSemanal("sala_p", "emp_01").every((r) => r.empresa === "emp_01")).toBe(true);
    const mensal = db.query("SELECT mes, empresa, pontuacao FROM historico_empresa_mensal ORDER BY empresa").all() as { mes: number; empresa: string; pontuacao: number }[];
    expect(mensal.map((m) => [m.mes, m.empresa])).toEqual([
      [1, "emp_01"],
      [1, "emp_02"],
      [1, "emp_03"],
    ]);
    expect(mensal[0]!.pontuacao).toBe(sala.fechamentos.emp_01![0]!.lucroLiquido / 100);
    expect((db.query("SELECT COUNT(*) AS n FROM log_ticks").get() as { n: number }).n).toBe(42);
    db.close();
  });
});

describe("queda real do processo", () => {
  test("matar o processo no meio da partida: retoma pausada, sem perder ticks gravados, banco íntegro", async () => {
    const caminho = join(pastaTemporaria(), "queda.db");
    const script = join(import.meta.dir, "processo", "sala-viva.ts");
    const proc = Bun.spawn(["bun", script, "rodar", caminho], { stdout: "pipe", stderr: "pipe" });
    // Leitura só de leitura e sem migrar: o processo filho é quem cria o banco (dois processos
    // migrando o mesmo arquivo ao mesmo tempo derrubavam o filho).
    const ler = (): number => {
      if (!existsSync(caminho)) return 0;
      let db: Database | null = null;
      try {
        db = new Database(caminho, { readonly: true });
        return (db.query("SELECT tick FROM estado_atual").get() as { tick: number } | null)?.tick ?? 0;
      } catch {
        return 0;
      } finally {
        db?.close();
      }
    };
    const limite = Date.now() + 20_000;
    while (ler() < 25 && Date.now() < limite) await Bun.sleep(50);
    proc.kill(9);
    await proc.exited;
    const gravado = ler();
    if (gravado < 25) throw new Error(`o processo não avançou (tick ${gravado}). stderr:\n${await new Response(proc.stderr).text()}`);

    const verif = Bun.spawn(["bun", script, "verificar", caminho], { stdout: "pipe", stderr: "pipe" });
    const saida = await new Response(verif.stdout).text();
    await verif.exited;
    const r = JSON.parse(saida.trim().split("\n").at(-1)!);
    expect(r).toMatchObject({ salas: 1, status: "pausada", motivo: "manual", tick: gravado, integridade: "ok" });
  }, 30_000);
});

describe("gravação e retomada com a cadeia produtiva", () => {
  /** Sala da cadeia: fazenda, oferta e pedido de atacado, 12 dias jogados (a obra da fazenda leva 30). */
  function salaDaCadeia(caminho: string) {
    const db = abrirBanco(caminho);
    const repositorio = new Repositorio(db);
    const relogio = new AgendadorFalso();
    const sala = Sala.criar({ id: "sala_c", codigo: "CADE1", semente: "persistencia-cadeia", config: configSala({ presetId: "cadeia/minima", robosNasVagasVazias: "premium" }) }, relogio, new ObservadorPersistente(repositorio));
    const ana = criarEquipe(sala, "emp_01", "Alfa", "azul", "Ana");
    const bia = criarEquipe(sala, "emp_02", "Beta", "verde", "Bia");
    const teto = projetarAluno(sala, ana).visao.cadeia!.faixaDoAtacado.leite!.teto;
    expect(sala.decidir(cmd(), ana, [{ tipo: "construirFazenda", atividade: "gado_leiteiro", producaoMensal: 6000 }, { tipo: "ofertarNoAtacado", produto: "leite", preco: teto, quantidadeMensal: 3000 }])).toEqual({ ok: true });
    expect(sala.decidir(cmd(), bia, [{ tipo: "comprarNoAtacado", produto: "leite", vendedor: "emp_01", quantidadeMensal: 900 }, { tipo: "produto", produto: LEITE, preco: 620, compraMensal: 1000 }])).toEqual({ ok: true });
    sala.comandoRelogio(cmd(), 0, "iniciar");
    relogio.avancar(12_000);
    return { db, sala, ana };
  }

  test("reabrir o banco retoma a sala da cadeia idêntica, com fazendas, pedidos e séries de estoque", () => {
    const caminho = join(pastaTemporaria(), "cadeia.db");
    const { db, sala } = salaDaCadeia(caminho);
    const antes = JSON.stringify(sala.estado);
    expect(sala.estado.empresas[0]!.fazendas).toHaveLength(1);
    expect(sala.estado.empresas[0]!.materiasPrimas.leite!.serie).toHaveLength(12);
    sala.pararRelogio();
    db.close();

    const db2 = abrirBanco(caminho);
    const repositorio = new Repositorio(db2);
    const [retomada] = carregarSalas(repositorio, new AgendadorFalso(), () => new ObservadorPersistente(repositorio));
    expect(retomada!.estado.modulos).toEqual(["nucleo", "cadeia_produtiva"]);
    expect(JSON.stringify(retomada!.estado)).toBe(antes);
    db2.close();
  });

  test("sala gravada na versão 3 do estado (sem o pedido de atacado) volta migrada e idêntica", () => {
    const caminho = join(pastaTemporaria(), "cadeia-v3.db");
    const { db, sala } = salaDaCadeia(caminho);
    const esperado = JSON.stringify(sala.estado);
    sala.pararRelogio();
    /** Reescreve o estado como a versão 3 o gravaria. */
    const comoVersao3 = (json: string): string => {
      const e = JSON.parse(json) as Record<string, any>;
      e.versaoEstado = 3;
      for (const emp of e.empresas) for (const m of Object.values<any>(emp.materiasPrimas)) delete m.pedidoAtacado;
      return JSON.stringify(e);
    };
    for (const tabela of ["estado_atual", "estado_fim_mes"]) {
      const linhas = db.query(`SELECT rowid AS id, estado_json FROM ${tabela}`).all() as { id: number; estado_json: string }[];
      for (const l of linhas) db.query(`UPDATE ${tabela} SET estado_json = ? WHERE rowid = ?`).run(comoVersao3(l.estado_json), l.id);
    }
    expect(JSON.parse((db.query("SELECT estado_json FROM estado_atual").get() as { estado_json: string }).estado_json).versaoEstado).toBe(3);
    db.close();

    const db2 = abrirBanco(caminho);
    const repositorio = new Repositorio(db2);
    const [retomada] = carregarSalas(repositorio, new AgendadorFalso(), () => new ObservadorPersistente(repositorio));
    // O pedido da Beta se perdeu na gravação antiga (a versão 3 não o tinha): o resto é igual e o campo volta como null.
    const migrado = JSON.parse(JSON.stringify(retomada!.estado));
    expect(migrado.versaoEstado).toBe(VERSAO_ESTADO);
    const original = JSON.parse(esperado);
    original.empresas[1].materiasPrimas.leite.pedidoAtacado = null;
    expect(JSON.stringify(migrado)).toBe(JSON.stringify(original));
    db2.close();
  });
});
