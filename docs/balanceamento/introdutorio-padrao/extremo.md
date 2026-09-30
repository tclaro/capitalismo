# Balanceamento — introdutorio/padrao (extremo)

**Resultado: APROVADO** (11 de 11 critérios)

| Execução | |
|---|---|
| Preset | `introdutorio/padrao` v0.2.0 |
| Motor / catálogo | 0.1.0 / 0.2.0 |
| Confronto | extremo |
| Partidas | 500 (sementes `balanceamento-0001` …) |
| Horizonte | 24 meses (checagem de diferenças no mês 4) |
| Desempenho | 360.000 ticks em 31.3 s (11.514 ticks/s, 12 worker(s)) |

## Critérios de aceite (seção 10.4)

| Critério | Valor | Limite | Situação |
|---|---|---|---|
| Nenhuma estratégia vence mais de ~40% das partidas | premium: 37,0% | ≤ 40,0% | ok |
| Estratégia razoável "equilibrada" vence pelo menos ~10% | 14,4% | ≥ 10,0% | ok |
| Estratégia razoável "marca" vence pelo menos ~10% | 35,6% | ≥ 10,0% | ok |
| Estratégia razoável "preco_baixo" vence pelo menos ~10% | 10,6% | ≥ 10,0% | ok |
| Estratégia razoável "premium" vence pelo menos ~10% | 37,0% | ≥ 10,0% | ok |
| Estratégia de referência "revenda" supera a passiva (lucro médio e vitórias) | R$ 943.306; 1,6% | > R$ 778.844; ≥ 0,8% | ok |
| "aleatoria" quase nunca vence (decidir bem precisa importar) | 0,0% | ≤ 5,0% | ok |
| "passiva" quase nunca vence (decidir bem precisa importar) | 0,8% | ≤ 5,0% | ok |
| Diferenças visíveis até o mês 4 (participação 1ª − última ≥ 5,0%) | 100,0% | ≥ 90,0% das partidas | ok |
| Poucas empresas razoáveis com caixa negativo prolongado (≥ 2 meses seguidos com crédito emergencial) | 0,2% | ≤ 10,0% | ok |
| Decisão extrema e trivial ("preco_minimo") não vence | 0,0% | ≤ 15,0% | ok |

## Por estratégia

| Estratégia | Vitórias | Posição média | Lucro médio | Lucro mediano | Receita média | Participação média | Crédito prolongado |
|---|---|---|---|---|---|---|---|
| premium | 37,0% (185/500) | 3.21 | R$ 1.315.190 | R$ 1.247.741 | R$ 9.497.846 | 9,7% | 0,0% |
| marca | 35,6% (178/500) | 2.50 | R$ 1.335.285 | R$ 1.305.878 | R$ 17.027.278 | 17,5% | 0,0% |
| equilibrada | 14,4% (72/500) | 3.25 | R$ 1.234.967 | R$ 1.137.813 | R$ 11.255.167 | 11,5% | 0,0% |
| preco_baixo | 10,6% (53/500) | 3.02 | R$ 1.109.823 | R$ 1.125.479 | R$ 12.037.844 | 12,4% | 1,0% |
| revenda | 1,6% (8/500) | 4.08 | R$ 943.306 | R$ 935.188 | R$ 11.276.660 | 11,6% | 0,0% |
| passiva | 0,8% (4/500) | 4.96 | R$ 778.844 | R$ 774.796 | R$ 7.797.809 | 8,1% | 4,2% |
| aleatoria | 0,0% (0/500) | 7.95 | R$ -4.409.553 | R$ -4.097.829 | R$ 7.651.883 | 7,9% | 100,0% |
| preco_minimo | 0,0% (0/500) | 7.05 | R$ -744.014 | R$ -601.035 | R$ 20.779.195 | 21,3% | 55,8% |

Diferenças visíveis no mês 4: 100,0% das partidas. Empresas razoáveis com ≥ 2 meses seguidos de crédito emergencial: 0,2%.

Vitória = maior lucro acumulado no mercado ao fim do horizonte (decisão 7); empate pelo id da empresa.
