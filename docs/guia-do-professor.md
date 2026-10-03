# Guia do professor — Simulador de Mercado

Versão 0.1.0 · 03/10/2026 · para quem conduz uma aula com o cenário **Cadeia mínima** (vale também para o Introdutório).

## 1. O que você precisa ter antes

- O **endereço do servidor** (ex.: `http://10.1.2.30:47800`) e a **chave de professor**, que a TI informa. Se ainda não existem, peça o `docs/guia-ti.md` a quem administra o servidor.
- Um computador com navegador (Edge, Chrome ou Firefox) para você, e outro ligado ao projetor para o telão (pode ser o mesmo).
- Os alunos só precisam do navegador e do **código da sala**.

## 2. Criar a sala

1. Abra `http://<endereço>/professor`.
2. Preencha:

| Campo | O que escolher na primeira aula |
|---|---|
| Chave de professor | A que a TI informou |
| Cenário | **Cadeia mínima** (fazendas, fábricas e lojas). O **Introdutório** é o mesmo jogo sem fazendas |
| Mercados paralelos | 1 para até 8 equipes; 2 ou 3 para turmas grandes (as equipes de um mercado só competem entre si) |
| Equipes por mercado | 2 a 8. Para 30 alunos, 6 equipes de 5 funciona bem |
| Vagas que ficarem sem equipe | "Ficam inativas" ou um robô (ver abaixo) |
| Duração | 12 meses de jogo é suficiente para um primeiro encontro; 24 para a aula completa |
| Velocidade | 3 s por dia (1 mês de jogo = 1 min 30 s). A tela mostra o tempo real de cada mês |
| Modo do relógio | **Rodada** na primeira aula (veja a seção 5) |
| Ranking para os alunos | Completo, só a própria posição, ou oculto |
| Critério de pontuação | Lucro acumulado (padrão) ou participação na receita |

3. Clique em criar. O painel abre com o **código da sala** (5 letras), o **PIN de 6 dígitos** e o link do telão. **Anote o PIN**: com o código e o PIN você reabre o painel em qualquer computador. Não o mostre no telão.

**Robôs nas vagas vazias:** equipes ausentes não deixam o mercado vazio. As estratégias são Preço baixo, Premium, Marca, Equilibrada e Revenda; os robôs jogam na camada de varejo e fábricas e **não usam fazendas nem o atacado**. Com poucos alunos, robôs deixam o mercado mais realista; com uma turma cheia, deixe as vagas inativas.

## 3. Colocar os alunos na sala

No painel, em **Acesso à sala**, estão o endereço e o código. Escreva no quadro ou projete:

> Endereço: `http://10.1.2.30:47800` · Código da sala: `K7QM2`

Cada aluno abre o endereço, digita o código, o nome ou apelido e **cria uma equipe** (nome e cor) ou **entra numa equipe que já existe** (todos os colegas de uma equipe decidem juntos, com os mesmos números). Em **Equipes** você vê quem está conectado e pode renomear equipes e mover um aluno de equipe. Depois que a partida começa, só dá para entrar numa equipe existente.

Para o projetor: **Abrir telão numa nova aba** (somente leitura; mostra ranking e informação pública). Se o link do telão vazar, gere outro no painel.

## 4. Conduzir a partida

Os botões do relógio ficam no topo do painel:

- **Iniciar partida**: começa o dia 1. Antes disso os alunos já podem preparar decisões.
- **Pausar / Retomar**: com a opção "Alunos podem mudar decisões quando o professor pausa" desligada, a pausa **trava** as decisões (use para explicar algo). Ligada, a pausa libera as decisões.
- **Avançar manualmente** (em pausa): um dia, até o fim da semana ou até o fim do mês.
- **Opções da partida**: mudar a velocidade, o modo, a visibilidade do ranking e a edição na pausa sem parar o jogo.
- **Estender por N meses** e **Encerrar partida** (encerrar congela os resultados e não tem volta).

As decisões dos alunos valem a partir do **dia seguinte**; a tela deles avisa "vale a partir de amanhã".

## 5. Modo contínuo ou rodada

