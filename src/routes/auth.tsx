import { Hono } from 'hono';
import type { Env } from '../app.js';
import { db } from '../db/index.js';
import { createSession, currentUser, destroySession, verifyPassword } from '../lib/auth.js';
import type { User } from '../lib/types.js';
import { Shell } from '../views/layout.js';
import { LoginPage } from '../views/login.js';

export const authRoutes = new Hono<Env>();

/** Un tentativo fallito costa: piccolo freno contro il bruteforce. */
const attempts = new Map<string, { n: number; until: number }>();

function blocked(key: string): boolean {
  const a = attempts.get(key);
  return !!a && a.n >= 8 && Date.now() < a.until;
}

function fail(key: string) {
  const a = attempts.get(key) ?? { n: 0, until: 0 };
  a.n++;
  a.until = Date.now() + Math.min(a.n * 15_000, 15 * 60_000);
  attempts.set(key, a);
}

authRoutes.get('/login', (c) => {
  if (currentUser(c)) return c.redirect('/');
  return c.html(
    <Shell title="Entra" bare>
      <LoginPage />
    </Shell>,
  );
});

authRoutes.post('/login', async (c) => {
  const form = await c.req.formData();
  const email = String(form.get('email') ?? '').trim().toLowerCase();
  const password = String(form.get('password') ?? '');
  const key = `${c.req.header('x-forwarded-for') ?? 'local'}|${email}`;

  const render = (error: string) =>
    c.html(
      <Shell title="Entra" bare>
        <LoginPage email={email} error={error} />
      </Shell>,
      401,
    );

  if (blocked(key)) return render('Troppi tentativi. Riprova fra qualche minuto.');

  const user = db.prepare('select * from users where email = ?').get(email) as User | undefined;
  if (!user || !verifyPassword(password, user.password_hash)) {
    fail(key);
    return render('Email o password non corretti.');
  }

  attempts.delete(key);
  createSession(c, user.id);
  const next = c.req.query('next');
  return c.redirect(next && next.startsWith('/') && !next.startsWith('//') ? next : '/');
});

authRoutes.post('/logout', (c) => {
  destroySession(c);
  return c.redirect('/login');
});
