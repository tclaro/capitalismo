# Plano técnico — Fase 1b: cadeia mínima

Situação: proposta de 02/10/2026; as cinco perguntas da seção 8 foram respondidas pelo autor no mesmo dia e estão incorporadas abaixo.
Base: seção 6.16 e decisão 28 do documento de design; protótipo da tela em `docs/prototipos/cadeia.html`; mapa do motor feito em 02/10/2026.

## 1. Objetivo e limites

Entregar a camada 3 reduzida: fazendas (pecuária e lavoura), fábricas de um nível com escolha da origem de cada insumo, atacado entre equipes, cooperativa compradora, troca de atividade com desova do estoque, e a tela da cadeia.

Fora desta fase: calendário agrícola, extração, fábricas de semiacabados, robôs no atacado, preço de transferência interno (decisão: a entrega entre instalações da mesma equipe é pelo custo), contratos de longo prazo.

**Critério de aceite da fase:** piloto com uma turma real, jogando o preset `cadeia/minima`, sem falhas bloqueantes (roadmap, fase 1b).

## 2. O que o motor já oferece

- `ModuloId` já inclui `"cadeia_produtiva"`; a lista `ETAPAS` (`passo.ts`) tem os passos 4 (matérias-primas) e 5 (atacado) como etapas vazias do módulo. Módulo desligado não executa nada, então o núcleo e o golden não mudam.
- `criarPartida` recusa módulos fora de `MODULOS_IMPLEMENTADOS` (`partida.ts`, hoje só `"nucleo"`). O teste `passo.test.ts` que confere essa recusa será ajustado.
- A fábrica já compra cada insumo do fornecedor externo na hora de produzir (`fabricacao.ts`), com lançamento "compra de insumo", custo médio e qualidade pelos pesos da receita. É o ponto onde entra a escolha da origem.
- Estoque (`Estoque {quantidade, valor, qualidade}`, `darEntrada`, `darSaida`) já tem custo médio e conservação exata do valor. Hoje só existe por oferta de varejo; matéria-prima não tem estoque.
- Obras: um ativo com `operaDesdeTick > tick` está em obra; o capex é pago na decisão. As fazendas seguem o mesmo padrão.
- Os robôs só leem `VisaoEmpresa` e só emitem `produto`, `construirFabrica` e `abrirPontoDeVenda`. Campos aditivos não os quebram.

## 3. Decisões de modelagem (padrões propostos)

