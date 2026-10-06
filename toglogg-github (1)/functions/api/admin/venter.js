import { getUserFromRequest, erAdmin, json } from "../../_lib/auth.js";
import { tilEnhet } from "../../_lib/enheter.js";

// Liste over alle bilder som venter på kontroll, fra alle brukere.
export async function onRequestGet({ request, env }) {
  const user = await getUserFromRequest(request, env.DB);
  if (!user) return json({ error: "Ikke innlogget." }, { status: 401 });
  if (!erAdmin(user, env)) return json({ error: "Kun for admin." }, { status: 403 });

  const { results } = await env.DB.prepare(
    "SELECT e.id, e.user_id, e.kategori, e.type, e.kode, e.tittel, e.sted, e.dato, e.notat, e.bilde_key, " +
      "(e.data_url IS NOT NULL) AS har_gammelt_bilde, e.status, e.avvist_grunn, e.vurdert_tid, e.opprettet, u.username " +
      "FROM enheter e JOIN users u ON u.id = e.user_id WHERE e.status = 'venter' ORDER BY e.opprettet ASC"
  ).all();

  return json({ enheter: results.map(tilEnhet) });
}
