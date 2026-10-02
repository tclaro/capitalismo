/**
 * Telas do professor, admin e /teste no DOM (happy-dom), com visões reais geradas pelo servidor.
 */
import { describe, expect, test } from "bun:test";
import { prepararDom, WebSocketFalso } from "./dom";
import { LEITE, salaDaCadeia, salaDeExemplo } from "./fixtures";

const dom = prepararDom();

const INFO = {
  versao: "0.1.0",
  protocolo: 1,
  porta: 47800,
  enderecos: ["http://10.1.2.30:47800"],
  chaveDefinida: true,
  estrategiasDeRobo: ["preco_baixo", "premium", "marca", "equilibrada", "revenda"],
  presets: [{ id: "introdutorio/padrao", nome: "Introdutório — laticínios e couro" }],
};

/** Painel aberto com sessão de professor e o snapshot entregue. */
async function painel(visao: unknown) {
  dom.rotas.set("GET /api/salas/ABCDE/sessao", { corpo: { professor: true, aluno: null } });
  dom.rotas.set("GET /api/servidor", { corpo: INFO });
  const r = await dom.montar("/professor/ABCDE");
  expect(dom.ws().url).toBe("ws://servidor:47800/ws?codigo=ABCDE&papel=professor");
  await dom.servidorEnvia({ tipo: "snapshot", papel: "professor", visao });
  return r;
}

/** Responde ao último comando enviado pela tela. */
async function responder(ok: boolean, motivo?: string) {
  const ultimo = dom.ws().comandos.at(-1)!;
  await dom.servidorEnvia({ tipo: "resposta", idComando: ultimo.idComando, ok, ...(motivo ? { motivo } : {}) });
  return ultimo;
}

describe("criar e reabrir sala", () => {
  test("criar: envia chave e configuração; guarda o PIN na aba e abre o painel", async () => {
    dom.rotas.set("GET /api/servidor", { corpo: INFO });
    dom.rotas.set("POST /api/salas", { status: 201, corpo: { ok: true, codigo: "K7QM2", pin: "123456", linkTelao: "/telao/K7QM2?t=x", enderecos: [] } });
    dom.rotas.set("GET /api/salas/K7QM2/sessao", { corpo: { professor: true, aluno: null } });
    const r = await dom.montar("/professor");
    const form = r.querySelector("form[aria-label='Criar sala']")!;
    expect(dom.botao(form, "Criar sala").disabled).toBe(true);
    await dom.digitar(form.querySelector("#chave"), "chave-secreta");
    await dom.escolher(form.querySelector("#vagas"), "4");
    await dom.escolher(form.querySelector("#robos"), "");
    await dom.escolher(form.querySelector("#velocidade"), "5");
    await dom.escolher(form.querySelector("#modo"), "rodada");
    expect(form.textContent).toContain("2 min 30 s por mês");
    await dom.agir(() => dom.botao(form, "Criar sala").click());
    const pedido = dom.pedidos.find((p) => p.metodo === "POST" && p.caminho === "/api/salas")!;
    expect(pedido.corpo).toEqual({
      chave: "chave-secreta",
      config: {
        presetId: "introdutorio/padrao",
        mercados: 1,
        vagasPorMercado: 4,
        robosNasVagasVazias: null,
        duracaoMeses: 24,
        segundosPorTick: 5,
        modo: "rodada",
        edicaoNaPausa: false,
        rankingVisivel: "completo",
        avancoQuandoProntas: false,
        criterio: "lucro_acumulado",
      },
    });
    expect(window.location.pathname).toBe("/professor/K7QM2");
    expect(sessionStorage.getItem("simulador:pin:K7QM2")).toBe("123456");
  });

  test("criar: erro do servidor aparece e a tela fica", async () => {
    dom.rotas.set("GET /api/servidor", { corpo: INFO });
    dom.rotas.set("POST /api/salas", { status: 401, corpo: { ok: false, motivo: "chave de professor incorreta" } });
    const r = await dom.montar("/professor");
    await dom.digitar(r.querySelector("#chave"), "errada");
    await dom.agir(() => dom.botao(r, "Criar sala").click());
    expect(r.querySelector("[role=alert]")!.textContent).toBe("chave de professor incorreta");
    expect(window.location.pathname).toBe("/professor");
  });

  test("sem chave definida: orienta a abrir o /admin no servidor", async () => {
    dom.rotas.set("GET /api/servidor", { corpo: { ...INFO, chaveDefinida: false } });
    const r = await dom.montar("/professor");
    expect(r.querySelector("#chave")).toBeNull();
    expect(r.textContent).toContain("http://localhost:47800/admin");
  });

  test("reabrir com código + PIN", async () => {
    dom.rotas.set("GET /api/servidor", { corpo: INFO });
    dom.rotas.set("POST /api/professor/entrar", { corpo: { ok: true, codigo: "ABCDE" } });
    const r = await dom.montar("/professor");
    await dom.digitar(r.querySelector("#codigo-reabrir"), "abcde");
    await dom.digitar(r.querySelector("#pin"), "12a3456");
    expect((r.querySelector("#pin") as HTMLInputElement).value).toBe("123456");
    await dom.agir(() => dom.botao(r, "Abrir painel").click());
    expect(dom.pedidos.find((p) => p.caminho === "/api/professor/entrar")!.corpo).toEqual({ codigo: "ABCDE", pin: "123456" });
    expect(window.location.pathname).toBe("/professor/ABCDE");
  });

  test("painel sem sessão: pede o PIN ali mesmo e depois conecta", async () => {
    dom.rotas.set("GET /api/salas/ABCDE/sessao", { corpo: { professor: false, aluno: null } });
    dom.rotas.set("POST /api/professor/entrar", { corpo: { ok: true, codigo: "ABCDE" } });
    const r = await dom.montar("/professor/ABCDE");
    expect(r.querySelector("h1")!.textContent).toBe("Sala ABCDE");
    expect(WebSocketFalso.criados).toHaveLength(0);
    await dom.digitar(r.querySelector("#pin-painel"), "654321");
    await dom.agir(() => dom.botao(r, "Abrir painel").click());
    expect(dom.ws().url).toContain("papel=professor");
  });

  test("sala inexistente", async () => {
    dom.rotas.set("GET /api/salas/ABCDE/sessao", { status: 404, corpo: { ok: false, motivo: "sala não encontrada" } });
    const r = await dom.montar("/professor/ABCDE");
    expect(r.textContent).toContain("Não há sala com o código ABCDE");
  });
});

