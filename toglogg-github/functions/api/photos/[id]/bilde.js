import { getUserFromRequest, erAdmin, json } from "../../../_lib/auth.js";
import { KOLONNER, tilEnhet } from "../../../_lib/enheter.js";

const MAKS_BYTES = 5 * 1024 * 1024; // 5 MB etter komprimering i nettleseren
const TILLATTE_TYPER = ["image/jpeg", "image/png", "image/webp"];

// Henter bildet. Kun eieren og admin får se det.
export async function onRequestGet({ request, env, params }) {
  const user = await getUserFromRequest(request, env.DB);
  if (!user) return new Response("Ikke innlogget.", { status: 401 });

  const row = await env.DB.prepare("SELECT user_id, bilde_key, data_url FROM enheter WHERE id = ?")
    .bind(params.id)
    .first();
  if (!row) return new Response("Fant ikke enheten.", { status: 404 });
  if (row.user_id !== user.id && !erAdmin(user, env)) {
    return new Response("Ikke tilgang.", { status: 403 });
  }

  const cache = "private, max-age=31536000, immutable";

  if (row.bilde_key) {
    const obj = await env.BILDER.get(row.bilde_key);
    if (!obj) return new Response("Bildet mangler i lagringen.", { status: 404 });
    return new Response(obj.body, {
      headers: {
        "Content-Type": (obj.httpMetadata && obj.httpMetadata.contentType) || "image/jpeg",
        "Cache-Control": cache,
      },
    });
  }

  // Bilder fra før R2 ble tatt i bruk ligger som data-URL i databasen.
  if (row.data_url) {
    const m = row.data_url.match(/^data:([^;]+);base64,(.*)$/);
    if (!m) return new Response("Ugyldig gammelt bilde.", { status: 500 });
    const bytes = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0));
    return new Response(bytes, { headers: { "Content-Type": m[1], "Cache-Control": cache } });
  }

  return new Response("Ingen bilde.", { status: 404 });
}

// Laster opp (eller bytter) bildet. Bildet lagres i R2 under brukerens
// egen mappe, og enheten settes til «venter» til det er kontrollert.
export async function onRequestPut({ request, env, params }) {
  const user = await getUserFromRequest(request, env.DB);
  if (!user) return json({ error: "Ikke innlogget." }, { status: 401 });

  const row = await env.DB.prepare("SELECT user_id, bilde_key FROM enheter WHERE id = ?")
    .bind(params.id)
    .first();
  if (!row) return json({ error: "Fant ikke enheten." }, { status: 404 });
  if (row.user_id !== user.id) return json({ error: "Ikke tilgang." }, { status: 403 });

  const contentType = (request.headers.get("Content-Type") || "").split(";")[0].trim();
  if (!TILLATTE_TYPER.includes(contentType)) {
    return json({ error: "Bildet må være JPEG, PNG eller WebP." }, { status: 415 });
  }

  const data = await request.arrayBuffer();
  if (data.byteLength === 0) return json({ error: "Tomt bilde." }, { status: 400 });
  if (data.byteLength > MAKS_BYTES) {
    return json({ error: "Bildet er for stort (maks 5 MB)." }, { status: 413 });
  }

  const ending = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
  const nyKey = `brukere/${user.id}/${params.id}-${Date.now()}.${ending}`;

  await env.BILDER.put(nyKey, data, { httpMetadata: { contentType } });

  await env.DB.prepare(
    "UPDATE enheter SET bilde_key = ?, data_url = NULL, status = 'venter', avvist_grunn = NULL, " +
      "vurdert_av = NULL, vurdert_tid = NULL WHERE id = ?"
  )
    .bind(nyKey, params.id)
    .run();

  if (row.bilde_key) await env.BILDER.delete(row.bilde_key);

  const ny = await env.DB.prepare(`SELECT ${KOLONNER} FROM enheter WHERE id = ?`).bind(params.id).first();
  return json({ enhet: tilEnhet(ny) });
}
