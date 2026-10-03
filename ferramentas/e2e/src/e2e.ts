/**
 * Conferência ponta a ponta (E2E): sobe o servidor real em 127.0.0.1 com dados temporários, abre o Edge
 * sem janela e joga uma sala de verdade pela interface — em 1366×768 e 1920×1080 —, medindo estouro de
 * tela, tremor ao virar o dia e erros de JavaScript. Derruba tudo no fim, mesmo se falhar.
 *
 *   bun run e2e [--sem-build] [--saida <pasta>]
 *
 * Precisa do Edge (variável `EDGE` ou a instalação padrão do Windows). Sai com código 1 se algo falhar.
 */
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { conectar, dorme, localizarEdge, medidaRuim, type Pagina } from "./cdp";

const RAIZ = join(import.meta.dir, "..", "..", "..");
const CHAVE = "chave-do-e2e";
const TAMANHOS: readonly (readonly [number, number])[] = [
  [1366, 768],
  [1920, 1080],
];

export interface ArgumentosDoE2e {
  semBuild: boolean;
  saida: string;
}

export function lerArgumentos(argv: readonly string[]): ArgumentosDoE2e {
  const i = argv.indexOf("--saida");
  if (i >= 0 && (argv[i + 1] === undefined || argv[i + 1]!.startsWith("--"))) throw new Error("--saida precisa de um valor");
  return { semBuild: argv.includes("--sem-build"), saida: i >= 0 ? argv[i + 1]! : join(import.meta.dir, "..", "saida") };
}

interface Resultado {
  ok: boolean;
  texto: string;
}

class Conferencias {
  readonly itens: Resultado[] = [];
  registrar(ok: boolean, texto: string): void {
    this.itens.push({ ok, texto });
    console.log(`${ok ? "ok      " : "PROBLEMA"} ${texto}`);
  }
  get falhas(): number {
    return this.itens.filter((i) => !i.ok).length;
  }
}

// ---------------------------------------------------------------- processos
const procs: ReturnType<typeof Bun.spawn>[] = [];
function derrubarTudo(): void {
  for (const p of procs) {
    try {
      Bun.spawnSync(["taskkill", "/PID", String(p.pid), "/T", "/F"], { stdout: "ignore", stderr: "ignore" });
    } catch {}
  }
}

async function portaLivre(): Promise<number> {
  const s = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: () => new Response("") });
  const porta = s.port!;
  await s.stop(true);
  return porta;
}

async function subirServidor(dados: string): Promise<string> {
  const comando = ["bun", join(RAIZ, "apps", "servidor", "src", "main.ts")];
  const def = Bun.spawnSync([...comando, "--dados", dados, "--definir-chave", CHAVE], { cwd: RAIZ });
  if (def.exitCode !== 0) throw new Error(`não definiu a chave: ${def.stderr}`);
  const proc = Bun.spawn([...comando, "--dados", dados, "--porta", "0", "--host", "127.0.0.1", "--web", join(RAIZ, "apps", "web", "dist")], { cwd: RAIZ, stdout: "pipe", stderr: "pipe" });
  procs.push(proc);
  const leitor = proc.stdout.getReader();
  let texto = "";
  let leitura: ReturnType<typeof leitor.read> | null = null;
  const fim = Date.now() + 20_000;
  while (Date.now() < fim) {
    leitura ??= leitor.read();
    const p = await Promise.race([leitura, dorme(500).then(() => null)]);
    if (!p) continue;
    leitura = null;
    if (p.done) break;
    texto += new TextDecoder().decode(p.value);
    const m = /na porta (\d+)/.exec(texto);
    if (m) {
      void (async () => {
        for (;;) if ((await leitor.read()).done) return;
      })();
      return `http://127.0.0.1:${m[1]}`;
    }
  }
  throw new Error(`o servidor não anunciou a porta: ${texto}`);
}

// ---------------------------------------------------------------- atores da sala
const cookieDe = (r: Response) => (r.headers.getSetCookie()[0] ?? "").split(";")[0]!;
let contador = 0;
const novoId = () => `e2e-${Date.now().toString(36)}-${++contador}`;

