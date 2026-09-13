import type { FC, PropsWithChildren } from 'hono/jsx';
import type { User } from '../lib/types.js';
import { Avatar } from './sheet.js';

export type Tab = 'inventario' | 'spesa' | 'spese' | 'pasti';

const TABS: { key: Tab; href: string; label: string }[] = [
  { key: 'inventario', href: '/', label: 'Inventario' },
  { key: 'spesa', href: '/spesa', label: 'Lista spesa' },
  { key: 'spese', href: '/spese', label: 'Spese' },
  { key: 'pasti', href: '/pasti', label: 'Pasti' },
];

/**
 * Il tappo del vasetto visto dall'alto: logo dell'app (proposta 2f del design,
 * con il cerchio in oliva invece che in inchiostro). Le proporzioni vengono
 * dalla scheda a 120px: tappo 88/120, ghiera a 7px dal bordo, C a 54px.
 */
export const Logo: FC<{ size?: number; className?: string }> = ({ size = 32, className = '' }) => (
  <span
    class={`grid flex-none place-items-center bg-paper-band dark:bg-dark-band ${className}`}
    style={`width:${size}px;height:${size}px;border-radius:${(size * 0.225).toFixed(1)}px`}
    aria-hidden="true"
  >
    <span
      class="relative grid place-items-center rounded-full bg-olive dark:bg-olive-light"
      style={`width:${(size * 0.733).toFixed(1)}px;height:${(size * 0.733).toFixed(1)}px`}
    >
      {/* la ghiera: sotto una certa taglia resterebbe una sbavatura, come nella
          scheda del design che a 28px la lascia fuori */}
      {size >= 44 ? (
        <span
          class="absolute rounded-full border-paper/35 dark:border-dark-bg/35"
          style={`inset:${(size * 0.058).toFixed(1)}px;border-width:${Math.max(1, size * 0.017).toFixed(1)}px`}
        />
      ) : null}
      <span
        class="relative font-display font-extrabold leading-none text-paper dark:text-dark-bg"
        style={`font-size:${(size * 0.45).toFixed(1)}px;letter-spacing:-.05em`}
      >
        C
      </span>
    </span>
  </span>
);

const THEME_BOOT = `(function(){try{var t=localStorage.getItem('cache-theme');
if(t==='dark'||(!t&&matchMedia('(prefers-color-scheme:dark)').matches))document.documentElement.classList.add('dark');}catch(e){}})();`;

interface ShellProps {
  title: string;
  user?: User | null;
  tab?: Tab;
  /** Nasconde nav e sidebar: login, fogli a schermo intero. */
  bare?: boolean;
}

export const Shell: FC<PropsWithChildren<ShellProps>> = ({ title, user, tab, bare, children }) => (
  <html lang="it">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      <meta name="theme-color" content="#F4EFE6" media="(prefers-color-scheme: light)" />
      <meta name="theme-color" content="#1B1915" media="(prefers-color-scheme: dark)" />
      <meta name="apple-mobile-web-app-capable" content="yes" />
      <meta name="apple-mobile-web-app-title" content="Cache" />
      <title>{title} · Cache</title>
      <link rel="manifest" href="/manifest.webmanifest" />
      <link rel="icon" href="/icons/icon.svg" type="image/svg+xml" />
      <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="" />
      <link
        href="https://fonts.googleapis.com/css2?family=Gabarito:wght@500;600;700;800&family=Karla:wght@400;500;600&display=swap"
        rel="stylesheet"
      />
      <link rel="stylesheet" href="/app.css" />
      <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
      <script src="/htmx.min.js" defer />
      <script src="/app.js" defer />
    </head>
    <body hx-indicator="body">
      <div id="progress" />
      {bare ? (
        <main class="min-h-[100dvh]">{children}</main>
      ) : (
        <div class="lg:flex lg:min-h-[100dvh]">
          <Sidebar user={user ?? null} tab={tab} />
          <main class="flex min-h-[100dvh] flex-col pb-[calc(theme(spacing.nav)+env(safe-area-inset-bottom))] lg:min-h-0 lg:flex-1 lg:pb-0">
            {children}
          </main>
          <BottomNav tab={tab} />
        </div>
      )}
      <div id="sheet" />
    </body>
  </html>
);

