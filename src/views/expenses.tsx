import type { FC } from 'hono/jsx';
import { CADENCE_LABEL, type PersonTotal, type Settlement } from '../lib/expenses.js';
import { euros, eurosSplit } from '../lib/money.js';
import { periodLabel } from '../lib/dates.js';
import { EXPENSE_CATEGORIES, type ExpenseRow, type Scope, type User } from '../lib/types.js';
import { Avatar, Overlay } from './sheet.js';

interface PageProps {
  scope: Scope;
  period: string;
  rows: ExpenseRow[];
  total: number;
  people: PersonTotal[];
  settle: Settlement;
  user: User;
  users: User[];
  canGoForward: boolean;
}

export const ExpensesPage: FC<PageProps> = (p) => (
  <>
    <h1 class="px-4 pb-2 pt-2 font-display text-title lg:px-10 lg:pt-7 lg:text-[34px]">Spese</h1>

    <div class="mx-4 flex border-b-1.5 border-ink-18 lg:mx-10 dark:border-dark-line">
      <a href={`/spese?scope=private&period=${p.period}`} class={`tab ${p.scope === 'private' ? 'tab-on' : ''}`}>
        Le mie
      </a>
      <a href={`/spese?scope=common&period=${p.period}`} class={`tab ${p.scope === 'common' ? 'tab-on' : ''}`}>
        Comuni
      </a>
    </div>

    <div class="flex flex-1 flex-col lg:grid lg:grid-cols-[1fr_320px] lg:gap-10 lg:px-10">
      <div class="flex min-w-0 flex-1 flex-col">
        <MonthNav scope={p.scope} period={p.period} canGoForward={p.canGoForward} />

        <div class="px-4 pb-3 pt-2.5 font-display text-total tnum lg:hidden">
          € {eurosSplit(p.total).int}
          <span class="text-[30px]">,{eurosSplit(p.total).dec}</span>
        </div>

        {p.scope === 'common' ? <PersonStrip people={p.people} total={p.total} class="lg:hidden" /> : null}

        <div class="hidden px-0 pb-2 pt-1 lg:grid lg:grid-cols-[40px_1fr_140px_110px_130px] lg:gap-3 lg:border-b-1.5 lg:border-ink-18 lg:px-3 lg:font-display lg:text-label lg:uppercase lg:text-ink-50 dark:lg:border-dark-line dark:lg:text-dark-muted">
          <span />
          <span>Etichetta</span>
          <span>Categoria</span>
          <span>Giorno</span>
          <span class="text-right">Importo</span>
        </div>

        <div class="flex-1">
          {p.rows.length ? (
            p.rows.map((e) => <ExpenseLine row={e} scope={p.scope} user={p.user} />)
          ) : (
            <div class="m-4 rounded-md border border-dashed border-ink-28 px-4 py-7 text-center lg:mx-0 dark:border-dark-line30">
              <div class="font-display text-lg font-bold">Nessuna spesa in {periodLabel(p.period)}</div>
              <div class="mt-1 font-body text-sm text-ink-60 dark:text-dark-muted">
                Le ricorrenti compaiono da sole il giorno dell'addebito.
              </div>
            </div>
          )}
        </div>

        <div class="cta-bar lg:hidden">
          <button
            class="btn-cta"
            hx-get={`/spese/nuova?scope=${p.scope}`}
            hx-target="#sheet"
            hx-swap="innerHTML"
          >
            <span class="text-[28px] font-medium leading-none">+</span> Nuova spesa
          </button>
        </div>
      </div>

      {/* colonna destra, solo desktop */}
      <aside class="hidden border-l border-ink-18 pl-8 pt-6 lg:block dark:border-dark-line">
        <button
          class="btn-cta mb-6"
          hx-get={`/spese/nuova?scope=${p.scope}`}
          hx-target="#sheet"
          hx-swap="innerHTML"
        >
          + Nuova spesa
        </button>
        <div class="label text-ink-50 dark:text-dark-muted">Totale del mese</div>
        <div class="mt-1.5 font-display text-5xl font-bold tnum tracking-[-.02em]">€ {euros(p.total)}</div>
        {p.scope === 'common' ? (
          <>
            <PersonStrip people={p.people} total={p.total} stacked />
            {p.settle.lines.length > 1 ? (
              <div class="mt-4 border-t border-dashed border-ink-18 pt-3.5 font-body text-sm leading-relaxed text-ink-60 dark:border-dark-line dark:text-dark-muted">
                Quota a testa: <b class="font-display text-base text-ink dark:text-dark-text">€ {euros(p.settle.share)}</b>
                <br />
                {p.settle.lines
                  .filter((l) => l.delta !== 0)
                  .map((l) => `${l.name} ${l.delta > 0 ? 'riceve' : 'deve'} ${euros(Math.abs(l.delta))}`)
                  .join(' · ')}
              </div>
            ) : null}
          </>
        ) : null}
      </aside>
    </div>
  </>
);

