# Balanceamento — cadeia/minima (cadeia)

**Resultado: APROVADO** (7 de 7 critérios de aprovação; 10 de diagnóstico)

| Execução | |
|---|---|
| Preset | `cadeia/minima` v0.2.0 |
| Motor / catálogo | 0.1.0 / 0.4.0 |
| Confronto | cadeia |
| Partidas | 500 (sementes `balanceamento-0001` …) |
| Horizonte | 24 meses (checagem de diferenças no mês 4) |
| Desempenho | 360.000 ticks em 67.0 s (5.376 ticks/s, 12 worker(s)) |

## Critérios de aceite da cadeia (entrega 9; os gerais da seção 10.4 ficam como diagnóstico)

| Critério | Valor | Limite | Situação |
|---|---|---|---|
| Integrada (fazendas → fábricas) rende mais que a equilibrada sem fazendas, sem virar o atalho | 1,24× o lucro médio | entre 1,05× e 1,60× | ok |
| Só fazenda (carne e frango para a loja) rende mais que a revenda sem fazendas, sem virar o atalho | 1,21× o lucro médio | entre 1,05× e 1,60× | ok |
| Produzir só para a cooperativa rende menos que a mesma equipe sem fazendas | 0,68× o lucro médio | ≤ 0,95× | ok |
| A saída pela cooperativa nunca é a melhor | 0,8% | ≤ 2,0% das partidas | ok |
| A cooperativa rende menos que os dois caminhos úteis | 1.542.477 contra 2.836.586 e 2.063.048 | menor que ambos | ok |
| Nenhum caminho da cadeia vence a maioria das partidas | integrada: 36,6%; so_fazenda: 8,8% | ≤ 40,0% cada | ok |
| Os caminhos úteis não levam a caixa negativo prolongado | integrada: 0,0%; so_fazenda: 0,0% | ≤ 10,0% cada | ok |
| Nenhuma estratégia vence mais de ~40% das partidas *(diagnóstico)* | cadeia_integrada: 36,6% | ≤ 40,0% | ok |
| Estratégia razoável "equilibrada" vence pelo menos ~10% *(diagnóstico)* | 7,8% | ≥ 10,0% | fora (diagnóstico) |
| Estratégia razoável "marca" vence pelo menos ~10% *(diagnóstico)* | 0,8% | ≥ 10,0% | fora (diagnóstico) |
| Estratégia razoável "preco_baixo" vence pelo menos ~10% *(diagnóstico)* | 15,4% | ≥ 10,0% | ok |
| Estratégia razoável "premium" vence pelo menos ~10% *(diagnóstico)* | 29,8% | ≥ 10,0% | ok |
| Estratégia de referência "revenda" supera a passiva (lucro médio e vitórias) *(diagnóstico)* | R$ 1.701.052; 0,0% | > R$ 1.456.219; ≥ 0,0% | ok |
| "aleatoria" quase nunca vence (decidir bem precisa importar) *(diagnóstico)* | 0,0% | ≤ 5,0% | ok |
| "passiva" quase nunca vence (decidir bem precisa importar) *(diagnóstico)* | 0,0% | ≤ 5,0% | ok |
| Diferenças visíveis até o mês 4 (participação 1ª − última ≥ 5,0%) *(diagnóstico)* | 100,0% | ≥ 90,0% das partidas | ok |
| Poucas empresas razoáveis com caixa negativo prolongado (≥ 2 meses seguidos com crédito emergencial) *(diagnóstico)* | 0,0% | ≤ 10,0% | ok |

## Por estratégia

