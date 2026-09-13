#!/usr/bin/env bash
# Giro completo su un'istanza gia avviata su $BASE
set -u
BASE=${BASE:-http://localhost:3111}
MAIL=${ADMIN_EMAIL:-giovanniferriani@gmail.com}
PASS=${ADMIN_PASSWORD:-cambiami-subito}
J=$(mktemp)
ok=0; ko=0

say() { printf '%-46s %s\n' "$1" "$2"; }
check() { # nome, atteso, ottenuto
  if [ "$2" = "$3" ]; then say "$1" "ok"; ok=$((ok+1));
  else say "$1" "FALLITO (atteso $2, ottenuto $3)"; ko=$((ko+1)); fi
}
contains() { # nome, aghi, pagliaio
  if printf '%s' "$3" | grep -qF "$2"; then say "$1" "ok"; ok=$((ok+1));
  else say "$1" "FALLITO (manca: $2)"; ko=$((ko+1)); fi
}

G() { curl -s -b "$J" -c "$J" "$@"; }
CODE() { curl -s -o /dev/null -w '%{http_code}' -b "$J" -c "$J" "$@"; }

# --- login ---------------------------------------------------------------
check "login con password sbagliata" 401 "$(CODE -X POST "$BASE/login" --data-urlencode "email=$MAIL" -d "password=palesemente-sbagliata")"
check "login" 302 "$(CODE -X POST "$BASE/login" --data-urlencode "email=$MAIL" --data-urlencode "password=$PASS")"
check "inventario raggiungibile" 200 "$(CODE "$BASE/")"

# --- import lista dalle note ---------------------------------------------
RAW=$'# DISPENSA\nPasta penne x2\nPassata di pomodoro x6\nCaffe macinato\n\n# FRIGO\nLatte intero x2\nUova x6'
PREV=$(G -X POST "$BASE/importa/anteprima" --data-urlencode "raw=$RAW")
contains "anteprima import: 5 modifiche" "Anteprima · 5" "$PREV"
contains "anteprima: gruppo Inventario"  ">Inventario<" "$PREV"
contains "anteprima: Passata riconosciuta" "Passata di pomodoro" "$PREV"
contains "anteprima: posizione Frigo"    "Frigo · da 0 a 2" "$PREV"

check "applica import" 302 "$(CODE -X POST "$BASE/importa/applica" --data-urlencode "raw=$RAW" \
  -d 'pick=0' -d 'pick=1' -d 'pick=2' -d 'pick=3' -d 'pick=4')"

INV=$(G "$BASE/")
contains "inventario: banda Dispensa" ">Dispensa<" "$INV"
contains "inventario: banda Frigo"    ">Frigo<" "$INV"
contains "inventario: Pasta penne"    "Pasta penne" "$INV"
contains "inventario: Uova non importate (non spuntata)" "Latte intero" "$INV"

# --- +1 / -1 su una riga -------------------------------------------------
ID=$(printf '%s' "$INV" | grep -o 'id="inv-[0-9]*"' | head -1 | grep -o '[0-9]*')
FRAG=$(G -X POST "$BASE/inventario/$ID/qty?d=1")
contains "incremento restituisce la riga" "inv-$ID" "$FRAG"

# --- ricerca -------------------------------------------------------------
SEARCH=$(G "$BASE/inventario/lista?q=pass")
contains "ricerca trova Passata" "Passata di pomodoro" "$SEARCH"
if printf '%s' "$SEARCH" | grep -qF "Pasta penne"; then say "ricerca esclude il resto" "FALLITO"; ko=$((ko+1)); else say "ricerca esclude il resto" "ok"; ok=$((ok+1)); fi

# --- soglia -> lista spesa ----------------------------------------------
G -X POST "$BASE/inventario/$ID/dettagli" -d 'min_qty=10' -d 'expires_on=' -d 'location=Dispensa' > /dev/null
SHOP=$(G "$BASE/spesa")
contains "sotto soglia entra in lista spesa" "Auto · soglia" "$SHOP"

# --- lista spesa ---------------------------------------------------------
ADD=$(G -X POST "$BASE/spesa" -d 'name=Pane' -d 'qty=1')
contains "aggiunta manuale in lista" "Pane" "$ADD"
SID=$(printf '%s' "$ADD" | grep -o 'id="shop-[0-9]*"' | tail -1 | grep -o '[0-9]*')
CHK=$(G -X POST "$BASE/spesa/$SID/spunta")
contains "spunta attiva il carico" "Conferma carico · 1" "$CHK"
LOAD=$(G "$BASE/spesa/carico")
contains "pagina carico" "Entra in casa" "$LOAD"
check "conferma carico" 302 "$(CODE -X POST "$BASE/spesa/carico" -d "qty-$SID=3")"
contains "il pane e entrato in dispensa" "Pane" "$(G "$BASE/")"

# --- spese ---------------------------------------------------------------
check "spesa una tantum" 302 "$(CODE -X POST "$BASE/spese" -d 'label=Spesa Esselunga' -d 'amount=87,40' -d 'scope=common' -d 'category=Cibo' -d 'recurring=0')"
check "spesa ricorrente"  302 "$(CODE -X POST "$BASE/spese" -d 'label=Netflix' -d 'amount=12,99' -d 'scope=private' -d 'category=Casa' -d 'recurring=1' -d 'cadence=monthly' -d 'day_of_month=1')"
MIE=$(G "$BASE/spese?scope=private")
contains "spese private: Netflix" "Netflix" "$MIE"
contains "spese private: importo"  "12,99" "$MIE"
if printf '%s' "$MIE" | grep -qF "Spesa Esselunga"; then say "le private non mostrano le comuni" "FALLITO"; ko=$((ko+1)); else say "le private non mostrano le comuni" "ok"; ok=$((ok+1)); fi
COM=$(G "$BASE/spese?scope=common")
contains "spese comuni: Esselunga" "Spesa Esselunga" "$COM"
contains "spese comuni: totale"    "87,40" "$COM"
if printf '%s' "$COM" | grep -qF "Netflix"; then say "le comuni non mostrano le private" "FALLITO"; ko=$((ko+1)); else say "le comuni non mostrano le private" "ok"; ok=$((ok+1)); fi

# --- pasti ---------------------------------------------------------------
TODAY=$(date +%F)
check "salva un pasto" 302 "$(CODE -X POST "$BASE/pasti/cella" -d "d=$TODAY" -d 'slot=dinner' -d 'body=Risotto ai funghi')"
PASTI=$(G "$BASE/pasti")
contains "pasti: il piatto c'e" "Risotto ai funghi" "$PASTI"
contains "pasti: oggi evidenziato" "Oggi" "$PASTI"

# --- contesto LLM --------------------------------------------------------
CTX=$(G "$BASE/llm/copia")
contains "contesto LLM: inventario" "# DISPENSA" "$CTX"
contains "contesto LLM: pasti"      "Risotto ai funghi" "$CTX"

# --- admin ---------------------------------------------------------------
ADM=$(G "$BASE/admin")
contains "admin: elenco utenti" "$MAIL" "$ADM"
NEW=$(G -X POST "$BASE/admin/utenti" -d 'display_name=Caroline' -d 'email=caroline@casa.it')
contains "admin: utente creato" "Utente creato: Caroline" "$NEW"
check "backup scaricabile" 200 "$(CODE "$BASE/admin/backup")"
BK=$(curl -s -b "$J" "$BASE/admin/backup" | head -c 16)
contains "il backup e un file SQLite" "SQLite format 3" "$BK"
check "export CSV" 200 "$(CODE "$BASE/admin/export.csv")"

# --- ripristino ----------------------------------------------------------
# Il giro completo: scarico, sporco, ripristino, controllo che sia tornato indietro.
BK_FILE=$(mktemp); curl -s -b "$J" -o "$BK_FILE" "$BASE/admin/backup"
PRIMA=$(G "$BASE/" | grep -o 'id="inv-[0-9]*"' | wc -l)
G -X POST "$BASE/spesa" -d 'name=Articolo da cancellare col ripristino' > /dev/null
contains "prima del ripristino la riga c'e" "Articolo da cancellare" "$(G "$BASE/spesa")"

RIP=$(G -X POST "$BASE/admin/ripristina" -F "file=@$BK_FILE")
contains "il ripristino conferma" "Ripristino fatto" "$RIP"
contains "il ripristino dice quanti articoli" "in inventario" "$RIP"

DOPO=$(G "$BASE/" | grep -o 'id="inv-[0-9]*"' | wc -l)
check "l'inventario e tornato com'era" "$PRIMA" "$DOPO"
if printf '%s' "$(G "$BASE/spesa")" | grep -qF "Articolo da cancellare"; then
  say "il ripristino ha annullato la modifica" "FALLITO"; ko=$((ko+1))
else say "il ripristino ha annullato la modifica" "ok"; ok=$((ok+1)); fi
check "l'app risponde ancora dopo il ripristino" 200 "$(CODE "$BASE/")"
check "la sessione sopravvive al ripristino"     200 "$(CODE "$BASE/admin")"
check "un file che non e un database viene rifiutato" 200 "$(CODE -X POST "$BASE/admin/ripristina" -F "file=@$0")"
contains "e lo dice" "Non sembra un database SQLite" "$(G -X POST "$BASE/admin/ripristina" -F "file=@$0")"

# --- frammenti htmx ------------------------------------------------------
# Ogni pezzo di UI caricato via htmx: se uno va in 500 l'interfaccia si rompe
# in silenzio, perche htmx non sostituisce niente e non c'e errore a schermo.
SUG=$(G "$BASE/inventario/nuovo/suggerimenti?q=pass")
contains "autocomplete inventario" "ata di pomodoro" "$SUG"   # il prefisso cercato e dentro un <b>
contains "autocomplete: prefisso evidenziato" ">Pass</b>" "$SUG"
contains "autocomplete: posizione e giacenza" "ne hai" "$SUG"
check "autocomplete a mani vuote"  200 "$(CODE "$BASE/inventario/nuovo/suggerimenti?q=")"
check "foglio aggiungi"            200 "$(CODE "$BASE/inventario/nuovo")"

# dal foglio si scrive tutto di getto: nome, formato e quantita in un campo solo
ADDED=$(G -X POST "$BASE/inventario/aggiungi" -d 'q=Ceci 230 gr x4' -d 'qty=1' -d 'location=Dispensa')
contains "aggiunta: nome e formato separati" "Aggiunto: Ceci 230 g" "$ADDED"
INVX=$(G "$BASE/")
contains "in lista compare il formato" "230 g" "$INVX"
# il formato e la posizione sono entrambi stringhe: gia scambiati una volta
if printf '%s' "$INVX" | grep -qE 'Ceci</span>[^<]*<span[^>]*>(Dispensa|Frigo)'; then
  say "il formato non e la posizione" "FALLITO"; ko=$((ko+1))
else say "il formato non e la posizione" "ok"; ok=$((ok+1)); fi
contains "la quantita scritta a mano vince" ">4<" "$INVX"
QLEGGE=$(G "$BASE/inventario/nuovo/suggerimenti?q=Riso%20500%20gr%20x2")
contains "il foglio dice cosa ha letto" "Leggo" "$QLEGGE"
check "foglio dettagli"            200 "$(CODE "$BASE/inventario/$ID/dettagli")"
check "foglio copia per LLM"       200 "$(CODE "$BASE/llm/copia")"
check "foglio nuova spesa"         200 "$(CODE "$BASE/spese/nuova?scope=common")"
check "foglio cella pasto"         200 "$(CODE "$BASE/pasti/cella?d=$TODAY&slot=dinner")"
DISH=$(G "$BASE/pasti/suggerimenti?body=ris")
contains "autocomplete piatti" "Risotto ai funghi" "$DISH"
check "data non valida rifiutata"  400 "$(CODE "$BASE/pasti/cella?d=pippo&slot=cena")"

# --- misura e quantita ---------------------------------------------------
# Due numeri distinti su ogni articolo: quanto pesa la confezione, e quante ce
# ne sono. Togliere l'uno non deve toccare l'altro.
M1=$(G -X POST "$BASE/inventario/aggiungi" -d 'q=Yogurt greco' -d 'qty=2' -d 'location=Frigo' \
     -d 'measure_value=150' -d 'measure_unit=g' --data-urlencode 'category=Latticini e uova')
contains "aggiunta con misura dai campi" "Aggiunto: Yogurt greco 150 g" "$M1"
INVM=$(G "$BASE/")
contains "in lista: la misura"    "150 g" "$INVM"
contains "in lista: la quantita"  'tnum">2<' "$INVM"

IDY=$(printf '%s' "$INVM" | sed 's/Yogurt greco.*//' | grep -o 'inv-[0-9]*' | tail -1 | grep -o '[0-9]*')
DET=$(G "$BASE/inventario/$IDY/dettagli")
contains "dettagli: campo quantita"  'name="qty"' "$DET"
contains "dettagli: campo misura"    'name="measure_value"' "$DET"
contains "dettagli: campo unita"     'name="measure_unit"' "$DET"
contains "dettagli: campo categoria" 'name="category"' "$DET"
contains "dettagli: la misura arriva compilata" 'value="150"' "$DET"

G -X POST "$BASE/inventario/$IDY/dettagli" -d 'qty=3' -d 'measure_value=500' -d 'measure_unit=ml' \
  -d 'category=Bevande' -d 'min_qty=' -d 'expires_on=' -d 'location=Frigo' > /dev/null
INVM2=$(G "$BASE/")
contains "la misura cambiata si vede"    "500 ml" "$INVM2"
contains "la quantita cambiata si vede"  'tnum">3<' "$INVM2"

# svuotare il numero e il modo di togliere la misura: la quantita resta
G -X POST "$BASE/inventario/$IDY/dettagli" -d 'qty=3' -d 'measure_value=' -d 'measure_unit=ml' \
  -d 'category=Bevande' -d 'min_qty=' -d 'expires_on=' -d 'location=Frigo' > /dev/null
INVM3=$(G "$BASE/")
if printf '%s' "$INVM3" | grep -qF "500 ml"; then
  say "svuotare il campo toglie la misura" "FALLITO"; ko=$((ko+1))
else say "svuotare il campo toglie la misura" "ok"; ok=$((ok+1)); fi
contains "e l'articolo resta"        "Yogurt greco" "$INVM3"
contains "con la sua quantita"       'tnum">3<' "$INVM3"

# Portare una misura sopra un prodotto che esiste gia: l'unicita del catalogo
# farebbe fallire l'update, quindi le due schede vanno fuse.
G -X POST "$BASE/inventario/aggiungi" -d 'q=Tonno' -d 'qty=2' -d 'location=Dispensa' \
  -d 'measure_value=80' -d 'measure_unit=g' > /dev/null
G -X POST "$BASE/inventario/aggiungi" -d 'q=Tonno' -d 'qty=3' -d 'location=Dispensa' \
  -d 'measure_value=52' -d 'measure_unit=g' > /dev/null
IDT=$(printf '%s' "$(G "$BASE/")" | sed 's/52 g.*//' | grep -o 'inv-[0-9]*' | tail -1 | grep -o '[0-9]*')
G -X POST "$BASE/inventario/$IDT/dettagli" -d 'qty=3' -d 'measure_value=80' -d 'measure_unit=g' \
  -d 'category=' -d 'min_qty=' -d 'expires_on=' -d 'location=Dispensa' > /dev/null
check "l'app regge la fusione di due misure uguali" 200 "$(CODE "$BASE/")"
INVT=$(G "$BASE/")
if printf '%s' "$INVT" | grep -qF "52 g"; then
  say "la scheda vecchia sparisce" "FALLITO"; ko=$((ko+1))
else say "la scheda vecchia sparisce" "ok"; ok=$((ok+1)); fi
contains "le quantita si sommano" 'tnum">5<' "$INVT"

# --- categorie -----------------------------------------------------------
CAT=$(G "$BASE/?grp=cat")
contains "raggruppa per categoria" 'class="band sticky top-0 z-10"><span>Bevande</span>' "$CAT"
contains "il bottone dice come e raggruppato" 'Raggruppato per categoria' "$CAT"
contains "la scelta resta senza rimetterla nell'indirizzo" '<span>Bevande</span>' "$(G "$BASE/")"
LOC=$(G "$BASE/?grp=loc")
contains "si torna alle posizioni" 'class="band sticky top-0 z-10"><span>Dispensa</span>' "$LOC"
contains "e anche questa resta"    'class="band sticky top-0 z-10"><span>Dispensa</span>' "$(G "$BASE/")"
contains "il frammento sa come raggruppare" 'name="grp"' "$LOC"

# --- lista spesa in ordine di corsia --------------------------------------
contains "la lista spesa chiede la categoria" 'name="category"' "$(G "$BASE/spesa")"
G -X POST "$BASE/spesa" -d 'name=Mele' --data-urlencode 'category=Frutta e verdura' > /dev/null
G -X POST "$BASE/spesa" -d 'name=Detersivo piatti' --data-urlencode 'category=Casa e pulizia' > /dev/null
SHOPC=$(G "$BASE/spesa")
contains "lista spesa: fascia di categoria" 'class="band"><span>Frutta e verdura</span>' "$SHOPC"
# ogni nome compare due volte (aria-label e riga): teniamo la prima occorrenza
ORD=$(printf '%s' "$SHOPC" | grep -o 'Mele\|Detersivo piatti' | awk '!seen[$0]++' | tr '\n' ' ')
check "la lista segue l'ordine delle corsie" "Mele Detersivo piatti " "$ORD"

# --- barra laterale ------------------------------------------------------
# Chi sei sta in fondo alla colonna: senza `sticky` su un inventario lungo
# finisce fuori schermo. Questo non si vede da HTTP, ma la classe si.
contains "la colonna resta ancorata allo schermo" 'lg:sticky lg:top-0' "$(G "$BASE/")"
contains "e nell'inventario c'e il link al tuo profilo" 'href="/admin"' "$(G "$BASE/")"

# --- privacy fra utenti --------------------------------------------------
# la password generata compare una volta sola, nella pagina che l'ha creata
PWD2=$(printf '%s' "$NEW" | tr '<' '\n' | grep -A0 'code id="new-pwd"' | sed 's/.*>//' | tr -d ' \n')
J2=$(mktemp)
G2() { curl -s -b "$J2" -c "$J2" "$@"; }
CODE2() { curl -s -o /dev/null -w '%{http_code}' -b "$J2" -c "$J2" "$@"; }
check "login del secondo utente" 302 "$(CODE2 -X POST "$BASE/login" -d 'email=caroline@casa.it' --data-urlencode "password=$PWD2")"

MIE2=$(G2 "$BASE/spese?scope=private")
if printf '%s' "$MIE2" | grep -qF "Netflix"; then
  say "le private di uno NON si vedono dall'altro" "FALLITO"; ko=$((ko+1))
else say "le private di uno NON si vedono dall'altro" "ok"; ok=$((ok+1)); fi

COM2=$(G2 "$BASE/spese?scope=common")
contains "le comuni si vedono da entrambi" "Spesa Esselunga" "$COM2"
contains "il secondo utente vede la riga automatica" "Auto · soglia" "$(G2 "$BASE/spesa")"
G2 -X POST "$BASE/spesa" -d 'name=Carta forno' -d 'qty=1' > /dev/null
contains "cio che aggiunge uno lo vede l'altro" "Carta forno" "$(G "$BASE/spesa")"
check "un membro non entra in amministrazione" 403 "$(CODE2 "$BASE/admin")"
check "un membro non scarica il backup"        403 "$(CODE2 "$BASE/admin/backup")"

# --- cambio password dall'amministrazione --------------------------------
UID2=$(printf '%s' "$(G "$BASE/admin")" | grep -o '/admin/utenti/[0-9]*"' | tail -1 | grep -o '[0-9]*')
SHEET=$(G "$BASE/admin/utenti/$UID2")
contains "foglio utente" "Nuova password" "$SHEET"
contains "foglio utente: si puo eliminare" "Elimina Caroline" "$SHEET"
check "password troppo corta rifiutata" 200 "$(CODE -X POST "$BASE/admin/utenti/$UID2/password" -d 'password=corta')"
contains "e lo dice" "almeno 8 caratteri" "$(G -X POST "$BASE/admin/utenti/$UID2/password" -d 'password=corta')"

NUOVA=$(G -X POST "$BASE/admin/utenti/$UID2/password" -d 'password=nuova-password-scelta')
contains "cambio password confermato" "Nuova password per Caroline" "$NUOVA"

J3=$(mktemp)
check "la vecchia password non vale piu" 401 "$(curl -s -o /dev/null -w '%{http_code}' -c "$J3" -X POST "$BASE/login" -d 'email=caroline@casa.it' --data-urlencode "password=$PWD2")"
check "la nuova password funziona"       302 "$(curl -s -o /dev/null -w '%{http_code}' -c "$J3" -X POST "$BASE/login" -d 'email=caroline@casa.it' -d 'password=nuova-password-scelta')"
check "le sue sessioni aperte sono cadute" 302 "$(CODE2 "$BASE/spesa")"
check "l'admin resta connesso"             200 "$(CODE "$BASE/admin")"

# password generata dall'app se il campo e vuoto
GEN=$(G -X POST "$BASE/admin/utenti/$UID2/password" -d 'password=')
contains "campo vuoto: la genera lei" "Nuova password per Caroline" "$GEN"
contains "e la mostra una volta sola" 'id="new-pwd"' "$GEN"

# --- sicurezza -----------------------------------------------------------
check "POST da altra origine bloccata" 403 "$(CODE -X POST "$BASE/spesa" -H 'Origin: https://malintenzionato.example' -d 'name=x')"
K=$(mktemp)
check "senza sessione si viene rimandati al login" 302 "$(curl -s -o /dev/null -w '%{http_code}' -b "$K" "$BASE/spese")"

echo
echo "passati: $ok   falliti: $ko"
[ "$ko" -eq 0 ]
