# Balanceamento — `cadeia/minima` v0.2.0

Calibração da fase 1b (entrega 9), feita em 02/10/2026 com o motor 0.1.0 e o catálogo 0.4.0.

```
bun run balancear confronto --preset cadeia/minima --sementes 500 --meses 24
```

| Arquivo | Confronto | Papel | Resultado |
|---|---|---|---|
| [`cadeia.md`](cadeia.md) | As 7 estratégias da camada 1 e os 3 caminhos da cadeia (10 empresas) | **Aprovação da cadeia** (critérios relativos, abaixo) | **Aprovado, 7/7** |
| [`extremo.md`](extremo.md) | As 7 e o "preço mínimo" | Aprovação (decisão trivial não vence) | **Aprovado**: preço mínimo vence 0,0% |
| [`todos.md`](todos.md) | As 7 estratégias da camada 1 | Referência da camada 1 | Reprovado, 8/10: **limitação herdada** (premium 53,4%, marca 1,8%) |
| [`subconjuntos.md`](subconjuntos.md) | 4 ou 5 estratégias sorteadas | Só diagnóstico | Premium vence 73,5% dos mercados menores |

As sementes oficiais (`balanceamento-0001` a `0500`) **não** foram usadas na calibração, que usou as famílias `var`, `var2` e `var3`.

## 1. O problema da v0.1.0

Os números das fazendas eram hipóteses de ordem de grandeza. Medidos, mostravam que a cadeia era um atalho e que a cooperativa não punia ninguém:

| Caminho | Lucro médio contra a estratégia equivalente sem fazendas | Vitórias |
|---|---|---|
| Integrada (fazendas → fábricas) | **6,1×** a equilibrada | 31% |
| Só fazenda (carne e frango para a loja) | **9,6×** a revenda | 69% |
| Produzir para a cooperativa | **1,0×** a equilibrada (não perde nada) | 0% |

Causas: o custo variável das fazendas era de 36% a 46% do valor ao preço do fornecedor (8% no gado de corte, contando o couro, que a cooperativa comprava a R$ 36/kg); o piso da cooperativa (60% do preço do fornecedor) ficava acima do custo de produzir; e a qualidade subia 1,5 ponto por mês de experiência, bem mais do que o necessário.

## 2. O que mudou (v0.1.0 → v0.2.0)

| Atividade | Custo variável (R$/un) | Capex | Custo fixo/mês | Capacidade/dia |
|---|---|---|---|---|
| Gado de corte | 4,00 → **23,63** | 350 mil → **440 mil** | 9 mil → **6,5 mil** | 150 (igual) |
| Gado leiteiro | 1,10 → **1,96** | 300 mil → **98 mil** | 8 mil → **1,44 mil** | 400 (igual) |
| Frango | 3,50 → **7,35** | 250 mil → **275 mil** | 7 mil → **4,05 mil** | 300 (igual) |
| Morango | 6,00 → **12,29** | 200 mil → **184 mil** | 6 mil → **2,7 mil** | 120 (igual) |
| Cana-de-açúcar | 1,60 → **3,69** | 180 mil → **184 mil** | 5 mil → **2,7 mil** | 400 (igual) |

Ganho de qualidade por mês de experiência: 1,5 → **0,3** (teto de 90 igual). O piso da cooperativa (60%), a conversão (R$ 40 mil, 10 dias), o descarte e os prazos de obra **não mudaram**.

Lógica do desenho: o custo variável fica perto de 82% do valor ao preço do fornecedor (a economia de custo é pequena), o capex e o custo fixo fazem a fazenda pagar em ~25 meses só pelo custo, e a qualidade é um bônus moderado. O piso da cooperativa (60%) fica abaixo do custo de produzir, então produzir só para ela perde dinheiro. A tabela completa de economia está no fim de [`cadeia.md`](cadeia.md).

## 3. Critérios (relativos) e método

