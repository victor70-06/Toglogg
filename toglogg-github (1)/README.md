# Toglogg

Logg over lok og motorvogner du har sett. Hver bruker har sin egen konto med
egen bildelagring. Du laster opp et bilde av f.eks. **BM 72 · 72-06**, bildet
går til kontroll, og når en admin har sjekket at det stemmer blir den
**godkjent og krysset av som sett**.

Bygget for Cloudflare Pages (statisk frontend + Pages Functions), med
D1 (database og bildelagring). Alt holder seg innenfor gratisnivået, uten betalingskort.

## Slik fungerer godkjenningen

| Status | Betyr |
|---|---|
| Mangler bilde | Registrert, men ingen bilde lastet opp |
| Venter kontroll | Bilde lastet opp, venter på admin |
| **Sett ✓** | Bildet er sjekket og godkjent – teller som sett |
| Avvist | Bildet var feil. Brukeren ser grunnen og kan laste opp nytt |

Bare godkjente teller i statistikken og på typekortene. Bytter man bilde på
en godkjent enhet, må det kontrolleres på nytt.

Admin er de brukernavnene som står i `ADMIN_BRUKERE` i `wrangler.toml`.
Admin får en egen fane **Godkjenning** med alle bilder som venter.

Bildene ligger i D1 (tabellen `bildedata`), komprimert til under 2 MB, og kan
bare hentes av eieren selv og admin (sjekkes på serveren for hvert bilde).
Gratisnivået gir 500 MB per database, som holder til flere tusen bilder.

## Oppsett

### 1. Legg koden på GitHub

```
git init
git add .
git commit -m "Toglogg"
```

Opprett et tomt repo på GitHub og push dit.

### 2. Opprett databasen

```
npm install -g wrangler
wrangler login
wrangler d1 create toglogg-db
```

Åpne `wrangler.toml` og fyll inn:
- `database_id` fra `d1 create`
- `ADMIN_BRUKERE` = brukernavnet ditt (det du registrerer deg med i appen)

Kjør databaseskjemaet:

```
wrangler d1 execute toglogg-db --remote --file=./schema.sql
```

### 3. Koble repoet til Cloudflare (Worker)

Prosjektet kjører som en Cloudflare Worker med statiske filer
(`src/worker.js` + `public/`). I Cloudflare: **Workers & Pages** → **Create**
→ **Import a repository**, velg repoet. Deploy command: `npx wrangler deploy`
(standard). Navnet på Workeren må være `toglogg`, likt `name` i `wrangler.toml`.

D1- og `ADMIN_BRUKERE`-innstillingene leses fra `wrangler.toml`.

### 4. Ferdig

Åpne `toglogg.<ditt-navn>.workers.dev`, registrer brukeren som står i `ADMIN_BRUKERE`,
og du ser fanen **Godkjenning**.

## Oppgradering fra tidligere versjon

Kjør `schema.sql` først (lager bare tabeller som mangler), deretter det som passer:

- Har du tabellen **`enheter`** fra forrige versjon:
  `wrangler d1 execute toglogg-db --remote --file=./migrer-til-godkjenning.sql`
- Har du den aller første versjonen med tabellen **`bilder`**:
  `wrangler d1 execute toglogg-db --remote --file=./migrer-fra-bilder.sql`

Gamle bilder som ligger i databasen vises fortsatt, og blir satt til
«Venter kontroll». 

## Lokal utvikling

```
wrangler d1 execute toglogg-db --local --file=./schema.sql
wrangler dev
```

## Struktur

- `src/worker.js` – sender `/api/*` til riktig fil i `functions/`, resten til nettsiden
- `public/index.html` – hele nettsiden i én HTML-fil (HTML, CSS og JavaScript)
- `functions/api/auth/` – registrering, innlogging, utlogging, `me`
- `functions/api/photos/` – egne enheter (liste, opprett, slett)
- `functions/api/photos/[id]/bilde.js` – hent bilde (`GET`) / last opp eller bytt (`PUT`), lagres i D1
- `functions/api/admin/` – `venter` (liste til kontroll) og `vurder` (godkjenn/avvis)
- `functions/_lib/` – passordhashing, sesjoner, admin-sjekk og felles hjelpere

## Sikkerhet

Passord lagres som saltet PBKDF2-hash. Sesjoner er tilfeldige tokens i en
`HttpOnly`/`Secure`-cookie. Alle API-kall sjekker innlogget bruker, og bare
admin kan se andres bilder og godkjenne.
