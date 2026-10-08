# Cronologia delle versioni

La versione e la data dell'ultimo aggiornamento sono mostrate in fondo all'app e dello spazio di team
(fonte: `public/js/version.js`, da tenere uguale a `package.json`).

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
