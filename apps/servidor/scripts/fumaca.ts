/**
 * Teste de fumaça de um servidor rodando como processo (o executável compilado ou `bun src/main.ts`):
 * define a chave, sobe numa porta livre, confere a interface embutida (página, script, fonte,
 * fallback de rota, cache e CSP), a API e o WebSocket do professor. Lança exceção na primeira falha.
 *
 * Uso direto: bun scripts/fumaca.ts <executável> [argumentos...]
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHAVE = "chave-da-fumaca";
const CONFIG = { presetId: "introdutorio/padrao", vagasPorMercado: 4, robosNasVagasVazias: "premium" };

function conferir(condicao: unknown, mensagem: string): asserts condicao {
  if (!condicao) throw new Error(`fumaça: ${mensagem}`);
}

/** Lê a saída até achar a porta anunciada (`na porta N`). */
async function esperarPorta(saida: ReadableStream<Uint8Array>, limiteMs: number): Promise<{ porta: number; texto: () => string }> {
  const leitor = saida.getReader();
  let texto = "";
  const fim = Date.now() + limiteMs;
  while (Date.now() < fim) {
    const pedaco = await Promise.race([leitor.read(), Bun.sleep(Math.max(1, fim - Date.now())).then(() => null)]);
    if (!pedaco || pedaco.done) break;
    texto += new TextDecoder().decode(pedaco.value);
    const m = /na porta (\d+)/.exec(texto);
    if (m) {
      // Continua lendo em segundo plano (a saída não pode encher e travar o processo).
      void (async () => {
        for (;;) {
          const { value, done } = await leitor.read();
          if (done) return;
          texto += new TextDecoder().decode(value);
        }
      })();
      return { porta: Number(m[1]), texto: () => texto };
    }
  }
  throw new Error(`fumaça: o servidor não anunciou a porta em ${limiteMs} ms. Saída:\n${texto}`);
}

