/**
 * Estrae da una riga scritta a mano: nome, formato (peso/volume), quantita e scadenza.
 *
 * Il caso che conta davvero e la lista della dispensa buttata giu su WhatsApp,
 * dove i numeri sono quasi sempre PESI e non conteggi: "Riso basmati 1150 gr"
 * e una busta da 1150 grammi, non 1150 buste.
 */

const UNITS: Record<string, string> = {
  g: 'g', gr: 'g', gramm: 'g', grammi: 'g', grammo: 'g',
  gt: 'g', // refuso comune per "gr"
  kg: 'kg', kilo: 'kg', kili: 'kg', chili: 'kg',
  ml: 'ml', cl: 'cl',
  l: 'l', lt: 'l', litro: 'l', litri: 'l',
};

const UNIT_RE = new RegExp(
  String.raw`(\d+(?:[.,]\d+)?)\s*(${Object.keys(UNITS).sort((a, b) => b.length - a.length).join('|')})\b`,
  'gi',
);

/** Parole che contano pezzi: "3 buste", "12 lattine". */
const COUNTERS =
  'buste|bustine|busta|capi|capo|lattine|lattina|sacchetti|sacchetto|quadrati|quadratini|barattoli|barattolo|confezioni|confezione|vasetti|vasetto|pezzi|pezzo|scatole|scatola';

const MONTHS: Record<string, number> = {
  gennaio: 1, febbraio: 2, marzo: 3, aprile: 4, maggio: 5, giugno: 6,
  luglio: 7, agosto: 8, settembre: 9, ottobre: 10, novembre: 11, dicembre: 12,
  gen: 1, feb: 2, mar: 3, apr: 4, mag: 5, giu: 6, lug: 7, ago: 8, set: 9, ott: 10, nov: 11, dic: 12,
};

export interface ParsedLine {
  name: string;
  size: string | null;
  qty: number;
  /** true se la riga diceva "+2": somma invece di impostare. */
  add: boolean;
  expiresOn: string | null;
}

/** Toglie il prefisso di un export WhatsApp: "[15:19, 9/13/2026] F.: ". */
export function stripWhatsApp(line: string): string {
  return line.replace(/^\s*\[?\d{1,2}[:.]\d{2}(?::\d{2})?(?:\s*[AP]M)?,?\s*\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\]?\s*[^:]{0,40}?:\s*/i, '').trim();
}

/** Toglie elenchi puntati e numerazioni. */
export function stripBullet(line: string): string {
  return line.replace(/^\s*(?:[-*•·–]|\d+[.)])\s+/, '').trim();
}

/** Parole che descrivono il peso, non il prodotto: "Olive toscane sgocciolate". */
const NOISE = /\b(?:sgocciolat[oiae]|sgocc|scolat[oiae]|netto|lordo|circa|ca)\b/gi;

function tidy(s: string): string {
  return s
    .replace(NOISE, ' ')
    .replace(/\s*[x×]\s*$/i, '')
    .replace(/[/,;:=+]+\s*$/, '')
    .replace(/(?:^|\s)(?:da|di|per)\s*$/i, '') // preposizione rimasta orfana
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s\-–]+|[\s\-–]+$/g, '')
    .trim();
}

/**
 * Un numero nudo vale come quantita solo se e plausibile contare quelle cose.
 * "Lurpak burro 200" sono 200 grammi, non 200 panetti; "00" e il tipo di farina.
 */
const MAX_BARE_COUNT = 20;
function plausibleCount(raw: string): number | null {
  if (/^0\d/.test(raw)) return null; // "00", "07": fa parte del nome
  const n = Number(raw);
  return n >= 1 && n <= MAX_BARE_COUNT ? n : null;
}

const num = (s: string) => Number(s.replace(',', '.'));

/** Formato leggibile: "230 g", "1,5 kg". */
function formatSize(value: number, unit: string): string {
  const v = Number.isInteger(value) ? String(value) : String(value).replace('.', ',');
  return `${v} ${unit}`;
}

/**
 * Il primo peso/volume della riga diventa il formato; gli altri (peso sgocciolato,
 * peso totale) vengono tolti dal nome perche non aggiungono identita.
 */
export function extractSize(text: string): { rest: string; size: string | null } {
  const matches = [...text.matchAll(UNIT_RE)];
  if (!matches.length) return { rest: text, size: null };
  const first = matches[0]!;
  const size = formatSize(num(first[1]!), UNITS[first[2]!.toLowerCase()]!);
  return { rest: tidy(text.replace(UNIT_RE, ' ')), size };
}

