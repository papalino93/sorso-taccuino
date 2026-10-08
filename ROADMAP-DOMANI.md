# Sorso — cosa fare domani (tu)

Scritta la sera del 7 ottobre 2026. **Lo stato di quello che ho fatto di notte lo trovi in fondo, nella sezione "Stato a fine lavoro"** (la aggiorno io quando ho finito).

Regola che ho seguito: quello che corregge difetti lo rilascio da solo, quando la verifica è pulita; **il nuovo design NON va online finché non lo approvi tu**.

---

## Mattina — sblocchi (circa 30 minuti, in quest'ordine)

### 1. Dammi accesso al database, così provo tutto sul sito vero  ☐
Senza, posso provare l'integrazione solo in locale. Con, faccio la **prova di accettazione** completa prima che la veda il partner.

- Apri le impostazioni dell'ambiente cloud (menu dell'ambiente nella barra del titolo della sessione → **Modifica**).
- Aggiungi due variabili d'ambiente: `KV_REST_API_URL` e `KV_REST_API_TOKEN`. I valori li copi da Vercel (progetto *sorso-taccuino* → Settings → Environment Variables, oppure Storage). **Non incollarli in chat.**
- Apri una **sessione nuova** (quella attuale non le vede). Incolla come primo messaggio:
  > Leggi ROADMAP-DOMANI.md e PIANO.md. Fai la prova di accettazione dell'integrazione sul sito vero con un partner di prova, poi cancellalo.
- Attenzione: quel token dà anche la scrittura sul database. Se preferisci non darlo, fai tu questi comandi dal tuo computer (servono Node 20+, `git clone`, `npm install` e le due variabili nel terminale), poi dimmi l'esito:
  ```
  node scripts/partner.js create prova --name "Prova" --origin https://IL-TUO-DOMINIO
  node scripts/partner.js token prova --sub anna --team test --role organizer --name Anna
  ```

### 2. Mandami il file "Salva copia" delle tue schede  ☐
Taccuino → in fondo, riquadro "Il tuo archivio" → **Salva copia** → allega il file in chat. Mi serve per confermare i punteggi sulle tue schede vere (oggi la curva è scelta in base alle parole dei giudizi, non ancora verificata sui tuoi dati). Se il file è troppo grande, dimmelo e ti preparo una pagina che fa il confronto nel tuo browser.

