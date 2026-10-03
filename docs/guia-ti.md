# Guia para a TI — Simulador de Mercado (servidor em rede local)

Versão 0.1.0 · 03/10/2026 · uma página para quem administra o computador servidor e a rede do laboratório.

## 1. O que é e o que não é

O servidor é **um único arquivo** (`simulador-de-mercado.exe`, ~87 MB) que serve as telas do jogo e o próprio jogo. Os professores e os alunos usam **só o navegador** (Edge, Chrome ou Firefox atuais), sem instalar nada.

- Não precisa de internet, de instalador, de banco de dados externo nem de conta em nuvem.
- Não precisa de administrador **para executar**. O administrador só é necessário **uma vez**, para a regra de firewall da seção 3.
- Os dados ficam numa pasta local (seção 5). Nada sai da rede da instituição.

## 2. Requisitos do computador servidor

| Item | Requisito |
|---|---|
| Sistema | Windows 10 ou 11, 64 bits (funciona em processadores sem AVX2) |
| Rede | Cabo (gigabit) e endereço IP estável, alcançável pelos laboratórios de aula |
| Disponibilidade | Ligado e sem suspensão enquanto houver aula (as salas continuam entre as aulas) |
| Recursos | Muito abaixo de um PC comum: 60 alunos usam ~70 MB de memória e ~3% de um núcleo (seção 6) |
| Porta | **TCP 47800** (padrão; pode ser outra com `--porta`) |

Os computadores dos professores, do projetor e dos alunos **não precisam de nenhuma configuração**: só abrir o endereço no navegador.

## 3. Firewall: uma regra, só no servidor

O Windows bloqueia conexões de entrada até existir uma regra. Criar, em prompt **como administrador**, no computador servidor:

```
netsh advfirewall firewall add rule name="Simulador de Mercado" dir=in action=allow protocol=TCP localport=47800 profile=domain,private
```

- É uma regra **por porta**, e não por programa, porque o executável é portátil e pode mudar de pasta.
- Só TCP. O servidor não usa UDP neste modo.
- Se o laboratório usar perfil "Público", acrescentar `public` à lista de perfis.
- Para remover: `netsh advfirewall firewall delete rule name="Simulador de Mercado"`.

## 4. Bloqueio de executáveis

Se a instituição usa AppLocker, Windows Defender Application Control ou similar, liberar o `simulador-de-mercado.exe` (por caminho ou por hash). O executável **não é assinado digitalmente** nesta versão; o SmartScreen pode avisar na primeira execução ("Mais informações" → "Executar assim mesmo"). Cada versão nova tem hash novo.

## 5. Primeira execução

1. Copiar o `.exe` para uma pasta do servidor (ex.: `D:\Simulador`). Se a pasta for gravável, os dados ficam ao lado dele (`dados-simulador`); senão, em `%LOCALAPPDATA%\SimuladorDeMercado`. Para escolher: `--dados <pasta>`.
2. **Definir a chave de professor** (uma vez; é a que os professores digitam para criar salas):
   `simulador-de-mercado.exe --definir-chave` (pergunta no console) ou `--definir-chave "<chave>"`.
3. Iniciar: `simulador-de-mercado.exe` (opções: `--porta`, `--dados`, `--host`). Deixar a janela aberta; fechar a janela encerra o servidor.
4. No próprio servidor, abrir `http://localhost:47800/admin` para listar, encerrar e excluir salas e trocar a chave. Essa página **só abre no computador servidor** (de outra máquina é recusada).
5. Informar aos professores o endereço `http://<IP do servidor>:47800` e a chave.

**Backup:** a cada inicialização o servidor copia o banco para a subpasta `backups` e guarda as cópias mais recentes. Não há cópia automática durante uma aula: para guardar fora da máquina (ou antes de uma aula importante), copiar a pasta de dados com o servidor parado.
**Atualizar a versão:** parar o servidor, trocar o `.exe` e iniciar. O banco é salvo e migrado sozinho; as salas voltam pausadas.
**Queda ou reinício:** ao voltar, as salas em andamento reabrem **pausadas** no último dia gravado (no máximo o dia em curso se perde).

## 6. Como testar antes da aula

| Teste | Como | Esperado |
|---|---|---|
| Servidor no ar | No servidor, `http://localhost:47800` | Abre a tela inicial |
| Alcance pela rede | De um computador do laboratório, `http://<IP>:47800/teste` | A página mostra HTTP e WebSocket funcionando e a latência (poucos milissegundos) |
| Turma inteira (opcional, exige o repositório e o Bun) | `bun run carga --url http://<IP>:47800 --chave "<chave>" --alunos 60` | "APROVADO" (6 de 6 critérios) |

O teste de carga simula 60 alunos jogando de verdade (entrar, decidir, receber atualizações). Resultados medidos em 03/10/2026, com o servidor e os clientes simulados na mesma máquina, sobre o `.exe`:

| Cenário | Latência de um comando (p95) | Quedas | Memória do servidor | Tráfego |
|---|---|---|---|---|
| 60 alunos, 1 dia de jogo a cada 3 s | 2,4 ms | 0 | ~70 MB | ~2,2 MB/s (≈ 18 Mbit/s) |
| 150 alunos, 1 dia a cada 1 s | 4,0 ms | 0 | ~83 MB | ~13 MB/s (≈ 108 Mbit/s) |

**Banda:** cada atualização tem ~25 KB e vai a todos a cada dia de jogo. Com a velocidade padrão (3 s por dia) e 60 alunos, o servidor envia ~18 Mbit/s: confortável em cabo gigabit. Em velocidades altas (menos de 1 s por dia) e turmas grandes, o cabo do servidor deixa de ser folga; para Wi-Fi fraco nos alunos, manter 3 s por dia ou mais.

## 7. Segurança (resumo)

- Sem contas individuais: o professor usa a chave do servidor para criar a sala e um PIN de 6 dígitos por sala para reabrir o painel; o telão tem link próprio, somente leitura, que o professor pode trocar.
- O acesso é por `http` sem TLS, adequado a rede fechada de laboratório; não há dados pessoais além do apelido que o aluno digita.
- Tentativas erradas de chave, PIN e código são limitadas por IP e por sala, com espera crescente. Cada conexão tem limite de mensagens por segundo.
- Toda decisão é validada no servidor; um aluno só vê e altera a própria equipe.

## 8. Se algo não funciona

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| Do laboratório, o endereço não abre | Firewall do servidor sem a regra, ou IP errado | Conferir a regra da seção 3 e o IP (`ipconfig`); testar `/teste` |
| Abre, mas a tela fica "Conectando" | Proxy ou filtro que bloqueia WebSocket | Liberar WebSocket (`ws://`) para o IP do servidor, ou pedir a página `/teste` |
| O `.exe` não executa | Bloqueio de executáveis | Liberar o arquivo (seção 4) |
| Porta já em uso | Outro programa na 47800 | Iniciar com `--porta <outra>` e ajustar a regra |
| Salas sumiram depois de reiniciar | Pasta de dados diferente da anterior | Iniciar com `--dados <a pasta de sempre>` |
| Alunos caem e voltam | Wi-Fi do laboratório instável | A tela reconecta sozinha; se persistir, trocar para cabo ou aumentar os segundos por dia |

Dúvidas técnicas: ver `docs/documento-de-design-simulador.md`, seções 9.1 a 9.7.
