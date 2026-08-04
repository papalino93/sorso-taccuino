# Sorso — Taccuino di degustazione

App per registrare degustazioni di vino con scheda di valutazione, statistiche personali, degustazioni alla cieca ed eventi condivisi.

## Contenuto

- `index.html` — l'app, HTML standalone in JavaScript vanilla (nessuna dipendenza esterna lato frontend).
- `api/auth.js` — registrazione e login (nome + password).
- `api/db.js` — archivio chiave-valore per utente, usato dal frontend per salvare schede, profilo ed eventi.
- `api/_redis.js` — connessione al database (Vercel KV / Upstash Redis).

## Account e sincronizzazione

Senza account i dati restano solo nel browser (`localStorage`). Con un account (nome + password, creato dalla schermata iniziale) le schede si sincronizzano tra dispositivi tramite un database Redis collegato al progetto Vercel.

Perché il login funzioni in produzione, il progetto Vercel deve avere un database collegato (tab **Storage** → **Vercel KV** o l'integrazione **Upstash Redis** dal Marketplace): l'aggiunta crea automaticamente le variabili d'ambiente `KV_REST_API_URL` e `KV_REST_API_TOKEN` lette da `api/_redis.js`. Senza database collegato, l'app funziona comunque ma resta in modalità locale.

## Nota

Il riconoscimento automatico dell'etichetta da foto (via API Claude) presente nella versione originale è disattivato in questa build: funzionava solo dentro l'ambiente artifact di Claude.ai, non su un sito pubblicato.
