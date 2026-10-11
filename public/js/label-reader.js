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
const APP_EXTRA = ["aglianico del taburno", "aglianico del vulture superiore", "alta langa", "asolo prosecco", "barbera del monferrato superiore", "bardolino superiore", "brachetto d'acqui", "castel del monte nero di troia", "cesanese del piglio", "colli bolognesi pignoletto", "colli di conegliano", "colli euganei fior d'arancio", "colli orientali del friuli picolit", "conero", "dolcetto di diano d'alba", "dolcetto di ovada superiore", "elba aleatico passito", "erbaluce di caluso", "frascati superiore", "friularo di bagnoli", "lison", "montecucco sangiovese", "montecucco", "montepulciano d'abruzzo colline teramane", "moscato di scanzo", "offida", "oltrepo pavese metodo classico", "piave malanotte", "primitivo di manduria dolce naturale", "ramandolo", "recioto di gambellara", "recioto di soave", "roero arneis", "rosazzo", "rosso della val di cornia", "ruche di castagnole monferrato", "soave superiore", "suvereto", "terre tollesi", "tullum", "torgiano rosso riserva", "vernaccia di serrapetrona", "orcia", "sant'antimo", "cortona", "montecarlo", "pomino", "valdarno di sopra", "colline lucchesi", "chianti colli fiorentini", "chianti colli aretini", "chianti montalbano", "chianti montespertoli", "val di cornia", "costa toscana", "terre di pisa", "maremma", "piemonte", "monferrato", "nebbiolo d'alba", "teroldego rotaliano", "valdadige", "garda", "valpolicella superiore", "piave", "lison pramaggiore", "friuli grave", "friuli isonzo", "carso", "emilia", "romagna sangiovese", "lambrusco salamino di santa croce", "lambrusco di modena", "gutturnio", "rosso piceno", "lacrima di morro d'alba", "montefalco", "umbria", "torgiano", "est! est!! est!!! di montefiascone", "cesanese", "tintilia del molise", "falanghina del sannio", "sannio", "irpinia", "lacryma christi del vesuvio", "campi flegrei", "costa d'amalfi", "cilento", "matera", "gioia del colle", "brindisi", "copertino", "squinzano", "calabria", "marsala", "pantelleria", "noto", "eloro", "vittoria", "menfi", "faro", "monica di sardegna", "vernaccia di oristano", "valle d'aosta", "valtellina", "bonarda dell'oltrepo pavese", "curtefranca", "valcalepio", "terre siciliane", "puglia", "salento", "veneto", "delle venezie", "colli tortonesi", "rosso di valtellina", "colli maceratesi", "bianchello del metauro", "rosso conero", "lessini durello", "colli berici", "breganze", "bianco di custoza", "cerasuolo d'abruzzo superiore", "marche", "lazio", "toscana", "sicilia", "sardegna", "campania", "basilicata", "molise", "abruzzo"];
const GRAPES_EXTRA = ["prugnolo gentile", "sangiovese grosso", "morellino", "brunello", "nerello", "perricone", "nocera", "magliocco", "greco nero", "bombino", "bombino bianco", "bombino nero", "uva di troia", "ottavianello", "verdeca", "fiano minutolo", "minutolo", "coda di volpe", "asprinio", "piedirosso", "pallagrello", "casavecchia", "tintilia", "montonico", "cococciola", "pecorino", "passerina", "lacrima", "vernaccia", "biancame", "bianchello", "sagrantino", "trebbiano spoletino", "grechetto", "procanico", "malvasia nera", "sangiovese", "canaiolo nero", "colorino", "mammolo", "foglia tonda", "pugnitello", "ansonica", "vermentino nero", "pollera", "ruche", "grignolino", "freisa", "pelaverga", "nascetta", "favorita", "brachetto", "vespolina", "uva rara", "chiavennasca", "marzemino", "enantio", "casetta", "durella", "vespaiola", "raboso", "verduzzo", "picolit", "schioppettino", "pignolo", "tazzelenghe", "vitovska", "terrano", "pinot meunier", "kerner", "sylvaner", "veltliner", "manzoni bianco", "incrocio manzoni", "moscato giallo", "moscato rosa", "lambrusco salamino", "lambrusco grasparossa", "lambrusco di sorbara", "ancellotta", "albana", "pignoletto", "fortana", "centesimino", "bovale", "monica", "nasco", "nuragus", "torbato", "girò", "zibibbo", "moscato di alessandria", "albanello", "nero di troia", "aleatico", "cesanese", "bellone", "greco bianco"];
const PRODUCERS = ["antinori", "marchesi antinori", "frescobaldi", "ruffino", "banfi", "castello banfi", "biondi santi", "gaja", "ceretto", "pio cesare", "fontanafredda", "prunotto", "vietti", "giacomo conterno", "conterno", "bruno giacosa", "marchesi di barolo", "tenuta san guido", "ornellaia", "allegrini", "masi", "bertani", "tommasi", "zenato", "quintarelli", "dal forno", "pieropan", "inama", "ca' del bosco", "bellavista", "berlucchi", "ferrari", "cavit", "mezzacorona", "san michele appiano", "cantina terlano", "tramin", "elena walch", "alois lageder", "jermann", "livio felluga", "schiopetto", "gravner", "radikon", "venica", "feudi di san gregorio", "mastroberardino", "terredora", "donnafugata", "planeta", "tasca d'almerita", "cusumano", "firriato", "benanti", "passopisciaro", "terre nere", "arnaldo caprai", "caprai", "lungarotti", "falesco", "fontodi", "castello di ama", "isole e olena", "felsina", "badia a coltibuono", "castello di volpaia", "querciabella", "castellare", "san felice", "col d'orcia", "casanova di neri", "il poggione", "poliziano", "avignonesi", "boscarelli", "salcheto", "le macchiole", "grattamacco", "tua rita", "petrolo", "montevertine", "valdicava", "mastrojanni", "fattoria dei barbi", "argiano", "caparzo", "ciacci piccolomini", "altesino", "lisini", "paolo scavino", "elio altare", "roberto voerzio", "luciano sandrone", "bartolo mascarello", "giuseppe rinaldi", "michele chiarlo", "braida", "la spinetta", "produttori del barbaresco", "velenosi", "umani ronchi", "garofoli", "bucci", "valentini", "emidio pepe", "masciarelli", "zaccagnini", "farnese", "tormaresca", "leone de castris", "rivera", "paternoster", "elena fucci", "librandi", "argiolas", "sella & mosca", "santadi", "capichera", "les cretes", "nino negri", "bisol", "nino franco", "mionetto", "zonin", "santa margherita", "villa sandi", "carpene malvolti", "bortolomiol", "contadi castaldi", "monte rossa", "ricci curbastro", "cavicchioli", "medici ermete", "chiarli", "ca' dei frati", "ottella", "castello di brolio", "ricasoli", "barone ricasoli", "castello di fonterutoli", "mazzei", "rocca delle macie", "melini", "cecchi", "folonari", "bolla", "sartori", "righetti", "cesari", "speri", "musella", "nicolis", "colle massari", "poggio antico", "tenuta sette ponti", "tenuta di trinoro", "castello del terriccio", "tenuta di biserno", "guado al tasso", "marchesi de frescobaldi", "villa antinori", "tignanello", "solaia", "sassicaia", "masseto", "cantina di soave", "cantina tollo", "cantina santadi", "caviro", "tavernello", "duca di salaparuta", "corvo", "florio", "pellegrino", "rallo", "colomba bianca", "settesoli", "mandrarossa", "feudo arancio", "feudo maccari", "gulfi", "valle dell'acate", "cos", "occhipinti", "tenuta delle terre nere", "pietradolce", "graci", "girolamo russo", "i vigneri", "terre di giurfo", "fattoria la rivolta", "quintodecimo", "villa matilde", "di majo norante", "cantina del notaio", "d'angelo", "vigneti del vulture", "cantine san marzano", "feudi di guagnano", "apollonio", "conti zecca", "vallone", "agricole vallone", "candido", "masseria li veli", "cantele", "polvanera", "tenute rubino", "li veli", "statti", "ippolito 1845", "iuzzolini", "sergio mottura", "casale del giglio", "fontana candida", "poggio le volpi", "cantina di montefiascone", "tabarrini", "scacciadiavoli", "perticaia", "antonelli", "colpetrone", "adanti", "di filippo", "bocale", "moretti omero", "raina", "goretti"];
APP_EXTRA.forEach(a => { if (APPELLATIONS.indexOf(a) < 0) APPELLATIONS.push(a); });
GRAPES_EXTRA.forEach(g => { if (GRAPES.indexOf(g) < 0) GRAPES.push(g); });
const DOCG = new Set(["aglianico del taburno", "aglianico del vulture superiore", "alta langa", "amarone della valpolicella", "asolo prosecco", "asti", "moscato d'asti", "barbaresco", "barbera d'asti", "barbera del monferrato superiore", "bardolino superiore", "barolo", "brachetto d'acqui", "brunello di montalcino", "carmignano", "castel del monte nero di troia", "cerasuolo di vittoria", "cesanese del piglio", "chianti", "chianti classico", "chianti rufina", "chianti colli senesi", "colli bolognesi pignoletto", "colli di conegliano", "colli euganei fior d'arancio", "colli orientali del friuli picolit", "conegliano valdobbiadene", "prosecco superiore", "conero", "dogliani", "dolcetto di diano d'alba", "dolcetto di ovada superiore", "elba aleatico passito", "erbaluce di caluso", "fiano di avellino", "franciacorta", "frascati superiore", "friularo di bagnoli", "gattinara", "gavi", "ghemme", "greco di tufo", "lison", "montecucco sangiovese", "montefalco sagrantino", "montepulciano d'abruzzo colline teramane", "morellino di scansano", "moscato di scanzo", "nizza", "offida", "oltrepo pavese metodo classico", "piave malanotte", "primitivo di manduria dolce naturale", "ramandolo", "recioto della valpolicella", "recioto di gambellara", "recioto di soave", "roero", "rosazzo", "rosso della val di cornia", "ruche di castagnole monferrato", "sforzato di valtellina", "soave superiore", "suvereto", "taurasi", "terre tollesi", "tullum", "torgiano rosso riserva", "valtellina superiore", "vermentino di gallura", "vernaccia di san gimignano", "vernaccia di serrapetrona", "verdicchio dei castelli di jesi", "verdicchio di matelica", "vino nobile di montepulciano"]);
/* parole frequenti sulle etichette: servono a correggere il nome letto male («#0SSO» → Rosso) */
const COMMON_WORDS = ["rosso","bianco","rosato","vino","riserva","superiore","classico","vigna","vigneto","vigneti","tenuta","selezione","gran","cru","collina","colline","poggio","podere","castello","villa","monte","santo","santa","marte","sole","terra","terre","antico","antica","vecchie","vecchio","nero","oro","rubino","riserva"];
const MENTIONS = ["gran selezione","riserva","superiore","classico","vigna","cru","metodo classico","spumante","frizzante","brut nature","pas dose","dosaggio zero","extra brut","extra dry","brut","millesimato","passito","vendemmia tardiva","biologico","organic","rosato","orange wine"];

