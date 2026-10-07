/* Spazio di team di Sorso — interfaccia dell'iframe.

   Il sito partner incorpora  /embed?p=<partner>&token=<JWT firmato>.
   Il token si scambia subito con una sessione tenuta SOLO in memoria (niente
   cookie né localStorage: dentro un iframe di terze parti i browser li
   bloccano), poi si toglie dall'indirizzo. Il punteggio mostrato mentre si
   vota è un'anteprima: quello vero lo ricalcola il server. */
(function () {
  "use strict";

  var app = document.getElementById("app");
  var S = { session: "", user: null, config: null, lang: document.documentElement.lang === "en" ? "en" : "it",
            tastings: [], tasting: null, wines: [], quota: "ok", sheet: null, form: null, busy: false, msg: null };

  /* ---------------- testi ---------------- */
  var TXT = {
    it: {
      loading: "Caricamento…", refresh: "Aggiorna", back: "← Degustazioni",
      noAccess: "Accesso non valido. Apri questo spazio dal sito del tuo club.",
      used: "Questo link è già stato usato. Ricarica la pagina del sito per entrare di nuovo.",
      expired: "La sessione è scaduta. Ricarica la pagina del sito.",
      generic: "Qualcosa non ha funzionato. Riprova.", limited: "Troppe richieste: riprova fra poco.",
      readonly: "Il servizio è in sola lettura: il limite mensile gratuito è quasi raggiunto.",
      quotaWarn: "Attenzione: il servizio sta per raggiungere il limite mensile gratuito.",
      tastings: "Degustazioni", noTastings: "Ancora nessuna degustazione.", noTastingsOrg: "Crea la prima degustazione del tuo team.",
      newTasting: "Nuova degustazione", name: "Nome", create: "Crea", cancel: "Annulla",
      open: "aperta", closed: "chiusa", closeIt: "Chiudi degustazione", reopen: "Riapri", closedNote: "Degustazione chiusa: i voti sono definitivi.",
      wines: "Vini", noWines: "Nessun vino ancora.", noWinesOrg: "Aggiungi i vini da votare.",
      addWine: "Aggiungi vino", wineName: "Vino", producer: "Produttore", vintage: "Annata (es. 2018 o NV)", add: "Aggiungi",
      vote: "Vota", editVote: "Modifica voto", yourVote: "Il tuo voto", teamAvg: "Media del team", votes: "voti", oneVote: "voto",
      voteToSee: "Vota questo vino per vedere la media del team.", voted: "hanno votato",
      modeSmart: "Voto rapido", modeFull: "Scheda completa", smartHint: "Tre giudizi da 50 a 100.", fullHint: "Nove giudizi da 0 a 10 sulle quattro fasi.",
      eye: "Occhio", nose: "Naso", mouth: "Bocca", eyeH: "Limpidezza, colore, aspetto.", noseH: "Profumi: intensità, complessità, pulizia.", mouthH: "Gusto e finale: equilibrio, persistenza, armonia.",
      eyeW: "pesa 10%", noseW: "pesa 30%", mouthW: "pesa 60%",
      score: "Punteggio", note: "Note personali (le vedi solo tu)", save: "Salva il voto", saving: "Salvo…", saved: "Voto salvato.",
      g_v: "Visivo", g_o: "Olfattivo", g_g: "Gusto-olfattivo", g_f: "Finale",
      i_v_qualita: "Qualità visiva", i_o_intensita: "Intensità", i_o_complessita: "Complessità", i_o_qualita: "Qualità olfattiva",
      i_g_equilibrio: "Equilibrio", i_g_intensita: "Intensità", i_g_persistenza: "Persistenza", i_g_qualita: "Qualità gustativa", i_f_armonia: "Armonia (vale doppio)",
      b_faulty: "Insufficiente", b_sufficient: "Sufficiente", b_fair: "Discreto", b_good: "Buono", b_excellent: "Eccellente", b_exceptional: "Eccezionale", b_perfect: "Irripetibile",
      w0: "difetto grave", w1: "gravemente carente", w2: "carente", w3: "scarso", w4: "mediocre", w5: "quasi sufficiente", w6: "sufficiente", w7: "discreto", w8: "buono", w9: "ottimo", w10: "eccellente",
      by: "Organizzatore", asMember: "Partecipante"
    },
    en: {
      loading: "Loading…", refresh: "Refresh", back: "← Tastings",
      noAccess: "Invalid access. Open this space from your club's website.",
      used: "This link was already used. Reload the page on the website to enter again.",
      expired: "Your session expired. Reload the page on the website.",
      generic: "Something went wrong. Please try again.", limited: "Too many requests: try again shortly.",
      readonly: "The service is read-only: the free monthly limit is almost reached.",
      quotaWarn: "Heads up: the service is about to reach its free monthly limit.",
      tastings: "Tastings", noTastings: "No tastings yet.", noTastingsOrg: "Create your team's first tasting.",
      newTasting: "New tasting", name: "Name", create: "Create", cancel: "Cancel",
      open: "open", closed: "closed", closeIt: "Close tasting", reopen: "Reopen", closedNote: "Tasting closed: votes are final.",
      wines: "Wines", noWines: "No wines yet.", noWinesOrg: "Add the wines to vote on.",
      addWine: "Add wine", wineName: "Wine", producer: "Producer", vintage: "Vintage (e.g. 2018 or NV)", add: "Add",
      vote: "Vote", editVote: "Edit vote", yourVote: "Your vote", teamAvg: "Team average", votes: "votes", oneVote: "vote",
      voteToSee: "Vote on this wine to see the team average.", voted: "have voted",
      modeSmart: "Quick score", modeFull: "Full sheet", smartHint: "Three ratings from 50 to 100.", fullHint: "Nine ratings from 0 to 10 across four stages.",
      eye: "Eye", nose: "Nose", mouth: "Mouth", eyeH: "Clarity, color, appearance.", noseH: "Aromas: intensity, complexity, cleanliness.", mouthH: "Taste and finish: balance, persistence, harmony.",
      eyeW: "counts 10%", noseW: "counts 30%", mouthW: "counts 60%",
      score: "Score", note: "Private notes (only you see them)", save: "Save vote", saving: "Saving…", saved: "Vote saved.",
      g_v: "Visual", g_o: "Aroma", g_g: "Taste-aroma", g_f: "Final",
      i_v_qualita: "Visual quality", i_o_intensita: "Intensity", i_o_complessita: "Complexity", i_o_qualita: "Aroma quality",
      i_g_equilibrio: "Balance", i_g_intensita: "Intensity", i_g_persistenza: "Persistence", i_g_qualita: "Taste quality", i_f_armonia: "Harmony (counts double)",
      b_faulty: "Insufficient", b_sufficient: "Sufficient", b_fair: "Fair", b_good: "Good", b_excellent: "Excellent", b_exceptional: "Exceptional", b_perfect: "Once in a lifetime",
      w0: "serious flaw", w1: "gravely lacking", w2: "lacking", w3: "poor", w4: "mediocre", w5: "nearly sufficient", w6: "sufficient", w7: "fair", w8: "good", w9: "very good", w10: "excellent",
      by: "Organizer", asMember: "Participant"
    }
  };
  function t(k) { var d = TXT[S.lang] || TXT.it; return d[k] != null ? d[k] : (TXT.it[k] != null ? TXT.it[k] : k); }
  var ERR_CODES = { token_used: "used", session_expired: "expired", rate_limited: "limited", read_only: "readonly" };

  /* ---------------- utilità ---------------- */
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function bandWord(score) { return t("b_" + Scoring.bandKey(score)); }
  function dec(n) { return String(Math.round(n * 10) / 10).replace(".", S.lang === "it" ? "," : "."); }
  function wineLine(w) { return [w.producer, w.vintage].filter(Boolean).map(esc).join(" · "); }

  function reportHeight() {
    try { parent.postMessage({ type: "sorso:height", height: document.documentElement.scrollHeight }, "*"); } catch (e) { /* fuori da un iframe */ }
  }

  /* ---------------- rete ---------------- */
  function api(body) {
    var headers = { "Content-Type": "application/json" };
    if (S.session) headers.Authorization = "Bearer " + S.session;
    return fetch("/api/embed", { method: "POST", headers: headers, body: JSON.stringify(body) }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) { var e = new Error((j.error && j.error.message) || ""); e.code = j.error && j.error.code; e.status = r.status; throw e; }
        if (r.headers.get("X-Sorso-Quota")) S.quota = r.headers.get("X-Sorso-Quota");
        return j;
      });
    });
  }
  function fail(e) {
    S.busy = false;
    var key = ERR_CODES[e.code];
    S.msg = { kind: "err", text: key ? t(key) : (e.message || t("generic")) };
    if (e.status === 401) S.session = "";
    render();
  }

  /* ---------------- dati ---------------- */
  function loadState(tid, keepMsg) {
    S.busy = true; if (!keepMsg) S.msg = null; render();
    return api({ op: "state", tasting: tid || undefined }).then(function (st) {
      S.busy = false;
      S.tastings = st.tastings || []; S.tasting = st.tasting || null; S.wines = st.wines || []; S.quota = st.quota || S.quota;
      render();
    }).catch(fail);
  }

  /* ---------------- schermate ---------------- */
  function head() {
    var c = S.config || {};
    return '<div class="top">' + (c.logo ? '<img class="logo" alt="" src="' + esc(c.logo) + '">' : "") +
      '<div class="title">' + esc(c.title || "Sorso") + '</div>' +
      '<div class="who">' + esc(S.user ? S.user.name : "") + (S.user ? "<br>" + esc(S.user.role === "organizer" ? t("by") : t("asMember")) : "") + '</div></div>';
  }
  function notices() {
    var h = "";
    if (S.msg) h += '<p class="notice ' + (S.msg.kind === "err" ? "err" : "") + '" role="alert">' + esc(S.msg.text) + '</p>';
    if (S.quota === "readonly") h += '<p class="notice warn">' + esc(t("readonly")) + '</p>';
    else if (S.quota === "warn" && S.user && S.user.role === "organizer") h += '<p class="notice warn">' + esc(t("quotaWarn")) + '</p>';
    return h;
  }

  function viewList() {
    var org = S.user.role === "organizer", h = head() + notices();
    h += '<div class="row"><h2 class="grow">' + esc(t("tastings")) + '</h2><button class="btn small ghost" data-act="refresh">' + esc(t("refresh")) + '</button></div>';
    if (org) {
      if (S.form === "tasting") {
        h += '<div class="card"><label class="f" for="f-tname">' + esc(t("name")) + '</label><input type="text" id="f-tname" maxlength="80" autocomplete="off">' +
          '<div class="row"><button class="btn primary" data-act="create-tasting">' + esc(t("create")) + '</button><button class="btn ghost" data-act="cancel-form">' + esc(t("cancel")) + '</button></div></div>';
      } else {
        h += '<p><button class="btn primary" data-act="new-tasting">' + esc(t("newTasting")) + '</button></p>';
      }
    }
    if (!S.tastings.length) h += '<p class="muted">' + esc(org ? t("noTastingsOrg") : t("noTastings")) + '</p>';
    S.tastings.forEach(function (x) {
      h += '<button class="card link" data-act="open" data-id="' + esc(x.id) + '"><div class="row"><span class="name grow">' + esc(x.name) +
        '</span><span class="badge ' + (x.status === "open" ? "open" : "") + '">' + esc(t(x.status === "open" ? "open" : "closed")) + '</span></div></button>';
    });
    return h;
  }

  function wineCard(w, open) {
    var h = '<div class="card wine"><div class="name">' + esc(w.name) + '</div><div class="meta">' + wineLine(w) + '</div>';
    if (w.mine) {
      h += '<div class="score-line"><div><div class="band">' + esc(t("yourVote")) + '</div><div class="big">' + w.mine.score + '</div></div>';
      if (w.team) h += '<div><div class="band">' + esc(t("teamAvg")) + ' · ' + w.team.count + ' ' + esc(t(w.team.count === 1 ? "oneVote" : "votes")) + '</div><div class="big team">' + dec(w.team.avg) + '</div></div>';
      h += '</div><div class="band">' + esc(bandWord(w.mine.score)) + ' · ' + esc(t(w.mine.mode === "full" ? "modeFull" : "modeSmart")) + '</div>';
    } else if (open) {
      h += '<p class="lock">' + esc(t("voteToSee")) + '</p>';
    }
    if (w.votes != null && !w.mine) h += '<p class="lock">' + w.votes + ' ' + esc(t("voted")) + '</p>';
    if (open) h += '<div class="row"><button class="btn ' + (w.mine ? "" : "primary") + '" data-act="vote" data-id="' + esc(w.id) + '">' + esc(t(w.mine ? "editVote" : "vote")) + '</button></div>';
    return h + '</div>';
  }

  function viewTasting() {
    var org = S.user.role === "organizer", open = S.tasting.status === "open";
    var h = head() + notices() + '<p><button class="btn small ghost" data-act="back">' + esc(t("back")) + '</button></p>';
    h += '<div class="row"><h2 class="grow">' + esc(S.tasting.name) + '</h2><span class="badge ' + (open ? "open" : "") + '">' + esc(t(open ? "open" : "closed")) + '</span></div>';
    if (!open) h += '<p class="notice">' + esc(t("closedNote")) + '</p>';
    h += '<div class="row"><button class="btn small ghost" data-act="refresh">' + esc(t("refresh")) + '</button>';
    if (org) h += '<button class="btn small ghost" data-act="toggle-status">' + esc(t(open ? "closeIt" : "reopen")) + '</button>';
    h += '</div><h3>' + esc(t("wines")) + '</h3>';
    if (org && open) {
      if (S.form === "wine") {
        h += '<div class="card"><label class="f" for="f-wname">' + esc(t("wineName")) + '</label><input type="text" id="f-wname" maxlength="100" autocomplete="off">' +
          '<label class="f" for="f-wprod">' + esc(t("producer")) + '</label><input type="text" id="f-wprod" maxlength="80" autocomplete="off">' +
          '<label class="f" for="f-wvint">' + esc(t("vintage")) + '</label><input type="text" id="f-wvint" maxlength="4" inputmode="text" autocomplete="off">' +
          '<div class="row"><button class="btn primary" data-act="add-wine">' + esc(t("add")) + '</button><button class="btn ghost" data-act="cancel-form">' + esc(t("cancel")) + '</button></div></div>';
      } else {
        h += '<p><button class="btn" data-act="new-wine">' + esc(t("addWine")) + '</button></p>';
      }
    }
    if (!S.wines.length) h += '<p class="muted">' + esc(org ? t("noWinesOrg") : t("noWines")) + '</p>';
    S.wines.forEach(function (w) {
      h += (S.sheet && S.sheet.wine === w.id) ? sheetHtml(w) : wineCard(w, open);
    });
    return h;
  }

  /* ---------------- modulo di voto ---------------- */
  var SMART = [["occhio", "eye", "eyeH", "eyeW"], ["naso", "nose", "noseH", "noseW"], ["bocca", "mouth", "mouthH", "mouthW"]];

  function newSheet(w) {
    var modes = S.config.modes, mine = w.mine;
    var mode = mine && modes.indexOf(mine.mode) > -1 ? mine.mode : (modes.indexOf(S.config.defaultMode) > -1 ? S.config.defaultMode : modes[0]);
    var giudizi = { occhio: 70, naso: 70, bocca: 70 }, voti = {};
    Object.keys(Scoring.ITEMS).forEach(function (g) { voti[g] = {}; Scoring.ITEMS[g].forEach(function (d) { voti[g][d[0]] = 6; }); });
    if (mine && mine.mode === "smart" && mine.data && mine.data.giudizi) giudizi = Object.assign(giudizi, mine.data.giudizi);
    if (mine && mine.mode === "full" && mine.data && mine.data.voti) Object.keys(voti).forEach(function (g) { Object.assign(voti[g], mine.data.voti[g] || {}); });
    return { wine: w.id, mode: mode, giudizi: giudizi, voti: voti, note: (mine && mine.note) || "" };
  }
  function sheetScore() {
    return S.sheet.mode === "smart" ? Scoring.smartScore(S.sheet.giudizi).total : Scoring.fullScore(S.sheet.voti, Scoring.ITEMS).total;
  }
  function sliderHtml(id, label, help, weight, min, max, val, scale, word) {
    return '<div class="slider"><div class="head"><label class="lab" for="' + id + '">' + esc(label) + (weight ? ' <span class="small muted">· ' + esc(weight) + '</span>' : "") +
      '</label><span><span class="val" id="' + id + '-v">' + val + '</span> <span class="word" id="' + id + '-w">' + esc(word) + '</span></span></div>' +
      (help ? '<p class="help">' + esc(help) + '</p>' : "") +
      '<input type="range" id="' + id + '" min="' + min + '" max="' + max + '" step="1" value="' + val + '">' +
      '<div class="scale" aria-hidden="true">' + scale.map(function (s) { return "<span>" + s + "</span>"; }).join("") + '</div></div>';
  }
  function sheetHtml(w) {
    var sh = S.sheet, modes = S.config.modes, h = '<div class="card wine sheet"><div class="name">' + esc(w.name) + '</div><div class="meta">' + wineLine(w) + '</div>';
    if (modes.length > 1) {
      h += '<div class="modes" role="group">' + ["smart", "full"].filter(function (m) { return modes.indexOf(m) > -1; }).map(function (m) {
        return '<button type="button" class="' + (sh.mode === m ? "on" : "") + '" aria-pressed="' + (sh.mode === m) + '" data-act="mode" data-mode="' + m + '">' + esc(t(m === "smart" ? "modeSmart" : "modeFull")) + '</button>';
      }).join("") + '</div>';
    }
    h += '<p class="small muted">' + esc(t(sh.mode === "smart" ? "smartHint" : "fullHint")) + '</p>';
    if (sh.mode === "smart") {
      SMART.forEach(function (s) {
        var v = sh.giudizi[s[0]];
        h += sliderHtml("sm-" + s[0], t(s[1]), t(s[2]), t(s[3]), 50, 100, v, [50, 60, 70, 80, 90, 100], bandWord(v));
      });
    } else {
      Object.keys(Scoring.ITEMS).forEach(function (g) {
        h += '<h3>' + esc(t("g_" + g)) + '</h3>';
        Scoring.ITEMS[g].forEach(function (d) {
          var v = sh.voti[g][d[0]];
          h += sliderHtml("fl-" + g + "-" + d[0], t("i_" + g + "_" + d[0]), "", "", 0, 10, v, [0, 5, 10], t("w" + v));
        });
      });
    }
    var sc = sheetScore();
    h += '<div class="preview"><span class="band">' + esc(t("score")) + '</span><span class="big" id="sh-score">' + sc + '</span><span class="band" id="sh-band">' + esc(bandWord(sc)) + '</span></div>';
    h += '<label class="f" for="sh-note">' + esc(t("note")) + '</label><textarea id="sh-note" rows="2" maxlength="500">' + esc(sh.note) + '</textarea>';
    h += '<div class="row"><button class="btn primary" data-act="save-vote"' + (S.busy ? " disabled" : "") + '>' + esc(t(S.busy ? "saving" : "save")) + '</button><button class="btn ghost" data-act="cancel-vote">' + esc(t("cancel")) + '</button></div></div>';
    return h;
  }
  function refreshSheetNumbers() {
    var sc = sheetScore();
    document.getElementById("sh-score").textContent = sc;
    document.getElementById("sh-band").textContent = bandWord(sc);
  }

  /* ---------------- disegno ---------------- */
  function render() {
    if (!S.user) {
      app.innerHTML = '<p class="notice ' + (S.msg && S.msg.kind === "err" ? "err" : "") + '">' + esc(S.msg ? S.msg.text : t("loading")) + '</p>';
    } else if (!S.session) {
      app.innerHTML = head() + '<p class="notice err">' + esc(S.msg ? S.msg.text : t("expired")) + '</p>';
    } else {
      app.innerHTML = S.tasting ? viewTasting() : viewList();
    }
    reportHeight();
  }

  /* ---------------- eventi ---------------- */
  function val(id) { var e = document.getElementById(id); return e ? e.value : ""; }

  app.addEventListener("input", function (e) {
    var el = e.target;
    if (!S.sheet) return;
    if (el.id === "sh-note") { S.sheet.note = el.value; return; }
    var v = Number(el.value);
    if (el.id.indexOf("sm-") === 0) {
      var k = el.id.slice(3);
      S.sheet.giudizi[k] = Scoring.clampBand(v);
      document.getElementById(el.id + "-v").textContent = S.sheet.giudizi[k];
      document.getElementById(el.id + "-w").textContent = bandWord(S.sheet.giudizi[k]);
    } else if (el.id.indexOf("fl-") === 0) {
      var p = el.id.split("-");
      S.sheet.voti[p[1]][p[2]] = v;
      document.getElementById(el.id + "-v").textContent = v;
      document.getElementById(el.id + "-w").textContent = t("w" + v);
    } else return;
    refreshSheetNumbers();
  });

  app.addEventListener("click", function (e) {
    var b = e.target.closest("[data-act]");
    if (!b || b.disabled) return;
    var act = b.dataset.act, id = b.dataset.id;
    if (act === "refresh") { loadState(S.tasting && S.tasting.id); return; }
    if (act === "open") { S.sheet = null; S.form = null; loadState(id); return; }
    if (act === "back") { S.tasting = null; S.wines = []; S.sheet = null; S.form = null; loadState(); return; }
    if (act === "new-tasting") { S.form = "tasting"; render(); var f = document.getElementById("f-tname"); if (f) f.focus(); return; }
    if (act === "new-wine") { S.form = "wine"; render(); var g = document.getElementById("f-wname"); if (g) g.focus(); return; }
    if (act === "cancel-form") { S.form = null; render(); return; }
    if (act === "create-tasting") {
      S.busy = true;
      api({ op: "tasting.create", name: val("f-tname") }).then(function (r) { S.form = null; S.busy = false; return loadState(r.tasting.id); }).catch(fail);
      return;
    }
    if (act === "add-wine") {
      S.busy = true;
      api({ op: "wine.add", tasting: S.tasting.id, wine: { name: val("f-wname"), producer: val("f-wprod"), vintage: val("f-wvint") } })
        .then(function () { S.form = null; S.busy = false; return loadState(S.tasting.id); }).catch(fail);
      return;
    }
    if (act === "toggle-status") {
      api({ op: "tasting.status", tasting: S.tasting.id, status: S.tasting.status === "open" ? "closed" : "open" })
        .then(function () { S.sheet = null; return loadState(S.tasting.id); }).catch(fail);
      return;
    }
    if (act === "vote") {
      var w = S.wines.filter(function (x) { return x.id === id; })[0];
      if (w) { S.sheet = newSheet(w); S.msg = null; render(); }
      return;
    }
    if (act === "mode") { S.sheet.mode = b.dataset.mode; render(); return; }
    if (act === "cancel-vote") { S.sheet = null; render(); return; }
    if (act === "save-vote") {
      var sh = S.sheet;
      var body = { op: "vote", tasting: S.tasting.id, wine: sh.wine, mode: sh.mode, note: sh.note };
      if (sh.mode === "smart") body.giudizi = sh.giudizi; else body.voti = sh.voti;
      S.busy = true; render();
      api(body).then(function () { S.sheet = null; S.busy = false; S.msg = { kind: "ok", text: t("saved") }; return loadState(S.tasting.id, true); }).catch(fail);
    }
  });

  if (window.ResizeObserver) { try { new ResizeObserver(reportHeight).observe(document.body); } catch (e) { /* senza adattamento di altezza */ } }

  /* ---------------- avvio ---------------- */
  var params = new URLSearchParams(location.search), token = params.get("token");
  try { history.replaceState(null, "", location.pathname + "?p=" + encodeURIComponent(params.get("p") || "")); } catch (e) { /* ok */ }
  render();
  if (!token) { S.msg = { kind: "err", text: t("noAccess") }; render(); return; }
  api({ op: "session", token: token }).then(function (r) {
    S.session = r.session; S.user = r.user; S.config = r.config; S.quota = r.quota || "ok";
    S.lang = r.config.lang === "en" ? "en" : "it";
    document.documentElement.lang = S.lang;
    return loadState();
  }).catch(function (e) {
    var key = ERR_CODES[e.code];
    S.msg = { kind: "err", text: key ? t(key) : t("noAccess") };
    render();
  });
})();
