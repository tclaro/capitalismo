# Simulador de Mercado para Ensino de Administração — Documento de Design

> **Nome provisório:** Simulador de Mercado (inspirado em *Capitalism*, Enlight Software, 1995)
> **Autor:** Thiago Claro — Fractal Data
> **Versão:** 0.8 — setembro de 2026 (calibração da fase 0: difusão tecnológica e curva de aprendizado da fábrica no modelo; critério de referência da Revenda na camada 1). Versão 0.7: pastas em português, partida típica de 24 meses, make or buy coexistindo, crédito emergencial com amortização automática, IR com compensação de prejuízo. Versão 0.6: resultado da PoC de rede e modo B adotado
> **Status:** visão e requisitos aprovados; plano de implementação a ser produzido
> **Anexo:** `docs/arvore-de-produtos.md` — lista completa de produtos, cadeias e calendário agrícola

---

## 0. Como usar este documento (instruções para o Claude Code)

Este é um **documento de visão e requisitos**, não um plano de implementação. Ao lê-lo em modo de planejamento:

1. Comece pela **seção 15 (Decisões em aberto)** e confirme com o autor as que bloqueiam o início.
2. Produza um plano de implementação **por fases**, seguindo o roadmap da seção 14. Cada fase deve terminar em algo utilizável e testável. **A primeira entrega é a PoC de rede (seção 9.9)**, que valida a arquitetura no laboratório real antes de investir no motor e nas telas.
3. Trate todas as fórmulas da seção 6 como **hipóteses iniciais parametrizadas**, não como verdades. O balanceamento (seção 10) vai ajustá-las.
4. Respeite os **princípios de arquitetura** da seção 3. Em especial: o motor de simulação é uma função pura, determinística e separada da interface e do banco.
5. Interface e textos voltados ao usuário em **português do Brasil**. Código, nomes de tabelas e identificadores podem ficar em inglês ou português — decidir e manter um padrão (ver seção 15).
6. **Arquitetura: servidor próprio portátil** (Bun + SQLite, seção 9), rodando na rede local da instituição. **Na instituição do autor, o padrão é o modo B** (seção 9.1): o servidor roda numa máquina fixa, separada do computador do professor, e o professor, o telão e os alunos acessam pelo navegador. O modo A (servidor no computador do professor) continua suportado pela mesma base de código. **Não usar Supabase nem outro serviço externo.** Tudo é desenvolvido e testado localmente, sem contas externas; o entregável é um executável `.exe` que não exige instalação nem administrador.
7. A árvore de produtos e o calendário agrícola estão no anexo `docs/arvore-de-produtos.md`. Os valores numéricos iniciais de receitas e pesos de qualidade podem ser consultados no Apêndice B do manual do Capitalism II (link na seção 17).

---

## 1. Contexto e objetivo

Ferramenta **didática e competitiva** para cursos de Administração, usada em laboratório de informática. Equipes de alunos dirigem empresas que disputam o mesmo mercado. O professor controla o ritmo, pausa para explicar conceitos e usa os resultados como material de discussão.

**Não é um produto comercial.** O objetivo é engajamento pela competição e aplicação prática de conceitos (preço, marketing, marca, P&D, make or buy, finanças, mercado de capitais e, futuramente, logística).

**Inspiração:** a série *Capitalism* (Capitalism, Capitalism Plus, Capitalism II, Capitalism Lab). Aproveitamos o **modelo conceitual**, testado ao longo de décadas, e descartamos a complexidade operacional que não serve à aula.

### 1.1 Critérios de sucesso

- Uma partida completa cabe em **uma aula de 1h30–2h**, incluindo pausas para explicação.
- Alunos entendem as decisões disponíveis em **menos de 10 minutos** de explicação.
- Nenhuma estratégia única domina: equipes com abordagens diferentes (preço baixo, premium, marca forte) podem vencer, dependendo da execução.
- O professor consegue conduzir o debate final com os relatórios gerados pela ferramenta.
- A ferramenta pode ser **reutilizada em outras disciplinas**, ativando módulos diferentes.
- **Qualquer professor da instituição** consegue usar sozinho: abre o endereço do servidor no navegador, cria a sala, e os alunos entram com o endereço e o código da sala exibidos no telão.

---

## 2. Público e cenário de uso

| Papel | Quem | O que faz |
|---|---|---|
| **Professor** | Docente da disciplina | Cria a partida, escolhe módulos e parâmetros, controla o tempo, dispara eventos, projeta resultados, conduz o debate |
| **Equipe** | 3 a 5 alunos | Dirige uma empresa: toma decisões, acompanha relatórios, compete pelo mercado |
| **Robô (opcional)** | Concorrente automático | Completa o mercado quando há poucas equipes |

**Cenário típico:** laboratório com 20 a 50 alunos em computadores desktop, professor com projetor. Todos na mesma sala, ao mesmo tempo, na **rede local da instituição**. O servidor é uma máquina fixa (modo B, seção 9.1); o computador do professor, o do projetor e os dos alunos só usam o navegador.

**Dimensionamento recomendado:**

- **4 a 8 equipes por mercado.** Menos de 4 gera pouca competição; mais de 8 dilui as fatias de mercado, as decisões perdem efeito visível e o debate fica difícil.
- **Turmas grandes → mercados paralelos**: vários mercados independentes com os mesmos parâmetros dentro da mesma partida (ex.: 50 alunos = 2 mercados × 6 equipes × ~4 alunos). No debate: "por que o mesmo cenário terminou diferente?"
- **Turmas pequenas → robôs** completam o mercado.

---

## 3. Princípios de design e arquitetura

1. **Didática antes de fidelidade.** Cada mecânica existe porque ensina um conceito (seção 11). Se não ensina, fica de fora ou vira módulo opcional.
2. **Camadas / módulos ativáveis.** A partida é configurada com os módulos que a disciplina precisa. O núcleo sempre existe; o resto se liga e desliga por partida (seção 5).
3. **Motor de simulação puro e determinístico.**
   - Função do tipo `step(estado, decisoes, parametros, rng) → novoEstado`.
   - Sem acesso a banco, rede ou relógio dentro do motor.
   - Gerador de números aleatórios com semente por partida: a mesma entrada produz sempre o mesmo resultado (permite replay, auditoria e testes).
   - O mesmo código roda no servidor e no script de balanceamento. **Não usar APIs específicas de runtime (Bun, Node) dentro do motor.**
4. **Tudo parametrizado.** Nenhum número "mágico" no código. Parâmetros ficam em arquivos de configuração versionados (presets) e podem ser ajustados pelo professor.
5. **Preparado para crescer.** "Mercado/cidade" é entidade desde o primeiro dia, mesmo com um mercado só. Toda compra e venda registra origem e destino, com custo de frete = 0 na versão inicial. Isso permite adicionar logística depois sem reescrever (seção 5, camada futura).
6. **Decisões persistentes.** Como no jogo original, uma decisão (ex.: preço) vale até ser alterada. Os alunos não precisam reenviar tudo a cada tick.
7. **Nunca eliminar uma equipe.** Falência gera consequências (crédito emergencial caro, penalidade de pontuação), mas a equipe continua jogando. Eliminar alunos no meio da aula mata o engajamento.
8. **Uso legal limpo (*clean-room*).** Replicamos conceitos, comportamentos, a lista de produtos e as cadeias de produção (que refletem o mundo real: queijo vem do leite, couro vem do gado). Os números do manual (quantidades, pesos) servem só como **ponto de partida da calibração**. **Nunca** copiar arte, textos, mapas ou código do jogo original, nem redistribuir o manual.
9. **Produto portátil, sem dependência de hospedagem.** O servidor é um executável que roda sem instalação e sem internet. Professores e alunos não instalam nada e não precisam ser administradores: usam só o navegador (modo B) ou, no modo A, o executável após a liberação única da TI (seção 9.5).
10. **Uma base de código para todos os modos** (rede local, servidor fixo, online — seção 9.1). Nada no servidor pode depender de estar numa rede local.

---

## 4. Referência: o que aproveitamos do Capitalism

### 4.1 Mantido (núcleo da dinâmica)

| Elemento do jogo | Como fica na ferramenta |
|---|---|
| Nota do produto = preço + qualidade + marca | Mesma lógica, com pesos diferentes por tipo de produto |
| Marca = reconhecimento + fidelidade | Reconhecimento vem de publicidade e decai; fidelidade vem da experiência (qualidade) e pode ficar negativa |
| Orçamento de marketing | Verba de publicidade por produto |
| Pesquisa e desenvolvimento | Verba de P&D que aumenta a tecnologia e, com ela, a qualidade |
| Comprar pronto ou fabricar | Revenda com marca própria (*private label*) × fabricação própria |
| Preço | Definido por produto |
| Competição | Equipes (e robôs) no mesmo mercado |
| Relatórios financeiros | DRE, balanço, fluxo de caixa, participação de mercado |
| Fórmula da nota do produto | A fórmula publicada no manual do Capitalism II (seção 6.4) |
| Árvore de produtos | A lista de produtos e cadeias do Capitalism II (anexo `arvore-de-produtos.md`), usada em recortes por preset |
| Fazendas (lavoura e pecuária) | Culturas com mês de plantio e colheita (calendário brasileiro); rebanhos com produtos à escolha (camada 3) |
| Mineração, petróleo e madeira | Jazidas com reserva finita, qualidade e exaustão (camada 3) |

### 4.2 Simplificado

| Elemento do jogo | Como fica |
|---|---|
| Bolsa de valores | Preço da ação calculado pelo desempenho; emissão, recompra, dividendos (camada 2) |
| Aquisição hostil | Removida; no máximo participação minoritária (camada 2) |
| Empréstimos | Linha de crédito com juros definidos pelo professor (camada 2) |
| Compra entre empresas e porto de importação | Mercado atacadista entre equipes + fornecedor externo com preço e qualidade definidos pelo cenário (seção 6.10) |
| Localização de fazendas e jazidas no mapa | Lista de jazidas e terras disponíveis por mercado, sem mapa (compra direta ou leilão) |
| Economia da cidade | Nível de consumo e ciclo econômico controlados pelo professor via eventos |
| Tempo real com velocidade | Relógio em ticks controlado pelo professor, com pausa e modo rodada (seção 7) |

### 4.3 Fora da versão inicial (possíveis módulos futuros)

- Mapa da cidade e localização de lojas
- Prédios em grade de unidades (compra → produção → venda)
- Frete e logística entre cidades → **módulo futuro de Logística**
- Treinamento de funcionários e contratação de executivos → módulo futuro de RH
- Imóveis, empresas de mídia, compra de tecnologia
- Estratégias de marca (corporativa, por linha, por produto) → possível módulo de Marketing avançado

---

## 5. Escopo em camadas (módulos)

O professor escolhe os módulos ao criar a partida. Módulos podem ser ativados **no meio de um semestre** (em partidas novas ou em uma partida clonada), acompanhando o conteúdo da disciplina.

| Camada | Módulo | Decisões dos alunos | Disciplinas típicas |
|---|---|---|---|
| **1 — Núcleo** (sempre ativo) | Mercado e operação | Preço, quantidade a produzir/comprar, publicidade, P&D, comprar pronto × fabricar, capacidade (fábrica e pontos de venda). Na fabricação, os insumos vêm do **fornecedor externo** (um nível da árvore de produtos) | Marketing, Estratégia, Administração Geral, Microeconomia |
| **2** | Finanças e mercado de capitais | Tomar/pagar empréstimo, emitir ações, recomprar ações, pagar dividendos, comprar participação minoritária em outra empresa | Finanças, Contabilidade, Mercado de Capitais |
| **3** | Cadeia produtiva | Ter fazendas (lavoura e pecuária), minas, poços e madeireiras; fábricas em vários níveis da árvore; vender e comprar no **mercado atacadista entre equipes**; escolher fornecedor (preço × qualidade) | Cadeia de Suprimentos, Operações, Contabilidade de Custos, Agronegócio |
| **Transversal** | Cenário e eventos | Professor dispara eventos macro (recessão, alta de insumo, imposto, safra ruim) | Economia |
| **Futuro** | Logística | Onde produzir, onde vender, rotas, estoques regionais | Logística |
| **Futuro** | RH | Treinamento, salários, produtividade | Gestão de Pessoas |

