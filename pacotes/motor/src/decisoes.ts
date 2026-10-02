/**
 * Decisões das empresas.
 *
 * `validarDecisao` verifica estrutura e limites que não dependem do momento (produto existe e é
 * vendido, preço dentro do teto, valores inteiros, etc.). Não verifica caixa: o caixa muda até o
 * tick, e caixa negativo vira crédito emergencial (seção 6.12). O servidor usa a mesma função para
 * responder ao aluno na hora; o `passo` revalida ao aplicar e devolve rejeições.
 */
import { movimentarCaixa, reconhecerResultado } from "./contabilidade";
import { precoDaCooperativa } from "./atacado";
import { type Contexto, prazoEmTicks } from "./contexto";
import { emConversao, trocarAtividade } from "./fazendas";
import { tetoDePreco } from "./formulas/nota";
import type { Centavos } from "./dinheiro";
import { idSequencial } from "./partida";
import type { CadeiaResolvida, Decisao, EstadoEmpresa, EstadoPartida } from "./tipos";

/** Limites de sanidade (não são regras de jogo): evitam números absurdos vindos da rede. */
export const LIMITE_QUANTIDADE_MENSAL = 1e9;
export const LIMITE_VERBA_MENSAL = 1e12;
export const LIMITE_PONTOS_DE_VENDA_POR_DECISAO = 20;

function inteiroNaoNegativo(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 0;
}

function quantidadeValida(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= LIMITE_QUANTIDADE_MENSAL;
}

/** Parâmetros da cadeia se o módulo `cadeia_produtiva` está ligado na partida; senão, `null`. */
function cadeiaAtiva(estado: EstadoPartida): CadeiaResolvida | null {
  return estado.modulos.includes("cadeia_produtiva") ? estado.parametros.cadeia : null;
}

/** Motivo de a empresa não poder negociar a matéria-prima (módulo desligado ou produto sem estoque de matéria-prima), ou `null`. */
function motivoDaMateriaPrima(estado: EstadoPartida, empresa: EstadoEmpresa, produto: string): string | null {
  if (!cadeiaAtiva(estado)) return "a cadeia produtiva não está ativa nesta partida";
  if (empresa.materiasPrimas[produto] === undefined) return `"${String(produto)}" não é matéria-prima das fazendas desta partida`;
  return null;
}

/** Faixa de preço no atacado: do piso da cooperativa ao preço do fornecedor externo (centavos por unidade). */
export function faixaDePrecoNoAtacado(estado: EstadoPartida, produto: string): { piso: Centavos; teto: Centavos } {
  const teto = estado.parametros.produtos.find((p) => p.id === produto)!.fornecedor!.preco;
  return { piso: precoDaCooperativa(teto, estado.parametros.cadeia!.cooperativa.fatorPiso), teto };
}

/** Motivo de uma origem não valer para a matéria-prima na empresa, ou `null`. A origem própria exige uma fazenda possível. */
function motivoDaOrigem(estado: EstadoPartida, empresa: EstadoEmpresa, materiaPrima: string, origem: unknown): string | null {
  if (origem === "fornecedor") return null;
  if (origem !== "propria") return `origem "${String(origem)}" desconhecida`;
  if (!cadeiaAtiva(estado)) return "a cadeia produtiva não está ativa nesta partida";
  if (empresa.materiasPrimas[materiaPrima] === undefined) return `nenhuma atividade das fazendas produz "${materiaPrima}"`;
  return null;
}

