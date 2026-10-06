-- KUN hvis du allerede har en database med tabellen "enheter" fra forrige versjon.
-- Legger til kolonnene for R2-lagring og godkjenning.
--   wrangler d1 execute toglogg-db --remote --file=./migrer-til-godkjenning.sql
-- (Kjør den bare én gang – den feiler hvis kolonnene allerede finnes.)

ALTER TABLE enheter ADD COLUMN bilde_key TEXT;
ALTER TABLE enheter ADD COLUMN status TEXT NOT NULL DEFAULT 'uten_bilde';
ALTER TABLE enheter ADD COLUMN avvist_grunn TEXT;
ALTER TABLE enheter ADD COLUMN vurdert_av INTEGER;
ALTER TABLE enheter ADD COLUMN vurdert_tid INTEGER;

-- Bilder som allerede er lastet opp må også kontrolleres.
UPDATE enheter SET status = 'venter' WHERE data_url IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_enheter_status ON enheter(status);
