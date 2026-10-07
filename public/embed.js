/* Spazio di team di Sorso — interfaccia dell'iframe.

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
    partner: "", token: "", session: "", user: null, config: null, fatal: null,
    view: "list", tastings: [], tasting: null, wines: [], quota: "ok",
    loading: true, loadError: null,
    sheet: null, drafts: {}, form: null, confirm: null, pending: {}, saved: null, notice: null
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
      e_readonly: "Il servizio è in sola lettura: il limite mensile gratuito è quasi raggiunto. Puoi consultare, non votare né creare.",
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
      tastings: "Degustazioni", noTastings: "Ancora nessuna degustazione.", noTastingsOrg: "Crea la prima degustazione del tuo team.",
      newTasting: "Nuova degustazione", tastingName: "Nome della degustazione", open: "aperta", closedBadge: "chiusa",
      wines: "Vini", noWines: "Nessun vino ancora: l'organizzatore deve aggiungerli.", noWinesOrg: "Aggiungi i vini da votare.",
      addWine: "Aggiungi vino", wineName: "Nome del vino", producer: "Produttore (facoltativo)", vintage: "Annata (facoltativa, es. 2018 o NV)",
      wineAdded: "Aggiunto: {name}.",
      closeIt: "Chiudi la degustazione", reopen: "Riapri la degustazione", deleteIt: "Elimina la degustazione",
      closeAsk: "Chiudere la degustazione? Da quel momento nessuno può più votare né aggiungere vini, e i voti sono definitivi. Puoi riaprirla.",
      reopenAsk: "Riaprire la degustazione? Si potrà di nuovo votare e aggiungere vini.",
      deleteAsk: "Eliminare «{name}» con tutti i suoi vini e voti? Non si può annullare.",
      closedNote: "Degustazione chiusa: i voti sono definitivi.",
      closedNoVote: "Degustazione chiusa e non hai votato questo vino: la media del team non è visibile.",
      readonlyNote: "Sola lettura: non si può votare né modificare.",
      vote: "Vota", editVote: "Modifica il mio voto", yourVote: "Il tuo voto", teamAvg: "Media del team",
      voteSingle: "{n} voto", votePlural: "{n} voti",
      votedSingle: "{n} persona ha votato", votedPlural: "{n} persone hanno votato",
      voteToSee: "Vota questo vino per vedere la media del team.", savedOk: "Voto salvato.",
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
      sliderOf: "{name}, da {min} a {max}", asOrganizer: "Organizzatore", asMember: "Partecipante", loadFail: "Non riesco a caricare i dati."
    },
    en: {
      loading: "Loading…", refresh: "Refresh", retry: "Try again", back: "← Tastings", cancel: "Cancel", confirm: "Confirm",
      create: "Create", creating: "Creating…", add: "Add", adding: "Adding…", done: "Done", deleting: "Deleting…", working: "One moment…",
      e_network: "No connection or it is too slow. Check your network and try again.",
      e_timeout: "The service is not responding. Try again shortly.",
      e_generic: "Something went wrong. Please try again.",
      e_rate: "Too many requests in a short time. Wait a few seconds and try again.",
      e_readonly: "The service is read-only: the free monthly limit is almost reached. You can browse, not vote or create.",
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
      tastings: "Tastings", noTastings: "No tastings yet.", noTastingsOrg: "Create your team's first tasting.",
      newTasting: "New tasting", tastingName: "Tasting name", open: "open", closedBadge: "closed",
      wines: "Wines", noWines: "No wines yet: the organizer has to add them.", noWinesOrg: "Add the wines to vote on.",
      addWine: "Add wine", wineName: "Wine name", producer: "Producer (optional)", vintage: "Vintage (optional, e.g. 2018 or NV)",
      wineAdded: "Added: {name}.",
      closeIt: "Close the tasting", reopen: "Reopen the tasting", deleteIt: "Delete the tasting",
      closeAsk: "Close the tasting? From then on nobody can vote or add wines, and votes are final. You can reopen it.",
      reopenAsk: "Reopen the tasting? People will be able to vote and add wines again.",
      deleteAsk: "Delete “{name}” with all its wines and votes? This cannot be undone.",
      closedNote: "Tasting closed: votes are final.",
      closedNoVote: "The tasting is closed and you did not vote on this wine: the team average is not visible.",
      readonlyNote: "Read-only: voting and editing are disabled.",
      vote: "Vote", editVote: "Edit my vote", yourVote: "Your vote", teamAvg: "Team average",
      voteSingle: "{n} vote", votePlural: "{n} votes",
      votedSingle: "{n} person has voted", votedPlural: "{n} people have voted",
      voteToSee: "Vote on this wine to see the team average.", savedOk: "Vote saved.",
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
      sliderOf: "{name}, from {min} to {max}", asOrganizer: "Organizer", asMember: "Participant", loadFail: "I can't load the data."
    }
  };
  function t(k, vars) {
    var d = TXT[S.lang] || TXT.it;
    var s = d[k] != null ? d[k] : (TXT.it[k] != null ? TXT.it[k] : k);
    if (vars) Object.keys(vars).forEach(function (v) { s = s.split("{" + v + "}").join(vars[v]); });
    return s;
  }

  /* ---------------- utilità ---------------- */
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function bandWord(score) { return t("b_" + Scoring.bandKey(score)); }
  /* la media del team ha sempre un decimale, arrotondato alla regola classica (79,45 → 79,5) */
  function dec(n) { return Scoring.roundHalfUp(n, 1).toFixed(1).replace(".", S.lang === "it" ? "," : "."); }
  function plural(n, one, many) { return t(n === 1 ? one : many, { n: n }); }
  function wineLine(w) { return [w.producer, w.vintage].filter(Boolean).map(esc).join(" · "); }
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
    internal: "e_unavailable", no_token: "e_noaccess" };
  function errText(e) {
    if (AUTH_CODES[e.code]) return t("e_access");
    return t(ERR_KEYS[e.code] || "e_generic");
  }

  function api(body) {
    var ctrl = window.AbortController ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, TIMEOUT_MS);
    var headers = { "Content-Type": "application/json" };
    if (S.session) headers.Authorization = "Bearer " + S.session;
    return fetch("/api/embed", { method: "POST", headers: headers, body: JSON.stringify(body), signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) {
        clearTimeout(timer);
        return r.json().catch(function () { return {}; }).then(function (j) {
          if (r.headers.get("X-Sorso-Quota") === "readonly") S.quota = "readonly";
          if (!r.ok) throw mkErr((j.error && j.error.code) || (r.status >= 500 ? "unavailable" : "generic"), r.status);
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
    if (e.status === 401) { S.fatal = { code: e.code, session: true, retry: false }; announce(t("e_session"), true); render(); return; }
    var text = errText(e);
    if (where === "sheet" && S.sheet) S.sheet.error = text;
    else if (where === "form" && S.form) S.form.error = text;
    else S.notice = { kind: "err", text: text };
    announce(text, true);
    if (e.code === "closed" || e.code === "not_found") { S.sheet = null; return loadState(S.tasting && S.tasting.id, true); }
    render();
  }

  /* ---------------- dati ---------------- */
  function loadState(tid, quiet) {
    if (!quiet) { S.loading = true; S.loadError = null; render(); }
    return api({ op: "state", tasting: tid || undefined }).then(function (st) {
      S.loading = false; S.loadError = null;
      S.tastings = st.tastings || []; S.tasting = st.tasting || null; S.wines = st.wines || []; S.quota = st.quota || S.quota;
      if (S.sheet && !S.wines.some(function (w) { return w.id === S.sheet.wine; })) S.sheet = null;
      render();
    }, function (e) {
      S.loading = false;
      if (e.status === 401) return handleError(e);
      S.loadError = { text: errText(e), tasting: tid || "" };
      render();
    });
  }

  /* ---------------- accesso ---------------- */
  function cleanUrl() {
    try { history.replaceState({ v: "list" }, "", location.pathname + "?p=" + encodeURIComponent(S.partner)); } catch (e) { /* ok */ }
  }
  function login() {
    S.fatal = null; S.loading = true; render();
    return api({ op: "session", token: S.token }).then(function (r) {
      S.session = r.session; S.user = r.user; S.config = r.config; S.quota = r.quota || "ok"; S.token = "";
      S.lang = r.config.lang === "en" ? "en" : "it";
      document.documentElement.lang = S.lang;
      cleanUrl();
      return loadState();
    }, function (e) {
      S.loading = false;
      var transient = e.code === "network" || e.code === "timeout" || e.code === "rate_limited" || e.code === "unavailable" || e.status >= 500;
      S.fatal = { code: e.code, session: false, retry: transient };
      announce(errText(e), true);
      render();
      if (!transient) askReauth(e.code);
    });
  }

  /* ---------------- disegno ---------------- */
  function head() {
    var c = S.config || {};
    return '<header class="top">' + (c.logo ? '<img class="logo" alt="" src="' + esc(c.logo) + '">' : "") +
      '<h1 class="title" dir="auto">' + esc(c.title || "Sorso") + '</h1>' +
      (S.user ? '<p class="who" dir="auto">' + esc(S.user.name) + '<br>' + esc(t(isOrg() ? "asOrganizer" : "asMember")) + '</p>' : "") + '</header>';
  }
  function notices() {
    var h = "";
    if (S.notice) h += '<p class="notice ' + (S.notice.kind === "err" ? "err" : "") + '">' + esc(S.notice.text) + '</p>';
    if (readonly()) h += '<p class="notice warn">' + esc(t("e_readonly")) + '</p>';
    else if (S.quota === "warn" && isOrg()) h += '<p class="notice warn">' + esc(S.lang === "en" ? "Heads up: the service is about to reach its free monthly limit." : "Attenzione: il servizio sta per raggiungere il limite mensile gratuito.") + '</p>';
    return h;
  }
  function btn(act, label, opts) {
    opts = opts || {};
    return '<button type="' + (opts.type || "button") + '" class="btn' + (opts.cls ? " " + opts.cls : "") + '" data-act="' + act + '"' +
      (opts.id ? ' data-id="' + esc(opts.id) + '"' : "") + (opts.fk ? ' data-fk="' + esc(opts.fk) + '"' : "") +
      (opts.disabled ? ' disabled' : "") + '>' + esc(label) + '</button>';
  }

  function viewFatal() {
    var f = S.fatal, session = !!f.session;
    var h = head() + '<section class="card fatal"><h2>' + esc(t(session ? "authSessionTitle" : "authTitle")) + '</h2><p>' + esc(errText({ code: f.code })) + '</p>';
    if (session && S.sheet) h += '<p>' + esc(t("authUnsaved")) + '</p>';
    if (f.retry) h += '<div class="row">' + btn("retry-login", t("retry"), { cls: "primary", fk: "retry" }) + '</div>';
    else h += '<p>' + esc(t("authReload")) + '</p><div class="row">' + btn("reauth", t("authAsk"), { cls: "primary", fk: "reauth" }) + btn("reload", t("authReloadHere"), { cls: "ghost" }) + '</div>';
    return h + '</section>';
  }

  function formHtml(kind) {
    var f = S.form, v = f.vals, busy = !!S.pending[kind];
    var err = f.error ? '<p class="field-error" id="form-err">' + esc(f.error) + '</p>' : "";
    var h = '<form class="card" data-form="' + kind + '" novalidate' + (f.error ? ' aria-describedby="form-err"' : "") + '>';
    h += '<label class="f" for="f-name">' + esc(t(kind === "tasting" ? "tastingName" : "wineName")) + '</label>' +
      '<input type="text" id="f-name" name="name" data-fk="f-name" maxlength="' + (kind === "tasting" ? 80 : 100) + '" autocomplete="off" enterkeyhint="done" dir="auto" value="' + esc(v.name) + '"' + (f.error ? ' aria-invalid="true"' : "") + '>';
    if (kind === "wine") {
      h += '<label class="f" for="f-prod">' + esc(t("producer")) + '</label><input type="text" id="f-prod" name="producer" data-fk="f-prod" maxlength="80" autocomplete="off" dir="auto" value="' + esc(v.producer) + '">' +
        '<label class="f" for="f-vint">' + esc(t("vintage")) + '</label><input type="text" id="f-vint" name="vintage" data-fk="f-vint" maxlength="4" inputmode="text" autocomplete="off" value="' + esc(v.vintage) + '">';
    }
    h += err + '<div class="row">' + btn("submit-form", t(busy ? (kind === "tasting" ? "creating" : "adding") : (kind === "tasting" ? "create" : "add")), { type: "submit", cls: "primary", disabled: busy || readonly(), fk: "f-submit" }) +
      btn("cancel-form", t(kind === "wine" ? "done" : "cancel"), { cls: "ghost", fk: "f-cancel" }) + '</div></form>';
    return h;
  }

  function viewList() {
    var org = isOrg(), h = head() + notices();
    h += '<div class="row spread"><h2 id="h-main" tabindex="-1">' + esc(t("tastings")) + '</h2>' + btn("refresh", t("refresh"), { cls: "small ghost", fk: "refresh" }) + '</div>';
    if (S.loadError) return h + loadErrorHtml();
    if (S.loading && !S.tastings.length) return h + '<p class="muted" aria-busy="true">' + esc(t("loading")) + '</p>';
    if (org) h += S.form && S.form.kind === "tasting" ? formHtml("tasting") : '<p>' + btn("new-tasting", t("newTasting"), { cls: "primary", disabled: readonly(), fk: "new-tasting" }) + '</p>';
    if (!S.tastings.length) h += '<p class="muted">' + esc(org ? t("noTastingsOrg") : t("noTastings")) + '</p>';
    S.tastings.forEach(function (x) {
      h += '<button type="button" class="card link" data-act="open" data-id="' + esc(x.id) + '" data-fk="open-' + esc(x.id) + '"><span class="row spread"><span class="name" dir="auto">' + esc(x.name) +
        '</span><span class="badge ' + (x.status === "open" ? "open" : "") + '">' + esc(t(x.status === "open" ? "open" : "closedBadge")) + '</span></span></button>';
    });
    return h;
  }

  function loadErrorHtml() {
    return '<div class="card"><p class="err-text">' + esc(S.loadError.text) + '</p><div class="row">' + btn("retry-load", t("retry"), { cls: "primary", fk: "retry" }) + '</div></div>';
  }

  function wineCard(w, open) {
    var h = '<article class="card wine' + (S.saved === w.id ? " just-saved" : "") + '" aria-labelledby="wn-' + esc(w.id) + '">' +
      '<h3 class="name" id="wn-' + esc(w.id) + '" dir="auto">' + esc(w.name) + '</h3><p class="meta" dir="auto">' + wineLine(w) + '</p>';
    if (w.mine) {
      h += '<div class="score-line"><div><div class="band">' + esc(t("yourVote")) + '</div><div class="big">' + w.mine.score + '</div></div>';
      if (w.team) h += '<div><div class="band">' + esc(t("teamAvg")) + ' · ' + esc(plural(w.team.count, "voteSingle", "votePlural")) + '</div><div class="big team">' + dec(w.team.avg) + '</div></div>';
      h += '</div><p class="band">' + esc(bandWord(w.mine.score)) + ' · ' + esc(t(w.mine.mode === "full" ? "modeFull" : "modeSmart")) + '</p>';
      if (S.saved === w.id) h += '<p class="saved-note">✓ ' + esc(t("savedOk")) + '</p>';
    } else if (open) {
      h += '<p class="lock">' + esc(t("voteToSee")) + '</p>';
    } else {
      h += '<p class="lock">' + esc(t("closedNoVote")) + '</p>';
    }
    if (w.votes != null && !w.mine) h += '<p class="lock">' + esc(plural(w.votes, "votedSingle", "votedPlural")) + '</p>';
    if (S.drafts[w.id] && !(S.sheet && S.sheet.wine === w.id)) h += '<p class="lock">' + esc(t("draftKept")) + '</p>';
    if (open) h += '<div class="row">' + btn("vote", t(w.mine ? "editVote" : "vote"), { id: w.id, cls: w.mine ? "" : "primary", disabled: readonly(), fk: "vote-" + w.id }) + '</div>';
    return h + '</article>';
  }

  function confirmHtml() {
    var c = S.confirm, name = S.tasting ? S.tasting.name : "";
    var ask = c === "close" ? t("closeAsk") : c === "reopen" ? t("reopenAsk") : t("deleteAsk", { name: name });
    var key = c === "delete" ? "delete" : "status";
    return '<div class="card confirm" role="group" aria-labelledby="confirm-q"><p id="confirm-q" dir="auto">' + esc(ask) + '</p><div class="row">' +
      btn("do-confirm", c === "delete" ? t("deleteIt") : t("confirm"), { cls: c === "delete" ? "danger" : "primary", disabled: !!S.pending[key], fk: "confirm" }) + btn("cancel-confirm", t("cancel"), { cls: "ghost", fk: "cancel-confirm" }) + '</div></div>';
  }

  function viewTasting() {
    var org = isOrg(), open = S.tasting.status === "open";
    var h = head() + notices() + '<p>' + btn("back", t("back"), { cls: "small ghost", fk: "back" }) + '</p>';
    h += '<div class="row spread"><h2 id="h-main" tabindex="-1" dir="auto">' + esc(S.tasting.name) + '</h2><span class="badge ' + (open ? "open" : "") + '">' + esc(t(open ? "open" : "closedBadge")) + '</span></div>';
    if (!open) h += '<p class="notice">' + esc(t("closedNote")) + '</p>';
    if (S.loadError) h += loadErrorHtml();
    h += '<div class="row">' + btn("refresh", t("refresh"), { cls: "small ghost", fk: "refresh" });
    if (org && !S.confirm) {
      h += btn("ask-status", t(open ? "closeIt" : "reopen"), { cls: "small ghost", disabled: readonly(), fk: "ask-status" }) + btn("ask-delete", t("deleteIt"), { cls: "small ghost danger", disabled: readonly(), fk: "ask-delete" });
    }
    h += '</div>';
    if (S.confirm) h += confirmHtml();
    h += '<h3 class="section">' + esc(t("wines")) + '</h3>';
    if (org && open) h += S.form && S.form.kind === "wine" ? formHtml("wine") : '<p>' + btn("new-wine", t("addWine"), { disabled: readonly(), fk: "new-wine" }) + '</p>';
    if (S.loading && !S.wines.length) h += '<p class="muted" aria-busy="true">' + esc(t("loading")) + '</p>';
    else if (!S.wines.length) h += '<p class="muted">' + esc(org ? t("noWinesOrg") : t("noWines")) + '</p>';
    S.wines.forEach(function (w) { h += (S.sheet && S.sheet.wine === w.id) ? sheetHtml(w) : wineCard(w, open); });
    return h;
  }

  /* ---------------- modulo di voto ---------------- */
  var SMART = [["occhio", "eye", "eyeH", "eyeW"], ["naso", "nose", "noseH", "noseW"], ["bocca", "mouth", "mouthH", "mouthW"]];
  var FULL_KEYS = (function () { var k = []; Object.keys(Scoring.ITEMS).forEach(function (g) { Scoring.ITEMS[g].forEach(function (d) { k.push(g + "-" + d[0]); }); }); return k; })();

  function newSheet(w) {
    var modes = S.config.modes, mine = w.mine;
    var mode = mine && modes.indexOf(mine.mode) > -1 ? mine.mode : (modes.indexOf(S.config.defaultMode) > -1 ? S.config.defaultMode : modes[0]);
    var giudizi = { occhio: 70, naso: 70, bocca: 70 }, voti = {}, touched = {};
    Object.keys(Scoring.ITEMS).forEach(function (g) { voti[g] = {}; Scoring.ITEMS[g].forEach(function (d) { voti[g][d[0]] = 6; }); });
    /* chi modifica un voto già dato ha già "toccato" tutti i cursori di quella modalità */
    if (mine && mine.mode === "smart" && mine.data && mine.data.giudizi) { Object.assign(giudizi, mine.data.giudizi); SMART.forEach(function (s) { touched["sm-" + s[0]] = true; }); }
    if (mine && mine.mode === "full" && mine.data && mine.data.voti) { Object.keys(voti).forEach(function (g) { Object.assign(voti[g], mine.data.voti[g] || {}); }); FULL_KEYS.forEach(function (k) { touched["fl-" + k] = true; }); }
    return { wine: w.id, mode: mode, giudizi: giudizi, voti: voti, touched: touched, note: (mine && mine.note) || "", error: "" };
  }
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
    var h = '<form class="card wine sheet" data-form="vote" novalidate aria-labelledby="sh-title"><h3 class="name" id="sh-title" tabindex="-1" dir="auto">' + esc(w.name) + '</h3><p class="meta" dir="auto">' + wineLine(w) + '</p>';
    if (modes.length > 1) {
      h += '<div class="modes" role="radiogroup" aria-label="' + esc(t("modeLabel")) + '">' + ["smart", "full"].filter(function (m) { return modes.indexOf(m) > -1; }).map(function (m) {
        return '<button type="button" role="radio" aria-checked="' + (sh.mode === m) + '" class="' + (sh.mode === m ? "on" : "") + '" data-act="mode" data-mode="' + m + '" data-fk="mode-' + m + '">' + esc(t(m === "smart" ? "modeSmart" : "modeFull")) + '</button>';
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
    h += '<div class="row">' + btn("save-vote", t(busy ? "savingVote" : "saveVote"), { type: "submit", cls: "primary", disabled: busy || !ok || readonly(), fk: "save-vote" }) + btn("cancel-vote", t("discard"), { cls: "ghost", fk: "cancel-vote" }) + '</div></form>';
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
    var save = $('[data-act="save-vote"]'); if (save) save.disabled = !!S.pending.vote || !ok || readonly();
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
    app.innerHTML = '<main>' + html + '</main>';
    var logo = app.querySelector(".logo"); if (logo) logo.addEventListener("error", function () { logo.remove(); reportHeight(); });
    var title = ((S.config && S.config.title) || "Sorso") + (S.user && !S.fatal ? " — " + (S.view === "tasting" && S.tasting ? S.tasting.name : t("tastings")) : "");
    if (title !== lastTitle) { document.title = title; lastTitle = title; }
    /* il focus resta dov'era: un lettore di schermo o chi usa la tastiera non riparte dall'inizio */
    var target = null;
    if (pendingFocus) {
      target = pendingFocus.fk ? app.querySelector('[data-fk="' + pendingFocus.fk + '"]') : app.querySelector(pendingFocus.sel);
      if (target) { try { target.focus(); } catch (e) { /* ok */ } if (pendingFocus.scroll) target.scrollIntoView({ block: pendingFocus.scroll }); }
      pendingFocus = null;
    } else if (fk) {
      target = app.querySelector('[data-fk="' + fk + '"]');
      if (target) { try { target.focus({ preventScroll: true }); if (selStart != null && target.setSelectionRange) target.setSelectionRange(selStart, selEnd); } catch (e) { /* ok */ } }
    }
    reportHeight();
  }
  function focusAfter(fk, scroll) { pendingFocus = { fk: fk, scroll: scroll || null }; }
  function focusSel(sel, scroll) { pendingFocus = { sel: sel, scroll: scroll || null }; }

  /* ---------------- eventi ---------------- */
  function formVals(form) {
    var o = {}; Array.prototype.forEach.call(form.elements, function (el) { if (el.name) o[el.name] = el.value; }); return o;
  }

  app.addEventListener("input", function (e) {
    var el = e.target, form = el.form;
    if (form && form.getAttribute("data-form") !== "vote" && S.form) { S.form.vals = Object.assign(S.form.vals, formVals(form)); S.form.error = ""; return; }
    if (!S.sheet) return;
    if (el.id === "sh-note") { S.sheet.note = el.value; return; }
    var v = Number(el.value);
    if (el.id.indexOf("sm-") === 0) S.sheet.giudizi[el.id.slice(3)] = Scoring.clampBand(v);
    else if (el.id.indexOf("fl-") === 0) { var p = el.id.split("-"); S.sheet.voti[p[1]][p[2]] = v; }
    else return;
    S.sheet.touched[el.id] = true; S.sheet.error = "";
    updateSheetReadout(el.id);
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
    else if (S.confirm) { e.preventDefault(); S.confirm = null; focusAfter("ask-status"); render(); }
    else if (S.form) { e.preventDefault(); var k = S.form.kind; S.form = null; focusAfter(k === "tasting" ? "new-tasting" : "new-wine"); render(); }
  }
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !app.contains(e.target)) escape(e); });

  function closeSheet() {
    var sh = S.sheet; if (!sh) return;
    /* una bozza che l'utente ha toccato si tiene in memoria: riaprendo il vino la ritrova */
    var tocc = Object.keys(sh.touched).length > 0 || sh.note;
    var w = sh.wine; if (tocc) S.drafts[w] = sh; else delete S.drafts[w];
    S.sheet = null; focusAfter("vote-" + w); render();
  }

  app.addEventListener("submit", function (e) {
    e.preventDefault();
    var form = e.target, kind = form.getAttribute("data-form");
    if (kind === "vote") return saveVote();
    if (kind === "tasting") return submitTasting(form);
    if (kind === "wine") return submitWine(form);
  });

  function submitTasting(form) {
    S.form.vals = Object.assign(S.form.vals, formVals(form));
    var name = S.form.vals.name.trim();
    if (!name) { S.form.error = t("e_invalid_name"); focusAfter("f-name"); announce(S.form.error, true); return render(); }
    return run("tasting", function () {
      return api({ op: "tasting.create", name: name }).then(function (r) {
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
      return api({ op: "wine.add", tasting: S.tasting.id, wine: { name: v.name, producer: v.producer, vintage: v.vintage } }).then(function (r) {
        S.form = { kind: "wine", vals: { name: "", producer: "", vintage: "" }, error: "" };
        announce(t("wineAdded", { name: r.wine.name }));
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
        delete S.drafts[sh.wine]; S.sheet = null; S.saved = sh.wine; S.notice = null;
        announce(t("savedOk") + " " + r.score + ", " + bandWord(r.score));
        focusAfter("vote-" + sh.wine, "center");
        setTimeout(function () { if (S.saved === sh.wine) { S.saved = null; render(); } }, 6000);
        return loadState(S.tasting.id, true);
      }, function (e) { return handleError(e, "sheet"); });
    });
  }

  app.addEventListener("click", function (e) {
    var b = e.target.closest("[data-act]");
    if (!b || b.disabled) return;
    var act = b.getAttribute("data-act"), id = b.getAttribute("data-id");
    switch (act) {
      case "retry-login": return login();
      case "reauth": return askReauth("user");
      case "reload": return location.reload();
      case "retry-load": return loadState(S.loadError && S.loadError.tasting);
      case "refresh": S.notice = null; return loadState(S.tasting && S.tasting.id);
      case "open": return openTasting(id, true);
      case "back": return goList(true);
      case "new-tasting": S.form = { kind: "tasting", vals: { name: "" }, error: "" }; focusAfter("f-name"); return render();
      case "new-wine": S.form = { kind: "wine", vals: { name: "", producer: "", vintage: "" }, error: "" }; focusAfter("f-name"); return render();
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
    return run("status", function () {
      return api({ op: "tasting.status", tasting: tid, status: c === "close" ? "closed" : "open" }).then(function () {
        S.confirm = null; S.sheet = null; focusAfter("ask-status");
        return loadState(tid, true);
      }, function (e) { S.confirm = null; return handleError(e); });
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
    S.view = "tasting"; S.sheet = null; S.form = null; S.confirm = null; S.notice = null; S.saved = null;
    S.tasting = null; S.wines = [];
    if (push) pushHistory(id);
    focusSel("#h-main");
    return loadState(id);
  }
  function goList(push) {
    S.view = "list"; S.tasting = null; S.wines = []; S.sheet = null; S.form = null; S.confirm = null; S.notice = null;
    if (push) { try { history.pushState({ v: "list" }, ""); } catch (e) { /* ok */ } }
    focusSel("#h-main");
    return loadState("");
  }
  window.addEventListener("popstate", function (e) {
    if (!S.user || S.fatal) return;
    var st = e.state;
    if (st && st.v === "tasting") openTasting(st.id, false); else goList(false);
  });

  if (window.ResizeObserver) { try { new ResizeObserver(reportHeight).observe(app); } catch (e) { /* senza adattamento di altezza */ } }

  /* ---------------- avvio ---------------- */
  (function start() {
    var q = new URLSearchParams(location.search);
    S.partner = q.get("p") || "";
    var h = new URLSearchParams(location.hash.replace(/^#/, ""));
    S.token = h.get("token") || q.get("token") || "";    // il frammento è la forma consigliata; il parametro resta valido per chi lo usa già
    document.documentElement.setAttribute("data-ready", "1");
    if (!S.token) { S.loading = false; S.fatal = { code: "no_token", session: false, retry: false }; render(); return; }
    login();
  })();
})();
