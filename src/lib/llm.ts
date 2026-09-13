import { db } from '../db/index.js';
import { addDays, todayISO, weekStart } from './dates.js';
import { addStock, inventoryAsText, setQty } from './inventory.js';
import { mealsAsText, setMeal } from './meals.js';
import { findProduct, findOrCreateProduct, norm, titleCase, validLocation } from './products.js';
import { add as shopAdd, shoppingAsText } from './shopping.js';
import { LOCATIONS, type Slot } from './types.js';

/* ------------------------------------------------------------------ export */

const PREAMBLE = `Questo e lo stato della mia casa: cosa ho in dispensa, la lista della spesa aperta
e il piano dei pasti della settimana. Rispondimi con proposte concrete.

Se mi proponi modifiche, scrivile in questo formato cosi le reincollo nella mia app:
  # DISPENSA            (oppure FRIGO, FREEZER, BAGNO, CANTINA)
  - Nome prodotto: 3    (imposta la quantita a 3)
  - Nome prodotto: +2   (aggiunge 2 a quella che ho)
  # LISTA SPESA
  - pane
  - burro x2
  # PASTI
  - Lunedi pranzo: pasta al pesto
  - Lunedi cena: minestrone
`;

export function buildContext(mondayISO = weekStart(todayISO())): string {
  return [
    PREAMBLE,
    `## Inventario (${todayISO()})`,
    inventoryAsText(),
    '',
    '## Lista della spesa aperta',
    shoppingAsText(),
    '',
    '## Pasti della settimana',
    mealsAsText(mondayISO),
  ].join('\n');
}

/* ------------------------------------------------------------------- parse */

export type Action =
  | { kind: 'inv'; mode: 'set' | 'add'; name: string; qty: number; location: string; productId: number | null; current: number }
  | { kind: 'shop'; name: string; qty: number; productId: number | null }
  | { kind: 'meal'; date: string; slot: Slot; body: string };

export interface ParsedAction { action: Action; label: string; detail: string; tag: 'Nuovo' | 'Aggiorna' | 'Somma'; raw: string }

const DAY_WORDS: Record<string, number> = {
  lunedi: 0, lun: 0, martedi: 1, mar: 1, mercoledi: 2, mer: 2, giovedi: 3, gio: 3,
  venerdi: 4, ven: 4, sabato: 5, sab: 5, domenica: 6, dom: 6,
};

type Section = 'inventory' | 'shopping' | 'meals';

function stripBullet(line: string): string {
  return line.replace(/^\s*(?:[-*•·]|\d+[.)])\s*/, '').trim();
}

const DIACRITICS = /\p{Diacritic}/gu;

function plainNorm(s: string): string {
  return s.normalize('NFD').replace(DIACRITICS, '').toLowerCase().trim();
}

/** Interpreta il testo di un LLM (o una lista incollata dalle note) in azioni proposte. */
export function parseLLM(text: string, mondayISO = weekStart(todayISO())): ParsedAction[] {
  const out: ParsedAction[] = [];
  let section: Section = 'inventory';
  let location: string = LOCATIONS[0];

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    // intestazioni: # DISPENSA / ## Lista spesa / PASTI:
    const head = line.match(/^#{1,6}\s*(.+?)\s*:?\s*$/) ?? line.match(/^([A-Za-zÀ-ÿ ]{3,24}):\s*$/);
    if (head) {
      const h = plainNorm(head[1]!);
      const loc = LOCATIONS.find((l) => plainNorm(l) === h);
      if (loc) { section = 'inventory'; location = loc; continue; }
      if (/lista\s*(della)?\s*spesa|spesa|shopping/.test(h)) { section = 'shopping'; continue; }
      if (/pasti|meal|menu/.test(h)) { section = 'meals'; continue; }
      if (/inventario|dispensa|casa/.test(h)) { section = 'inventory'; continue; }
      continue;
    }

    const body = stripBullet(line);
    if (!body) continue;

    // "Lista spesa: pane, burro, mele" in linea
    const inlineShop = body.match(/^lista\s*(?:della\s*)?spesa\s*[:\-]\s*(.+)$/i);
    if (inlineShop) {
      for (const piece of inlineShop[1]!.split(/[,;]+/)) pushShop(out, piece, line);
      continue;
    }

    // "Lunedi cena: risotto" — riconosciuto anche fuori dalla sezione pasti
    const meal = body.match(/^([A-Za-zÀ-ÿ]+)\.?\s*(?:\d{1,2}(?:[\/.-]\d{1,2})?)?\s*[-–]?\s*(pranzo|cena)\s*[:\-]\s*(.+)$/i);
    if (meal && DAY_WORDS[plainNorm(meal[1]!)] !== undefined) {
      const idx = DAY_WORDS[plainNorm(meal[1]!)]!;
      out.push({
        action: { kind: 'meal', date: addDays(mondayISO, idx), slot: plainNorm(meal[2]!) === 'pranzo' ? 'lunch' : 'dinner', body: meal[3]!.trim() },
        label: meal[3]!.trim(),
        detail: `${titleCase(meal[1]!)} · ${titleCase(meal[2]!)}`,
        tag: 'Aggiorna',
        raw: line,
      });
      continue;
    }

    if (section === 'shopping') { pushShop(out, body, line); continue; }
    if (section === 'meals') continue; // riga pasti non riconosciuta: la ignoriamo

    pushInventory(out, body, location, line);
  }
  return out;
}

