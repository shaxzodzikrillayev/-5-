-- =====================================================================
--  Схема базы данных системы управления дежурством класса.
--  Схема переносима: SQLite (по умолчанию) и PostgreSQL (DATABASE_URL).
--  Идентификаторы — текстовые (генерируются приложением), даты — ISO-8601 строки.
-- =====================================================================

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  first_name    TEXT NOT NULL,
  last_name     TEXT NOT NULL,
  email         TEXT NOT NULL,
  login         TEXT,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL,
  student_id    TEXT,
  is_active     INTEGER NOT NULL DEFAULT 1,
  last_login_at TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_idx ON users (LOWER(email));

CREATE TABLE IF NOT EXISTS students (
  id         TEXT PRIMARY KEY,
  user_id    TEXT,
  first_name TEXT NOT NULL,
  last_name  TEXT NOT NULL,
  class_name TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active  INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS students_user_idx ON students (user_id);

CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  csrf_token TEXT NOT NULL,
  user_agent TEXT,
  ip         TEXT,
  created_at TEXT NOT NULL,
  last_seen  TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS duties (
  id         TEXT PRIMARY KEY,
  duty_date  TEXT NOT NULL,
  student_id TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'scheduled',
  comment    TEXT,
  assigned_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS duties_date_student_idx ON duties (duty_date, student_id);
CREATE INDEX IF NOT EXISTS duties_student_idx ON duties (student_id);
CREATE INDEX IF NOT EXISTS duties_date_idx ON duties (duty_date);

CREATE TABLE IF NOT EXISTS duty_records (
  id             TEXT PRIMARY KEY,
  duty_id        TEXT NOT NULL,
  student_id     TEXT NOT NULL,
  duty_date      TEXT NOT NULL,
  status         TEXT NOT NULL,
  comment        TEXT,
  changed_by     TEXT,
  changed_by_role TEXT,
  source         TEXT NOT NULL DEFAULT 'manual',
  created_at     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS replacements (
  id                     TEXT PRIMARY KEY,
  duty_id                TEXT NOT NULL,
  duty_date              TEXT NOT NULL,
  original_student_id    TEXT NOT NULL,
  replacement_student_id TEXT NOT NULL,
  reason                 TEXT,
  created_by             TEXT,
  created_at             TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS replacements_duty_idx ON replacements (duty_id);

CREATE TABLE IF NOT EXISTS audit_logs (
  id          TEXT PRIMARY KEY,
  actor_id    TEXT,
  actor_name  TEXT,
  actor_role  TEXT,
  action      TEXT NOT NULL,
  entity_type TEXT,
  entity_id   TEXT,
  summary     TEXT,
  before_json TEXT,
  after_json  TEXT,
  comment     TEXT,
  ip          TEXT,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS app_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT,
  updated_at TEXT NOT NULL
);