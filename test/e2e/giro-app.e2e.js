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
{ /* nome del taccuino: si cambia da Impostazioni, si conserva, si ripristina */
 const {p,errs}=await mk({width:390,height:900});
 await p.click("#brandBtn"); await p.waitForTimeout(500);
 ok(await p.locator("#pane-settings").isVisible(), "toccando il nome in alto si aprono le Impostazioni");
 ok(await p.evaluate(()=>document.activeElement.id==="brandNameInput"), "il campo del titolo è già selezionato");
 await p.fill("#brandNameInput","Sorso di vino"); await p.fill("#brandOwnerInput","Mario Rossi");
 ok((await p.textContent("#brandPreviewName"))==="Sorso di vino" && /Mario Rossi/.test(await p.textContent("#brandPreviewTag")), "anteprima mentre si scrive");
 await p.click("#brandSaveBtn"); await p.waitForTimeout(400);
 ok((await p.textContent("#brandName"))==="Sorso di vino" && /Mario Rossi/.test(await p.textContent("#brandOwner")), "il nome compare in alto");
 ok((await p.title())==="Sorso di vino", "titolo della scheda del browser");
 await p.reload(); await p.waitForTimeout(900);
 ok((await p.textContent("#brandName"))==="Sorso di vino", "dopo la ricarica il nome resta");
 await p.click("#settingsBtn"); await p.waitForTimeout(300);
 ok((await p.inputValue("#brandOwnerInput"))==="Mario Rossi", "i campi mostrano il nome salvato");
 await p.click("#brandResetBtn"); await p.waitForTimeout(300);
 ok((await p.textContent("#brandName"))==="Sorso" && (await p.inputValue("#brandNameInput"))==="", "«Ripristina» torna a Sorso");
 ok(!(await p.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth)), "nessun overflow orizzontale");
 ok(errs.length===0,"nessun errore JS "+errs);
 const long=await mk({width:320,height:900}); await long.p.click("#settingsBtn"); await long.p.waitForTimeout(300);
 await long.p.fill("#brandNameInput","W".repeat(24)); await long.p.fill("#brandOwnerInput","Q".repeat(32)); await long.p.click("#brandSaveBtn"); await long.p.waitForTimeout(300);
 ok(!(await long.p.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth)), "nome lungo a 320 px: nessun overflow");
 const pc=await mk({width:1366,height:900}); await pc.p.click('#nav [data-tab=settings]'); await pc.p.waitForTimeout(300);
 const ov=await pc.p.evaluate(()=>{const A=[...document.querySelectorAll(".set-grid > .card")].map(c=>c.getBoundingClientRect());let o=false;for(let i=0;i<A.length;i++)for(let j=i+1;j<A.length;j++){const a=A[i],c=A[j];if(a.left<c.right-1&&c.left<a.right-1&&a.top<c.bottom-1&&c.top<a.bottom-1)o=true;}return o;});
 ok(!ov,"PC: carta del nome senza sovrapposizioni");
}
{ /* in inglese il vocabolario di degustazione è tradotto a video, ma si salva in italiano */
 const {p,errs}=await mk({width:1366,height:900},"en");
 await p.click('#nav [data-tab=new]'); await p.waitForTimeout(300);
 await p.click('[data-mode="completa"], #modeTopWrap button:has-text("Full sheet")').catch(()=>{}); await p.waitForTimeout(300);
 const chips=await p.evaluate(()=>[...document.querySelectorAll("#typeChips .type-chip-btn")].map(x=>x.textContent.trim()));
 ok(JSON.stringify(chips)==='["Red","White","Rosé","Sparkling","Passito"]',"tipologie in inglese: "+chips);
 const opts=await p.evaluate(()=>[...document.querySelectorAll("select[data-skey$=limpidezza] option")].map(o=>[o.value,o.textContent]));
 ok(opts.length>=5 && opts.some(o=>o[0]==="Limpido"&&o[1]==="Clear"), "limpidezza: valore italiano, etichetta inglese "+JSON.stringify(opts.slice(0,2)));
 if(opts.length){ await p.selectOption("select[data-skey$=limpidezza]","Cristallino"); await p.waitForTimeout(200);
  ok(await p.evaluate(()=>S.limpidezza)==="Cristallino","la scelta si salva in italiano"); }
 const body=await p.evaluate(()=>document.body.innerText);
 ok(!/Velato|Limpido|Abbastanza consistente|Rosso rubino|Fruttato/.test(body.replace(/Etna Rosso/g,"")),"nessuna parola di degustazione in italiano nella scheda");
 ok(errs.length===0,"nessun errore JS "+errs);
}
await b.close();console.log(f?f+" FALLITI":"TUTTO OK");process.exit(f?1:0);})().catch(e=>{console.error(e);process.exit(1);});
