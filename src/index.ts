import './env.js'; // per primo: carica .env prima che i moduli sotto leggano process.env
import { serve } from '@hono/node-server';
import { app } from './app.js';
import { db } from './db/index.js';
import { hashPassword, pruneSessions } from './lib/auth.js';
import { generateDue } from './lib/expenses.js';
import { purgeZeroed } from './lib/inventory.js';
import { PERSON_COLORS } from './lib/types.js';

/** Al primissimo avvio su un database vuoto crea l'amministratore dalle variabili d'ambiente. */
function bootstrapAdmin() {
  const n = (db.prepare('select count(*) as n from users').get() as { n: number }).n;
  if (n > 0) return;
  const email = (process.env.ADMIN_EMAIL ?? '').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? '';
  const name = process.env.ADMIN_NAME ?? 'Admin';
  if (!email || password.length < 8) {
    console.warn(
      '[avvio] Nessun utente e nessun ADMIN_EMAIL/ADMIN_PASSWORD (min 8 caratteri): imposta le variabili e riavvia.',
    );
    return;
  }
  db.prepare(
    'insert into users (email, password_hash, display_name, color, role) values (?, ?, ?, ?, ?)',
  ).run(email, hashPassword(password), name, PERSON_COLORS[0], 'admin');
  console.log(`[avvio] amministratore creato: ${email}`);
}

bootstrapAdmin();
pruneSessions();
purgeZeroed();
generateDue();

const port = Number(process.env.PORT ?? 3000);
serve({ fetch: app.fetch, port, hostname: '0.0.0.0' }, (info) => {
  console.log(`Cache in ascolto su http://localhost:${info.port}`);
});

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    try {
      db.pragma('wal_checkpoint(TRUNCATE)');
      db.close();
    } catch {
      /* in chiusura non c'e piu niente da salvare */
    }
    process.exit(0);
  });
}
