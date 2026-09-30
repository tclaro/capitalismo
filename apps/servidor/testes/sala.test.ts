/**
 * Agregado da sala (entrega 1 da fase 1): vagas e equipes, decisões, comandos idempotentes,
 * relógio, modo rodada, duração, falha de gravação e retomada.
 * Preset de teste (2 produtos) com 3 vagas por mercado e 1 s por tick.
 */
import { describe, expect, test } from "bun:test";
import { ErroDeSala, Sala } from "../src/sala/sala";
import { AgendadorFalso, cmd, configSala, criarEquipe, novaSala } from "./ajuda";

const LEITE = "leite_engarrafado";

describe("criação", () => {
  test("vagas por mercado com ids estáveis; partida no tick 0 em preparação", () => {
    const { sala } = novaSala({ mercados: 2, vagasPorMercado: 3 });
    expect(sala.status).toBe("preparacao");
    expect(sala.estado.tick).toBe(0);
    expect(sala.vagas.map((v) => [v.empresa, v.mercado])).toEqual([
      ["emp_01", 0],
      ["emp_02", 0],
      ["emp_03", 0],
      ["emp_04", 1],
      ["emp_05", 1],
      ["emp_06", 1],
    ]);
    expect(sala.estado.empresas.map((e) => [e.id, e.nome, e.mercado])).toEqual([
      ["emp_01", "Vaga 1", "mer_01"],
      ["emp_02", "Vaga 2", "mer_01"],
      ["emp_03", "Vaga 3", "mer_01"],
      ["emp_04", "Vaga 4", "mer_02"],
      ["emp_05", "Vaga 5", "mer_02"],
      ["emp_06", "Vaga 6", "mer_02"],
    ]);
  });

  test("preset desconhecido e estratégia de robô inválida são rejeitados", () => {
    expect(() => Sala.criar({ id: "x", codigo: "XXXXX", semente: "s", config: configSala({ presetId: "nao/existe" }) }, new AgendadorFalso())).toThrow(ErroDeSala);
    expect(() => Sala.criar({ id: "x", codigo: "XXXXX", semente: "s", config: configSala({ robosNasVagasVazias: "aleatoria" }) }, new AgendadorFalso())).toThrow("estratégia de robô inválida");
  });
});

