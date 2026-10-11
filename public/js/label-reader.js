/* Lettura dell'etichetta: dal testo riconosciuto dall'OCR ai campi della scheda.
   Funzione pura (nessun accesso al browser): si prova con `node --test`. Parte dal prototipo "lettore-etichette-vino". */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.LabelReader = factory();
})(typeof self !== "undefined" ? self : this, function () {

const strip = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[’`´]/g, "'").toLowerCase();
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const cap = s => s.replace(/\b([a-zà-ÿ])/g, (m, c) => c.toUpperCase()).replace(/\b(Di|Del|Della|Delle|Dei|D'|E)\b/g, m => m.toLowerCase());

const APPELLATIONS = ["chianti classico","chianti rufina","chianti colli senesi","chianti","brunello di montalcino","rosso di montalcino","vino nobile di montepulciano","rosso di montepulciano","morellino di scansano","bolgheri sassicaia","bolgheri superiore","bolgheri","carmignano","vernaccia di san gimignano","maremma toscana","toscana","barolo","barbaresco","roero","langhe","barbera d'asti","barbera d'alba","nizza","dolcetto d'alba","dogliani","gavi","gattinara","ghemme","asti","moscato d'asti","amarone della valpolicella","recioto della valpolicella","valpolicella ripasso","valpolicella","soave","bardolino","custoza","lugana","prosecco superiore","conegliano valdobbiadene","prosecco","franciacorta","trentodoc","trento","oltrepo pavese","valtellina superiore","sforzato di valtellina","alto adige","sudtirol","trentino","collio","friuli colli orientali","friuli","montepulciano d'abruzzo","trebbiano d'abruzzo","cerasuolo d'abruzzo","verdicchio dei castelli di jesi","verdicchio di matelica","rosso conero","montefalco sagrantino","montefalco rosso","orvieto","frascati","taurasi","greco di tufo","fiano di avellino","aglianico del vulture","primitivo di manduria","salice salentino","castel del monte","ciro","etna","cerasuolo di vittoria","sicilia","cannonau di sardegna","vermentino di gallura","vermentino di sardegna","carignano del sulcis","lambrusco di sorbara","lambrusco grasparossa di castelvetro","romagna","colli piacentini","champagne","cremant","bordeaux superieur","bordeaux","bourgogne","chablis","cotes du rhone","chateauneuf-du-pape","sancerre","alsace","rioja","ribera del duero","priorat","cava","mosel","porto","douro"];
const GRAPES = ["sangiovese","nebbiolo","barbera","dolcetto","aglianico","primitivo","negroamaro","montepulciano","nero d'avola","nerello mascalese","nerello cappuccio","frappato","cannonau","sagrantino","corvina","corvinone","rondinella","lagrein","teroldego","schiava","refosco","merlot","cabernet sauvignon","cabernet franc","cabernet","syrah","shiraz","pinot nero","pinot noir","pinot grigio","pinot bianco","chardonnay","sauvignon blanc","sauvignon","vermentino","trebbiano","garganega","glera","verdicchio","fiano","greco","falanghina","grillo","catarratto","carricante","inzolia","arneis","cortese","timorasso","erbaluce","ribolla gialla","friulano","gewurztraminer","traminer aromatico","riesling","muller thurgau","malvasia","moscato","ciliegiolo","canaiolo","colorino","alicante","grenache","tempranillo","petit verdot","carmenere","zinfandel","gaglioppo","nero di troia","susumaniello","pecorino","passerina","lambrusco","croatina","bonarda","pigato","grechetto","nosiola"];
const MENTIONS = ["gran selezione","riserva","superiore","classico","vigna","cru","metodo classico","spumante","frizzante","brut nature","pas dose","dosaggio zero","extra brut","extra dry","brut","millesimato","passito","vendemmia tardiva","biologico","organic","rosato","orange wine"];

function findTerms(norm, list){
  let work = ' ' + norm + ' '; const found = [];
  [...list].sort((a,b) => b.length - a.length).forEach(t => {
    const re = new RegExp('(^|[^a-z])' + esc(t).replace(/ /g, '\\s+') + '(?=[^a-z]|$)', 'g');
    if(re.test(work)){ found.push(t); work = work.replace(re, '$1 # '); }
  });
  return found;
}

function parseLabel(text, lines, nowYear){
  const year = nowYear || new Date().getFullYear();
  let L = (lines.length ? lines : text.split('\n').map(t => ({ text:t, h:0, conf:0 })))
    .map(l => ({ ...l, text: l.text.replace(/\s+/g, ' ').trim() }))
    .filter(l => l.text.replace(/[^A-Za-zÀ-ÿ0-9]/g, '').length >= 2);
  const flat = L.map(l => l.text).join('\n');
  const norm = strip(flat);
  const upper = flat.toUpperCase().replace(/\./g, '');
  const r = {};

  // Tipologia di denominazione
  const codes = [
    ['DOCG', /\bDOCG\b/, /denominazione di origine controllata e garantita/],
    ['DOC',  /\bDOC\b/,  /denominazione di origine controllata(?! e garantita)/],
    ['IGT',  /\bIGT\b/,  /indicazione geografica tipica/],
    ['IGP',  /\bIGP\b/,  /indicazione geografica protetta/],
    ['DOP',  /\bDOP\b/,  /denominazione di origine protetta/],
    ['AOC',  /\bAOC\b/,  /appellation .{0,30}controlee/],
    ['AOP',  /\bAOP\b/,  /appellation d'origine protegee/],
    ['DOCa', /\bDOCA\b/, /denominacion de origen calificada/]
  ];
  for(const [name, re1, re2] of codes){ if(re1.test(upper) || re2.test(norm)){ r.tipologia = name; break; } }

  // Denominazione: si cerca prima nella riga che porta DOC/DOCG/IGT, poi nel resto; gli indirizzi (\"imbottigliato a … in Chianti\") non contano
  const BOTTLED_LINE = /(imbottigliat|prodott[oa]|bottled|mis en bouteille|abgef|via\s|loc\.|localit|\b\d{5}\b)/i;
  const codeLine = L.find(l => /\b(DOCG|DOC|IGT|IGP|DOP|AOC|AOP)\b/.test(l.text.toUpperCase().replace(/\./g, '')) && !BOTTLED_LINE.test(l.text));
  let app = codeLine ? findTerms(strip(codeLine.text), APPELLATIONS) : [];
  if(!app.length) app = findTerms(strip(L.filter(l => !BOTTLED_LINE.test(l.text)).map(l => l.text).join('\n')), APPELLATIONS);
  if(app.length) r.denominazione = cap(app.sort((a,b) => b.length - a.length)[0]);
  /* se la riga con DOC/IGT dice di più del solo nome noto («Colli della Toscana Centrale»), si tiene quello che c'è scritto */
  if(codeLine){
    const rest = codeLine.text.replace(/\b(D\.?O\.?C\.?G?\.?|I\.?G\.?[TP]\.?|D\.?O\.?P\.?|A\.?O\.?[CP]\.?)(?![a-z])|denominazione di origine( controllata)?( e garantita)?|indicazione geografica tipica/gi, ' ')
      .replace(/\b(19|20)\d{2}\b|\d+([.,]\d+)?\s?(%|ml|cl|l)\b/gi, ' ').replace(/\s+/g, ' ').replace(/^[\s\-–,.:]+|[\s\-–,.:]+$/g, '');
    if(rest.length >= 4 && rest.split(' ').length <= 6 && (!r.denominazione || strip(rest).includes(strip(r.denominazione)))) r.denominazione = /[a-zà-ÿ]/.test(rest) ? rest : cap(rest.toLowerCase());
  }
  if(!r.denominazione){
    const dl = L.find(l => /\b(D\.?O\.?C\.?G?|I\.?G\.?T|denominazione)\b/i.test(l.text));
    if(dl){
      const rest = dl.text.replace(/\b(D\.?O\.?C\.?G?\.?|I\.?G\.?[TP]\.?|D\.?O\.?P\.?)|denominazione di origine( controllata)?( e garantita)?|indicazione geografica tipica/gi, '').replace(/^[\s\-–,.:]+|[\s\-–,.:]+$/g, '');
      if(rest.length > 3) r.denominazione = rest;
    }
  }

  // Annata: si scartano gli anni di fondazione ("dal 1898", "since 1902")
  const cands = [];
  L.forEach(l => {
    const re = /(?<!\d)(19[4-9]\d|20[0-4]\d)(?!\d)/g; let m;
    while((m = re.exec(l.text))){
      const y = +m[1]; if(y > year) continue;
      const before = strip(l.text.slice(Math.max(0, m.index - 22), m.index));
      cands.push({ y, h: l.h,
        founding: /(dal|since|depuis|seit|fondat\w*|est\.?|anno di fondazione|from)\s*$/.test(before),
        strong: /(vendemmia|annata|harvest|vintage|millesim\w*|cosecha|jahrgang)\W*$/.test(before) });
    }
  });
  const good = cands.filter(c => !c.founding);
  const pick = good.find(c => c.strong) || good.sort((a,b) => b.h - a.h)[0];
  if(pick) r.annata = String(pick.y);

  // Gradazione alcolica
  const alcRe = /(\d{1,2}(?:\s?[.,]\s?\d{1,2})?)\s?%\s?(vol|alc)?/gi; let am, alc = null;
  while((am = alcRe.exec(flat))){
    const v = parseFloat(am[1].replace(/\s/g, '').replace(',', '.'));
    if(v >= 4.5 && v <= 23){ if(!alc || am[2]) alc = v; if(am[2]) break; }
  }
  if(alc !== null) r.gradazione = String(alc).replace('.', ',') + '% vol';

  // Formato
  const volRe = /(\d{1,4}(?:[.,]\d{1,3})?)\s?(ml|cl|lt|l)\b/gi; let vm;
  while((vm = volRe.exec(flat))){
    let v = parseFloat(vm[1].replace(',', '.')); const u = vm[2].toLowerCase();
    v = u === 'ml' ? v : u === 'cl' ? v * 10 : v * 1000;
    if(v >= 100 && v <= 15000){ r.formato = Math.round(v) + ' ml'; break; }
  }

  // Vitigni e menzioni
  const grapes = findTerms(norm, GRAPES);
  if(grapes.length) r.vitigni = grapes.map(cap);
  const appNorm = r.denominazione ? strip(r.denominazione) : '';
  const ment = findTerms(norm, MENTIONS).filter(m => !appNorm.includes(m));
  if(ment.length) r.menzioni = ment.map(cap);

  // Produttore
  const bottled = /(prodott[oa] e imbottigliat[oa]|imbottigliat[oa](?: all'origine)?|produced and bottled by|bottled by|mis en bouteille(?: au ch[aâ]teau| [aà] la propri[ée]t[ée])?|abgef[üu]llt)/i;
  for(let i=0; i<L.length && !r.produttore; i++){
    const m = L[i].text.match(bottled); if(!m) continue;
    let rest = L[i].text.slice(m.index + m[0].length)
      .replace(/^\s*(all['’]origine)?\s*(da|dal|dalla|dall['’]|by|par|von|durch)?\s*:?\s*/i, '');
    if(rest.length < 3 && L[i+1]) rest = L[i+1].text;
    rest = rest.split(/\s[-–]\s|,|\bvia\b|\bloc\.?\s|\bfraz\.?\s|\b\d{5}\b/i)[0].trim();
    if(rest.length >= 3) r.produttore = rest.slice(0, 70);
  }
  if(!r.produttore){
    const kw = /\b(azienda agricola|az\.?\s?agr\.?|societa agricola|soc\.?\s?agr\.?|tenut[ae]|cantin[ae]|castello|fattoria|podere|marches[ie]|conti|cascina|villa|domaine|chateau|bodegas?|weingut|maison|baglio|masseria|abbazia|feudi?)\b/;
    const hits = L.filter(l => kw.test(strip(l.text))).sort((a,b) => b.h - a.h);
    if(hits.length) r.produttore = hits[0].text.slice(0, 70);
  }

  // Testo più grande (spesso nome del vino o del produttore); servono le misure delle righe
  if(L.some(l => l.h > 0)){
    const prodN = strip(r.produttore || '');
    const cand = L.filter(l => !/^\W*\d{4}\W*$/.test(l.text) && /[A-Za-zÀ-ÿ]{3,}/.test(l.text) && !(prodN && strip(l.text) === prodN) && !/\b(DOCG|DOC|IGT|IGP|DOP|vol|ml)\b/i.test(l.text));
    const maxH = Math.max(0, ...cand.map(l => l.h));
    const big = cand.filter(l => l.h >= maxH * 0.85).slice(0, 2).map(l => l.text).join(' ');
    if(big && big !== r.produttore) r.testoPrincipale = big;
  }

  // Senza misure delle righe (testo corretto a mano): il nome del vino è spesso la riga in maiuscolo, corta, senza numeri né diciture
  if(!r.testoPrincipale){
    const skip = /(\bdoc|\bigt|\bigp|\bdop|vol|\bml\b|\bcl\b|imbottigliat|prodott|bottled|contiene|solfiti|sulphites|italia|italy|product of|vino\b)/i;
    const up = L.find(l => /[A-ZÀ-Þ]{3,}/.test(l.text) && l.text === l.text.toUpperCase() && l.text.length >= 5 && l.text.length <= 40 && !/\d/.test(l.text) && !skip.test(l.text) && strip(l.text) !== strip(r.produttore || ''));
    if(up) r.testoPrincipale = up.text;
  }

  r.testo = text.trim();
  return r;
}

/* Dai dati letti ai campi della scheda «Nuova»: solo ciò che serve davvero e con maiuscole sensate. */
const TIPI = ["Rosso", "Bianco", "Rosato", "Spumante", "Passito"];
function toWineFields(r) {
  const out = {};
  const clean = (s, n) => String(s || "").replace(/\s+/g, " ").replace(/^[\s\-–,.:|]+|[\s\-–,.:|]+$/g, "").slice(0, n || 70);
  const titleCase = s => /[a-zà-ÿ]/.test(s) ? s : s.toLowerCase().replace(/(^|[\s'’-])([a-zà-ÿ])/g, (m, a, c) => a + c.toUpperCase()).replace(/\b(Di|Del|Della|Delle|Dei|Da|E)\b/g, m => m.toLowerCase()).replace(/^./, c => c.toUpperCase());
  if (r.produttore) out.produttore = titleCase(clean(r.produttore));
  const prod = out.produttore ? strip(out.produttore) : "";
  if (r.testoPrincipale) {
    const n = titleCase(clean(r.testoPrincipale, 60));
    if (n && strip(n) !== prod) out.nome = n;
  }
  if (r.annata) out.annata = String(r.annata);
  if (r.denominazione) out.denominazione = clean(r.denominazione + (r.tipologia && !new RegExp("\\b" + r.tipologia + "\\b", "i").test(r.denominazione) ? " " + r.tipologia : ""), 70);
  const m = (r.menzioni || []).map(x => strip(x)).join(" ");
  if (/spumante|metodo classico|brut|extra dry|pas dose|dosaggio zero|millesimato|franciacorta|champagne|prosecco/.test(m + " " + strip(r.denominazione || ""))) out.tipologia = "Spumante";
  else if (/passito|vendemmia tardiva/.test(m)) out.tipologia = "Passito";
  else if (/rosato/.test(m)) out.tipologia = "Rosato";
  if (r.vitigni && r.vitigni.length) out.vitigni = r.vitigni.slice(0, 8);
  if (r.gradazione) out.gradazione = r.gradazione;
  return out;
}

return { parseLabel, toWineFields, TIPI, APPELLATIONS, GRAPES };
});