describe("painel da sala", () => {
  test("preparação: acesso, equipes, conectados e iniciar", async () => {
    const s = salaDeExemplo();
    sessionStorage.setItem("simulador:pin:ABCDE", "246810");
    const r = await painel(s.visao([s.membros.ana]));
    // Acesso
    expect(r.textContent).toContain("http://10.1.2.30:47800");
    expect(r.querySelector(".codigo-grande")!.textContent).toBe("ABCDE");
    expect(r.textContent).toContain("246810");
    expect(r.textContent).toContain("http://10.1.2.30:47800/telao/ABCDE?t=token-do-telao");
    // Equipes: Alfa (Ana conectada, Bia não), Beta, vaga livre, aviso dos robôs
    const equipes = r.querySelector("section[aria-label=Equipes]")!;
    expect(equipes.textContent).toContain("2 equipe(s) de alunos · 3 aluno(s), 1 conectado(s) · 1 vaga(s) livre(s)");
    expect(equipes.textContent).toContain("viram robôs (Premium (qualidade))");
    expect(equipes.textContent).toContain("Ana (conectado)");
    expect(equipes.textContent).toContain("Bia (desconectado)");
    expect(equipes.textContent).toContain("Vaga livre");
    // Ranking e empresas só depois de iniciar
    expect(r.querySelector("section[aria-label=Ranking]")).toBeNull();
    // Iniciar: comando com o tick que a tela está vendo
    await dom.agir(() => dom.botao(r, /Iniciar partida/).click());
    const cmd = await responder(true);
    expect(cmd).toMatchObject({ tipo: "relogio", acao: "iniciar", tickEsperado: 0 });
    expect(typeof cmd.idComando).toBe("string");
  });

  test("renomear equipe e mover aluno enviam os comandos certos", async () => {
    const s = salaDeExemplo();
    const r = await painel(s.visao());
    await dom.agir(() => (r.querySelector("button[aria-label='Renomear Alfa']") as HTMLButtonElement).click());
    await dom.digitar(r.querySelector("input[aria-label='Novo nome da equipe']"), "Alfa Laticínios");
    await dom.agir(() => dom.botao(r, "Salvar").click());
    expect(await responder(true)).toMatchObject({ tipo: "renomearEquipe", empresa: "emp_01", nome: "Alfa Laticínios" });
    expect(r.querySelector("input[aria-label='Novo nome da equipe']")).toBeNull();
    await dom.escolher(r.querySelector("select[aria-label='Mover Bia para outra equipe']"), "emp_02");
    expect(await responder(true)).toMatchObject({ tipo: "moverAluno", membro: s.membros.bia, empresa: "emp_02" });
  });

  test("recusa do servidor aparece traduzida", async () => {
    const s = salaDeExemplo();
    const r = await painel(s.visao());
    await dom.agir(() => dom.botao(r, /Iniciar partida/).click());
    await responder(false, "desatualizado");
    expect(r.textContent).toContain("A tela estava desatualizada");
  });

  test("pausada no meio do mês: retomar, avançar, ranking e números formatados", async () => {
    const s = salaDeExemplo();
    s.sala.decidir(s.id(), s.membros.ana, [{ tipo: "produto", produto: LEITE, preco: 580, compraMensal: 20_000 }]);
    s.jogar(35);
    s.sala.comandoRelogio(s.id(), 35, "pausar");
    const v = s.visao();
    const r = await painel(v);
    expect(r.textContent).toContain("Pausada pelo professor");
    expect(r.textContent).toContain("Ano 1, fev, dia 5");
    expect(dom.botao(r, /Retomar/)).toBeTruthy();
    expect(() => dom.botao(r, /Iniciar partida/)).toThrow();
    await dom.agir(() => dom.botao(r, "Até o fim do mês").click());
    expect(await responder(true)).toMatchObject({ tipo: "relogio", acao: "avancar", unidade: "mes", tickEsperado: 35 });
    // Ranking com as 3 empresas e pontuação em reais
    const ranking = r.querySelector("section[aria-label=Ranking]")!;
    expect(ranking.querySelectorAll("tbody tr")).toHaveLength(3);
    expect(ranking.textContent).toMatch(/R\$ /);
    expect(ranking.textContent).toContain("(robô)");
    // Empresas: caixa formatado igual ao do servidor
    const alfa = v.empresas.find((e) => e.empresa === "emp_01")!;
    const empresas = r.querySelector("section[aria-label=Empresas]")!;
    const reais = (c: number) => `${c < 0 ? "-" : ""}R$ ${Math.floor(Math.abs(c) / 100).toLocaleString("pt-BR")},${String(Math.abs(c) % 100).padStart(2, "0")}`;
    expect(empresas.textContent).toContain(reais(alfa.caixa));
    expect(empresas.textContent).toContain("Leite engarrafado");
    expect(empresas.textContent).toContain("R$ 5,80");
  });

  test("sala da cadeia: coluna de fazendas e estoque de matéria-prima por equipe; sala comum não tem nada disso", async () => {
    const c = salaDaCadeia(45);
    Object.assign(c.sala.estado.empresas[0]!.materiasPrimas.leite!.estoque, { quantidade: 777, valor: 123_457, qualidade: 60 });
    const r = await painel(c.visao());
    const empresas = r.querySelector("section[aria-label=Empresas]")!;
    const cabecalho = [...empresas.querySelectorAll("table")[0]!.querySelectorAll("th")].map((th) => th.textContent);
    expect(cabecalho.at(-1)).toBe("Fazendas");
    const alfa = [...empresas.querySelectorAll("table")[0]!.querySelectorAll("tbody tr")].find((tr) => tr.textContent!.includes("Alfa"))!;
    expect([...alfa.querySelectorAll("td")].at(-1)!.textContent).toBe("2");
    const estoque = [...empresas.querySelectorAll("details")].find((d) => d.querySelector("summary")!.textContent === "Estoque de matéria-prima por equipe")!;
    const linhas = [...estoque.querySelectorAll("tbody tr")].map((tr) => [...tr.querySelectorAll("td")].map((td) => td.textContent!.replace(/ /g, " ")));
    const leite = linhas.find((l) => l[1] === "Leite")!;
    expect(leite[0]).toContain("Alfa");
    expect(leite[2]).toBe("777 litros");
    expect(leite[3]).toBe("R$ 1.234,57");
    // O estoque só aparece de quem tem: a Beta não tem nenhuma linha.
    expect(linhas.some((l) => l[0]!.includes("Beta"))).toBe(false);
  });

  test("sala sem a cadeia: sem coluna de fazendas nem tabela de matérias-primas", async () => {
    const s = salaDeExemplo();
    s.jogar(3);
    const r = await painel(s.visao());
    const empresas = r.querySelector("section[aria-label=Empresas]")!;
    expect([...empresas.querySelectorAll("th")].some((th) => th.textContent === "Fazendas")).toBe(false);
    expect([...empresas.querySelectorAll("summary")].some((x) => x.textContent === "Estoque de matéria-prima por equipe")).toBe(false);
  });

  test("encerrar pede confirmação na página; cancelar não envia nada", async () => {
    const s = salaDeExemplo();
    s.jogar(3);
    const r = await painel(s.visao());
    const opcoes = r.querySelector("section[aria-label='Opções da partida']")!;
    await dom.agir(() => dom.botao(opcoes, /Encerrar partida/).click());
    expect(dom.ws().comandos).toEqual([]);
    await dom.agir(() => dom.botao(opcoes, "Cancelar").click());
    await dom.agir(() => dom.botao(opcoes, /Encerrar partida/).click());
    await dom.agir(() => dom.botao(opcoes, "Confirmar").click());
    expect(await responder(true)).toMatchObject({ tipo: "encerrar" });
  });

  test("opções da partida viram comando configurar", async () => {
    const s = salaDeExemplo();
    const r = await painel(s.visao());
    await dom.escolher(r.querySelector("#op-velocidade"), "0.5");
    expect(await responder(true)).toMatchObject({ tipo: "configurar", segundosPorTick: 0.5 });
    await dom.escolher(r.querySelector("#op-ranking"), "oculto");
    expect(await responder(true)).toMatchObject({ tipo: "configurar", rankingVisivel: "oculto" });
    await dom.agir(() => (r.querySelector("section[aria-label='Opções da partida'] input[type=checkbox]") as HTMLInputElement).click());
    expect(await responder(true)).toMatchObject({ tipo: "configurar", edicaoNaPausa: true });
  });

  test("duração atingida: só estender ou encerrar", async () => {
    const s = salaDeExemplo({ duracaoMeses: 1 });
    s.jogar(31);
    const r = await painel(s.visao());
    expect(r.textContent).toContain("chegou aos 1 meses combinados");
    expect(() => dom.botao(r, /Retomar/)).toThrow();
    await dom.digitar(r.querySelector("#meses-extra"), "3");
    await dom.agir(() => dom.botao(r.querySelector(".barra-relogio")!.parentElement!, "Estender").click());
    expect(await responder(true)).toMatchObject({ tipo: "estender", meses: 3 });
  });

  test("gerar novo PIN pede confirmação e mostra o novo", async () => {
    const s = salaDeExemplo();
    dom.rotas.set("POST /api/salas/ABCDE/pin", { corpo: { ok: true, pin: "112233" } });
    const r = await painel(s.visao());
    expect(r.textContent).toContain("só aparece na aba em que foi criado");
    await dom.agir(() => dom.botao(r, "Gerar novo PIN").click());
    expect(dom.pedidos.some((p) => p.caminho === "/api/salas/ABCDE/pin")).toBe(false);
    await dom.agir(() => dom.botao(r, "Confirmar").click());
    expect(r.textContent).toContain("112233");
    expect(sessionStorage.getItem("simulador:pin:ABCDE")).toBe("112233");
  });

  test("diagnóstico: busca ao abrir e lista os testes dos alunos", async () => {
    const s = salaDeExemplo();
    dom.rotas.set("GET /api/salas/ABCDE/diagnostico", {
      corpo: {
        ok: true,
        versao: "0.1.0",
        porta: 47800,
        enderecos: ["http://10.1.2.30:47800"],
        testes: [{ quando: "2026-09-30T14:05:09.000Z", ip: "10.1.5.7", navegador: "Edge", maquina: "LAB2-PC07", http: { ok: true, amostras: 5, mediaMs: 3.2, maxMs: 5 }, ws: { ok: false, ms: null, erro: "bloqueado" } }],
      },
    });
    const r = await painel(s.visao());
    expect(dom.pedidos.some((p) => p.caminho.endsWith("/diagnostico"))).toBe(false);
    const detalhes = r.querySelector("section[aria-label='Diagnóstico de rede'] details") as HTMLDetailsElement;
    await dom.agir(() => {
      detalhes.open = true;
      detalhes.dispatchEvent(new Event("toggle"));
    });
    expect(r.textContent).toContain("http://10.1.2.30:47800/teste");
    expect(r.textContent).toContain("LAB2-PC07");
    expect(r.textContent).toContain("10.1.5.7");
    expect(r.textContent).toContain("falhou: bloqueado");
  });
});

