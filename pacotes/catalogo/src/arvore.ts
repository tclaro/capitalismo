/**
 * Árvore de produtos completa (anexo `docs/arvore-de-produtos.md`, base: Capitalism II, Apêndices A e B).
 *
 * Só a **estrutura**: o que é feito de quê, a origem das matérias-primas e a classe de varejo.
 * Números (quantidades, pesos, preços) ficam nas receitas e nos presets. Um teste confere esta
 * lista contra as tabelas do anexo.
 */
import type { NivelProduto } from "@simulador/motor";

export type OrigemMateriaPrima =
  | { readonly tipo: "lavoura"; readonly cultura: string }
  | { readonly tipo: "pecuaria"; readonly rebanhos: readonly string[] }
  | { readonly tipo: "extracao"; readonly instalacao: "mina" | "poco_de_petroleo" | "madeireira" };

export interface ProdutoDaArvore {
  /** Identificador estável (snake_case, sem acentos). */
  readonly id: string;
  /** Nome em português, igual ao do anexo. */
  readonly nome: string;
  /** Nome no manual do Capitalism II, para consulta. */
  readonly nomeManual: string;
  readonly nivel: NivelProduto;
  /** Ids dos insumos (vazio para matéria-prima). */
  readonly insumos: readonly string[];
  /** Classe de varejo; presente só nos produtos vendidos ao consumidor. */
  readonly classe?: string;
  readonly origem?: OrigemMateriaPrima;
}

const lavoura = (id: string, nome: string, nomeManual: string, cultura: string): ProdutoDaArvore => ({
  id,
  nome,
  nomeManual,
  nivel: "materia_prima",
  insumos: [],
  origem: { tipo: "lavoura", cultura },
});

const pecuaria = (
  id: string,
  nome: string,
  nomeManual: string,
  rebanhos: readonly string[],
  varejoDireto: boolean,
): ProdutoDaArvore => ({
  id,
  nome,
  nomeManual,
  nivel: "materia_prima",
  insumos: [],
  origem: { tipo: "pecuaria", rebanhos },
  ...(varejoDireto ? { classe: "Alimentos" } : {}),
});

const extracao = (
  id: string,
  nome: string,
  nomeManual: string,
  instalacao: "mina" | "poco_de_petroleo" | "madeireira",
): ProdutoDaArvore => ({ id, nome, nomeManual, nivel: "materia_prima", insumos: [], origem: { tipo: "extracao", instalacao } });

const semi = (id: string, nome: string, nomeManual: string, insumos: readonly string[]): ProdutoDaArvore => ({
  id,
  nome,
  nomeManual,
  nivel: "semiacabado",
  insumos,
});

const final = (
  classe: string,
  id: string,
  nome: string,
  nomeManual: string,
  insumos: readonly string[],
): ProdutoDaArvore => ({ id, nome, nomeManual, nivel: "final", insumos, classe });

