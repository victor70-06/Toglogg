import { getUserFromRequest, json } from "../_lib/auth.js";
import { KOLONNER, tilEnhet } from "../_lib/enheter.js";
import { aiIdentifiser } from "../_lib/ai.js";
import { hentFlate, matchNummer } from "../_lib/flate.js";

const MAKS_BYTES = 1_900_000;
const MAKS_LITEN = 600_000;
const TILLATTE_TYPER = ["image/jpeg", "image/png", "image/webp"];

// Last opp ett bilde. AI finner type og nummer:
//   - nummeret finnes i flåtelisten → enheten blir godkjent (sett)
//   - ellers → bildet lagres som «ukjent», og brukeren velger nummer selv
//     (det går da til manuell kontroll)
export async function onRequestPost({ request, env }) {
  const user = await getUserFromRequest(request, env.DB);
  if (!user) return json({ error: "Ikke innlogget." }, { status: 401 });

  let form;
  try {
    form = await request.formData();
  } catch {
    return json({ error: "Ugyldig opplasting." }, { status: 400 });
  }
  const stor = form.get("bilde");
  const liten = form.get("liten");
  if (!stor || typeof stor === "string") return json({ error: "Mangler bilde." }, { status: 400 });

  const contentType = (stor.type || "").split(";")[0].trim();
  if (!TILLATTE_TYPER.includes(contentType)) {
    return json({ error: "Bildet må være JPEG, PNG eller WebP." }, { status: 415 });
  }
  const data = await stor.arrayBuffer();
  if (data.byteLength === 0) return json({ error: "Tomt bilde." }, { status: 400 });
  if (data.byteLength > MAKS_BYTES) return json({ error: "Bildet er for stort." }, { status: 413 });

  let litenData = null;
  if (liten && typeof liten !== "string") {
    litenData = await liten.arrayBuffer();
    if (litenData.byteLength === 0 || litenData.byteLength > MAKS_LITEN) litenData = null;
  }

  // 1. AI leser nummeret
  let ai = null;
  let aiFeil = null;
  try {
    ai = await aiIdentifiser(env, litenData || data, litenData ? "image/jpeg" : contentType);
  } catch (err) {
    aiFeil = String((err && err.message) || err).slice(0, 150);
  }

  const flate = await hentFlate(env, request);
  const treff = ai && ai.erTog && ai.lest ? matchNummer(flate, ai.lest) : null;

  // 2. Har brukeren denne fra før?
  let eksisterende = null;
  if (treff) {
    eksisterende = await env.DB.prepare(
      `SELECT ${KOLONNER} FROM enheter WHERE user_id = ? AND kategori = ? AND type = ? AND kode = ?`
    )
      .bind(user.id, treff.kategori, treff.type, treff.kode)
      .first();
    if (eksisterende && eksisterende.status === "godkjent") {
      return json({ resultat: "allerede", enhet: tilEnhet(eksisterende), lest: ai.lest });
    }
  }

  let aiNotat;
  if (aiFeil) aiNotat = "AI-feil: " + aiFeil;
  else if (!ai) aiNotat = null;
  else if (!ai.erTog) aiNotat = "AI: ser ikke ut til å være et tog. " + ai.forklaring;
  else if (treff) aiNotat = `AI leste «${ai.lest}» → ${treff.type} ${treff.kode}.`;
  else if (ai.lest) aiNotat = `AI leste «${ai.lest}», men fant det ikke i listen.`;
  else aiNotat = "AI fant ikke nummeret. " + ai.forklaring;
  aiNotat = aiNotat ? aiNotat.trim() : null;

  const id = eksisterende ? eksisterende.id : "e" + Date.now() + Math.floor(Math.random() * 100000);
  const naa = Date.now();
  const versjon = "db-" + naa;
  const status = treff ? "godkjent" : "ukjent";
  const dato = new Date().toISOString().slice(0, 10);

  const lagre = [];
  if (eksisterende) {
    lagre.push(
      env.DB.prepare(
        "UPDATE enheter SET bilde_key = ?, data_url = NULL, status = ?, avvist_grunn = NULL, vurdert_av = NULL, " +
          "vurdert_tid = ?, ai_notat = ? WHERE id = ?"
      ).bind(versjon, status, naa, aiNotat, id)
    );
  } else {
    lagre.push(
      env.DB.prepare(
        "INSERT INTO enheter (id, user_id, kategori, type, kode, tittel, sted, dato, notat, bilde_key, status, ai_notat, vurdert_tid, opprettet) " +
          "VALUES (?, ?, ?, ?, ?, ?, '', ?, '', ?, ?, ?, ?, ?)"
      ).bind(
        id,
        user.id,
        treff ? treff.kategori : "Motorvogn",
        treff ? treff.type : null,
        treff ? treff.kode : null,
        treff ? `${treff.type} ${treff.kode}` : "Ukjent tog",
        dato,
        versjon,
        status,
        aiNotat,
        treff ? naa : null,
        naa
      )
    );
  }
  lagre.push(
    env.DB.prepare(
      "INSERT INTO bildedata (enhet_id, innhold, content_type, storrelse, liten) VALUES (?, ?, ?, ?, ?) " +
        "ON CONFLICT(enhet_id) DO UPDATE SET innhold = excluded.innhold, content_type = excluded.content_type, " +
        "storrelse = excluded.storrelse, liten = excluded.liten"
    ).bind(id, data, contentType, data.byteLength, litenData)
  );
  await env.DB.batch(lagre);

  const ny = await env.DB.prepare(`SELECT ${KOLONNER} FROM enheter WHERE id = ?`).bind(id).first();
  return json({
    resultat: treff ? "godkjent" : "ukjent",
    enhet: tilEnhet(ny),
    lest: ai ? ai.lest : null,
    aiFeil: aiFeil || null,
  });
}