**A árvore de produtos é genérica desde a fase 0.** O motor trata qualquer produto a partir de dados (receita, tipo de instalação, parâmetros). O que muda entre camadas e presets é **qual recorte da árvore** está ativo e **quais instalações** as equipes podem ter. Acrescentar um produto (ex.: queijo) é incluir dados, sem mudar código.

**Requisito técnico:** cada módulo é isolado no motor (funções de etapa próprias, parâmetros próprios, telas próprias) e controlado por uma lista de módulos ativos na configuração da partida. Módulo desligado = etapa não executa e telas não aparecem.

---

## 6. Modelo de simulação (motor)

> Todas as fórmulas abaixo são **hipóteses iniciais**. Os símbolos em `snake_case` são parâmetros configuráveis. Os valores iniciais sugeridos serão calibrados na fase de balanceamento.

### 6.1 Unidade de tempo

- **Tick** = unidade mínima de simulação. Sugestão: **1 tick = 1 dia de jogo**.
- **Mês de jogo** = `ticks_por_mes` ticks (sugestão: 30). É a unidade da contabilidade (DRE, balanço) e dos relatórios.
- Valores de fluxo (demanda, verbas de marketing e P&D) são definidos **por mês** nas telas e divididos por `ticks_por_mes` no motor. Assim o aluno pensa em "orçamento mensal", como no mundo real.
- Decisões enviadas durante um tick valem **a partir do tick seguinte**.

### 6.2 Entidades principais

- **Partida** — configuração, módulos ativos, parâmetros, semente aleatória, estado do relógio.
- **Mercado** — uma cidade/região com população e nível de consumo. Uma partida pode ter vários mercados paralelos independentes.
- **Produto** — item do catálogo (anexo `arvore-de-produtos.md`): matéria-prima, semiacabado ou produto final. Produtos finais têm preço de referência, necessidade, elasticidade e pesos da nota (preço/qualidade/marca).
- **Receita** — insumos de um produto fabricado (até 3), quantidade de cada um, peso de cada insumo na qualidade e peso da tecnologia.
- **Empresa** — uma equipe ou robô, em um mercado. Tem caixa, ativos, dívidas, ações.
- **Oferta** — o que uma empresa vende de um produto: no varejo (ao consumidor) ou no atacado (a outras empresas). Origem (comprado ou produzido), preço, estoque, marca, qualidade.
- **Instalação** — fábrica, fazenda (lavoura ou pecuária), mina, poço de petróleo ou madeireira. Tem custo de instalação, custo mensal, capacidade, prazo de construção e nível (experiência).
- **Jazida** — reserva de um recurso natural em um mercado: tipo, tamanho, qualidade, preço (camada 3).
- **Cultura** — parâmetros de uma lavoura: mês de plantio, mês de colheita, perene, modo (anual/contínuo), meses de pausa, produtividade, custos (camada 3).
- **Pontos de venda** — capacidade de venda da empresa no mercado.
- **Evento** — alteração de cenário disparada pelo professor (ou agendada).

### 6.3 Demanda total do produto no mercado (por tick)

```
D_total = populacao × consumo_base_per_capita × fator_ciclo × (P_medio / P_ref) ^ (−elasticidade)
```

- Vale para **produtos finais** (varejo). A demanda de matérias-primas e semiacabados vem das próprias empresas (pedidos no atacado, seção 6.10).

- `P_medio` = preço médio das ofertas, ponderado pelas vendas do tick anterior (evita cálculo circular). No primeiro tick, usar `P_ref`.
- `elasticidade` menor para produtos de necessidade (ex.: 0,3) e maior para supérfluos (ex.: 1,5).
- `fator_ciclo` vem do cenário/eventos (1,0 = normal; 0,8 = recessão).

### 6.4 Nota de cada oferta

Usamos a **fórmula publicada no manual do Capitalism II** (capítulo de Marketing, "Calculating the Overall Rating"):

```
N_i = (Q_i × PQ) / 60  +  (M_i × PM) / 60  +  ((P_ref − P_i) / P_ref) × PP
```

- `Q_i` = qualidade (0–100, seção 6.6); `M_i` = marca (0–100, seção 6.5).
- `P_ref` = preço padrão interno do produto (não exibido aos alunos); `P_i` = preço de venda.
- `PQ`, `PM`, `PP` = pesos que o consumidor dá a qualidade, marca e preço, **em pontos percentuais que somam 100**, definidos por produto. Exemplos do manual: carne congelada tem peso de marca baixo (o consumidor decide por preço e qualidade); refrigerante tem peso de marca alto.
- Preço abaixo do padrão soma pontos; acima, subtrai.
- **A confirmar na calibração:** a escala resultante (o manual não deixa claro se a nota é limitada a 0–100). Sugestão: limitar a nota a um intervalo configurável e verificar o comportamento com os robôs.
- O manual também diz que **sempre existe um grupo de consumidores mais sensível a preço**, que compra o produto mais barato mesmo com nota menor. O modelo logit da seção 6.11 já reproduz isso (quem tem nota menor ainda vende um pouco); opcionalmente, um segmento "sensível a preço" com `PP` mais alto.
- Teto de preço: como no jogo, há um limite superior para o preço (ex.: `k_teto × P_ref`).

### 6.5 Marca = reconhecimento + fidelidade

**Reconhecimento** (`A`, 0 a 100) — sobe com publicidade (retorno decrescente) e decai sem ela:

```
A' = A × (1 − decaimento_A) + (100 − A) × taxa_A × (1 − exp(−verba_pub / verba_ref))
```

- `verba_pub` = verba de publicidade do tick para aquela oferta.
- `verba_ref` escala com o tamanho do mercado (população), para o mesmo orçamento ter efeitos parecidos em mercados de tamanhos diferentes.

**Fidelidade** (`L`, de `L_min` a 100; sugestão `L_min = −50`) — vem da experiência de quem compra:

```
L' = L × (1 − decaimento_L)
     + taxa_L × (A / 100) × (Q_i − Q_esperada) / 100
     − penalidade_ruptura × (demanda_nao_atendida_i / demanda_i)
```

- `Q_esperada` = qualidade média ponderada do mercado. Estar acima dela constrói fidelidade; abaixo, destrói (pode ficar negativa, como no jogo original).
- Faltar produto na prateleira (ruptura) prejudica a fidelidade — ensina a importância do abastecimento.
- `A / 100` modela que "não há fidelidade sem experimentação": sem reconhecimento, pouca gente compra e a fidelidade anda devagar.

**Marca:**

```
M = limitar(peso_A × A + peso_L × L, 0, 100)        (sugestão: peso_A = peso_L = 0,5)
```

### 6.6 Qualidade: comprar pronto × fabricar

**Comprar pronto (*private label*)**
- A empresa compra de um fornecedor externo e vende com a própria marca.
- Qualidade = `Q_fornecedor` (parâmetro do cenário; ex.: 55), custo unitário = `C_fornecedor`.
- Sem investimento inicial, disponível imediatamente, pode ser interrompido a qualquer momento.
- Limite opcional de volume por tick (`oferta_max_fornecedor`), compartilhado entre as empresas que compram dele — cria disputa por fornecedor.

**Fabricar**
- Exige construir uma fábrica: `capex_fabrica`, `prazo_construcao` (ticks), `custo_fixo_fabrica` por tick, `capacidade_fabrica` unidades/tick.
- Custo variável unitário = custo dos insumos da receita + `custo_mao_obra` (menor que `C_fornecedor` em volume).
- Qualidade = média ponderada da qualidade de **cada insumo da receita** + tecnologia relativa (como no Capitalism, a tecnologia é comparada à melhor do mercado). No Apêndice B do manual, os pesos dos insumos e da tecnologia de cada produto somam 100% — ex.: jaqueta de couro = couro 45% + tecido 5% + tecnologia 50%.

```
Q_i = Σ_k ( peso_k × Q_insumo_k ) + peso_tec × 100 × (T_i / T_max)        (Σ peso_k + peso_tec = 1)
T_i' = T_i + taxa_T × (1 − exp(−verba_PD / PD_ref))
```

- A qualidade **se propaga pela cadeia**: um aço de qualidade alta melhora o motor, que melhora o carro. Isso ensina por que controlar a cadeia (ou escolher bem o fornecedor) importa.

- `T_max` = maior tecnologia entre as empresas do mercado para aquele produto (no mínimo `T_base`, para não dividir por zero).
- **Difusão tecnológica** (acrescentada na calibração da fase 0): a cada mês, cada empresa fecha uma fração `difusao_tecnologica` da distância até `T_max`, por imitação:

  ```
  T_i' = T_i + difusao_tick × (T_max − T_i)
  ```

  Sem ela, a tecnologia acumula sem limite e a vantagem da líder só cresce: quem fabrica sem P&D acaba com qualidade **abaixo** do produto comprado pronto, e a estratégia de P&D intenso vence quase sempre. Com a difusão, a liderança em P&D continua valendo, mas se dissipa sem investimento contínuo. 0 desliga o mecanismo.
- **Fronteira tecnológica (proposta, ainda não implementada — decisão 26).** Na calibração da fase 0, nenhuma combinação de parâmetros conciliou "P&D compensa" com "nenhuma estratégia domina" (36 combinações, seção 10): quando a P&D rende, quem investe nela (premium) vence 45–57%; quando o confronto fica equilibrado, a P&D dá prejuízo em qualquer dose. Causa provável: a qualidade depende da tecnologia relativa à líder, e a tecnologia cresce sem teto; o ciclo qualidade → vendas → receita → mais P&D se realimenta, e a difusão só o amortece. Proposta: retorno decrescente perto de um teto por produto,

  ```
  T_i' = T_i + taxa_T × saturacao(verba_PD) × (1 − T_i / T_teto)
  ```

  A P&D compensaria no início (longe do teto) e a líder desaceleraria perto da fronteira, enquanto a difusão aproxima as seguidoras: vantagem real, mas limitada. Ensina maturidade tecnológica e retornos decrescentes da inovação. A validar com testes com alunos antes de implementar e recalibrar.
- **Curva de aprendizado da fábrica** (acrescentada na calibração da fase 0; manual do Capitalism II: "a produtividade e a capacidade de uma unidade de fabricação aumentam quando o nível da unidade aumenta"). Cada fábrica acumula **experiência**, medida em meses de produção à capacidade nominal. Os níveis são definidos no preset por limiares de experiência, e cada nível tem multiplicadores de **capacidade** e de **custo de mão de obra** por unidade. Uma fábrica nova começa lenta e cara e melhora com o volume produzido; fábrica parada não aprende. Com várias fábricas do mesmo produto, a produção é dividida pela capacidade, e cada uma paga a mão de obra do seu nível. Ensina curva de aprendizado e economia de escala; torna a decisão de fabricar um investimento com período de maturação, e não uma vantagem imediata.
- P&D **só afeta produtos fabricados**. Isso cria o trade-off central do make or buy: comprar pronto é rápido e barato no início; fabricar exige investimento, mas dá controle sobre custo e qualidade. Verba de P&D gasta antes de a fábrica ficar pronta acumula tecnologia para quando ela começar a produzir.

**Comprar pronto e fabricar podem coexistir** no mesmo produto (decidido em 29/09/2026): a equipe revende enquanto a fábrica está em obra ou completa o estoque quando falta capacidade. O estoque guarda valor total e quantidade, então custo e qualidade do produto vendido são médias ponderadas dos lotes; os relatórios mostram a origem de cada lote.

### 6.7 Árvore de produtos

- Catálogo completo, com nomes originais do manual e recortes sugeridos para presets: **anexo `arvore-de-produtos.md`**.
- Três níveis: **matérias-primas** (lavoura, pecuária, extração), **semiacabados** (ex.: aço, vidro, plástico, farinha, tecido, componentes eletrônicos) e **produtos finais** (vendidos no varejo).
- Cada produto fabricado tem até 3 insumos. Um insumo pode alimentar vários produtos (o leite vira leite engarrafado, iogurte, sorvete ou chocolate), o que cria a decisão de **para onde direcionar a produção**.
- Algumas matérias-primas também vão direto ao varejo (carnes congeladas, ovos).
- Toda matéria-prima e todo semiacabado podem ser comprados do **fornecedor externo** (seção 6.10), para que nenhuma equipe fique travada por falta de insumo.

