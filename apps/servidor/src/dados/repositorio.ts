/**
 * Repositório: grava e carrega as salas no SQLite (seção 9.7).
 *
 * O que muda a cada tick é gravado numa única transação (`gravarTick`): estado atual, entradas do
 * tick (log de replay), decisões aplicadas, históricos e, no fim do mês, o estado de referência. Uma
 * queda do servidor perde no máximo o tick em processamento.
 */
import type { Database } from "bun:sqlite";
import { ehFimDoMes } from "@simulador/compartilhado";
import { calcularPontuacao, type EstadoPartida, type FechamentoMensal, migrarEstado, type ResultadoTick, VERSAO_MOTOR } from "@simulador/motor";
import type { AcumuladorSemanal, RegistroSemanal } from "../sala/historico";
import type { DadosSala, DecisaoNaFila, Resposta, Sala } from "../sala/sala";

/** Metadados da sala gravados em `salas.dados_json` (o resto vem de outras tabelas). */
type MetadadosSala = Omit<DadosSala, "estado" | "fila" | "fechamentos" | "acumulador">;

const agora = () => new Date().toISOString();

export interface SalaCarregada {
  dados: DadosSala;
  comandos: [string, Resposta][];
}

export class Repositorio {
  constructor(readonly db: Database) {}

  /** Grava os metadados da sala; na preparação (tick 0) grava também o estado, base do replay. */
  gravarSala(sala: Sala): void {
    const d = sala.dados();
    const metadados: MetadadosSala = {
      id: d.id,
      codigo: d.codigo,
      semente: d.semente,
      config: d.config,
      status: d.status,
      motivoPausa: d.motivoPausa,
      vagas: d.vagas,
      membros: d.membros,
      prontos: d.prontos,
      proximoMembro: d.proximoMembro,
    };
    this.db.transaction(() => {
      this.db
        .query(
          `INSERT INTO salas (id, codigo, status, tick, dados_json, criada_em, atualizada_em)
           VALUES ($id, $codigo, $status, $tick, $dados, $agora, $agora)
           ON CONFLICT (id) DO UPDATE SET status = excluded.status, tick = excluded.tick,
             dados_json = excluded.dados_json, atualizada_em = excluded.atualizada_em`,
        )
        .run({ id: d.id, codigo: d.codigo, status: d.status, tick: d.estado.tick, dados: JSON.stringify(metadados), agora: agora() });
      if (d.estado.tick === 0) {
        this.gravarEstadoAtual(d.id, d.estado, d.acumulador);
        this.db
          .query("INSERT INTO estado_fim_mes (sala_id, mes, estado_json) VALUES (?, 0, ?) ON CONFLICT (sala_id, mes) DO UPDATE SET estado_json = excluded.estado_json")
          .run(d.id, JSON.stringify(d.estado));
      }
    })();
  }

  private gravarEstadoAtual(salaId: string, estado: EstadoPartida, acumulador: AcumuladorSemanal): void {
    this.db
      .query(
        `INSERT INTO estado_atual (sala_id, tick, estado_json, acumulador_json) VALUES (?, ?, ?, ?)
         ON CONFLICT (sala_id) DO UPDATE SET tick = excluded.tick, estado_json = excluded.estado_json, acumulador_json = excluded.acumulador_json`,
      )
      .run(salaId, estado.tick, JSON.stringify(estado), JSON.stringify(acumulador));
  }

