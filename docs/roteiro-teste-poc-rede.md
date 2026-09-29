# Roteiro de teste no laboratório — PoC de rede (`poc-rede.exe`)

> Referência: seção 9.9 do `documento-de-design-simulador.md`. Duração estimada: **30 a 40 minutos**.
> Imprima este roteiro e preencha à mão durante o teste.

**Objetivo:** responder, no laboratório real, duas perguntas:

1. **O programa roda** no computador do professor e nos dos alunos, sem ser bloqueado?
2. **Os alunos conseguem se conectar** ao computador do professor?

E também: 3) a **descoberta automática** da sala funciona nesta rede? 4) a conexão **aguenta uma turma inteira**?

O programa **não instala nada, não precisa de administrador e não altera nenhuma configuração** do Windows (firewall, rede etc.). Ele só lê informações e abre conexões de teste.

---

## 0. Antes de ir

**Levar:**
- [ ] Pendrive com `poc-rede.exe` (cerca de 86 MB) na raiz.
- [ ] Uma cópia do `poc-rede.exe` num link (Google Drive, OneDrive ou e-mail para você mesmo). Copiar pelo pendrive **não** marca o arquivo como "baixado da internet", e é essa marca que faz o Windows mostrar o aviso do SmartScreen. Baixar pelo link reproduz o caminho mais realista.
- [ ] Celular para fotografar mensagens do Windows.
- [ ] Este roteiro impresso e uma caneta.

**Anotar:**

| Item | Resposta |
|---|---|
| Data e horário | |
| Laboratório / sala | |
| Nº de computadores no laboratório | |
| Rede cabeada ou Wi-Fi? | |
| Computador do professor (nome/etiqueta) | |
| Login usado no professor (usuário comum ou administrador?) | |
| Login usado nos alunos | |

---

## 1. O programa roda? (10 min)

Faça no **computador do professor** e em **pelo menos 3 computadores de alunos**. As políticas de bloqueio costumam tratar pastas de formas diferentes, então teste **três lugares**:

1. **Pendrive:** dê dois cliques em `poc-rede.exe` direto do pendrive.
2. **Downloads:** baixe o arquivo pelo link (ou copie-o) para a pasta *Downloads* e execute.
3. **Área de trabalho:** copie para a área de trabalho e execute.

Em cada tentativa, deve abrir uma **janela preta** e, em seguida, uma página no navegador com dois botões. Se funcionar, feche a janela preta e passe ao próximo lugar.

**Se aparecer alguma mensagem, fotografe-a.** As mais comuns:

| Mensagem | O que significa | O que fazer |
|---|---|---|
| "O Windows protegeu o computador" (tela azul do SmartScreen) | O programa não tem assinatura digital | Clique em **Mais informações → Executar assim mesmo**. Anote se o botão existe (em algumas redes ele é removido). |
| "Este aplicativo foi bloqueado pelo administrador" / "bloqueado pela política do grupo" | AppLocker ou política da TI | Anote. Não há como contornar sem a TI. |
| O antivírus apagou ou colocou o arquivo em quarentena | Falso positivo do antivírus | Anote o nome do antivírus e a mensagem. |
| Nada acontece | Pode ser bloqueio silencioso | Anote e tente de outro lugar. |

**Preencha** (✓ rodou · ✗ bloqueado · SS = SmartScreen apareceu mas deu para executar):

| Computador | Pendrive | Downloads | Área de trabalho | Mensagem / foto nº |
|---|---|---|---|---|
| Professor: | | | | |
| Aluno 1: | | | | |
| Aluno 2: | | | | |
| Aluno 3: | | | | |

> Se o programa **não rodar em nenhum lugar no computador do professor**, pule para a seção 8 e registre o resultado. Ainda vale fazer o teste 5 (só navegador) a partir de outra máquina onde ele rode, usando essa máquina como "professor".

---

## 2. Abrir a sala no computador do professor (3 min)

1. Execute `poc-rede.exe` (do lugar que funcionou) e clique em **"Criar sala — Professor"**.
   - Se o navegador não abrir, digite `1` na janela preta e pressione Enter. O endereço do painel aparece na janela.