### 6.8 Fazendas: lavoura e pecuária (camada 3)

**Lavoura** (regras mantidas do Capitalism):
- A equipe escolhe a cultura de cada unidade de cultivo. A cultura tem **mês de plantio** e **mês de colheita** (calendário brasileiro no anexo).
- Se a ordem vier depois do mês de plantio, a unidade **espera o ano seguinte**.
- A colheita fica disponível **no fim do mês de colheita** e vai para o estoque (celeiro). Até lá, a fazenda só gera custo.
- Qualidade da colheita: igual entre fazendas, mas **cresce com a experiência** (nível) da fazenda.
- Culturas perenes seguem a mesma regra, com "plantio" = início do ciclo anual. Modo `continuo` opcional para coco e seringueira (ver anexo).
- Custos de referência do manual (em dólares do jogo, para calibração): fazenda pequena US$ 750 mil de instalação e US$ 50 mil/mês; média US$ 1 milhão e US$ 100 mil/mês; grande US$ 1,8 milhão e US$ 180 mil/mês.

**Pecuária:**
- Unidade de criação (rebanho: gado, frango, porco, ovelha) + unidade de processamento.
- Cada unidade de processamento **escolhe um produto** do rebanho (ex.: gado → leite, carne congelada ou couro). Para ter leite e couro, usam-se duas unidades de processamento ligadas ao mesmo rebanho.
- Produção contínua (sem sazonalidade). Qualidade cresce com a experiência.
- Gancho de aula: **custo conjunto** — como ratear o custo do rebanho entre leite e couro.

**Sazonalidade como conteúdo:** a colheita concentrada em um mês obriga a planejar estoque e capital de giro para o ano inteiro, e os preços no atacado podem variar entre safra e entressafra.

### 6.9 Extração: mina, poço de petróleo e madeireira (camada 3)

- Cada mercado tem uma lista de **jazidas disponíveis** (sem mapa): recurso (ex.: minério de ferro, carvão, sílica, ouro, petróleo, madeira), reserva total, qualidade e preço.
- A equipe **compra a jazida** (preço fixo) ou disputa em **leilão** aberto pelo professor (opcional).
- A jazida é um **ativo** da empresa. O que é extraído consome a reserva, e o consumo vira custo: **exaustão**, como no manual e na contabilidade real:

```
custo_exaustao_tick = (valor_da_jazida / reserva_inicial) × quantidade_extraida
```

- A **qualidade** da matéria-prima extraída = qualidade da jazida.
- Reserva esgotada → extração para. A equipe precisa comprar outra jazida ou passar a comprar de terceiros.
- Custos de referência do manual (para calibração): mina e poço US$ 5 milhões de instalação e US$ 300 mil/mês; madeireira US$ 1,5 milhão e US$ 100 mil/mês.
- Capacidade de extração por tick cresce com o nível (experiência) da instalação.

### 6.10 Mercado atacadista (camada 3) e fornecedor externo (núcleo)

- O **fornecedor externo** existe em todas as camadas; o **atacado entre equipes** só na camada 3.

- Qualquer empresa pode **vender no atacado** matérias-primas e semiacabados que produz: define preço e quantidade disponível por mês.
- Compradores escolhem o fornecedor (outra equipe ou o fornecedor externo) e a quantidade por mês, como os vínculos entre empresas no jogo.
- Se a demanda pedida for maior que a oferta de um vendedor, ele atende proporcionalmente aos pedidos, e o restante pode ir automaticamente para o fornecedor externo (configurável).
- O **fornecedor externo** (equivalente ao porto de importação do Capitalism) sempre tem estoque (salvo o limite opcional `oferta_max_fornecedor`, seção 6.6), com preço e qualidade definidos pelo cenário. Os eventos do professor podem mexer neles (ex.: alta do petróleo).
- A mercadoria comprada carrega a **qualidade** do vendedor.
- Visível para os alunos: preço e qualidade de cada vendedor no atacado.
- Contratos de fornecimento de longo prazo: possível extensão futura.

### 6.11 Capacidade, estoque e vendas

- **Pontos de venda:** cada ponto tem `capacidade_pv` unidades/tick, custo de abertura e custo fixo por tick. A soma limita quanto a empresa consegue vender por tick no mercado (todos os produtos).
- **Estoque:** produção e compras entram no estoque; custo de armazenagem `custo_estoque` por unidade por tick. Excesso de estoque custa; falta gera ruptura.
- **Alocação das vendas** (por tipo de produto, por tick):

```
participacao_i = exp(β × N_i) / Σ_j exp(β × N_j)          (logit; β = sensibilidade à nota)
demanda_i = D_total × participacao_i
vendas_i = min(demanda_i, estoque_i, capacidade_venda_disponivel_i)
```

- **Redistribuição:** a demanda não atendida de uma oferta (sem estoque ou sem capacidade) é redistribuída **uma vez** para as outras ofertas com estoque, proporcionalmente às participações, com perda `perda_substituicao` (ex.: 50% desiste da compra).
- O preço não pode passar do teto `k_teto × P_ref` (validado no servidor), como no jogo, para evitar vendas com preço absurdo.
- Esta alocação vale para o **varejo** (produtos finais ao consumidor). O atacado segue a seção 6.10.

### 6.12 Contabilidade (a cada mês de jogo)

- **DRE:** receita − custo dos produtos vendidos (custo médio do estoque, incluindo exaustão de jazidas) = lucro bruto − despesas (publicidade, P&D, custos fixos de instalações e pontos de venda, armazenagem, depreciação) = lucro operacional − juros = lucro antes do IR − IR = lucro líquido.
- **IR com compensação de prejuízo** (decidido em 29/09/2026): `aliquota_ir` incide sobre o lucro mensal positivo depois de abater o prejuízo fiscal acumulado, limitado a `trava_compensacao` do lucro do mês (padrão 30%, como a regra brasileira). Assim, quem investe no início (fábrica, P&D) não é punido duas vezes.
- **Balanço:** caixa, estoque (a custo), imobilizado (instalações e pontos de venda, com depreciação linear `vida_util`), recursos naturais (jazidas, reduzidos pela exaustão), dívidas, patrimônio líquido.
- **Fluxo de caixa:** operacional, investimento, financiamento.
- **Caixa negativo (núcleo):** crédito emergencial automático com juros altos (`juros_emergencial`). Ensina o custo de má gestão de caixa sem eliminar a equipe. Decidido em 29/09/2026: o crédito é sacado no valor do déficit, rende juros diários e é **amortizado automaticamente** assim que o caixa volta a ficar positivo; não há limite. A penalidade de pontuação por falência (princípio 7) é um parâmetro, com padrão 0.
- **Dinheiro em centavos inteiros** no motor, para que "caixa = soma dos lançamentos" e "ativo = passivo + patrimônio líquido" valham com igualdade exata. Cada lançamento registra origem, destino e classe do fluxo de caixa (operacional, investimento, financiamento).

### 6.13 Módulo Finanças (camada 2)

- **Empréstimo:** a equipe escolhe valor e prazo; juros `juros_emprestimo` definidos pelo professor; limite de crédito baseado no patrimônio líquido e no resultado recente.
- **Preço da ação** (recalculado a cada mês):

```
valor_empresa = α × patrimonio_liquido + (1 − α) × multiplo_preco_lucro × lucro_liquido_12m_anualizado
preco_acao = max(valor_empresa, valor_minimo_empresa) / numero_de_acoes × (1 + ruido)
```

- `valor_minimo_empresa` evita preço de ação zero ou negativo.
- `ruido` pequeno e com semente (humor do mercado), configurável e desligável.
- **Emitir ações:** capta caixa ao preço atual com desconto `desconto_emissao`; dilui os sócios.
- **Recomprar ações:** usa caixa, reduz o número de ações.
- **Dividendos:** pagos do caixa; o professor pode dar peso a dividendos na pontuação.
- **Participação minoritária:** comprar até `max_participacao` (ex.: 20%) das ações de outra empresa; recebe dividendos proporcionais e registra ganho/perda de valor. **Sem controle, sem aquisição hostil.**

### 6.14 Pontuação e ranking

Configurável pelo professor. Opções:

- Lucro acumulado
- Valor da empresa / preço da ação (se camada 2 ativa)
- Participação de mercado
- Índice composto com pesos definidos pelo professor

Visibilidade do ranking para os alunos: **oculto**, **só a própria posição** ou **completo**.

### 6.15 Ordem de processamento de um tick

1. Aplicar eventos agendados para este tick (alteram parâmetros do cenário).
2. Ler as decisões vigentes de cada empresa.
3. Avançar obras (instalações e pontos de venda em construção).
4. Matérias-primas: crescimento e colheita das lavouras, produção da pecuária, extração (com exaustão das jazidas) → estoque.
5. Liquidar o atacado: pedidos entre empresas e ao fornecedor externo → estoque dos compradores.
6. Produção nas fábricas (consome insumos do estoque) e compras prontas para revenda → estoque. Processar de baixo para cima (matérias-primas → semiacabados → finais); o que um nível produz no tick só fica disponível para o nível seguinte no próximo tick (evita dependências circulares). Atualizar tecnologia (P&D) e qualidade.
7. Atualizar reconhecimento de marca (publicidade).
8. Calcular demanda total por produto e mercado.
9. Calcular notas, participações e alocar vendas no varejo (com redistribuição).
10. Atualizar fidelidade (qualidade e ruptura do tick).
11. Lançamentos financeiros do tick (receitas, custos, exaustão, juros diários).
12. Se for fim de mês: fechar DRE e balanço, recalcular preço da ação, aplicar IR, depreciação.
13. Decisões dos robôs para o próximo tick.
14. Gravar o novo estado e o histórico; notificar os clientes.

---

## 7. Controle do tempo e painel do professor

O painel do professor é o **grande diferencial** em relação ao jogo original.

### 7.1 Relógio

| Controle | Descrição |
|---|---|
| **Velocidade** | Segundos reais por tick (ex.: 1 s = 1 dia de jogo → 1 ano ≈ 6 min). Padrão sugerido: 1 mês de jogo a cada 60–120 s, o que leva uma **partida típica de 24 meses** a 25–50 min de relógio rodando |
| **Pausar / retomar** | Congela o jogo para explicar um conceito com os gráficos na tela |
| **Modo contínuo** | O relógio anda sozinho na velocidade escolhida |
| **Modo rodada** | O jogo pausa automaticamente ao fim de cada mês; retoma quando o professor clica em "avançar" ou quando todas as equipes confirmam as decisões (configurável) |
| **Avançar manualmente** | Avança 1 tick, 1 semana ou 1 mês de uma vez |
| **Encerrar** | Finaliza a partida e congela os resultados para o debate |

Enquanto pausado, os alunos **podem** revisar decisões (configurável: permitir ou bloquear edição durante a pausa).

### 7.2 Demais funções do painel

- **Criar partida:** nome, preset de parâmetros, módulos ativos, número de mercados, produtos, duração alvo, pontuação, visibilidade do ranking, número de robôs.
- **Sala:** ao criar a partida, o painel e o telão exibem **endereço + código da sala**, que os alunos digitam no navegador. No modo A, a sala também aparece na lista do programa dos alunos (descoberta UDP, seção 9.4). Montagem ou confirmação das equipes.
- **Salvar / abrir partida** como arquivo (retomar na aula seguinte, compartilhar com colegas) e **diagnóstico de rede** (seção 9.5).
- **Visão geral ao vivo:** todas as empresas de todos os mercados — caixa, lucro, participação, notas, marca, qualidade.
- **Eventos:** disparar agora ou agendar (ex.: recessão, alta do insumo, novo imposto, entrada de um concorrente robô, aumento da população, safra ruim ou geada, descoberta de nova jazida, alta do petróleo no fornecedor externo). Cada evento tem um texto explicativo exibido aos alunos.
- **Ajuste de parâmetros ao vivo** (com registro no histórico da partida, para o debate).
- **Modo apresentação (telão):** tela limpa para projetar ranking, gráficos de participação e evolução, sem dados privados das equipes (ou com, se o professor quiser).
- **Debate final:** relatório comparativo das estratégias, linha do tempo das decisões de cada equipe e dos eventos, comparação entre mercados paralelos.
- **Exportar** relatórios (CSV; PDF desejável).
- **Clonar partida** (mesmos parâmetros, para outra turma ou para continuar com novos módulos) e **replay** (graças ao motor determinístico).

