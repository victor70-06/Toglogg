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

// Tolker et avlest nummer. Norske motorvognsett merkes ofte med 5 siffer:
// TT C NN = type, vogn i settet, settnummer. «72136» = BM 72, vogn 1, sett 72-36.
// «69072» = BM 69, vogn 0, sett 69-72. To siffer etter typen («72 06») = settnummer.
export function tolkNummer(lest) {
  const tekst = String(lest || "");
  const kandidater = [];
  const re = /(?<!\d)(\d{2})\D{0,3}(\d{1,3})(?!\d)/g;
  let m;
  while ((m = re.exec(tekst))) {
    const serie = m[1];
    const rest = m[2];
    if (rest.length === 3) {
      kandidater.push({ serie, sett: parseInt(rest.slice(1), 10), vogn: rest[0] });
    } else {
      kandidater.push({ serie, sett: parseInt(rest, 10), vogn: null });
    }
  }
  return kandidater;
}

// Finner hvilken enhet et avlest nummer tilhører. Bare entydige treff.
export function matchNummer(flate, lest) {
  const treff = new Map();
  for (const k of tolkNummer(lest)) {
    for (const e of flate) {
      const [a, b] = String(e.kode).split("-");
      if (a === k.serie && parseInt(b, 10) === k.sett) treff.set(e.kode + "|" + e.type, { ...e, vogn: k.vogn });
    }
  }
  return treff.size === 1 ? [...treff.values()][0] : null;
}
