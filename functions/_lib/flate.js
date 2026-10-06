// Leser flåtelistene fra public/flate/*.json (samme filer som nettsiden bruker).
// Bare typene i disse filene er gyldige.

const FILER = [
  { fil: "/flate/motorvogner.json", kategori: "Motorvogn" },
  { fil: "/flate/lok.json", kategori: "Lok" },
];

export async function hentFlate(env, request) {
  const enheter = []; // { kategori, type, kode, siffer }
  for (const { fil, kategori } of FILER) {
    try {
      const res = await env.ASSETS.fetch(new Request(new URL(fil, request.url)));
      if (!res.ok) continue;
      const data = await res.json();
      for (const [type, koder] of Object.entries(data.typer || {})) {
        for (const kode of koder) {
          enheter.push({ kategori, type, kode, siffer: String(kode).replace(/\D/g, "") });
        }
      }
    } catch {
      // mangler filen, hopp over
    }
  }
  return enheter;
}

export function finnIFlate(flate, kategori, type, kode) {
  return flate.find((e) => e.kategori === kategori && e.type === type && e.kode === kode) || null;
}

// Finner hvilken enhet et avlest nummer tilhører, f.eks. "BM 72 06", "7206"
// eller "73 041" → 72-06 / 73-41. Returnerer bare et treff hvis det er entydig.
export function matchNummer(flate, lest) {
  const tekst = String(lest || "");
  const treff = new Map();
  const re = /(?<!\d)(\d{2})\D{0,3}(\d{1,3})(?!\d)/g;
  let m;
  while ((m = re.exec(tekst))) {
    const serie = m[1];
    const nr = parseInt(m[2], 10);
    for (const e of flate) {
      const [a, b] = String(e.kode).split("-");
      if (a === serie && parseInt(b, 10) === nr) treff.set(e.kode + "|" + e.type, e);
    }
  }
  return treff.size === 1 ? [...treff.values()][0] : null;
}
