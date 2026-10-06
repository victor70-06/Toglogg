-- KUN hvis du allerede har deployet den forrige versjonen (med tabellen "bilder")
-- og har bilder der du vil beholde. Kjør schema.sql først, deretter denne:
--   wrangler d1 execute toglogg-db --remote --file=./migrer-fra-bilder.sql

INSERT OR IGNORE INTO enheter (id, user_id, kategori, type, kode, tittel, sted, dato, notat, data_url, status, opprettet)
SELECT id, user_id, kategori, NULLIF(type, ''), NULLIF(kode, ''), tittel, sted, dato, notat, data_url, CASE WHEN data_url IS NULL THEN 'uten_bilde' ELSE 'venter' END, opprettet
FROM bilder;

-- Når du har sjekket at alt ligger i appen, kan du fjerne den gamle tabellen:
-- DROP TABLE bilder;
