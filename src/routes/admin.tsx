import { Hono, type Context } from 'hono';
import { randomBytes } from 'node:crypto';
import { readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { Env } from '../app.js';
import { checkpoint, db, dbPath, logActivity, replaceDatabase, setting } from '../db/index.js';
import { currentSessionId, hashPassword } from '../lib/auth.js';
import { todayISO } from '../lib/dates.js';
import { euros } from '../lib/money.js';
import { PERSON_COLORS, type User } from '../lib/types.js';
import { Shell } from '../views/layout.js';
import { AdminPage, UserSheet } from '../views/admin.js';

export const adminRoutes = new Hono<Env>();

adminRoutes.use('*', async (c, next) => {
  if (c.get('user').role !== 'admin') return c.text('Riservato a chi amministra la casa.', 403);
  await next();
});

const allUsers = () => db.prepare('select * from users order by created_at').all() as User[];

function backupInfo() {
  const at = setting.get('last_backup_at');
  const size = setting.get('last_backup_size');
  return at && size ? { at, size } : null;
}

function page(c: Context<Env>, extra: Record<string, unknown> = {}) {
  return c.html(
    <Shell title="Amministrazione" user={c.get('user')} tab="inventario">
      <AdminPage me={c.get('user')} users={allUsers()} backup={backupInfo()} {...extra} />
    </Shell>,
  );
}

adminRoutes.get('/', (c) => page(c, { notice: c.req.query('ok'), error: c.req.query('err') }));

/* -------------------------------------------------------------- utenti */

adminRoutes.post('/utenti', async (c) => {
  const form = await c.req.formData();
  const name = String(form.get('display_name') ?? '').trim().slice(0, 40);
  const email = String(form.get('email') ?? '').trim().toLowerCase().slice(0, 120);
  if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return page(c, { error: 'Nome ed email sono obbligatori.' });
  }
  const taken = db.prepare('select 1 from users where email = ?').get(email);
  if (taken) return page(c, { error: `${email} ha già un accesso.` });

  // password leggibile da dettare a voce
  const password = `${randomBytes(4).toString('hex')}-${randomBytes(3).toString('hex')}`;
  const used = new Set(allUsers().map((u) => u.color));
  const color = PERSON_COLORS.find((x) => !used.has(x)) ?? PERSON_COLORS[0];

  db.prepare(
    'insert into users (email, password_hash, display_name, color, role, must_change) values (?, ?, ?, ?, ?, 1)',
  ).run(email, hashPassword(password), name, color, 'member');
  logActivity(c.get('user').id, 'admin.user.add', email);

  return page(c, { created: { name, email, password } });
});

const countAdmins = () => (db.prepare("select count(*) as n from users where role = 'admin'").get() as { n: number }).n;

adminRoutes.get('/utenti/:id', (c) => {
  const user = db.prepare('select * from users where id = ?').get(Number(c.req.param('id'))) as User | undefined;
  if (!user) return c.text('Utente non trovato', 404);
  return c.html(
    <UserSheet user={user} isMe={user.id === c.get('user').id} lastAdmin={user.role === 'admin' && countAdmins() <= 1} />,
  );
});

adminRoutes.post('/utenti/:id/password', async (c) => {
  const id = Number(c.req.param('id'));
  const me = c.get('user');
  const user = db.prepare('select * from users where id = ?').get(id) as User | undefined;
  if (!user) return page(c, { error: 'Utente non trovato.' });

  const typed = String((await c.req.formData()).get('password') ?? '').trim();
  if (typed && typed.length < 8) return page(c, { error: 'La password deve avere almeno 8 caratteri.' });
  const password = typed || `${randomBytes(4).toString('hex')}-${randomBytes(3).toString('hex')}`;

  db.prepare('update users set password_hash = ?, must_change = ? where id = ?').run(
    hashPassword(password),
    typed ? 0 : 1,
    id,
  );
  // le sessioni aperte con la vecchia password non valgono piu; la propria si tiene
  db.prepare('delete from sessions where user_id = ? and id <> coalesce(?, \'\')').run(id, id === me.id ? currentSessionId(c) : null);
  logActivity(me.id, 'admin.user.password', user.email);

  return page(c, {
    created: {
      title: `Nuova password per ${user.display_name}`,
      name: user.display_name,
      email: user.email,
      password,
    },
  });
});

adminRoutes.post('/utenti/:id/elimina', (c) => {
  const id = Number(c.req.param('id'));
  const me = c.get('user');
  if (id === me.id) return page(c, { error: 'Non puoi eliminare te stesso.' });
  const admins = (db.prepare("select count(*) as n from users where role = 'admin'").get() as { n: number }).n;
  const target = db.prepare('select role, email from users where id = ?').get(id) as
    | { role: string; email: string }
    | undefined;
  if (!target) return page(c, { error: 'Utente non trovato.' });
  if (target.role === 'admin' && admins <= 1) return page(c, { error: "Deve restare almeno un'amministratrice o un amministratore." });

  db.prepare('delete from users where id = ?').run(id);
  logActivity(me.id, 'admin.user.del', target.email);
  return page(c, { notice: `${target.email} non ha più accesso.` });
});

/* ---------------------------------------------------------------- backup */