2. **Aviso do firewall.** O Windows pode mostrar "O Firewall do Windows Defender bloqueou alguns recursos deste aplicativo".
   - Clique em **Permitir acesso**.
   - Se pedir **senha de administrador** e você não tiver, clique em **Cancelar**. Isso é um resultado importante: anote.

| Pergunta | Resposta |
|---|---|
| Apareceu o aviso do firewall? | ☐ sim ☐ não |
| Conseguiu clicar em "Permitir" sem senha de administrador? | ☐ sim ☐ pediu senha ☐ não apareceu |

3. No painel, anote:

| Item do painel | Valor |
|---|---|
| Endereço grande (ex.: `http://10.1.2.30:47800`) | |
| Código da sala | |
| Perfil de rede (Público / Privado / Domínio) | |
| Administrador: membro? elevado? | |
| Firewall: ativo? entrada padrão? | |
| Portas TCP que abriram (47800, 8080, 8000, 3000, 5000, 80) | |
| Porta UDP 47801 abriu? | |

**Deixe a janela preta aberta** até o fim do teste. Fechá-la encerra a sala.

---

## 3. Entrar pelo programa do aluno (5 min)

Em cada computador de aluno:

1. Execute `poc-rede.exe` e clique em **"Entrar em sala — Aluno"** (ou digite `2` na janela preta).
2. A página procura salas por uns 3 segundos. Anote se a sala do professor **apareceu na lista**.
3. Clique em **"Conectar e testar"**. Se a sala não apareceu, digite o endereço do painel do professor no campo "Não apareceu? Digite o endereço" e clique em **Testar**.
4. Com o teste OK, clique em **"Abrir a sala no navegador"**. Isso testa o caminho que o jogo vai usar: o navegador do aluno conversando com o professor.
5. Se o Windows mostrar aviso do firewall **no computador do aluno**, anote e clique em Cancelar (o aluno não deve precisar de nada).

| Computador | Sala apareceu na lista? | HTTP | WebSocket | Portas OK | Latência média | Aviso de firewall no aluno? |
|---|---|---|---|---|---|---|
| Aluno 1 | | | | | | |
| Aluno 2 | | | | | | |
| Aluno 3 | | | | | | |

Confira no **painel do professor** se as máquinas aparecem em "Alunos conectados".

---

## 4. Entrar só pelo navegador, sem o programa (3 min)

Este é o caminho que **precisa funcionar** mesmo se o programa for bloqueado nos alunos.

1. Num computador de aluno (de preferência um que **não** rodou o programa), abra o navegador (Chrome, Edge ou Firefox).
2. Digite o endereço do painel do professor acrescido de `/teste`, por exemplo `http://10.1.2.30:47800/teste`.
   - Só o endereço, sem `/teste`, também funciona: leva à mesma página.
3. Digite o nome/etiqueta do computador e clique em **Iniciar teste**.
4. Anote o resultado:

| Computador | Navegador | Página abriu? | HTTP | WebSocket | Portas que passaram |
|---|---|---|---|---|---|
| | | | | | |
| | | | | | |

> Se a página **não abrir** com a porta 47800, teste as outras portas que abriram no professor: `http://<ip>:8080/teste`, `:8000`, `:3000`, `:5000` e `:80`. Se alguma funcionar, já existe uma regra liberando essa porta.

---

## 5. Teste de carga (5 min)

Simula uma turma inteira com poucos computadores.

1. Em **2 ou 3 computadores de alunos** que passaram no teste da seção 3, vá até **"Teste de carga"**.
2. Escolha **25 conexões** (ou 50) e **60 s**, e clique em **Iniciar**, se possível em todos ao mesmo tempo.
3. No painel do professor, acompanhe **"Teste de carga"**: ativas agora, pico e quedas.
4. Se sobrar tempo e houver alunos na sala, peça que **todos** abram `http://<ip>:47800/teste` ao mesmo tempo.

| Computador | Conexões pedidas | Abertas | Falharam | Caíram | Latência média / máx |
|---|---|---|---|---|---|
| | | | | | |
| | | | | | |
| | | | | | |
| **Pico no painel do professor** | | | | | |

---

