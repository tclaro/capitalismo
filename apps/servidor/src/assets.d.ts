// Arquivos importados `with { type: "text" }` são embutidos no executável como texto.
declare module "*.sql" {
  const conteudo: string;
  export default conteudo;
}
declare module "*.html" {
  const conteudo: string;
  export default conteudo;
}
