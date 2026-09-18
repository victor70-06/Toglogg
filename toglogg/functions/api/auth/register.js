import { hashPassword, createSession, sessionCookie, json } from "../../_lib/auth.js";

export async function onRequestPost({ request, env }) {
  const body = await request.json().catch(() => ({}));
  const username = (body.username || "").trim().toLowerCase();
  const password = body.password || "";

  if (username.length < 3 || username.length > 32) {
    return json({ error: "Brukernavn må være mellom 3 og 32 tegn." }, { status: 400 });
  }
  if (!/^[a-z0-9_.-]+$/.test(username)) {
    return json({ error: "Brukernavn kan bare inneholde bokstaver, tall, _ . og -." }, { status: 400 });
  }
  if (password.length < 6) {
    return json({ error: "Passordet må være minst 6 tegn." }, { status: 400 });
  }

  const existing = await env.DB.prepare("SELECT id FROM users WHERE username = ?")
    .bind(username)
    .first();
  if (existing) {
    return json({ error: "Brukernavnet er allerede tatt." }, { status: 409 });
  }

  const { hash, salt } = await hashPassword(password);
  const result = await env.DB.prepare(
    "INSERT INTO users (username, password_hash, password_salt, created_at) VALUES (?, ?, ?, ?)"
  )
    .bind(username, hash, salt, Date.now())
    .run();

  const userId = result.meta.last_row_id;
  const { token, expiresAt } = await createSession(env.DB, userId);

  return json(
    { user: { id: userId, username } },
    { headers: { "Set-Cookie": sessionCookie(token, expiresAt) } }
  );
}
