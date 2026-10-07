#!/usr/bin/env node
/* Assembla i due mockup autonomi a partire dai sorgenti in design/src/ e dai token.
   Uso: node design/build.js        (nessuna dipendenza; non serve per usare i file generati) */
const fs = require('fs');
const path = require('path');
const dir = __dirname;
const read = (p) => fs.readFileSync(path.join(dir, p), 'utf8');
const common = read('src/common.js');
for (const d of ['a', 'b']) {
  if (!fs.existsSync(path.join(dir, `src/${d}.html`))) continue;
  const html = read(`src/${d}.html`)
    .replace('/*@TOKENS*/', () => read(`tokens-${d}.css`))
    .replace('/*@CSS*/', () => read(`src/${d}.css`))
    .replace('/*@COMMON*/', () => common)
    .replace('/*@JS*/', () => read(`src/${d}.js`));
  fs.writeFileSync(path.join(dir, `direzione-${d}.html`), html);
  console.log(`direzione-${d}.html  ${(html.length / 1024).toFixed(0)} KB`);
}
