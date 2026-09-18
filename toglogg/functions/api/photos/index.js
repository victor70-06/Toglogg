import { getUserFromRequest, json } from "../../_lib/auth.js";

const MAX_DATA_URL_LENGTH = 3_500_000; // ~2.5MB bilde etter base64

export async function onRequestGet({ request, env }) {
  const user = await getUserFromRequest(request, env.DB);
  if (!user) return json({ error: "Ikke innlogget." }, { status: 401 });

  const { results } = await env.DB.prepare(
    "SELECT id, data_url, tittel, kategori, type, kode, sted, dato, notat, opprettet FROM bilder WHERE user_id = ? ORDER BY opprettet DESC"
  )
    .bind(user.id)
    .all();

  const bilder = results.map((r) => ({
    id: r.id,
    dataUrl: r.data_url,
    tittel: r.tittel,
    kategori: r.kategori,
    type: r.type,
    kode: r.kode,
    sted: r.sted,
    dato: r.dato,
    notat: r.notat,
    opprettet: r.opprettet,
  }));

  return json({ bilder });
}

export async function onRequestPost({ request, env }) {
  const user = await getUserFromRequest(request, env.DB);
  if (!user) return json({ error: "Ikke innlogget." }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const { dataUrl, tittel, kategori, type, kode, sted, dato, notat } = body;

  if (!dataUrl || typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/")) {
    return json({ error: "Mangler et gyldig bilde." }, { status: 400 });
  }
  if (dataUrl.length > MAX_DATA_URL_LENGTH) {
    return json({ error: "Bildet er for stort. Prøv et mindre eller mer komprimert bilde." }, { status: 413 });
  }
  if (!tittel || typeof tittel !== "string" || !tittel.trim()) {
    return json({ error: "Mangler tittel." }, { status: 400 });
  }
  if (kategori !== "Lok" && kategori !== "Motorvogn") {
    return json({ error: "Kategori må være Lok eller Motorvogn." }, { status: 400 });
  }

  const id = "b" + Date.now() + Math.floor(Math.random() * 100000);
  const opprettet = Date.now();

  await env.DB.prepare(
    "INSERT INTO bilder (id, user_id, data_url, tittel, kategori, type, kode, sted, dato, notat, opprettet) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  )
    .bind(
      id,
      user.id,
      dataUrl,
      tittel.trim(),
      kategori,
      (type || "").trim(),
      (kode || "").trim(),
      (sted || "").trim(),
      dato || "",
      (notat || "").trim(),
      opprettet
    )
    .run();

  return json({
    bilde: {
      id,
      dataUrl,
      tittel: tittel.trim(),
      kategori,
      type: (type || "").trim(),
      kode: (kode || "").trim(),
      sted: (sted || "").trim(),
      dato: dato || "",
      notat: (notat || "").trim(),
      opprettet,
    },
  });
}