Na camada 1 o premium domina o confronto (limitação registrada em 30/09/2026, fronteira tecnológica pendente), então os critérios da cadeia **comparam cada caminho com a estratégia equivalente sem fazendas**, no mesmo mercado e com as mesmas sementes. Os caminhos são estratégias **só de teste** (`pacotes/motor/src/robos/cadeia.ts`, nunca oferecidas em aula), que usam só a visão da empresa:

- `cadeia_integrada`: a "equilibrada" com fazendas que abastecem as próprias fábricas (origem própria), produção ajustada ao consumo, excedente à cooperativa;
- `cadeia_so_fazenda`: a "revenda" (nunca fabrica) que produz a própria carne e o próprio frango;
- `cadeia_cooperativa`: a "equilibrada" que constrói fazendas, produz no máximo e despeja tudo na cooperativa.

"Só fábrica" é a própria "equilibrada" (já era o caso da camada 1).

| Critério | Limite | Resultado (500 partidas) |
|---|---|---|
| Integrada rende mais que a equilibrada, sem virar o atalho | entre 1,05× e 1,60× | **1,24×** |
| Só fazenda rende mais que a revenda, sem virar o atalho | entre 1,05× e 1,60× | **1,21×** |
| Produzir só para a cooperativa rende menos que a equilibrada | ≤ 0,95× | **0,68×** |
| A cooperativa nunca é a melhor saída | ≤ 2% das partidas | **0,8%** |
| A cooperativa rende menos que os dois caminhos úteis | menor que ambos | R$ 1,54 mi contra R$ 2,84 mi e R$ 2,06 mi |
| Nenhum caminho da cadeia vence a maioria | ≤ 40% cada | integrada **36,6%**; só fazenda **8,8%** |
| Caminhos úteis sem caixa negativo prolongado | ≤ 10% cada | **0,0%** e **0,0%** |

Os limites são decisões deste trabalho (a seção 10.4 do design não os define para a cadeia) e estão em `ferramentas/balanceamento/src/cadeia.ts`.

## 4. A varredura (sementes de calibração)

Cada linha é uma variante do preset; "int/eq" é o lucro médio da integrada dividido pelo da equilibrada, "sf/rev" o da só fazenda pelo da revenda, "coop/eq" o da cooperativa pelo da equilibrada.

| Rodada | Variante | int/eq | sf/rev | coop/eq | Vitórias da integrada |
|---|---|---|---|---|---|
| 1 | v0.1.0 (valores provisórios) | 6,13 | 9,55 | 1,01 | 31% |
| 1 | custo variável a 55% do valor | 1,78 | 2,28 | 0,84 | 61% |
| 1 | a 65% | 1,50 | 1,84 | 0,73 | 61% |
| 1 | a 75% | 1,30 | 1,51 | 0,62 | 42% |
| 1 | a 85% | 1,14 | 1,22 | 0,52 | 33% |
| 2 | 80% e capex ×0,5 / ×1 / ×1,5 | 1,28 / 1,24 / 1,16 | 1,46 / 1,33 / 1,25 | 0,59 / 0,57 / 0,55 | 44% / 39% / 33% |
| 2 | 80% e piso da cooperativa 0,45 / 0,60 / 0,70 | 1,24 em todos | 1,33 em todos | 0,40 / 0,57 / 0,68 | 39% / 39% / 36% |
| 3 | custo ~78% e payback ~20 meses (qualidade 1,5/mês) | 1,54 | 1,50 | 0,67 | 46% |
| 3 | o mesmo **sem** ganho de qualidade | 1,18 | 1,16 | 0,69 | 29% |
| 3 | o mesmo com ganho de 0,75/mês | 1,37 | 1,34 | 0,68 | 42% |
| 4 | desenho adotado (custo ~82%) com ganho de 0,25/mês | 1,22 | 1,14 | 0,68 | 33% |
| 4 | o mesmo com ganho de 0,4/mês | 1,25 | 1,17 | 0,68 | 35% |
| oficial | **adotada** (ganho de 0,3/mês), 500 sementes oficiais | **1,24** | **1,21** | **0,68** | **36,6%** |

