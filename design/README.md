# Sorso · redesign: due direzioni

> **Nota per chi porta questi mockup nell'app.** Nei mockup la scheda completa mostra la formula `50 + 50·q^1,8` e usa `k = 1,8`: l'app (v1.2.0 in poi) usa **`k = 2`** e applica la curva a ogni fase, con il totale come media pesata delle fasi (vedi `public/js/scoring.js` e `PIANO.md` §2). Con `k = 2`, tutto a 6 dà 68, a 8 dà 82, a 9 dà 91. Da correggere nei testi e nei calcoli dei mockup quando si adotta una direzione. Le schermate in `screenshots/` sono solo una selezione: le altre si rigenerano con `node design/build.js` e Playwright.


Mockup statici per scegliere il nuovo look (PIANO.md §5). Nessun codice dell'app è stato toccato: tutto vive in `design/`.

| File | Cosa |
|---|---|
| `direzione-a.html` | Direzione A, **Cantina editoriale**. Un solo file, apribile con doppio clic |
| `direzione-b.html` | Direzione B, **Numero e inchiostro**. Un solo file, apribile con doppio clic |
| `tokens-a.css`, `tokens-b.css` | Token di ciascuna direzione. **Stessi nomi**: sostituire il file cambia direzione senza toccare i componenti. Il sottoinsieme che il partner può sovrascrivere è marcato in testa a ciascun file (sezione 1) |
| `screenshots/` | PNG (mobile 390 e desktop 1280, chiaro e scuro) di ogni sezione, più `*-00-punteggio-100.png` con il 100 |
| `src/`, `build.js` | Sorgenti dei due HTML (`common.js` condiviso, CSS e template per direzione). `node design/build.js` rigenera gli HTML inglobando i token. Non serve per guardare i mockup |

Ogni pagina ha sei sezioni navigabili dalla barra in alto: **1** punteggio, **2** Nuova (Voto rapido e Scheda completa, entrambe con il selettore funzionante), **3** Libro con una scheda aperta, filtri e ricerca, **4** Team (si può votare davvero: la media si sblocca), **5** lo stesso Team con due temi partner (anche questi interattivi), **6** statistiche con radar e istogramma. Il pulsante «Tema» alterna chiaro e scuro (parte dalla preferenza di sistema).

Le formule sono quelle reali di PIANO.md §2 (media pesata 10/30/60; curva `50 + 50·q^1,8` per la scheda completa; fasce 50–59 … 100), quindi trascinando gli slider si vedono punteggi e fasce veri.

## Com'è oggi (e cosa si tiene)

Visto aprendo `public/index.html` a 390 e 1280 px.

**Funziona**: il tema scuro di default e il punteggio gigante in testa alla schermata sono riconoscibili e danno subito il risultato; l'ambra come colore del dato è un buon istinto; il radar con le quattro fasi comunica bene; le variabili CSS (`--ink`, `--accent`, `--shell`…) sono già la base giusta per i temi.

**Sa di vecchio o è stretto**:
- Il blocco nero in testa occupa metà schermo, con in alto lingua, tema e Google in tre bottoni di stili diversi; sotto, quattro barre sottili da una riga.
- Due accenti in concorrenza (rosso dei bottoni, ambra di toggle e numeri) senza gerarchia chiara.
- Numeri in monospazio (JetBrains Mono): leggibili ma freddi, da terminale.
- Etichette in maiuscoletto da 10–11 px con poco contrasto; slider da una riga che non invitano al tocco.
- Su desktop è una colonna di 560 px al centro di un grande vuoto nero; il pulsante flottante col calice copre il contenuto.
- La navigazione a cinque linguette in alto è lontana dal pollice.
- Nessuna fascia alta riconoscibile: 60 e 96 hanno lo stesso aspetto.

## Direzione A · Cantina editoriale

**Mood**: un registro di cantina stampato su carta calda. Calma, autorevolezza, il piacere lento della degustazione. Il vino come cultura.

- **Tipografia**: Fraunces (serif ottico, titoli, nomi dei vini e **tutte le cifre**, in peso leggero) + Source Sans 3 per l'interfaccia. Nomi dei vini e note in corsivo.
- **Colore**: carta `#F6EEDF` e bordeaux `#6B1424`, con **ottone** come secondo colore riservato alle cose rare. Scuro: «cantina di notte» `#1A0F12`, rosa-bordeaux e ottone chiaro.
- **Superfici**: carta con grana sottile (SVG inline), filetti doppi, angoli quasi vivi (2–8 px), ombre calde basse.
- **Punteggio**: anello che si riempie da 50 a 100 con tacche alle fasce. Dal 96 il tratto passa a **ottone con sigillo di puntini**; al 100 compaiono i **raggi** e un alone che ruota lentamente (fermo con `prefers-reduced-motion`).
- **Voto rapido / Scheda completa**: due linguette identiche. Nella scheda, le quattro fasi sono una fisarmonica.
- **Team**: la media riservata è un riquadro tratteggiato; sbloccata, si «dispiega» come un foglio con un righello 50–100 che mostra tuo voto e media.
- **Cosa lo rende distinto**: carattere e calore, un'identità da enoteca. Sembra un oggetto, non un'app.

