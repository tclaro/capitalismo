# Balanceamento — introdutorio/padrao (subconjuntos)

**Confronto de diagnóstico — não entra na aprovação.** Os critérios da seção 10.4 valem para o confronto equilibrado; aqui aparecem só como referência (9 de 10 atendidos).

| Execução | |
|---|---|
| Preset | `introdutorio/padrao` v0.2.0 |
| Motor / catálogo | 0.1.0 / 0.2.0 |
| Confronto | subconjuntos |
| Partidas | 500 (sementes `balanceamento-0001` …) |
| Horizonte | 24 meses (checagem de diferenças no mês 4) |
| Desempenho | 360.000 ticks em 17.8 s (20.260 ticks/s, 12 worker(s)) |

## Critérios de aceite (seção 10.4)

| Critério | Valor | Limite | Situação |
|---|---|---|---|
| Nenhuma estratégia vence mais de ~40% das partidas | marca: 49,1% | ≤ 40,0% | **FALHOU** |
| Estratégia razoável "equilibrada" vence pelo menos ~10% | 35,1% | ≥ 10,0% | ok |
| Estratégia razoável "marca" vence pelo menos ~10% | 49,1% | ≥ 10,0% | ok |
| Estratégia razoável "preco_baixo" vence pelo menos ~10% | 18,8% | ≥ 10,0% | ok |
| Estratégia razoável "premium" vence pelo menos ~10% | 39,2% | ≥ 10,0% | ok |
| Estratégia de referência "revenda" supera a passiva (lucro médio e vitórias) | R$ 3.007.574; 10,7% | > R$ 945.669; ≥ 0,0% | ok |
| "aleatoria" quase nunca vence (decidir bem precisa importar) | 0,0% | ≤ 5,0% | ok |
| "passiva" quase nunca vence (decidir bem precisa importar) | 0,0% | ≤ 5,0% | ok |
| Diferenças visíveis até o mês 4 (participação 1ª − última ≥ 5,0%) | 99,0% | ≥ 90,0% das partidas | ok |
| Poucas empresas razoáveis com caixa negativo prolongado (≥ 2 meses seguidos com crédito emergencial) | 0,4% | ≤ 10,0% | ok |

## Por estratégia

| Estratégia | Vitórias | Posição média | Lucro médio | Lucro mediano | Receita média | Participação média | Crédito prolongado |
|---|---|---|---|---|---|---|---|
| marca | 49,1% (163/332) | 1.83 | R$ 3.780.025 | R$ 3.558.998 | R$ 30.560.282 | 33,0% | 0,6% |
| premium | 39,2% (133/339) | 2.21 | R$ 3.824.261 | R$ 3.605.344 | R$ 19.346.425 | 21,2% | 0,0% |
| equilibrada | 35,1% (110/313) | 2.08 | R$ 3.761.221 | R$ 3.411.988 | R$ 23.534.919 | 25,4% | 0,0% |
| preco_baixo | 18,8% (61/325) | 2.26 | R$ 2.793.497 | R$ 2.551.384 | R$ 27.745.181 | 29,0% | 1,5% |
| revenda | 10,7% (33/308) | 2.68 | R$ 3.007.574 | R$ 2.456.447 | R$ 22.128.586 | 23,3% | 0,0% |
| aleatoria | 0,0% (0/318) | 4.55 | R$ -4.280.213 | R$ -3.390.598 | R$ 11.573.086 | 13,2% | 100,0% |
| passiva | 0,0% (0/319) | 3.94 | R$ 945.669 | R$ 942.626 | R$ 8.475.033 | 9,8% | 0,0% |

Diferenças visíveis no mês 4: 99,0% das partidas. Empresas razoáveis com ≥ 2 meses seguidos de crédito emergencial: 0,4%.

Vitória = maior lucro acumulado no mercado ao fim do horizonte (decisão 7); empate pelo id da empresa.
