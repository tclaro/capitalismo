/**
 * Imagens dos produtos (originais em `assets/produtos/`, preparadas por `bun run imagens`). Produto
 * sem imagem mostra um pictograma neutro com as iniciais, para nenhum preset ficar sem figura.
 */
import iogurte from "../assets/produtos/iogurte.webp";
import sapato from "../assets/produtos/sapato.webp";

export const IMAGENS_DOS_PRODUTOS: Readonly<Record<string, string>> = { iogurte, sapato };

export function ImagemDoProduto({ produto, nome }: { produto: string; nome: string }) {
  const src = IMAGENS_DOS_PRODUTOS[produto];
  if (src) return <img className="j-imagem" src={src} alt="" draggable={false} />;
  return (
    <svg className="j-imagem j-imagem-vazia" viewBox="0 0 100 100" aria-hidden="true">
      <rect x="14" y="14" width="72" height="72" rx="14" fill="none" stroke="currentColor" strokeOpacity=".35" strokeWidth="3" strokeDasharray="6 5" />
      <text x="50" y="58" textAnchor="middle" fontSize="26" fontWeight="700" fill="currentColor" fillOpacity=".45">
        {nome.slice(0, 2)}
      </text>
    </svg>
  );
}
