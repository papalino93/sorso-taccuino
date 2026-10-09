# Sorso — Piano delle cerchie

Versione del piano: 9 ottobre 2026 · scritto dopo l'intervista con Andrea. **Stato: passo 0 fatto (1.9.2), passo 1 fatto (2.0.0).**

## 1. Obiettivo

Chiunque abbia un account Sorso (accesso Google) può creare una o più **cerchie** — amici, colleghi, corsisti — invitare persone **per mail**, nominare **amministratori** e fare insieme **serate di degustazione** (anche alla cieca) con classifica e statistiche di gruppo. Le statistiche di una cerchia si possono poi **portare su un sito esterno** con un widget.

Non si fa: voti con nome visibile, condivisione di schede del Taccuino personale, ruoli complicati, invio di mail automatiche (per ora), API per sviluppatori (per ora).

## 2. Cosa cambia rispetto a oggi

| Oggi | Con le cerchie |
|---|---|
| Lo **spazio di team** esiste solo dentro il sito di un partner, con token firmato dal suo server | Le cerchie sono una funzione **dentro Sorso**, con accesso Google, inviti e ruoli |
| L'**Evento** dell'app personale usa uno spazio comune dove ogni utente collegato può leggere, sovrascrivere e cancellare i dati degli altri (falla confermata in `api/db.js`) | L'Evento viene **ritirato**: diventa «la serata di una cerchia», con permessi veri |
| Le statistiche per il sito del partner passano da API con chiave | Il widget (passo 3) mostra le statistiche di una cerchia su qualunque sito |

**Spazio di team e API v1 per i partner: restano com'è, congelati.** Non si tolgono (funzionano, sono provati, il partner potrebbe arrivare), ma non si sviluppano più; se tra qualche mese nessuno li usa, si archiviano. Il motore delle serate è lo stesso, quindi non c'è doppio lavoro.

## 3. Come funziona (visto da chi usa)

1. In **Cerchie** (nuova voce del menù, accanto a Statistiche) premi **Nuova cerchia**, scegli un nome. Sei il **Proprietario**.
2. **Inviti**: scrivi una o più mail. Per ognuna Sorso crea un invito *legato a quell'indirizzo*; compare nella sezione «Inviti» della persona quando entra con Google con quella mail, e tu puoi copiare un **link personale** da mandare per WhatsApp o mail normale. Scade dopo 14 giorni e si può revocare.
3. Dentro la cerchia gli amministratori **creano le serate** (anche «Alla cieca»), aggiungono i vini, **chiudono la votazione di un singolo vino** quando l'hanno assaggiato in pochi, chiudono o svelano la serata.
4. Tutti i membri **votano**; i voti sono **anonimi** (solo medie e conteggi, mai chi ha votato cosa, nemmeno per gli amministratori).
5. Gli amministratori **esportano le statistiche di gruppo** (CSV e JSON: medie per vino, classifica, partecipazione).
6. (Passo 3) L'amministratore preme **Condividi statistiche**, riceve un frammento HTML da incollare in un sito e può **revocarlo** con un tocco.

## 4. Ruoli e permessi

| Azione | Proprietario | Amministratore | Membro |
|---|:-:|:-:|:-:|
| Votare, vedere classifica e statistiche, uscire dalla cerchia | ✓ | ✓ | ✓ |
| Creare/chiudere/riaprire/eliminare serate, aggiungere vini, svelare | ✓ | ✓ | – |
| Chiudere/riaprire la votazione di un singolo vino | ✓ | ✓ | – |
| Invitare, revocare inviti, togliere membri | ✓ | ✓ (non il Proprietario né altri amministratori) | – |
| Esportare statistiche, creare/revocare il widget | ✓ | ✓ | – |
| Nominare o togliere amministratori | ✓ | – | – |
| Rinominare, trasferire la proprietà, eliminare la cerchia | ✓ | – | – |

Regole: **un solo Proprietario**; se vuole uscire deve prima trasferire la proprietà. Un amministratore non può togliere un altro amministratore (solo il Proprietario). Nessun ruolo vede i voti individuali. Non c'è il ruolo «Ospite»: se serve, si aggiunge senza rifare niente.

## 5. Architettura (come lo costruisco)

**Idea chiave: riuso del motore già collaudato.** Una cerchia è, per il motore delle serate (`api/_team.js`), un «team» di un partner interno riservato (`cerchie`): l'identificativo della cerchia è il team, l'account Google è l'utente, Proprietario e Amministratore sono `organizer`, Membro è `member`. Così serate, alla cieca, chiusura del singolo vino, classifica, statistiche, quota e limiti **non si riscrivono**.

