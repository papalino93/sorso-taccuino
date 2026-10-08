# Sorso — cosa devi fare tu per il partner

Aggiornata l'8 ottobre 2026 · **Sorso 1.6.2**.

**Dove siamo.** Il sito, l'app personale (con la vista da PC) e lo spazio di team per il partner sono pronti e online. Test automatici: tutti verdi. Le tre guide PDF sono aggiornate con la nuova grafica. **Manca una sola cosa tecnica prima di andare dal partner: la prova sul database vero**, che io non posso fare dal mio ambiente.

Legenda: ☐ da fare · ✅ fatto

---

## A · Prima di parlare col partner

### 1. Decidi lo stato commerciale  ☐  *(5 minuti, ma può bloccare tutto)*
Oggi Sorso sta sul piano gratuito di Vercel, che **consente solo uso non commerciale**. Se qualcuno verrà pagato (per il lavoro, per l'hosting, per il servizio), **dimmelo prima**: va cambiato hosting (resta a costo zero o quasi, ma serve del lavoro). Se è un favore a un club, siamo a posto.

### 2. Vercel e database: passo passo  ☐  *(circa 20 minuti)*
È l'unico passaggio tecnico che ancora manca: con l'accesso al database faccio la **prova di accettazione** completa (partner di prova, voti, team separati, cancellazione) e poi cancello i dati di prova. I nomi dei menu di Vercel cambiano ogni tanto: se un nome non torna, cerca quello più simile.

**Passo 1 · Entra nel progetto su Vercel**
1. Vai su https://vercel.com e accedi.
2. Dalla home apri il progetto **sorso-taccuino**.
3. Controlla che in alto compaia il deploy di produzione con stato **Ready** e che https://sorso-taccuino.vercel.app/ si apra.

**Passo 2 · Trova il database**
1. Nel progetto apri la scheda **Storage**.
2. Dovresti vedere un database **Redis** (Upstash). Clicca sul nome: si apre la sua pagina. Se la scheda è vuota, scrivimelo: vuol dire che il database vive altrove e lo ritroviamo insieme.
3. Nella pagina del database, la sezione **.env.local** o **Quickstart** mostra i due valori che servono: `KV_REST_API_URL` e `KV_REST_API_TOKEN`. In alternativa: **Settings → Environment Variables** del progetto, e clicca l'occhio accanto alla variabile per vederne il valore.

**Passo 3 · Scegli come farmi fare la prova**
- **Via sicura (consigliata se hai dubbi):** non mi dai niente e i due comandi li lanci tu dal tuo computer (vedi sotto, «Sul tuo computer»). Poi mi dici cosa è uscito.
- **Via veloce:** me le dai nell'ambiente cloud, **senza incollarle in chat**:
  1. Nella sessione, clicca il **menu dell'ambiente** nella barra del titolo → **Edit**.
  2. Dove c'è **Network secrets** (o *API credentials*) aggiungi il token; se non c'è, usa **Environment variables**. Crea due variabili: `KV_REST_API_URL` (il valore dell'indirizzo) e `KV_REST_API_TOKEN` (il token).
  3. Sempre in **Edit → Network access**: se il livello è «Limited», aggiungi il dominio del database (finisce con `.upstash.io`, lo vedi nell'indirizzo `KV_REST_API_URL`) sotto **Allowed domains**.
  4. Salva e apri una **sessione nuova** (quella attuale non vede le modifiche). Incolla come primo messaggio:
     > Leggi ROADMAP-PARTNER.md e PIANO.md. Fai la prova di accettazione dell'integrazione sul sito vero con un partner di prova, poi cancellalo.
  5. Il token permette anche di **scrivere** sul database. Finita la prova torna in **Edit** e **cancella** le due variabili.

**Passo 4 · Controlli su Vercel (2 minuti)**
1. **Settings → General**: guarda il piano. Se è **Hobby**, vale il punto 1 (solo uso non commerciale).
2. **Settings → Deployment Protection**: la produzione deve poter essere aperta senza accedere a Vercel. Prova ad aprire https://sorso-taccuino.vercel.app/ da una finestra privata del browser: se si apre, sei a posto.
3. **Settings → Environment Variables**: devono esserci `KV_REST_API_URL` e `KV_REST_API_TOKEN` per **Production**. Sono quelle che usano le funzioni del sito.

**Sul tuo computer (serve solo per la via sicura e per attivare il partner)**
1. Installa **Node 20 o più recente** da https://nodejs.org (versione LTS), poi apri il Terminale (Mac) o PowerShell (Windows).
2. Scarica il progetto: `git clone https://github.com/papalino93/sorso-taccuino.git`, poi `cd sorso-taccuino` e `npm install`.
3. Imposta le due variabili nella stessa finestra del terminale:
   - Mac: `export KV_REST_API_URL="..."` e `export KV_REST_API_TOKEN="..."`
   - Windows (PowerShell): `$env:KV_REST_API_URL="..."` e `$env:KV_REST_API_TOKEN="..."`
4. Lancia i comandi di `node scripts/partner.js ...` indicati ai punti 6 e seguenti. Le variabili valgono solo in quella finestra: chiudendola spariscono.

### 3. Guarda Sorso 1.6.1 con i tuoi occhi  ☐  *(10 minuti)*
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

### 6. Attiva il partner  ☐  *(5 minuti, dopo il punto 2)*
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

### 7. Manda le guide  ☐  *(solo dopo che la prova del punto 2 è andata bene)*
| Per chi | File | Cosa contiene |
|---|---|---|
| Chi sviluppa il sito del partner | `docs/guida-attivazione-api.pdf` (6 pagine) | Cosa mandare, cosa si riceve, prima prova, messa online |
| Chi sviluppa il sito del partner | `docs/guida-integrazione-sorso.pdf` (20 pagine) | Tutti i dettagli tecnici: token, iframe, API, errori e limiti |
| Chi organizza le serate | `docs/guida-gestione-degustazioni.pdf` (11 pagine) | In linguaggio semplice: creare, votare, chiudere, leggere i risultati |

Si rigenerano con `node docs/guide/build.js` (dopo `npm install`). **Segreto e chiave non vanno nelle guide né nella stessa email.**

### 8. La prova finale insieme  ☐
Capitolo «Prima di andare online» della guida di integrazione. In breve: l'iframe si apre solo dai domini registrati; il token è nuovo a ogni caricamento; un partecipante vota e vede la media solo dopo; un organizzatore crea, aggiunge vini e chiude; due team non si vedono; i risultati si leggono dal server e in CSV; la cancellazione di un utente di prova funziona.

---

## C · Decisioni che ti spettano (quando vuoi, nessuna blocca)

- **«Degustazioni del team».** Oggi le serate create dal responsabile (organizzatore) compaiono in un elenco «Degustazioni del team» visibile a tutti i membri. Vuoi anche altro? (a) degustazioni **private** di ogni persona dentro lo spazio; (b) poter **portare nel team** una scheda dal proprio Taccuino personale.
- **Taccuino, Statistiche, Alla cieca ed Evento** per ora **non** ci sono nello spazio di team né nell'API (la guida lo spiega). Se il partner li vuole, li costruisco: dimmi quali, in che ordine.
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
- Tre guide PDF con la nuova grafica.
- Verifiche: 177 test automatici e sette scenari nel browser (telefono, PC, team, errori), tutti verdi.
