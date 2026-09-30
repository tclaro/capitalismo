# Calibração do preset `introdutorio/padrao`

> Preset: `pacotes/catalogo/src/presets/introdutorio.ts` (**versão 0.2.0 — jogável, com pendência**).
> Referências: seções 6 e 10 do `documento-de-design-simulador.md`; decisões 3 (recorte), 7 (pontuação), 13 (valores iniciais) e **26 (fronteira tecnológica, em aberto)**.
> Relatórios: [`docs/balanceamento/introdutorio-padrao/`](balanceamento/introdutorio-padrao/).
>
> **Estado em 30/09/2026 (ver seção 6):** a v0.2.0 foi aprovada contra os robôs da época. A melhor resposta mostrou que aqueles robôs jogavam longe do ótimo; com os robôs ajustados, o premium vence ~77%. A recalibração (candidato v0.3.0) equilibrou o confronto, mas tornando a P&D inútil. Nenhuma combinação concilia as duas coisas no modelo atual; a correção proposta é a fronteira tecnológica. Decisão do autor: manter a v0.2.0 (P&D compensa) para os testes com alunos e voltar ao tema depois.

## 1. Origem dos valores

| Origem | O quê |
|---|---|
| **Manual** (Apêndice B do Capitalism II) | Receitas: insumos, proporções entre insumos, unidades por lote, peso de cada insumo na qualidade e peso da tecnologia |
| **Manual, convertido** | Quantidades convertidas de *quart* para litro (× 0,946352946) e de *lb* para kg (× 0,45359237) |
| **Manual, conceito** | Curva de aprendizado da fábrica (unidade de fabricação com nível de experiência) e tecnologia relativa à maior do mercado; os números são nossos |
| **Hipótese calibrada** | Todo o resto: preços, custos, consumo, elasticidade, pesos da nota (preço/qualidade/marca), capacidade, parâmetros de marca, P&D, difusão, curva de aprendizado, vendas e finanças |

O manual **não publica** os pesos da nota por produto (*price/quality/brand concern*), o preço padrão nem a elasticidade. Esses valores foram definidos a partir da intenção didática da seção 2.

Moeda: reais (R$). No código, o dinheiro é guardado em centavos inteiros.

## 2. Intenção didática por produto

| Produto | Intenção | Pesos da nota (Q / M / P) | Elasticidade |
|---|---|---|---|
| Leite engarrafado | Necessidade, decidida por preço | 30 / 10 / 60 | 0,3 |
| Iogurte | Marca pesa mais que preço | 35 / 40 / 25 | 0,9 |
| Sorvete | Supérfluo; marca pesa mais | 30 / 45 / 25 | 1,4 |
| Sapato | Decidido por qualidade | 50 / 25 / 25 | 1,0 |
| Carteira | Marca e qualidade | 35 / 40 / 25 | 1,2 |

## 3. Receitas (manual)

| Produto | Lote | Insumos por lote (métrico) · peso na qualidade | Tecnologia |
|---|---|---|---|
| Leite engarrafado | 8 garrafas | leite 1,89 L · 65%; vidro 0,45 kg · 5% | 30% |
| Iogurte | 8 potes | leite 1,89 L · 20%; morango 0,45 kg · 20%; ácido cítrico 0,45 kg · 10% | 50% |
| Sorvete | 20 potes | leite 1,89 L · 20%; morango 0,91 kg · 20%; açúcar 0,45 kg · 10% | 50% |
| Sapato | 4 pares | couro 2,27 kg · 45%; tecido 0,45 kg · 5% | 50% |
| Carteira | 3 unidades | couro 0,45 kg · 50% | 50% |

Os números por lote são abstrações do jogo, não fichas técnicas reais. Um exemplo: 1,89 L de leite para 8 garrafas. O que importa para o modelo é a proporção de custo e de qualidade entre os insumos.

## 4. Economia calibrada (valores base, sem a variação por semente)

**Mercado:** 100 mil habitantes (±15% por semente); 7 empresas no confronto padrão de balanceamento.

**Variação por semente** (seção 10.3):
- P_ref: ±10%;
- custos (fornecedor pronto, insumos e mão de obra): **±20%**, para que existam cenários em que fabricar compensa mais ou menos;
- pesos da nota: ±15%;
- qualidade do fornecedor: ±10%.

**Alvos de desenho:**
- produto pronto a **70% do P_ref**;
- fabricar, com fábrica experiente, a **50% do P_ref**;
- capex para **payback de ~12 meses** com a fábrica experiente e 1/7 da demanda.