describe("equipes criadas pelos alunos", () => {
  test("o primeiro aluno cria a equipe (nome e cor); a partida é recriada com o nome, ids iguais", () => {
    const { sala } = novaSala();
    const r = sala.entrarAluno(" Ana ", { tipo: "nova", empresa: "emp_02", nome: "Leiteria  Boa", cor: "verde" });
    expect(r.ok).toBe(true);
    expect(sala.vaga("emp_02")!.equipe).toEqual({ nome: "Leiteria Boa", cor: "verde" });
    expect(sala.estado.empresas.map((e) => [e.id, e.nome])).toEqual([
      ["emp_01", "Vaga 1"],
      ["emp_02", "Leiteria Boa"],
      ["emp_03", "Vaga 3"],
    ]);
    expect(r.ok && r.membro).toEqual({ id: "mem_1", nome: "Ana", empresa: "emp_02" });
  });

  test("outros alunos entram na equipe; voltar com o mesmo nome recupera o mesmo membro", () => {
    const { sala } = novaSala();
    criarEquipe(sala, "emp_01", "Alfa", "azul", "Ana");
    const bruno = sala.entrarAluno("Bruno", { tipo: "existente", empresa: "emp_01" });
    const denovo = sala.entrarAluno("bruno", { tipo: "existente", empresa: "emp_01" });
    expect(bruno.ok && denovo.ok && bruno.membro.id === denovo.membro.id).toBe(true);
    expect(sala.membros.map((m) => [m.nome, m.empresa])).toEqual([
      ["Ana", "emp_01"],
      ["Bruno", "emp_01"],
    ]);
  });

  test("regras: nome repetido, cor repetida no mercado, vaga ocupada, vaga sem equipe, nomes inválidos", () => {
    const { sala } = novaSala();
    criarEquipe(sala, "emp_01", "Alfa", "azul", "Ana");
    const casos: [ReturnType<Sala["entrarAluno"]>, string][] = [
      [sala.entrarAluno("Carla", { tipo: "nova", empresa: "emp_02", nome: "alfa", cor: "verde" }), "já existe uma equipe com esse nome"],
      [sala.entrarAluno("Carla", { tipo: "nova", empresa: "emp_02", nome: "Beta", cor: "azul" }), "essa cor já foi escolhida"],
      [sala.entrarAluno("Carla", { tipo: "nova", empresa: "emp_01", nome: "Beta", cor: "verde" }), "essa vaga já tem equipe"],
      [sala.entrarAluno("Carla", { tipo: "existente", empresa: "emp_02" }), "ainda não tem equipe"],
      [sala.entrarAluno("Ana", { tipo: "nova", empresa: "emp_02", nome: "Beta", cor: "verde" }), "já existe um aluno com esse nome"],
      [sala.entrarAluno("<b>", { tipo: "existente", empresa: "emp_01" }), "nome inválido"],
      [sala.entrarAluno("Carla", { tipo: "nova", empresa: "emp_02", nome: "", cor: "verde" }), "nome de equipe inválido"],
      [sala.entrarAluno("Carla", { tipo: "existente", empresa: "emp_99" }), "não existe"],
    ];
    for (const [r, motivo] of casos) expect({ motivo, r: r.ok ? "ok" : r.motivo.includes(motivo) }).toEqual({ motivo, r: true });
  });

  test("mesmo nome em outra equipe é recusado (evita trocar de equipe sem o professor)", () => {
    const { sala } = novaSala();
    criarEquipe(sala, "emp_01", "Alfa", "azul", "Ana");
    criarEquipe(sala, "emp_02", "Beta", "verde", "Bia");
    const r = sala.entrarAluno("Ana", { tipo: "existente", empresa: "emp_02" });
    expect(r.ok ? "ok" : r.motivo).toContain("outra equipe");
  });

  test("professor renomeia equipe e move aluno", () => {
    const { sala } = novaSala();
    const ana = criarEquipe(sala, "emp_01", "Alfa", "azul", "Ana");
    criarEquipe(sala, "emp_02", "Beta", "verde", "Bia");
    expect(sala.renomearEquipe(cmd(), "emp_01", "Alfa Laticínios")).toEqual({ ok: true });
    expect(sala.estado.empresas[0]!.nome).toBe("Alfa Laticínios");
    expect(sala.renomearEquipe(cmd(), "emp_01", "beta").ok).toBe(false);
    expect(sala.moverAluno(cmd(), ana, "emp_02")).toEqual({ ok: true });
    expect(sala.membro(ana)!.empresa).toBe("emp_02");
    expect(sala.moverAluno(cmd(), ana, "emp_03").ok).toBe(false);
  });
});

