import { db, logActivity } from '../db/index.js';
import { daysUntil, todayISO } from './dates.js';
import type { Measure } from './measure.js';
import { norm, setProductCategory, setProductMeasure } from './products.js';
import { categoryLabel, categoryRank, LOCATIONS, type InventoryRow } from './types.js';

/** Una riga azzerata resta visibile (grigia, con "Ripristina") per questi giorni. */
export const ZERO_GRACE_DAYS = 7;

export type Filter = 'threshold' | 'expiring' | null;

export interface Badge { text: string; kind: 'threshold' | 'expiring' | 'expired' }

export function badgeFor(row: InventoryRow): Badge | null {
  if (row.expires_on) {
    const d = daysUntil(row.expires_on);
    if (d < 0) return { text: 'Scaduto', kind: 'expired' };
    if (d <= 3) return { text: d === 0 ? 'Scade oggi' : `Scade ${d} gg`, kind: 'expiring' };
  }
  if (row.min_qty != null && row.qty < row.min_qty) return { text: 'Sotto soglia', kind: 'threshold' };
  return null;
}

const SELECT = `
  select i.id, i.product_id, p.name, p.size, p.size_value, p.size_unit, p.category, p.unit,
         i.location, i.qty, i.min_qty, i.expires_on, i.zeroed_at
  from inventory i join products p on p.id = i.product_id`;

const VISIBLE = `(i.qty > 0 or (i.zeroed_at is not null and julianday('now') - julianday(i.zeroed_at) < ${ZERO_GRACE_DAYS}))`;

/** Come si raggruppa la lista: per posizione in casa o per categoria. */
export type Group = 'loc' | 'cat';

export const validGroup = (s: string | null | undefined): Group => (s === 'cat' ? 'cat' : 'loc');

/** Il titolo della fascia sotto cui finisce una riga. */
export function groupOf(row: InventoryRow, group: Group): string {
  return group === 'cat' ? categoryLabel(row.category) : row.location;
}

/** Posizioni nell'ordine dei bottoni, non in ordine alfabetico. */
function groupRank(row: InventoryRow, group: Group): number {
  if (group === 'cat') return categoryRank(row.category);
  const i = LOCATIONS.indexOf(row.location as (typeof LOCATIONS)[number]);
  return i < 0 ? LOCATIONS.length : i;
}

export function listInventory(q = '', filter: Filter = null, group: Group = 'loc'): InventoryRow[] {
  const where: string[] = [VISIBLE];
  const args: unknown[] = [];
  if (q.trim()) {
    where.push('(p.norm like ? or p.id in (select product_id from product_aliases where alias_norm like ?))');
    const like = `%${norm(q)}%`;
    args.push(like, like);
  }
  if (filter === 'threshold') where.push('i.min_qty is not null and i.qty < i.min_qty');
  if (filter === 'expiring') where.push(`i.expires_on is not null and julianday(i.expires_on) - julianday('now') < 4`);
  const rows = db
    .prepare(`${SELECT} where ${where.join(' and ')} order by p.name collate nocase`)
    .all(...args) as InventoryRow[];
  // l'ordine dei gruppi non e alfabetico, quindi lo mettiamo qui e non in SQL
  return rows.sort((a, b) => groupRank(a, group) - groupRank(b, group));
}

export function countsByKind(): { threshold: number; expiring: number } {
  const r = db
    .prepare(
      `select
         sum(case when i.min_qty is not null and i.qty < i.min_qty then 1 else 0 end) as threshold,
         sum(case when i.expires_on is not null and julianday(i.expires_on) - julianday('now') < 4 then 1 else 0 end) as expiring
       from inventory i where ${VISIBLE}`,
    )
    .get() as { threshold: number | null; expiring: number | null } | undefined;
  return { threshold: r?.threshold ?? 0, expiring: r?.expiring ?? 0 };
}

export function getRow(id: number): InventoryRow | null {
  return (db.prepare(`${SELECT} where i.id = ?`).get(id) as InventoryRow | undefined) ?? null;
}

/** Somma delta alla quantita, gestisce lo stato "azzerato" e riallinea la lista spesa. */
export function adjustQty(id: number, delta: number, userId: number): InventoryRow | null {
  const row = getRow(id);
  if (!row) return null;
  const next = Math.max(0, Math.round((row.qty + delta) * 100) / 100);
  db.prepare(
    `update inventory set qty = ?, zeroed_at = case when ? = 0 then coalesce(zeroed_at, datetime('now')) else null end,
     updated_at = datetime('now'), updated_by = ? where id = ?`,
  ).run(next, next, userId, id);
  syncThreshold(row.product_id, userId);
  logActivity(userId, delta > 0 ? 'inv.inc' : 'inv.dec', `${row.name} -> ${next}`);
  return getRow(id);
}

export function setQty(id: number, qty: number, userId: number): InventoryRow | null {
  const row = getRow(id);
  if (!row) return null;
  const next = Math.max(0, qty);
  db.prepare(
    `update inventory set qty = ?, zeroed_at = case when ? = 0 then coalesce(zeroed_at, datetime('now')) else null end,
     updated_at = datetime('now'), updated_by = ? where id = ?`,
  ).run(next, next, userId, id);
  syncThreshold(row.product_id, userId);
  return getRow(id);
}

