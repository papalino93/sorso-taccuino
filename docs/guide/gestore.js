/* Guida all'uso per chi gestisce le degustazioni (l'organizzatore): linguaggio semplice, tante schermate. */
const L = require("./lib");
const { fig, stats, cards, table, call, quote, ul, check, eyebrow, phone } = L;
const DOC = "Guida per chi organizza";
let n = 1;
const pg = (cls, label, inner) => L.page({ cls, label, doc: DOC, n: ++n, big: true }, inner);
const passi = list => `<div class="flow" style="grid-template-columns:repeat(${list.length},1fr)">${list.map(([t, d], i) => `<div class="st" style="min-height:34mm"><span class="nn">${i + 1}</span><b>${t}</b><span class="d">${d}</span></div>`).join("")}</div>`;

function build() {
  const P = [];
  P.push(L.cover({ titolo: "La tua serata<br>di <em>degustazione</em>", sotto: "Guida per chi organizza<br>Creare · votare · chiudere · leggere i risultati", tipo: "Guida all'uso per l'organizzatore" }));

  P.push(pg("paper", "In breve", `
    ${eyebrow("01", "In breve")}
    <div style="display:grid;grid-template-columns:92mm 1fr;gap:6mm;height:118mm">
      <div><h1 class="d">Una serata, <em>un solo posto</em></h1>
      <p class="lead">Crei la degustazione, aggiungi i vini e ognuno vota dal proprio telefono. Niente schede di carta da raccogliere, niente medie da calcolare: la media del gruppo si forma da sola.</p></div>
      <div style="position:relative">
        <div style="position:absolute;left:-2mm;top:16mm;transform:rotate(-5deg)">${phone("team-base-8-org-degustazione.png", "sm")}</div>
        <div style="position:absolute;left:34mm;top:0;transform:rotate(4deg)">${phone("team-base-2-vini.png", "sm")}</div>
      </div>
    </div>
    ${stats([["3", "gesti per<br>cominciare"], ["50–100", "il voto<br>di ognuno"], ["1", "tocco per<br>chiudere"], ["0", "fogli da<br>raccogliere"]])}
    ${cards([["Prima", "Crei la serata e aggiungi i vini in un paio di minuti, anche dal telefono."], ["Durante", "Vedi quante persone hanno già votato, così sai chi manca."], ["Dopo", "Chiudi: i voti diventano definitivi e la media del gruppo è lì, vino per vino."]])}
  `));

  P.push(pg("paper", "Il primo accesso", `
    ${eyebrow("02", "Il primo accesso")}
    <h1 class="d">Entri dal sito del tuo club, <em>già riconosciuto</em></h1>
    <div style="display:grid;grid-template-columns:1fr 72mm;gap:8mm;align-items:start">
      <div>
        <p class="lead">Non c'è nessuna password da ricordare: apri la pagina del tuo club e sei dentro, con il tuo nome in alto.</p>
        ${ul(["Sotto il tuo nome leggi <b>Organizzatore</b>: è questo che ti fa vedere i pulsanti per creare, chiudere ed eliminare.", "I partecipanti vedono le stesse degustazioni, ma senza questi pulsanti.", "Vedi solo le serate del <b>tuo gruppo</b>: gli altri gruppi del sito non si vedono tra loro."])}
        ${call("Se non vedi <b>«Nuova degustazione»</b>, il tuo profilo non è ancora organizzatore: chiedilo a chi cura il sito.")}
        ${quote("«Il ruolo lo decide il sito del club, non l'app: ecco perché non c'è una schermata di amministrazione.»")}
      </div>
      ${fig("team-base-6-org-elenco.png", 1, "Le tue degustazioni: <b>Nuova degustazione</b> in alto, poi l'elenco, con lo stato di ognuna.", "lg")}
    </div>
  `));

  P.push(pg("ink", "Creare una degustazione", `
    ${eyebrow("03", "Creare una degustazione")}
    <h1 class="d">Un nome, <em>un tocco</em></h1>
    <div style="display:grid;grid-template-columns:1fr 72mm;gap:8mm;align-items:start">
      <div>
        <p class="lead">Premi <b>Nuova degustazione</b>, scrivi un nome che riconosceranno tutti e conferma.</p>
        ${passi([["Nuova degustazione", "Il pulsante in alto nell'elenco."], ["Scrivi il nome", "Per esempio «Serata Nebbiolo»."], ["Crea", "La serata compare subito, aperta."]])}
        ${ul(["Il nome può essere lungo fino a <b>80 caratteri</b>; se lo lasci vuoto te lo ricorda.", "Puoi tenere fino a <b>200 degustazioni</b> per gruppo: se ne hai di vecchie che non servono, eliminale.", "Premendo due volte il pulsante non si crea una serata doppia.", "La serata compare nell'elenco <b>«Degustazioni del team»</b>: la vedono tutti i membri del tuo gruppo, nessun altro gruppo."])}
      </div>
      ${fig("team-base-7-org-nuova.png", 1, "Il modulo: un solo campo. <b>Annulla</b> chiude senza creare niente.", "lg")}
    </div>
  `));

  P.push(pg("paper", "Aggiungere i vini", `
    ${eyebrow("04", "Aggiungere i vini")}
    <h1 class="d">I vini della serata, <em>uno dopo l'altro</em></h1>
    <div style="display:grid;grid-template-columns:1fr 72mm;gap:8mm;align-items:start">
      <div>
        <p class="lead">Dentro la serata premi <b>Aggiungi vino</b>. Il modulo resta aperto, così puoi inserirli di seguito.</p>
        ${table(["Campo", "Cosa scrivere"], [["Nome del vino", "Obbligatorio, fino a 100 caratteri."], ["Produttore", "Facoltativo, fino a 80 caratteri."], ["Annata", "Facoltativa: quattro cifre (2018) oppure <code>NV</code>."]], [0])}
        ${ul(["Ogni vino aggiunto compare subito in elenco, con un avviso di conferma.", "Si possono aggiungere fino a <b>100 vini</b> per degustazione, e solo finché la serata è <b>aperta</b>."])}
        ${call("<b>Controlla prima di aggiungere.</b> Il nome di un vino già inserito non si modifica e un singolo vino non si toglie. Se hai sbagliato e nessuno ha ancora votato, elimina la serata e ricreala (vedi il capitolo 7).", true)}
      </div>
      ${fig("team-base-8-org-degustazione.png", 1, "La serata vista da te: i pulsanti <b>Chiudi</b> ed <b>Elimina</b> e <b>Aggiungi vino</b>.", "lg")}
    </div>
  `));

  P.push(pg("ink", "Cosa fanno i partecipanti", `
    ${eyebrow("05", "Cosa fanno i partecipanti")}
    <h1 class="d">Due modi di votare, <em>stessa scala</em></h1>
    <p class="lead" style="max-width:140mm">Ognuno sceglie, vino per vino, quanto dettagliare. Il punteggio finale va sempre da 50 a 100.</p>
    <div class="phones" style="margin-top:5mm">
      ${fig("team-base-3-voto-rapido.png", 1, "<b>Voto rapido</b>: tre cursori, occhio, naso e bocca. Pochi secondi.", "lg")}
      ${fig("team-base-4-scheda-completa.png", 2, "<b>Scheda completa</b>: nove giudizi da 0 a 10 sulle quattro fasi. Per chi vuole fare sul serio.", "lg")}
    </div>
    <div class="scale" style="margin-top:6mm"><div><span class="v">50</span><span class="t">insufficiente</span></div><div><span class="v">60</span><span class="t">sufficiente</span></div><div><span class="v">70</span><span class="t">discreto</span></div><div><span class="v">80</span><span class="t">buono</span></div><div><span class="v">90</span><span class="t">eccellente</span></div><div class="top"><span class="v">96–100</span><span class="t">eccezionale · irripetibile</span></div></div>
    ${quote("«Un vino non prende mai 30, e quasi mai 100: il 100 è solo per il vino perfetto.»")}
  `));

  P.push(pg("paper", "Durante la serata", `
    ${eyebrow("06", "Durante la serata")}
    <h1 class="d">Chi ha votato, <em>chi manca</em></h1>
    <div style="display:grid;grid-template-columns:1fr 72mm;gap:8mm;align-items:start">
      <div>
        <p class="lead">Sotto ogni vino leggi quante persone hanno già votato. Premi <b>Aggiorna</b> per vedere i numeri nuovi.</p>
        ${ul(["<b>Tu</b> vedi sempre il conteggio dei voti; i partecipanti lo vedono solo dopo aver votato quel vino.", "La <b>media del gruppo</b> compare, per ognuno, solo dopo aver votato: nessuno è influenzato dagli altri.", "Nessuno, nemmeno tu, vede <b>chi ha votato cosa</b>: i voti individuali sono privati.", "Si può rivotare finché la serata è aperta: conta l'ultimo voto."])}
        ${call("<b>Consiglio per la serata.</b> Aggiungi tutti i vini prima di cominciare, poi invita ognuno a votare dopo l'assaggio di ciascun vino. A fine giro guarda il conteggio: se manca qualcuno, lo vedi subito.")}
      </div>
      ${fig("team-base-2-vini.png", 1, "Un partecipante dopo il voto: <b>il suo voto</b> e <b>la media del gruppo</b>, con quanti voti.", "lg")}
    </div>
  `));

  P.push(pg("ink", "Chiudere, riaprire, eliminare", `
    ${eyebrow("07", "Chiudere, riaprire, eliminare")}
    <h1 class="d">A fine serata, <em>si chiude</em></h1>
    <div class="phones" style="gap:8mm;margin:5mm 0 2mm">
      ${fig("team-base-9-org-chiudi.png", 1, "<b>Chiudi la degustazione</b>: l'app chiede conferma e spiega cosa succede.", "lg")}
      ${fig("team-base-10-org-chiusa.png", 2, "A serata chiusa i voti restano visibili ma <b>non si cambiano più</b>.", "lg")}
    </div>
    ${table(["Azione", "Cosa succede"], [
      ["<b>Chiudi</b>", "Nessuno può più votare né aggiungere vini. I voti sono definitivi."],
      ["<b>Riapri</b>", "Si può votare e aggiungere vini di nuovo. Utile se hai chiuso troppo presto."],
      ["<b>Elimina</b>", "Cancella la serata con tutti i suoi vini e voti. <b>Non si può annullare</b>: l'app chiede conferma e ripete il nome."]], [0])}
  `));

  P.push(pg("paper", "Leggere i risultati", `
    ${eyebrow("08", "Leggere i risultati")}
    <h1 class="d">La media <em>del gruppo</em></h1>
    <div class="two">
      <div>
        <p class="lead">Ogni vino ha il suo numero: la media dei voti di tutto il gruppo, con un decimale.</p>
        ${ul(["Voti rapidi e schede complete si mescolano senza problemi: sono sulla stessa scala 50–100.", "Ogni numero finale segue l'arrotondamento classico: da 5 in su si sale (79,45 diventa 79,5).", "Un vino è «buono» da 80, «eccellente» da 90, «eccezionale» da 96."])}
        ${call("<b>Meglio con almeno due voti.</b> Con un voto solo la media coinciderebbe con quello di una persona: per questo, fuori dall'app, la media si legge solo dal secondo voto.")}
      </div>
      <div>
        <h2 class="s" style="margin-top:0">Un elenco <em>di esempio</em></h2>
        ${table(["Vino", "Voti", "Media"], [["Barolo Cannubi 2019", "3", "88"], ["Etna Rosso Contrada Rampante 2021", "2", "74,5"], ["Verdicchio Classico 2022", "1", "—"]], [0])}
        <p class="mute" style="font-size:8.4pt">Il Verdicchio ha un voto solo: la media non è ancora disponibile.</p>
      </div>
    </div>
    ${cards([["Nell'app", "Ogni partecipante vede la propria media di gruppo vino per vino, subito dopo aver votato."], ["Per il tuo sito", "I risultati di ogni serata (e il CSV da aprire in un foglio di calcolo) li legge chi cura il sito, con l'API."], ["Per sempre?", "I dati restano finché non vengono cancellati: eliminare la serata cancella voti e medie."]])}
  `));

  P.push(pg("paper", "Domande frequenti", `
    ${eyebrow("09", "Domande frequenti")}
    <h1 class="d">Prima che <em>tu me lo chieda</em></h1>
    ${table(["Domanda", "Risposta"], [
      ["Ho sbagliato il nome di un vino.", "Non si modifica. Se nessuno ha ancora votato, elimina la degustazione e ricreala; altrimenti segnala l'errore al gruppo e lascialo com'è."],
      ["Posso togliere un singolo vino?", "No. Si elimina l'intera serata."],
      ["Qualcuno ha votato per sbaglio.", "Può rivotare finché la serata è aperta: conta l'ultimo voto."],
      ["Posso votare anch'io?", "Sì, come tutti. Anche tu vedi la media solo dopo aver votato."],
      ["Posso sapere chi ha votato cosa?", "No, a nessuno: si vede solo quante persone hanno votato."],
      ["Chi vede le serate che creo?", "Tutti i membri del tuo gruppo, nell'elenco «Degustazioni del team». Gli altri gruppi non le vedono."],
      ["Non vedo «Nuova degustazione».", "Il tuo profilo non è organizzatore: chiedilo a chi cura il sito."],
      ["Compare «Devi rientrare».", "L'accesso è scaduto (dopo qualche ora). Ricarica la pagina del tuo club: di solito basta."],
      ["La media non compare.", "Vota prima quel vino: la media si sblocca dopo il tuo voto."],
      ["Ho chiuso troppo presto.", "Premi «Riapri la degustazione»: si può votare e aggiungere vini di nuovo."],
      ["Quanto durano i dati?", "Finché non li cancelli: eliminando la serata spariscono vini, voti e medie."]], [0, 1])}
  `));

  P.push(pg("ink", "La checklist della serata", `
    ${eyebrow("10", "La checklist della serata")}
    <h1 class="d">Prima, durante, <em>dopo</em></h1>
    <div class="two">
      <div><h3 class="k">Prima</h3>${check(["Entro dal sito del club e leggo «Organizzatore» sotto il mio nome.", "Creo la degustazione con un nome chiaro.", "Aggiungo tutti i vini, controllando nome, produttore e annata.", "Faccio un voto di prova su un vino per vedere come funziona."])}</div>
      <div><h3 class="k">Durante</h3>${check(["Invito tutti a votare dopo l'assaggio di ogni vino.", "Premo «Aggiorna» e controllo quante persone hanno votato.", "Se qualcuno non vede la pagina, gli faccio ricaricare quella del club."])}</div>
    </div>
    <h3 class="k" style="margin-top:6mm">Dopo</h3>
    ${check(["Controllo che tutti abbiano votato e chiudo la degustazione.", "Leggo la media di ogni vino e la comunico al gruppo.", "Chiedo a chi cura il sito di salvare il CSV dei risultati: il servizio è gratuito e non garantisce la conservazione per sempre.", "Elimino le serate vecchie che non servono più."])}
    <div class="bigword">Buona serata.</div>
    <p class="mute">Versione ${L.VERSIONE} · ultimo aggiornamento: ${L.DATA}</p>
  `));
  return L.documento("Sorso — Guida per chi organizza", P);
}
module.exports = { build };
