// Felles hjelpere for enheter (ett lok / én motorvogn brukeren har sett).
//
// Status:
//   uten_bilde – registrert, men ingen bilde lastet opp ennå
//   venter     – bilde lastet opp, venter på kontroll
//   godkjent   – bildet er kontrollert og riktig → teller som SETT
//   avvist     – bildet var feil (se avvist_grunn), last opp et nytt

export const KOLONNER =
  "id, user_id, kategori, type, kode, tittel, sted, dato, notat, bilde_key, " +
  "(data_url IS NOT NULL) AS har_gammelt_bilde, status, avvist_grunn, vurdert_av, vurdert_tid, ai_notat, opprettet";

export function tilEnhet(r) {
  const harBilde = !!r.bilde_key || !!r.har_gammelt_bilde;
  return {
    id: r.id,
    kategori: r.kategori,
    type: r.type,
    kode: r.kode,
    tittel: r.tittel,
    sted: r.sted,
    dato: r.dato,
    notat: r.notat,
    status: r.status || (harBilde ? "venter" : "uten_bilde"),
    avvistGrunn: r.avvist_grunn || null,
    vurdertTid: r.vurdert_tid || null,
    // Godkjent/avvist uten en admin bak = gjort av AI
    vurdertAvAi: (r.status === "godkjent" || r.status === "avvist") && !r.vurdert_av && !!r.ai_notat,
    aiNotat: r.ai_notat || null,
    // ?v= sørger for at nettleseren henter nytt bilde når det byttes
    bildeUrl: harBilde ? `/api/photos/${r.id}/bilde?v=${encodeURIComponent(r.bilde_key || "gammel")}` : null,
    litenUrl: harBilde ? `/api/photos/${r.id}/bilde?liten=1&v=${encodeURIComponent(r.bilde_key || "gammel")}` : null,
    opprettet: r.opprettet,
    bruker: r.username || undefined,
  };
}

// "72 06", "72.06", "7206" → "72-06" (samme format som flåtelistene)
export function normaliserKode(kode) {
  const k = String(kode || "").trim();
  const m = k.match(/^(\d{2})[\s.\-]?(\d{2})$/);
  return m ? `${m[1]}-${m[2]}` : k;
}