class Ator {
  tick = 0;
  ultima: any = null;
  private respostas = new Map<string, any>();
  private ws!: WebSocket;
  constructor(private base: string, private codigo: string, private papel: "professor" | "aluno", private cookie: string) {}

  async abrir(): Promise<void> {
    // @ts-ignore: o Bun aceita cabeçalhos no WebSocket
    this.ws = new WebSocket(`${this.base.replace(/^http/, "ws")}/ws?codigo=${this.codigo}&papel=${this.papel}`, { headers: { cookie: this.cookie, origin: this.base } });
    this.ws.onmessage = (e) => {
      const m = JSON.parse(String(e.data));
      if (m.visao) {
        this.ultima = m.visao;
        if (m.visao.relogio) this.tick = m.visao.relogio.tick;
      }
      if (m.tipo === "resposta") this.respostas.set(m.idComando, m);
    };
    await new Promise((ok, erro) => {
      this.ws.onopen = ok;
      this.ws.onerror = erro;
    });
    for (let i = 0; i < 50 && !this.ultima; i++) await dorme(100);
  }

  async comando(corpo: object): Promise<{ ok: boolean; motivo?: string }> {
    const idComando = novoId();
    this.ws.send(JSON.stringify({ ...corpo, idComando }));
    for (let i = 0; i < 100; i++) {
      if (this.respostas.has(idComando)) return this.respostas.get(idComando);
      await dorme(50);
    }
    throw new Error("sem resposta ao comando");
  }

  relogio(acao: string, unidade?: string) {
    return this.comando({ tipo: "relogio", tickEsperado: this.tick, acao, ...(unidade ? { unidade } : {}) });
  }

  fechar(): void {
    this.ws.close();
  }
}

const CABECALHOS = (base: string) => ({ "content-type": "application/json", origin: base });

async function criarSala(base: string, config: object): Promise<{ codigo: string; professor: Ator }> {
  const r = await fetch(`${base}/api/salas`, { method: "POST", headers: CABECALHOS(base), body: JSON.stringify({ chave: CHAVE, config }) });
  const corpo = (await r.json()) as { ok: boolean; codigo: string; motivo?: string };
  if (!corpo.ok) throw new Error(`criar sala: ${corpo.motivo ?? r.status}`);
  const professor = new Ator(base, corpo.codigo, "professor", cookieDe(r));
  await professor.abrir();
  return { codigo: corpo.codigo, professor };
}

// ---------------------------------------------------------------- verificações
async function nosDoisTamanhos(pg: Pagina, c: Conferencias, etapa: string, fotografar = true): Promise<void> {
  for (const [l, a] of TAMANHOS) {
    await pg.tamanho(l, a);
    await dorme(300);
    const m = await pg.medidas();
    const detalhe = [m.cortes.length ? `cortes=${JSON.stringify(m.cortes)}` : "", m.cartoesForaDaColuna.length ? `foraDaColuna=${JSON.stringify(m.cartoesForaDaColuna)}` : "", m.painelCortado.length ? `painelCortado=${JSON.stringify(m.painelCortado)}` : ""].filter(Boolean).join(" ");
    c.registrar(!medidaRuim(m), `[${etapa}] ${l}x${a} sem estouro${detalhe ? ` (${detalhe})` : ""}`);
    if (fotografar) await pg.foto(`${etapa}-${l}`);
  }
  await pg.tamanho(1366, 768);
}

async function entrarComoAluno(pg: Pagina, base: string, codigo: string, empresa: string, equipe: string, cor: string): Promise<void> {
  await pg.navegar(`${base}/s/${codigo}`);
  await pg.espera("#nome-aluno");
  const r = await pg.ev<{ ok: boolean }>(`fetch('/api/alunos/entrar', { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({ codigo: ${JSON.stringify(codigo)}, nome: 'Ana', equipe: { tipo: 'nova', empresa: ${JSON.stringify(empresa)}, nome: ${JSON.stringify(equipe)}, cor: ${JSON.stringify(cor)} } }) }).then((r) => r.json())`);
  if (!r.ok) throw new Error(`entrar: ${JSON.stringify(r)}`);
  await pg.navegar(`${base}/s/${codigo}`);
}