describe("administração e teste de conexão", () => {
  test("admin fora do servidor: aviso", async () => {
    dom.rotas.set("GET /api/admin/salas", { status: 403, corpo: { ok: false, motivo: "administração só neste computador (localhost)" } });
    const r = await dom.montar("/admin");
    expect(r.textContent).toContain("só abre no próprio computador servidor");
  });

  test("admin: lista, exclui com confirmação e troca a chave", async () => {
    let salas = [{ id: "s1", codigo: "ABCDE", status: "rodando", tick: 12, presetId: "introdutorio/padrao", membros: 5, conexoes: 4 }];
    dom.rotas.set("GET /api/admin/salas", () => ({ corpo: { ok: true, chaveDefinida: true, salas } }));
    dom.rotas.set("DELETE /api/admin/salas/ABCDE", () => {
      salas = [];
      return { corpo: { ok: true } };
    });
    dom.rotas.set("POST /api/admin/chave", { corpo: { ok: true } });
    const r = await dom.montar("/admin");
    expect(r.querySelector("tbody")!.textContent).toContain("ABCDE");
    await dom.agir(() => dom.botao(r, "Excluir").click());
    expect(dom.pedidos.some((p) => p.metodo === "DELETE")).toBe(false);
    await dom.agir(() => dom.botao(r, "Confirmar").click());
    expect(r.textContent).toContain("Nenhuma sala.");
    await dom.digitar(r.querySelector("#nova-chave"), "nova-chave-123");
    await dom.digitar(r.querySelector("#repetir-chave"), "outra-coisa-12");
    await dom.agir(() => dom.botao(r, "Trocar chave").click());
    expect(r.textContent).toContain("não conferem");
    expect(dom.pedidos.some((p) => p.caminho === "/api/admin/chave")).toBe(false);
    await dom.digitar(r.querySelector("#repetir-chave"), "nova-chave-123");
    await dom.agir(() => dom.botao(r, "Trocar chave").click());
    expect(dom.pedidos.find((p) => p.caminho === "/api/admin/chave")!.corpo).toEqual({ chave: "nova-chave-123" });
    expect(r.textContent).toContain("Chave de professor salva");
  });

  test("/teste: mede HTTP e WebSocket e envia o relatório", async () => {
    dom.rotas.set("GET /api/teste/ping", { corpo: { ok: true } });
    dom.rotas.set("POST /api/teste", { corpo: { ok: true, ip: "10.1.5.7" } });
    const r = await dom.montar("/teste");
    await dom.digitar(r.querySelector("#maquina"), "LAB2-PC07");
    // O WebSocket de teste responde ao ping assim que ele é enviado.
    const original = WebSocketFalso.prototype.send;
    WebSocketFalso.prototype.send = function (this: InstanceType<typeof WebSocketFalso>, d: string) {
      original.call(this, d);
      queueMicrotask(() => this.onmessage?.({ data: JSON.stringify({ tipo: "pong" }) }));
    };
    try {
      await dom.agir(async () => {
        dom.botao(r, "Testar").click();
        await new Promise((ok) => setTimeout(ok, 0));
        const ws = dom.ws();
        expect(ws.url).toBe("ws://servidor:47800/ws?papel=teste");
        ws.readyState = 1;
        ws.onopen?.({});
        await new Promise((ok) => setTimeout(ok, 10));
      });
    } finally {
      WebSocketFalso.prototype.send = original;
    }
    expect(dom.pedidos.filter((p) => p.caminho === "/api/teste/ping")).toHaveLength(5);
    const relatorio = dom.pedidos.find((p) => p.caminho === "/api/teste")!.corpo as { maquina: string; http: { ok: boolean; amostras: number }; ws: { ok: boolean } };
    expect(relatorio).toMatchObject({ maquina: "LAB2-PC07", http: { ok: true, amostras: 5 }, ws: { ok: true } });
    expect(r.textContent).toContain("Tudo certo");
    expect(r.textContent).toContain("10.1.5.7");
    expect(localStorage.getItem("simulador:maquina")).toBe("LAB2-PC07");
  });
});