/** Aggiunge quantita a prodotto+posizione, creando la riga se manca. Ritorna l'id di inventario. */
export function addStock(productId: number, location: string, qty: number, userId: number): number {
  db.prepare(
    `insert into inventory (product_id, location, qty, updated_by) values (?, ?, ?, ?)
     on conflict(product_id, location) do update set
       qty = inventory.qty + excluded.qty, zeroed_at = null,
       updated_at = datetime('now'), updated_by = excluded.updated_by`,
  ).run(productId, location, qty, userId);
  syncThreshold(productId, userId);
  const r = db
    .prepare('select id from inventory where product_id = ? and location = ?')
    .get(productId, location) as { id: number };
  return r.id;
}

/**
 * Se il prodotto e sotto soglia crea (una sola volta) una riga in lista spesa marcata "auto";
 * se e tornato sopra soglia toglie la riga auto ancora da spuntare.
 */
export function syncThreshold(productId: number, userId: number | null) {
  const below = (
    db
      .prepare('select count(*) as n from inventory where product_id = ? and min_qty is not null and qty < min_qty')
      .get(productId) as { n: number }
  ).n;
  const open = db
    .prepare(
      `select id from shopping_items where product_id = ? and source = 'threshold' and checked_at is null and loaded_at is null`,
    )
    .get(productId) as { id: number } | undefined;
  if (below > 0 && !open) {
    const anyOpen = (
      db
        .prepare('select count(*) as n from shopping_items where product_id = ? and checked_at is null and loaded_at is null')
        .get(productId) as { n: number }
    ).n;
    if (anyOpen === 0) {
      db.prepare(`insert into shopping_items (product_id, qty, source, added_by) values (?, 1, 'threshold', ?)`).run(
        productId,
        userId,
      );
    }
  } else if (below === 0 && open) {
    db.prepare('delete from shopping_items where id = ?').run(open.id);
  }
}

export interface DetailsPatch {
  /** Assente = lascia la quantita com'e. Zero, invece, azzera davvero. */
  qty?: number;
  min_qty: number | null;
  expires_on: string | null;
  location: string;
  /** Sta sul prodotto, non sulla riga: cambiarla ne cambia l'identita. */
  measure: Measure | null;
  category: string | null;
}

/**
 * Salva il foglio dei dettagli. L'ordine conta: la misura nuova puo far
 * confluire il prodotto in uno che esiste gia, e in quel caso questa riga di
 * inventario sparisce dentro un'altra. Ritorna la riga sopravvissuta.
 */
export function saveDetails(id: number, patch: DetailsPatch, userId: number): InventoryRow | null {
  const row = getRow(id);
  if (!row) return null;

  const qty = patch.qty === undefined ? row.qty : Math.max(0, Math.round(patch.qty * 100) / 100);
  db.prepare(
    `update inventory set qty = ?, zeroed_at = case when ? = 0 then coalesce(zeroed_at, datetime('now')) else null end,
     min_qty = ?, expires_on = ?, location = ?, updated_at = datetime('now'), updated_by = ? where id = ?`,
  ).run(qty, qty, patch.min_qty, patch.expires_on, patch.location, userId, id);

  const productId = setProductMeasure(row.product_id, patch.measure);
  setProductCategory(productId, patch.category);
  syncThreshold(productId, userId);

  const survivor = db
    .prepare('select id from inventory where product_id = ? and location = ?')
    .get(productId, patch.location) as { id: number } | undefined;
  return survivor ? getRow(survivor.id) : null;
}

/** Elimina definitivamente le righe azzerate da oltre il periodo di grazia. */
export function purgeZeroed() {
  db.prepare(
    `delete from inventory where qty = 0 and zeroed_at is not null
     and julianday('now') - julianday(zeroed_at) >= ${ZERO_GRACE_DAYS}`,
  ).run();
}

function qtyText(q: number): string {
  return Number.isInteger(q) ? String(q) : String(Math.round(q * 100) / 100);
}

/** Testo per l'LLM: raggruppato per posizione. */
export function inventoryAsText(): string {
  const rows = listInventory().filter((r) => r.qty > 0);
  const byLoc = new Map<string, InventoryRow[]>();
  for (const r of rows) {
    if (!byLoc.has(r.location)) byLoc.set(r.location, []);
    byLoc.get(r.location)!.push(r);
  }
  const out: string[] = [];
  for (const [loc, items] of byLoc) {
    out.push(`# ${loc.toUpperCase()}`);
    for (const it of items) {
      const bits = [`${it.name}${it.size ? ` ${it.size}` : ''} x${qtyText(it.qty)}`];
      if (it.category) bits.push(`[${it.category}]`);
      if (it.expires_on) bits.push(`(scade ${it.expires_on})`);
      if (it.min_qty != null && it.qty < it.min_qty) bits.push('(sotto soglia)');
      out.push(`- ${bits.join(' ')}`);
    }
    out.push('');
  }
  return out.join('\n').trim() || '(inventario vuoto)';
}

export { todayISO };
