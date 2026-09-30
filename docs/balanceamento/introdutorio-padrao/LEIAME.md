# Balanceamento aprovado — `introdutorio/padrao` v0.2.0

Relatórios gerados em 29/09/2026, com o motor 0.1.0 e o catálogo 0.2.0:

```
bun run balancear --sementes 500 --meses 24 --exigir-aprovacao
```

| Arquivo | Confronto | Papel | Resultado |
|---|---|---|---|
| [`todos.md`](todos.md) | As 7 estratégias, uma empresa cada | Aprovação (seção 10.4) | **Aprovado**, 10/10 critérios |
| [`extremo.md`](extremo.md) | As 7 + "preço mínimo" (decisão trivial) | Aprovação (melhor resposta) | **Aprovado**, 11/11 critérios; preço mínimo vence 0% |
| [`subconjuntos.md`](subconjuntos.md) | 4 ou 5 estratégias sorteadas | Só diagnóstico | Marca vence 49% dos mercados menores (limite de 40% não se aplica) |

As sementes (`balanceamento-0001` a `balanceamento-0500`) não foram usadas na calibração, que usou as famílias `var-*` e `confirmacao-*`.

Os CSVs (uma linha por empresa por partida) ficam em `ferramentas/balanceamento/saida/`, fora do repositório; a mesma linha de comando os regenera de forma idêntica.

Histórico e raciocínio da calibração: [`docs/calibracao-introdutorio.md`](../../calibracao-introdutorio.md).
