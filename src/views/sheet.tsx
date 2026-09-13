import type { FC, PropsWithChildren } from 'hono/jsx';
import { MEASURE_UNITS, type Measure } from '../lib/measure.js';
import { PRODUCT_CATEGORIES } from '../lib/types.js';

/** Pannello che sale dal basso, con velo cliccabile per chiudere. */
export const Overlay: FC<PropsWithChildren> = ({ children }) => (
  <div
    class="fixed inset-0 z-50 flex flex-col justify-end bg-ink/50 sm:justify-center sm:p-6"
    onclick="if(event.target===this)closeSheet()"
    role="dialog"
    aria-modal="true"
  >
    {/* dal basso sul telefono, centrato e rientrato su schermo largo */}
    <div class="animate-risein sm:mx-auto sm:w-full sm:max-w-md sm:animate-none sm:overflow-hidden sm:rounded-sheet">
      {children}
    </div>
  </div>
);

export const Avatar: FC<{ user: { name?: string; display_name?: string; color: string }; size?: number }> = ({
  user,
  size = 26,
}) => {
  const name = user.display_name ?? user.name ?? '?';
  return (
    <span
      class="grid flex-none place-items-center rounded-full font-display font-bold text-paper"
      style={`width:${size}px;height:${size}px;background:${user.color};font-size:${Math.round(size * 0.5)}px`}
      title={name}
    >
      {name.trim().charAt(0).toUpperCase()}
    </span>
  );
};

/* ------------------------------------------------------ campi condivisi */

/**
 * La misura: un numero e un'unita, in un campo solo.
 * Svuotare il numero toglie la misura — e tutto quello che serve sapere.
 */
export const MeasureField: FC<{ measure?: Measure | null; label?: string; className?: string }> = ({
  measure,
  label,
  className = '',
}) => (
  <div class={`min-w-0 ${className}`}>
    {label ? <div class="label">{label}</div> : null}
    <div
      class={`flex h-[52px] items-center overflow-hidden rounded-md border-1.5 border-ink-28 bg-paper-field
              focus-within:border-olive dark:border-dark-line30 dark:bg-dark-field dark:focus-within:border-olive-light ${
                label ? 'mt-1.5' : ''
              }`}
    >
      <input
        class="h-full w-full min-w-0 bg-transparent pl-3.5 pr-1 font-body text-row text-ink outline-none
               placeholder:text-ink-50 dark:text-dark-text dark:placeholder:text-dark-muted"
        type="number"
        name="measure_value"
        value={measure ? String(measure.value) : ''}
        placeholder="Misura"
        inputmode="decimal"
        min="0"
        step="any"
        autocomplete="off"
      />
      <select
        name="measure_unit"
        aria-label="Unità di misura"
        class="h-full flex-none border-l-1.5 border-ink-28 bg-transparent px-2 font-display text-[15px] font-semibold
               text-ink dark:border-dark-line30 dark:text-dark-text"
      >
        {MEASURE_UNITS.map((u) => (
          <option value={u} selected={measure?.unit === u}>
            {u}
          </option>
        ))}
      </select>
    </div>
  </div>
);

/** La categoria. Vuota si può lasciare: finisce in "Altro". */
export const CategorySelect: FC<{ value?: string | null; label?: string; className?: string }> = ({
  value,
  label,
  className = '',
}) => (
  <div class={`min-w-0 ${className}`}>
    {label ? <div class="label">{label}</div> : null}
    <select
      name="category"
      aria-label="Categoria"
      class={`field truncate font-display text-[15px] font-semibold ${label ? 'mt-1.5' : ''}`}
    >
      <option value="">Categoria…</option>
      {PRODUCT_CATEGORIES.map((c) => (
        <option value={c} selected={c === value}>
          {c}
        </option>
      ))}
    </select>
  </div>
);
