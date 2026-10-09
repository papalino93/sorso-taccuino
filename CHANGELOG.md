# Cronologia delle versioni

La versione e la data dell'ultimo aggiornamento sono mostrate in fondo all'app e dello spazio di team
(fonte: `public/js/version.js`, da tenere uguale a `package.json`).

## 1.9.2 — 9 ottobre 2026
- **Sicurezza dell'Evento dell'app personale**: lo spazio condiviso degli eventi era scrivibile da qualunque utente collegato, che poteva leggere, sovrascrivere e cancellare gli eventi e i voti degli altri. Ora: si possono toccare solo l'indice degli eventi e i voti di un evento; un voto si scrive una sola volta e nessuno lo sovrascrive o lo cancella; l'indice può solo allungarsi (le voci altrui non si modificano né si tolgono) e il proprietario di una voce lo stabilisce il server; le scritture hanno un limite orario per persona; i voti non validi sono rifiutati. L'elenco delle chiavi usa SCAN a pezzi invece di KEYS (che leggeva tutto il database). Nessun cambiamento visibile per chi usa l'Evento.

## 1.9.1 — 8 ottobre 2026
- **In inglese ora si traduce anche il vocabolario di degustazione**: tipologie (Red, White, Rosé, Sparkling), limpidezza, colore, consistenza, zuccheri, tannicità, evoluzione, descrittori, livelli (intensità, corpo, durezze e morbidezze), «Altro» nell'uvaggio, e le stesse voci nel Taccuino, nelle Statistiche e nell'esito della cieca. I valori restano salvati in italiano: le schede già scritte e il cambio di lingua non perdono niente.

## 1.9.0 — 8 ottobre 2026
- **Nome del taccuino in Impostazioni**: una nuova card «Nome del taccuino» con il titolo (per esempio «Sorso di vino») e, se vuoi, di chi è («il taccuino di Mario Rossi»), con anteprima e «Ripristina». Si salva nel profilo (con l'account lo ritrovi ovunque) e compare in alto e nel titolo della scheda del browser. Toccando il nome in alto si apre direttamente la card (prima c'erano due finestrelle nascoste).
- **Niente più bianco e nero**: i controlli selezionati (Chiaro/Scuro/Automatico, lingua, «Come voti di solito», lettere dei livelli, pulsante Impostazioni, avatar, pulsante del calice) usano il colore d'accento invece del nero o del bianco; lo stesso per le schede dello spazio di team.

## 1.8.0 — 8 ottobre 2026
- **Spazio di team: chiudere la votazione di un solo vino.** Quando un vino lo assaggiano solo alcune persone del club (per esempio cinque o sei su venti), l'organizzatore — o chi ha il profilo «Organizzatore» — può chiudere la votazione di quel vino con «Chiudi la votazione di questo vino», mentre la serata e gli altri vini restano aperti. La media conta solo i voti espressi fino a quel momento e, dal secondo voto, la vedono tutti; non si può più votare né cambiare voto su quel vino (si può riaprire). Sempre solo aggregati: nessuno vede chi ha votato cosa.
- **API v1**: ogni vino in `GET /tastings/{id}/results` ha ora `status` (`open` o `closed`).

## 1.7.1 — 8 ottobre 2026
Giro totale di verifica (backend, spazio di team, app, guide).
- **Spazio di team, privacy**: in una cieca chiusa e non svelata le statistiche non mostrano più la tipologia vera dei vini; il riepilogo delle ipotesi si vede solo da due persone in su e la cancellazione dei dati di una persona lo aggiorna; le statistiche si aggiornano subito dopo una cancellazione.
- **Spazio di team, coerenza**: un voto che arriva a serata già chiusa non entra; uno svelamento in contemporanea a una chiusura non si perde; lo svelamento non lascia più il riepilogo a metà se si interrompe; vincitore e pari merito seguono la classifica; «Il tuo vino migliore» non diventa anonimo per i vini senza media; eliminare una serata ripulisce anche gli elenchi personali (e costa molti meno comandi).
- **Spazio di team, interfaccia**: nomi molto lunghi non allargano più la pagina; «giusto» e «quasi» leggibili con ogni tema del partner; la classifica provvisoria conta solo i vini con almeno due voti; a serata chiusa la media è visibile anche per i vini non votati; la cieca chiusa non invita più a votare; voto e ipotesi lasciati a metà non si perdono tornando indietro; annata «NV» nelle ipotesi; pulsanti piccoli a 44 px.
- **App**: su schermo largo la card «Guida» non copre più «Il tuo archivio»; «Spumante» intero in Alla cieca; una copia importata non può più eseguire codice attraverso l'anteprima dell'etichetta; prezzo limitato a 100.000 € e annata tra 1800 e l'anno prossimo (anche alla cieca); pulsanti 0–10 più larghi sui telefoni stretti; focus da tastiera sul link della guida; contrasto del verde nelle statistiche.
- **Guide**: corretto il comando `curl` della guida di attivazione; barra delle sezioni «in alto»; sette comandi di esempio; codici d'errore e risposta `/events` completi; `answers` nullo con meno di due ipotesi.

## 1.7.0 — 8 ottobre 2026
- **Spazio di team: Alla cieca.** L'organizzatore può creare una degustazione «Alla cieca»: i partecipanti vedono «Vino 1, Vino 2…» e, oltre al voto, possono indovinare tipologia, vitigno e annata (1 + 2 + 2 punti). Con «Svela i vini» la serata si chiude per sempre e tutti vedono i nomi e come sono andate le ipotesi; il riepilogo del gruppo è anonimo.
- **Spazio di team: Classifica e Statistiche.** Classifica dei vini (provvisoria a serata aperta, finale a serata chiusa, con il pari merito) e scheda Statistiche con i dati aggregati delle ultime 30 degustazioni chiuse del team.
- **API v1**: nuove chiamate `GET /stats?team=`, `GET /events?team=` e `GET /tastings/{id}/guesses`; i risultati ora includono posizione, classifica e stato «alla cieca/svelata»; il CSV ha le colonne `type`, `grape` e `rank`. Sempre e solo aggregati: mai chi ha votato cosa.
- La cancellazione dei dati di una persona (`DELETE /users/{sub}`) rimuove anche le sue ipotesi alla cieca.
- **Guida all'uso in PDF** dentro il profilo: Impostazioni → Guida → «Apri la guida» (`/guida-uso-sorso.pdf`, 13 pagine). La guida per chi organizza e quella per l'integrazione sono aggiornate alle novità.

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
