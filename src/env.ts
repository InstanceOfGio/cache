/**
 * Carica `.env` se esiste, prima che qualunque altro modulo legga process.env.
 * Va importato per PRIMO in src/index.ts: `src/db/index.ts` legge DATABASE_PATH
 * al momento dell'import, e gli import vengono valutati prima del corpo del file.
 *
 * In produzione (Fly, Docker) il file non c'e e le variabili arrivano
 * dall'ambiente: qui non succede niente.
 */
const path = process.env.ENV_FILE ?? '.env';

if (typeof process.loadEnvFile === 'function') {
  // quello che e gia nell'ambiente vince sul file: comodo per i test,
  // che passano le variabili sulla riga di comando
  const fromEnvironment = { ...process.env };
  try {
    process.loadEnvFile(path);
    Object.assign(process.env, fromEnvironment);
  } catch {
    /* nessun .env: e il caso normale in produzione */
  }
}

export {};
