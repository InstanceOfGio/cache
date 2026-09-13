/**
 * Casi veri presi dalla lista della dispensa su WhatsApp.
 *
 *   npm run test:parse
 *
 * Il parser e il pezzo piu fragile del progetto: qui i numeri sono quasi sempre
 * PESI e non conteggi, e ogni riga e scritta in modo diverso.
 */
import { parseLine, stripWhatsApp } from '../src/lib/parse.js';

interface Caso {
  in: string;
  name: string;
  size: string | null;
  qty: number;
  expiresOn?: string | null;
}

const CASI: Caso[] = [
  // il peso e il formato, non la quantita
  { in: 'Riso basmati 1150 gr', name: 'Riso basmati', size: '1150 g', qty: 1 },
  { in: 'Farina 00 1kg', name: 'Farina 00', size: '1 kg', qty: 1 },
  { in: 'Latte di Cocco 400 ml', name: 'Latte di Cocco', size: '400 ml', qty: 1 },
  { in: 'Salsa di soia 360gt', name: 'Salsa di soia', size: '360 g', qty: 1 }, // refuso "gt" per "gr"
  { in: 'Wasabi43 gr', name: 'Wasabi', size: '43 g', qty: 1 }, // senza spazio
  { in: 'Gochujang250gr', name: 'Gochujang', size: '250 g', qty: 1 },

  // quantita scritte nei modi piu vari
  { in: '4 x ceci 230gr sgocciolato', name: 'Ceci', size: '230 g', qty: 4 },
  { in: 'Fagioli borlotti 115gr x2', name: 'Fagioli borlotti', size: '115 g', qty: 2 },
  { in: 'Capperi sottosale x3 130gr', name: 'Capperi sottosale', size: '130 g', qty: 3 },
  { in: 'Feta 3 x 125 gr', name: 'Feta', size: '125 g', qty: 3 },
  { in: 'Lievito per pizza 50gr x 3 sacchetti', name: 'Lievito per pizza', size: '50 g', qty: 3 },
  { in: 'Zafferano 3 buste', name: 'Zafferano', size: null, qty: 3 },
  { in: 'Agli 3 capi', name: 'Agli', size: null, qty: 3 },
  { in: '5 kiwi', name: 'Kiwi', size: null, qty: 5 },
  { in: 'Curry golden 2 quadrati', name: 'Curry golden', size: null, qty: 2 },
  { in: '2 gr vaniglia', name: 'Vaniglia', size: '2 g', qty: 1 },

  // numeri che NON sono quantita
  { in: 'Lurpak burro 200', name: 'Lurpak burro 200', size: null, qty: 1 }, // 200 panetti no
  { in: 'Penne rigate 205 gr', name: 'Penne rigate', size: '205 g', qty: 1 },

  // scadenze
  { in: 'Crescenza 170 gr scade 17 settembre', name: 'Crescenza', size: '170 g', qty: 1, expiresOn: '2026-09-17' },
  { in: 'Uova medie 6 scadono 21 09', name: 'Uova medie', size: null, qty: 6, expiresOn: '2026-09-21' },

  // parole che descrivono il peso, non il prodotto
  { in: 'Olive toscane 290gr sgocc 140gr', name: 'Olive toscane', size: '290 g', qty: 1 },
  { in: 'Cipolline 210 gr sgocciolate', name: 'Cipolline', size: '210 g', qty: 1 },

  // il "+" somma invece di impostare
  { in: 'Farina: +2', name: 'Farina', size: null, qty: 2 },

  // l'inventario esportato per l'LLM, reincollato tale e quale
  { in: '- Ceci 230 g x3 [Scatolame e conserve]', name: 'Ceci', size: '230 g', qty: 3 },
  { in: '- Passata pomodoro 700 g x1 (sotto soglia)', name: 'Passata pomodoro', size: '700 g', qty: 1 },

  // i centilitri diventano millilitri: sono le uniche due unita scegliibili a mano
  { in: 'Panna da cucina 20 cl', name: 'Panna da cucina', size: '200 ml', qty: 1 },
];

/** La misura letta dev'essere anche scomponibile: e cosi che arriva nei campi. */
const MISURE: [string, number | null, string | null][] = [
  ['Ceci 230 gr', 230, 'g'],
  ['Farina 00 1kg', 1, 'kg'],
  ['Latte 500 ml', 500, 'ml'],
  ['Olio 1,5 l', 1.5, 'l'],
  ['Zafferano 3 buste', null, null],
];

const OGGI = new Date('2026-09-13T12:00:00Z');
let falliti = 0;

console.log('parseLine\n');
for (const c of CASI) {
  const got = parseLine(c.in, OGGI);
  const problemi: string[] = [];
  if (!got) {
    problemi.push('nessun risultato');
  } else {
    if (got.name !== c.name) problemi.push(`nome "${got.name}" invece di "${c.name}"`);
    if (got.size !== c.size) problemi.push(`formato "${got.size}" invece di "${c.size}"`);
    if (got.qty !== c.qty) problemi.push(`quantita ${got.qty} invece di ${c.qty}`);
    const exp = c.expiresOn ?? null;
    if (got.expiresOn !== exp) problemi.push(`scadenza "${got.expiresOn}" invece di "${exp}"`);
  }
  if (problemi.length) {
    falliti++;
    console.log(`  FALLITO  ${c.in}\n           ${problemi.join('; ')}`);
  } else {
    console.log(`  ok       ${c.in}`);
  }
}

console.log('\nmisura scomposta\n');
for (const [input, value, unit] of MISURE) {
  const m = parseLine(input, OGGI)?.measure ?? null;
  const got = m ? `${m.value} ${m.unit}` : 'nessuna';
  const atteso = value === null ? 'nessuna' : `${value} ${unit}`;
  if (got !== atteso) {
    falliti++;
    console.log(`  FALLITO  "${input}" -> ${got} invece di ${atteso}`);
  } else {
    console.log(`  ok       ${input.padEnd(22)} -> ${atteso}`);
  }
}

console.log('\nstripWhatsApp\n');
const PREFISSI: [string, string][] = [
  ['[15:19, 9/13/2026] F.: 4 x ceci 230gr', '4 x ceci 230gr'],
  ['[16:07, 9/13/2026] Gio Ferriani: Cetriolini 50 gr', 'Cetriolini 50 gr'],
  ['Riso rosso 150gr', 'Riso rosso 150gr'], // riga senza prefisso: intatta
];
for (const [input, atteso] of PREFISSI) {
  const got = stripWhatsApp(input);
  if (got !== atteso) {
    falliti++;
    console.log(`  FALLITO  "${input}" -> "${got}" invece di "${atteso}"`);
  } else {
    console.log(`  ok       "${atteso}"`);
  }
}

console.log(`\npassati: ${CASI.length + MISURE.length + PREFISSI.length - falliti}   falliti: ${falliti}`);
process.exit(falliti ? 1 : 0);
