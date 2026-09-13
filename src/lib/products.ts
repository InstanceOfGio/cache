import { db } from '../db/index.js';
import { LOCATIONS } from './types.js';

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
 * Identita di un prodotto: nome + formato. "Ceci 230 g" e "Ceci 400 g" sono
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
  size: string | null;
  unit: string | null;
  default_location: string;
}

const COLS = 'id, name, size, unit, default_location';

/** Cerca un prodotto per nome+formato o per alias. Non crea nulla. */
export function findProduct(name: string, size?: string | null): Product | null {
  const key = productKey(name, size);
  if (!key) return null;
  const direct = db.prepare(`select ${COLS} from products where norm = ?`).get(key) as Product | undefined;
  if (direct) return direct;
  return (
    (db
      .prepare(
        `select p.${COLS.split(', ').join(', p.')} from product_aliases a
         join products p on p.id = a.product_id where a.alias_norm = ?`,
      )
      .get(key) as Product | undefined) ?? null
  );
}

/**
 * Trova il prodotto o lo crea nel catalogo.
 *
 * Le opzioni sono un oggetto di proposito: `size` e `location` sono entrambe
 * stringhe, e passandole per posizione e gia successo di scambiarle senza che
 * il compilatore dicesse niente.
 */
export function findOrCreateProduct(
  name: string,
  opts: { size?: string | null; location?: string } = {},
): Product {
  const { size = null, location } = opts;
  const existing = findProduct(name, size);
  if (existing) return existing;
  const clean = titleCase(name);
  const loc = validLocation(location);
  const info = db
    .prepare('insert into products (name, size, norm, default_location) values (?, ?, ?, ?)')
    .run(clean, size ?? null, productKey(clean, size), loc);
  return { id: Number(info.lastInsertRowid), name: clean, size: size ?? null, unit: null, default_location: loc };
}

export function addAlias(productId: number, alias: string) {
  const n = norm(alias);
  if (!n) return;
  db.prepare('insert or ignore into product_aliases (alias_norm, product_id) values (?, ?)').run(n, productId);
}

/** Etichetta completa: "Ceci 230 g". */
export const productLabel = (p: { name: string; size?: string | null }) => (p.size ? `${p.name} ${p.size}` : p.name);

/** Suggerimenti per l'autocomplete: prefisso prima, poi contenuto. */
export interface Suggestion {
  id: number;
  name: string;
  size: string | null;
  location: string;
  qty: number;
}

export function suggestProducts(q: string, limit = 6): Suggestion[] {
  const n = norm(q);
  if (!n) return [];
  const pref = `${n}%`,
    any = `%${n}%`;
  // Solo segnaposto `?` anonimi: con `?1`/`?2` better-sqlite3 li considera
  // parametri nominati e rifiuta gli argomenti posizionali.
  return db
    .prepare(
      `select p.id, p.name, p.size,
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
