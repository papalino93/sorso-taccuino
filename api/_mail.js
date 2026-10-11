const { HttpError } = require("./_http");

/* Invio di mail (per ora solo gli inviti alle cerchie). Sorso non ha un server di posta: usa un
   servizio esterno, scelto da variabili d'ambiente del progetto Vercel. Senza nessuna variabile le
   mail NON partono e l'app dice di mandare il link a mano.

     Resend  (https://resend.com)   RESEND_API_KEY   — per mandare a chiunque serve un dominio verificato
     Brevo   (https://brevo.com)    BREVO_API_KEY    — basta verificare l'indirizzo del mittente
     MAIL_FROM   mittente, per esempio:  Sorso <inviti@tuodominio.it>   (con Brevo: un mittente verificato)

   Nessuna libreria: due chiamate HTTP. La chiave non finisce mai in un messaggio d'errore o nei log. */

const TIMEOUT_MS = 8000;

function config() {
  const from = String(process.env.MAIL_FROM || "").trim();
  const m = /^(?:"?([^"<]*?)"?\s*)?<([^<>\s]+@[^<>\s]+)>$/.exec(from) || /^()([^<>\s]+@[^<>\s]+)$/.exec(from);
  const sender = m ? { name: (m[1] || "Sorso").trim() || "Sorso", email: m[2] } : null;
  if (process.env.RESEND_API_KEY && sender) return { provider: "resend", key: process.env.RESEND_API_KEY, sender, from: sender.name + " <" + sender.email + ">" };
  if (process.env.BREVO_API_KEY && sender) return { provider: "brevo", key: process.env.BREVO_API_KEY, sender };
  return null;
}
const enabled = () => !!config();

async function post(url, headers, body) {
  const ctrl = typeof AbortController === "function" ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), TIMEOUT_MS) : null;
  try {
    const res = await fetch(url, { method: "POST", headers: Object.assign({ "Content-Type": "application/json" }, headers), body: JSON.stringify(body), signal: ctrl ? ctrl.signal : undefined });
    if (!res.ok) throw new Error("http_" + res.status);
    return true;
  } finally { if (timer) clearTimeout(timer); }
}

/* { to, subject, text, html } → { sent: true } oppure { sent: false, reason } ; non lancia mai */
async function send(msg) {
  const c = config();
  if (!c) return { sent: false, reason: "not_configured" };
  try {
    if (c.provider === "resend") {
      await post("https://api.resend.com/emails", { Authorization: "Bearer " + c.key }, { from: c.from, to: [msg.to], subject: msg.subject, text: msg.text, html: msg.html });
    } else {
      await post("https://api.brevo.com/v3/smtp/email", { "api-key": c.key, accept: "application/json" }, { sender: c.sender, to: [{ email: msg.to }], subject: msg.subject, textContent: msg.text, htmlContent: msg.html });
    }
    return { sent: true, provider: c.provider };
  } catch (e) {
    return { sent: false, reason: "error", detail: String(e && e.message || e).replace(/[A-Za-z0-9_\-]{20,}/g, "…") };
  }
}

const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const ROLE_IT = { member: "Membro", admin: "Amministratore" };

/* L'invito: oggetto fisso (il nome della cerchia lo sceglie chi invita e non deve finire nell'oggetto);
   nome della cerchia e di chi invita nel testo, ripuliti e senza HTML. */
function inviteMail({ to, circleName, byName, role, link, days }) {
  const circle = String(circleName || "").slice(0, 60), by = String(byName || "Un amico").slice(0, 60), ruolo = ROLE_IT[role] || "Membro";
  const subject = "Hai un invito su Sorso";
  const text = by + " ti ha invitato nella cerchia «" + circle + "» su Sorso, il taccuino di degustazione, come " + ruolo + ".\n\n" +
    "Per entrare apri questo link e accedi con Google usando questo indirizzo mail (" + to + "):\n" + link + "\n\n" +
    "L'invito vale " + days + " giorni e si usa una volta sola.\n\n" +
    "Non conosci questa persona o non te lo aspettavi? Ignora questo messaggio: non succede niente se non apri il link.";
  const html = '<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#1a1a1a;max-width:520px">' +
    "<p><b>" + esc(by) + "</b> ti ha invitato nella cerchia <b>«" + esc(circle) + "»</b> su Sorso, il taccuino di degustazione, come " + esc(ruolo) + ".</p>" +
    '<p><a href="' + esc(link) + '" style="display:inline-block;background:#8c1d3f;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:999px;font-weight:bold">Apri l\'invito</a></p>' +
    "<p>Accedi con Google usando questo indirizzo mail (" + esc(to) + "). L'invito vale " + days + " giorni e si usa una volta sola.</p>" +
    '<p style="color:#666;font-size:13px">Se il pulsante non funziona, copia questo link nel browser:<br>' + esc(link) + "</p>" +
    '<p style="color:#666;font-size:13px">Non conosci questa persona o non te lo aspettavi? Ignora questo messaggio: non succede niente se non apri il link.</p></div>';
  return { to, subject, text, html };
}

module.exports = { send, enabled, config, inviteMail };
