# Taste — Taccuino di degustazione

Versione corrente: **2.15.0** — ultimo aggiornamento: 22 ottobre 2026 (cronologia in `CHANGELOG.md`). Fino alla 2.10 si chiamava **Sorso**: indirizzo, repository, chiavi dei dati salvati, intestazioni `X-Sorso-*` e messaggi `sorso:*` restano con il vecchio nome, così niente si rompe. La versione e la data si leggono anche in fondo all'app e dello spazio di team.

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
- `ROADMAP-PARTNER.md`: cosa deve fare il gestore per attivare e consegnare lo spazio al partner (aggiornata a ogni versione).
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
- **Ruoli**: l'organizzatore (anche più persone: i delegati hanno lo stesso `role`) crea, chiude ed elimina le degustazioni, chiude la votazione di un singolo vino (media su chi ha votato fino a quel momento) e aggiunge i vini (tetti: 200 degustazioni per team, 100 vini per degustazione); i partecipanti votano.
- **Voti**: voto rapido (occhio, naso, bocca da 50 a 100) o scheda completa; il punteggio lo ricalcola sempre il server.
- **Alla cieca, classifica, statistiche** (1.7.0): l'organizzatore può creare una serata «alla cieca» (i vini sono «Vino 1, Vino 2…» finché non li svela; in più si può indovinare tipologia, vitigno, annata; lo svelamento chiude per sempre). La classifica è provvisoria a serata aperta e finale a serata chiusa; le statistiche aggregano le ultime 30 degustazioni chiuse del team.
- **Sicurezza**: la pagina si può incorporare solo dai domini registrati dal partner (`frame-ancestors`); nessuno script inline; il tema del partner è fatto di soli valori controllati.
- **API di sola lettura** per il server del partner, con `Authorization: Bearer sk_<partner>_<chiave>`: `GET /api/v1/tastings`, `GET /api/v1/tastings/{id}/results[?format=csv]`, `GET /api/v1/tastings/{id}/guesses`, `GET /api/v1/stats?team=`, `GET /api/v1/events?team=`, `DELETE /api/v1/users/{sub}`. Solo aggregati; la media compare dal secondo voto.
- **Partner**: si creano a mano con `node scripts/partner.js create <id> --name "..." --origin https://...` (servono le variabili del database nell'ambiente). Il segreto e la chiave compaiono una volta sola.
- **Costo**: pensato per il piano gratuito di Redis (500.000 comandi al mese). Un voto costa circa 12 comandi, un caricamento della degustazione circa 8. Il consumo si legge con `node scripts/usage.js`; all'80% le risposte portano `X-Sorso-Quota: warn`, al 90% le scritture si fermano (sola lettura).
- **Prova in locale**: `node test/helpers/dev-server.js` avvia il tutto con un Redis finto; `node test/e2e/team.e2e.js` prova il flusso nel browser con un finto sito partner.

## Mail degli inviti (cerchie)

Sorso non ha un server di posta: per mandare le mail degli inviti usa un servizio esterno, scelto con variabili d'ambiente del progetto Vercel (Settings → Environment Variables, poi un nuovo deploy). Senza variabili le mail non partono e l'app dice di copiare il link.

| Variabile | A cosa serve |
|---|---|
| `MAIL_FROM` | mittente, per esempio `Sorso <inviti@tuodominio.it>` (obbligatoria) |
| `RESEND_API_KEY` | chiave di [Resend](https://resend.com): per scrivere a chiunque serve un dominio tuo verificato (record DNS) |
| `BREVO_API_KEY` | chiave di [Brevo](https://brevo.com) (300 mail al giorno gratis): basta verificare l'indirizzo del mittente, senza dominio |
| `APP_ORIGIN` | (facoltativa) indirizzo del sito nei link, di default `https://sorso-taccuino.vercel.app` |

Ne basta uno fra Resend e Brevo. Le chiavi non vanno mai in chat né nel repository.

**Mittente con indirizzo gratuito (Gmail, Proton…).** Brevo lo accetta dopo la verifica con il codice, ma segnala «Firma DKIM: predefinito» e «dominio email gratuito non consigliato»: le mail partono, però possono finire in spam. Va bene per provare; per un uso vero conviene un indirizzo di un dominio tuo, autenticato in Brevo (Domini → Aggiungi un dominio, con i record DNS indicati).

**Se la mail finisce in spam (e non vuoi spendere).** Sorso avvisa chi invita («Controlla lo spam») e per ogni invito offre «Scrivi tu la mail» e «Condividi»: il messaggio parte dalla casella di chi invita e arriva sempre. La soluzione definitiva e gratuita è mandare dal dominio dell'azienda: in Brevo, Domini → Aggiungi un dominio, e chi gestisce il DNS aggiunge i 3-4 record indicati (DKIM, DMARC, codice di verifica); poi `MAIL_FROM` diventa un indirizzo di quel dominio.

**Se la mail non parte.** In Brevo, Transactional → Logs mostra il motivo del rifiuto. Un account nuovo può dover essere attivato da Brevo prima del primo invio. Dopo aver cambiato le variabili serve un nuovo deploy. In ogni caso il link dell'invito si può copiare e mandare a mano.

## Serate nelle cerchie

Dentro una cerchia, «Serate e degustazioni» è la stessa interfaccia dello spazio di team (`public/embed.js`), aperta in un riquadro dell'app all'indirizzo `/embed?c=<cerchia>` (stessa origine, incorporabile solo da Sorso). Il motore è lo stesso (`api/_team.js`): per lui una cerchia è il team di un partner interno, `cerchie` (id riservato in `scripts/partner.js`). Ogni richiesta a `/api/embed` porta la sessione di Sorso e l'id della cerchia; il ruolo si rilegge dalla cerchia a ogni richiesta (Proprietario e amministratori = organizzatori, membri = partecipanti), quindi chi viene tolto perde subito l'accesso. Voti anonimi come nello spazio di team. In più: «Un solo vino» (la degustazione nasce con il suo vino), «Cancella i miei voti» per una cerchia (`votes.delete`), esportazione CSV/JSON per Proprietario e amministratori (`export`, medie solo da 2 voti), e alla cancellazione della cerchia si cancellano anche serate e voti. L'Evento della versione precedente è ritirato: i vecchi eventi restano consultabili, non se ne creano di nuovi.

## Il gioco nelle cerchie (2.10.0)

Interruttore per cerchia (`game.set`, solo Proprietario e amministratori; `circle.game`). A gioco acceso, sotto ogni vino delle serate: la propria faccia (foto Google, solo `https://*.googleusercontent.com`, altrimenti iniziali) su un campo a due assi che cambiano da vino a vino, il pronostico sulla media del gruppo (50–100) e il prezzo (facoltativo). Le mosse (`gp:<t>:<w>`) restano segrete fino allo svelamento: tutti i membri hanno votato, vino o serata chiusi, oppure «Svela!» dell'organizzatore (`gw:<t>`). Poi tutti vedono voti e mosse di tutti, con punti (fino a 10 ciascuno per pronostico, prezzo e vicinanza al centro del gruppo), titoli, reazioni e frecciatine predefinite (`gx:<t>:<w>`, mai testo libero). Classifica della stagione sulle ultime 30 serate con soprannomi e «gemello di palato» (`game.board`, cache `gb:<cerchia>` 2 minuti). Codice in `api/_game.js` (instradato da `api/embed.js`); le persone sono indicate con un id opaco. «Cancella i miei voti» e l'eliminazione di una serata cancellano anche mosse e reazioni. A gioco spento i voti restano anonimi; il widget resta sempre anonimo.

Dalla 2.13.0: **scommessa della serata** (`game.fav`, `gf:<serata>`: chi indovina il vino con la media più alta prende 10 punti; scelte segrete fino alla chiusura), **classifica del mese** accanto a quella della stagione, **livelli** (Apprendista 0, Assaggiatore 40, Cantiniere 100, Sommelier 200, Maestro 350, Leggenda 600 punti), **dieci traguardi** (Primo sorso, Cecchino, Occhio al portafoglio, In serie, Fiuto del vincitore, Tris, Diapason, Voce fuori dal coro, Veterano, Re della cerchia), **serie** di pronostici centrati (entro 2 punti), **nemesi** (il palato più lontano, almeno 6 punti in media su 2 vini comuni) e coriandoli quando sei primo su un vino svelato.

Dalla 2.14.0 ogni vino ha sei giochi (tutti facoltativi, nelle stesse mosse di `game.play`): campo, pronostico, prezzo, **caccia agli aromi** (`a`, fino a 3 chiavi da `AROMI`: 3 punti per aroma tra i primi tre del gruppo scelti da almeno due), **il vino in una parola** (`wd` da `PAROLE`: 5 punti se è la più scelta, da almeno due) e **il fan numero uno** (`fan`, l'impronta di un membro: 5 punti se ha dato il voto più alto). Nella serata: «❓ Come si gioca» con una scheda per gioco e l'avviso delle novità (si chiude una volta, `localStorage`). Il widget «La sfida» mostra anche il naso e la parola del gruppo.

Dalla 2.15.0: **duelli** (`game.duel`, `game.duel.answer`, `game.duel.cancel`, `game.duel.taunt`; `gd:<serata>`): uno sfida un altro membro su un vino non ancora svelato con una posta presa da `STAKES` (penitenze bonarie, mai soldi), al massimo 3 duelli lanciati a testa per serata e uno per coppia e vino; chi fa più punti di gioco su quel vino vince e prende +5, poi può gongolare con una frase; rifiutare due volte vale il soprannome «Il fifone». **Sfida del mese**: un tema a rotazione (`THEMES`: naso, portafoglio, pronostico, campo, cuore, duelli) raddoppia i punti di un gioco nella classifica del mese; i primi dei mesi passati vanno nell'albo d'oro e prendono il traguardo «Campione del mese». A serata chiusa `game.state` restituisce la **pagella** (MVP, maglia nera, il più generoso, lo spietato, re dei duelli); la **telecronaca** dello svelamento la scrive l'interfaccia dai risultati, una frase a testa.

## Widget per i siti

Proprietario e amministratori creano dall'app (cerchia → «Widget per un sito») un link di sola lettura, uno per cerchia, revocabile e rinnovabile (`widget.create`, `widget.revoke`; chiavi `cw:<cerchia>` e `wt:<codice>`). La pagina è `/widget?t=<codice>` (`api/widget.js`, riscritta in `vercel.json`): fatta tutta sul server, senza script esterni, incorporabile da qualunque sito (`frame-ancestors *`), in cache CDN per 2 minuti (la revoca vale entro un paio di minuti), 120 richieste al minuto per indirizzo IP fuori dalla cache. Parametri: `lang=it|en`, `theme=auto|light|dark`, `accent=rrggbb`, `bg=rrggbb|none` (trasparente), `rows=1-10`, `show=top,events,totals`. Mostra le statistiche della cerchia (le stesse dello spazio di team: solo serate chiuse, medie dal secondo voto, vini alla cieca nascosti finché non svelati), senza nomi. Sei viste con `view=`: `classifica` (predefinita), `palato` (cosa aprite, regioni e vitigni preferiti, il più divisivo e quello su cui siete d'accordo con la fascia dei voti solo dai vini con almeno 5 voti, i più votati), `striscia` (una riga), e tre del gioco: `sfida` (numeri senza nomi: mosse, pronostici centrati, errore sul prezzo, bussola del gruppo, il prezzo che vi ha spiazzato, il vino che vi ha diviso), `campo` (le facce dell'ultimo vino svelato; punti anonimi senza permesso) e `podio` (classifica del gioco con i nomi, premi della stagione, gemelli di palato). I nomi compaiono solo se la cerchia ha il gioco acceso **e** Proprietario o amministratori li hanno permessi per il widget (`widget.names`, salvato nella cerchia: nessun parametro dell'indirizzo li accende). I vini delle serate hanno anche la regione (facoltativa). Il codice da incollare include un piccolo script facoltativo che adatta l'altezza dell'iframe (messaggio `sorso:widget-height`).

## Lettura dell'etichetta

In «Nuova», dopo aver scelto la foto, «Leggi l'etichetta» riconosce il testo direttamente nel browser con [Tesseract.js](https://github.com/naptha/tesseract.js) (Apache 2.0): la foto non viene inviata a nessun server. La prima volta il browser scarica il motore (da jsDelivr) e i dati delle lingue italiano e inglese (circa 10 MB in tutto), poi restano in cache. L'analisi del testo (produttore, nome, annata, denominazione, tipologia, vitigni, gradazione) è in `public/js/label-reader.js`, provata in `test/label-reader.test.js`; il lettore è `public/js/label-ocr.js`; la prova nel browser è `test/e2e/etichetta.e2e.js` (serve la rete). I dati proposti non entrano nella scheda finché non si preme «Compila la scheda», e una voce già compilata non viene sovrascritta se non la si spunta.

Su foto vere (2.6.0): il lettore trova da solo l'etichetta nella foto (zona chiara e poco colorata, più centrale, che non tocca i bordi), la legge quattro volte (luminosità e canale verde, testo sparso e a blocchi; scelte misurate su foto vere) e unisce le righe, preferendo quelle confermate da più letture. L'analisi corregge gli errori tipici dell'OCR confrontando «a somiglianza» con elenchi ampi di denominazioni (DOCG riconosciute come tali), vitigni e cantine note, riga per riga e senza usare gli indirizzi. Per rimisurare con altre foto: `node scripts/label-bench.js <cartella>`.

### Riconoscere il vino (2.7.0)

Dopo la lettura Sorso cerca il vino a strati e si ferma alla prima fonte sicura: **il tuo Taccuino** (nel dispositivo: «l'hai bevuto il 12 mar 2026, 92/100»), il **catalogo Vino.com** (quando arriverà il feed), il **catalogo Sorso** e **Open Food Facts** con il codice a barre. Altrimenti restano i dati letti. Con una somiglianza alta propone «È questo?», con una media due o tre «Forse è uno di questi?» e «Nessuno di questi»; si vede sempre da dove viene il dato e l'annata resta quella letta. Il confronto a somiglianza è `public/js/wine-match.js` (stesso codice nel browser e sul server).

- **Catalogo Sorso** (`api/catalog.js`, `api/_catalog.js`): quando chi ha fatto l'accesso salva una degustazione nuova con nome e produttore, vanno al catalogo solo i dati del vino (nome, produttore, denominazione, tipologia, vitigni, annate, codice a barre); chi conferma è un'impronta anonima. Un vino serve solo a chi l'ha inserito finché non lo conferma una seconda persona; varianti dello stesso vino si uniscono a somiglianza; con due segnalazioni di persone diverse la voce sparisce. Si disattiva in Impostazioni → Catalogo Sorso. Ricerca anche senza accesso, 30 richieste al minuto per indirizzo IP; l'indice resta in memoria un minuto (la ricerca costa pochi comandi Redis).
- **Codice a barre** (`public/js/barcode.js`): letto nel browser con BarcodeDetector dove c'è (Chrome su Android), altrimenti con [ZXing](https://github.com/zxing-js/library) (Apache 2.0, da jsDelivr, solo quando serve); oppure scritto a mano. Si cerca prima nel catalogo Sorso, poi su [Open Food Facts](https://world.openfoodfacts.org) (dati con licenza ODbL, citata nell'app), con la risposta in memoria per 30 giorni (3 se non trovato). Una scheda che non è di un vino viene scartata.
- Prove: `test/catalog.test.js` e `test/e2e/riconosci.e2e.js` (Taccuino, catalogo, codice scritto e fotografato, contributo al salvataggio).

## Aspetto (2.8.0)

Il sistema visivo è uno solo: i colori li calcola `public/js/theme.js` da un accento e da uno sfondo (predefiniti: lavanda `#5b4bd5` su perla `#f4f3ef` di giorno, lavanda `#9a8cff` su antracite `#131218` di notte), con il contrasto garantito; `node scripts/theme-css.js` li scrive in `index.html` così la pagina nasce già colorata. Sopra ci sono i token di forma (angoli `--r-*`, ombre `--shadow-*`, stati `--ok`/`--warn`/`--bad`, `--accent-soft`/`--accent-tint` per le scelte attive) nel blocco «SORSO 3» di `index.html`. Logo: un cerchio che sorride. Nella scritta «SORSO» le due O sono il cerchio che sorride (`wordmarkHTML` in `index.html`: la parola resta testo vero, i lettori di schermo leggono «Sorso»; un nome scelto dall'utente si scrive com'è); `public/favicon.svg` è l'icona, `public/logo-mark.svg` il simbolo su fondo chiaro. Lo spazio di team (`public/embed.css`), il widget e la mail degli inviti usano gli stessi colori e la stessa forma.

## Guida all'uso

Nell'app: Impostazioni → Guida → «Apri la guida» (`public/guida-uso-sorso.pdf`). Le guide PDF si rigenerano con `node docs/guide/build.js` (servono Playwright e le schermate in `docs/guide/img`; `shots-nuove.js` produce quelle di team e desktop).

## Account e sincronizzazione

Senza account i dati restano solo nel browser (`localStorage`) e si perdono cambiando dispositivo o cancellando i dati del browser. Accedendo con Google, le schede si sincronizzano tra dispositivi tramite un database Redis collegato al progetto Vercel. Non essendoci una password, non esiste un problema di "password dimenticata": l'identità è garantita da Google.

Perché il login funzioni in produzione servono, come variabili d'ambiente del progetto Vercel:
- `KV_REST_API_URL` / `KV_REST_API_TOKEN` — dal database (tab **Storage** → **Vercel KV** o l'integrazione **Upstash Redis** dal Marketplace), lette da `api/_redis.js`. Senza database collegato, l'app funziona comunque ma resta in modalità locale.
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — da un client OAuth "Applicazione web" creato su [Google Cloud Console](https://console.cloud.google.com/auth/overview), con URI di reindirizzamento `https://<dominio-del-progetto>/api/auth-google-callback`. La schermata di consenso OAuth deve essere pubblicata ("Stato di pubblicazione: In produzione") perché possa accedere chiunque, non solo gli utenti di prova.

## Nota

Il riconoscimento automatico dell'etichetta da foto (via API Claude) presente nella versione originale è disattivato in questa build: funzionava solo dentro l'ambiente artifact di Claude.ai, non su un sito pubblicato.
