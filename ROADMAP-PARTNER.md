# Sorso — cosa devi fare tu per il partner

Aggiornata il 9 ottobre 2026 · **Sorso 2.0.0**.

**Dove siamo.** Il sito, l'app personale (con la vista da PC) e lo spazio di team per il partner sono pronti e online. Test automatici: tutti verdi. Le quattro guide PDF sono aggiornate (l'ultima è la guida all'uso dentro il profilo). **La prova sul database vero è stata fatta l'8 ottobre 2026 e non ha trovato difetti** (vedi il punto 2). **Per completare l'API mancano solo le cose che dipendono dal partner (punti 1, 4, 5, 6, 7, 8): il codice è finito.**

Legenda: ☐ da fare · ✅ fatto

---

## A · Prima di parlare col partner

### 1. Decidi lo stato commerciale  ☐  *(5 minuti, ma può bloccare tutto)*
Oggi Sorso sta sul piano gratuito di Vercel, che **consente solo uso non commerciale**. Se qualcuno verrà pagato (per il lavoro, per l'hosting, per il servizio), **dimmelo prima**: va cambiato hosting (resta a costo zero o quasi, ma serve del lavoro). Se è un favore a un club, siamo a posto.

### 2. Prova sul database vero  ✅ fatta l'8 ottobre 2026
Fatta sul sito e sul database di produzione con un partner di prova, poi cancellato. Esito: **nessun difetto, ogni controllo è andato bene**.
- Token: valido, già usato (401), scaduto (401), firma errata (401), scadenza troppo lunga (401).
- Voti: voto rapido e scheda completa, media visibile solo dopo il proprio voto, media del team corretta con arrotondamento classico, voto modificato non contato due volte.
- Team separati: un altro team non vede, non apre e non vota le serate altrui (404).
- Chiusura e riapertura: a serata chiusa i voti sono rifiutati (409).
- API di lettura: elenco, risultati e CSV; chiave sbagliata 401; scrittura con la chiave rifiutata (405).
- Cancellazione di un utente: i suoi voti spariscono dalla media.
- Iframe: la pagina si lascia incorporare solo dal dominio registrato.
- Consumo del database: circa 285 comandi su 500.000 al mese. Pulizia completa, nessun dato di prova rimasto.

**Non provato:** il blocco per troppe richieste (429), perché non l'ho saturato, e l'iframe dentro un vero sito del partner, che si prova al punto 8.

**Se serve rifarla** (dopo modifiche importanti): le variabili `KV_REST_API_URL` e `KV_REST_API_TOKEN` (da Vercel → progetto → Settings → Environment Variables, occhio per vedere il valore) vanno messe nell'ambiente cloud → **Modifica ambiente cloud** → casella **«Variabili d'ambiente»**, una per riga nel formato `NOME=valore`, **non** nello «Script di configurazione» (quello lancia comandi e, se ci scrivi le variabili, la sessione non parte). Poi una sessione nuova con il messaggio: «Leggi ROADMAP-PARTNER.md e PIANO.md. Fai la prova di accettazione dell'integrazione sul sito vero con un partner di prova, poi cancellalo.» A prova finita **cancella le variabili** dall'ambiente.

**Controlli su Vercel (fatti l'8 ottobre 2026):** il piano è Hobby (solo uso non commerciale, vedi il punto 1); Deployment Protection è «Standard» e la produzione si apre senza accedere. Il partner deve usare sempre https://sorso-taccuino.vercel.app, mai gli indirizzi dei singoli deploy.

### 3. Guarda Sorso 1.9.1 con i tuoi occhi  ☐  *(10 minuti)*
Aprilo su telefono e su PC, con il browser che usi di solito: https://sorso-taccuino.vercel.app/
- **Telefono:** provi un Voto rapido e una Scheda completa, salvi, li ritrovi nel Taccuino? L'ingranaggio in alto apre le Impostazioni?
- **PC:** menù a sinistra, Taccuino con elenco e dettaglio, Statistiche: tutto in vista senza scorrere troppo?
- **Colori:** crema e bordeaux di giorno, nero e ciliegia di notte; in Impostazioni la scelta Chiaro / Scuro / Automatico.
- Se qualcosa non ti convince, mandami lo screenshot così com'è.

---

## B · Col partner

### 4. Raccogli dal partner  ☐
- **Nome** del sito o club e il titolo da mostrare in alto.
- **I domini esatti** in cui incorporeranno lo spazio, con `https://` e senza percorso (es. `https://www.club.example`). Se hanno un sito di prova e uno vero, entrambi.
- **Lingua**: italiano, inglese o entrambe (scelta per utente).
- **Logo** (indirizzo https di un'immagine) e **colori**: accento, sfondo, testo, in formato `#rrggbb`. Se non ne danno, userà i colori del vino.
- **Modalità di voto**: voto rapido, scheda completa o entrambe, e quale proporre per prima.
- **Chi è organizzatore** nel loro sito e **come raggruppano le persone in team** (il campo `team` nel token: stesso team = stesse degustazioni).

### 5. Fai queste domande al loro sviluppatore  ☐
- Può **firmare un JWT HS256 sul server**? (La guida ha esempi in Node, Python e PHP.)
- Può generare il token **a ogni caricamento della pagina**, senza cache sulla pagina che lo contiene? Il token è monouso: è la causa più frequente di problemi.
- Chi riceverà il **segreto di firma** e la **chiave API**? Vanno mandati **separati e su un canale sicuro** (non per email in chiaro, non in chat condivise).

### 6. Attiva il partner  ☐  *(5 minuti, appena hai i dati del punto 4)*
Servono Node 20+, il repository e le due variabili nel terminale:
```
node scripts/partner.js create ID-PARTNER --name "Nome del club" --origin https://www.sito-partner.example --lang it
node scripts/partner.js theme ID-PARTNER --accent #8c1d3f --bg #fbf4e6 --ink #0b0b10 --title "Nome del club" --logo https://.../logo.png
node scripts/partner.js settings ID-PARTNER --modes smart,full --default-mode smart
node scripts/partner.js token ID-PARTNER --sub prova --team test --role organizer --name Prova
```
- `create` mostra **una sola volta** segreto di firma e chiave API: copiali subito.
- Altro dominio: `origins ID-PARTNER --add --origin https://altro.example`. Ruotare le credenziali: `rotate-secret`, `rotate-key`. Sospendere: `disable ID-PARTNER`.
- Il colore del partner si imposta **solo da qui** (comando `theme`); i colori vengono corretti da soli se non si leggono bene.

### 7. Manda le guide  ☐
| Per chi | File | Cosa contiene |
|---|---|---|
| Chi sviluppa il sito del partner | `docs/guida-attivazione-api.pdf` (6 pagine) | Cosa mandare, cosa si riceve, prima prova, messa online |
| Chi sviluppa il sito del partner | `docs/guida-integrazione-sorso.pdf` (23 pagine) | Tutti i dettagli tecnici: token, iframe, API, errori e limiti |
| Chi organizza le serate | `docs/guida-gestione-degustazioni.pdf` (13 pagine) | In linguaggio semplice: creare, votare, chiudere (anche un solo vino), alla cieca, classifica e risultati |
| Chi usa Sorso (anche i soci del club) | `docs/guida-uso-sorso.pdf` (13 pagine) | Punteggio, schede, alla cieca, statistiche, impostazioni e spazio del club; è anche nell'app (Impostazioni → Guida) |

Si rigenerano con `node docs/guide/build.js` (dopo `npm install`). **Segreto e chiave non vanno nelle guide né nella stessa email.**

### 8. La prova finale insieme  ☐
Capitolo «Prima di andare online» della guida di integrazione. In breve: l'iframe si apre solo dai domini registrati; il token è nuovo a ogni caricamento; un partecipante vota e vede la media solo dopo; un organizzatore crea, aggiunge vini e chiude; due team non si vedono; i risultati si leggono dal server e in CSV; la cancellazione di un utente di prova funziona.

---

## C · Decisioni che ti spettano (quando vuoi, nessuna blocca)

- **«Degustazioni del team».** Oggi le serate create dal responsabile (organizzatore) compaiono in un elenco «Degustazioni del team» visibile a tutti i membri. Vuoi anche altro? (a) degustazioni **private** di ogni persona dentro lo spazio; (b) poter **portare nel team** una scheda dal proprio Taccuino personale.
- **Alla cieca, Classifica e Statistiche** (che nell'app personale sono Alla cieca, Evento e Statistiche) ci sono dalla 1.7.0 sia nello spazio di team sia nell'API v1. Il **Taccuino personale** resta solo nell'app: nello spazio di team non c'è.
- **Medie in gruppi molto piccoli** (2–3 persone): si può dedurre un voto guardando come cambia la media. Va bene così, oppure la media compare solo da 3 voti o solo a serata chiusa?
- **Foto dei vini nel team**: oggi non ci sono, per risparmiare spazio gratuito. Va bene aspettare?
- **Chi gestisce le richieste di cancellazione** dei dati degli utenti del partner: c'è l'API, serve una persona.
- **Backup**: consiglia al partner di scaricare il CSV dei risultati dopo ogni serata (non è un servizio con garanzia di continuità).
- **Eventi privati nell'app personale** e **salvataggio automatico della bozza**: non toccati; non riguardano il partner.

---

## D · Dopo la messa online

- **Consumo del database**: `node scripts/usage.js` (piano gratuito: 500.000 comandi al mese). All'80% le risposte avvisano; al 90% si passa in sola lettura. Un voto costa circa 12 comandi.
- **Segnalazioni**: se il partner scrive «Devi rientrare» o «token non valido», quasi sempre la pagina è in cache: il token è monouso.
- Per ogni cosa nuova rilascio io, con versione e data scritte qui e sul sito; tu ricevi il riepilogo.

---

## Fatto finora ✅

- Scala 50–100 con arrotondamento classico, Voto rapido e Scheda completa, migrazione delle schede.
- Spazio di team per il partner (iframe con token firmato), API di lettura, limiti, quota, cancellazione dei dati.
- Nuovo design, colori scelti dall'utente, **colori del vino come predefiniti**, tema Chiaro / Scuro / Automatico.
- **Vista da PC** (menù a sinistra, due colonne, elenco + dettaglio) e pagina **Impostazioni**.
- Nuovo favicon e logo.
- Quattro guide PDF con la nuova grafica.
- **Spazio di team completo**: degustazioni, **alla cieca** (con svelamento), **classifica**, **statistiche**, e la **chiusura della votazione di un singolo vino** (media su chi ha votato fino a quel momento, per i vini assaggiati solo da alcuni).
- **API v1 completa** (sola lettura): `tastings`, `results` (anche CSV, con `status` per vino), `guesses`, `stats`, `events`, cancellazione utente.
- Nome del taccuino in Impostazioni, controlli nel colore d'accento, vocabolario tradotto in inglese.
- Verifiche: 200 test automatici e dieci scenari nel browser (app, PC, colori, team, errori, alla cieca, giro di verifica), tutti verdi; giro totale di revisione indipendente sul codice, sull'interfaccia e sulle guide.
