import { getUserFromRequest, erAdmin, json } from "../../../_lib/auth.js";
import { KOLONNER, tilEnhet } from "../../../_lib/enheter.js";
import { aiSjekk } from "../../../_lib/ai.js";

// D1 tillater maks ca. 2 MB per verdi. Nettleseren komprimerer under grensen.
const MAKS_BYTES = 1_900_000;
const MAKS_LITEN = 400_000;
const TILLATTE_TYPER = ["image/jpeg", "image/png", "image/webp"];

// Henter bildet (?liten=1 gir miniatyr). Kun eieren og admin får se det.
export async function onRequestGet({ request, env, params }) {
  const user = await getUserFromRequest(request, env.DB);
  if (!user) return new Response("Ikke innlogget.", { status: 401 });

  const row = await env.DB.prepare("SELECT user_id, data_url FROM enheter WHERE id = ?")
    .bind(params.id)
    .first();
  if (!row) return new Response("Fant ikke enheten.", { status: 404 });
  if (row.user_id !== user.id && !erAdmin(user, env)) {
    return new Response("Ikke tilgang.", { status: 403 });
  }

  const cache = "private, max-age=31536000, immutable";
  const liten = new URL(request.url).searchParams.get("liten") === "1";

  const bilde = await env.DB.prepare(
    liten
      ? "SELECT COALESCE(liten, innhold) AS innhold, CASE WHEN liten IS NULL THEN content_type ELSE 'image/jpeg' END AS content_type FROM bildedata WHERE enhet_id = ?"
      : "SELECT innhold, content_type FROM bildedata WHERE enhet_id = ?"
  )
    .bind(params.id)
    .first();
  if (bilde && bilde.innhold) {
    return new Response(new Uint8Array(bilde.innhold), {
      headers: { "Content-Type": bilde.content_type || "image/jpeg", "Cache-Control": cache },
    });
  }

  // Bilder fra den aller første versjonen ligger som data-URL.
  if (row.data_url) {
    const m = row.data_url.match(/^data:([^;]+);base64,(.*)$/);
    if (!m) return new Response("Ugyldig gammelt bilde.", { status: 500 });
    const bytes = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0));
    return new Response(bytes, { headers: { "Content-Type": m[1], "Cache-Control": cache } });
  }

  return new Response("Ingen bilde.", { status: 404 });
}

// Laster opp (eller bytter) bildet som skjema med feltene «bilde» og «liten».
// Etterpå sjekker AI bildet: godkjent, avvist, eller til manuell kontroll.
export async function onRequestPut({ request, env, params }) {
  const user = await getUserFromRequest(request, env.DB);
  if (!user) return json({ error: "Ikke innlogget." }, { status: 401 });

  const enhet = await env.DB.prepare("SELECT user_id, kategori, type, kode FROM enheter WHERE id = ?")
    .bind(params.id)
    .first();
  if (!enhet) return json({ error: "Fant ikke enheten." }, { status: 404 });
  if (enhet.user_id !== user.id) return json({ error: "Ikke tilgang." }, { status: 403 });

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
  if (data.byteLength > MAKS_BYTES) return json({ error: "Bildet er for stort. Prøv et mindre bilde." }, { status: 413 });

  let litenData = null;
  if (liten && typeof liten !== "string") {
    litenData = await liten.arrayBuffer();
    if (litenData.byteLength === 0 || litenData.byteLength > MAKS_LITEN) litenData = null;
  }

  const versjon = "db-" + Date.now();

  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO bildedata (enhet_id, innhold, content_type, storrelse, liten) VALUES (?, ?, ?, ?, ?) " +
        "ON CONFLICT(enhet_id) DO UPDATE SET innhold = excluded.innhold, content_type = excluded.content_type, " +
        "storrelse = excluded.storrelse, liten = excluded.liten"
    ).bind(params.id, data, contentType, data.byteLength, litenData),
    env.DB.prepare(
      "UPDATE enheter SET bilde_key = ?, data_url = NULL, status = 'venter', avvist_grunn = NULL, " +
        "vurdert_av = NULL, vurdert_tid = NULL, ai_notat = NULL WHERE id = ?"
    ).bind(versjon, params.id),
  ]);

  // AI-kontroll. Feiler den, blir bildet bare liggende til manuell kontroll.
  let aiMelding = null;
  if (litenData) {
    try {
      const r = await aiSjekk(env, enhet, litenData, "image/jpeg");
      if (r) {
        const nyStatus = r.beslutning === "godkjent" ? "godkjent" : r.beslutning === "avvist" ? "avvist" : "venter";
        await env.DB.prepare(
          "UPDATE enheter SET status = ?, ai_notat = ?, avvist_grunn = ?, vurdert_tid = ? WHERE id = ? AND bilde_key = ?"
        )
          .bind(
            nyStatus,
            r.notat,
            nyStatus === "avvist" ? r.notat : null,
            nyStatus === "venter" ? null : Date.now(),
            params.id,
            versjon
          )
          .run();
      }
    } catch (err) {
      aiMelding = "AI-kontrollen var ikke tilgjengelig, bildet venter på manuell kontroll.";
      await env.DB.prepare("UPDATE enheter SET ai_notat = ? WHERE id = ?")
        .bind("AI-feil: " + String((err && err.message) || err).slice(0, 150), params.id)
        .run();
    }
  }

  const ny = await env.DB.prepare(`SELECT ${KOLONNER} FROM enheter WHERE id = ?`).bind(params.id).first();
  return json({ enhet: tilEnhet(ny), melding: aiMelding });
}
