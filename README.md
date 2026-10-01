# Simulador de Mercado

Simulador competitivo para ensino de Administração, inspirado em *Capitalism*. Visão, requisitos e decisões: [`docs/documento-de-design-simulador.md`](docs/documento-de-design-simulador.md).

## Estrutura

| Pasta | Conteúdo |
|---|---|
| `pacotes/motor` | Motor de simulação puro e determinístico e robôs. Sem dependências de runtime. |
| `pacotes/catalogo` | Árvore de produtos, receitas e presets (dados e validação). |
| `pacotes/compartilhado` | Protocolo (esquemas valibot), visões, respostas HTTP, dinheiro e calendário: comum a servidor e interface. |
| `apps/servidor` | Servidor Bun: salas, relógio, SQLite, HTTP, WebSocket, autenticação; empacotamento em `.exe`. |
| `apps/web` | Interface React + Vite (aluno, professor, telão, admin), embutida no executável. |
| `ferramentas/balanceamento` | CLI que simula partidas em massa com robôs e gera relatórios. |
| `tools/poc-rede` | Prova de conceito de rede (seção 9.9), concluída. Projeto independente. |
| `docs` | Documento de design, anexos, roteiros, relatórios aprovados e licenças dos recursos. |

Cada pacote tem o código em `src/` e os testes em `testes/`.

## Desenvolvimento

Requer [Bun](https://bun.sh) 1.4 ou superior.

```
bun install
bun run verificar      # typecheck + testes
bun run typecheck
bun run test
bun run balancear      # CLI de balanceamento
bun run imagens        # assets/produtos/*.png → apps/web/src/assets/produtos/*.webp (recorte do fundo)
```

Servidor e interface em desenvolvimento (dois terminais):

```
bun run servidor -- --dados ./dados-dev --definir-chave uma-chave-longa   # uma vez
bun run servidor -- --dados ./dados-dev --dev                              # porta 47800
bun run web                                                                # Vite em http://localhost:5173
```

Ou o servidor servindo a interface já construída: `bun run web:build` e depois `bun run servidor -- --dados ./dados-dev --web apps/web/dist`, abrindo `http://localhost:47800`.

## Executável

```
bun run empacotar      # build da interface → apps/servidor/dist/simulador-de-mercado.exe → teste de fumaça
```

O executável é autossuficiente (runtime, interface, fontes e migrações embutidos) e roda sem instalação. Na primeira vez, defina a chave de professor: `simulador-de-mercado.exe --definir-chave`.
