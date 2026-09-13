export const TZ = 'Europe/Rome';

const ymdFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });

/** Data odierna a Roma, YYYY-MM-DD. */
export function todayISO(d = new Date()): string {
  return ymdFmt.format(d);
}

/** Periodo corrente YYYY-MM. */
export function currentPeriod(d = new Date()): string {
  return todayISO(d).slice(0, 7);
}

export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

export function addMonths(period: string, n: number): string {
  const [y, m] = period.split('-').map(Number) as [number, number];
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Lunedì della settimana che contiene iso. */
export function weekStart(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1, d));
  const dow = (t.getUTCDay() + 6) % 7; // lun = 0
  return addDays(iso, -dow);
}

export function daysOfWeek(mondayISO: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(mondayISO, i));
}

const DAY_SHORT = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
const DAY_LONG = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'];
const MONTH_LONG = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
const MONTH_SHORT = ['gen','feb','mar','apr','mag','giu','lug','ago','set','ott','nov','dic'];

function dowIndex(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

export const dayShort = (iso: string) => DAY_SHORT[dowIndex(iso)]!;
export const dayLong = (iso: string) => DAY_LONG[dowIndex(iso)]!;
export const dayNum = (iso: string) => String(Number(iso.slice(8, 10)));
export const isWeekend = (iso: string) => dowIndex(iso) >= 5;
export const monthShort = (iso: string) => MONTH_SHORT[Number(iso.slice(5, 7)) - 1]!;

export function periodLabel(period: string): string {
  return `${MONTH_LONG[Number(period.slice(5, 7)) - 1]} ${period.slice(0, 4)}`;
}

export function weekLabel(mondayISO: string): string {
  const sunday = addDays(mondayISO, 6);
  const a = dayNum(mondayISO), b = dayNum(sunday);
  return monthShort(mondayISO) === monthShort(sunday)
    ? `${a}–${b} ${monthShort(sunday)}`
    : `${a} ${monthShort(mondayISO)} – ${b} ${monthShort(sunday)}`;
}

/** Giorni mancanti alla scadenza (negativo = già scaduto). */
export function daysUntil(iso: string, from = todayISO()): number {
  const ms = Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`);
  return Math.round(ms / 864e5);
}

export function isValidISODate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
}
