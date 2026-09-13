import type { FC } from 'hono/jsx';
import { badgeFor, groupOf, type Filter, type Group } from '../lib/inventory.js';
import { measureOf } from '../lib/measure.js';
import { qtyLabel } from '../lib/money.js';
import type { Suggestion } from '../lib/products.js';
import { parseLine } from '../lib/parse.js';
import { LOCATIONS, type InventoryRow } from '../lib/types.js';
import { CategorySelect, MeasureField, Overlay } from './sheet.js';

/* --------------------------------------------------------------- una riga */

export const Row: FC<{ row: InventoryRow }> = ({ row }) => {
  const badge = badgeFor(row);
  const zeroed = row.qty <= 0;
  return (
    <div class="row" id={`inv-${row.id}`}>
      <button
        class="flex min-w-0 flex-1 items-center gap-2 py-1 text-left"
        hx-get={`/inventario/${row.id}/dettagli`}
        hx-target="#sheet"
        hx-swap="innerHTML"
      >
        <span class={`row-name ${zeroed ? 'text-cenere line-through' : ''}`}>{row.name}</span>
        {row.size ? (
          <span class="flex-none font-body text-sm text-ink-50 dark:text-dark-muted">{row.size}</span>
        ) : null}
        {badge && !zeroed ? <span class={`badge badge-${badge.kind}`}>{badge.text}</span> : null}
      </button>

      {zeroed ? (
        <button
          class="h-tap flex-none rounded-md border-1.5 border-dashed border-ink-35 px-3.5 font-display text-sm font-semibold text-ink-60 dark:border-dark-line30 dark:text-dark-muted"
          hx-post={`/inventario/${row.id}/qty?d=1`}
          hx-target={`#inv-${row.id}`}
          hx-swap="outerHTML"
        >
          Ripristina
        </button>
      ) : (
        <>
          <button
            class="btn-step"
            aria-label={`Togli uno · ${row.name}`}
            hx-post={`/inventario/${row.id}/qty?d=-1`}
            hx-target={`#inv-${row.id}`}
            hx-swap="outerHTML"
          >
            −
          </button>
          <span class="qty w-tap flex-none rounded text-center font-display text-qty tnum">{qtyLabel(row.qty)}</span>
          <button
            class="btn-step btn-step-plus"
            aria-label={`Aggiungi uno · ${row.name}`}
            hx-post={`/inventario/${row.id}/qty?d=1`}
            hx-target={`#inv-${row.id}`}
            hx-swap="outerHTML"
          >
            +
          </button>
        </>
      )}
    </div>
  );
};

/* ------------------------------------------------------------- la lista */

export const List: FC<{ rows: InventoryRow[]; q: string; filter: Filter; group: Group }> = ({
  rows,
  q,
  filter,
  group,
}) => {
  if (!rows.length) {
    return (
      <div id="list" class="flex-1">
        <div class="m-4 rounded-md border border-dashed border-ink-28 px-4 py-7 text-center dark:border-dark-line30">
          <div class="font-display text-lg font-bold">
            {q || filter ? 'Nessun risultato' : 'Inventario vuoto'}
          </div>
          <div class="mt-1 font-body text-sm text-ink-60 dark:text-dark-muted">
            {q || filter ? 'Prova a togliere il filtro.' : 'Incolla la tua lista dalle note per partire in un colpo solo.'}
          </div>
          {!q && !filter ? (
            <a href="/importa" class="btn-secondary mx-auto mt-4 inline-flex w-max">
              Importa una lista
            </a>
          ) : null}
        </div>
      </div>
    );
  }
  // le righe arrivano gia nell'ordine giusto: qui si taglia soltanto
  const groups: { title: string; items: InventoryRow[] }[] = [];
  for (const r of rows) {
    const title = groupOf(r, group);
    const last = groups[groups.length - 1];
    if (last && last.title === title) last.items.push(r);
    else groups.push({ title, items: [r] });
  }
  return (
    <div id="list" class="flex-1">
      {groups.map((g) => (
        <>
          <div class="band sticky top-0 z-10">
            <span>{g.title}</span>
            <span class="text-ink-50 dark:text-dark-muted">{g.items.length}</span>
          </div>
          {g.items.map((row) => (
            <Row row={row} />
          ))}
        </>
      ))}
      <div class="h-4" />
    </div>
  );
};

/* -------------------------------------------------------------- la pagina */

interface PageProps {
  rows: InventoryRow[];
  q: string;
  filter: Filter;
  group: Group;
  counts: { threshold: number; expiring: number };
}

