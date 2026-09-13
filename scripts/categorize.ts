/**
 * Assegna una categoria ai prodotti che non ne hanno.
 *
 * Serve una volta sola, per non partire con tutto l'inventario dentro "Altro".
 * Non e una migrazione di proposito: sono indovinelli su parole chiave, e gli
 * indovinelli non vanno scritti nella storia dello schema. Ritoccare la tabella
 * qui sotto e rilanciarlo e gratis.
 *
 *   npx tsx scripts/categorize.ts            mostra cosa farebbe
 *   npx tsx scripts/categorize.ts --scrivi   lo fa
 *
 * Tocca solo le schede senza categoria: una scelta fatta a mano non si sovrascrive.
 */
import '../src/env.js';
import { db } from '../src/db/index.js';
import { norm } from '../src/lib/products.js';
import { PRODUCT_CATEGORIES, type ProductCategory } from '../src/lib/types.js';

/** Prima corrispondenza vince: le righe piu specifiche stanno in cima. */
const RULES: [RegExp, ProductCategory][] = [
  // conserve travestite da qualcos'altro: vanno riconosciute prima
  [/pomodori secchi|latte di cocco|cocco.*latte/, 'Scatolame e conserve'],
  // la roba da forno prima di tutto: "farina ceci" non e scatolame e
  // "amido di mais" non e mais
  [/\b(farina|farine|flour|amido|fecola|lievito|zucchero|cacao|vaniglia|vanilla|gelatina)\b/, 'Colazione e dolci'],
  // "curry paste" è una salsa, non un formato di pasta
  [/\bcurry\b/, 'Condimenti e spezie'],

  [/\b(agli|aglio|carote|cipoll\w*|kiwi|pomodori|insalata|patate|limoni?|mele|banane|zucchin\w*|spinaci)\b/, 'Frutta e verdura'],
  [/\b(pollo|manzo|maiale|salmone|prosciutto|salame|speck|bresaola|pancetta|guanciale|carne|pesce)\b/, 'Carne e pesce'],
  [/\b(uova|uovo|latte|burro|lurpak|crescenza|feta|grana|pecorino|parmigiano|mozzarella|ricotta|yogurt|panna|stracchino|mascarpone|formaggi\w*)\b/, 'Latticini e uova'],

  [
    /\b(pasta|penne|farfalle|linguine|spaghett\w*|rigatoni|fusilli|calamarata|quadrucci|tortellini|lasagna|lasagne|anelli|noodles|riso|bulgur|cous ?cous|farro|orzo|quinoa|polenta|cereali|pane|piadin\w*|gnocchi)\b/,
    'Pasta, riso e pane',
  ],
  [
    /\b(ceci|fagioli|lenticchie|mais|piselli|capperi|cetriolini|olive|passata|sugo|ragu|tonno|sgombro|acciughe|pelati|concentrato)\b/,
    'Scatolame e conserve',
  ],
  [
    /\b(olio|aceto|senape|soia|sriracha|gochujang|curry|tahina|wasabi|zafferano|sale|pepe|spezie|semi|sesamo|chia|paprika|curcuma|cannella|origano|brodo|dado)\b/,
    'Condimenti e spezie',
  ],
  [
    /\b(farina|farine|amido|fecola|lievito|zucchero|cacao|vaniglia|vanilla|gelatina|marmellata|miele|sylt|biscott\w*|cioccolat\w*|cereali|fette biscottate|caffe|the|te|tisan\w*|cocco)\b/,
    'Colazione e dolci',
  ],
  [/\b(acqua|vino|birra|succo|bibita|bibite|cola|spremuta)\b/, 'Bevande'],
  [/\b(surgelat\w*|gelato|piselli surgelati|bastoncini)\b/, 'Surgelati'],
  [/\b(detersivo|detergente|sapone|carta|scottex|spugn\w*|sacchetti|pattumiera|ammorbidente|candeggina)\b/, 'Casa e pulizia'],
  [/\b(shampoo|bagnoschiuma|dentifricio|spazzolino|deodorante|rasoio|assorbenti|crema)\b/, 'Cura persona'],
];

function guess(name: string): ProductCategory | null {
  const n = norm(name); // minuscolo, senza accenti: "Caffè" -> "caffe"
  for (const [re, cat] of RULES) if (re.test(n)) return cat;
  return null;
}

const write = process.argv.includes('--scrivi');
const rows = db
  .prepare("select id, name, size from products where category is null or category = '' order by name collate nocase")
  .all() as { id: number; name: string; size: string | null }[];

const found: { id: number; label: string; cat: ProductCategory }[] = [];
const missed: string[] = [];
for (const r of rows) {
  const cat = guess(r.name);
  const label = r.size ? `${r.name} ${r.size}` : r.name;
  if (cat) found.push({ id: r.id, label, cat });
  else missed.push(label);
}

const byCat = new Map<string, string[]>();
for (const f of found) {
  if (!byCat.has(f.cat)) byCat.set(f.cat, []);
  byCat.get(f.cat)!.push(f.label);
}

for (const cat of PRODUCT_CATEGORIES) {
  const items = byCat.get(cat);
  if (!items?.length) continue;
  console.log(`\n${cat.toUpperCase()}  (${items.length})`);
  for (const i of items) console.log(`  ${i}`);
}
if (missed.length) {
  console.log(`\nSENZA CATEGORIA  (${missed.length})  — restano in "Altro" finché non le tocchi tu`);
  for (const m of missed) console.log(`  ${m}`);
}

console.log(`\n${rows.length} schede senza categoria, ${found.length} indovinate, ${missed.length} no.`);

if (!write) {
  console.log('Niente di scritto. Rilancia con --scrivi per applicarlo.');
} else {
  const upd = db.prepare('update products set category = ? where id = ?');
  db.transaction(() => {
    for (const f of found) upd.run(f.cat, f.id);
  })();
  console.log(`Scritte ${found.length} categorie.`);
}
