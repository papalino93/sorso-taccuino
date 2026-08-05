# Sorso — Taccuino di degustazione

App per registrare degustazioni di vino con scheda di valutazione, statistiche personali, degustazioni alla cieca ed eventi condivisi.

## Contenuto

- `index.html` — l'app, HTML standalone in JavaScript vanilla (nessuna dipendenza esterna lato frontend).
- `api/auth-google-start.js`, `api/auth-google-callback.js`, `api/auth-exchange.js` — login con Google (OAuth 2.0).
- `api/_session.js` — creazione/verifica della sessione, usata da tutti gli endpoint di autenticazione.
- `api/db.js` — archivio chiave-valore per utente, usato dal frontend per salvare schede, profilo ed eventi.
- `api/_redis.js` — connessione al database (Vercel KV / Upstash Redis).

## Account e sincronizzazione

Senza account i dati restano solo nel browser (`localStorage`) e si perdono cambiando dispositivo o cancellando i dati del browser. Accedendo con Google, le schede si sincronizzano tra dispositivi tramite un database Redis collegato al progetto Vercel. Non essendoci una password, non esiste un problema di "password dimenticata": l'identità è garantita da Google.

Perché il login funzioni in produzione servono, come variabili d'ambiente del progetto Vercel:
- `KV_REST_API_URL` / `KV_REST_API_TOKEN` — dal database (tab **Storage** → **Vercel KV** o l'integrazione **Upstash Redis** dal Marketplace), lette da `api/_redis.js`. Senza database collegato, l'app funziona comunque ma resta in modalità locale.
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — da un client OAuth "Applicazione web" creato su [Google Cloud Console](https://console.cloud.google.com/auth/overview), con URI di reindirizzamento `https://<dominio-del-progetto>/api/auth-google-callback`. La schermata di consenso OAuth deve essere pubblicata ("Stato di pubblicazione: In produzione") perché possa accedere chiunque, non solo gli utenti di prova.

## Nota

Il riconoscimento automatico dell'etichetta da foto (via API Claude) presente nella versione originale è disattivato in questa build: funzionava solo dentro l'ambiente artifact di Claude.ai, non su un sito pubblicato.
