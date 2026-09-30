# Balanceamento — introdutorio/padrao (todos)

**Resultado: APROVADO** (10 de 10 critérios)

| Execução | |
|---|---|
| Preset | `introdutorio/padrao` v0.2.0 |
| Motor / catálogo | 0.1.0 / 0.2.0 |
| Confronto | todos |
| Partidas | 500 (sementes `balanceamento-0001` …) |
| Horizonte | 24 meses (checagem de diferenças no mês 4) |
| Desempenho | 360.000 ticks em 23.5 s (15.292 ticks/s, 12 worker(s)) |

## Critérios de aceite (seção 10.4)

| Critério | Valor | Limite | Situação |
|---|---|---|---|
| Nenhuma estratégia vence mais de ~40% das partidas | marca: 38,6% | ≤ 40,0% | ok |
| Estratégia razoável "equilibrada" vence pelo menos ~10% | 16,6% | ≥ 10,0% | ok |
| Estratégia razoável "marca" vence pelo menos ~10% | 38,6% | ≥ 10,0% | ok |
| Estratégia razoável "preco_baixo" vence pelo menos ~10% | 18,2% | ≥ 10,0% | ok |
| Estratégia razoável "premium" vence pelo menos ~10% | 22,8% | ≥ 10,0% | ok |
| Estratégia de referência "revenda" supera a passiva (lucro médio e vitórias) | R$ 1.610.656; 3,8% | > R$ 863.086; ≥ 0,0% | ok |
| "aleatoria" quase nunca vence (decidir bem precisa importar) | 0,0% | ≤ 5,0% | ok |
| "passiva" quase nunca vence (decidir bem precisa importar) | 0,0% | ≤ 5,0% | ok |
| Diferenças visíveis até o mês 4 (participação 1ª − última ≥ 5,0%) | 100,0% | ≥ 90,0% das partidas | ok |
| Poucas empresas razoáveis com caixa negativo prolongado (≥ 2 meses seguidos com crédito emergencial) | 0,0% | ≤ 10,0% | ok |

## Por estratégia

| Estratégia | Vitórias | Posição média | Lucro médio | Lucro mediano | Receita média | Participação média | Crédito prolongado |
|---|---|---|---|---|---|---|---|
| marca | 38,6% (193/500) | 2.28 | R$ 2.154.475 | R$ 2.126.569 | R$ 18.810.880 | 20,1% | 0,0% |
| premium | 22,8% (114/500) | 3.69 | R$ 1.745.161 | R$ 1.646.642 | R$ 10.394.134 | 11,0% | 0,0% |
| preco_baixo | 18,2% (91/500) | 2.58 | R$ 2.030.414 | R$ 1.989.922 | R$ 20.295.011 | 21,6% | 0,2% |
| equilibrada | 16,6% (83/500) | 3.03 | R$ 1.992.156 | R$ 1.832.426 | R$ 13.289.440 | 14,1% | 0,0% |
| revenda | 3,8% (19/500) | 3.76 | R$ 1.610.656 | R$ 1.599.870 | R$ 13.102.373 | 14,0% | 0,0% |
| aleatoria | 0,0% (0/500) | 6.99 | R$ -3.496.907 | R$ -3.129.886 | R$ 9.651.084 | 10,4% | 99,6% |
| passiva | 0,0% (0/500) | 5.66 | R$ 863.086 | R$ 856.346 | R$ 8.172.670 | 8,8% | 0,0% |

Diferenças visíveis no mês 4: 100,0% das partidas. Empresas razoáveis com ≥ 2 meses seguidos de crédito emergencial: 0,0%.

Vitória = maior lucro acumulado no mercado ao fim do horizonte (decisão 7); empate pelo id da empresa.