**Insumos** (fornecedor externo, qualidade 50): leite R$ 2,40/L; vidro R$ 4,00/kg; morango R$ 15,00/kg; ácido cítrico R$ 12,00/kg; açúcar R$ 4,50/kg; couro R$ 60,00/kg; tecido R$ 25,00/kg.

**Produtos finais.** Nas colunas "ganho" e "payback", cada empresa fica com 1/7 da demanda e a fábrica já é experiente:

| Produto | P_ref | Pronto (Q50) | Insumos/un | Fabricar/un (experiente) | Fabricar/un (fábrica nova) | Demanda/mês | Ganho de fabricar/mês | Custo fixo | Capex | Payback |
|---|---|---|---|---|---|---|---|---|---|---|
| Leite engarrafado | 6,00 | 4,20 | 0,79 | 3,00 | 4,33 | 300.000 | R$ 51.231 | R$ 15.000 | R$ 435.000 | 12,0 meses |
| Iogurte | 9,00 | 6,30 | 2,10 | 4,50 | 5,94 | 100.000 | R$ 25.733 | R$ 8.000 | R$ 213.000 | 12,0 meses |
| Sorvete | 18,00 | 12,60 | 1,01 | 9,00 | 13,79 | 40.000 | R$ 20.574 | R$ 8.000 | R$ 151.000 | 12,0 meses |
| Sapato | 180,00 | 126,00 | 36,85 | 90,00 | 121,89 | 4.000 | R$ 20.569 | R$ 7.000 | R$ 163.000 | 12,0 meses |
| Carteira | 80,00 | 56,00 | 9,07 | 40,00 | 58,56 | 2.000 | R$ 4.571 | R$ 2.000 | R$ 31.000 | 12,1 meses |

**Curva de aprendizado (curva "forte"):**

| Nível | Experiência (meses à capacidade nominal) | Capacidade | Mão de obra |
|---|---|---|---|
| 0 (fábrica nova) | 0 | 50% | 160% |
| 1 | 1 | 65% | 135% |
| 2 | 3 | 85% | 115% |
| 3 (experiente) | 6 | 100% | 100% |

**Leitura didática:**
- Uma fábrica nova produz **mais caro que comprar pronto** (leite: R$ 4,33 contra R$ 4,20) e com metade da capacidade.
- Só a fábrica experiente chega ao custo baixo. Fabricar é um investimento com período de maturação: compensa para quem produz volume por tempo suficiente.
- Comprar pronto dá margem imediata (P_ref − pronto = 30%) sem investimento.

**Demais parâmetros:**

| Grupo | Valores | Observação |
|---|---|---|
| Pontos de venda | 2 iniciais; abertura R$ 80 mil, 15 dias; R$ 12 mil/mês; 800 unidades-equivalentes/dia | O sapato consome 5× e a carteira 2× a capacidade por unidade |
| Marca | Reconhecimento inicial 10; decaimento **15%/mês**; ganho de até 25%/mês do que falta; verba de referência **R$ 0,50/hab/mês** (R$ 50 mil) | A marca decai mais rápido e custa mais caro que no valor inicial |
| Fidelidade | Inicial 0; mínimo −50; decaimento 5%/mês; até 20 pontos/mês; ruptura total −10/mês | Pesos da marca: 50% reconhecimento, 50% fidelidade |
| Tecnologia | Inicial 10; piso de T_max 20; até 5 pontos/mês; verba de referência **R$ 30 mil/mês**; **difusão de 15%/mês** | A difusão impede a corrida sem fim da tecnologia |
| Vendas | β = 0,1; perda na substituição 50%; teto de preço 2 × P_ref | 10 pontos de nota a mais ≈ 2,7× a participação |
| Finanças | Caixa inicial R$ 1,2 mi; IR 34% com trava de compensação de 30%; crédito emergencial 8%/mês; penalidade por falência 0 | |

## 5. Histórico da calibração (fase 0, 29/09/2026)

Métrica de cada rodada: taxa de vitória no confronto equilibrado com as 7 estratégias (vitória = maior lucro acumulado em 24 meses).