| # | Tema | Proposta |
|---|---|---|
| 1 | Unidade de tempo | Como no núcleo: decisões em quantidades **mensais**, consumidas por dia (`parcelaDoDia`). O protótipo usa quantidade por dia só para a tela. |
| 2 | Estoque de matéria-prima | Novo `EstadoEmpresa.estoquesMP: Record<produtoId, Estoque>` (chaves ordenadas, JSON puro). Guarda a produção das fazendas e as compras no atacado. |
| 3 | Fazenda | Novo `EstadoEmpresa.fazendas: EstadoFazenda[]`, que estende `EstadoAtivo` com `atividade`, `experiencia`, `conversaoAteTick: number \| null` e a oferta de atacado (`precoAtacado`, `quantidadeMensal`). |
| 4 | Coprodutos | Gado de corte gera carne e couro numa proporção fixa do preset. O custo do dia é rateado entre eles pelo **valor de referência** (preço do fornecedor externo × quantidade). Rateio pelo valor relativo é o método usual de custo conjunto e é determinístico. |
| 5 | Entrega entre instalações da equipe | Pelo custo médio do estoque de origem, sem lançamento de caixa e sem receita. |
| 6 | Origem de cada insumo | `"fornecedor"` (padrão, como hoje), `"propria"` ou `{equipe: empresaId}`. Vale por insumo de cada produto fabricado. O que faltar na origem escolhida completa com o fornecedor externo (padrão do preset, desligável). |
| 7 | Carne e frango direto da fazenda | A oferta de varejo desses produtos pode ter origem `"propria"` (transferência pelo custo do estoque de matéria-prima para o estoque da oferta) em vez de compra pronta do fornecedor. |
| 8 | Atacado | Liquidado no passo 5 do tick, **antes** da fábrica produzir. Pedidos agregados por vendedor e atendidos **proporcionalmente** quando excedem a oferta. Vendedores e compradores processados em ordem de id, para o resultado não depender da ordem das empresas. A mercadoria chega ao estoque de matéria-prima do comprador com a qualidade do vendedor. |
| 9 | Preço no atacado | Entre o piso (cooperativa) e o teto (fornecedor externo). A validação da decisão rejeita fora da faixa. **O vendedor pode mudar o preço e a quantidade a qualquer dia** (decisão do autor); a mudança vale a partir do tick seguinte, como as demais decisões. |
| 10 | Cooperativa | Comprador sem caixa próprio (contraparte `"cooperativa"` nos lançamentos). **Só compra quando a equipe manda vender** (decisão do autor): decisão `venderParaCooperativa` com produto e quantidade, executada no passo 5 do tick seguinte, ao preço `fator_piso_cooperativa` × preço do fornecedor (ponto de partida: 60%). Não há compra automática. Se o estoque da fazenda enche, a produção para e o custo fixo continua, o que ensina o custo de produzir sem canal de venda. |
| 11 | Troca de atividade | Decisão própria. Custo e prazo de conversão no preset, **iguais para qualquer troca** por enquanto (decisão do autor; o preset pode diferenciar depois). Durante a conversão a fazenda não produz. O estoque antigo sai na mesma hora por uma de três vias: cooperativa (ao piso), atacado barato (preço reduzido, em lote único no próximo passo 5) ou destruição (sem receita, com custo de descarte). |
| 12 | Contabilidade | Venda ao atacado e à cooperativa: receita e CPV pelo custo médio, no padrão do varejo. Destruição: baixa do estoque como perda numa conta da DRE (decidir entre reutilizar `baixa_de_ativos` e criar `perda_de_estoque`), mais o custo de descarte em caixa. Custo fixo da fazenda: nova conta `custo_fixo_fazenda` ou reutilização de `custo_fixo_fabrica` (decidir na entrega 2). |
| 13 | Balanço | `estoques` passa a incluir `estoquesMP`; `imobilizadoLiquido` e `obrasEmAndamento` incluem as fazendas; depreciação linear como nas fábricas. A identidade ativo = passivo + patrimônio líquido continua exata. |
| 14 | Robôs | Inalterados. Continuam só na camada 1, comprando do fornecedor externo. Carne e frango entram para eles como compra pronta. |
| 15 | Matérias-primas no preset | Mantêm o `fornecedor` (exigência de `validarPreset`); ele é o teto de preço. |
| 16 | Evolução do estoque | A regra "3 dias seguidos em 100%" fica **no motor**, para ser determinística e testada: cada estoque de fazenda e de fábrica tem um contador `diasCheio` (zera quando sai de 100%) e uma série curta das últimas 30 frações da capacidade, no estado da empresa (algumas dezenas de números por estoque). A visão entrega as duas coisas; a tela só pinta. O aviso discreto sai na primeira vez que o contador chega a 3. **Situação (entrega 2):** o estado já guarda `diasCheio` e `serie` por matéria-prima (`EstadoMateriaPrima`), com a constante `DIAS_CHEIO_PARA_ALERTA = 3`; a atualização vem com a produção (entrega 3). **Em aberto:** as fábricas não têm capacidade de estoque no motor (o estoque de produto acabado cresce sem teto, só com custo de armazenagem), então "100%" para o produto das fábricas pede um parâmetro novo (por exemplo, dias de produção que cabem no estoque); decidir na entrega 3 ou 4. |

## 4. Mudanças por pacote