/** Devolve `null` se a decisão é válida, ou o motivo da rejeição. */
export function validarDecisao(estado: EstadoPartida, d: Decisao): string | null {
  const empresa = estado.empresas.find((e) => e.id === d.empresa);
  if (!empresa) return `empresa "${d.empresa}" não existe`;

  switch (d.tipo) {
    case "produto": {
      const produto = estado.parametros.produtos.find((p) => p.id === d.produto);
      if (!produto || !produto.varejo) return `produto "${d.produto}" não é vendido nesta partida`;
      const campos = ["preco", "compraMensal", "producaoMensal", "publicidadeMensal", "pdMensal", "origemInsumos", "origemCompraPronta"] as const;
      if (!campos.some((c) => d[c] !== undefined)) return "decisão de produto sem nenhum campo";
      if (d.preco !== undefined && d.preco !== null) {
        if (!Number.isInteger(d.preco) || d.preco <= 0) return "preço deve ser um valor positivo em centavos inteiros";
        const teto = tetoDePreco(produto.varejo.precoReferencia, estado.parametros.vendas.multiploTetoPreco);
        if (d.preco > teto) return `preço acima do teto (${teto} centavos)`;
      }
      if (d.compraMensal !== undefined) {
        if (!quantidadeValida(d.compraMensal)) return "quantidade de compra inválida";
        if (d.compraMensal > 0 && !produto.fornecedor) return "este produto não pode ser comprado pronto";
      }
      if (d.producaoMensal !== undefined) {
        if (!quantidadeValida(d.producaoMensal)) return "quantidade de produção inválida";
        if (d.producaoMensal > 0 && !produto.fabricacao) return "este produto não pode ser fabricado";
      }
      if (d.publicidadeMensal !== undefined && (!inteiroNaoNegativo(d.publicidadeMensal) || d.publicidadeMensal > LIMITE_VERBA_MENSAL)) {
        return "verba de publicidade deve ser centavos inteiros não negativos";
      }
      if (d.pdMensal !== undefined) {
        if (!inteiroNaoNegativo(d.pdMensal) || d.pdMensal > LIMITE_VERBA_MENSAL) return "verba de P&D deve ser centavos inteiros não negativos";
        if (d.pdMensal > 0 && !produto.fabricacao) return "P&D só se aplica a produtos fabricados";
      }
      if (d.origemInsumos !== undefined) {
        if (typeof d.origemInsumos !== "object" || d.origemInsumos === null || Array.isArray(d.origemInsumos)) return "origem dos insumos inválida";
        for (const [insumo, origem] of Object.entries(d.origemInsumos)) {
          if (!produto.fabricacao?.receita.some((i) => i.produto === insumo)) return `"${insumo}" não é insumo da receita de ${produto.nome}`;
          const motivo = motivoDaOrigem(estado, empresa, insumo, origem);
          if (motivo !== null) return motivo;
        }
      }
      if (d.origemCompraPronta !== undefined) {
        const motivo = motivoDaOrigem(estado, empresa, produto.id, d.origemCompraPronta);
        if (motivo !== null) return motivo;
      }
      return null;
    }
    case "construirFabrica": {
      const produto = estado.parametros.produtos.find((p) => p.id === d.produto);
      if (!produto || !produto.varejo) return `produto "${d.produto}" não é vendido nesta partida`;
      if (!produto.fabricacao) return "este produto não pode ser fabricado";
      return null;
    }
    case "construirFazenda": {
      const cadeia = cadeiaAtiva(estado);
      if (!cadeia) return "a cadeia produtiva não está ativa nesta partida";
      if (!cadeia.atividades.some((a) => a.id === d.atividade)) return `atividade "${d.atividade}" não existe nesta partida`;
      if (d.producaoMensal !== undefined && !quantidadeValida(d.producaoMensal)) return "quantidade de produção inválida";
      return null;
    }
    case "ajustarFazenda": {
      if (!cadeiaAtiva(estado)) return "a cadeia produtiva não está ativa nesta partida";
      if (!empresa.fazendas.some((f) => f.id === d.fazenda)) return `a empresa não tem a fazenda "${d.fazenda}"`;
      if (!quantidadeValida(d.producaoMensal)) return "quantidade de produção inválida";
      return null;
    }
    case "trocarAtividade": {
      const cadeia = cadeiaAtiva(estado);
      if (!cadeia) return "a cadeia produtiva não está ativa nesta partida";
      const fazenda = empresa.fazendas.find((f) => f.id === d.fazenda);
      if (!fazenda) return `a empresa não tem a fazenda "${d.fazenda}"`;
      if (!cadeia.atividades.some((a) => a.id === d.atividade)) return `atividade "${d.atividade}" não existe nesta partida`;
      if (d.atividade === fazenda.atividade) return "a fazenda já é desta atividade";
      const tick = estado.tick + 1; // a decisão vale no próximo tick
      if (fazenda.operaDesdeTick > tick) return "a fazenda ainda está em obra";
      if (emConversao(fazenda, tick)) return "a fazenda já está em conversão";
      if (d.desova !== "cooperativa" && d.desova !== "atacado" && d.desova !== "destruir") return `desova "${String(d.desova)}" desconhecida`;
      if (d.desova === "atacado") {
        const f = d.fatorPrecoAtacado;
        if (typeof f !== "number" || !Number.isFinite(f) || f < cadeia.cooperativa.fatorPiso || f > 1) {
          return `o fator de preço do atacado deve estar entre ${cadeia.cooperativa.fatorPiso} (piso da cooperativa) e 1 (preço do fornecedor)`;
        }
      }
      return null;
    }
    case "ofertarNoAtacado": {
      const motivoBase = motivoDaMateriaPrima(estado, empresa, d.produto);
      if (motivoBase !== null) return motivoBase;
      if (!quantidadeValida(d.quantidadeMensal)) return "quantidade de oferta inválida";
      if (d.quantidadeMensal > 0) {
        const { piso, teto } = faixaDePrecoNoAtacado(estado, d.produto);
        if (!Number.isInteger(d.preco) || d.preco < piso || d.preco > teto) return `preço no atacado deve ser inteiro entre ${piso} (piso da cooperativa) e ${teto} (fornecedor externo) centavos`;
      }
      return null;
    }
    case "comprarNoAtacado": {
      const motivoBase = motivoDaMateriaPrima(estado, empresa, d.produto);
      if (motivoBase !== null) return motivoBase;
      if (!quantidadeValida(d.quantidadeMensal)) return "quantidade de compra inválida";
      if (d.quantidadeMensal > 0) {
        const vendedor = estado.empresas.find((e) => e.id === d.vendedor);
        if (!vendedor) return `vendedor "${String(d.vendedor)}" não existe`;
        if (vendedor.id === empresa.id) return "a empresa não pode comprar de si mesma";
        if (vendedor.mercado !== empresa.mercado) return "o vendedor é de outro mercado";
      }
      return null;
    }
    case "venderParaCooperativa": {
      const motivoBase = motivoDaMateriaPrima(estado, empresa, d.produto);
      if (motivoBase !== null) return motivoBase;
      if (!quantidadeValida(d.quantidade) || d.quantidade <= 0) return "quantidade para a cooperativa inválida";
      return null;
    }
    case "abrirPontoDeVenda":
    case "fecharPontoDeVenda": {
      if (!Number.isInteger(d.quantidade) || d.quantidade < 1 || d.quantidade > LIMITE_PONTOS_DE_VENDA_POR_DECISAO) {
        return `quantidade deve ser inteira entre 1 e ${LIMITE_PONTOS_DE_VENDA_POR_DECISAO}`;
      }
      if (d.tipo === "fecharPontoDeVenda" && d.quantidade > empresa.pontosDeVenda.length) {
        return `a empresa tem só ${empresa.pontosDeVenda.length} ponto(s) de venda`;
      }
      return null;
    }
    default: {
      const tipo: never = d;
      return `tipo de decisão desconhecido: ${JSON.stringify(tipo)}`;
    }
  }
}

