# Roteiro do piloto — cadeia mínima com uma turma real

Versão 0.1.0 · 03/10/2026 · critério de aceite da fase 1b: **uma turma real joga o cenário `cadeia/minima` em laboratório, sem falhas bloqueantes**.

## 1. Objetivo e o que se quer aprender

1. **Funciona?** O servidor, a rede do laboratório e as telas aguentam uma turma inteira durante uma aula.
2. **Os alunos entendem?** Conseguem ler a cadeia, construir uma fazenda, escolher a origem de um insumo e vender, sem ajuda constante.
3. **O jogo é bom?** As decisões da cadeia fazem sentido econômico para quem joga, e nenhum caminho (só fábrica, só fazenda, integrado, vender à cooperativa) vira o atalho óbvio.
4. **O atacado acontece?** É a parte que nenhum robô testou: as equipes negociam entre si?

## 2. Falha bloqueante

Interrompe o piloto ou o invalida. Registrar hora, o que se via e, se possível, uma captura de tela.

- Mais de 10% da turma não consegue entrar ou cai repetidamente.
- O servidor para ou reinicia durante a aula.
- Uma tela trava, fica em branco ou deixa de reagir (precisa recarregar para continuar).
- Um número visivelmente errado (caixa que não fecha, estoque negativo, ranking incoerente).
- Os alunos veem dados de **outra** equipe (vazamento) ou o telão mostra dado privado.

Não é bloqueante, mas é registrado: rótulo confuso, botão difícil de achar, texto cortado, dúvida recorrente da turma, decisão que "ninguém faz".

## 3. Antes do dia

| Quando | O que | Quem |
|---|---|---|
| 1 a 2 semanas antes | Entregar o `docs/guia-ti.md`; criar a regra de firewall; combinar o endereço fixo do servidor; liberar o `.exe` | TI |
| 1 semana antes | Rodar **no próprio laboratório**: `http://<IP>:47800/teste` em 3 a 5 computadores (HTTP e WebSocket ok) | Professor + TI |
| 1 semana antes | Rodar o teste de carga contra o servidor do laboratório: `bun run carga --url http://<IP>:47800 --chave "<chave>" --alunos 60` (resultado esperado: **APROVADO**) | Desenvolvedor |
| 3 dias antes | `bun run verificar` e `bun run e2e` na versão que vai a campo; anotar a versão do executável (ela aparece no relatório de carga) | Desenvolvedor |
| 1 dia antes | Criar a sala de ensaio, entrar com 2 computadores, jogar 3 meses e encerrar. Conferir o telão no projetor | Professor |
| 1 dia antes | Imprimir (ou enviar por e-mail) o `docs/guia-do-aluno.md`; conferir que o professor leu o `docs/guia-do-professor.md` | Professor |

**Configuração recomendada da sala:** cenário *Cadeia mínima*; 2 mercados × 8 equipes para 40 a 60 alunos (1 mercado × 6 equipes para até 30); vagas vazias **inativas**; duração 12 meses; velocidade 3 s por dia; **modo rodada**; ranking completo; critério lucro acumulado.

## 4. No dia

**30 minutos antes**
- Ligar o servidor (`simulador-de-mercado.exe`), confirmar o IP e deixar a janela aberta.
- Criar a sala **nova** (não reaproveitar a de ensaio). Anotar o código e o PIN.
- Abrir o telão no projetor. Escrever no quadro: endereço e código.
- Ter à mão: este roteiro, a folha de observação (seção 6), um celular para fotografar telas com problema.

**Durante a aula** (90 min)

| Tempo | Atividade | Observar |
|---|---|---|
| 0–10 | Alunos entram e formam equipes | Quantos entram sem ajuda; erros de código ou endereço; tempo até todos conectados |
| 10–20 | Tour pela tela (guia do aluno, seção 3) | Perguntas sobre as três colunas; o que não é óbvio |
| 20–25 | Iniciar a partida. Mês 1 em modo rodada | Primeiras decisões: o que fazem primeiro (preço? fazenda?) |
| 25–60 | Meses 2 a 12; parar nos fins do mês 1, 3 e 6 para comentar o fechamento | Quem construiu fazenda e quando; estoques cheios; uso do atacado e da cooperativa; caixa negativo |
| 60–80 | Discussão guiada (guia do professor, seção 7) | Os alunos explicam as próprias escolhas? |
| 80–90 | Resultados e ranking final | Quem venceu fez o quê? Caminho dominante? |

