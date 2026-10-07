# Sorso v2 — Piano di lavoro

App: https://sorso-taccuino.vercel.app/ (repo `papalino93/sorso-taccuino`).
Obiettivo: migliorare l'app in modo definitivo e renderla integrabile come **spazio di team** su un sito esterno, a costo zero.

## 1. Cosa si costruisce

1. **Nuova scala di voto 50–100** e **due modalità di valutazione** da scegliere (voto smart e scheda completa), con ricalcolo dei dati esistenti.
2. **Spazio di team multi-tenant**: un sito partner incorpora Sorso in un iframe; i suoi utenti votano i vini del team. Ognuno vede i propri voti; la media del team si sblocca solo dopo aver votato.
3. **API di sola lettura** per il server del partner (risultati ed export).
4. **Redesign completo** (nuovo look + flussi ripensati), con tema configurabile per partner.
5. **Guida di integrazione in PDF** da consegnare al partner, scritta alla fine, sull'API stabile.

Vincolo trasversale: **nessun costo**. Vercel Hobby + Upstash Redis gratuito, uso non commerciale. Non è previsto nessun servizio a pagamento.

## 2. Scala di voto e modalità di valutazione

### Due modalità, stessa scala
- **Scheda completa** (quella attuale): 9 giudizi 0–10 sulle quattro fasi (visivo 10, olfattivo 30, gusto-olfattivo 40, finale 20).
- **Voto smart**: 3 giudizi (occhio, naso, bocca), **ciascuno direttamente da 50 a 100**, con fasce descrittive accanto al selettore (60 sufficiente, 70 discreto, 80 buono, 90 eccellente, 96+ eccezionale). Il punteggio finale è la media pesata, arrotondata all'intero, con pesi occhio 10, naso 30, bocca 60 (la bocca assorbe gusto-olfattivo e finale). Poiché ogni giudizio è già nella banda, il totale resta tra 50 e 100 senza nessuna curva.
- L'utente sceglie la modalità **per ogni voto**; l'app ricorda l'ultima scelta. Il partner può impostare la modalità predefinita e quali modalità sono consentite.
- Ogni voto salva `mode` (`smart` | `full`) e `scale: 2`. Le due modalità finiscono nella **stessa media di team**, perché entrambe producono un punteggio sulla stessa banda.

### Banda 50–100 con vertice rarissimo
- **Voto smart**: nessuna conversione. I tre giudizi sono già su 50–100 e il totale è la loro media pesata. **100 solo con tre 100**; la fascia 96–100 è etichettata "eccezionale" per renderla un atto deliberato.
- **Scheda completa**: i giudizi restano 0–10 per fedeltà alla scheda AIS. La somma pesata dà una qualità normalizzata `q` (0–1), convertita con una curva non lineare:

  `punteggio = 50 + 50 · q^k`, con k ≈ 1,8 (da tarare, vedi domande aperte)

  Con questa curva: tutto a 6 (sufficiente) ≈ 70, tutto a 8 ≈ 83, tutto a 9 ≈ 91, 95 richiede `q` ≈ 0,95 e **100 solo con ogni giudizio a 10**.

In entrambi i casi il minimo è 50, quindi un 30 non esiste.

Lettura dei punteggi: 50–59 difettoso, 60–69 sufficiente, 70–79 discreto, 80–89 buono/molto buono, 90–95 eccellente, 96–99 eccezionale, 100 irripetibile.

La media del team si mostra con un decimale, perché i voti si concentrano in 75–92.

### Migrazione dei dati esistenti
- I 9 giudizi 0–10 sono già salvati: il punteggio si **ricalcola automaticamente** con la nuova formula.
- Il punteggio lineare originale resta in un campo `legacyTotal` (reversibile).
- Al primo accesso compare una nota "punteggi ricalcolati con la nuova scala" e le schede ricalcolate sono marcate.
- Le schede più vecchie (modelli 1 e 2) usavano voci diverse e non si possono ricalcolare dai singoli giudizi. Per tutte, comunque, la qualità si ricava da `punteggio/100`, perché il punteggio attuale è già una somma pesata lineare: la nuova scala si applica a quel valore.
- Il ricalcolo è una funzione pura, con test, e si può rilanciare.
- `scripts/confronto-scala.js` legge il file di "Salva copia" e stampa il confronto prima/dopo (tabella per vino, statistiche, fasce, tabella di riferimento al variare di `k`).

## 3. Spazio di team per siti partner

### Modello
`partner → team → degustazione → vini → voti`

