# Árvore de Produtos e Calendário Agrícola

> Anexo do `documento-de-design-simulador.md` (seções 6.7 a 6.10).
> **Base:** lista de produtos e cadeias do *Capitalism II* (Manual, Apêndice A — produtos de varejo — e Apêndice B — Guia do Fabricante). Os nomes em inglês entre parênteses são os do manual, para facilitar a consulta.
> **Números:** este anexo traz só a **estrutura** (o que é feito de quê). Quantidades, pesos de qualidade de cada insumo e peso da tecnologia estão no Apêndice B do manual e servem como **ponto de partida da calibração**, não como valores finais (ver seção 3, princípio 8, do documento principal).
> Manual: https://www.enlight.com/capitalism2/manual/Capitalism2_Manual.pdf

---

## 1. Como ler

- **Matéria-prima:** vem de fazenda (lavoura ou pecuária) ou de extração (mina, poço de petróleo, madeireira). Também pode ser comprada de fornecedor externo.
- **Semiacabado:** feito em fábrica, usado como insumo de outros produtos. Não vai para o varejo. Também pode ser comprado de fornecedor externo.
- **Produto final:** vendido no varejo ao consumidor.
- Cada produto fabricado tem **até 3 insumos**. A qualidade final = soma ponderada da qualidade de cada insumo + peso da tecnologia × tecnologia relativa (os pesos somam 100% — ver seção 6.6 do documento principal).
- Os presets usam **recortes** desta árvore. Nenhum preset precisa ativar tudo.

---

## 2. Matérias-primas

### 2.1 Lavoura (fazenda — unidade de cultivo)

| Cultura | Produto colhido | Usado em |
|---|---|---|
| Cacau (Cocoa) | Cacau | Bolo, barra de chocolate |
| Coco (Coconut) | Coco | Óleo de coco |
| Milho (Corn) | Milho | Milho enlatado, flocos de milho, xarope de milho |
| Algodão (Cotton) | Algodão | Tecido, tênis, sofá, boneca |
| Linho (Flax) | Fibra de linho (Flax Fiber) | Tecido de linho |
| Uva (Grape) | Uva | Suco de uva, vinho |
| Limão (Lemon) | Limão | Ácido cítrico |
| Seringueira (Rubber Plant) | Borracha | Roda e pneu, sandália, tênis, patins |
| Morango (Strawberry) | Morango | Sorvete, iogurte, snack de frutas |
| Cana-de-açúcar (Sugar Cane) | Açúcar | Refrigerante de cola, sorvete, flocos de milho, biscoito, chiclete |
| Tabaco (Tobacco) | Tabaco | Cigarro, charuto |
| Trigo (Wheat) | Trigo | Farinha, óleo de gérmen de trigo |

### 2.2 Pecuária (fazenda — unidade de criação + unidade de processamento)

No jogo, cada **unidade de processamento** escolhe **um** produto do rebanho. Para tirar leite e couro do mesmo gado, usa-se uma unidade para cada produto.

| Rebanho | Produtos possíveis | Varejo direto? | Usado em |
|---|---|---|---|
| Gado (Cattle) | Carne bovina congelada, couro, leite | Carne: sim | Leite → leite engarrafado, sorvete, iogurte, barra de chocolate. Couro → jaqueta de couro, artigos de couro, sapato, sofá, patins |
| Frango (Chicken) | Frango congelado, ovos | Sim (ambos) | Frango → sopa enlatada. Ovos → bolo |
| Porco (Pig) | Carne suína congelada, couro | Carne: sim | Couro (idem gado) |
| Ovelha (Sheep) | Carne de cordeiro congelada, couro, lã | Carne: sim | Lã → suéter, meias. Couro (idem) |

> **Queijo** não existe na lista do Capitalism II. Se desejado, é uma inclusão simples de dados: *Queijo = leite (+ tecnologia)*, classe Alimentos (ou uma nova classe Laticínios). Ver decisão em aberto no documento principal.

### 2.3 Extração

