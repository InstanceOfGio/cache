import type { FC } from 'hono/jsx';
import { Jar } from './layout.js';

export const LoginPage: FC<{ email?: string; error?: string | null }> = ({ email = '', error }) => (
  <div class="flex min-h-[100dvh] flex-col justify-end px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:justify-center">
    <div class="mx-auto w-full max-w-sm">
      <Jar size={72} className="mb-5" />
      <h1 class="font-display text-[44px] font-extrabold leading-none tracking-[-.02em]">Cache</h1>
      <p class="mb-9 mt-2 font-body text-row text-ink-60 dark:text-dark-muted">La dispensa di casa, sempre in tasca.</p>

      {error ? (
        <div class="mb-4 rounded-md bg-mattone px-3.5 py-2.5 font-body text-[15px] text-paper" role="alert">
          {error}
        </div>
      ) : null}

      <form method="post" action="/login" class="flex flex-col">
        <label class="label" for="email">
          Email
        </label>
        <input
          id="email"
          class="field mb-4 mt-1.5"
          type="email"
          name="email"
          value={email}
          required
          autofocus={!email}
          autocomplete="username"
          enterkeyhint="next"
        />

        <label class="label" for="password">
          Password
        </label>
        <input
          id="password"
          class="field mb-6 mt-1.5"
          type="password"
          name="password"
          required
          autofocus={!!email}
          autocomplete="current-password"
          enterkeyhint="go"
        />

        <button class="btn-cta">Entra</button>
      </form>

      <p class="mt-4.5 pt-4 text-center font-body text-[13px] text-ink-50 dark:text-dark-muted">
        Gli accessi li crea chi amministra la casa.
      </p>
    </div>
  </div>
);
