/**
 * Dinheiro e estoque.
 *
 * Todo valor monetário do motor é um **inteiro de centavos**. Assim, "caixa = soma dos lançamentos" e
 * "ativo = passivo + patrimônio líquido" valem com igualdade exata (seção 6.12). Inteiros até 2^53
 * são exatos em `number` (≈ R$ 90 trilhões), muito além de qualquer partida.
 *
 * Quantidades de produto são contínuas (`number` com casas decimais).
 */

/** Valor em centavos (inteiro). */
export type Centavos = number;

/** Arredonda para centavos inteiros, com meio centavo para longe de zero (simétrico). */
export function arredondarCentavos(x: number): Centavos {
  if (!Number.isFinite(x)) throw new RangeError(`arredondarCentavos: valor não finito (${x})`);
  const r = Math.sign(x) * Math.round(Math.abs(x));
  return r === 0 ? 0 : r; // evita -0, que o JSON serializaria como 0 e quebraria a igualdade após ida e volta
}

/**
 * Parcela do dia `dia` (1..`dias`) de um valor mensal inteiro, de forma que a soma das parcelas do
 * mês seja exatamente o valor mensal e as parcelas difiram no máximo 1 centavo entre si.
 */
export function parcelaDoDia(valorMensal: Centavos, dia: number, dias: number): Centavos {
  if (!Number.isInteger(valorMensal) || valorMensal < 0) {
    throw new RangeError(`parcelaDoDia: valor mensal deve ser inteiro não negativo (recebido ${valorMensal})`);
  }
  if (!Number.isInteger(dias) || dias < 1 || !Number.isInteger(dia) || dia < 1 || dia > dias) {
    throw new RangeError(`parcelaDoDia: dia ${dia} fora do mês de ${dias} dias`);
  }
  return Math.floor((valorMensal * dia) / dias) - Math.floor((valorMensal * (dia - 1)) / dias);
}

/**
 * Estoque a custo médio: guarda o **valor total** (não o custo unitário) para que a baixa do
 * último item leve exatamente o valor restante, sem resíduo de arredondamento.
 */
export interface Estoque {
  quantidade: number;
  valor: Centavos;
  /** Qualidade média ponderada pela quantidade (0–100). */
  qualidade: number;
}

/** Fração abaixo da qual uma saída é tratada como baixa total do estoque (ruído de ponto flutuante). */
const TOLERANCIA_BAIXA_TOTAL = 1e-9;

export function estoqueVazio(): Estoque {
  return { quantidade: 0, valor: 0, qualidade: 0 };
}

/** Entrada no estoque: soma quantidade e valor; a qualidade vira a média ponderada. */
export function darEntrada(estoque: Estoque, quantidade: number, valor: Centavos, qualidade: number): void {
  if (!(quantidade >= 0) || !Number.isFinite(quantidade)) throw new RangeError(`darEntrada: quantidade inválida (${quantidade})`);
  if (!Number.isInteger(valor) || valor < 0) throw new RangeError(`darEntrada: valor deve ser centavos inteiros ≥ 0 (${valor})`);
  if (quantidade === 0) {
    estoque.valor += valor;
    return;
  }
  const total = estoque.quantidade + quantidade;
  estoque.qualidade = (estoque.qualidade * estoque.quantidade + qualidade * quantidade) / total;
  estoque.quantidade = total;
  estoque.valor += valor;
}

/**
 * Saída do estoque a custo médio. Devolve o custo (centavos) da quantidade retirada.
 * Retirar tudo (dentro da tolerância) zera o estoque e leva todo o valor restante.
 */
export function darSaida(estoque: Estoque, quantidade: number): Centavos {
  if (!(quantidade >= 0) || !Number.isFinite(quantidade)) throw new RangeError(`darSaida: quantidade inválida (${quantidade})`);
  if (quantidade === 0) return 0;
  if (quantidade > estoque.quantidade * (1 + TOLERANCIA_BAIXA_TOTAL) + Number.EPSILON) {
    throw new RangeError(`darSaida: retirada de ${quantidade} maior que o estoque (${estoque.quantidade})`);
  }
  if (quantidade >= estoque.quantidade * (1 - TOLERANCIA_BAIXA_TOTAL)) {
    const custo = estoque.valor;
    estoque.quantidade = 0;
    estoque.valor = 0;
    estoque.qualidade = 0;
    return custo;
  }
  const custo = arredondarCentavos((estoque.valor * quantidade) / estoque.quantidade);
  estoque.quantidade -= quantidade;
  estoque.valor -= custo;
  return custo;
}
