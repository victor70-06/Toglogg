// Delte hjelpefunksjoner for innlogging, passordhashing og sesjoner.
// Brukes av alle filer under functions/api/.

const ITERATIONS = 100000;
const SESSION_DAYS = 30;

function bufToHex(buf) {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function hexToBuf(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes.buffer;
}

export async function hashPassword(password, saltHex) {
  const salt = saltHex ? hexToBuf(saltHex) : crypto.getRandomValues(new Uint8Array(16));
  const saltHexOut = saltHex || bufToHex(salt);
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: typeof salt === "string" ? hexToBuf(salt) : salt,
      iterations: ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    256
  );
  return { hash: bufToHex(bits), salt: saltHexOut };
}

export async function verifyPassword(password, hash, salt) {
  const check = await hashPassword(password, salt);
  return check.hash === hash;
}

export function newToken() {
  return bufToHex(crypto.getRandomValues(new Uint8Array(32)).buffer);
}

export async function createSession(db, userId) {
  const token = newToken();
  const expiresAt = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
  await db
    .prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)")
    .bind(token, userId, expiresAt)
    .run();
  return { token, expiresAt };
}

export function sessionCookie(token, expiresAt) {
  const expires = new Date(expiresAt).toUTCString();
  return `session=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Expires=${expires}`;
}

export function clearCookie() {
  return "session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0";
}

function getCookie(request, name) {
  const header = request.headers.get("Cookie") || "";
  const match = header.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
  return match ? match[1] : null;
}

export async function getUserFromRequest(request, db) {
  const token = getCookie(request, "session");
  if (!token) return null;
  const row = await db
    .prepare(
      "SELECT users.id as id, users.username as username, sessions.expires_at as expires_at FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token = ?"
    )
    .bind(token)
    .first();
  if (!row) return null;
  if (row.expires_at < Date.now()) return null;
  return { id: row.id, username: row.username };
}

export function json(data, init) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init && init.headers ? init.headers : {}),
    },
  });
}
