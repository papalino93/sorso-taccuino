/* Direzione B · template e montaggio. Logica in common.js. */
(function () {
  'use strict';
  var S = SORSO, esc = S.esc, fmt1 = S.fmt1;

  var ICON_LOCK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="3"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
  var TAB_ICONS = {
    nuova: '<path d="M12 5v14M5 12h14"/>',
    libro: '<path d="M5 4h10a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h10"/>',
    team: '<circle cx="9" cy="8" r="3.500"/><path d="M3 20c0-3.300 2.700-5.500 6-5.500s6 2.200 6 5.500"/><path d="M16 5a3.300 3.300 0 0 1 0 6M18 14.800c1.800.8 3 2.500 3 5.200"/>',
    statistiche: '<path d="M5 20V11M12 20V4M19 20v-6"/>'
  };

  /* ---------- componenti ---------- */
  function appTop(right) {
    return '<div class="app-top"><span class="brand"><span class="logo" role="img" aria-label="Logo Sorso"></span>Sorso</span><span class="today">' + (right || 'mer 7 ott') + '</span></div>';
  }
  function tabs(active) {
    return '<nav class="tabbar" aria-label="Navigazione app">' + [['nuova', 'Nuova'], ['libro', 'Libro'], ['team', 'Team'], ['statistiche', 'Stats']].map(function (t) {
      return '<a href="#' + t[0] + '"' + (t[0] === active ? ' aria-current="page"' : '') + '><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.200" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + TAB_ICONS[t[0]] + '</svg>' + t[1] + '</a>';
    }).join('') + '</nav>';
  }
  function scoreHead(top, cls) {
    var seps = [20, 40, 60, 80, 92].map(function (p) { return '<b style="left:calc(' + p + '% - 1px)"></b>'; }).join('');
    var lab = [60, 70, 80, 90, 96].map(function (v) { return '<span style="--t:' + ((v - 50) / 50) + '">' + v + '</span>'; }).join('');
    return '<header class="score ' + (cls || '') + '">' + (top || '') + '<div class="score-in">' +
      '<div class="score-line" role="img" data-score-label aria-label="Punteggio"><span class="num score-num" data-score>70</span><span class="score-su">su<br>100</span></div>' +
      '<div class="band-row"><span class="band-pill" data-band-label>Discreto</span><span class="band-range" data-band-range>70–79</span></div>' +
      '<p class="band-desc" data-band-desc></p>' +
      '<div><div class="scale" aria-hidden="true"><i></i>' + seps + '</div><div class="scale-l" aria-hidden="true">' + lab + '</div></div></div>' +
      '<i class="spark s1" aria-hidden="true">✦</i><i class="spark s2" aria-hidden="true">✦</i><i class="spark s3" aria-hidden="true">✦</i></header>';
  }
  function ruler(kind) {
    var t = kind === 10 ? [[0, '0'], [.6, '6'], [1, '10']] : [60, 70, 80, 90, 96].map(function (v) { return [(v - 50) / 50, v]; });
    return '<div class="ruler" aria-hidden="true">' + t.map(function (x) { return '<span style="--t:' + x[0] + '">' + x[1] + '</span>'; }).join('') + (kind === 10 ? '' : '<i class="zone"></i>') + '</div>';
  }
  function rowQuick(id, k, label, w, val) {
    var iid = id + '-' + k;
    return '<div class="row"><div class="row-head"><label class="row-label" for="' + iid + '"><span class="row-name">' + label + '</span><span class="row-w">peso ' + w + '%</span></label>' +
      '<div class="row-val"><output class="num" data-out="' + iid + '" for="' + iid + '">' + val + '</output><span class="word" data-word="' + iid + '"></span></div></div>' +
      '<input class="rng" type="range" id="' + iid + '" data-k="' + k + '" min="50" max="100" step="1" value="' + val + '">' + ruler(100) + '</div>';
  }
  function rowFull(id, k, label, val) {
    var iid = id + '-' + k;
    return '<div class="row"><div class="row-head"><label class="row-label" for="' + iid + '"><span class="row-name">' + label + '</span></label>' +
      '<div class="row-val"><output class="num" data-out="' + iid + '" for="' + iid + '">' + val + '</output><span class="word" data-word="' + iid + '"></span></div></div>' +
      '<input class="rng" type="range" id="' + iid + '" data-k="' + k + '" min="0" max="10" step="1" value="' + val + '">' + ruler(10) + '</div>';
  }
  function modeSwitch(id) {
    return '<div class="modes" role="tablist" aria-label="Modalità di valutazione">' +
      '<button type="button" role="tab" id="' + id + '-t1" data-mode-btn="smart" aria-controls="' + id + '-p1" aria-selected="true"><span class="m-name">Voto rapido</span><span class="m-sub">3 cursori</span></button>' +
      '<button type="button" role="tab" id="' + id + '-t2" data-mode-btn="full" aria-controls="' + id + '-p2" aria-selected="false" tabindex="-1"><span class="m-name">Scheda completa</span><span class="m-sub">4 fasi · 9 giudizi</span></button></div>';
  }
  var SHORT = { v: 'Visivo', o: 'Olfatto', g: 'Gusto', f: 'Finale' };
  function panels(id, sv, fv) {
    var quick = '<div class="panel-stack">' + rowQuick(id, 'o', 'Occhio', 10, sv.o) + rowQuick(id, 'n', 'Naso', 30, sv.n) + rowQuick(id, 'b', 'Bocca', 60, sv.b) +
      '<p class="formula">Media pesata <b>10 · 30 · 60</b>. Il 100 richiede tre 100.</p></div>';
    var P = S.PHASES;
    var full = '<div class="panel-stack"><div class="phases" role="group" aria-label="Fasi della scheda">' + P.map(function (p, i) {
      return '<button type="button" class="ph-btn" data-phase-btn="' + p.k + '" aria-pressed="' + (i === 1) + '"><span class="ph-n">' + SHORT[p.k] + '</span><span class="ph-p"><span data-phase-pts="' + p.k + '">0</span><small>/' + p.w + '</small></span></button>';
    }).join('') + '</div>' + P.map(function (p, i) {
      return '<section data-phase="' + p.k + '"' + (i === 1 ? '' : ' hidden') + ' class="panel-stack" aria-label="Fase ' + p.name + '"><div class="ph-title"><h4>' + p.name + '</h4><span>peso ' + p.w + '</span></div>' +
        p.items.map(function (it) { return rowFull(id, it[0], it[1], fv[it[0]]); }).join('') +
        (P[i + 1] ? '<button type="button" class="btn-ghost btn-next" data-phase-btn="' + P[i + 1].k + '">Avanti: ' + P[i + 1].name + ' →</button>' : '') + '</section>';
    }).join('') + '<p class="formula">Punteggio = 50 + 50·q<sup>1,8</sup>. Il 100 richiede ogni giudizio a 10.</p></div>';
    return '<div role="tabpanel" id="' + id + '-p1" aria-labelledby="' + id + '-t1" data-panel="smart">' + quick + '</div>' +
      '<div role="tabpanel" id="' + id + '-p2" aria-labelledby="' + id + '-t2" data-panel="full" hidden>' + full + '</div>';
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-phase-btn]'); if (!b) return;
    var panel = b.closest('[data-panel="full"]'), k = b.dataset.phaseBtn;
    panel.querySelectorAll('[data-phase]').forEach(function (s) { s.hidden = s.dataset.phase !== k; });
    var target = null;
    panel.querySelectorAll('.ph-btn').forEach(function (x) { var on = x.dataset.phaseBtn === k; x.setAttribute('aria-pressed', String(on)); if (on) target = x; });
    if (!b.classList.contains('ph-btn') && target) target.focus();
  });
  var DEF_S = { o: 84, n: 88, b: 91 }, DEF_F = { v: 8, oi: 8, oc: 7, oq: 8, ge: 8, gi: 8, gp: 7, gq: 8, f: 8 };

  function nuova(id, mode, name, prod, year) {
    return '<div class="app" id="' + id + '" data-scorer data-mode="' + mode + '">' + scoreHead(appTop()) +
      '<div class="body"><fieldset class="wine-fields"><legend class="vh">Il vino</legend>' +
      '<label class="fld fld-wide"><span>Vino</span><input type="text" value="' + esc(name) + '" autocomplete="off"></label>' +
      '<label class="fld"><span>Produttore</span><input type="text" value="' + esc(prod) + '" autocomplete="off"></label>' +
      '<label class="fld"><span>Annata</span><input type="text" inputmode="numeric" value="' + year + '" autocomplete="off"></label></fieldset>' +
      modeSwitch(id) + panels(id, DEF_S, DEF_F) + '</div>' +
      '<div class="savebar"><button class="btn btn-block" type="button">Salva il voto <span class="num" data-score>0</span></button></div>' + tabs('nuova') + '</div>';
  }

  function libro() {
    var items = S.WINES.map(function (w, i) {
      var id = 'wn' + i, b = S.band(w.score), open = i === 0, detail;
      if (w.mode === 'smart') {
        detail = '<dl class="judg">' + [['o', 'Occhio', 10], ['n', 'Naso', 30], ['b', 'Bocca', 60]].map(function (r) {
          return '<div><dt>' + r[1] + '<small>peso ' + r[2] + '%</small></dt><dd>' + w.j[r[0]] + '</dd><span class="meter" style="--f:' + ((w.j[r[0]] - 50) / 50).toFixed(2) + '"><i></i></span></div>';
        }).join('') + '</dl>';
      } else {
        detail = '<dl class="judg">' + S.PHASES.map(function (p) {
          var pts = S.phasePts(w.j, p.k);
          return '<div><dt>' + p.name + '</dt><dd>' + pts + '<small> / ' + p.w + '</small></dd><span class="meter" style="--f:' + (pts / p.w).toFixed(2) + '"><i></i></span></div>';
        }).join('') + '</dl>';
      }
      return '<li class="wine' + (open ? ' is-open' : '') + '" data-tier="' + b.tier + '" data-min="' + w.score + '">' +
        '<button class="wine-btn" type="button" data-disclose aria-expanded="' + open + '" aria-controls="' + id + '">' +
        '<span class="w-score" role="text" aria-label="Punteggio ' + w.score + ', ' + b.label + '"><span class="num">' + w.score + '</span><span class="caps">' + b.label + '</span></span>' +
        '<span class="w-main"><span class="w-name">' + esc(w.name) + '</span><span class="w-meta">' + esc(w.prod) + ' · ' + w.year + '</span>' +
        '<span class="w-badges"><span class="stamp">' + (w.mode === 'smart' ? 'Rapido' : 'Completa') + '</span><span class="w-date">' + w.date + '</span></span></span></button>' +
        '<div class="scheda" id="' + id + '"' + (open ? '' : ' hidden') + '><p class="caps s-area">' + esc(w.area) + '</p>' + detail +
        '<p class="quote">' + esc(w.note) + '</p><div class="tags">' + w.tags.map(function (t) { return '<span>' + esc(t) + '</span>'; }).join('') + '</div>' +
        '<div class="actions"><button class="btn-ghost" type="button">Modifica</button><button class="btn-ghost" type="button">Confronta</button></div></div></li>';
    }).join('');
    return '<div class="app" id="app-libro" data-filter-root>' + appTop() +
      '<div class="l-intro"><h3 class="h-screen">Libro</h3><p>37 vini · da settembre a oggi</p></div>' +
      '<div class="l-tools"><label class="search"><span class="vh">Cerca nel libro</span><input type="search" placeholder="Cerca vino, produttore, vitigno" data-filter-input></label>' +
      '<div class="chips" role="group" aria-label="Filtra per punteggio"><button class="chip" type="button" data-filter-chip data-min="0" aria-pressed="true">Tutti</button><button class="chip" type="button" data-filter-chip data-min="80" aria-pressed="false">Da 80</button><button class="chip" type="button" data-filter-chip data-min="90" aria-pressed="false">Da 90</button></div></div>' +
      '<ul class="wines" data-single data-filter-list>' + items + '</ul><p class="t-foot" data-filter-empty hidden>Nessun vino corrisponde</p>' + tabs('libro') + '</div>';
  }

  /* ---------- team ---------- */
  var tpl = {
    teamWine: function (c) {
      var w = c.w, m = c.mine, h = '<li class="tw ' + (c.fresh ? 'is-fresh' : '') + '" data-i="' + c.i + '">';
      h += '<div><h4 class="tw-name">' + esc(w.name) + '</h4><p class="tw-meta">' + esc(w.prod) + ' · ' + w.year + '</p></div>';
      if (c.voted && !c.open) {
        var pills = m.mode === 'smart'
          ? '<span class="mode-pill">Voto rapido</span><span>Occhio <b>' + m.j.o + '</b></span><span>Naso <b>' + m.j.n + '</b></span><span>Bocca <b>' + m.j.b + '</b></span>'
          : '<span class="mode-pill">Scheda completa</span>' + S.PHASES.map(function (p) { return '<span>' + SHORT[p.k] + ' <b>' + S.phasePts(m.j, p.k) + '</b>/' + p.w + '</span>'; }).join('');
        var d = m.score - c.avg;
        h += '<div class="duo"><div class="me"><span class="caps">Il tuo voto</span><span class="num">' + m.score + '</span><span class="sm">' + S.band(m.score).label + '</span></div>' +
          '<div class="tm" role="group" aria-label="Media del team"><span class="caps">Media del team</span><span class="num avg-n" data-avg="' + c.avg.toFixed(3) + '">' + fmt1(c.avg) + '</span><span class="sm">' + c.count + ' voti</span></div></div>' +
          '<span class="delta">' + (Math.abs(d) < .05 ? 'Come la media' : (d > 0 ? '+' : '−') + fmt1(Math.abs(d)) + (d > 0 ? ' sopra la media' : ' sotto la media')) + '</span>' +
          '<div class="pills" aria-label="I tuoi giudizi">' + pills + '</div>' +
          '<div><button class="btn-ghost" type="button" data-act="edit">Modifica il mio voto</button></div>';
      } else if (!c.voted && !c.open) {
        h += '<div class="lock">' + ICON_LOCK + '<div><b>Media riservata</b>Si sblocca dopo il tuo voto.</div><span class="blur" aria-hidden="true">••,•</span></div>' +
          '<button class="btn btn-block" type="button" data-act="open">Vota questo vino</button>';
      }
      if (c.open) {
        var id = S.uid('s');
        h += '<div class="sheet" data-scorer data-mode="smart"><div class="sheet-head"><h4>Il tuo voto</h4><span class="num" data-score>0</span></div>' +
          '<p class="band-line"><b data-band-label></b> · <span data-band-desc></span></p>' + modeSwitch(id) + panels(id, { o: 80, n: 80, b: 80 }, { v: 6, oi: 6, oc: 6, oq: 6, ge: 6, gi: 6, gp: 6, gq: 6, f: 6 }) +
          '<div class="sheet-actions"><button class="btn" type="button" data-act="submit">Conferma il voto</button><button class="btn-ghost" type="button" data-act="cancel">Annulla</button></div></div>';
      }
      return h + '</li>';
    }
  };
  function teamApp(opts) {
    opts = opts || {};
    return '<div class="app themeable" data-team>' +
      '<div class="t-head"><span class="logo" role="img" aria-label="Logo ' + esc(opts.name || 'Sorso') + '"></span><p class="caps">Degustazione di ottobre</p><h3>Serata Nebbiolo e dintorni</h3></div>' +
      '<div class="t-sub"><div class="t-sub-row"><b data-team-progress></b><span>chiude giovedì 9</span></div><div class="dots" aria-hidden="true"><i></i><i></i><i></i><i></i></div></div>' +
      '<p class="t-rule">' + ICON_LOCK + '<span>Vota un vino per sbloccare la media del team. I tuoi giudizi restano sempre visibili.</span></p>' +
      '<ul class="tws" data-team-list></ul><div class="vh" aria-live="polite" data-team-live></div><p class="t-foot">con Sorso</p></div>';
  }
  /* i pallini di avanzamento seguono il conteggio dei vini votati */
  document.addEventListener('teamrender', function (e) {
    e.target.querySelectorAll('.dots i').forEach(function (d, k) { d.classList.toggle('on', k < e.detail.done); });
  });

  /* ---------- statistiche ---------- */
  function stats() {
    var st = S.STATS, max = Math.max.apply(null, st.dist);
    var labels = ['50–59', '60–69', '70–79', '80–89', '90–95', '96–99', '100'];
    var bars = st.dist.map(function (n, i) {
      return '<div class="bar" data-tier="' + S.BANDS[i].tier + '"><span class="bar-n">' + n + '</span><i style="--h:' + (n / max).toFixed(3) + '"></i><span class="bar-l">' + labels[i] + '</span></div>';
    }).join('');
    return '<div class="app" id="app-stats">' + appTop() + '<div class="l-intro"><h3 class="h-screen">Stats</h3><p>Il tuo palato in sintesi</p></div>' +
      '<div class="kpis"><div class="kpi big"><span class="caps">Media</span><span class="num">' + fmt1(st.mean) + '</span><span class="sm">su 100, in ' + st.n + ' vini</span></div>' +
      '<div class="kpi"><span class="caps">Vini</span><span class="num">' + st.n + '</span></div>' +
      '<div class="kpi is-best"><span class="caps">Il migliore</span><span class="num">' + st.best.score + '</span></div></div>' +
      '<div class="card"><h4>Medie per fase</h4><p class="cap">Su 10. La linea tratteggiata è il 6: la sufficienza.</p>' + S.radarSVG(st.radar, { grid: 'poly' }) + '</div>' +
      '<div class="card"><h4>Vini per fascia</h4><p class="cap">Solo il 96 e oltre prende il colore.</p>' +
      '<div class="hist" role="img" aria-label="Vini per fascia: ' + st.dist.map(function (n, i) { return labels[i] + ': ' + n; }).join(', ') + '">' + bars + '</div></div><div class="stats-foot"></div>' + tabs('statistiche') + '</div>';
  }

  /* ---------- sezione 1 ---------- */
  function punteggio(host) {
    host.innerHTML =
      '<div style="width:100%;max-width:390px"><div class="app" style="max-width:none"><div id="demo-live">' + scoreHead(appTop('anteprima')) +
      '<div class="scrub"><div class="scrub-in"><label for="scrub"><span>Prova un punteggio</span><span class="num" data-score>89</span></label>' +
      '<input class="rng" id="scrub" type="range" min="50" max="100" step="1" value="89">' + ruler(100) + '</div></div></div>' +
      '<div class="minis" aria-label="Esempi di fasce alte">' + [91, 97, 100].map(function (v) { return '<figure data-mini="' + v + '">' + scoreHead('', 'score-sm') + '</figure>'; }).join('') + '</div><div style="height:16px"></div></div></div>' +
      '<ol class="bands" aria-label="Le fasce di punteggio">' + S.BANDS.map(function (b) {
        return '<li data-tier="' + b.tier + '" data-band-row="' + b.key + '"><span class="rg">' + (b.min === b.max ? '100' : b.min + '–' + b.max) + '</span><span class="nm">' + b.label + '</span><span class="ds">' + b.desc + '</span></li>';
      }).join('') + '</ol>';
    var live = host.querySelector('#demo-live'), scrub = host.querySelector('#scrub'), bands = host.querySelector('.bands');
    function go() {
      var v = +scrub.value; scrub.style.setProperty('--f', ((v - 50) / 50).toFixed(4));
      scrub.setAttribute('aria-valuetext', v + ', ' + S.band(v).label.toLowerCase());
      S.paint(live, v);
      bands.querySelectorAll('li').forEach(function (li) { li.classList.toggle('is-current', li.dataset.bandRow === S.band(v).key); });
    }
    scrub.addEventListener('input', go); go();
    host.querySelectorAll('[data-mini]').forEach(function (f) { S.paint(f, +f.dataset.mini); });
  }

  /* ---------- montaggio ---------- */
  function figure(inner, cap) { return '<figure>' + inner + (cap ? '<figcaption>' + cap + '</figcaption>' : '') + '</figure>'; }
  punteggio(document.getElementById('m-punteggio'));

  var nHost = document.getElementById('m-nuova');
  nHost.innerHTML = figure(nuova('nuova-1', 'smart', 'Barolo Cannubi', 'Poderi Rivalta', 2019), '<b>Voto rapido</b>: tre cursori, il totale è la media 10/30/60.') +
    figure(nuova('nuova-2', 'full', 'Etna Rosso Contrada Rampante', 'Tenuta delle Sciare', 2021), '<b>Scheda completa</b>: una fase alla volta, con il parziale sempre in vista.');
  nHost.querySelectorAll('[data-scorer]').forEach(S.wireScorer);

  var lHost = document.getElementById('m-libro');
  lHost.innerHTML = figure(libro(), 'Il filtro e la ricerca funzionano; toccando una riga si apre la scheda.');
  S.wireDisclosure(lHost.querySelector('[data-single]')); S.wireFilter(lHost.querySelector('[data-filter-root]'));

  var tHost = document.getElementById('m-team');
  tHost.innerHTML = figure(teamApp({ name: 'Sorso' }), 'Provate: <b>Vota questo vino</b> sul Taurasi, poi sul Vermentino.');
  S.mountTeam(tHost.querySelector('[data-team]'), tpl);

  var LOGO1 = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28"><path fill="#2F6B3A" d="M14 2c7 3 10 9 6.500 15.500C18 22 14 24 14 26c0-2-4-4-6.500-8.500C4 11 7 5 14 2z"/><path stroke="#F4EFE6" stroke-width="1.600" fill="none" d="M14 8v14"/></svg>';
  var LOGO2 = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28"><rect x="3" y="3" width="22" height="22" rx="5" fill="#FF7A3D"/><path fill="#101A2B" d="M8 20V8h3l6 8V8h3v12h-3l-6-8v8z"/></svg>';
  var PARTNERS = [
    { name: 'Enoteca Rossi', logo: LOGO1, bg: '#F4EFE6', ink: '#1F2A1F', accent: '#2F6B3A', font: 'Georgia, "Times New Roman", serif' },
    { name: 'Cantina Nera', logo: LOGO2, bg: '#101A2B', ink: '#F3F5F9', accent: '#FF7A3D', font: 'system-ui, sans-serif' }
  ];
  var pHost = document.getElementById('m-partner');
  pHost.innerHTML = PARTNERS.map(function (p) {
    var css = ':root {\n  --p-logo: url("data:image/svg+xml,…");\n  --p-accent: ' + p.accent + ';\n  --p-bg: ' + p.bg + ';\n  --p-ink: ' + p.ink + ';\n  --p-font: ' + p.font + ';\n}';
    return '<figure>' + teamApp({ name: p.name }) + '<pre class="code" aria-label="CSS del partner ' + esc(p.name) + '"><code>' + esc(css) + '</code></pre></figure>';
  }).join('');
  pHost.querySelectorAll('[data-team]').forEach(function (el, i) {
    var p = PARTNERS[i];
    el.style.setProperty('--p-logo', 'url("data:image/svg+xml,' + encodeURIComponent(p.logo).replace(/"/g, '%22') + '")');
    el.style.setProperty('--p-accent', p.accent); el.style.setProperty('--p-bg', p.bg);
    el.style.setProperty('--p-ink', p.ink); el.style.setProperty('--p-font', p.font);
    el.querySelector('.t-head .caps').textContent = 'Ottobre · ' + p.name;
    S.mountTeam(el, tpl);
  });

  document.getElementById('m-stats').innerHTML = figure(stats(), 'Radar e istogramma sono SVG/HTML con alternativa testuale (aria-label).');
  S.initTheme();
})();
