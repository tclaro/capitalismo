/**
 * Processo auxiliar do teste de queda: `rodar` cria uma sala e deixa o relógio real rodando até ser
 * morto; `verificar` reabre o banco, retoma as salas e imprime o resultado em JSON.
 * Uso: bun sala-viva.ts <rodar|verificar> <caminho-do-banco>
 */
import { ConfigSala, validar } from "@simulador/compartilhado";
import { abrirBanco } from "../../src/dados/banco";
import { carregarSalas, ObservadorPersistente } from "../../src/dados/persistencia";
import { Repositorio } from "../../src/dados/repositorio";
import { agendadorReal } from "../../src/sala/relogio";
import { Sala } from "../../src/sala/sala";

const [modo, caminho] = [process.argv[2], process.argv[3]!];
const db = abrirBanco(caminho);
const repositorio = new Repositorio(db);

if (modo === "rodar") {
  const config = validar(ConfigSala, { presetId: "teste/congelado", vagasPorMercado: 2, segundosPorTick: 0.5, robosNasVagasVazias: "premium" });
  if (!config.ok) throw new Error(config.erro);
  const sala = Sala.criar({ id: "sala_viva", codigo: "VIVA1", semente: "queda", config: { ...config.valor, segundosPorTick: 0.5 } }, agendadorReal, new ObservadorPersistente(repositorio));
  const r = sala.entrarAluno("Ana", { tipo: "nova", empresa: "emp_01", nome: "Alfa", cor: "azul" });
  if (!r.ok) throw new Error(r.motivo);
  sala.decidir("cmd-inicial-01", r.membro.id, [{ tipo: "produto", produto: "leite_engarrafado", preco: 600, compraMensal: 30_000 }]);
  // Intervalo curto para o teste (o mínimo da interface é 0,5 s; aqui o relógio é acelerado direto).
  sala.config = { ...sala.config, segundosPorTick: 0.02 };
  sala.comandoRelogio("cmd-inicial-02", 0, "iniciar");
  // Uma decisão chega a cada 5 ticks: haverá decisões pendentes no momento da queda.
  setInterval(() => sala.decidir(`cmd-${crypto.randomUUID()}`, r.membro.id, [{ tipo: "produto", produto: "leite_engarrafado", preco: 590 + (sala.estado.tick % 20) }]), 100);
  console.log("rodando");
} else {
  const salas = carregarSalas(repositorio, agendadorReal, () => new ObservadorPersistente(repositorio));
  const integridade = (db.query("PRAGMA integrity_check").get() as { integrity_check: string }).integrity_check;
  const s = salas[0]!;
  console.log(JSON.stringify({ salas: salas.length, status: s.status, motivo: s.motivoPausa, tick: s.estado.tick, fila: s.fila.length, integridade }));
  db.close();
}
