const fmt = new Intl.NumberFormat('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** 128450 → "1.284,50" */
export const euros = (cents: number) => fmt.format(cents / 100);

/** 128450 → { int: "1.284", dec: "50" } — per il totale a due dimensioni del design. */
export function eurosSplit(cents: number): { int: string; dec: string } {
  const s = euros(cents);
  const i = s.lastIndexOf(',');
  return { int: s.slice(0, i), dec: s.slice(i + 1) };
}

/** Accetta "78,40", "78.40", "€ 78,40", "1.284,50". Ritorna centesimi, o null. */
export function parseEuros(raw: string): number | null {
  let s = raw.replace(/[€\s\u00a0]/g, '').trim();
  if (!s) return null;
  const lastComma = s.lastIndexOf(','), lastDot = s.lastIndexOf('.');
  if (lastComma > -1 && lastDot > -1) {
    // il separatore decimale è l'ultimo dei due
    s = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (lastComma > -1) {
    s = s.replace(',', '.');
  } else if (lastDot > -1 && s.length - lastDot === 4 && !/\.\d{1,2}$/.test(s)) {
    s = s.replace(/\./g, ''); // "1.284" = migliaia
  }
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

/** 2 → "2"; 0.5 → "0,5" */
export function qtyLabel(q: number): string {
  return Number.isInteger(q) ? String(q) : q.toFixed(2).replace(/0$/, '').replace('.', ',');
}
