import { Hono } from 'hono';
import type { Env } from '../app.js';
import { db } from '../db/index.js';
import { currentPeriod } from '../lib/dates.js';
import {
  commonByPerson,
  createExpense,
  deleteExpense,
  listCommon,
  listPrivate,
  settlement,
  totalOf,
} from '../lib/expenses.js';
import { parseEuros } from '../lib/money.js';
import { EXPENSE_CATEGORIES, type Cadence, type Scope, type User } from '../lib/types.js';
import { Shell } from '../views/layout.js';
import { ExpensesPage, ExpenseSheet } from '../views/expenses.js';

export const expenseRoutes = new Hono<Env>();

const allUsers = () => db.prepare('select * from users order by created_at').all() as User[];

const validPeriod = (p: string | undefined) => (p && /^\d{4}-\d{2}$/.test(p) ? p : currentPeriod());

expenseRoutes.get('/', (c) => {
  const user = c.get('user');
  const scope: Scope = c.req.query('scope') === 'common' ? 'common' : 'private';
  const period = validPeriod(c.req.query('period'));
  const rows = scope === 'common' ? listCommon(period) : listPrivate(user.id, period);
  return c.html(
    <Shell title="Spese" user={user} tab="spese">
      <ExpensesPage
        scope={scope}
        period={period}
        rows={rows}
        total={totalOf(rows)}
        people={scope === 'common' ? commonByPerson(period) : []}
        settle={scope === 'common' ? settlement(period) : { share: 0, lines: [] }}
        user={user}
        users={allUsers()}
        canGoForward={period < currentPeriod()}
      />
    </Shell>,
  );
});

expenseRoutes.get('/nuova', (c) => {
  const scope: Scope = c.req.query('scope') === 'common' ? 'common' : 'private';
  return c.html(<ExpenseSheet scope={scope} user={c.get('user')} users={allUsers()} />);
});

expenseRoutes.post('/', async (c) => {
  const user = c.get('user');
  const form = await c.req.formData();
  const label = String(form.get('label') ?? '').trim().slice(0, 120);
  const amountCents = parseEuros(String(form.get('amount') ?? ''));
  const scope: Scope = form.get('scope') === 'common' ? 'common' : 'private';
  const rawCat = String(form.get('category') ?? '');
  const category = (EXPENSE_CATEGORIES as readonly string[]).includes(rawCat) ? rawCat : 'Altro';
  const recurring = String(form.get('recurring') ?? '0') === '1';
  const rawCadence = String(form.get('cadence') ?? 'monthly');
  const cadence: Cadence = (['monthly', 'bimonthly', 'quarterly', 'yearly'] as const).includes(rawCadence as Cadence)
    ? (rawCadence as Cadence)
    : 'monthly';
  const dayOfMonth = Math.min(31, Math.max(1, Number(form.get('day_of_month') ?? 1) || 1));

  // per le private paga sempre chi la registra: "privata" vuol dire proprio sua
  const paidByRaw = Number(form.get('paid_by') ?? 0);
  const paidBy =
    scope === 'common' && allUsers().some((u) => u.id === paidByRaw) ? paidByRaw : user.id;

  if (!label || amountCents === null || amountCents === 0) {
    return c.html(<ExpenseSheet scope={scope} user={user} users={allUsers()} />, 422);
  }

  createExpense({ scope, ownerId: user.id, paidBy, label, amountCents, category, recurring, cadence, dayOfMonth });

  const to = `/spese?scope=${scope}&period=${currentPeriod()}`;
  if (c.req.header('HX-Request')) {
    c.header('HX-Redirect', to);
    return c.body(null, 204);
  }
  return c.redirect(to);
});

expenseRoutes.delete('/:id', (c) => {
  const ok = deleteExpense(Number(c.req.param('id')), c.get('user'));
  return ok ? c.body(null, 200) : c.text('Non puoi eliminare questa spesa', 403);
});