### 7.3 Onde roda o relógio

- O relógio é um **loop dentro do servidor da sala** (seção 9). O painel do professor só envia comandos (velocidade, pausar, avançar); o jogo não depende de o navegador do professor estar aberto ou em primeiro plano.
- Cada comando é validado (só o professor da sala) e idempotente (clique duplo ou duas abas não avançam dois ticks).
- Se o servidor for encerrado ou o computador desligar, a partida volta **pausada** do último estado salvo (seção 9.7) — nunca retoma sozinha.

---

## 8. Interface dos alunos

Desktop em primeiro lugar (laboratório); layout responsivo desejável, não obrigatório.

- **Entrada:** pelo navegador com endereço + código da sala (ou, no modo A, pela lista de salas encontradas pelo executável do aluno); depois, nome/apelido + equipe.
- **Painel da empresa:** caixa, lucro do mês, participação por produto, nota do produto comparada aos concorrentes (decomposta em preço/qualidade/marca, como as barras coloridas do Capitalism), estoque, capacidade usada.
- **Decisões** (formulários claros, com valores atuais preenchidos e ajuda contextual):
  - por produto: comprar pronto × fabricar, preço, quantidade a produzir/comprar por mês, verba de publicidade, verba de P&D;
  - da empresa: construir fábrica, abrir/fechar pontos de venda;
  - camada 2: empréstimos, ações, dividendos, participações;
  - camada 3: comprar terras e jazidas, escolher culturas e rebanhos, escolher o produto de cada unidade de processamento, definir preços e quantidades no atacado, escolher fornecedores.
- **Relatórios:** DRE, balanço e fluxo de caixa mensais; gráficos de evolução; informações públicas dos concorrentes (preço, nota, participação — **não** o caixa ou os custos deles).
- **Avisos:** eventos do professor, obra concluída, ruptura de estoque, caixa negativo.
- **Estado do relógio** sempre visível (data do jogo, rodando/pausado, velocidade).
- **Ajuda contextual** em cada decisão, explicando o conceito por trás (liga a mecânica ao conteúdo da aula).
- **Reconexão automática** (a rede do laboratório pode oscilar); decisões enviadas e ainda sem resposta ficam guardadas no navegador e são reenviadas com o mesmo identificador ao reconectar (o servidor é idempotente).

### 8.1 Design e experiência visual (todas as telas)

**Situação atual:** a linguagem visual da tela do aluno foi validada com o autor num **protótipo clicável** (01/10/2026) e implementada na fase 1 (seção 8.2). O telão e o painel do professor seguem a mesma linguagem (fase 1, entrega 7). O nome e o logotipo do produto continuam provisórios (decisões 18 e 20). A interface é web, então não há limitação a imagens fixas como no jogo original.

**Diretrizes:**
- **Clareza antes de enfeite.** O aluno entende a situação da empresa em poucos segundos. Hierarquia: caixa, lucro do mês, participação de mercado e alertas.
- **Informação viva.** Gráficos e indicadores se atualizam a cada tick com transições suaves (sem piscar). A barra decomposta da nota (preço, qualidade, marca) aparece ao lado das dos concorrentes, como no Capitalism. Implementação (fase 1): a parcela do preço sai por diferença (nota − qualidade·PQ/60 − marca·PM/60), sem nenhum dado novo do servidor. Consequência aceita: com ela explícita, o aluno consegue deduzir o preço de referência (P_ref) de um produto, o que já era possível com a álgebra sobre dados públicos (nota, qualidade, marca, pesos e preço). Se o P_ref precisar ficar de fato oculto, a nota pública teria de deixar de ser exata (decisão futura, após os testes com alunos). Alertas visuais para ruptura de estoque, caixa negativo, obra concluída e eventos.
- **Cadeias visíveis** (camada 3): diagrama de fluxo (tipo Sankey) da fazenda à fábrica e à loja, com espessura proporcional ao volume.
- **Vista da cidade** (opcional, decisão 21): ilustração 2D ou isométrica com os prédios das equipes, para identidade e engajamento. Não vira mapa operacional (seção 4.3).
- **Telão com cara de competição:** alto contraste, fontes grandes (legíveis do fundo da sala), corrida de barras da participação de mercado, destaques automáticos ("equipe X assumiu a liderança") e anúncio visual quando o professor dispara um evento.
- **Identidade das equipes:** nome, cor (de uma paleta pré-definida e acessível) e um logotipo simples (ícone + cor) escolhidos ao criar a equipe.
- **Ajuda contextual padronizada:** ícone "?" em cada decisão, explicando o conceito da aula por trás dela.
- **Tema claro e escuro.** **Sons** opcionais, desligados por padrão e controlados pelo professor.

**Restrições técnicas:**
- **100% offline:** fontes, ícones, imagens e sons **embutidos no executável**. Proibido depender de CDN, Google Fonts ou qualquer recurso remoto.
- **Leve:** SVG e Canvas 2D como padrão; WebGL só como opcional. Fluidez em computadores modestos de laboratório (gráficos integrados). Testar numa máquina do laboratório.
- **Resoluções-alvo:** 1366×768 e 1920×1080 nos computadores dos alunos; 1920×1080 e 1280×720 no projetor.
- **Acessibilidade:** contraste mínimo WCAG AA; nenhuma informação só por cor (usar rótulos, ícones ou padrões); formulários navegáveis por teclado; paleta das equipes validada para daltonismo.

**Arte e licenças:**
- **Nada do Capitalism** (arte, ícones, telas, sons).
- Fontes de arte possíveis: ícones de licença livre (ex.: Lucide, Tabler — MIT); prédios e cenários isométricos em domínio público (ex.: pacotes Kenney, CC0); fonte tipográfica livre embutida (ex.: Inter, licença OFL); ilustrações próprias, geradas ou encomendadas (decisão 22).
- Registrar a origem e a licença de cada recurso em `/docs/licencas-assets.md`.

### 8.2 Tela de jogo do aluno (fase 1)

Decidida com o autor sobre o protótipo (decisão 27): a primeira versão, em abas e cartões empilhados, "parecia uma página web". A tela de jogo é um **painel único em tela cheia, sem rolagem**.

- **Disposição:**
  - topo (HUD): equipe, data com a barra do mês e do dia, estado do relógio, caixa animado com a variação do dia, lucro do mês até agora (antes do IR) e posição no ranking;
  - esquerda: um cartão por produto (imagem, participação, tendência, alertas) e a empresa (pontos de venda, capacidade de venda, fábricas);
  - centro: o produto escolhido, com o palco (imagem e números do dia) e quatro painéis — preço e concorrência (nota decomposta), estoque e suprimento, marketing e P&D, participação no mercado;
  - direita: ranking e avisos;
  - embaixo: modo do relógio, atalhos, Resultados, Gráficos e Pronto (modo rodada).
- **Alvo:** 1920×1080; cabe também em 1366×768 (a fonte escala pela janela). Abaixo de 1000 px de largura, empilha e libera a rolagem. Tema claro por padrão.
- **Envio automático ("se mudou, mudou"):**
  - cada campo é enviado sozinho depois de uma pausa curta na digitação, ao sair do campo ou com Enter, só com aquele campo;
  - o estado aparece no próprio campo: digitando, enviando, enviado (vale a partir de amanhã, com o valor de antes), valendo, erro (do campo ou do servidor) ou travado na pausa;
  - cada envio oferece **Desfazer**;
  - Esc descarta o que foi digitado; −/+ e as setas mudam pelo passo;
  - a validação é a mesma do rascunho, que concorda com o servidor (testado por propriedade).
- **Nada treme:**
  - todo número que muda a cada dia fica numa caixa de largura fixa, com casas decimais fixas e sem quebra de linha;
  - as linhas da nota ficam em ordem fixa (a equipe primeiro);
  - o eixo dos gráficos só cresce;
  - verificado com uma varredura da posição de todos os elementos num navegador real, em 1920×1080 e 1366×768.
- **A virada do dia não recria elementos interativos:** só mudam textos, classes e o estado habilitado. Uma confirmação em dois cliques (abrir ou fechar ponto de venda, construir fábrica) dura cerca de 6 s, sobrevive aos dias e é cancelada com Esc ou com um clique fora.
- **Participação:** rosca com a participação de ontem (a fatia da equipe destacada; dica com nome e percentual no mouse e no teclado) sobre as linhas semanais de todas as empresas do mercado, discretas. Cada empresa tem uma cor: as equipes, a escolhida; os robôs, as livres da paleta.
- **Avisos flutuantes, poucos de propósito:**
  - produto esgotado: uma vez, e de novo só depois de o estoque se recuperar e esgotar outra vez;
  - chegada ao 1º lugar ou perda do 1º lugar;
  - desfazer.

  O resto (inclusive o fechamento do mês no modo contínuo) vai só para a lista de avisos.
- **Fechamento do mês só no modo rodada:** janela com o lucro líquido, a variação no ranking e os produtos que mais e menos faturaram. As decisões ficam liberadas e **Pronto** (tecla P) avisa o professor. No fim da duração, uma janela de fim da partida mostra a colocação.
- **Atalhos:** 1–9 trocam de produto, R abre os resultados (DRE e balanço), G os gráficos, Esc fecha.
- **Imagens dos produtos:** feitas pelo autor (originais em `assets/produtos/`); `bun run imagens` recorta o fundo preservando a sombra, enquadra e gera WebP de 512 px. Produto sem imagem mostra um pictograma neutro com as iniciais.
- **Dados novos do servidor para esta tela:**
  - o motor expõe o lucro do mês até agora na visão da própria empresa;
  - o histórico do aluno inclui a participação semanal (pública) das empresas do seu mercado, e nenhum outro campo delas.

**Sistema de design:**
- **Tokens centralizados** (cores, tipografia, espaçamentos, raios, sombras) e componentes reutilizáveis, para mudar a identidade sem reescrever telas.
- Cores **semânticas** (lucro, prejuízo, alerta, neutro) separadas da **paleta categórica** das equipes.
- Biblioteca de gráficos leve e que funcione offline (a escolher na implementação).

**Protótipo visual (antes da fase 1):** telas navegáveis com dados fictícios — tela inicial (criar/entrar em sala), painel do aluno, tela de decisões, painel do professor e telão — mais um guia de estilo com os tokens. Validar com o autor e, se possível, com alguns alunos.

---

## 9. Arquitetura técnica

### 9.0 Visão geral

- **Produto único e portátil:** um executável que contém o servidor (em TypeScript, compilado com **Bun**), o motor, o banco **SQLite** e as telas web.
- **Sem hospedagem obrigatória e sem serviços externos:** na rede local, o servidor roda numa máquina fixa da instituição (modo B, padrão) ou no computador do professor (modo A). Não há contas externas, cotas nem dependência de internet.
- **Professor, telão e alunos usam só o navegador.** As telas vêm do servidor. No modo A, o executável no computador do aluno é opcional e serve apenas para **encontrar a sala** na rede (seção 9.4).
- **Os computadores dos alunos não conversam entre si e não calculam nada.** Eles mostram as telas e enviam decisões; tudo passa pelo servidor, que é a fonte da verdade.
- **Uma base de código para todos os modos de implantação** (seção 9.1): rede local, servidor fixo da instituição ou online.

Exemplo — o professor pausa o jogo:

1. O painel do professor envia "pausar" ao servidor, que grava `status = pausada` e para o loop do relógio.
2. O servidor avisa, pelo WebSocket, todos os navegadores conectados à partida (em fração de segundo).
3. As telas dos alunos mostram "Jogo pausado".
4. Se um aluno perder o aviso (rede oscilou), nada quebra: o servidor não avança ticks de partida pausada e, ao reconectar, a tela recebe o estado atual.

Como o cálculo e a validação ficam no servidor, um aluno não consegue alterar o próprio caixa nem burlar regras pelo navegador.

### 9.1 Modos de implantação