| Rodada | Mudança | Resultado |
|---|---|---|
| Valores iniciais (v0.1.0) | — | Premium vence 83%; equilibrada 17%; demais 0%. Diagnóstico: a tecnologia relativa à líder cresce sem limite, e quem fabrica sem P&D fica com qualidade **abaixo** do pronto (~40 × 50). A marca é sabotada: com qualidade abaixo da média, a publicidade acelera a perda de fidelidade |
| Robôs (antes da calibração) | Três defeitos corrigidos: preço abaixo do custo do abastecimento, compra acima da capacidade de venda, fábricas acima do caixa na mesma rodada | Nenhum robô razoável em espiral de crédito |
| Motor: difusão tecnológica | Parâmetro novo; 10%/mês | Premium 60%, equilibrada 33%, marca 7% |
| Economia de fabricação | Fabricar custando ~70% do pronto (antes ~50%) | Piorou: premium 80%. O custo maior corta mais a margem de quem cobra perto do mercado do que a do premium |
| Alvos por fração do P_ref | Pronto 68% e fabricado 52% do P_ref; difusão 25%; verba de P&D dobrada | O pêndulo foi para o outro lado: marca 72%, premium 7% |
| Robôs: competência | Preço baixo com margem de 15–35% (a de 4–12% não dava lucro); revenda com preço até 10% abaixo do mercado e mais publicidade | Marca 43%, premium 30%, equilibrada 25%; preço baixo e revenda ainda perto de 0% |
| Varredura 1 | 324 combinações × 40 partidas (preço pronto, custo de fabricar, difusão, verba de P&D, verba de publicidade, decaimento da marca) | Região ampla em que tudo passa, **menos a revenda: 0% em todas as combinações**, mesmo em partidas de 6 meses. Na camada 1, ela é o "preço baixo" sem a opção de fabricar: logicamente dominada |
| Motor: curva de aprendizado | Fábrica com níveis de experiência (manual do Capitalism II) | — |
| Critério da revenda (seção 10.4) | Na camada 1, referência: lucro acima da passiva e ao menos tantas vitórias | — |
| Varredura 2 | 288 combinações × 40 partidas, com curva "moderada" ou "forte" | 54 combinações aprovadas; a revenda passa a vencer 3–7% |
| Confirmação | 5 candidatos × 200 partidas com sementes novas, nos 3 confrontos | Escolhido o K2 (curva forte, difusão 15%, P&D R$ 30 mil, publicidade R$ 0,50/hab, decaimento da marca 15%) |
| **Relatório oficial (v0.2.0)** | 500 partidas × 24 meses, sementes `balanceamento-*` (não usadas na calibração) | **Aprovado**: marca 38,6%, premium 22,8%, preço baixo 18,2%, equilibrada 16,6%, revenda 3,8% (lucro R$ 1,61 mi contra R$ 0,86 mi da passiva); passiva e aleatória 0%; preço mínimo (extremo) 0% |

**Pontos de atenção:**
- **Marca perto do limite.** Com 38,6% no confronto equilibrado, ela está a 1,4 ponto do limite de 40%. Qualquer ajuste futuro que favoreça a marca deve ser acompanhado de nova rodada do balanceamento.
- **Estratégia depende do horizonte.** Nos testes por horizonte (versão anterior, sem curva de aprendizado), o preço baixo dominava partidas de 6 meses (69%), e a marca só vencia em partidas longas. Vale repetir para 12 meses se o professor for usar partidas curtas.
- **Confronto por subconjuntos (4–5 empresas) é só diagnóstico.** Nele a marca vence 49% dos mercados. Com poucos concorrentes de verdade (a passiva e a aleatória quase nunca vencem), a taxa "justa" de vitória já passa de 30%, e o limite de 40% da seção 10.4 não se aplica.

## 6. Melhor resposta e pendência da P&D (30/09/2026)

### 6.1 Melhor resposta sobre a v0.2.0 (robôs da época)

Um robô otimizado por busca em grade contra os outros seis vencia muito: equilibrada 100%, premium 95,8%, marca 87,5%, preço baixo 75,0%, revenda 25,0% (24 partidas por ponto). Em todas, o ótimo era **preço no mercado ou um pouco abaixo, com mais publicidade** que os robôs padrão. Conclusão: os robôs jogavam longe do ótimo, e a aprovação da v0.2.0 valia para estratégias mal jogadas.

**Robôs ajustados** (`pacotes/motor/src/robos/estrategias.ts`, mantendo a identidade de cada estratégia):

