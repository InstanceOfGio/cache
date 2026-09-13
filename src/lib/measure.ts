/**
 * La misura di una confezione: un numero e un'unita.
 *
 * Non convertiamo niente: "1 kg" resta 1 kg e non diventa 1000 g. Cosi quello
 * che si legge nella lista e esattamente quello che si e scritto nel campo, e
 * il nome con cui il prodotto sta in catalogo non cambia sotto i piedi.
 *
 * Nessun import: questo file lo usa anche una migrazione, prima che il resto
 * dell'applicazione esista.
 */

export const MEASURE_UNITS = ['g', 'kg', 'ml', 'l'] as const;
export type MeasureUnit = (typeof MEASURE_UNITS)[number];

export interface Measure {
  value: number;
  unit: MeasureUnit;
}

export function isMeasureUnit(s: unknown): s is MeasureUnit {
  return MEASURE_UNITS.includes(s as MeasureUnit);
}

/** "1,5" invece di "1.5"; gli interi restano interi. */
function decimal(value: number): string {
  const r = Math.round(value * 1000) / 1000;
  return Number.isInteger(r) ? String(r) : String(r).replace('.', ',');
}

/** { value: 230, unit: 'g' } -> "230 g". null quando non c'e misura. */
export function fmtMeasure(m: Measure | null | undefined): string | null {
  return m && m.value > 0 ? `${decimal(m.value)} ${m.unit}` : null;
}

/** "230 g", "1,5 kg", "500ml" -> Measure. Il giro inverso di fmtMeasure. */
export function parseMeasure(text: string | null | undefined): Measure | null {
  const m = String(text ?? '').trim().match(/^(\d+(?:[.,]\d+)?)\s*(kg|g|ml|l)$/i);
  if (!m) return null;
  const value = Number(m[1]!.replace(',', '.'));
  return value > 0 ? { value, unit: m[2]!.toLowerCase() as MeasureUnit } : null;
}

/** Dai due campi del form. Numero vuoto o non valido = nessuna misura. */
export function measureFromForm(rawValue: unknown, rawUnit: unknown): Measure | null {
  const s = String(rawValue ?? '').trim().replace(',', '.');
  if (!s) return null;
  const value = Number(s);
  if (!Number.isFinite(value) || value <= 0) return null;
  const unit = String(rawUnit ?? '');
  return { value: Math.round(value * 1000) / 1000, unit: isMeasureUnit(unit) ? unit : 'g' };
}

/** Dalle colonne del database. */
export function measureOf(row: { size_value?: number | null; size_unit?: string | null }): Measure | null {
  return row.size_value != null && row.size_value > 0 && isMeasureUnit(row.size_unit)
    ? { value: row.size_value, unit: row.size_unit }
    : null;
}