// ---------------------------------------------------------------- cenários
async function cenarioDaCadeia(pg: Pagina, base: string, c: Conferencias): Promise<void> {
  const { codigo, professor } = await criarSala(base, { presetId: "cadeia/minima", vagasPorMercado: 3, robosNasVagasVazias: "equilibrada", duracaoMeses: 12, segundosPorTick: 10, modo: "continuo", edicaoNaPausa: true });
  // Beta (equipe controlada pelo roteiro) oferece leite no atacado.
  const rb = await fetch(`${base}/api/alunos/entrar`, { method: "POST", headers: CABECALHOS(base), body: JSON.stringify({ codigo, nome: "Bia", equipe: { tipo: "nova", empresa: "emp_02", nome: "Beta", cor: "verde" } }) });
  const beta = new Ator(base, codigo, "aluno", cookieDe(rb));
  await beta.abrir();

  await entrarComoAluno(pg, base, codigo, "emp_01", "Alfa", "azul");
  await pg.espera(".j-palco-cadeia");
  await pg.ev(`window.addEventListener('error', (e) => (window.__erros = (window.__erros || []).concat(String(e.message))))`);
  c.registrar((await pg.ev<number>(`document.querySelectorAll('.j-vistas button').length`)) === 2, "[cadeia] abre na visão da cadeia, com os botões Cadeia e Produtos");
  await nosDoisTamanhos(pg, c, "01-vazio");

  // Construir duas fazendas pela interface.
  await pg.clica('[data-instalacao="nova:fazenda"]');
  await nosDoisTamanhos(pg, c, "02-nova-fazenda");
  for (const atividade of ["gado_leiteiro", "gado_de_corte"]) {
    await pg.clica(`[data-atividade="${atividade}"]`);
    await pg.clicaTexto(".j-painel-cadeia button", "^Construir fazenda");
    await pg.clicaTexto(".j-painel-cadeia button", "^Construir por");
    await dorme(500);
  }
  c.registrar((await pg.ev<number>(`document.querySelectorAll('.j-inst.encomenda').length`)) === 2, "[cadeia] as duas fazendas encomendadas aparecem no palco");
  await beta.comando({ tipo: "decidir", decisoes: [{ tipo: "construirFazenda", atividade: "gado_leiteiro", producaoMensal: 8000 }] });

  // Inicia, pausa e avança meses (as obras levam 30 dias).
  await professor.relogio("iniciar");
  await dorme(300);
  await professor.relogio("pausar");
  await dorme(300);
  await professor.relogio("avancar", "mes");
  await dorme(1500);
  await pg.espera(".j-inst:not(.nova) .j-pilula");
  await professor.relogio("avancar", "mes");
  await dorme(1500);
  await nosDoisTamanhos(pg, c, "03-produzindo");
  const fazendas = await pg.ev<string[]>(`[...document.querySelectorAll('[data-instalacao^="faz:"]')].map((e) => e.getAttribute('data-instalacao'))`);
  c.registrar(fazendas.length === 2, `[cadeia] duas fazendas no palco (${fazendas.join(", ")})`);
  for (const f of fazendas) {
    await pg.clica(`[data-instalacao="${f}"]`);
    await nosDoisTamanhos(pg, c, `04-painel-${f.replace(":", "-")}`);
  }

  // Atacado: Beta oferece, Alfa pede.
  const teto = beta.ultima.visao.cadeia.faixaDoAtacado.leite.teto as number;
  await beta.comando({ tipo: "decidir", decisoes: [{ tipo: "ofertarNoAtacado", produto: "leite", preco: teto - 20, quantidadeMensal: 2000 }] });
  await professor.relogio("avancar", "mes");
  await dorme(1500);
  await pg.tecla("a");
  await nosDoisTamanhos(pg, c, "05-atacado");
  const temOferta = await pg.ev<boolean>(`!!document.querySelector('button[aria-label^="Comprar Leite"]')`);
  c.registrar(temOferta, "[cadeia] a oferta da outra equipe aparece no atacado, com o botão Comprar");
  if (temOferta) {
    await pg.clica('button[aria-label^="Comprar Leite"]');
    await pg.digita("#campo-pedido-leite", "500");
    await pg.tecla("Enter");
    await dorme(700);
    const pedido = (await pg.ev<string>(`document.querySelector('#campo-pedido-leite-estado')?.textContent ?? ''`)).includes("enviado");
    c.registrar(pedido, "[cadeia] o pedido ao vendedor foi enviado (o campo mostra 'enviado')");
    await nosDoisTamanhos(pg, c, "06-pedido");
  }

  // Fábrica de sorvete com leite próprio.
  await pg.tecla("i");
  await pg.clica('[data-instalacao="nova:fabrica"]');
  await pg.clica('li[data-produto="sorvete"] button');
  await pg.clica('li[data-produto="sorvete"] button');
  await dorme(500);
  for (let i = 0; i < 2; i++) {
    await professor.relogio("avancar", "mes");
    await dorme(1200);
  }
  await pg.espera('[data-instalacao="fab:sorvete"]');
  await pg.clica('[data-instalacao="fab:sorvete"]');
  await pg.clicaTexto('.j-origem[data-insumo="leite"] button', "Estoque próprio");
  await dorme(500);
  const propria = await pg.ev<string>(`[...document.querySelectorAll('.j-origem[data-insumo="leite"] button')].find((b) => /próprio/.test(b.textContent))?.getAttribute('aria-pressed') ?? ''`);
  c.registrar(propria === "true", "[cadeia] o leite da fábrica passou a vir do estoque próprio");
  await nosDoisTamanhos(pg, c, "07-fabrica");
  await pg.clica(`[data-instalacao="${fazendas[0]}"]`);
  const fios = await pg.ev<number>(`Number(document.querySelector('.j-fios')?.getAttribute('data-fios') ?? 0)`);
  c.registrar(fios >= 1, `[cadeia] há fio ligando a fazenda à fábrica (${fios})`);
  await nosDoisTamanhos(pg, c, "08-fios");

  // Loja e troca de atividade.
  await pg.clica('[data-instalacao="loja"]');
  await nosDoisTamanhos(pg, c, "09-loja");
  const corte = await pg.ev<string | null>(`[...document.querySelectorAll('[data-instalacao^="faz:"]')].find((e) => /Gado de corte/.test(e.textContent))?.getAttribute('data-instalacao') ?? null`);
  if (corte) {
    await pg.clica(`[data-instalacao="${corte}"]`);
    await pg.clicaTexto(".j-painel-cadeia button", "Trocar atividade");
    await pg.espera(".j-troca");
    await nosDoisTamanhos(pg, c, "10-troca");
    await pg.tecla("Escape");
    c.registrar(!(await pg.ev<boolean>(`!!document.querySelector('.j-veu')`)), "[cadeia] Esc fecha a janela de troca de atividade");
  }

  // Tremor: virar a semana não pode mexer em nenhuma caixa.
  await pg.clica(`[data-instalacao="${fazendas[0]}"]`);
  const seletores = [".j-inst", ".j-pilula", ".j-painel-cadeia > *", ".j-hud *", ".j-linha-est"];
  const antes: Record<string, number[][]> = {};
  for (const s of seletores) antes[s] = await pg.retangulos(s);
  await professor.relogio("avancar", "semana");
  await dorme(1500);
  let moveu = 0;
  for (const s of seletores) {
    const depois = await pg.retangulos(s);
    if (depois.length !== antes[s]!.length) {
      moveu++;
      continue;
    }
    depois.forEach((r, i) => {
      if (antes[s]![i]!.some((v, k) => Math.abs(v - r[k]!) > 0.6)) moveu++;
    });
  }
  c.registrar(moveu === 0, `[cadeia] nenhuma caixa mudou de posição ou tamanho ao virar a semana${moveu ? ` (${moveu} mudaram)` : ""}`);

  const erros = await pg.ev<string[]>(`window.__erros || []`);
  c.registrar(erros.length === 0, `[cadeia] sem erros de JavaScript na página${erros.length ? `: ${JSON.stringify(erros)}` : ""}`);
  beta.fechar();
  professor.fechar();
}

