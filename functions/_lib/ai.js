// Automatisk kontroll av bilder med Cloudflare Workers AI (gratisnivå).
//
// Regler (forsiktige med vilje):
//   - AI leser riktig nummer på toget  → godkjent
//   - AI ser at bildet ikke viser et tog → avvist
//   - Alt annet (usikker / leser annet nummer) → blir liggende til manuell kontroll
//
// Slås av ved å sette AI_GODKJENNING = "av" i wrangler.toml.

const MODELL = "@cf/meta/llama-3.2-11b-vision-instruct";

function tilBase64(bytes) {
  let s = "";
  const bit = 0x8000;
  for (let i = 0; i < bytes.length; i += bit) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + bit));
  }
  return btoa(s);
}

function bareSiffer(s) {
  return String(s || "").replace(/\D/g, "");
}

async function kjorModell(env, input) {
  const forsok = async (inp) => {
    try {
      return await env.AI.run(MODELL, inp);
    } catch (err) {
      // Første gang må Metas lisens godtas for kontoen.
      if (/agree|licen[cs]e|5016/i.test(String(err && err.message))) {
        await env.AI.run(MODELL, { prompt: "agree" });
        return await env.AI.run(MODELL, inp);
      }
      throw err;
    }
  };
  try {
    return await forsok(input);
  } catch (err) {
    // Noen versjoner vil ha ren base64 uten "data:…;base64,"-prefiks
    if (typeof input.image === "string" && input.image.startsWith("data:")) {
      try {
        return await forsok({ ...input, image: input.image.split(",")[1] });
      } catch (err2) {
        throw new Error(String((err2 && err2.message) || err2));
      }
    }
    throw err;
  }
}

export async function aiSjekk(env, enhet, litenBilde, contentType) {
  if (!env.AI || String(env.AI_GODKJENNING || "på").toLowerCase() === "av") return null;

  const bytes = new Uint8Array(litenBilde);
  const dataUrl = `data:${contentType || "image/jpeg"};base64,${tilBase64(bytes)}`;
  const forventet = [enhet.type, enhet.kode].filter(Boolean).join(" ");

  const prompt =
    `Dette bildet skal vise et ${enhet.kategori === "Lok" ? "lokomotiv" : "tog (motorvognsett)"}` +
    (forventet ? ` av typen/nummeret "${forventet}"` : "") +
    `. Nummeret står ofte malt på fronten eller siden, f.eks. som "72 06", "72-06", "BM 72-06" eller "7206".\n` +
    `Svar KUN med JSON, uten annen tekst:\n` +
    `{"er_tog": true/false, "lest_nummer": "nummeret du kan lese på toget, eller null", ` +
    `"samsvarer": "ja" | "nei" | "usikker", "forklaring": "kort setning på norsk"}`;

  const svar = await kjorModell(env, {
    messages: [{ role: "user", content: prompt }],
    image: dataUrl,
    max_tokens: 200,
    temperature: 0,
  });

  const tekst = typeof svar === "string" ? svar : (svar && svar.response) || "";
  const m = tekst.match(/\{[\s\S]*\}/);
  if (!m) return { beslutning: "usikker", notat: "AI ga uklart svar." };

  let r;
  try {
    r = JSON.parse(m[0]);
  } catch {
    return { beslutning: "usikker", notat: "AI ga uklart svar." };
  }

  const lest = r.lest_nummer ? String(r.lest_nummer) : "";
  const forklaring = String(r.forklaring || "").slice(0, 200);

  if (r.er_tog === false) {
    return { beslutning: "avvist", notat: `AI: ser ikke ut til å være et tog. ${forklaring}`.trim() };
  }

  const kodeSiffer = bareSiffer(enhet.kode);
  const lestSiffer = bareSiffer(lest);
  if (kodeSiffer.length >= 3 && lestSiffer.includes(kodeSiffer)) {
    return { beslutning: "godkjent", notat: `AI leste «${lest}» – stemmer med ${enhet.kode}.` };
  }

  return {
    beslutning: "usikker",
    notat: lest
      ? `AI leste «${lest}», forventet ${enhet.kode || "?"}. Trenger manuell kontroll.`
      : `AI fant ikke nummeret. ${forklaring}`.trim(),
  };
}


// Leser hvilket tog og nummer bildet viser, uten å vite svaret på forhånd.
// Returnerer { erTog, lest, forklaring } eller null hvis AI er slått av.
export async function aiIdentifiser(env, litenBilde, contentType) {
  if (!env.AI || String(env.AI_GODKJENNING || "på").toLowerCase() === "av") return null;

  const dataUrl = `data:${contentType || "image/jpeg"};base64,${tilBase64(new Uint8Array(litenBilde))}`;
  const prompt =
    "Dette er et bilde av et norsk tog. Finn enhetsnummeret som står malt på toget " +
    "(på fronten eller siden, ofte øverst ved frontruta). Norske motorvognsett har numre som " +
    "\"69072\", \"72 06\", \"73-041\", \"BM 75 12\" eller \"7512\". Les alle sifrene nøyaktig.\n" +
    "Svar KUN med JSON, uten annen tekst:\n" +
    '{"er_tog": true/false, "lest_nummer": "nummeret nøyaktig slik det står, eller null hvis du ikke kan lese det", ' +
    '"forklaring": "kort setning på norsk"}';

  const svar = await kjorModell(env, {
    messages: [{ role: "user", content: prompt }],
    image: dataUrl,
    max_tokens: 150,
    temperature: 0,
  });

  const tekst = typeof svar === "string" ? svar : (svar && svar.response) || "";
  const m = tekst.match(/\{[\s\S]*\}/);
  if (!m) return { erTog: true, lest: null, forklaring: "AI ga uklart svar." };
  try {
    const r = JSON.parse(m[0]);
    const lest = r.lest_nummer && String(r.lest_nummer).toLowerCase() !== "null" ? String(r.lest_nummer) : null;
    return { erTog: r.er_tog !== false, lest, forklaring: String(r.forklaring || "").slice(0, 200) };
  } catch {
    return { erTog: true, lest: null, forklaring: "AI ga uklart svar." };
  }
}