| Instalação | Recursos | Usado em |
|---|---|---|
| Mina (Mine) | Minério de ferro (Iron Ore) | Aço |
| | Carvão (Coal) | Aço |
| | Alumínio (Aluminum) | Refrigerante de cola (lata), aparelho de som, DVD player |
| | Sílica (Silica) | Vidro, silício |
| | Ouro (Gold) | Anel de ouro |
| | Prata (Silver) | Colar de prata, filme fotográfico |
| | Materiais químicos (Chemical Materials) | Higiene, limpeza, medicamentos, cosméticos, poliéster, componentes eletrônicos, filme |
| Poço de petróleo (Oil Well) | Petróleo (Oil) | Plástico, poliéster, corante |
| Madeireira (Logging Camp) | Madeira (Timber) | Papel, corante, móveis, taco de golfe |

---

## 3. Semiacabados

| Semiacabado | Insumos |
|---|---|
| Aço (Steel) | Carvão, minério de ferro |
| Ácido cítrico (Citric Acid) | Limão |
| Carroceria (Car Body) | Vidro, plástico, aço |
| Componentes eletrônicos (Electronic Components) | Materiais químicos, silício, aço |
| Corante (Dyestuff) | Petróleo, madeira |
| CPU | Silício |
| Farinha (Flour) | Trigo |
| Motor (Engine) | Aço |
| Óleo de coco (Coconut Oil) | Coco |
| Óleo de gérmen de trigo (Wheat Germ Oil) | Trigo |
| Papel (Paper) | Madeira |
| Plástico (Plastic) | Petróleo |
| Poliéster (Polyester) | Materiais químicos, petróleo |
| Roda e pneu (Wheel & Tire) | Borracha, aço |
| Silício (Silicon) | Sílica |
| Tecido (Textiles) | Algodão |
| Tecido de linho (Linen) | Fibra de linho |
| Vidro (Glass) | Sílica |
| Xarope de milho (Corn Syrup) | Milho |

---

## 4. Produtos finais (por classe)

