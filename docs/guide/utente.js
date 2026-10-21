/* Guida all'uso di Taste per chi lo usa ogni giorno (il profilo personale): linguaggio semplice, tante schermate.
   Si scarica dall'app: Impostazioni → Guida. Il file finito viene copiato anche in public/. */
const L = require("./lib");
const { fig, wide, stats, cards, table, call, ul, check, eyebrow } = L;
const DOC = "Guida all'uso di Taste";
let n = 1;
const pg = (cls, label, inner) => L.page({ cls, label, doc: DOC, n: ++n, big: true }, inner);
const passi = list => `<div class="flow" style="grid-template-columns:repeat(${list.length},1fr)">${list.map(([t, d], i) => `<div class="st" style="min-height:34mm"><span class="nn">${i + 1}</span><b>${t}</b><span class="d">${d}</span></div>`).join("")}</div>`;
/* testo a sinistra, un telefono a destra: la struttura di quasi tutte le pagine */
const lato = (testo, figura) => `<div style="display:grid;grid-template-columns:1fr 72mm;gap:8mm;align-items:start"><div>${testo}</div>${figura}</div>`;

function build() {
  const P = [];
  P.push(L.cover({ titolo: "Il tuo taccuino<br>di <em>degustazione</em>", sotto: "Guida all'uso di Taste<br>Schede · alla cieca · statistiche · eventi · impostazioni", tipo: "Guida all'uso per chi degusta" }));

  P.push(pg("paper", "In breve", `
    ${eyebrow("01", "In breve")}
    <h1 class="d">Assaggi, <em>voti, ricordi</em></h1>
    <p class="lead">Taste è il tuo taccuino: fotografi l'etichetta, dai il voto, e ritrovi ogni vino con le statistiche del tuo palato.</p>
    ${stats([["50–100", "la scala<br>del voto"], ["2", "modi di votare:<br>rapido o completo"], ["5", "sezioni:<br>Nuova · Alla cieca · Taccuino · Statistiche · Cerchie"], ["0 €", "il costo<br>dell'app"]])}
    ${cards([["Nuova", "Una scheda per ogni vino: etichetta, dati, giudizio. Il punteggio si calcola da solo."], ["Alla cieca", "Assaggi senza guardare l'etichetta e provi a indovinare. Poi confronti."], ["Taccuino", "Tutte le tue schede: cerchi, ordini, confronti due vini, modifichi."], ["Statistiche", "Il tuo profilo: vitigni preferiti, come giudichi, quanto conta il prezzo."], ["Cerchie", "Gruppi di amici, colleghi o corsisti: serate con più vini o un solo vino, voti anonimi e classifica."], ["Impostazioni", "Colori, tema chiaro o scuro, copia dei dati, account e questa guida."]])}
    <p class="mute">Funziona dal telefono e dal computer. Sul telefono le sezioni sono nella barra in alto; sul computer, nella barra in alto.</p>
  `));

  P.push(pg("ink", "Il punteggio", `
    ${eyebrow("02", "Il punteggio")}
    <h1 class="d">Da 50 a 100, <em>senza sorprese</em></h1>
    <div class="two">
      <div>
        <p class="lead">Ogni vino prende un voto finale da <b>50</b> a <b>100</b>.</p>
        ${table(["Voto", "Significa"], [["50", "insufficiente"], ["60", "sufficiente"], ["70", "discreto"], ["80", "buono"], ["90", "eccellente"], ["96", "eccezionale"], ["100", "irripetibile"]], [1])}
        ${call("<b>Il 100 è raro.</b> Si dà solo al vino perfetto: tre 100 su tre.")}
      </div>
      <div>
        <h2 class="s" style="margin-top:0">Due modi <em>di votare</em></h2>
        ${table(["Modo", "Come funziona"], [["<b>Voto rapido</b>", "Tre giudizi da 50 a 100: <b>occhio</b> (pesa 10%), <b>naso</b> (30%), <b>bocca</b> (60%). Veloce, senza descrivere il vino."], ["<b>Scheda completa</b>", "Descrivi il vino e dai nove giudizi, ispirati al metodo AIS. Ogni giudizio si dà in riferimento alla tipologia."]], [1])}
        ${ul(["Puoi cambiare modo scheda per scheda.", "In Impostazioni scegli con quale modo si apre ogni nuova scheda.", "I due modi sono sulla stessa scala: li puoi confrontare e mescolare."])}
        <p class="mute" style="font-size:8.4pt">Ogni numero finale segue l'arrotondamento classico: da 5 in su si sale.</p>
      </div>
    </div>
  `));

  P.push(pg("paper", "Nuova", `
    ${eyebrow("03", "Nuova")}
    <h1 class="d">Una scheda <em>per ogni vino</em></h1>
    ${lato(`
        <p class="lead">Tutto è facoltativo, tranne il nome del vino.</p>
        ${passi([["Etichetta", "Scatta o scegli una foto, poi «Leggi l'etichetta»."], ["Dati", "Controlli e completi: nome, annata, prezzo…"], ["Giudizio", "Voto rapido o scheda completa."]])}
        ${ul(["<b>Leggi l'etichetta</b>: Taste trova l'etichetta nella foto, la legge e propone nome, produttore, annata, denominazione e vitigni. Controlli, correggi e scegli cosa usare. La foto resta sul telefono; meglio se l'etichetta è dritta e ben illuminata.", "<b>È questo?</b>: se il vino è nel tuo Taccuino, nel catalogo Taste o (con il <b>codice a barre</b> del retro) su Open Food Facts, Taste lo propone con tutti i dati; se non è sicuro, due o tre vini tra cui scegliere.", "<b>Uvaggio</b>: indica i vitigni e le percentuali. Alimenta le statistiche per vitigno: più lo compili, più il profilo è preciso.", "<b>Tipologia</b>: rosso, bianco, rosato, bollicine… Il giudizio tiene conto del tipo di vino.", "Il punteggio si aggiorna mentre muovi i cursori."])}
        ${call("<b>Hai sbagliato?</b> Una scheda salvata si modifica dal Taccuino: tocca «Modifica scheda».")}`,
      fig("app-nuova.png", 1, "La scheda <b>Nuova</b>: etichetta, dati e giudizio.", "lg"))}
  `));

  P.push(pg("ink", "Alla cieca", `
    ${eyebrow("04", "Alla cieca")}
    <h1 class="d">Assaggia, <em>poi indovina</em></h1>
    ${lato(`
        <p class="lead">Per assaggiare senza guardare l'etichetta, da solo o con gli amici, e vedere chi si avvicina di più.</p>
        ${passi([["Ipotizza", "Tipologia, vitigno, annata, regione."], ["Giudica", "Dai il voto come sempre."], ["Salva", "Dai un nome al calice per ritrovarlo."]])}
        ${ul(["Tutte le ipotesi sono <b>facoltative</b>: anche solo tirare a indovinare.", "Nome del calice, per esempio «Calice n.3 — serata del giovedì».", "Le tue prove restano in elenco: quando scopri il vino, lo confronti con ciò che avevi pensato."])}
        ${call("Questa è la versione <b>personale</b>. La degustazione alla cieca di gruppo, con svelamento, è nello spazio del tuo club (capitolo 10).")}`,
      fig("app-cieca.png", 1, "<b>Alla cieca</b>: la tua ipotesi e il voto.", "lg"))}
  `));

  P.push(pg("paper", "Taccuino", `
    ${eyebrow("05", "Taccuino")}
    <h1 class="d">Tutti i tuoi vini, <em>a portata di dito</em></h1>
    ${lato(`
        <p class="lead">Ogni scheda salvata finisce qui, con la foto dell'etichetta e il punteggio.</p>
        ${ul(["<b>Cerca</b> per vino, produttore o denominazione.", "<b>Filtra</b> per tipologia.", "<b>Ordina</b> per punteggio, data o prezzo, in entrambi i versi.", "<b>Confronta</b>: tocca il punteggio di due vini per metterli a fianco.", "<b>Modifica scheda</b> o <b>Elimina scheda</b>: l'eliminazione chiede conferma e non si annulla."])}
        ${call("Il Taccuino è tuo: con l'account Google lo ritrovi su ogni dispositivo; senza account resta in questo browser. Fai ogni tanto una <b>copia</b> da Impostazioni.")}`,
      fig("app-taccuino.png", 1, "Il <b>Taccuino</b>: ricerca, filtri e ordine.", "lg"))}
  `));

  P.push(pg("ink", "Statistiche", `
    ${eyebrow("06", "Statistiche")}
    <h1 class="d">Il profilo <em>del tuo palato</em></h1>
    ${lato(`
        <p class="lead">Più schede salvi, più le statistiche diventano precise. Le trovi nella sezione <b>Statistiche</b>.</p>
        ${ul(["<b>I tuoi vini preferiti</b>: il podio dei migliori.", "<b>Profilo per vitigno</b>: ordinati per il voto medio che dai loro.", "<b>Profilo sensoriale</b>: il radar del tuo palato.", "<b>Come giudichi, voce per voce</b>: sei generoso o severo?", "<b>Quanto conta il prezzo</b>: i vini che valgono più di quanto costano, e quelli che no."])}
        ${call("Alcuni blocchi compaiono solo dopo qualche scheda: l'app ti dice cosa serve per sbloccarli.")}`,
      fig("app-statistiche.png", 1, "Le <b>Statistiche</b> del tuo profilo.", "lg"))}
  `));

  P.push(pg("paper", "Serate nelle cerchie", `
    ${eyebrow("07", "Serate nelle cerchie")}
    <h1 class="d">Degustare <em>insieme</em></h1>
    ${lato(`
        <p class="lead">Per una serata in enoteca, un corso o una cena: apri una <b>cerchia</b> e trovi in alto <b>Serate e degustazioni</b>.</p>
        ${passi([["Crea", "Una serata con più vini, o «Un solo vino»."], ["Vota", "Ognuno dal suo telefono."], ["Classifica", "Medie e statistiche della cerchia."]])}
        ${ul(["Le creano il Proprietario e gli amministratori; i membri votano.", "La media di un vino compare <b>dopo il tuo voto</b>; anche <b>alla cieca</b>.", "Nel <b>Taccuino</b> della cerchia ritrovi ogni vino col tuo voto accanto alla media.", "I voti sono anonimi; con <b>Cancella i miei voti</b> li togli da una cerchia.", "Gli <b>eventi</b> della versione precedente restano consultabili in fondo a Cerchie."])}`,
      fig("cerchie-serate.png", 1, "Le <b>serate</b> di una cerchia: una serata con tre vini e una degustazione di un solo vino.", "lg"))}
  `));

  P.push(pg("ink", "Impostazioni", `
    ${eyebrow("08", "Impostazioni")}
    <h1 class="d">Tutto sul tuo profilo, <em>in un posto</em></h1>
    ${lato(`
        <p class="lead">Si apre dall'ingranaggio in alto (e dal menù del tuo avatar); sul computer c'è anche il pulsante «Aspetto e colori».</p>
        ${table(["Sezione", "A cosa serve"], [["<b>Nome del taccuino</b>", "Il titolo e di chi è («il taccuino di Mario Rossi»): compare in alto."], ["<b>Aspetto</b>", "Tema <b>Chiaro</b>, <b>Scuro</b> o <b>Automatico</b> (segue il tuo dispositivo). Colore d'accento e sfondo a scelta."], ["<b>Come voti di solito</b>", "Con quale modo si apre ogni nuova scheda: l'ultima usata, Voto rapido o Scheda completa."], ["<b>Il tuo archivio</b>", "<b>Salva copia</b> scarica un file con le tue schede; <b>Ripristina da copia</b> le rimette a posto."], ["<b>Catalogo Taste</b>", "Solo i dati del vino (niente voti né nomi) vanno al catalogo comune, per riconoscerlo la volta dopo. Disattivabile."], ["<b>Guida</b>", "Questo documento, sempre a portata di mano."], ["<b>Account</b>", "Accedi con Google per ritrovare le schede ovunque; esci quando vuoi."]], [1])}
        ${call("Il testo resta sempre leggibile: se scegli un colore troppo chiaro o troppo scuro, l'app lo corregge leggermente e te lo dice.")}`,
      fig("app-impostazioni.png", 1, "Le <b>Impostazioni</b>: l'aspetto in alto; voto, archivio, guida e account più sotto.", "lg"))}
  `));

  P.push(pg("paper", "Dal computer", `
    ${eyebrow("09", "Dal computer")}
    <h1 class="d">Più spazio, <em>tutto in vista</em></h1>
    <p class="lead">Su schermi larghi le sezioni stanno in una barra in alto (con Aspetto e colori, tema, lingua, impostazioni e avatar) e il contenuto va su due colonne, per vedere tutto senza scorrere.</p>
    ${wide("desk-taccuino.png", 1, "<b>Taccuino</b> sul computer: l'elenco a sinistra, la scheda del vino scelto a destra.")}
    ${wide("desk-nuova.png", 2, "<b>Nuova</b> sul computer: i dati a sinistra, il giudizio a destra.")}
  `));

  P.push(pg("ink", "Lo spazio del club", `
    ${eyebrow("10", "Lo spazio del club")}
    <h1 class="d">Se il tuo club usa <em>Taste</em></h1>
    <p class="lead">Alcuni siti ospitano Taste al loro interno: nello spazio del tuo club puoi votare insieme agli altri soci.</p>
    <div class="two">
      <div>
        ${table(["Scheda", "Cosa trovi"], [["<b>Degustazioni</b>", "Le serate del tuo gruppo: apri, vota, vedi la media. Se un vino lo assaggiano in pochi, l'organizzatore ne chiude la votazione e la media conta chi ha votato."], ["<b>Taccuino</b>", "Tutti i vini assaggiati col gruppo, col tuo voto accanto alla media."], ["<b>Classifica</b>", "I vini ordinati per media; provvisoria finché la serata è aperta, finale a serata chiusa."], ["<b>Statistiche</b>", "I numeri delle ultime degustazioni chiuse del gruppo."]], [1])}
        <h3 class="k">Alla cieca di gruppo</h3>
        ${ul(["I vini compaiono come <b>Vino 1, Vino 2…</b>.", "Oltre al voto puoi <b>indovinare</b> tipologia, vitigno e annata: 1, 2 e 2 punti.", "Quando l'organizzatore <b>svela</b> i vini, tutti vedono i nomi e il punteggio delle ipotesi."])}
      </div>
      <div>
        ${call("<b>Privacy.</b> Nessuno vede chi ha votato cosa: né gli altri soci né l'organizzatore. Si vedono solo medie e conteggi.")}
        ${call("La media di un vino compare dopo il tuo voto, così nessuno è influenzato dagli altri.")}
        ${call("Lo spazio del club è <b>separato</b> dal tuo Taccuino personale: i voti dati lì restano lì.")}
      </div>
    </div>
  `));

  P.push(pg("paper", "Domande frequenti", `
    ${eyebrow("11", "Domande frequenti")}
    <h1 class="d">Prima che <em>tu me lo chieda</em></h1>
    ${table(["Domanda", "Risposta"], [
      ["Ho perso le mie schede.", "Senza account stanno nel browser del dispositivo: se hai cancellato i dati del browser, ripristina da una copia (Impostazioni → Ripristina da copia). Con l'account Google le ritrovi ovunque."],
      ["Come cambio i colori?", "Impostazioni → Aspetto. Con «Ripristina i colori» torni a quelli originali."],
      ["Voglio il tema scuro.", "Impostazioni → Aspetto → Scuro. Con «Automatico» l'app segue il tema del telefono."],
      ["Posso cambiare un voto?", "Sì: dal Taccuino, «Modifica scheda»."],
      ["Il vino non viene riconosciuto.", "Compila i dati e salva: Taste se lo ricorda."],
      ["Perché il voto minimo è 50?", "È la scala di Taste: 50 insufficiente, 100 irripetibile. Il 100 è solo per il vino perfetto."],
      ["Come confronto due vini?", "Nel Taccuino tocca il punteggio dei due vini."],
      ["Le statistiche non compaiono.", "Servono alcune schede (e per alcuni blocchi l'uvaggio compilato). L'app dice cosa manca."],
      ["Come passo i dati a un altro telefono?", "Accedi con lo stesso account Google, oppure salva una copia e ripristinala sull'altro dispositivo."],
      ["Nello spazio del club vedo «Devi rientrare».", "L'accesso è scaduto dopo qualche ora: ricarica la pagina del tuo club."],
      ["Chi vede i miei voti?", "Solo tu. Nello spazio del club si vedono solo medie e conteggi, mai i voti di una persona."]], [0, 1])}
  `));

  P.push(pg("ink", "In pratica", `
    ${eyebrow("12", "In pratica")}
    <h1 class="d">Per cominciare <em>subito</em></h1>
    ${check(["Apro «Nuova» e scrivo il nome del vino.", "Scatto la foto dell'etichetta (facoltativa).", "Scelgo Voto rapido o Scheda completa e muovo i cursori.", "Salvo: il vino compare nel Taccuino.", "Dopo qualche scheda guardo le Statistiche: scopro cosa mi piace davvero.", "In Impostazioni scelgo i colori e salvo una copia di sicurezza."])}
    <div class="bigword">Buon assaggio.</div>
    <p class="mute">Versione ${L.VERSIONE} · ultimo aggiornamento: ${L.DATA}</p>
  `));
  return L.documento("Taste — Guida all'uso", P);
}
module.exports = { build };
