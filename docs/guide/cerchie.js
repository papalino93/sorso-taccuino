/* Guida «Le cerchie»: per chi crea e gestisce una cerchia (Proprietario e Amministratori). Linguaggio semplice. */
const L = require("./lib");
const { fig, stats, cards, table, call, ul, check, eyebrow } = L;
const DOC = "Guida alle cerchie";
let n = 1;
const pg = (cls, label, inner) => L.page({ cls, label, doc: DOC, n: ++n, big: true }, inner);
const passi = list => `<div class="flow" style="grid-template-columns:repeat(${list.length},1fr)">${list.map(([t, d], i) => `<div class="st" style="min-height:34mm"><span class="nn">${i + 1}</span><b>${t}</b><span class="d">${d}</span></div>`).join("")}</div>`;
const lato = (testo, figura) => `<div style="display:grid;grid-template-columns:1fr 72mm;gap:8mm;align-items:start"><div>${testo}</div>${figura}</div>`;

function build() {
  const P = [];
  P.push(L.cover({ titolo: "Le tue<br><em>cerchie</em>", sotto: "Guida alle cerchie<br>Creare · invitare · ruoli · gestire le persone", tipo: "Guida per chi crea e gestisce una cerchia" }));

  P.push(pg("paper", "In breve", `
    ${eyebrow("01", "In breve")}
    <h1 class="d">Un gruppo, <em>tre ruoli</em></h1>
    <p class="lead">Una cerchia è un gruppo di persone — amici, colleghi, corsisti — che degustano insieme. La crei tu, inviti chi vuoi, e decidi chi può gestirla.</p>
    ${stats([["3", "ruoli:<br>Proprietario, Amministratore, Membro"], ["50", "persone al massimo<br>per cerchia"], ["14", "giorni di validità<br>di un invito"], ["0 €", "il costo<br>dell'app"]])}
    ${cards([["Crei", "Dai un nome alla cerchia: sei il Proprietario. Puoi crearne fino a cinque."], ["Inviti", "Scrivi le mail: l'invito vale solo per quell'indirizzo. Puoi anche mandare un link."], ["Gestisci", "Nomini amministratori, togli persone, passi la proprietà. Le serate di gruppo arrivano nel prossimo aggiornamento."]])}
    <p class="mute">Serve un account Google: è lo stesso che usi per ritrovare le schede su ogni dispositivo.</p>
  `));

  P.push(pg("ink", "Creare una cerchia", `
    ${eyebrow("02", "Creare una cerchia")}
    <h1 class="d">Un nome, <em>un tocco</em></h1>
    ${lato(`
        <p class="lead">Apri <b>Cerchie</b>, scrivi il nome e premi <b>Crea la cerchia</b>.</p>
        ${passi([["Cerchie", "La voce nel menù, accanto a Statistiche."], ["Nome", "Per esempio «Corso del giovedì»."], ["Crea", "Sei il Proprietario."]])}
        ${ul(["Il nome può avere fino a <b>48 caratteri</b>; puoi cambiarlo quando vuoi.", "Puoi <b>creare fino a 5 cerchie</b> e <b>far parte di 20</b>.", "Serve avere fatto l'accesso con Google: senza, la voce Cerchie ti chiede di accedere."])}
        ${call("<b>Chi vede una cerchia?</b> Solo chi ne fa parte. Chi non è dentro non sa nemmeno che esiste.")}`,
      fig("cerchie-elenco.png", 1, "L'elenco: <b>Le tue cerchie</b>, gli <b>inviti</b> ricevuti e il modulo per crearne una nuova.", "lg"))}
  `));

  P.push(pg("paper", "Invitare", `
    ${eyebrow("03", "Invitare")}
    <h1 class="d">Un invito <em>per ogni mail</em></h1>
    ${lato(`
        <p class="lead">Entra in una cerchia, scrivi uno o più indirizzi mail e premi <b>Crea gli inviti</b>.</p>
        ${ul(["L'invito è <b>legato a quell'indirizzo</b>: lo può usare solo chi accede con Google con la stessa mail.", "Compare nella sezione <b>Inviti</b> della persona, oppure puoi premere <b>Copia il link</b> e mandarglielo con WhatsApp o per mail.", "Vale <b>14 giorni</b>, si usa una volta sola e lo puoi <b>revocare</b> in ogni momento.", "Gli indirizzi Gmail con i punti o con «+etichetta» valgono come lo stesso indirizzo."])}
        ${call("<b>Sorso non manda mail da solo</b> (per ora). L'invito aspetta la persona nel suo account; il link serve a farglielo sapere.")}
        ${call("Dopo 14 giorni, o se lo revochi, il link smette di funzionare.", true)}`,
      fig("cerchie-invita.png", 1, "Il modulo per invitare e l'elenco degli <b>inviti in attesa</b>, con «Copia il link» e «Revoca».", "lg"))}
  `));

  P.push(pg("ink", "Ricevere un invito", `
    ${eyebrow("04", "Ricevere un invito")}
    <h1 class="d">Un tocco <em>per entrare</em></h1>
    ${lato(`
        <p class="lead">Chi riceve un link apre Sorso, accede con Google e trova l'invito pronto.</p>
        ${passi([["Apri il link", "Il codice sparisce dall'indirizzo."], ["Accedi", "Con la mail giusta."], ["Accetta", "Sei dentro."]])}
        ${ul(["Se accedi con un <b>altro account</b> Google, l'app lo dice (mostrando l'indirizzo solo in parte) e non ti fa entrare.", "Gli inviti si accettano o si rifiutano anche dalla scheda <b>Cerchie</b>, senza link.", "Un invito scaduto o già usato lo spiega con un messaggio chiaro."])}
        ${call("<b>Hai scelto la mail sbagliata?</b> Esci dall'account e accedi con quello giusto: l'invito è ancora lì.")}`,
      fig("cerchie-invito.png", 1, "L'invito aperto da un link: <b>Accetta</b> o <b>Rifiuta</b>.", "lg"))}
  `));

  P.push(pg("paper", "I ruoli", `
    ${eyebrow("05", "I ruoli")}
    <h1 class="d">Chi può fare <em>cosa</em></h1>
    ${table(["Azione", "Proprietario", "Amministratore", "Membro"], [
      ["Vedere le persone e i loro ruoli", "sì", "sì", "sì"],
      ["Vedere le mail delle persone e gli inviti", "sì", "sì", "no"],
      ["Invitare nuove persone (come Membri)", "sì", "sì", "no"],
      ["Invitare un amministratore", "sì", "no", "no"],
      ["Togliere un Membro", "sì", "sì", "no"],
      ["Togliere un amministratore", "sì", "no", "no"],
      ["Nominare o togliere amministratori", "sì", "no", "no"],
      ["Rinominare la cerchia", "sì", "no", "no"],
      ["Passare la proprietà", "sì", "no", "no"],
      ["Eliminare la cerchia", "sì", "no", "no"],
      ["Uscire dalla cerchia", "dopo aver passato la proprietà", "sì", "sì"]], [0])}
    ${call("<b>Il Proprietario è uno solo.</b> Se vuole andarsene deve prima passare la proprietà a un'altra persona della cerchia: lui diventa amministratore.")}
  `));

  P.push(pg("ink", "Gestire le persone", `
    ${eyebrow("06", "Gestire le persone")}
    <h1 class="d">Nomine, <em>uscite</em>, eliminazione</h1>
    ${lato(`
        <p class="lead">Ogni persona ha accanto i pulsanti che puoi usare con il tuo ruolo: gli altri non compaiono.</p>
        ${table(["Pulsante", "Cosa succede"], [
          ["<b>Rendi amministratore</b>", "La persona può invitare e togliere membri."],
          ["<b>Togli amministratore</b>", "Torna Membro."],
          ["<b>Togli dalla cerchia</b>", "L'app chiede conferma. Per tornare serve un nuovo invito."],
          ["<b>Passa la proprietà</b>", "Tu diventi amministratore, l'altra persona Proprietario."],
          ["<b>Esci dalla cerchia</b>", "Per Membri e amministratori."],
          ["<b>Elimina la cerchia</b>", "Per tutti, per sempre: serve scrivere il nome."]], [0, 1])}`,
      fig("cerchie-persone.png", 1, "Le <b>persone</b> della cerchia, con ruolo e pulsanti. Il Proprietario vede anche le mail.", "lg"))}
  `));

  P.push(pg("paper", "Privacy e limiti", `
    ${eyebrow("07", "Privacy e limiti")}
    <h1 class="d">Poche cose, <em>chiare</em></h1>
    <div class="two">
      <div>
        <h3 class="k">Privacy</h3>
        ${ul(["I <b>nomi</b> delle persone li vedono tutti i membri; le <b>mail</b> solo il Proprietario e gli amministratori.", "Il tuo <b>Taccuino personale resta privato</b>: nella cerchia non finisce niente se non lo scegli tu.", "Nelle serate di gruppo i voti saranno <b>anonimi</b>: solo medie e conteggi, mai chi ha dato quale voto.", "Chi esce lascia i propri voti nelle medie senza il nome, e potrà chiedere di cancellarli."])}
      </div>
      <div>
        <h3 class="k">Limiti</h3>
        ${table(["Cosa", "Massimo"], [["Persone per cerchia (inviti in attesa compresi)", "50"], ["Cerchie create da una persona", "5"], ["Cerchie di cui si fa parte", "20"], ["Inviti per volta", "10"], ["Inviti al giorno per cerchia", "100"], ["Validità di un invito", "14 giorni"]], [0])}
      </div>
    </div>
  `));

  P.push(pg("ink", "Domande frequenti", `
    ${eyebrow("08", "Domande frequenti")}
    <h1 class="d">Prima che <em>tu me lo chieda</em></h1>
    ${table(["Domanda", "Risposta"], [
      ["La persona non vede l'invito.", "Deve accedere con Google con la stessa mail a cui l'hai mandato. Controlla l'indirizzo e, se serve, revoca e invita di nuovo."],
      ["Posso invitare chi non ha un account Google?", "Per ora no: serve un account Google (anche con una mail aziendale o scolastica)."],
      ["Ho sbagliato mail.", "Revoca l'invito e creane un altro."],
      ["Il link non funziona più.", "È scaduto (14 giorni), è già stato usato o l'hai revocato. Crea un nuovo invito."],
      ["Voglio passare la gestione a un amico.", "Rendilo amministratore; se vuoi cedere tutto, usa «Passa la proprietà»."],
      ["Posso togliere un amministratore?", "Solo il Proprietario. Un amministratore può togliere solo i Membri."],
      ["Ho eliminato la cerchia per sbaglio.", "Non si può annullare: va ricreata e le persone vanno invitate di nuovo."],
      ["Chi vede il mio Taccuino?", "Nessuno: la cerchia non lo legge."]], [0, 1])}
  `));

  P.push(pg("paper", "Cosa arriva dopo", `
    ${eyebrow("09", "Cosa arriva dopo")}
    <h1 class="d">Le serate, <em>poi il sito</em></h1>
    ${passi([["Ora", "Cerchie, ruoli e inviti."], ["Prossimo aggiornamento", "Serate di gruppo, anche alla cieca, con classifica e statistiche."], ["Poi", "Un widget per mostrare le statistiche su un sito."]])}
    ${ul(["<b>Serate di gruppo</b>: l'amministratore crea la serata e aggiunge i vini; tutti votano; si può chiudere la votazione di un singolo vino se lo assaggiano in pochi; classifica e statistiche di gruppo, con esportazione.", "<b>Widget</b>: un frammento da incollare in un sito, in sola lettura e revocabile, con le statistiche della cerchia.", "L'<b>Evento</b> della versione precedente sarà sostituito dalle serate delle cerchie."])}
    <h3 class="k" style="margin-top:6mm">In pratica, per cominciare</h3>
    ${check(["Apro Cerchie e creo la mia prima cerchia.", "Invito le persone con le loro mail e, se serve, mando il link.", "Nomino un amministratore di fiducia.", "Tengo d'occhio gli inviti in attesa e revoco quelli sbagliati."])}
    <div class="bigword">Buone degustazioni.</div>
    <p class="mute">Versione ${L.VERSIONE} · ultimo aggiornamento: ${L.DATA}</p>
  `));
  return L.documento("Sorso — Guida alle cerchie", P);
}
module.exports = { build };
