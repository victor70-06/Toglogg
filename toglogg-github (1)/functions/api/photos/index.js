import { getUserFromRequest, json } from "../../_lib/auth.js";
import { KOLONNER, tilEnhet } from "../../_lib/enheter.js";

export async function onRequestGet({ request, env }) {
  const user = await getUserFromRequest(request, env.DB);
  if (!user) return json({ error: "Ikke innlogget." }, { status: 401 });

  const { results } = await env.DB.prepare(
    `SELECT ${KOLONNER} FROM enheter WHERE user_id = ? ORDER BY opprettet DESC`
  )
    .bind(user.id)
    .all();

  return json({ enheter: results.map(tilEnhet) });
}

// Oppretter en enhet (uten bilde). Bildet lastes opp etterpå med
// PUT /api/photos/:id/bilde, og går da til kontroll.
export async function onRequestPost({ request, env }) {
  const user = await getUserFromRequest(request, env.DB);
  if (!user) return json({ error: "Ikke innlogget." }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const kategori = body.kategori;
  const tittel = (body.tittel || "").trim();
  const type = (body.type || "").trim();
  const kode = (body.kode || "").trim();
  const sted = (body.sted || "").trim();
  const dato = body.dato || "";
  const notat = (body.notat || "").trim();

  if (kategori !== "Lok" && kategori !== "Motorvogn") {
    return json({ error: "Kategori må være Lok eller Motorvogn." }, { status: 400 });
  }
  if (!tittel && !kode) {
    return json({ error: "Skriv inn enten en tittel eller en kode." }, { status: 400 });
  }

  if (kode && type) {
    const finnes = await env.DB.prepare(
      "SELECT id FROM enheter WHERE user_id = ? AND kategori = ? AND type = ? AND kode = ?"
    )
      .bind(user.id, kategori, type, kode)
      .first();
    if (finnes) {
      return json({ error: `Du har allerede lagt inn ${kode} under ${type}.` }, { status: 409 });
    }
  }

  const id = "e" + Date.now() + Math.floor(Math.random() * 100000);
  const opprettet = Date.now();
  const tittelEndelig = tittel || [type, kode].filter(Boolean).join(" ");

  await env.DB.prepare(
    "INSERT INTO enheter (id, user_id, kategori, type, kode, tittel, sted, dato, notat, status, opprettet) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'uten_bilde', ?)"
  )
    .bind(id, user.id, kategori, type || null, kode || null, tittelEndelig, sted, dato, notat, opprettet)
    .run();

  const rad = await env.DB.prepare(`SELECT ${KOLONNER} FROM enheter WHERE id = ?`).bind(id).first();
  return json({ enhet: tilEnhet(rad) });
}