| Classe | Produto | Insumos |
|---|---|---|
| **Alimentos** | Pão (Bread) | Farinha |
| | Milho enlatado (Canned Corn) | Milho |
| | Sopa enlatada (Canned Soup) | Frango congelado |
| | Flocos de milho (Corn Flakes) | Milho, açúcar |
| | Carnes congeladas (bovina, frango, suína, cordeiro) e ovos | Direto da pecuária |
| **Bebidas** | Leite engarrafado (Bottled Milk) | Leite, vidro |
| | Refrigerante de cola (Cola) | Açúcar, alumínio |
| | Suco de uva (Grape Juice) | Uva, ácido cítrico, vidro |
| | Vinho (Wine) | Uva, vidro |
| **Sobremesas** | Bolo (Cakes) | Ovos, cacau, farinha |
| | Sorvete (Ice-cream) | Leite, morango, açúcar |
| | Iogurte (Yogurt) | Leite, morango, ácido cítrico |
| **Snacks** | Barra de chocolate (Chocolate Bar) | Leite, cacau |
| | Biscoito (Cookies) | Açúcar, farinha |
| | Snack de frutas (Fruit Snacks) | Morango |
| | Chiclete (Chewing Gum) | Açúcar, xarope de milho |
| **Higiene pessoal** | Loção corporal (Body Lotion) | Materiais químicos, óleo de coco, plástico |
| | Xampu (Shampoo) | Materiais químicos, plástico |
| | Sabonete (Soap) | Ácido cítrico, óleo de coco, papel |
| **Limpeza** | Detergente (Detergent) | Materiais químicos, ácido cítrico, plástico |
| | Creme dental (Toothpaste) | Materiais químicos, plástico |
| | Limpador sanitário (Toilet Cleaner) | Materiais químicos, plástico |
| **Cosméticos** | Sombra (Eye Shadow) | Materiais químicos, plástico |
| | Tintura de cabelo (Hair Color) | Corante, plástico, óleo de gérmen de trigo |
| | Batom (Lipstick) | Corante, plástico, óleo de gérmen de trigo |
| | Perfume (Perfume) | Materiais químicos, vidro |
| **Medicamentos** | Antigripal (Cold Tablets) | Materiais químicos, plástico |
| | Xarope para tosse (Cough Syrup) | Materiais químicos, plástico |
| | Analgésico (Headache Pills) | Materiais químicos, plástico |
| **Vestuário** | Jaqueta de couro (Leather Jacket) | Couro, tecido |
| | Jeans (Jean) | Corante, tecido |
| | Suéter (Sweater) | Lã, corante |
| **Calçados** | Sandália (Sandals) | Borracha |
| | Sapato (Shoes) | Couro, tecido |
| | Meias (Socks) | Lã |
| | Tênis (Sport Shoes) | Algodão, borracha, poliéster |
| **Artigos de couro** | Bolsa (Leather Bag) | Couro, tecido |
| | Cinto (Leather Belt) | Couro, aço |
| | Pasta executiva (Leather Briefcase) | Couro, tecido |
| | Carteira (Leather Wallet) | Couro |
| **Móveis** | Cama (Bed) | Madeira |
| | Cadeira (Chair) | Madeira, tecido |
| | Sofá (Sofa) | Couro, algodão, madeira |
| **Joias** | Colar de prata (Silver Necklace) | Prata |
| | Anel de ouro (Gold Ring) | Ouro |
| **Relógios** | Relógio elegante (Elegant Watch) | Vidro, aço |
| | Relógio esportivo (Sports Watch) | Componentes eletrônicos, vidro, plástico |
| **Esportes** | Mochila (Backpack) | Tecido de linho, poliéster |
| | Taco de golfe (Golf Club) | Madeira, aço |
| | Patins (In-line Skates) | Couro, borracha, aço |
| **Tabaco** | Cigarro (Cigarettes) | Tabaco, papel |
| | Charuto (Cigars) | Tabaco, papel |
| **Eletrônicos** | Ar-condicionado (Air Conditioner) | Componentes eletrônicos, aço |
| | Aparelho de som (Hi-fi) | Alumínio, componentes eletrônicos, aço |
| | Micro-ondas (Microwave Oven) | Componentes eletrônicos, vidro, plástico |
| | Televisor (Television) | Componentes eletrônicos, vidro, plástico |
| | DVD player | Alumínio, componentes eletrônicos |
| | Celular (Mobile Phone) | Componentes eletrônicos, plástico |
| | Filmadora (Video Camera) | Componentes eletrônicos, vidro, plástico |
| | Videocassete (Video Recorder) | Componentes eletrônicos, vidro, aço |
| **Computadores** | Desktop | CPU, componentes eletrônicos, aço |
| | Notebook | CPU, componentes eletrônicos |
| | PDA (Palm Computer) | CPU, componentes eletrônicos, plástico |
| | Impressora (Printer) | Componentes eletrônicos, plástico |
| **Fotografia** | Câmera (Camera) | Componentes eletrônicos, vidro, plástico |
| | Filme fotográfico (Camera Film) | Materiais químicos, prata, plástico |
| **Brinquedos e videogames** | Videogame portátil (Hand-held Game Device) | Componentes eletrônicos, vidro, plástico |
| | Console de videogame (Video Game Console) | Componentes eletrônicos, plástico |
| | Carrinho de corrida (Toy Racing Car) | Componentes eletrônicos, plástico |
| | Boneca (Toy Doll) | Algodão, corante, tecido |
| **Automóveis** | Carro (Car) | Carroceria, motor, roda e pneu |
| | Motocicleta (Motorcycle) | Motor, aço, roda e pneu |

> Alguns produtos são datados (videocassete, PDA, filme fotográfico). Podem ficar fora dos presets ou ser renomeados em versões futuras, sem mudar a estrutura.

---

## 5. Recortes sugeridos para presets

