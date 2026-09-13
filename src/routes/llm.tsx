import { Hono } from 'hono';
import type { Env } from '../app.js';
import { applyActions, buildContext, parseLLM } from '../lib/llm.js';
import { Shell } from '../views/layout.js';
import { CopySheet, PastePage, Preview } from '../views/llm.js';

export const llmRoutes = new Hono<Env>();

const HINT =
  'Una riga per prodotto. “Passata x6”, “Latte: 2”, “Farina: +1”. “# FRIGO” cambia la posizione delle righe che seguono, “# LISTA SPESA” e “# PASTI” cambiano sezione.';

const PLACEHOLDER = `# DISPENSA
Pasta penne x2
Passata di pomodoro x6

# FRIGO
Latte intero x2

# LISTA SPESA
pane
burro x2`;

llmRoutes.get('/llm/copia', (c) => c.html(<CopySheet text={buildContext()} />));

llmRoutes.get('/importa', (c) =>
  c.html(
    <Shell title="Incolla" user={c.get('user')} tab="inventario">
      <PastePage
        title="Incolla da LLM"
        backHref="/"
        backLabel="Inventario"
        hint={HINT}
        placeholder={PLACEHOLDER}
        raw=""
        actions={[]}
      />
    </Shell>,
  ),
);

llmRoutes.post('/importa/anteprima', async (c) => {
  const form = await c.req.formData();
  const raw = String(form.get('raw') ?? '').slice(0, 20000);
  return c.html(<Preview actions={parseLLM(raw)} raw={raw} />);
});

llmRoutes.post('/importa/applica', async (c) => {
  const form = await c.req.formData();
  const raw = String(form.get('raw') ?? '').slice(0, 20000);
  const picked = new Set(form.getAll('pick').map((v) => Number(v)));
  const parsed = parseLLM(raw);
  const chosen = parsed.filter((_, i) => picked.has(i)).map((p) => p.action);

  applyActions(chosen, c.get('user').id);

  if (c.req.header('HX-Request')) {
    c.header('HX-Redirect', '/');
    return c.body(null, 204);
  }
  return c.redirect('/');
});
