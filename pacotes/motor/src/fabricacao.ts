/**
 * P&D e fabricação própria (seção 6.6; passo 6 da seção 6.15).
 *
 * Ordem, para não depender da ordem das empresas:
 * 1. P&D do dia de todas as ofertas → nova tecnologia T' de cada uma (verba sem fábrica também
 *    acumula tecnologia, para quando a fábrica ficar pronta).
 * 2. T_max por (mercado, produto), com todas as empresas do mercado.
 * 3. Produção desejada de cada oferta, limitada pela capacidade das fábricas em operação.
 * 3b. Origem dos insumos (camada 3): o que a decisão manda tirar do estoque próprio de matéria-prima é
 *    reservado, empresa a empresa, na ordem das ofertas; se o estoque não cobre e o preset não completa
 *    com o fornecedor, a produção da oferta cai ao que o estoque cobre.
 * 4. O restante dos insumos é comprado do fornecedor externo no momento da produção. Se um insumo tem limite
 *    mensal, ele é dividido proporcionalmente entre todos os pedidos do mercado, e a produção de
 *    cada oferta é reduzida pelo insumo mais escasso da sua receita.
 * 5. O lote entra no estoque com custo = insumos (próprios pelo custo médio, sem caixa; comprados pelo
 *    preço do fornecedor) + mão de obra, e qualidade fixada na produção (insumo misto: média ponderada).
 */
import { movimentarCaixa, reconhecerResultado } from "./contabilidade";
import type { Contexto } from "./contexto";
import { arredondarCentavos, darEntrada, darSaida, parcelaDoDia } from "./dinheiro";
import { qualidadeFabricada, tecnologiaNova, tecnologiaRelativa } from "./formulas/qualidade";
import { taxaMensalParaTick } from "./formulas/tempo";
import type { InsumoReceita } from "./preset";
import { DIAS_POR_MES, type EstadoEmpresa, type EstadoFabrica, type EstadoOferta, type ParametrosResolvidos, type ProdutoResolvido } from "./tipos";
import { temFabricaOperando } from "./vendas";

interface PedidoProducao {
  empresa: EstadoEmpresa;
  oferta: EstadoOferta;
  produto: ProdutoResolvido;
  quantidade: number;
  /** Fração de cada insumo (0 a 1) que vem do estoque próprio; ausente = tudo do fornecedor. */
  fracaoPropria: Map<string, number>;
}

/** Tolerância no limiar de nível: a experiência é uma soma de frações e 60 × (1/60) pode dar 0,9999999. */
const TOLERANCIA_NIVEL = 1e-9;

/** Nível da fábrica na curva de aprendizado: maior `i` com `experiencia ≥ limitesMeses[i]`. */
export function nivelDaFabrica(fabrica: EstadoFabrica, aprendizado: ParametrosResolvidos["aprendizado"]): number {
  let nivel = 0;
  aprendizado.limitesMeses.forEach((limite, i) => {
    if (fabrica.experiencia >= limite - TOLERANCIA_NIVEL) nivel = i;
  });
  return nivel;
}

/** Capacidade de uma fábrica em operação no tick, pelo nível de aprendizado. */
function capacidadeDaFabrica(fabrica: EstadoFabrica, produto: ProdutoResolvido, ctx: Contexto): number {
  const a = ctx.estado.parametros.aprendizado;
  return produto.fabricacao!.capacidadeUnidadesPorDia * ctx.diasPorTick * a.capacidade[nivelDaFabrica(fabrica, a)]!;
}

function fabricasOperando(empresa: EstadoEmpresa, produto: string, tick: number): EstadoFabrica[] {
  return empresa.fabricas.filter((f) => f.produto === produto && f.operaDesdeTick <= tick);
}

/** Capacidade de produção do produto no tick (soma das fábricas em operação, cada uma pelo seu nível). */
export function capacidadeDeProducao(empresa: EstadoEmpresa, produto: ProdutoResolvido, ctx: Contexto): number {
  if (!produto.fabricacao) return 0;
  let capacidade = 0;
  for (const f of fabricasOperando(empresa, produto.id, ctx.tick)) capacidade += capacidadeDaFabrica(f, produto, ctx);
  return capacidade;
}

/**
 * Multiplicador médio do custo de mão de obra das fábricas em operação, ponderado pela capacidade
 * (o que um lote produzido hoje pagaria). Sem fábrica operando, o do primeiro nível.
 */
export function multiplicadorMaoDeObra(empresa: EstadoEmpresa, produto: ProdutoResolvido, ctx: Contexto): number {
  const a = ctx.estado.parametros.aprendizado;
  const fabricas = produto.fabricacao ? fabricasOperando(empresa, produto.id, ctx.tick) : [];
  let soma = 0;
  let pesos = 0;
  for (const f of fabricas) {
    const cap = capacidadeDaFabrica(f, produto, ctx);
    soma += cap * a.maoDeObra[nivelDaFabrica(f, a)]!;
    pesos += cap;
  }
  return pesos > 0 ? soma / pesos : a.maoDeObra[0]!;
}

