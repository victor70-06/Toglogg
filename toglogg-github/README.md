# Toglogg

Logg over lok og motorvogner du har sett. Hver bruker har sin egen konto med
egen bildelagring. Du laster opp et bilde av f.eks. **BM 72 · 72-06**, bildet
går til kontroll, og når en admin har sjekket at det stemmer blir den
**godkjent og krysset av som sett**.

Bygget for Cloudflare Pages (statisk frontend + Pages Functions), med
D1 (database) og R2 (bildelagring).

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

Bildene ligger i R2 under `brukere/<bruker-id>/…` og kan bare hentes av
eieren selv og admin (sjekkes på serveren for hvert bilde).

## Oppsett

### 1. Legg koden på GitHub

```
git init
git add .
git commit -m "Toglogg"
```

Opprett et tomt repo på GitHub og push dit.

### 2. Opprett database og bildelagring

```
npm install -g wrangler
wrangler login
wrangler d1 create toglogg-db
wrangler r2 bucket create toglogg-bilder
```

(R2 må aktiveres én gang i Cloudflare-dashbordet under **R2** før
`bucket create` fungerer. Gratisnivået dekker 10 GB.)

Åpne `wrangler.toml` og fyll inn:
- `database_id` fra `d1 create`
- `ADMIN_BRUKERE` = brukernavnet ditt (det du registrerer deg med i appen)

Kjør databaseskjemaet:

```
wrangler d1 execute toglogg-db --remote --file=./schema.sql
```

### 3. Koble repoet til Cloudflare Pages

Filene skal ligge rett i roten av repoet (ikke i en undermappe), så **Root directory** står tom.


1. **Workers & Pages** → **Create** → **Pages** → **Connect to Git**, velg repoet.
2. Framework preset: **None**, build command: tom, output directory: `public`.
3. **Save and Deploy**.

D1-, R2- og `ADMIN_BRUKERE`-innstillingene leses fra `wrangler.toml`, så du
trenger ikke legge dem inn i dashbordet. Endrer du `wrangler.toml`, push på
nytt.

### 4. Ferdig

Åpne `<prosjekt>.pages.dev`, registrer brukeren som står i `ADMIN_BRUKERE`,
og du ser fanen **Godkjenning**.

## Oppgradering fra tidligere versjon

Kjør `schema.sql` først (lager bare tabeller som mangler), deretter det som passer:

- Har du tabellen **`enheter`** fra forrige versjon:
  `wrangler d1 execute toglogg-db --remote --file=./migrer-til-godkjenning.sql`
- Har du den aller første versjonen med tabellen **`bilder`**:
  `wrangler d1 execute toglogg-db --remote --file=./migrer-fra-bilder.sql`

Gamle bilder som ligger i databasen vises fortsatt, og blir satt til
«Venter kontroll». Bytter man bilde, flyttes det til R2.

## Lokal utvikling

```
wrangler d1 execute toglogg-db --local --file=./schema.sql
wrangler pages dev
```

## Struktur

- `public/index.html` – hele nettsiden i én HTML-fil (HTML, CSS og JavaScript)
- `functions/api/auth/` – registrering, innlogging, utlogging, `me`
- `functions/api/photos/` – egne enheter (liste, opprett, slett)
- `functions/api/photos/[id]/bilde.js` – hent bilde (`GET`) / last opp eller bytt (`PUT`)
- `functions/api/admin/` – `venter` (liste til kontroll) og `vurder` (godkjenn/avvis)
- `functions/_lib/` – passordhashing, sesjoner, admin-sjekk og felles hjelpere

## Sikkerhet

Passord lagres som saltet PBKDF2-hash. Sesjoner er tilfeldige tokens i en
`HttpOnly`/`Secure`-cookie. Alle API-kall sjekker innlogget bruker, og bare
admin kan se andres bilder og godkjenne.
