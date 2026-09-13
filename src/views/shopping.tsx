import type { FC } from 'hono/jsx';
import { qtyLabel } from '../lib/money.js';
import type { LoadLine } from '../lib/shopping.js';
import type { ShoppingRow } from '../lib/types.js';
import { Avatar, BackLink } from './layout.js';

export const Row: FC<{ row: ShoppingRow }> = ({ row }) => {
  const done = !!row.checked_at;
  return (
    <div
      id={`shop-${row.id}`}
      class={`flex h-14 items-center gap-3 border-b border-dashed border-ink-18 px-4 dark:border-dark-line ${
        done ? 'opacity-50' : ''
      }`}
    >
      <button
        class={`grid h-8 w-8 flex-none place-items-center rounded-[5px] border-2 font-display text-xl font-bold ${
          done ? 'border-olive bg-olive text-paper dark:border-olive-light dark:bg-olive-light dark:text-dark-bg' : 'border-ink dark:border-dark-text'
        }`}
        aria-label={done ? `Togli la spunta a ${row.name}` : `Spunta ${row.name}`}
        hx-post={`/spesa/${row.id}/spunta`}
        hx-target="#shop-list"
        hx-swap="outerHTML"
      >
        {done ? '✓' : ''}
      </button>

      <div class="flex min-w-0 flex-1 items-center gap-2">
        <span class={`truncate font-body text-row ${done ? 'line-through' : ''}`}>{row.name}</span>
        {row.size ? (
          <span class="flex-none font-body text-sm text-ink-50 dark:text-dark-muted">{row.size}</span>
        ) : null}
        {row.source === 'threshold' ? <span class="badge badge-auto">Auto · soglia</span> : null}
      </div>

      <span class="flex-none font-display text-xl font-semibold tnum text-ink-60 dark:text-dark-muted">
        {qtyLabel(row.qty)}
      </span>

      {row.added_name ? (
        <Avatar user={{ display_name: row.added_name, color: row.added_color ?? '#5C6B2A' }} size={22} />
      ) : (
        <span class="w-[22px] flex-none" />
      )}

      <button
        class="-mr-1 flex h-tap w-7 flex-none items-center justify-center font-display text-lg text-ink-35 dark:text-dark-muted"
        aria-label={`Togli ${row.name} dalla lista`}
        hx-delete={`/spesa/${row.id}`}
        hx-target="#shop-list"
        hx-swap="outerHTML"
      >
        ×
      </button>
    </div>
  );
};

export const List: FC<{ rows: ShoppingRow[]; done: number }> = ({ rows, done }) => (
  <div id="shop-list" class="flex flex-1 flex-col">
    {rows.length ? (
      rows.map((r) => <Row row={r} />)
    ) : (
      <div class="m-4 rounded-md border border-dashed border-ink-28 px-4 py-7 text-center dark:border-dark-line30">
        <div class="font-display text-lg font-bold">Lista vuota</div>
        <div class="mt-1 font-body text-sm text-ink-60 dark:text-dark-muted">
          Quello che scende sotto soglia arriva qui da solo.
        </div>
      </div>
    )}
    <div class="flex-1" />
    <div class="cta-bar">
      {done > 0 ? (
        <a href="/spesa/carico" class="btn-cta">
          Conferma carico · {done}
        </a>
      ) : (
        <button class="btn-cta" disabled>
          Spunta quello che hai preso
        </button>
      )}
    </div>
  </div>
);

