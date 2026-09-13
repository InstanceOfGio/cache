import { db, logActivity } from '../db/index.js';
import { addMonths, currentPeriod, todayISO } from './dates.js';
import type { Cadence, ExpenseRow, Scope } from './types.js';

const STEP: Record<Cadence, number> = { monthly: 1, bimonthly: 2, quarterly: 3, yearly: 12 };

export const CADENCE_LABEL: Record<Cadence, string> = {
  monthly: 'Mensile',
  bimonthly: 'Bimestrale',
  quarterly: 'Trimestrale',
  yearly: 'Annuale',
};

/** Data di addebito di un periodo, con il giorno accorciato ai mesi corti. */
export function dueDate(period: string, dayOfMonth: number): string {
  const [y, m] = period.split('-').map(Number) as [number, number];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${period}-${String(Math.min(Math.max(dayOfMonth, 1), last)).padStart(2, '0')}`;
}

interface Template {
  id: number;
  scope: Scope;
  owner_id: number;
  paid_by: number | null;
  label: string;
  amount_cents: number;
  category: string;
  cadence: Cadence;
  day_of_month: number;
  start_period: string;
  last_generated_period: string | null;
}

/**
 * Crea le voci mancanti delle spese ricorrenti. Idempotente: la chiamiamo a ogni richiesta
 * invece di un cron, perche la macchina Fly puo essere sospesa allo scoccare dell'ora.
 */
export function generateDue(now = todayISO()): number {
  const today = now;
  const period = today.slice(0, 7);
  const templates = db.prepare('select * from expense_templates where active = 1').all() as Template[];
  let created = 0;
  const tx = db.transaction(() => {
    for (const t of templates) {
      const step = STEP[t.cadence] ?? 1;
      let p = t.last_generated_period ? addMonths(t.last_generated_period, step) : t.start_period;
      let guard = 0;
      while (p <= period && guard++ < 240) {
        const due = dueDate(p, t.day_of_month);
        if (due > today) break;
        const info = db
          .prepare(
            `insert or ignore into expenses (scope, owner_id, paid_by, template_id, period, label, amount_cents, category, paid_on)
             values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(t.scope, t.owner_id, t.paid_by, t.id, p, t.label, t.amount_cents, t.category, due);
        if (info.changes) created++;
        db.prepare('update expense_templates set last_generated_period = ? where id = ?').run(p, t.id);
        p = addMonths(p, step);
      }
    }
  });
  tx();
  return created;
}

const SELECT = `
  select e.id, e.scope, e.owner_id, e.paid_by, e.template_id, e.label, e.amount_cents, e.category, e.paid_on,
         u.display_name as payer_name, u.color as payer_color
  from expenses e
  left join users u on u.id = coalesce(e.paid_by, e.owner_id)`;

export function listPrivate(userId: number, period: string): ExpenseRow[] {
  return db
    .prepare(`${SELECT} where e.scope = 'private' and e.owner_id = ? and substr(e.paid_on, 1, 7) = ? order by e.paid_on desc, e.id desc`)
    .all(userId, period) as ExpenseRow[];
}

export function listCommon(period: string): ExpenseRow[] {
  return db
    .prepare(`${SELECT} where e.scope = 'common' and substr(e.paid_on, 1, 7) = ? order by e.paid_on desc, e.id desc`)
    .all(period) as ExpenseRow[];
}

export function totalOf(rows: ExpenseRow[]): number {
  return rows.reduce((s, r) => s + r.amount_cents, 0);
}

export interface PersonTotal { id: number; name: string; color: string; cents: number }

/** Totale delle comuni spezzato per chi ha pagato. Include chi non ha pagato nulla (a 0). */
export function commonByPerson(period: string): PersonTotal[] {
  return db
    .prepare(
      `select u.id, u.display_name as name, u.color,
              coalesce((select sum(e.amount_cents) from expenses e
                        where e.scope = 'common' and coalesce(e.paid_by, e.owner_id) = u.id
                          and substr(e.paid_on, 1, 7) = ?), 0) as cents
       from users u order by cents desc, u.display_name`,
    )
    .all(period) as PersonTotal[];
}

export interface Settlement { share: number; lines: { name: string; delta: number }[] }

/** Quota a testa e saldo di ciascuno (positivo = ha anticipato, deve ricevere). */
export function settlement(period: string): Settlement {
  const people = commonByPerson(period);
  if (!people.length) return { share: 0, lines: [] };
  const total = people.reduce((s, p) => s + p.cents, 0);
  const share = Math.round(total / people.length);
  return { share, lines: people.map((p) => ({ name: p.name, delta: p.cents - share })) };
}

export function templatesFor(userId: number): (Template & { payer_name: string | null })[] {
  return db
    .prepare(
      `select t.*, u.display_name as payer_name from expense_templates t
       left join users u on u.id = coalesce(t.paid_by, t.owner_id)
       where t.scope = 'common' or t.owner_id = ? order by t.active desc, t.label collate nocase`,
    )
    .all(userId) as (Template & { payer_name: string | null })[];
}

export interface NewExpense {
  scope: Scope;
  ownerId: number;
  paidBy: number | null;
  label: string;
  amountCents: number;
  category: string;
  recurring: boolean;
  cadence: Cadence;
  dayOfMonth: number;
}

export function createExpense(input: NewExpense): { templateId?: number; created: number } {
  if (input.recurring) {
    const period = currentPeriod();
    const info = db
      .prepare(
        `insert into expense_templates (scope, owner_id, paid_by, label, amount_cents, category, cadence, day_of_month, start_period)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.scope,
        input.ownerId,
        input.paidBy,
        input.label,
        input.amountCents,
        input.category,
        input.cadence,
        input.dayOfMonth,
        period,
      );
    const created = generateDue();
    logActivity(input.ownerId, 'exp.recurring', input.label);
    return { templateId: Number(info.lastInsertRowid), created };
  }
  db.prepare(
    `insert into expenses (scope, owner_id, paid_by, label, amount_cents, category, paid_on)
     values (?, ?, ?, ?, ?, ?, ?)`,
  ).run(input.scope, input.ownerId, input.paidBy, input.label, input.amountCents, input.category, todayISO());
  logActivity(input.ownerId, 'exp.add', input.label);
  return { created: 1 };
}

/** Solo il proprietario (o l'admin, per le comuni) puo cancellare. */
export function deleteExpense(id: number, user: { id: number; role: string }): boolean {
  const row = db.prepare('select scope, owner_id from expenses where id = ?').get(id) as
    | { scope: Scope; owner_id: number }
    | undefined;
  if (!row) return false;
  const allowed = row.owner_id === user.id || (row.scope === 'common' && user.role === 'admin');
  if (!allowed) return false;
  db.prepare('delete from expenses where id = ?').run(id);
  return true;
}

export function stopTemplate(id: number, userId: number): boolean {
  const row = db.prepare('select owner_id, scope from expense_templates where id = ?').get(id) as
    | { owner_id: number; scope: Scope }
    | undefined;
  if (!row) return false;
  if (row.scope === 'private' && row.owner_id !== userId) return false;
  db.prepare('update expense_templates set active = 0 where id = ?').run(id);
  return true;
}
