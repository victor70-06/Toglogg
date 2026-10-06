import { getUserFromRequest, json } from "../../../_lib/auth.js";
import { KOLONNER, tilEnhet, normaliserKode } from "../../../_lib/enheter.js";
import { hentFlate, finnIFlate } from "../../../_lib/flate.js";

// Brukeren velger type og nummer selv (når AI ikke fant det).
// Enheten går da til manuell kontroll.
export async function onRequestPatch({ request, env, params }) {
  const user = await getUserFromRequest(request, env.DB);
  if (!user) return json({ error: "Ikke innlogget." }, { status: 401 });

  const row = await env.DB.prepare("SELECT user_id, status, vurdert_av FROM enheter WHERE id = ?").bind(params.id).first();
  if (!row) return json({ error: "Fant ikke bildet." }, { status: 404 });
  if (row.user_id !== user.id) return json({ error: "Ikke tilgang." }, { status: 403 });
  // AI-godkjente kan rettes av brukeren («Dette er feil»), men ikke de en admin har godkjent.
  if (row.status === "godkjent" && row.vurdert_av) {
    return json({ error: "Denne er allerede godkjent av admin." }, { status: 409 });
  }
  const rettetAi = row.status === "godkjent";

  const body = await request.json().catch(() => ({}));
  const type = String(body.type || "").trim();
  const kode = normaliserKode(body.kode);

  const flate = await hentFlate(env, request);
  const enhet = flate.find((e) => e.type === type && e.kode === kode);
  if (!enhet) return json({ error: "Velg en type og et nummer fra listen." }, { status: 400 });

  const annen = await env.DB.prepare(
    "SELECT id, status FROM enheter WHERE user_id = ? AND kategori = ? AND type = ? AND kode = ? AND id != ?"
  )
    .bind(user.id, enhet.kategori, enhet.type, enhet.kode, params.id)
    .first();
  if (annen && annen.status === "godkjent") {
    return json({ error: `Du har allerede ${enhet.kode} som sett.` }, { status: 409 });
  }

  const steg = [];
  // Et eldre, ikke-godkjent forsøk på samme nummer erstattes av dette
  if (annen) {
    steg.push(env.DB.prepare("DELETE FROM bildedata WHERE enhet_id = ?").bind(annen.id));
    steg.push(env.DB.prepare("DELETE FROM enheter WHERE id = ?").bind(annen.id));
  }
  steg.push(
    env.DB.prepare(
      "UPDATE enheter SET kategori = ?, type = ?, kode = ?, tittel = ?, status = 'venter', avvist_grunn = NULL, " +
        "vurdert_av = NULL, vurdert_tid = NULL, ai_notat = CASE WHEN ? THEN COALESCE(ai_notat, '') || ' Brukeren sa at AI tok feil.' ELSE ai_notat END WHERE id = ?"
    ).bind(enhet.kategori, enhet.type, enhet.kode, `${enhet.type} ${enhet.kode}`, rettetAi ? 1 : 0, params.id)
  );
  await env.DB.batch(steg);

  const ny = await env.DB.prepare(`SELECT ${KOLONNER} FROM enheter WHERE id = ?`).bind(params.id).first();
  return json({ enhet: tilEnhet(ny) });
}

export async function onRequestDelete({ request, env, params }) {
  const user = await getUserFromRequest(request, env.DB);
  if (!user) return json({ error: "Ikke innlogget." }, { status: 401 });

  const row = await env.DB.prepare("SELECT user_id FROM enheter WHERE id = ?").bind(params.id).first();
  if (!row) return json({ error: "Fant ikke bildet." }, { status: 404 });
  if (row.user_id !== user.id) return json({ error: "Ikke tilgang." }, { status: 403 });

  await env.DB.batch([
    env.DB.prepare("DELETE FROM bildedata WHERE enhet_id = ?").bind(params.id),
    env.DB.prepare("DELETE FROM enheter WHERE id = ?").bind(params.id),
  ]);
  return json({ ok: true });
}
