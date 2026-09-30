/**
 * Acesso (entrega 3): chave, PIN, token do telão, sessões, limite de tentativas, código da sala,
 * utilitários HTTP e argumentos da CLI.
 */
import { describe, expect, test } from "bun:test";
import { abrirBanco } from "../src/dados/banco";
import { Acessos, DURACAO_SESSAO_MS, LimiteDeTentativas, pinAleatorio, type RegraDeLimite } from "../src/dados/acessos";
import { ALFABETO_CODIGO, codigoAleatorio } from "../src/gerente";
import { ehPedidoLocal, lerCookies, origemPermitida } from "../src/http/util";
import { lerArgumentos } from "../src/main";
import { ordenarInterfaces } from "../src/rede";

function banco() {
  const db = abrirBanco(":memory:");
  // Sessões e acessos exigem a sala (chave estrangeira).
  db.query("INSERT INTO salas (id, codigo, status, tick, dados_json, criada_em, atualizada_em) VALUES ('s1', 'AAAAA', 'preparacao', 0, '{}', '', '')").run();
  db.query("INSERT INTO salas (id, codigo, status, tick, dados_json, criada_em, atualizada_em) VALUES ('s2', 'BBBBB', 'preparacao', 0, '{}', '', '')").run();
  return db;
}

describe("chave, PIN e telão", () => {
  test("chave: indefinida até definir; confere só a correta; exige 8 caracteres", async () => {
    const a = new Acessos(banco());
    expect(a.chaveDefinida()).toBe(false);
    expect(await a.conferirChave("qualquer-coisa")).toBe(false);
    await expect(a.definirChave("curta")).rejects.toThrow();
    await a.definirChave("chave-secreta");
    expect(a.chaveDefinida()).toBe(true);
    expect(await a.conferirChave("chave-secreta")).toBe(true);
    expect(await a.conferirChave("chave-secreta ")).toBe(false);
    // O banco guarda só o hash.
    const guardado = (a.db.query("SELECT valor FROM configuracao_servidor").get() as { valor: string }).valor;
    expect(guardado).not.toContain("chave-secreta");
  });

  test("PIN: 6 dígitos, guardado como hash, trocar invalida o anterior", async () => {
    for (let i = 0; i < 200; i++) expect(pinAleatorio()).toMatch(/^\d{6}$/);
    const a = new Acessos(banco());
    const { pin, tokenTelao } = await a.criarAcessos("s1");
    expect(await a.conferirPin("s1", pin)).toBe(true);
    expect(await a.conferirPin("s2", pin)).toBe(false);
    expect(JSON.stringify(a.db.query("SELECT * FROM acessos_sala").all())).not.toContain(`"${pin}"`);
    const novo = await a.novoPin("s1");
    expect(await a.conferirPin("s1", novo)).toBe(true);
    if (novo !== pin) expect(await a.conferirPin("s1", pin)).toBe(false);
    expect(tokenTelao).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  test("telão: token confere; revogar invalida o antigo", async () => {
    const a = new Acessos(banco());
    const { tokenTelao } = await a.criarAcessos("s1");
    expect(a.conferirTelao("s1", tokenTelao)).toBe(true);
    expect(a.conferirTelao("s1", tokenTelao.slice(1))).toBe(false);
    expect(a.conferirTelao("s2", tokenTelao)).toBe(false);
    const novo = a.revogarTelao("s1");
    expect(a.conferirTelao("s1", tokenTelao)).toBe(false);
    expect(a.conferirTelao("s1", novo)).toBe(true);
  });

  test("sessões: token no cookie, hash no banco, expiram", () => {
    const t = { agora: 1000 };
    const a = new Acessos(banco(), () => t.agora);
    const token = a.criarSessao({ salaId: "s1", papel: "aluno", membro: "mem_1" });
    expect(a.sessao(token)).toEqual({ salaId: "s1", papel: "aluno", membro: "mem_1" });
    expect(a.sessao(token + "x")).toBeNull();
    expect(JSON.stringify(a.db.query("SELECT * FROM sessoes").all())).not.toContain(token);
    t.agora += DURACAO_SESSAO_MS;
    expect(a.sessao(token)).toBeNull();
    expect(a.limparSessoesVencidas()).toBe(1);
    const outro = a.criarSessao({ salaId: "s1", papel: "professor", membro: null });
    a.encerrarSessao(outro);
    expect(a.sessao(outro)).toBeNull();
  });

  test("excluir a sala apaga acessos e sessões (cascata)", async () => {
    const a = new Acessos(banco());
    await a.criarAcessos("s1");
    const token = a.criarSessao({ salaId: "s1", papel: "professor", membro: null });
    a.db.query("DELETE FROM salas WHERE id = 's1'").run();
    expect(a.sessao(token)).toBeNull();
    expect(a.tokenTelao("s1")).toBeNull();
  });
});

describe("limite de tentativas", () => {
  const regra: RegraDeLimite = { maxFalhas: 5, janelaMs: 600_000, bloqueioMs: 60_000, bloqueioMaxMs: 200_000 };

  test("bloqueia depois de estourar; o bloqueio dobra a cada estouro, até o teto", () => {
    const t = { agora: 0 };
    const db = banco();
    const l = new LimiteDeTentativas(db, () => t.agora);
    for (let i = 0; i < 5; i++) {
      expect(l.bloqueio("pin:ip:x")).toBeNull();
      l.registrarFalha("pin:ip:x", regra);
    }
    expect(l.bloqueio("pin:ip:x")).toBeNull();
    l.registrarFalha("pin:ip:x", regra);
    expect(l.bloqueio("pin:ip:x")).toBe(60_000);
    expect(l.bloqueio("pin:ip:y")).toBeNull();
    t.agora += 60_000;
    expect(l.bloqueio("pin:ip:x")).toBeNull();
    l.registrarFalha("pin:ip:x", regra);
    expect(l.bloqueio("pin:ip:x")).toBe(120_000);
    t.agora += 120_000;
    l.registrarFalha("pin:ip:x", regra);
    expect(l.bloqueio("pin:ip:x")).toBe(200_000);
    // Persistido: outra instância sobre o mesmo banco vê o bloqueio.
    expect(new LimiteDeTentativas(db, () => t.agora).bloqueio("pin:ip:x")).toBe(200_000);
  });

  test("a janela expira e zera a contagem; limpar também zera", () => {
    const t = { agora: 0 };
    const l = new LimiteDeTentativas(banco(), () => t.agora);
    for (let i = 0; i < 5; i++) l.registrarFalha("k", regra);
    t.agora += 600_000;
    l.registrarFalha("k", regra);
    expect(l.bloqueio("k")).toBeNull();
    for (let i = 0; i < 4; i++) l.registrarFalha("k", regra);
    l.limpar("k");
    l.registrarFalha("k", regra);
    expect(l.bloqueio("k")).toBeNull();
  });
});

describe("código da sala e utilitários", () => {
  test("código: 5 caracteres de um alfabeto sem ambíguos", () => {
    expect(ALFABETO_CODIGO).not.toMatch(/[01OIL]/);
    const vistos = new Set<string>();
    for (let i = 0; i < 2000; i++) {
      const c = codigoAleatorio();
      expect(c).toMatch(new RegExp(`^[${ALFABETO_CODIGO}]{5}$`));
      vistos.add(c);
    }
    expect(vistos.size).toBeGreaterThan(1990);
  });

  test("pedido local: IP de loopback e Host de loopback (contra DNS rebinding)", () => {
    const de = (ip: string) => ({ requestIP: () => ({ address: ip }) });
    const req = (host: string) => new Request(`http://${host}/api/admin/salas`, { headers: { host } });
    expect(ehPedidoLocal(de("127.0.0.1"), req("localhost:47800"))).toBe(true);
    expect(ehPedidoLocal(de("::ffff:127.0.0.1"), req("127.0.0.1:47800"))).toBe(true);
    expect(ehPedidoLocal(de("10.0.0.5"), req("localhost:47800"))).toBe(false);
    expect(ehPedidoLocal(de("127.0.0.1"), req("atacante.exemplo:47800"))).toBe(false);
  });

  test("origem: ausente ou igual ao Host; extras só se listados", () => {
    const req = (origin: string | null) => new Request("http://10.0.0.1:47800/ws", { headers: { host: "10.0.0.1:47800", ...(origin ? { origin } : {}) } });
    expect(origemPermitida(req(null))).toBe(true);
    expect(origemPermitida(req("http://10.0.0.1:47800"))).toBe(true);
    expect(origemPermitida(req("http://10.0.0.1:8080"))).toBe(false);
    expect(origemPermitida(req("http://localhost:5173"))).toBe(false);
    expect(origemPermitida(req("http://localhost:5173"), ["http://localhost:5173"])).toBe(true);
  });

  test("cookies: lê pares; o primeiro de mesmo nome vence", () => {
    const c = lerCookies(new Request("http://x/", { headers: { cookie: "a=1; sm_a_ABCDE=tok=en; a=2; ruim" } }));
    expect([...c]).toEqual([
      ["a", "1"],
      ["sm_a_ABCDE", "tok=en"],
    ]);
  });

  test("interfaces: rede do laboratório primeiro; virtuais, 169.254 e loopback por último", () => {
    const r = ordenarInterfaces([
      { nome: "Loopback", endereco: "127.0.0.1", interna: true },
      { nome: "vEthernet (WSL)", endereco: "172.20.0.1", interna: false },
      { nome: "Ethernet 2", endereco: "169.254.3.4", interna: false },
      { nome: "Ethernet", endereco: "10.1.2.3", interna: false },
    ]);
    expect(r.map((i) => i.endereco)).toEqual(["10.1.2.3", "172.20.0.1", "169.254.3.4", "127.0.0.1"]);
  });

  test("argumentos da CLI", () => {
    expect(lerArgumentos([])).toEqual({ porta: 47800, dados: null, host: "0.0.0.0", web: null, dev: false, definirChave: null });
    expect(lerArgumentos(["--web", "apps/web/dist"]).web).toBe("apps/web/dist");
    expect(() => lerArgumentos(["--web"])).toThrow();
    expect(lerArgumentos(["--porta", "0", "--dados", "D:\\x", "--dev", "--host", "127.0.0.1"])).toMatchObject({ porta: 0, dados: "D:\\x", dev: true, host: "127.0.0.1" });
    expect(lerArgumentos(["--definir-chave"]).definirChave).toBe(true);
    expect(lerArgumentos(["--definir-chave", "segredo123", "--dev"])).toMatchObject({ definirChave: "segredo123", dev: true });
    expect(() => lerArgumentos(["--porta", "x"])).toThrow();
    expect(() => lerArgumentos(["--porta"])).toThrow();
    expect(() => lerArgumentos(["--desconhecido"])).toThrow();
  });
});