## Direzione B · Numero e inchiostro

**Mood**: un'app contemporanea, secca e sicura. Il numero è l'interfaccia. Bianco, nero e un solo colore.

- **Tipografia**: Geist, una sola famiglia. Numeri enormi (120 px nel punteggio), pesi 700–800, tracking stretto. Testo in 450.
- **Colore**: inchiostro su `#FAFAF7` + **un solo accento**, l'«uva» `#5B2EFF` (scuro `#A58BFF`). Il colore compare solo dove c'è azione o selezione. Tutto il resto è tono su tono.
- **Superfici**: card piatte, senza bordi né ombre, raggi grandi (16–28 px); tab bar flottante a pillola.
- **Punteggio**: numero gigante, pillola con il nome della fascia, barra 50–100 a segmenti. Dal 96 **l'accento inonda l'intera intestazione** (e nel Libro l'intera riga): è l'unico momento in cui il colore occupa lo schermo, perciò il 96+ si nota. Al 100 si aggiungono scintille e la scritta in maiuscolo spaziato.
- **Voto rapido / Scheda completa**: selettore a due segmenti pieni e uguali; la scheda completa è un percorso a quattro passi con il parziale sempre visibile.
- **Team**: due blocchi affiancati, «tuo voto» e «media del team»; la media è il blocco a colore pieno e appare con un piccolo rimbalzo.
- **Cosa lo rende distinto**: leggibilità immediata, e un sistema che regge qualsiasi accento di partner senza perdere identità.

## Confronto

| | A · Cantina editoriale | B · Numero e inchiostro |
|---|---|---|
| Impressione | Calda, culturale, di carattere | Pulita, moderna, da prodotto |
| Font | Fraunces + Source Sans 3 (due famiglie esterne) | Geist (una famiglia esterna) |
| Cifre | Serif leggero, eleganti | Sans pesante, imponenti, leggibili da lontano |
| Colori | Bordeaux + ottone (2) su carta | Un accento su neutri |
| Segnale del 96–100 | Cambio di metallo: ottone, sigillo, raggi | Cambio di scala: l'accento inonda l'intestazione |
| Superficie | Grana, filetti doppi, ombre | Piatta, nessun bordo, nessuna ombra |
| Tolleranza al tema partner | Media: grana, ottone e corsivi restano «di Sorso»; con un font di sistema perde parte del fascino | Alta: tutto deriva da sfondo, testo e un accento; il segnale alto è l'accento del partner |
| Embed stretto (320–480) | Bene; i filetti e i corsivi chiedono più spazio verticale | Molto bene; blocchi che si impilano senza perdere forza |
| Costo di implementazione | Più alto (grana, doppi filetti, anello SVG con raggi, due font) | Più basso (CSS piatto, nessuna immagine, un font) |
| Rischio | Può sembrare «troppo vino» a chi cerca un'app; effetti decorativi da mantenere | Può sembrare generica se manca cura nei dettagli; il viola esce dal cliché bordeaux |
| Contrasto | Testi ≥ 4,5:1 verificati in chiaro e scuro | Testi ≥ 4,5:1 verificati in chiaro e scuro |

## Raccomandazione: **direzione B**

1. **Il team è metà del prodotto, e vive nei siti altrui.** B è costruita sull'idea di un neutro + un accento, che è esattamente ciò che un partner può fornire. Il segnale dell'eccellenza (inondare di colore) funziona con qualsiasi accento, mentre in A il segnale è ottone, un colore di Sorso che stonerebbe accanto a un partner verde o arancione.
2. **Costa meno e pesa meno**: un font, niente texture, niente SVG elaborati. Coerente col vincolo «nessun costo» e con una base vanilla senza build.
3. **Il numero è il prodotto.** Il punteggio da 50 a 100 con fasce e un vertice raro è la cosa che il cliente guarda, e B lo mette a 120 px.
4. **Più facile da tenere pulita** nel tempo dai moduli ES previsti in §5: poche regole, pochi effetti.

Scegliere A se l'obiettivo principale è **dare carattere di marca all'app personale** e il tema partner è un'aggiunta secondaria: è la più bella delle due da guardare come oggetto, e la più adatta a un pubblico che ama il vino come cultura. Un'ibridazione credibile è B con il corsivo serif di A solo per i nomi dei vini; non è stata mockuppata.

## Cosa cambierebbe nell'app attuale

Comune a entrambe:
- **Token**: sostituire il blocco `#root{…}` / `#root.dark{…}` di `public/index.html` con il file dei token scelto; il tema scuro passa da classe `.dark` a `[data-theme="dark"]` più `prefers-color-scheme` (oggi l'app parte scura: il mockup segue il sistema, va deciso).
- **Nomi variabili**: `--shell/--panel/--card/--card-alt/--line*/--ink-2..4` diventano `--bg/--surface/--surface-2/--line*/--ink-2/--ink-3`; `--sel-bg`/`--accent` → `--accent` (+ `--on-accent` automatico); `--gold/--head-gold` spariscono (B) o diventano `--brass` (A); `--ph-v/o/g/f` delle fasi nel radar si riducono a un solo accento.
- **Font**: via Inter, Instrument Serif e JetBrains Mono (tre famiglie oggi).
- **Intestazione punteggio**: il blocco nero con `.hdr-num` e le quattro barre diventa il componente «punteggio» (anello in A, numero + barra in B), con gli attributi `data-tier` che attivano la fascia alta.
- **Nuova**: nuovo selettore **Voto rapido / Scheda completa** per voto (nessuna delle due nascosta), slider da 44+ px con righello di fasce e zona 96–100 segnata; la scheda completa passa a fisarmonica (A) o a passi (B).
- **Navigazione**: le cinque linguette in alto (`data-tab`) vanno in basso (barra a quattro voci: Nuova, Libro, Team, Statistiche); «Alla cieca» ed «Evento» trovano posto dentro Libro/Nuova o in un menu (da decidere); il pulsante flottante con il calice si elimina perché la barra copre «Nuova».
- **Header**: lingua, tema e account in un menu unico, non tre bottoni sparsi.
- **Libro**: righe con punteggio grande e fascia a parole; ricerca, filtri per punteggio.
- **Team (nuovo)**: schermata `/embed` con elenco vini, media riservata fino al voto, voti propri sempre visibili in dettaglio; tema partner con le sole cinque `--p-*` (`--p-logo`, `--p-accent`, `--p-bg`, `--p-ink`, `--p-font`) lette sull'elemento radice dell'iframe.
- **Desktop**: la colonna da 560 px si apre a due colonne (lista | dettaglio) con container query, come già impostato nei mockup (`container-type: inline-size`).
- **Accessibilità**: `:focus-visible` esplicito, `prefers-reduced-motion`, tablist con frecce per il selettore di modalità, `aria-valuetext` sugli slider («84, buono»).
- **Modularizzazione** (PIANO §5): i token e i componenti dei mockup sono già divisi in `tokens-*.css`, CSS per componente e `common.js` (punteggio, team, filtro), pronti da trasformare in moduli ES.

Specifico di A: grana carta (`--grain`), font con asse ottico, tre colori brass, anello SVG con raggi, doppi filetti.
Specifico di B: tab bar flottante a pillola, card piatte (nessuna ombra tranne la barra), nessun asset a parte l'icona.

## Tema partner: contratto

Il partner imposta **solo** queste custom property, su `:root` dell'iframe (nessun altro CSS):

```css
:root {
  --p-logo:   url("data:image/svg+xml,…");   /* o url(https://…/logo.svg) */
  --p-accent: #2F6B3A;
  --p-bg:     #F4EFE6;
  --p-ink:    #1F2A1F;
  --p-font:   Georgia, "Times New Roman", serif;   /* una voce della lista di sistema */
}
```

Tutto il resto (superfici, linee, testo secondario, colore sull'accento) si calcola con `color-mix()` e, per il testo sull'accento, con la sintassi dei colori relativi (`oklch(from var(--accent) …)`, con ripiego bianco). Per questo motivo i controlli di leggibilità vanno fatti in onboarding lato Sorso: testo su sfondo ≥ 7:1, accento su sfondo ≥ 3:1. La lista di font di sistema è in testa ai due file di token.

## Verifiche fatte

- Console senza errori su entrambe le pagine, a 320, 390 e 1280 px, in chiaro e scuro; nessuno scroll orizzontale a 390 e a 320 (Chromium via Playwright).
- Slider: voto rapido (50 → 50; 80/90/96 → 93; 100/100/100 → 100) e scheda completa (tutto 6 → 70; tutto 10 → 100) corrispondono alle formule di PIANO.md; i due pannelli restano indipendenti al cambio di modalità.
- Team: voto sul Taurasi → «3 di 4 vini votati», la media include il voto (86,1 su 11).
- Contrasto di tutti i testi visibili (controllo automatico sul DOM): nessuno sotto 4,5:1 (3:1 per testi grandi) in chiaro e scuro, partner inclusi.

**Non verificato**: screen reader reali (solo struttura ARIA e `aria-valuetext` letti dal codice); Safari e Firefox (la sintassi dei colori relativi, usata per il testo automatico sull’accento, richiede Safari 16.4+ e Firefox 128+; in mancanza il testo sull’accento resta bianco); contrasto dei componenti grafici (cursori, anelli) verificato solo a occhio; test su dispositivi touch reali.