- Il **vino lo crea il team** (produttore, nome, annata, eventuale foto); gli utenti votano quello. Ogni voto è legato a un `wineId`, quindi la media è esatta. Niente abbinamento automatico per nome.
- Un voto per utente per vino, modificabile finché la degustazione è aperta.
- **Visibilità**: la media (e il numero di voti) si sblocca per un utente solo dopo che ha votato quel vino. Ognuno vede sempre i propri voti con tutto il dettaglio.
- Ruoli decisi dal partner nel token: `organizer` (crea degustazioni, aggiunge e chiude vini, vede lo stato) e `member` (vota). Sorso non gestisce utenti né inviti.
- L'organizzatore può chiudere una degustazione: dopo la chiusura i voti sono definitivi.

### Autenticazione (SSO con token firmato)
1. Il backend del partner firma un JWT **HS256** con il segreto condiviso. Claim: `iss` (id partner), `sub` (id utente opaco), `name`, `team`, `role`, `exp` (massimo 10 minuti), `jti`.
2. L'iframe carica `/embed?token=...`; Sorso verifica la firma e `exp`, consuma il `jti` (monouso) e crea una sessione.
3. La sessione vive **solo in memoria** nell'iframe (niente cookie né localStorage di terze parti, che i browser bloccano).
4. L'embed risponde con `Content-Security-Policy: frame-ancestors <domini del partner>`: funziona solo dal dominio registrato.

### Onboarding del partner
Creato a mano con uno script nel repo (`scripts/create-partner.js`): genera `partnerId`, segreto di firma e chiave API di sola lettura, e salva in Redis domini autorizzati, tema e impostazioni (modalità consentite, lingua). Rotazione dei segreti manuale. Nessun pannello né self-service finché non arriva un secondo partner.

### Archiviazione (pensata per i 500.000 comandi/mese del piano gratuito)
Niente `KEYS` né scansioni. Strutture Redis:

- `p:{partner}` — configurazione del partner.
- `tastings:{partner}:{team}` — set delle degustazioni; `tasting:{id}` — hash con metadati e stato.
- `wines:{tasting}` — hash `wineId → JSON`.
- `votes:{tasting}:{wine}` — hash `userId → JSON compatto`.
- `agg:{tasting}` — hash `wineId → somma:conteggio`, aggiornato a ogni voto (lettura del voto precedente + correzione, in un solo `EVAL`).

Stima: un voto costa circa 4 comandi, il caricamento di una degustazione circa 4. Anche con centinaia di utenti si resta ben sotto il limite. Limitazione delle richieste con Upstash Ratelimit sui soli endpoint di scrittura e di creazione sessione.

### Sicurezza dell'esistente da correggere
L'attuale `api/db.js` espone uno spazio `shared:` leggibile e scrivibile da qualunque utente loggato (voti e eventi di tutti, cancellabili da chiunque). Il nuovo modello lo sostituisce con isolamento per partner e team: nessuna chiave condivisa globalmente.

## 4. API di sola lettura per il server del partner

Autenticazione: `Authorization: Bearer <chiave API del partner>` (diversa dal segreto di firma). Solo lettura.

- `GET /api/v1/tastings` — degustazioni del partner (filtro per team e stato).
- `GET /api/v1/tastings/{id}/results` — vini con media del team, numero di voti, distribuzione.
- `GET /api/v1/tastings/{id}/results?format=csv` — export.
- `DELETE /api/v1/users/{sub}` — cancellazione dei dati di un utente (richiesta GDPR del partner).

L'API espone **solo aggregati**, mai chi ha votato cosa. Versione `v1`, errori JSON uniformi, limiti di richieste per chiave. Nessuna scrittura né webhook nella prima versione.

## 5. Redesign

- **Nuovo look + flussi ripensati**, stessa codebase vanilla (nessun framework, nessun costo di build).
- La schermata di valutazione offre la scelta tra **Voto rapido** (smart, 3 passi: occhio, naso, bocca) e **Scheda completa**; nessuna delle due è nascosta o declassata.
- Sistema visivo basato su variabili CSS: tipografia, palette, spaziature, componenti, radar, schede, tema chiaro e scuro.
- **Tema partner** via configurazione: logo, colori (accento, sfondo, testo), lingua (it/en), modalità consentite. Font da una lista breve di sistema per evitare caricamenti esterni.
- `index.html` (circa 5.200 righe) diviso in moduli ES statici: CSS, JS per area (valutazione, archivio, statistiche, cieca, team), i18n. Nessun bundler.
- Checklist di regressione e test automatici (funzioni di punteggio in Node, flussi principali con Playwright).

