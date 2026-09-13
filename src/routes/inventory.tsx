import { Hono } from 'hono';
import type { Env } from '../app.js';
import { db, logActivity, setting } from '../db/index.js';
import {
  adjustQty,
  addStock,
  countsByKind,
  getRow,
  listInventory,
  purgeZeroed,
  saveDetails,
  syncThreshold,
  validGroup,
  type Filter,
  type Group,
} from '../lib/inventory.js';
import { measureFromForm } from '../lib/measure.js';
import { parseLine } from '../lib/parse.js';
import {
  findOrCreateProduct,
  getProduct,
  productLabel,
  setProductCategory,
  suggestProducts,
  validLocation,
} from '../lib/products.js';
import { validCategory } from '../lib/types.js';
import { isValidISODate } from '../lib/dates.js';
import { Shell } from '../views/layout.js';
import { AddSheet, DetailSheet, InventoryPage, List, Row, Suggestions } from '../views/inventory.js';

export const inventoryRoutes = new Hono<Env>();

type Req = { req: { query: (k: string) => string | undefined } };

function readQuery(c: Req): { q: string; filter: Filter } {
  const q = (c.req.query('q') ?? '').slice(0, 80);
  const filter: Filter = c.req.query('soglia') ? 'threshold' : c.req.query('scad') ? 'expiring' : null;
  return { q, filter };
}

/**
 * Come raggruppare la lista. Senza `grp` nell'indirizzo vale l'ultima scelta:
 * e una preferenza, non un filtro, e deve sopravvivere al ricaricamento.
 */
function readGroup(c: Req, userId: number): Group {
  const raw = c.req.query('grp');
  if (raw === undefined) return validGroup(setting.get(`inv_group_${userId}`));
  const group = validGroup(raw);
  setting.set(`inv_group_${userId}`, group);
  return group;
}

inventoryRoutes.get('/', (c) => {
  purgeZeroed();
  const { q, filter } = readQuery(c);
  const group = readGroup(c, c.get('user').id);
  return c.html(
    <Shell title="Inventario" user={c.get('user')} tab="inventario">
      <InventoryPage
        rows={listInventory(q, filter, group)}
        q={q}
        filter={filter}
        group={group}
        counts={countsByKind()}
      />
    </Shell>,
  );
});

/** Frammento: solo la lista, per ricerca e filtri. */
inventoryRoutes.get('/inventario/lista', (c) => {
  const { q, filter } = readQuery(c);
  const group = readGroup(c, c.get('user').id);
  return c.html(<List rows={listInventory(q, filter, group)} q={q} filter={filter} group={group} />);
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
  const typed = String(form.get('q') ?? '').trim();
  const productId = Number(form.get('product_id') ?? 0) || null;
  const stepper = Math.max(0.01, Number(form.get('qty') ?? 1) || 1);
  const location = validLocation(String(form.get('location') ?? ''));
  const category = validCategory(String(form.get('category') ?? ''));
  const typedMeasure = measureFromForm(form.get('measure_value'), form.get('measure_unit'));

  // il campo accetta tutto di getto: "Ceci 230 gr x4"
  const parsed = typed ? parseLine(typed) : null;
  // una quantita scritta a mano batte quella del selettore
  const qty = parsed && parsed.qty > 1 ? parsed.qty : stepper;
  // e cosi la misura: il campo apposta vince su quella letta dentro al nome
  const measure = typedMeasure ?? parsed?.measure ?? null;

  if (!productId && !parsed) {
    return c.html(<AddSheet q="" suggestions={[]} location={location} qty={stepper} category={category} />);
  }

  const product = productId ? getProduct(productId) : findOrCreateProduct(parsed!.name, { measure, location, category });
  if (!product) return c.text('Prodotto non trovato', 404);
  // suggerimento toccato: la categoria riempie un buco, non sovrascrive una scelta
  if (productId && category && !product.category) setProductCategory(product.id, category);

  const invId = addStock(product.id, location, qty, user.id);
  logActivity(user.id, 'inv.add', `${product.name} +${qty} in ${location}`);
  db.prepare('insert into settings (k, v) values (?, ?) on conflict(k) do update set v = excluded.v').run(
    `last_loc_${user.id}`,
    location,
  );

  c.header('HX-Trigger', JSON.stringify({ 'cache:refresh': { url: '/inventario/lista', target: '#list' } }));
  // il foglio resta aperto, pronto per il prossimo articolo: la categoria di
  // solito e la stessa per tutta la serie, la misura no
  return c.html(
    <AddSheet
      q=""
      suggestions={[]}
      location={location}
      qty={1}
      category={category}
      justAdded={{ name: productLabel(product), location, undoId: invId }}
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
  // campo assente = non lo tocchiamo; campo svuotato a mano = zero voluto
  const qtyRaw = form.get('qty');
  saveDetails(
    id,
    {
      qty: qtyRaw === null ? undefined : Math.max(0, Number(String(qtyRaw).trim().replace(',', '.')) || 0),
      min_qty: minRaw === '' ? null : Math.max(0, Number(minRaw.replace(',', '.')) || 0),
      expires_on: expRaw && isValidISODate(expRaw) ? expRaw : null,
      location: validLocation(String(form.get('location') ?? '')),
      measure: measureFromForm(form.get('measure_value'), form.get('measure_unit')),
      category: validCategory(String(form.get('category') ?? '')),
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
