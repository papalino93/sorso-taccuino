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

### 3. Guarda le anteprime del design B e dimmi ok o cosa cambiare  ☐
Ti ho mandato (o ti mando) le schermate reali dell'app con il design B. Dimmi: va bene così? Colore d'accento (ora viola)? Altro? **Solo dopo il tuo ok lo porto online.**

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
`docs/guida-integrazione-sorso.pdf` (13 pagine). **Mandala solo dopo che ti ho scritto che la verifica finale è pulita** (vedi "Stato a fine lavoro").

### 8. Decisioni che ti spettano (anche dopo)  ☐
- **Foto dei vini nel team**: oggi non ci sono, per risparmiare spazio gratuito. Va bene aspettare?
- **Chi gestisce le richieste di cancellazione** dei dati degli utenti del partner (c'è l'API, serve una persona).
- **Backup**: consiglia al partner di scaricare il CSV dei risultati dopo ogni serata (non è un servizio con garanzia di continuità).
- **Stato commerciale**: oggi il progetto sta su un piano gratuito che consente solo uso non commerciale. Se qualcuno verrà pagato per il lavoro o per l'hosting, **dimmelo prima del via**: va cambiato hosting (resta gratis, ma serve del lavoro).

---

## Il giorno dell'integrazione (check finale, con il partner)

Capitolo 11 della guida PDF ("Elenco di verifica prima di andare online"). In breve: iframe aperto solo dai domini registrati; token generato a ogni caricamento; un partecipante vota e vede la media solo dopo; un organizzatore crea, aggiunge vini e chiude; due team non si vedono; lettura risultati dal server e CSV; cancellazione di un utente di prova.

**Non andare online prima di aver fatto la prova di accettazione (punto 1).** È l'unica cosa che non posso garantire dal mio ambiente: il database vero e le impostazioni di Vercel.

---

## Stato a fine lavoro (aggiornato da me)

_In aggiornamento: lo riempio quando ho finito le correzioni e i controlli._
