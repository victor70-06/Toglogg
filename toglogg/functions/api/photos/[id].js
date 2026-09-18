import { getUserFromRequest, json } from "../../_lib/auth.js";

export async function onRequestDelete({ request, env, params }) {
  const user = await getUserFromRequest(request, env.DB);
  if (!user) return json({ error: "Ikke innlogget." }, { status: 401 });

  const row = await env.DB.prepare("SELECT user_id FROM bilder WHERE id = ?")
    .bind(params.id)
    .first();

  if (!row) return json({ error: "Fant ikke bildet." }, { status: 404 });
  if (row.user_id !== user.id) return json({ error: "Ikke tilgang." }, { status: 403 });

  await env.DB.prepare("DELETE FROM bilder WHERE id = ?").bind(params.id).run();

  return json({ ok: true });
}
