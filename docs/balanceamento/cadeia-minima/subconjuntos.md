# Balanceamento — cadeia/minima (subconjuntos)

**Confronto de diagnóstico — não entra na aprovação.** Os critérios da seção 10.4 valem para o confronto equilibrado; aqui aparecem só como referência (8 de 10 atendidos).

| Execução | |
|---|---|
| Preset | `cadeia/minima` v0.2.0 |
| Motor / catálogo | 0.1.0 / 0.4.0 |
| Confronto | subconjuntos |
| Partidas | 500 (sementes `balanceamento-0001` …) |
| Horizonte | 24 meses (checagem de diferenças no mês 4) |
| Desempenho | 360.000 ticks em 36.5 s (9.862 ticks/s, 12 worker(s)) |

## Critérios de aceite (seção 10.4)

| Critério | Valor | Limite | Situação |
|---|---|---|---|
| Nenhuma estratégia vence mais de ~40% das partidas | premium: 73,5% | ≤ 40,0% | **FALHOU** |
| Estratégia razoável "equilibrada" vence pelo menos ~10% | 41,9% | ≥ 10,0% | ok |
| Estratégia razoável "marca" vence pelo menos ~10% | 6,6% | ≥ 10,0% | **FALHOU** |
| Estratégia razoável "preco_baixo" vence pelo menos ~10% | 23,7% | ≥ 10,0% | ok |
| Estratégia razoável "premium" vence pelo menos ~10% | 73,5% | ≥ 10,0% | ok |
| Estratégia de referência "revenda" supera a passiva (lucro médio e vitórias) | R$ 5.060.590; 6,5% | > R$ 1.588.347; ≥ 0,3% | ok |
| "aleatoria" quase nunca vence (decidir bem precisa importar) | 0,0% | ≤ 5,0% | ok |
| "passiva" quase nunca vence (decidir bem precisa importar) | 0,3% | ≤ 5,0% | ok |
| Diferenças visíveis até o mês 4 (participação 1ª − última ≥ 5,0%) | 99,8% | ≥ 90,0% das partidas | ok |
| Poucas empresas razoáveis com caixa negativo prolongado (≥ 2 meses seguidos com crédito emergencial) | 0,4% | ≤ 10,0% | ok |

## Por estratégia

| Estratégia | Vitórias | Posição média | Lucro médio | Lucro mediano | Receita média | Participação média | Crédito prolongado |
|---|---|---|---|---|---|---|---|
| premium | 73,5% (249/339) | 1.41 | R$ 8.769.339 | R$ 8.479.510 | R$ 52.872.718 | 25,7% | 0,0% |
| equilibrada | 41,9% (131/313) | 1.74 | R$ 7.212.219 | R$ 7.015.374 | R$ 61.309.407 | 29,7% | 0,0% |
| preco_baixo | 23,7% (77/325) | 2.04 | R$ 6.465.265 | R$ 6.210.199 | R$ 47.674.689 | 23,1% | 0,0% |
| marca | 6,6% (22/332) | 2.93 | R$ 5.381.233 | R$ 5.316.465 | R$ 65.302.887 | 31,7% | 1,2% |
| revenda | 6,5% (20/308) | 3.04 | R$ 5.060.590 | R$ 4.903.809 | R$ 61.085.976 | 29,1% | 0,6% |
| passiva | 0,3% (1/319) | 3.80 | R$ 1.588.347 | R$ 1.586.972 | R$ 12.397.998 | 6,3% | 0,0% |
| aleatoria | 0,0% (0/318) | 4.59 | R$ -9.948.907 | R$ -9.467.781 | R$ 18.659.625 | 9,3% | 100,0% |

Diferenças visíveis no mês 4: 99,8% das partidas. Empresas razoáveis com ≥ 2 meses seguidos de crédito emergencial: 0,4%.

Vitória = maior lucro acumulado no mercado ao fim do horizonte (decisão 7); empate pelo id da empresa.
