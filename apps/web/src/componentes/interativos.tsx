/**
 * Componentes interativos comuns: ajuda contextual "?", abas e gráfico de linhas em SVG.
 */
import { CircleHelp } from "lucide-react";
import { type ReactNode, useId, useState } from "react";

/** Ajuda contextual padronizada (seção 8.1): o conceito da aula por trás da decisão. */
export function Ajuda({ titulo, children }: { titulo: string; children: ReactNode }) {
  const [aberta, setAberta] = useState(false);
  const id = useId();
  return (
    <span className="ajuda">
      <button type="button" className="botao-ajuda" aria-expanded={aberta} aria-controls={id} aria-label={`Ajuda: ${titulo}`} onClick={() => setAberta((a) => !a)}>
        <CircleHelp aria-hidden size={16} />
      </button>
      {aberta && (
        <span id={id} className="texto-ajuda" role="note">
          {children}
        </span>
      )}
    </span>
  );
}

export interface Aba {
  id: string;
  rotulo: string;
  selo?: string | number | null;
}

/** Abas com teclado (setas, Home, End), no padrão WAI-ARIA. */
export function Abas({ abas, atual, aoMudar, rotulo }: { abas: readonly Aba[]; atual: string; aoMudar: (id: string) => void; rotulo: string }) {
  const indice = abas.findIndex((a) => a.id === atual);
  const ir = (i: number) => {
    const a = abas[(i + abas.length) % abas.length]!;
    aoMudar(a.id);
    document.getElementById(`aba-${a.id}`)?.focus();
  };
  return (
    <div role="tablist" aria-label={rotulo} className="abas">
      {abas.map((a, i) => (
        <button
          key={a.id}
          id={`aba-${a.id}`}
          type="button"
          role="tab"
          aria-selected={a.id === atual}
          aria-controls={`painel-${a.id}`}
          tabIndex={a.id === atual ? 0 : -1}
          className="aba"
          onClick={() => aoMudar(a.id)}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") ir(indice + 1);
            else if (e.key === "ArrowLeft") ir(indice - 1);
            else if (e.key === "Home") ir(0);
            else if (e.key === "End") ir(abas.length - 1);
            else return;
            e.preventDefault();
          }}
        >
          {a.rotulo}
          {a.selo !== undefined && a.selo !== null && a.selo !== 0 && <span className="selo">{a.selo}</span>}
        </button>
      ))}
    </div>
  );
}

export function PainelDaAba({ id, children }: { id: string; children: ReactNode }) {
  return (
    <div role="tabpanel" id={`painel-${id}`} aria-labelledby={`aba-${id}`} className="pilha">
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Gráfico de linhas
// ---------------------------------------------------------------------------------------------

export interface Serie {
  nome: string;
  cor: string;
  /** Pontos [x, y]; x crescente. */
  pontos: readonly (readonly [number, number])[];
  /** Tracejado: distingue séries sem depender só da cor. */
  tracejado?: boolean;
}

/** Escala "bonita" para o eixo: limites arredondados que contêm os dados. */
export function escalaDoEixo(min: number, max: number, marcas = 4): { min: number; max: number; passo: number } {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { min: 0, max: 1, passo: 0.25 };
  if (min === max) {
    const folga = Math.abs(min) > 0 ? Math.abs(min) * 0.1 : 1;
    min -= folga;
    max += folga;
  }
  const bruto = (max - min) / marcas;
  const potencia = 10 ** Math.floor(Math.log10(bruto));
  const passo = [1, 2, 2.5, 5, 10].map((m) => m * potencia).find((p) => p >= bruto)!;
  return { min: Math.floor(min / passo) * passo, max: Math.ceil(max / passo) * passo, passo };
}

export function GraficoLinhas({
  titulo,
  series,
  formatarY,
  formatarX = (x) => String(x),
  altura = 200,
}: {
  titulo: string;
  series: readonly Serie[];
  formatarY: (y: number) => string;
  formatarX?: (x: number) => string;
  altura?: number;
}) {
  const largura = 560;
  const m = { esq: 72, dir: 12, cima: 12, baixo: 28 };
  const todos = series.flatMap((s) => s.pontos);
  if (todos.length === 0) return <p className="texto-2 pequeno">{titulo}: ainda sem dados.</p>;
  const xs = todos.map((p) => p[0]);
  const ys = todos.map((p) => p[1]);
  const [xMin, xMax] = [Math.min(...xs), Math.max(...xs)];
  const eixo = escalaDoEixo(Math.min(0, ...ys), Math.max(...ys));
  const px = (x: number) => m.esq + (xMax === xMin ? 0.5 : (x - xMin) / (xMax - xMin)) * (largura - m.esq - m.dir);
  const py = (y: number) => m.cima + (1 - (y - eixo.min) / (eixo.max - eixo.min)) * (altura - m.cima - m.baixo);
  const marcasY: number[] = [];
  for (let y = eixo.min; y <= eixo.max + eixo.passo / 2; y += eixo.passo) marcasY.push(Math.round(y * 1e6) / 1e6);
  const xsUnicos = [...new Set(xs)].sort((a, b) => a - b);
  const marcasX = xsUnicos.length <= 8 ? xsUnicos : xsUnicos.filter((_, i) => i % Math.ceil(xsUnicos.length / 8) === 0);

  return (
    <figure className="grafico">
      <figcaption>{titulo}</figcaption>
      <svg viewBox={`0 0 ${largura} ${altura}`} role="img" aria-label={`${titulo}. Dados na tabela a seguir.`} preserveAspectRatio="xMidYMid meet">
        {marcasY.map((y) => (
          <g key={`y${y}`}>
            <line x1={m.esq} x2={largura - m.dir} y1={py(y)} y2={py(y)} className={y === 0 ? "eixo-zero" : "grade-linha"} />
            <text x={m.esq - 6} y={py(y)} textAnchor="end" dominantBaseline="middle" className="rotulo-eixo">
              {formatarY(y)}
            </text>
          </g>
        ))}
        {marcasX.map((x) => (
          <text key={`x${x}`} x={px(x)} y={altura - 8} textAnchor="middle" className="rotulo-eixo">
            {formatarX(x)}
          </text>
        ))}
        {series.map((s) => (
          <g key={s.nome}>
            <polyline
              fill="none"
              stroke={s.cor}
              strokeWidth={2.5}
              strokeDasharray={s.tracejado ? "6 4" : undefined}
              points={s.pontos.map(([x, y]) => `${px(x)},${py(y)}`).join(" ")}
            />
            {s.pontos.map(([x, y]) => (
              <circle key={x} cx={px(x)} cy={py(y)} r={3} fill={s.cor} />
            ))}
          </g>
        ))}
      </svg>
      {series.length > 1 && (
        <ul className="legenda">
          {series.map((s) => (
            <li key={s.nome}>
              <svg width="28" height="10" aria-hidden>
                <line x1="0" x2="28" y1="5" y2="5" stroke={s.cor} strokeWidth={3} strokeDasharray={s.tracejado ? "6 4" : undefined} />
              </svg>
              {s.nome}
            </li>
          ))}
        </ul>
      )}
      <table className="sr-only">
        <caption>{titulo}</caption>
        <thead>
          <tr>
            <th scope="col">x</th>
            {series.map((s) => (
              <th key={s.nome} scope="col">
                {s.nome}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {xsUnicos.map((x) => (
            <tr key={x}>
              <th scope="row">{formatarX(x)}</th>
              {series.map((s) => {
                const p = s.pontos.find((q) => q[0] === x);
                return <td key={s.nome}>{p ? formatarY(p[1]) : "—"}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
