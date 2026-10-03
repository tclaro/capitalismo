/**
 * Relatórios do balanceamento: Markdown (para leitura e aprovação) e CSV (uma linha por empresa por partida).
 */
import type { ResultadoSimulacao } from "@simulador/motor";
import { LIMITES, MES_DE_CHECAGEM, type Metricas, porcentagem as pct } from "./metricas";

export interface InfoExecucao {
  presetId: string;
  presetVersao: string;
  versaoMotor: string;
  versaoCatalogo: string;
  confronto: string;
  partidas: number;
  meses: number;
  prefixo: string;
  trabalhadores: number;
  duracaoSegundos: number;
  ticksSimulados: number;
  /** Confronto só de diagnóstico: o resultado não entra na aprovação. */
  diagnostico?: boolean;
}

const reais = (x: number) => `R$ ${x.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;

export function relatorioMarkdown(info: InfoExecucao, metricas: Metricas, extras: { economiaDasAtividades?: string } = {}): string {
  const linhas: string[] = [];
  linhas.push(`# Balanceamento — ${info.presetId} (${info.confronto})`, "");
  if (info.diagnostico) {
    linhas.push(
      `**Confronto de diagnóstico — não entra na aprovação.** Os critérios da seção 10.4 valem para o confronto equilibrado; ` +
        `aqui aparecem só como referência (${metricas.criterios.filter((c) => c.passou).length} de ${metricas.criterios.length} atendidos).`,
      "",
    );
  } else {
    const deAprovacao = metricas.criterios.filter((c) => !c.diagnostico);
    const diagnosticos = metricas.criterios.length - deAprovacao.length;
    linhas.push(
      `**Resultado: ${metricas.aprovado ? "APROVADO" : "REPROVADO"}** (${deAprovacao.filter((c) => c.passou).length} de ${deAprovacao.length} critérios de aprovação` +
        `${diagnosticos > 0 ? `; ${diagnosticos} de diagnóstico` : ""})`,
      "",
    );
  }
  linhas.push("| Execução | |", "|---|---|");
  linhas.push(`| Preset | \`${info.presetId}\` v${info.presetVersao} |`);
  linhas.push(`| Motor / catálogo | ${info.versaoMotor} / ${info.versaoCatalogo} |`);
  linhas.push(`| Confronto | ${info.confronto} |`);
  linhas.push(`| Partidas | ${info.partidas} (sementes \`${info.prefixo}-0001\` …) |`);
  linhas.push(`| Horizonte | ${info.meses} meses (checagem de diferenças no mês ${MES_DE_CHECAGEM}) |`);
  linhas.push(`| Desempenho | ${info.ticksSimulados.toLocaleString("pt-BR")} ticks em ${info.duracaoSegundos.toFixed(1)} s (${Math.round(info.ticksSimulados / Math.max(info.duracaoSegundos, 1e-9)).toLocaleString("pt-BR")} ticks/s, ${info.trabalhadores} worker(s)) |`);
  linhas.push("");

  linhas.push(info.confronto === "cadeia" ? "## Critérios de aceite da cadeia (entrega 9; os gerais da seção 10.4 ficam como diagnóstico)" : "## Critérios de aceite (seção 10.4)", "");
  linhas.push("| Critério | Valor | Limite | Situação |", "|---|---|---|---|");
  const situacao = (c: Metricas["criterios"][number]) => (c.passou ? "ok" : c.diagnostico ? "fora (diagnóstico)" : "**FALHOU**");
  for (const c of metricas.criterios) linhas.push(`| ${c.descricao}${c.diagnostico ? " *(diagnóstico)*" : ""} | ${c.valor} | ${c.limite} | ${situacao(c)} |`);
  linhas.push("");

  linhas.push("## Por estratégia", "");
  linhas.push("| Estratégia | Vitórias | Posição média | Lucro médio | Lucro mediano | Receita média | Participação média | Crédito prolongado |");
  linhas.push("|---|---|---|---|---|---|---|---|");
  for (const m of [...metricas.porEstrategia].sort((a, b) => b.taxaVitoria - a.taxaVitoria)) {
    linhas.push(
      `| ${m.estrategia} | ${pct(m.taxaVitoria)} (${m.vitorias}/${m.partidas}) | ${m.posicaoMedia.toFixed(2)} | ${reais(m.lucroMedio)} | ${reais(m.lucroMediano)} | ${reais(m.receitaMedia)} | ${pct(m.participacaoMedia)} | ${pct(m.fracaoCreditoProlongado)} |`,
    );
  }
  linhas.push("");
  linhas.push(
    `Diferenças visíveis no mês ${MES_DE_CHECAGEM}: ${pct(metricas.fracaoPartidasComDiferencaVisivel)} das partidas. ` +
      `Empresas razoáveis com ≥ ${LIMITES.mesesDeCreditoProlongado} meses seguidos de crédito emergencial: ${pct(metricas.fracaoRazoaveisComCreditoProlongado)}.`,
    "",
  );
  linhas.push("Vitória = maior lucro acumulado no mercado ao fim do horizonte (decisão 7); empate pelo id da empresa.", "");
  if (extras.economiaDasAtividades) {
    linhas.push("## Economia das atividades (valores base, só custo)", "", extras.economiaDasAtividades, "");
    linhas.push("Líquido = uso × (valor ao preço do fornecedor − custo variável) − custo fixo, à capacidade nominal. Não inclui o efeito da qualidade (o ganho de qualidade com a experiência é um bônus a mais). Payback = capex ÷ líquido.", "");
  }
  return linhas.join("\n");
}

const CABECALHO_CSV = [
  "semente",
  "mercado",
  "empresa",
  "estrategia",
  "posicao",
  "venceu",
  "pontuacao",
  "lucro_acumulado_centavos",
  "receita_acumulada_centavos",
  "participacao_receita",
  `participacao_mes_${MES_DE_CHECAGEM}`,
  "credito_final_centavos",
  "meses_com_credito",
  "maior_sequencia_credito",
  "intensidade",
];

const campoCsv = (v: string | number) => {
  const s = String(v);
  return /[",;\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};

export function relatorioCsv(resultados: readonly ResultadoSimulacao[]): string {
  const linhas = [CABECALHO_CSV.join(",")];
  for (const r of resultados) {
    for (const e of r.empresas) {
      const venceu = r.mercados.find((m) => m.id === e.mercado)!.vencedor === e.id;
      linhas.push(
        [
          r.semente,
          e.mercado,
          e.nome,
          e.estrategia,
          e.posicao,
          venceu ? 1 : 0,
          e.pontuacao.toFixed(2),
          e.lucroAcumulado,
          e.receitaAcumulada,
          e.participacaoReceita.toFixed(6),
          (e.fotografias[MES_DE_CHECAGEM]?.participacaoReceita ?? e.participacaoReceita).toFixed(6),
          e.creditoFinal,
          e.mesesComCredito,
          e.maiorSequenciaDeMesesComCredito,
          JSON.stringify(e.intensidade),
        ]
          .map(campoCsv)
          .join(","),
      );
    }
  }
  return `${linhas.join("\n")}\n`;
}
