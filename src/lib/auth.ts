import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { Context } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { db } from '../db/index.js';
import type { User } from './types.js';

const N = 16384, R = 8, P = 1, KEYLEN = 64;
const COOKIE = 'cache_sid';
const SESSION_DAYS = 90;

export function hashPassword(plain: string): string {
  const salt = randomBytes(16);
  const key = scryptSync(plain.normalize('NFKC'), salt, KEYLEN, { N, r: R, p: P });
  return `scrypt$${N}$${R}$${P}$${salt.toString('hex')}$${key.toString('hex')}`;
}

export function verifyPassword(plain: string, stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, n, r, p, saltHex, keyHex] = parts as [string, string, string, string, string, string];
  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(keyHex, 'hex');
  const actual = scryptSync(plain.normalize('NFKC'), salt, expected.length, { N: +n, r: +r, p: +p });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function createSession(c: Context, userId: number) {
  const id = randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + SESSION_DAYS * 864e5);
  db.prepare('insert into sessions (id, user_id, expires_at) values (?, ?, ?)').run(id, userId, expires.toISOString());
  setCookie(c, COOKIE, id, {
    path: '/',
    httpOnly: true,
    sameSite: 'Lax',
    secure: process.env.NODE_ENV === 'production',
    expires,
  });
}

export function destroySession(c: Context) {
  const id = getCookie(c, COOKIE);
  if (id) db.prepare('delete from sessions where id = ?').run(id);
  deleteCookie(c, COOKIE, { path: '/' });
}

export function currentUser(c: Context): User | null {
  const id = getCookie(c, COOKIE);
  if (!id) return null;
  const row = db
    .prepare<[string], User & { expires_at: string }>(
      `select u.*, s.expires_at from sessions s join users u on u.id = s.user_id where s.id = ?`,
    )
    .get(id);
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    db.prepare('delete from sessions where id = ?').run(id);
    return null;
  }
  return row;
}

/** Elimina le sessioni scadute. Chiamata all'avvio. */
export function pruneSessions() {
  db.prepare("delete from sessions where expires_at < datetime('now')").run();
}
