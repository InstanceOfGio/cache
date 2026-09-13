/**
 * Mostra come verrebbe interpretato un file di testo, senza scrivere niente.
 *
 *   DATABASE_PATH=/tmp/prova.sqlite npx tsx scripts/dry-run-import.ts lista.txt
 *
 * Serve per tarare il parser su una lista vera prima di applicarla davvero.
 */
import { readFileSync } from 'node:fs';
import { parseLLM } from '../src/lib/llm.js';

const file = process.argv[2];
if (!file) {
  console.error('uso: npx tsx scripts/dry-run-import.ts <file.txt>');
  process.exit(1);
}

const raw = readFileSync(file, 'utf8');
const actions = parseLLM(raw);
const righe = raw.split(/\r?\n/).filter((l) => l.trim()).length;

const pad = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s.padEnd(n));

console.log(`righe in ingresso: ${righe}   azioni riconosciute: ${actions.length}\n`);
console.log(pad('NOME', 32) + pad('FORMATO', 10) + pad('Q', 4) + pad('DOVE', 10) + 'SCADE');
console.log('-'.repeat(72));

for (const a of actions) {
  if (a.action.kind !== 'inv') {
    console.log(`[${a.action.kind}] ${a.label}`);
    continue;
  }
  const x = a.action;
  console.log(pad(x.name, 32) + pad(x.size ?? '—', 10) + pad(String(x.qty), 4) + pad(x.location, 10) + (x.expiresOn ?? ''));
}

// righe non riconosciute: quelle che non hanno prodotto nessuna azione
const riconosciute = new Set(actions.map((a) => a.raw));
const perse = raw
  .split(/\r?\n/)
  .map((l) => l.trim())
  .filter((l) => l && ![...riconosciute].some((r) => l.endsWith(r) || r.endsWith(l)));
if (perse.length) {
  console.log(`\nnon interpretate (${perse.length}):`);
  for (const p of perse) console.log(`  ${p}`);
}
