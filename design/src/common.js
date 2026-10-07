/* ==========================================================================
   Sorso · mockup — logica condivisa dalle due direzioni (nessun framework).
   Dati finti, formule reali di PIANO.md §2. Le direzioni forniscono solo i
   template (HTML) e il CSS; qui c'è tutto ciò che è comportamento.
   Convenzioni DOM (data-attributes) che i template devono rispettare:
     [data-scorer]          radice di un punteggio vivo (frame Nuova, sheet team, scrubber)
       data-mode            "smart" | "full" (modalità attiva)
       [data-mode-btn=m]    bottoni del selettore di modalità (role=tab)
       [data-panel=m]       pannelli (role=tabpanel)
       input[type=range][data-k]   slider (chiavi: o n b | v oi oc oq ge gi gp gq f)
       [data-out=ID] [data-word=ID]  valore e parola associati allo slider con quell'id
       [data-score] [data-band-label] [data-band-range]  testi del punteggio
       [data-phase-pts=k]   punti della fase (scheda completa)
     root.dataset.tier  std | high | rare | peak ; root.dataset.band ; --p (0..1)
   ========================================================================== */
(function (global) {
  'use strict';

  var BANDS = [
    { min: 50, max: 59, key: 'difettoso', desc: 'Difetti evidenti',   label: 'Difettoso',   tier: 'std' },
    { min: 60, max: 69, key: 'sufficiente', desc: 'Corretto, senza slanci', label: 'Sufficiente', tier: 'std' },
    { min: 70, max: 79, key: 'discreto', desc: 'Piacevole e ben fatto',    label: 'Discreto',    tier: 'std' },
    { min: 80, max: 89, key: 'buono', desc: 'Un vino che convince',       label: 'Buono',       tier: 'std' },
    { min: 90, max: 95, key: 'eccellente', desc: 'Di grande carattere',  label: 'Eccellente',  tier: 'high' },
    { min: 96, max: 99, key: 'eccezionale', desc: 'Raro: da ricordare a lungo', label: 'Eccezionale', tier: 'rare' },
    { min: 100, max: 100, key: 'irripetibile', desc: 'Il vino di una vita', label: 'Irripetibile', tier: 'peak' }
  ];

  var PHASES = [
    { k: 'v', name: 'Visivo', w: 10, items: [['v', 'Qualità visiva']] },
    { k: 'o', name: 'Olfattivo', w: 30, items: [['oi', 'Intensità'], ['oc', 'Complessità'], ['oq', 'Qualità olfattiva']] },
    { k: 'g', name: 'Gusto-olfattivo', w: 40, items: [['ge', 'Equilibrio'], ['gi', 'Intensità'], ['gp', 'Persistenza'], ['gq', 'Qualità gustativa']] },
    { k: 'f', name: 'Finale', w: 20, items: [['f', 'Armonia']] }
  ];

  var WORD10 = ['Grave difetto', 'Scarso', 'Scarso', 'Scarso', 'Insufficiente', 'Insufficiente', 'Sufficiente', 'Discreto', 'Buono', 'Ottimo', 'Eccellente'];

  var K = 1.8; /* curva scheda completa: 50 + 50 * q^k (k da tarare) */

  function band(score) {
    for (var i = BANDS.length - 1; i >= 0; i--) if (score >= BANDS[i].min) return BANDS[i];
    return BANDS[0];
  }
  function avg(a) { return a.reduce(function (x, y) { return x + y; }, 0) / a.length; }

  /* Voto rapido: media pesata 10/30/60, intero, già nella banda 50-100 */
  function smart(o, n, b) { return Math.round(0.1 * o + 0.3 * n + 0.6 * b); }

  /* Scheda completa: 9 giudizi 0-10, pesi di fase 10/30/40/20, curva non lineare */
  function fullQ(j) {
    return (avg([j.v]) * 10 + avg([j.oi, j.oc, j.oq]) * 30 + avg([j.ge, j.gi, j.gp, j.gq]) * 40 + j.f * 20) / 1000;
  }
  function full(j) { return Math.round(50 + 50 * Math.pow(fullQ(j), K)); }
  function phasePts(j, k) {
    var p = PHASES.filter(function (x) { return x.k === k; })[0];
    return Math.round(avg(p.items.map(function (it) { return j[it[0]]; })) / 10 * p.w);
  }

  function fmt1(n) { return n.toLocaleString('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 }); }
  var _uid = 0;
  function uid(p) { return (p || 'id') + (++_uid); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  var reduced = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------------- dati finti ---------------- */
  var WINES = [
    { id: 'w1', name: 'Barolo Riserva Monvigliero', prod: 'Poderi Rivalta', year: 2016, area: 'Barolo DOCG', date: '3 ott', mode: 'smart',
      j: { o: 95, n: 97, b: 98 }, note: 'Rosa appassita, catrame e liquirizia al naso. In bocca tannino finissimo, sale e agrumi canditi; chiusura che non finisce. Da ricordare.', tags: ['Nebbiolo', '€ 78', 'Langhe'] },
    { id: 'w2', name: 'Etna Rosso Contrada Rampante', prod: 'Tenuta delle Sciare', year: 2021, area: 'Etna DOC', date: '28 set', mode: 'full',
      j: { v: 8, oi: 8, oc: 7, oq: 8, ge: 9, gi: 8, gp: 8, gq: 9, f: 9 }, note: 'Ciliegia nera, pietra focaia, un fondo di fumo. Gran bella acidità, tannino ancora vivace: tra due anni sarà un altro vino.', tags: ['Nerello Mascalese', '€ 32', 'Sicilia'] },
    { id: 'w3', name: 'Verdicchio Classico Salmariano', prod: 'Fattoria San Zeno', year: 2022, area: 'Castelli di Jesi DOC', date: '21 set', mode: 'smart',
      j: { o: 82, n: 80, b: 84 }, note: 'Mandorla verde e fiori bianchi, bocca sapida e dritta. Ottimo prezzo, perfetto con il pesce crudo.', tags: ['Verdicchio', '€ 14', 'Marche'] },
    { id: 'w4', name: 'Chianti Classico Riserva', prod: 'Castello di Montecchio', year: 2018, area: 'Chianti Classico DOCG', date: '14 set', mode: 'full',
      j: { v: 7, oi: 7, oc: 6, oq: 7, ge: 7, gi: 7, gp: 7, gq: 7, f: 7 }, note: 'Corretto ma timido: viola e cuoio, bocca un po’ magra. Onesto, non emoziona.', tags: ['Sangiovese', '€ 24', 'Toscana'] },
    { id: 'w5', name: 'Lambrusco di Sorbara Rosato', prod: 'Cantina del Frignano', year: 2023, area: 'Sorbara DOC', date: '2 set', mode: 'smart',
      j: { o: 68, n: 66, b: 70 }, note: 'Fragolina e lampone, perlage grossolano. Beverino ma finisce presto.', tags: ['Lambrusco', '€ 9', 'Emilia'] }
  ];
  WINES.forEach(function (w) { w.score = w.mode === 'smart' ? smart(w.j.o, w.j.n, w.j.b) : full(w.j); });

  /* Team: others = voti degli altri (somma e numero). La media mostrata include il voto dell'utente. */
  var TEAM_WINES = [
    { id: 't1', name: 'Barbaresco Asili', prod: 'Cantina del Pino', year: 2020, mine: { mode: 'smart', j: { o: 88, n: 90, b: 92 } }, othersN: 11, othersSum: 11 * 88.2 },
    { id: 't2', name: 'Etna Rosso Contrada Rampante', prod: 'Tenuta delle Sciare', year: 2021, mine: { mode: 'full', j: { v: 8, oi: 8, oc: 8, oq: 8, ge: 8, gi: 8, gp: 9, gq: 8, f: 8 } }, othersN: 8, othersSum: 8 * 84.6 },
    { id: 't3', name: 'Taurasi Riserva', prod: 'Terre d’Irpinia', year: 2017, mine: null, othersN: 10, othersSum: 10 * 86.1 },
    { id: 't4', name: 'Vermentino di Gallura', prod: 'Cantina Li Cuppulati', year: 2023, mine: null, othersN: 9, othersSum: 9 * 79.4 }
  ];
  TEAM_WINES.forEach(function (w) { if (w.mine) w.mine.score = w.mine.mode === 'smart' ? smart(w.mine.j.o, w.mine.j.n, w.mine.j.b) : full(w.mine.j); });

  var STATS = {
    n: 37, mean: 82.6, best: { name: 'Barolo Riserva Monvigliero 2016', score: 97 },
    radar: [{ label: 'Visivo', v: 8.6 }, { label: 'Olfattivo', v: 8.1 }, { label: 'Gusto-olf.', v: 7.9 }, { label: 'Finale', v: 8.3 }],
    dist: [0, 2, 8, 17, 8, 2, 0] /* una barra per fascia */
  };

  /* ---------------- tema ---------------- */
  function initTheme() {
    var root = document.documentElement, KEY = 'sorso-design-theme', saved = null;
    try { saved = localStorage.getItem(KEY); } catch (e) {}
    if (saved === 'light' || saved === 'dark') root.dataset.theme = saved;
    function isDark() {
      return root.dataset.theme ? root.dataset.theme === 'dark' : global.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    function sync() {
      document.querySelectorAll('[data-theme-toggle]').forEach(function (b) {
        b.setAttribute('aria-pressed', String(isDark()));
        b.setAttribute('aria-label', isDark() ? 'Tema scuro attivo: passa al chiaro' : 'Tema chiaro attivo: passa allo scuro');
      });
      var m = document.querySelector('meta[name=theme-color]');
      if (m) m.content = getComputedStyle(root).getPropertyValue('--bg').trim() || m.content;
    }
    document.addEventListener('click', function (e) {
      var b = e.target.closest('[data-theme-toggle]'); if (!b) return;
      root.dataset.theme = isDark() ? 'light' : 'dark';
      try { localStorage.setItem(KEY, root.dataset.theme); } catch (e2) {}
      sync();
    });
    sync();
  }

  /* ---------------- punteggio vivo ---------------- */
  function paint(root, score) {
    var b = band(score);
    root.dataset.tier = b.tier; root.dataset.band = b.key; root.dataset.total = score;
    root.style.setProperty('--p', ((score - 50) / 50).toFixed(4));
    root.querySelectorAll('[data-score]').forEach(function (n) { if (n !== root) n.textContent = score; });
    root.querySelectorAll('[data-band-row]').forEach(function (r) { r.classList.toggle('is-current', r.dataset.bandRow === b.key); });
    root.querySelectorAll('[data-band-label]').forEach(function (n) { n.textContent = b.label; });
    root.querySelectorAll('[data-band-desc]').forEach(function (n) { n.textContent = b.desc; });
    root.querySelectorAll('[data-band-range]').forEach(function (n) { n.textContent = b.min === b.max ? '100' : b.min + '–' + b.max; });
    root.querySelectorAll('[data-score-label]').forEach(function (n) { n.setAttribute('aria-label', 'Punteggio ' + score + ' su 100, ' + b.label); });
  }

  function wireScorer(root) {
    if (root._wired) return root._apply; root._wired = true;
    var apply = function () {
      var mode = root.dataset.mode || 'smart';
      var panel = root.querySelector('[data-panel="' + mode + '"]') || root;
      var vals = {};
      panel.querySelectorAll('input[type=range][data-k]').forEach(function (i) { vals[i.dataset.k] = +i.value; });
      var score = mode === 'full' ? full(vals) : smart(vals.o, vals.n, vals.b);
      root.querySelectorAll('input[type=range]').forEach(function (i) {
        var f = (i.value - i.min) / (i.max - i.min);
        i.style.setProperty('--f', f.toFixed(4));
        var out = root.querySelector('[data-out="' + i.id + '"]'), word = root.querySelector('[data-word="' + i.id + '"]');
        var txt;
        if (+i.max === 100) { txt = band(+i.value).label; } else { txt = WORD10[+i.value]; }
        if (out) out.textContent = i.value;
        if (word) word.textContent = txt;
        i.setAttribute('aria-valuetext', i.value + (+i.max === 100 ? '' : ' su 10') + ', ' + txt.toLowerCase());
      });
      PHASES.forEach(function (p) {
        root.querySelectorAll('[data-phase-pts="' + p.k + '"]').forEach(function (n) { n.textContent = phasePts(vals, p.k); });
      });
      root._vals = vals; root._score = score; root._mode = mode;
      paint(root, score);
      root.dispatchEvent(new CustomEvent('scorechange', { detail: { score: score, mode: mode, vals: vals } }));
    };
    root._apply = apply;
    root.addEventListener('input', function (e) { if (e.target.matches('input[type=range]')) apply(); });
    function setMode(m, focus) {
      root.dataset.mode = m;
      root.querySelectorAll('[data-mode-btn]').forEach(function (b) {
        var on = b.dataset.modeBtn === m;
        b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1;
        if (on && focus) b.focus();
      });
      root.querySelectorAll('[data-panel]').forEach(function (p) { p.hidden = p.dataset.panel !== m; });
      apply();
    }
    root.addEventListener('click', function (e) {
      var b = e.target.closest('[data-mode-btn]'); if (b && root.contains(b)) setMode(b.dataset.modeBtn);
    });
    root.addEventListener('keydown', function (e) {
      var b = e.target.closest('[data-mode-btn]'); if (!b) return;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Home' || e.key === 'End') {
        e.preventDefault();
        var m = (e.key === 'ArrowLeft' || e.key === 'Home') ? 'smart' : 'full'; setMode(m, true);
      }
    });
    setMode(root.dataset.mode || 'smart');
    return apply;
  }

  /* ---------------- disclosure (libro) ---------------- */
  function wireDisclosure(root) {
    root.addEventListener('click', function (e) {
      var b = e.target.closest('[data-disclose]'); if (!b || !root.contains(b)) return;
      var tgt = document.getElementById(b.getAttribute('aria-controls'));
      var open = b.getAttribute('aria-expanded') !== 'true';
      if (root.dataset.single !== undefined && open) {
        root.querySelectorAll('[data-disclose][aria-expanded=true]').forEach(function (o) {
          o.setAttribute('aria-expanded', 'false'); var t = document.getElementById(o.getAttribute('aria-controls')); if (t) t.hidden = true;
          var li = o.closest('li'); if (li) li.classList.remove('is-open');
        });
      }
      b.setAttribute('aria-expanded', String(open)); if (tgt) tgt.hidden = !open;
      var li2 = b.closest('li'); if (li2) li2.classList.toggle('is-open', open);
    });
  }

  /* ---------------- filtro libro ---------------- */
  function wireFilter(root) {
    var input = root.querySelector('[data-filter-input]'), list = root.querySelector('[data-filter-list]');
    var empty = root.querySelector('[data-filter-empty]'), min = 0;
    function run() {
      var q = (input && input.value || '').trim().toLowerCase(), n = 0;
      list.querySelectorAll(':scope > li').forEach(function (li) {
        var ok = (+li.dataset.min >= min) && (!q || li.textContent.toLowerCase().indexOf(q) > -1);
        li.hidden = !ok; if (ok) n++;
      });
      if (empty) empty.hidden = n > 0;
    }
    if (input) input.addEventListener('input', run);
    root.addEventListener('click', function (e) {
      var c = e.target.closest('[data-filter-chip]'); if (!c) return;
      min = +c.dataset.min;
      root.querySelectorAll('[data-filter-chip]').forEach(function (x) { x.setAttribute('aria-pressed', String(x === c)); });
      run();
    });
  }

  /* ---------------- team ---------------- */
  function countUp(el, to, dec, ms) {
    if (reduced) { el.textContent = fmt1(to); return; }
    var t0 = performance.now(), from = Math.max(50, to - 6);
    function step(t) {
      var k = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - k, 3);
      el.textContent = fmt1(from + (to - from) * e);
      if (k < 1) requestAnimationFrame(step); else el.textContent = fmt1(to);
    }
    requestAnimationFrame(step);
  }
  /* tpl.teamWine(ctx) -> stringa <li>; ctx: {w, open, voted, mine, avg, count, fresh} */
  function mountTeam(root, tpl) {
    var state = TEAM_WINES.map(function (w) { return { w: w, open: false, mine: w.mine ? JSON.parse(JSON.stringify(w.mine)) : null, fresh: false }; });
    var list = root.querySelector('[data-team-list]');
    var live = root.querySelector('[data-team-live]');
    function ctxOf(s, i) {
      var voted = !!s.mine;
      var count = s.w.othersN + (voted ? 1 : 0);
      var avg = voted ? (s.w.othersSum + s.mine.score) / count : null;
      return { w: s.w, i: i, open: s.open, voted: voted, mine: s.mine, avg: avg, count: count, fresh: s.fresh };
    }
    function render(focusSel) {
      list.innerHTML = state.map(function (s, i) { return tpl.teamWine(ctxOf(s, i)); }).join('');
      list.querySelectorAll('[data-scorer]').forEach(function (sc) {
        var i = +sc.closest('[data-i]').dataset.i, s = state[i];
        var apply = wireScorer(sc);
        if (s.mine) { /* modifica: ripristina i valori */
          sc.dataset.mode = s.mine.mode;
          var p = sc.querySelector('[data-panel="' + s.mine.mode + '"]');
          Object.keys(s.mine.j).forEach(function (k) { var inp = p.querySelector('[data-k="' + k + '"]'); if (inp) inp.value = s.mine.j[k]; });
          sc.querySelector('[data-mode-btn="' + s.mine.mode + '"]').click();
        } else apply();
      });
      var done = state.filter(function (s) { return s.mine; }).length;
      root.querySelectorAll('[data-team-progress]').forEach(function (n) { n.textContent = done + ' di ' + state.length + ' vini votati'; });
      root.dispatchEvent(new CustomEvent('teamrender', { bubbles: true, detail: { done: done, total: state.length } }));
      state.forEach(function (s) {
        if (s.fresh) {
          var li = list.querySelector('[data-i="' + state.indexOf(s) + '"]'), el = li && li.querySelector('[data-avg]');
          if (el) { countUp(el, +el.dataset.avg, 1, 900); }
          if (live) live.textContent = 'Media del team sbloccata per ' + s.w.name + ': ' + fmt1(+el.dataset.avg) + ' su ' + (s.w.othersN + 1) + ' voti.';
          s.fresh = false;
        }
      });
      if (focusSel) { var f = list.querySelector(focusSel); if (f) f.focus(); }
    }
    root.addEventListener('click', function (e) {
      var b = e.target.closest('[data-act]'); if (!b || !root.contains(b)) return;
      var li = b.closest('[data-i]'), i = li ? +li.dataset.i : -1, s = state[i], act = b.dataset.act;
      if (act === 'open') { s.open = true; render('[data-i="' + i + '"] input[type=range]'); }
      else if (act === 'cancel') { s.open = false; render('[data-i="' + i + '"] [data-act="open"],[data-i="' + i + '"] [data-act="edit"]'); }
      else if (act === 'edit') { s.open = true; render('[data-i="' + i + '"] input[type=range]'); }
      else if (act === 'submit') {
        var sc = li.querySelector('[data-scorer]');
        s.mine = { mode: sc._mode, j: Object.assign({}, sc._vals), score: sc._score };
        s.open = false; s.fresh = true; render('[data-i="' + i + '"] [data-act="edit"]');
      }
    });
    render();
  }

  /* ---------------- grafici ---------------- */
  function radarSVG(axes, o) {
    o = o || {}; var S = o.size || 280, c = S / 2, R = S / 2 - (o.pad || 54), n = axes.length, max = o.max || 10;
    function pt(i, r) { var a = -Math.PI / 2 + i * 2 * Math.PI / n; return [c + Math.cos(a) * r, c + Math.sin(a) * r]; }
    var rings = o.rings || [2, 4, 6, 8, 10], out = '';
    rings.forEach(function (v) {
      var r = R * v / max, cls = 'rd-ring' + (v === 6 ? ' rd-ring-suff' : '');
      if (o.grid === 'circle') out += '<circle class="' + cls + '" cx="' + c + '" cy="' + c + '" r="' + r.toFixed(1) + '"/>';
      else out += '<polygon class="' + cls + '" points="' + axes.map(function (_, i) { return pt(i, r).map(function (x) { return x.toFixed(1); }).join(','); }).join(' ') + '"/>';
    });
    axes.forEach(function (_, i) { var p = pt(i, R); out += '<line class="rd-axis" x1="' + c + '" y1="' + c + '" x2="' + p[0].toFixed(1) + '" y2="' + p[1].toFixed(1) + '"/>'; });
    out += '<polygon class="rd-area" points="' + axes.map(function (a, i) { return pt(i, R * a.v / max).map(function (x) { return x.toFixed(1); }).join(','); }).join(' ') + '"/>';
    axes.forEach(function (a, i) {
      var p = pt(i, R * a.v / max); out += '<circle class="rd-dot" cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="4"/>';
      var l = pt(i, R + 20), anchor = Math.abs(l[0] - c) < 6 ? 'middle' : (l[0] > c ? 'start' : 'end');
      var dy = l[1] > c + 6 ? 6 : (l[1] < c - 6 ? -2 : 4);
      out += '<text class="rd-label" x="' + l[0].toFixed(1) + '" y="' + (l[1] + dy).toFixed(1) + '" text-anchor="' + anchor + '">' + esc(a.label) + '<tspan class="rd-val" x="' + l[0].toFixed(1) + '" dy="15">' + fmt1(a.v) + '</tspan></text>';
    });
    var desc = axes.map(function (a) { return a.label + ' ' + fmt1(a.v); }).join(', ');
    return '<svg class="radar" viewBox="0 0 ' + S + ' ' + S + '" role="img" aria-label="Grafico radar delle medie per fase su 10: ' + desc + '">' + out + '</svg>';
  }

  global.SORSO = {
    BANDS: BANDS, PHASES: PHASES, WINES: WINES, TEAM_WINES: TEAM_WINES, STATS: STATS, WORD10: WORD10,
    band: band, smart: smart, full: full, fullQ: fullQ, phasePts: phasePts, fmt1: fmt1, uid: uid, esc: esc,
    paint: paint, wireFilter: wireFilter, wireScorer: wireScorer, wireDisclosure: wireDisclosure, mountTeam: mountTeam, radarSVG: radarSVG,
    initTheme: initTheme, reduced: reduced, K: K
  };
})(window);
