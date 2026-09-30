/**
 * Textos da ajuda contextual (seção 8.1): o conceito da aula por trás de cada decisão. Curtos, para
 * ler durante o jogo; o professor aprofunda em sala.
 */
export const AJUDA = {
  preco:
    "Preço de venda por unidade. Preço mais baixo aumenta a nota do produto e a fatia do mercado, mas reduz a margem de cada venda. Compare com o custo por unidade e com os concorrentes. Há um preço máximo.",
  vender: "Desmarque para tirar o produto das prateleiras. O estoque fica guardado (e paga armazenagem).",
  compraMensal:
    "Unidades compradas prontas do fornecedor por mês, entregues aos poucos ao longo do mês. É o jeito rápido de ter produto, mas o custo por unidade é o preço do fornecedor. Comprar demais acumula estoque parado; comprar de menos deixa clientes sem produto.",
  producaoMensal:
    "Unidades por mês fabricadas nas suas fábricas, até a capacidade delas. Fabricar exige fábrica pronta e insumos; com a experiência, cada unidade sai mais barata e a capacidade cresce (curva de aprendizado).",
  publicidadeMensal:
    "Verba mensal de publicidade. Aumenta o reconhecimento da marca, que pesa na nota do produto. O efeito acumula com o tempo e se desgasta se a verba parar.",
  pdMensal:
    "Verba mensal de pesquisa e desenvolvimento. Aumenta a tecnologia do produto fabricado, o que eleva a qualidade. É investimento de longo prazo: o resultado não aparece no mesmo mês.",
  fabrica:
    "Uma fábrica permite produzir em vez de comprar pronto. Exige investimento (capex), leva alguns dias para ficar pronta e tem custo fixo mensal, vendendo ou não. Vale a pena quando o volume compensa o custo fixo.",
  pontoDeVenda:
    "Pontos de venda limitam quanto você consegue vender por dia. Abrir custa um investimento inicial, leva alguns dias e gera custo fixo mensal. Sem capacidade de venda, a demanda vai para os concorrentes.",
  pronto: "Marque quando a equipe terminar de decidir. O professor vê quem está pronto e, no modo rodada, pode seguir quando todas as equipes marcarem.",
  nota: "A nota do produto combina qualidade, marca e preço, com os pesos que os consumidores deste produto dão a cada um. Quanto maior a nota em relação à dos concorrentes, maior a sua fatia das vendas.",
  dre: "A DRE (demonstração do resultado) mostra, mês a mês, a receita de vendas menos os custos e despesas: o lucro ou prejuízo do mês.",
  balanco: "O balanço é a foto da empresa no fim do mês: o que ela tem (ativo) e como isso foi financiado (dívidas e patrimônio dos sócios).",
} as const;
