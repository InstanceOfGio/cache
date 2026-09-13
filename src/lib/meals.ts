import { db, logActivity } from '../db/index.js';
import { dayLong, daysOfWeek } from './dates.js';
import type { Slot } from './types.js';

export const SLOTS: Slot[] = ['lunch', 'dinner'];
export const SLOT_LABEL: Record<Slot, string> = { lunch: 'Pranzo', dinner: 'Cena' };

export interface DayMeals { date: string; lunch: string; dinner: string }

export function weekMeals(mondayISO: string): DayMeals[] {
  const days = daysOfWeek(mondayISO);
  const rows = db
    .prepare('select on_date, slot, body from meals where on_date between ? and ?')
    .all(days[0], days[6]) as { on_date: string; slot: Slot; body: string }[];
  const map = new Map<string, { lunch: string; dinner: string }>();
  for (const d of days) map.set(d, { lunch: '', dinner: '' });
  for (const r of rows) {
    const slot = map.get(r.on_date);
    if (slot) slot[r.slot] = r.body;
  }
  return days.map((d) => ({ date: d, ...map.get(d)! }));
}

export function getMeal(date: string, slot: Slot): string {
  const r = db.prepare('select body from meals where on_date = ? and slot = ?').get(date, slot) as
    | { body: string }
    | undefined;
  return r?.body ?? '';
}

export function setMeal(date: string, slot: Slot, body: string, userId: number) {
  const text = body.trim();
  if (!text) {
    db.prepare('delete from meals where on_date = ? and slot = ?').run(date, slot);
    return;
  }
  db.prepare(
    `insert into meals (on_date, slot, body, updated_by) values (?, ?, ?, ?)
     on conflict(on_date, slot) do update set body = excluded.body, updated_by = excluded.updated_by,
       updated_at = datetime('now')`,
  ).run(date, slot, text, userId);
  logActivity(userId, 'meal.set', `${dayLong(date)} ${SLOT_LABEL[slot]}: ${text}`);
}

export interface DishSuggestion { body: string; times: number }

/** Piatti gia usati, i piu frequenti prima. */
export function suggestDishes(q: string, limit = 6): DishSuggestion[] {
  const like = `%${q.trim().toLowerCase()}%`;
  return db
    .prepare(
      `select body, count(*) as times from meals
       where lower(body) like ? group by lower(body) order by times desc, max(on_date) desc limit ?`,
    )
    .all(like, limit) as DishSuggestion[];
}

export function mealsAsText(mondayISO: string): string {
  const week = weekMeals(mondayISO);
  const lines = week
    .filter((d) => d.lunch || d.dinner)
    .map((d) => `- ${dayLong(d.date)} ${d.date.slice(8)}: pranzo ${d.lunch || '—'} / cena ${d.dinner || '—'}`);
  return lines.length ? lines.join('\n') : '(settimana ancora vuota)';
}
