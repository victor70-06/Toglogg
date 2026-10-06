import { tolkNummer } from "./flate.js";

// Automatisk kontroll av bilder med Cloudflare Workers AI (gratisnivå).
//
// Regler (forsiktige med vilje):
//   - AI leser riktig nummer på toget  → godkjent
//   - AI ser at bildet ikke viser et tog → avvist
//   - Alt annet (usikker / leser annet nummer) → blir liggende til manuell kontroll
//
// Slås av ved å sette AI_GODKJENNING = "av" i wrangler.toml.

const LLAMA4 = "@cf/meta/llama-4-scout-17b-16e-instruct";
const LLAMA32 = "@cf/meta/llama-3.2-11b-vision-instruct";
const SYSTEM = "Du er en ekspert på norske tog som leser enhetsnumre på bilder. Du svarer alltid kun med JSON.";

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

function svarTekst(svar) {
  if (!svar) return "";
  if (typeof svar === "string") return svar;
  if (typeof svar.response === "string") return svar.response;
  if (svar.response && typeof svar.response === "object") return JSON.stringify(svar.response);
  const c = svar.choices && svar.choices[0] && svar.choices[0].message && svar.choices[0].message.content;
  if (typeof c === "string") return c;
  return JSON.stringify(svar);
}

// Prøver flere modeller/formater, siden Workers AI har endret API-et over tid.
async function kjorModell(env, prompt, dataUrl) {
  const meldinger = [
    { role: "system", content: SYSTEM },
    {
      role: "user",
      content: [
        { type: "text", text: prompt },
        { type: "image_url", image_url: { url: dataUrl } },
      ],
    },
  ];
  const forsok = [
    { modell: LLAMA4, input: { messages: meldinger, max_tokens: 200, temperature: 0 } },
    { modell: LLAMA32, input: { messages: meldinger, max_tokens: 200, temperature: 0 } },
    {
      modell: LLAMA32,
      input: { messages: [{ role: "system", content: SYSTEM }, { role: "user", content: prompt }], image: dataUrl, max_tokens: 200, temperature: 0 },
    },
  ];
  const feil = [];
  for (const f of forsok) {
    try {
      return svarTekst(await env.AI.run(f.modell, f.input));
    } catch (err) {
      const msg = String((err && err.message) || err);
      // Llama 3.2 krever at Metas lisens godtas én gang per konto.
      if (f.modell === LLAMA32 && /agree|licen[cs]e|5016/i.test(msg)) {
        try {
          await env.AI.run(LLAMA32, { prompt: "agree" });
          return svarTekst(await env.AI.run(f.modell, f.input));
        } catch (err2) {
          feil.push(String((err2 && err2.message) || err2));
          continue;
        }
      }
      feil.push(f.modell.split("/").pop() + ": " + msg);
    }
  }
  throw new Error(feil.join(" | "));
}

// Stemmer avlest nummer med koden? «72136», «72 36», «7236» → 72-36
function samsvarer(lest, kode) {
  const [serie, nr] = String(kode || "").split("-");
  if (!serie || !nr) return false;
  return tolkNummer(lest).some((k) => k.serie === serie && k.sett === parseInt(nr, 10));
}

function lesJson(tekst) {
  const m = String(tekst || "").match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
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

  const r = lesJson(await kjorModell(env, prompt, dataUrl));
  if (!r) return { beslutning: "usikker", notat: "AI ga uklart svar." };

  const lest = r.lest_nummer ? String(r.lest_nummer) : "";
  const forklaring = String(r.forklaring || "").slice(0, 200);

  if (r.er_tog === false) {
    return { beslutning: "avvist", notat: `AI: ser ikke ut til å være et tog. ${forklaring}`.trim() };
  }

  if (samsvarer(lest, enhet.kode)) {
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
    "(på fronten eller siden, ofte øverst ved frontruta). Norske motorvognsett har ofte 5 siffer, " +
    "f.eks. \"72136\" eller \"69072\" (type, vognnummer i settet, settnummer), men kan også stå som \"72 06\" eller \"BM 75 12\". " +
    "Les alle sifrene nøyaktig og ta med alle sifrene du ser.\n" +
    "Svar KUN med JSON, uten annen tekst:\n" +
    '{"er_tog": true/false, "lest_nummer": "nummeret nøyaktig slik det står, eller null hvis du ikke kan lese det", ' +
    '"forklaring": "kort setning på norsk"}';

  const r = lesJson(await kjorModell(env, prompt, dataUrl));
  if (!r) return { erTog: true, lest: null, forklaring: "AI ga uklart svar." };
  const lest = r.lest_nummer && String(r.lest_nummer).toLowerCase() !== "null" ? String(r.lest_nummer) : null;
  return { erTog: r.er_tog !== false, lest, forklaring: String(r.forklaring || "").slice(0, 200) };
}
