import { Hono } from 'hono';
import type { Env } from '../app.js';
import { isValidISODate, todayISO, weekStart } from '../lib/dates.js';
import { getMeal, setMeal, suggestDishes, weekMeals } from '../lib/meals.js';
import type { Slot } from '../lib/types.js';
import { Shell } from '../views/layout.js';
import { CellSheet, DishList, MealsPage } from '../views/meals.js';

export const mealRoutes = new Hono<Env>();

const asSlot = (s: string | undefined): Slot => (s === 'dinner' ? 'dinner' : 'lunch');

mealRoutes.get('/', (c) => {
  const w = c.req.query('w');
  const today = todayISO();
  const monday = w && isValidISODate(w) ? weekStart(w) : weekStart(today);
  return c.html(
    <Shell title="Pasti" user={c.get('user')} tab="pasti">
      <MealsPage week={weekMeals(monday)} monday={monday} today={today} />
    </Shell>,
  );
});

mealRoutes.get('/cella', (c) => {
  const d = c.req.query('d') ?? '';
  if (!isValidISODate(d)) return c.text('Data non valida', 400);
  const slot = asSlot(c.req.query('slot'));
  const body = getMeal(d, slot);
  return c.html(<CellSheet date={d} slot={slot} body={body} suggestions={suggestDishes('')} />);
});

mealRoutes.get('/suggerimenti', (c) => {
  return c.html(<DishList suggestions={suggestDishes((c.req.query('body') ?? '').slice(0, 60))} />);
});

mealRoutes.post('/cella', async (c) => {
  const form = await c.req.formData();
  const d = String(form.get('d') ?? '');
  if (!isValidISODate(d)) return c.text('Data non valida', 400);
  const slot = asSlot(String(form.get('slot') ?? ''));
  setMeal(d, slot, String(form.get('body') ?? '').slice(0, 200), c.get('user').id);

  const to = `/pasti?w=${weekStart(d)}`;
  if (c.req.header('HX-Request')) {
    c.header('HX-Redirect', to);
    return c.body(null, 204);
  }
  return c.redirect(to);
});