/**
 * Alta quanto lo schermo e ancorata: senza `sticky` la colonna si allunga
 * insieme alla pagina, e su un inventario da cento righe il nome dell'utente
 * finisce a tremila pixel di distanza — cioe invisibile.
 */
const Sidebar: FC<{ user: User | null; tab?: Tab }> = ({ user, tab }) => (
  <aside class="hidden w-[200px] flex-none flex-col gap-1.5 bg-paper-band px-5 py-7 lg:sticky lg:top-0 lg:flex lg:h-[100dvh] lg:overflow-y-auto dark:bg-dark-band">
    <a href="/" class="mb-7 flex items-center gap-2.5">
      <Logo size={32} />
      <span class="font-display text-[22px] font-extrabold tracking-[-.02em]">Cache</span>
    </a>
    {TABS.map((t) => (
      <a
        href={t.href}
        class={`flex h-tap items-center rounded-md px-3 font-display text-base ${
          tab === t.key
            ? 'bg-olive font-bold text-paper dark:bg-olive-light dark:text-dark-bg'
            : 'font-semibold text-ink-60 dark:text-dark-muted'
        }`}
      >
        {t.label}
      </a>
    ))}
    <div class="flex-1" />
    {user && (
      <a href="/admin" class="flex items-center gap-2 font-body text-sm text-ink-60 dark:text-dark-muted">
        <Avatar user={user} size={26} />
        <span class="truncate">
          {user.display_name}
          {user.role === 'admin' ? ' · Admin' : ''}
        </span>
      </a>
    )}
  </aside>
);

const BottomNav: FC<{ tab?: Tab }> = ({ tab }) => (
  <nav class="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-ink-12 bg-paper px-2 pt-1.5 pb-[env(safe-area-inset-bottom)] lg:hidden dark:border-dark-line dark:bg-dark-bg">
    {TABS.map((t) => (
      <a
        href={t.href}
        // "Lista spesa" a 320px non sta su una riga: leading-tight lo fa andare a capo pulito
        class={`flex h-[72px] flex-col items-center justify-center gap-1 px-0.5 text-center font-display text-[13px] leading-tight ${
          tab === t.key ? 'font-bold text-olive dark:text-olive-light' : 'font-semibold text-ink-50 dark:text-dark-muted'
        }`}
      >
        <span class={`h-[3px] w-[26px] rounded-sm ${tab === t.key ? 'bg-olive dark:bg-olive-light' : ''}`} />
        {t.label}
      </a>
    ))}
  </nav>
);

export { Avatar };


/** Intestazione di pagina: titolo grande + slot a destra. */
export const PageHead: FC<PropsWithChildren<{ title: string; sub?: string }>> = ({ title, sub, children }) => (
  <div class="flex items-baseline justify-between gap-3 px-4 pb-2.5 pt-2 lg:px-10 lg:pt-7">
    <h1 class="font-display text-title lg:text-[34px]">{title}</h1>
    {sub ? <span class="font-display text-sm font-semibold text-ink-50 dark:text-dark-muted">{sub}</span> : null}
    {children}
  </div>
);

export const BackLink: FC<{ href: string; label: string }> = ({ href, label }) => (
  <div class="px-4 pt-1 lg:px-10">
    <a href={href} class="flex h-tap items-center font-display text-[17px] font-semibold text-olive dark:text-olive-light">
      ‹ {label}
    </a>
  </div>
);

/** Stato vuoto tratteggiato. */
export const Empty: FC<PropsWithChildren<{ title: string; hint?: string }>> = ({ title, hint, children }) => (
  <div class="m-4 rounded-md border border-dashed border-ink-28 px-4 py-6 text-center dark:border-dark-line30">
    <div class="font-display text-lg font-bold">{title}</div>
    {hint ? <div class="mt-1 font-body text-sm text-ink-60 dark:text-dark-muted">{hint}</div> : null}
    {children ? <div class="mt-3 flex justify-center">{children}</div> : null}
  </div>
);
