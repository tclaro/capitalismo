/**
 * Prepara as imagens dos produtos para a interface.
 *
 * Entrada: `assets/produtos/<id>.png` (original gerado sobre fundo cinza liso, sem transparência).
 * Saída: `apps/web/src/assets/produtos/<id>.webp` (512×512, fundo transparente, objeto centralizado).
 *
 * Recorte: inundação a partir das bordas por pixels neutros e claros que variam pouco entre
 * vizinhos; o contorno escuro do objeto detém a inundação. Dentro da região de fundo, cada pixel
 * vira preto com opacidade (L_fundo − L)/L_fundo, de modo que a sombra de contato continua
 * natural sobre qualquer cor de fundo (e reconstrói exatamente o original sobre o cinza dele).
 *
 * Uso: `bun run imagens` (todas) ou `bun run imagens iogurte sapato`.
 */
import { mkdirSync, readdirSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import sharp from "sharp";

const RAIZ = resolve(import.meta.dir, "../../..");
export const ORIGEM = join(RAIZ, "assets/produtos");
export const DESTINO = join(RAIZ, "apps/web/src/assets/produtos");
export const LADO = 512;
const MARGEM = 0.08;
/** Diferença máxima entre canais para um pixel contar como cinza neutro. */
const CROMA_MAXIMO = 14;
/** Luminância mínima do fundo claro (1ª etapa). */
const LUMINANCIA_MINIMA = 120;
/** Variação máxima entre vizinhos dentro do fundo claro (degradê suave). */
const PASSO_MAXIMO = 24;
/** Luminância mínima da sombra de contato (2ª etapa, que só desce). */
const LUMINANCIA_SOMBRA = 50;
/** Ruído tolerado na descida da 2ª etapa. */
const FOLGA_SUBIDA = 2;
/** Opacidade abaixo da qual a sombra é ruído e some. */
const OPACIDADE_MINIMA = 0.03;

export interface Recorte {
  /** RGBA, mesmo tamanho da entrada. */
  rgba: Uint8Array;
  largura: number;
  altura: number;
  luminanciaDoFundo: number;
  /** Fração dos pixels classificados como fundo. */
  fracaoFundo: number;
}

const luminancia = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;

export function recortar(rgb: Uint8Array, largura: number, altura: number, canais: number): Recorte {
  const n = largura * altura;
  const lum = new Float32Array(n);
  const neutro = new Uint8Array(n);
  for (let p = 0; p < n; p++) {
    const r = rgb[p * canais]!, g = rgb[p * canais + 1]!, b = rgb[p * canais + 2]!;
    lum[p] = luminancia(r, g, b);
    neutro[p] = Math.max(r, g, b) - Math.min(r, g, b) <= CROMA_MAXIMO ? 1 : 0;
  }

  // Cor do fundo: mediana da borda.
  const borda: number[] = [];
  for (let x = 0; x < largura; x++) borda.push(lum[x]!, lum[(altura - 1) * largura + x]!);
  for (let y = 0; y < altura; y++) borda.push(lum[y * largura]!, lum[y * largura + largura - 1]!);
  borda.sort((a, b) => a - b);
  const luminanciaDoFundo = borda[borda.length >> 1]!;

  const fundo = new Uint8Array(n);
  const fila = new Int32Array(n);
  let fim = 0;
  const semear = (p: number) => {
    if (!fundo[p] && neutro[p] && lum[p]! >= LUMINANCIA_MINIMA) {
      fundo[p] = 1;
      fila[fim++] = p;
    }
  };
  for (let x = 0; x < largura; x++) semear(x), semear((altura - 1) * largura + x);
  for (let y = 0; y < altura; y++) semear(y * largura), semear(y * largura + largura - 1);

  const inundar = (inicio: number, aceita: (q: number, p: number) => boolean) => {
    let ini = inicio;
    while (ini < fim) {
      const p = fila[ini++]!;
      const x = p % largura, y = (p - x) / largura;
      const vizinhos = [x > 0 ? p - 1 : -1, x < largura - 1 ? p + 1 : -1, y > 0 ? p - largura : -1, y < altura - 1 ? p + largura : -1];
      for (const q of vizinhos) {
        if (q < 0 || fundo[q] || !neutro[q] || !aceita(q, p)) continue;
        fundo[q] = 1;
        fila[fim++] = q;
      }
    }
  };
  // 1ª etapa: o fundo claro, em degradê suave.
  inundar(0, (q, p) => lum[q]! >= LUMINANCIA_MINIMA && Math.abs(lum[q]! - lum[p]!) <= PASSO_MAXIMO);
  // 2ª etapa: o miolo escuro da sombra de contato, só descendo a partir do fundo. Partes neutras
  // do objeto (a tampa de alumínio) ficam atrás de um contorno escuro: alcançá-las exigiria subir.
  inundar(0, (q, p) => lum[q]! >= LUMINANCIA_SOMBRA && lum[q]! <= lum[p]! + FOLGA_SUBIDA);

  const rgba = new Uint8Array(n * 4);
  let contagem = 0;
  for (let p = 0; p < n; p++) {
    if (fundo[p]) {
      contagem++;
      const a = Math.max(0, (luminanciaDoFundo - lum[p]!) / luminanciaDoFundo);
      rgba[p * 4 + 3] = a < OPACIDADE_MINIMA ? 0 : Math.round(a * 255);
    } else {
      rgba[p * 4] = rgb[p * canais]!;
      rgba[p * 4 + 1] = rgb[p * canais + 1]!;
      rgba[p * 4 + 2] = rgb[p * canais + 2]!;
      rgba[p * 4 + 3] = 255;
    }
  }
  return { rgba, largura, altura, luminanciaDoFundo, fracaoFundo: contagem / n };
}

/** Caixa dos pixels visíveis (objeto e sombra), ampliada para um quadrado com margem. */
export function enquadrar(r: Recorte): { left: number; top: number; width: number; height: number; extensao: number } {
  let x0 = r.largura, y0 = r.altura, x1 = -1, y1 = -1;
  for (let y = 0; y < r.altura; y++)
    for (let x = 0; x < r.largura; x++)
      if (r.rgba[(y * r.largura + x) * 4 + 3]! > 24) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  if (x1 < 0) throw new Error("imagem sem objeto visível");
  const lado = Math.ceil(Math.max(x1 - x0 + 1, y1 - y0 + 1) / (1 - 2 * MARGEM));
  const cx = (x0 + x1 + 1) / 2, cy = (y0 + y1 + 1) / 2;
  const left = Math.round(cx - lado / 2), top = Math.round(cy - lado / 2);
  // Quanto o quadrado ultrapassa a imagem (preenchido com transparente).
  const extensao = Math.max(0, -left, -top, left + lado - r.largura, top + lado - r.altura);
  return { left, top, width: lado, height: lado, extensao };
}

export async function preparar(id: string, destino = DESTINO): Promise<{ arquivo: string; bytes: number; fracaoFundo: number }> {
  const { data, info } = await sharp(join(ORIGEM, `${id}.png`)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const r = recortar(new Uint8Array(data.buffer, data.byteOffset, data.byteLength), info.width, info.height, info.channels);
  const q = enquadrar(r);
  const e = q.extensao;
  const arquivo = join(destino, `${id}.webp`);
  mkdirSync(destino, { recursive: true });
  // Etapas separadas: no mesmo pipeline o sharp aplica `extract` antes de `extend`, e o
  // redimensionamento precisa do quadrado já materializado.
  const estendida = await sharp(Buffer.from(r.rgba), { raw: { width: r.largura, height: r.altura, channels: 4 } })
    .extend({ top: e, bottom: e, left: e, right: e, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  const enquadrada = await sharp(estendida).extract({ left: q.left + e, top: q.top + e, width: q.width, height: q.height }).png().toBuffer();
  const info2 = await sharp(enquadrada).resize(LADO, LADO, { kernel: "lanczos3" }).webp({ quality: 82, alphaQuality: 90, effort: 6 }).toFile(arquivo);
  return { arquivo, bytes: info2.size, fracaoFundo: r.fracaoFundo };
}

if (import.meta.main) {
  const pedidos = process.argv.slice(2);
  const ids = pedidos.length > 0 ? pedidos : readdirSync(ORIGEM).filter((f) => f.endsWith(".png")).map((f) => basename(f, ".png"));
  for (const id of ids) {
    const r = await preparar(id);
    console.log(`${id}: ${(r.bytes / 1024).toFixed(1)} KB, fundo ${(r.fracaoFundo * 100).toFixed(1)}%`);
  }
}