/** Passo 6 (parte): P&D, tecnologia e fabricação. */
export function etapaFabricacao(ctx: Contexto): void {
  const p = ctx.estado.parametros;
  const n = ctx.ticksPorMes;
  const taxaTec = p.tecnologia.taxaTecnologiaMensal / n;
  const referenciaPD = p.tecnologia.verbaReferenciaMensal / n;
  const difusao = taxaMensalParaTick(p.tecnologia.difusaoTecnologicaMensal, n);

  // 1. P&D do dia e nova tecnologia.
  for (const empresa of ctx.estado.empresas) {
    for (const oferta of empresa.ofertas) {
      const verba = parcelaDoDia(oferta.decisao.pdMensal, ctx.dia, n);
      if (verba > 0) {
        movimentarCaixa(empresa, ctx.lancamentos, -verba, "operacional", "pesquisa e desenvolvimento", empresa.id, "laboratorio", oferta.produto);
        reconhecerResultado(empresa, "pd", verba);
      }
      oferta.tecnologia = tecnologiaNova(oferta.tecnologia, verba, taxaTec, referenciaPD);
    }
  }

  for (const mercado of ctx.estado.mercados) {
    const empresas = ctx.estado.empresas.filter((e) => e.mercado === mercado.id);

    // 2. Tecnologia máxima por produto no mercado; depois, difusão: cada empresa fecha uma fração da
    //    distância até a líder (a líder não muda, então T_max continua o mesmo).
    const tecnologiaMaxima = new Map<string, number>();
    for (const e of empresas) {
      for (const o of e.ofertas) tecnologiaMaxima.set(o.produto, Math.max(tecnologiaMaxima.get(o.produto) ?? 0, o.tecnologia));
    }
    if (difusao > 0) {
      for (const e of empresas) {
        for (const o of e.ofertas) o.tecnologia += difusao * (tecnologiaMaxima.get(o.produto)! - o.tecnologia);
      }
    }

    // 3. Produção desejada, limitada pela capacidade.
    const pedidos: PedidoProducao[] = [];
    for (const empresa of empresas) {
      for (const oferta of empresa.ofertas) {
        const produto = ctx.produtos.get(oferta.produto)!;
        if (!produto.fabricacao || oferta.decisao.producaoMensal <= 0) continue;
        if (!temFabricaOperando(empresa, produto.id, ctx.tick)) continue;
        const quantidade = Math.min(oferta.decisao.producaoMensal / n, capacidadeDeProducao(empresa, produto, ctx));
        if (quantidade > 0) pedidos.push({ empresa, oferta, produto, quantidade, fracaoPropria: new Map() });
      }
    }
    if (pedidos.length === 0) continue;

    // 3b. Reserva do estoque próprio de matéria-prima (quantidades ainda não retiradas).
    const livre = new Map<string, number>();
    const disponivelPropria = (empresa: EstadoEmpresa, insumo: string) => {
      const chave = `${empresa.id}|${insumo}`;
      if (!livre.has(chave)) livre.set(chave, empresa.materiasPrimas[insumo]?.estoque.quantidade ?? 0);
      return { chave, quantidade: livre.get(chave)! };
    };
    for (const x of pedidos) {
      const fab = x.produto.fabricacao!;
      const proprios = fab.receita.filter((i) => x.oferta.decisao.origemInsumos[i.produto] === "propria");
      if (proprios.length === 0) continue;
      const necessidadeDe = (i: InsumoReceita) => (x.quantidade * i.quantidadePorLote) / fab.unidadesPorLote;
      if (!p.cadeia!.completaComFornecedor) {
        let escala = 1;
        for (const i of proprios) escala = Math.min(escala, disponivelPropria(x.empresa, i.produto).quantidade / necessidadeDe(i));
        x.quantidade *= escala;
      }
      for (const i of proprios) {
        const necessario = necessidadeDe(i);
        const { chave, quantidade: disponivel } = disponivelPropria(x.empresa, i.produto);
        const propria = Math.min(necessario, disponivel);
        livre.set(chave, disponivel - propria);
        x.fracaoPropria.set(i.produto, necessario > 0 ? propria / necessario : 0);
      }
    }
    for (let k = pedidos.length - 1; k >= 0; k--) if (pedidos[k]!.quantidade <= 0) pedidos.splice(k, 1);
    if (pedidos.length === 0) continue;

    // 4. Insumos escassos: fração disponível de cada insumo com limite mensal.
    const necessidade = new Map<string, number>();
    for (const x of pedidos) {
      const fab = x.produto.fabricacao!;
      for (const i of fab.receita) {
        const f = x.fracaoPropria.get(i.produto) ?? 0;
        const total = (x.quantidade * i.quantidadePorLote) / fab.unidadesPorLote;
        necessidade.set(i.produto, (necessidade.get(i.produto) ?? 0) + (f > 0 ? total * (1 - f) : total));
      }
    }
    const fracaoDisponivel = new Map<string, number>();
    for (const [insumo, total] of necessidade) {
      const limite = ctx.produtos.get(insumo)!.fornecedor!.ofertaMaxMensal;
      fracaoDisponivel.set(insumo, limite === null || total <= limite / n ? 1 : limite / n / total);
    }

    // 5. Produção efetiva: compra dos insumos, mão de obra e entrada no estoque.
    for (const x of pedidos) {
      const fab = x.produto.fabricacao!;
      let escala = 1;
      // Só os insumos que ainda vêm do fornecedor limitam a produção.
      for (const i of fab.receita) if ((x.fracaoPropria.get(i.produto) ?? 0) < 1) escala = Math.min(escala, fracaoDisponivel.get(i.produto)!);
      const quantidade = x.quantidade * escala;
      if (quantidade <= 0) continue;

      let custoInsumos = 0;
      const insumosDoLote: { peso: number; qualidade: number }[] = [];
      for (const i of fab.receita) {
        const fornecedor = ctx.produtos.get(i.produto)!.fornecedor!;
        const quantidadeInsumo = (quantidade * i.quantidadePorLote) / fab.unidadesPorLote;
        // Parte própria: sai do estoque de matéria-prima pelo custo médio, sem caixa.
        const fracao = x.fracaoPropria.get(i.produto) ?? 0;
        let propria = 0;
        let custoPropria = 0;
        let qualidadePropria = 0;
        if (fracao > 0) {
          const estoqueMP = x.empresa.materiasPrimas[i.produto]!.estoque;
          propria = Math.min(quantidadeInsumo * fracao, estoqueMP.quantidade);
          qualidadePropria = estoqueMP.qualidade;
          custoPropria = darSaida(estoqueMP, propria);
        }
        const doFornecedor = quantidadeInsumo - propria;
        const custo = arredondarCentavos(doFornecedor * fornecedor.preco);
        movimentarCaixa(x.empresa, ctx.lancamentos, -custo, "operacional", "compra de insumo", "fornecedor_externo", x.empresa.id, i.produto);
        custoInsumos += custo + custoPropria;
        const qualidadeInsumo = propria > 0 ? (propria * qualidadePropria + doFornecedor * fornecedor.qualidade) / quantidadeInsumo : fornecedor.qualidade;
        insumosDoLote.push({ peso: i.pesoQualidade, qualidade: qualidadeInsumo });
      }
      // Divide o lote entre as fábricas na proporção da capacidade: cada uma paga a mão de obra do seu
      // nível e ganha experiência (meses equivalentes de produção à capacidade nominal).
      const fabricas = fabricasOperando(x.empresa, x.produto.id, ctx.tick);
      const capacidades = fabricas.map((f) => capacidadeDaFabrica(f, x.produto, ctx));
      let capacidadeTotal = 0;
      for (const c of capacidades) capacidadeTotal += c;
      let maoDeObra = 0;
      fabricas.forEach((f, k) => {
        const parte = (quantidade * capacidades[k]!) / capacidadeTotal;
        const multiplicador = p.aprendizado.maoDeObra[nivelDaFabrica(f, p.aprendizado)]!;
        maoDeObra += arredondarCentavos(parte * fab.custoMaoDeObraPorUnidade * multiplicador);
        f.experiencia += parte / (fab.capacidadeUnidadesPorDia * DIAS_POR_MES);
      });
      movimentarCaixa(x.empresa, ctx.lancamentos, -maoDeObra, "operacional", "mão de obra da produção", x.empresa.id, "trabalhadores", x.produto.id);

      const relativa = tecnologiaRelativa(x.oferta.tecnologia, tecnologiaMaxima.get(x.produto.id)!, p.tecnologia.tecnologiaBase);
      const qualidade = qualidadeFabricada(insumosDoLote, fab.pesoTecnologia, relativa);
      darEntrada(x.oferta.estoque, quantidade, custoInsumos + maoDeObra, qualidade);
    }
  }
}

/** Passo 11 (parte): custo fixo das fábricas em operação. */
export function etapaCustoFixoFabricas(ctx: Contexto): void {
  const n = ctx.ticksPorMes;
  for (const empresa of ctx.estado.empresas) {
    let mensal = 0;
    for (const f of empresa.fabricas) {
      if (f.operaDesdeTick <= ctx.tick) mensal += ctx.produtos.get(f.produto)!.fabricacao!.custoFixoMensal;
    }
    const custo = parcelaDoDia(mensal, ctx.dia, n);
    if (custo > 0) {
      movimentarCaixa(empresa, ctx.lancamentos, -custo, "operacional", "custo fixo das fábricas", empresa.id, "prestadores");
      reconhecerResultado(empresa, "custo_fixo_fabrica", custo);
    }
  }
}
