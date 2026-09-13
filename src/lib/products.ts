import { db } from '../db/index.js';
import { fmtMeasure, type Measure } from './measure.js';
import { LOCATIONS, validCategory } from './types.js';

/** Chiave di confronto: minuscolo, senza accenti, senza punteggiatura, spazi compressi. */
export function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Identita di un prodotto: nome + misura. "Ceci 230 g" e "Ceci 400 g" sono
 * due prodotti diversi, perche in dispensa sono due barattoli diversi.
 */
export function productKey(name: string, size?: string | null): string {
  return norm(size ? `${name} ${size}` : name);
}

export function titleCase(s: string): string {
  const t = s.trim().replace(/\s+/g, ' ');
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export function validLocation(s: string | undefined | null): string {
  return LOCATIONS.includes(s as (typeof LOCATIONS)[number]) ? s! : LOCATIONS[0];
}

export interface Product {
  id: number;
  name: string;
  /** Testo da mostrare, derivato da size_value + size_unit. Entra in `norm`. */
  size: string | null;
  size_value: number | null;
  size_unit: string | null;
  category: string | null;
  unit: string | null;
  default_location: string;
}

const COLS = ['id', 'name', 'size', 'size_value', 'size_unit', 'category', 'unit', 'default_location'];
const PLAIN = COLS.join(', ');
const PREFIXED = COLS.map((c) => `p.${c}`).join(', ');

export function getProduct(id: number): Product | null {
  return (db.prepare(`select ${PLAIN} from products where id = ?`).get(id) as Product | undefined) ?? null;
}

/** Cerca un prodotto per nome+misura o per alias. Non crea nulla. */
export function findProduct(name: string, size?: string | null): Product | null {
  const key = productKey(name, size);
  if (!key) return null;
  const direct = db.prepare(`select ${PLAIN} from products where norm = ?`).get(key) as Product | undefined;
  if (direct) return direct;
  return (
    (db
      .prepare(
        `select ${PREFIXED} from product_aliases a
         join products p on p.id = a.product_id where a.alias_norm = ?`,
      )
      .get(key) as Product | undefined) ?? null
  );
}

/**
 * Trova il prodotto o lo crea nel catalogo.
 *
 * Le opzioni sono un oggetto di proposito: misura, posizione e categoria sono
 * tutte stringhe, e passandole per posizione e gia successo di scambiarle
 * senza che il compilatore dicesse niente.
 *
 * Se il prodotto c'e gia ma e senza categoria, quella indicata qui la riempie:
 * il catalogo si completa mano a mano che si usa, senza mai sovrascrivere
 * una scelta gia fatta.
 */
export function findOrCreateProduct(
  name: string,
  opts: { measure?: Measure | null; location?: string; category?: string | null } = {},
): Product {
  const { measure = null, location, category = null } = opts;
  const size = fmtMeasure(measure);
  const wanted = validCategory(category);

  const existing = findProduct(name, size);
  if (existing) {
    if (wanted && !existing.category) {
      db.prepare('update products set category = ? where id = ?').run(wanted, existing.id);
      existing.category = wanted;
    }
    return existing;
  }

  const clean = titleCase(name);
  const loc = validLocation(location);
  const info = db
    .prepare(
      'insert into products (name, size, size_value, size_unit, category, norm, default_location) values (?, ?, ?, ?, ?, ?, ?)',
    )
    .run(clean, size, measure?.value ?? null, measure?.unit ?? null, wanted, productKey(clean, size), loc);
  return {
    id: Number(info.lastInsertRowid),
    name: clean,
    size,
    size_value: measure?.value ?? null,
    size_unit: measure?.unit ?? null,
    category: wanted,
    unit: null,
    default_location: loc,
  };
}

export function addAlias(productId: number, alias: string) {
  const n = norm(alias);
  if (!n) return;
  db.prepare('insert or ignore into product_aliases (alias_norm, product_id) values (?, ?)').run(n, productId);
}

/** Etichetta completa: "Ceci 230 g". */
export const productLabel = (p: { name: string; size?: string | null }) => (p.size ? `${p.name} ${p.size}` : p.name);

/* ------------------------------------------------------------- modifiche */

export function setProductCategory(productId: number, category: string | null) {
  db.prepare('update products set category = ? where id = ?').run(validCategory(category), productId);
}

/**
 * Cambia la misura di un prodotto, e con lei la sua identita in catalogo.
 *
 * Se la misura nuova porta su un prodotto che esiste gia (i ceci da 230 messi
 * a 400, quando i 400 sono gia a catalogo) le due schede vengono fuse: senza
 * questo l'update sbatterebbe contro l'unicita di `norm` e la pagina darebbe
 * errore. Ritorna l'id del prodotto risultante, che puo essere un altro.
 */
export function setProductMeasure(productId: number, measure: Measure | null): number {
  const p = getProduct(productId);
  if (!p) return productId;

  const size = fmtMeasure(measure);
  const key = productKey(p.name, size);
  const clash = key
    ? (db.prepare('select id from products where norm = ? and id <> ?').get(key, productId) as
        | { id: number }
        | undefined)
    : undefined;

  if (clash) {
    mergeProducts(productId, clash.id);
    return clash.id;
  }

  db.prepare('update products set size = ?, size_value = ?, size_unit = ?, norm = ? where id = ?').run(
    size,
    measure?.value ?? null,
    measure?.unit ?? null,
    key,
    productId,
  );
  return productId;
}

/** Fonde `from` dentro `into`: quantita sommate, riferimenti spostati, scheda eliminata. */
function mergeProducts(from: number, into: number) {
  db.transaction(() => {
    const rows = db.prepare('select id, location, qty from inventory where product_id = ?').all(from) as {
      id: number;
      location: string;
      qty: number;
    }[];
    for (const r of rows) {
      const target = db.prepare('select id from inventory where product_id = ? and location = ?').get(into, r.location) as
        | { id: number }
        | undefined;
      if (target) {
        db.prepare(
          `update inventory set qty = qty + ?, zeroed_at = null, updated_at = datetime('now') where id = ?`,
        ).run(r.qty, target.id);
        db.prepare('delete from inventory where id = ?').run(r.id);
      } else {
        db.prepare('update inventory set product_id = ? where id = ?').run(into, r.id);
      }
    }

    db.prepare('update shopping_items set product_id = ? where product_id = ?').run(into, from);
    // due righe aperte per lo stesso prodotto sarebbero un doppione visibile
    const open = db
      .prepare(
        'select id, qty from shopping_items where product_id = ? and loaded_at is null and checked_at is null order by id',
      )
      .all(into) as { id: number; qty: number }[];
    if (open.length > 1) {
      const total = open.reduce((s, r) => s + r.qty, 0);
      db.prepare('update shopping_items set qty = ? where id = ?').run(total, open[0]!.id);
      for (const r of open.slice(1)) db.prepare('delete from shopping_items where id = ?').run(r.id);
    }

    db.prepare('update product_aliases set product_id = ? where product_id = ?').run(into, from);
    // il vecchio nome resta come alias, cosi chi lo cerca lo ritrova
    const old = db.prepare('select norm from products where id = ?').get(from) as { norm: string } | undefined;
    if (old) addAlias(into, old.norm);
    db.prepare('delete from products where id = ?').run(from);
  })();
}

/* ---------------------------------------------------------- autocomplete */

export interface Suggestion {
  id: number;
  name: string;
  size: string | null;
  category: string | null;
  location: string;
  qty: number;
}

/** Suggerimenti per l'autocomplete: prefisso prima, poi contenuto. */
export function suggestProducts(q: string, limit = 6): Suggestion[] {
  const n = norm(q);
  if (!n) return [];
  const pref = `${n}%`,
    any = `%${n}%`;
  // Solo segnaposto `?` anonimi: con `?1`/`?2` better-sqlite3 li considera
  // parametri nominati e rifiuta gli argomenti posizionali.
  return db
    .prepare(
      `select p.id, p.name, p.size, p.category,
              coalesce(inv.location, p.default_location) as location,
              coalesce(inv.qty, 0) as qty
       from products p
       left join (
         select product_id, location, qty,
                row_number() over (partition by product_id order by qty desc, id) as rn
         from inventory
       ) inv on inv.product_id = p.id and inv.rn = 1
       where p.norm like ?
          or p.id in (select product_id from product_aliases where alias_norm like ?)
       order by (p.norm like ?) desc, coalesce(inv.qty, 0) > 0 desc, p.name
       limit ?`,
    )
    .all(any, any, pref, limit) as Suggestion[];
}
