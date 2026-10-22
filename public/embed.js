/* Spazio di team di Taste — interfaccia dell'iframe.

   Il sito partner incorpora  /embed?p=<partner>#token=<JWT firmato>.
   Il token sta nel frammento (#), che il browser non invia mai a nessun server: non finisce
   nei log delle richieste né nell'intestazione Referer. Si scambia con una sessione tenuta
   SOLO in memoria (niente cookie né localStorage: dentro un iframe di terze parti i browser
   li bloccano) e si toglie dall'indirizzo solo quando lo scambio è riuscito.
   Il punteggio mostrato mentre si vota è un'anteprima: quello vero lo ricalcola il server.

   Messaggi verso la pagina del partner (window.parent.postMessage):
     { type: "sorso:height", height }   l'altezza del contenuto, per adattare l'iframe
     { type: "sorso:reauth", reason }   l'accesso non è più valido: serve un token nuovo,
                                        cioè ricaricare l'iframe con un token appena firmato */
(function () {
  "use strict";

  var app = document.getElementById("app");
  var TIMEOUT_MS = 20000;

  var S = {
    lang: document.documentElement.lang === "en" ? "en" : "it",
    partner: "", circle: "", token: "", session: "", user: null, config: null, fatal: null,
    view: "list", tab: "tastings", tastings: [], tasting: null, wines: [], quota: "ok",
    stats: null, statsLoading: false, statsError: null, gform: null,
    nb: null, nbLoading: false, nbError: null, nbq: "", nbsort: "date", nbOnly: false,
    loading: true, loadError: null,
    sheet: null, drafts: {}, gdrafts: {}, form: null, confirm: null, pending: {}, saved: null, notice: null,
    game: null, gdraft: {}, gerr: null, gconfirm: null, board: null
  };

  /* ---------------- testi ---------------- */
  var TXT = {
    it: {
      loading: "Caricamento…", refresh: "Aggiorna", retry: "Riprova", back: "← Degustazioni", cancel: "Annulla", confirm: "Conferma",
      create: "Crea", creating: "Creo…", add: "Aggiungi", adding: "Aggiungo…", done: "Fine", deleting: "Elimino…", working: "Un momento…",
      e_network: "Connessione assente o troppo lenta. Controlla la rete e riprova.",
      e_timeout: "Il servizio non risponde. Riprova fra poco.",
      e_generic: "Qualcosa non ha funzionato. Riprova.",
      e_rate: "Troppe richieste in poco tempo. Aspetta qualche secondo e riprova.",
      e_readonly: "Il servizio è temporaneamente in sola lettura: puoi consultare, ma non votare né creare.",
      updatedOn: "ultimo aggiornamento: {d}",
      e_gone: "Questa degustazione non esiste più: è stata eliminata.",
      e_closed_unsaved: "La degustazione è stata chiusa: il tuo voto non è stato salvato.",
      e_closed_guess: "La degustazione è stata chiusa: la tua ipotesi non è stata salvata.",
      reauthAsked: "Richiesta inviata al sito. Se non succede nulla, torna alla pagina del sito e ricaricala.",
      warnSoon: "Attenzione: il servizio potrebbe presto passare in sola lettura.",
      e_unavailable: "Il servizio non è disponibile in questo momento. Riprova fra poco.",
      e_session: "La sessione non è più valida.",
      e_expired: "La sessione è scaduta.",
      e_token_used: "Questo accesso è già stato usato (succede ricaricando solo questa finestra).",
      e_access: "L'accesso non è valido o è scaduto.",
      e_noaccess: "Manca l'accesso: apri questo spazio dal sito del tuo club.",
      e_closed: "La degustazione è stata chiusa: i voti sono definitivi.",
      e_limit: "Hai raggiunto il limite: elimina quello che non serve più.",
      e_forbidden: "Solo l'organizzatore può farlo.",
      e_not_found: "Non esiste più: potrebbe essere stato eliminato. Aggiorno l'elenco.",
      e_invalid_name: "Scrivi un nome.",
      e_invalid_vintage: "L'annata deve essere un anno di quattro cifre, per esempio 2018, oppure NV.",
      e_invalid_vote: "Il voto non è valido. Controlla i cursori e riprova.",
      e_mode: "Questa modalità di voto non è consentita qui.",
      authTitle: "Accesso non riuscito", authSessionTitle: "Devi rientrare",
      authReload: "Torna alla pagina del sito e ricaricala per entrare di nuovo.",
      authUnsaved: "Il voto che stavi compilando non è stato salvato.",
      authAsk: "Chiedi un nuovo accesso al sito", authReloadHere: "Ricarica questa pagina",
      tastings: "Degustazioni del team", tastingsHint: "Le crea il responsabile del team: le vedono tutti i membri.", tastingsHintOrg: "Le degustazioni che crei qui le vedono tutti i membri del tuo team.", noTastings: "Ancora nessuna degustazione.", noTastingsOrg: "Crea la prima degustazione del tuo team.",
      newTasting: "Nuova degustazione", singleWine: "Un solo vino", singleBadge: "un vino", singleHint: "Per assaggiare insieme un vino solo: la degustazione nasce con il vino, pronta da votare.", tastingName: "Nome della degustazione", open: "aperta", closedBadge: "chiusa",
      wines: "Vini", noWines: "Nessun vino ancora: l'organizzatore deve aggiungerli.", noWinesOrg: "Aggiungi i vini da votare.",
      addWine: "Aggiungi vino", wineName: "Nome del vino", producer: "Produttore (facoltativo)", vintage: "Annata (facoltativa, es. 2018 o NV)",
      wineAdded: "Aggiunto: {name}.",
      closeIt: "Chiudi la degustazione", reopen: "Riapri la degustazione", deleteIt: "Elimina la degustazione",
      closeAsk: "Chiudere la degustazione? Da quel momento nessuno può più votare né aggiungere vini, e i voti sono definitivi. Puoi riaprirla.",
      reopenAsk: "Riaprire la degustazione? Si potrà di nuovo votare e aggiungere vini.",
      deleteAsk: "Eliminare «{name}» con tutti i suoi vini e voti? Non si può annullare.",
      closedNote: "Degustazione chiusa: i voti sono definitivi.",
      closedNoVote: "Degustazione chiusa e non hai votato questo vino: la media del team non è visibile.",
      wineClosedNoVote: "La votazione di questo vino è chiusa e non hai votato: la media compare con almeno due voti.",
      wineClosedChip: "votazione chiusa", wineClose: "Chiudi la votazione di questo vino", wineReopen: "Riapri la votazione di questo vino",
      wineClosedOk: "Votazione chiusa: la media conta i voti espressi finora.", wineReopenedOk: "Votazione riaperta.",
      e_wine_closed: "La votazione di questo vino è chiusa: i voti sono definitivi.",
      readonlyNote: "Sola lettura: non si può votare né modificare.",
      vote: "Vota", editVote: "Modifica il mio voto", yourVote: "Il tuo voto", teamAvg: "Media del team",
      voteSingle: "{n} voto", votePlural: "{n} voti",
      votedSingle: "{n} persona ha votato", votedPlural: "{n} persone hanno votato",
      voteToSee: "Vota questo vino per vedere la media del team.", savedOk: "Voto salvato.", aboveAvg: "+{n} sopra la media", belowAvg: "−{n} sotto la media", onAvg: "In linea con la media",
      modeLabel: "Modalità di voto", modeSmart: "Voto rapido", modeFull: "Scheda completa",
      smartHint: "Tre giudizi da 50 a 100.", fullHint: "Nove giudizi da 0 a 10 sulle quattro fasi.",
      eye: "Occhio", nose: "Naso", mouth: "Bocca",
      eyeH: "Limpidezza, colore, aspetto.", noseH: "Profumi: intensità, complessità, pulizia.", mouthH: "Gusto e finale: equilibrio, persistenza, armonia.",
      eyeW: "pesa 10%", noseW: "pesa 30%", mouthW: "pesa 60%",
      score: "Punteggio", note: "Note personali (le vedi solo tu)", saveVote: "Salva il voto", savingVote: "Salvo…", discard: "Chiudi",
      touchHint: "Muovi il cursore, o toccalo, per dare il giudizio.", progress: "{n} di {tot} giudizi dati", progressDone: "Tutti i giudizi dati",
      draftKept: "Il voto in corso resta qui: lo ritrovi riaprendo il vino.",
      g_v: "Visivo", g_o: "Olfattivo", g_g: "Gusto-olfattivo", g_f: "Finale",
      i_v_qualita: "Qualità visiva", i_o_intensita: "Intensità", i_o_complessita: "Complessità", i_o_qualita: "Qualità olfattiva",
      i_g_equilibrio: "Equilibrio", i_g_intensita: "Intensità", i_g_persistenza: "Persistenza", i_g_qualita: "Qualità gustativa", i_f_armonia: "Armonia (vale doppio)",
      b_faulty: "Insufficiente", b_sufficient: "Sufficiente", b_fair: "Discreto", b_good: "Buono", b_excellent: "Eccellente", b_exceptional: "Eccezionale", b_perfect: "Irripetibile",
      w0: "difetto grave", w1: "gravemente carente", w2: "carente", w3: "scarso", w4: "mediocre", w5: "quasi sufficiente", w6: "sufficiente", w7: "discreto", w8: "buono", w9: "ottimo", w10: "eccellente",
      stTastingOne: "{n} degustazione chiusa", stTastingMany: "{n} degustazioni chiuse",
      sliderOf: "{name}, da {min} a {max}", asOrganizer: "Organizzatore", asMember: "Partecipante", loadFail: "Non riesco a caricare i dati.",
      tabTastings: "Degustazioni", tabRanking: "Classifica", tabStats: "Statistiche", tabsLabel: "Sezioni", tabNotebook: "Taccuino",
      nbHeading: "Taccuino del team", nbHint: "Tutti i vini assaggiati insieme, con il tuo voto accanto alla media. Solo tu vedi i tuoi voti.", nbEmpty: "Ancora nessun vino: compariranno qui dopo la prima degustazione.",
      nbWines: "Vini assaggiati", nbInTastings: "in {n} degustazioni", nbInOne: "in 1 degustazione", nbMyVotes: "I tuoi voti", nbMyAvg: "La tua media", nbTeamAvg: "Media del team", nbOnShared: "sui {n} vini votati da te e da altri",
      nbApart: "Dove la pensi diversamente", nbAgree: "Dove siete d'accordo", nbSearch: "Cerca un vino, un produttore, una serata", nbSort: "Ordina", nbOnly: "Solo quelli che ho votato",
      so_date: "Più recenti", so_team: "Media del team", so_mine: "Il mio voto", so_diff: "Differenza", nbYou: "Tu", nbTeam: "Team", nbNoVote: "non votato", nbHiddenAvg: "media non ancora visibile", nbNone: "Nessun vino trovato.",
      nbCount: "{n} vini", nbOne: "1 vino", byGrapeHeading: "Media per vitigno",
      blindBadge: "alla cieca", revealedBadge: "svelata", blindLabel: "Vino {n}",
      blindCreate: "Alla cieca: i vini restano nascosti fino allo svelamento",
      blindNote: "Degustazione alla cieca: i vini restano nascosti finché l'organizzatore non li svela. Vota e prova a indovinare.",
      blindClosedNote: "Degustazione chiusa: i voti sono definitivi. I vini si sapranno quando l'organizzatore li svelerà.",
      blindClosedNoteOrg: "Degustazione chiusa, non ancora svelata: i partecipanti vedranno i vini solo quando li svelerai.",
      blindNoteOrg: "Degustazione alla cieca: tu vedi i vini, i partecipanti no, finché non li svelerai.",
      revealedNote: "Vini svelati: ecco chi erano. Le ipotesi sono definitive.",
      revealIt: "Svela i vini", revealWorking: "Svelo…",
      revealAsk: "Svelare i vini? La degustazione si chiude per sempre: tutti vedono i nomi e come sono andate le ipotesi. Non si può annullare.",
      wineType: "Tipologia (facoltativa)", wineGrape: "Vitigno (facoltativo)", wineRegion: "Regione (facoltativa)", typeNone: "—",
      tp_Rosso: "Rosso", tp_Bianco: "Bianco", tp_Rosato: "Rosato", tp_Spumante: "Spumante", tp_Passito: "Passito",
      guessTitle: "Cosa pensi sia?", guessHint: "Facoltativo: tipologia, vitigno, annata. Ti basta indicarne una.",
      gType: "Tipologia", gGrape: "Vitigno", gYear: "Annata (es. 2018 o NV)",
      writeGuess: "Scrivi l'ipotesi", editGuess: "Modifica l'ipotesi", saveGuess: "Salva l'ipotesi", savingGuess: "Salvo…",
      yourGuess: "La tua ipotesi", guessSaved: "Ipotesi salvata.", noGuess: "Non hai provato a indovinare.",
      guessPoints: "Ipotesi: {p} punti su {m}", gr_ok: "giusto", gr_close: "quasi (±1)", gr_ko: "sbagliato", gr_na: "non indicato",
      groupGuess: "Il gruppo: tipologia giusta per {a}, vitigno per {b}, annata esatta per {c} (su chi ha risposto).",
      e_invalid_guess: "Scrivi almeno una cosa: tipologia, vitigno o annata.", e_invalid_type: "Tipologia non valida.",
      e_revealed: "Una degustazione svelata non si riapre.", e_not_blind: "Questa degustazione non è alla cieca.",
      rankHeading: "Classifica", rankProvisional: "Provvisoria: contano i vini che hai votato e che hanno almeno due voti.", rankFinal: "Classifica finale",
      rankTie: "pari merito", rankVotes: "{n} voti",
      eventsHeading: "Classifica delle serate", eventsHint: "Le degustazioni chiuse del team e il vino che ha vinto.", noEvents: "Ancora nessuna degustazione chiusa.",
      winner: "Vincitore", winnerTie: "pari merito", blindHidden: "vini ancora nascosti", noWinner: "nessun vino con almeno due voti", wineCount: "{n} vini", wineCountOne: "1 vino",
      statsHeading: "Statistiche", statsHint: "Dalle ultime {n} degustazioni chiuse del team. Sono dati aggregati: nessuno vede chi ha votato cosa.",
      statsHintOne: "Dall'ultima degustazione chiusa del team. Sono dati aggregati: nessuno vede chi ha votato cosa.",
      statsEmpty: "Servono degustazioni chiuse per avere le statistiche.", statsUpdated: "Aggiornate alle {h}",
      teamHeading: "Il team", mineHeading: "Le mie statistiche",
      stTastings: "Degustazioni", stWines: "Vini", stVotes: "Voti", stAverage: "Media del team",
      topWines: "I vini migliori", distHeading: "Come sono andati i vini", byTypeHeading: "Per tipologia", trendHeading: "Serata per serata",
      d_lt60: "sotto 60", d_b60: "60–69", d_b70: "70–79", d_b80: "80–89", d_b90: "90 e più",
      myVotes: "Voti dati", myAverage: "La mia media", myBest: "Il mio voto più alto", vsTeam: "Rispetto al team",
      sevMore: "Sei più severo di {n} punti", sevLess: "Sei più generoso di {n} punti", sevSame: "In linea con il team",
      noMine: "Non hai ancora voti nelle degustazioni chiuse: dopo la prima serata chiusa compaiono qui.",
      wineN: "Vino {n}"
    },
    en: {
      loading: "Loading…", refresh: "Refresh", retry: "Try again", back: "← Tastings", cancel: "Cancel", confirm: "Confirm",
      create: "Create", creating: "Creating…", add: "Add", adding: "Adding…", done: "Done", deleting: "Deleting…", working: "One moment…",
      e_network: "No connection or it is too slow. Check your network and try again.",
      e_timeout: "The service is not responding. Try again shortly.",
      e_generic: "Something went wrong. Please try again.",
      e_rate: "Too many requests in a short time. Wait a few seconds and try again.",
      e_readonly: "The service is temporarily read-only: you can browse, but not vote or create.",
      updatedOn: "last updated {d}",
      e_gone: "This tasting no longer exists: it was deleted.",
      e_closed_unsaved: "The tasting was closed: your vote was not saved.",
      e_closed_guess: "The tasting was closed: your guess was not saved.",
      reauthAsked: "Request sent to the website. If nothing happens, go back to the website page and reload it.",
      warnSoon: "Heads up: the service may soon become read-only.",
      e_unavailable: "The service is unavailable right now. Try again shortly.",
      e_session: "Your session is no longer valid.",
      e_expired: "Your session has expired.",
      e_token_used: "This access was already used (it happens when only this frame is reloaded).",
      e_access: "The access is invalid or has expired.",
      e_noaccess: "Access is missing: open this space from your club's website.",
      e_closed: "The tasting was closed: votes are final.",
      e_limit: "You have reached the limit: delete what you no longer need.",
      e_forbidden: "Only the organizer can do that.",
      e_not_found: "It no longer exists: it may have been deleted. Updating the list.",
      e_invalid_name: "Enter a name.",
      e_invalid_vintage: "The vintage must be a four-digit year, for example 2018, or NV.",
      e_invalid_vote: "The vote is not valid. Check the sliders and try again.",
      e_mode: "This voting mode is not allowed here.",
      authTitle: "Access failed", authSessionTitle: "You need to sign in again",
      authReload: "Go back to the website page and reload it to enter again.",
      authUnsaved: "The vote you were filling in was not saved.",
      authAsk: "Ask the website for a new access", authReloadHere: "Reload this page",
      tastings: "Team tastings", tastingsHint: "Created by the team lead: every member can see them.", tastingsHintOrg: "The tastings you create here are visible to every member of your team.", noTastings: "No tastings yet.", noTastingsOrg: "Create your team's first tasting.",
      newTasting: "New tasting", singleWine: "Just one wine", singleBadge: "one wine", singleHint: "To taste a single wine together: the tasting starts with the wine, ready to vote.", tastingName: "Tasting name", open: "open", closedBadge: "closed",
      wines: "Wines", noWines: "No wines yet: the organizer has to add them.", noWinesOrg: "Add the wines to vote on.",
      addWine: "Add wine", wineName: "Wine name", producer: "Producer (optional)", vintage: "Vintage (optional, e.g. 2018 or NV)",
      wineAdded: "Added: {name}.",
      closeIt: "Close the tasting", reopen: "Reopen the tasting", deleteIt: "Delete the tasting",
      closeAsk: "Close the tasting? From then on nobody can vote or add wines, and votes are final. You can reopen it.",
      reopenAsk: "Reopen the tasting? People will be able to vote and add wines again.",
      deleteAsk: "Delete “{name}” with all its wines and votes? This cannot be undone.",
      closedNote: "Tasting closed: votes are final.",
      closedNoVote: "The tasting is closed and you did not vote on this wine: the team average is not visible.",
      wineClosedNoVote: "Voting on this wine is closed and you did not vote: the average appears with at least two votes.",
      wineClosedChip: "voting closed", wineClose: "Close voting on this wine", wineReopen: "Reopen voting on this wine",
      wineClosedOk: "Voting closed: the average counts the votes cast so far.", wineReopenedOk: "Voting reopened.",
      e_wine_closed: "Voting on this wine is closed: votes are final.",
      readonlyNote: "Read-only: voting and editing are disabled.",
      vote: "Vote", editVote: "Edit my vote", yourVote: "Your vote", teamAvg: "Team average",
      voteSingle: "{n} vote", votePlural: "{n} votes",
      votedSingle: "{n} person has voted", votedPlural: "{n} people have voted",
      voteToSee: "Vote on this wine to see the team average.", savedOk: "Vote saved.", aboveAvg: "+{n} above average", belowAvg: "−{n} below average", onAvg: "In line with the average",
      modeLabel: "Voting mode", modeSmart: "Quick score", modeFull: "Full sheet",
      smartHint: "Three ratings from 50 to 100.", fullHint: "Nine ratings from 0 to 10 across four stages.",
      eye: "Eye", nose: "Nose", mouth: "Mouth",
      eyeH: "Clarity, color, appearance.", noseH: "Aromas: intensity, complexity, cleanliness.", mouthH: "Taste and finish: balance, persistence, harmony.",
      eyeW: "counts 10%", noseW: "counts 30%", mouthW: "counts 60%",
      score: "Score", note: "Private notes (only you see them)", saveVote: "Save vote", savingVote: "Saving…", discard: "Close",
      touchHint: "Move the slider, or tap it, to give the rating.", progress: "{n} of {tot} ratings given", progressDone: "All ratings given",
      draftKept: "Your vote in progress stays here: you will find it when you reopen the wine.",
      g_v: "Visual", g_o: "Aroma", g_g: "Taste-aroma", g_f: "Final",
      i_v_qualita: "Visual quality", i_o_intensita: "Intensity", i_o_complessita: "Complexity", i_o_qualita: "Aroma quality",
      i_g_equilibrio: "Balance", i_g_intensita: "Intensity", i_g_persistenza: "Persistence", i_g_qualita: "Taste quality", i_f_armonia: "Harmony (counts double)",
      b_faulty: "Insufficient", b_sufficient: "Sufficient", b_fair: "Fair", b_good: "Good", b_excellent: "Excellent", b_exceptional: "Exceptional", b_perfect: "Once in a lifetime",
      w0: "serious flaw", w1: "gravely lacking", w2: "lacking", w3: "poor", w4: "mediocre", w5: "nearly sufficient", w6: "sufficient", w7: "fair", w8: "good", w9: "very good", w10: "excellent",
      stTastingOne: "{n} closed tasting", stTastingMany: "{n} closed tastings",
      sliderOf: "{name}, from {min} to {max}", asOrganizer: "Organizer", asMember: "Participant", loadFail: "I can't load the data.",
      tabTastings: "Tastings", tabRanking: "Ranking", tabStats: "Statistics", tabsLabel: "Sections", tabNotebook: "Notebook",
      nbHeading: "Team notebook", nbHint: "Every wine tasted together, with your vote next to the average. Only you see your votes.", nbEmpty: "No wines yet: they will appear here after the first tasting.",
      nbWines: "Wines tasted", nbInTastings: "in {n} tastings", nbInOne: "in 1 tasting", nbMyVotes: "Your votes", nbMyAvg: "Your average", nbTeamAvg: "Team average", nbOnShared: "on the {n} wines voted by you and others",
      nbApart: "Where you disagree", nbAgree: "Where you agree", nbSearch: "Search a wine, a producer, an evening", nbSort: "Sort", nbOnly: "Only the ones I voted",
      so_date: "Most recent", so_team: "Team average", so_mine: "My vote", so_diff: "Difference", nbYou: "You", nbTeam: "Team", nbNoVote: "not voted", nbHiddenAvg: "average not visible yet", nbNone: "No wine found.",
      nbCount: "{n} wines", nbOne: "1 wine", byGrapeHeading: "Average by grape",
      blindBadge: "blind", revealedBadge: "revealed", blindLabel: "Wine {n}",
      blindCreate: "Blind: wines stay hidden until the reveal",
      blindNote: "Blind tasting: the wines stay hidden until the organizer reveals them. Vote and try to guess.",
      blindClosedNote: "Tasting closed: votes are final. The wines will be known when the organizer reveals them.",
      blindClosedNoteOrg: "Tasting closed, not revealed yet: participants will see the wines only when you reveal them.",
      blindNoteOrg: "Blind tasting: you can see the wines, participants cannot until you reveal them.",
      revealedNote: "Wines revealed: here is who they were. Guesses are final.",
      revealIt: "Reveal the wines", revealWorking: "Revealing…",
      revealAsk: "Reveal the wines? The tasting closes for good: everyone sees the names and how the guesses went. This cannot be undone.",
      wineType: "Type (optional)", wineGrape: "Grape (optional)", wineRegion: "Region (optional)", typeNone: "—",
      tp_Rosso: "Red", tp_Bianco: "White", tp_Rosato: "Rosé", tp_Spumante: "Sparkling", tp_Passito: "Dessert",
      guessTitle: "What do you think it is?", guessHint: "Optional: type, grape, vintage. One is enough.",
      gType: "Type", gGrape: "Grape", gYear: "Vintage (e.g. 2018 or NV)",
      writeGuess: "Write your guess", editGuess: "Edit your guess", saveGuess: "Save the guess", savingGuess: "Saving…",
      yourGuess: "Your guess", guessSaved: "Guess saved.", noGuess: "You did not try to guess.",
      guessPoints: "Guess: {p} points out of {m}", gr_ok: "right", gr_close: "close (±1)", gr_ko: "wrong", gr_na: "not given",
      groupGuess: "The group: type right for {a}, grape for {b}, exact vintage for {c} (of those who answered).",
      e_invalid_guess: "Write at least one thing: type, grape or vintage.", e_invalid_type: "Invalid type.",
      e_revealed: "A revealed tasting cannot be reopened.", e_not_blind: "This tasting is not blind.",
      rankHeading: "Ranking", rankProvisional: "Provisional: it counts the wines you voted on that have at least two votes.", rankFinal: "Final ranking",
      rankTie: "tied", rankVotes: "{n} votes",
      eventsHeading: "Ranking by evening", eventsHint: "The team's closed tastings and the wine that won.", noEvents: "No closed tastings yet.",
      winner: "Winner", winnerTie: "tied", blindHidden: "wines still hidden", noWinner: "no wine with at least two votes", wineCount: "{n} wines", wineCountOne: "1 wine",
      statsHeading: "Statistics", statsHint: "From the team's last {n} closed tastings. The data is aggregated: nobody sees who voted what.",
      statsHintOne: "From the team's last closed tasting. The data is aggregated: nobody sees who voted what.",
      statsEmpty: "Closed tastings are needed for statistics.", statsUpdated: "Updated at {h}",
      teamHeading: "The team", mineHeading: "My statistics",
      stTastings: "Tastings", stWines: "Wines", stVotes: "Votes", stAverage: "Team average",
      topWines: "Best wines", distHeading: "How the wines did", byTypeHeading: "By type", trendHeading: "Evening by evening",
      d_lt60: "under 60", d_b60: "60–69", d_b70: "70–79", d_b80: "80–89", d_b90: "90 and up",
      myVotes: "Votes given", myAverage: "My average", myBest: "My highest score", vsTeam: "Compared to the team",
      sevMore: "You are {n} points stricter", sevLess: "You are {n} points more generous", sevSame: "In line with the team",
      noMine: "You have no votes in closed tastings yet: they will show up here after the first closed evening.",
      wineN: "Wine {n}"
    }
  };
  /* nelle cerchie si parla di cerchia, non di team */
  var TXT_CIRCLE = {
    it: { tastings: "Degustazioni della cerchia", tastingsHint: "Le creano il Proprietario e gli amministratori: le vedono tutti i membri.", tastingsHintOrg: "Le degustazioni che crei qui le vedono tutti i membri della cerchia.",
      noTastingsOrg: "Crea la prima degustazione della cerchia: una serata con più vini o un solo vino.", closedNoVote: "Degustazione chiusa e non hai votato questo vino: la media della cerchia non è visibile.",
      teamAvg: "Media della cerchia", voteToSee: "Vota questo vino per vedere la media della cerchia.", eventsHint: "Le degustazioni chiuse della cerchia e il vino che ha vinto.",
      statsHint: "Dalle ultime {n} degustazioni chiuse della cerchia. Sono dati aggregati: nessuno vede chi ha votato cosa.", statsHintOne: "Dall'ultima degustazione chiusa della cerchia. Sono dati aggregati: nessuno vede chi ha votato cosa.",
      teamHeading: "La cerchia", stAverage: "Media della cerchia", vsTeam: "Rispetto alla cerchia", sevSame: "In linea con la cerchia",
      nbHeading: "Taccuino della cerchia", nbTeamAvg: "Media della cerchia", nbAgree: "Dove sei d'accordo con la cerchia", so_team: "Media della cerchia", nbTeam: "Cerchia" },
    en: { tastings: "Circle tastings", tastingsHint: "Created by the Owner and admins: every member can see them.", tastingsHintOrg: "The tastings you create here are visible to every member of the circle.",
      noTastingsOrg: "Create the circle's first tasting: an evening with several wines or just one wine.", closedNoVote: "The tasting is closed and you did not vote on this wine: the circle average is not visible.",
      teamAvg: "Circle average", voteToSee: "Vote on this wine to see the circle average.", eventsHint: "The circle's closed tastings and the wine that won.",
      statsHint: "From the circle's last {n} closed tastings. The data is aggregated: nobody sees who voted what.", statsHintOne: "From the circle's last closed tasting. The data is aggregated: nobody sees who voted what.",
      teamHeading: "The circle", stAverage: "Circle average", vsTeam: "Compared to the circle", sevSame: "In line with the circle",
      nbHeading: "Circle notebook", nbTeamAvg: "Circle average", nbAgree: "Where you agree with the circle", so_team: "Circle average", nbTeam: "Circle" }
  };
  function t(k, vars) {
    var d = TXT[S.lang] || TXT.it, dc = S.circle ? (TXT_CIRCLE[S.lang] || TXT_CIRCLE.it) : null;
    var s = dc && dc[k] != null ? dc[k] : d[k] != null ? d[k] : (TXT.it[k] != null ? TXT.it[k] : k);
    if (vars) Object.keys(vars).forEach(function (v) { s = s.split("{" + v + "}").join(vars[v]); });
    return s;
  }

  /* ---------------- utilità ---------------- */
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function bandWord(score) { return t("b_" + Scoring.bandKey(score)); }
  /* la media del team ha sempre un decimale, arrotondato alla regola classica (79,45 → 79,5) */
  function dec(n) { return Scoring.roundHalfUp(n, 1).toFixed(1).replace(".", S.lang === "it" ? "," : "."); }
  function plural(n, one, many) { return t(n === 1 ? one : many, { n: n }); }
  function wineLine(w) { return [w.producer, w.vintage, w.type ? t("tp_" + w.type) : "", w.grape, w.region].filter(Boolean).map(esc).join(" · "); }
  /* un vino alla cieca non svelato non ha nome: si chiama "Vino 1", "Vino 2"… */
  function wineTitle(w) { return w.name || t("blindLabel", { n: w.index || 1 }); }
  function nameOf(x) { return x.hidden || !x.name ? t("blindLabel", { n: x.index || 1 }) : x.name; }
  function isBlind() { return !!(S.tasting && S.tasting.blind); }
  function isHiddenBlind() { return isBlind() && !S.tasting.revealed; }
  /* classifica con pari merito (1, 2, 2, 4) dei vini che hanno una media da mostrare */
  function ranking(wines) {
    var rows = wines.filter(function (w) { return w.team && w.team.count >= 2; }).sort(function (a, b) { return b.team.avg - a.team.avg || b.team.count - a.team.count; });
    rows.forEach(function (r) { r.rank = 1 + rows.filter(function (o) { return o.team.avg > r.team.avg; }).length; });
    return rows;
  }
  function whenText(ms) { try { return new Date(ms).toLocaleDateString(S.lang === "en" ? "en-GB" : "it-IT", { day: "numeric", month: "short" }); } catch (e) { return ""; } }
  function timeText(ms) { try { return new Date(ms).toLocaleTimeString(S.lang === "en" ? "en-GB" : "it-IT", { hour: "2-digit", minute: "2-digit" }); } catch (e) { return ""; } }
  function $(sel) { return app.querySelector(sel); }
  function isOrg() { return !!(S.user && S.user.role === "organizer"); }
  function readonly() { return S.quota === "readonly"; }

  /* annunci per chi usa un lettore di schermo: aree dedicate, mai l'intera pagina */
  var liveP = document.createElement("div"), liveA = document.createElement("div");
  liveP.className = liveA.className = "sr-only";
  liveP.setAttribute("role", "status"); liveP.setAttribute("aria-live", "polite");
  liveA.setAttribute("role", "alert");
  document.body.appendChild(liveP); document.body.appendChild(liveA);
  function announce(text, urgent) {
    var el = urgent ? liveA : liveP;
    el.textContent = "";
    setTimeout(function () { el.textContent = text; }, 30);
  }

  /* versione e data dell'ultimo aggiornamento, sempre in fondo (fonte: js/version.js) */
  function versionHtml() {
    if (!window.SORSO_VERSION) return "";
    var d = SORSO_VERSION.date;
    try { d = new Date(SORSO_VERSION.date + "T12:00:00").toLocaleDateString(S.lang === "en" ? "en-GB" : "it-IT", { day: "numeric", month: "short", year: "numeric" }); } catch (e) { /* data grezza */ }
    return '<p class="foot">Taste · v' + esc(SORSO_VERSION.version) + ' · ' + esc(t("updatedOn", { d: d })) + '</p>';
  }
  function reportHeight() {
    try { parent.postMessage({ type: "sorso:height", height: Math.ceil(app.getBoundingClientRect().height) }, "*"); } catch (e) { /* fuori da un iframe */ }
  }
  function askReauth(reason) {
    try { parent.postMessage({ type: "sorso:reauth", reason: reason || "" }, "*"); } catch (e) { /* fuori da un iframe */ }
  }

  /* ---------------- rete ---------------- */
  function mkErr(code, status) { var e = new Error(code); e.code = code; e.status = status || 0; return e; }
  var AUTH_CODES = { malformed: 1, alg: 1, signature: 1, exp_missing: 1, expired: 1, exp_too_far: 1, not_yet: 1, partner: 1, claim_sub: 1, claim_team: 1, claim_jti: 1, claim_role: 1 };
  var ERR_KEYS = { network: "e_network", timeout: "e_timeout", rate_limited: "e_rate", read_only: "e_readonly", session: "e_session", session_expired: "e_expired",
    token_used: "e_token_used", closed: "e_closed", limit: "e_limit", forbidden: "e_forbidden", not_found: "e_not_found", invalid_name: "e_invalid_name",
    invalid_vintage: "e_invalid_vintage", invalid_vote: "e_invalid_vote", mode_not_allowed: "e_mode", unavailable: "e_unavailable", no_database: "e_unavailable",
    internal: "e_unavailable", no_token: "e_noaccess", invalid_guess: "e_invalid_guess", invalid_type: "e_invalid_type", revealed: "e_revealed", not_blind: "e_not_blind", wine_closed: "e_wine_closed" };
  function errText(e) {
    if (AUTH_CODES[e.code]) return t("e_access");
    return t(ERR_KEYS[e.code] || "e_generic");
  }

  function api(body) {
    var ctrl = window.AbortController ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, TIMEOUT_MS);
    var headers = { "Content-Type": "application/json" };
    if (S.session) headers.Authorization = "Bearer " + S.session;
    if (S.circle) body = Object.assign({}, body, { circle: S.circle });
    return fetch("/api/embed", { method: "POST", headers: headers, body: JSON.stringify(body), signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) {
        clearTimeout(timer);
        return r.json().catch(function () { return null; }).then(function (j) {
          if (r.headers.get("X-Sorso-Quota") === "readonly") S.quota = "readonly";
          if (!r.ok) throw mkErr((j && j.error && j.error.code) || (r.status >= 500 ? "unavailable" : "generic"), r.status);
          /* una risposta 200 che non è la nostra (portale di accesso, proxy) non è un successo */
          if (!j || typeof j !== "object" || Array.isArray(j)) throw mkErr("network");
          return j;
        });
      }, function (e) {
        clearTimeout(timer);
        throw mkErr(e && e.name === "AbortError" ? "timeout" : "network");
      });
  }

  /* Una sola azione alla volta per tipo: doppi tocchi e doppi clic non duplicano nulla. */
  function run(key, fn) {
    if (S.pending[key]) return Promise.resolve();
    S.pending[key] = true; render();
    return Promise.resolve().then(fn).then(function () { S.pending[key] = false; render(); }, function (e) { S.pending[key] = false; handleError(e); });
  }

  /* Errore di un'azione: se l'accesso è finito si passa alla schermata di rientro, altrimenti si
     mostra il messaggio al suo posto (vicino al modulo, o in cima), senza perdere quello che
     l'utente ha scritto. */
  function handleError(e, where) {
    if (e.status === 401) {
      /* il voto che si stava compilando resta come bozza e il sito ospite viene avvisato */
      var hadSheet = !!S.sheet;
      if (S.sheet) { S.drafts[S.sheet.wine] = S.sheet; S.sheet = null; }
      S.fatal = { code: e.code, session: true, retry: false, hadSheet: hadSheet };
      announce(t("e_session"), true); render(); askReauth("session"); return;
    }
    var text = errText(e);
    /* degustazione eliminata o chiusa da un altro mentre si lavorava: si torna a uno stato vero */
    if (e.code === "not_found" && S.view === "tasting" && !(where === "form" && S.form && S.form.kind === "wine" && false)) {
      var gone = S.tasting && S.tasting.id;
      S.tastings = S.tastings.filter(function (x) { return x.id !== gone; });     // sparisce subito dall'elenco, senza aspettare il ricarico
      S.tasting = null; S.wines = []; S.sheet = null; S.form = null; S.confirm = null; S.gform = null;
      S.view = "list"; S.notice = { kind: "err", text: t("e_gone") };
      announce(t("e_gone"), true); focusSel("#h-main");
      return loadState("");
    }
    if (e.code === "closed" || e.code === "revealed" || e.code === "wine_closed") {
      if (S.sheet) { S.drafts[S.sheet.wine] = S.sheet; S.sheet = null; text = t(e.code === "wine_closed" ? "e_wine_closed" : "e_closed_unsaved"); }
      if (S.gform && where === "gform") text = t("e_closed_guess");
      S.form = null; S.gform = null; S.notice = { kind: "err", text: text }; announce(text, true);
      return loadState(S.tasting && S.tasting.id, true);
    }
    if (where === "gform" && S.gform) S.gform.error = text;
    else if (where === "sheet" && S.sheet) S.sheet.error = text;
    else if (where === "form" && S.form) S.form.error = text;
    else S.notice = { kind: "err", text: text };
    announce(text, true);
    render();
  }

  /* ---------------- dati ---------------- */
  var loadSeq = 0;
  function loadState(tid, quiet) {
    var my = ++loadSeq;                              // solo l'ultima richiesta vale: una risposta lenta non ne scavalca una più recente
    if (!quiet) { S.loading = true; S.loadError = null; render(); }
    return api({ op: "state", tasting: tid || undefined }).then(function (st) {
      if (my !== loadSeq) return;
      if (!Array.isArray(st.tastings)) throw mkErr("network");
      S.loading = false; S.loadError = null;
      S.tastings = st.tastings || []; S.tasting = st.tasting || null; S.wines = st.wines || []; S.quota = st.quota || S.quota;
      if (S.sheet && !S.wines.some(function (w) { return w.id === S.sheet.wine; })) S.sheet = null;
      if (S.gform && (!S.wines.some(function (w) { return w.id === S.gform.wine; }) || (S.tasting && S.tasting.revealed))) S.gform = null;
      render();
      if (S.tasting && gameOn()) { loadGame(S.tasting.id); if (!S.board) loadBoard(); } else S.game = null;
    }).catch(function (e) {
      if (my !== loadSeq) return;
      S.loading = false;
      if (e.status === 401) return handleError(e);
      if (e.code === "not_found" && tid) { return handleError(e); }
      S.loadError = { text: errText(e), tasting: tid || "" };
      render();
    });
  }

  var statsSeq = 0;
  function loadStats() {
    var my = ++statsSeq;
    S.statsLoading = true; S.statsError = null; render();
    return api({ op: "stats" }).then(function (r) {
      if (my !== statsSeq) return;
      if (!r.stats || !Array.isArray(r.stats.events) || !r.stats.totals) throw mkErr("network");
      S.stats = r.stats; S.statsLoading = false; S.quota = S.quota; render();
    }).catch(function (e) {
      if (my !== statsSeq) return;
      S.statsLoading = false;
      if (e.status === 401) return handleError(e);
      S.statsError = { text: errText(e) }; render();
    });
  }

  var nbSeq = 0;
  function loadNotebook() {
    var my = ++nbSeq;
    S.nbLoading = true; S.nbError = null; render();
    return api({ op: "notebook" }).then(function (r) {
      if (my !== nbSeq) return;
      if (!r.notebook || !Array.isArray(r.notebook.rows)) throw mkErr("network");
      S.nb = r.notebook; S.nbLoading = false; render();
    }).catch(function (e) {
      if (my !== nbSeq) return;
      S.nbLoading = false;
      if (e.status === 401) return handleError(e);
      S.nbError = { text: errText(e) }; render();
    });
  }

  /* ---------------- accesso ---------------- */
  function cleanUrl() {
    try { history.replaceState({ v: "list" }, "", location.pathname + (S.circle ? "?c=" + encodeURIComponent(S.circle) : "?p=" + encodeURIComponent(S.partner))); } catch (e) { /* ok */ }
  }
  function login() {
    S.fatal = null; S.loading = true; render();
    var req = { op: "session", token: S.token };
    if (S.circle) { req = { op: "session", mode: hostPref("sorso-modo-predefinito"), lang: hostPref("sorso-lang") }; }
    return api(req).then(function (r) {
      if (!r.session || !r.user || !r.config || !Array.isArray(r.config.modes)) throw mkErr("network");
      /* un altro utente (o un altro team) sullo stesso iframe non deve vedere le bozze del precedente */
      var cambiato = !S.user || S.user.team !== r.user.team || S.user.name !== r.user.name || S.user.role !== r.user.role;
      if (cambiato) { S.drafts = {}; S.gdrafts = {}; S.sheet = null; S.form = null; S.gform = null; S.confirm = null; S.tasting = null; S.wines = []; S.tastings = []; S.stats = null; S.statsError = null; S.tab = "tastings"; S.view = "list"; S.notice = null; }
      if (!S.circle) S.session = r.session;     // nella cerchia la sessione è quella di Taste (stessa origine)
      S.user = r.user; S.config = r.config; S.quota = r.quota || "ok"; S.token = ""; S.fatal = null;
      S.lang = r.config.lang === "en" ? "en" : "it";
      document.documentElement.lang = S.lang;
      cleanUrl();
      return loadState(S.tasting && S.tasting.id);
    }, function (e) {
      S.loading = false;
      var transient = e.code === "network" || e.code === "timeout" || e.code === "rate_limited" || e.code === "unavailable" || e.status >= 500;
      S.fatal = { code: e.code, session: false, retry: transient };
      S.user = null;
      announce(errText(e), true);
      render();
      if (!transient) askReauth(e.code);
    });
  }

  /* ---------------- disegno ---------------- */
  function head() {
    var c = S.config || {};
    if (S.circle) return "";
    return '<header class="top">' + (c.logo ? '<img class="logo" alt="" src="' + esc(c.logo) + '">' : "") +
      '<h1 class="title" dir="auto">' + esc(c.title || "Taste") + '</h1>' +
      (S.user ? '<p class="who" dir="auto">' + esc(S.user.name) + '<br>' + esc(t(isOrg() ? "asOrganizer" : "asMember")) + '</p>' : "") + '</header>';
  }
  function notices() {
    var h = "";
    if (S.notice) h += '<p class="notice ' + (S.notice.kind === "err" ? "err" : S.notice.kind === "ok" ? "ok" : "") + '">' + esc(S.notice.text) + '</p>';
    if (readonly()) h += '<p class="notice warn">' + esc(t("e_readonly")) + '</p>';
    else if (S.quota === "warn" && isOrg()) h += '<p class="notice warn">' + esc(t("warnSoon")) + '</p>';
    return h;
  }
  function btn(act, label, opts) {
    opts = opts || {};
    return '<button type="' + (opts.type || "button") + '" class="btn' + (opts.cls ? " " + opts.cls : "") + '" data-act="' + act + '"' +
      (opts.id ? ' data-id="' + esc(opts.id) + '"' : "") + (opts.fk ? ' data-fk="' + esc(opts.fk) + '"' : "") +
      (opts.disabled ? ' aria-disabled="true"' : "") + (opts.describedby ? ' aria-describedby="' + opts.describedby + '"' : "") + '>' + esc(label) + '</button>';
  }

  function viewFatal() {
    var f = S.fatal, session = !!f.session;
    var h = head() + '<section class="card fatal"><h2>' + esc(t(session ? "authSessionTitle" : "authTitle")) + '</h2><p>' + esc(errText({ code: f.code })) + '</p>';
    if (session && f.hadSheet) h += '<p>' + esc(t("authUnsaved")) + '</p>';
    if (f.retry) h += '<div class="row">' + btn("retry-login", t("retry"), { cls: "primary", fk: "retry" }) + '</div>';
    else h += '<p>' + esc(t("authReload")) + '</p><div class="row">' + btn("reauth", t("authAsk"), { cls: "primary", fk: "reauth" }) + '</div>' +
      (f.asked ? '<p class="muted" role="status">' + esc(t("reauthAsked")) + '</p>' : "");
    return h + '</section>';
  }

  function formHtml(kind) {
    var f = S.form, v = f.vals, busy = !!S.pending[kind];
    var err = f.error ? '<p class="field-error" id="form-err">' + esc(f.error) + '</p>' : "";
    var h = '<form class="card" data-form="' + kind + '" novalidate' + (f.error ? ' aria-describedby="form-err"' : "") + '>';
    var typeOptions = function (sel) { return '<option value="">' + esc(t("typeNone")) + '</option>' + ["Rosso", "Bianco", "Rosato", "Spumante", "Passito"].map(function (x) { return '<option value="' + x + '"' + (sel === x ? " selected" : "") + '>' + esc(t("tp_" + x)) + '</option>'; }).join(""); };
    if (kind === "single") h += '<p class="muted small">' + esc(t("singleHint")) + '</p>';
    h += '<label class="f" for="f-name">' + esc(t(kind === "tasting" ? "tastingName" : "wineName")) + '</label>' +
      '<input type="text" id="f-name" name="name" data-fk="f-name" maxlength="' + (kind === "tasting" ? 80 : 100) + '" autocomplete="off" enterkeyhint="done" dir="auto" value="' + esc(v.name) + '"' + (f.error ? ' aria-invalid="true"' : "") + '>';
    if (kind === "wine" || kind === "single") {
      h += '<label class="f" for="f-prod">' + esc(t("producer")) + '</label><input type="text" id="f-prod" name="producer" data-fk="f-prod" maxlength="80" autocomplete="off" dir="auto" value="' + esc(v.producer) + '">' +
        '<label class="f" for="f-vint">' + esc(t("vintage")) + '</label><input type="text" id="f-vint" name="vintage" data-fk="f-vint" maxlength="4" inputmode="text" autocomplete="off" value="' + esc(v.vintage) + '">' +
        '<label class="f" for="f-type">' + esc(t("wineType")) + '</label><select id="f-type" name="type" data-fk="f-type">' + typeOptions(v.type) + '</select>' +
        '<label class="f" for="f-grape">' + esc(t("wineGrape")) + '</label><input type="text" id="f-grape" name="grape" data-fk="f-grape" maxlength="40" autocomplete="off" dir="auto" value="' + esc(v.grape) + '">' +
        '<label class="f" for="f-region">' + esc(t("wineRegion")) + '</label><input type="text" id="f-region" name="region" data-fk="f-region" maxlength="40" autocomplete="off" dir="auto" value="' + esc(v.region || "") + '">';
    } else {
      h += '<label class="check"><input type="checkbox" name="blind" data-fk="f-blind"' + (v.blind ? " checked" : "") + '> <span>' + esc(t("blindCreate")) + '</span></label>';
    }
    var crea = kind !== "wine";
    h += err + '<div class="row">' + btn("submit-form", t(busy ? (crea ? "creating" : "adding") : (crea ? "create" : "add")), { type: "submit", cls: "primary", disabled: busy || readonly(), fk: "f-submit" }) +
      btn("cancel-form", t(kind === "wine" ? "done" : "cancel"), { cls: "ghost", fk: "f-cancel" }) + '</div></form>';
    return h;
  }

  function tabsHtml() {
    var tabs = [["tastings", "tabTastings"], ["notebook", "tabNotebook"], ["ranking", "tabRanking"], ["stats", "tabStats"]];
    return '<nav class="tabs" aria-label="' + esc(t("tabsLabel")) + '">' + tabs.map(function (x) {
      var on = S.tab === x[0];
      return '<button type="button" class="tab' + (on ? " on" : "") + '" data-act="tab" data-tab="' + x[0] + '" data-fk="tab-' + x[0] + '"' + (on ? ' aria-current="page"' : "") + '>' + esc(t(x[1])) + '</button>';
    }).join("") + '</nav>';
  }
  function badgesHtml(x) {
    var h = '<span class="badge ' + (x.status === "open" ? "open" : "") + '">' + esc(t(x.status === "open" ? "open" : "closedBadge")) + '</span>';
    if (x.blind) h += ' <span class="badge">' + esc(t(x.revealed ? "revealedBadge" : "blindBadge")) + '</span>';
    if (x.single) h += ' <span class="badge">' + esc(t("singleBadge")) + '</span>';
    return h;
  }

  function statsErrorHtml() {
    return '<div class="card"><p class="err-text">' + esc(S.statsError.text) + '</p><div class="row">' + btn("refresh-stats", t("retry"), { cls: "primary", fk: "retry" }) + '</div></div>';
  }
  function bar(label, value, max, shown) {
    return '<div class="bar"><span class="lab" dir="auto">' + esc(label) + '</span><progress max="' + max + '" value="' + value + '" aria-label="' + esc(label + ": " + shown) + '"></progress><b>' + esc(shown) + '</b></div>';
  }

  /* classifica delle serate: le degustazioni chiuse e il vino che ha vinto */
  function viewRanking() {
    var h = '<div class="row spread"><h2 id="h-main" tabindex="-1">' + esc(t("eventsHeading")) + '</h2>' + btn("refresh-stats", t("refresh"), { cls: "small ghost", fk: "refresh" }) + '</div>' + boardHtml();
    h += '<p class="muted small">' + esc(t("eventsHint")) + '</p>';
    if (S.statsError) return h + statsErrorHtml();
    if (S.statsLoading && !S.stats) return h + '<p class="muted" aria-busy="true">' + esc(t("loading")) + '</p>';
    var ev = S.stats ? S.stats.events : [];
    if (!ev.length) return h + '<p class="muted">' + esc(t("noEvents")) + '</p>';
    ev.forEach(function (e) {
      var w = e.winner, line;
      if (w) line = '<span class="small muted">' + esc(t("winner")) + (w.tie ? " (" + esc(t("winnerTie")) + ")" : "") + '</span><br><b dir="auto">' + esc(nameOf(w)) + '</b> · ' + dec(w.average);
      else if (e.blind && !e.revealed) line = '<span class="small muted">' + esc(t("blindHidden")) + '</span>';
      else line = '<span class="small muted">' + esc(t("noWinner")) + '</span>';
      h += '<button type="button" class="card link" data-act="open" data-id="' + esc(e.id) + '" data-fk="open-' + esc(e.id) + '"><span class="row spread"><span class="name" dir="auto">' + esc(e.name) +
        '</span><span class="small muted">' + esc(whenText(e.createdAt)) + '</span></span><span class="small muted">' + esc(e.wines === 1 ? t("wineCountOne") : t("wineCount", { n: e.wines })) + '</span><br>' + line + '</button>';
    });
    return h;
  }

  function viewStats() {
    var h = '<div class="row spread"><h2 id="h-main" tabindex="-1">' + esc(t("statsHeading")) + '</h2>' + btn("refresh-stats", t("refresh"), { cls: "small ghost", fk: "refresh" }) + '</div>';
    if (S.statsError) return h + statsErrorHtml();
    var st = S.stats;
    if (!st) return h + '<p class="muted" aria-busy="true">' + esc(t("loading")) + '</p>';
    if (st.window.tastings) h += '<p class="muted small">' + esc(t(st.window.tastings === 1 ? "statsHintOne" : "statsHint", { n: st.window.tastings }) + (st.at ? " " + t("statsUpdated", { h: timeText(st.at) }) : "")) + '</p>';
    if (!st.window.tastings) return h + '<p class="muted">' + esc(t("statsEmpty")) + '</p>';
    var m = st.mine;
    h += '<h3 class="section">' + esc(t("mineHeading")) + '</h3>';
    if (!m || !m.votes) h += '<p class="muted">' + esc(t("noMine")) + '</p>';
    else {
      h += '<div class="score-line"><div class="tile hi"><div class="band">' + esc(t("myAverage")) + '</div><div class="big">' + dec(m.average) + '</div><div class="band">' + esc(plural(m.votes, "voteSingle", "votePlural")) + '</div></div>' +
        '<div class="tile"><div class="band">' + esc(t("myBest")) + '</div><div class="big">' + m.best.score + '</div><div class="band" dir="auto">' + esc(nameOf(m.best)) + '</div></div></div>';
      if (m.vsTeam) {
        var d = m.vsTeam.diff;
        h += '<p class="chips"><span class="chip">' + esc(Math.abs(d) < 0.05 ? t("sevSame") : d < 0 ? t("sevMore", { n: dec(Math.abs(d)) }) : t("sevLess", { n: dec(d) })) + '</span></p>';
      }
    }
    h += '<h3 class="section">' + esc(t("teamHeading")) + '</h3><div class="score-line"><div class="tile team"><div class="band">' + esc(t("stAverage")) + '</div><div class="big team">' + (st.average == null ? "—" : dec(st.average)) + '</div><div class="band">' + esc(plural(st.totals.closed, "stTastingOne", "stTastingMany")) + '</div></div>' +
      '<div class="tile"><div class="band">' + esc(t("stVotes")) + '</div><div class="big">' + st.totals.votes + '</div><div class="band">' + esc(t("stWines")) + ': ' + st.totals.wines + '</div></div></div>';
    if (st.top.length) {
      h += '<h4 class="grp">' + esc(t("topWines")) + '</h4><ol class="toplist">' + st.top.map(function (x) {
        return '<li><span class="nm" dir="auto"><b>' + esc(nameOf(x)) + '</b><br><span class="small muted" dir="auto">' + esc(x.tastingName) + '</span></span><span class="av">' + dec(x.avg) + '</span></li>';
      }).join("") + '</ol>';
    }
    var maxW = Math.max.apply(null, st.distribution.map(function (b) { return b.wines; }).concat([1]));
    if (st.distribution.some(function (b) { return b.wines > 0; })) h += '<h4 class="grp">' + esc(t("distHeading")) + '</h4>' + st.distribution.map(function (b) { return bar(t("d_" + b.key), b.wines, maxW, String(b.wines)); }).join("");
    if (st.byType.length) h += '<h4 class="grp">' + esc(t("byTypeHeading")) + '</h4>' + st.byType.map(function (b) { return bar(t("tp_" + b.type), b.average, 100, dec(b.average)); }).join("");
    if (st.byGrape && st.byGrape.length) h += '<h4 class="grp">' + esc(t("byGrapeHeading")) + '</h4>' + st.byGrape.map(function (b) { return bar(b.grape + " (" + b.wines + ")", b.average, 100, dec(b.average)); }).join("");
    var trend = st.events.filter(function (e) { return e.average != null; }).slice(0, 10).reverse();
    if (trend.length > 1) h += '<h4 class="grp">' + esc(t("trendHeading")) + '</h4>' + trend.map(function (e) { return bar(e.name, e.average, 100, dec(e.average)); }).join("");
    return h;
  }

  /* taccuino del team / della cerchia: i vini assaggiati insieme, con il proprio voto e la media */
  function nbMatch(r, q) {
    if (!q) return true;
    var hay = [r.wine.hidden ? t("blindLabel", { n: r.wine.index }) : r.wine.name, r.wine.producer, r.wine.vintage, r.wine.grape, r.tasting.name].join(" ").toLowerCase();
    return q.toLowerCase().split(/\s+/).every(function (w) { return !w || hay.indexOf(w) >= 0; });
  }
  function nbDiffChip(d) {
    if (d == null) return "";
    var a = Math.abs(d), txt = a < 0.05 ? "=" : (d > 0 ? "+" : "−") + dec(a);
    return '<span class="nb-diff' + (a >= 3 ? (d > 0 ? " up" : " down") : "") + '">' + esc(txt) + '</span>';
  }
  function nbMini(x) {
    return '<li><button type="button" class="nb-mini" data-act="open" data-id="' + esc(x.tasting) + '"><span class="nm" dir="auto"><b>' + esc(nameOf(x.wine)) + '</b><span class="small muted" dir="auto">' + esc(x.tastingName) + '</span></span>' +
      '<span class="nb-nums"><span>' + esc(t("nbYou")) + ' <b>' + x.mine + '</b></span><span>' + esc(t("nbTeam")) + ' <b>' + dec(x.team) + '</b></span>' + nbDiffChip(x.diff) + '</span></button></li>';
  }
  function viewNotebook() {
    var h = '<div class="row spread"><h2 id="h-main" tabindex="-1">' + esc(t("nbHeading")) + '</h2>' + btn("refresh-nb", t("refresh"), { cls: "small ghost", fk: "refresh" }) + '</div>';
    h += '<p class="muted small">' + esc(t("nbHint")) + '</p>';
    if (S.nbError) return h + '<div class="card"><p class="err-text">' + esc(S.nbError.text) + '</p><div class="row">' + btn("refresh-nb", t("retry"), { cls: "primary", fk: "retry" }) + '</div></div>';
    var nb = S.nb;
    if (!nb) return h + '<p class="muted" aria-busy="true">' + esc(t("loading")) + '</p>';
    if (!nb.rows.length) return h + '<p class="muted">' + esc(t("nbEmpty")) + '</p>';
    var sm = nb.summary;
    h += '<div class="score-line nb-tiles"><div class="tile"><div class="band">' + esc(t("nbWines")) + '</div><div class="big">' + sm.wines + '</div><div class="band">' + esc(sm.tastings === 1 ? t("nbInOne") : t("nbInTastings", { n: sm.tastings })) + '</div></div>' +
      '<div class="tile hi"><div class="band">' + esc(t("nbMyAvg")) + '</div><div class="big">' + (sm.myAverage == null ? "—" : dec(sm.myAverage)) + '</div><div class="band">' + esc(t("nbMyVotes")) + ': ' + sm.votes + '</div></div></div>';
    if (sm.shared) {
      var d = Scoring.roundHalfUp(sm.mineOnShared - sm.teamOnShared, 1);
      h += '<p class="chips"><span class="chip">' + esc(Math.abs(d) < 0.05 ? t("sevSame") : d < 0 ? t("sevMore", { n: dec(Math.abs(d)) }) : t("sevLess", { n: dec(d) })) + '</span> <span class="small muted">' +
        esc(t("nbYou") + " " + dec(sm.mineOnShared) + " · " + t("nbTeam") + " " + dec(sm.teamOnShared) + " — " + t("nbOnShared", { n: sm.shared })) + '</span></p>';
    }
    if (sm.apart && sm.apart.length) h += '<h4 class="grp">' + esc(t("nbApart")) + '</h4><ul class="nb-minis">' + sm.apart.map(nbMini).join("") + '</ul>';
    if (sm.agree && sm.agree.length) h += '<h4 class="grp">' + esc(t("nbAgree")) + '</h4><ul class="nb-minis">' + sm.agree.map(nbMini).join("") + '</ul>';
    /* ricerca, ordinamento, filtro */
    h += '<div class="nb-ctl"><label class="f" for="nb-q">' + esc(t("nbSearch")) + '</label><input type="search" id="nb-q" data-fk="nb-q" autocomplete="off" value="' + esc(S.nbq) + '">' +
      '<div class="row spread nb-ctl2"><label class="small" for="nb-sort">' + esc(t("nbSort")) + ' <select id="nb-sort" data-fk="nb-sort">' + ["date", "team", "mine", "diff"].map(function (k) { return '<option value="' + k + '"' + (S.nbsort === k ? " selected" : "") + '>' + esc(t("so_" + k)) + '</option>'; }).join("") + '</select></label>' +
      '<label class="check small"><input type="checkbox" id="nb-only" data-fk="nb-only"' + (S.nbOnly ? " checked" : "") + '> <span>' + esc(t("nbOnly")) + '</span></label></div></div>';
    var rows = nb.rows.filter(function (r) { return (!S.nbOnly || r.mine != null) && nbMatch(r, S.nbq.trim()); });
    var key = { date: function (r) { return r.tasting.createdAt; }, team: function (r) { return r.team == null ? -1 : r.team; }, mine: function (r) { return r.mine == null ? -1 : r.mine; },
      diff: function (r) { return r.mine == null || r.team == null ? -1 : Math.abs(r.mine - r.team); } }[S.nbsort] || function (r) { return r.tasting.createdAt; };
    rows = rows.slice().sort(function (a, b) { return key(b) - key(a) || b.tasting.createdAt - a.tasting.createdAt; });
    h += '<p class="small muted" role="status">' + esc(rows.length === 1 ? t("nbOne") : t("nbCount", { n: rows.length })) + '</p>';
    if (!rows.length) return h + '<p class="muted">' + esc(t("nbNone")) + '</p>';
    h += '<ul class="nb-list">' + rows.slice(0, 300).map(function (r) {
      var w = r.wine, sub = [w.hidden ? "" : w.producer, w.hidden ? "" : w.vintage].filter(Boolean).join(" · ");
      var d = r.mine != null && r.team != null && r.count >= 2 ? r.mine - r.team : null;
      return '<li><button type="button" class="card link nb-row" data-act="open" data-id="' + esc(r.tasting.id) + '" data-fk="nb-' + esc(r.tasting.id + "-" + w.id) + '">' +
        '<span class="nm" dir="auto"><b>' + esc(nameOf(w)) + '</b>' + (sub ? '<span class="small muted" dir="auto">' + esc(sub) + '</span>' : "") +
        '<span class="small muted" dir="auto">' + esc(r.tasting.name + " · " + whenText(r.tasting.createdAt)) + '</span></span>' +
        '<span class="nb-nums"><span>' + esc(t("nbYou")) + ' <b>' + (r.mine == null ? "—" : r.mine) + '</b></span><span>' + esc(t("nbTeam")) + ' <b>' + (r.team == null ? "—" : dec(r.team)) + '</b></span>' +
        (r.mine == null ? '<span class="small muted">' + esc(t("nbNoVote")) + '</span>' : r.team == null ? '<span class="small muted">' + esc(t("nbHiddenAvg")) + '</span>' : nbDiffChip(d)) + '</span></button></li>';
    }).join("") + '</ul>';
    return h;
  }

  function viewList() {
    var org = isOrg(), h = head() + notices() + tabsHtml();
    if (S.tab === "ranking") return h + viewRanking();
    if (S.tab === "stats") return h + viewStats();
    if (S.tab === "notebook") return h + viewNotebook();
    h += '<div class="row spread"><h2 id="h-main" tabindex="-1">' + esc(t("tastings")) + '</h2>' + btn("refresh", t("refresh"), { cls: "small ghost", fk: "refresh" }) + '</div>';
    h += '<p class="muted small">' + esc(t(org ? "tastingsHintOrg" : "tastingsHint")) + '</p>';
    if (S.loadError) return h + loadErrorHtml();
    if (S.loading && !S.tastings.length) return h + '<p class="muted" aria-busy="true">' + esc(t("loading")) + '</p>';
    if (org) h += S.form && (S.form.kind === "tasting" || S.form.kind === "single") ? formHtml(S.form.kind) : '<p class="row">' + btn("new-tasting", t("newTasting"), { cls: "primary", disabled: readonly(), fk: "new-tasting" }) + btn("new-single", t("singleWine"), { disabled: readonly(), fk: "new-single" }) + '</p>';
    if (!S.tastings.length) h += '<p class="muted">' + esc(org ? t("noTastingsOrg") : t("noTastings")) + '</p>';
    S.tastings.forEach(function (x) {
      h += '<button type="button" class="card link" data-act="open" data-id="' + esc(x.id) + '" data-fk="open-' + esc(x.id) + '"><span class="row spread"><span class="name" dir="auto">' + esc(x.name) +
        '</span><span class="badges">' + badgesHtml(x) + '</span></span></button>';
    });
    return h;
  }

  function loadErrorHtml() {
    return '<div class="card"><p class="err-text">' + esc(S.loadError.text) + '</p><div class="row">' + btn("retry-load", t("retry"), { cls: "primary", fk: "retry" }) + '</div></div>';
  }

  function wineCard(w, tOpen) {
    var open = tOpen && !w.closed;           // si può votare: serata aperta e vino non chiuso
    var h = '<article class="card wine' + (S.saved === w.id ? " just-saved" : "") + '" aria-labelledby="wn-' + esc(w.id) + '">' +
      '<h3 class="name" id="wn-' + esc(w.id) + '" dir="auto">' + esc(wineTitle(w)) + '</h3><p class="meta" dir="auto">' + wineLine(w) + '</p>';
    if (w.mine) {
      /* due blocchi affiancati: il tuo voto e la media del team (a colore pieno); dal 96 anche il tuo
         voto si colora: è l'unico momento in cui il colore occupa lo spazio */
      h += '<div class="score-line"><div class="tile' + (w.mine.score >= 96 ? " hi" : "") + '"><div class="band">' + esc(t("yourVote")) + '</div><div class="big">' + w.mine.score + '</div><div class="band">' + esc(bandWord(w.mine.score)) + '</div></div>';
      if (w.team) h += '<div class="tile team"><div class="band">' + esc(t("teamAvg")) + '</div><div class="big team">' + dec(w.team.avg) + '</div><div class="band">' + esc(plural(w.team.count, "voteSingle", "votePlural")) + '</div></div>';
      h += '</div>';
      if (w.team) {
        var diff = Scoring.roundHalfUp(w.mine.score - w.team.avg, 1);
        h += '<p class="chips"><span class="chip">' + esc(diff === 0 ? t("onAvg") : t(diff > 0 ? "aboveAvg" : "belowAvg", { n: dec(Math.abs(diff)) })) + '</span>' +
          '<span class="chip">' + esc(t(w.mine.mode === "full" ? "modeFull" : "modeSmart")) + '</span></p>';
      } else h += '<p class="chips"><span class="chip">' + esc(t(w.mine.mode === "full" ? "modeFull" : "modeSmart")) + '</span></p>';
      if (S.saved === w.id) h += '<p class="saved-note">✓ ' + esc(t("savedOk")) + '</p>';
    } else if (open) {
      h += '<p class="lock">' + esc(t("voteToSee")) + '</p>';
    } else if (w.team) {
      /* serata chiusa: la media (da due voti in su) la vedono tutti, anche chi non ha votato quel vino */
      h += '<div class="score-line"><div class="tile team"><div class="band">' + esc(t("teamAvg")) + '</div><div class="big team">' + dec(w.team.avg) + '</div><div class="band">' + esc(plural(w.team.count, "voteSingle", "votePlural")) + '</div></div></div>';
    } else {
      h += '<p class="lock">' + esc(t(tOpen ? "wineClosedNoVote" : "closedNoVote")) + '</p>';
    }
    if (tOpen && w.closed) h += '<p class="chips"><span class="chip">' + esc(t("wineClosedChip")) + '</span></p>';
    if (w.votes != null && !w.mine) h += '<p class="lock">' + esc(plural(w.votes, "votedSingle", "votedPlural")) + '</p>';
    if (S.drafts[w.id] && !(S.sheet && S.sheet.wine === w.id)) h += '<p class="lock">' + esc(t("draftKept")) + '</p>';
    var wrow = "";
    if (open) wrow += btn("vote", t(w.mine ? "editVote" : "vote"), { id: w.id, cls: w.mine ? "" : "primary", disabled: readonly(), fk: "vote-" + w.id });
    if (tOpen && isOrg() && !(S.tasting && S.tasting.revealed)) wrow += btn("wine-status", t(w.closed ? "wineReopen" : "wineClose"), { id: w.id, cls: "small ghost", disabled: readonly(), fk: "wstatus-" + w.id });
    if (wrow) h += '<div class="row">' + wrow + '</div>';
    return h + guessHtml(w) + gameHtml(w) + '</article>';
  }

  /* ---------------- alla cieca: ipotesi e risultato ---------------- */
  function guessChips(g) {
    var c = [];
    if (g.type) c.push('<span class="chip">' + esc(t("tp_" + g.type)) + '</span>');
    if (g.grape) c.push('<span class="chip" dir="auto">' + esc(g.grape) + '</span>');
    if (g.year) c.push('<span class="chip">' + esc(g.year) + '</span>');
    return '<p class="chips">' + c.join("") + '</p>';
  }
  function resChip(label, val, res) {
    return '<span class="chip ' + (res === "ok" ? "good" : res === "close" ? "near" : res === "ko" ? "bad" : "") + '">' + esc(label) + ': ' + esc(val || "—") + ' · ' + esc(t("gr_" + res)) + '</span>';
  }
  function guessHtml(w) {
    if (!isBlind()) return "";
    var tg = S.tasting, g = w.guess;
    if (tg.revealed) {
      var h = '<div class="guess"><h4 class="grp">' + esc(t("yourGuess")) + '</h4>';
      if (!g) h += '<p class="lock">' + esc(t("noGuess")) + '</p>';
      else {
        var r = w.guessResult || {}, c = [];
        if (g.type || r.type !== "na") c.push(resChip(t("gType"), g.type ? t("tp_" + g.type) : "", r.type || "na"));
        if (g.grape || r.grape !== "na") c.push(resChip(t("gGrape"), g.grape, r.grape || "na"));
        if (g.year || r.year !== "na") c.push(resChip(t("gYear").split(" (")[0], g.year, r.year || "na"));
        h += '<p class="chips">' + c.join("") + '</p>';
        if (r.max) h += '<p class="small"><b>' + esc(t("guessPoints", { p: r.points, m: r.max })) + '</b></p>';
      }
      var gs = w.guessStats;
      if (gs && !gs.hidden && gs.guessers > 0) h += '<p class="small muted">' + esc(t("groupGuess", { a: gs.type.correct + "/" + gs.type.answered, b: gs.grape.correct + "/" + gs.grape.answered, c: gs.year.exact + "/" + gs.year.answered })) + '</p>';
      return h + '</div>';
    }
    if (S.gform && S.gform.wine === w.id) return guessFormHtml(w);
    var open = tg.status === "open" && !w.closed, h2 = '<div class="guess"><h4 class="grp">' + esc(t("yourGuess")) + '</h4>';
    if (g) h2 += guessChips(g);
    if (S.saved === "g-" + w.id) h2 += '<p class="saved-note">✓ ' + esc(t("guessSaved")) + '</p>';
    if (open) h2 += '<div class="row">' + btn("guess", t(g ? "editGuess" : "writeGuess"), { id: w.id, cls: "small ghost", disabled: readonly(), fk: "guess-" + w.id }) + '</div>';
    else if (!g) h2 += '<p class="lock">' + esc(t("noGuess")) + '</p>';
    return h2 + '</div>';
  }
  function guessFormHtml(w) {
    var f = S.gform, v = f.vals, busy = !!S.pending.guess;
    var opts = '<option value="">' + esc(t("typeNone")) + '</option>' + ["Rosso", "Bianco", "Rosato", "Spumante", "Passito"].map(function (x) { return '<option value="' + x + '"' + (v.type === x ? " selected" : "") + '>' + esc(t("tp_" + x)) + '</option>'; }).join("");
    var h = '<form class="guess" data-form="guess" novalidate' + (f.error ? ' aria-describedby="g-err"' : "") + '><h4 class="grp" id="g-title" tabindex="-1">' + esc(t("guessTitle")) + '</h4><p class="small muted">' + esc(t("guessHint")) + '</p>' +
      '<label class="f" for="g-type">' + esc(t("gType")) + '</label><select id="g-type" name="type" data-fk="g-type">' + opts + '</select>' +
      '<label class="f" for="g-grape">' + esc(t("gGrape")) + '</label><input type="text" id="g-grape" name="grape" data-fk="g-grape" maxlength="40" autocomplete="off" dir="auto" value="' + esc(v.grape) + '">' +
      '<label class="f" for="g-year">' + esc(t("gYear")) + '</label><input type="text" id="g-year" name="year" data-fk="g-year" maxlength="4" autocomplete="off" value="' + esc(v.year) + '">';
    if (f.error) h += '<p class="field-error" id="g-err">' + esc(f.error) + '</p>';
    return h + '<div class="row">' + btn("submit-guess", t(busy ? "savingGuess" : "saveGuess"), { type: "submit", cls: "primary", disabled: busy || readonly(), fk: "g-submit" }) + btn("cancel-guess", t("cancel"), { cls: "ghost", fk: "g-cancel" }) + '</div></form>';
  }
  function submitGuess(form) {
    S.gform.vals = Object.assign(S.gform.vals, formVals(form));
    var v = S.gform.vals, wid = S.gform.wine;
    if (!v.type && !v.grape.trim() && !v.year.trim()) { S.gform.error = t("e_invalid_guess"); focusAfter("g-type"); announce(S.gform.error, true); return render(); }
    return run("guess", function () {
      return api({ op: "guess", tasting: S.tasting.id, wine: wid, type: v.type, grape: v.grape, year: v.year.trim() }).then(function () {
        S.gform = null; S.saved = "g-" + wid; announce(t("guessSaved")); focusAfter("guess-" + wid);
        setTimeout(function () { if (S.saved === "g-" + wid) { S.saved = null; render(); } }, 6000);
        return loadState(S.tasting.id, true);
      }, function (e) { return handleError(e, "gform"); });
    });
  }

  function confirmHtml() {
    var c = S.confirm, name = S.tasting ? S.tasting.name : "";
    var ask = c === "close" ? t("closeAsk") : c === "reopen" ? t("reopenAsk") : c === "reveal" ? t("revealAsk") : t("deleteAsk", { name: name });
    var key = c === "delete" ? "delete" : c === "reveal" ? "reveal" : "status";
    return '<div class="card confirm" role="group" aria-labelledby="confirm-q"><p id="confirm-q" dir="auto">' + esc(ask) + '</p><div class="row">' +
      btn("do-confirm", c === "delete" ? t("deleteIt") : c === "reveal" ? t("revealIt") : t("confirm"), { cls: c === "delete" ? "danger" : "primary", disabled: !!S.pending[key], fk: "confirm" }) + btn("cancel-confirm", t("cancel"), { cls: "ghost", fk: "cancel-confirm" }) + '</div></div>';
  }

  function viewTasting() {
    var org = isOrg(), open = S.tasting.status === "open";
    var h = head() + notices() + '<p>' + btn("back", t("back"), { cls: "small ghost", fk: "back" }) + '</p>';
    h += '<div class="row spread"><h2 id="h-main" tabindex="-1" dir="auto">' + esc(S.tasting.name) + '</h2><span class="badges">' + badgesHtml(S.tasting) + '</span></div>';
    if (isBlind()) h += '<p class="notice">' + esc(S.tasting.revealed ? t("revealedNote") : t(!open ? (org ? "blindClosedNoteOrg" : "blindClosedNote") : (org ? "blindNoteOrg" : "blindNote"))) + '</p>';
    else if (!open) h += '<p class="notice">' + esc(t("closedNote")) + '</p>';
    if (S.loadError) h += loadErrorHtml();
    h += '<div class="row">' + btn("refresh", t("refresh"), { cls: "small ghost", fk: "refresh" });
    if (org && !S.confirm) {
      if (isBlind() && !S.tasting.revealed) h += btn("ask-reveal", t("revealIt"), { cls: "small primary", disabled: readonly(), fk: "ask-reveal" });
      if (!S.tasting.revealed) h += btn("ask-status", t(open ? "closeIt" : "reopen"), { cls: "small ghost", disabled: readonly(), fk: "ask-status" });
      h += btn("ask-delete", t("deleteIt"), { cls: "small ghost danger", disabled: readonly(), fk: "ask-delete" });
    }
    h += '</div>';
    if (S.confirm) h += confirmHtml();
    var rk = ranking(S.wines);
    if (rk.length >= 2) {
      h += '<h3 class="section">' + esc(t("rankHeading")) + '</h3><p class="muted small">' + esc(open ? t("rankProvisional") : t("rankFinal")) + '</p><ol class="toplist">' + rk.map(function (w) {
        var ties = rk.filter(function (o) { return o.rank === w.rank; }).length > 1;
        return '<li><span class="pos">' + w.rank + '</span><span class="nm" dir="auto"><b>' + esc(wineTitle(w)) + '</b>' + (ties ? ' <span class="small muted">(' + esc(t("rankTie")) + ')</span>' : "") + '<br><span class="small muted">' + esc(plural(w.team.count, "voteSingle", "votePlural")) + '</span></span><span class="av">' + dec(w.team.avg) + '</span></li>';
      }).join("") + '</ol>';
    }
    h += novitaHtml() + helpHtml() + planciaHtml();
    h += '<h3 class="section">' + esc(t("wines")) + '</h3>';
    if (org && open && !(S.tasting && S.tasting.single)) h += S.form && S.form.kind === "wine" ? formHtml("wine") : '<p>' + btn("new-wine", t("addWine"), { disabled: readonly(), fk: "new-wine" }) + '</p>';
    if (S.loading && !S.wines.length) h += '<p class="muted" aria-busy="true">' + esc(t("loading")) + '</p>';
    else if (!S.wines.length) h += '<p class="muted">' + esc(org ? t("noWinesOrg") : t("noWines")) + '</p>';
    S.wines.forEach(function (w) { h += (S.sheet && S.sheet.wine === w.id) ? sheetHtml(w) : wineCard(w, open); });
    return h;
  }

  /* ---------------- il gioco delle cerchie (api/_game.js) ----------------
     Per ogni vino: il campo (la tua faccia su due assi), il pronostico della media del gruppo e il prezzo a occhio.
     Fino allo svelamento ognuno vede solo le proprie mosse e chi ha già giocato; poi tutti vedono tutto di tutti. */
  var TXT_GAME = {
    it: {
      g_title: "Il gioco", g_secret: "Le mosse restano segrete fino allo svelamento", g_revealed: "Svelato",
      g_field: "Il campo", g_fieldHint: "Tocca o trascina la tua faccia dove senti questo vino. Con la tastiera: frecce.", g_fieldEmpty: "Tocca il campo per metterti",
      g_pron: "Pronostico: quanto darà il gruppo?", g_price: "Quanto costa? (€, facoltativo)", g_pricePh: "es. 18",
      g_play: "Gioca", g_update: "Aggiorna le mosse", g_playing: "Salvo…", g_saved: "Mosse salvate. Si vedranno allo svelamento.",
      g_played: "Hanno giocato", g_missing: "{n} ancora da votare", g_missingOne: "1 ancora da votare", g_allVoted: "Hanno votato tutti",
      g_orgTitle: "Per chi organizza", g_realPrice: "Prezzo vero (€)", g_savePrice: "Salva il prezzo", g_reveal: "Svela!", g_revealAsk: "Svelare questo vino? Da quel momento non si cambiano più le mosse.",
      g_priceSaved: "Prezzo salvato: si vedrà allo svelamento.",
      g_avg: "Media del gruppo: {n}", g_realPriceIs: "Prezzo vero: {p} €", g_center: "centro del gruppo",
      g_vote: "Voto", g_pronShort: "Pronostico", g_priceShort: "Prezzo", g_fieldShort: "Campo", g_pts: "{n} punti", g_ptsOne: "1 punto",
      g_noMove: "non ha giocato", g_you: "tu",
      g_b_fuori: "Fuori dal coro", g_b_sintonia: "In sintonia", g_b_pronostico: "Pronostico d'oro", g_b_prezzo: "Naso da sommelier",
      g_react: "Reagisci a {name}", g_phrase: "Una frecciatina…", g_noPhrase: "Nessuna frecciatina",
      f1: "Hai annusato il tappo?", f2: "Palato da bollicine al discount", f3: "Sommelier in incognito", f4: "Questo l'hai bevuto con gli occhi", f5: "Generoso come a Natale",
      f6: "Severo come un professore", f7: "Hai sbagliato bicchiere?", f8: "Naso da segugio", f9: "Ma era lo stesso vino?", f10: "Applausi, palato d'oro",
      f11: "Il tuo naso è in ferie?", f12: "Hai bevuto con il naso tappato?", f13: "Questo vino ti ha fatto la corte", f14: "Palato da mensa aziendale", f15: "Il sommelier dei poveri",
      f16: "Hai votato a occhi chiusi?", f17: "Ti regalo un corso da sommelier", f18: "Critico gastronomico in incognito", f19: "Hai confuso il rosso con il bianco?", f20: "Più generoso di Babbo Natale",
      pl_title: "La plancia della serata",
      sm_title: "Sfida di {m}", sm_days: "Mancano {n} giorni", sm_day1: "Ultimo giorno!", sm_you: "Sei {pos}º con {n} punti", sm_noyou: "Nessun punto questo mese: il primo vino svelato apre la gara.", sm_lead: "In testa: {name} con {n}",
      th_naso: "Il mese del naso", thd_naso: "I punti della caccia agli aromi valgono doppio.", th_portafoglio: "Il mese del portafoglio", thd_portafoglio: "I punti di «Quanto costa?» valgono doppio.",
      th_pronostico: "Il mese del pronostico", thd_pronostico: "I punti del pronostico valgono doppio.", th_campo: "Il mese del campo", thd_campo: "I punti del campo valgono doppio.",
      th_cuore: "Il mese del cuore", thd_cuore: "Il vino in una parola e il fan numero uno valgono doppio.", th_duelli: "Il mese dei duelli", thd_duelli: "I duelli vinti valgono doppio.",
      du_title: "Duelli", du_rule: "Sfida un collega su un vino: chi fa più punti di gioco su quel vino vince il duello e 5 punti. Chi perde paga la posta (una penitenza bonaria, mai soldi).",
      du_new: "⚔️ Lancia un duello", du_who: "Chi sfidi?", du_wine: "Su quale vino?", du_stake: "La posta: chi perde…", du_go: "Sfida!", du_cancelForm: "Annulla",
      du_incoming: "{name} ti sfida su «{wine}»!", du_accept: "Accetto la sfida", du_decline: "Rifiuto 🐔", du_pending: "in attesa di risposta", du_accepted: "accettato: si decide allo svelamento",
      du_declined: "rifiutato 🐔", du_expired: "nessuna risposta in tempo", du_won: "vince {name}", du_tie: "pareggio", du_cancel: "Ritira", du_none: "Nessun duello stasera. Chi ha il coraggio?",
      du_vs: "{a} sfida {b}", du_stakeIs: "Chi perde {stake}.", du_taunt: "Gongola con una frase…", du_noTaunt: "Nessuna frase", du_rematch: "Rivincita", du_sent: "Sfida lanciata!", du_gongola: "{name} gongola:",
      du_pickAll: "Scegli avversario, vino e posta.", du_noWines: "Tutti i vini sono già svelati: i duelli si lanciano prima.",
      e_too_many: "Hai già lanciato tre duelli in questa serata.", e_duel_exists: "Tra voi due c'è già un duello su questo vino.", e_invalid_stake: "Scegli la posta.", e_invalid_target: "Scegli un avversario.", e_answered: "Hai già risposto.",
      st_vino: "porta il vino la prossima volta", st_versa: "versa il vino a tutti", st_caffe: "offre il caffè", st_recensione: "scrive la recensione più poetica della serata",
      st_brindisi: "fa un brindisi in rima", st_peggiore: "assaggia per primo il vino più strano della prossima serata", st_cantina: "riordina il frigo dell'ufficio", st_sommelier: "fa il sommelier per tutta la prossima serata",
      t1: "Torna al succo di frutta 🧃", t2: "Il palato non si compra al supermercato 🛒", t3: "Ci vediamo alla rivincita… se hai coraggio 😏", t4: "Prendi appunti, ti servono 📝",
      t5: "Il vino si annusa, non si indovina 👃", t6: "Anche stasera il migliore sono io 👑", t7: "Ti presto il mio naso quando vuoi 🐽", t8: "Brindo alla tua sconfitta 🥂",
      pg_title: "La pagella della serata", pg_mvp: "MVP della serata", pg_nera: "Maglia nera 🐌", pg_generoso: "Il più generoso", pg_spietato: "Lo spietato", pg_duelli: "Re dei duelli",
      pgv_mvp: "{n} punti", pgv_nera: "{n} punti: c'è margine", pgv_generoso: "voti in media {n}", pgv_spietato: "voti in media {n}", pgv_duelli: "{n} duelli vinti", pgv_duelli1: "1 duello vinto",
      tc_title: "La telecronaca", tc_win: "{n} si prende il vino con {p} punti 🏆", tc_exact: "{n} ha centrato il pronostico: chiamatelo Nostradamus 🔮", tc_far: "{n} ha sbagliato il pronostico di {d} punti: serve un nuovo oroscopo 🙃",
      tc_cheap: "{n} pensava costasse {g} €, ne costa {p}: abituato al vino in brick? 🧃", tc_pricey: "{n} lo valutava {g} €: al ristorante lo fregano sempre 💸", tc_priceok: "{n} ha indovinato il prezzo: lavora in enoteca e non ce l'ha detto 🕵️",
      tc_fuori: "{n} era dall'altra parte del campo: ha bevuto un altro vino? 🧭", tc_sintonia: "{n} era al centro del gruppo: il diapason della serata 🎼", tc_twins: "{a} e {b} sullo stesso punto: gemelli separati alla nascita 👯",
      tc_selfok: "{n} si è scelto come fan numero uno, e aveva ragione: autostima a mille 😎", tc_selfko: "{n} si credeva il fan numero uno: non lo era 🙈",
      tc_love: "{n} gli ha dato {v}: o è innamorato o è il produttore 😍", tc_hate: "{n} gli ha dato {v}: spietato come un critico francese 🥖", tc_aroma: "{n} ha fatto tris di aromi: naso da segugio 🐕",
      tc_odd: "Per quasi tutti è «{w}», per {n} è «{w2}»: originale 🦄",
      hl_title: "Albo d'oro", hl_row: "{names}, {n} punti", bd_challenge: "Sfida del mese", du_chip: "⚔️ duelli {w}–{l}",
      g_n_fifone: "Il fifone 🐔", g_n_pistolero: "Il pistolero",
      a_duellante: "Duellante", ad_duellante: "Tre duelli vinti.", a_campione: "Campione del mese", ad_campione: "Hai vinto una sfida del mese.",
      h11t_: "I duelli", h11d: "Sfida un collega su un vino e scegli la posta: chi perde porta il vino, versa a tutti, fa un brindisi in rima…", h11p: "5 a chi fa più punti su quel vino.", h11t: "Rifiuti? Ti becchi il 🐔 e, dopo due rifiuti, il soprannome «Il fifone».",
      h12t_: "La sfida del mese", h12d: "Ogni mese un tema: il mese del naso, del portafoglio, dei duelli… Il gioco del tema vale doppio nella classifica del mese.", h12p: "Il primo del mese entra nell'albo d'oro e diventa «Campione del mese».", h12t: "Controlla il tema in cima alla serata.",
      h13t_: "Telecronaca e pagella", h13d: "Allo svelamento la telecronaca racconta il vino con qualche presa in giro; a serata chiusa arriva la pagella: MVP, maglia nera 🐌, il più generoso, lo spietato.", h13p: "Non danno punti: danno argomenti per la prossima serata.", h13t: "Il podio del vino ha le medaglie 🥇🥈🥉.",
      nv2_title: "Il gioco si è fatto serio!", nv2_text: "Duelli uno contro uno con la posta, la sfida del mese con l'albo d'oro, la telecronaca allo svelamento e la pagella della serata.",
      g_board: "Classifica del gioco", g_boardHint: "Punti della stagione su tutti i giochi dei vini svelati, più la scommessa della serata.", g_boardEmpty: "Ancora nessun vino svelato: la classifica parte dal primo svelamento.",
      g_n_generoso: "Il generoso", g_n_spietato: "Lo spietato", g_n_bastian: "Il bastian contrario", g_n_naso: "Naso d'oro", g_twin: "Gemello di palato: {name}",
      ax_corpo: "Corpo", ax_acidita: "Acidità", ax_tannino: "Tannino", ax_morbidezza: "Morbidezza", ax_frutto: "Frutto", ax_legno: "Legno",
      ax_intensita: "Intensità", ax_persistenza: "Persistenza", ax_dolcezza: "Dolcezza", ax_freschezza: "Freschezza",
      lo_corpo: "esile", hi_corpo: "pieno", lo_acidita: "piatta", hi_acidita: "tagliente", lo_tannino: "vellutato", hi_tannino: "ruvido", lo_morbidezza: "secco", hi_morbidezza: "rotondo",
      lo_frutto: "poco", hi_frutto: "tanto", lo_legno: "niente", hi_legno: "tanto", lo_intensita: "lieve", hi_intensita: "potente", lo_persistenza: "corto", hi_persistenza: "lunghissimo",
      lo_dolcezza: "secco", hi_dolcezza: "dolce", lo_freschezza: "stanco", hi_freschezza: "vivace",
      e_game_off: "In questa cerchia il gioco non è attivo.", e_revealed: "Questo vino è già svelato: le mosse non si cambiano più.", e_invalid_move: "Fai almeno una mossa: il campo, un pronostico, un aroma…",
      e_invalid_price: "Prezzo non valido.", e_not_revealed: "Le reazioni si lasciano dopo lo svelamento.",
      fav_title: "La scommessa della serata", fav_q: "Chi vince stasera? Scegli il vino che avrà la media più alta: se indovini, 10 punti.",
      fav_secret: "Le scommesse restano segrete fino alla chiusura della serata.", fav_mine: "Hai scommesso su questo", fav_pick: "Punta su questo vino",
      fav_who1: "1 persona ha scommesso", fav_whoN: "{n} persone hanno scommesso", fav_none: "Ancora nessuna scommessa",
      fav_won: "Hai indovinato il vincitore: +10 punti! 🎯", fav_lost: "Questa volta no: il vincitore era un altro.", fav_winner: "Ha vinto", fav_who: "Ci avevano puntato:", fav_nobody: "Nessuno ci aveva puntato.",
      fav_closed: "Serata chiusa: le scommesse sono chiuse.", fav_saved: "Scommessa salvata.", e_too_few: "Per scommettere servono almeno due vini.",
      bd_season: "Stagione", bd_month: "Questo mese", bd_streak: "{n} pronostici centrati di fila", bd_rival: "Nemesi: {name}", bd_monthEmpty: "Questo mese ancora nessun punto: il primo vino svelato apre la gara.",
      car_title: "La tua carriera", car_next: "{n} punti al livello {lv}", car_max: "Livello massimo: sei una leggenda!", car_best: "Record di serie: {n}",
      ach_title: "I tuoi traguardi", ach_count: "{n} su {m}", ach_locked: "da sbloccare",
      lv_0: "Apprendista", lv_1: "Assaggiatore", lv_2: "Cantiniere", lv_3: "Sommelier", lv_4: "Maestro", lv_5: "Leggenda",
      a_primo: "Primo sorso", ad_primo: "Hai fatto la tua prima mossa.", a_cecchino: "Cecchino", ad_cecchino: "Un pronostico a mezzo punto dalla media.",
      a_portafoglio: "Occhio al portafoglio", ad_portafoglio: "Un prezzo indovinato entro il 5%.", a_serie3: "In serie", ad_serie3: "Tre pronostici centrati di fila.",
      a_favorito: "Fiuto del vincitore", ad_favorito: "Hai indovinato il vino che vince la serata.", a_tris: "Tris", ad_tris: "Almeno 7 punti in pronostico, prezzo e campo sullo stesso vino.",
      a_diapason: "Diapason", ad_diapason: "Tre volte il più vicino al gruppo.", a_coro: "Voce fuori dal coro", ad_coro: "Tre volte il più lontano dal gruppo.",
      a_veterano: "Veterano", ad_veterano: "Dieci vini giocati.", a_re: "Re della cerchia", ad_re: "Primo in classifica, con almeno tre vini giocati.",
      g_youWon: "Il vino è tuo: primo in classifica! 🎉",
      g_s1: "Il campo", g_s2: "Il pronostico", g_s3: "Quanto costa?", g_s4: "Caccia agli aromi", g_s5: "Il vino in una parola", g_s6: "Il fan numero uno",
      g_r1: "Fino a 10 punti: più sei vicino al centro del gruppo, meglio è.", g_r2: "10 punti se centri la media, uno in meno per ogni punto di distanza.", g_r3: "Fino a 10 punti, quanto più ti avvicini al prezzo vero.",
      g_r4: "Scegli fino a 3 profumi: 3 punti per ognuno che è tra i preferiti del gruppo.", g_r5: "Se fosse una persona, com'è? 5 punti se scegli la parola più scelta.", g_r6: "Chi gli darà il voto più alto? 5 punti se indovini. Puoi scegliere anche te.",
      g_aromaCount: "{n} su 3", g_noseGroup: "Il naso del gruppo", g_wordGroup: "In una parola è…", g_fanGroup: "Il fan numero uno", g_fanGuess: "Lo avevano indovinato:", g_fanNobody: "Nessuno l'aveva indovinato.",
      g_aromaShort: "Aromi", g_wordShort: "Parola", g_fanShort: "Fan", g_noWords: "Nessuno ha scelto una parola.", g_noAromas: "Nessuno ha cercato aromi.", g_movesDone: "{n} giochi su 6",
      ar_rossi: "Frutti rossi", ar_neri: "Frutti neri", ar_agrumi: "Agrumi", ar_mela: "Mela e pera", ar_pesca: "Pesca e albicocca", ar_tropicale: "Tropicale", ar_fiori: "Fiori", ar_erbe: "Erbe",
      ar_spezie: "Spezie", ar_vaniglia: "Vaniglia", ar_tostato: "Tostato", ar_miele: "Miele", ar_burro: "Burro", ar_minerale: "Minerale", ar_cuoio: "Cuoio e tabacco", ar_terra: "Terra e sottobosco",
      pw_elegante: "Elegante", pw_potente: "Potente", pw_allegro: "Allegro", pw_timido: "Timido", pw_ruffiano: "Ruffiano", pw_austero: "Austero", pw_seducente: "Seducente", pw_rustico: "Rustico",
      pw_fresco: "Fresco", pw_morbido: "Morbido", pw_spigoloso: "Spigoloso", pw_meditazione: "Da meditazione",
      h_btn: "Come si gioca", h_close: "Chiudi le regole", h_title: "Come si gioca", h_intro: "Sei giochi per ogni vino, una scommessa e i duelli per la serata, una sfida al mese. Fai solo quelli che vuoi: ognuno dà punti per la classifica.",
      h_do: "Cosa fai", h_pts: "Punti", h_tip: "Il trucco",
      h1d: "Trascina la tua faccia sul piano: due assi, come corpo e acidità, che cambiano a ogni vino.", h1p: "Fino a 10, più sei vicino al centro del gruppo.", h1t: "Fidati del primo sorso.",
      h2d: "Indovina la media che darà il gruppo, da 50 a 100.", h2p: "10 se la centri, uno in meno per ogni punto di distanza.", h2t: "Pensa a chi c'è stasera: i generosi alzano la media.",
      h3d: "Scrivi quanto pensi costi la bottiglia (il prezzo vero lo scrive chi organizza).", h3p: "Fino a 10, in proporzione a quanto ti avvicini.", h3t: "Il prezzo non è il voto: un vino da 8 € può stupire.",
      h4d: "Scegli fino a tre profumi tra sedici: frutti rossi, spezie, vaniglia…", h4p: "3 per ogni aroma che è tra i preferiti del gruppo (scelto da almeno due).", h4t: "Meglio due aromi sicuri che tre a caso.",
      h5d: "Se il vino fosse una persona, com'è? Elegante, ruffiano, spigoloso, da meditazione…", h5p: "5 se scegli la parola più scelta dal gruppo.", h5t: "Allo svelamento il vino si prende il suo soprannome.",
      h6d: "Chi del gruppo gli darà il voto più alto? Puoi scegliere anche te.", h6p: "5 se indovini (a pari merito valgono tutti).", h6t: "Conosci i gusti dei colleghi meglio di loro?",
      h7t_: "La scommessa della serata", h7d: "Prima della chiusura punta sul vino che vincerà la serata.", h7p: "10 se indovini il vincitore.", h7t: "Le scommesse restano segrete fino alla fine.",
      h8t_: "Lo svelamento", h8d: "Le mosse restano segrete finché hanno votato tutti, il vino si chiude o chi organizza preme «Svela!».", h8p: "Poi tutti vedono tutto: facce sul campo, voti e punti.", h8t: "Puoi cambiare le mosse fino allo svelamento.",
      h9t_: "Reazioni e frecciatine", h9d: "Dopo lo svelamento lascia un'emoji o una frecciatina bonaria agli altri (mai a te stesso).", h9p: "Non danno punti, solo soddisfazioni.", h9t: "«Hai annusato il tappo?» è un classico.",
      h10t_: "Classifica, livelli e traguardi", h10d: "I punti si sommano nella stagione e nel mese: da Apprendista a Leggenda, con dieci traguardi da sbloccare.", h10p: "Serie 🔥, gemello di palato e nemesi ⚔️ arrivano da soli.", h10t: "Il podio può finire sul sito, ma solo se lo decidete voi.",
      nv_title: "Novità nel gioco!", nv_text: "Tre giochi nuovi per ogni vino: caccia agli aromi, il vino in una parola e il fan numero uno.", nv_ok: "Ho capito"
    },
    en: {
      g_title: "The game", g_secret: "Moves stay secret until the reveal", g_revealed: "Revealed",
      g_field: "The field", g_fieldHint: "Tap or drag your face to where you place this wine. With the keyboard: arrow keys.", g_fieldEmpty: "Tap the field to place yourself",
      g_pron: "Prediction: what will the group give it?", g_price: "How much does it cost? (€, optional)", g_pricePh: "e.g. 18",
      g_play: "Play", g_update: "Update my moves", g_playing: "Saving…", g_saved: "Moves saved. They'll show at the reveal.",
      g_played: "Played so far", g_missing: "{n} still to vote", g_missingOne: "1 still to vote", g_allVoted: "Everyone has voted",
      g_orgTitle: "For the organiser", g_realPrice: "Real price (€)", g_savePrice: "Save the price", g_reveal: "Reveal!", g_revealAsk: "Reveal this wine? From then on moves can't change.",
      g_priceSaved: "Price saved: it will show at the reveal.",
      g_avg: "Group average: {n}", g_realPriceIs: "Real price: €{p}", g_center: "group centre",
      g_vote: "Score", g_pronShort: "Prediction", g_priceShort: "Price", g_fieldShort: "Field", g_pts: "{n} points", g_ptsOne: "1 point",
      g_noMove: "didn't play", g_you: "you",
      g_b_fuori: "Out of tune", g_b_sintonia: "In sync", g_b_pronostico: "Golden prediction", g_b_prezzo: "Sommelier's nose",
      g_react: "React to {name}", g_phrase: "A friendly jab…", g_noPhrase: "No jab",
      f1: "Did you sniff the cork?", f2: "Discount-bubbles palate", f3: "Sommelier undercover", f4: "You drank this one with your eyes", f5: "Generous as Christmas",
      f6: "Strict as a schoolteacher", f7: "Wrong glass?", f8: "Bloodhound nose", f9: "Was it even the same wine?", f10: "Applause, golden palate",
      f11: "Is your nose on holiday?", f12: "Did you drink with a blocked nose?", f13: "This wine charmed you", f14: "Office-canteen palate", f15: "Budget sommelier",
      f16: "Did you score with your eyes shut?", f17: "I'll gift you a sommelier course", f18: "Food critic undercover", f19: "Did you mix up red and white?", f20: "More generous than Santa",
      pl_title: "Tonight's game board",
      sm_title: "{m} challenge", sm_days: "{n} days left", sm_day1: "Last day!", sm_you: "You're {pos}th with {n} points", sm_noyou: "No points this month: the first revealed wine starts the race.", sm_lead: "Leading: {name} with {n}",
      th_naso: "Nose month", thd_naso: "Aroma hunt points count double.", th_portafoglio: "Wallet month", thd_portafoglio: "«How much is it?» points count double.",
      th_pronostico: "Prediction month", thd_pronostico: "Prediction points count double.", th_campo: "Field month", thd_campo: "Field points count double.",
      th_cuore: "Heart month", thd_cuore: "The wine in one word and number one fan count double.", th_duelli: "Duel month", thd_duelli: "Duels won count double.",
      du_title: "Duels", du_rule: "Challenge a colleague on a wine: whoever scores more game points on it wins the duel and 5 points. The loser pays the stake (a friendly forfeit, never money).",
      du_new: "⚔️ Start a duel", du_who: "Who do you challenge?", du_wine: "On which wine?", du_stake: "The stake: the loser…", du_go: "Challenge!", du_cancelForm: "Cancel",
      du_incoming: "{name} challenges you on «{wine}»!", du_accept: "I accept", du_decline: "Decline 🐔", du_pending: "waiting for an answer", du_accepted: "accepted: decided at the reveal",
      du_declined: "declined 🐔", du_expired: "no answer in time", du_won: "{name} wins", du_tie: "draw", du_cancel: "Withdraw", du_none: "No duels tonight. Who dares?",
      du_vs: "{a} challenges {b}", du_stakeIs: "The loser {stake}.", du_taunt: "Gloat with a line…", du_noTaunt: "No line", du_rematch: "Rematch", du_sent: "Challenge sent!", du_gongola: "{name} gloats:",
      du_pickAll: "Pick an opponent, a wine and a stake.", du_noWines: "All wines are revealed: duels start before.",
      e_too_many: "You've already started three duels tonight.", e_duel_exists: "You two already have a duel on this wine.", e_invalid_stake: "Pick the stake.", e_invalid_target: "Pick an opponent.", e_answered: "You've already answered.",
      st_vino: "brings the wine next time", st_versa: "pours for everyone", st_caffe: "buys the coffee", st_recensione: "writes the evening's most poetic review",
      st_brindisi: "makes a rhyming toast", st_peggiore: "tastes the strangest wine first next time", st_cantina: "tidies the office fridge", st_sommelier: "plays sommelier all next evening",
      t1: "Back to fruit juice 🧃", t2: "A palate isn't sold at the supermarket 🛒", t3: "See you at the rematch… if you dare 😏", t4: "Take notes, you need them 📝",
      t5: "Wine is smelled, not guessed 👃", t6: "Best again tonight: me 👑", t7: "I'll lend you my nose anytime 🐽", t8: "Cheers to your defeat 🥂",
      pg_title: "Tonight's report card", pg_mvp: "MVP of the night", pg_nera: "Wooden spoon 🐌", pg_generoso: "Most generous", pg_spietato: "Ruthless", pg_duelli: "Duel king",
      pgv_mvp: "{n} points", pgv_nera: "{n} points: room to improve", pgv_generoso: "average score {n}", pgv_spietato: "average score {n}", pgv_duelli: "{n} duels won", pgv_duelli1: "1 duel won",
      tc_title: "The commentary", tc_win: "{n} takes the wine with {p} points 🏆", tc_exact: "{n} nailed the prediction: call them Nostradamus 🔮", tc_far: "{n} missed the prediction by {d} points: time for a new horoscope 🙃",
      tc_cheap: "{n} thought it cost €{g}, it's €{p}: used to boxed wine? 🧃", tc_pricey: "{n} valued it at €{g}: restaurants must love them 💸", tc_priceok: "{n} guessed the price: works in a wine shop and never told us 🕵️",
      tc_fuori: "{n} was across the field: did they drink another wine? 🧭", tc_sintonia: "{n} was right at the group's centre: tonight's tuning fork 🎼", tc_twins: "{a} and {b} on the same spot: separated at birth 👯",
      tc_selfok: "{n} picked themselves as number one fan, and was right: confidence at max 😎", tc_selfko: "{n} thought they were the number one fan: they weren't 🙈",
      tc_love: "{n} gave it {v}: either in love or the producer 😍", tc_hate: "{n} gave it {v}: ruthless as a French critic 🥖", tc_aroma: "{n} hit an aroma hat trick: bloodhound nose 🐕",
      tc_odd: "For almost everyone it's «{w}», for {n} it's «{w2}»: original 🦄",
      hl_title: "Hall of fame", hl_row: "{names}, {n} points", bd_challenge: "Monthly challenge", du_chip: "⚔️ duels {w}–{l}",
      g_n_fifone: "The chicken 🐔", g_n_pistolero: "The gunslinger",
      a_duellante: "Duellist", ad_duellante: "Three duels won.", a_campione: "Monthly champion", ad_campione: "You won a monthly challenge.",
      h11t_: "Duels", h11d: "Challenge a colleague on a wine and pick the stake: the loser brings the wine, pours for everyone, makes a rhyming toast…", h11p: "5 to whoever scores more on that wine.", h11t: "Decline? You get the 🐔 and, after two, the nickname «The chicken».",
      h12t_: "The monthly challenge", h12d: "Each month a theme: nose month, wallet month, duel month… The theme's game counts double in the monthly ranking.", h12p: "The month's winner enters the hall of fame as «Monthly champion».", h12t: "Check the theme at the top of the evening.",
      h13t_: "Commentary and report card", h13d: "At the reveal the commentary tells the wine's story with some teasing; when the evening closes, the report card: MVP, wooden spoon 🐌, most generous, ruthless.", h13p: "No points: just talking points for next time.", h13t: "The wine's podium has medals 🥇🥈🥉.",
      nv2_title: "The game got serious!", nv2_text: "One-on-one duels with stakes, the monthly challenge with a hall of fame, live commentary at the reveal and the evening's report card.",
      g_board: "Game ranking", g_boardHint: "Season points from every game on revealed wines, plus tonight\u2019s bet.", g_boardEmpty: "No wine revealed yet: the ranking starts with the first reveal.",
      g_n_generoso: "The generous one", g_n_spietato: "The ruthless one", g_n_bastian: "The contrarian", g_n_naso: "Golden nose", g_twin: "Palate twin: {name}",
      ax_corpo: "Body", ax_acidita: "Acidity", ax_tannino: "Tannin", ax_morbidezza: "Softness", ax_frutto: "Fruit", ax_legno: "Oak",
      ax_intensita: "Intensity", ax_persistenza: "Length", ax_dolcezza: "Sweetness", ax_freschezza: "Freshness",
      lo_corpo: "light", hi_corpo: "full", lo_acidita: "flat", hi_acidita: "sharp", lo_tannino: "silky", hi_tannino: "rough", lo_morbidezza: "dry", hi_morbidezza: "round",
      lo_frutto: "little", hi_frutto: "lots", lo_legno: "none", hi_legno: "lots", lo_intensita: "faint", hi_intensita: "powerful", lo_persistenza: "short", hi_persistenza: "endless",
      lo_dolcezza: "dry", hi_dolcezza: "sweet", lo_freschezza: "tired", hi_freschezza: "lively",
      e_game_off: "The game is not active in this circle.", e_revealed: "This wine has been revealed: moves can't change any more.", e_invalid_move: "Make at least one move: the field, a prediction, an aroma…",
      e_invalid_price: "Invalid price.", e_not_revealed: "Reactions open after the reveal.",
      fav_title: "Tonight's bet", fav_q: "Who wins tonight? Pick the wine that will get the highest average: guess right for 10 points.",
      fav_secret: "Bets stay secret until the evening is closed.", fav_mine: "Your bet", fav_pick: "Bet on this wine",
      fav_who1: "1 person has placed a bet", fav_whoN: "{n} people have placed a bet", fav_none: "No bets yet",
      fav_won: "You picked the winner: +10 points! 🎯", fav_lost: "Not this time: another wine won.", fav_winner: "Winner", fav_who: "Bet on it:", fav_nobody: "Nobody bet on it.",
      fav_closed: "Evening closed: bets are closed.", fav_saved: "Bet saved.", e_too_few: "You need at least two wines to bet.",
      bd_season: "Season", bd_month: "This month", bd_streak: "{n} predictions on target in a row", bd_rival: "Nemesis: {name}", bd_monthEmpty: "No points this month yet: the first revealed wine starts the race.",
      car_title: "Your career", car_next: "{n} points to {lv}", car_max: "Top level: you're a legend!", car_best: "Best streak: {n}",
      ach_title: "Your achievements", ach_count: "{n} of {m}", ach_locked: "locked",
      lv_0: "Apprentice", lv_1: "Taster", lv_2: "Cellar hand", lv_3: "Sommelier", lv_4: "Master", lv_5: "Legend",
      a_primo: "First sip", ad_primo: "You made your first move.", a_cecchino: "Sharpshooter", ad_cecchino: "A prediction within half a point of the average.",
      a_portafoglio: "Price wise", ad_portafoglio: "A price guessed within 5%.", a_serie3: "On a roll", ad_serie3: "Three predictions on target in a row.",
      a_favorito: "Winner's nose", ad_favorito: "You picked the evening's winning wine.", a_tris: "Hat trick", ad_tris: "At least 7 points in prediction, price and field on the same wine.",
      a_diapason: "Tuning fork", ad_diapason: "Closest to the group three times.", a_coro: "Odd one out", ad_coro: "Farthest from the group three times.",
      a_veterano: "Veteran", ad_veterano: "Ten wines played.", a_re: "King of the circle", ad_re: "First in the ranking, with at least three wines played.",
      g_youWon: "This wine is yours: first in the ranking! 🎉",
      g_s1: "The field", g_s2: "The prediction", g_s3: "How much is it?", g_s4: "Aroma hunt", g_s5: "The wine in one word", g_s6: "Number one fan",
      g_r1: "Up to 10 points: the closer to the group's centre, the better.", g_r2: "10 points if you hit the average, one less for each point away.", g_r3: "Up to 10 points, the closer you get to the real price.",
      g_r4: "Pick up to 3 aromas: 3 points for each one among the group's favourites.", g_r5: "If it were a person, what's it like? 5 points if you pick the most chosen word.", g_r6: "Who will give it the highest score? 5 points if you guess. You can pick yourself.",
      g_aromaCount: "{n} of 3", g_noseGroup: "The group's nose", g_wordGroup: "In one word it's…", g_fanGroup: "Number one fan", g_fanGuess: "Guessed it:", g_fanNobody: "Nobody guessed it.",
      g_aromaShort: "Aromas", g_wordShort: "Word", g_fanShort: "Fan", g_noWords: "Nobody picked a word.", g_noAromas: "Nobody went aroma hunting.", g_movesDone: "{n} of 6 games",
      ar_rossi: "Red fruit", ar_neri: "Black fruit", ar_agrumi: "Citrus", ar_mela: "Apple & pear", ar_pesca: "Peach & apricot", ar_tropicale: "Tropical", ar_fiori: "Flowers", ar_erbe: "Herbs",
      ar_spezie: "Spice", ar_vaniglia: "Vanilla", ar_tostato: "Toasty", ar_miele: "Honey", ar_burro: "Butter", ar_minerale: "Mineral", ar_cuoio: "Leather & tobacco", ar_terra: "Earth & undergrowth",
      pw_elegante: "Elegant", pw_potente: "Powerful", pw_allegro: "Cheerful", pw_timido: "Shy", pw_ruffiano: "Crowd-pleaser", pw_austero: "Austere", pw_seducente: "Seductive", pw_rustico: "Rustic",
      pw_fresco: "Fresh", pw_morbido: "Soft", pw_spigoloso: "Angular", pw_meditazione: "For meditation",
      h_btn: "How to play", h_close: "Close the rules", h_title: "How to play", h_intro: "Six games for each wine, a bet and duels for the evening, a challenge each month. Play only the ones you like: each one scores points for the ranking.",
      h_do: "What you do", h_pts: "Points", h_tip: "The trick",
      h1d: "Drag your face onto the plane: two axes, like body and acidity, that change with each wine.", h1p: "Up to 10, the closer you are to the group's centre.", h1t: "Trust your first sip.",
      h2d: "Guess the average the group will give, from 50 to 100.", h2p: "10 if you hit it, one less for each point away.", h2t: "Think of who's here tonight: generous people raise the average.",
      h3d: "Write how much you think the bottle costs (the organiser enters the real price).", h3p: "Up to 10, depending on how close you get.", h3t: "Price isn't the score: an €8 wine can surprise.",
      h4d: "Pick up to three of sixteen aromas: red fruit, spice, vanilla…", h4p: "3 for each aroma among the group's favourites (picked by at least two).", h4t: "Two sure aromas beat three random ones.",
      h5d: "If the wine were a person, what's it like? Elegant, crowd-pleaser, angular, for meditation…", h5p: "5 if you pick the group's most chosen word.", h5t: "At the reveal the wine gets its nickname.",
      h6d: "Who in the group will give it the highest score? You can pick yourself.", h6p: "5 if you guess (in a tie, everyone counts).", h6t: "Do you know your colleagues' taste better than they do?",
      h7t_: "Tonight's bet", h7d: "Before the evening closes, bet on the wine that will win it.", h7p: "10 if you pick the winner.", h7t: "Bets stay secret until the end.",
      h8t_: "The reveal", h8d: "Moves stay secret until everyone has voted, the wine is closed or the organiser taps «Reveal!».", h8p: "Then everyone sees everything: faces on the field, scores and points.", h8t: "You can change your moves until the reveal.",
      h9t_: "Reactions and jabs", h9d: "After the reveal, leave an emoji or a friendly jab for the others (never for yourself).", h9p: "No points, just satisfaction.", h9t: "«Did you sniff the cork?» is a classic.",
      h10t_: "Ranking, levels and achievements", h10d: "Points add up over the season and the month: from Apprentice to Legend, with ten achievements to unlock.", h10p: "Streaks 🔥, palate twin and nemesis ⚔️ come by themselves.", h10t: "The podium can go on your website, but only if you decide so.",
      nv_title: "New in the game!", nv_text: "Three new games for each wine: aroma hunt, the wine in one word and number one fan.", nv_ok: "Got it"
    }
  };
  Object.keys(TXT_GAME).forEach(function (l) { Object.keys(TXT_GAME[l]).forEach(function (k) { if (TXT[l][k] == null) TXT[l][k] = TXT_GAME[l][k]; }); });

  function gameOn() { return !!(S.circle && S.config && S.config.game); }
  var LEVELS = [0, 40, 100, 200, 350, 600], LV_ICON = ["🍇", "🥂", "🍷", "🎓", "👑", "🏆"];
  var ACH_ICON = { primo: "🍇", cecchino: "🎯", portafoglio: "💶", serie3: "🔥", favorito: "🔮", tris: "🎲", diapason: "🎼", coro: "📣", veterano: "🛡️", re: "👑", duellante: "⚔️", campione: "🏅" };
  var THEME_ICON = { naso: "👃", portafoglio: "💶", pronostico: "🎯", campo: "🗺️", cuore: "💘", duelli: "⚔️" };
  var PAG_ICON = { mvp: "🏆", nera: "🐌", generoso: "🎁", spietato: "🪓", duelli: "⚔️" };
  var AR_ICON = { rossi: "🍓", neri: "🫐", agrumi: "🍋", mela: "🍏", pesca: "🍑", tropicale: "🍍", fiori: "🌸", erbe: "🌿", spezie: "🌶️", vaniglia: "🍦", tostato: "☕", miele: "🍯", burro: "🧈", minerale: "🪨", cuoio: "🚬", terra: "🍄" };
  var PW_ICON = { elegante: "🎩", potente: "💪", allegro: "🎉", timido: "🙈", ruffiano: "😏", austero: "🧐", seducente: "💋", rustico: "🌾", fresco: "🧊", morbido: "☁️", spigoloso: "🔺", meditazione: "🧘" };
  function levelOf(p) { var i = 0; while (i + 1 < LEVELS.length && p >= LEVELS[i + 1]) i++; return i; }
  var gameSeq = 0, lastGame = "";
  function loadGame(tid) {
    if (!gameOn() || !tid) { S.game = null; return Promise.resolve(); }
    var my = ++gameSeq;
    /* se non è cambiato nulla non si ridisegna: un ridisegno a metà di un tocco lo farebbe perdere */
    return api({ op: "game.state", tasting: tid }).then(function (g) { if (my !== gameSeq) return; var j = JSON.stringify(g); if (j === lastGame && S.game) return; lastGame = j; S.game = g; render(); }, function () { if (my !== gameSeq) return; lastGame = ""; S.game = null; render(); });
  }
  function loadBoard() {
    if (!gameOn()) return Promise.resolve();
    return api({ op: "game.board" }).then(function (b) { S.board = b; render(); }, function () { S.board = null; render(); });
  }
  function hashN(s) { var h = 0; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }
  function initials(n) { var p = String(n || "?").trim().split(/\s+/); return ((p[0] || "?")[0] + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase(); }
  function faceHtml(who, extra) {
    var p = (S.game && S.game.people[who]) || (S.board && S.board.people && S.board.people[who]) || { name: "?" };
    return '<span class="face c' + (hashN(who) % 8) + (extra ? " " + extra : "") + '" aria-hidden="true">' + (p.pic ? '<img src="' + esc(p.pic) + '" alt="" referrerpolicy="no-referrer" loading="lazy">' : esc(initials(p.name))) + '</span>';
  }
  function personName(who) { var p = S.game && S.game.people[who]; return p ? (p.me ? p.name + " (" + t("g_you") + ")" : p.name) : "?"; }
  function mePk() { var g = S.game; if (!g) return ""; for (var k in g.people) if (g.people[k].me) return k; return ""; }
  function axesOf(gw) { var a = S.game.axes[gw.axes] || ["corpo", "acidita"]; return { x: a[0], y: a[1] }; }
  function draftOf(wid) {
    var gw = S.game.wines[wid];
    if (!S.gdraft[wid]) { var m = gw.mine || {}; S.gdraft[wid] = { x: m.x != null ? m.x : null, y: m.y != null ? m.y : null, p: m.p != null ? m.p : null, e: m.e != null ? String(m.e).replace(".", S.lang === "it" ? "," : ".") : "", a: (m.a || []).slice(), wd: m.wd || "", fan: m.fan || "" }; }
    return S.gdraft[wid];
  }
  function ptsText(n) { return n === 1 ? t("g_ptsOne") : t("g_pts", { n: n }); }

  /* il campo: le facce si posizionano dopo il disegno (data-gx/gy → left/top), perché la pagina non accetta stili in linea */
  function fieldHtml(wid, ax, dots, center, editable) {
    var lab = t("ax_" + ax.x) + " / " + t("ax_" + ax.y);
    var h = '<div class="g-field' + (editable ? " edit" : "") + '" data-field="' + esc(wid) + '" role="group" aria-label="' + esc(t("g_field") + ": " + lab) + '">' +
      '<span class="g-grid" aria-hidden="true"></span>' +
      '<span class="g-ax g-ax-y" aria-hidden="true">' + esc(t("ax_" + ax.y)) + ' ↑</span><span class="g-ax g-ax-x" aria-hidden="true">' + esc(t("ax_" + ax.x)) + ' →</span>' +
      '<span class="g-lo g-lo-x" aria-hidden="true">' + esc(t("lo_" + ax.x)) + '</span><span class="g-hi g-hi-x" aria-hidden="true">' + esc(t("hi_" + ax.x)) + '</span>' +
      '<span class="g-lo g-lo-y" aria-hidden="true">' + esc(t("lo_" + ax.y)) + '</span><span class="g-hi g-hi-y" aria-hidden="true">' + esc(t("hi_" + ax.y)) + '</span>';
    if (center) h += '<span class="g-center" data-gx="' + center.x + '" data-gy="' + center.y + '" title="' + esc(t("g_center")) + '" aria-hidden="true"></span>';
    dots.forEach(function (d) {
      if (d.x == null) return;
      var lbl = personName(d.who) + ": " + t("ax_" + ax.x) + " " + d.x + ", " + t("ax_" + ax.y) + " " + d.y;
      if (editable && d.me) h += '<button type="button" class="g-dot me" data-act="g-face" data-w="' + esc(wid) + '" data-gx="' + d.x + '" data-gy="' + d.y + '" data-fk="gface-' + esc(wid) + '" aria-label="' + esc(lbl) + '">' + faceHtml(d.who) + '</button>';
      else h += '<span class="g-dot' + (d.me ? " me" : "") + '" data-gx="' + d.x + '" data-gy="' + d.y + '" role="img" aria-label="' + esc(lbl) + '">' + faceHtml(d.who) + '</span>';
    });
    if (editable && !dots.some(function (d) { return d.me && d.x != null; })) h += '<span class="g-empty" aria-hidden="true">' + esc(t("g_fieldEmpty")) + '</span>';
    return h + '</div>';
  }

  function gameHtml(w) {
    if (!gameOn() || !S.game || !S.game.wines[w.id]) return "";
    var g = S.game, gw = g.wines[w.id], ax = axesOf(gw), me = mePk(), busy = !!S.pending["g-" + w.id];
    var h = '<section class="game" aria-labelledby="gt-' + esc(w.id) + '"><div class="g-head"><h4 class="grp" id="gt-' + esc(w.id) + '">' + esc(t("g_title")) + '</h4>' +
      '<span class="badge' + (gw.revealed ? " open" : "") + '">' + esc(gw.revealed ? t("g_revealed") : t("g_secret")) + '</span>' +
      btn("g-help", "❓ " + t("h_btn"), { cls: "small ghost g-helpbtn", fk: "ghelp-" + w.id }) + '</div>';
    if (!gw.revealed) {
      var d = draftOf(w.id);
      var sec = function (n, done) { return '<div class="g-step' + (done ? " done" : "") + '"><span class="g-num" aria-hidden="true">' + (done ? "✓" : n) + '</span><span><b>' + esc(t("g_s" + n)) + '</b><span class="small muted">' + esc(t("g_r" + n)) + '</span></span></div>'; };
      var nDone = [d.x != null, d.p != null, !!String(d.e || "").trim(), d.a.length > 0, !!d.wd, !!d.fan].filter(Boolean).length;
      h += '<p class="g-progress small"><span class="g-bar" aria-hidden="true">' + [0, 1, 2, 3, 4, 5].map(function (i) { return '<i' + (i < nDone ? ' class="on"' : "") + '></i>'; }).join("") + '</span>' + esc(t("g_movesDone", { n: nDone })) + '</p>';
      h += sec(1, d.x != null) + fieldHtml(w.id, ax, [{ who: me, x: d.x, y: d.y, me: true }], null, true) + '<p class="small muted">' + esc(t("g_fieldHint")) + '</p>';
      var pv = d.p != null ? d.p : 68;
      h += sec(2, d.p != null) + '<label class="f" for="gp-' + esc(w.id) + '">' + esc(t("g_pron")) + '</label><div class="g-pron"><input type="range" min="50" max="100" step="1" id="gp-' + esc(w.id) + '" data-g="p" data-w="' + esc(w.id) + '" data-fk="gp-' + esc(w.id) + '" value="' + pv + '"' + (d.p == null ? ' class="untouched"' : "") + '><output id="gpo-' + esc(w.id) + '">' + (d.p != null ? d.p : "—") + '</output></div>';
      h += sec(3, !!String(d.e || "").trim()) + '<label class="f" for="ge-' + esc(w.id) + '">' + esc(t("g_price")) + '</label><input type="text" inputmode="decimal" maxlength="8" id="ge-' + esc(w.id) + '" data-g="e" data-w="' + esc(w.id) + '" data-fk="ge-' + esc(w.id) + '" placeholder="' + esc(t("g_pricePh")) + '" value="' + esc(d.e) + '">';
      /* caccia agli aromi: fino a tre */
      h += sec(4, d.a.length > 0) + '<div class="g-chips g-aromi" role="group" aria-label="' + esc(t("g_s4")) + '">' + (g.aromi || []).map(function (k) {
        var on = d.a.indexOf(k) > -1, full = !on && d.a.length >= 3;
        return '<button type="button" class="g-chip' + (on ? " on" : "") + '" data-act="g-aroma" data-w="' + esc(w.id) + '" data-k="' + k + '" aria-pressed="' + on + '"' + (full ? " disabled" : "") + ' data-fk="ga-' + esc(w.id + k) + '"><span aria-hidden="true">' + (AR_ICON[k] || "") + '</span> ' + esc(t("ar_" + k)) + '</button>';
      }).join("") + '</div><p class="small muted g-count">' + esc(t("g_aromaCount", { n: d.a.length })) + '</p>';
      /* il vino in una parola */
      h += sec(5, !!d.wd) + '<div class="g-chips g-parole" role="radiogroup" aria-label="' + esc(t("g_s5")) + '">' + (g.parole || []).map(function (k) {
        var on = d.wd === k;
        return '<button type="button" class="g-chip' + (on ? " on" : "") + '" data-act="g-word" data-w="' + esc(w.id) + '" data-k="' + k + '" role="radio" aria-checked="' + on + '" data-fk="gw-' + esc(w.id + k) + '"><span aria-hidden="true">' + (PW_ICON[k] || "") + '</span> ' + esc(t("pw_" + k)) + '</button>';
      }).join("") + '</div>';
      /* il fan numero uno: chi darà il voto più alto */
      h += sec(6, !!d.fan) + '<div class="g-chips g-fans" role="radiogroup" aria-label="' + esc(t("g_s6")) + '">' + Object.keys(g.people).map(function (k) {
        var on = d.fan === k;
        return '<button type="button" class="g-chip g-fanb' + (on ? " on" : "") + '" data-act="g-fan" data-w="' + esc(w.id) + '" data-k="' + esc(k) + '" role="radio" aria-checked="' + on + '" data-fk="gfan-' + esc(w.id + k) + '">' + faceHtml(k) + '<span dir="auto">' + esc(personName(k)) + '</span></button>';
      }).join("") + '</div>';
      if (S.gerr && S.gerr.wine === w.id) h += '<p class="field-error" role="alert">' + esc(S.gerr.text) + '</p>';
      h += '<div class="row">' + btn("g-play", busy ? t("g_playing") : t(gw.mine ? "g_update" : "g_play"), { id: w.id, cls: "primary", disabled: busy || readonly(), fk: "gplay-" + w.id }) + '</div>';
      if (S.saved === "gm-" + w.id) h += '<p class="saved-note">✓ ' + esc(t("g_saved")) + '</p>';
      /* chi ha già giocato o votato: le facce si accendono */
      var ppl = Object.keys(g.people), lit = {};
      gw.played.concat(gw.voted).forEach(function (k) { lit[k] = true; });
      var missing = ppl.filter(function (k) { return gw.voted.indexOf(k) < 0; }).length;
      h += '<div class="g-who"><span class="small muted">' + esc(t("g_played")) + '</span><span class="g-faces">' + ppl.map(function (k) { return '<span class="g-wf' + (lit[k] ? " on" : "") + '" title="' + esc(personName(k)) + '">' + faceHtml(k) + '</span>'; }).join("") + '</span>' +
        '<span class="small muted">' + esc(missing === 0 ? t("g_allVoted") : missing === 1 ? t("g_missingOne") : t("g_missing", { n: missing })) + '</span></div>';
      if (isOrg()) {
        h += '<div class="g-org"><h4 class="grp">' + esc(t("g_orgTitle")) + '</h4><label class="f" for="gr-' + esc(w.id) + '">' + esc(t("g_realPrice")) + '</label>' +
          '<div class="row"><input type="text" inputmode="decimal" maxlength="8" id="gr-' + esc(w.id) + '" data-fk="gr-' + esc(w.id) + '" value="' + esc(gw.price != null ? String(gw.price).replace(".", S.lang === "it" ? "," : ".") : "") + '" class="g-price-in">' +
          btn("g-price", t("g_savePrice"), { id: w.id, cls: "small ghost", disabled: readonly(), fk: "gprice-" + w.id }) + '</div>' +
          (S.saved === "gp-" + w.id ? '<p class="saved-note">✓ ' + esc(t("g_priceSaved")) + '</p>' : "") +
          '<div class="row">' + (S.gconfirm === w.id ? '<p class="small">' + esc(t("g_revealAsk")) + '</p>' + btn("g-reveal-do", t("g_reveal"), { id: w.id, cls: "primary", fk: "greveal-" + w.id }) + btn("g-reveal-no", t("cancel"), { cls: "ghost", fk: "greveal-no" })
            : btn("g-reveal", "🎉 " + t("g_reveal"), { id: w.id, cls: "primary", disabled: readonly(), fk: "greveal-" + w.id })) + '</div></div>';
      }
      return h + '</section>';
    }
    /* svelato: tutti vedono tutto */
    var res = gw.results || [];
    h += fieldHtml(w.id, ax, res.filter(function (r) { return r.x != null; }).map(function (r) { return { who: r.who, x: r.x, y: r.y, me: g.people[r.who] && g.people[r.who].me }; }), gw.center, false);
    var line = [];
    if (gw.avg != null) line.push(t("g_avg", { n: dec(gw.avg) }));
    if (gw.price != null) line.push(t("g_realPriceIs", { p: String(gw.price).replace(".", S.lang === "it" ? "," : ".") }));
    if (line.length) h += '<p class="small"><b>' + esc(line.join(" · ")) + '</b></p>';
    /* i giochi del gruppo: il naso, la parola, il fan */
    var groupCards = "";
    if ((gw.aromas || []).length) {
      var topN = gw.aromas[0].n;
      groupCards += '<div class="g-gcard"><span class="g-gk">👃 ' + esc(t("g_noseGroup")) + '</span><div class="g-cloud">' + gw.aromas.slice(0, 8).map(function (x) {
        return '<span class="g-chip on' + (x.n >= 2 && x.n >= topN ? " top" : "") + '">' + (AR_ICON[x.k] || "") + " " + esc(t("ar_" + x.k)) + ' <b>' + x.n + '</b></span>';
      }).join("") + '</div></div>';
    }
    if ((gw.words || []).length) {
      var wtop = gw.words[0];
      groupCards += '<div class="g-gcard"><span class="g-gk">💬 ' + esc(t("g_wordGroup")) + '</span><p class="g-word"><span aria-hidden="true">' + (PW_ICON[wtop.k] || "") + '</span> ' + esc(t("pw_" + wtop.k)) + ' <span class="small muted">(' + wtop.n + ')</span></p>' +
        (gw.words.length > 1 ? '<p class="small muted">' + gw.words.slice(1, 5).map(function (x) { return (PW_ICON[x.k] || "") + " " + esc(t("pw_" + x.k)) + " " + x.n; }).join(" · ") + '</p>' : "") + '</div>';
    }
    if ((gw.fanTop || []).length) {
      var guessed = res.filter(function (r) { return r.fan && gw.fanTop.indexOf(r.fan) > -1; }).map(function (r) { return r.who; });
      groupCards += '<div class="g-gcard"><span class="g-gk">💘 ' + esc(t("g_fanGroup")) + '</span><p class="g-fanwin">' + gw.fanTop.map(function (k) { var r = res.filter(function (x) { return x.who === k; })[0]; return faceHtml(k) + ' <b dir="auto">' + esc(personName(k)) + '</b>' + (r && r.vote != null ? ' <span class="chip">' + r.vote + '</span>' : ""); }).join(" ") + '</p>' +
        '<p class="small">' + esc(guessed.length ? t("g_fanGuess") : t("g_fanNobody")) + (guessed.length ? ' <span class="g-faces">' + guessed.map(function (k) { return '<span class="g-wf on" title="' + esc(personName(k)) + '">' + faceHtml(k) + '</span>'; }).join("") + '</span>' : "") + '</p></div>';
    }
    var tc = tcLines(w.id, gw);
    if (tc.length) h += '<section class="g-tc" aria-label="' + esc(t("tc_title")) + '"><span class="g-gk">🎙️ ' + esc(t("tc_title")) + '</span><ul>' + tc.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join("") + '</ul></section>';
    if (groupCards) h += '<div class="g-groups">' + groupCards + '</div>';
    h += '<ol class="g-res">' + res.map(function (r, i) {
      var p = g.people[r.who] || { name: "?" }, mine = !!p.me;
      var nums = [];
      nums.push('<span><em>' + esc(t("g_vote")) + '</em><b>' + (r.vote != null ? r.vote : "—") + '</b></span>');
      nums.push('<span><em>' + esc(t("g_pronShort")) + '</em><b>' + (r.p != null ? r.p : "—") + '</b>' + (r.pts.pron != null ? '<i>+' + r.pts.pron + '</i>' : "") + '</span>');
      nums.push('<span><em>' + esc(t("g_priceShort")) + '</em><b>' + (r.e != null ? String(r.e).replace(".", S.lang === "it" ? "," : ".") + " €" : "—") + '</b>' + (r.pts.price != null ? '<i>+' + r.pts.price + '</i>' : "") + '</span>');
      nums.push('<span><em>' + esc(t("g_fieldShort")) + '</em><b>' + (r.x != null ? "✓" : "—") + '</b>' + (r.pts.field != null ? '<i>+' + r.pts.field + '</i>' : "") + '</span>');
      nums.push('<span><em>' + esc(t("g_aromaShort")) + '</em><b>' + (r.a && r.a.length ? r.a.map(function (k) { return AR_ICON[k] || "•"; }).join("") : "—") + '</b>' + (r.pts.aroma != null ? '<i>+' + r.pts.aroma + '</i>' : "") + '</span>');
      nums.push('<span><em>' + esc(t("g_wordShort")) + '</em><b>' + (r.wd ? (PW_ICON[r.wd] || "") + " " + esc(t("pw_" + r.wd)) : "—") + '</b>' + (r.pts.word != null ? '<i>+' + r.pts.word + '</i>' : "") + '</span>');
      nums.push('<span><em>' + esc(t("g_fanShort")) + '</em><b dir="auto">' + (r.fan && g.people[r.fan] ? esc(initials(g.people[r.fan].name)) : "—") + '</b>' + (r.pts.fan != null ? '<i>+' + r.pts.fan + '</i>' : "") + '</span>');
      var badges = r.badges.map(function (b) { return '<span class="chip g-badge g-b-' + esc(b) + '">' + esc(t("g_b_" + b)) + '</span>'; }).join("");
      /* reazioni ricevute: emoji raggruppate, frecciatine per esteso con chi le ha mandate */
      var em = {}, fr = [];
      r.reactions.forEach(function (x) { if (x.e) em[x.e] = (em[x.e] || 0) + 1; if (x.f) fr.push('<span class="g-jab">«' + esc(t(x.f)) + '» <span class="muted">— ' + esc(x.from && g.people[x.from] ? g.people[x.from].name : "?") + '</span></span>'); });
      var recv = Object.keys(em).map(function (k) { return '<span class="g-em">' + k + (em[k] > 1 ? " " + em[k] : "") + '</span>'; }).join("") + fr.join("");
      var ctl = "";
      if (!mine) {
        var myR = r.reactions.filter(function (x) { return x.from === me; })[0] || { e: "", f: "" };
        ctl = '<div class="g-react" role="group" aria-label="' + esc(t("g_react", { name: p.name })) + '">' + g.emoji.map(function (e) {
          return '<button type="button" class="g-emb' + (myR.e === e ? " on" : "") + '" data-act="g-react" data-to="' + esc(r.who) + '" data-w="' + esc(w.id) + '" data-e="' + e + '" aria-pressed="' + (myR.e === e) + '" data-fk="gr-' + esc(w.id + r.who + e) + '">' + e + '</button>';
        }).join("") + '<select class="g-jabsel" data-g="f" data-to="' + esc(r.who) + '" data-w="' + esc(w.id) + '" aria-label="' + esc(t("g_phrase")) + '" data-fk="gf-' + esc(w.id + r.who) + '"><option value="">' + esc(myR.f ? t("g_noPhrase") : t("g_phrase")) + '</option>' +
          Array.apply(null, Array(g.phrases)).map(function (_, j) { var k = "f" + (j + 1); return '<option value="' + k + '"' + (myR.f === k ? " selected" : "") + '>' + esc(t(k)) + '</option>'; }).join("") + '</select></div>';
      }
      return '<li class="g-row' + (mine ? " me" : "") + '"><div class="g-top"><span class="g-pos' + (i < 3 && r.pts.total > 0 ? " medal" : "") + '">' + (i < 3 && r.pts.total > 0 ? ["🥇", "🥈", "🥉"][i] : i + 1) + '</span>'+ faceHtml(r.who, "lg") + '<span class="g-nm"><b dir="auto">' + esc(personName(r.who)) + '</b>' + badges + '</span><span class="g-tot"><b>' + r.pts.total + '</b><em>' + esc(t("g_pts", { n: "" }).trim()) + '</em></span></div>' +
        '<div class="g-nums">' + nums.join("") + '</div>' + (recv ? '<div class="g-recv">' + recv + '</div>' : "") + ctl + '</li>';
    }).join("") + '</ol>';
    return h + '</section>';
  }

  function boardHtml() {
    if (!gameOn()) return "";
    var b = S.board, mode = S.boardMode === "challenge" ? "challenge" : "season";
    var h = helpHtml() + '<section class="card g-board"><div class="row spread"><h3 class="section">🏆 ' + esc(t("g_board")) + '</h3>' + btn("g-help", "❓ " + t("h_btn"), { cls: "small ghost", fk: "ghelp-board" }) + '</div><p class="small muted">' + esc(t("g_boardHint")) + '</p>';
    if (!b) return h + '<p class="muted" aria-busy="true">' + esc(t("loading")) + '</p></section>';
    var any = b.rows.some(function (r) { return r.pts.total > 0 || r.pts.played > 0; });
    if (!any) return h + '<p class="muted">' + esc(t("g_boardEmpty")) + '</p></section>';
    S.board.people = {}; b.rows.forEach(function (r) { S.board.people[r.who] = { name: r.name, pic: r.pic, me: r.me }; });
    h += '<div class="modes g-bmodes" role="group" aria-label="' + esc(t("g_board")) + '">' + ["season", "challenge"].map(function (m) {
      return '<button type="button" data-act="g-bmode" data-v="' + m + '" aria-pressed="' + (mode === m) + '"' + (mode === m ? ' class="on"' : "") + ' data-fk="gbm-' + m + '">' + esc(t(m === "challenge" ? "bd_challenge" : "bd_season")) + '</button>';
    }).join("") + '</div>';
    var rows = b.rows.slice();
    if (mode === "challenge") {
      var c = b.challenge || { rows: [] }, days = Math.max(1, Math.ceil((c.endsAt - Date.now()) / 86400000));
      h += '<div class="g-mhead g-mhead-b"><span class="g-mico" aria-hidden="true">' + (THEME_ICON[c.theme] || "🗓️") + '</span><span><span class="g-gk">🗓️ ' + esc(t("sm_title", { m: monthName(c.month) })) + '</span><b>' + esc(t("th_" + c.theme)) + '</b><span class="small">' + esc(t("thd_" + c.theme)) + ' · ' + esc(days === 1 ? t("sm_day1") : t("sm_days", { n: days })) + '</span></span></div>';
      rows = rows.filter(function (r) { return r.month > 0; }).sort(function (x, y) { return y.month - x.month || x.name.localeCompare(y.name); });
    }
    if (!rows.length) h += '<p class="muted">' + esc(t("bd_monthEmpty")) + '</p>';
    else h += '<ol class="toplist g-boardlist">' + rows.map(function (r, i) {
      var lv = levelOf(r.pts.total);
      var chips = '<span class="chip g-lv">' + LV_ICON[lv] + " " + esc(t("lv_" + lv)) + '</span>' +
        (r.streak && r.streak.cur >= 2 ? '<span class="chip g-streak" title="' + esc(t("bd_streak", { n: r.streak.cur })) + '">🔥 ' + r.streak.cur + '</span>' : "") +
        r.nick.map(function (n) { return '<span class="chip g-nick">' + esc(t("g_n_" + n)) + '</span>'; }).join("") +
        (r.twin ? '<span class="chip g-nick">' + esc(t("g_twin", { name: r.twin })) + '</span>' : "") +
        (r.rival ? '<span class="chip g-nick g-rival">⚔️ ' + esc(t("bd_rival", { name: r.rival })) + '</span>' : "") +
        (r.duels && r.duels.w + r.duels.l > 0 ? '<span class="chip g-nick">' + esc(t("du_chip", { w: r.duels.w, l: r.duels.l })) + '</span>' : "") +
        (r.titles || []).map(function (m) { return '<span class="chip g-lv">🏅 ' + esc(monthName(m)) + '</span>'; }).join("");
      return '<li' + (r.me ? ' class="me"' : "") + '><span class="pos">' + (i + 1) + '</span>' + faceHtml(r.who) + '<span class="nm"><b dir="auto">' + esc(r.name) + (r.me ? " (" + esc(t("g_you")) + ")" : "") + '</b><span class="g-nicks">' + chips + '</span></span><span class="av">' + (mode === "challenge" ? r.month : r.pts.total) + '</span></li>';
    }).join("") + '</ol>';
    /* l'albo d'oro: i campioni dei mesi passati */
    if (mode === "challenge" && (b.hall || []).length) h += '<h4 class="grp">🏅 ' + esc(t("hl_title")) + '</h4><ul class="g-hall">' + b.hall.map(function (x) {
      var names = x.winners.map(function (k) { return S.board.people[k] ? S.board.people[k].name : "?"; }).join(", ");
      return '<li><span class="g-hmo">' + (THEME_ICON[x.theme] || "🗓️") + ' <b>' + esc(monthName(x.month)) + '</b></span><span dir="auto">' + esc(t("hl_row", { names: names, n: x.pts })) + '</span></li>';
    }).join("") + '</ul>';
    /* la mia carriera: livello, quanto manca al prossimo, i traguardi */
    var me = b.rows.filter(function (r) { return r.me; })[0];
    if (me) {
      var lv = levelOf(me.pts.total), nx = LEVELS[lv + 1];
      h += '<div class="g-career"><h4 class="grp">' + esc(t("car_title")) + '</h4><div class="g-lvbig"><span class="g-lvico" aria-hidden="true">' + LV_ICON[lv] + '</span><span><b>' + esc(t("lv_" + lv)) + '</b><span class="small muted">' +
        esc(nx != null ? t("car_next", { n: nx - me.pts.total, lv: t("lv_" + (lv + 1)) }) : t("car_max")) + (me.streak && me.streak.best ? " · " + esc(t("car_best", { n: me.streak.best })) : "") + '</span></span></div>' +
        (nx != null ? '<progress class="g-prog" max="' + (nx - LEVELS[lv]) + '" value="' + (me.pts.total - LEVELS[lv]) + '" aria-label="' + esc(t("car_next", { n: nx - me.pts.total, lv: t("lv_" + (lv + 1)) })) + '"></progress>' : "");
      var all = b.ach || [], got = me.feats || [];
      h += '<h4 class="grp">' + esc(t("ach_title")) + ' <span class="muted small">' + esc(t("ach_count", { n: got.length, m: all.length })) + '</span></h4><ul class="g-ach">' + all.map(function (k) {
        var on = got.indexOf(k) > -1;
        return '<li class="' + (on ? "on" : "off") + '"><span class="g-achico" aria-hidden="true">' + (on ? ACH_ICON[k] : "🔒") + '</span><b>' + esc(t("a_" + k)) + '</b><span>' + esc(t("ad_" + k)) + (on ? "" : '<span class="sr-only"> · ' + esc(t("ach_locked")) + '</span>') + '</span></li>';
      }).join("") + '</ul></div>';
    }
    return h + '</section>';
  }

  /* «Come si gioca»: una scheda per gioco, con cosa fai, i punti e un trucco */
  var NOVITA_KEY = "taste-gioco-novita-215";
  var HELP = [["🗺️", "g_s1", "h1"], ["🎯", "g_s2", "h2"], ["💶", "g_s3", "h3"], ["👃", "g_s4", "h4"], ["💬", "g_s5", "h5"], ["💘", "g_s6", "h6"],
    ["🔮", "h7t_", "h7"], ["⚔️", "h11t_", "h11"], ["🗓️", "h12t_", "h12"], ["🎉", "h8t_", "h8"], ["🎙️", "h13t_", "h13"], ["😂", "h9t_", "h9"], ["🏆", "h10t_", "h10"]];
  function helpHtml() {
    if (!gameOn() || !S.ghelp) return "";
    return '<section class="card g-help" aria-labelledby="h-help"><div class="row spread"><h3 class="section" id="h-help" tabindex="-1">❓ ' + esc(t("h_title")) + '</h3>' + btn("g-help", t("h_close"), { cls: "small ghost", fk: "ghelp-close" }) + '</div>' +
      '<p class="small">' + esc(t("h_intro")) + '</p><ol class="g-hcards">' + HELP.map(function (x, i) {
        return '<li class="g-hcard hc' + (i % 6) + '"><span class="g-hico" aria-hidden="true">' + x[0] + '</span><div><b>' + esc(t(x[1])) + '</b>' +
          '<p><em>' + esc(t("h_do")) + '</em> ' + esc(t(x[2] + "d")) + '</p><p class="g-hpts"><em>' + esc(t("h_pts")) + '</em> ' + esc(t(x[2] + "p")) + '</p><p class="g-htip">💡 ' + esc(t(x[2] + "t")) + '</p></div></li>';
      }).join("") + '</ol></section>';
  }
  function novitaHtml() {
    if (!gameOn() || S.novitaOff || S.ghelp) return "";
    try { if (localStorage.getItem(NOVITA_KEY)) { S.novitaOff = true; return ""; } } catch (e) { /* niente memoria */ }
    return '<section class="card g-novita" role="status"><span class="g-nvico" aria-hidden="true">🎉</span><div><b>' + esc(t("nv2_title")) + '</b><p class="small">' + esc(t("nv2_text")) + '</p><div class="row">' +
      btn("g-help", "❓ " + t("h_btn"), { cls: "small primary", fk: "ghelp-nv" }) + btn("g-novita", t("nv_ok"), { cls: "small ghost", fk: "gnv-ok" }) + '</div></div></section>';
  }

  /* ---- la plancia della serata: sfida del mese, duelli, scommessa, pagella ---- */
  function monthName(mk) { var p = String(mk || "").split("-"); try { return new Date(Date.UTC(+p[0], +p[1] - 1, 15)).toLocaleDateString(S.lang === "en" ? "en-GB" : "it-IT", { month: "long" }); } catch (e) { return mk; } }
  function wineLabel(wid) { var w = (S.wines || []).filter(function (x) { return x.id === wid; })[0]; return w ? (w.hidden ? t("blindLabel", { n: w.index }) : w.name) : "?"; }
  function shortName(k) { var p = S.game && S.game.people[k]; return p ? String(p.name).split(" ")[0] + (p.me ? " (" + t("g_you") + ")" : "") : "?"; }
  function planciaHtml() {
    if (!gameOn() || !S.game) return "";
    return '<div class="g-plancia"><h3 class="section g-pltitle">🎮 ' + esc(t("pl_title")) + '</h3>' + incomingHtml() +
      '<div class="g-plgrid">' + monthHtml() + duelsHtml() + '</div>' + favHtml() + pagellaHtml() + '</div>';
  }
  function monthHtml() {
    var c = S.board && S.board.challenge;
    var h = '<section class="card g-month">';
    if (!c) return h + '<p class="muted small" aria-busy="true">' + esc(t("loading")) + '</p></section>';
    var days = Math.max(1, Math.ceil((c.endsAt - Date.now()) / 86400000)), mine = null, pos = 0;
    c.rows.forEach(function (r, i) { if (S.board.people && S.board.people[r.who] && S.board.people[r.who].me) { mine = r; pos = i + 1; } });
    var lead = c.rows[0], leadName = lead && S.board.people && S.board.people[lead.who] ? S.board.people[lead.who].name : "";
    h += '<div class="g-mhead"><span class="g-mico" aria-hidden="true">' + (THEME_ICON[c.theme] || "🗓️") + '</span><span><span class="g-gk">🗓️ ' + esc(t("sm_title", { m: monthName(c.month) })) + '</span><b>' + esc(t("th_" + c.theme)) + '</b><span class="small">' + esc(t("thd_" + c.theme)) + '</span></span></div>';
    h += '<p class="small g-mline"><span class="chip">' + esc(days === 1 ? t("sm_day1") : t("sm_days", { n: days })) + '</span> ' + esc(mine ? t("sm_you", { pos: pos, n: mine.pts }) : t("sm_noyou")) + '</p>';
    if (lead && (!mine || lead.who !== mine.who)) h += '<p class="small muted">👑 ' + esc(t("sm_lead", { name: leadName, n: lead.pts })) + '</p>';
    return h + '</section>';
  }
  function incomingHtml() {
    var me = mePk(), list = (S.game.duels || []).filter(function (d) { return d.to === me && d.status === "pending"; });
    return list.map(function (d) {
      return '<section class="card g-incoming" role="status"><span class="g-inico" aria-hidden="true">⚔️</span><div><b>' + esc(t("du_incoming", { name: personName(d.from), wine: wineLabel(d.wine) })) + '</b>' +
        '<p class="small">' + esc(t("du_stakeIs", { stake: t("st_" + d.stake) })) + '</p><div class="row">' +
        btn("du-accept", t("du_accept"), { id: d.id, cls: "primary", disabled: readonly(), fk: "dua-" + d.id }) + btn("du-decline", t("du_decline"), { id: d.id, cls: "ghost", disabled: readonly(), fk: "dud-" + d.id }) + '</div></div></section>';
    }).join("");
  }
  function duelsHtml() {
    var g = S.game, me = mePk(), list = g.duels || [], open = S.tasting && S.tasting.status === "open";
    var h = '<section class="card g-duels"><h4 class="grp">⚔️ ' + esc(t("du_title")) + '</h4><p class="small muted">' + esc(t("du_rule")) + '</p>';
    if (!list.length) h += '<p class="small">' + esc(t("du_none")) + '</p>';
    h += '<ul class="g-duellist">' + list.map(function (d) {
      var st = d.status, pill = "", extra = "";
      if (st === "pending") pill = t("du_pending"); else if (st === "accepted") pill = t("du_accepted"); else if (st === "declined") pill = t("du_declined"); else if (st === "expired") pill = t("du_expired");
      else pill = d.winner ? t("du_won", { name: shortName(d.winner) }) + " " + d.score[0] + "–" + d.score[1] : t("du_tie") + " " + d.score[0] + "–" + d.score[1];
      if (st === "done" && d.taunt) extra += '<p class="g-taunt">💬 <b>' + esc(t("du_gongola", { name: shortName(d.winner) })) + '</b> «' + esc(t(d.taunt)) + '»</p>';
      if (st === "done" && d.winner === me) extra += '<select class="g-tauntsel" data-g="dt" data-id="' + esc(d.id) + '" aria-label="' + esc(t("du_taunt")) + '" data-fk="dt-' + esc(d.id) + '"><option value="">' + esc(d.taunt ? t("du_noTaunt") : t("du_taunt")) + '</option>' +
        Array.apply(null, Array(g.taunts || 8)).map(function (_, j) { var k = "t" + (j + 1); return '<option value="' + k + '"' + (d.taunt === k ? " selected" : "") + '>' + esc(t(k)) + '</option>'; }).join("") + '</select>';
      var ctl = "";
      if (st === "pending" && d.from === me) ctl += btn("du-cancel", t("du_cancel"), { id: d.id, cls: "small ghost", disabled: readonly(), fk: "duc-" + d.id });
      if ((st === "done" || st === "declined") && open && (d.from === me || d.to === me)) ctl += btn("du-rematch", "🔁 " + t("du_rematch"), { id: d.id, cls: "small ghost", disabled: readonly(), fk: "dur-" + d.id });
      return '<li class="g-duel ' + st + (d.winner === me && st === "done" ? " won" : "") + '"><div class="g-dvs">' + faceHtml(d.from, d.winner === d.from ? "win" : "") + '<span class="g-dx" aria-hidden="true">⚔️</span>' + faceHtml(d.to, d.winner === d.to ? "win" : "") +
        '<span class="g-dtxt"><b dir="auto">' + esc(t("du_vs", { a: shortName(d.from), b: shortName(d.to) })) + '</b><span class="small muted" dir="auto">🍷 ' + esc(wineLabel(d.wine)) + ' · ' + esc(t("du_stakeIs", { stake: t("st_" + d.stake) })) + '</span></span></div>' +
        '<span class="chip g-dpill">' + esc(pill) + '</span>' + extra + (ctl ? '<div class="row">' + ctl + '</div>' : "") + '</li>';
    }).join("") + '</ul>';
    if (!open) return h + '</section>';
    var free = (S.wines || []).filter(function (w) { var gw = g.wines[w.id]; return gw && !gw.revealed; });
    if (!S.dform) return h + (free.length ? '<p>' + btn("du-new", t("du_new"), { cls: "primary", disabled: readonly(), fk: "du-new" }) + '</p>' : '<p class="small muted">' + esc(t("du_noWines")) + '</p>') + '</section>';
    var f = S.dform;
    h += '<div class="g-dform"><p class="f">' + esc(t("du_who")) + '</p><div class="g-chips" role="radiogroup" aria-label="' + esc(t("du_who")) + '">' + Object.keys(g.people).filter(function (k) { return k !== me; }).map(function (k) {
      return '<button type="button" class="g-chip g-fanb' + (f.to === k ? " on" : "") + '" data-act="du-to" data-k="' + esc(k) + '" role="radio" aria-checked="' + (f.to === k) + '" data-fk="dto-' + esc(k) + '">' + faceHtml(k) + '<span dir="auto">' + esc(g.people[k].name) + '</span></button>';
    }).join("") + '</div><p class="f">' + esc(t("du_wine")) + '</p><div class="g-chips" role="radiogroup" aria-label="' + esc(t("du_wine")) + '">' + free.map(function (w) {
      return '<button type="button" class="g-chip' + (f.wine === w.id ? " on" : "") + '" data-act="du-wine" data-k="' + esc(w.id) + '" role="radio" aria-checked="' + (f.wine === w.id) + '" data-fk="dwi-' + esc(w.id) + '">🍷 <span dir="auto">' + esc(wineLabel(w.id)) + '</span></button>';
    }).join("") + '</div><p class="f">' + esc(t("du_stake")) + '</p><div class="g-chips" role="radiogroup" aria-label="' + esc(t("du_stake")) + '">' + (g.stakes || []).map(function (k) {
      return '<button type="button" class="g-chip' + (f.stake === k ? " on" : "") + '" data-act="du-stake" data-k="' + k + '" role="radio" aria-checked="' + (f.stake === k) + '" data-fk="dst-' + k + '">' + esc(t("st_" + k)) + '</button>';
    }).join("") + '</div>' + (f.err ? '<p class="field-error" role="alert">' + esc(f.err) + '</p>' : "") +
      '<div class="row">' + btn("du-go", "⚔️ " + t("du_go"), { cls: "primary", disabled: readonly() || !!S.pending.duel, fk: "du-go" }) + btn("du-cancelform", t("du_cancelForm"), { cls: "ghost", fk: "du-cancelform" }) + '</div></div>';
    return h + '</section>';
  }
  function pagellaHtml() {
    var pg = S.game && S.game.pagella;
    if (!pg || !pg.length) return "";
    return '<section class="card g-pagella"><h4 class="grp">📋 ' + esc(t("pg_title")) + '</h4><ul class="g-pglist">' + pg.map(function (x) {
      return '<li class="pg-' + esc(x.k) + '"><span class="g-pgico" aria-hidden="true">' + (PAG_ICON[x.k] || "⭐") + '</span>' + faceHtml(x.who) + '<span><span class="g-gk">' + esc(t("pg_" + x.k)) + '</span><b dir="auto">' + esc(personName(x.who)) + '</b><span class="small muted">' + esc(t(x.k === "duelli" && x.v === 1 ? "pgv_duelli1" : "pgv_" + x.k, { n: x.k === "generoso" || x.k === "spietato" ? dec(x.v) : x.v })) + '</span></span></li>';
    }).join("") + '</ul></section>';
  }
  function duelAct(op, body, fk, ok) {
    return run("duel", function () {
      return api(Object.assign({ op: op, tasting: S.tasting.id }, body)).then(function () { if (ok) announce(ok); if (fk) focusAfter(fk); lastGame = ""; loadBoard(); return loadGame(S.tasting.id); }, function (err) { if (S.dform && op === "game.duel") { S.dform.err = errText(err); render(); } else announce(errText(err), true); });
    });
  }

  /* la telecronaca dello svelamento: qualche riga che racconta il vino, con le prese in giro */
  function tcLines(wid, gw) {
    var res = gw.results || [], out = [], cand = [], avg = gw.avg, price = gw.price;
    if (res[0] && res[0].pts.total > 0) out.push(t("tc_win", { n: S.game.people[res[0].who] ? S.game.people[res[0].who].name : "?", p: res[0].pts.total }));
    var topW = gw.words && gw.words[0] && gw.words[0].n >= 2 ? gw.words[0] : null, wN = {};
    (gw.words || []).forEach(function (x) { wN[x.k] = x.n; });
    var nm = function (k) { var p = S.game.people[k]; return p ? p.name : "?"; };
    res.forEach(function (r) {
      var n = nm(r.who), mark = cand.length;
      if (r.p != null && avg != null) { var e = Math.abs(r.p - avg); if (e <= 0.5) cand.push(t("tc_exact", { n: n })); else if (e >= 10) cand.push(t("tc_far", { n: n, d: Math.round(e) })); }
      if (r.e != null && price) { var q = r.e / price; if (Math.abs(r.e - price) / price <= 0.05) cand.push(t("tc_priceok", { n: n })); else if (q <= 0.55) cand.push(t("tc_cheap", { n: n, g: r.e, p: price })); else if (q >= 1.8) cand.push(t("tc_pricey", { n: n, g: r.e })); }
      if (r.badges.indexOf("fuori") > -1) cand.push(t("tc_fuori", { n: n }));
      if (r.badges.indexOf("sintonia") > -1) cand.push(t("tc_sintonia", { n: n }));
      if (r.fan && r.fan === r.who) cand.push(t((gw.fanTop || []).indexOf(r.who) > -1 ? "tc_selfok" : "tc_selfko", { n: n }));
      if (r.vote != null && avg != null) { if (r.vote - avg >= 8) cand.push(t("tc_love", { n: n, v: r.vote })); else if (avg - r.vote >= 8) cand.push(t("tc_hate", { n: n, v: r.vote })); }
      if ((r.pts.aroma || 0) >= 9) cand.push(t("tc_aroma", { n: n }));
      if (topW && r.wd && r.wd !== topW.k && wN[r.wd] === 1) cand.push(t("tc_odd", { n: n, w: t("pw_" + topW.k), w2: t("pw_" + r.wd) }));
      /* una sola frase a testa: si sceglie a caso (ma uguale per tutti) tra le sue */
      var mine = cand.splice(mark); if (mine.length) cand.push(mine[hashN(wid + r.who) % mine.length]);
    });
    var pos = res.filter(function (r) { return r.x != null; });
    for (var i = 0; i < pos.length && !twin; i++) for (var j = i + 1; j < pos.length; j++) { if (Math.hypot(pos[i].x - pos[j].x, pos[i].y - pos[j].y) < 0.8) { var twin = t("tc_twins", { a: nm(pos[i].who), b: nm(pos[j].who) }); break; } }
    if (twin) cand.push(twin);
    /* l'ordine cambia da vino a vino, ma resta lo stesso per tutti */
    var k = cand.length ? hashN(wid) % cand.length : 0;
    cand = cand.slice(k).concat(cand.slice(0, k));
    return out.concat(cand.slice(0, 4));
  }

  /* la scommessa della serata: prima della chiusura si sceglie il vincitore, dopo si vede chi aveva indovinato */
  function favHtml() {
    if (!gameOn() || !S.game || !S.game.fav || !S.game.fav.eligible) return "";
    var f = S.game.fav, wines = S.wines || [], h = '<section class="card g-fav"><h3 class="section">🔮 ' + esc(t("fav_title")) + '</h3>';
    var nameOf = function (wid) { var w = wines.filter(function (x) { return x.id === wid; })[0]; return w ? (w.hidden ? t("blindLabel", { n: w.index }) : w.name) : "?"; };
    if (f.open) {
      h += '<p class="small">' + esc(t("fav_q")) + '</p><div class="g-favlist" role="group" aria-label="' + esc(t("fav_title")) + '">' + wines.map(function (w) {
        var on = f.mine === w.id;
        return '<button type="button" class="g-favb' + (on ? " on" : "") + '" data-act="g-fav" data-id="' + esc(w.id) + '" aria-pressed="' + on + '" data-fk="gfav-' + esc(w.id) + '"' + (readonly() ? " disabled" : "") + '><b dir="auto">' + esc(nameOf(w.id)) + '</b><span>' + esc(on ? t("fav_mine") : t("fav_pick")) + '</span></button>';
      }).join("") + '</div>';
      h += '<div class="g-who"><span class="small muted">' + esc(f.pickers.length ? (f.pickers.length === 1 ? t("fav_who1") : t("fav_whoN", { n: f.pickers.length })) : t("fav_none")) + '</span><span class="g-faces">' + f.pickers.map(function (k) { return '<span class="g-wf on">' + faceHtml(k) + '</span>'; }).join("") + '</span></div>';
      h += '<p class="small muted">' + esc(t("fav_secret")) + '</p>';
      if (S.saved === "fav") h += '<p class="saved-note">✓ ' + esc(t("fav_saved")) + '</p>';
      return h + '</section>';
    }
    var res = f.results || [], mine = res.filter(function (r) { return S.game.people[r.who] && S.game.people[r.who].me; })[0];
    if (mine) h += '<p class="g-favres' + (mine.ok ? " ok" : "") + '">' + esc(mine.ok ? t("fav_won") : t("fav_lost")) + '</p>';
    (f.winners || []).forEach(function (wid) {
      var who = res.filter(function (r) { return r.wine === wid; }).map(function (r) { return r.who; });
      h += '<div class="g-favwin"><span class="small muted">' + esc(t("fav_winner")) + '</span><b dir="auto">🏆 ' + esc(nameOf(wid)) + '</b><span class="small">' + esc(who.length ? t("fav_who") : t("fav_nobody")) + '</span>' +
        (who.length ? '<span class="g-faces">' + who.map(function (k) { return '<span class="g-wf on" title="' + esc(personName(k)) + '">' + faceHtml(k) + '</span>'; }).join("") + '</span>' : "") + '</div>';
    });
    return h + '</section>';
  }
  function gameFav(wid) {
    var cur = S.game && S.game.fav && S.game.fav.mine;
    return run("fav", function () {
      return api({ op: "game.fav", tasting: S.tasting.id, wine: cur === wid ? "" : wid }).then(function () { S.saved = "fav"; announce(t("fav_saved")); focusAfter("gfav-" + wid); return loadGame(S.tasting.id); }, function (err) { announce(errText(err), true); });
    });
  }

  /* coriandoli quando un vino si svela e sei il primo: solo una volta per vino, mai con «riduci animazioni» */
  var confettiDone = {};
  function confetti(anchor) {
    var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || !anchor) return;
    var box = document.createElement("div"); box.className = "g-confetti"; box.setAttribute("aria-hidden", "true");
    for (var i = 0; i < 36; i++) {
      var c = document.createElement("i"); c.className = "c" + (i % 8);
      c.style.left = (5 + Math.random() * 90) + "%"; c.style.animationDelay = (Math.random() * 0.35) + "s"; c.style.animationDuration = (1.1 + Math.random() * 0.9) + "s";
      c.style.setProperty("--dx", ((Math.random() - 0.5) * 140) + "px"); c.style.setProperty("--rot", (Math.random() * 720 - 360) + "deg");
      box.appendChild(c);
    }
    anchor.appendChild(box);
    setTimeout(function () { if (box.parentNode) box.parentNode.removeChild(box); }, 2600);
  }

  /* posizioni del campo, dopo ogni disegno; allo svelamento le facce partono dal centro e volano al loro posto */
  var gSeen = {};
  function placeDots() {
    var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    app.querySelectorAll(".g-field").forEach(function (f) {
      var wid = f.getAttribute("data-field"), gw = S.game && S.game.wines[wid], animate = gw && gw.revealed && !gSeen[wid] && !reduce && !f.classList.contains("edit");
      var c = f.querySelector(".g-center");
      f.querySelectorAll("[data-gx]").forEach(function (el) {
        var x = Number(el.getAttribute("data-gx")), y = Number(el.getAttribute("data-gy"));
        if (animate && el !== c && c) { el.style.left = Number(c.getAttribute("data-gx")) * 10 + "%"; el.style.top = (100 - Number(c.getAttribute("data-gy")) * 10) + "%"; el.classList.add("fly"); }
        else { el.style.left = x * 10 + "%"; el.style.top = (100 - y * 10) + "%"; }
      });
      if (animate) {
        void f.offsetWidth;
        requestAnimationFrame(function () { f.querySelectorAll(".g-dot.fly").forEach(function (el) { el.style.left = Number(el.getAttribute("data-gx")) * 10 + "%"; el.style.top = (100 - Number(el.getAttribute("data-gy")) * 10) + "%"; }); });
      }
      if (animate && !confettiDone[wid] && gw.results && gw.results.length > 1 && S.game.people[gw.results[0].who] && S.game.people[gw.results[0].who].me) {
        confettiDone[wid] = true; confetti(f.closest(".game")); announce(t("g_youWon"));
      }
      if (gw && gw.revealed) gSeen[wid] = true;
    });
  }

  /* trascinare la propria faccia (dito, mouse, penna) */
  var gDrag = null;
  function fieldPos(f, ev) {
    var r = f.getBoundingClientRect();
    var x = Math.max(0, Math.min(10, (ev.clientX - r.left) / r.width * 10)), y = Math.max(0, Math.min(10, (1 - (ev.clientY - r.top) / r.height) * 10));
    return { x: Math.round(x * 2) / 2, y: Math.round(y * 2) / 2 };
  }
  function moveFace(wid, p, rerender) {
    var d = draftOf(wid); d.x = p.x; d.y = p.y; S.saved = null;
    var dot = app.querySelector('.g-field[data-field="' + wid + '"] .g-dot.me');
    if (!dot || rerender) { render(); focusAfter("gface-" + wid); return; }
    dot.setAttribute("data-gx", p.x); dot.setAttribute("data-gy", p.y); dot.style.left = p.x * 10 + "%"; dot.style.top = (100 - p.y * 10) + "%";
  }
  app.addEventListener("pointerdown", function (e) {
    var f = e.target.closest && e.target.closest(".g-field.edit"); if (!f || readonly()) return;
    e.preventDefault();
    var wid = f.getAttribute("data-field"), had = !!app.querySelector('.g-field[data-field="' + wid + '"] .g-dot.me');
    gDrag = { f: f, wid: wid, id: e.pointerId };
    try { f.setPointerCapture(e.pointerId); } catch (x) { /* ok */ }
    moveFace(wid, fieldPos(f, e), !had);
    if (!had) gDrag = null;
  });
  app.addEventListener("pointermove", function (e) { if (gDrag && e.pointerId === gDrag.id) moveFace(gDrag.wid, fieldPos(gDrag.f, e)); });
  app.addEventListener("pointerup", function (e) { if (gDrag && e.pointerId === gDrag.id) { var wid = gDrag.wid; gDrag = null; var d = draftOf(wid); announce(t("ax_" + axesOf(S.game.wines[wid]).x) + " " + d.x + ", " + t("ax_" + axesOf(S.game.wines[wid]).y) + " " + d.y); } });
  app.addEventListener("keydown", function (e) {
    var el = e.target; if (!el.classList || !el.classList.contains("g-dot") || !el.classList.contains("me")) return;
    var k = e.key, st = e.shiftKey ? 1 : 0.5, wid = el.getAttribute("data-w"), d = draftOf(wid);
    var dx = k === "ArrowRight" ? st : k === "ArrowLeft" ? -st : 0, dy = k === "ArrowUp" ? st : k === "ArrowDown" ? -st : 0;
    if (!dx && !dy) return;
    e.preventDefault();
    moveFace(wid, { x: Math.max(0, Math.min(10, (d.x || 5) + dx)), y: Math.max(0, Math.min(10, (d.y || 5) + dy)) });
    el.setAttribute("aria-label", personName(mePk()) + ": " + t("ax_" + axesOf(S.game.wines[wid]).x) + " " + d.x + ", " + t("ax_" + axesOf(S.game.wines[wid]).y) + " " + d.y);
  });
  app.addEventListener("input", function (e) {
    var el = e.target, k = el.getAttribute && el.getAttribute("data-g"), wid = el.getAttribute && el.getAttribute("data-w");
    if (!k || !wid || !S.game) return;
    var d = draftOf(wid); S.saved = null; S.gerr = null;
    if (k === "p") { d.p = Number(el.value); el.classList.remove("untouched"); var o = app.querySelector("#gpo-" + wid); if (o) o.textContent = d.p; }
    if (k === "e") d.e = el.value;
  });
  app.addEventListener("change", function (e) {
    var el = e.target; if (!el.getAttribute || el.getAttribute("data-g") !== "dt") return;
    duelAct("game.duel.taunt", { id: el.getAttribute("data-id"), taunt: el.value }, el.getAttribute("data-fk"), null);
  });
  app.addEventListener("change", function (e) {
    var el = e.target; if (!el.getAttribute || el.getAttribute("data-g") !== "f") return;
    var wid = el.getAttribute("data-w"), to = el.getAttribute("data-to"), r = (S.game.wines[wid].results || []).filter(function (x) { return x.who === to; })[0];
    var cur = r ? (r.reactions.filter(function (x) { return x.from === mePk(); })[0] || {}) : {};
    gameReact(wid, to, cur.e || "", el.value);
  });
  function gNum(s) { s = String(s || "").trim().replace(",", "."); return s === "" ? null : Number(s); }
  function gamePlay(wid) {
    var d = draftOf(wid), e = gNum(d.e);
    if (e != null && !(e >= 0 && e <= 10000)) { S.gerr = { wine: wid, text: t("e_invalid_price") }; return render(); }
    if (d.x == null && d.p == null && e == null && !d.a.length && !d.wd && !d.fan) { S.gerr = { wine: wid, text: t("e_invalid_move") }; return render(); }
    S.gerr = null;
    return run("g-" + wid, function () {
      return api({ op: "game.play", tasting: S.tasting.id, wine: wid, x: d.x, y: d.y, p: d.p, e: e, a: d.a, wd: d.wd, fan: d.fan }).then(function () {
        S.saved = "gm-" + wid; announce(t("g_saved")); focusAfter("gplay-" + wid); return loadGame(S.tasting.id);
      }, function (err) { S.gerr = { wine: wid, text: errText(err) }; render(); if (err.code === "revealed") return loadGame(S.tasting.id); });
    });
  }
  function gameReact(wid, to, e, f) {
    return api({ op: "game.react", tasting: S.tasting.id, wine: wid, to: to, e: e, f: f }).then(function () { return loadGame(S.tasting.id); }, function (err) { announce(errText(err), true); });
  }
  function gamePrice(wid) {
    var el = app.querySelector("#gr-" + wid), v = el ? gNum(el.value) : null;
    return api({ op: "game.price", tasting: S.tasting.id, wine: wid, price: v }).then(function () { S.saved = "gp-" + wid; return loadGame(S.tasting.id); }, function (err) { announce(errText(err), true); });
  }
  function gameReveal(wid) {
    S.gconfirm = null;
    return api({ op: "game.reveal", tasting: S.tasting.id, wine: wid }).then(function () { return loadGame(S.tasting.id); }, function (err) { announce(errText(err), true); });
  }
  app.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-act]"); if (!b || b.disabled) return;
    var act = b.getAttribute("data-act"), id = b.getAttribute("data-id");
    if (act === "g-play") return gamePlay(id);
    if (act === "g-fav") return gameFav(id);
    if (act === "du-new") { S.dform = { to: "", wine: "", stake: "", err: "" }; focusAfter("du-go"); return render(); }
    if (act === "du-cancelform") { S.dform = null; focusAfter("du-new"); return render(); }
    if (act === "du-to" || act === "du-wine" || act === "du-stake") { var key = act.slice(3); S.dform[key] = S.dform[key] === b.getAttribute("data-k") ? "" : b.getAttribute("data-k"); S.dform.err = ""; focusAfter(b.getAttribute("data-fk")); return render(); }
    if (act === "du-go") {
      var df = S.dform; if (!df.to || !df.wine || !df.stake) { df.err = t("du_pickAll"); return render(); }
      return duelAct("game.duel", { wine: df.wine, to: df.to, stake: df.stake }, "du-new", t("du_sent")).then(function () { if (S.dform && !S.dform.err) { S.dform = null; render(); } });
    }
    if (act === "du-accept" || act === "du-decline") return duelAct("game.duel.answer", { id: id, accept: act === "du-accept" }, null, null);
    if (act === "du-cancel") return duelAct("game.duel.cancel", { id: id }, "du-new", null);
    if (act === "du-rematch") {
      var od = (S.game.duels || []).filter(function (x) { return x.id === id; })[0], meK = mePk();
      S.dform = { to: od ? (od.from === meK ? od.to : od.from) : "", wine: "", stake: od ? od.stake : "", err: "" }; focusAfter("du-go"); return render();
    }
    if (act === "g-aroma" || act === "g-word" || act === "g-fan") {
      var dw = b.getAttribute("data-w"), k = b.getAttribute("data-k"), dd = draftOf(dw);
      if (act === "g-aroma") { var ix = dd.a.indexOf(k); if (ix > -1) dd.a.splice(ix, 1); else if (dd.a.length < 3) dd.a.push(k); }
      if (act === "g-word") dd.wd = dd.wd === k ? "" : k;
      if (act === "g-fan") dd.fan = dd.fan === k ? "" : k;
      focusAfter(b.getAttribute("data-fk")); return render();
    }
    if (act === "g-help") { S.ghelp = !S.ghelp; focusAfter(S.ghelp ? "h-help" : b.getAttribute("data-fk")); return render(); }
    if (act === "g-novita") { try { localStorage.setItem(NOVITA_KEY, "1"); } catch (err) { /* niente memoria: si riproporrà */ } S.novitaOff = true; return render(); }
    if (act === "g-bmode") { S.boardMode = b.getAttribute("data-v"); focusAfter("gbm-" + S.boardMode); return render(); }
    if (act === "g-price") return gamePrice(id);
    if (act === "g-reveal") { S.gconfirm = id; focusAfter("greveal-" + id); return render(); }
    if (act === "g-reveal-no") { var w0 = S.gconfirm; S.gconfirm = null; focusAfter("greveal-" + w0); return render(); }
    if (act === "g-reveal-do") return gameReveal(id);
    if (act === "g-react") {
      var wid = b.getAttribute("data-w"), to = b.getAttribute("data-to"), em = b.getAttribute("data-e");
      var r = (S.game.wines[wid].results || []).filter(function (x) { return x.who === to; })[0], cur = r ? (r.reactions.filter(function (x) { return x.from === mePk(); })[0] || {}) : {};
      focusAfter(b.getAttribute("data-fk"));
      return gameReact(wid, to, cur.e === em ? "" : em, cur.f || "");
    }
  });

  /* ---------------- modulo di voto ---------------- */
  var SMART = [["occhio", "eye", "eyeH", "eyeW"], ["naso", "nose", "noseH", "noseW"], ["bocca", "mouth", "mouthH", "mouthW"]];
  var FULL_KEYS = (function () { var k = []; Object.keys(Scoring.ITEMS).forEach(function (g) { Scoring.ITEMS[g].forEach(function (d) { k.push(g + "-" + d[0]); }); }); return k; })();

  function newSheet(w) {
    var modes = S.config.modes, mine = w.mine;
    var mode = mine && modes.indexOf(mine.mode) > -1 ? mine.mode : (modes.indexOf(S.config.defaultMode) > -1 ? S.config.defaultMode : modes[0]);
    var giudizi = { occhio: 68, naso: 68, bocca: 68 }, voti = {}, touched = {};
    Object.keys(Scoring.ITEMS).forEach(function (g) { voti[g] = {}; Scoring.ITEMS[g].forEach(function (d) { voti[g][d[0]] = 6; }); });
    /* chi modifica un voto già dato ha già "toccato" tutti i cursori di quella modalità */
    if (mine && mine.mode === "smart" && mine.data && mine.data.giudizi) { Object.assign(giudizi, mine.data.giudizi); SMART.forEach(function (s) { touched["sm-" + s[0]] = true; }); }
    if (mine && mine.mode === "full" && mine.data && mine.data.voti) { Object.keys(voti).forEach(function (g) { Object.assign(voti[g], mine.data.voti[g] || {}); }); FULL_KEYS.forEach(function (k) { touched["fl-" + k] = true; }); }
    var sh = { wine: w.id, mode: mode, giudizi: giudizi, voti: voti, touched: touched, note: (mine && mine.note) || "", error: "" };
    sh.orig = mine ? sheetKey(sh) : null;
    return sh;
  }
  /* l'impronta di ciò che l'utente può cambiare: serve a sapere se c'è davvero qualcosa da non perdere */
  function sheetKey(sh) { return JSON.stringify([sh.mode, sh.mode === "smart" ? sh.giudizi : sh.voti, sh.note]); }
  function sheetScore() {
    var sh = S.sheet;
    return sh.mode === "smart" ? Scoring.smartScore(sh.giudizi).total : Scoring.fullScore(sh.voti, Scoring.ITEMS).total;
  }
  function sliderIds() { return S.sheet.mode === "smart" ? SMART.map(function (s) { return "sm-" + s[0]; }) : FULL_KEYS.map(function (k) { return "fl-" + k; }); }
  function givenCount() { var sh = S.sheet; return sliderIds().filter(function (id) { return sh.touched[id]; }).length; }

  function sliderHtml(id, label, help, weight, min, max, val, scale, word) {
    var touched = S.sheet.touched[id];
    var wid = id + "-help";
    return '<div class="slider' + (touched ? "" : " untouched") + '" data-slider="' + id + '"><div class="head"><label class="lab" for="' + id + '" dir="auto">' + esc(label) +
      (weight ? ' <span class="small muted">· ' + esc(weight) + '</span>' : "") + '</label><span class="reading"><span class="val" id="' + id + '-v">' + val + '</span> <span class="word" id="' + id + '-w">' + esc(word) + '</span></span></div>' +
      (help ? '<p class="help" id="' + wid + '">' + esc(help) + '</p>' : "") +
      '<input type="range" id="' + id + '" data-fk="' + id + '" min="' + min + '" max="' + max + '" step="1" value="' + val + '"' + (help ? ' aria-describedby="' + wid + '"' : "") +
      ' aria-valuetext="' + esc(val + ", " + word) + '" aria-label="' + esc(t("sliderOf", { name: label, min: min, max: max })) + '">' +
      '<div class="scale" aria-hidden="true">' + scale.map(function (s) { return "<span>" + s + "</span>"; }).join("") + '</div></div>';
  }

  function sheetHtml(w) {
    var sh = S.sheet, modes = S.config.modes, busy = !!S.pending.vote, tot = sliderIds().length, ok = givenCount() === tot;
    var h = '<form class="card wine sheet" data-form="vote" novalidate aria-labelledby="sh-title"><h3 class="name" id="sh-title" tabindex="-1" dir="auto">' + esc(wineTitle(w)) + '</h3><p class="meta" dir="auto">' + wineLine(w) + '</p>';
    if (modes.length > 1) {
      h += '<div class="modes" role="group" aria-label="' + esc(t("modeLabel")) + '">' + ["smart", "full"].filter(function (m) { return modes.indexOf(m) > -1; }).map(function (m) {
        return '<button type="button" aria-pressed="' + (sh.mode === m) + '" class="' + (sh.mode === m ? "on" : "") + '" data-act="mode" data-mode="' + m + '" data-fk="mode-' + m + '">' + esc(t(m === "smart" ? "modeSmart" : "modeFull")) + '</button>';
      }).join("") + '</div>';
    }
    h += '<p class="small muted">' + esc(t(sh.mode === "smart" ? "smartHint" : "fullHint")) + ' ' + esc(t("touchHint")) + '</p>';
    if (sh.mode === "smart") {
      SMART.forEach(function (s) { var v = sh.giudizi[s[0]]; h += sliderHtml("sm-" + s[0], t(s[1]), t(s[2]), t(s[3]), 50, 100, v, [50, 60, 70, 80, 90, 100], bandWord(v)); });
    } else {
      Object.keys(Scoring.ITEMS).forEach(function (g) {
        h += '<h4 class="grp">' + esc(t("g_" + g)) + '</h4>';
        Scoring.ITEMS[g].forEach(function (d) { var v = sh.voti[g][d[0]]; h += sliderHtml("fl-" + g + "-" + d[0], t("i_" + g + "_" + d[0]), "", "", 0, 10, v, [0, 5, 10], t("w" + v)); });
      });
    }
    var sc = sheetScore();
    h += '<div class="preview"><span class="band">' + esc(t("score")) + '</span><span class="big" id="sh-score">' + sc + '</span><span class="band" id="sh-band">' + esc(bandWord(sc)) + '</span></div>';
    h += '<p class="small muted" id="sh-progress">' + esc(ok ? t("progressDone") : t("progress", { n: givenCount(), tot: tot })) + '</p>';
    h += '<label class="f" for="sh-note">' + esc(t("note")) + '</label><textarea id="sh-note" data-fk="sh-note" rows="2" maxlength="500" dir="auto">' + esc(sh.note) + '</textarea>';
    if (sh.error) h += '<p class="field-error" id="sh-err">' + esc(sh.error) + '</p>';
    h += '<div class="row">' + btn("save-vote", t(busy ? "savingVote" : "saveVote"), { type: "submit", cls: "primary", disabled: busy || !ok || readonly(), fk: "save-vote", describedby: "sh-progress" }) + btn("cancel-vote", t("discard"), { cls: "ghost", fk: "cancel-vote" }) + '</div></form>';
    return h;
  }

  function updateSheetReadout(id) {
    var sh = S.sheet, v, word;
    if (id.indexOf("sm-") === 0) { v = sh.giudizi[id.slice(3)]; word = bandWord(v); }
    else { var p = id.split("-"); v = sh.voti[p[1]][p[2]]; word = t("w" + v); }
    var vEl = document.getElementById(id + "-v"), wEl = document.getElementById(id + "-w"), inp = document.getElementById(id);
    if (vEl) vEl.textContent = v; if (wEl) wEl.textContent = word;
    if (inp) inp.setAttribute("aria-valuetext", v + ", " + word);
    var box = inp && inp.closest(".slider"); if (box) box.classList.toggle("untouched", !sh.touched[id]);
    var sc = sheetScore();
    document.getElementById("sh-score").textContent = sc;
    document.getElementById("sh-band").textContent = bandWord(sc);
    var tot = sliderIds().length, ok = givenCount() === tot;
    document.getElementById("sh-progress").textContent = ok ? t("progressDone") : t("progress", { n: givenCount(), tot: tot });
    var save = $('[data-act="save-vote"]'); if (save) { if (!!S.pending.vote || !ok || readonly()) save.setAttribute("aria-disabled", "true"); else save.removeAttribute("aria-disabled"); }
  }

  /* ---------------- render, focus e scorrimento ---------------- */
  var pendingFocus = null;       // { fk, select } oppure { sel }
  var lastTitle = "";

  function render() {
    var active = document.activeElement, fk = active && active.getAttribute && active.getAttribute("data-fk"), selStart = null, selEnd = null;
    if (fk && active.setSelectionRange && /^(text|search)?$/.test(active.type || "") ) { try { selStart = active.selectionStart; selEnd = active.selectionEnd; } catch (e) { /* tipi senza selezione */ } }
    var html;
    if (S.fatal) html = viewFatal();
    else if (!S.user) html = '<section class="card" aria-busy="true"><p>' + esc(t("loading")) + '</p></section>';
    else html = S.view === "tasting" && S.tasting ? viewTasting() : viewList();
    app.innerHTML = '<main>' + html + '</main>' + (S.circle ? "" : versionHtml());
    var logo = app.querySelector(".logo"); if (logo) logo.addEventListener("error", function () { logo.remove(); reportHeight(); });
    var title = ((S.config && S.config.title) || "Taste") + (S.user && !S.fatal ? " — " + (S.view === "tasting" && S.tasting ? S.tasting.name : t(S.tab === "ranking" ? "tabRanking" : S.tab === "stats" ? "tabStats" : S.tab === "notebook" ? "tabNotebook" : "tastings")) : "");
    if (title !== lastTitle) { document.title = title; lastTitle = title; }
    /* il focus resta dov'era: un lettore di schermo o chi usa la tastiera non riparte dall'inizio */
    var target = null;
    if (pendingFocus && !S.loading) {
      target = pendingFocus.fk ? app.querySelector('[data-fk="' + pendingFocus.fk + '"]') : app.querySelector(pendingFocus.sel);
      if (target) { try { target.focus(); } catch (e) { /* ok */ } if (pendingFocus.scroll) target.scrollIntoView({ block: pendingFocus.scroll }); pendingFocus = null; }
      /* l'elemento può comparire solo dopo il caricamento: l'intenzione resta per qualche disegno */
      else if (--pendingFocus.ttl <= 0) pendingFocus = null;
    }
    if (!target && fk) {
      target = app.querySelector('[data-fk="' + fk + '"]');
      if (target) { try { target.focus({ preventScroll: true }); if (selStart != null && target.setSelectionRange) target.setSelectionRange(selStart, selEnd); } catch (e) { /* ok */ } }
    }
    if (S.game) placeDots();
    reportHeight();
  }
  function focusAfter(fk, scroll) { pendingFocus = { fk: fk, scroll: scroll || null, ttl: 4 }; }
  function focusSel(sel, scroll) { pendingFocus = { sel: sel, scroll: scroll || null, ttl: 4 }; }

  /* ---------------- eventi ---------------- */
  function formVals(form) {
    var o = {}; Array.prototype.forEach.call(form.elements, function (el) { if (el.name) o[el.name] = el.type === "checkbox" ? el.checked : el.value; }); return o;
  }

  app.addEventListener("input", function (e) {
    var el = e.target, form = el.form;
    if (el.id === "nb-q") { S.nbq = el.value; render(); return; }
    if (form && form.getAttribute("data-form") === "guess" && S.gform) { S.gform.vals = Object.assign(S.gform.vals, formVals(form)); S.gform.error = ""; return; }
    if (form && form.getAttribute("data-form") !== "vote" && form.getAttribute("data-form") !== "guess" && S.form) { S.form.vals = Object.assign(S.form.vals, formVals(form)); S.form.error = ""; return; }
    if (!S.sheet) return;
    if (el.id === "sh-note") { S.sheet.note = el.value; return; }
    var v = Number(el.value);
    if (el.id.indexOf("sm-") === 0) S.sheet.giudizi[el.id.slice(3)] = Scoring.clampBand(v);
    else if (el.id.indexOf("fl-") === 0) { var p = el.id.split("-"); S.sheet.voti[p[1]][p[2]] = v; }
    else return;
    S.sheet.touched[el.id] = true; S.sheet.error = "";
    updateSheetReadout(el.id);
  });
  app.addEventListener("change", function (e) {
    var el = e.target;
    if (el.id === "nb-sort") { S.nbsort = el.value; render(); }
    else if (el.id === "nb-only") { S.nbOnly = el.checked; render(); }
  });
  /* toccare il cursore senza spostarlo (o usare la tastiera) vale come dare quel giudizio */
  function markTouched(e) {
    var el = e.target;
    if (!S.sheet || !el || el.type !== "range" || S.sheet.touched[el.id]) return;
    S.sheet.touched[el.id] = true; updateSheetReadout(el.id);
  }
  app.addEventListener("pointerdown", markTouched);
  app.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { escape(e); return; }
    if (/^(Arrow|Home|End|Page)/.test(e.key)) markTouched(e);
  });
  function escape(e) {
    if (S.sheet) { e.preventDefault(); closeSheet(); }
    else if (S.gform) { e.preventDefault(); var gw = S.gform.wine; S.gform = null; focusAfter("guess-" + gw); render(); }
    else if (S.confirm) { e.preventDefault(); S.confirm = null; focusAfter("ask-status"); render(); }
    else if (S.form) { e.preventDefault(); var k = S.form.kind; S.form = null; focusAfter(k === "tasting" ? "new-tasting" : k === "single" ? "new-single" : "new-wine"); render(); }
  }
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !app.contains(e.target)) escape(e); });

  /* una bozza che l'utente ha toccato si tiene in memoria: riaprendo il vino la ritrova */
  function stashSheet() {
    var sh = S.sheet; if (!sh) return null;
    var tocc = sh.orig != null ? sheetKey(sh) !== sh.orig : (Object.keys(sh.touched).length > 0 || !!sh.note);
    if (tocc) S.drafts[sh.wine] = sh; else delete S.drafts[sh.wine];
    S.sheet = null; return sh.wine;
  }
  /* l'ipotesi che si stava scrivendo non si perde aprendo quella di un altro vino: ritrovandola, torna com'era */
  function stashGuess() {
    var g = S.gform; if (!g) return;
    var base = (S.wines.filter(function (x) { return x.id === g.wine; })[0] || {}).guess || {};
    var tocc = (g.vals.type || "") !== (base.type || "") || (g.vals.grape || "") !== (base.grape || "") || (g.vals.year || "") !== (base.year || "");
    if (tocc) S.gdrafts[g.wine] = g.vals; else delete S.gdrafts[g.wine];
  }
  function closeSheet() {
    var w = stashSheet(); if (w == null) return;
    focusAfter("vote-" + w); render();
  }

  app.addEventListener("submit", function (e) {
    e.preventDefault();
    var form = e.target, kind = form.getAttribute("data-form");
    if (readonly()) { announce(t("e_readonly"), true); return; }
    if (kind === "vote") return saveVote();
    if (kind === "guess") return submitGuess(form);
    if (kind === "tasting") return submitTasting(form);
    if (kind === "wine") return submitWine(form);
    if (kind === "single") return submitSingle(form);
  });

  /* «Un solo vino»: la degustazione prende il nome del vino (con l'annata) e nasce con quel vino */
  function submitSingle(form) {
    S.form.vals = Object.assign(S.form.vals, formVals(form));
    var v = S.form.vals, name = v.name.trim();
    if (!name) { S.form.error = t("e_invalid_name"); focusAfter("f-name"); announce(S.form.error, true); return render(); }
    var titolo = (name + (v.vintage && v.vintage.trim() ? " " + v.vintage.trim() : "")).slice(0, 80);
    return run("single", function () {
      return api({ op: "tasting.create", name: titolo, wine: { name: name, producer: v.producer, vintage: v.vintage, type: v.type, grape: v.grape, region: v.region } }).then(function (r) {
        S.form = null; S.view = "tasting"; pushHistory(r.tasting.id);
        announce(t("create") + ": " + r.tasting.name);
        focusSel("#h-main");
        return loadState(r.tasting.id);
      }, function (e) { return handleError(e, "form"); });
    });
  }

  function submitTasting(form) {
    S.form.vals = Object.assign(S.form.vals, formVals(form));
    var name = S.form.vals.name.trim();
    if (!name) { S.form.error = t("e_invalid_name"); focusAfter("f-name"); announce(S.form.error, true); return render(); }
    return run("tasting", function () {
      return api({ op: "tasting.create", name: name, blind: S.form.vals.blind === true }).then(function (r) {
        S.form = null; S.view = "tasting"; pushHistory(r.tasting.id);
        announce(t("create") + ": " + r.tasting.name);
        focusSel("#h-main");
        return loadState(r.tasting.id);
      }, function (e) { return handleError(e, "form"); });
    });
  }
  function submitWine(form) {
    S.form.vals = Object.assign(S.form.vals, formVals(form));
    var v = S.form.vals;
    if (!v.name.trim()) { S.form.error = t("e_invalid_name"); focusAfter("f-name"); announce(S.form.error, true); return render(); }
    return run("wine", function () {
      return api({ op: "wine.add", tasting: S.tasting.id, wine: { name: v.name, producer: v.producer, vintage: v.vintage, type: v.type, grape: v.grape, region: v.region } }).then(function (r) {
        S.form = { kind: "wine", vals: { name: "", producer: "", vintage: "", type: v.type, grape: "", region: v.region || "" }, error: "" };
        announce(t("wineAdded", { name: r.wine.name }));
        S.notice = { kind: "ok", text: "✓ " + t("wineAdded", { name: r.wine.name }) };
        S.saved = null;
        focusAfter("f-name");
        return loadState(S.tasting.id, true);
      }, function (e) { return handleError(e, "form"); });
    });
  }
  function saveVote() {
    var sh = S.sheet; if (!sh) return;
    if (givenCount() !== sliderIds().length) { announce(t("progress", { n: givenCount(), tot: sliderIds().length }), true); return; }
    var body = { op: "vote", tasting: S.tasting.id, wine: sh.wine, mode: sh.mode, note: sh.note };
    if (sh.mode === "smart") body.giudizi = sh.giudizi; else body.voti = sh.voti;
    return run("vote", function () {
      return api(body).then(function (r) {
        delete S.drafts[sh.wine]; if (S.sheet && S.sheet.wine === sh.wine) S.sheet = null; S.saved = sh.wine; S.notice = null;
        announce(t("savedOk") + " " + r.score + ", " + bandWord(r.score));
        focusAfter("vote-" + sh.wine, "center");
        setTimeout(function () { if (S.saved === sh.wine) { S.saved = null; render(); } }, 6000);
        return loadState(S.tasting.id, true);
      }, function (e) { return handleError(e, "sheet"); });
    });
  }

  app.addEventListener("click", function (e) {
    var b = e.target.closest("[data-act]");
    if (b && b.getAttribute("aria-disabled") === "true") { e.preventDefault(); return; }
    if (!b || b.disabled) return;
    var act = b.getAttribute("data-act"), id = b.getAttribute("data-id");
    switch (act) {
      case "retry-login": return login();
      case "reauth": S.fatal.asked = true; askReauth("user"); render(); return;
      case "retry-load": return loadState(S.loadError && S.loadError.tasting);
      case "tab": S.tab = b.getAttribute("data-tab"); S.notice = null; S.form = null; focusAfter("tab-" + S.tab); render(); if (S.tab === "notebook") return loadNotebook(); if (S.tab === "ranking") loadBoard(); if (S.tab !== "tastings") return loadStats(); return loadState("", true);
      case "refresh-nb": return loadNotebook();
      case "refresh-stats": if (S.tab === "ranking") loadBoard(); return loadStats();
      case "wine-status": return wineStatus(id);
      case "guess": { var gw = S.wines.filter(function (x) { return x.id === id; })[0]; if (!gw) return; var g0 = gw.guess || {}; stashGuess(); S.gform = { wine: id, vals: S.gdrafts[id] || { type: g0.type || "", grape: g0.grape || "", year: g0.year || "" }, error: "" }; delete S.gdrafts[id]; S.notice = null; S.saved = null; focusAfter("g-type"); return render(); }
      case "cancel-guess": { var gw2 = S.gform && S.gform.wine; S.gform = null; focusAfter("guess-" + gw2); return render(); }
      case "ask-reveal": S.confirm = "reveal"; focusAfter("confirm"); return render();
      case "refresh": S.notice = null; return loadState(S.tasting && S.tasting.id);
      case "open": return openTasting(id, true);
      case "back": if (history.state && history.state.v === "tasting") { history.back(); return; } return goList(true);
      case "new-tasting": S.form = { kind: "tasting", vals: { name: "", blind: false }, error: "" }; focusAfter("f-name"); return render();
      case "new-single": S.form = { kind: "single", vals: { name: "", producer: "", vintage: "", type: "", grape: "" }, error: "" }; focusAfter("f-name"); return render();
      case "new-wine": S.form = { kind: "wine", vals: { name: "", producer: "", vintage: "", type: "", grape: "" }, error: "" }; focusAfter("f-name"); return render();
      case "cancel-form": { var k = S.form && S.form.kind; S.form = null; focusAfter(k === "tasting" ? "new-tasting" : "new-wine"); return render(); }
      case "ask-status": S.confirm = S.tasting.status === "open" ? "close" : "reopen"; focusAfter("confirm"); return render();
      case "ask-delete": S.confirm = "delete"; focusAfter("confirm"); return render();
      case "cancel-confirm": S.confirm = null; focusAfter("ask-status"); return render();
      case "do-confirm": return doConfirm();
      case "vote": return openSheet(id);
      case "mode": S.sheet.mode = b.getAttribute("data-mode"); focusAfter("mode-" + S.sheet.mode); return render();
      case "cancel-vote": return closeSheet();
    }
  });

  function doConfirm() {
    var c = S.confirm, tid = S.tasting.id;
    if (c === "delete") {
      return run("delete", function () {
        return api({ op: "tasting.delete", tasting: tid }).then(function () {
          S.confirm = null; S.sheet = null; announce(t("deleteIt")); return goList(true);
        }, function (e) { S.confirm = null; return handleError(e); });
      });
    }
    if (c === "reveal") {
      return run("reveal", function () {
        return api({ op: "tasting.reveal", tasting: tid }).then(function () {
          S.confirm = null; S.sheet = null; S.gform = null; announce(t("revealedNote")); focusSel("#h-main");
          return loadState(tid, true);
        }, function (e) { S.confirm = null; return handleError(e); });
      });
    }
    return run("status", function () {
      return api({ op: "tasting.status", tasting: tid, status: c === "close" ? "closed" : "open" }).then(function () {
        S.confirm = null; S.sheet = null; focusAfter("ask-status");
        return loadState(tid, true);
      }, function (e) { S.confirm = null; return handleError(e); });
    });
  }

  /* l'organizzatore chiude (o riapre) la votazione di un solo vino: la serata resta aperta */
  function wineStatus(wid) {
    var w = S.wines.filter(function (x) { return x.id === wid; })[0]; if (!w) return;
    var chiudi = !w.closed, tid = S.tasting.id;
    return run("wstatus", function () {
      return api({ op: "wine.status", tasting: tid, wine: wid, status: chiudi ? "closed" : "open" }).then(function () {
        S.notice = { kind: "ok", text: "✓ " + t(chiudi ? "wineClosedOk" : "wineReopenedOk") };
        announce(t(chiudi ? "wineClosedOk" : "wineReopenedOk")); focusAfter("wstatus-" + wid);
        return loadState(tid, true);
      });
    });
  }

  function openSheet(wineId) {
    var w = S.wines.filter(function (x) { return x.id === wineId; })[0]; if (!w) return;
    if (S.sheet) closeSheet();                     // quella aperta resta come bozza
    S.sheet = S.drafts[wineId] || newSheet(w); delete S.drafts[wineId];
    S.notice = null; S.saved = null;
    focusSel("#sh-title", "start"); render();
  }

  /* ---------------- cronologia: il tasto Indietro del browser resta dentro lo spazio ---------------- */
  function pushHistory(tid) { try { history.pushState({ v: "tasting", id: tid }, ""); } catch (e) { /* ok */ } }
  function openTasting(id, push) {
    stashSheet(); stashGuess();
    S.view = "tasting"; S.sheet = null; S.form = null; S.gform = null; S.confirm = null; S.notice = null; S.saved = null;
    S.tasting = null; S.wines = []; S.game = null; S.gdraft = {}; S.gerr = null; S.gconfirm = null;
    if (push) pushHistory(id);
    focusSel("#h-main");
    return loadState(id);
  }
  function goList(push) {
    stashSheet(); stashGuess();
    S.view = "list"; S.tasting = null; S.wines = []; S.sheet = null; S.form = null; S.gform = null; S.confirm = null; S.notice = null;
    if (push) { try { history.pushState({ v: "list" }, ""); } catch (e) { /* ok */ } }
    focusSel("#h-main");
    return loadState("");
  }
  window.addEventListener("popstate", function (e) {
    if (!S.user || S.fatal || /token=/.test(location.hash)) return;
    var st = e.state;
    if (st && st.v === "tasting") openTasting(st.id, false); else goList(false);
  });

  if (window.ResizeObserver) { try { new ResizeObserver(reportHeight).observe(app); } catch (e) { /* senza adattamento di altezza */ } }

  /* Il sito ospite, ricevuto sorso:reauth, imposta un nuovo #token=... sull'iframe: per il browser è
     un cambio di frammento, non un ricaricamento. Si raccoglie qui e si rifà l'accesso, senza perdere
     la scheda di voto che l'utente stava compilando. */
  window.addEventListener("hashchange", function () {
    var tk = new URLSearchParams(location.hash.replace(/^#/, "")).get("token");
    if (!tk) return;
    S.token = tk; S.session = "";
    login();
  });

  /* ---------------- dentro l'app di Taste (serate di una cerchia) ----------------
     Stessa origine: la pagina legge le preferenze dell'app (lingua, modalità di voto) e ne copia i colori. */
  function hostPref(k) { try { return localStorage.getItem(k) || ""; } catch (e) { return ""; } }
  function applyHostTheme() {
    try {
      var root = parent.document.getElementById("root"); if (!root || parent === window) return;
      var cs = parent.getComputedStyle(root), de = document.documentElement, dark = root.classList.contains("dark");
      var map = { "--bg": "--panel", "--surface": "--card", "--ink": "--ink", "--accent": "--sel-bg", "--on-accent": "--sel-fg", "--line": "--line", "--line-strong": "--line-strong", "--muted": "--ink-3" };
      Object.keys(map).forEach(function (k) { var v = cs.getPropertyValue(map[k]).trim(); if (v) de.style.setProperty(k, v); });
      var st = dark ? { "--ok": "#5fd38d", "--warn": "#f0b95a", "--danger": "#ff8a80" } : { "--ok": "#0e7a3e", "--warn": "#8a5a00", "--danger": "#b3261e" };
      Object.keys(st).forEach(function (k) { de.style.setProperty(k, st[k]); });
      de.style.colorScheme = dark ? "dark" : "light";
      de.setAttribute("data-scheme", dark ? "dark" : "light");
      de.setAttribute("data-host", "app");
    } catch (e) { /* senza i colori dell'app restano quelli predefiniti */ }
  }
  window.addEventListener("message", function (e) {
    if (e.origin !== location.origin || !e.data || typeof e.data !== "object") return;
    if (e.data.type === "sorso:theme") applyHostTheme();
    if (e.data.type === "sorso:refresh" && S.user && !S.fatal) { if (S.view === "tasting" && S.tasting) loadState(S.tasting.id, true); else loadState("", true); }
  });

  /* ---------------- avvio ---------------- */
  (function start() {
    var q = new URLSearchParams(location.search);
    S.partner = q.get("p") || "";
    S.circle = /^[0-9a-f]{10}$/.test(q.get("c") || "") ? q.get("c") : "";
    if (S.circle) {
      applyHostTheme();
      S.session = hostPref("sorso.auth.token");
      document.documentElement.setAttribute("data-ready", "1");
      if (!S.session) { S.loading = false; S.fatal = { code: "no_token", session: false, retry: false }; render(); askReauth("no_token"); return; }
      login();
      return;
    }
    var h = new URLSearchParams(location.hash.replace(/^#/, ""));
    S.token = h.get("token") || "";    // solo il frammento: un parametro finirebbe nei log del server
    document.documentElement.setAttribute("data-ready", "1");
    if (!S.token) { S.loading = false; S.fatal = { code: "no_token", session: false, retry: false }; render(); askReauth("no_token"); return; }
    login();
  })();
})();
