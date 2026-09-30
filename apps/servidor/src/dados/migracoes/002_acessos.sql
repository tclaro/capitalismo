-- Acesso às salas (fase 1, entrega 3). Seção 9.6 do documento de design.

-- PIN do professor (hash) e token do telão (somente leitura, revogável; guardado em claro porque o
-- professor precisa reabrir o link a qualquer momento).
CREATE TABLE acessos_sala (
  sala_id     TEXT PRIMARY KEY REFERENCES salas(id) ON DELETE CASCADE,
  pin_hash    TEXT NOT NULL,
  token_telao TEXT NOT NULL
);

-- Sessões de aluno e professor (cookie). Só o hash SHA-256 do token é gravado.
CREATE TABLE sessoes (
  token_hash TEXT PRIMARY KEY,
  sala_id    TEXT NOT NULL REFERENCES salas(id) ON DELETE CASCADE,
  papel      TEXT NOT NULL CHECK (papel IN ('aluno', 'professor')),
  membro     TEXT,
  criada_em  INTEGER NOT NULL,
  expira_em  INTEGER NOT NULL
);
CREATE INDEX sessoes_por_sala ON sessoes (sala_id);

-- Limite de tentativas (PIN, chave, código de sala): persistido para sobreviver a reinícios.
CREATE TABLE tentativas (
  chave         TEXT PRIMARY KEY,
  falhas        INTEGER NOT NULL,
  janela_inicio INTEGER NOT NULL,
  bloqueado_ate INTEGER NOT NULL
);