export const InventoryPage: FC<PageProps> = ({ rows, q, filter, group, counts }) => (
  // su schermo largo la lista si ferma: righe da 1100px allontanano i - e + dal nome
  <div class="mx-auto flex w-full flex-1 flex-col lg:max-w-3xl">
    <div class="flex items-center justify-between gap-3 px-4 pb-2.5 pt-2 lg:px-0 lg:pt-7">
      <h1 class="font-display text-title lg:text-[34px]">Inventario</h1>
      <div class="flex items-center gap-2">
        <a
          href="/importa"
          class="hidden h-9 items-center rounded-md border-1.5 border-ink-28 px-2.5 font-display text-label uppercase text-ink sm:flex dark:border-dark-line30 dark:text-dark-text"
        >
          Importa
        </a>
        <button
          class="flex h-9 flex-none items-center whitespace-nowrap rounded-md border-1.5 border-ink-28 px-2.5 font-display text-label uppercase text-ink dark:border-dark-line30 dark:text-dark-text"
          hx-get="/llm/copia"
          hx-target="#sheet"
          hx-swap="innerHTML"
        >
          Copia per LLM
        </button>
      </div>
    </div>

    {/* flex-wrap e non una riga sola: con due filtri accesi su un telefono
        stretto i chip vanno a capo invece di far sbordare la pagina */}
    <form
      class="flex flex-wrap gap-2 px-4 pb-2.5 lg:px-0"
      hx-get="/inventario/lista"
      hx-target="#list"
      hx-swap="outerHTML"
      hx-trigger="input changed delay:200ms from:find input[name=q], change"
    >
      <input
        class="field h-tap min-w-[150px] flex-1"
        type="search"
        name="q"
        value={q}
        placeholder="Cerca…"
        autocomplete="off"
        enterkeyhint="search"
      />
      {/* un tap cambia come sono raggruppate le fasce; la scelta resta */}
      <a
        href={`/?grp=${group === 'cat' ? 'loc' : 'cat'}`}
        class="flex h-tap flex-none items-center gap-1 whitespace-nowrap rounded-md border-1.5 border-ink-28 px-3 font-display text-label uppercase text-ink dark:border-dark-line30 dark:text-dark-text"
        aria-label={`Raggruppato per ${group === 'cat' ? 'categoria' : 'posizione'}: tocca per cambiare`}
      >
        <span aria-hidden="true">⇅</span> {group === 'cat' ? 'Categoria' : 'Posizione'}
      </a>
      <Chip name="soglia" active={filter === 'threshold'} count={counts.threshold} label="Soglia" kind="threshold" />
      <Chip name="scad" active={filter === 'expiring'} count={counts.expiring} label="Scad." kind="expiring" />
      {/* il frammento deve sapere come raggruppare tanto quanto la pagina intera */}
      <input type="hidden" name="grp" value={group} />
    </form>

    <List rows={rows} q={q} filter={filter} group={group} />

    <div class="cta-bar">
      <button class="btn-cta" hx-get="/inventario/nuovo" hx-target="#sheet" hx-swap="innerHTML">
        <span class="text-[28px] font-medium leading-none">+</span> Aggiungi
      </button>
    </div>
  </div>
);

const Chip: FC<{ name: string; active: boolean; count: number; label: string; kind: 'threshold' | 'expiring' }> = ({
  name,
  active,
  count,
  label,
  kind,
}) => {
  if (!count) return <input type="hidden" name={name} value={active ? '1' : ''} />;
  const tone =
    kind === 'threshold'
      ? 'bg-senape-tint text-senape-ink dark:bg-dark-senapeBg dark:text-dark-senape'
      : 'bg-terra-tint text-terra-ink dark:bg-dark-terraBg dark:text-dark-terra';
  return (
    <label
      class={`flex h-tap flex-none cursor-pointer items-center rounded-md px-3 font-display text-label uppercase ${tone} ${
        active ? 'ring-2 ring-ink dark:ring-dark-text' : ''
      }`}
    >
      <input type="checkbox" name={name} value="1" checked={active} class="sr-only" />
      {label} {count}
    </label>
  );
};

/* ------------------------------------------------------- foglio: aggiungi */

interface SheetProps {
  q: string;
  suggestions: Suggestion[];
  location: string;
  qty: number;
  /** Resta selezionata fra un articolo e l'altro: di solito se ne carica una serie. */
  category?: string | null;
  justAdded?: { name: string; location: string; undoId: number } | null;
}

