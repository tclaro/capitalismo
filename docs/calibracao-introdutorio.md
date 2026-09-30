# Calibração do preset `introdutorio/padrao`

> Preset: `pacotes/catalogo/src/presets/introdutorio.ts` (**versão 0.2.0, aprovada em 29/09/2026**).
> Referências: seções 6 e 10 do `documento-de-design-simulador.md`; decisões 3 (recorte), 7 (pontuação) e 13 (valores iniciais).
> Relatório aprovado: [`docs/balanceamento/introdutorio-padrao/`](balanceamento/introdutorio-padrao/) (confronto equilibrado, extremo e subconjuntos).

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
