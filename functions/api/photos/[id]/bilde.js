import { getUserFromRequest, erAdmin, json } from "../../../_lib/auth.js";
import { KOLONNER, tilEnhet } from "../../../_lib/enheter.js";

// D1 tillater maks ca. 2 MB per verdi. Nettleseren komprimerer bildet
// under denne grensen før opplasting.
const MAKS_BYTES = 1_900_000;
const TILLATTE_TYPER = ["image/jpeg", "image/png", "image/webp"];

// Henter bildet. Kun eieren og admin får se det.
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

  const bilde = await env.DB.prepare("SELECT innhold, content_type FROM bildedata WHERE enhet_id = ?")
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

// Laster opp (eller bytter) bildet. Lagres i D1 knyttet til brukerens enhet,
// og enheten settes til «venter» til det er kontrollert.
export async function onRequestPut({ request, env, params }) {
  const user = await getUserFromRequest(request, env.DB);
  if (!user) return json({ error: "Ikke innlogget." }, { status: 401 });

  const row = await env.DB.prepare("SELECT user_id FROM enheter WHERE id = ?").bind(params.id).first();
  if (!row) return json({ error: "Fant ikke enheten." }, { status: 404 });
  if (row.user_id !== user.id) return json({ error: "Ikke tilgang." }, { status: 403 });

  const contentType = (request.headers.get("Content-Type") || "").split(";")[0].trim();
  if (!TILLATTE_TYPER.includes(contentType)) {
    return json({ error: "Bildet må være JPEG, PNG eller WebP." }, { status: 415 });
  }

  const data = await request.arrayBuffer();
  if (data.byteLength === 0) return json({ error: "Tomt bilde." }, { status: 400 });
  if (data.byteLength > MAKS_BYTES) {
    return json({ error: "Bildet er for stort. Prøv et mindre bilde." }, { status: 413 });
  }

  // bilde_key brukes som versjonsmerke, så nettleseren henter nytt bilde ved bytte.
  const versjon = "db-" + Date.now();

  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO bildedata (enhet_id, innhold, content_type, storrelse) VALUES (?, ?, ?, ?) " +
        "ON CONFLICT(enhet_id) DO UPDATE SET innhold = excluded.innhold, " +
        "content_type = excluded.content_type, storrelse = excluded.storrelse"
    ).bind(params.id, data, contentType, data.byteLength),
    env.DB.prepare(
      "UPDATE enheter SET bilde_key = ?, data_url = NULL, status = 'venter', avvist_grunn = NULL, " +
        "vurdert_av = NULL, vurdert_tid = NULL WHERE id = ?"
    ).bind(versjon, params.id),
  ]);

  const ny = await env.DB.prepare(`SELECT ${KOLONNER} FROM enheter WHERE id = ?`).bind(params.id).first();
  return json({ enhet: tilEnhet(ny) });
}
