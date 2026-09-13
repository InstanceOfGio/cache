import Database from 'better-sqlite3';
import { existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { migrations } from './migrations.js';

const path = resolve(process.env.DATABASE_PATH ?? './data/cache.sqlite');
mkdirSync(dirname(path), { recursive: true });

/**
 * Un ripristino lascia il backup in `<db>.restore`. Lo mettiamo al posto del database
 * qui, prima di aprirlo: e l'unico momento in cui nessuno lo sta usando.
 */
const staged = `${path}.restore`;
if (existsSync(staged)) {
  if (existsSync(path)) renameSync(path, `${path}.pre-restore`);
  rmSync(`${path}-wal`, { force: true });
  rmSync(`${path}-shm`, { force: true });
  renameSync(staged, path);
  console.log('[db] ripristino applicato; il database precedente e in .pre-restore');
}

export const db = new Database(path);
export const dbPath = path;

db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

db.exec('create table if not exists schema_migrations (name text primary key, applied_at text not null default (datetime(\'now\')))');

const applied = new Set(
  db.prepare<[], { name: string }>('select name from schema_migrations').all().map((r) => r.name),
);

for (const m of migrations) {
  if (applied.has(m.name)) continue;
  db.transaction(() => {
    db.exec(m.sql);
    db.prepare('insert into schema_migrations (name) values (?)').run(m.name);
  })();
  console.log(`[db] migrazione applicata: ${m.name}`);
}

export const setting = {
  get(k: string): string | null {
    const row = db.prepare<[string], { v: string }>('select v from settings where k = ?').get(k);
    return row?.v ?? null;
  },
  set(k: string, v: string) {
    db.prepare('insert into settings (k, v) values (?, ?) on conflict(k) do update set v = excluded.v').run(k, v);
  },
};

export function logActivity(userId: number | null, action: string, detail?: string) {
  db.prepare('insert into activity (user_id, action, detail) values (?, ?, ?)').run(userId, action, detail ?? null);
}