export const ARVORE: readonly ProdutoDaArvore[] = [
  // --- Matérias-primas: lavoura (anexo 2.1) ---
  lavoura("cacau", "Cacau", "Cocoa", "cacau"),
  lavoura("coco", "Coco", "Coconut", "coco"),
  lavoura("milho", "Milho", "Corn", "milho"),
  lavoura("algodao", "Algodão", "Cotton", "algodao"),
  lavoura("fibra_de_linho", "Fibra de linho", "Flax Fiber", "linho"),
  lavoura("uva", "Uva", "Grape", "uva"),
  lavoura("limao", "Limão", "Lemon", "limao"),
  lavoura("borracha", "Borracha", "Rubber", "seringueira"),
  lavoura("morango", "Morango", "Strawberry", "morango"),
  lavoura("acucar", "Açúcar", "Sugar", "cana_de_acucar"),
  lavoura("tabaco", "Tabaco", "Tobacco", "tabaco"),
  lavoura("trigo", "Trigo", "Wheat", "trigo"),

  // --- Matérias-primas: pecuária (anexo 2.2) ---
  pecuaria("carne_bovina_congelada", "Carne bovina congelada", "Frozen Beef", ["gado"], true),
  pecuaria("couro", "Couro", "Leather", ["gado", "porco", "ovelha"], false),
  pecuaria("leite", "Leite", "Milk", ["gado"], false),
  pecuaria("frango_congelado", "Frango congelado", "Frozen Chicken", ["frango"], true),
  pecuaria("ovos", "Ovos", "Eggs", ["frango"], true),
  pecuaria("carne_suina_congelada", "Carne suína congelada", "Frozen Pork", ["porco"], true),
  pecuaria("carne_de_cordeiro_congelada", "Carne de cordeiro congelada", "Frozen Lamb", ["ovelha"], true),
  pecuaria("la", "Lã", "Wool", ["ovelha"], false),

  // --- Matérias-primas: extração (anexo 2.3) ---
  extracao("minerio_de_ferro", "Minério de ferro", "Iron Ore", "mina"),
  extracao("carvao", "Carvão", "Coal", "mina"),
  extracao("aluminio", "Alumínio", "Aluminum", "mina"),
  extracao("silica", "Sílica", "Silica", "mina"),
  extracao("ouro", "Ouro", "Gold", "mina"),
  extracao("prata", "Prata", "Silver", "mina"),
  extracao("materiais_quimicos", "Materiais químicos", "Chemical Materials", "mina"),
  extracao("petroleo", "Petróleo", "Oil", "poco_de_petroleo"),
  extracao("madeira", "Madeira", "Timber", "madeireira"),

  // --- Semiacabados (anexo 3) ---
  semi("aco", "Aço", "Steel", ["carvao", "minerio_de_ferro"]),
  semi("acido_citrico", "Ácido cítrico", "Citric Acid", ["limao"]),
  semi("carroceria", "Carroceria", "Car Body", ["vidro", "plastico", "aco"]),
  semi("componentes_eletronicos", "Componentes eletrônicos", "Electronic Components", ["materiais_quimicos", "silicio", "aco"]),
  semi("corante", "Corante", "Dyestuff", ["petroleo", "madeira"]),
  semi("cpu", "CPU", "CPU", ["silicio"]),
  semi("farinha", "Farinha", "Flour", ["trigo"]),
  semi("motor", "Motor", "Engine", ["aco"]),
  semi("oleo_de_coco", "Óleo de coco", "Coconut Oil", ["coco"]),
  semi("oleo_de_germen_de_trigo", "Óleo de gérmen de trigo", "Wheat Germ Oil", ["trigo"]),
  semi("papel", "Papel", "Paper", ["madeira"]),
  semi("plastico", "Plástico", "Plastic", ["petroleo"]),
  semi("poliester", "Poliéster", "Polyester", ["materiais_quimicos", "petroleo"]),
  semi("roda_e_pneu", "Roda e pneu", "Wheel & Tire", ["borracha", "aco"]),
  semi("silicio", "Silício", "Silicon", ["silica"]),
  semi("tecido", "Tecido", "Textiles", ["algodao"]),
  semi("tecido_de_linho", "Tecido de linho", "Linen", ["fibra_de_linho"]),
  semi("vidro", "Vidro", "Glass", ["silica"]),
  semi("xarope_de_milho", "Xarope de milho", "Corn Syrup", ["milho"]),

  // --- Produtos finais (anexo 4) ---
  final("Alimentos", "pao", "Pão", "Bread", ["farinha"]),
  final("Alimentos", "milho_enlatado", "Milho enlatado", "Canned Corn", ["milho"]),
  final("Alimentos", "sopa_enlatada", "Sopa enlatada", "Canned Soup", ["frango_congelado"]),
  final("Alimentos", "flocos_de_milho", "Flocos de milho", "Corn Flakes", ["milho", "acucar"]),

  final("Bebidas", "leite_engarrafado", "Leite engarrafado", "Bottled Milk", ["leite", "vidro"]),
  final("Bebidas", "refrigerante_de_cola", "Refrigerante de cola", "Cola", ["acucar", "aluminio"]),
  final("Bebidas", "suco_de_uva", "Suco de uva", "Grape Juice", ["uva", "acido_citrico", "vidro"]),
  final("Bebidas", "vinho", "Vinho", "Wine", ["uva", "vidro"]),

  final("Sobremesas", "bolo", "Bolo", "Cakes", ["ovos", "cacau", "farinha"]),
  final("Sobremesas", "sorvete", "Sorvete", "Ice-cream", ["leite", "morango", "acucar"]),
  final("Sobremesas", "iogurte", "Iogurte", "Yogurt", ["leite", "morango", "acido_citrico"]),

  final("Snacks", "barra_de_chocolate", "Barra de chocolate", "Chocolate Bar", ["leite", "cacau"]),
  final("Snacks", "biscoito", "Biscoito", "Cookies", ["acucar", "farinha"]),
  final("Snacks", "snack_de_frutas", "Snack de frutas", "Fruit Snacks", ["morango"]),
  final("Snacks", "chiclete", "Chiclete", "Chewing Gum", ["acucar", "xarope_de_milho"]),

  final("Higiene pessoal", "locao_corporal", "Loção corporal", "Body Lotion", ["materiais_quimicos", "oleo_de_coco", "plastico"]),
  final("Higiene pessoal", "xampu", "Xampu", "Shampoo", ["materiais_quimicos", "plastico"]),
  final("Higiene pessoal", "sabonete", "Sabonete", "Soap", ["acido_citrico", "oleo_de_coco", "papel"]),

  final("Limpeza", "detergente", "Detergente", "Detergent", ["materiais_quimicos", "acido_citrico", "plastico"]),
  final("Limpeza", "creme_dental", "Creme dental", "Toothpaste", ["materiais_quimicos", "plastico"]),
  final("Limpeza", "limpador_sanitario", "Limpador sanitário", "Toilet Cleaner", ["materiais_quimicos", "plastico"]),

  final("Cosméticos", "sombra", "Sombra", "Eye Shadow", ["materiais_quimicos", "plastico"]),
  final("Cosméticos", "tintura_de_cabelo", "Tintura de cabelo", "Hair Color", ["corante", "plastico", "oleo_de_germen_de_trigo"]),
  final("Cosméticos", "batom", "Batom", "Lipstick", ["corante", "plastico", "oleo_de_germen_de_trigo"]),
  final("Cosméticos", "perfume", "Perfume", "Perfume", ["materiais_quimicos", "vidro"]),

  final("Medicamentos", "antigripal", "Antigripal", "Cold Tablets", ["materiais_quimicos", "plastico"]),
  final("Medicamentos", "xarope_para_tosse", "Xarope para tosse", "Cough Syrup", ["materiais_quimicos", "plastico"]),
  final("Medicamentos", "analgesico", "Analgésico", "Headache Pills", ["materiais_quimicos", "plastico"]),

  final("Vestuário", "jaqueta_de_couro", "Jaqueta de couro", "Leather Jacket", ["couro", "tecido"]),
  final("Vestuário", "jeans", "Jeans", "Jean", ["corante", "tecido"]),
  final("Vestuário", "sueter", "Suéter", "Sweater", ["la", "corante"]),

  final("Calçados", "sandalia", "Sandália", "Sandals", ["borracha"]),
  final("Calçados", "sapato", "Sapato", "Shoes", ["couro", "tecido"]),
  final("Calçados", "meias", "Meias", "Socks", ["la"]),
  final("Calçados", "tenis", "Tênis", "Sport Shoes", ["algodao", "borracha", "poliester"]),

  final("Artigos de couro", "bolsa", "Bolsa", "Leather Bag", ["couro", "tecido"]),
  final("Artigos de couro", "cinto", "Cinto", "Leather Belt", ["couro", "aco"]),
  final("Artigos de couro", "pasta_executiva", "Pasta executiva", "Leather Briefcase", ["couro", "tecido"]),
  final("Artigos de couro", "carteira", "Carteira", "Leather Wallet", ["couro"]),

  final("Móveis", "cama", "Cama", "Bed", ["madeira"]),
  final("Móveis", "cadeira", "Cadeira", "Chair", ["madeira", "tecido"]),
  final("Móveis", "sofa", "Sofá", "Sofa", ["couro", "algodao", "madeira"]),

  final("Joias", "colar_de_prata", "Colar de prata", "Silver Necklace", ["prata"]),
  final("Joias", "anel_de_ouro", "Anel de ouro", "Gold Ring", ["ouro"]),

  final("Relógios", "relogio_elegante", "Relógio elegante", "Elegant Watch", ["vidro", "aco"]),
  final("Relógios", "relogio_esportivo", "Relógio esportivo", "Sports Watch", ["componentes_eletronicos", "vidro", "plastico"]),

  final("Esportes", "mochila", "Mochila", "Backpack", ["tecido_de_linho", "poliester"]),
  final("Esportes", "taco_de_golfe", "Taco de golfe", "Golf Club", ["madeira", "aco"]),
  final("Esportes", "patins", "Patins", "In-line Skates", ["couro", "borracha", "aco"]),

  final("Tabaco", "cigarro", "Cigarro", "Cigarettes", ["tabaco", "papel"]),
  final("Tabaco", "charuto", "Charuto", "Cigars", ["tabaco", "papel"]),

  final("Eletrônicos", "ar_condicionado", "Ar-condicionado", "Air Conditioner", ["componentes_eletronicos", "aco"]),
  final("Eletrônicos", "aparelho_de_som", "Aparelho de som", "Hi-fi", ["aluminio", "componentes_eletronicos", "aco"]),
  final("Eletrônicos", "micro_ondas", "Micro-ondas", "Microwave Oven", ["componentes_eletronicos", "vidro", "plastico"]),
  final("Eletrônicos", "televisor", "Televisor", "Television", ["componentes_eletronicos", "vidro", "plastico"]),
  final("Eletrônicos", "dvd_player", "DVD player", "DVD Player", ["aluminio", "componentes_eletronicos"]),
  final("Eletrônicos", "celular", "Celular", "Mobile Phone", ["componentes_eletronicos", "plastico"]),
  final("Eletrônicos", "filmadora", "Filmadora", "Video Camera", ["componentes_eletronicos", "vidro", "plastico"]),
  final("Eletrônicos", "videocassete", "Videocassete", "Video Recorder", ["componentes_eletronicos", "vidro", "aco"]),

  final("Computadores", "desktop", "Desktop", "Desktop Computer", ["cpu", "componentes_eletronicos", "aco"]),
  final("Computadores", "notebook", "Notebook", "Notebook Computer", ["cpu", "componentes_eletronicos"]),
  final("Computadores", "pda", "PDA", "Palm Computer", ["cpu", "componentes_eletronicos", "plastico"]),
  final("Computadores", "impressora", "Impressora", "Printer", ["componentes_eletronicos", "plastico"]),

  final("Fotografia", "camera", "Câmera", "Camera", ["componentes_eletronicos", "vidro", "plastico"]),
  final("Fotografia", "filme_fotografico", "Filme fotográfico", "Camera Film", ["materiais_quimicos", "prata", "plastico"]),

  final("Brinquedos e videogames", "videogame_portatil", "Videogame portátil", "Hand-held Game Device", ["componentes_eletronicos", "vidro", "plastico"]),
  final("Brinquedos e videogames", "console_de_videogame", "Console de videogame", "Video Game Console", ["componentes_eletronicos", "plastico"]),
  final("Brinquedos e videogames", "carrinho_de_corrida", "Carrinho de corrida", "Toy Racing Car", ["componentes_eletronicos", "plastico"]),
  final("Brinquedos e videogames", "boneca", "Boneca", "Toy Doll", ["algodao", "corante", "tecido"]),

  final("Automóveis", "carro", "Carro", "Car", ["carroceria", "motor", "roda_e_pneu"]),
  final("Automóveis", "motocicleta", "Motocicleta", "Motorcycle", ["motor", "aco", "roda_e_pneu"]),
];

/** Índice da árvore por id. Lança erro se o id não existir. */
export function produtoDaArvore(id: string): ProdutoDaArvore {
  const p = ARVORE.find((x) => x.id === id);
  if (!p) throw new Error(`produto "${id}" não existe na árvore`);
  return p;
}