describe("decisões", () => {
  test("a empresa vem do membro; fica pendente e vale no tick seguinte", () => {
    const { sala, relogio } = novaSala();
    const ana = criarEquipe(sala, "emp_01", "Alfa", "azul", "Ana");
    expect(sala.decidir(cmd(), ana, [{ tipo: "produto", produto: LEITE, preco: 600, compraMensal: 30_000 }])).toEqual({ ok: true });
    expect(sala.pendentes("emp_01")).toEqual([{ tipo: "produto", produto: LEITE, preco: 600, compraMensal: 30_000 }]);
    expect(sala.comandoRelogio(cmd(), 0, "iniciar")).toEqual({ ok: true });
    relogio.avancar(1000);
    expect(sala.estado.tick).toBe(1);
    expect(sala.estado.empresas[0]!.ofertas[0]!.decisao).toMatchObject({ preco: 600, compraMensal: 30_000 });
    expect(sala.pendentes("emp_01")).toEqual([]);
  });

  test("decisões feitas na preparação sobrevivem à recriação da partida (ids estáveis)", () => {
    const { sala, relogio } = novaSala();
    const ana = criarEquipe(sala, "emp_01", "Alfa", "azul", "Ana");
    sala.decidir(cmd(), ana, [{ tipo: "produto", produto: LEITE, preco: 610 }]);
    criarEquipe(sala, "emp_02", "Beta", "verde", "Bia"); // recria a partida
    sala.comandoRelogio(cmd(), 0, "iniciar"); // recria de novo (vagas vazias)
    relogio.avancar(1000);
    expect(sala.estado.empresas[0]!.ofertas[0]!.decisao.preco).toBe(610);
  });

  test("todas ou nenhuma: uma decisão inválida recusa o lote inteiro, com o motivo do motor", () => {
    const { sala } = novaSala();
    const ana = criarEquipe(sala, "emp_01", "Alfa", "azul", "Ana");
    const r = sala.decidir(cmd(), ana, [
      { tipo: "produto", produto: LEITE, preco: 600 },
      { tipo: "produto", produto: LEITE, preco: 999_999 },
    ]);
    expect(r.ok).toBe(false);
    expect(r.motivo).toContain("teto");
    expect(sala.pendentes("emp_01")).toEqual([]);
  });

  test("idempotência: o mesmo idComando aplica uma vez e devolve a mesma resposta", () => {
    const { sala } = novaSala();
    const ana = criarEquipe(sala, "emp_01", "Alfa", "azul", "Ana");
    const id = cmd();
    const d = [{ tipo: "abrirPontoDeVenda" as const, quantidade: 1 }];
    expect(sala.decidir(id, ana, d)).toEqual({ ok: true });
    expect(sala.decidir(id, ana, d)).toEqual({ ok: true });
    expect(sala.fila).toHaveLength(1);
  });

  test("robô e vaga inativa não aceitam decisões de alunos", () => {
    const comRobos = novaSala({ robosNasVagasVazias: "premium" }).sala;
    const ana = criarEquipe(comRobos, "emp_01", "Alfa", "azul", "Ana");
    comRobos.comandoRelogio(cmd(), 0, "iniciar");
    expect(comRobos.vagas.map((v) => [v.empresa, v.robo, v.inativa])).toEqual([
      ["emp_01", null, false],
      ["emp_02", "premium", false],
      ["emp_03", "premium", false],
    ]);
    expect(comRobos.estado.empresas.map((e) => e.tipo)).toEqual(["equipe", "robo", "robo"]);
    comRobos.moverAluno(cmd(), ana, "emp_02"); // destino robô: recusado
    expect(comRobos.membro(ana)!.empresa).toBe("emp_01");

    const semRobos = novaSala().sala;
    criarEquipe(semRobos, "emp_01", "Alfa", "azul", "Ana");
    semRobos.comandoRelogio(cmd(), 0, "iniciar");
    expect(semRobos.vagas.map((v) => v.inativa)).toEqual([false, true, true]);
  });

  test("pausa manual bloqueia edição (padrão), a não ser que o professor libere", () => {
    const { sala } = novaSala();
    const ana = criarEquipe(sala, "emp_01", "Alfa", "azul", "Ana");
    sala.comandoRelogio(cmd(), 0, "iniciar");
    sala.comandoRelogio(cmd(), 0, "pausar");
    expect(sala.podeEditar()).toBe(false);
    expect(sala.decidir(cmd(), ana, [{ tipo: "produto", produto: LEITE, preco: 600 }]).motivo).toContain("bloqueadas");
    sala.configurar(cmd(), { edicaoNaPausa: true });
    expect(sala.decidir(cmd(), ana, [{ tipo: "produto", produto: LEITE, preco: 600 }])).toEqual({ ok: true });
  });
});