| Modo | Onde roda o servidor | Quando usar | O que exige |
|---|---|---|---|
| **A — Sala no computador do professor** | No computador do professor, no laboratório | Instituições em que a TI libera a porta de entrada nas máquinas de professor | Liberação única da TI (seção 9.5) |
| **B — Servidor fixo da instituição** (**padrão na instituição do autor**) | Numa máquina fixa da rede da instituição, com o mesmo executável | Uso normal em aula; nenhum requisito nas máquinas do professor, do projetor e dos alunos | Uma máquina com administrador local para a regra de firewall de entrada (seção 9.1.1) |
| **C — Online** (contingência) | O mesmo servidor numa hospedagem na internet com disco persistente e HTTPS | Ensino remoto (ex.: nova pandemia) | Hospedagem (instituição ou autor), login de professores (seção 9.6) |

O modo C não é prioridade (roadmap, fase 5), mas o código deve nascer compatível com ele: nada no servidor pode depender de estar numa rede local, e a descoberta de sala é um recurso adicional, não obrigatório.

**Motivo da escolha do modo B** (PoC de rede, seção 9.9): nas máquinas de laboratório o professor não é administrador e o firewall bloqueia conexões de entrada, então o modo A exigiria uma regra da TI em todas as máquinas de professor. No modo B, só o servidor recebe conexões; o painel do professor, o telão e os alunos abrem conexões de **saída**, que o firewall do Windows permite por padrão.

#### 9.1.1 Modo B na instituição do autor

```
 [Painel do professor] ──┐
 [Telão / projetor]    ──┼──►  Servidor fixo (laboratório do centro de pesquisa)
 [Equipes de alunos]   ──┘     HTTP + WebSocket · motor · relógio · SQLite
```

- **Máquina:** computador fixo num laboratório do centro de pesquisa, com administrador local. Roda o mesmo executável do produto em modo servidor (ex.: `simulador.exe --servidor`), sem tela inicial e sem abrir navegador.
- **Firewall:** uma regra de entrada **por porta** (TCP 47800, perfis Domínio e Privado), criada uma vez por quem administra essa máquina. Nenhuma regra nas demais máquinas.
- **Servidor autoritativo, não repassador:** o motor, o relógio, a validação e o estado ficam no servidor (seção 9.0). O painel do professor e o telão são apenas telas: fechar a aba do professor, trocar de computador ou reiniciar o projetor não afeta a partida.
- **Várias salas simultâneas:** o servidor atende várias turmas ao mesmo tempo, cada uma com seu código de sala. Os dados de uma sala nunca aparecem em outra (regras de acesso da seção 9.6).
- **Endereço:** os alunos digitam o endereço do servidor + código da sala. O endereço deve ser estável (reserva de DHCP ou nome da máquina no domínio) para poder ser impresso no laboratório ou salvo nos favoritos.
- **Disponibilidade:** a máquina fica permanentemente ligada no centro de pesquisa; o servidor é iniciado manualmente. Início automático e monitoramento ficam fora do escopo por ora.
- **Estado persistido em disco a cada tick** (seção 9.7): se o servidor reiniciar, todas as salas voltam pausadas no último tick processado.
- **Alcance:** validado entre o laboratório de aula e o laboratório do centro de pesquisa (sub-redes diferentes). Cada novo laboratório onde o simulador for usado precisa de um teste de conexão pelo navegador (`/teste`, seção 9.9) antes da primeira aula.

### 9.2 Componentes

| Componente | Tecnologia | Função |
|---|---|---|
| Servidor | Bun (TypeScript): `Bun.serve` para HTTP e WebSocket; UDP para descoberta | Serve as telas, recebe decisões, roda o relógio e o motor, envia atualizações |
| Banco | SQLite (`bun:sqlite`), modo WAL | Partidas, empresas, decisões, histórico |
| Frontend | React + TypeScript + Vite (a confirmar), **embutido no executável** | Telas do aluno, do professor, do telão e a tela inicial (criar sala / entrar em sala) |
| Motor | Pacote TypeScript puro | Processar ticks |
| Tempo real | WebSocket nativo do Bun | Avisar os clientes (tick, pausa, eventos) |
| Descoberta (modo A) | UDP (pergunta e resposta, seção 9.4) | Encontrar salas na rede sem digitar IP |
| Empacotamento | `bun build --compile` | Um único `.exe` para Windows (Linux/macOS opcionais por compilação cruzada) |
| Balanceamento | Mesmo pacote do motor, CLI em Bun | Simulações em massa com robôs |

### 9.3 Organização sugerida do repositório (monorepo)

Nomes de pastas, arquivos e identificadores em português (decisão 2).

```
/pacotes/motor                motor puro (TS), sem dependências de runtime, e robôs; testes unitários
/pacotes/compartilhado        esquemas das mensagens do WebSocket e tipos comuns a servidor e telas (fase 1)
/pacotes/catalogo             catálogo de produtos, receitas, culturas e recursos; presets (dados versionados)
/apps/web                     frontend (tela inicial, aluno, professor, telão)
/apps/servidor                servidor Bun: HTTP, WebSocket, relógio, descoberta UDP, SQLite, autenticação
/apps/servidor/src/dados      SQLite: migrações embutidas (migracoes/*.sql), repositório, acessos
/apps/servidor/scripts        empacotar.ts (build da interface → manifesto → .exe) e fumaca.ts (teste do .exe)
/ferramentas/balanceamento    CLI de balanceamento e relatórios
/ferramentas/teste-de-carga   clientes simulados para teste de carga (ex.: 60 alunos)
/tools/poc-rede               PoC de rede (seção 9.9), mantida como estava
/docs                         documentação, incluindo o guia para a TI
```

Cada pacote tem o código em `src/` e os testes em `testes/`. O `tsconfig` do `src/` do motor não carrega tipos de runtime (`types: []`), e um teste lê o código-fonte e falha se encontrar `Math.random`, `Date`, `Bun`, `process`, imports externos ou funções transcendentais fora de `matematica.ts`.

### 9.4 Descoberta de sala na rede

**Tela inicial do executável:** "Criar sala" (professor) ou "Entrar em sala" (aluno). O executável abre essa tela no navegador padrão.

**Como o aluno encontra a sala sem digitar IP:**

1. No modo "Entrar em sala", o executável do aluno sobe um mini-servidor **apenas em `localhost`** (não aciona o firewall) e envia pela rede um **broadcast UDP de pergunta** ("há salas aqui?") numa porta fixa de descoberta.
2. Cada servidor de sala na rede **responde diretamente** ao aluno com informações públicas: nome da sala, disciplina, professor, endereço, porta, versão.
3. A tela lista as salas encontradas. O aluno clica e o navegador é levado ao servidor da sala.

Por que pergunta e resposta, e não anúncio: o Windows aceita respostas a uma pergunta que o próprio computador fez, então **nenhuma regra de firewall é necessária nos computadores dos alunos**. Só o computador do professor precisa aceitar conexões de entrada, e isso ele já precisa de qualquer forma.

**Alternativa sempre disponível** (sem executável no aluno, ou se a descoberta falhar): o painel e o telão exibem **endereço + código curto da sala** (ex.: `http://10.1.2.30:47800` e código `K7QM`). O aluno digita no navegador. Deve funcionar de ponta a ponta sem o executável do aluno.

Detalhes:
- O broadcast só alcança a mesma sub-rede. Laboratórios em VLANs separadas ou Wi-Fi com isolamento entre clientes dependem da alternativa acima.
- **No modo B a descoberta não se aplica:** o servidor fica em outra sub-rede (confirmado na PoC, seção 9.9), então a entrada é sempre por endereço + código. A descoberta continua disponível para o modo A.
- Várias salas na mesma rede aparecem todas na lista; salas de versão incompatível aparecem desabilitadas, com aviso.
- Portas padrão configuráveis (sugestão: TCP 47800 para HTTP/WebSocket e UDP 47801 para descoberta — a confirmar, seção 15).

### 9.5 Privilégios, firewall e o guia para a TI

- **Sem instalação e sem administrador:** o executável roda de qualquer pasta (pendrive, Documentos, área de trabalho). Servir numa porta acima de 1024 não exige administrador.
- **Computador do professor (modo A):** o Windows Firewall bloqueia conexões de entrada até existir uma regra, e só administrador aprova. A TI cria **uma vez**, em todas as máquinas do laboratório, uma regra **por porta** (TCP da sala e UDP da descoberta, perfis Domínio/Privado). Regra por porta, e não por programa, porque um executável portátil muda de pasta.
- **Servidor fixo (modo B):** a mesma regra por porta (só TCP da sala; UDP não é usado), apenas na máquina servidora. Computadores do professor, do projetor e dos alunos não precisam de nada.
- **Bloqueio de executáveis (AppLocker e similares):** se existir, a TI libera o executável. Com **assinatura digital de código**, a TI pode liberar por editor e as versões futuras continuam liberadas (decisão em aberto, seção 15).
- **Computadores dos alunos:** nada é necessário para o navegador. O executável do aluno usa só `localhost` e perguntas UDP de saída; se ele for bloqueado, o aluno usa endereço + código.
- **Guia para a TI:** documento de uma página em `/docs/guia-ti.md` (entregue na fase 1) com exatamente essas configurações, as portas e como testar.
- **Diagnóstico de rede no painel do professor:** mostra os endereços do servidor, verifica se a porta está acessível a partir de outra máquina (via página de teste que o aluno abre) e explica o que pedir à TI se não estiver.
- **Pode ser que nada disso seja necessário:** muitos laboratórios já permitem as duas coisas. A PoC de rede (seção 9.9) responde isso antes de envolver a TI.
- **Se a TI não liberar as máquinas de professor:** modo B (uma única máquina com a regra) ou modo C (online). Na instituição do autor, esse foi o caso, e o modo B foi adotado.

### 9.6 Autenticação e segurança

**Rede local (modos A e B):**
- Não há contas individuais de professor. Três papéis por sala: **professor** (controle total), **telão** (somente leitura, sem dados privados das equipes salvo decisão do professor) e **aluno** (só a própria equipe).
- **Modo A:** quem inicia a sala é o professor dela. O painel fica acessível no próprio computador host; acesso de outro computador (ex.: o do projetor) só com o **PIN do professor** da sala.
- **Modo B:** o professor nunca está no computador servidor, então todo acesso de professor é pela rede:
  - **Criar sala** exige a **chave de professor** do servidor, definida por quem administra a máquina servidora e repassada aos professores da instituição. Sem ela, um aluno não consegue criar salas nem ocupar o servidor. Guardada como hash (`Bun.password`); pode ser trocada sem perder as partidas.
  - Ao criar a sala, o servidor gera o **PIN do professor** (aleatório, ex.: 6 dígitos) e o **link do telão**. O PIN reabre o painel de qualquer computador (ex.: se o navegador fechar ou o professor mudar de máquina); o link do telão leva a um token próprio, só de leitura, que pode ser revogado e regenerado pelo painel.
  - A sessão do professor fica num cookie `HttpOnly`; reabrir o painel no mesmo navegador não pede o PIN de novo durante a validade da sessão.
  - **Limite de tentativas** para a chave de professor, o PIN e o código da sala (por IP e por sala), com espera crescente após erros.
  - A administração do servidor (listar, encerrar e excluir salas de todos os professores; trocar a chave de professor) fica disponível **só no próprio computador servidor** (`localhost`).
- Alunos entram com **código da sala + nome/apelido + equipe**. O servidor emite um token de sessão (cookie) para reconexão.
- Toda decisão é validada no servidor. **As regras de acesso ficam no código do servidor** (equipe só vê e altera o que é dela; dados públicos do mercado são de todos; professor vê tudo) e são cobertas por **testes automatizados de permissão**.
- Acesso por `http` sem TLS é aceitável numa rede fechada de laboratório, com códigos de sala e sem dados sensíveis. Código da sala aleatório; limite de tentativas de entrada.

**Como ficou implementado (fase 1, entrega 3):**
- **Código da sala:** 5 caracteres de um alfabeto sem ambíguos (sem 0/O, 1/I/L).
- **Cookies por sala e por papel** (`sm_a_<código>` e `sm_p_<código>`): `HttpOnly; SameSite=Strict; Path=/`, validade de 16 h, sem `Secure` (rede http). No banco fica só o SHA-256 do token. As sessões sobrevivem ao reinício do servidor.
- **PIN:** guardado como hash; aparece só na criação da sala ou quando o professor gera outro (nunca pelo WebSocket).
- **Token do telão:** 32 bytes, guardado em claro (o professor precisa reabrir o link a qualquer momento); revogar derruba os telões conectados.
- **`Origin`** conferido no upgrade do WebSocket e em todo pedido que muda algo; os POST exigem JSON (força o *preflight* CORS, que nunca é concedido). Em `--dev`, aceita também a origem do Vite.
- **Limites de tentativas** (persistidos), com bloqueio que dobra a cada estouro:

  | O quê | Chave | Falhas em 10 min | Primeiro bloqueio |
  |---|---|---|---|
  | Chave de professor | IP | 5 | 1 min |
  | PIN | IP | 5 | 1 min |
  | PIN | sala | 20 | 5 min |
  | Código inexistente | IP | 20 | 1 min |
  | Entrada de aluno recusada | IP | 30 | 1 min |