export async function testarExecutavel(comando: readonly string[]): Promise<void> {
  const dados = mkdtempSync(join(tmpdir(), "simulador-fumaca-"));
  try {
    const definir = Bun.spawn([...comando, "--dados", dados, "--definir-chave", CHAVE], { stdout: "pipe", stderr: "pipe" });
    conferir((await definir.exited) === 0, `--definir-chave falhou: ${await new Response(definir.stderr).text()}`);

    const proc = Bun.spawn([...comando, "--dados", dados, "--porta", "0", "--host", "127.0.0.1"], { stdout: "pipe", stderr: "pipe" });
    try {
      const { porta, texto } = await esperarPorta(proc.stdout, 20_000);
      const base = `http://127.0.0.1:${porta}`;

      const pagina = await fetch(`${base}/`);
      const html = await pagina.text();
      conferir(pagina.status === 200 && html.includes('id="raiz"'), "página inicial não veio");
      conferir(pagina.headers.get("cache-control") === "no-store", "index.html sem no-store");
      conferir(pagina.headers.get("content-security-policy")?.includes("default-src 'self'"), "index.html sem CSP");

      const scripts = [...html.matchAll(/src="(\/assets\/[^"]+\.js)"/g)].map((m) => m[1]!);
      const estilos = [...html.matchAll(/href="(\/assets\/[^"]+\.css)"/g)].map((m) => m[1]!);
      conferir(scripts.length > 0 && estilos.length > 0, "index.html não referencia script e estilo");
      for (const s of [...scripts, ...estilos]) {
        const r = await fetch(base + s);
        conferir(r.status === 200 && (await r.text()).length > 100, `${s} não veio`);
        conferir(r.headers.get("cache-control")?.includes("immutable"), `${s} sem cache immutable`);
      }
      const css = await (await fetch(base + estilos[0]!)).text();
      const fontes = [...css.matchAll(/url\((\/assets\/[^)]+\.woff2)\)/g)].map((m) => m[1]!);
      conferir(fontes.length >= 1, "CSS sem fonte embutida");
      const fonte = await fetch(base + fontes[0]!);
      conferir(fonte.status === 200 && fonte.headers.get("content-type") === "font/woff2", "fonte não veio como woff2");

      const rota = await fetch(`${base}/telao/ABCDE?t=x`);
      conferir(rota.status === 200 && (await rota.text()).includes('id="raiz"'), "rota da interface não caiu no index.html");
      conferir((await fetch(`${base}/assets/nao-existe.js`)).status === 404, "asset inexistente não deu 404");

      const info = (await (await fetch(`${base}/api/servidor`)).json()) as { chaveDefinida: boolean; protocolo: number; presets: { id: string }[] };
      conferir(info.chaveDefinida && info.protocolo === 1, "/api/servidor inesperado");
      conferir(info.presets.some((x) => x.id === "cadeia/minima"), "o cenário da cadeia mínima não é oferecido na criação de salas");
      conferir(css.includes("j-palco-cadeia"), "o CSS embutido não traz a tela da cadeia");
      const criada = await fetch(`${base}/api/salas`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chave: CHAVE, config: CONFIG }) });
      conferir(criada.status === 201, `criar sala: ${criada.status} ${await criada.clone().text()}`);
      const { codigo } = (await criada.json()) as { codigo: string };
      const cookie = criada.headers.getSetCookie()[0]!.split(";")[0]!;

      const snapshot = await new Promise<string>((resolver, rejeitar) => {
        const ws = new WebSocket(`ws://127.0.0.1:${porta}/ws?codigo=${codigo}&papel=professor`, { headers: { cookie } } as unknown as string[]);
        const t = setTimeout(() => rejeitar(new Error("fumaça: WebSocket sem snapshot")), 5000);
        ws.onmessage = (e) => {
          clearTimeout(t);
          ws.close();
          resolver(String(e.data));
        };
        ws.onerror = () => rejeitar(new Error("fumaça: WebSocket recusado"));
      });
      conferir(JSON.parse(snapshot).tipo === "snapshot", "primeira mensagem não é snapshot");

      // Sala da cadeia mínima: o módulo liga sozinho e o professor recebe as atividades e as matérias-primas.
      const cadeia = await fetch(`${base}/api/salas`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chave: CHAVE, config: { ...CONFIG, presetId: "cadeia/minima" } }) });
      conferir(cadeia.status === 201, `criar sala da cadeia: ${cadeia.status} ${await cadeia.clone().text()}`);
      const salaDaCadeia = (await cadeia.json()) as { codigo: string };
      const cookieDaCadeia = cadeia.headers.getSetCookie()[0]!.split(";")[0]!;
      const visaoDaCadeia = JSON.parse(
        await new Promise<string>((resolver, rejeitar) => {
          const ws = new WebSocket(`ws://127.0.0.1:${porta}/ws?codigo=${salaDaCadeia.codigo}&papel=professor`, { headers: { cookie: cookieDaCadeia } } as unknown as string[]);
          const t = setTimeout(() => rejeitar(new Error("fumaça: WebSocket da cadeia sem snapshot")), 5000);
          ws.onmessage = (e) => {
            clearTimeout(t);
            ws.close();
            resolver(String(e.data));
          };
          ws.onerror = () => rejeitar(new Error("fumaça: WebSocket da cadeia recusado"));
        }),
      ) as { visao: { sala: { atividades: unknown[]; materiasPrimas: unknown[] } } };
      conferir(visaoDaCadeia.visao.sala.atividades.length === 5 && visaoDaCadeia.visao.sala.materiasPrimas.length === 6, "a sala da cadeia não traz as 5 atividades e as 6 matérias-primas");
      conferir(!/\[erro\]/.test(texto()), `erro no log do servidor:\n${texto()}`);
    } finally {
      proc.kill();
      await proc.exited;
    }
  } finally {
    rmSync(dados, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  const comando = process.argv.slice(2);
  if (comando.length === 0) {
    console.error("uso: bun scripts/fumaca.ts <executável> [argumentos...]");
    process.exit(2);
  }
  testarExecutavel(comando).then(
    () => console.log("fumaça: ok"),
    (e) => {
      console.error(e instanceof Error ? e.message : e);
      process.exit(1);
    },
  );
}