| | Contínuo | Rodada |
|---|---|---|
| Como anda | Sozinho, até você pausar | Para sozinho no último dia de cada mês |
| Para quem é | Turmas experientes, aulas com tempo definido | **Primeira aula**: dá tempo de ler o fechamento do mês e decidir |
| Ritmo típico | 24 meses a 3 s/dia = 36 min | Cada rodada: a turma lê o fechamento, decide e marca "Pronto" |

No modo rodada, a tela do aluno abre o **fechamento do mês** (DRE e posição no ranking) e o botão **Pronto**. Com "Retomar sozinho quando todas as equipes marcarem 'pronto'", o jogo segue quando todos terminam; senão, você retoma.

## 6. O que olhar no painel

- **Ranking** e **Empresas**: caixa, lucro do último mês e acumulado, receita, pontos de venda, fábricas e, no cenário da cadeia, **fazendas** e o **estoque de matéria-prima por equipe**.
- **Ofertas por produto**: preço, participação, nota, estoque, qualidade e marca de cada empresa.
- **Avisos do último dia**: ruptura de estoque, caixa negativo (crédito emergencial), fábricas e fazendas concluídas, estoque cheio.
- **Diagnóstico de rede** e **Acesso à sala**: se um aluno não conecta, veja ali o endereço e o que pedir à TI.

Se o navegador fechar ou você trocar de computador: `/professor` → **Reabrir sala** com o código e o PIN. As salas continuam no servidor entre as aulas; se o servidor reiniciar, elas voltam **pausadas** no último dia gravado.

## 7. Roteiro de uma aula (cadeia mínima, ~90 min)

| Tempo | Atividade |
|---|---|
| 0–10 min | Apresentar o objetivo: maximizar o lucro acumulado numa cadeia que vai da fazenda à loja. Os alunos entram e formam equipes |
| 10–20 min | Tour pela tela com a turma (veja o guia do aluno): as três colunas (fazendas, fábricas, loja), os cartões e o painel de decisões |
| 20–60 min | Partida em modo rodada, 12 meses. Pare no fim do mês 1 e do mês 3 para comentar decisões (preço, abastecimento, primeira fazenda) |
| 60–80 min | Discussão guiada (perguntas abaixo) e resultados |
| 80–90 min | Ranking final, o que cada equipe faria diferente |

**Perguntas para a discussão**
- Quem construiu fazenda: o estoque próprio saiu mais barato que o do fornecedor? E a qualidade?
- O gado de corte entrega carne **e** couro juntos. O que aconteceu com quem não tinha uso para o couro?
- Vender à **cooperativa** resolveu o estoque cheio? Quanto custou, comparado ao preço do fornecedor?
- Alguém usou o **atacado**? A que preço comprou ou vendeu, e por que a outra equipe aceitou?
- Trocar a atividade de uma fazenda compensa? O que se perde na conversão?

## 8. Problemas comuns

| Situação | O que fazer |
|---|---|
| Um aluno não consegue entrar | Conferir o código (5 caracteres, sem 0/O nem 1/I/L); ver **Diagnóstico de rede**; testar `http://<endereço>/teste` no computador dele |
| Decisões "travadas na pausa" | A pausa trava as decisões; ligue a opção em **Opções da partida** ou retome |
| Equipe com caixa negativo | O jogo cobre o déficit com crédito emergencial (juros altos). Aparece em **Avisos**; converse com a equipe |
| Fazenda "parada · cheio" | O estoque de matéria-prima atingiu o limite: a equipe precisa usar, vender (atacado ou cooperativa) ou reduzir a produção |
| Engano de equipe | **Equipes** → "Mover para…" |
| Aluno fechou a aba | Entrar de novo com o mesmo endereço e código; a equipe continua igual |

## 9. Limitações desta versão

- Os **robôs não negociam no atacado**: o atacado só existe entre equipes de alunos.
- Os números da **jaqueta de couro** e do **varejo de carne e frango** ainda são provisórios.
- Não há exportação de relatórios em arquivo; use o painel e as janelas de Resultados e Gráficos dos alunos.
- Telas pensadas para computador (não para celular).
