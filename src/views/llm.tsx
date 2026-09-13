import type { FC } from 'hono/jsx';
import type { ParsedAction } from '../lib/llm.js';
import { qtyLabel } from '../lib/money.js';
import { BackLink } from './layout.js';
import { Overlay } from './sheet.js';

/* ------------------------------------------------------ foglio: copia */

export const CopySheet: FC<{ text: string }> = ({ text }) => (
  <Overlay>
    <div class="sheet max-h-[92dvh] overflow-y-auto">
      <div class="grab mb-3" />
      <div class="flex items-center justify-between">
        <div class="font-display text-2xl font-extrabold tracking-[-.02em]">Copia per LLM</div>
        <button type="button" class="btn-text no-underline text-ink-60 dark:text-dark-muted" onclick="closeSheet()">
          Chiudi
        </button>
      </div>
      <p class="mt-1.5 font-body text-sm text-ink-60 dark:text-dark-muted">
        Inventario, lista della spesa e pasti della settimana, con il prompt già pronto sopra.
      </p>

      <textarea
        id="llm-text"
        class="field mt-3 h-52 w-full resize-none whitespace-pre p-3 font-mono text-[13px] leading-relaxed"
        readonly
        onclick="this.select()"
      >{text}</textarea>

      <button type="button" class="btn-cta mt-3" onclick="copyText('llm-text', this)">
        Copia negli appunti
      </button>
      <a
        href="/importa"
        class="mt-2 flex h-tap items-center justify-center font-display text-[15px] font-semibold text-ink-60 dark:text-dark-muted"
      >
        …e poi incolla qui la risposta ›
      </a>
    </div>
  </Overlay>
);

/* -------------------------------------------------- pagina: incolla */

interface PasteProps {
  title: string;
  backHref: string;
  backLabel: string;
  hint: string;
  placeholder: string;
  raw: string;
  actions: ParsedAction[];
}

export const PastePage: FC<PasteProps> = ({ title, backHref, backLabel, hint, placeholder, raw, actions }) => {
  return (
    <div class="mx-auto flex w-full flex-1 flex-col lg:max-w-3xl">
      <BackLink href={backHref} label={backLabel} />
      <h1 class="px-4 pb-2.5 pt-2 font-display text-title lg:px-0">{title}</h1>

      <form hx-post="/importa/anteprima" hx-target="#preview" hx-swap="outerHTML" class="px-4 lg:px-0">
        <textarea
          class="field h-28 w-full resize-y p-3 font-mono text-[13px] leading-relaxed"
          name="raw"
          placeholder={placeholder}
          hx-post="/importa/anteprima"
          hx-target="#preview"
          hx-swap="outerHTML"
          hx-trigger="input changed delay:400ms, paste delay:120ms"
        >{raw}</textarea>
        <p class="mt-1.5 font-body text-xs text-ink-60 dark:text-dark-muted">{hint}</p>
      </form>

      <Preview actions={actions} raw={raw} />
    </div>
  );
};

export const Preview: FC<{ actions: ParsedAction[]; raw: string }> = ({ actions, raw }) => {
  const groups: { band: string; items: { a: ParsedAction; i: number }[] }[] = [
    { band: 'Inventario', items: [] },
    { band: 'Lista spesa', items: [] },
    { band: 'Pasti', items: [] },
  ];
  actions.forEach((a, i) => {
    const g = a.action.kind === 'inv' ? 0 : a.action.kind === 'shop' ? 1 : 2;
    groups[g]!.items.push({ a, i });
  });
  const filled = groups.filter((g) => g.items.length);

  if (!actions.length) {
    return (
      <div id="preview" class="flex flex-1 flex-col">
        <div class="m-4 rounded-md border border-dashed border-ink-28 px-4 py-7 text-center lg:mx-0 dark:border-dark-line30">
          <div class="font-display text-lg font-bold">{raw.trim() ? 'Non ho capito niente' : 'Niente da applicare'}</div>
          <div class="mt-1 font-body text-sm text-ink-60 dark:text-dark-muted">
            {raw.trim()
              ? 'Prova con una riga per prodotto, tipo “Passata di pomodoro x6”.'
              : 'Incolla il testo qui sopra: te lo mostro prima di toccare qualcosa.'}
          </div>
        </div>
      </div>
    );
  }

  return (
    <form id="preview" class="flex flex-1 flex-col" hx-post="/importa/applica" hx-target="body" hx-swap="innerHTML">
      <input type="hidden" name="raw" value={raw} />
      <div class="flex items-center justify-between px-4 pb-2 pt-3 lg:px-0">
        <div class="label">
          Anteprima · {actions.length} {actions.length === 1 ? 'modifica' : 'modifiche'}
        </div>
      </div>

      <div class="flex-1">
        {filled.map((g) => (
          <>
            <div class="band">{g.band}</div>
            {g.items.map(({ a, i }) => (
              <label class="flex h-14 cursor-pointer items-center gap-3 border-b border-dashed border-ink-18 px-4 dark:border-dark-line">
                <input type="checkbox" name="pick" value={String(i)} checked class="peer sr-only" />
                <span class="grid h-8 w-8 flex-none place-items-center rounded-[5px] border-2 border-ink font-display text-xl font-bold peer-checked:border-olive peer-checked:bg-olive peer-checked:text-paper dark:border-dark-text dark:peer-checked:border-olive-light dark:peer-checked:bg-olive-light dark:peer-checked:text-dark-bg">
                  ✓
                </span>
                <span
                  class={`w-12 flex-none rounded py-[3px] text-center font-display text-badge uppercase ${
                    a.tag === 'Nuovo' ? 'badge-olive' : a.tag === 'Somma' ? 'badge-threshold' : 'bg-paper-band dark:bg-dark-band'
                  }`}
                >
                  {a.tag}
                </span>
                <span class="min-w-0 flex-1">
                  <span class="block truncate font-body text-row">{a.label}</span>
                  <span class="block truncate font-display text-xs font-semibold uppercase tracking-wider text-ink-50 dark:text-dark-muted">
                    {a.detail}
                  </span>
                </span>
                {a.action.kind !== 'meal' ? (
                  <span class="flex-none font-display text-xl font-semibold tnum">{qtyLabel(a.action.qty)}</span>
                ) : null}
              </label>
            ))}
          </>
        ))}
      </div>

      <div class="cta-bar flex flex-col gap-1.5">
        <button type="submit" class="btn-cta">
          Applica le modifiche scelte
        </button>
        <p class="text-center font-body text-xs text-ink-60 dark:text-dark-muted">
          Niente viene toccato senza essere in questo elenco.
        </p>
      </div>
    </form>
  );
};
