import { Hono } from 'hono';
import { serveStatic } from '@hono/node-server/serve-static';
import { currentUser } from './lib/auth.js';
import { generateDue } from './lib/expenses.js';
import type { User } from './lib/types.js';
import { authRoutes } from './routes/auth.js';
import { inventoryRoutes } from './routes/inventory.js';
import { shoppingRoutes } from './routes/shopping.js';
import { expenseRoutes } from './routes/expenses.js';
import { mealRoutes } from './routes/meals.js';
import { llmRoutes } from './routes/llm.js';
import { adminRoutes } from './routes/admin.js';

export type Env = { Variables: { user: User } };

export const app = new Hono<Env>();

/* ------------------------------------------------------------------ statici */

app.use('/app.css', serveStatic({ root: './static', path: '/app.css' }));
app.use('/app.js', serveStatic({ root: './static', path: '/app.js' }));
app.use('/htmx.min.js', serveStatic({ root: './static', path: '/htmx.min.js' }));
app.use('/manifest.webmanifest', serveStatic({ root: './static', path: '/manifest.webmanifest' }));
app.use('/icons/*', serveStatic({ root: './static' }));
app.use('/sw.js', serveStatic({ root: './static', path: '/sw.js' }));

/* ------------------------------------------------------------------- CSRF */

/** I cookie sono SameSite=Lax, quindi una POST cross-site non li porta. Questo e il secondo lucchetto. */
app.use('*', async (c, next) => {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(c.req.method)) {
    const origin = c.req.header('Origin');
    if (origin) {
      const host = c.req.header('Host');
      if (!host || new URL(origin).host !== host) return c.text('Origine non valida', 403);
    }
  }
  await next();
});

/* ------------------------------------------------------------- sessione */

const PUBLIC = new Set(['/login', '/manifest.webmanifest', '/health']);

app.use('*', async (c, next) => {
  const path = c.req.path;
  if (PUBLIC.has(path) || path.startsWith('/icons/') || path.startsWith('/app.') || path === '/htmx.min.js') {
    return next();
  }
  const user = currentUser(c);
  if (!user) {
    if (c.req.header('HX-Request')) {
      c.header('HX-Redirect', '/login');
      return c.body(null, 204);
    }
    const back = path === '/' ? '' : `?next=${encodeURIComponent(c.req.url.replace(/^https?:\/\/[^/]+/, ''))}`;
    return c.redirect(`/login${back}`);
  }
  c.set('user', user);
  // le ricorrenti maturano qui: niente cron, la macchina puo essere sospesa
  generateDue();
  await next();
});

/* -------------------------------------------------------------- le rotte */

app.get('/health', (c) => c.text('ok'));

app.route('/', authRoutes);
app.route('/', inventoryRoutes);
app.route('/spesa', shoppingRoutes);
app.route('/spese', expenseRoutes);
app.route('/pasti', mealRoutes);
app.route('/', llmRoutes);
app.route('/admin', adminRoutes);

app.notFound((c) => c.text('Non trovato', 404));

app.onError((err, c) => {
  console.error('[errore]', err);
  return c.text('Qualcosa e andato storto.', 500);
});