| Preset | Cadeias ativas | Por quê |
|---|---|---|
| **Introdutório** (camada 1) | Laticínios e couro: leite engarrafado, iogurte, sorvete, sapato, carteira. Insumos (leite, couro, vidro, morango, açúcar, ácido cítrico, tecido) comprados de fornecedor externo | Produtos familiares; make or buy com poucos insumos |
| **Cadeia mínima** (camada 3 reduzida, seção 6.16 do design) | Pecuária (gado de corte → carne bovina e couro; gado leiteiro → leite; frango) + lavoura (morango, cana) → carne bovina e frango congelados direto na loja; leite engarrafado, sorvete, iogurte, jaqueta de couro, sapato e carteira em fábricas de um nível. Vidro, ácido cítrico e tecido do fornecedor externo | As três etapas do jogo (fazenda, fábrica, loja) com o menor número de peças; atacado entre equipes e integração vertical |
| **Agronegócio** (camada 3) | Pecuária (gado, frango) + lavouras (morango, cana, trigo, cacau) → leite engarrafado, carnes congeladas e ovos, sobremesas, snacks, pão. Demais insumos (vidro, ácido cítrico, milho) do fornecedor externo | Sazonalidade, estoque, integração vertical, custo conjunto do rebanho |
| **Indústria** (camada 3) | Mineração (ferro, carvão, sílica, alumínio, químicos) + petróleo → aço, vidro, silício, plástico, componentes eletrônicos → eletrônicos | Cadeias longas, exaustão de jazidas, mercado atacadista entre equipes |
| **Completo** (camadas 1–3) | Toda a árvore | Uso avançado ou turmas de semestre final |

---

## 6. Calendário agrícola (Brasil)

Os meses do jogo original não seguem nenhum calendário real, e só inverter 6 meses não dá um calendário brasileiro. Os meses abaixo seguem a principal região produtora do Brasil.

**Regra do jogo (mantida do Capitalism):** a cultura é plantada no mês de plantio; se a ordem de plantio vier depois dele, a unidade espera o ano seguinte; a colheita fica disponível **no fim do mês de colheita** e vai para o estoque (celeiro). Em culturas perenes, "plantio" é uma convenção para o **início do ciclo anual** (florada, poda, retomada da sangria). O ciclo se repete todo ano.

| Cultura | Região de referência | Janela real de plantio / início do ciclo | Janela real de colheita | **Jogo: plantio → colheita** | Observação |
|---|---|---|---|---|---|
| Cacau | Sul da Bahia | Florada principal ~mai–ago | Safra principal out/nov–fev; temporão abr–ago | **Jun → Nov** | Perene. Opcional: segunda colheita menor (temporão) |
| Coco | Litoral do Nordeste | Sem sazonalidade | O ano todo (a cada 20–35 dias) | **Jul → Jan** (convenção) | Perene. Ideal: modo de produção contínua (ver abaixo) |
| Milho | Sul/Sudeste, 1ª safra | set–dez | jan–jun | **Out → Mar** | Anual. A 2ª safra (safrinha: plantio jan–mar, colheita mai–ago) pode virar opção futura |
| Algodão | Mato Grosso | dez–fev | jun–set | **Jan → Jul** | Anual (plantado como 2ª safra) |
| Linho | RS (Noroeste/Missões) | mai–jun | out–dez | **Mai → Nov** | Anual de inverno |
| Uva | Serra Gaúcha | Poda jul–ago; brotação set | Vindima jan–mar | **Set → Fev** | Perene |
| Limão (Tahiti) | São Paulo | Florada set–out | jan–jun (pico jan–mar) | **Set → Fev** | Perene. Entressafra jul–dez com preço alto: bom gancho para estoque |
| Seringueira | Noroeste de SP | Retomada da sangria set–out | Sangria out–jul; pausa ~ago–set | **Out → Mar** | Perene. Ideal: produção contínua com pausa em ago–set |
| Morango | Sul/Sudeste | Transplante abr–mai | ago–dez (Sul de MG a partir de abr) | **Abr → Ago** | Tratado como anual |
| Cana-de-açúcar | Centro-Sul | Cana de ano e meio jan–mar | Safra (moagem) abr–nov | **Fev → Jul** | Semiperene: 1º corte 16–18 meses após o plantio; depois corte anual por ~5 safras. Simplificação aceitável: ciclo anual |
| Tabaco | RS, SC, PR | Semeadura abr–jun; transplante jun–set | out/nov–fev | **Jun → Dez** | Anual |
| Trigo | PR / RS | abr–jul | ago–dez | **Mai → Out** | Anual de inverno |

