import { verifyPassword, createSession, sessionCookie, json } from "../../_lib/auth.js";

export async function onRequestPost({ request, env }) {
  const body = await request.json().catch(() => ({}));
  const username = (body.username || "").trim().toLowerCase();
  const password = body.password || "";

  const user = await env.DB.prepare(
    "SELECT id, username, password_hash, password_salt FROM users WHERE username = ?"
  )
    .bind(username)
    .first();

  if (!user) {
    return json({ error: "Feil brukernavn eller passord." }, { status: 401 });
  }

  const ok = await verifyPassword(password, user.password_hash, user.password_salt);
  if (!ok) {
    return json({ error: "Feil brukernavn eller passord." }, { status: 401 });
  }

  const { token, expiresAt } = await createSession(env.DB, user.id);

  return json(
    { user: { id: user.id, username: user.username } },
    { headers: { "Set-Cookie": sessionCookie(token, expiresAt) } }
  );
}
