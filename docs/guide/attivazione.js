/* Guida di attivazione per il partner: dalla richiesta alla messa online. */
const L = require("./lib");
const { stats, cards, table, call, quote, ul, check, code, eyebrow, BASE } = L;
const DOC = "Guida di attivazione";
let n = 1;
const pg = (cls, label, inner) => L.page({ cls, label, doc: DOC, n: ++n, big: true }, inner);

function build() {
  const P = [];
  P.push(L.cover({ titolo: "Attiva l'API<br>e lo spazio di <em>team</em>", sotto: "Guida di attivazione per il partner<br>Richiesta · credenziali · prima prova · messa online", tipo: "Guida di attivazione" }));

  P.push(pg("paper", "In breve", `
    ${eyebrow("01", "In breve")}
    <h1 class="d">Quattro passi, <em>mezza giornata</em></h1>
    <p class="lead">Una guida breve per chi gestisce il sito partner: cosa ci devi mandare, cosa ricevi e come verificare che tutto funzioni prima di andare online.</p>
    <div class="flow" style="grid-template-columns:repeat(4,1fr)">
      <div class="st"><span class="nn">1</span><b>Richiesta</b><span class="d">Ci mandi i dati del tuo sito (elenco nella pagina dopo).</span></div>
      <div class="st"><span class="nn">2</span><b>Attivazione</b><span class="d">Noi creiamo il tuo spazio e ti consegniamo le credenziali, in due invii separati.</span></div>
      <div class="st"><span class="nn">3</span><b>Prova</b><span class="d">Provi la chiave con un comando e apri lo spazio da una pagina di prova.</span></div>
      <div class="st"><span class="nn">4</span><b>Messa online</b><span class="d">Spunti l'elenco di verifica; se serve aggiustiamo domini, colori e lingua.</span></div>
    </div>
    ${stats([["5′", "per l'attivazione<br>da parte nostra"], ["3", "credenziali<br>da custodire"], ["15′", "durata massima<br>di un token"], ["0 €", "il costo<br>del servizio"]])}
    ${table(["Versione di Sorso", "Indirizzo", "Per i dettagli tecnici"], [[`${L.VERSIONE} — ${L.DATA}`, `<code>${BASE}</code>`, "La guida all'integrazione API"]], [0])}
  `));

  P.push(pg("paper", "Passo 1 — la richiesta", `
    ${eyebrow("02", "Passo 1 — cosa ci devi mandare")}
    <h1 class="d">Pochi dati, <em>tutti chiari</em></h1>
    ${table(["Dato", "Esempio e note"], [
      ["Nome del sito o del club", "«Enoteca Ruggeri». Compare come titolo in alto nello spazio."],
      ["Domini che incorporeranno lo spazio", "Con <code>https://</code>, senza percorso: <code>https://www.enotecaruggeri.example</code>. Se hai un sito di prova e uno vero, mandaci entrambi. Da qualunque altro dominio il browser blocca la pagina."],
      ["Lingua", "Italiano, inglese, o scelta per utente (nel token)."],
      ["Logo e colori", "Indirizzo <code>https</code> di un'immagine; colore d'accento, sfondo e testo in formato <code>#rrggbb</code>. Se il testo non fosse leggibile, i colori vengono corretti."],
      ["Modalità di voto", "Voto rapido, scheda completa o entrambe, e quale proporre per prima. Utente per utente, col claim facoltativo <code>mode</code> (<code>smart</code> o <code>full</code>)."],
      ["Ruoli e gruppi", "Chi è organizzatore sul tuo sito e come raggruppi le persone: stesso <code>team</code> = stesse degustazioni."],
      ["Chi riceve le credenziali", "Un riferimento tecnico, con un canale sicuro (non l'email in chiaro)."]], [0, 1])}
    ${quote("«Se hai un sito di prova, mandaci anche quello: così provi tutto prima di toccare il sito vero.»")}
  `));

  P.push(pg("ink", "Passo 2 — le credenziali", `
    ${eyebrow("03", "Passo 2 — cosa ricevi")}
    <h1 class="d">Tre credenziali, <em>una volta sola</em></h1>
    ${table(["Credenziale", "A cosa serve", "Dove tenerla"], [
      ["ID partner<br><code>enoteca-ruggeri</code>", "Identifica il tuo sito: va nell'indirizzo dell'iframe e nel claim <code>iss</code> del token.", "Non è segreto."],
      ["Segreto di firma<br>64 caratteri", "Con questo il <b>tuo server</b> firma il token di ogni utente (HS256).", "Solo sul server, in una variabile d'ambiente. Mai nel browser, mai nel codice."],
      ["Chiave API<br><code>sk_…</code>", "Legge i risultati dal tuo server (sola lettura).", "Solo sul server. Se pensi sia stata esposta, chiedi subito la rotazione (vale entro 60 secondi)."]], [0, 1, 2])}
    ${call("<b>Ti vengono mostrati una volta sola</b> e li ricevi in due invii separati. Conservali subito in un gestore di segreti. Se li perdi non si possono rileggere: se ne genera una coppia nuova.", true)}
    <div class="cards3" style="margin-top:5mm"><div class="card"><h4>Rotazione</h4><p>Puoi chiedere in qualsiasi momento un nuovo segreto o una nuova chiave: la vecchia smette di valere entro un minuto.</p></div><div class="card"><h4>Sospensione</h4><p>Se serve, lo spazio si può sospendere e riattivare senza perdere i dati.</p></div><div class="card"><h4>Nuovi domini</h4><p>Un nuovo dominio, un cambio di colori o di lingua: ci scrivi e lo aggiorniamo.</p></div></div>
  `));

  P.push(pg("paper", "Passo 3 — la prova", `
    ${eyebrow("04", "Passo 3 — prova in cinque minuti")}
    <h1 class="d">Prima la chiave, <em>poi lo spazio</em></h1>
    <h3 class="k">Prova A — la chiave API</h3>
    <p>Da un terminale del tuo server (sostituisci la chiave):</p>
    ${code("curl -sS -H 'Authorization: Bearer sk_ID_PARTNER_…' \\\n  " + BASE + "/api/v1/tastings", "shell")}
    <p>Se è tutto a posto la risposta è un elenco, all'inizio vuoto: <code>{"tastings":[]}</code>. Con <code>401</code> la chiave non è giusta o è stata ruotata.</p>
    <h3 class="k">Prova B — lo spazio di team</h3>
    <p>Firma un token con uno degli esempi della guida all'integrazione (Node, Python o PHP) e apri questa pagina in un iframe del tuo sito di prova. Il token va <b>dopo il #</b>:</p>
    ${code(BASE + "/embed?p=ID_PARTNER#token=TOKEN_FIRMATO", "indirizzo", false)}
    <p>Un utente con <code>role: "organizer"</code> vede «Nuova degustazione»; uno con <code>member</code> no. Il token è monouso e dura al massimo 15 minuti: generane uno nuovo a ogni caricamento della pagina.</p>
    <h2 class="s">Se qualcosa <em>non va</em></h2>
    ${table(["Cosa vedi", "Causa probabile", "Cosa fare"], [
      ["Iframe vuoto o errore del browser", "Il dominio della pagina non è tra quelli registrati.", "Mandaci il dominio esatto."],
      ["«L'accesso non è valido o è scaduto»", "Firma sbagliata, token scaduto o campi mancanti.", "Controlla <code>iss</code>, <code>sub</code>, <code>team</code>, <code>jti</code>, <code>exp</code>."],
      ["«Questo accesso è già stato usato»", "Lo stesso token è arrivato due volte (cache, anteprima).", "Un token nuovo a ogni caricamento; niente cache."],
      ["401 dall'API", "Chiave sbagliata o ruotata.", "Verifica la chiave o chiedine una nuova."]], [0, 1, 2])}
  `));

  P.push(pg("ink", "Passo 4 — la messa online", `
    ${eyebrow("05", "Passo 4 — prima di andare online")}
    <h1 class="d">Spunta ogni voce <em>con una prova vera</em></h1>
    ${check([
      "ID partner, segreto e chiave sono salvati solo sul server.",
      "L'iframe si apre dai tuoi domini e viene bloccato da altri.",
      "Il token è generato a ogni caricamento e la pagina non è in cache.",
      "Un partecipante vota e vede la media del team solo dopo.",
      "Un organizzatore crea una degustazione, aggiunge vini e la chiude.",
      "La lettura dei risultati dal server funziona (JSON e CSV).",
      "Sai chi, da te, gestisce le richieste di cancellazione dei dati degli utenti.",
      "Scarichi il CSV dei risultati al termine di ogni degustazione: il servizio è gratuito e non ha garanzia di continuità."])}
    ${call("<b>Dopo l'attivazione</b> puoi chiederci in qualsiasi momento un nuovo dominio, un cambio di colori o lingua, la rotazione delle credenziali o la sospensione dello spazio. Tutti i dettagli tecnici sono nella <b>guida all'integrazione</b>.")}
    <div class="bigword">Si parte.</div>
    <p class="mute">Versione ${L.VERSIONE} · ultimo aggiornamento: ${L.DATA}</p>
  `));
  return L.documento("Sorso — Guida di attivazione", P);
}
module.exports = { build };