- **WebSocket:** até 16 KB por mensagem recebida; balde de 30 mensagens com recarga de 10/s por conexão (a conexão é fechada após 20 recusas); *pings* automáticos; limite de *backpressure*.
- **Administração** (`/api/admin/*`): exige IP e `Host` de loopback (o `Host` bloqueia DNS *rebinding*).
- **Cabeçalhos:** `Referrer-Policy: no-referrer` (não vaza o token do telão), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`.

**Online (modo C, fase 5):**
- Contas de professor com senha protegida por hash (`Bun.password`, argon2), sessão em cookie `HttpOnly`/`Secure`, limite de tentativas de login.
- Recuperação de senha por e-mail (exige um serviço de envio de e-mail) ou redefinição por um administrador.
- HTTPS obrigatório (fornecido pela plataforma de hospedagem ou por proxy reverso).

### 9.7 Dados, arquivos e backup

- **Local do banco:** pasta de dados ao lado do executável, se for gravável; senão, a pasta de dados do usuário (`%LOCALAPPDATA%\<produto>`), que sempre aceita gravação sem administrador.
- **Uma partida pode ser exportada e importada como arquivo único.** O professor salva, retoma na aula seguinte, copia para um pendrive ou passa para um colega usar o mesmo cenário.
- **Estado persistido em disco a cada tick:** o resultado de cada tick (estado do motor, históricos e ajustes) é gravado no SQLite numa única transação antes de ser enviado aos clientes; decisões, eventos e comandos do professor são gravados ao serem aceitos. Uma queda do servidor perde no máximo o tick em processamento.
- **Retomada após reinício:** ao iniciar, o servidor reabre todas as salas não encerradas, **pausadas** no último tick gravado (seção 7.3). No modo B, as salas continuam no servidor entre uma aula e outra: o professor retoma a partida na aula seguinte com o PIN, sem exportar nada.
- **Backup automático** do arquivo do banco no fim de cada mês de jogo, ao encerrar a sala e na inicialização do servidor (antes das migrações), com rotação das cópias mais antigas.
- **Retenção do estado:** estado completo do motor só do tick atual e dos fins de mês. Como o motor é determinístico, semente + log de decisões + eventos reconstroem qualquer tick (replay).
- **Retenção das salas (modo B):** salas encerradas ficam disponíveis para relatórios até o professor excluí-las; prazo máximo a definir com a política de dados (decisão 10).
- **Histórico para gráficos:** agregados semanais por oferta e mensais por empresa. O aluno recebe a série semanal completa da própria empresa e, das demais empresas do seu mercado, só a participação semanal (pública, como na tela); o professor recebe tudo.
- **Atualização de versão:** trocar o executável. Na inicialização, o servidor faz backup do banco e aplica as migrações pendentes.

### 9.8 Regras importantes

- **O servidor valida todas as decisões** (limites, caixa, módulos ativos, teto de preço). O frontend nunca é confiável.
- **Mensagens do WebSocket com esquema validado** (em `/pacotes/compartilhado`) e versionado; cliente e servidor recusam versões incompatíveis. Como as telas vêm do servidor da sala, cliente e servidor normalmente têm a mesma versão.
- **Atualizações enxutas:** enviar só o que mudou (ou o resumo da equipe e do mercado), para 50+ clientes a cada tick sem sobrecarga.
- **Impedir a suspensão** do computador host enquanto a sala está rodando, se possível sem privilégios (API do Windows via `bun:ffi`); desejável no modo A, não obrigatório. No modo B, a máquina servidora já fica permanentemente ligada.
- O Claude Code desenvolve e testa tudo localmente, sem contas externas. Antes do piloto, rodar o **teste de carga** com clientes simulados.

### 9.9 Prova de conceito (PoC) de rede — primeira entrega

**Objetivo:** responder, no laboratório real e antes de qualquer outra fase, as duas perguntas que decidem se a solução funciona **sem a TI**:

1. **O executável roda** no computador do professor e nos dos alunos, sem ser bloqueado (AppLocker, SmartScreen, antivírus)?
2. **Os alunos conseguem se conectar** ao computador do professor (firewall de entrada)?

E, de brinde: 3) a **descoberta automática** por UDP funciona nessa rede? 4) a conexão aguenta **uma turma inteira** ao mesmo tempo?

**O que é:** um executável pequeno (`poc-rede.exe`), feito **com a mesma tecnologia do produto** (Bun compilado, `Bun.serve` com HTTP e WebSocket, UDP), para que o resultado valha para o produto final. Sem motor, sem banco, sem jogo.

**Modo "Professor" (host):**
- Escuta na porta TCP da sala (em todas as interfaces) e na porta UDP de descoberta. Tenta também uma lista de **portas candidatas** (ex.: 47800, 8080, 8000, 3000), para descobrir se alguma já está liberada por regras existentes.
- Abre no navegador uma página local com: nome da máquina, IPs e sub-rede, perfil de rede do Windows (Domínio/Privado/Público), se o usuário é administrador, estado do firewall (leitura, sem alterar nada) e quais portas conseguiu abrir.
- Mostra **ao vivo** a lista de alunos que se conectaram: nome da máquina, IP, como encontrou a sala (UDP ou endereço digitado), se HTTP e WebSocket funcionaram, latência.
- Botão **"Gerar relatório"**: salva um arquivo (`.txt` e `.json`) com tudo isso, para anexar ao plano ou levar à TI.

**Modo "Aluno":**
- Sobe uma página apenas em `localhost` (não aciona o firewall), procura salas por broadcast UDP e lista as encontradas.
- Ao clicar numa sala, testa HTTP e WebSocket até o host e envia o resultado ao host.
- Botão **"Teste de carga"** (opcional): abre várias conexões simuladas a partir daquela máquina, para simular uma turma inteira com poucos computadores.

**Teste sem executável no aluno:** do navegador de um computador de aluno, abrir `http://<ip-do-professor>:<porta>/teste`. Valida o caminho "endereço + código", que precisa funcionar mesmo se o executável do aluno for bloqueado.

**Roteiro de teste no laboratório (~30 minutos):**
1. Copiar o `poc-rede.exe` para a máquina do professor e para pelo menos 3 máquinas de alunos (idealmente o laboratório inteiro).
2. Executar de **três lugares** diferentes: pendrive, pasta Downloads e área de trabalho (políticas de bloqueio costumam diferenciar pastas). Anotar qualquer mensagem do Windows (ex.: "O Windows protegeu o computador" ou "Este aplicativo foi bloqueado pelo administrador"), com captura de tela.
3. Iniciar o modo Professor e, nos alunos, o modo Aluno. Anotar se a sala apareceu na lista.
4. Em uma máquina de aluno, testar só pelo navegador (`/teste`).
5. Rodar o teste de carga.
6. Gerar o relatório no host.

**Como interpretar o resultado:**

| Resultado | Conclusão | Próximo passo |
|---|---|---|
| Executável roda e os alunos conectam | **Não precisa da TI** | Seguir para a fase 0 |
| Executável roda, mas os alunos não conectam | Firewall de entrada bloqueando | Pedir à TI a regra por porta (seção 9.5), ou usar modo B ou C |
| Alguma porta candidata funcionou | Já existe regra liberando essa porta | Adotar essa porta como padrão (decisão 16) |
| Executável bloqueado no professor | Política de bloqueio de programas | Pedir liberação à TI (assinatura digital ajuda), ou modo C |
| Executável bloqueado só nos alunos, navegador funciona | Sem impacto | Alunos entram por endereço + código |
| HTTP funciona, mas a descoberta UDP não | Sub-redes separadas ou isolamento entre clientes | Alunos entram por endereço + código |
| Conexões caem no teste de carga | Rede ou máquina host limitadas | Investigar antes da fase 1 |

**Resultado (29/09/2026, versão 0.1.0 da PoC):**

Máquinas: Windows 11 Enterprise (build 26100), no domínio `senacsp.edu.br`, usuário sem administrador, sem política de AppLocker, perfil de rede Domínio. Firewall ativo nos três perfis, com entrada bloqueada por padrão.

| Teste | Resultado |
|---|---|
| Executável roda (pasta Downloads, sem administrador) | **Sim**, no professor e no aluno |
| Professor em máquina do laboratório de aula → aluno na mesma sub-rede (`10.135.166.0/24`) | **Não conecta.** O aviso do firewall apareceu e exigiria administrador; sem a regra, nenhuma conexão chegou ao host (HTTP e WebSocket sem resposta em 5 s, em todas as tentativas) |
| Host em máquina com administrador, no laboratório do centro de pesquisa (outra sub-rede) → aluno no laboratório de aula | **Conecta.** HTTP e WebSocket ok; latência média 2,2 ms (p95 4 ms); as seis portas candidatas passaram (47800, 8080, 8000, 3000, 5000, 80) |
| Teste de carga (1 máquina de aluno, 25 conexões, 60 s) | 25/25 abertas, 0 falhas, 0 quedas; latência média 1,1 ms, máxima 3,3 ms |
| Descoberta UDP | Não funcionou (esperado entre sub-redes; na mesma sub-rede, bloqueada pelo firewall do host) |
| Teste só pelo navegador (`/teste`) | Não realizado |

**Conclusões:**
1. O bloqueio é o **firewall de entrada do computador do professor**, não a rede: entre as sub-redes não há filtro de porta.
2. O modo A exigiria a regra da TI em todas as máquinas de professor. **Adotado o modo B** (seção 9.1.1), com o servidor numa máquina com administrador no centro de pesquisa.
3. A entrada dos alunos é por **endereço + código**; a descoberta UDP não se aplica ao modo B.
4. **Pendências antes do piloto:** repetir o teste pelo navegador (`/teste`) a partir de um computador do laboratório de aula, para confirmar que não há proxy interferindo no WebSocket; e repetir o teste de carga com 2 ou 3 máquinas simultâneas (meta: ~50 conexões).

Relatórios de origem: `relatorio-professor-CAS0728899W11-1-20260929-*` e `relatorio-aluno-CAS0728844W11-1-20260929-*` (`.txt` e `.json`).

**Reaproveitamento:** o código da PoC evolui para o **diagnóstico de rede** do painel do professor e para o **guia para a TI** (seção 9.5), então nada se perde.

**Esforço estimado:** pequeno (um a dois dias de desenvolvimento) e independente do motor; pode ser feito em paralelo ao início da fase 0, mas o resultado deve ser conhecido **antes da fase 1**.

---

---

## 10. Balanceamento

É o ponto que mais preocupa o autor. A estratégia é **testar o equilíbrio por simulação automática**, em vez de calibrar números à mão.

1. **Parâmetros em presets versionados.** Um preset combina **um recorte da árvore de produtos** (ex.: `introdutorio`, `agronegocio`, `industria`, `completo` — anexo, seção 5) com **um nível de dificuldade** (ex.: `facil`, `padrao`, `desafiador`). Cada combinação usada em aula precisa passar pelo balanceamento.
2. **Robôs com estratégias típicas:**
   - *Preço baixo* — margem mínima, volume alto
   - *Premium* — fabrica, investe pesado em P&D, preço alto
   - *Marca* — publicidade intensa
   - *Equilibrada* — ajusta preço à concorrência
   - *Revenda* — só compra pronto, nunca fabrica
   - *Passiva* — linha de base (quase não decide)
   - *Aleatória* — decisões ao acaso, dentro de limites
   - *Integrada* (camada 3) — controla a cadeia da matéria-prima ao varejo
   - *Fornecedora* (camada 3) — especializa-se em matéria-prima ou semiacabado e vende no atacado
