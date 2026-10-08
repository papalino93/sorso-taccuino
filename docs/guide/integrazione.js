/* Guida all'integrazione API — per chi sviluppa il sito partner. */
const L = require("./lib");
const R = require("../esempi/risposte.json");
const { phone, fig, stats, cards, table, call, quote, ul, check, code, esempio, eyebrow, anat, BASE } = L;
const DOC = "Guida all'integrazione";
let n = 1;
const BIG = ["Sicurezza e privacy", "Prima di andare online"];
const pg = (cls, label, inner) => L.page({ cls, label, doc: DOC, n: ++n, big: BIG.includes(label) }, inner);
const rot = (file, deg, extra = "") => `<div style="transform:rotate(${deg}deg);${extra}">${phone(file)}</div>`;

function build() {
  const P = [];
  P.push(L.cover({ titolo: "Lo spazio di <em>team</em>,<br>nel tuo sito", sotto: "Guida all'integrazione API<br>Token firmato · iframe · risultati in sola lettura", tipo: "Guida per chi sviluppa il sito partner" }));

  /* 01 In breve */
  P.push(pg("paper", "In breve", `
    ${eyebrow("01", "In breve")}
    <div style="display:grid;grid-template-columns:92mm 1fr;gap:6mm;height:118mm">
      <div><h1 class="d">Una degustazione che <em>vive</em> nel tuo sito</h1>
      <p class="lead">I tuoi utenti votano insieme i vini di una serata, ognuno vede i propri voti e, solo dopo aver votato, la media del team. Tu incorpori una pagina e firmi un token: al resto pensa Sorso.</p></div>
      <div style="position:relative">
        <div style="position:absolute;left:-2mm;top:16mm">${rot("team-base-2-vini.png", -5).replace('class="phone "','class="phone sm"')}</div>
        <div style="position:absolute;left:34mm;top:0">${rot("team-vinaccia-2-vini.png", 4).replace('class="phone "','class="phone sm"')}</div>
      </div>
    </div>
    ${stats([["1", "iframe da<br>incorporare"], ["1", "token da firmare<br>sul tuo server"], ["50–100", "la scala<br>dei voti"], ["0 €", "il costo<br>del servizio"]])}
    ${cards([["Per i tuoi utenti", "Una pagina elegante e veloce, nei colori del tuo sito: si vota in pochi tocchi, anche dal telefono."], ["Per chi organizza", "Si crea la serata, si aggiungono i vini, si chiude quando è finita: tutto dentro l'iframe."], ["Sotto il tuo controllo", "Accessi, ruoli e gruppi li decidi tu, firmando il token. I risultati li leggi dal tuo server."]])}
  `));

  /* 02 Quello che vedono */
  P.push(pg("ink", "Per i tuoi utenti", `
    ${eyebrow("02", "Quello che vedono gli utenti")}
    <h1 class="d">Chiaro, veloce, <em>a misura di telefono</em></h1>
    <p class="lead" style="max-width:130mm">Dall'elenco delle serate al voto: pochi gesti, numeri grandi, niente da imparare.</p>
    <div class="phones" style="margin-top:7mm">
      ${fig("team-bosco-2-vini.png", 1, "<b>Con i colori del tuo sito</b>: qui un tema scuro e verde.")}
      ${fig("team-base-2-vini.png", 2, "<b>I vini</b>, con il tuo voto e la media del team dopo aver votato.", "lg")}
      ${fig("team-base-3-voto-rapido.png", 3, "<b>Il voto rapido</b>: occhio, naso e bocca da 50 a 100.")}
    </div>
    ${quote("«Prima di votare la media resta nascosta: nessuno è influenzato dal voto degli altri.»")}
  `));

  /* 03 Come funziona */
  P.push(pg("paper", "Come funziona", `
    ${eyebrow("03", "Come funziona")}
    <h1 class="d">Cinque passaggi, <em>un solo token</em></h1>
    <p class="lead">Il tuo sito resta il padrone di casa: decide chi entra, in quale gruppo e con quale ruolo.</p>
    <div class="flow">
      <div class="st"><span class="nn">1</span><b>L'utente apre la pagina</b><span class="d">È già autenticato sul tuo sito.</span></div>
      <div class="st"><span class="nn">2</span><b>Il tuo server firma il token</b><span class="d">Chi è, che gruppo, che ruolo. Vale 5 minuti.</span></div>
      <div class="st"><span class="nn">3</span><b>La pagina incorpora l'iframe</b><span class="d">Il token sta dopo il <code>#</code>: non viaggia in rete.</span></div>
      <div class="st"><span class="nn">4</span><b>Sorso lo verifica</b><span class="d">Apre una sessione di 4 ore, in memoria.</span></div>
      <div class="st"><span class="nn">5</span><b>Tu leggi i risultati</b><span class="d">Dal tuo server, con la chiave API.</span></div>
    </div>
    <h2 class="s">Cosa vive <em>dove</em></h2>
    ${table(["Cosa", "Dove", "Note"], [
      ["Utenti, password, accessi", "Il tuo sito", "Sorso non conosce nessuna password."],
      ["Gruppi (team) e ruoli", "Il tuo token", "Li decidi tu a ogni caricamento."],
      ["Degustazioni, vini, voti", "Sorso", "Visibili solo al team; i voti individuali solo a chi li ha dati."],
      ["Medie e risultati", "Sorso → il tuo server", "API di sola lettura, solo aggregati."],
      ["Aspetto (colori, logo, titolo)", "Sorso, impostato per te", "Lo cambiamo noi su tua richiesta."]], [2]) }
    ${call("<b>Nessuna scrittura dall'esterno.</b> Dall'API non si possono scrivere voti: si vota solo dentro l'iframe. Così nessuno può gonfiare una media dal di fuori.")}
    <h2 class="s">Cosa Sorso <em>non</em> fa</h2>
    ${cards([["Non conosce le password", "L'accesso lo gestisce solo il tuo sito: a Sorso arriva un token firmato, mai una credenziale."], ["Non conserva anagrafiche", "Niente email, telefono o indirizzo: solo un identificativo opaco e i voti."], ["Non mostra i voti altrui", "Ognuno vede i propri; la media del team compare solo dopo aver votato quel vino."]])}
  `));

  /* 04 Credenziali */
  P.push(pg("paper", "Prima di cominciare", `
    ${eyebrow("04", "Prima di cominciare")}
    <h1 class="d">Tre credenziali e <em>i tuoi domini</em></h1>
    <p class="lead">Te le consegniamo noi dopo la richiesta di attivazione. Il segreto e la chiave ti vengono mostrati <b>una volta sola</b>.</p>
    ${table(["Credenziale", "A cosa serve", "Dove tenerla"], [
      ["ID partner<br><code>enoteca-ruggeri</code>", "Identifica il tuo sito: va nell'indirizzo dell'iframe e nel claim <code>iss</code> del token.", "Non è segreto."],
      ["Segreto di firma<br><span class='mute'>64 caratteri</span>", "Con questo il <b>tuo server</b> firma il token di ogni utente (HS256).", "Solo sul server, in una variabile d'ambiente."],
      ["Chiave API<br><code>sk_…</code>", "Legge i risultati dal tuo server (sola lettura).", "Solo sul server. Se è esposta, chiedi subito la rotazione (vale entro 60 secondi)."],
      ["Domini autorizzati", "I siti da cui si può incorporare lo spazio, con <code>https://</code> e senza percorso.", "Da qualunque altro dominio il browser blocca la pagina."]], [1, 2])}
    ${call("<b>Mai nel browser.</b> Il segreto e la chiave non devono comparire nel codice della pagina, nei log o in un repository. Se li perdi non si possono rileggere: si genera una coppia nuova.", true)}
    <h2 class="s">Variabili d'ambiente <em>consigliate</em></h2>
    ${code("SORSO_BASE=" + BASE + "\nSORSO_PARTNER_ID=enoteca-ruggeri\nSORSO_SECRET=…il segreto di firma…\nSORSO_API_KEY=sk_enoteca-ruggeri_…", "server")}
    <h2 class="s">Come ottenere <em>l'attivazione</em></h2>
    <div class="flow" style="grid-template-columns:repeat(4,1fr)">
      <div class="st" style="min-height:44mm"><span class="nn">1</span><b>Ci scrivi</b><span class="d">Nome del club, domini, lingua, logo e colori, modalità di voto, come raggruppi gli utenti.</span></div>
      <div class="st" style="min-height:44mm"><span class="nn">2</span><b>Attiviamo</b><span class="d">Crea lo spazio in pochi minuti e imposta aspetto e domini.</span></div>
      <div class="st" style="min-height:44mm"><span class="nn">3</span><b>Ricevi le credenziali</b><span class="d">ID partner, segreto e chiave API, in due invii separati.</span></div>
      <div class="st" style="min-height:44mm"><span class="nn">4</span><b>Provi e vai online</b><span class="d">Con la checklist in fondo a questa guida.</span></div>
    </div>
    ${quote("«Dopo la richiesta, l'attivazione richiede pochi minuti: il tempo vero è quello dell'integrazione nel tuo sito.»")}
  `));

  /* 05 Token */
  P.push(pg("paper", "Passo 1 — il token", `
    ${eyebrow("05", "Passo 1 — il token")}
    <h1 class="d">Firma il token <em>sul tuo server</em></h1>
    <p>Un JWT firmato con HS256 (HMAC-SHA256), generato a ogni caricamento della pagina per l'utente che sta entrando.</p>
    ${table(["Campo", "Richiesto", "Significato e regole"], [
      ["<code>iss</code>", "sì", "Il tuo ID partner."],
      ["<code>sub</code>", "sì", "L'identificativo dell'utente nel tuo sito: 1–128 caratteri tra lettere, cifre e <code>. _ : @ -</code>. Meglio un id opaco che un'email."],
      ["<code>team</code>", "sì", "Il gruppo: chi ha lo stesso team vede le stesse degustazioni. 1–64 caratteri tra lettere, cifre e <code>. _ : -</code>."],
      ["<code>jti</code>", "sì", "Identificativo unico del token (8–64 caratteri): lo rende monouso. Un valore nuovo a ogni token."],
      ["<code>exp</code>", "sì", "Scadenza in secondi Unix, al massimo 15 minuti da adesso. Consigliati 5."],
      ["<code>role</code>", "no", "<code>member</code> (predefinito) oppure <code>organizer</code>."],
      ["<code>name</code>", "no", "Il nome da mostrare (fino a 60 caratteri). Non viene salvato."],
      ["<code>lang</code>", "no", "<code>it</code> oppure <code>en</code>. Se manca vale la lingua del partner."],
      ["<code>mode</code>", "no", "La modalità con cui si apre la scheda di <b>questo utente</b>: <code>smart</code> (voto rapido) o <code>full</code> (scheda completa). Deve essere tra quelle abilitate per il tuo partner, altrimenti è ignorata."]], [2])}
    ${call("<b>Regole da rispettare.</b> Solo HS256 (qualunque altro algoritmo, compreso <code>none</code>, è rifiutato). Il token vale <b>una volta sola</b>: generalo a ogni costruzione della pagina e non metterlo in cache. Tieni l'orologio del server sincronizzato.")}
    <h2 class="s">Com'è fatto <em>un token</em></h2>
    ${anat()}
  `));
  const pagCodice = (titolo, em, file, tag, testo, prova) => pg("paper", "Passo 1 — il token", `
    ${eyebrow("05", "Passo 1 — esempio in " + titolo)}
    <h1 class="d" style="font-size:28pt">${titolo}, <em>${em}</em></h1>
    <p>${testo}</p>
    ${esempio(file, tag).replace('class="code"', 'class="code big"')}
    <h3 class="k">Prova da terminale</h3>
    ${code(prova, "shell")}
    ${call("Il token stampato si può incollare dopo il <code>#</code> dell'indirizzo dell'iframe (passo 2). Genera un token nuovo a ogni prova: ognuno si usa una volta sola.")}
  `);
  P.push(pagCodice("Node.js", "senza librerie", "firma-token.js", "Node.js", "Usa solo il modulo <code>crypto</code> di Node: nessuna dipendenza da installare. Metti la funzione nel codice che costruisce la pagina del tuo sito.", "SORSO_PARTNER_ID=enoteca-ruggeri SORSO_SECRET=…il segreto… \\\n  node firma-token.js utente-42 giovedi organizer \"Anna Rossi\""));
  P.push(pagCodice("Python", "solo libreria standard", "firma-token.py", "Python", "Funziona con Python 3 e la sola libreria standard. Il segreto va letto da una variabile d'ambiente, mai scritto nel codice.", "SORSO_PARTNER_ID=enoteca-ruggeri SORSO_SECRET=…il segreto… \\\n  python3 firma-token.py utente-42 giovedi organizer \"Anna Rossi\""));
  P.push(pagCodice("PHP", "nessuna libreria", "firma-token.php", "PHP", "Richiede PHP 7.4 o successivo e nessuna libreria. Da eseguire sul server, mai nel browser dell'utente.", "SORSO_PARTNER_ID=enoteca-ruggeri SORSO_SECRET=…il segreto… \\\n  php firma-token.php utente-42 giovedi organizer \"Anna Rossi\""));

  /* 06 Incorporare */
  P.push(pg("ink", "Passo 2 — incorporare", `
    ${eyebrow("06", "Passo 2 — incorporare lo spazio")}
    <h1 class="d">Un iframe, <em>il token dopo il #</em></h1>
    <p class="lead">L'indirizzo ha questa forma. Il frammento (dopo il <code>#</code>) non viene mai inviato a nessun server: niente token nei log, niente token nell'intestazione Referer.</p>
    ${code(BASE + "/embed?p=ID_PARTNER#token=TOKEN_FIRMATO", "indirizzo", false)}
    ${esempio("pagina-ospite.html", "HTML")}
    <div class="two">
      <div><h3 class="k">Cosa succede dentro l'iframe</h3>${ul(["Sorso scambia il token con una <b>sessione di 4 ore</b>, in memoria, e poi toglie il token dall'indirizzo.", "Se la sessione finisce, l'iframe chiede al tuo sito un token nuovo con <code>sorso:reauth</code>: l'utente rientra da solo e il voto che stava compilando non va perso.", "Il tasto Indietro del browser resta dentro lo spazio."])}</div>
      <div><h3 class="k">Messaggi verso la tua pagina</h3>${table(["Messaggio", "Quando"], [["<code>sorso:height</code>", "L'altezza del contenuto, per adattare l'iframe senza barre di scorrimento."], ["<code>sorso:reauth</code>", "L'accesso non è più valido: serve un token nuovo."]], [1])}<p class="mute" style="font-size:8pt">Controlla sempre <code>event.origin</code> prima di fidarti di un messaggio.</p></div>
    </div>
  `));

  /* 07 Ruoli */
  P.push(pg("paper", "Ruoli e team", `
    ${eyebrow("07", "Ruoli, team e visibilità")}
    <div style="display:grid;grid-template-columns:1fr 70mm;gap:8mm">
      <div>
        <h1 class="d">Il ruolo lo decidi <em>tu</em></h1>
        <p>Sorso non ha schermate di amministrazione né inviti: se un utente è organizzatore lo dice il tuo sito, nel claim <code>role</code>.</p>
        ${table(["Azione", "Partecipante", "Organizzatore"], [
          ["Vedere le degustazioni del team", "sì", "sì"],
          ["Creare ed eliminare una degustazione", "no", "sì"],
          ["Aggiungere vini", "no", "sì"],
          ["Chiudere o riaprire", "no", "sì"],
          ["Votare (anche più volte: l'ultimo vale)", "sì", "sì"],
          ["Vedere la media del team", "dopo aver votato quel vino", "dopo aver votato quel vino"],
          ["Vedere quanti hanno votato", "solo dopo aver votato", "sempre"]], [1, 2])}
      </div>
      ${fig("team-base-8-org-degustazione.png", "★", "Lo stesso vino visto da un <b>organizzatore</b>.")}
    </div>
    ${ul(["<b>Degustazione chiusa:</b> i voti sono definitivi; nessuno può più votare né aggiungere vini. L'organizzatore può riaprirla.", "<b>Team separati:</b> un team non vede mai le degustazioni di un altro. Lo stesso <code>sub</code> in due team ha dati separati.", "<b>Limiti:</b> 200 degustazioni per team e 100 vini per degustazione; nomi fino a 80 (serata) e 100 (vino) caratteri; note personali fino a 500."])}
  `));

  /* 08 Voti */
  P.push(pg("paper", "Voti e punteggi", `
    ${eyebrow("08", "Voti e punteggi")}
    <h1 class="d">Da 50 a 100, <em>sempre</em></h1>
    <p class="lead">Un vino non prende mai 30, e quasi mai 100. Due modalità, stessa scala: la media le mescola correttamente.</p>
    <div class="scale"><div><span class="v">50</span><span class="t">insufficiente</span></div><div><span class="v">60</span><span class="t">sufficiente</span></div><div><span class="v">70</span><span class="t">discreto</span></div><div><span class="v">80</span><span class="t">buono</span></div><div><span class="v">90</span><span class="t">eccellente</span></div><div class="top"><span class="v">96–100</span><span class="t">eccezionale · irripetibile</span></div></div>
    <div class="two" style="margin-top:5mm">
      <div>
        <h2 class="s" style="margin-top:0">Voto <em>rapido</em></h2>
        <p>Tre giudizi da 50 a 100: occhio (peso 10%), naso (30%), bocca (60%). Veloce, senza descrivere il vino.</p>
        <h2 class="s">Scheda <em>completa</em></h2>
        <p>Nove giudizi da 0 a 10 sulle quattro fasi (visivo 10%, olfattivo 30%, gusto-olfattivo 40%, finale 20%). Ogni fase segue una curva e il totale è la media pesata delle fasi.</p>
        ${ul(["Il punteggio lo calcola sempre il server: quello mostrato mentre si vota è un'anteprima.", "Il <b>100</b> si dà solo se ogni giudizio è al massimo.", "Ogni numero finale segue l'arrotondamento classico: da 5 in su si sale."])}
        ${call("<b>Modalità iniziale.</b> Il partner sceglie quali modalità consentire e quale proporre per prima. Con il claim <code>mode</code> puoi deciderla utente per utente; l'utente può comunque cambiarla voto per voto.")}
      </div>
      <div class="phones" style="gap:3mm">${fig("team-base-3-voto-rapido.png", 1, "Voto rapido.", "sm")}${fig("team-base-4-scheda-completa.png", 2, "Scheda completa.", "sm")}</div>
    </div>
  `));

  /* 09 Personalizzazione */
  P.push(pg("ink", "Personalizzazione", `
    ${eyebrow("09", "Personalizzazione")}
    <h1 class="d">Nei <em>tuoi</em> colori</h1>
    <p class="lead" style="max-width:130mm">Con pochi valori lo spazio prende il tono del tuo sito. Li impostiamo noi, su tua richiesta.</p>
    <div class="phones" style="margin:5mm 0">
      ${fig("team-base-2-vini.png", 1, "<b>Tema di base</b>: nessuna scelta.", "sm")}
      ${fig("team-vinaccia-2-vini.png", 2, "<b>Enoteca Ruggeri</b>: accento vinaccia, sfondo carta, carattere con grazie.", "sm")}
      ${fig("team-bosco-2-vini.png", 3, "<b>Club del Bosco</b>: accento verde, sfondo scuro, carattere arrotondato.", "sm")}
    </div>
    ${table(["Impostazione", "Valori", "Effetto"], [
      ["<code>title</code>", "testo, fino a 40 caratteri", "Titolo in alto."],
      ["<code>logo</code>", "indirizzo <code>https</code> di un'immagine", "Logo in alto, alto 28 px."],
      ["<code>accent</code>", "colore <code>#rrggbb</code>", "Pulsanti, selezioni, media del team, voti dal 96."],
      ["<code>bg</code> · <code>ink</code>", "colori <code>#rrggbb</code>", "Sfondo e testo."],
      ["<code>font</code>", "sistema, serif, arrotondato, mono", "Carattere (solo tra quelli di sistema)."],
      ["lingua · modalità", "it/en · rapido/completa/entrambe", "Lingua predefinita e modalità consentite."]], [2])}
    ${call("<b>Leggibilità garantita.</b> Se i colori scelti non assicurano un testo leggibile (contrasto almeno 4,5 a 1), Sorso li corregge o torna a quelli predefiniti, anche sui riquadri e sui bordi dei campi. Imposta sempre insieme sfondo e testo.")}
  `));

  /* 10 API */
  P.push(pg("paper", "API di lettura", `
    ${eyebrow("10", "API di sola lettura")}
    <h1 class="d">I risultati, <em>dal tuo server</em></h1>
    <p>Tutte le richieste vanno fatte <b>dal server</b>, mai dal browser: la chiave non deve uscire dal tuo sistema.</p>
    ${table(["Cosa", "Valore"], [["Indirizzo di base", `<code>${BASE}/api/v1</code>`], ["Autenticazione", "<code>Authorization: Bearer sk_ID_PARTNER_…</code>"], ["Formato", "JSON UTF-8. Ogni risposta porta <code>X-Sorso-Api-Version: 1</code> e <code>Cache-Control: no-store</code>."], ["Dati", "Solo aggregati: mai chi ha votato cosa."]], [1])}
    <h2 class="s">Elenco delle <em>degustazioni</em></h2>
    ${code("GET /api/v1/tastings?team=giovedi&status=closed\n\n" + JSON.stringify(R.tastings, null, 2), "GET")}
    <p class="mute" style="font-size:8pt">I filtri <code>team</code> e <code>status</code> (<code>open</code> o <code>closed</code>) sono facoltativi. Con tanti team conviene sempre filtrare per team.</p>
    <h2 class="s">Risultati di una <em>degustazione</em></h2>
    ${code("GET /api/v1/tastings/{id}/results\n\n" + JSON.stringify(R.results, null, 2).split("\n").slice(0, 15).join("\n") + "\n  …", "GET")}
  `));
  P.push(pg("paper", "API di lettura", `
    ${eyebrow("10", "API di sola lettura")}
    <h2 class="s" style="margin-top:0">Come leggere <em>i risultati</em></h2>
    ${ul(["<code>votes</code> è il numero di voti; <code>average</code> la media del team, con un decimale.", "La media compare <b>dal secondo voto</b> (<code>minVotes</code> = 2): con un voto solo coinciderebbe con quello di una persona. Finché mancano voti, <code>average</code> è <code>null</code> e <code>hidden</code> è <code>true</code>.", "Voti rapidi e schede complete sono sulla stessa scala 50–100: la media li mescola correttamente."])}
    ${call("<b>Un limite di ogni media.</b> In un gruppo molto piccolo (2–3 persone), chi vede la media prima e dopo un nuovo voto può dedurre quel voto. Se per te è un problema, mostra i risultati solo a degustazione chiusa.")}
    <h2 class="s">Esportazione in <em>CSV</em></h2>
    ${code("GET /api/v1/tastings/{id}/results?format=csv\n\n" + R.csv.replace(/\r\n/g, "\n").trimEnd(), "CSV")}
    <p class="mute" style="font-size:8pt">Le celle che iniziano con <code>= + - @</code> vengono precedute da un apice: un nome di vino non può essere eseguito come formula.</p>
    <h2 class="s">Cancellare i dati di <em>un utente</em></h2>
    ${code("DELETE /api/v1/users/{sub}\n\n" + JSON.stringify({ votesRemoved: 2 }, null, 2), "DELETE")}
    <p>Rimuove tutti i voti dell'utente (il <code>sub</code> del token) e aggiorna le medie. Pensato per le richieste di cancellazione; si può ripetere senza effetti e funziona sempre, anche quando il servizio è in sola lettura.</p>
    <h2 class="s">Provalo in <em>un minuto</em></h2>
    <p>Dal terminale del tuo server, con la chiave API. Se ricevi un elenco (anche vuoto) la chiave funziona; con <code>401</code> è sbagliata o è stata ruotata.</p>
    ${code("curl -sS -H 'Authorization: Bearer sk_ID_PARTNER_…' \\\n  " + BASE + "/api/v1/tastings", "shell")}
  `));
  P.push(pg("paper", "API di lettura", `
    ${eyebrow("10", "API di sola lettura — esempi")}
    <h1 class="d" style="font-size:28pt">Quattro comandi, <em>copia e incolla</em></h1>
    ${esempio("api.sh", "shell").replace('class="code"', 'class="code big"')}
    ${call("Esegui sempre queste chiamate <b>dal tuo server</b>, mai da una pagina del browser: la chiave API non deve essere visibile a nessuno.")}
  `));

  /* 11 Cosa c'è e cosa no */
  P.push(pg("ink", "Cosa c'è e cosa no", `
    ${eyebrow("11", "App personale e spazio di team")}
    <h1 class="d">Taccuino, Statistiche, Evento, Cieca: <em>dove stanno</em></h1>
    <p class="lead" style="max-width:140mm">Sorso ha due anime. L'app personale (il taccuino di ognuno) e lo spazio di team che incorpori nel tuo sito. L'API serve solo il secondo.</p>
    <div class="phones" style="gap:4mm;margin:4mm 0">
      ${fig("app-taccuino.png", "A", "<b>Taccuino</b>: l'archivio personale.", "sm")}
      ${fig("app-statistiche.png", "B", "<b>Statistiche</b>: il profilo del palato.", "sm")}
      ${fig("app-cieca.png", "C", "<b>Alla cieca</b>: si prova a indovinare.", "sm")}
      ${fig("app-evento.png", "D", "<b>Evento</b>: la classifica di una serata.", "sm")}
    </div>
    ${table(["Nell'app personale", "Nello spazio di team e nell'API"], [
      ["<b>Taccuino</b> — l'archivio privato di ogni scheda, con foto, uvaggio, descrittori e note.", "Non c'è un archivio personale: ogni utente ritrova le <b>proprie degustazioni di team</b> e, su ogni vino, il proprio voto (punteggio, modalità, note). Le schede si compilano solo dentro l'app."],
      ["<b>Statistiche</b> — medie, radar delle fasi, prezzo, andamento nel tempo.", "Nessuna statistica personale. L'API dà, per ogni vino di una degustazione, <b>numero di voti e media del team</b> (e il CSV)."],
      ["<b>Evento</b> — classifica di gruppo di una serata.", "È la <b>degustazione</b>: la crea l'organizzatore, il team vota, la media compare dopo il voto, si chiude e i voti sono definitivi."],
      ["<b>Alla cieca</b> — si assaggia senza etichetta e poi si svela.", "Non disponibile: i vini di una degustazione sono visibili a tutti fin dall'inizio."]], [0, 1])}
    ${call("Se per il tuo club servono anche le statistiche del team, la modalità alla cieca o un archivio personale dentro l'iframe, scrivici: sono estensioni possibili, non ancora incluse.")}
  `));

  /* 12 Errori e limiti */
  P.push(pg("paper", "Errori e limiti", `
    ${eyebrow("12", "Errori e limiti")}
    <h1 class="d">Se qualcosa <em>non va</em></h1>
    ${table(["Cosa vedi", "Causa probabile", "Cosa fare"], [
      ["Iframe vuoto o errore del browser", "Il dominio della pagina non è tra quelli registrati («Refused to frame»).", "Comunicaci il dominio esatto, con <code>https://</code>."],
      ["«L'accesso non è valido o è scaduto»", "Token con firma sbagliata, scaduto o con campi non validi.", "Controlla <code>iss</code>, <code>sub</code>, <code>team</code>, <code>jti</code>, <code>exp</code> e il segreto."],
      ["«Questo accesso è già stato usato»", "Lo stesso token è arrivato due volte (pagina in cache, anteprima automatica).", "Un token nuovo a ogni caricamento; niente cache."],
      ["«Devi rientrare»", "Sessione di 4 ore finita.", "Rispondi a <code>sorso:reauth</code> con un token nuovo."],
      ["Un utente non vede le serate degli altri", "Valori diversi nel claim <code>team</code>.", "Stesso <code>team</code> per chi sta insieme."],
      ["Manca «Nuova degustazione»", "L'utente è <code>member</code>.", "<code>role: \"organizer\"</code> nel token."]], [0, 1, 2])}
    <h2 class="s">I codici <em>dell'API</em></h2>
    ${table(["HTTP", "Codice", "Significato"], [
      ["401", "<code>unauthorized</code>", "Chiave mancante o non valida."],
      ["404", "<code>not_found</code>", "Degustazione o percorso inesistente (anche di un altro partner)."],
      ["405", "<code>method_not_allowed</code>", "Metodo non previsto per quel percorso."],
      ["429", "<code>rate_limited</code>", "Troppe richieste: <code>Retry-After</code> dice quando riprovare."],
      ["503", "<code>read_only</code>", "Sola lettura per il limite mensile: le letture e la cancellazione dati funzionano."]], [1])}
    <h2 class="s">Limiti e <em>disponibilità</em></h2>
    ${table(["Cosa", "Limite"], [["Aperture di sessione (<code>/embed</code>)", "200 al minuto per indirizzo IP"], ["Operazioni di un utente nell'iframe", "90 al minuto per utente"], ["API di sola lettura", "120 richieste al minuto per chiave e per indirizzo IP"], ["Sessione dell'iframe · token", "4 ore · al massimo 15 minuti, monouso"]], [0])}
    <p class="mute" style="font-size:8pt">Servizio gratuito, senza garanzia di continuità: scarica il CSV al termine di ogni serata. All'80% dell'uso mensile le risposte portano <code>X-Sorso-Quota: warn</code>; oltre il 90% lo spazio passa in sola lettura fino al mese dopo.</p>
  `));

  /* 13 Sicurezza e privacy */
  P.push(pg("paper", "Sicurezza e privacy", `
    ${eyebrow("13", "Sicurezza e privacy")}
    <h1 class="d">Pochi dati, <em>ben custoditi</em></h1>
    <div class="two">
      <div><h3 class="k">Cosa devi fare tu</h3>${ul(["Tieni segreto di firma e chiave API solo sul server; se li esponi, chiedi la rotazione.", "Firma token solo per utenti già autenticati; team e ruolo vengono dai tuoi dati, mai da parametri della richiesta.", "Usa come <code>sub</code> un identificativo opaco invece dell'email.", "Servi la pagina che incorpora l'iframe sempre in <code>https</code>."])}</div>
      <div><h3 class="k">Cosa fa Sorso</h3>${ul(["La pagina si incorpora solo dai domini registrati, senza script inline e senza inviare il riferimento di provenienza.", "Il punteggio lo calcola il server; i voti individuali sono visibili solo a chi li ha dati.", "Chi ha il token non esce dal proprio team né dal proprio partner: ogni richiesta lo verifica."])}</div>
    </div>
    <h2 class="s">Quali dati <em>conserviamo</em></h2>
    ${table(["Dato", "Conservato", "Note"], [
      ["Identificativo utente (<code>sub</code>)", "sì", "Serve a collegare l'utente ai suoi voti. Nessun'altra anagrafica."],
      ["Team, nomi di degustazioni e vini", "sì", "Inseriti dagli organizzatori."],
      ["Voti, con modalità e giudizi", "sì", "Visibili solo all'autore; l'API espone solo le medie."],
      ["Note personali sui vini", "sì", "Visibili solo all'autore."],
      ["Nome visualizzato (<code>name</code>)", "no", "Resta nella sessione in memoria."],
      ["Email, telefono, indirizzo IP", "no", "L'IP serve solo al limite di richieste, in un contatore temporaneo."]], [2])}
    ${ul(["I dati restano finché non vengono cancellati. Per cancellare un utente: <code>DELETE /api/v1/users/{sub}</code>.", "Chi gestisce il servizio ha accesso tecnico al database. Per informativa e basi giuridiche valgono le valutazioni del tuo sito."])}
  `));

  /* 14 Checklist */
  P.push(pg("ink", "Prima di andare online", `
    ${eyebrow("14", "Prima di andare online")}
    <h1 class="d">Spunta ogni voce <em>con una prova vera</em></h1>
    <p class="lead">Non a memoria: apri la pagina, vota, guarda i risultati. Per qualunque dubbio o richiesta (dominio, colori, rotazione dei segreti, cancellazioni) scrivici.</p>
    ${check([
      "Ho ricevuto ID partner, segreto e chiave API e li ho salvati solo sul server.",
      "Ho comunicato i domini esatti e l'iframe si apre da quelli; da un dominio non registrato viene bloccato.",
      "Il token è generato a ogni caricamento e la pagina non è in cache.",
      "Un <code>member</code> vota e, solo dopo, vede la media del team.",
      "Un <code>organizer</code> crea una degustazione, aggiunge vini e la chiude.",
      "Due utenti di team diversi non vedono le rispettive degustazioni.",
      "Ricaricando solo l'iframe l'utente rientra (<code>sorso:reauth</code>) o ricarica la pagina.",
      "La lettura dei risultati dal server funziona e il CSV si apre correttamente.",
      "Ho provato la cancellazione di un utente di prova e le medie si sono aggiornate.",
      "Ho deciso chi, da noi, è organizzatore e dove scarichiamo il CSV al termine delle serate.",
      "L'informativa agli utenti del nostro sito è aggiornata."])}
    ${quote("«Il token è monouso e dura pochi minuti: se qualcosa non si apre, quasi sempre è lì.»")}
    <div class="bigword">Pronti.</div>
    <p class="mute">Versione ${L.VERSIONE} della guida · ultimo aggiornamento: ${L.DATA}</p>
  `));
  return L.documento("Sorso — Guida all'integrazione API", P);
}
module.exports = { build };
