import { getUserFromRequest, json } from "../../../_lib/auth.js";

export async function onRequestDelete({ request, env, params }) {
  const user = await getUserFromRequest(request, env.DB);
  if (!user) return json({ error: "Ikke innlogget." }, { status: 401 });

  const row = await env.DB.prepare("SELECT user_id FROM enheter WHERE id = ?").bind(params.id).first();
  if (!row) return json({ error: "Fant ikke enheten." }, { status: 404 });
  if (row.user_id !== user.id) return json({ error: "Ikke tilgang." }, { status: 403 });

  await env.DB.batch([
    env.DB.prepare("DELETE FROM bildedata WHERE enhet_id = ?").bind(params.id),
    env.DB.prepare("DELETE FROM enheter WHERE id = ?").bind(params.id),
  ]);

  return json({ ok: true });
}
