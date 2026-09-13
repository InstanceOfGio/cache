import type { FC } from 'hono/jsx';
import { addDays, dayLong, dayShort, dayNum, isWeekend, weekLabel } from '../lib/dates.js';
import { SLOT_LABEL, type DayMeals, type DishSuggestion } from '../lib/meals.js';
import type { Slot } from '../lib/types.js';
import { Overlay } from './sheet.js';

interface PageProps {
  week: DayMeals[];
  monday: string;
  today: string;
}

export const MealsPage: FC<PageProps> = ({ week, monday, today }) => (
  <>
    <div class="flex items-center justify-between gap-3 px-4 pb-2.5 pt-2 lg:px-10 lg:pt-7">
      <h1 class="font-display text-title lg:text-[34px]">Pasti</h1>
      <div class="flex items-center gap-1.5">
        <a href={`/pasti?w=${addDays(monday, -7)}`} class="btn-quiet w-tap px-0" aria-label="Settimana precedente">
          ‹
        </a>
        <span class="font-display text-[13px] font-bold uppercase tracking-[.06em] lg:w-[190px] lg:text-center lg:text-[15px]">
          {weekLabel(monday)}
        </span>
        <a href={`/pasti?w=${addDays(monday, 7)}`} class="btn-quiet w-tap px-0" aria-label="Settimana successiva">
          ›
        </a>
        <a href="/pasti" class="btn-quiet ml-2 hidden lg:flex">
          Oggi
        </a>
      </div>
    </div>

    {/* ---------------------------------------------------------- mobile */}
    <div class="flex-1 px-4 lg:hidden">
      {week.map((d) =>
        d.date === today ? (
          <div class="my-2 rounded-lg bg-ink px-3.5 pb-3 pt-3.5 text-paper dark:bg-dark-band dark:text-dark-text">
            <div class="flex items-baseline gap-2">
              <span class="font-display text-[26px] font-extrabold leading-none">
                {dayLong(d.date)} {dayNum(d.date)}
              </span>
              <span class="badge bg-olive-light text-dark-bg">Oggi</span>
            </div>
            <div class="mt-3 grid grid-cols-2 gap-2">
              {(['lunch', 'dinner'] as Slot[]).map((slot) => (
                <CellButton date={d.date} slot={slot} body={slot === 'lunch' ? d.lunch : d.dinner} dark />
              ))}
            </div>
          </div>
        ) : (
          <div
            class={`grid min-h-[60px] grid-cols-[54px_1fr_1fr] items-center gap-2 border-b border-dashed border-ink-18 dark:border-dark-line ${
              d.date < today ? 'opacity-50' : ''
            }`}
          >
            <div>
              <div class="font-display text-[11px] font-bold uppercase tracking-[.08em] text-ink-50 dark:text-dark-muted">
                {dayShort(d.date)}
              </div>
              <div class="font-display text-[22px] font-bold leading-none">{dayNum(d.date)}</div>
            </div>
            {(['lunch', 'dinner'] as Slot[]).map((slot) => (
              <CellButton date={d.date} slot={slot} body={slot === 'lunch' ? d.lunch : d.dinner} compact />
            ))}
          </div>
        ),
      )}
      <p class="py-3 text-center font-body text-xs text-ink-60 dark:text-dark-muted">
        Tocca una cella per scrivere. Sette giorni senza scroll.
      </p>
    </div>

    {/* --------------------------------------------------------- desktop */}
    <div class="hidden flex-1 px-10 pb-8 lg:block">
      <div class="mt-6 grid grid-cols-[80px_repeat(7,1fr)] grid-rows-[auto_1fr_1fr] gap-2">
        <div />
        {week.map((d) => (
          <div
            class={`flex items-baseline gap-1.5 px-1 pb-1.5 ${
              d.date === today ? 'border-b-3 border-olive dark:border-olive-light' : 'border-b border-ink-18 dark:border-dark-line'
            } ${d.date < today ? 'opacity-50' : ''}`}
          >
            <span class="font-display text-xs font-bold uppercase tracking-[.08em] text-ink-50 dark:text-dark-muted">
              {dayShort(d.date)}
            </span>
            <span class="font-display text-[26px] font-extrabold leading-none">{dayNum(d.date)}</span>
            {d.date === today ? <span class="badge badge-olive ml-auto">Oggi</span> : null}
          </div>
        ))}

        {(['lunch', 'dinner'] as Slot[]).map((slot) => (
          <>
            <div class="label pt-3.5">{SLOT_LABEL[slot]}</div>
            {week.map((d) => (
              <CellButton
                date={d.date}
                slot={slot}
                body={slot === 'lunch' ? d.lunch : d.dinner}
                weekend={isWeekend(d.date)}
                tall
              />
            ))}
          </>
        ))}
      </div>
      <p class="mt-3.5 font-body text-[13px] text-ink-60 dark:text-dark-muted">
        Clic su una cella per scrivere, con i suggerimenti dei piatti già usati. Il fine settimana ha lo sfondo banda.
      </p>
    </div>
  </>
);

