/**
 * Peças visuais da tela da cadeia: pílula de estado, células de enchimento do estoque e a linha da
 * evolução do estoque nos últimos dias. Só desenho: nenhuma regra mora aqui.
 */
import type { Estado, MateriaPrima } from "./modelo";
import { estoqueEmAlerta, fracaoDoEstoque, unidadeCurta } from "./modelo";
import { formatarNumero } from "../../formato";

export const CELULAS = 14;
const LARGURA_SPARK = 120;
const ALTURA_SPARK = 16;
/** Dias que cabem na linha (o motor guarda no máximo estes). */
const DIAS_NA_LINHA = 30;

export function Pilula({ estado }: { estado: Estado }) {
  return <span className={`j-pilula ${estado.classe}`}>{estado.texto}</span>;
}

/** Quantas das 14 células acendem para a fração (arredondando; fração 0 apaga todas, 1 acende todas). */
export const celulasAcesas = (fracao: number) => Math.round(Math.min(1, Math.max(0, fracao)) * CELULAS);

export function Celulas({ fracao, baixo = false }: { fracao: number; baixo?: boolean }) {
  const acesas = celulasAcesas(fracao);
  return (
    <span className="j-celulas" aria-hidden="true">
      {Array.from({ length: CELULAS }, (_, k) => (
        <i key={k} className={k < acesas ? (baixo ? "baixo" : "on") : ""} />
      ))}
    </span>
  );
}

/** Pontos (x, y) da linha: a série mais recente fica à direita; 1 = no teto da capacidade. */
export function pontosDaSerie(serie: readonly number[]): [number, number][] {
  const passo = LARGURA_SPARK / (DIAS_NA_LINHA - 1);
  return serie.slice(-DIAS_NA_LINHA).map((v, k, a) => [LARGURA_SPARK - (a.length - 1 - k) * passo, ALTURA_SPARK - 1 - Math.min(1, Math.max(0, v)) * (ALTURA_SPARK - 2)]);
}

export function Spark({ serie, cheio }: { serie: readonly number[]; cheio: boolean }) {
  const pts = pontosDaSerie(serie);
  const linha = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = pts.length > 0 ? `${pts[0]![0].toFixed(1)},${ALTURA_SPARK - 1} ${linha} ${LARGURA_SPARK},${ALTURA_SPARK - 1}` : "";
  return (
    <svg className={`j-spark${cheio ? " cheio" : ""}`} viewBox={`0 0 ${LARGURA_SPARK} ${ALTURA_SPARK}`} preserveAspectRatio="none" aria-hidden="true">
      <line className="teto" x1="0" x2={LARGURA_SPARK} y1="1" y2="1" />
      <polygon className="area" points={area} />
      <polyline className="linha" points={linha} />
    </svg>
  );
}

/** Uma matéria-prima no cartão da fazenda: nome (vermelho depois de 3 dias cheio), células, quantidade e linha de evolução. */
export function LinhaDeEstoque({ m, saida }: { m: MateriaPrima; saida?: string }) {
  const alerta = estoqueEmAlerta(m);
  return (
    <span className="j-bloco-est">
      <span className="j-linha-est" data-saida={saida}>
        <span className={`nome${alerta ? " cheio" : ""}`} title={alerta ? `Estoque em 100% há ${m.diasCheio} dias` : undefined}>
          {m.nome}
        </span>
        <Celulas fracao={fracaoDoEstoque(m)} />
        <span className="qtd">
          {formatarNumero(m.estoque.quantidade)} {unidadeCurta(m.unidade)}
        </span>
      </span>
      <Spark serie={m.serie} cheio={alerta} />
    </span>
  );
}