**Regras do dia**
- O professor **não resolve** dúvidas de jogo nos primeiros 5 minutos de cada mês: anotar a dúvida e ver se a turma resolve sozinha.
- Qualquer falha bloqueante: anotar, tentar **uma** recuperação (recarregar a página; reabrir o painel com o PIN) e, se não resolver, **pausar** e seguir o plano B.
- Não alterar nada do servidor durante a aula.

## 5. Plano B

| Problema | Ação |
|---|---|
| Parte da turma não conecta | Ver `/teste` no computador com problema; trocar de cabo/endereço; os que conectam jogam, os outros jogam em dupla |
| Servidor cai | Reiniciar o `.exe`; as salas voltam **pausadas**; reabrir o painel com código e PIN; retomar |
| Rede inteira falha | Rodar o servidor no computador do professor (modo A, exige a regra de firewall) ou encerrar e remarcar |
| Tela com defeito | Recarregar a página (a equipe continua igual); anotar e fotografar |
| Turma perdida no jogo | Pausar, usar o telão para mostrar a visão da cadeia e refazer o tour de 5 min |

## 6. Folha de observação (preencher durante a aula)

| Hora | Mês | Equipe | O que aconteceu | Tipo (bloqueante / incômodo / dúvida / ideia) |
|---|---|---|---|---|
| | | | | |

Perguntas fixas para anotar ao fim de cada marco:

- **Mês 1:** quantas equipes definiram preço e abastecimento sem ajuda? Alguma usou a visão *Produtos*?
- **Mês 3:** quantas construíram fazenda? Qual atividade? Alguém desistiu da fazenda e por quê?
- **Mês 6:** alguém tem estoque cheio ("parada · cheio")? O que fizeram? Alguém negociou no atacado ou vendeu à cooperativa?
- **Fim:** o que a equipe vencedora fez de diferente? Alguém integrou fazenda e fábrica?

## 7. Depois da aula

1. Ver a **posição final** e o **lucro** de cada equipe no painel (Ranking e Empresas) e anotar quantas equipes têm fazenda e de que tipo (fotografar a tabela). Anotar também o estoque de matéria-prima por equipe.
2. **Não excluir a sala** até a análise terminar (`/admin`, no servidor, lista as salas).
3. Copiar a pasta de dados do servidor (com o servidor parado) para guardar o registro da partida.
4. Questionário rápido para os alunos (5 minutos, no papel ou em formulário):
   - Entendi o que eu precisava decidir (1 a 5).
   - A fazenda valeu a pena para a minha equipe? Por quê?
   - O que eu mudaria na tela?
   - O que foi mais difícil de entender?
5. Reunião de 30 minutos com o professor e o desenvolvedor: listar falhas bloqueantes, incômodos e ideias; decidir o que entra antes da próxima turma.

## 8. Critérios para dar o piloto como concluído

| Critério | Como se confirma |
|---|---|
| Sem falhas bloqueantes | A seção 2 sem nenhuma ocorrência registrada |
| A turma jogou até o fim | A partida chegou ao mês 12 (ou ao combinado) com todas as equipes ativas |
| Os alunos usaram a cadeia | Pelo menos metade das equipes construiu ao menos uma fazenda |
| Nenhum atalho óbvio | Equipes vencedoras com caminhos diferentes, ou o ranking não se explica por um único caminho |
| Atacado | Registrar se houve negociação; **a ausência não reprova o piloto**, mas decide o ajuste do atacado |

Se algum critério falhar, o piloto se repete com a versão corrigida. Os números do preset (`cadeia/minima` v0.2.0) são ajustáveis sem código; os ajustes e o que os motivou ficam em `docs/balanceamento/cadeia-minima/LEIAME.md`.
