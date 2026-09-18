# Toglogg

En privat reisedagbok for bilder av lok og motorvogner. Hver bruker logger
inn med brukernavn og passord og ser kun sine egne bilder. Bygget for
Cloudflare Pages (statisk frontend + Pages Functions) med en D1-database.

## Slik tar du den i bruk

### 1. Legg koden på GitHub

```
git init
git add .
git commit -m "Første versjon av Toglogg"
```

Opprett et nytt, tomt repo på GitHub og følg instruksjonene GitHub gir deg
for å pushe koden dit (`git remote add origin ...` og `git push`).

### 2. Opprett en D1-database

Du trenger en gratis Cloudflare-konto. Enklest er å bruke
[wrangler](https://developers.cloudflare.com/workers/wrangler/install-and-update/)
(Cloudflares kommandolinjeverktøy):

```
npm install -g wrangler
wrangler login
wrangler d1 create toglogg-db
```

Kommandoen skriver ut en `database_id`. Åpne `wrangler.toml` i dette
prosjektet og lim inn IDen der det står `SETT-INN-DATABASE-ID-HER`.
Commit og push denne endringen.

Kjør deretter databaseskjemaet mot den nye databasen:

```
wrangler d1 execute toglogg-db --remote --file=./schema.sql
```

### 3. Koble prosjektet til Cloudflare Pages

1. Gå til [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
2. Velg GitHub-repoet du opprettet i steg 1.
3. Under **Build settings**:
   - Framework preset: **None**
   - Build command: la stå tom
   - Build output directory: `public`
4. Trykk **Save and Deploy**.

### 4. Koble databasen til Pages-prosjektet

1. Gå inn på Pages-prosjektet du nettopp opprettet.
2. **Settings** → **Functions** → **D1 database bindings**.
3. Legg til en binding: variabelnavn `DB`, database `toglogg-db`.
4. Gjør dette for både **Production** og **Preview**.
5. Gå til **Deployments** og trigger en ny deploy (eller push en tom commit) slik at bindingen tas i bruk.

### 5. Ferdig

Besøk URL-en Cloudflare ga deg (noe sånt som `toglogg.pages.dev`).
Opprett en bruker, logg inn, og begynn å legge inn bilder.

## Lokal utvikling (valgfritt)

```
wrangler d1 execute toglogg-db --local --file=./schema.sql
wrangler pages dev public --d1=DB=toglogg-db
```

## Hvordan det er bygget

- `public/` – statisk frontend (HTML, CSS, vanilla JS). Snakker med API-et via `fetch`.
- `functions/api/auth/` – registrering, innlogging, utlogging og "hvem er jeg" (`me`).
- `functions/api/photos/` – henting, opprettelse og sletting av bilder, alltid filtrert på innlogget bruker.
- `functions/_lib/auth.js` – passordhashing (PBKDF2), sesjonshåndtering via en `session`-cookie lagret i D1.
- Bilder lagres som komprimerte JPEG-er (maks 1280px bredde) direkte i databasen. Er samlingen din stor, bør du på sikt flytte selve bildefilene til Cloudflare R2 og bare lagre en referanse i D1 — dagens løsning er enklest å sette opp, men fungerer best for moderate mengder bilder.

## Sikkerhet

Passord lagres aldri i klartekst — kun som saltet PBKDF2-hash. Sesjoner
lagres som tilfeldige tokens i databasen og sendes som en `HttpOnly`,
`Secure`-cookie. Hver bruker kan kun se og slette sine egne bilder.
