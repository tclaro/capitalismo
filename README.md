# Simulador de Mercado

Simulador competitivo para ensino de Administração, inspirado em *Capitalism*. Visão, requisitos e decisões: [`docs/documento-de-design-simulador.md`](docs/documento-de-design-simulador.md).

## Estrutura

| Pasta | Conteúdo |
|---|---|
| `pacotes/motor` | Motor de simulação puro e determinístico e robôs. Sem dependências de runtime. |
| `pacotes/catalogo` | Árvore de produtos, receitas e presets (dados e validação). |
| `ferramentas/balanceamento` | CLI que simula partidas em massa com robôs e gera relatórios. |
| `tools/poc-rede` | Prova de conceito de rede (seção 9.9), concluída. Projeto independente. |
| `docs` | Documento de design, anexos, roteiros e relatórios aprovados. |

Cada pacote tem o código em `src/` e os testes em `testes/`.

## Desenvolvimento

Requer [Bun](https://bun.sh) 1.4 ou superior.

```
bun install
bun run verificar      # typecheck + testes
bun run typecheck
bun run test
bun run balancear      # CLI de balanceamento
```