  /**
   * Grava tudo o que o tick produziu, numa transação. Chamado antes de a sala atualizar a memória:
   * `sala.fila` ainda contém as decisões que entraram neste tick.
   */
  gravarTick(sala: Sala, resultado: ResultadoTick, semana: RegistroSemanal[] | null, acumulador: AcumuladorSemanal): void {
    const tick = resultado.estado.tick;
    const n = resultado.estado.parametros.ticksPorMes;
    const inicio = performance.now();
    this.db.transaction(() => {
      this.gravarEstadoAtual(sala.id, resultado.estado, acumulador);
      this.db.query("UPDATE salas SET tick = ?, atualizada_em = ? WHERE id = ?").run(tick, agora(), sala.id);
      this.db
        .query("INSERT INTO entradas_tick (sala_id, tick, entradas_json, versao_motor) VALUES (?, ?, ?, ?)")
        .run(sala.id, tick, JSON.stringify({ decisoes: sala.fila.map((f) => f.decisao) }), VERSAO_MOTOR);
      this.db.query("UPDATE decisoes SET aplicada_no_tick = ? WHERE sala_id = ? AND aplicada_no_tick IS NULL").run(tick, sala.id);
      if (semana) {
        const inserir = this.db.query(
          "INSERT INTO historico_oferta_semanal (sala_id, semana, empresa, produto, dados_json) VALUES (?, ?, ?, ?, ?) ON CONFLICT DO UPDATE SET dados_json = excluded.dados_json",
        );
        for (const r of semana) inserir.run(sala.id, r.semana, r.empresa, r.produto, JSON.stringify(r));
      }
      if (resultado.fechamentos.length > 0) {
        const inserir = this.db.query(
          "INSERT INTO historico_empresa_mensal (sala_id, mes, empresa, fechamento_json, pontuacao) VALUES (?, ?, ?, ?, ?) ON CONFLICT DO UPDATE SET fechamento_json = excluded.fechamento_json, pontuacao = excluded.pontuacao",
        );
        for (const { empresa, fechamento } of resultado.fechamentos) {
          inserir.run(sala.id, fechamento.mes, empresa, JSON.stringify(fechamento), pontuacaoNoEstado(resultado.estado, sala, empresa));
        }
      }
      if (ehFimDoMes(tick, n)) {
        this.db
          .query("INSERT INTO estado_fim_mes (sala_id, mes, estado_json) VALUES (?, ?, ?) ON CONFLICT DO UPDATE SET estado_json = excluded.estado_json")
          .run(sala.id, tick / n, JSON.stringify(resultado.estado));
      }
      // Tempo de gravação do tick (o custo a vigiar: ~72 KB de estado por sala por tick).
      this.db.query("INSERT INTO log_ticks (sala_id, tick, duracao_ms, criado_em) VALUES (?, ?, ?, ?)").run(sala.id, tick, performance.now() - inicio, agora());
    })();
  }

  gravarDecisao(sala: Sala, item: DecisaoNaFila): void {
    this.db
      .query("INSERT INTO decisoes (sala_id, empresa, membro, id_comando, decisao_json, criada_em) VALUES (?, ?, ?, ?, ?, ?)")
      .run(sala.id, item.empresa, item.membro, item.idComando, JSON.stringify(item.decisao), agora());
  }

  gravarComando(sala: Sala, idComando: string, resposta: Resposta): void {
    this.db
      .query("INSERT INTO comandos (sala_id, id_comando, resposta_json, criado_em) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING")
      .run(sala.id, idComando, JSON.stringify(resposta), agora());
  }

