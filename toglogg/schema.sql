-- Kjør denne mot D1-databasen din:
-- wrangler d1 execute toglogg-db --remote --file=./schema.sql

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS bilder (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  data_url TEXT NOT NULL,
  tittel TEXT NOT NULL,
  kategori TEXT NOT NULL,
  type TEXT,
  kode TEXT,
  sted TEXT,
  dato TEXT,
  notat TEXT,
  opprettet INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_bilder_user ON bilder(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
