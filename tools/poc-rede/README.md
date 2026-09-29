# poc-rede

Prova de conceito de rede do Simulador de Mercado (seção 9.9 de `docs/documento-de-design-simulador.md`).
Um único executável com dois modos:

- **Professor** (`--professor`): serve HTTP + WebSocket em todas as interfaces na porta da sala (47800) e nas portas candidatas (8080, 8000, 3000, 5000, 80), responde à descoberta UDP (47801) e mostra ao vivo quem conectou. O painel só abre no próprio computador (`http://127.0.0.1:47800/`).
- **Aluno** (`--aluno`): página só em `127.0.0.1:47802`, busca salas por broadcast UDP, testa HTTP/WebSocket/portas e gera carga com N conexões WebSocket.
- Sem argumentos: tela inicial no navegador + menu no console.

Alunos sem o executável: `http://<ip-do-professor>:47800/teste`.

Relatórios `.txt`/`.json` em `relatorios-poc-rede/` ao lado do exe (ou `%LOCALAPPDATA%\poc-rede\relatorios`).

Roteiro para o laboratório: [`docs/roteiro-teste-poc-rede.md`](../../docs/roteiro-teste-poc-rede.md).

## Desenvolvimento

```
bun install
bun run professor      # ou: bun run aluno / bun run dev
bun run typecheck
bun run build          # gera dist/poc-rede.exe (bun-windows-x64-baseline)
```

Sem dependências em tempo de execução; páginas em `src/pages/` são embutidas no exe (`import ... with { type: "text" }`).
O código evolui para o diagnóstico de rede do painel do professor (`apps/server`) e para o guia da TI.
