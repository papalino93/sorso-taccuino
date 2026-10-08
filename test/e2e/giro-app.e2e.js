const { chromium } = require(require("child_process").execSync("npm root -g").toString().trim() + "/playwright");
/* Giro di verifica 1.7: card di Impostazioni, tipologie alla cieca, copia importata, annata.
     node test/e2e/giro-app.e2e.js   (app su http://localhost:8765) */
(async()=>{const b=await chromium.launch({executablePath:"/opt/pw-browsers/chromium"});let f=0;const ok=(c,m)=>{console.log((c?"OK   ":"FAIL ")+m);if(!c)f++;};
const mk=async(vp,lang)=>{const c=await b.newContext({viewport:vp});const p=await c.newPage();const errs=[];p.on("pageerror",e=>errs.push(e.message));
await p.addInitScript(l=>{localStorage.setItem("sorso.auth.skipped","1"); if(l) localStorage.setItem("sorso-lang",l);},lang||"");await p.goto("http://localhost:8765/");await p.waitForTimeout(700);return {p,errs};};
for (const w of [1100,1366,1920]) { const {p}=await mk({width:w,height:900}); await p.click('#nav [data-tab=settings]'); await p.waitForTimeout(400);
 const over=await p.evaluate(()=>{const a=document.querySelector("#exportBtn").getBoundingClientRect(),g=document.querySelector("#guideLink");const e=document.elementFromPoint(a.left+a.width/2,a.top+a.height/2);return e&&(e.id==="exportBtn")&&!!e;});
 ok(over, "PC "+w+": «Salva copia» raggiungibile"); 
 const ov2=await p.evaluate(()=>{const A=[...document.querySelectorAll(".set-grid > .card")].map(c=>c.getBoundingClientRect());let o=false;for(let i=0;i<A.length;i++)for(let j=i+1;j<A.length;j++){const a=A[i],c=A[j];if(a.left<c.right-1&&c.left<a.right-1&&a.top<c.bottom-1&&c.top<a.bottom-1)o=true;}return o;}); ok(!ov2,"PC "+w+": nessuna card sovrapposta");
 const tips=await p.evaluate(()=>[...document.querySelectorAll("#vmodeSwitch button")].map(x=>x.scrollWidth<=x.clientWidth+1)); ok(tips.every(Boolean),"PC "+w+": pulsanti «Come voti» senza sbordare");}
for (const [w,lang] of [[1100,"en"]]) { const {p}=await mk({width:w,height:900},lang); await p.click('#nav [data-tab=settings]'); await p.waitForTimeout(300);
 ok(await p.evaluate(()=>[...document.querySelectorAll("#vmodeSwitch button")].every(x=>x.scrollWidth<=x.clientWidth+1)),"EN 1100: pulsanti OK");}
for (const w of [320,390,1100]) { const {p}=await mk({width:w,height:900}); const tab=w>=1100?'#nav [data-tab=blind]':'[data-tab=blind]'; await p.click(tab); await p.waitForTimeout(400);
 const t=await p.evaluate(()=>[...document.querySelectorAll("#pane-blind .type-chip-btn")].filter(x=>x.offsetParent).map(x=>x.scrollWidth<=x.clientWidth+0.5)); ok(t.length>0&&t.every(Boolean),"cieca "+w+": «Spumante» intero ("+t.length+")");}
{ const {p,errs}=await mk({width:390,height:900});
 const r=await p.evaluate(()=>{const e={score:80,nome:"X",thumb:'x" onerror="window.__xss=1" a="'};const n=normalizeEntry(e);return n&&n.thumb===undefined;}); ok(r,"thumb non valido scartato");
 const r2=await p.evaluate(()=>[annataValida("2018"),annataValida("nv"),annataValida("0000"),annataValida("9999"),annataValida("1066"),annataValida("20x")]); ok(JSON.stringify(r2)==="[true,true,false,false,false,false]","annata: "+JSON.stringify(r2)); ok(errs.length===0,"nessun errore JS "+errs);}
await b.close();console.log(f?f+" FALLITI":"TUTTO OK");process.exit(f?1:0);})().catch(e=>{console.error(e);process.exit(1);});
