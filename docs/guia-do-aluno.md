# Guia do aluno — Simulador de Mercado (cadeia mínima)

Versão 0.1.0 · 03/10/2026 · uma página para a equipe consultar durante o jogo.

## 1. Entrar

1. No navegador, abra o **endereço** que o professor escreveu no quadro (ex.: `http://10.1.2.30:47800`).
2. Digite o **código da sala** (5 letras), seu **nome ou apelido** e escolha: **criar uma equipe** (nome e cor) ou **entrar numa equipe** que já existe.
3. Todos de uma equipe veem e decidem sobre a **mesma empresa**. Se o navegador fechar, entre de novo com o mesmo endereço e código.

## 2. O objetivo

Sua equipe dirige uma empresa que vende produtos aos consumidores da cidade. Vence quem tiver o **maior lucro acumulado** no fim da partida (ou o critério que o professor escolher). Cada dia de jogo passa sozinho; **as decisões valem a partir do dia seguinte**.

## 3. A tela

- **Topo:** a data, a barra do mês, o **caixa**, o **lucro do mês** e a **posição** no ranking. Os botões **Cadeia (C)** e **Produtos (V)** trocam a visão.
- **Direita:** o ranking do mercado e os avisos da equipe (fábrica pronta, estoque esgotado, caixa negativo…).
- **Embaixo:** **Resultados (R)**, com DRE e balanço, e **Gráficos (G)**. No modo rodada, o botão **Pronto (P)** diz que a equipe terminou de decidir o mês.

### A visão da cadeia (a que abre primeiro)

Três colunas, da matéria-prima ao consumidor:

| Coluna | O que é |
|---|---|
| **Fazendas** | Produzem matéria-prima: leite, morango, açúcar, carne, couro, frango. Cada cartão mostra o estoque (barras), a linha dos últimos dias e o estado: *produzindo*, *quase cheio*, *parada · cheio*, *em obra*, *convertendo* |
| **Fábricas** | Transformam matérias-primas em produtos (sorvete, iogurte, leite engarrafado, sapato, carteira, jaqueta). Cada insumo mostra de onde vem: **própria** (das suas fazendas) ou **externo** (do fornecedor) |
| **Loja** | Onde os consumidores compram. Mostra o que está à venda, o preço e as vendas de ontem |

Clique num cartão (ou tecle **1 a 9**) para ver e decidir no painel ao lado. **I** abre a aba da instalação e **A** abre o **Atacado**. Quando você escolhe uma instalação, **fios** ligam o que ela entrega ao que ela recebe.

Os campos **enviam sozinhos**: digite, pare, e o número é enviado ("✓ enviado · vale a partir de amanhã"). Esc desfaz o que você digitou; − e + mudam pelo passo.

## 4. As decisões da cadeia

- **Nova fazenda:** escolha a atividade (gado leiteiro, gado de corte, frango, morango, cana-de-açúcar). Custa capex, leva dias de obra e tem custo fixo mensal. Defina a **produção por mês**; a capacidade é limitada.
- **Estoque cheio:** a fazenda **para** quando o estoque de uma matéria-prima enche (o custo fixo continua). O gado de corte produz **carne e couro juntos**: se um deles enche, os dois param.
- **Origem de cada insumo (na fábrica):** *estoque próprio* (custa o que a fazenda gastou para produzir, com a qualidade dela) ou *fornecedor externo* (preço fixo, qualidade fixa, sempre disponível). Se o estoque próprio não basta, o que falta vem do fornecedor.
- **Atacado:** você pode **oferecer** a sua matéria-prima a outras equipes (preço entre o piso da cooperativa e o preço do fornecedor) e **pedir** a de outra equipe (botão *Comprar*). O pedido é contínuo, com um vendedor por matéria-prima.
- **Cooperativa:** compra qualquer matéria-prima **pelo piso** (60% do preço do fornecedor), **só quando você manda vender**. É a saída para o estoque parado, mas paga pouco.
- **Trocar a atividade** de uma fazenda: custa dinheiro e a deixa parada por alguns dias; o estoque que sobrar precisa ser **vendido à cooperativa, vendido barato no atacado ou destruído**.
- **Loja:** o preço, a publicidade e a P&D de cada produto ficam na visão **Produtos (V)**. Para carne e frango você escolhe se vêm do fornecedor ou das suas fazendas.

## 5. Atalhos

| Tecla | Faz |
|---|---|
| **C** / **V** | Visão Cadeia / visão Produtos |
| **1–9** | Escolhe a instalação (na cadeia) ou o produto (em Produtos) |
| **I** / **A** | Aba da instalação / aba do atacado |
| **R** / **G** | Resultados / Gráficos |
| **P** | Pronto (modo rodada) |
| **Esc** | Fecha janelas e cancela confirmações |

Ações caras (construir, abrir loja) pedem **dois cliques**: o primeiro pergunta o valor, o segundo confirma.

## 6. Dicas para começar

1. Veja o **caixa** e o preço de referência: um preço muito alto some do mercado, um muito baixo não cobre o custo.
2. **Marca** e **qualidade** contam tanto quanto o preço na nota de compra do consumidor; publicidade e P&D agem **aos poucos**.
3. Uma fazenda **só paga** se a produção é usada. Antes de construir, calcule o que sua fábrica consome por mês.
4. Fique de olho nos **avisos**: ruptura de estoque, estoque cheio e caixa negativo custam caro.
5. Com o caixa negativo a empresa entra em **crédito emergencial**, com juros altos.

## 7. Dúvidas

| Situação | O que fazer |
|---|---|
| "Travado na pausa" | O professor pausou e travou as decisões; espere ou peça para liberar |
| Não consegue entrar | Confira o código e o endereço; peça ao professor para ver o diagnóstico |
| O número que digitei voltou | O servidor recusou (o campo mostra o motivo, em vermelho): ajuste e envie de novo |
| Errei de equipe | Fale com o professor: ele move o aluno |
