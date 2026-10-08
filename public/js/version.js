/* Numero di versione e data dell'ultimo aggiornamento: l'unica fonte. La leggono il piè di pagina
   dell'app, lo spazio di team e i test (che la confrontano con package.json). */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.SORSO_VERSION = factory();
})(typeof self !== "undefined" ? self : this, function () {
  return { version: "1.7.0", date: "2026-10-08" };
});
