/**
 * Participação no mercado de um produto: rosca de ontem na frente (a fatia da equipe destacada,
 * dica com nome e percentual no mouse ou no teclado) e as linhas semanais de todas as empresas do
 * mercado ao fundo, discretas. As fatias têm chave fixa por empresa: a cada dia só muda o desenho,
 * então a dica aberta não some na virada do dia. O eixo das linhas só cresce.
 */
import type { ParticipacaoSemanal, VisaoAluno } from "@simulador/compartilhado";
import { useRef, useState } from "react";
import { formatarPercentual } from "../formato";
import { empresasDoMercado, fatiasDoProduto, pctInteiro, seriesDeParticipacao, topoDoEixo } from "./jogo";

const R = 46;
const r = 28;

function arco(cx: number, cy: number, a0: number, a1: number, cheio: boolean): string {
  if (cheio) return `M${cx},${cy - R} A${R},${R} 0 1 1 ${cx - 0.01},${cy - R} L${cx - 0.01},${cy - r} A${r},${r} 0 1 0 ${cx},${cy - r} Z`;
  const pt = (raio: number, a: number) => `${(cx + raio * Math.cos(a)).toFixed(2)},${(cy + raio * Math.sin(a)).toFixed(2)}`;
  const g = a1 - a0 > Math.PI ? 1 : 0;
  return `M${pt(R, a0)} A${R},${R} 0 ${g} 1 ${pt(R, a1)} L${pt(r, a1)} A${r},${r} 0 ${g} 0 ${pt(r, a0)} Z`;
}

export function Participacao({ v, produto, mercado }: { v: VisaoAluno; produto: string; mercado: readonly ParticipacaoSemanal[] }) {
  const empresas = empresasDoMercado(v);
  const fatias = fatiasDoProduto(v, produto);
  const [sobre, setSobre] = useState<{ empresa: string; x: number; y: number } | null>(null);
  const caixa = useRef<HTMLDivElement>(null);
  const topos = useRef(new Map<string, number>());

  // Desenho de cada fatia (em ordem fixa), com a da equipe um pouco para fora.
  let a0 = -Math.PI / 2;
  const desenhos = new Map<string, { d: string; fracao: number }>();
  for (const f of fatias) {
    const a1 = a0 + f.fracao * 2 * Math.PI;
    const sai = f.empresa.nos && f.fracao < 0.9995 ? 4 : 0;
    const meio = (a0 + a1) / 2;
    desenhos.set(f.empresa.id, { d: arco(50 + sai * Math.cos(meio), 50 + sai * Math.sin(meio), a0, a1, f.fracao >= 0.9995), fracao: f.fracao });
    a0 = a1;
  }
  const nossa = fatias.find((f) => f.empresa.nos);
  const nomeDe = (id: string) => {
    const e = empresas.find((x) => x.id === id);
    return e ? (e.nos ? "Vocês" : e.nome) : id;
  };
  const textoDa = (id: string) => `${nomeDe(id)} · ${formatarPercentual(desenhos.get(id)?.fracao ?? 0)}`;

  // Linhas: semanas fechadas + o ponto de ontem.
  const { semanas, valores } = seriesDeParticipacao(mercado, produto, empresas.map((e) => e.id));
  const pontos = semanas.length;
  const series = empresas.map((e) => {
    const atual = fatias.find((f) => f.empresa.id === e.id)?.fracao ?? 0;
    return { e, valores: [...(valores[e.id] ?? []), atual] };
  });
  const topo = topoDoEixo(topos.current.get(produto) ?? 0, series.flatMap((s) => s.valores));
  topos.current.set(produto, topo);
  const W = 600;
  const H = 300;
  const x = (i: number) => (pontos === 0 ? W : (i / pontos) * W);
  const y = (val: number) => H - 6 - (val / topo) * (H - 18);
  const grade: number[] = [];
  for (let g = 0; g <= topo + 1e-9; g += 0.1) grade.push(Math.round(g * 10) / 10);

  const mostrar = (empresa: string, cx: number, cy: number) => {
    const b = caixa.current?.getBoundingClientRect();
    setSobre({ empresa, x: b ? cx - b.left : 0, y: b ? cy - b.top : 0 });
  };

  return (
    <div className="j-pizza" ref={caixa} onPointerLeave={() => setSobre(null)}>
      <div className="j-linhas-fundo" aria-hidden="true">
        {pontos > 0 && (
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
            {grade.map((g) => (
              <line key={g} x1="0" x2={W} y1={y(g)} y2={y(g)} stroke="var(--cor-borda)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
            ))}
            {series
              .filter((s) => s.valores.some((val) => val > 0))
              .map((s) => (
                <polyline
                  key={s.e.id}
                  points={s.valores.map((val, i) => `${x(i).toFixed(1)},${y(val).toFixed(1)}`).join(" ")}
                  fill="none"
                  stroke={s.e.cor}
                  strokeWidth={s.e.nos ? 3 : 1.6}
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
          </svg>
        )}
        {pontos > 0 &&
          grade.map((g) => (
            <span key={g} className="j-eixo" style={{ top: `${((y(g) / H) * 100).toFixed(1)}%` }}>
              {pctInteiro(g)}
            </span>
          ))}
      </div>
      {fatias.length === 0 ? (
        <p className="j-dica j-sem-vendas">Ninguém vendeu este produto ontem.</p>
      ) : (
        <svg className="j-rosca" viewBox="-6 -6 112 112" role="group" aria-label={`Participação no mercado ontem${nossa ? `: vocês com ${pctInteiro(nossa.fracao)}` : ""}`}>
          {empresas.map((e) => {
            const d = desenhos.get(e.id);
            return (
              <path
                key={e.id}
                className={`j-fatia${e.nos ? " nos" : ""}${sobre?.empresa === e.id ? " ativa" : ""}`}
                data-empresa={e.id}
                d={d?.d ?? ""}
                fill={e.cor}
                tabIndex={d ? 0 : -1}
                aria-label={d ? textoDa(e.id) : undefined}
                onPointerMove={(ev) => mostrar(e.id, ev.clientX, ev.clientY)}
                onFocus={(ev) => {
                  const b = (ev.currentTarget as SVGPathElement).getBoundingClientRect();
                  mostrar(e.id, b.left + b.width / 2, b.top + b.height / 2);
                }}
                onBlur={() => setSobre(null)}
              />
            );
          })}
          <text x="50" y="51" textAnchor="middle" fontSize="14" fontWeight="800" fill="var(--cor-texto)">
            {nossa ? pctInteiro(nossa.fracao) : "0%"}
          </text>
          <text x="50" y="62" textAnchor="middle" fontSize="7" fill="var(--cor-texto-2)">
            vocês
          </text>
        </svg>
      )}
      {sobre && desenhos.has(sobre.empresa) && (
        <div className="j-dica-fatia" role="tooltip" style={{ left: sobre.x + 14, top: Math.max(4, sobre.y - 36) }}>
          {textoDa(sobre.empresa)}
        </div>
      )}
    </div>
  );
}
