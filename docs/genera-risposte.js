/* Genera docs/esempi/risposte.json: risposte vere dell'API, ottenute eseguendo uno
   scenario sul server locale. La guida PDF le mostra così come sono.
     node docs/genera-risposte.js */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const dev = require("../test/helpers/dev-server");
const jwt = require("../api/_jwt");

(async () => {
  const d = await dev.start({ secret: "a".repeat(64), origins: ["https://club.example"] });
  const now = () => Math.floor(Date.now() / 1000);
  const token = o => jwt.sign(Object.assign({ iss: "demo", sub: "u1", name: "Anna", team: "giovedi", role: "member", jti: "j-" + crypto.randomBytes(6).toString("hex"), exp: now() + 300 }, o), d.secret);
  const emb = async (body, s) => (await fetch(d.url + "/api/embed", { method: "POST", headers: Object.assign({ "Content-Type": "application/json" }, s ? { Authorization: "Bearer " + s } : {}), body: JSON.stringify(body) })).json();
  const login = async o => (await emb({ op: "session", token: token(o) })).session;
  const api = (p, o) => fetch(d.url + "/api/v1/" + p, Object.assign({ headers: { Authorization: "Bearer " + d.apiKey } }, o));

  const org = await login({ sub: "olga", name: "Olga", role: "organizer" });
  const t = (await emb({ op: "tasting.create", name: "Serata di ottobre" }, org)).tasting;
  const vini = [["Barolo Cannubi", "Poderi Rivalta", "2019"], ["Etna Rosso Contrada Rampante", "Tenuta delle Sciare", "2021"], ["Verdicchio Classico", "Casa Marchigiana", "2022"]];
  const wines = [];
  for (const [name, producer, vintage] of vini) wines.push((await emb({ op: "wine.add", tasting: t.id, wine: { name, producer, vintage } }, org)).wine);
  const voti = [[["u1", [85, 92, 88]], ["u2", [80, 85, 82]], ["u3", [90, 88, 94]]], [["u1", [75, 70, 72]], ["u2", [78, 80, 76]]], [["u1", [82, 80, 84]]]];
  for (let i = 0; i < wines.length; i++) {
    for (const [u, [a, b, c]] of voti[i]) {
      const s = await login({ sub: u, name: u });
      await emb({ op: "vote", tasting: t.id, wine: wines[i].id, mode: "smart", giudizi: { occhio: a, naso: b, bocca: c } }, s);
    }
  }
  await emb({ op: "tasting.status", tasting: t.id, status: "closed" }, org);

  const out = {
    tastings: await (await api("tastings?status=closed")).json(),
    results: await (await api("tastings/" + t.id + "/results")).json(),
    csv: await (await api("tastings/" + t.id + "/results?format=csv")).text(),
    deleteUser: await (await api("users/u3", { method: "DELETE" })).json(),
    errUnauthorized: await (await fetch(d.url + "/api/v1/tastings")).json(),
    errNotFound: await (await api("tastings/nonesiste/results")).json(),
    session: (({ session, ...r }) => r)(await emb({ op: "session", token: token({ sub: "x1", role: "organizer" }) })),
    errTokenUsed: await (async () => { const tk = token({ sub: "x2" }); await emb({ op: "session", token: tk }); return emb({ op: "session", token: tk }); })()
  };
  fs.writeFileSync(path.join(__dirname, "esempi", "risposte.json"), JSON.stringify(out, null, 2) + "\n");
  console.log("scritto docs/esempi/risposte.json");
  await d.stop();
})().catch(e => { console.error(e); process.exit(1); });