/* ---- lettura imperfetta: confronto «a somiglianza» ----
   L'OCR su foto vere sbaglia lettere e spezza parole («NTEFALE \\GRANTI» = Montefalco Sagrantino, «SANGIOV!» = Sangiovese).
   Ogni parola significativa di una voce dell'elenco deve trovare un pezzo letto che le somigli abbastanza. */
function lev(a, b){
  if(a === b) return 0;
  const m = a.length, n = b.length; if(!m) return n; if(!n) return m;
  let prev = new Array(n + 1), cur = new Array(n + 1);
  for(let j = 0; j <= n; j++) prev[j] = j;
  for(let i = 1; i <= m; i++){
    cur[0] = i;
    for(let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    const t = prev; prev = cur; cur = t;
  }
  return prev[n];
}
/* quanto il pezzo letto t somiglia alla parola w (o a un suo tratto, se t è più corto): 0..1 */
function partialSim(t, w){
  if(!t || !w) return 0;
  if(t.length >= w.length) return 1 - lev(t, w) / Math.max(t.length, w.length);
  let best = Infinity;
  for(let L = Math.max(1, t.length - 1); L <= Math.min(w.length, t.length + 1); L++)
    for(let i = 0; i + L <= w.length; i++) best = Math.min(best, lev(t, w.slice(i, i + L)));
  return 1 - best / t.length;
}
/* un pezzo letto, ripulito: minuscole senza accenti, cifre scambiate per lettere corrette se la parola è quasi tutta di lettere */
function ocrToken(raw){
  let t = strip(String(raw)).replace(/[|\\/!¡]/g, 'i').replace(/\$/g, 's');
  const letters = (t.match(/[a-z]/g) || []).length, digits = (t.match(/[0-9]/g) || []).length;
  if(letters && letters >= digits * 2) t = t.replace(/0/g, 'o').replace(/1/g, 'i').replace(/5/g, 's').replace(/8/g, 'b').replace(/4/g, 'a');
  return t.replace(/[^a-z']/g, '');
}
const FILLER = new Set(['di','del','della','delle','dei','degli','d','da','e','la','le','il','lo','in','san','sant','santa','dell','dall']);
/* stesse voci, ma cercate riga per riga (una riga e quella sotto: «MONTEFALCO / SAGRANTINO»), saltando gli indirizzi:
   parole prese da righe lontane non devono comporre una denominazione che non c'è */
function fuzzyByLines(lines, list, minSim, skip, minCover){
  const rows = lines.filter(l => !(skip && skip.test(l.text))).map(l => l.text.split(/[\s,.;:·\-–]+/).map(ocrToken).filter(Boolean));
  const seen = new Map();
  for(let i = 0; i < rows.length; i++){
    fuzzyTerms(rows[i].concat(rows[i + 1] || []), list, minSim, minCover).forEach((t, k) => { if(!seen.has(t) || seen.get(t) > k) seen.set(t, k); });
  }
  return [...seen.keys()].sort((a, b) => seen.get(a) - seen.get(b) || b.length - a.length);
}
/* cerca le voci di un elenco tra i pezzi letti; restituisce le migliori, la più lunga prima */
function fuzzyTerms(tokens, list, minSim, minCover){
  minSim = minSim || 0.78; minCover = minCover || 0.5;   // minCover: quanto della parola deve coprire il pezzo letto
  const base = tokens.filter(Boolean), toks = base.filter(t => t.length >= 3);
  for(let i = 0; i + 1 < base.length; i++) if(base[i].length >= 2 && base[i + 1].length >= 1 && base[i].length + base[i + 1].length <= 14) toks.push(base[i] + base[i + 1]);
  const found = [];
  list.forEach(term => {
    const words = strip(term).replace(/[^a-z' ]/g, ' ').split(/[\s']+/).filter(w => w.length >= 3 && !FILLER.has(w));
    if(!words.length) return;
    let score = 0;
    for(const w of words){
      let best = 0;
      /* parole corte: solo uguali, o con UNA lettera in più (errore tipico: «ORrCIA»); mai una lettera diversa (Pieve ≠ Piave) */
      if(w.length <= 5){
        if(toks.some(t => t === w || (t.length === w.length + 1 && lev(t, w) === 1))) { score += w.length; continue; }
        return;
      }
      for(const t of toks){
        if(t.length < Math.max(3, Math.ceil(w.length * minCover))) continue;
        const sim = partialSim(t, w);
        if(sim > best) best = sim;
        if(best === 1) break;
      }
      if(best < (w.length <= 5 ? 0.99 : w.length <= 7 ? Math.max(minSim, 0.83) : minSim)) return;
      score += Math.pow(best, 4) * w.length;    // conta più la somiglianza che la lunghezza («ORCIA» è Orcia, non Torgiano)
    }
    found.push({ term, score });
  });
  return found.sort((a, b) => b.score - a.score).map(f => f.term);
}

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
    .filter(l => l.text.replace(/[^A-Za-zÀ-ÿ0-9]/g, '').length >= 2)
    /* righe lette con poca fiducia e senza parole vere: rumore della foto (stoffe, legno, riflessi) */
    .filter(l => !(l.conf > 0 && l.conf < 45 && !/[A-Za-zÀ-ÿ]{4,}/.test(l.text)))
    /* anni scritti con lettere al posto delle cifre: «2O2O» → 2020 */
    .map(l => ({ ...l, text: l.text.replace(/\b([12][0-9OoIl]{3})\b/g, (m) => /^(19|20)\d\d$/.test(m.replace(/[Oo]/g, '0').replace(/[Il]/g, '1')) ? m.replace(/[Oo]/g, '0').replace(/[Il]/g, '1') : m) }));
  const flat = L.map(l => l.text).join('\n');
  const tokens = flat.split(/[\s,.;:·\-–]+/).map(ocrToken).filter(Boolean);
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
    /* se la riga, letta male, somiglia a una denominazione nota, si usa il nome giusto («ORrCIA» → Orcia) */
    const restTk = rest.split(/\s+/).map(ocrToken).filter(Boolean);
    const sig = restTk.filter(t => t.length >= 3 && !FILLER.has(t)).length;
    const fzRest = (restTk.length && restTk.length <= 4 ? fuzzyTerms(restTk, APPELLATIONS, 0.8) : [])
      .filter(term => strip(term).split(/[\s']+/).filter(w => w.length >= 3 && !FILLER.has(w)).length >= sig);   // il nome noto deve coprire tutta la scritta
    if(fzRest.length && (!r.denominazione || strip(fzRest[0]).length >= strip(r.denominazione).length)) r.denominazione = cap(fzRest[0]);
    else if(rest.length >= 4 && rest.split(' ').length <= 6 && (!r.denominazione || strip(rest).includes(strip(r.denominazione)))) r.denominazione = /[a-zà-ÿ]/.test(rest) && !/[A-Z]{2,}[a-z][A-Z]/.test(rest) ? rest : cap(rest.toLowerCase());
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
  const alcRe = /(?<![\d.,])(\d{1,2}(?:\s?[.,]\s?\d{1,2})?)\s?%\s?(vol|alc)?/gi; let am, alc = null;
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

  // Denominazione letta male: a somiglianza
  if(!r.denominazione){
    const fz = fuzzyByLines(L, APPELLATIONS, 0.8, BOTTLED_LINE);
    if(fz.length) r.denominazione = cap(fz[0]);
  }
  // Tipologia: una DOCG nota lo è comunque; poi dalle frasi spezzate («… ORIGINE CONTROLLATA», «… E GARANTITA»)
  if(r.denominazione && DOCG.has(strip(r.denominazione)) && r.tipologia !== 'DOCG') r.tipologia = 'DOCG';
  if(!r.tipologia){
    if(/garantit/.test(norm) || tokens.some(t => /^docg$/.test(t))) r.tipologia = 'DOCG';
    else if(/origine\s+contr|controllat/.test(norm) || tokens.some(t => /^do[cs]$/.test(t))) r.tipologia = 'DOC';
    else if(/geografica\s+tip/.test(norm) || tokens.some(t => t === 'igt')) r.tipologia = 'IGT';
  }

  // Vitigni e menzioni
  let grapes = findTerms(norm, GRAPES);
  if(!grapes.length) grapes = fuzzyByLines(L, GRAPES, 0.82, BOTTLED_LINE, 0.65).slice(0, 2);
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
    const fz = fuzzyByLines(L, PRODUCERS, 0.82, null, 0.75);
    if(fz.length) r.produttore = cap(fz[0]);
  }
  /* «AGRICOLA» (o Tenuta, Cantina…) da solo su una riga: il nome della cantina è la riga sotto */
  if(!r.produttore){
    const solo = /^(azienda agricola|agricola|az\.?\s?agr\.?|societa agricola|tenuta|tenute|cantina|cantine|fattoria|podere|cascina|masseria|castello)$/i;
    for(let i = 0; i < L.length - 1 && !r.produttore; i++){
      if(solo.test(strip(L[i].text).replace(/[^a-z .]/g, '').trim())){
        const next = L[i + 1].text.replace(/[^A-Za-zÀ-ÿ' ]/g, ' ').replace(/\s+/g, ' ').trim();
        if(next.length >= 3) r.produttore = cap(next.toLowerCase());
      }
    }
  }
  if(!r.produttore){
    const kw = /\b(azienda agricola|az\.?\s?agr\.?|societa agricola|soc\.?\s?agr\.?|tenut[ae]|cantin[ae]|castello|fattoria|podere|marches[ie]|conti|cascina|villa|domaine|chateau|bodegas?|weingut|maison|baglio|masseria|abbazia|feudi?)\b/;
    const hits = L.filter(l => kw.test(strip(l.text))).sort((a,b) => b.h - a.h);
    if(hits.length) r.produttore = hits[0].text.slice(0, 70);
  }

  // Testo più grande (spesso nome del vino o del produttore); servono le misure delle righe
  const prodN = strip(r.produttore || '');
  const knownLine = l => { const tk = l.text.split(/\s+/).map(ocrToken).filter(Boolean); return fuzzyTerms(tk, APPELLATIONS, 0.8).length || fuzzyTerms(tk, GRAPES, 0.85, 0.65).length || (prodN && fuzzyTerms(tk, [prodN], 0.8).length); };
  if(L.some(l => l.h > 0)){
    const known = l => { const tk = l.text.split(/\s+/).map(ocrToken).filter(Boolean); return fuzzyTerms(tk, APPELLATIONS, 0.8).length || fuzzyTerms(tk, GRAPES, 0.85, 0.65).length || (prodN && fuzzyTerms(tk, [prodN], 0.8).length); };
    const cand = L.filter(l => !/^\W*\d{4}\W*$/.test(l.text) && /[A-Za-zÀ-ÿ]{3,}/.test(l.text) && !(prodN && strip(l.text) === prodN) && !/\b(DOCG|DOC|IGT|IGP|DOP|vol|ml)\b/i.test(l.text)
      && !(l.conf > 0 && l.conf < 62) && (() => { const ws = l.text.split(/\s+/).map(ocrToken).filter(Boolean); return ws.length && ws.filter(w => w.length >= 3).length * 2 > ws.length && ws.some(w => w.length >= 4); })() && !/^(agricola|azienda agricola|tenuta|cantina|italia|italy)$/i.test(strip(l.text).trim()) && !known(l));
    const maxH = Math.max(0, ...cand.map(l => l.h));
    /* tra le scritte grandi, quelle lette uguali da più passaggi (le altre sono spesso letture sbagliate della stessa) */
    let bigL = cand.filter(l => l.h >= maxH * 0.85);
    const wide = cand.filter(l => l.h >= maxH * 0.6), maxHits = Math.max(1, ...wide.map(l => l.hits || 1));
    if(maxHits > 1){
      /* una scritta grande confermata da più letture vale più di una enorme letta una volta sola */
      const conf = wide.filter(l => (l.hits || 1) >= 2), top = Math.max(...conf.map(l => l.h));
      bigL = conf.filter(l => l.h >= top * 0.85);
    }
    const big = bigL.slice(0, 2).map(l => l.text).join(' ');
    if(big && big !== r.produttore) r.testoPrincipale = big;
  }

  // Senza misure delle righe (testo corretto a mano): il nome del vino è spesso la riga in maiuscolo, corta, senza numeri né diciture
  if(!r.testoPrincipale){
    const skip = /(\bdoc|\bigt|\bigp|\bdop|vol|\bml\b|\bcl\b|imbottigliat|prodott|bottled|contiene|solfiti|sulphites|italia|italy|product of|vino\b)/i;
    const up = L.find(l => /[A-ZÀ-Þ]{3,}/.test(l.text) && l.text === l.text.toUpperCase() && l.text.length >= 5 && l.text.length <= 40 && !/\d/.test(l.text) && !skip.test(l.text) && strip(l.text) !== strip(r.produttore || '') && !knownLine(l) && !(l.conf > 0 && l.conf < 62));
    if(up) r.testoPrincipale = up.text;
  }

  r.testo = text.trim();
  return r;
}

/* il nome letto con errori tipici: simboli ai bordi, cifre al posto di lettere, parole frequenti riconosciute */
function cleanName(raw){
  const words = String(raw || "").replace(/[\\|_#*~^`“”"«»©®(){}\[\]<>=+]/g, " ").split(/\s+/).filter(Boolean);
  const out = words.map(w => {
    const tk = ocrToken(w);
    if(!tk) return "";
    if(tk.length >= 3){
      let best = null, bs = 0;
      COMMON_WORDS.forEach(c => { const sv = tk.length >= c.length - 1 ? 1 - lev(tk, c) / Math.max(tk.length, c.length) : 0; if(sv > bs){ bs = sv; best = c; } });
      if(best && bs >= 0.75 && tk !== best) return best;
    }
    return /[a-zà-ÿ]/i.test(w) ? (/[0-9]/.test(w) ? tk : w.replace(/[^A-Za-zÀ-ÿ'’.-]/g, "")) : "";
  }).filter(x => x && x.replace(/[^A-Za-zÀ-ÿ]/g, "").length >= 2 || ["di","e","d'"].indexOf(String(x).toLowerCase()) >= 0);
  return out.join(" ").trim();
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
    let cn = cleanName(r.testoPrincipale);
    const ws = cn.split(/\s+/), up = ws.filter(w => w.length >= 2 && w === w.toUpperCase() && /[A-Z]/.test(w)).length;
    if (up && up * 2 >= ws.length) cn = cn.toUpperCase();      // per lo più maiuscole: tutto maiuscolo, poi maiuscole per bene
    const n = titleCase(clean(cn, 60));
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

return { parseLabel, toWineFields, TIPI, APPELLATIONS, GRAPES, PRODUCERS, fuzzyTerms, partialSim, ocrToken };
});