3. **CLI de balanceamento:** roda N partidas (ex.: 500 sementes) com combinações de robôs e gera um relatório (Markdown + CSV). Horizonte padrão: **24 meses** (partida típica), com checagem também no mês 4. Cada semente sorteia o cenário dentro de faixas declaradas no preset (população, preço de referência, pesos da nota, preço e qualidade do fornecedor) e a intensidade de cada robô; sem essa variação, as sementes gerariam partidas quase iguais. Vitória = maior pontuação (lucro acumulado) no mercado, com empate decidido pelo id da empresa.
4. **Métricas de aceite** (valores iniciais a discutir):
   - nenhuma estratégia vence mais de ~40% das partidas em confronto equilibrado;
   - toda estratégia "razoável" vence pelo menos ~10%. **Exceção na camada 1 (decidido em 29/09/2026): a *Revenda*.** Sem atacado entre equipes, ela é logicamente dominada: é o *Preço baixo* sem a opção de fabricar, e nenhuma combinação de parâmetros a faz vencer (324 combinações testadas, inclusive partidas de 6 meses). Na camada 1 ela é estratégia de referência, com critério próprio: lucro médio acima da *Passiva* e pelo menos tantas vitórias quanto ela. Revender fica como caminho seguro, mas que não leva à liderança. Na camada 3, comprando do melhor fabricante e investindo em marca, como a marca própria do Capitalism II, a *Revenda* volta ao critério comum;
   - a *Passiva* e a *Aleatória* quase nunca vencem (decidir bem precisa importar);
   - as diferenças entre empresas ficam visíveis em até 3–4 meses de jogo;
   - poucas empresas com caixa negativo prolongado com parâmetros padrão;
   - **teste de melhor resposta:** otimizar um robô por busca em grade contra os demais; se uma decisão extrema e trivial (ex.: preço mínimo sempre) vencer, rebalancear.

   **Confrontos da CLI** (`bun run balancear`, definidos na fase 0):
   - *todos* (confronto equilibrado: as 7 estratégias, uma empresa cada): **entra na aprovação**;
   - *extremo* (as 7 mais a estratégia degenerada "preço mínimo" = custo, sem publicidade nem P&D): **entra na aprovação só pelo critério desta seção** (decidido em 30/09/2026): o preço mínimo não pode vencer mais de 15%. Os demais critérios aparecem como diagnóstico. Com um jogador vendendo a preço de custo, as margens de todos caem, e a passiva, que não investiu, pode vencer às vezes: é consequência econômica, não desequilíbrio;
   - *subconjuntos* (4 ou 5 estratégias sorteadas): **só diagnóstico**. Com poucos concorrentes de verdade, a taxa "justa" de vitória já passa de 30%, e o limite de 40% não se aplica;
   - *melhor resposta* (busca em grade da intensidade de uma estratégia): quando o ótimo cai na borda da grade, a busca estende a grade naquela direção até 3 vezes. O alerta só dispara se a vitória continuar crescendo rumo ao extremo e passar de 40%. Um robô otimizado vencer bem acima de 40% contra seis robôs com intensidade padrão é esperado; o que a seção pede corrigir é um **ótimo extremo e trivial**. Na calibração da fase 0 (medido no candidato v0.3.0), o ótimo da publicidade foi interior: preço justo e ~14% da receita em publicidade. Acima de ~18%, a empresa passa a perder, e com 30% dá prejuízo (decidido em 30/09/2026: aceitar e registrar).
5. **Robôs reaproveitados** como concorrentes dentro do jogo (turmas pequenas).
6. **Pré-visualização para o professor:** botão "simular partida com robôs" para ver como um preset se comporta antes da aula.

---

## 11. Mapeamento pedagógico

| Mecânica | Conceito | Disciplinas |
|---|---|---|
| Nota = preço + qualidade + marca, com pesos por produto | Proposta de valor, posicionamento, comportamento do consumidor | Marketing |
| Elasticidade e necessidade | Elasticidade-preço, bens essenciais × supérfluos | Microeconomia, Marketing |
| Reconhecimento e fidelidade | Brand equity (Aaker, Keller), funil de marketing | Marketing |
| Publicidade com retorno decrescente | Orçamento de marketing, ROI | Marketing, Finanças |
| P&D e tecnologia relativa | Inovação, vantagem competitiva, longo × curto prazo | Estratégia |
| Comprar pronto × fabricar | Make or buy, private label, integração vertical, custos de transação | Estratégia, Operações |
| Capacidade, estoque, ruptura | Planejamento da produção, custo de estoque, nível de serviço | Operações |
| Participação via logit | Estrutura de mercado, concorrência | Economia, Estratégia |
| DRE, balanço, fluxo de caixa | Análise das demonstrações, capital de giro | Contabilidade, Finanças |
| Crédito emergencial | Gestão de caixa, custo do dinheiro | Finanças |
| Ações, emissão, recompra, dividendos | Valuation, estrutura de capital, política de dividendos | Finanças, Mercado de Capitais |
| Eventos macro | Ciclo econômico, choques externos, análise de cenários | Economia |
| Mercados paralelos | Dependência de trajetória, efeito das decisões iniciais | Estratégia |
| Cadeias de produção (leite → iogurte, sorvete, chocolate) | Agregação de valor, custo de oportunidade, para onde direcionar a produção | Estratégia, Operações |
| Pecuária com vários produtos do mesmo rebanho | Custo conjunto e rateio | Contabilidade de Custos |
| Calendário agrícola (colheita concentrada) | Sazonalidade, estoque, capital de giro, safra × entressafra | Agronegócio, Finanças, Operações |
| Jazidas com reserva finita | Exaustão de recursos naturais, ativo que se consome | Contabilidade |
| Mercado atacadista entre equipes | Relação com fornecedores, poder de barganha, dependência, especialização | Suprimentos, Estratégia (5 Forças) |
| Qualidade que se propaga pela cadeia | Gestão da qualidade na cadeia de suprimentos | Operações, Qualidade |

---

## 12. Modelo de dados (preliminar)

> Esboço para orientar o plano. Nomes, tipos e normalização a definir na implementação. **Toda tabela ligada ao jogo carrega `partida_id` e, quando aplicável, `mercado_id`.**

| Tabela | Conteúdo principal |
|---|---|
| `professores` | Só no modo online (fase 5): nome, e-mail, hash da senha, instituição. Na rede local não há contas |
| `sessoes` | Tokens de sessão de alunos, professor e telão (reconexão), com papel e expiração |
| `tentativas_acesso` | Tentativas falhas de chave, PIN e código da sala, por IP e sala (limite de tentativas) |
| `configuracao_servidor` | Hash da chave de professor (modo B), portas, versão do esquema |
| `partidas` | Professor (nome informado ao criar a sala), nome, disciplina, código da sala, hash do PIN do professor, token do telão, status (preparação, rodando, pausada, encerrada), módulos ativos, preset, parâmetros (JSON versionado), semente, tick atual, segundos por tick, modo (contínuo/rodada), regras de pausa, pontuação, visibilidade do ranking |
| `mercados` | Partida, nome, população, nível de consumo, parâmetros locais |
| `produtos` | Partida (copiado do catálogo do preset), nome, nível (matéria-prima/semiacabado/final), classe, preço de referência, necessidade, elasticidade, pesos da nota, dados do fornecedor externo, ativo no preset (sim/não) |
| `receitas` | Produto, insumo, quantidade, peso na qualidade; peso da tecnologia do produto |
| `culturas` | Partida, cultura, mês de plantio, mês de colheita, perene (sim/não), modo (anual/contínuo), meses de pausa, produtividade, custos |
| `instalacoes` | Empresa, tipo (fábrica, fazenda, mina, poço, madeireira, ponto de venda), tamanho, nível, capacidade, status da obra, produto/cultura/rebanho configurado |
| `jazidas` | Mercado, recurso, reserva inicial, reserva atual, qualidade, preço, dona (empresa ou nenhuma), leilão (se houver) |
| `ofertas_atacado` | Empresa vendedora, produto, preço, quantidade mensal disponível, qualidade |
| `pedidos_atacado` | Empresa compradora, vendedor (empresa ou fornecedor externo), produto, quantidade mensal |
| `empresas` | Mercado, nome, tipo (equipe/robô), estratégia do robô |
| `membros` | Usuário, empresa, nome de exibição, papel opcional (financeiro, marketing, produção) |
| `decisoes` | Empresa, produto (opcional), tipo de decisão, valores (JSON), vale a partir do tick, autor, criado em — **somente inclusão** (log); a vigente é a mais recente |
| `estado_motor` | Partida, tick, estado completo (JSON) — só o atual e os de fim de mês |
| `historico_oferta_semanal` | Oferta, semana: preço, vendas, demanda, participação, nota, reconhecimento, fidelidade, qualidade, estoque |
| `historico_empresa_mensal` | Empresa, mês: DRE, balanço, fluxo de caixa, preço da ação, pontuação |
| `eventos` | Partida, tick agendado, tipo, parâmetros, texto para os alunos, aplicado (sim/não), autor |
| `ajustes_parametros` | Log de alterações de parâmetros feitas ao vivo pelo professor |
| `transacoes_financeiras` | Camada 2: empréstimos, emissões, recompras, dividendos, participações |
| `log_ticks` | Auditoria: tick, duração do processamento, erros |

**Implementado na fase 1** (migrações `001_inicial.sql` e `002_acessos.sql`). O esboço acima continua como referência para as camadas seguintes. Na fase 1, catálogo, empresas e instalações vivem dentro do estado do motor (JSON), e não em tabelas próprias.

| Tabela | Conteúdo |
|---|---|
| `salas` | Código, status, tick, metadados em JSON (configuração, vagas, equipes, membros, prontos) |
| `estado_atual` | Estado do motor e acumulador semanal, sobrescritos a cada tick |
| `estado_fim_mes` | Estado de cada fim de mês; mês 0 = início da partida (base do replay) |
| `entradas_tick` | Somente inclusão: as entradas passadas ao motor em cada tick, com a versão do motor (replay) |
| `decisoes` | Somente inclusão: decisões aceitas; `aplicada_no_tick` nulo = ainda na fila |
| `comandos` | Respostas dos comandos já executados (idempotência, inclusive após reinício) |
| `historico_oferta_semanal` / `historico_empresa_mensal` | Séries dos gráficos; o mensal guarda o fechamento e a pontuação |
| `log_ticks` | Tempo de gravação de cada tick |
| `acessos_sala` | Hash do PIN e token do telão |
| `sessoes` | Hash do token, sala, papel, membro, expiração |
| `tentativas` | Limite de tentativas: falhas, início da janela, bloqueado até |
| `configuracao_servidor` | Hash da chave de professor |

Tudo o que o tick produz é gravado numa única transação; se ela falhar, a sala pausa com motivo "erro", e o estado em memória continua igual ao do banco.

---

## 13. Capacidade e requisitos

**Estimativa por aula** (50 alunos + professor, 2 mercados × 6 equipes, 5 produtos, partida típica de 24 meses = 720 ticks, ~40 min de relógio rodando a ~3,3 s por tick):

| Recurso | Estimativa | Avaliação |
|---|---|---|
| Banco por partida | < 10 MB (histórico semanal e mensal + estados de fim de mês + log de decisões) | Folgado; arquivos exportáveis |
| Conexões WebSocket simultâneas | ~51 | Trivial para o Bun num PC comum |
| Tráfego de rede | Atualizações de poucos KB por cliente por tick ≈ algumas centenas de KB/s no total | Irrelevante numa rede local |
| Gravações no SQLite | Algumas por segundo, de um único processo | Folgado (modo WAL) |
| Memória do servidor | Estimativa de 100–300 MB | Qualquer PC de laboratório atual |

**Requisitos do computador servidor (modo B, padrão):** Windows 10/11 64 bits, permanentemente ligado, alcançável a partir dos laboratórios de aula, com a regra de firewall de entrada da seção 9.5 e endereço estável. Não precisa de internet. Com várias turmas simultâneas, a capacidade da tabela acima se multiplica pelo número de salas; ainda folgado para um PC comum até algumas salas ao mesmo tempo (validar com o teste de carga).

**Requisitos do computador host (modo A):** Windows 10/11 64 bits, na mesma rede dos alunos, com a regra de firewall da seção 9.5. Não precisa de internet.

**Modo C (online):** uma máquina pequena (ex.: 1 vCPU, 1 GB de RAM) com **disco persistente** atende várias turmas simultâneas. Hospedagens "serverless" sem disco persistente não servem para o SQLite.

