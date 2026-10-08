#!/usr/bin/env python3
"""Guida breve per il partner: come far attivare l'API e lo spazio di team, passo per passo.
Riusa stili e funzioni di build-guida.py (stessa grafica) e la versione di public/js/version.js.
Uso:  python3 docs/build-attivazione.py"""
import importlib.util
import os

from reportlab.lib.units import cm
from reportlab.platypus import PageBreak, Spacer

AQUI = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("guida", os.path.join(AQUI, "build-guida.py"))
G = importlib.util.module_from_spec(spec)
spec.loader.exec_module(G)

USCITA = os.path.join(AQUI, "guida-attivazione-api.pdf")
BASE = G.BASE
P, tabella, riquadro, lista, codice = G.P, G.tabella, G.riquadro, G.lista, G.codice


class Doc(G.Doc):
    titolo_piede = "Sorso · Attivazione dell'API e dello spazio di team"


def main():
    story = [Spacer(1, 2.2 * cm), P("Sorso", "sot"), P("Come attivare l'API e lo spazio di team", "tit"),
             P("Una guida breve per chi gestisce il sito partner: cosa ci devi mandare, cosa ricevi e come provare che tutto funziona prima di andare online.", "corpo"),
             Spacer(1, 0.6 * cm),
             tabella([["Versione di Sorso", "%s — ultimo aggiornamento: %s" % (G.VERSIONE, G.DATA)], ["Indirizzo di Sorso", BASE],
                      ["Tempo necessario", "circa mezza giornata di lavoro per chi sviluppa il sito; l'attivazione da parte nostra richiede pochi minuti"]],
                     [5.2, 11.8], intestazione=False),
             Spacer(1, 0.5 * cm)]

    story += [P("In breve: quattro passi", "h1x")]
    story += [tabella([["Passo", "Chi", "Cosa"],
                       ["1. Richiesta", "Tu", "Ci mandi i dati del tuo sito (elenco qui sotto)."],
                       ["2. Attivazione", "Noi", "Creiamo il tuo spazio e ti consegniamo ID partner, segreto di firma e chiave API, in due invii separati."],
                       ["3. Prova", "Tu", "Provi la chiave con un comando e apri lo spazio da una pagina di prova."],
                       ["4. Messa online", "Tu + noi", "Spunti l'elenco di verifica; se serve aggiustiamo domini, colori e lingua."]],
                      [3, 2.6, 11.4]), Spacer(1, 6)]

    story += [P("Passo 1 — cosa ci devi mandare", "h1"),
              tabella([["Dato", "Esempio e note"],
                       ["Nome del sito o del club", "«Enoteca Ruggeri». Compare come titolo in alto nello spazio."],
                       ["Domini che incorporeranno lo spazio", "Con <font name='Mono'>https://</font>, senza percorso: <font name='Mono'>https://www.enotecaruggeri.example</font>. Se hai un sito di prova e uno vero, mandaci entrambi. Da qualunque altro dominio il browser blocca la pagina."],
                       ["Lingua", "Italiano, inglese, o scelta per utente (nel token)."],
                       ["Logo e colori", "Indirizzo <font name='Mono'>https</font> di un'immagine; colore d'accento, sfondo e testo in formato <font name='Mono'>#rrggbb</font>. I colori vengono corretti da noi se il testo non fosse leggibile."],
                       ["Modalità di voto", "Voto rapido (occhio, naso, bocca da 50 a 100), scheda completa, o entrambe; quale proporre per prima. Se vuoi, puoi decidere la modalità <b>utente per utente</b> col claim facoltativo <font name='Mono'>mode</font> nel token (<font name='Mono'>smart</font> o <font name='Mono'>full</font>)."],
                       ["Ruoli e gruppi", "Chi è organizzatore sul tuo sito e come raggruppi le persone in team (stesso team = stesse degustazioni)."],
                       ["Chi riceve le credenziali", "Un riferimento tecnico, con un canale sicuro (non l'email in chiaro)."]],
                      [5, 12]), Spacer(1, 6)]

    story += [P("Passo 2 — cosa ricevi", "h1"),
              tabella([["Credenziale", "A cosa serve", "Dove tenerla"],
                       ["<b>ID partner</b><br/><font name='Mono'>enoteca-ruggeri</font>", "Identifica il tuo sito. Va nell'indirizzo dell'iframe e nel claim <font name='Mono'>iss</font> del token.", "Non è segreto."],
                       ["<b>Segreto di firma</b><br/>64 caratteri", "Con questo il <b>tuo server</b> firma il token di ogni utente (HS256).", "Solo sul server, in una variabile d'ambiente. Mai nel browser, mai nel codice."],
                       ["<b>Chiave API</b><br/><font name='Mono'>sk_…</font>", "Legge i risultati dal tuo server (sola lettura).", "Solo sul server. Se pensi sia stata esposta, chiedi subito la rotazione (vale entro 60 secondi)."]],
                      [4.2, 7.4, 5.4]),
              riquadro("<b>Il segreto e la chiave ti vengono mostrati una volta sola</b> e li riceverai in due invii separati. Conservali subito in un gestore di segreti. Se li perdi non si possono rileggere: se ne genera una coppia nuova."), Spacer(1, 4)]

    story += [P("Passo 3 — prova in cinque minuti", "h1"),
              P("<b>Prova A: la chiave API.</b> Da un terminale del tuo server (sostituisci la chiave):"),
              codice("curl -sS -H 'Authorization: Bearer sk_ID_PARTNER_…' \\\n  %s/api/v1/tastings" % BASE),
              P("Se è tutto a posto la risposta è un elenco, all'inizio vuoto: <font name='Mono'>{\"tastings\":[]}</font>. Con <font name='Mono'>401</font> la chiave non è giusta o è stata ruotata."),
              P("<b>Prova B: lo spazio di team.</b> Firma un token con uno degli esempi della guida completa (Node, Python o PHP, in <font name='Mono'>docs/esempi/</font>) e apri questa pagina in un iframe del tuo sito di prova. Il token va <b>dopo il #</b>:"),
              codice("%s/embed?p=ID_PARTNER#token=TOKEN_FIRMATO" % BASE),
              P("Un utente con <font name='Mono'>role: \"organizer\"</font> vede «Nuova degustazione»; uno con <font name='Mono'>member</font> no. Il token è monouso e dura al massimo 15 minuti: generane uno nuovo a ogni caricamento della pagina."),
              Spacer(1, 4)]

    story += [P("Se qualcosa non va", "h2"),
              tabella([["Cosa vedi", "Causa probabile", "Cosa fare"],
                       ["Iframe vuoto o errore del browser", "Il dominio della pagina non è tra quelli registrati.", "Mandaci il dominio esatto."],
                       ["«L'accesso non è valido o è scaduto»", "Token firmato col segreto sbagliato, scaduto o con campi mancanti.", "Controlla <font name='Mono'>iss</font>, <font name='Mono'>sub</font>, <font name='Mono'>team</font>, <font name='Mono'>jti</font>, <font name='Mono'>exp</font> (guida completa, capitolo 3)."],
                       ["«Questo accesso è già stato usato»", "Lo stesso token è arrivato due volte (pagina in cache, anteprima automatica).", "Un token nuovo a ogni caricamento; niente cache sulla pagina."],
                       ["401 dall'API", "Chiave sbagliata o ruotata.", "Verifica la chiave; se serve, chiedine una nuova."]],
                      [4.6, 6.4, 6]), Spacer(1, 4)]

    story += [P("Passo 4 — elenco di verifica prima di andare online", "h1")]
    voci = ["ID partner, segreto e chiave sono salvati solo sul server.", "L'iframe si apre dai tuoi domini e viene bloccato da altri.",
            "Il token è generato a ogni caricamento, e la pagina non è in cache.", "Un partecipante vota e vede la media del team solo dopo.",
            "Un organizzatore crea una degustazione, aggiunge vini e la chiude.", "La lettura dei risultati dal server funziona (JSON e CSV).",
            "Sai chi, da te, gestisce le richieste di cancellazione dei dati degli utenti (c'è l'API apposta).",
            "Scarichi il CSV dei risultati al termine di ogni degustazione: il servizio è gratuito e non ha garanzia di continuità."]
    story += [tabella([["", "Verifica"]] + [["☐", v] for v in voci], [1.1, 15.9]), Spacer(1, 6)]
    story += [riquadro("<b>Dopo l'attivazione</b> puoi chiederci in qualsiasi momento: un nuovo dominio, un cambio di colori o lingua, la rotazione del segreto o della chiave, la sospensione dello spazio. "
                       "Per tutti i dettagli tecnici (campi del token, codici d'errore, limiti, privacy) c'è la <b>guida all'integrazione</b> completa.")]
    doc = Doc(USCITA, pagesize=G.A4, title="Sorso — Attivazione dell'API", author="Sorso", subject="Guida di attivazione per il partner",
              leftMargin=2 * cm, rightMargin=2 * cm, topMargin=2 * cm, bottomMargin=2 * cm)
    doc.build(story)
    print("scritto", USCITA)


if __name__ == "__main__":
    main()
