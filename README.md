# Sorso — Taccuino di degustazione

Versione corrente: **1.5.1** — ultimo aggiornamento: 8 ottobre 2026 (cronologia in `CHANGELOG.md`). La versione e la data si leggono anche in fondo all'app e dello spazio di team.

App per registrare degustazioni di vino con scheda di valutazione, statistiche personali, degustazioni alla cieca ed eventi condivisi.

## Contenuto

- `public/index.html` — l'app, HTML in JavaScript vanilla (nessuna dipendenza esterna lato frontend).
- `public/js/scoring.js` — il calcolo del punteggio (scala 50–100), funzioni pure usate dall'app e dai test.
- `public/` — cartella servita da Vercel come radice del sito (index.html, icona, robots.txt, sitemap.xml, file di verifica Google). Deve contenere tutti i file statici: se esiste, Vercel ignora quelli nella radice del repo.
- `api/auth-google-start.js`, `api/auth-google-callback.js`, `api/auth-exchange.js` — login con Google (OAuth 2.0).
- `api/_session.js` — creazione/verifica della sessione, usata da tutti gli endpoint di autenticazione.
- `api/db.js` — archivio chiave-valore per utente, usato dal frontend per salvare schede, profilo ed eventi.
- `api/_redis.js` — connessione al database (Vercel KV / Upstash Redis).
- Spazio di team per siti partner (vedi sotto): `api/embed.js`, `api/embed-page.js`, `api/v1.js` e i moduli `api/_jwt.js`, `_partner.js`, `_team.js`, `_limit.js`, `_quota.js`, `_http.js`; interfaccia in `public/embed.js` e `public/embed.css`; configurazione in `vercel.json`.
- `scripts/partner.js` (gestione dei partner), `scripts/usage.js` (consumo di Redis), `scripts/confronto-scala.js`.

## Punteggio

Il punteggio sta sempre tra **50 e 100**, in entrambe le modalità di valutazione (si sceglie per ogni voto):

- **Voto rapido**: tre giudizi da 50 a 100 — occhio, naso, bocca — con media pesata 10/30/60.
- **Scheda completa**: nove giudizi da 0 a 10 sulle quattro fasi (visivo 10, olfattivo 30, gusto-olfattivo 40, finale 20). Ogni fase diventa un punteggio `50 + 50 · q²` e il totale è la media pesata delle fasi.

Il 100 si ottiene solo con ogni giudizio al massimo. Le schede salvate prima della scala nuova vengono ricalcolate al primo caricamento; il vecchio totale lineare resta nel campo `legacyTotal`.

Test: `npm test` (punteggio, token, partner, spazio di team, API, script: usa un finto server Upstash, nessun database vero) e `test/e2e/*.e2e.js` (flussi nel browser, richiedono Playwright). `scripts/confronto-scala.js` confronta i punteggi prima e dopo su un file di "Salva copia".

## Spazio di team per siti partner

Un sito esterno può incorporare Sorso come spazio di team: i suoi utenti votano i vini di una degustazione, ognuno vede i propri voti e, **solo dopo aver votato**, la media del team.

- **Accesso**: il backend del partner firma un JWT HS256 per l'utente (claim `iss` = id partner, `sub`, `name`, `team`, `role` = `member` o `organizer`, `jti` e `exp` entro 15 minuti) e apre l'iframe `https://<dominio>/embed?p=<partner>#token=<JWT>`: il token sta nel frammento, che il browser non invia a nessun server. È monouso e viene scambiato subito con una sessione tenuta solo in memoria; se l'accesso scade l'iframe invia `sorso:reauth` al sito ospite, che ricarica con un token nuovo.
- **Ruoli**: l'organizzatore crea, chiude ed elimina le degustazioni e aggiunge i vini (tetti: 200 degustazioni per team, 100 vini per degustazione); i partecipanti votano.
- **Voti**: voto rapido (occhio, naso, bocca da 50 a 100) o scheda completa; il punteggio lo ricalcola sempre il server.
- **Sicurezza**: la pagina si può incorporare solo dai domini registrati dal partner (`frame-ancestors`); nessuno script inline; il tema del partner è fatto di soli valori controllati.
- **API di sola lettura** per il server del partner, con `Authorization: Bearer sk_<partner>_<chiave>`: `GET /api/v1/tastings`, `GET /api/v1/tastings/{id}/results[?format=csv]`, `DELETE /api/v1/users/{sub}`. Solo aggregati; la media compare dal secondo voto.
- **Partner**: si creano a mano con `node scripts/partner.js create <id> --name "..." --origin https://...` (servono le variabili del database nell'ambiente). Il segreto e la chiave compaiono una volta sola.
- **Costo**: pensato per il piano gratuito di Redis (500.000 comandi al mese). Un voto costa circa 12 comandi, un caricamento della degustazione circa 8. Il consumo si legge con `node scripts/usage.js`; all'80% le risposte portano `X-Sorso-Quota: warn`, al 90% le scritture si fermano (sola lettura).
- **Prova in locale**: `node test/helpers/dev-server.js` avvia il tutto con un Redis finto; `node test/e2e/team.e2e.js` prova il flusso nel browser con un finto sito partner.

## Account e sincronizzazione

Senza account i dati restano solo nel browser (`localStorage`) e si perdono cambiando dispositivo o cancellando i dati del browser. Accedendo con Google, le schede si sincronizzano tra dispositivi tramite un database Redis collegato al progetto Vercel. Non essendoci una password, non esiste un problema di "password dimenticata": l'identità è garantita da Google.

Perché il login funzioni in produzione servono, come variabili d'ambiente del progetto Vercel:
- `KV_REST_API_URL` / `KV_REST_API_TOKEN` — dal database (tab **Storage** → **Vercel KV** o l'integrazione **Upstash Redis** dal Marketplace), lette da `api/_redis.js`. Senza database collegato, l'app funziona comunque ma resta in modalità locale.
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — da un client OAuth "Applicazione web" creato su [Google Cloud Console](https://console.cloud.google.com/auth/overview), con URI di reindirizzamento `https://<dominio-del-progetto>/api/auth-google-callback`. La schermata di consenso OAuth deve essere pubblicata ("Stato di pubblicazione: In produzione") perché possa accedere chiunque, non solo gli utenti di prova.

## Nota

Il riconoscimento automatico dell'etichetta da foto (via API Claude) presente nella versione originale è disattivato in questa build: funzionava solo dentro l'ambiente artifact di Claude.ai, non su un sito pubblicato.
