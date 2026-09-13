import { Hono } from 'hono';
import type { Env } from '../app.js';
import { add, confirmLoad, counts, listOpen, pendingLoad, remove, toggleCheck } from '../lib/shopping.js';
import { Shell } from '../views/layout.js';
import { List, LoadPage, ShoppingPage } from '../views/shopping.js';

export const shoppingRoutes = new Hono<Env>();

const listFragment = () => {
  const { done } = counts();
  return <List rows={listOpen()} done={done} />;
};

shoppingRoutes.get('/', (c) => {
  const { todo, done } = counts();
  return c.html(
    <Shell title="Spesa" user={c.get('user')} tab="spesa">
      <ShoppingPage rows={listOpen()} todo={todo} done={done} />
    </Shell>,
  );
});

shoppingRoutes.post('/', async (c) => {
  const form = await c.req.formData();
  const name = String(form.get('name') ?? '').trim().slice(0, 120);
  const qty = Math.max(1, Number(form.get('qty') ?? 1) || 1);
  if (name) add(name, qty, c.get('user').id);
  return c.html(listFragment());
});

shoppingRoutes.post('/:id/spunta', (c) => {
  toggleCheck(Number(c.req.param('id')), c.get('user').id);
  return c.html(listFragment());
});

shoppingRoutes.delete('/:id', (c) => {
  remove(Number(c.req.param('id')), c.get('user').id);
  return c.html(listFragment());
});

/* -------------------------------------------------------- conferma carico */

shoppingRoutes.get('/carico', (c) => {
  const lines = pendingLoad();
  if (!lines.length) return c.redirect('/spesa');
  return c.html(
    <Shell title="Conferma carico" user={c.get('user')} tab="spesa">
      <LoadPage lines={lines} />
    </Shell>,
  );
});

shoppingRoutes.post('/carico', async (c) => {
  const form = await c.req.formData();
  const overrides = new Map<number, number>();
  for (const [k, v] of form.entries()) {
    if (!k.startsWith('qty-')) continue;
    const id = Number(k.slice(4));
    const n = Number(String(v).replace(',', '.'));
    if (Number.isFinite(id) && Number.isFinite(n)) overrides.set(id, Math.max(0, n));
  }
  confirmLoad(c.get('user').id, overrides);
  if (c.req.header('HX-Request')) {
    c.header('HX-Redirect', '/');
    return c.body(null, 204);
  }
  return c.redirect('/');
});
