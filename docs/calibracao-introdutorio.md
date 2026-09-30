# Calibração do preset `introdutorio/padrao`

> Preset: `pacotes/catalogo/src/presets/introdutorio.ts` (versão 0.1.0).
> Referências: seções 6 e 10 do `documento-de-design-simulador.md`; decisões 3 (recorte), 7 (pontuação) e 13 (valores iniciais).
> **Estado:** valores iniciais, **antes** do balanceamento. A etapa de calibração (entrega 8 da fase 0) altera estes números e registra cada mudança na seção 5.

## 1. Origem dos valores

| Origem | O quê |
|---|---|
| **Manual** (Apêndice B do Capitalism II) | Receitas: insumos, proporções entre insumos, unidades por lote, peso de cada insumo na qualidade e peso da tecnologia |
| **Manual, convertido** | Quantidades convertidas de *quart* para litro (× 0,946352946) e de *lb* para kg (× 0,45359237) |
| **Hipótese** | Todo o resto: preços, custos, consumo, elasticidade, pesos da nota (preço/qualidade/marca), capacidade, parâmetros de marca, P&D, vendas e finanças |

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

## 4. Hipóteses de economia (valores base, sem a variação por semente)

**Mercado:**
- 100 mil habitantes (variação ±15% por semente);
- 7 empresas no confronto padrão de balanceamento.

**Insumos** (fornecedor externo, qualidade 50 ±10%):

| Insumo | Unidade | Preço (R$) |
|---|---|---|
| Leite | litro | 2,40 |
| Vidro | kg | 4,00 |
| Morango | kg | 15,00 |
| Ácido cítrico | kg | 12,00 |
| Açúcar | kg | 4,50 |
| Couro | kg | 60,00 |
| Tecido | kg | 25,00 |

**Produtos finais.** Nas colunas "ganho", "líquido" e "payback", cada empresa fica com 1/7 da demanda e fabrica tudo o que vende:

| Produto | P_ref | Pronto (Q50) | Insumos/un | Fabricar/un | Demanda/mês | Mercado/mês | Ganho de fabricar/mês | Custo fixo/mês | Líquido/mês | Capex | Payback | Uso da capacidade |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Leite engarrafado | 6,00 | 4,50 | 0,79 | 2,19 | 300.000 | R$ 1,80 mi | R$ 98,8 mil | R$ 25 mil | R$ 73,8 mil | R$ 650 mil | 8,8 meses | 71% |
| Iogurte | 9,00 | 6,50 | 2,10 | 4,10 | 100.000 | R$ 900 mil | R$ 34,3 mil | R$ 8 mil | R$ 26,3 mil | R$ 230 mil | 8,7 meses | 60% |
| Sorvete | 18,00 | 13,00 | 1,01 | 7,01 | 40.000 | R$ 720 mil | R$ 34,2 mil | R$ 8 mil | R$ 26,2 mil | R$ 230 mil | 8,8 meses | 54% |
| Sapato | 180,00 | 130,00 | 36,85 | 76,85 | 4.000 | R$ 720 mil | R$ 30,4 mil | R$ 7 mil | R$ 23,4 mil | R$ 210 mil | 9,0 meses | 48% |
| Carteira | 80,00 | 55,00 | 9,07 | 24,07 | 2.000 | R$ 160 mil | R$ 8,8 mil | R$ 2 mil | R$ 6,8 mil | R$ 60 mil | 8,8 meses | 48% |

**Intenção de desenho:**
- Fabricar se paga em cerca de 9 meses, com a fábrica pronta em 30 a 45 dias. Numa partida de 24 meses, fabricar compensa, mas não é automático: exige caixa (R$ 1,2 mi iniciais não cobrem todas as fábricas), volume e execução.
- Comprar pronto dá margem imediata (preço de referência − pronto ≈ 25–30%) sem investimento.
- A qualidade inicial de quem fabrica é ≈ a do produto pronto (Q ≈ 50). Isso porque, sem P&D, a tecnologia relativa começa em 50% (tecnologia inicial 10, piso de T_max 20). A diferença de qualidade vem do P&D.

**Demais parâmetros:**

| Grupo | Valores | Observação |
|---|---|---|
| Pontos de venda | 2 iniciais; abertura R$ 80 mil, 15 dias; R$ 12 mil/mês; 800 unidades-equivalentes/dia | Quem vende os 5 produtos precisa de ~3 pontos. O sapato consome 5× e a carteira 2× a capacidade por unidade |
| Marca | Reconhecimento inicial 10; decaimento 8%/mês; ganho de até 25%/mês do que falta; verba de referência R$ 0,30/hab/mês (R$ 30 mil) | Verba de R$ 30 mil/mês/produto dá 63% do efeito máximo |
| Fidelidade | Inicial 0; mínimo −50; decaimento 5%/mês; até 20 pontos/mês; ruptura total −10/mês | Pesos da marca: 50% reconhecimento, 50% fidelidade |
| Tecnologia | Inicial 10; piso de T_max 20; até 5 pontos/mês; verba de referência R$ 20 mil/mês | |
| Vendas | β = 0,1; perda na substituição 50%; teto de preço 2 × P_ref | 10 pontos de nota a mais ≈ 2,7× a participação |
| Finanças | Caixa inicial R$ 1,2 mi; IR 34% com trava de compensação de 30%; crédito emergencial 8%/mês; penalidade por falência 0 | |

## 5. Mudanças da calibração

Nenhuma ainda. Cada rodada da entrega 8 registra aqui o parâmetro alterado, o valor antigo e o novo, e a métrica que motivou a mudança.