**Cuidados:**
- O limite de jogabilidade (4 a 8 equipes por mercado, seção 2) é bem mais restritivo que o técnico.
- O processamento de um tick deve ser rápido (meta: < 300 ms para 2 mercados × 8 empresas × 5 produtos) para não atrasar o relógio. Com a camada 3 e recortes maiores da árvore, medir de novo; se necessário, processar a produção diariamente e o atacado semanalmente.
- Validar com o teste de carga (`/ferramentas/teste-de-carga`) antes do piloto.

---

---

## 14. Roadmap sugerido

Cada fase termina em algo utilizável.

| Fase | Entrega | Critério de aceite |
|---|---|---|
| **PoC — Rede no laboratório** (primeira entrega) — **concluída em 29/09/2026** | `poc-rede.exe` com modos Professor e Aluno, relatório e roteiro de teste (seção 9.9) | Teste feito no laboratório real e relatório gerado, respondendo às duas perguntas (o executável roda? os alunos conectam?). Resultado: modo B adotado |
| **Protótipo visual** (em paralelo à fase 0) — **dispensado (30/09/2026)** no início: o autor preferiu ir direto à fase 1. **Feito depois para a tela do aluno (01/10/2026)**, quando a primeira versão pareceu "uma página web"; validado com o autor e implementado (seção 8.2) | Telas navegáveis com dados fictícios e guia de estilo (seção 8.1) | — |
| **0 — Motor e balanceamento** — **entregue em 30/09/2026, com pendência (decisão 26)** | Pacote do motor (camada 1) com **árvore de produtos genérica**, catálogo completo em dados (anexo), robôs, CLI de balanceamento, preset `introdutorio` | Testes unitários das fórmulas (incluindo a nota do manual); determinismo (mesma semente = mesmo resultado); relatório de balanceamento cumprindo as métricas da seção 10. Situação: motor, robôs, CLI e testes completos; o balanceamento fica em aberto até a fronteira tecnológica (seção 6.6) e os testes com alunos |
| **1 — MVP em sala (rede local)** | Servidor Bun + SQLite + WebSocket, relógio no servidor, estado persistido a cada tick com retomada pausada, executável `.exe` portátil com modo servidor (modo B), várias salas simultâneas, chave de professor, PIN do professor e link do telão, entrada por endereço + código, guia de implantação do servidor, diagnóstico de rede, teste de carga, criar partida, tela de decisões, relógio (velocidade, pausa, modo rodada, avançar), painel do professor com visão geral, relatórios básicos, ranking | Piloto com uma turma real em laboratório sem falhas bloqueantes |
| **2 — Aula completa** | Relatórios completos (DRE, balanço, fluxo de caixa), modo apresentação, debate final, exportação, salvar/abrir partida como arquivo, backup automático com rotação, modo A com tela inicial e descoberta UDP (para outras instituições), robôs no jogo, mercados paralelos, eventos básicos | Professor conduz o debate apenas com a ferramenta |
| **3 — Finanças** | Camada 2: crédito, ações, dividendos, participações | Balanceamento reexecutado com a camada ativa |
| **4 — Cadeia produtiva** | Camada 3: fazendas (lavoura com calendário, pecuária), mineração/petróleo/madeira com exaustão, fábricas em vários níveis, mercado atacadista entre equipes, presets `agronegocio`, `industria` e `completo`, eventos avançados (ex.: safra ruim) | Idem, com os robôs *Integrada* e *Fornecedora* |
| **5 — Modo online** (contingência) | O mesmo servidor numa hospedagem com disco persistente: contas de professor, HTTPS, guia de implantação | Uma aula remota completa sem falhas bloqueantes |
| **Futuro** | Logística (múltiplas cidades, frete), RH, marketing avançado | A definir |

---

## 15. Decisões em aberto

Confirmar com o autor antes ou durante o planejamento:

1. ~~**Stack do frontend**~~ — **Decidido (30/09/2026):** React + Vite + TypeScript, com build estático embutido no executável e 100% offline.
2. ~~**Idioma do código**~~ — **Decidido (29/09/2026):** português para identificadores do domínio, tabelas e nomes de arquivos, como no modelo de dados (seção 12). APIs e bibliotecas externas mantêm seus nomes originais. Interface em PT-BR.
3. ~~**Recorte do primeiro preset**~~ — **Decidido (29/09/2026):** laticínios e couro (leite engarrafado, iogurte, sorvete, sapato, carteira), conforme o anexo. Não criar produtos novos além da lista do jogo (decisão do autor), exceto o item 12.
4. ~~**Identificação dos alunos**~~ — **Decidido (30/09/2026):** só nome/apelido com o código da sala. **Equipes criadas pelos alunos:** o professor define as vagas por mercado; o primeiro aluno de uma vaga dá o nome e escolhe a cor (paleta acessível); os demais entram numa equipe existente; voltar com o mesmo nome na mesma equipe recupera o acesso; o professor renomeia equipes e move alunos. Ao iniciar, vagas vazias viram robôs (estratégia escolhida na criação) ou ficam inativas.
5. **Assinatura digital de código** — comprar um certificado (facilita a liberação pela TI e evita alertas do Windows) ou distribuir sem assinatura no início?
6. **Uso para avaliação** — a pontuação vai compor nota? Se sim, reforçar auditoria, identificação dos alunos e proteção contra trapaça.
7. ~~**Pontuação padrão e visibilidade do ranking**~~ — Pontuação padrão **decidida (29/09/2026): lucro acumulado** (também é o critério de vitória no balanceamento, seção 10); o professor pode trocar por partida. Visibilidade **decidida (30/09/2026): completa** por padrão; o professor pode mudar para "só a própria posição" ou "oculto" (o telão só mostra o ranking quando é completo).
8. **Sistemas operacionais do executável** — só Windows ou também Linux/macOS (compilação cruzada)?
9. **Hospedagem do modo online** (fase 5) — instituição, autor ou outra? Pode ser decidido depois.
10. **Dados pessoais (LGPD)** — coletar o mínimo (nome/apelido), definir prazo de retenção e exclusão das partidas.
11. ~~**Edição de decisões durante a pausa**~~ — **Decidido (30/09/2026):** na pausa manual do professor, **bloqueada** por padrão (o professor pode liberar por partida); na pausa automática de fim de mês do modo rodada, **sempre liberada** (é o momento de decidir). Ao atingir a duração planejada, a partida pausa e o professor encerra (congela os resultados) ou estende.
12. **Queijo** — não existe no Capitalism II. Incluir como produto extra (queijo = leite + tecnologia)? É só dado no catálogo. Fora do primeiro preset (decisão 3).
13. ~~**Valores iniciais**~~ — **Decidido (29/09/2026):** usar as quantidades e pesos do Apêndice B do manual como ponto de partida da calibração.
14. **Jazidas** — venda a preço fixo, leilão entre equipes ou ambos?
15. **Culturas perenes** — só o modo anual (mais simples, igual ao jogo) ou também o modo contínuo para coco e seringueira?
16. **Portas padrão** — TCP 47800 (sala) passou entre os laboratórios na PoC; UDP 47801 (descoberta) só se aplica ao modo A. Confirmar 47800 como padrão.
17. ~~**Painel do professor em outro computador**~~ — **Decidido (29/09/2026):** sim. No modo B todo acesso de professor é remoto, com chave de professor para criar salas e PIN por sala; o telão usa um link próprio, somente leitura (seção 9.6).
18. **Nome do produto e ícone** do executável. Provisório (30/09/2026): "Simulador de Mercado", com identidade visual neutra definida por tokens (seção 8.1), trocável sem reescrever telas.
19. ~~**TI só se necessário**~~ — **Decidido (29/09/2026):** a PoC mostrou que o modo A exigiria a TI em todas as máquinas de professor; adotado o modo B, que só exige a regra de firewall na máquina servidora (seções 9.1.1 e 9.9).
20. **Identidade visual** — nome, logotipo, paleta e tipografia do produto (junto com a decisão 18).
21. **Vista da cidade** — incluir a ilustração 2D/isométrica com os prédios das equipes ou ficar só com painéis e gráficos?
22. **Origem da arte** — pacotes de licença livre, arte gerada, arte encomendada ou combinação. **Em andamento (01/10/2026):** as imagens dos produtos são geradas por IA pelo autor, com um bloco de estilo comum (ícone 3D suave, vista ¾, fundo cinza liso recortado depois); falta registrar a ferramenta e a licença em `docs/licencas-assets.md`.
23. **Sons** — incluir efeitos sonoros (desligados por padrão) ou não?
24. ~~**Chave de professor (modo B)**~~ — **Decidido (30/09/2026):** uma chave única compartilhada pelos professores da instituição; cada sala continua com seu PIN.
25. **Endereço do servidor (modo B)** — reserva de IP no DHCP ou nome da máquina no domínio? Definir antes de imprimir o endereço nos laboratórios.
26. **Fronteira tecnológica e recalibração da P&D** (aberta em 30/09/2026; seção 6.6 e `docs/calibracao-introdutorio.md`, seção 6) — implementar o teto tecnológico com retorno decrescente e recalibrar exigindo, ao mesmo tempo, equilíbrio no confronto e P&D com ótimo interior. **Adiada para depois dos testes com alunos**: até lá, o preset jogável é o `introdutorio/padrao` v0.2.0, em que P&D compensa, mas o robô premium bem ajustado vence ~77% das partidas entre robôs.
27. ~~**Interface do aluno**~~ — **Decidido (01/10/2026), sobre o protótipo clicável:** tela de jogo em painel único sem rolagem (seção 8.2); tema claro por padrão; alvo de 1920×1080 (cabendo em 1366×768); envio automático das decisões, sem "Enter para confirmar"; fechamento do mês em janela só no modo rodada; participação em rosca sobre as linhas semanais; avisos flutuantes só para produto esgotado, 1º lugar e desfazer.

---

## 16. Fora de escopo (nesta versão)

- Aplicativo móvel nativo
- Partidas entre instituições diferentes ou abertas ao público
- Chat entre equipes
- Monetização, pagamentos, anúncios
- Mapa da cidade, gráficos 3D ou isométricos
- Qualquer conteúdo copiado do jogo original (arte, textos, mapas, código); números do manual apenas como ponto de partida da calibração
- Produtos novos fora da lista do jogo (exceto decisão do item 12 da seção 15)
- Serviços de backend externos (Supabase, SQL Server etc.) — a arquitetura é o servidor próprio da seção 9

---

## 17. Referências

Material usado para entender o modelo do *Capitalism* (apenas como inspiração conceitual):

- [Capitalism (video game) — Wikipedia](https://en.wikipedia.org/wiki/Capitalism_(video_game))
- [Manual do Capitalism II (PDF, Enlight)](https://www.enlight.com/capitalism2/manual/Capitalism2_Manual.pdf) — fórmula da nota do produto (capítulo de Marketing), marca, qualidade na fabricação, fazendas, mineração e exaustão; Apêndice A (produtos de varejo) e Apêndice B (Guia do Fabricante: receitas, pesos de qualidade e de tecnologia)
- [How Branding Works — Capitalism Lab](https://www.capitalismlab.com/resources/gameplay-faq/brand/) — reconhecimento e fidelidade
- [Strategies for Market Domination — Capitalism Lab](https://www.capitalismlab.com/strategies-market-domination/)
- [Reverse Engineering Capitalism 2 — Adam Milazzo](https://www.adammil.net/blog/v112_Reverse_Engineering_Capitalism_2.html) — fórmula de frete, campo "spending" (útil para o futuro módulo de Logística)
- [Cap++ — reimplementação open-source do Capitalism Plus](https://github.com/cciacona/capplusplus) — exemplo de política *clean-room*
- [Bun — Single-file executables](https://bun.sh/docs/bundler/executables) — `bun build --compile`, compilação cruzada, arquivos embutidos, opções de Windows
- [Bun — UDP](https://bun.sh/docs/api/udp) — sockets UDP (descoberta de sala)
- [Bun — SQLite](https://bun.sh/docs/api/sqlite) — `bun:sqlite`
- Calendário agrícola: fontes listadas no anexo `arvore-de-produtos.md` (Conab, Embrapa, IEA-SP, UNICA e outras)