Leituras:
- **Só o custo já faz a fazenda compensar** (1,18× sem ganho de qualidade). A qualidade acrescenta o resto: com 1,5 ponto por mês, a integrada chegava a 1,54× e 46% das vitórias.
- **O piso da cooperativa é a alavanca da saída que não pode ganhar**: com 0,45 a cooperativa rende 0,40× da equilibrada; com 0,70, 0,68×. Em 0,60 ela perde com folga e continua sendo um comprador de último recurso útil (evita estoque parado).
- A taxa de vitórias da integrada oscila ±6 pontos entre grupos de 100 a 250 sementes. Por isso a decisão final foi confirmada com as 500 sementes oficiais, e a margem para o limite de 40% é de 3,4 pontos.

## 5. Robustez ao horizonte

O professor escolhe a duração. O mesmo confronto, com 200 partidas cada:

| Horizonte | Integrada | Só fazenda | Cooperativa | Vitórias int. / s.f. / coop. | Resultado |
|---|---|---|---|---|---|
| 12 meses | 1,17× | 1,16× | 0,67× | 34,0% / 6,0% / 0,5% | aprovado 7/7 |
| 24 meses (oficial) | 1,24× | 1,21× | 0,68× | 36,6% / 8,8% / 0,8% | aprovado 7/7 |
| 36 meses | 1,33× | 1,28× | 0,69× | 38,5% / 7,0% / 1,5% | aprovado 7/7, perto dos limites |

Em partidas longas a vantagem da cadeia cresce (a experiência acumula): acima de 36 meses é preciso olhar de novo.

## 6. O que este resultado **não** diz

- **Nenhum robô negocia no atacado.** O atacado e a faixa de preço dele (piso da cooperativa, teto do fornecedor) não foram exercitados por estratégias; a decisão 28 aceita isso (robôs compradores ficam para a fase 4). O custo de produzir (82% do preço do fornecedor) deixa uma janela estreita para o vendedor ganhar (preço entre 82% e 100% do teto) e uma economia de até 18% para o comprador; só o piloto com alunos diz se isso basta para haver negócio.
- **O premium domina a camada 1** (53,4% no `todos`, 73,5% no `extremo`), como já registrado em 30/09/2026 para o introdutório. A cadeia não piorou isso (no introdutório o premium vence 74% no mesmo confronto). Resolver exige a fronteira tecnológica, fora desta fase.
- **A jaqueta é provisória** (unidade e pesos internos pendentes do manual), e o consumo de couro dela entra nas contas das estratégias de teste. A carne e o frango no varejo, o caixa inicial (R$ 3 mi), a conversão de atividade e o descarte não foram calibrados.
- **O couro é um coproduto difícil.** O gado de corte só paga se a equipe aproveita o couro: só com a carne, o custo (R$ 106 mil/mês) supera o valor (R$ 90 mil); com 1/3 do couro, paga em 20 meses; aproveitando todo o couro (limite teórico) pagaria em 4. Estoque de couro cheio para a produção da carne: a interface avisa, e a cooperativa é a saída, ao piso.
- **A ordenação por lucro acumulado favorece quem investe em ativos** (a depreciação é diluída em 10 anos), o que vale também para as fábricas. É a regra do jogo, mas explica parte da vantagem da integrada.
- As estratégias de teste são simples (uma fazenda por vez, regra de payback fixa). **Um aluno que jogue melhor pode passar de 1,6×**; se acontecer no piloto, o primeiro ajuste é subir o custo variável ou o capex, que ficam no preset.

## 7. Como retomar

- Variar o preset sem editar código: `bun ferramentas/balanceamento/src/varredura.ts <arquivo.json> --sementes 120 --prefixo var4` (formato em `ferramentas/balanceamento/src/ajustes.ts`; compara variantes lado a lado).
- Relatório oficial: o comando do início deste arquivo. `--exigir-aprovacao` devolve código 1 se algum critério de aprovação falhar (o `todos` falha por herança da camada 1: use `--confronto cadeia` para a aprovação da cadeia).
