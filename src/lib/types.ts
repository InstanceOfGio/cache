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
export const EXPENSE_CATEGORIES = ['Casa', 'Cibo', 'Trasporti', 'Salute', 'Altro'] as const;
export const PERSON_COLORS = ['#5C6B2A', '#C4643A', '#7D4A73', '#3F5F73', '#8A6D2F', '#4A6B63'] as const;