export const ShoppingPage: FC<{ rows: ShoppingRow[]; todo: number; done: number }> = ({ rows, todo, done }) => (
  <div class="mx-auto flex w-full flex-1 flex-col lg:max-w-3xl">
    <div class="flex items-baseline justify-between gap-3 px-4 pb-2.5 pt-2 lg:px-0 lg:pt-7">
      <h1 class="font-display text-title lg:text-[34px]">Spesa</h1>
      <span class="font-display text-sm font-semibold text-ink-50 dark:text-dark-muted">
        {todo} da prendere · {done} fatti
      </span>
    </div>

    <form
      class="flex gap-2 px-4 pb-3 lg:px-0"
      hx-post="/spesa"
      hx-target="#shop-list"
      hx-swap="outerHTML"
      hx-on--after-request="this.reset(); this.querySelector('input').focus()"
    >
      <input
        class="field h-12 flex-1"
        type="text"
        name="name"
        placeholder="Aggiungi alla lista…"
        autocomplete="off"
        enterkeyhint="done"
        required
      />
      <button class="h-12 w-12 flex-none rounded-md bg-olive font-display text-[26px] font-medium text-paper dark:bg-olive-light dark:text-dark-bg">
        +
      </button>
    </form>

    <List rows={rows} done={done} />
  </div>
);

/* ------------------------------------------------------- conferma carico */

export const LoadPage: FC<{ lines: LoadLine[] }> = ({ lines }) => (
  <div class="mx-auto flex w-full flex-1 flex-col lg:max-w-3xl">
    <BackLink href="/spesa" label="Spesa" />
    <h1 class="px-4 pb-1 pt-2 font-display text-title lg:px-0">Entra in casa</h1>
    <p class="px-4 pb-3.5 font-body text-base text-ink-60 lg:px-0 dark:text-dark-muted">
      {lines.length} {lines.length === 1 ? 'articolo spuntato' : 'articoli spuntati'}. Correggi le quantità se al negozio è
      andata diversamente.
    </p>

    <form id="load-form" hx-post="/spesa/carico" hx-target="body" hx-swap="innerHTML" class="flex flex-1 flex-col">
      <div class="flex-1">
        {lines.map((l) => (
          <div class="flex h-[60px] items-center gap-1.5 border-b border-dashed border-ink-18 pl-4 pr-2 dark:border-dark-line">
            <div class="min-w-0 flex-1">
              <div class="truncate font-body text-row">
                {l.name}
                {l.size ? <span class="ml-1.5 text-sm text-ink-50 dark:text-dark-muted">{l.size}</span> : null}
              </div>
              <div class="font-display text-xs font-semibold uppercase tracking-wider text-ink-50 dark:text-dark-muted">
                {l.location} · da {qtyLabel(l.from)} a{' '}
                <span data-total={`t-${l.id}`}>{qtyLabel(l.from + l.qty)}</span>
              </div>
            </div>
            <button
              type="button"
              class="btn-step"
              aria-label="Meno"
              onclick={`stepLoad(${l.id}, -1, ${l.from})`}
            >
              −
            </button>
            <span id={`q-${l.id}`} class="w-tap flex-none text-center font-display text-qty tnum">
              {qtyLabel(l.qty)}
            </span>
            <button type="button" class="btn-step" aria-label="Più" onclick={`stepLoad(${l.id}, 1, ${l.from})`}>
              +
            </button>
            <input type="hidden" name={`qty-${l.id}`} id={`i-${l.id}`} value={String(l.qty)} />
          </div>
        ))}
      </div>

      <div class="cta-bar flex flex-col gap-2">
        <button type="submit" class="btn-cta">
          Conferma · aggiorna inventario
        </button>
        <a href="/spesa" class="flex h-tap items-center justify-center font-display text-[15px] font-semibold text-ink-60 dark:text-dark-muted">
          Lascia nella lista
        </a>
      </div>
    </form>

    <script
      dangerouslySetInnerHTML={{
        __html: `function stepLoad(id, d, from){
          var i=document.getElementById('i-'+id), q=document.getElementById('q-'+id);
          var t=document.querySelector('[data-total="t-'+id+'"]');
          var n=Math.max(0,(parseFloat(i.value)||0)+d);
          i.value=String(n); q.textContent=String(n);
          if(t) t.textContent=String(Math.round((from+n)*100)/100);
        }`,
      }}
    />
  </div>
);