describe("relógio e comandos do professor", () => {
  test("iniciar, pausar, retomar; ticks no ritmo configurado", () => {
    const { sala, relogio } = novaSala({ segundosPorTick: 2 });
    criarEquipe(sala, "emp_01", "Alfa", "azul", "Ana");
    sala.comandoRelogio(cmd(), 0, "iniciar");
    relogio.avancar(6000);
    expect(sala.estado.tick).toBe(3);
    expect(sala.comandoRelogio(cmd(), 3, "pausar")).toEqual({ ok: true });
    relogio.avancar(10_000);
    expect(sala.estado.tick).toBe(3);
    expect(sala.comandoRelogio(cmd(), 3, "retomar")).toEqual({ ok: true });
    relogio.avancar(2000);
    expect(sala.estado.tick).toBe(4);
  });

  test("tickEsperado desatualizado não tem efeito (duas abas não avançam duas vezes)", () => {
    const { sala } = novaSala();
    criarEquipe(sala, "emp_01", "Alfa", "azul", "Ana");
    sala.comandoRelogio(cmd(), 0, "iniciar");
    sala.comandoRelogio(cmd(), 0, "pausar");
    expect(sala.comandoRelogio(cmd(), 0, "avancar", "semana")).toEqual({ ok: true });
    expect(sala.estado.tick).toBe(7);
    // A outra aba ainda acha que o tick é 0:
    expect(sala.comandoRelogio(cmd(), 0, "avancar", "semana")).toEqual({ ok: false, motivo: "desatualizado" });
    expect(sala.estado.tick).toBe(7);
  });

  test("clique duplo (mesmo idComando) não avança duas vezes", () => {
    const { sala } = novaSala();
    criarEquipe(sala, "emp_01", "Alfa", "azul", "Ana");
    sala.comandoRelogio(cmd(), 0, "iniciar");
    sala.comandoRelogio(cmd(), 0, "pausar");
    const id = cmd();
    sala.comandoRelogio(id, 0, "avancar", "tick");
    sala.comandoRelogio(id, 0, "avancar", "tick");
    expect(sala.estado.tick).toBe(1);
  });

  test("avançar semana e mês param nas fronteiras; iniciar sem equipes nem robôs é recusado", () => {
    const vazia = novaSala().sala;
    expect(vazia.comandoRelogio(cmd(), 0, "iniciar").motivo).toContain("nenhuma equipe");
    const { sala } = novaSala();
    criarEquipe(sala, "emp_01", "Alfa", "azul", "Ana");
    sala.comandoRelogio(cmd(), 0, "iniciar");
    sala.comandoRelogio(cmd(), 0, "pausar");
    sala.comandoRelogio(cmd(), 0, "avancar", "semana");
    sala.comandoRelogio(cmd(), 7, "avancar", "mes");
    expect(sala.estado.tick).toBe(30);
    expect(sala.fechamentos.emp_01).toHaveLength(1);
    sala.comandoRelogio(cmd(), 30, "avancar", "mes");
    expect(sala.estado.tick).toBe(60);
    expect(sala.comandoRelogio(cmd(), 60, "retomar")).toEqual({ ok: true });
    expect(sala.comandoRelogio(cmd(), 60, "avancar", "tick").motivo).toContain("pause");
  });

  test("modo rodada: o relógio pausa sozinho no fim do mês, com edição liberada", () => {
    const { sala, relogio } = novaSala({ modo: "rodada" });
    const ana = criarEquipe(sala, "emp_01", "Alfa", "azul", "Ana");
    sala.comandoRelogio(cmd(), 0, "iniciar");
    relogio.avancar(40_000);
    expect(sala.estado.tick).toBe(30);
    expect([sala.status, sala.motivoPausa, sala.podeEditar()]).toEqual(["pausada", "fim_do_mes", true]);
    expect(sala.decidir(cmd(), ana, [{ tipo: "produto", produto: LEITE, preco: 590 }])).toEqual({ ok: true });
    sala.comandoRelogio(cmd(), 30, "retomar");
    relogio.avancar(30_000);
    expect(sala.estado.tick).toBe(60);
  });

  test("modo rodada com avanço quando todas as equipes ficam prontas", () => {
    const { sala, relogio } = novaSala({ modo: "rodada", avancoQuandoProntas: true });
    const ana = criarEquipe(sala, "emp_01", "Alfa", "azul", "Ana");
    const bia = criarEquipe(sala, "emp_02", "Beta", "verde", "Bia");
    sala.comandoRelogio(cmd(), 0, "iniciar");
    relogio.avancar(30_000);
    expect(sala.motivoPausa).toBe("fim_do_mes");
    sala.marcarPronto(cmd(), ana, true);
    expect(sala.status).toBe("pausada");
    sala.marcarPronto(cmd(), bia, true);
    expect(sala.status).toBe("rodando");
    expect(sala.prontos.size).toBe(0);
  });

  test("avançar até o fim do mês no modo rodada também libera edição", () => {
    const { sala } = novaSala({ modo: "rodada" });
    criarEquipe(sala, "emp_01", "Alfa", "azul", "Ana");
    sala.comandoRelogio(cmd(), 0, "iniciar");
    sala.comandoRelogio(cmd(), 0, "pausar");
    sala.comandoRelogio(cmd(), 0, "avancar", "mes");
    expect([sala.motivoPausa, sala.podeEditar()]).toEqual(["fim_do_mes", true]);
    sala.comandoRelogio(cmd(), 30, "avancar", "tick");
    expect([sala.motivoPausa, sala.podeEditar()]).toEqual(["manual", false]);
  });

  test("duração atingida: pausa; retomar e avançar recusados; estender ou encerrar", () => {
    const { sala, relogio } = novaSala({ duracaoMeses: 1 });
    criarEquipe(sala, "emp_01", "Alfa", "azul", "Ana");
    sala.comandoRelogio(cmd(), 0, "iniciar");
    relogio.avancar(60_000);
    expect(sala.estado.tick).toBe(30);
    expect([sala.status, sala.motivoPausa, sala.podeEditar()]).toEqual(["pausada", "duracao_atingida", false]);
    expect(sala.comandoRelogio(cmd(), 30, "retomar").ok).toBe(false);
    expect(sala.estender(cmd(), 1)).toEqual({ ok: true });
    expect(sala.motivoPausa).toBe("manual");
    sala.comandoRelogio(cmd(), 30, "retomar");
    relogio.avancar(60_000);
    expect(sala.estado.tick).toBe(60);
    expect(sala.encerrar(cmd())).toEqual({ ok: true });
    expect(sala.status).toBe("encerrada");
    expect(sala.entrarAluno("Zé", { tipo: "existente", empresa: "emp_01" }).ok).toBe(false);
  });

  test("mudar a velocidade com o relógio rodando vale a partir de agora", () => {
    const { sala, relogio } = novaSala({ segundosPorTick: 5 });
    criarEquipe(sala, "emp_01", "Alfa", "azul", "Ana");
    sala.comandoRelogio(cmd(), 0, "iniciar");
    relogio.avancar(4000);
    sala.configurar(cmd(), { segundosPorTick: 1 });
    relogio.avancar(3000);
    expect(sala.estado.tick).toBe(3);
  });
});