const MonthNav: FC<{ scope: Scope; period: string; canGoForward: boolean }> = ({ scope, period, canGoForward }) => {
  const shift = (n: number) => {
    const [y, m] = period.split('-').map(Number) as [number, number];
    const d = new Date(Date.UTC(y, m - 1 + n, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  };
  return (
    <div class="flex items-center justify-between px-4 pt-3.5 lg:justify-start lg:gap-3 lg:px-0">
      <a href={`/spese?scope=${scope}&period=${shift(-1)}`} class="btn-quiet w-tap px-0" aria-label="Mese precedente">
        ‹
      </a>
      <div class="font-display text-[15px] font-bold uppercase tracking-[.06em] lg:w-[170px] lg:text-center">
        {periodLabel(period)}
      </div>
      {canGoForward ? (
        <a href={`/spese?scope=${scope}&period=${shift(1)}`} class="btn-quiet w-tap px-0" aria-label="Mese successivo">
          ›
        </a>
      ) : (
        <span class="btn-quiet w-tap px-0 opacity-35">›</span>
      )}
    </div>
  );
};

const PersonStrip: FC<{ people: PersonTotal[]; total: number; class?: string; stacked?: boolean }> = ({
  people,
  total,
  class: cls = '',
  stacked,
}) => {
  const active = people.filter((p) => p.cents > 0);
  if (!active.length) return <></>;
  return (
    <div class={cls}>
      <div class={`mx-4 flex h-2 overflow-hidden rounded ${stacked ? 'mx-0 mb-4 mt-4' : 'mb-3'}`}>
        {active.map((p) => (
          <div style={`flex:${p.cents};background:${p.color}`} title={`${p.name} · ${euros(p.cents)}`} />
        ))}
      </div>
      <div class={stacked ? 'flex flex-col gap-3' : 'flex gap-2 px-4 pb-3'}>
        {active.map((p) => (
          <div class={`flex items-center gap-2 ${stacked ? 'font-body text-base' : 'min-w-0 flex-1'}`}>
            <Avatar user={p} size={26} />
            {stacked ? <span class="flex-1 truncate">{p.name}</span> : null}
            <span class="font-display text-[17px] font-semibold tnum">{euros(p.cents)}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

const ExpenseLine: FC<{ row: ExpenseRow; scope: Scope; user: User }> = ({ row, scope, user }) => {
  const canDelete = row.owner_id === user.id || (scope === 'common' && user.role === 'admin');
  return (
    <div
      id={`exp-${row.id}`}
      class="flex h-14 items-center gap-2.5 border-b border-dashed border-ink-18 px-4 lg:h-[52px] lg:grid lg:grid-cols-[40px_1fr_140px_110px_130px] lg:gap-3 lg:px-3 dark:border-dark-line"
    >
      {scope === 'common' && row.payer_name ? (
        <Avatar user={{ display_name: row.payer_name, color: row.payer_color ?? '#5C6B2A' }} size={26} />
      ) : (
        <span class="hidden lg:block" />
      )}

      <div class="min-w-0 flex-1 lg:flex lg:items-center lg:gap-2">
        <div class="flex items-center gap-1.5 truncate font-body text-row lg:text-base">
          {row.label}
          {row.template_id ? (
            <span class="font-display text-sm font-bold text-olive dark:text-olive-light" title="ricorrente">
              ↻
            </span>
          ) : null}
        </div>
        <div class="font-display text-xs font-semibold uppercase tracking-wider text-ink-50 lg:hidden dark:text-dark-muted">
          {row.category} · {row.paid_on.slice(8)}/{row.paid_on.slice(5, 7)}
        </div>
      </div>

      <span class="hidden font-body text-sm text-ink-60 lg:block dark:text-dark-muted">{row.category}</span>
      <span class="hidden font-body text-sm text-ink-60 lg:block dark:text-dark-muted">
        {row.paid_on.slice(8)}/{row.paid_on.slice(5, 7)}
      </span>

      <span class="flex-none font-display text-xl font-semibold tnum lg:text-right lg:text-lg">{euros(row.amount_cents)}</span>

      {canDelete ? (
        <button
          class="-mr-2 flex h-tap w-6 flex-none items-center justify-center font-display text-lg text-ink-35 lg:hidden dark:text-dark-muted"
          aria-label={`Elimina ${row.label}`}
          hx-delete={`/spese/${row.id}`}
          hx-target={`#exp-${row.id}`}
          hx-swap="outerHTML"
          hx-confirm={`Elimino “${row.label}”?`}
        >
          ×
        </button>
      ) : null}
    </div>
  );
};

/* ------------------------------------------------------ foglio: nuova spesa */

export const ExpenseSheet: FC<{ scope: Scope; user: User; users: User[] }> = ({ scope, user, users }) => (
  <Overlay>
    <form class="sheet max-h-[92dvh] overflow-y-auto" hx-post="/spese" hx-target="body" hx-swap="innerHTML">
      <div class="grab mb-3.5" />
      <div class="flex items-center justify-between">
        <div class="font-display text-2xl font-extrabold tracking-[-.02em]">Nuova spesa</div>
        <button type="button" class="btn-text no-underline text-ink-60 dark:text-dark-muted" onclick="closeSheet()">
          Chiudi
        </button>
      </div>

      <div class="mt-3 flex gap-2.5">
        <div class="min-w-0 flex-1">
          <label class="label" for="label">
            Etichetta
          </label>
          <input id="label" class="field mt-1.5" name="label" required autofocus autocomplete="off" placeholder="Luce" />
        </div>
        <div class="w-[130px] flex-none">
          <label class="label" for="amount">
            Importo
          </label>
          <input
            id="amount"
            class="field mt-1.5 text-right font-display text-2xl font-semibold tnum"
            name="amount"
            required
            inputmode="decimal"
            placeholder="0,00"
          />
        </div>
      </div>

      <div class="label mt-3.5">Categoria</div>
      <div class="mt-1.5 flex gap-1.5 overflow-x-auto pb-1">
        {EXPENSE_CATEGORIES.map((c, i) => (
          <label
            class={`flex h-tap flex-none cursor-pointer items-center whitespace-nowrap rounded-md px-3.5 font-display text-sm font-semibold ${
              i === 0
                ? 'bg-olive text-paper dark:bg-olive-light dark:text-dark-bg'
                : 'border-1.5 border-ink-28 dark:border-dark-line30'
            }`}
          >
            <input type="radio" name="category" value={c} checked={i === 0} class="sr-only" />
            {c}
          </label>
        ))}
      </div>

      <div class="mt-3.5 flex gap-2.5">
        <div class="min-w-0 flex-1">
          <div class="label">Chi paga</div>
          <div class="mt-1.5 flex gap-1.5 overflow-x-auto pb-1">
            {users.map((u) => (
              <label class="flex-none cursor-pointer">
                <input type="radio" name="paid_by" value={String(u.id)} checked={u.id === user.id} class="peer sr-only" />
                <span class="block opacity-45 peer-checked:opacity-100 peer-checked:ring-2 peer-checked:ring-ink peer-checked:ring-offset-2 peer-checked:ring-offset-paper rounded-full dark:peer-checked:ring-dark-text dark:peer-checked:ring-offset-dark-bg">
                  <Avatar user={u} size={44} />
                </span>
              </label>
            ))}
          </div>
        </div>
        <div class="flex-none">
          <div class="label">Visibilità</div>
          <div class="mt-1.5 flex h-tap overflow-hidden rounded-md border-1.5 border-ink-28 dark:border-dark-line30">
            {(['private', 'common'] as Scope[]).map((s) => (
              <label class="cursor-pointer">
                <input type="radio" name="scope" value={s} checked={s === scope} class="peer sr-only" />
                <span class="flex h-full items-center px-3.5 font-display text-sm font-semibold text-ink-60 peer-checked:bg-ink peer-checked:font-bold peer-checked:text-paper dark:text-dark-muted dark:peer-checked:bg-dark-text dark:peer-checked:text-dark-bg">
                  {s === 'private' ? 'Mia' : 'Comune'}
                </span>
              </label>
            ))}
          </div>
        </div>
      </div>

      <div class="mt-4 flex h-12 overflow-hidden rounded-md border-1.5 border-ink-28 dark:border-dark-line30">
        <label class="flex-1 cursor-pointer">
          <input type="radio" name="recurring" value="0" checked class="peer sr-only" onchange="toggleRecurring(false)" />
          <span class="flex h-full items-center justify-center font-display text-[15px] font-semibold text-ink-60 peer-checked:bg-transparent peer-checked:text-ink dark:text-dark-muted dark:peer-checked:text-dark-text">
            Una tantum
          </span>
        </label>
        <label class="flex-1 cursor-pointer">
          <input type="radio" name="recurring" value="1" class="peer sr-only" onchange="toggleRecurring(true)" />
          <span class="flex h-full items-center justify-center font-display text-[15px] font-semibold text-ink-60 peer-checked:bg-olive peer-checked:font-bold peer-checked:text-paper dark:text-dark-muted dark:peer-checked:bg-olive-light dark:peer-checked:text-dark-bg">
            Ricorrente ↻
          </span>
        </label>
      </div>

      <div id="rec-box" class="mt-3 hidden rounded-md bg-olive-tint p-3 dark:bg-olive-deep/40">
        <div class="flex gap-2.5">
          <div class="min-w-0 flex-1">
            <div class="label text-olive-deep dark:text-olive-tint">Cadenza</div>
            <div class="mt-1.5 flex gap-1.5 overflow-x-auto pb-1">
              {(Object.keys(CADENCE_LABEL) as (keyof typeof CADENCE_LABEL)[]).map((c, i) => (
                <label class="flex-none cursor-pointer">
                  <input type="radio" name="cadence" value={c} checked={i === 0} class="peer sr-only" />
                  <span class="flex h-10 items-center whitespace-nowrap rounded-[5px] border-1.5 border-olive px-3 font-display text-sm font-semibold text-olive-deep peer-checked:bg-olive peer-checked:font-bold peer-checked:text-paper dark:text-olive-tint dark:peer-checked:bg-olive-light dark:peer-checked:text-dark-bg">
                    {CADENCE_LABEL[c]}
                  </span>
                </label>
              ))}
            </div>
          </div>
          <div class="flex-none">
            <div class="label text-olive-deep dark:text-olive-tint">Giorno</div>
            <input
              class="mt-1.5 h-10 w-[70px] rounded-[5px] border-1.5 border-olive bg-paper-field text-center font-display text-xl font-semibold tnum dark:bg-dark-field dark:text-dark-text"
              type="number"
              name="day_of_month"
              min="1"
              max="31"
              value="1"
              inputmode="numeric"
            />
          </div>
        </div>
        <p class="mt-2 font-body text-[13px] text-ink-60 dark:text-dark-muted">
          Si ricrea da sola ogni periodo, fino a quando la fermi.
        </p>
      </div>

      <button type="submit" class="btn-cta mt-4">
        Salva spesa
      </button>
    </form>
    <script
      dangerouslySetInnerHTML={{
        __html: `function toggleRecurring(on){var b=document.getElementById('rec-box');if(b)b.classList.toggle('hidden',!on);}`,
      }}
    />
  </Overlay>
);
