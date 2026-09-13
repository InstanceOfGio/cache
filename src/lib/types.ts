export type Role = 'admin' | 'member';
export type Scope = 'private' | 'common';
export type Slot = 'lunch' | 'dinner';
export type Cadence = 'monthly' | 'bimonthly' | 'quarterly' | 'yearly';

export interface User {
  id: number;
  email: string;
  password_hash: string;
  display_name: string;
  color: string;
  role: Role;
  must_change: number;
  created_at: string;
}

export interface InventoryRow {
  id: number;
  product_id: number;
  name: string;
  size: string | null;
  size_value: number | null;
  size_unit: string | null;
  category: string | null;
  unit: string | null;
  location: string;
  qty: number;
  min_qty: number | null;
  expires_on: string | null;
  zeroed_at: string | null;
}

export interface ShoppingRow {
  id: number;
  product_id: number | null;
  name: string;
  size: string | null;
  category: string | null;
  qty: number;
  note: string | null;
  source: 'manual' | 'threshold' | 'llm';
  added_by: number | null;
  added_name: string | null;
  added_color: string | null;
  checked_at: string | null;
  location: string | null;
}

export interface ExpenseRow {
  id: number;
  scope: Scope;
  owner_id: number;
  paid_by: number | null;
  payer_name: string | null;
  payer_color: string | null;
  template_id: number | null;
  label: string;
  amount_cents: number;
  category: string;
  paid_on: string;
}

export const LOCATIONS = ['Dispensa', 'Frigo', 'Freezer', 'Bagno', 'Cantina'] as const;

/**
 * Le categorie della roba di casa, nell'ordine in cui si attraversa il
 * supermercato: cosi la lista della spesa ordinata per categoria e anche il
 * giro fra le corsie. Una riga senza categoria finisce in fondo, in "Altro".
 */
export const PRODUCT_CATEGORIES = [
  'Frutta e verdura',
  'Carne e pesce',
  'Latticini e uova',
  'Pasta, riso e pane',
  'Scatolame e conserve',
  'Condimenti e spezie',
  'Colazione e dolci',
  'Bevande',
  'Surgelati',
  'Casa e pulizia',
  'Cura persona',
  'Altro',
] as const;

export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

export const NO_CATEGORY = 'Altro';

/** Ritorna la categoria se e una di quelle previste, altrimenti null. */
export function validCategory(s: string | null | undefined): ProductCategory | null {
  return PRODUCT_CATEGORIES.includes(s as ProductCategory) ? (s as ProductCategory) : null;
}

/** Come si chiama il gruppo: senza categoria si finisce in "Altro". */
export function categoryLabel(s: string | null | undefined): ProductCategory {
  return validCategory(s) ?? NO_CATEGORY;
}

/** Indice per l'ordinamento, nell'ordine delle corsie. */
export function categoryRank(s: string | null | undefined): number {
  return PRODUCT_CATEGORIES.indexOf(categoryLabel(s));
}

export const EXPENSE_CATEGORIES = ['Casa', 'Cibo', 'Trasporti', 'Salute', 'Altro'] as const;
export const PERSON_COLORS = ['#5C6B2A', '#C4643A', '#7D4A73', '#3F5F73', '#8A6D2F', '#4A6B63'] as const;
