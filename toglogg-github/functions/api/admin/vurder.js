import { getUserFromRequest, erAdmin, json } from "../../_lib/auth.js";

// Godkjenn eller avvis et bilde. Godkjent = enheten teller som sett.
export async function onRequestPost({ request, env }) {
  const user = await getUserFromRequest(request, env.DB);
  if (!user) return json({ error: "Ikke innlogget." }, { status: 401 });
  if (!erAdmin(user, env)) return json({ error: "Kun for admin." }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const id = body.id;
  const godkjent = body.godkjent === true;
  const grunn = (body.grunn || "").trim().slice(0, 300);

  if (!id) return json({ error: "Mangler id." }, { status: 400 });
  if (!godkjent && !grunn) {
    return json({ error: "Skriv en kort grunn når du avviser, så brukeren vet hva som er feil." }, { status: 400 });
  }

  const row = await env.DB.prepare("SELECT status FROM enheter WHERE id = ?").bind(id).first();
  if (!row) return json({ error: "Fant ikke enheten." }, { status: 404 });
  if (row.status !== "venter") return json({ error: "Denne er allerede vurdert." }, { status: 409 });

  await env.DB.prepare(
    "UPDATE enheter SET status = ?, avvist_grunn = ?, vurdert_av = ?, vurdert_tid = ? WHERE id = ?"
  )
    .bind(godkjent ? "godkjent" : "avvist", godkjent ? null : grunn, user.id, Date.now(), id)
    .run();

  return json({ ok: true });
}