- **Nuova funzione** `api/circles.js` (una sola, con operazioni): crea/rinomina/elimina cerchia, inviti (crea, revoca, accetta), membri (ruolo, rimozione, uscita), trasferimento proprietà, esportazione, widget. Ogni operazione controlla il ruolo **sul server** a ogni richiesta (mai fidarsi del client).
- **Accesso alle serate**: `circles` rilascia una sessione firmata (la stessa dell'iframe di oggi: 4 ore, HMAC) per `team = cerchia`; l'app mostra le serate nell'interfaccia già esistente (`/embed`), aperta nella stessa pagina. Zero interfaccia nuova per votare, classifica e statistiche.
- **Interfaccia nuova** (solo l'indispensabile): elenco cerchie e inviti, scheda cerchia (membri, ruoli, inviti, link), pulsante esporta. Stessa grafica e stesse regole di colori/lingua di oggi (italiano e inglese).
- **Dati** (Redis, tutti sotto `circle:` / `invite:`): cerchia (nome, proprietario, creazione), membri (account → ruolo), indici «le mie cerchie» e «i miei inviti per mail», inviti (mail normalizzata, token, scadenza, stato), widget (token di sola lettura, revocabile).
- **Funzioni Vercel**: oggi 7 su 12 consentite; con `circles.js` e la pagina del widget (passo 3) si arriva a 9.
- **Mail**: l'invito è legato all'indirizzo *Google* normalizzato (minuscolo, senza trucchi tipo `+alias` ignorato). Nessun servizio di posta per ora: si aggiunge in un secondo momento senza cambiare i dati.

## 6. Privacy, sicurezza, limiti

- **Voti anonimi**: stesso modello di oggi; la cancellazione dei dati di una persona (già esistente) ricalcola le medie. **Se esce o viene tolto**: i voti restano nelle medie senza nome; può usare «Cancella i miei voti» per sparire del tutto. Le serate chiuse non cambiano da sole.
- **Inviti**: verificati sul server con l'indirizzo dell'account Google; scadenza 14 giorni, un uso, revocabili; limite di inviti al giorno per cerchia (anti-abuso); link non indovinabili.
- **Limiti**: **50 persone per cerchia, 5 cerchie create a testa** (e una persona può appartenere a più cerchie altrui, con un tetto ragionevole, 20), 200 serate per cerchia, 100 vini per serata (come oggi). Costo: una serata da 50 persone × 10 vini ≈ 6.000 comandi sui 500.000 mensili gratuiti: il contatore di quota esistente avvisa all'80% e passa in sola lettura al 90%.
- **Falla dell'Evento attuale** (spazio condiviso scrivibile da tutti): si chiude **subito**, in un rilascio a parte (1.9.2), prima delle cerchie: le scritture e le cancellazioni nello spazio condiviso vengono limitate a chi ha creato la voce, e l'elenco non si scandisce più con `KEYS`. L'Evento sparisce dall'app quando le cerchie sono pronte; i vecchi eventi si possono convertire in una cerchia.
- **Solo Google**: chi non ha un account Google non può entrare (limite noto; vedi domande aperte).

## 7. Passi di lavoro

Ogni passo è rilasciabile da solo, con test automatici, test nel browser e giro di verifica prima di passare al successivo.

**Passo 0 — 1.9.2 ✅ fatto: chiudere la falla dello spazio condiviso.**
Permessi per proprietario sulle chiavi condivise, niente scansione completa, test. Nessuna novità visibile.

**Passo 1 — 2.0.0 ✅ fatto: cerchie, ruoli, inviti.**
Creare/rinominare/eliminare cerchie; inviti legati alla mail con link copiabile, scadenza e revoca; ruoli Proprietario/Amministratore/Membro con trasferimento di proprietà; uscire/togliere membri; «le mie cerchie» e «i miei inviti». Test dei permessi su **ogni** operazione e per **ogni** ruolo, e di isolamento tra cerchie.
*Fine passo: tre persone di prova creano una cerchia, si invitano, si nominano e si tolgono, senza che nessuno veda ciò che non deve.*

**Passo 2 — 2.1.0: serate nella cerchia ed esportazione.**
Le serate (anche alla cieca, chiusura del singolo vino, classifica, statistiche) dentro la cerchia con la sessione interna; ritiro della scheda Evento e conversione dei vecchi eventi; esportazione CSV/JSON delle statistiche di gruppo per gli amministratori; «Cancella i miei voti».
*Fine passo: una serata completa di cerchia, dall'invito alla classifica, e un CSV corretto.*

**Passo 3 — 2.2.0: widget per i siti.**
Link di sola lettura revocabile; pagina del widget (classifica, medie, serate, nei colori del sito, con un frammento HTML da incollare); solo aggregati; limiti di richieste. Guida in PDF.
*Fine passo: il widget funziona incollato in una pagina di prova e smette di funzionare appena revocato.*

**Passo 4 (solo se serve): API con chiave per cerchia**, riusando l'API v1; e la mail automatica degli inviti con un servizio di posta.

Dopo ogni passo: guide aggiornate (guida all'uso e, per i passi 1–3, una guida «Le cerchie» per chi le gestisce), roadmap, changelog, rilascio con versione e data.

## 8. Rischi e come li tengo a bada

- **Permessi sbagliati** (qualcuno vede o fa ciò che non deve): matrice dei permessi testata automaticamente per ogni operazione e ruolo; revisione indipendente prima di ogni rilascio.
- **Inviti usati da persone sbagliate**: legati all'indirizzo verificato da Google; il link da solo non basta a entrare con un'altra mail.
- **Costi**: tetti di dimensione, contatore di quota già esistente, statistiche in cache.
- **Complessità per chi usa**: tre ruoli, una riga ciascuno nella guida; l'Evento sparisce per non avere due modi di votare insieme.

## Decisioni

| Decisione | Motivo |
|---|---|
| Spazi di team e API per partner **congelati, non rimossi** | Funzionano e sono provati; costo di tenerli quasi zero grazie al motore condiviso |
| Cerchie = **serate comuni con voto** (non condivisione di schede) | Riusa il motore già collaudato; la privacy del Taccuino personale resta intatta |
| In più: **chiusura del singolo vino** ed **esportazione di statistiche di gruppo** | Richiesta esplicita: vini assaggiati solo da alcuni, medie da portare fuori |
| Ruoli: **Proprietario, Amministratore, Membro** | Bastano e si spiegano in una riga; «Ospite» si aggiunge se serve |
| Voti **anonimi** (solo medie e conteggi) | Nessuno si sente giudicato; rende sicura la condivisione verso l'esterno |
| Inviti **legati alla mail** + link da copiare, senza servizio di posta | Costo zero, nessun DNS; la mail automatica si aggiunge dopo senza cambiare i dati |
| Siti esterni: **prima il widget**, poi (forse) l'API | Serve anche a chi non ha uno sviluppatore; stessa base dati |
| Limiti: **50 persone, 5 cerchie a testa** | Coprono amici, colleghi e una classe dentro il piano gratuito |
| **L'Evento viene ritirato** e la falla si chiude subito (1.9.2) | Un solo modo di votare insieme; sicurezza prima delle novità |
| Chi esce: voti **restano senza nome**, con «Cancella i miei voti» | Medie stabili e diritto alla cancellazione rispettato |

## Domande aperte (rinviate)

- **Lettura delle etichette con il catalogo Vino.com** (prototipo ricevuto: OCR nel browser con Tesseract.js, estrazione di produttore, denominazione, annata, gradazione, vitigni). Vino.com darebbe accesso alle sue etichette in cambio di un link al vino su vino.com come riconoscimento. Da chiarire: in che forma ci danno i dati (archivio, feed o API), le condizioni d'uso per iscritto, come si cita il link, se i dati si possono tenere in cache. Si fa come lavoro a sé, prima o dopo il passo 2.

- **Persone senza account Google**: accettare il limite, o aggiungere un accesso con link via mail (richiede un servizio di posta)? Da decidere al passo 4.
- **Cosa mostra il widget** (solo classifica? anche serate recenti? numero di partecipanti?) e se l'amministratore sceglie i blocchi: da definire al passo 3 guardando un widget di prova.
- **Se il Proprietario sparisce** (account cancellato): promozione automatica dell'amministratore più anziano oppure cerchia «orfana» da chiudere? Propongo la promozione, da confermare al passo 1.
- **Cerchie pubbliche o con link di adesione aperto** (si entra senza invito): per ora no; da rivalutare se serve.
- **Notifiche** (nuova serata, serata chiusa): per ora nessuna; richiedono mail o notifiche push.
- **Dominio proprio** (per mail affidabili e widget con indirizzo del marchio): non necessario ora, utile dal passo 4.