## 6. Gerar e guardar os relatórios (2 min)

1. No painel do professor, clique em **"Gerar relatório"**. A página mostra onde os arquivos foram salvos.
   - Normalmente ficam na pasta `relatorios-poc-rede`, ao lado do `poc-rede.exe` (no pendrive, se rodou de lá).
   - Se essa pasta não aceitar gravação, eles ficam em `%LOCALAPPDATA%\poc-rede\relatorios`.
2. Copie os arquivos **`.txt` e `.json`** para o pendrive.
3. Nos computadores de alunos que **tiveram problema**, clique em **"Salvar relatório"** e copie também esses arquivos.

> O programa também salva um relatório automático a cada minuto (arquivo terminado em `-automatico`). Se a janela for fechada por engano, os dados até ali não se perdem.

---

## 7. Encerrar

Feche a janela preta em todos os computadores (ou pressione Ctrl+C). Nada fica instalado. Se quiser, apague o `poc-rede.exe` e a pasta `relatorios-poc-rede` das máquinas do laboratório.

---

## 8. Como interpretar o resultado

O relatório do professor já traz, no início, **"Conclusões preliminares"** respondendo às 4 perguntas. Use a tabela para decidir o próximo passo:

| Resultado | Conclusão | Próximo passo |
|---|---|---|
| Programa roda e os alunos conectam | **Não precisa da TI** | Seguir para a fase 0 |
| Programa roda, mas os alunos não conectam (nada aparece no painel) | Firewall de entrada bloqueando | Pedir à TI a regra por porta (seção 9.5): **TCP 47800 e UDP 47801, perfis Domínio e Privado**; ou usar modo B ou C |
| Alguma porta candidata funcionou (ex.: 8080), mas a 47800 não | Já existe regra liberando essa porta | Adotar essa porta como padrão (decisão 16) |
| Programa bloqueado no professor | Política de bloqueio de programas | Pedir liberação à TI (assinatura digital ajuda) ou modo C |
| Programa bloqueado só nos alunos, mas o navegador funciona | Sem impacto | Alunos entram por endereço + código |
| HTTP funciona, mas a sala não aparece na lista (UDP) | Sub-redes separadas ou isolamento entre clientes | Alunos entram por endereço + código |
| Conexões caem no teste de carga | Rede ou computador do professor limitados | Investigar antes da fase 1 |
| Perfil de rede **Público** no professor | O Windows bloqueia mais nesse perfil | Mencionar à TI: a rede do laboratório deveria ser Domínio ou Privada |

**Resumo final (preencher):**

| Pergunta | Resposta |
|---|---|
| 1. O programa roda no professor? E nos alunos? | |
| 2. Os alunos conectam? Por qual porta? | |
| 3. A descoberta automática (UDP) funciona? | |
| 4. Aguenta a turma? Pico e quedas | |
| Precisa acionar a TI? Para quê? | |

---

## 9. Problemas comuns

| Problema | O que fazer |
|---|---|
| O navegador não abriu sozinho | Copie o endereço mostrado na janela preta para o navegador, ou digite `1` / `2` na janela. |
| "Porta NÃO abriu" no painel | Outro programa já usa a porta. Tudo bem se outras portas abriram. Para escolher outra: `poc-rede.exe --professor --porta 47900`. |
| A sala não aparece na lista do aluno | Use o endereço digitado. Anote: é resultado do teste, não erro. |
| Página do aluno diz "Não foi possível falar com o computador do professor" | Confira se o endereço está certo e se a janela preta do professor continua aberta. Se estiver tudo certo, é o firewall de entrada. |
| O professor tem vários endereços no painel | Use o primeiro (o painel coloca a rede do laboratório primeiro). Os outros costumam ser adaptadores virtuais. |
| Wi-Fi | Redes Wi-Fi com "isolamento de clientes" impedem que os computadores se enxerguem. Se possível, repita no cabo. |
| O antivírus apagou o arquivo | Anote o nome do antivírus e a mensagem; isso vai para a TI junto com o pedido de liberação. |

**Opções da linha de comando** (para quem quiser usar o Prompt de Comando): `poc-rede.exe --ajuda`.