adminRoutes.get('/backup', (c) => {
  checkpoint(); // in WAL il file principale puo essere quasi vuoto
  const tmp = join(tmpdir(), `cache-backup-${Date.now()}.sqlite`);
  db.prepare('vacuum into ?').run(tmp); // compattato: niente pagine libere, niente WAL
  const buf = readFileSync(tmp);
  unlinkSync(tmp);

  const kb = buf.byteLength / 1024;
  setting.set('last_backup_at', todayISO());
  setting.set('last_backup_size', kb > 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${Math.round(kb)} KB`);
  logActivity(c.get('user').id, 'admin.backup', `${Math.round(kb)} KB`);

  c.header('Content-Type', 'application/octet-stream');
  c.header('Content-Disposition', `attachment; filename="cache-${todayISO()}.sqlite"`);
  return c.body(new Uint8Array(buf));
});

/**
 * Il file viene scritto di fianco, controllato, e solo allora sostituisce il database:
 * `replaceDatabase` chiude la connessione, scambia i file e ne riapre una nuova.
 * Niente riavvio del processo, cosi funziona identico in locale e su Fly.
 */
adminRoutes.post('/ripristina', async (c) => {
  const form = await c.req.formData();
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) return page(c, { error: 'Nessun file selezionato.' });
  if (file.size > 256 * 1024 * 1024) return page(c, { error: 'File troppo grande.' });

  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.subarray(0, 16).toString('latin1') !== 'SQLite format 3\0') {
    return page(c, { error: 'Non sembra un database SQLite.' });
  }

  const incoming = `${dbPath}.incoming`;
  writeFileSync(incoming, buf);

  // verifica che sia davvero un backup di Cache prima di accettarlo
  let righe = 0;
  try {
    const Database = (await import('better-sqlite3')).default;
    const probe = new Database(incoming, { readonly: true });
    const tables = probe.prepare("select name from sqlite_master where type='table'").all() as { name: string }[];
    const names = new Set(tables.map((t) => t.name));
    for (const required of ['users', 'products', 'inventory', 'schema_migrations']) {
      if (!names.has(required)) throw new Error(`manca la tabella ${required}`);
    }
    righe = (probe.prepare('select count(*) as n from inventory').get() as { n: number }).n;
    probe.close();
  } catch (e) {
    unlinkSync(incoming);
    return page(c, { error: `Backup non valido: ${(e as Error).message}` });
  }

  // prima dello scambio: dopo, questo utente potrebbe non esistere piu
  logActivity(c.get('user').id, 'admin.restore', `${Math.round(buf.byteLength / 1024)} KB`);
  replaceDatabase(incoming);

  // la sessione vive nel database appena sostituito: se il backup e vecchio,
  // il cookie non vale piu e la prossima pagina rimanda al login
  return c.html(
    <Shell title="Ripristino" bare>
      <div class="flex min-h-[100dvh] flex-col items-center justify-center gap-3 px-6 text-center">
        <div class="font-display text-title">Ripristino fatto</div>
        <p class="font-body text-ink-60 dark:text-dark-muted">
          {righe} {righe === 1 ? 'articolo' : 'articoli'} in inventario. Il database precedente resta
          come <code>.pre-restore</code> accanto a quello nuovo.
        </p>
        <a href="/" class="btn-cta mt-2 w-auto px-6">
          Vai all'inventario
        </a>
      </div>
    </Shell>,
  );
});

/* ------------------------------------------------------------------- CSV */

const csv = (rows: unknown[][]) =>
  rows
    .map((r) =>
      r
        .map((v) => {
          const s = v === null || v === undefined ? '' : String(v);
          return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(';'),
    )
    .join('\r\n');

function sendCsv(c: Context<Env>, name: string, rows: unknown[][]) {
  c.header('Content-Type', 'text/csv; charset=utf-8');
  c.header('Content-Disposition', `attachment; filename="cache-${name}-${todayISO()}.csv"`);
  return c.body(`﻿${csv(rows)}`); // BOM: Excel apre in UTF-8
}

adminRoutes.get('/export.csv', (c) => {
  const rows = db
    .prepare(
      `select p.name, i.location, i.qty, p.unit, i.min_qty, i.expires_on, i.updated_at
       from inventory i join products p on p.id = i.product_id order by i.location, p.name`,
    )
    .all() as Record<string, unknown>[];
  return sendCsv(c, 'inventario', [
    ['prodotto', 'posizione', 'quantita', 'unita', 'soglia', 'scadenza', 'aggiornato'],
    ...rows.map((r) => Object.values(r)),
  ]);
});

adminRoutes.get('/export-spese.csv', (c) => {
  const rows = db
    .prepare(
      `select e.paid_on, e.scope, o.display_name as di, u.display_name as pagata_da, e.label, e.category,
              e.amount_cents, case when e.template_id is null then '' else 'si' end as ricorrente
       from expenses e
       left join users o on o.id = e.owner_id
       left join users u on u.id = coalesce(e.paid_by, e.owner_id)
       order by e.paid_on desc`,
    )
    .all() as Record<string, unknown>[];
  return sendCsv(c, 'spese', [
    ['data', 'ambito', 'di', 'pagata_da', 'etichetta', 'categoria', 'importo', 'ricorrente'],
    ...rows.map((r) => {
      const v = Object.values(r);
      v[6] = euros(Number(v[6])).replace('.', '');
      return v;
    }),
  ]);
});

adminRoutes.get('/export-pasti.csv', (c) => {
  const rows = db.prepare('select on_date, slot, body from meals order by on_date, slot').all() as Record<
    string,
    unknown
  >[];
  return sendCsv(c, 'pasti', [
    ['data', 'pasto', 'piatto'],
    ...rows.map((r) => [r.on_date, r.slot === 'lunch' ? 'pranzo' : 'cena', r.body]),
  ]);
});
