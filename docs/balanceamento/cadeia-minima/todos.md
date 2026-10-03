# Balanceamento — cadeia/minima (todos)

**Resultado: REPROVADO** (8 de 10 critérios de aprovação)

| Execução | |
|---|---|
| Preset | `cadeia/minima` v0.2.0 |
| Motor / catálogo | 0.1.0 / 0.4.0 |
| Confronto | todos |
| Partidas | 500 (sementes `balanceamento-0001` …) |
| Horizonte | 24 meses (checagem de diferenças no mês 4) |
| Desempenho | 360.000 ticks em 43.9 s (8.195 ticks/s, 12 worker(s)) |

## Critérios de aceite (seção 10.4)

| Critério | Valor | Limite | Situação |
|---|---|---|---|
| Nenhuma estratégia vence mais de ~40% das partidas | premium: 53,4% | ≤ 40,0% | **FALHOU** |
| Estratégia razoável "equilibrada" vence pelo menos ~10% | 31,8% | ≥ 10,0% | ok |
| Estratégia razoável "marca" vence pelo menos ~10% | 1,8% | ≥ 10,0% | **FALHOU** |
| Estratégia razoável "preco_baixo" vence pelo menos ~10% | 10,0% | ≥ 10,0% | ok |
| Estratégia razoável "premium" vence pelo menos ~10% | 53,4% | ≥ 10,0% | ok |
| Estratégia de referência "revenda" supera a passiva (lucro médio e vitórias) | R$ 3.685.349; 3,0% | > R$ 1.516.043; ≥ 0,0% | ok |
| "aleatoria" quase nunca vence (decidir bem precisa importar) | 0,0% | ≤ 5,0% | ok |
| "passiva" quase nunca vence (decidir bem precisa importar) | 0,0% | ≤ 5,0% | ok |
| Diferenças visíveis até o mês 4 (participação 1ª − última ≥ 5,0%) | 100,0% | ≥ 90,0% das partidas | ok |
| Poucas empresas razoáveis com caixa negativo prolongado (≥ 2 meses seguidos com crédito emergencial) | 0,0% | ≤ 10,0% | ok |

## Por estratégia

| Estratégia | Vitórias | Posição média | Lucro médio | Lucro mediano | Receita média | Participação média | Crédito prolongado |
|---|---|---|---|---|---|---|---|
| premium | 53,4% (267/500) | 1.98 | R$ 5.073.992 | R$ 4.931.667 | R$ 30.925.120 | 14,7% | 0,0% |
| equilibrada | 31,8% (159/500) | 1.99 | R$ 4.685.511 | R$ 4.601.702 | R$ 37.879.707 | 18,0% | 0,0% |
| preco_baixo | 10,0% (50/500) | 2.99 | R$ 4.108.848 | R$ 4.031.730 | R$ 30.524.696 | 14,5% | 0,0% |
| revenda | 3,0% (15/500) | 4.01 | R$ 3.685.349 | R$ 3.677.458 | R$ 40.899.066 | 19,5% | 0,0% |
| marca | 1,8% (9/500) | 4.04 | R$ 3.714.311 | R$ 3.632.692 | R$ 42.346.008 | 20,2% | 0,0% |
| aleatoria | 0,0% (0/500) | 7.00 | R$ -10.213.788 | R$ -9.944.988 | R$ 15.165.138 | 7,3% | 100,0% |
| passiva | 0,0% (0/500) | 6.00 | R$ 1.516.043 | R$ 1.515.272 | R$ 12.173.181 | 5,8% | 0,0% |

Diferenças visíveis no mês 4: 100,0% das partidas. Empresas razoáveis com ≥ 2 meses seguidos de crédito emergencial: 0,0%.

Vitória = maior lucro acumulado no mercado ao fim do horizonte (decisão 7); empate pelo id da empresa.
