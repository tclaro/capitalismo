// Pages are imported `with { type: "text" }` so `bun build --compile` embeds them as strings.
declare module "*.css" {
  const content: string;
  export default content;
}