### 3. Design B  ✅ approvato da te
Portato online nella **versione 1.4.0 (aggiornamento dell'8 ottobre 2026)**, con la possibilità per chi usa l'app di scegliere i propri colori (Taccuino → riquadro «Aspetto»: colore d'accento e sfondo, predefiniti o a scelta; il testo resta sempre leggibile). Versione e data si leggono in fondo all'app e dello spazio di team.

### 4. Controlla la tua app dal telefono  ☐
Apri https://sorso-taccuino.vercel.app/ con il browser che usi di solito:
- compare la nota "Ho ricalcolato i punteggi…"? Chiudila con "Ho capito".
- le tue schede hanno punteggi tra 50 e 100? Il vecchio punteggio si vede aprendo una scheda ("Punteggio precedente").
- prova un **Voto rapido** e una **Scheda completa** e salva: compaiono nel Taccuino?
- se qualcosa non ti convince, scrivimelo così com'è.

---

## Per il partner (quando sei pronto, anche dopo la mattina)

### 5. Raccogli dal partner  ☐
Mi servono questi dati per creare il loro spazio:
- **Nome** del sito/club e come vuole il titolo in alto.
- **I domini esatti** in cui incorporeranno lo spazio, con `https://` e senza percorso (es. `https://www.club.example`). Se hanno un sito di prova e uno vero, entrambi.
- **Lingua** (italiano, inglese o entrambe, scelta per utente).
- **Logo** (indirizzo https di un'immagine) e **colori**: accento, sfondo, testo (formato `#rrggbb`).
- **Modalità di voto**: voto rapido, scheda completa o entrambe; quale proporre per prima.
- **Chi è organizzatore** nel loro sito e **come raggruppano le persone in team** (il campo `team` nel token: stesso team = stesse degustazioni).

### 6. Chiedi al loro sviluppatore  ☐
- Possono **firmare un JWT HS256 sul server**? (Il PDF ha esempi in Node, Python e PHP.)
- Possono generare il token **a ogni caricamento della pagina**, senza cache sulla pagina che lo contiene? (Il token è monouso: è la causa più frequente di problemi.)
- Chi, da loro, riceverà il **segreto di firma e la chiave API**? Mandali **separati e su un canale sicuro** (non per email in chiaro, non in chat condivise).

### 7. Manda loro la guida PDF  ☐
`docs/guida-attivazione-api.pdf` (6 pagine: cosa mandare, cosa si riceve, prima prova, messa online), per chi sviluppa `docs/guida-integrazione-sorso.pdf` (20 pagine, tutti i dettagli) e, per chi organizza le serate, `docs/guida-gestione-degustazioni.pdf` (11 pagine, in linguaggio semplice). Si rigenerano con `node docs/guide/build.js`. **Mandale solo dopo che ti ho scritto che la verifica finale è pulita** (vedi "Stato a fine lavoro").

### 8. Decisioni che ti spettano (anche dopo)  ☐
- **Foto dei vini nel team**: oggi non ci sono, per risparmiare spazio gratuito. Va bene aspettare?
- **Chi gestisce le richieste di cancellazione** dei dati degli utenti del partner (c'è l'API, serve una persona).
- **Backup**: consiglia al partner di scaricare il CSV dei risultati dopo ogni serata (non è un servizio con garanzia di continuità).
- **Stato commerciale**: oggi il progetto sta su un piano gratuito che consente solo uso non commerciale. Se qualcuno verrà pagato per il lavoro o per l'hosting, **dimmelo prima del via**: va cambiato hosting (resta gratis, ma serve del lavoro).

---

## Attivare un partner (tu, circa 5 minuti)

Servono Node 20+, il repository e le due variabili `KV_REST_API_URL` e `KV_REST_API_TOKEN` nel terminale. Sostituisci i valori in maiuscolo:

```
node scripts/partner.js create ID-PARTNER --name "Nome del club" --origin https://www.sito-partner.example --lang it
node scripts/partner.js theme ID-PARTNER --accent #8c1d3f --bg #fbf6f1 --ink #2a1a1f --title "Nome del club" --logo https://.../logo.png
node scripts/partner.js settings ID-PARTNER --modes smart,full --default-mode smart
node scripts/partner.js token ID-PARTNER --sub prova --team test --role organizer --name Prova   # token di prova
```

`create` mostra **una sola volta** segreto di firma e chiave API: copiali subito e mandali al partner in **due invii separati**. Per aggiungere un dominio: `origins ID-PARTNER --add --origin https://altro.example`. Per ruotare le credenziali: `rotate-secret` e `rotate-key`. Per sospendere: `disable ID-PARTNER`. Poi manda al partner `docs/guida-attivazione-api.pdf`.

---

## Il giorno dell'integrazione (check finale, con il partner)

Capitolo 11 della guida PDF ("Elenco di verifica prima di andare online"). In breve: iframe aperto solo dai domini registrati; token generato a ogni caricamento; un partecipante vota e vede la media solo dopo; un organizzatore crea, aggiunge vini e chiude; due team non si vedono; lettura risultati dal server e CSV; cancellazione di un utente di prova.

**Non andare online prima di aver fatto la prova di accettazione (punto 1).** È l'unica cosa che non posso garantire dal mio ambiente: il database vero e le impostazioni di Vercel.

---

## Stato a fine lavoro (aggiornato da me)

**Cosa ho fatto di notte**

- **Verifica approfondita con sei revisori indipendenti** (due giri: interfaccia del team, app personale, backend/guida). Non hanno trovato difetti bloccanti; hanno trovato molti difetti medi e alti, **tutti corretti** e coperti da test.
- **Spazio di team (l'iframe del partner)**: interfaccia riscritta. Token nel frammento `#token=` (non finisce nei log), nessun vicolo cieco quando la sessione scade (l'iframe chiede un token nuovo al sito con `sorso:reauth`, il voto compilato non si perde), conferme per chiudere/eliminare, errori sempre tradotti e senza codici tecnici, doppio clic innocuo, focus e tastiera a posto, nomi lunghissimi senza rotture, tema del partner sempre leggibile (contrasto garantito, anche sui riquadri).
- **Backend**: voti e cancellazioni non possono più lasciare conteggi sbagliati (provato anche con ritardi di rete simulati, 30 esecuzioni su 30), tetti per team (200 degustazioni, 100 vini), la cancellazione dei dati di un utente funziona sempre (anche in sola lettura), script `partner.js` che rifiuta le opzioni sbagliate e dice "prima/dopo" quando cambi le origini.
- **App personale (v1.3.1)**: una scheda con solo il totale non perde più il punteggio se la modifichi senza toccare i giudizi; conferma prima di cambiare modalità, azzerare o svelare; niente doppi salvataggi; il ripristino da copia riporta anche le prove alla cieca; focus da tastiera; bersagli tattili più grandi; contrasti; **arrotondamento classico su ogni numero** (anche prezzi e medie); testi della scala spiegati nella schermata Nuova.
- **Guida PDF** (14 pagine), esempi, README e PIANO allineati al codice; un test controlla che la guida dica gli stessi numeri del codice.
- **Controlli finali**: 164 test automatici (anche 3 esecuzioni in parallelo e con ritardi simulati) e 6 scenari nel browser (scala, cieca, due serie sull'app, team, errori del team): tutti verdi.

**Cosa NON ho fatto (e perché)**

- **Prova sul database vero** (Upstash/Vercel): non ho le chiavi. È il punto 1 della mattina. Finché non è fatta, non andare online col partner.
- **Eventi personali** nell'app (la tua decisione "gli eventi devono essere personali"): non toccato. Non riguarda lo spazio di team del partner; è una modifica a parte dell'app personale (campo `evento` sulle schede e chiusura dello spazio condiviso). Dimmi se farla prima o dopo il design.
- **Design B**: approvato da te e portato online (versione 1.4.0, aggiornamento dell'8 ottobre 2026), con la scelta dei colori per chi usa l'app.
- **Versione 1.6.0 (8 ottobre 2026)**: vista da PC (menù a sinistra, due colonne, Taccuino con elenco + dettaglio), pagina Impostazioni, colori del vino come predefiniti (crema/bordeaux e nero/ciliegia), tema Chiaro/Scuro/Automatico. Sul telefono è invariato tranne l'ingranaggio e il logo. Trovato e corretto nel giro finale: il pannello «Confronto» dei vini era illeggibile sul tema chiaro anche sul telefono.
- **Salvataggio automatico della bozza** dell'app personale se si ricarica la pagina: non fatto (difetto basso). Oggi chiede conferma prima di «Azzera».

**Una cosa da sapere e su cui decidere** (non è un difetto, è un limite delle medie)

In un gruppo molto piccolo (2-3 persone), chi vede la media prima e dopo un nuovo voto può dedurre quel voto. Succede in qualunque sistema con medie visibili. Alternative: mostrare la media solo da 3 voti, o solo a degustazione chiusa. Oggi la guida lo dice al partner. Dimmi se vuoi cambiare.


