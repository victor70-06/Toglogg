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

function normType(t) {
  return String(t || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Finner hvilken enhet et avlest nummer tilhører. Bare entydige treff.
// typeHint (det AI tror typen er, f.eks. "El 18") brukes når flere passer.
export function matchNummer(flate, lest, typeHint) {
  const treff = new Map();
  const legg = (e, vogn) => treff.set(e.kode + "|" + e.type, { ...e, vogn: vogn ?? null });

  // Motorvognsett: TT-NN / TT C NN
  for (const k of tolkNummer(lest)) {
    for (const e of flate) {
      if (!/^\d{2}-\d{2}$/.test(e.kode)) continue;
      const [a, b] = e.kode.split("-");
      if (a === k.serie && parseInt(b, 10) === k.sett) legg(e, k.vogn);
    }
  }

  // Lok: hele nummeret, f.eks. "2245", "651", "312.001", "214 022"
  const grupper = String(lest || "").match(/\d[\d .]*\d|\d/g) || [];
  const sifferGrupper = [...grupper.map((g) => g.replace(/\D/g, "")), ...(String(lest || "").match(/\d+/g) || [])];
  const alleSiffer = String(lest || "").replace(/\D/g, "");
  for (const e of flate) {
    if (/^\d{2}-\d{2}$/.test(e.kode)) continue;
    const s = String(e.kode).replace(/\D/g, "");
    if (s.length < 3) continue;
    if (sifferGrupper.includes(s) || alleSiffer === s || (s.length >= 4 && sifferGrupper.some((g) => g.endsWith(s)))) legg(e);
  }

  let liste = [...treff.values()];
  if (liste.length > 1 && typeHint) {
    const h = normType(typeHint);
    const passer = liste.filter((e) => normType(e.type) === h || h.includes(normType(e.type)) || normType(e.type).includes(h));
    if (passer.length) liste = passer;
  }
  return liste.length === 1 ? liste[0] : null;
}