  /** Todas as salas gravadas, prontas para `Sala.retomar`. */
  carregarSalas(): SalaCarregada[] {
    const salas = this.db.query("SELECT id, dados_json FROM salas ORDER BY criada_em, id").all() as { id: string; dados_json: string }[];
    return salas.map(({ id, dados_json }) => {
      const meta = JSON.parse(dados_json) as MetadadosSala;
      const atual = this.db.query("SELECT estado_json, acumulador_json FROM estado_atual WHERE sala_id = ?").get(id) as {
        estado_json: string;
        acumulador_json: string;
      } | null;
      if (!atual) throw new Error(`sala ${id} sem estado gravado`);
      const fila = (
        this.db.query("SELECT empresa, membro, id_comando, decisao_json FROM decisoes WHERE sala_id = ? AND aplicada_no_tick IS NULL ORDER BY id").all(id) as {
          empresa: string;
          membro: string;
          id_comando: string;
          decisao_json: string;
        }[]
      ).map((r) => ({ empresa: r.empresa, membro: r.membro, idComando: r.id_comando, decisao: JSON.parse(r.decisao_json) }));
      const fechamentos: Record<string, FechamentoMensal[]> = {};
      for (const r of this.db.query("SELECT empresa, fechamento_json FROM historico_empresa_mensal WHERE sala_id = ? ORDER BY mes, empresa").all(id) as {
        empresa: string;
        fechamento_json: string;
      }[]) {
        (fechamentos[r.empresa] ??= []).push(JSON.parse(r.fechamento_json));
      }
      const comandos = (this.db.query("SELECT id_comando, resposta_json FROM comandos WHERE sala_id = ?").all(id) as { id_comando: string; resposta_json: string }[]).map(
        (r) => [r.id_comando, JSON.parse(r.resposta_json)] as [string, Resposta],
      );
      return {
        dados: { ...meta, estado: migrarEstado(JSON.parse(atual.estado_json)), acumulador: JSON.parse(atual.acumulador_json), fila, fechamentos },
        comandos,
      };
    });
  }

  /** Séries do histórico semanal (gráficos); só da empresa informada, se houver. */
  historicoSemanal(salaId: string, empresa?: string): RegistroSemanal[] {
    const linhas = (
      empresa
        ? this.db.query("SELECT dados_json FROM historico_oferta_semanal WHERE sala_id = ? AND empresa = ? ORDER BY semana, produto").all(salaId, empresa)
        : this.db.query("SELECT dados_json FROM historico_oferta_semanal WHERE sala_id = ? ORDER BY semana, empresa, produto").all(salaId)
    ) as { dados_json: string }[];
    return linhas.map((l) => JSON.parse(l.dados_json));
  }

  /** Estado de referência de um mês (0 = início da partida). */
  estadoDoMes(salaId: string, mes: number): EstadoPartida | null {
    const r = this.db.query("SELECT estado_json FROM estado_fim_mes WHERE sala_id = ? AND mes = ?").get(salaId, mes) as { estado_json: string } | null;
    return r ? migrarEstado(JSON.parse(r.estado_json)) : null;
  }

  /** Entradas gravadas de cada tick, em ordem (replay). */
  entradasDosTicks(salaId: string, deTick = 1): { tick: number; entradas: { decisoes: unknown[] } }[] {
    return (this.db.query("SELECT tick, entradas_json FROM entradas_tick WHERE sala_id = ? AND tick >= ? ORDER BY tick").all(salaId, deTick) as { tick: number; entradas_json: string }[]).map(
      (r) => ({ tick: r.tick, entradas: JSON.parse(r.entradas_json) }),
    );
  }

  excluirSala(salaId: string): void {
    this.db.query("DELETE FROM salas WHERE id = ?").run(salaId);
  }

  lerConfiguracao(chave: string): string | null {
    const r = this.db.query("SELECT valor FROM configuracao_servidor WHERE chave = ?").get(chave) as { valor: string } | null;
    return r?.valor ?? null;
  }

  gravarConfiguracao(chave: string, valor: string): void {
    this.db.query("INSERT INTO configuracao_servidor (chave, valor) VALUES (?, ?) ON CONFLICT (chave) DO UPDATE SET valor = excluded.valor").run(chave, valor);
  }

  /** Esvazia o WAL no arquivo principal (ao pausar ou encerrar uma sala). */
  checkpoint(): void {
    this.db.exec("PRAGMA wal_checkpoint(TRUNCATE);");
  }
}

/** Pontuação da empresa no estado depois do tick (a sala ainda está com o estado anterior). */
function pontuacaoNoEstado(estado: EstadoPartida, sala: Sala, empresa: string): number {
  return calcularPontuacao(estado, estado.empresas.find((e) => e.id === empresa)!, sala.config.criterio);
}