## 6. Ordine dei lavori

1. **Scala 50–100, voto smart, migrazione dati.** Cambia il modello su cui poggia tutto il resto. Test delle funzioni di punteggio e del ricalcolo.
2. **Backend multi-tenant, token firmato, embed e API di sola lettura.** Il partner può già provare con il look attuale. Pagina demo di un partner finto per verificare tutto il flusso.
3. **Redesign completo** sulla base di scala, modalità e tema partner ormai definiti.
4. **Guida di integrazione in PDF**, scritta sull'API stabile e provata con la pagina demo.

Ogni fase si chiude con deploy e verifica sul sito in produzione.

## 7. Guida di integrazione (PDF)

Capitoli: panoramica; ottenere credenziali; firmare il token (esempi in Node e PHP); incorporare l'iframe (parametri, tema, CSP); ruoli; API di lettura con esempi `curl`; codici di errore; limiti e quote; sicurezza (segreti, scadenza token, rotazione); privacy e cancellazione dati; elenco di verifica prima del go-live. Consegnata dopo la fase 4.

## 8. Decisioni

| Decisione | Scelta | Motivo |
|---|---|---|
| Scopo dell'API | Spazio di team per siti esterni | Richiesta dell'utente |
| Identità degli utenti | JWT firmato dal sito partner | Il partner ha già l'anagrafica; niente doppio login |
| Integrazione | iframe con tema/config per partner | Riusa l'app, un solo front-end |
| Identità del vino | Lo crea il team, voti legati a `wineId` | Media esatta, nessun abbinamento fragile |
| Visibilità della media | Solo dopo aver votato | Evita l'effetto gregge senza complicare il flusso |
| Scala | Banda 50–100, curva non lineare, 100 rarissimo | Scala nota; il 30 non esiste |
| Modalità | Smart e completa, scelte per voto, stessa scala | Richiesta dell'utente; medie confrontabili |
| Voto smart | Tre giudizi direttamente su 50–100, media pesata 10/30/60 | Richiesta dell'utente; 50 e non 1 per escludere il 30 |
| Redesign | Nuovo look + flussi ripensati, stessa codebase | Mantiene statistiche, radar, i18n |
| Ruoli | Decisi dal partner nel token | Nessuna amministrazione da costruire |
| Migrazione | Ricalcolo automatico, `legacyTotal` conservato | Archivio coerente e reversibile |
| Onboarding partner | Script manuale, dati in Redis | Delegato a me; basta per un primo partner |
| API dati | Sola lettura, aggregati, export | Nessun rischio di voti falsati |
| Costo | Vercel Hobby + Upstash free, uso non commerciale | Vincolo "zero euro"; verificato: 500K comandi/mese, 256 MB |
| Ordine | Scala → API/embed → redesign → PDF | Il partner prova prima; il redesign non si rifà due volte |

## 9. Domande aperte

1. **Taratura della curva e confronto tra modalità.** `k ≈ 1,8` (scheda completa) è una proposta: va verificata sulle degustazioni già salvate (distribuzione prima e dopo) e aggiustata finché il 70, l'85 e il 95 "suonano giusti". Va controllato anche che lo stesso vino ottenga punteggi simili nelle due modalità, perché finiscono nella stessa media di team.
2. **Soglia sugli aggregati nell'API.** Con un solo voto la "media" coincide con il voto di una persona. Proposta: l'API restituisce la media solo da 3 voti in su; da confermare.
3. **Eventi esistenti.** Gli eventi dell'app attuale (spazio `shared:`) vanno migrati in un team "pubblico" o dismessi? Va deciso prima di chiudere lo spazio condiviso.
4. **Stato commerciale.** Si resta su Vercel Hobby solo se nessuno guadagna da questo progetto (compreso un compenso per il codice o per l'hosting). Da riconfermare prima del go-live con il partner; se cambia, la strada a costo zero è Cloudflare Pages + Workers.
5. **Chi è il partner.** Nome, dominio, lingue e tema iniziale: servono per creare il primo partner reale.
6. **Foto dei vini nel team.** Archiviarle (spazio e comandi limitati) o non supportarle nell'embed? Proposta iniziale: non supportarle.
7. **Gestione dei limiti gratuiti.** Soglie di allarme sul consumo di comandi Redis (500K/mese) e cosa fare se il partner cresce.
