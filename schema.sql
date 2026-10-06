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

-- En "enhet" er ett konkret lok eller én konkret motorvogn, f.eks. koden
-- "72-06" innenfor typen "BM 72". Selve bildet ligger i tabellen bildedata.
-- Enheten teller som SETT først når bildet er kontrollert og godkjent.
--   status: uten_bilde | venter | godkjent | avvist
CREATE TABLE IF NOT EXISTS enheter (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  kategori TEXT NOT NULL,
  type TEXT,
  kode TEXT,
  tittel TEXT,
  sted TEXT,
  dato TEXT,
  notat TEXT,
  data_url TEXT,               -- kun for bilder fra den aller første versjonen
  bilde_key TEXT,              -- versjonsmerke for bildet (byttes ved ny opplasting)
  status TEXT NOT NULL DEFAULT 'uten_bilde',
  avvist_grunn TEXT,
  vurdert_av INTEGER,
  vurdert_tid INTEGER,
  opprettet INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Bildefilene, én per enhet. Egen tabell så listene går raskt.
CREATE TABLE IF NOT EXISTS bildedata (
  enhet_id TEXT PRIMARY KEY,
  innhold BLOB NOT NULL,
  content_type TEXT NOT NULL,
  storrelse INTEGER NOT NULL,
  FOREIGN KEY (enhet_id) REFERENCES enheter(id)
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_enheter_user ON enheter(user_id);
CREATE INDEX IF NOT EXISTS idx_enheter_user_type ON enheter(user_id, kategori, type);
CREATE INDEX IF NOT EXISTS idx_enheter_status ON enheter(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_enheter_unik ON enheter(user_id, kategori, type, kode);
