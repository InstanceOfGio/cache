# Cache

La dispensa di casa, sempre in tasca. Inventario, lista della spesa condivisa, spese e piano dei pasti
per due-quattro persone. Un processo, un file SQLite, un container.

## Come gira

| | |
|---|---|
| Server | Node 22+, [Hono](https://hono.dev) con JSX lato server |
| Database | SQLite via `better-sqlite3`, WAL, migrazioni in `src/db/migrations.ts` |
| Interfaccia | HTML servito dal server + [htmx](https://htmx.org) + Tailwind. Nessuno stato nel browser |
| Sessioni | cookie `httpOnly` + `SameSite=Lax`, token casuale in tabella, 90 giorni |
| Password | scrypt da `node:crypto`, nessuna dipendenza nativa |
| Hosting | Fly.io, una macchina, un volume da 1 GB |

Ogni interazione (il `+1` su un articolo, la spunta in lista) è una POST che restituisce il pezzo di
HTML aggiornato. Non c'è build del frontend oltre a Tailwind, e non c'è stato duplicato fra client e
server: quello che vedi è sempre quello che c'è nel database.

## Partire in locale

```bash
npm install                 # il postinstall genera htmx, icone e manifest
cp .env.example .env        # e cambia ADMIN_PASSWORD
npm run dev                 # Tailwind in watch + server su :3000
```

Al primo avvio su un database vuoto l'app crea l'amministratore da `ADMIN_EMAIL` / `ADMIN_PASSWORD`.
Dopo il primo utente quelle variabili non servono più.

Verifica che tutto risponda:

```bash
npm run build
DATABASE_PATH=./data/cache.sqlite ADMIN_EMAIL=tu@casa.it ADMIN_PASSWORD=una-password PORT=3111 node dist/server.js &
BASE=http://localhost:3111 ADMIN_EMAIL=tu@casa.it ADMIN_PASSWORD=una-password bash scripts/smoke.sh
```

Il giro copre login, import, soglie, carico della spesa, frammenti htmx, privacy fra utenti, backup e permessi:
59 controlli. I frammenti htmx meritano attenzione: se uno va in 500, htmx non sostituisce niente e
l'interfaccia si rompe in silenzio, senza errori a schermo.

## Le cinque cose che fa

**Inventario** — righe raggruppate per posizione, `−`/`+` da 44px, ricerca e due filtri rapidi
(sotto soglia, in scadenza). Tocca il nome per soglia minima, scadenza e posizione. Una riga che
arriva a zero resta grigia con "Ripristina" per 7 giorni, poi sparisce da sola.

**Lista della spesa** — condivisa fra tutti, con l'iniziale di chi ha aggiunto cosa. Quando un
articolo scende sotto la soglia minima compare qui da solo, marcato `Auto · soglia`. In negozio
spunti, a casa premi **Conferma carico**: correggi le quantità e tutto entra in inventario in un
colpo.

**Spese** — due schede. *Le mie* le vede solo chi le ha create; *Comuni* le vedono tutti, ogni voce
con l'avatar di chi ha pagato e il totale del mese spezzato per persona. Una spesa può essere una
tantum o ricorrente: la ricorrente si ricrea da sola a ogni periodo.

**Pasti** — sette giorni per pranzo e cena. Su telefono oggi è espanso e gli altri giorni stanno in
due righe compatte, così la settimana entra senza scroll; su schermo largo è la tabella 7×2. Tocca
una cella e scrivi, con i suggerimenti dei piatti già usati.

**Copia per LLM / Incolla** — un bottone copia inventario, lista e pasti in markdown con il prompt
già pronto sopra. La risposta del modello la reincolli in `/importa`: l'app ti mostra l'anteprima
riga per riga e applica solo quello che spunti.

### Il formato dell'import

Il parser (`src/lib/parse.ts`) è tarato su una lista della dispensa buttata giù su WhatsApp, dove
**i numeri sono quasi sempre pesi, non quantità**: `Riso basmati 1150 gr` è una busta da 1150 grammi,
non 1150 buste. Il peso diventa il *formato* della confezione e fa parte dell'identità del prodotto:
`Ceci 230 g` e `Ceci 400 g` sono due righe distinte in dispensa, perché sono due barattoli diversi.

```
[15:19, 9/13/2026] F.: 4 x ceci 230gr     → Ceci · 230 g · x4   (prefisso WhatsApp tolto)
Frigo                                     → una posizione da sola sposta le righe seguenti
Riso basmati 1150 gr                      → Riso basmati · 1150 g · x1
Fagioli borlotti 115gr x2                 → x2
Zafferano 3 buste                         → x3, "buste" esce dal nome
Crescenza 170 gr scade 17 settembre       → scadenza 2026-09-17
Olive toscane 290gr sgocc 140gr           → "sgocc" e il peso sgocciolato non entrano nel nome
Farina 00 1kg                             → "00" resta nel nome, non è una quantità
Lurpak burro 200                          → x1: 200 panetti di burro non stanno in frigo
Farina: +2                                → somma 2 a quello che c'è già
Yogurt -> Frigo                           → posizione esplicita su una riga sola
```

Se lo stesso prodotto compare più volte nella stessa lista, dalla seconda volta in poi **si somma**:
`Tonno 52gr` e più sotto `Tonno 52gr x3` fanno 4, non 3. Senza questa regola l'ultima riga
cancellerebbe le precedenti.

Le sezioni si cambiano con `# DISPENSA`, `# LISTA SPESA`, `# PASTI` (o con una posizione da sola su
una riga). Una riga che non rispetta niente di tutto questo entra comunque come quantità 1, e niente
viene scritto senza passare dall'anteprima.

Per tarare il parser su una lista vera senza scrivere nulla:

```bash
DATABASE_PATH=/tmp/prova.sqlite npx tsx scripts/dry-run-import.ts lista.txt
npm run test:parse    # 26 casi presi dalla lista vera
```

## Deploy su Fly

Una volta sola:

```bash
fly launch --no-deploy --copy-config --name cache --region fra
fly volumes create cache_data --size 1 --region fra
fly secrets set ADMIN_EMAIL=tu@casa.it ADMIN_PASSWORD='una-password-lunga' ADMIN_NAME=Gio
fly deploy
```

Poi, da GitHub: crea il token con `fly tokens create deploy -x 999999h` e mettilo nei secrets del
repo come `FLY_API_TOKEN`. Da lì ogni push su `main` passa da typecheck, build e giro di verifica
prima di andare in produzione (`.github/workflows/deploy.yml`).

> **Una macchina sola.** Il volume è attaccato a una singola istanza: due macchine sarebbero due
> database che divergono senza dirtelo. Se `fly status` ne mostra più di una, `fly scale count 1`.

La macchina si sospende quando non la usate e riparte in circa un secondo. Non c'è health check
periodico apposta: terrebbe la macchina sveglia ventiquattr'ore su ventiquattro.

## Dati

**Backup** — `/admin` → Scarica. È un `VACUUM INTO`, cioè una copia compattata senza pagine libere e
senza WAL. Fallo ogni tanto: ci mette un secondo.

**Ripristino** — sempre da `/admin`, carichi il file. L'app lo verifica (deve essere SQLite e avere
le tabelle giuste), lo mette da parte come `<db>.restore` e si riavvia: il file prende il posto del
database al boot, quando nessuno lo sta usando. Il database precedente resta come `<db>.pre-restore`,
quindi anche un ripristino sbagliato è recuperabile. Su Fly il riavvio è automatico; in locale rilanci
tu il processo.

**Export CSV** — inventario, spese e pasti, leggibili senza l'app.

**Nota sulla privacy.** Le spese private sono private *nell'app*: nessun utente, admin incluso, le
vede dall'interfaccia. Non sono cifrate: chi scarica il file di backup le legge in chiaro. Per una
privacy vera servirebbe cifratura lato client, che è un'altra storia.

## Struttura

```
src/
  app.ts              middleware (CSRF, sessione) e montaggio delle rotte
  env.ts              carica .env; va importato per primo
  index.ts            avvio, primo admin, chiusura pulita
  db/
    index.ts          connessione, pragma, migrazioni, ripristino al boot
    migrations.ts     lo schema, in ordine. Mai modificare una migrazione applicata
  lib/                dominio puro: inventario, spesa, spese, pasti, parser LLM
  routes/             una rotta per sezione, restituiscono pagine o frammenti
  views/              componenti JSX. `sheet.tsx` ha Overlay e Avatar, condivisi
  styles.css          i @keyframes vanno qui: Tailwind emette solo quelli usati da animate-*
scripts/
  vendor.mjs          copia htmx, disegna le icone PWA, scrive il manifest
  test-parse.ts       casi veri per il parser (npm run test:parse)
  dry-run-import.ts   mostra come verrebbe letto un file, senza scrivere niente
  smoke.sh            il giro completo su un'istanza avviata
```

## Cose da sapere prima di metterci mano

- **Le ricorrenti maturano a ogni richiesta**, non con un cron: la macchina Fly può essere sospesa
  allo scoccare dell'ora, e un cron che non parte è peggio di nessun cron. `generateDue()` è
  idempotente grazie a `unique(template_id, period)`.
- **Il catalogo prodotti è l'unico posto dove vive un nome.** Inventario e lista spesa puntano a
  `products`, con `product_aliases` per "latte" → "Latte intero". È questo che rende automatico il
  passaggio dalla spesa all'inventario.
- **Gli importi sono interi in centesimi.** Niente float sui soldi.
- **Le date sono stringhe `YYYY-MM-DD` in ora di Roma** (`src/lib/dates.ts`), non timestamp.
- **`src/env.ts` va importato per primo** in `index.ts`. `src/db/index.ts` legge `DATABASE_PATH`
  al momento dell'import, e in ESM gli import sono valutati prima del corpo del file: caricare
  `.env` nel corpo di `index.ts` sarebbe troppo tardi. Le variabili già presenti nell'ambiente
  vincono sul file, così `scripts/smoke.sh` può passarle sulla riga di comando senza che un
  `.env` locale gliele sovrascriva.