export const AddSheet: FC<SheetProps> = ({ q, suggestions, location, qty, category, justAdded }) => (
  <Overlay>
    <form
      class="sheet"
      id="add-form"
      hx-post="/inventario/aggiungi"
      hx-target="#sheet"
      hx-swap="innerHTML"
      hx-disabled-elt="find button[type=submit]"
    >
      {justAdded ? (
        <div class="mb-2 flex h-10 items-center justify-between rounded-md bg-olive px-3.5 font-body text-[15px] text-paper dark:bg-olive-light dark:text-dark-bg">
          <span class="truncate">
            Aggiunto: {justAdded.name} · {justAdded.location}
          </span>
          <button
            type="button"
            class="ml-2 flex-none font-display text-[13px] font-bold underline"
            hx-post={`/inventario/${justAdded.undoId}/annulla`}
            hx-target="#sheet"
            hx-swap="innerHTML"
          >
            Annulla
          </button>
        </div>
      ) : null}

      <div class="grab mb-2.5" />
      <div class="flex items-center justify-between">
        <div class="font-display text-2xl font-extrabold tracking-[-.02em]">Aggiungi</div>
        <button type="button" class="btn-text no-underline text-ink-60 dark:text-dark-muted" onclick="closeSheet()">
          Chiudi
        </button>
      </div>

      <input
        class="field mt-2.5 h-14 text-[19px]"
        type="text"
        name="q"
        value={q}
        placeholder="Che cosa?"
        autocomplete="off"
        autofocus
        enterkeyhint="done"
        hx-get="/inventario/nuovo/suggerimenti"
        hx-target="#suggestions"
        hx-swap="innerHTML"
        hx-trigger="input changed delay:150ms"
        hx-include="#add-form"
      />

      <div id="suggestions" class="mt-2 flex flex-col">
        <Suggestions q={q} suggestions={suggestions} />
      </div>

      <div class="mt-3 flex items-center gap-2">
        <div class="flex h-[52px] flex-none items-center rounded-md border-1.5 border-ink-28 dark:border-dark-line30">
          <button type="button" class="h-full w-12 font-display text-2xl" onclick="stepQty(-1)" aria-label="Meno">
            −
          </button>
          <span id="qty-view" class="w-10 text-center font-display text-2xl font-semibold tnum">
            {qty}
          </span>
          <button type="button" class="h-full w-12 font-display text-2xl" onclick="stepQty(1)" aria-label="Più">
            +
          </button>
          <input type="hidden" name="qty" id="qty-input" value={String(qty)} />
        </div>
        <div class="flex min-w-0 flex-1 gap-1.5 overflow-x-auto">
          {LOCATIONS.map((l) => (
            <label
              class={`flex h-[52px] flex-none cursor-pointer items-center whitespace-nowrap rounded-md px-2.5 font-display text-sm font-semibold ${
                l === location
                  ? 'bg-olive text-paper dark:bg-olive-light dark:text-dark-bg'
                  : 'border-1.5 border-ink-28 dark:border-dark-line30'
              }`}
            >
              <input type="radio" name="location" value={l} checked={l === location} class="sr-only" />
              {l}
            </label>
          ))}
        </div>
      </div>

      <div class="mt-2 flex gap-2">
        <MeasureField className="flex-1" />
        <CategorySelect value={category} className="flex-1" />
      </div>

      <p class="mt-2 font-body text-xs text-ink-60 dark:text-dark-muted">
        Misura e categoria si possono lasciare vuote. La misura scritta nel nome — “ceci 230 gr” — vale lo stesso.
      </p>
      <button type="submit" class="btn-cta mt-3">
        Aggiungi{q.trim() ? ` “${q.trim()}”` : ''}
      </button>
    </form>
  </Overlay>
);

export const Suggestions: FC<{ q: string; suggestions: Suggestion[] }> = ({ q, suggestions }) => {
  const term = q.trim();
  const parsed = term ? parseLine(term) : null;
  // mostriamo cosa ha capito l'app solo quando ha capito qualcosa in piu del nome
  const interpreted = parsed && (parsed.size || parsed.qty > 1 || parsed.expiresOn) ? parsed : null;
  return (
    <>
      {interpreted ? (
        <div class="flex items-center gap-2 border-b border-dashed border-ink-18 py-2 font-body text-sm text-ink-60 dark:border-dark-line dark:text-dark-muted">
          <span class="label">Leggo</span>
          <span class="truncate text-ink dark:text-dark-text">
            {interpreted.name}
            {interpreted.size ? <span class="text-ink-60 dark:text-dark-muted"> · {interpreted.size}</span> : null}
            {interpreted.qty > 1 ? <span class="font-display font-semibold"> ×{interpreted.qty}</span> : null}
            {interpreted.expiresOn ? (
              <span class="text-ink-60 dark:text-dark-muted"> · scade {interpreted.expiresOn}</span>
            ) : null}
          </span>
        </div>
      ) : null}
      {suggestions.map((s) => (
        <button
          type="button"
          class="flex h-row items-center justify-between gap-2 border-b border-dashed border-ink-18 text-left dark:border-dark-line"
          hx-post="/inventario/aggiungi"
          hx-target="#sheet"
          hx-swap="innerHTML"
          hx-vals={JSON.stringify({ product_id: s.id, location: s.location })}
          hx-include="#add-form"
        >
          <span class="truncate font-body text-row">
            <Highlight text={s.name} term={term} />
            {s.size ? <span class="ml-1.5 text-sm text-ink-50 dark:text-dark-muted">{s.size}</span> : null}
          </span>
          <span class="flex-none font-display text-xs font-semibold uppercase tracking-wider text-ink-50 dark:text-dark-muted">
            {s.location} · ne hai {qtyLabel(s.qty)}
          </span>
        </button>
      ))}
      {interpreted || (term && !suggestions.some((s) => s.name.toLowerCase() === term.toLowerCase())) ? (
        <button
          type="submit"
          class="flex h-row items-center gap-2 font-body text-row text-olive dark:text-olive-light"
        >
          <span class="font-display text-[22px] font-semibold">+</span> Crea “{parsed?.name ?? term}
          {parsed?.size ? ` ${parsed.size}` : ''}” come nuovo articolo
        </button>
      ) : null}
    </>
  );
};