function pushShop(out: ParsedAction[], piece: string, raw: string) {
  const { name, qty } = splitQty(piece);
  if (!name) return;
  const product = findProduct(name);
  out.push({
    action: { kind: 'shop', name, qty: qty ?? 1, productId: product?.id ?? null },
    label: product?.name ?? titleCase(name),
    detail: 'Lista spesa',
    tag: product ? 'Aggiorna' : 'Nuovo',
    raw,
  });
}

function pushInventory(out: ParsedAction[], body: string, fallbackLocation: string, raw: string) {
  // posizione esplicita: "… -> Frigo" / "… in Frigo"
  let location = fallbackLocation;
  let rest = body;
  const arrow = body.match(/^(.*?)\s*(?:->|→|=>|\bin\b)\s*([A-Za-zÀ-ÿ]+)\s*$/);
  if (arrow) {
    const loc = LOCATIONS.find((l) => plainNorm(l) === plainNorm(arrow[2]!));
    if (loc) { location = loc; rest = arrow[1]!.trim(); }
  }

  const { name, qty, add } = splitQty(rest);
  if (!name) return;
  const product = findProduct(name);
  const current = product
    ? ((db.prepare('select coalesce(sum(qty),0) as q from inventory where product_id = ?').get(product.id) as { q: number }).q)
    : 0;
  const q = qty ?? 1;
  out.push({
    action: {
      kind: 'inv',
      mode: add ? 'add' : 'set',
      name,
      qty: q,
      location: validLocation(location),
      productId: product?.id ?? null,
      current,
    },
    label: product?.name ?? titleCase(name),
    detail: add ? `${location} · da ${current} a ${current + q}` : `${location} · da ${current} a ${q}`,
    tag: !product ? 'Nuovo' : add ? 'Somma' : 'Aggiorna',
    raw,
  });
}

/** "Latte x3" | "Latte: 3" | "Latte: +2" | "3 Latte" | "Latte" */
function splitQty(s: string): { name: string; qty: number | null; add: boolean } {
  let t = s.trim().replace(/\s+/g, ' ');
  if (!t) return { name: '', qty: null, add: false };

  let m = t.match(/^(.*?)\s*[:=]\s*([+]?)(\d+(?:[.,]\d+)?)\s*(?:pz|pezzi|x)?$/i);
  if (m) return { name: clean(m[1]!), qty: num(m[3]!), add: m[2] === '+' };

  m = t.match(/^(.*?)\s*[x×]\s*(\d+(?:[.,]\d+)?)$/i);
  if (m) return { name: clean(m[1]!), qty: num(m[2]!), add: false };

  m = t.match(/^(.*?)\s+([+])(\d+(?:[.,]\d+)?)$/);
  if (m) return { name: clean(m[1]!), qty: num(m[3]!), add: true };

  m = t.match(/^(.*?)\s+(\d+(?:[.,]\d+)?)$/);
  if (m && clean(m[1]!)) return { name: clean(m[1]!), qty: num(m[2]!), add: false };

  m = t.match(/^(\d+(?:[.,]\d+)?)\s*[x×]?\s+(.+)$/);
  if (m) return { name: clean(m[2]!), qty: num(m[1]!), add: false };

  return { name: clean(t), qty: null, add: false };
}

const clean = (s: string) => s.replace(/["'`]/g, '').replace(/[\s,;.]+$/, '').trim();
const num = (s: string) => Number(s.replace(',', '.'));

/* ------------------------------------------------------------------- apply */

export function applyActions(actions: Action[], userId: number): number {
  const tx = db.transaction(() => {
    let n = 0;
    for (const a of actions) {
      if (a.kind === 'inv') {
        const product = a.productId
          ? { id: a.productId }
          : findOrCreateProduct(a.name, a.location);
        if (a.mode === 'add') {
          addStock(product.id, a.location, a.qty, userId);
        } else {
          const existing = db
            .prepare('select id from inventory where product_id = ? and location = ?')
            .get(product.id, a.location) as { id: number } | undefined;
          if (existing) setQty(existing.id, a.qty, userId);
          else addStock(product.id, a.location, a.qty, userId);
        }
        n++;
      } else if (a.kind === 'shop') {
        shopAdd(a.name, a.qty, userId, 'llm');
        n++;
      } else {
        setMeal(a.date, a.slot, a.body, userId);
        n++;
      }
    }
    return n;
  });
  return tx();
}

export { norm };
