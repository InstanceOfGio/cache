/** Migrazioni in ordine. Mai modificare una migrazione già applicata: aggiungine una nuova. */
export const migrations: { name: string; sql: string }[] = [
  {
    name: '001_init',
    sql: `
create table users (
  id            integer primary key,
  email         text    not null collate nocase unique,
  password_hash text    not null,
  display_name  text    not null,
  color         text    not null default '#5C6B2A',
  role          text    not null default 'member' check (role in ('admin','member')),
  must_change   integer not null default 0,
  created_at    text    not null default (datetime('now'))
);

create table sessions (
  id         text    primary key,
  user_id    integer not null references users(id) on delete cascade,
  created_at text    not null default (datetime('now')),
  expires_at text    not null
);
create index sessions_user_idx on sessions(user_id);

-- Catalogo canonico dei prodotti: inventario e lista spesa puntano qui.
create table products (
  id               integer primary key,
  name             text    not null,
  norm             text    not null unique,
  unit             text,
  category         text,
  default_location text    not null default 'Dispensa',
  created_at       text    not null default (datetime('now'))
);

create table product_aliases (
  alias_norm text    primary key,
  product_id integer not null references products(id) on delete cascade
);
create index product_aliases_product_idx on product_aliases(product_id);

-- Una riga per prodotto+posizione.
create table inventory (
  id         integer primary key,
  product_id integer not null references products(id) on delete cascade,
  location   text    not null,
  qty        real    not null default 0,
  min_qty    real,
  expires_on text,
  zeroed_at  text,
  updated_at text    not null default (datetime('now')),
  updated_by integer references users(id) on delete set null,
  unique (product_id, location)
);
create index inventory_location_idx on inventory(location);

create table shopping_items (
  id         integer primary key,
  product_id integer references products(id) on delete set null,
  free_text  text,
  qty        real    not null default 1,
  note       text,
  source     text    not null default 'manual' check (source in ('manual','threshold','llm')),
  added_by   integer references users(id) on delete set null,
  created_at text    not null default (datetime('now')),
  checked_at text,
  checked_by integer references users(id) on delete set null,
  loaded_at  text
);
create index shopping_open_idx on shopping_items(loaded_at, created_at);

create table expense_templates (
  id                   integer primary key,
  scope                text    not null check (scope in ('private','common')),
  owner_id             integer not null references users(id) on delete cascade,
  paid_by              integer references users(id) on delete set null,
  label                text    not null,
  amount_cents         integer not null,
  category             text    not null default 'Altro',
  cadence              text    not null check (cadence in ('monthly','bimonthly','quarterly','yearly')),
  day_of_month         integer not null default 1,
  active               integer not null default 1,
  start_period         text    not null,
  last_generated_period text,
  created_at           text    not null default (datetime('now'))
);

create table expenses (
  id           integer primary key,
  scope        text    not null check (scope in ('private','common')),
  owner_id     integer not null references users(id) on delete cascade,
  paid_by      integer references users(id) on delete set null,
  template_id  integer references expense_templates(id) on delete set null,
  period       text,
  label        text    not null,
  amount_cents integer not null,
  category     text    not null default 'Altro',
  paid_on      text    not null,
  created_at   text    not null default (datetime('now')),
  unique (template_id, period)
);
create index expenses_period_idx on expenses(scope, paid_on);

create table meals (
  id         integer primary key,
  on_date    text    not null,
  slot       text    not null check (slot in ('lunch','dinner')),
  body       text    not null,
  updated_by integer references users(id) on delete set null,
  updated_at text    not null default (datetime('now')),
  unique (on_date, slot)
);

create table activity (
  id      integer primary key,
  user_id integer references users(id) on delete set null,
  action  text    not null,
  detail  text,
  at      text    not null default (datetime('now'))
);
create index activity_at_idx on activity(at desc);

create table settings (k text primary key, v text not null);
`,
  },
  {
    name: '002_product_size',
    sql: `
-- Il formato della confezione: "230 g", "500 ml", "1 kg".
-- Fa parte dell'identita del prodotto (ceci da 230 e da 400 sono due righe
-- distinte in dispensa), quindi entra anche in products.norm.
alter table products add column size text;
`,
  },
];