const Highlight: FC<{ text: string; term: string }> = ({ text, term }) => {
  const i = term ? text.toLowerCase().indexOf(term.toLowerCase()) : -1;
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <b class="bg-olive-tint font-semibold dark:bg-olive-deep">{text.slice(i, i + term.length)}</b>
      {text.slice(i + term.length)}
    </>
  );
};

/* ------------------------------------------------------- foglio: dettagli */

export const DetailSheet: FC<{ row: InventoryRow }> = ({ row }) => (
  <Overlay>
    <form class="sheet" hx-post={`/inventario/${row.id}/dettagli`} hx-target="#sheet" hx-swap="innerHTML">
      <div class="grab mb-3" />
      <div class="flex items-center justify-between">
        <div class="min-w-0 font-display text-2xl font-extrabold tracking-[-.02em]">
          <span class="block truncate">{row.name}</span>
        </div>
        <button type="button" class="btn-text no-underline text-ink-60 dark:text-dark-muted" onclick="closeSheet()">
          Chiudi
        </button>
      </div>

      <div class="mt-4 grid grid-cols-2 gap-3">
        <div>
          <label class="label" for="qty">
            Quantità
          </label>
          <input
            id="qty"
            class="field mt-1.5 tnum"
            type="number"
            name="qty"
            min="0"
            step="any"
            value={String(row.qty)}
            inputmode="decimal"
            autocomplete="off"
          />
        </div>
        <MeasureField label="Misura" measure={measureOf(row)} />
      </div>

      <div class="mt-3 grid grid-cols-2 gap-3">
        <div>
          <label class="label" for="min_qty">
            Soglia minima
          </label>
          <input
            id="min_qty"
            class="field mt-1.5"
            type="number"
            name="min_qty"
            min="0"
            step="0.5"
            value={row.min_qty ?? ''}
            placeholder="nessuna"
            inputmode="decimal"
          />
        </div>
        <div>
          <label class="label" for="expires_on">
            Scadenza
          </label>
          <input id="expires_on" class="field mt-1.5" type="date" name="expires_on" value={row.expires_on ?? ''} />
        </div>
      </div>

      <CategorySelect label="Categoria" value={row.category} className="mt-4" />

      <div class="label mt-4">Posizione</div>
      <div class="mt-1.5 flex gap-1.5 overflow-x-auto">
        {LOCATIONS.map((l) => (
          <label
            class={`flex h-tap flex-none cursor-pointer items-center whitespace-nowrap rounded-md px-3.5 font-display text-sm font-semibold ${
              l === row.location
                ? 'bg-olive text-paper dark:bg-olive-light dark:text-dark-bg'
                : 'border-1.5 border-ink-28 dark:border-dark-line30'
            }`}
          >
            <input type="radio" name="location" value={l} checked={l === row.location} class="sr-only" />
            {l}
          </label>
        ))}
      </div>

      <p class="mt-3 font-body text-xs text-ink-60 dark:text-dark-muted">
        Sotto la soglia l'articolo finisce da solo nella lista della spesa. Svuota la misura o metti la quantità a zero
        per toglierle: sono due cose separate.
      </p>

      <button type="submit" class="btn-cta mt-4">
        Salva
      </button>
      <button
        type="button"
        class="btn-danger mx-auto mt-2 w-full"
        hx-delete={`/inventario/${row.id}`}
        hx-target="#sheet"
        hx-swap="innerHTML"
        hx-confirm={`Elimino “${row.name}” dall'inventario?`}
      >
        Elimina dall'inventario
      </button>
    </form>
  </Overlay>
);
