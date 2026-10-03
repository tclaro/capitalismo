# Balanceamento — cadeia/minima (extremo)

**Resultado: APROVADO** (1 de 1 critérios de aprovação; 10 de diagnóstico)

| Execução | |
|---|---|
| Preset | `cadeia/minima` v0.2.0 |
| Motor / catálogo | 0.1.0 / 0.4.0 |
| Confronto | extremo |
| Partidas | 500 (sementes `balanceamento-0001` …) |
| Horizonte | 24 meses (checagem de diferenças no mês 4) |
| Desempenho | 360.000 ticks em 51.2 s (7.038 ticks/s, 12 worker(s)) |

## Critérios de aceite (seção 10.4)

| Critério | Valor | Limite | Situação |
|---|---|---|---|
| Nenhuma estratégia vence mais de ~40% das partidas *(diagnóstico)* | premium: 73,4% | ≤ 40,0% | fora (diagnóstico) |
| Estratégia razoável "equilibrada" vence pelo menos ~10% *(diagnóstico)* | 13,4% | ≥ 10,0% | ok |
| Estratégia razoável "marca" vence pelo menos ~10% *(diagnóstico)* | 1,4% | ≥ 10,0% | fora (diagnóstico) |
| Estratégia razoável "preco_baixo" vence pelo menos ~10% *(diagnóstico)* | 11,4% | ≥ 10,0% | ok |
| Estratégia razoável "premium" vence pelo menos ~10% *(diagnóstico)* | 73,4% | ≥ 10,0% | ok |
| Estratégia de referência "revenda" supera a passiva (lucro médio e vitórias) *(diagnóstico)* | R$ 1.603.131; 0,4% | > R$ 1.461.926; ≥ 0,0% | ok |
| "aleatoria" quase nunca vence (decidir bem precisa importar) *(diagnóstico)* | 0,0% | ≤ 5,0% | ok |
| "passiva" quase nunca vence (decidir bem precisa importar) *(diagnóstico)* | 0,0% | ≤ 5,0% | ok |
| Diferenças visíveis até o mês 4 (participação 1ª − última ≥ 5,0%) *(diagnóstico)* | 100,0% | ≥ 90,0% das partidas | ok |
| Poucas empresas razoáveis com caixa negativo prolongado (≥ 2 meses seguidos com crédito emergencial) *(diagnóstico)* | 0,0% | ≤ 10,0% | ok |
| Decisão extrema e trivial ("preco_minimo") não vence | 0,0% | ≤ 15,0% | ok |

## Por estratégia

| Estratégia | Vitórias | Posição média | Lucro médio | Lucro mediano | Receita média | Participação média | Crédito prolongado |
|---|---|---|---|---|---|---|---|
| premium | 73,4% (367/500) | 1.40 | R$ 3.355.909 | R$ 3.253.788 | R$ 26.002.713 | 12,4% | 0,0% |
| equilibrada | 13,4% (67/500) | 2.28 | R$ 2.673.605 | R$ 2.632.052 | R$ 31.872.756 | 15,3% | 0,0% |
| preco_baixo | 11,4% (57/500) | 2.76 | R$ 2.362.813 | R$ 2.330.958 | R$ 19.072.926 | 9,2% | 0,0% |
| marca | 1,4% (7/500) | 4.36 | R$ 1.848.629 | R$ 1.821.148 | R$ 37.564.114 | 18,0% | 0,0% |
| revenda | 0,4% (2/500) | 4.98 | R$ 1.603.131 | R$ 1.638.319 | R$ 34.093.969 | 16,4% | 0,0% |
| aleatoria | 0,0% (0/500) | 7.99 | R$ -11.140.829 | R$ -10.938.517 | R$ 12.662.262 | 6,1% | 100,0% |
| passiva | 0,0% (0/500) | 5.23 | R$ 1.461.926 | R$ 1.470.044 | R$ 11.923.047 | 5,8% | 0,0% |
| preco_minimo | 0,0% (0/500) | 7.01 | R$ -1.325.659 | R$ -1.221.739 | R$ 35.160.645 | 16,9% | 16,4% |

Diferenças visíveis no mês 4: 100,0% das partidas. Empresas razoáveis com ≥ 2 meses seguidos de crédito emergencial: 0,0%.

Vitória = maior lucro acumulado no mercado ao fim do horizonte (decisão 7); empate pelo id da empresa.
