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

## Melhor resposta (30/09/2026) — **com alerta**

```
bun run balancear melhor-resposta --estrategia <id> --sementes 24 --meses 24 --trabalhadores 4
```

| Estratégia | Melhor intensidade | Vitórias | Faixa padrão do robô |
|---|---|---|---|
| [equilibrada](melhor-resposta-equilibrada.md) | preço 7% abaixo do mercado, publicidade 9%, P&D 3,5% | 100% | ajuste −3% a +5%, publicidade 3–7% |
| [premium](melhor-resposta-premium.md) | prêmio 5%, P&D 4,5%, publicidade 8% | 95,8% | prêmio 15–35%, P&D 8–15% |
| [marca](melhor-resposta-marca.md) | prêmio 0%, publicidade 17% | 87,5% | prêmio 3–12% |
| [preco_baixo](melhor-resposta-preco_baixo.md) | margem 35%, publicidade 3% | 75,0% | margem 15–35% |
| [revenda](melhor-resposta-revenda.md) | preço 10% abaixo, publicidade 10,5% | 25,0% | ajuste −10% a +2% |

Em todas, o ótimo é **preço no mercado ou um pouco abaixo, com mais publicidade do que os robôs padrão**.

## Situação atual (30/09/2026)

**Todos os relatórios desta pasta foram medidos com os robôs antigos.** Depois deles:
- os robôs foram ajustados para perto desses ótimos;
- com os robôs ajustados, a v0.2.0 deixa de estar equilibrada: o premium vence ~77%;
- a recalibração (candidato v0.3.0) equilibrou o confronto, mas deixou a P&D sem retorno em qualquer dose;
- nenhuma combinação concilia equilíbrio e P&D que compensa no modelo atual.

Decisão do autor: manter a **v0.2.0** como preset jogável para os testes com alunos e retomar depois, com a fronteira tecnológica (decisão 26 do design). Detalhes e números: [`docs/calibracao-introdutorio.md`](../../calibracao-introdutorio.md), seção 6.

Os CSVs (uma linha por empresa por partida) ficam em `ferramentas/balanceamento/saida/`, fora do repositório; a mesma linha de comando os regenera de forma idêntica.

Histórico e raciocínio da calibração: [`docs/calibracao-introdutorio.md`](../../calibracao-introdutorio.md).
