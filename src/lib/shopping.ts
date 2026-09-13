import { db, logActivity } from '../db/index.js';
import { addStock } from './inventory.js';
import { findOrCreateProduct } from './products.js';
import type { ShoppingRow } from './types.js';

const SELECT = `
  select s.id, s.product_id,
         coalesce(p.name, s.free_text) as name, p.size,
         s.qty, s.note, s.source, s.added_by,
         u.display_name as added_name, u.color as added_color,
         s.checked_at,
         (select i.location from inventory i where i.product_id = s.product_id order by i.qty desc, i.id limit 1) as location
  from shopping_items s
  left join products p on p.id = s.product_id
  left join users u on u.id = s.added_by`;

/** Da prendere prima, spuntati in fondo. */
export function listOpen(): ShoppingRow[] {
  return db
    .prepare(`${SELECT} where s.loaded_at is null order by (s.checked_at is not null), s.created_at`)
    .all() as ShoppingRow[];
}

export function listChecked(): ShoppingRow[] {
  return db
    .prepare(`${SELECT} where s.loaded_at is null and s.checked_at is not null order by s.checked_at`)
    .all() as ShoppingRow[];
}

export function counts(): { todo: number; done: number } {
  const r = db
    .prepare(
      `select sum(case when checked_at is null then 1 else 0 end) as todo,
              sum(case when checked_at is not null then 1 else 0 end) as done
       from shopping_items where loaded_at is null`,
    )
    .get() as { todo: number | null; done: number | null } | undefined;
  return { todo: r?.todo ?? 0, done: r?.done ?? 0 };
}

export function getRow(id: number): ShoppingRow | null {
  return (db.prepare(`${SELECT} where s.id = ?`).get(id) as ShoppingRow | undefined) ?? null;
}

/** Aggiunge alla lista. Se il nome corrisponde a una riga aperta, ne somma la quantita. */
export function add(
  rawName: string,
  qty: number,
  userId: number,
  source: 'manual' | 'llm' = 'manual',
  size: string | null = null,
): ShoppingRow | null {
  const name = rawName.trim();
  if (!name) return null;
  const product = findOrCreateProduct(name, { size });
  const existing = db
    .prepare('select id, qty from shopping_items where product_id = ? and loaded_at is null and checked_at is null')
    .get(product.id) as { id: number; qty: number } | undefined;
  if (existing) {
    // era li per soglia: diventa una riga voluta da una persona
    db.prepare(`update shopping_items set qty = ?, source = case when source = 'threshold' then ? else source end where id = ?`).run(
      existing.qty + qty,
      source,
      existing.id,
    );
    return getRow(existing.id);
  }
  const info = db
    .prepare('insert into shopping_items (product_id, qty, source, added_by) values (?, ?, ?, ?)')
    .run(product.id, qty, source, userId);
  logActivity(userId, 'shop.add', name);
  return getRow(Number(info.lastInsertRowid));
}

export function toggleCheck(id: number, userId: number): ShoppingRow | null {
  const row = getRow(id);
  if (!row) return null;
  if (row.checked_at) {
    db.prepare('update shopping_items set checked_at = null, checked_by = null where id = ?').run(id);
  } else {
    db.prepare(`update shopping_items set checked_at = datetime('now'), checked_by = ? where id = ?`).run(userId, id);
  }
  return getRow(id);
}

export function remove(id: number, userId: number) {
  const row = getRow(id);
  db.prepare('delete from shopping_items where id = ?').run(id);
  if (row) logActivity(userId, 'shop.del', row.name);
}

export interface LoadLine {
  id: number;
  product_id: number | null;
  name: string;
  size: string | null;
  qty: number;
  location: string;
  from: number;
}

/** Righe spuntate, con posizione di destinazione e quantita attuale in casa. */
export function pendingLoad(): LoadLine[] {
  return db
    .prepare(
      `select s.id, s.product_id, coalesce(p.name, s.free_text) as name, p.size, s.qty,
              coalesce(
                (select i.location from inventory i where i.product_id = s.product_id order by i.qty desc, i.id limit 1),
                p.default_location, 'Dispensa') as location,
              coalesce((select sum(i.qty) from inventory i where i.product_id = s.product_id), 0) as "from"
       from shopping_items s
       left join products p on p.id = s.product_id
       where s.loaded_at is null and s.checked_at is not null
       order by location, name collate nocase`,
    )
    .all() as LoadLine[];
}

/** Porta in inventario le righe spuntate. `qty` sovrascrive le quantita corrette a mano. */
export function confirmLoad(userId: number, overrides: Map<number, number>): number {
  const lines = pendingLoad();
  const run = db.transaction(() => {
    let n = 0;
    for (const line of lines) {
      const qty = overrides.get(line.id) ?? line.qty;
      if (qty > 0 && line.product_id != null) addStock(line.product_id, line.location, qty, userId);
      db.prepare(`update shopping_items set loaded_at = datetime('now'), qty = ? where id = ?`).run(qty, line.id);
      n++;
    }
    return n;
  });
  const n = run();
  if (n) logActivity(userId, 'shop.load', `${n} articoli`);
  return n;
}

export function shoppingAsText(): string {
  const rows = listOpen().filter((r) => !r.checked_at);
  if (!rows.length) return '(lista vuota)';
  return rows
    .map((r) => `- ${r.name}${r.size ? ` ${r.size}` : ''}${r.qty > 1 ? ` x${r.qty}` : ''}`)
    .join('\n');
}
