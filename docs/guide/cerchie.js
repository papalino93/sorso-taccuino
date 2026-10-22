/* Guida «Le cerchie»: per chi crea e gestisce una cerchia (Proprietario e Amministratori). Linguaggio semplice. */
const L = require("./lib");
const { fig, wide, stats, cards, table, call, ul, check, eyebrow } = L;
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
    ${cards([["Crei", "Dai un nome alla cerchia: sei il Proprietario. Puoi crearne fino a cinque."], ["Inviti", "Scrivi le mail: l'invito vale solo per quell'indirizzo. Puoi anche mandare un link."], ["Degusti", "Serate con più vini o un solo vino: tutti votano dal telefono, con medie e classifica."]])}
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
        ${call("<b>La mail.</b> Se il servizio di posta è attivo, Taste manda anche una mail all'indirizzo (puoi rimandarla fino a 3 volte); altrimenti l'app lo dice e il link lo mandi tu. In ogni caso l'invito aspetta la persona nel suo account. <b>Può finire in spam:</b> avvisa chi inviti, oppure usa <b>Scrivi tu la mail</b> o <b>Condividi</b> (dalla tua posta o da WhatsApp arriva sempre).")}
        ${call("Dopo 14 giorni, o se lo revochi, il link smette di funzionare.", true)}`,
      fig("cerchie-invita.png", 1, "Il modulo per invitare e l'elenco degli <b>inviti in attesa</b>, con «Copia il link» e «Revoca».", "lg"))}
  `));

  P.push(pg("ink", "Ricevere un invito", `
    ${eyebrow("04", "Ricevere un invito")}
    <h1 class="d">Un tocco <em>per entrare</em></h1>
    ${lato(`
        <p class="lead">Chi riceve un link apre Taste, accede con Google e trova l'invito pronto.</p>
        ${passi([["Apri il link", "Vedi chi ti invita e in quale cerchia."], ["Accedi", "Con la mail giusta."], ["Accetta", "Sei dentro."]])}
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
        ${ul(["I <b>nomi</b> delle persone li vedono tutti i membri; le <b>mail</b> solo il Proprietario e gli amministratori.", "Il tuo <b>Taccuino personale resta privato</b>: nella cerchia non finisce niente se non lo scegli tu.", "Nelle serate i voti sono <b>anonimi</b>: solo medie e conteggi, mai chi ha dato quale voto. Fa eccezione <b>il gioco</b>, se la cerchia lo accende.", "Chi esce lascia i propri voti nelle medie senza il nome; prima può usare <b>Cancella i miei voti</b>."])}
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
      ["Chi vede il mio Taccuino?", "Nessuno: la cerchia non lo legge."],
      ["Un vino lo hanno assaggiato in pochi.", "Apri il vino e chiudi la sua votazione: la media conta chi ha votato fino a quel momento."]], [0, 1])}
  `));

  P.push(pg("paper", "Le serate", `
    ${eyebrow("09", "Le serate")}
    <h1 class="d">Degustare <em>insieme</em></h1>
    ${lato(`
        <p class="lead">Apri la cerchia: in alto c'è <b>Serate e degustazioni</b>.</p>
        ${passi([["Crea", "«Nuova degustazione» con più vini, o «Un solo vino»."], ["Vota", "Ognuno dal suo telefono."], ["Classifica", "Medie, classifica e statistiche."]])}
        ${ul(["Le creano il <b>Proprietario</b> e gli <b>amministratori</b>; i membri votano.", "La media di un vino compare <b>dopo il tuo voto</b>.", "Anche <b>alla cieca</b>, con le ipotesi su tipologia, vitigno e annata.", "<b>Taccuino della cerchia</b>: tutti i vini assaggiati insieme, col tuo voto accanto alla media; cerca, ordina e scopri dove la pensi diversamente.", "Proprietario e amministratori <b>scaricano le medie</b> in CSV o JSON."])}`,
      fig("cerchie-unvino.png", 1, "Una degustazione di <b>un solo vino</b> dopo il voto: il tuo voto e la media della cerchia.", "lg"))}
  `));

  P.push(pg("ink", "Il widget", `
    ${eyebrow("10", "Il widget")}
    <h1 class="d">La classifica <em>sul vostro sito</em></h1>
    <p class="lead">In fondo alla cerchia, <b>Widget per un sito</b> (Proprietario e amministratori): <b>Crea il widget</b>, scegli lingua, tema e cosa mostrare, poi <b>Copia il codice</b> e incollalo nella pagina del sito.</p>
    ${wide("cerchie-widget-sito.png", 1, "Il widget incollato nel sito di un club: sfondo trasparente e il colore del sito.")}
    ${ul(["Mostra solo <b>medie anonime</b> delle serate chiuse (dal secondo voto in su); i vini alla cieca restano nascosti finché non li sveli.", "Sei tipi: <b>Classifica</b>, <b>Il palato del team</b>, <b>Striscia</b> e, con il gioco, <b>La sfida</b>, <b>Il campo</b> e <b>Podio e premi</b>. I nomi compaiono solo se accendi «Mostra i nomi sul sito».", "<b>Revoca</b> lo spegne su tutti i siti; <b>Rinnova il link</b> ne crea uno nuovo e spegne il vecchio. Il sito si aggiorna da solo entro un paio di minuti."])}
  `));

  P.push(pg("paper", "Il gioco", `
    ${eyebrow("11", "Il gioco")}
    <h1 class="d">Degustare, <em>e sfidarsi</em></h1>
    <div class="two">
      <div>
        <p class="lead">Il Proprietario o un amministratore accende <b>Il gioco</b> in fondo alla cerchia. Da quel momento, sotto ogni vino delle serate:</p>
        ${ul(["Trascini <b>la tua faccia</b> (foto di Google o iniziali) su un campo con due assi, come corpo e acidità.", "Fai un <b>pronostico</b>: quanto darà il gruppo?", "Se vuoi, indovini il <b>prezzo</b>.", "Le mosse restano segrete fino allo <b>svelamento</b>: quando hanno votato tutti, quando si chiude il vino o con «Svela!» dell'organizzatore."])}
        ${fig("cerchie-gioco-campo.png", 1, "Prima dello svelamento: la tua faccia sul campo, pronostico e prezzo.")}
      </div>
      <div>
        ${ul(["Dopo lo svelamento <b>tutti vedono tutto</b>: facce sul campo, voti, punti e titoli come «Fuori dal coro» o «Naso da sommelier».", "Fino a 10 punti per pronostico, prezzo e vicinanza al gruppo; la <b>classifica del gioco</b> somma la stagione.", "Reazioni e <b>frecciatine</b> bonarie tra colleghi.", "La <b>scommessa della serata</b> (chi vince?), livelli, dieci traguardi, serie di pronostici e la classifica del mese.", "A gioco spento i voti restano <b>anonimi</b> come sempre; il widget per i siti resta anonimo anche a gioco acceso."])}
        ${fig("cerchie-gioco-svelato.png", 2, "Dopo lo svelamento: chi ha votato cosa, punti e titoli.")}
      </div>
    </div>
  `));

  P.push(pg("ink", "I giochi", `
    ${eyebrow("12", "I giochi, uno per uno")}
    <h1 class="d">Sei giochi per vino, <em>duelli e sfide</em></h1>
    <p class="lead">Ognuno fa solo quelli che vuole; nella serata il pulsante <b>❓ Come si gioca</b> li spiega con un esempio.</p>
    ${table(["Gioco", "Cosa fai", "Punti"], [
      ["🗺️ <b>Il campo</b>", "Trascini la tua faccia su due assi che cambiano a ogni vino.", "Fino a 10, vicino al centro del gruppo"],
      ["🎯 <b>Il pronostico</b>", "Indovini la media del gruppo (50–100).", "10 se la centri, −1 per punto"],
      ["💶 <b>Quanto costa?</b>", "Scrivi il prezzo della bottiglia.", "Fino a 10, in proporzione"],
      ["👃 <b>Caccia agli aromi</b>", "Scegli fino a 3 profumi su 16.", "3 per aroma tra i preferiti del gruppo"],
      ["💬 <b>Il vino in una parola</b>", "Elegante, ruffiano, spigoloso, da meditazione…", "5 se è la parola più scelta"],
      ["💘 <b>Il fan numero uno</b>", "Chi gli darà il voto più alto?", "5 se indovini"],
      ["🔮 <b>La scommessa della serata</b>", "Chi vince la serata? Segreta fino alla chiusura.", "10 se indovini"],
      ["⚔️ <b>I duelli</b>", "Sfidi un collega su un vino, con una posta bonaria («chi perde porta il vino»).", "5 a chi fa più punti"],
      ["🗓️ <b>La sfida del mese</b>", "Ogni mese un tema: il gioco del tema vale doppio.", "Il primo entra nell'albo d'oro"]], [0, 1, 2])}
    ${ul(["<b>Svelamento</b>: quando hanno votato tutti, si chiude il vino o con «Svela!». Poi la <b>telecronaca</b> prende in giro i risultati e a serata chiusa arriva la <b>pagella</b> (MVP, maglia nera 🐌).", "<b>Classifica</b> della stagione e del mese, livelli da Apprendista a Leggenda, dieci traguardi, serie 🔥, gemello di palato e nemesi ⚔️."])}
  `));

  P.push(pg("paper", "Per cominciare", `
    ${eyebrow("13", "Per cominciare")}
    <h1 class="d">In pratica, <em>tre passi</em></h1>
    ${ul(["Gli <b>eventi</b> della versione precedente restano consultabili in fondo a Cerchie; i nuovi si fanno come serate."])}
    ${check(["Apro Cerchie e creo la mia prima cerchia.", "Invito le persone con le loro mail e, se serve, mando il link.", "Nomino un amministratore di fiducia.", "Creo la prima serata (o «Un solo vino») e faccio votare tutti.", "Se il club ha un sito, ci incollo il widget."])}
    <div class="bigword">Buone degustazioni.</div>
    <p class="mute">Versione ${L.VERSIONE} · ultimo aggiornamento: ${L.DATA}</p>
  `));
  return L.documento("Taste — Guida alle cerchie", P);
}
module.exports = { build };