async function cenarioSemCadeia(pg: Pagina, base: string, c: Conferencias): Promise<void> {
  const { codigo, professor } = await criarSala(base, { presetId: "introdutorio/padrao", vagasPorMercado: 3, robosNasVagasVazias: "equilibrada", duracaoMeses: 12, segundosPorTick: 10, modo: "continuo", edicaoNaPausa: true });
  await entrarComoAluno(pg, base, codigo, "emp_01", "Alfa", "azul");
  await pg.espera(".j-cartao");
  c.registrar((await pg.ev<number>(`document.querySelectorAll('.j-vistas').length`)) === 0 && (await pg.ev<number>(`document.querySelectorAll('.j-palco-cadeia').length`)) === 0, "[introdutório] sem o módulo da cadeia não há botões de visão nem palco da cadeia");
  c.registrar((await pg.ev<number>(`document.querySelectorAll('.j-cartao').length`)) > 0, "[introdutório] o console de produtos continua como era");
  await nosDoisTamanhos(pg, c, "11-introdutorio");
  professor.fechar();
}

async function principal(): Promise<number> {
  const a = lerArgumentos(process.argv.slice(2));
  const edge = localizarEdge(existsSync);
  if (!edge) throw new Error("não achei o Edge (defina a variável EDGE com o caminho do msedge.exe)");
  mkdirSync(a.saida, { recursive: true });
  if (!a.semBuild) {
    const b = Bun.spawnSync(["bun", "run", "web:build"], { cwd: RAIZ, stdout: "ignore", stderr: "pipe" });
    if (b.exitCode !== 0) throw new Error(`o build da interface falhou: ${b.stderr}`);
  }
  const dados = mkdtempSync(join(tmpdir(), "sim-e2e-"));
  const perfil = mkdtempSync(join(tmpdir(), "edge-e2e-"));
  const c = new Conferencias();
  const trava = setTimeout(() => {
    console.log("TRAVA DE TEMPO: derrubando tudo");
    derrubarTudo();
    process.exit(2);
  }, 8 * 60_000);
  try {
    const base = await subirServidor(dados);
    const depuracao = await portaLivre();
    procs.push(Bun.spawn([edge, "--headless=new", `--remote-debugging-port=${depuracao}`, `--user-data-dir=${perfil}`, "--no-first-run", "--disable-gpu", "--window-size=1366,768", "about:blank"], { stdout: "ignore", stderr: "ignore" }));
    const pg = await conectar(depuracao, a.saida);
    await pg.tamanho(1366, 768);
    await cenarioDaCadeia(pg, base, c);
    await cenarioSemCadeia(pg, base, c);
  } catch (e) {
    c.registrar(false, `o roteiro parou: ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    clearTimeout(trava);
    derrubarTudo();
    await dorme(800);
    for (const p of [dados, perfil]) {
      for (let i = 0; i < 5; i++) {
        try {
          rmSync(p, { recursive: true, force: true });
          break;
        } catch {
          await dorme(500);
        }
      }
    }
  }
  const relatorio = [`# Conferência ponta a ponta`, "", `**Resultado: ${c.falhas === 0 ? "APROVADO" : "REPROVADO"}** (${c.itens.length - c.falhas} de ${c.itens.length} conferências)`, "", ...c.itens.map((i) => `- ${i.ok ? "ok" : "**PROBLEMA**"}: ${i.texto}`), ""].join("\n");
  writeFileSync(join(a.saida, "relatorio.md"), relatorio);
  console.log(`recursos liberados; relatório e capturas em ${a.saida}`);
  return c.falhas === 0 ? 0 : 1;
}

if (import.meta.main) {
  principal()
    .then((codigo) => process.exit(codigo))
    .catch((e) => {
      console.error(e instanceof Error ? e.message : e);
      derrubarTudo();
      process.exit(2);
    });
}
