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

export function titleCase(s: string): string {
  const t = s.trim().replace(/\s+/g, ' ');
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export function validLocation(s: string | undefined | null): string {
  return LOCATIONS.includes(s as (typeof LOCATIONS)[number]) ? s! : LOCATIONS[0];
}

export interface Product { id: number; name: string; unit: string | null; default_location: string }

/** Cerca un prodotto per nome o alias. Non crea nulla. */
export function findProduct(name: string): Product | null {
  const n = norm(name);
  if (!n) return null;
  const direct = db
    .prepare<[string], Product>('select id, name, unit, default_location from products where norm = ?')
    .get(n);
  if (direct) return direct;
  return (
    db
      .prepare<[string], Product>(
        `select p.id, p.name, p.unit, p.default_location from product_aliases a
         join products p on p.id = a.product_id where a.alias_norm = ?`,
      )
      .get(n) ?? null
  );
}

/** Trova il prodotto o lo crea nel catalogo. */
export function findOrCreateProduct(name: string, location?: string): Product {
  const existing = findProduct(name);
  if (existing) return existing;
  const clean = titleCase(name);
  const info = db
    .prepare('insert into products (name, norm, default_location) values (?, ?, ?)')
    .run(clean, norm(clean), validLocation(location));
  return { id: Number(info.lastInsertRowid), name: clean, unit: null, default_location: validLocation(location) };
}

export function addAlias(productId: number, alias: string) {
  const n = norm(alias);
  if (!n) return;
  db.prepare('insert or ignore into product_aliases (alias_norm, product_id) values (?, ?)').run(n, productId);
}

/** Suggerimenti per l'autocomplete: prefisso prima, poi contenuto. */
export interface Suggestion { id: number; name: string; location: string; qty: number }
export function suggestProducts(q: string, limit = 6): Suggestion[] {
  const n = norm(q);
  if (!n) return [];
  const pref = `${n}%`, any = `%${n}%`;
  // Solo segnaposto `?` anonimi: con `?1`/`?2` better-sqlite3 li considera
  // parametri nominati e rifiuta gli argomenti posizionali.
  return db
    .prepare(
      `select p.id, p.name,
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