### 4.1 `pacotes/catalogo`
- Receita da **jaqueta de couro** (informada pelo autor, do manual, em 02/10/2026): 4 de couro + 1 de tecido para 1 jaqueta. Pesos do índice de sucesso (varejo): qualidade 35%, marca 35%, preço 30%. Para consultar os detalhes de fabricação de qualquer produto: Apêndice B do manual e a wiki do Capitalism Lab (https://capitalismlab.fandom.com/wiki/Category:Products). Pendem dessas fontes: a unidade das quantidades (o manual usa libras, quarts, pares, unidades) e os pesos de cada insumo na qualidade e o peso da tecnologia. Até virem, usar a proporção 4:1 com a unidade de peso dos demais artigos de couro e pesos provisórios marcados como tal.
- Novo preset `cadeia/minima` v0.1.0: os 5 produtos do introdutório, mais jaqueta, carne bovina congelada e frango congelado como produtos de varejo.
- Novo bloco de parâmetros da cadeia no preset: atividades das fazendas (produtos e proporções dos coprodutos, capex, prazo de obra, custo fixo mensal, custo variável por unidade, capacidade mensal, vida útil, ganho de qualidade por experiência), conversão (custo e dias), cooperativa (`fatorPiso`), descarte (custo por unidade), armazenagem das fazendas.
- `validarPresetContraArvore` já confere os produtos contra a árvore; estender para conferir as atividades (um rebanho gera só produtos que a árvore lista para ele).

### 4.2 `pacotes/motor`
- `preset.ts` e `resolucao.ts`: tipos e validação do bloco da cadeia. Sorteios de valores variáveis novos em fluxo próprio (`cadeia:<id>`), sem alterar a ordem dos existentes.
- `tipos.ts`: `EstadoFazenda`, `estoquesMP`, novas decisões e avisos (ver 4.4). `VERSAO_ESTADO` 1 → 2, com migração de estados antigos (`fazendas: []`, `estoquesMP: {}`).
- `decisoes.ts`: quatro decisões novas (`construirFazenda`, `ajustarFazenda`, `trocarAtividade`, `venderParaCooperativa`) e extensão da decisão `produto` com `origemInsumos` (e `origemCompraPronta` para carne e frango). O `switch` com `never` força o tratamento em todos os pontos.
- `etapas` novas: passo 4 (custo fixo e produção das fazendas, rateio dos coprodutos, ganho de experiência, conversão em curso) e passo 5 (atacado e cooperativa).
- `fabricacao.ts`: ler a origem de cada insumo antes de comprar do fornecedor.
- `contabilidade.ts` e `financeiro.ts`: balanço, depreciação e DRE (item 12 e 13 da seção 3).
- `visao.ts`: ver 4.3.
- `partida.ts`: aceitar `"cadeia_produtiva"` em `MODULOS_IMPLEMENTADOS`.
- Regras do motor que valem aqui (teste `proibicoes`): só imports relativos, sem relógio nem aleatoriedade externa, sem `Map`/`Set` no estado, listas ordenadas por id.

### 4.3 Visão e protocolo (`motor/visao.ts`, `pacotes/compartilhado`)
- `VisaoEmpresa` ganha, de forma aditiva: as fazendas da própria empresa, os estoques de matéria-prima, as ofertas de atacado dos outros (vendedor, preço, qualidade, quantidade) e o preço-piso da cooperativa.
- Não expor: caixa, estoque e decisões dos concorrentes. As ofertas de atacado são públicas por desenho (seção 6.10).
- `protocolo.ts`: novos membros em `DecisaoDoAluno` (sem o campo `empresa`, que o servidor injeta).

### 4.4 `apps/servidor`
- `sala.ts`: o cast `{...d, empresa} as Decisao` e `semEmpresa` precisam tratar os tipos novos; `validarDecisao` já é chamada antes de enfileirar.
- `projecoes.ts`: nova projeção das fazendas e do atacado para o aluno; telão e professor com campos explícitos. `AVISOS_PUBLICOS` por tipo de aviso.
- Persistência: o estado é gravado como JSON; carregar partidas v1 exige a migração do motor. A sala `QRDDR` em `dados-dev` (pausada) é v1 e serve de teste da migração.
- Avisos novos (candidatos): fazenda concluída, conversão concluída, fazenda parada por estoque cheio, insumo faltando na origem escolhida.

### 4.5 `apps/web`
- Nova visão **Cadeia** no painel do aluno, a partir do protótipo: cartões por instalação (origem, fábrica, loja), blocos de estoque, linha de evolução do estoque de 30 dias abaixo de cada produto (nome vermelho após 3 dias em 100%), fios de fluxo só da instalação selecionada, painel de decisões com a origem de cada insumo, aba de atacado, janela de troca de atividade.
- **A visão da cadeia substitui o console por produto** quando o módulo está ativo (decisão do autor). Botões fixos na tela alternam entre as visões (por exemplo, Produtos e Cadeia, junto do relógio no HUD), com atalhos de teclado. O console por produto continua existindo, porque as decisões de preço, publicidade e P&D por produto seguem nele, e o preset sem cadeia só usa essa visão.
- Mesmas regras de interface já decididas (decisão 27): sem rolagem, envio automático, sem tremor, tema claro, 1920×1080 cabendo em 1366×768, só PC.
- Ajustes: `jogo.ts` e `VisaoGeral.tsx` (`textoDoAviso`), `regras.ts`, `CampoDecisao.tsx`.

## 5. Entregas (um commit cada)

| # | Entrega | Verificação |
|---|---|---|
| 1 | **Catálogo e preset**: bloco de parâmetros da cadeia, `cadeia/minima`, validações. **Concluída em 02/10/2026** (o preset fica fora da lista de salas até o módulo existir) | Testes do catálogo; `validarPreset`; o golden do núcleo não muda |
| 2 | **Estado do motor**: tipos, `materiasPrimas`, fazendas, versão 2 com migração, módulo aceito, balanço, depreciação, invariantes de teste. **Concluída em 02/10/2026** (sem comportamento de fazenda ainda: produção, decisões e atacado vêm nas entregas 3 a 6) | Invariantes existentes mais balanço fechado com fazendas; migração v1→v2 |
| 3 | **Fazendas**: construir, ajustar, produzir (passo 4), coprodutos, qualidade por experiência. **Concluída em 02/10/2026** (decisões `construirFazenda` e `ajustarFazenda`; a troca de atividade fica na entrega 6; ver a nota abaixo da tabela) | Testes unitários e de propriedade (estoque e valor conservados) |
| 4 | **Origem dos insumos**: fábrica e carne/frango a partir do estoque próprio, completando com o fornecedor. **Concluída em 02/10/2026** (origens `fornecedor` e `propria`; a origem `{equipe}` vem com o atacado, na entrega 5; ver a nota abaixo da tabela) | Custo e qualidade esperados em casos calculados à mão |
| 5 | **Atacado e cooperativa** (passo 5; a cooperativa só compra por ordem da equipe). **Concluída em 02/10/2026** (ver a nota abaixo da tabela) | Conservação do dinheiro entre empresas por tick; resultado igual com a ordem das empresas trocada; rateio proporcional |
| 6 | **Troca de atividade e desova** | Três vias de desova; estoque e caixa conferem; conversão sem produção |
| 7 | **Visão, protocolo, servidor e persistência** | Teste de vazamento (campos permitidos), validação do corpo, retomada de partida v1 |
| 8 | **Tela da cadeia** | Testes de DOM (happy-dom); sem rolagem e sem tremor nos dois tamanhos |
| 9 | **Calibração e balanceamento** do preset | Cada caminho (só fazenda, só fábrica, integrada) dá resultado plausível; cooperativa nunca é a melhor saída; relatório em `docs/balanceamento` |
| 10 | **Fechamento**: documentos, guia, guia de TI, carga e E2E (antiga entrega 8) | `bun run verificar` limpo; roteiro do piloto |

**Nota da entrega 3 (regras fixadas no código, `motor/src/fazendas.ts`):**
- `construirFazenda` aceita `producaoMensal` opcional; sem ela a fazenda nasce com produção 0, como as fábricas. `ajustarFazenda` muda a produção mensal (em unidades-base) com a fazenda em obra ou em operação.
- Por dia, a fazenda produz o menor entre a decisão, a capacidade nominal e o que ainda cabe no estoque de **cada** produto da atividade. Capacidade do estoque de uma matéria-prima = Σ (capacidade diária × proporção × `diasDeArmazenagem`) das fazendas em operação que a produzem. Estoque cheio para a produção; o custo fixo continua.
- Custo variável do dia entra no estoque (vai à DRE pelo CPV, na venda) e é rateado entre os coprodutos pelo valor de referência; o rateio é exato em centavos.
- Qualidade da produção = `qualidadeBase` + `ganhoQualidadePorMes` × experiência, até `qualidadeMaxima`; a experiência cresce em meses de produção à capacidade nominal.
- O custo fixo das fazendas é lançado no passo 11 (junto do das fábricas), na conta `custo_fixo_fazenda`. **Acréscimo ao plano:** o estoque de matéria-prima paga armazenagem (`custoArmazenagemMensal` do produto, conta `armazenagem`), como o estoque de varejo.
- `diasCheio` e `serie` são atualizados ao fim de cada tick (passo 11); o aviso `estoque_cheio` sai uma vez, quando o contador chega a 3. Aviso novo também: `fazenda_concluida`. Os textos da web são provisórios, até a tela da cadeia.
- **Continua em aberto:** a capacidade de estoque das fábricas (decisão 16), a decidir na entrega 4.

**Nota da entrega 4 (regras fixadas no código, `motor/src/fabricacao.ts` e `etapas.ts`):**
- A decisão `produto` ganhou `origemInsumos` (por insumo da receita: `"fornecedor"` ou `"propria"`) e `origemCompraPronta` (para carne e frango). Escolher `"fornecedor"` remove a escolha do estado. Origem própria só vale para matéria-prima que alguma atividade do preset produz.
- Origem própria sai do estoque de matéria-prima pelo custo médio, sem caixa, sem receita e sem DRE, com a qualidade do estoque. Insumo misto (parte própria, parte do fornecedor) tem qualidade média ponderada pela quantidade.
- Duas ofertas da mesma empresa que disputam o mesmo estoque são atendidas na ordem das ofertas (a do preset); a que fica sem completa com o fornecedor.
- **Novo parâmetro do preset:** `cadeia.completaComFornecedor` (`true` em `cadeia/minima`). Com `false`, a produção (ou a compra pronta) cai ao que o estoque próprio cobre.
- **Versão 3 do estado** (migração 2→3: `origemInsumos: {}` e `origemCompraPronta: "fornecedor"` em toda oferta e `completaComFornecedor: true` na cadeia).
- **Continua em aberto:** a capacidade de estoque das fábricas (decisão 16). Proposta: dias de produção à capacidade nominal que cabem no estoque de produto acabado, só como indicador (sem limitar a produção, para não mudar o núcleo), decidida junto com a tela (entrega 8), que é quem o consome. A origem `{equipe: empresaId}` e o aviso "insumo faltando na origem" ficam para as entregas 5 e 7.

**Nota da entrega 5 (regras fixadas no código, `motor/src/atacado.ts`):**
- Três decisões novas: `ofertarNoAtacado` (produto, preço, quantidade mensal; quantidade 0 retira), `comprarNoAtacado` (produto, vendedor, quantidade mensal; é um **pedido vigente**, um vendedor por matéria-prima, 0 cancela) e `venderParaCooperativa` (produto, quantidade; ordem de um tick só, nada fica no estado).
- **Desvio do plano:** a origem `{equipe: empresaId}` do item 6 virou o pedido de atacado, que põe a mercadoria no **estoque de matéria-prima do comprador**; a fábrica usa depois a origem `propria`. Na tela, a escolha "atacado" pode ser mostrada como origem do insumo sem mudar o motor.
- Preço da oferta: inteiro entre o piso (`fatorPiso` × preço do fornecedor, arredondado) e o preço do fornecedor. Só entre empresas do mesmo mercado, nunca consigo mesmo.
- Ordem no passo 5: (1) cooperativa; (2) disponível de cada oferta = menor entre a quantidade diária ofertada e o estoque que sobrou, **medido antes de qualquer entrega** (o que se compra num tick só pode ser revendido no seguinte); (3) pedidos agregados por vendedor e atendidos na proporção quando excedem o disponível. A cooperativa tem prioridade sobre o atacado no estoque do vendedor.
- Venda e compra usam o mesmo valor em centavos (soma zero, invariante nova em `verificarInvariantes`). O vendedor reconhece receita e CPV; o comprador só ganha estoque, pelo preço pago, com a qualidade do vendedor. A cooperativa paga ao preço-piso, reconhece receita e CPV (normalmente com prejuízo) e nunca compra sem ordem.
- **Versão 4 do estado** (migração 3→4: `pedidoAtacado: null` em cada matéria-prima).

A entrega 7 do plano da fase 1 (telão e acessibilidade) continua antes desta fase, se o autor mantiver a ordem.

## 6. Verificação transversal

- **Determinismo:** mesma semente e mesmas entradas dão o mesmo estado byte a byte; retomar de um JSON dá o mesmo resultado; a ordem das empresas não altera o resultado de cada uma.
- **Conservação:** dinheiro entre empresas e cooperativa soma zero por tick (invariante nova em `verificarInvariantes`); estoque de matéria-prima nunca negativo; valor do estoque inteiro; balanço exato.
- **Golden do núcleo:** com o módulo desligado, a saída dos 3 meses de teste não muda. Uma partida com o módulo ligado ganha seu próprio golden.
- **Propriedade:** os geradores de decisões aleatórias passam a incluir os tipos novos, 45 ticks, sem violar invariantes.
- **Interface:** testes de DOM da tela da cadeia; a verificação visual real é feita pelo autor, sem subir o servidor por conta própria.

## 7. Riscos

1. **Persistência.** Campos novos no estado quebram partidas gravadas sem a migração da versão 2. Mitigação: migração testada com um estado v1 real, antes de qualquer mudança de servidor.
2. **Atacado e ordem.** Qualquer dependência da ordem de iteração quebra o determinismo. Mitigação: agregação por vendedor e ordenação por id, com o teste de ordem trocada.
3. **Calibração.** Fazenda, cooperativa e preços podem tornar um caminho dominante. Mitigação: a entrega 9 existe para isso, e o preço-piso e o limite de estoque ficam no preset para ajuste sem código.
4. **Robôs fora da cadeia.** Com poucas equipes, o atacado pode ter pouca liquidez; a cooperativa garante um comprador, mas rende pouco. Aceito nesta fase (decisão 28); robôs compradores ficam para a fase 4.
5. **Receita incompleta.** Falta a unidade das quantidades e os pesos dos insumos da jaqueta; a calibração dela é provisória até o manual.
6. **Estoque travado.** Sem compra automática da cooperativa, uma fazenda sem canal de venda para e perde dinheiro. É intencional, mas a interface precisa deixar isso visível (aviso de fazenda parada e botão de vender à mão) para não parecer defeito.
7. **Tamanho da tela.** A tela da cadeia tem mais elementos que o console atual; a verificação de 1366×768 é obrigatória na entrega 8.

## 8. Decisões do autor (02/10/2026)

1. **Jaqueta de couro:** 4 couro + 1 tecido → 1 jaqueta; índice de sucesso 35% qualidade, 35% marca, 30% preço. Faltam a unidade e os pesos internos (seção 4.1).
2. **Cooperativa:** compra só quando a equipe manda vender.
3. **Atacado:** preço e quantidade podem mudar a qualquer dia.
4. **Troca de atividade:** custo e prazo iguais para qualquer troca, por enquanto.
5. **Tela:** a visão da cadeia substitui o console por produto, com botões fixos para alternar entre as visões.
