# Cronologia delle versioni

La versione e la data dell'ultimo aggiornamento sono mostrate in fondo all'app e dello spazio di team
(fonte: `public/js/version.js`, da tenere uguale a `package.json`).

## 1.6.2 — 8 ottobre 2026
- Guide PDF molto più leggere e veloci da sfogliare: da 2,8 / 1,8 / 0,5 MB a 1,1 / 0,8 / 0,2 MB. Font statici al posto dei variabili (nel PDF diventavano disegni «Type 3», lenti da mostrare), schermate in JPEG, niente ombre sfocate né sfumature trasparenti.

## 1.6.1 — 8 ottobre 2026
- Spazio di team: i colori di base sono ora quelli del vino, come nell'app (crema e bordeaux; nero e ciliegia con il dispositivo in tema scuro). Chi ha già colori propri impostati non vede differenze.
- Guide PDF (integrazione API, gestione delle degustazioni, attivazione): nuova identità grafica (bordeaux e crema, nuovo marchio), schermate aggiornate, e chiarito che le serate create dal responsabile compaiono in «Degustazioni del team» per tutti i membri.

## 1.6.0 — 8 ottobre 2026
- **Vista da PC** (schermi larghi, da 1100 px): menù a sinistra con il punteggio sempre in vista e «Salva» a portata di mano; Nuova, Alla cieca ed Evento a due colonne; Taccuino con l'elenco a sinistra e il vino scelto a destra; Statistiche a colonne; contenuto largo al massimo 1320 px (1440 sui monitor più grandi). Su telefono e tablet stretto non cambia nulla.
- **Impostazioni**: nuova sezione con aspetto (tema e colori), «Come voti di solito», archivio e account, prima sparsi in fondo al Taccuino. Su telefono si apre dall'icona a ingranaggio in alto; su PC è la voce in fondo al menù.
- **Colori del vino come predefiniti**: chiaro crema e bordeaux, scuro nero con una punta di vino e bordeaux acceso (il bordeaux profondo su nero non si leggeva). Chi aveva scelto i propri colori li mantiene.
- **Tema Chiaro / Scuro / Automatico**: «Automatico» segue il tema del dispositivo e cambia con lui. Per chi non ha mai scelto, il tema parte da «Automatico».
- Il logo del favicon compare accanto a «Sorso».
- Corretto: il pannello «Confronto» tra due vini era illeggibile sul tema chiaro (testi chiari su fondo chiaro), anche su telefono.
- Corretto: su PC, cambiando scheda il contenuto riparte dall'alto; con un punteggio da 96 in su il menù resta leggibile; su schermi bassi (portatili, zoom) il menù si compatta e «Salva» resta sempre visibile.
- Il logo compare anche nella schermata di accesso; senza lampo di chiaro all'apertura per chi usa il tema scuro.

## 1.5.2 — 8 ottobre 2026
- Telefono: filtri per tipologia, filtri del Taccuino e pulsanti «+ Vitigno» / «+ Altro» alti almeno 44 px (si toccano senza sbagliare); a 320 px la didascalia sotto il punteggio («Statistiche», «Nuova degustazione») non esce più dallo schermo e va sotto il numero.
- Campi di testo e menù: i testi troppo lunghi finiscono con i puntini invece di essere tagliati.

## 1.5.1 — 8 ottobre 2026
- Spazio di team: l'elenco si chiama «Degustazioni del team», con una riga che spiega che le crea il responsabile del team e le vedono tutti i membri.
- Nuovo favicon: l'anello del punteggio con il bicchiere visto dall'alto e il «sorriso» sotto; stesse immagini per iPhone, Android e scheda del browser.
- Guide PDF rigenerate con la versione corrente.

## 1.5.0 — 8 ottobre 2026
- Modalità di voto predefinita per ogni profilo (Taccuino → «Come voti di solito»): Voto rapido, Scheda completa, oppure ricorda l'ultima. Con un account segue il profilo su ogni dispositivo.
- Spazio di team: claim facoltativo `mode` nel token (`smart` o `full`) per decidere la modalità iniziale utente per utente.
- Correzione: «Scegli file» e «Scatta foto» ora sono allineati.
- Guide PDF rifatte (integrazione API e utilizzo per il gestore).

## 1.4.0 — 8 ottobre 2026
- Nuovo design «Numero e inchiostro» su app personale e spazio di team.
- Colori scelti dall'utente: accento e sfondo, con contrasto sempre garantito.
- Versione e data dell'aggiornamento visibili in app e nello spazio di team.
- Guida di attivazione dell'API per il partner.

## 1.3.1 — 8 ottobre 2026
- Verifica UX e bug: spazio di team senza vicoli ciechi, app personale più robusta, backend senza conteggi sbagliati, arrotondamento classico ovunque.

## 1.3.0 — 7 ottobre 2026
- Spazio di team per siti partner (iframe con token firmato) e API di sola lettura.

## 1.2.0 — 7 ottobre 2026
- Scala di voto 50–100, Voto rapido e Scheda completa, ricalcolo dei dati esistenti.
