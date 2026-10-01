# Licenças dos recursos embutidos

Origem e licença de cada recurso que vai dentro do executável (seção 8.1 do documento de design). Nada vem do *Capitalism*. Atualizar a cada recurso novo.

## Fontes, ícones e imagens

| Recurso | Onde é usado | Origem | Licença |
|---|---|---|---|
| Inter (variável, subconjuntos latino e latino estendido) | Toda a interface | [rsms/inter](https://github.com/rsms/inter), pacote `@fontsource-variable/inter` 5.3.0 | SIL Open Font License 1.1 |
| Ícones Lucide | Ícones da interface | [lucide.dev](https://lucide.dev), pacote `lucide-react` 1.49.0 | ISC |
| Ícone do aplicativo (`apps/web/public/icone.svg`) | Aba do navegador | Desenho próprio (barras) | Do projeto |
| Imagens dos produtos: iogurte, sapato (`apps/web/src/assets/produtos/*.webp`) | Cartões e painel dos produtos, telão | Geradas por IA pelo autor do projeto (ferramenta: **a informar**); originais em `assets/produtos/`, recorte e conversão por `bun run imagens` | **A confirmar** com os termos da ferramenta |

## Bibliotecas incluídas no código da interface

| Biblioteca | Licença |
|---|---|
| React e React DOM 19 | MIT |
| valibot 1.5 | MIT |

O runtime do Bun, embutido no executável, é MIT (com partes do JavaScriptCore sob LGPL 2; ver [bun.com/docs/project/licensing](https://bun.com/docs/project/licensing)).
