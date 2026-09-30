-- Esquema inicial (fase 1, entrega 2). Seções 9.7 e 12 do documento de design.

-- Metadados da sala: configuração, vagas, membros, prontos, status (muda pouco).
CREATE TABLE salas (
  id            TEXT PRIMARY KEY,
  codigo        TEXT NOT NULL UNIQUE,
  status        TEXT NOT NULL,
  tick          INTEGER NOT NULL,
  dados_json    TEXT NOT NULL,
  criada_em     TEXT NOT NULL,
  atualizada_em TEXT NOT NULL
);

-- Estado atual do motor (sobrescrito a cada tick) e o acumulador semanal do histórico.
CREATE TABLE estado_atual (
  sala_id         TEXT PRIMARY KEY REFERENCES salas(id) ON DELETE CASCADE,
  tick            INTEGER NOT NULL,
  estado_json     TEXT NOT NULL,
  acumulador_json TEXT NOT NULL
);

-- Estados de referência: mês 0 = partida no início (base do replay); demais = fins de mês.
CREATE TABLE estado_fim_mes (
  sala_id     TEXT NOT NULL REFERENCES salas(id) ON DELETE CASCADE,
  mes         INTEGER NOT NULL,
  estado_json TEXT NOT NULL,
  PRIMARY KEY (sala_id, mes)
);

-- Somente inclusão: entradas exatamente como foram passadas ao motor em cada tick (log de replay).
CREATE TABLE entradas_tick (
  sala_id       TEXT NOT NULL REFERENCES salas(id) ON DELETE CASCADE,
  tick          INTEGER NOT NULL,
  entradas_json TEXT NOT NULL,
  versao_motor  TEXT NOT NULL,
  PRIMARY KEY (sala_id, tick)
);

-- Somente inclusão: decisões recebidas dos alunos; aplicada_no_tick NULL = ainda na fila.
CREATE TABLE decisoes (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  sala_id          TEXT NOT NULL REFERENCES salas(id) ON DELETE CASCADE,
  empresa          TEXT NOT NULL,
  membro           TEXT NOT NULL,
  id_comando       TEXT NOT NULL,
  decisao_json     TEXT NOT NULL,
  criada_em        TEXT NOT NULL,
  aplicada_no_tick INTEGER
);
CREATE INDEX decisoes_pendentes ON decisoes (sala_id, aplicada_no_tick);

-- Comandos já executados (idempotência): o mesmo id devolve a mesma resposta, mesmo após reinício.
CREATE TABLE comandos (
  sala_id       TEXT NOT NULL REFERENCES salas(id) ON DELETE CASCADE,
  id_comando    TEXT NOT NULL,
  resposta_json TEXT NOT NULL,
  criado_em     TEXT NOT NULL,
  PRIMARY KEY (sala_id, id_comando)
);

-- Histórico para gráficos (seção 9.7): semanal por oferta e mensal por empresa.
CREATE TABLE historico_oferta_semanal (
  sala_id    TEXT NOT NULL REFERENCES salas(id) ON DELETE CASCADE,
  semana     INTEGER NOT NULL,
  empresa    TEXT NOT NULL,
  produto    TEXT NOT NULL,
  dados_json TEXT NOT NULL,
  PRIMARY KEY (sala_id, semana, empresa, produto)
);

CREATE TABLE historico_empresa_mensal (
  sala_id         TEXT NOT NULL REFERENCES salas(id) ON DELETE CASCADE,
  mes             INTEGER NOT NULL,
  empresa         TEXT NOT NULL,
  fechamento_json TEXT NOT NULL,
  pontuacao       REAL NOT NULL,
  PRIMARY KEY (sala_id, mes, empresa)
);

-- Auditoria: tempo de gravação de cada tick no banco.
CREATE TABLE log_ticks (
  sala_id    TEXT NOT NULL REFERENCES salas(id) ON DELETE CASCADE,
  tick       INTEGER NOT NULL,
  duracao_ms REAL NOT NULL,
  criado_em  TEXT NOT NULL
);

-- Configuração do servidor (hash da chave de professor, etc.).
CREATE TABLE configuracao_servidor (
  chave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);