describe("falhas e retomada", () => {
  test("falha na gravação: a sala pausa com motivo erro e o estado em memória é o do último tick gravado", () => {
    let gravados = 0;
    const erros: unknown[] = [];
    const { sala, relogio } = novaSala(
      {},
      {
        gravarTick: () => {
          if (++gravados === 3) throw new Error("disco cheio");
        },
        aoErro: (_s, e) => erros.push(e),
      },
    );
    criarEquipe(sala, "emp_01", "Alfa", "azul", "Ana");
    sala.comandoRelogio(cmd(), 0, "iniciar");
    relogio.avancar(10_000);
    expect(sala.estado.tick).toBe(2);
    expect([sala.status, sala.motivoPausa]).toEqual(["pausada", "erro"]);
    expect(sala.relogioRodando).toBe(false);
    expect(erros.map((e) => (e as Error).message)).toEqual(["disco cheio"]);
  });

  test("retomar dados gravados: sala que estava rodando volta pausada, com equipes, fila e estado", () => {
    const { sala, relogio } = novaSala();
    const ana = criarEquipe(sala, "emp_01", "Alfa", "azul", "Ana");
    sala.comandoRelogio(cmd(), 0, "iniciar");
    relogio.avancar(5000);
    sala.decidir(cmd(), ana, [{ tipo: "produto", produto: LEITE, preco: 620 }]);
    const dados = JSON.parse(JSON.stringify(sala.dados()));
    sala.pararRelogio();
    const retomada = Sala.retomar(dados, new AgendadorFalso());
    expect([retomada.status, retomada.motivoPausa, retomada.estado.tick]).toEqual(["pausada", "manual", 5]);
    expect(retomada.pendentes("emp_01")).toEqual([{ tipo: "produto", produto: LEITE, preco: 620 }]);
    expect(retomada.membro(ana)!.nome).toBe("Ana");
    expect(JSON.stringify(retomada.estado)).toBe(JSON.stringify(sala.estado));
  });

  test("o observador recebe gravações e mudanças", () => {
    const eventos: string[] = [];
    const { sala, relogio } = novaSala(
      {},
      {
        gravarSala: () => eventos.push("sala"),
        gravarTick: (_s, r) => eventos.push(`tick:${r.estado.tick}`),
        gravarDecisao: () => eventos.push("decisao"),
        gravarComando: () => eventos.push("comando"),
        aoMudar: (_s, m) => eventos.push(`mudou:${m}`),
      },
    );
    const ana = criarEquipe(sala, "emp_01", "Alfa", "azul", "Ana");
    sala.decidir(cmd(), ana, [{ tipo: "produto", produto: LEITE, preco: 600 }]);
    sala.comandoRelogio(cmd(), 0, "iniciar");
    relogio.avancar(1000);
    expect(eventos).toContain("decisao");
    expect(eventos).toContain("tick:1");
    expect(eventos).toContain("mudou:tick");
    expect(eventos).toContain("mudou:status");
    expect(eventos.filter((e) => e === "comando").length).toBe(2);
  });
});
