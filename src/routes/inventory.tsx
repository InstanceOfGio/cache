import { Hono } from 'hono';
import type { Env } from '../app.js';
import { db, logActivity } from '../db/index.js';
import {
  adjustQty,
  addStock,
  countsByKind,
  getRow,
  listInventory,
  purgeZeroed,
  syncThreshold,
  updateDetails,
  type Filter,
} from '../lib/inventory.js';
import { findOrCreateProduct, suggestProducts, validLocation } from '../lib/products.js';
import { isValidISODate } from '../lib/dates.js';
import { Shell } from '../views/layout.js';
import { AddSheet, DetailSheet, InventoryPage, List, Row, Suggestions } from '../views/inventory.js';

export const inventoryRoutes = new Hono<Env>();

function readQuery(c: { req: { query: (k: string) => string | undefined } }): { q: string; filter: Filter } {
  const q = (c.req.query('q') ?? '').slice(0, 80);
  const filter: Filter = c.req.query('soglia') ? 'threshold' : c.req.query('scad') ? 'expiring' : null;
  return { q, filter };
}

inventoryRoutes.get('/', (c) => {
  purgeZeroed();
  const { q, filter } = readQuery(c);
  return c.html(
    <Shell title="Inventario" user={c.get('user')} tab="inventario">
      <InventoryPage rows={listInventory(q, filter)} q={q} filter={filter} counts={countsByKind()} />
    </Shell>,
  );
});

/** Frammento: solo la lista, per ricerca e filtri. */
inventoryRoutes.get('/inventario/lista', (c) => {
  const { q, filter } = readQuery(c);
  return c.html(<List rows={listInventory(q, filter)} q={q} filter={filter} />);
});

inventoryRoutes.post('/inventario/:id/qty', (c) => {
  const id = Number(c.req.param('id'));
  const d = Number(c.req.query('d') ?? 0);
  if (!Number.isFinite(d) || d === 0) return c.text('delta non valido', 400);
  const row = adjustQty(id, d, c.get('user').id);
  if (!row) return c.text('Non trovato', 404);
  return c.html(<Row row={row} />);
});

/* ------------------------------------------------------------- aggiungi */

inventoryRoutes.get('/inventario/nuovo', (c) => {
  const user = c.get('user');
  const last = (db.prepare('select v from settings where k = ?').get(`last_loc_${user.id}`) as { v: string } | undefined)?.v;
  return c.html(<AddSheet q="" suggestions={[]} location={validLocation(last)} qty={1} />);
});

inventoryRoutes.get('/inventario/nuovo/suggerimenti', (c) => {
  const q = (c.req.query('q') ?? '').slice(0, 60);
  return c.html(<Suggestions q={q} suggestions={suggestProducts(q)} />);
});

inventoryRoutes.post('/inventario/aggiungi', async (c) => {
  const user = c.get('user');
  const form = await c.req.formData();
  const name = String(form.get('q') ?? '').trim();
  const productId = Number(form.get('product_id') ?? 0) || null;
  const qty = Math.max(0.01, Number(form.get('qty') ?? 1) || 1);
  const location = validLocation(String(form.get('location') ?? ''));

  if (!productId && !name) {
    return c.html(<AddSheet q="" suggestions={[]} location={location} qty={qty} />);
  }

  const product = productId
    ? (db.prepare('select id, name from products where id = ?').get(productId) as { id: number; name: string } | undefined)
    : findOrCreateProduct(name, location);
  if (!product) return c.text('Prodotto non trovato', 404);

  const invId = addStock(product.id, location, qty, user.id);
  logActivity(user.id, 'inv.add', `${product.name} +${qty} in ${location}`);
  db.prepare('insert into settings (k, v) values (?, ?) on conflict(k) do update set v = excluded.v').run(
    `last_loc_${user.id}`,
    location,
  );

  c.header('HX-Trigger', JSON.stringify({ 'cache:refresh': { url: '/inventario/lista', target: '#list' } }));
  // il foglio resta aperto, pronto per il prossimo articolo
  return c.html(
    <AddSheet
      q=""
      suggestions={[]}
      location={location}
      qty={1}
      justAdded={{ name: product.name, location, undoId: invId }}
    />,
  );
});

inventoryRoutes.post('/inventario/:id/annulla', (c) => {
  const id = Number(c.req.param('id'));
  const user = c.get('user');
  const row = getRow(id);
  if (row) {
    // togliamo l'ultima aggiunta: se la riga resta a zero sparisce al prossimo giro
    adjustQty(id, -1, user.id);
  }
  c.header('HX-Trigger', JSON.stringify({ 'cache:refresh': { url: '/inventario/lista', target: '#list' } }));
  const last = (db.prepare('select v from settings where k = ?').get(`last_loc_${user.id}`) as { v: string } | undefined)?.v;
  return c.html(<AddSheet q="" suggestions={[]} location={validLocation(last)} qty={1} />);
});

/* -------------------------------------------------------------- dettagli */

inventoryRoutes.get('/inventario/:id/dettagli', (c) => {
  const row = getRow(Number(c.req.param('id')));
  if (!row) return c.text('Non trovato', 404);
  return c.html(<DetailSheet row={row} />);
});

inventoryRoutes.post('/inventario/:id/dettagli', async (c) => {
  const id = Number(c.req.param('id'));
  const form = await c.req.formData();
  const minRaw = String(form.get('min_qty') ?? '').trim();
  const expRaw = String(form.get('expires_on') ?? '').trim();
  updateDetails(
    id,
    {
      min_qty: minRaw === '' ? null : Math.max(0, Number(minRaw.replace(',', '.')) || 0),
      expires_on: expRaw && isValidISODate(expRaw) ? expRaw : null,
      location: validLocation(String(form.get('location') ?? '')),
    },
    c.get('user').id,
  );
  c.header('HX-Trigger', JSON.stringify({ 'cache:refresh': { url: '/inventario/lista', target: '#list' } }));
  return c.body(null, 200);
});

inventoryRoutes.delete('/inventario/:id', (c) => {
  const id = Number(c.req.param('id'));
  const row = getRow(id);
  if (row) {
    db.prepare('delete from inventory where id = ?').run(id);
    syncThreshold(row.product_id, c.get('user').id);
    logActivity(c.get('user').id, 'inv.del', row.name);
  }
  c.header('HX-Trigger', JSON.stringify({ 'cache:refresh': { url: '/inventario/lista', target: '#list' } }));
  return c.body(null, 200);
});