**Parâmetros por cultura** (no preset): mês de plantio, mês de colheita, perene (sim/não), modo (`anual` ou `continuo`), meses de pausa (para o modo contínuo), produtividade, custos.

- **Modo `anual`** (padrão, igual ao jogo): uma colheita por ano.
- **Modo `continuo`** (opcional, para coco e seringueira): produção mensal distribuída, com meses de pausa configuráveis. Pode ficar para depois; o modo anual funciona para todas as culturas.

**Confiança das fontes:** alta para milho, algodão e trigo (Conab), limão (Embrapa) e vindima; média para cacau (as fontes divergem entre Bahia e Pará), seringueira (duas análises do IEA com diferença de ~1 mês), morango, linho, tabaco (colheita) e poda da uva. Como tudo é parâmetro, dá para ajustar sem mexer no código.

### Fontes do calendário

- Conab — Calendário de Plantio e Colheita de Grãos (2022): https://www.gov.br/conab/pt-br/acesso-a-informacao/institucional/publicacoes/arquivos-de-paginas/calendariozplantiozezcolheitazjunz2022.pdf
- Embrapa — Evolução da produção de cacau: https://www.alice.cnptia.embrapa.br/alice/bitstream/doc/1122655/1/Cap17-EvolucaoProducaoCacau.pdf
- Notícias Agrícolas — safra principal do cacau: https://www.noticiasagricolas.com.br/podcasts/18543-safra-principal-de-cacau-que-comeca-em-outubro-dev.html
- BNB — Produção de coco: https://www.bnb.gov.br/revista/cse/article/download/3026/2125/9855
- Unijuí — linho/linhaça no RS: https://publicacoeseventos.unijui.edu.br/index.php/salaoconhecimento/article/download/22328/20822
- Embrapa Uva e Vinho — safra vitícola da Serra Gaúcha: https://www.infoteca.cnptia.embrapa.br/infoteca/bitstream/doc/1138580/1/Doc-132-online.pdf
- Embrapa — poda da videira: https://www.infoteca.cnptia.embrapa.br/infoteca/bitstream/doc/1060144/1/Manual3capitulo4x.pdf
- Embrapa — lima ácida Tahiti: https://www.infoteca.cnptia.embrapa.br/infoteca/bitstream/doc/1145897/1/Recomendacoes-producao-lima-acida-Tahiti-Citros.pdf
- IEA-SP — seringueira (sangria): https://iea.agricultura.sp.gov.br/out/TerTexto.php?codTexto=14576
- IEA-SP — safra da borracha: https://iea.agricultura.sp.gov.br/out/LerTexto.php?codTexto=15936
- Embrapa — Sistema de produção do morango: https://www.infoteca.cnptia.embrapa.br/infoteca/bitstream/doc/744878/1/Sistema-de-Producao-do-Morango.pdf
- Revista Cultivar / Emater-MG — morango no Sul de Minas: https://revistacultivar.com.br/noticias/producao-de-morango-no-sul-de-minas-deve-alcancar-173-mil-toneladas-em-2024-diz-a-emater-mg
- Cana Online — plantio de cana de ano e meio: https://www.canaonline.com.br/conteudo/centro-sul-vive-o-periodo-de-plantio-de-cana-de-ano-e-meio.html
- UNICA — safra do Centro-Sul: https://unica.com.br/noticias/centro-sul-fecha-safra-com-611-mi-t-de-cana-e-foco-no-etanol/
- Gaz — calendário de plantio do tabaco 2026/27: https://www.gaz.com.br/safra-2026-27-confira-o-calendario-de-plantio-do-tabaco-no-sul-do-brasil/
- Revista Cultivar — abertura da colheita do tabaco no RS: https://revistacultivar.com.br/noticias/aberta-oficialmente-a-colheita-do-tabaco-no-rio-grande-do-sul
