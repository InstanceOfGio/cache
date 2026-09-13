import { db } from '../db/index.js';
import { addDays, todayISO, weekStart } from './dates.js';
import { addStock, inventoryAsText, setQty } from './inventory.js';
import { mealsAsText, setMeal } from './meals.js';
import { parseLine, stripBullet, stripWhatsApp } from './parse.js';
import { findOrCreateProduct, findProduct, norm, productKey, productLabel, titleCase, validLocation } from './products.js';
import { add as shopAdd, shoppingAsText } from './shopping.js';
import { LOCATIONS, type Slot } from './types.js';

/* ------------------------------------------------------------------ export */

const PREAMBLE = `Questo e lo stato della mia casa: cosa ho in dispensa, la lista della spesa aperta
e il piano dei pasti della settimana. Rispondimi con proposte concrete.

Se mi proponi modifiche, scrivile in questo formato cosi le reincollo nella mia app:
  # DISPENSA            (oppure FRIGO, FREEZER, BAGNO, CANTINA)
  - Ceci 230 g: 3       (tre barattoli da 230 g)
  - Farina 00 1 kg: +1  (aggiunge una confezione a quelle che ho)
  # LISTA SPESA
  - pane
  - burro x2
  # PASTI
  - Lunedi pranzo: pasta al pesto
  - Lunedi cena: minestrone

Il peso e il formato della confezione, non la quantita: "Riso basmati 1150 g" e
una busta da 1150 grammi. Per averne due si scrive "Riso basmati 1150 g x2".
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
  | {
      kind: 'inv';
      mode: 'set' | 'add';
      name: string;
      size: string | null;
      qty: number;
      location: string;
      productId: number | null;
      current: number;
      expiresOn: string | null;
    }
  | { kind: 'shop'; name: string; size: string | null; qty: number; productId: number | null }
  | { kind: 'meal'; date: string; slot: Slot; body: string };

export interface ParsedAction {
  action: Action;
  label: string;
  detail: string;
  tag: 'Nuovo' | 'Aggiorna' | 'Somma';
  raw: string;
}

const DAY_WORDS: Record<string, number> = {
  lunedi: 0, lun: 0, martedi: 1, mar: 1, mercoledi: 2, mer: 2, giovedi: 3, gio: 3,
  venerdi: 4, ven: 4, sabato: 5, sab: 5, domenica: 6, dom: 6,
};

type Section = 'inventory' | 'shopping' | 'meals';

const DIACRITICS = /\p{Diacritic}/gu;

function plainNorm(s: string): string {
  return s.normalize('NFD').replace(DIACRITICS, '').toLowerCase().trim();
}

/** Interpreta il testo di un LLM (o una lista incollata da WhatsApp) in azioni proposte. */
export function parseLLM(text: string, mondayISO = weekStart(todayISO())): ParsedAction[] {
  const out: ParsedAction[] = [];
  let section: Section = 'inventory';
  let location: string = LOCATIONS[0];
  /**
   * Quanto avra quel prodotto dopo le righe gia lette. Una lista scritta a mano
   * nomina lo stesso articolo piu volte ("Tonno 52 g" oggi, "Tonno 52 g x3" domani):
   * dalla seconda volta in poi si somma, altrimenti l'ultima riga cancella le altre.
   */
  const running = new Map<string, number>();

  for (const rawLine of text.split(/\r?\n/)) {
    const line = stripWhatsApp(rawLine).trim();
    if (!line) continue;

    // intestazioni: "# DISPENSA", "Lista spesa:", o una posizione da sola su una riga
    const heading =
      line.match(/^#{1,6}\s*(.+?)\s*:?\s*$/)?.[1] ??
      line.match(/^([A-Za-zÀ-ÿ ]{3,24}):\s*$/)?.[1] ??
      (LOCATIONS.some((l) => plainNorm(l) === plainNorm(stripBullet(line))) ? stripBullet(line) : null);

    if (heading) {
      const h = plainNorm(heading);
      const loc = LOCATIONS.find((l) => plainNorm(l) === h);
      if (loc) { section = 'inventory'; location = loc; continue; }
      if (/lista\s*(della)?\s*spesa|shopping/.test(h)) { section = 'shopping'; continue; }
      if (/^(pasti|meal|menu)$/.test(h)) { section = 'meals'; continue; }
      if (/^(inventario|casa)$/.test(h)) { section = 'inventory'; continue; }
      // intestazione non riconosciuta: la trattiamo come riga normale
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
    const meal = body.match(/^([A-Za-zÀ-ÿ]+)\.?\s*(?:\d{1,2}(?:[/.\-]\d{1,2})?)?\s*[-–]?\s*(pranzo|cena)\s*[:\-]\s*(.+)$/i);
    if (meal && DAY_WORDS[plainNorm(meal[1]!)] !== undefined) {
      const idx = DAY_WORDS[plainNorm(meal[1]!)]!;
      out.push({
        action: {
          kind: 'meal',
          date: addDays(mondayISO, idx),
          slot: plainNorm(meal[2]!) === 'pranzo' ? 'lunch' : 'dinner',
          body: meal[3]!.trim(),
        },
        label: meal[3]!.trim(),
        detail: `${titleCase(meal[1]!)} · ${titleCase(meal[2]!)}`,
        tag: 'Aggiorna',
        raw: line,
      });
      continue;
    }

    if (section === 'shopping') { pushShop(out, body, line); continue; }
    if (section === 'meals') continue; // riga pasti non riconosciuta: la ignoriamo

    pushInventory(out, body, location, line, running);
  }
  return out;
}

function pushShop(out: ParsedAction[], piece: string, raw: string) {
  const parsed = parseLine(piece);
  if (!parsed) return;
  const product = findProduct(parsed.name, parsed.size);
  out.push({
    action: { kind: 'shop', name: parsed.name, size: parsed.size, qty: parsed.qty, productId: product?.id ?? null },
    label: productLabel(product ?? parsed),
    detail: 'Lista spesa',
    tag: product ? 'Aggiorna' : 'Nuovo',
    raw,
  });
}

function pushInventory(
  out: ParsedAction[],
  body: string,
  fallbackLocation: string,
  raw: string,
  running: Map<string, number>,
) {
  // posizione esplicita in coda: "… -> Frigo" / "… in Frigo"
  let location = fallbackLocation;
  let rest = body;
  const arrow = body.match(/^(.*?)\s*(?:->|→|=>|\bin\b)\s*([A-Za-zÀ-ÿ]+)\s*$/);
  if (arrow) {
    const loc = LOCATIONS.find((l) => plainNorm(l) === plainNorm(arrow[2]!));
    if (loc) { location = loc; rest = arrow[1]!.trim(); }
  }

  const parsed = parseLine(rest);
  if (!parsed) return;

  const product = findProduct(parsed.name, parsed.size);
  const inStock = product
    ? (db.prepare('select coalesce(sum(qty),0) as q from inventory where product_id = ?').get(product.id) as { q: number }).q
    : 0;

  const key = `${productKey(parsed.name, parsed.size)}|${location}`;
  const alreadyNamed = running.has(key);
  const current = running.get(key) ?? inStock;
  // gia nominato in questa lista: somma, altrimenti l'ultima riga cancella le altre
  const mode: 'set' | 'add' = parsed.add || alreadyNamed ? 'add' : 'set';
  const after = mode === 'add' ? current + parsed.qty : parsed.qty;
  running.set(key, after);

  const bits = [location, `da ${current} a ${after}`];
  if (parsed.expiresOn) bits.push(`scade ${parsed.expiresOn.slice(8)}/${parsed.expiresOn.slice(5, 7)}`);

  out.push({
    action: {
      kind: 'inv',
      mode,
      name: parsed.name,
      size: parsed.size,
      qty: parsed.qty,
      location: validLocation(location),
      productId: product?.id ?? null,
      current,
      expiresOn: parsed.expiresOn,
    },
    label: productLabel(product ?? parsed),
    detail: bits.join(' · '),
    tag: mode === 'add' ? 'Somma' : product ? 'Aggiorna' : 'Nuovo',
    raw,
  });
}

/* ------------------------------------------------------------------- apply */

export function applyActions(actions: Action[], userId: number): number {
  const tx = db.transaction(() => {
    let n = 0;
    for (const a of actions) {
      if (a.kind === 'inv') {
        const product = a.productId ? { id: a.productId } : findOrCreateProduct(a.name, { size: a.size, location: a.location });
        const existing = db
          .prepare('select id from inventory where product_id = ? and location = ?')
          .get(product.id, a.location) as { id: number } | undefined;

        let invId: number;
        if (a.mode === 'add' || !existing) {
          invId = addStock(product.id, a.location, a.qty, userId);
        } else {
          setQty(existing.id, a.qty, userId);
          invId = existing.id;
        }
        if (a.expiresOn) db.prepare('update inventory set expires_on = ? where id = ?').run(a.expiresOn, invId);
        n++;
      } else if (a.kind === 'shop') {
        shopAdd(a.name, a.qty, userId, 'llm', a.size);
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