/** Valida e aplica a decisão no estado do contexto; em caso de erro, registra a rejeição. */
export function aplicarDecisao(ctx: Contexto, d: Decisao): void {
  const motivo = validarDecisao(ctx.estado, d);
  if (motivo !== null) {
    ctx.rejeicoes.push({ decisao: d, motivo });
    return;
  }
  const empresa = ctx.empresas.get(d.empresa)!;
  const p = ctx.estado.parametros;

  switch (d.tipo) {
    case "produto": {
      const oferta = empresa.ofertas.find((o) => o.produto === d.produto)!;
      if (d.preco !== undefined) oferta.decisao.preco = d.preco;
      if (d.compraMensal !== undefined) oferta.decisao.compraMensal = d.compraMensal;
      if (d.producaoMensal !== undefined) oferta.decisao.producaoMensal = d.producaoMensal;
      if (d.publicidadeMensal !== undefined) oferta.decisao.publicidadeMensal = d.publicidadeMensal;
      if (d.pdMensal !== undefined) oferta.decisao.pdMensal = d.pdMensal;
      for (const [insumo, origem] of Object.entries(d.origemInsumos ?? {})) {
        if (origem === "fornecedor") delete oferta.decisao.origemInsumos[insumo];
        else oferta.decisao.origemInsumos[insumo] = origem;
      }
      if (d.origemCompraPronta !== undefined) oferta.decisao.origemCompraPronta = d.origemCompraPronta;
      return;
    }
    case "construirFabrica": {
      const fab = ctx.produtos.get(d.produto)!.fabricacao!;
      const id = idSequencial("fab", empresa.proximoAtivo++);
      empresa.fabricas.push({
        id,
        produto: d.produto,
        custo: fab.capex,
        depreciacaoAcumulada: 0,
        operaDesdeTick: ctx.tick + prazoEmTicks(fab.prazoConstrucaoDias, ctx),
        vidaUtilMeses: fab.vidaUtilMeses,
        experiencia: 0,
      });
      movimentarCaixa(empresa, ctx.lancamentos, -fab.capex, "investimento", "construção de fábrica", empresa.id, "construtora", d.produto);
      return;
    }
    case "construirFazenda": {
      const a = p.cadeia!.atividades.find((x) => x.id === d.atividade)!;
      const id = idSequencial("faz", empresa.proximoAtivo++);
      empresa.fazendas.push({
        id,
        custo: a.capex,
        depreciacaoAcumulada: 0,
        operaDesdeTick: ctx.tick + prazoEmTicks(a.prazoConstrucaoDias, ctx),
        vidaUtilMeses: a.vidaUtilMeses,
        atividade: a.id,
        experiencia: 0,
        conversaoAteTick: null,
        producaoMensal: d.producaoMensal ?? 0,
      });
      movimentarCaixa(empresa, ctx.lancamentos, -a.capex, "investimento", "construção de fazenda", empresa.id, "construtora");
      return;
    }
    case "ajustarFazenda": {
      empresa.fazendas.find((f) => f.id === d.fazenda)!.producaoMensal = d.producaoMensal;
      return;
    }
    case "trocarAtividade": {
      trocarAtividade(ctx, empresa, d);
      return;
    }
    case "ofertarNoAtacado": {
      empresa.materiasPrimas[d.produto]!.ofertaAtacado = d.quantidadeMensal > 0 ? { preco: d.preco, quantidadeMensal: d.quantidadeMensal } : null;
      return;
    }
    case "comprarNoAtacado": {
      empresa.materiasPrimas[d.produto]!.pedidoAtacado = d.quantidadeMensal > 0 ? { vendedor: d.vendedor, quantidadeMensal: d.quantidadeMensal } : null;
      return;
    }
    case "venderParaCooperativa": {
      ctx.vendasCooperativa.push({ empresa: empresa.id, produto: d.produto, quantidade: d.quantidade });
      return;
    }
    case "abrirPontoDeVenda": {
      for (let i = 0; i < d.quantidade; i++) {
        const id = idSequencial("pdv", empresa.proximoAtivo++);
        empresa.pontosDeVenda.push({
          id,
          custo: p.pontoDeVenda.custoAbertura,
          depreciacaoAcumulada: 0,
          operaDesdeTick: ctx.tick + prazoEmTicks(p.pontoDeVenda.prazoAberturaDias, ctx),
          vidaUtilMeses: p.pontoDeVenda.vidaUtilMeses,
        });
        movimentarCaixa(empresa, ctx.lancamentos, -p.pontoDeVenda.custoAbertura, "investimento", "abertura de ponto de venda", empresa.id, `mercado:${empresa.mercado}`);
      }
      return;
    }
    case "fecharPontoDeVenda": {
      // Fecha os mais recentes primeiro; o valor contábil restante vira baixa de ativos (sem caixa).
      for (let i = 0; i < d.quantidade; i++) {
        const ativo = empresa.pontosDeVenda.pop()!;
        reconhecerResultado(empresa, "baixa_de_ativos", ativo.custo - ativo.depreciacaoAcumulada);
      }
      return;
    }
  }
}