const CellButton: FC<{
  date: string;
  slot: Slot;
  body: string;
  dark?: boolean;
  compact?: boolean;
  tall?: boolean;
  weekend?: boolean;
}> = ({ date, slot, body, dark, compact, tall, weekend }) => {
  const common = 'text-left align-top';
  if (compact) {
    return (
      <button
        class={`${common} py-1.5 font-body text-[15px] leading-snug ${body ? '' : 'text-ink-35 dark:text-dark-muted'}`}
        hx-get={`/pasti/cella?d=${date}&slot=${slot}`}
        hx-target="#sheet"
        hx-swap="innerHTML"
      >
        {body || '—'}
      </button>
    );
  }
  return (
    <button
      class={`${common} rounded-md px-3 py-2.5 ${tall ? 'min-h-[140px]' : 'min-h-[74px]'} ${
        dark
          ? 'bg-dark-cell'
          : weekend
            ? 'bg-paper-band dark:bg-dark-band'
            : 'bg-paper-field dark:bg-dark-cell'
      } ${body ? '' : 'border-1.5 border-dashed border-ink-28 dark:border-dark-line30'}`}
      hx-get={`/pasti/cella?d=${date}&slot=${slot}`}
      hx-target="#sheet"
      hx-swap="innerHTML"
    >
      {/* su desktop il pasto e gia scritto nella colonna di sinistra */}
      <span
        class={`font-display text-[11px] font-bold uppercase tracking-[.08em] ${tall ? 'hidden' : ''} ${
          dark ? 'text-olive-light' : 'text-olive dark:text-olive-light'
        }`}
      >
        {SLOT_LABEL[slot]}
      </span>
      <span class={`mt-1.5 block font-body text-[16px] font-medium leading-snug ${body ? '' : 'opacity-45'}`}>
        {body || 'Libero'}
      </span>
    </button>
  );
};

/* ---------------------------------------------------------- foglio cella */

export const CellSheet: FC<{ date: string; slot: Slot; body: string; suggestions: DishSuggestion[] }> = ({
  date,
  slot,
  body,
  suggestions,
}) => (
  <Overlay>
    <form
      class="sheet border-t-1.5 border-olive dark:border-olive-light"
      id="meal-form"
      hx-post="/pasti/cella"
      hx-target="body"
      hx-swap="innerHTML"
    >
      <input type="hidden" name="d" value={date} />
      <input type="hidden" name="slot" value={slot} />
      <div class="grab mb-3" />
      <div class="flex items-center justify-between">
        <div class="label">
          {dayLong(date)} {dayNum(date)} · {SLOT_LABEL[slot]}
        </div>
        <button type="button" class="btn-text no-underline text-ink-60 dark:text-dark-muted" onclick="closeSheet()">
          Chiudi
        </button>
      </div>

      <div class="mt-2 flex items-center gap-2">
        <input
          class="field flex-1"
          name="body"
          value={body}
          placeholder="Che si mangia?"
          autocomplete="off"
          autofocus
          enterkeyhint="done"
          hx-get="/pasti/suggerimenti"
          hx-target="#dish-suggestions"
          hx-swap="innerHTML"
          hx-trigger="input changed delay:150ms"
        />
        <button type="submit" class="btn-text flex-none">
          Salva
        </button>
      </div>

      <div id="dish-suggestions">
        <DishList suggestions={suggestions} />
      </div>
    </form>
  </Overlay>
);

export const DishList: FC<{ suggestions: DishSuggestion[] }> = ({ suggestions }) => (
  <>
    {suggestions.map((s) => (
      <button
        type="button"
        class="flex h-12 w-full items-center justify-between border-b border-dashed border-ink-18 text-left font-body text-row dark:border-dark-line"
        onclick={`pickDish(${JSON.stringify(s.body)})`}
      >
        <span class="truncate">{s.body}</span>
        <span class="flex-none font-display text-xs font-semibold text-ink-50 dark:text-dark-muted">
          {s.times} {s.times === 1 ? 'volta' : 'volte'}
        </span>
      </button>
    ))}
    <div class="flex h-12 items-center gap-4 font-body text-row text-ink-60 dark:text-dark-muted">
      {['Avanzi', 'Fuori', 'Libero'].map((quick) => (
        <button type="button" onclick={`pickDish(${JSON.stringify(quick)})`} class="underline underline-offset-4">
          {quick}
        </button>
      ))}
    </div>
    <script
      dangerouslySetInnerHTML={{
        __html: `function pickDish(v){var f=document.getElementById('meal-form');
          if(!f)return; f.querySelector('input[name=body]').value=v; f.requestSubmit();}`,
      }}
    />
  </>
);