| Estratégia | Vitórias | Posição média | Lucro médio | Lucro mediano | Receita média | Participação média | Crédito prolongado |
|---|---|---|---|---|---|---|---|
| cadeia_integrada | 36,6% (183/500) | 2.45 | R$ 2.836.586 | R$ 2.579.947 | R$ 25.469.841 | 11,7% | 0,0% |
| premium | 29,8% (149/500) | 3.41 | R$ 2.500.099 | R$ 2.324.380 | R$ 18.253.885 | 8,4% | 0,0% |
| preco_baixo | 15,4% (77/500) | 3.50 | R$ 2.165.397 | R$ 2.150.799 | R$ 16.882.161 | 7,8% | 0,0% |
| cadeia_so_fazenda | 8,8% (44/500) | 4.69 | R$ 2.063.048 | R$ 2.024.416 | R$ 28.063.665 | 12,9% | 0,0% |
| equilibrada | 7,8% (39/500) | 3.60 | R$ 2.281.363 | R$ 2.219.758 | R$ 23.853.624 | 10,9% | 0,0% |
| cadeia_cooperativa | 0,8% (4/500) | 7.25 | R$ 1.542.477 | R$ 1.445.648 | R$ 26.337.552 | 12,1% | 0,0% |
| marca | 0,8% (4/500) | 6.27 | R$ 1.760.802 | R$ 1.727.998 | R$ 28.310.843 | 13,0% | 0,0% |
| aleatoria | 0,0% (0/500) | 10.00 | R$ -11.389.885 | R$ -11.357.169 | R$ 11.573.615 | 5,3% | 100,0% |
| passiva | 0,0% (0/500) | 7.43 | R$ 1.456.219 | R$ 1.458.026 | R$ 11.945.122 | 5,5% | 0,0% |
| revenda | 0,0% (0/500) | 6.41 | R$ 1.701.052 | R$ 1.719.542 | R$ 26.935.946 | 12,4% | 0,0% |

Diferenças visíveis no mês 4: 100,0% das partidas. Empresas razoáveis com ≥ 2 meses seguidos de crédito emergencial: 0,0%.

Vitória = maior lucro acumulado no mercado ao fim do horizonte (decisão 7); empate pelo id da empresa.

## Economia das atividades (valores base, só custo)

| Atividade | Aproveita | Produção/mês | Valor ao preço do fornecedor | Custo variável | Custo fixo | Líquido/mês (100%) | Líquido/mês (60%) | Capex | Payback (100%) | Payback (60%) |
|---|---|---|---|---|---|---|---|---|---|---|
| Gado de corte | só carne bovina congelada | 4.500 | R$ 90.000 | R$ 106.335 | R$ 6.500 | R$ -22.835 | R$ -16.301 | R$ 440.000 | não paga | não paga |
| Gado de corte | tudo do primeiro e 1/3 dos coprodutos | 4.500 | R$ 135.000 | R$ 106.335 | R$ 6.500 | R$ 22.165 | R$ 10.699 | R$ 440.000 | 19,9 | 41,1 |
| Gado de corte | todos os produtos (limite teórico) | 4.500 | R$ 225.000 | R$ 106.335 | R$ 6.500 | R$ 112.165 | R$ 64.699 | R$ 440.000 | 3,9 | 6,8 |
| Gado leiteiro | — | 12.000 | R$ 28.800 | R$ 23.520 | R$ 1.440 | R$ 3.840 | R$ 1.728 | R$ 98.000 | 25,5 | 56,7 |
| Frango | — | 9.000 | R$ 81.000 | R$ 66.150 | R$ 4.050 | R$ 10.800 | R$ 4.860 | R$ 275.000 | 25,5 | 56,6 |
| Morango | — | 3.600 | R$ 54.000 | R$ 44.244 | R$ 2.700 | R$ 7.056 | R$ 3.154 | R$ 184.000 | 26,1 | 58,3 |
| Cana-de-açúcar | — | 12.000 | R$ 54.000 | R$ 44.280 | R$ 2.700 | R$ 7.020 | R$ 3.132 | R$ 184.000 | 26,2 | 58,7 |

Líquido = uso × (valor ao preço do fornecedor − custo variável) − custo fixo, à capacidade nominal. Não inclui o efeito da qualidade (o ganho de qualidade com a experiência é um bônus a mais). Payback = capex ÷ líquido.