/** "scade 17 settembre", "scadono 21 09", "scad. 21/09/2026". */
export function extractExpiry(text: string, today = new Date()): { rest: string; expiresOn: string | null } {
  const re = new RegExp(
    String.raw`\bscad\w*\.?\s*(?:il\s+)?(\d{1,2})\s*(?:[/\-.\s]\s*)(\d{1,2}|[a-zàèéìòù]+)\s*(?:[/\-.\s]\s*(\d{2,4}))?`,
    'i',
  );
  const m = text.match(re);
  if (!m) return { rest: text, expiresOn: null };

  const day = Number(m[1]);
  const monthRaw = m[2]!.toLowerCase();
  const month = /^\d+$/.test(monthRaw) ? Number(monthRaw) : MONTHS[monthRaw];
  if (!month || month < 1 || month > 12 || day < 1 || day > 31) {
    return { rest: tidy(text.replace(re, ' ')), expiresOn: null };
  }
  let year = m[3] ? Number(m[3].length === 2 ? `20${m[3]}` : m[3]) : today.getFullYear();
  // senza anno: se la data e gia passata da un pezzo, intende l'anno prossimo
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (!m[3] && candidate.getTime() < today.getTime() - 60 * 864e5) year++;

  const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return { rest: tidy(text.replace(re, ' ')), expiresOn: iso };
}

/**
 * Quantita: "x3", "3 x", "4 x ceci", "5 kiwi", "3 buste".
 * Va chiamata DOPO extractSize, altrimenti i pesi sembrano conteggi.
 */
export function extractCount(text: string): { rest: string; qty: number | null; add: boolean } {
  let t = text;

  // "+2" esplicito: somma a quello che c'e gia
  const plus = t.match(/(?:^|\s)\+\s*(\d+(?:[.,]\d+)?)(?:\s|$)/);
  if (plus) return { rest: tidy(t.replace(plus[0], ' ')), qty: num(plus[1]!), add: true };

  // "3 buste", "12 lattine": la parola-contatore e il segnale piu forte,
  // e va tolta dal nome insieme al numero
  const counter = t.match(new RegExp(String.raw`(?:^|\s)(\d+)\s*(?:${COUNTERS})\b`, 'i'));
  if (counter) return { rest: tidy(t.replace(counter[0], ' ')), qty: Number(counter[1]), add: false };

  // "x3" / "× 3" in qualunque punto
  const x = t.match(/(?:^|\s)[x×]\s*(\d+(?:[.,]\d+)?)(?:\s|$)/i);
  if (x) return { rest: tidy(t.replace(x[0], ' ')), qty: num(x[1]!), add: false };

  // "3 x" davanti a qualcosa
  const xLead = t.match(/(?:^|\s)(\d+(?:[.,]\d+)?)\s*[x×](?:\s|$)/i);
  if (xLead) return { rest: tidy(t.replace(xLead[0], ' ')), qty: num(xLead[1]!), add: false };

  // "5 kiwi": numero in testa seguito da parole
  const lead = t.match(/^(\d{1,3})\s+(?=\D)/);
  const leadQty = lead ? plausibleCount(lead[1]!) : null;
  if (lead && leadQty) return { rest: tidy(t.slice(lead[0].length)), qty: leadQty, add: false };

  // "Uova medie 6": numero in coda, solo se resta un nome sensato
  const trail = t.match(/^(.*\D)\s+(\d{1,3})$/);
  const trailQty = trail ? plausibleCount(trail[2]!) : null;
  if (trail && trailQty && tidy(trail[1]!).length > 2) {
    return { rest: tidy(trail[1]!), qty: trailQty, add: false };
  }

  return { rest: tidy(t), qty: null, add: false };
}

/** Il giro completo su una riga. Ritorna null se non resta un nome. */
export function parseLine(raw: string, today = new Date()): ParsedLine | null {
  const cleaned = stripBullet(stripWhatsApp(raw));
  if (!cleaned) return null;

  const withExpiry = extractExpiry(cleaned, today);
  const withSize = extractSize(withExpiry.rest);
  const withCount = extractCount(withSize.rest);

  const name = tidy(withCount.rest);
  if (!name || !/[a-zàèéìòù]/i.test(name)) return null;

  return {
    name: name.charAt(0).toUpperCase() + name.slice(1),
    size: withSize.size,
    qty: withCount.qty ?? 1,
    add: withCount.add,
    expiresOn: withExpiry.expiresOn,
  };
}