| Estratégia | Faixas antigas | Faixas novas |
|---|---|---|
| Preço baixo | margem 15–35%, publicidade 0–2% | margem 28–45%, publicidade 2–5%, payback 12–18 meses |
| Premium | prêmio 15–35%, P&D 8–15%, publicidade 2–6% | prêmio 3–12%, P&D 5–9%, publicidade 5–10% |
| Marca | prêmio 3–12%, publicidade 12–22% | prêmio −3% a +5%, publicidade 14–22%, payback 12–16 meses |
| Equilibrada | ajuste −3% a +5%, publicidade 3–7% | ajuste −8% a 0%, publicidade 6–11%, payback 12–18 meses |
| Revenda | ajuste −10% a +2%, publicidade 3–8% | ajuste −13% a −4%, publicidade 7–13% |

**Com os robôs ajustados, a v0.2.0 deixa de estar equilibrada:** premium 77,5%, equilibrada 9,0%, preço baixo 7,5%, revenda 4,5%, marca 1,5% (200 partidas, sementes `confirmacao-*`).

### 6.2 Candidato v0.3.0: equilibrado, mas com P&D inútil (não adotado)

Terceira varredura (432 combinações) e confirmação: pronto a 66% e fabricado a 55% do P_ref, difusão de 15%/mês, **verba de referência de P&D de R$ 80 mil/mês**, ganho de tecnologia de 5 pontos/mês, publicidade a R$ 0,50/hab, decaimento da marca de 15%/mês, curva forte, capex mínimo de R$ 50 mil.

Valores concretos do candidato (para retomar):

| Produto | Pronto | Mão de obra | Capex | Custo fixo |
|---|---|---|---|---|
| Leite engarrafado | R$ 3,96 | R$ 2,51 | R$ 157.000 | R$ 15.000 |
| Iogurte | R$ 5,94 | R$ 2,85 | R$ 74.000 | R$ 8.000 |
| Sorvete | R$ 11,88 | R$ 8,89 | R$ 50.000 | R$ 8.000 |
| Sapato | R$ 118,80 | R$ 62,15 | R$ 52.000 | R$ 7.000 |
| Carteira | R$ 52,80 | R$ 34,93 | R$ 50.000 | R$ 2.000 |

Relatório oficial do candidato (500 partidas, sementes `balanceamento-*`): **aprovado** no confronto equilibrado (preço baixo 30,6%, marca 30,2%, equilibrada 16,8%, premium 14,0%, revenda 8,4%; passiva e aleatória 0%) e no extremo (preço mínimo 0%).

A melhor resposta com grade estendível mostrou o defeito: **a P&D dá prejuízo em qualquer dose.**

| Verba de P&D (% da receita) | 0% | 2% | 4% | 6% | 9% | 12% |
|---|---|---|---|---|---|---|
| Premium otimizado (vitórias) | 90% | 81% | 71% | 65% | 27% | 15% |
| Equilibrada otimizada (vitórias) | 69% | 52% | 35% | 25% | 8% | 4% |

"Não fazer P&D" é a decisão extrema e trivial que a seção 10.4 manda corrigir. A varredura não viu isso porque só media as taxas de vitória.

Achado útil do mesmo candidato: **a publicidade tem ótimo interior.** As vitórias sobem até ~14% da receita e despencam depois (com 24% ou mais, quase zero; com 30%, prejuízo). Publicidade é decisão de dosagem, não atalho.

### 6.3 Varredura da P&D: o conflito estrutural

36 combinações de verba de referência (R$ 15–60 mil), ganho de tecnologia (3, 5 e 8 pontos/mês) e difusão (10, 15 e 25%/mês), com as demais alavancas do candidato:

| Situação | Combinações |
|---|---|
| Confronto equilibrado aprovado | 14 |
| P&D com ótimo interior (premium e equilibrada) | 1 |
| As duas coisas | **0** |

Quando a P&D compensa, o premium vence 45–57%; quando o confronto fica equilibrado, a P&D não compensa. No modelo atual, a tecnologia relativa à líder cresce sem teto e realimenta a vantagem. Proposta: **fronteira tecnológica** (seção 6.6 do design, decisão 26), com retorno decrescente perto de um teto por produto.

### 6.4 Decisão (30/09/2026)

Manter a **v0.2.0** como preset jogável para os testes com alunos, porque nela P&D, marca e fabricação são decisões que valem a pena. Registrar a limitação: entre robôs ajustados, o premium domina. Retomar a fronteira tecnológica e a recalibração depois dos testes com alunos.

Ferramentas criadas nesta rodada, que ficam para a retomada:
- critério do confronto extremo reduzido ao da seção 10.4;
- melhor resposta com grade estendível e pool fixo de workers (corrige vazamento de memória);
- os scripts de varredura (a transformar em comando da CLI quando o tema voltar).
