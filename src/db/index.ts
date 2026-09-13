import Database from 'better-sqlite3';
import { existsSync, renameSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { migrations } from './migrations.js';

const path = resolve(process.env.DATABASE_PATH ?? './data/cache.sqlite');
mkdirSync(dirname(path), { recursive: true });

export const dbPath = path;

/** I tre file che compongono un database SQLite in modalita WAL. */
const PARTS = ['', '-wal', '-shm'] as const;

function open(file: string): Database.Database {
  const d = new Database(file);
  d.pragma('journal_mode = WAL');
  d.pragma('synchronous = NORMAL');
  d.pragma('foreign_keys = ON');
  d.pragma('busy_timeout = 5000');
  return d;
}

function migrate(d: Database.Database) {
  d.exec(
    "create table if not exists schema_migrations (name text primary key, applied_at text not null default (datetime('now')))",
  );
  const applied = new Set((d.prepare('select name from schema_migrations').all() as { name: string }[]).map((r) => r.name));
  for (const m of migrations) {
    if (applied.has(m.name)) continue;
    d.transaction(() => {
      d.exec(m.sql);
      d.prepare('insert into schema_migrations (name) values (?)').run(m.name);
    })();
    console.log(`[db] migrazione applicata: ${m.name}`);
  }
}

/**
 * `let` e non `const`: il ripristino da backup chiude questa connessione, scambia
 * i file e ne apre una nuova. In ESM il binding e vivo, quindi chi ha fatto
 * `import { db }` vede la connessione nuova senza dover fare niente.
 */
export let db = open(path);
migrate(db);

/**
 * Sostituisce il database con il file indicato.
 *
 * Il vecchio database viene messo da parte come `<db>.pre-restore` **con il suo WAL**:
 * in modalita WAL il file principale puo essere praticamente vuoto e contenere tutto
 * nel `-wal`, quindi salvare solo il primo significherebbe salvare un guscio.
 */
export function replaceDatabase(incoming: string) {
  db.pragma('wal_checkpoint(TRUNCATE)'); // porta tutto nel file principale
  db.close();

  for (const part of PARTS) {
    const from = `${path}${part}`;
    const to = `${path}.pre-restore${part}`;
    if (existsSync(to)) renameSync(to, `${to}.old`);
    if (existsSync(from)) renameSync(from, to);
  }
  renameSync(incoming, path);

  db = open(path);
  migrate(db); // il backup puo venire da una versione precedente dello schema
  console.log('[db] ripristino applicato; il database precedente e in .pre-restore');
}

/** Compatibilita: una versione precedente lasciava il backup qui e usciva. */
const staged = `${path}.restore`;
if (existsSync(staged)) replaceDatabase(staged);

export const setting = {
  get(k: string): string | null {
    const row = db.prepare('select v from settings where k = ?').get(k) as { v: string } | undefined;
    return row?.v ?? null;
  },
  set(k: string, v: string) {
    db.prepare('insert into settings (k, v) values (?, ?) on conflict(k) do update set v = excluded.v').run(k, v);
  },
};

export function logActivity(userId: number | null, action: string, detail?: string) {
  db.prepare('insert into activity (user_id, action, detail) values (?, ?, ?)').run(userId, action, detail ?? null);
}

/** Porta il WAL dentro il file principale: da chiamare prima di copiare il database. */
export function checkpoint() {
  try {
    db.pragma('wal_checkpoint(TRUNCATE)');
  } catch {
    /* se il checkpoint non riesce i dati restano comunque nel WAL */
  }
}
