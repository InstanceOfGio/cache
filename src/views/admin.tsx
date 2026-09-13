import type { FC } from 'hono/jsx';
import type { User } from '../lib/types.js';
import { BackLink } from './layout.js';
import { Avatar } from './sheet.js';

interface Props {
  me: User;
  users: User[];
  backup: { size: string; at: string } | null;
  created?: { name: string; email: string; password: string } | null;
  error?: string | null;
  notice?: string | null;
}

export const AdminPage: FC<Props> = ({ me, users, backup, created, error, notice }) => (
  <>
    <BackLink href="/" label="Indietro" />
    <h1 class="px-4 pb-3.5 pt-2 font-display text-title lg:px-10">Amministrazione</h1>

    {notice ? <Flash tone="ok">{notice}</Flash> : null}
    {error ? <Flash tone="bad">{error}</Flash> : null}

    {created ? (
      <div class="mx-4 mb-4 rounded-md border-1.5 border-olive bg-olive-tint p-3.5 lg:mx-10 dark:bg-olive-deep/40">
        <div class="font-display text-base font-bold">Utente creato: {created.name}</div>
        <p class="mt-1 font-body text-sm text-ink-60 dark:text-dark-muted">
          Passala a voce, non la rivedrai più.
        </p>
        <div class="mt-2 flex items-center gap-2">
          <code
            id="new-pwd"
            class="flex-1 select-all rounded border-1.5 border-ink-28 bg-paper-field px-3 py-2.5 font-mono text-[15px] dark:border-dark-line30 dark:bg-dark-field"
          >
            {created.password}
          </code>
          <button type="button" class="btn-secondary flex-none" onclick="copyText('new-pwd', this)">
            Copia
          </button>
        </div>
      </div>
    ) : null}

    <div class="lg:px-10">
      <div class="band">
        <span>Utenti</span>
        <span class="text-ink-50 dark:text-dark-muted">{users.length}</span>
      </div>
      {users.map((u) => (
        <div class="flex h-14 items-center gap-3 border-b border-dashed border-ink-18 px-4 lg:px-0 dark:border-dark-line">
          <Avatar user={u} size={32} />
          <div class="min-w-0 flex-1">
            <div class="truncate font-body text-row">{u.display_name}</div>
            <div class="truncate font-display text-xs font-semibold uppercase tracking-wider text-ink-50 dark:text-dark-muted">
              {u.email}
            </div>
          </div>
          <span class={`badge ${u.role === 'admin' ? 'bg-ink text-paper dark:bg-dark-text dark:text-dark-bg' : 'badge-olive'}`}>
            {u.role === 'admin' ? 'Admin' : 'Membro'}
          </span>
          {u.id !== me.id ? (
            <form method="post" action={`/admin/utenti/${u.id}/elimina`} class="flex-none">
              <button
                class="flex h-tap w-6 items-center justify-center font-display text-lg text-ink-35 dark:text-dark-muted"
                aria-label={`Elimina ${u.display_name}`}
                onclick={`return confirm('Elimino ${u.display_name}? Le sue spese private spariscono con lui.')`}
              >
                ×
              </button>
            </form>
          ) : (
            <span class="w-6 flex-none" />
          )}
        </div>
      ))}

      <form method="post" action="/admin/utenti" class="flex flex-col gap-2 px-4 pt-3 lg:px-0">
        <div class="flex gap-2">
          <input class="field h-12 flex-1" name="display_name" placeholder="Nome" required autocomplete="off" />
          <input class="field h-12 flex-[1.4]" name="email" type="email" placeholder="Email" required autocomplete="off" />
        </div>
        <button class="flex h-12 items-center justify-center rounded-md border-1.5 border-olive font-display text-base font-bold text-olive dark:border-olive-light dark:text-olive-light">
          Crea utente · genera password
        </button>
      </form>

      <div class="band mt-6">Dati</div>
      <DataRow
        title="Scarica backup"
        sub={backup ? `Ultimo: ${backup.at} · ${backup.size}` : 'Copia compattata del database'}
      >
        <a href="/admin/backup" class="btn-secondary">
          Scarica
        </a>
      </DataRow>
      <DataRow title="Esporta CSV" sub="Leggibile senza l'app">
        <div class="flex gap-1.5">
          <a href="/admin/export.csv" class="btn-secondary px-2.5 text-sm">
            Inventario
          </a>
          <a href="/admin/export-spese.csv" class="btn-secondary px-2.5 text-sm">
            Spese
          </a>
          <a href="/admin/export-pasti.csv" class="btn-secondary px-2.5 text-sm">
            Pasti
          </a>
        </div>
      </DataRow>
      <form method="post" action="/admin/ripristina" enctype="multipart/form-data" id="restore-form">
        <DataRow title="Ripristina da backup" sub="Sostituisce tutti i dati" danger>
          <label class="btn-danger cursor-pointer">
            Ripristina…
            <input
              type="file"
              name="file"
              accept=".sqlite,.db,application/octet-stream"
              class="sr-only"
              onchange="if(this.files.length && confirm('Sostituisco TUTTI i dati con il file ' + this.files[0].name + '? L\\'operazione non è reversibile.')) this.form.requestSubmit(); else this.value='';"
            />
          </label>
        </DataRow>
      </form>

      <div class="band mt-6">Sessione</div>
      <DataRow title="Tema" sub="Chiaro o scuro, resta su questo dispositivo">
        <button type="button" class="btn-secondary" onclick="toggleTheme()">
          Cambia
        </button>
      </DataRow>
      <DataRow title="Esci" sub={me.email}>
        <form method="post" action="/logout">
          <button class="btn-secondary">Esci</button>
        </form>
      </DataRow>
      <div class="h-8" />
    </div>
  </>
);

const DataRow: FC<{ title: string; sub: string; danger?: boolean; children?: unknown }> = ({
  title,
  sub,
  danger,
  children,
}) => (
  <div class="flex min-h-[60px] items-center justify-between gap-3 border-b border-dashed border-ink-18 px-4 py-2 lg:px-0 dark:border-dark-line">
    <div class="min-w-0">
      <div class="font-body text-row">{title}</div>
      <div
        class={`font-display text-xs font-semibold uppercase tracking-wider ${
          danger ? 'text-mattone' : 'text-ink-50 dark:text-dark-muted'
        }`}
      >
        {sub}
      </div>
    </div>
    <div class="flex-none">{children}</div>
  </div>
);

const Flash: FC<{ tone: 'ok' | 'bad'; children?: unknown }> = ({ tone, children }) => (
  <div
    class={`mx-4 mb-3 rounded-md px-3.5 py-2.5 font-body text-[15px] lg:mx-10 ${
      tone === 'ok' ? 'bg-olive text-paper dark:bg-olive-light dark:text-dark-bg' : 'bg-mattone text-paper'
    }`}
  >
    {children}
  </div>
);
