#!/usr/bin/env python3
"""Genera docs/guida-integrazione-sorso.pdf (guida per lo sviluppatore del sito partner).

  python3 docs/build-guida.py

Gli esempi di codice sono i file di docs/esempi/ (provati da test/docs.test.js) e le risposte
dell'API sono quelle vere di docs/esempi/risposte.json (generate da docs/genera-risposte.js):
la guida non contiene codice né risposte scritti a mano.
"""
import json, os
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import cm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (BaseDocTemplate, Frame, KeepTogether, PageBreak, PageTemplate, Paragraph,
                                Preformatted, Spacer, Table, TableStyle)
from reportlab.platypus.tableofcontents import TableOfContents

AQUI = os.path.dirname(os.path.abspath(__file__))
ESEMPI = os.path.join(AQUI, "esempi")
USCITA = os.path.join(AQUI, "guida-integrazione-sorso.pdf")
BASE = "https://sorso-taccuino.vercel.app"
DATA = "7 ottobre 2026"

FD = "/usr/share/fonts/truetype/dejavu/"
pdfmetrics.registerFont(TTFont("Sans", FD + "DejaVuSans.ttf"))
pdfmetrics.registerFont(TTFont("Sans-B", FD + "DejaVuSans-Bold.ttf"))
pdfmetrics.registerFont(TTFont("Mono", FD + "DejaVuSansMono.ttf"))
pdfmetrics.registerFont(TTFont("Mono-B", FD + "DejaVuSansMono-Bold.ttf"))
pdfmetrics.registerFontFamily("Sans", normal="Sans", bold="Sans-B", italic="Sans", boldItalic="Sans-B")
pdfmetrics.registerFontFamily("Mono", normal="Mono", bold="Mono-B", italic="Mono", boldItalic="Mono-B")

BORDO = colors.HexColor("#7a1228")
INK = colors.HexColor("#1b1b1f")
GRIGIO = colors.HexColor("#5d5a56")
LINEA = colors.HexColor("#d9d4cd")
FONDO = colors.HexColor("#f4f1ec")
CODICE = colors.HexColor("#f1f3f6")

S = {
    "corpo": ParagraphStyle("corpo", fontName="Sans", fontSize=9.3, leading=14, textColor=INK, spaceAfter=6, alignment=TA_LEFT),
    "h1": ParagraphStyle("h1", fontName="Sans-B", fontSize=16, leading=20, textColor=BORDO, spaceBefore=14, spaceAfter=8, keepWithNext=1),
    "h1x": ParagraphStyle("h1x", fontName="Sans-B", fontSize=16, leading=20, textColor=BORDO, spaceBefore=4, spaceAfter=8),
    "h2": ParagraphStyle("h2", fontName="Sans-B", fontSize=11.5, leading=15, textColor=INK, spaceBefore=10, spaceAfter=4, keepWithNext=1),
    "cella": ParagraphStyle("cella", fontName="Sans", fontSize=8.4, leading=11.4, textColor=INK),
    "cella-b": ParagraphStyle("cella-b", fontName="Sans-B", fontSize=8.4, leading=11.4, textColor=colors.white),
    "cod": ParagraphStyle("cod", fontName="Mono", fontSize=7.1, leading=9.2, textColor=INK, backColor=CODICE,
                          borderColor=LINEA, borderWidth=0.6, borderPadding=(5, 5, 5, 5), spaceBefore=4, spaceAfter=10, leftIndent=5, rightIndent=5),
    "nota": ParagraphStyle("nota", fontName="Sans", fontSize=8.8, leading=12.6, textColor=INK),
    "toc1": ParagraphStyle("toc1", fontName="Sans", fontSize=10, leading=17, textColor=INK, leftIndent=0),
    "tit": ParagraphStyle("tit", fontName="Sans-B", fontSize=27, leading=32, textColor=BORDO, spaceAfter=10),
    "sot": ParagraphStyle("sot", fontName="Sans", fontSize=12.5, leading=18, textColor=INK, spaceAfter=6),
    "pic": ParagraphStyle("pic", fontName="Sans", fontSize=8.6, leading=12, textColor=GRIGIO),
}


def P(t, stile="corpo"):
    return Paragraph(t, S[stile])


def esc(t):
    return t.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def codice(testo, sostituzioni=None):
    testo = testo.rstrip("\n")
    for a, b in (sostituzioni or {}).items():
        testo = testo.replace(a, b)
    return Preformatted(testo, S["cod"])


def file_esempio(nome, sostituzioni=None):
    with open(os.path.join(ESEMPI, nome), encoding="utf-8") as f:
        return codice(f.read(), sostituzioni)


def tabella(righe, larghezze, intestazione=True, zebra=True, tieni=True):
    dati = []
    for i, r in enumerate(righe):
        dati.append([Paragraph(str(c), S["cella-b"] if (intestazione and i == 0) else S["cella"]) for c in r])
    t = Table(dati, colWidths=[w * cm for w in larghezze], repeatRows=1 if intestazione else 0)
    st = [("VALIGN", (0, 0), (-1, -1), "TOP"), ("LINEBELOW", (0, 0), (-1, -1), 0.4, LINEA),
          ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
          ("LEFTPADDING", (0, 0), (-1, -1), 5), ("RIGHTPADDING", (0, 0), (-1, -1), 5)]
    if intestazione:
        st += [("BACKGROUND", (0, 0), (-1, 0), BORDO)]
    if zebra:
        for i in range(1 if intestazione else 0, len(righe)):
            if (i % 2) == 0:
                st.append(("BACKGROUND", (0, i), (-1, i), FONDO))
    t.setStyle(TableStyle(st))
    return t


def riquadro(testo, colore=BORDO):
    t = Table([[Paragraph(testo, S["nota"])]], colWidths=[17 * cm])
    t.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), FONDO), ("LINEBEFORE", (0, 0), (0, -1), 3, colore),
                           ("LEFTPADDING", (0, 0), (-1, -1), 10), ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                           ("TOPPADDING", (0, 0), (-1, -1), 7), ("BOTTOMPADDING", (0, 0), (-1, -1), 7)]))
    return KeepTogether([t, Spacer(1, 8)])


class Doc(BaseDocTemplate):
    def __init__(self, nome, **kw):
        super().__init__(nome, **kw)
        cornice = Frame(2 * cm, 2 * cm, 17 * cm, 25.2 * cm, id="f", leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
        self.addPageTemplates([PageTemplate(id="p", frames=[cornice], onPage=self.piede)])

    def piede(self, canvas, doc):
        canvas.saveState()
        canvas.setFont("Sans", 7.8)
        canvas.setFillColor(GRIGIO)
        canvas.drawString(2 * cm, 1.1 * cm, "Sorso · Spazio di team · Guida all'integrazione · API v1")
        canvas.drawRightString(19 * cm, 1.1 * cm, "Pagina %d" % doc.page)
        canvas.setStrokeColor(LINEA)
        canvas.line(2 * cm, 1.5 * cm, 19 * cm, 1.5 * cm)
        canvas.restoreState()

    def afterFlowable(self, f):
        if isinstance(f, Paragraph) and f.style.name == "h1":
            testo = f.getPlainText()
            self.notify("TOCEntry", (0, testo, self.page))


def lista(voci):
    return [Paragraph("•&nbsp;&nbsp;" + v, ParagraphStyle("li", parent=S["corpo"], leftIndent=14, firstLineIndent=-10, spaceAfter=3)) for v in voci]


def main():
    r = json.load(open(os.path.join(ESEMPI, "risposte.json"), encoding="utf-8"))
    story = []

    # ---------------- copertina ----------------
    story += [Spacer(1, 5.2 * cm), P("Sorso", "tit"), P("Spazio di team: guida all'integrazione", "sot"),
              Spacer(1, 0.6 * cm),
              P("Per chi sviluppa il sito che incorpora lo spazio di team: come far accedere i tuoi utenti, "
                "come incorporare la pagina e come leggere i risultati dal tuo server.", "corpo"),
              Spacer(1, 1.2 * cm),
              tabella([["Versione della guida", "1.0 — %s" % DATA], ["API", "v1 (sola lettura)"],
                       ["Indirizzo di Sorso", BASE], ["Cosa serve per cominciare", "ID partner, segreto di firma e chiave API (te li consegniamo noi)"]],
                      [5.2, 11.8], intestazione=False),
              PageBreak()]

    toc = TableOfContents()
    toc.levelStyles = [S["toc1"]]
    story += [P("Indice", "h1x"), toc, PageBreak()]

    # ---------------- 1 ----------------
    story += [P("1. Panoramica", "h1"),
              P("Sorso è un taccuino di degustazione del vino. Lo <b>spazio di team</b> ne è una versione pensata per i siti di club, "
                "enoteche e associazioni: lo incorpori nel tuo sito in un iframe e i tuoi utenti votano insieme i vini di una degustazione."),
              P("Ognuno vede i propri voti. Il <b>punteggio del team</b> di un vino è la media dei voti di tutti i partecipanti, e ciascuno lo vede "
                "<b>solo dopo aver votato quel vino</b>, per non farsi influenzare dagli altri.")]
    story += [P("Come funziona, in tre passi", "h2"),
              tabella([["Passo", "Dove", "Cosa succede"],
                       ["1. Firmare il token", "Il tuo server", "Quando un utente apre la pagina, il tuo server firma un token breve che dice chi è e a che team appartiene."],
                       ["2. Incorporare", "La tua pagina", "La pagina contiene un iframe che punta a Sorso con quel token. Sorso lo verifica e apre lo spazio."],
                       ["3. Leggere i risultati", "Il tuo server (facoltativo)", "Con la chiave API leggi elenco e risultati delle degustazioni, anche in CSV."]],
                      [3.4, 3.6, 10])]
    story += [Spacer(1, 6)] + lista([
        "<b>Non gestiamo utenti, password o inviti.</b> L'identità la garantisce il tuo sito: chi arriva con un token valido è chi tu hai detto.",
        "<b>L'API è di sola lettura.</b> Dall'esterno non si possono scrivere voti: si vota solo dentro l'iframe.",
        "<b>Non servono cookie.</b> Lo spazio non usa cookie né archiviazione del browser, quindi funziona anche dove i cookie di terze parti sono bloccati."])
    story += [P("Come si vota", "h2"),
              P("Per ogni vino l'utente sceglie tra due modalità, come preferisce:"),
              ] + lista(["<b>Voto rapido</b>: tre giudizi — occhio, naso, bocca — ciascuno da 50 a 100. Il totale è la media pesata (10% occhio, 30% naso, 60% bocca).",
                         "<b>Scheda completa</b>: nove giudizi da 0 a 10 sulle quattro fasi dell'esame (visivo, olfattivo, gusto-olfattivo, finale), convertiti nella stessa scala."])
    story += [P("Entrambe producono un punteggio da <b>50 a 100</b>, quindi i voti dati in modalità diverse stanno nella stessa media. "
                "Il punteggio lo calcola sempre il server a partire dai giudizi."),
              tabella([["Punteggio", "Giudizio"], ["50–59", "Insufficiente"], ["60–69", "Sufficiente"], ["70–79", "Discreto"], ["80–89", "Buono"],
                       ["90–95", "Eccellente"], ["96–99", "Eccezionale"], ["100", "Irripetibile (solo con ogni giudizio al massimo)"]],
                      [3, 14]),
]

    # ---------------- 2 ----------------
    story += [P("2. Cosa riceverai e cosa serve da te", "h1"),
              P("Per ogni sito partner creiamo una configurazione. Ti consegniamo tre cose:"),
              tabella([["Cosa", "A cosa serve", "Dove tenerlo"],
                       ["<b>ID partner</b><br/>per esempio <font name='Mono'>club-vini</font>", "Identifica il tuo sito. Va nel claim <font name='Mono'>iss</font> del token e nell'indirizzo dell'iframe.", "Non è segreto."],
                       ["<b>Segreto di firma</b><br/>64 caratteri esadecimali", "Serve a firmare i token. Chi lo conosce può far entrare chiunque nel tuo spazio.", "Solo sul tuo server (variabile d'ambiente). Mai nel browser, mai in un repository."],
                       ["<b>Chiave API</b><br/>inizia con <font name='Mono'>sk_</font>", "Serve a leggere i risultati dal tuo server.", "Solo sul tuo server. Noi ne conserviamo solo l'impronta: se la perdi, se ne genera una nuova."]],
                      [4.6, 7.2, 5.2])]
    story += [Spacer(1, 6), riquadro("<b>Consegna sicura.</b> Il segreto e la chiave ti vengono mostrati una volta sola. Conservali subito in un gestore di segreti "
                                     "o nelle variabili d'ambiente del tuo server. Se pensi che siano stati esposti, chiedi la rotazione: la vecchia chiave smette di valere entro 30 secondi.")]
    story += [P("Cosa serve da te", "h2")] + lista([
        "<b>I domini</b> dei siti in cui incorporerai lo spazio, solo con <font name='Mono'>https://</font> (per esempio <font name='Mono'>https://www.club.example</font>). "
        "L'iframe funziona solo da questi: da qualunque altro sito il browser lo blocca.",
        "<b>Personalizzazione</b> (facoltativa): titolo, logo, colori, carattere, lingua. Vedi il capitolo 6.",
        "<b>Modalità di voto</b> consentite: voto rapido, scheda completa o entrambe, e quale proporre per prima."])

    # ---------------- 3 ----------------
    story += [P("3. Passo 1 — firmare il token", "h1"),
              P("Il token è un JWT firmato con HS256 (HMAC-SHA256). Lo generi sul tuo server, a ogni caricamento della pagina, per l'utente che sta entrando."),
              P("I campi del token", "h2"),
              tabella([["Campo", "Richiesto", "Significato e regole"],
                       ["<font name='Mono'>iss</font>", "sì", "Il tuo ID partner."],
                       ["<font name='Mono'>sub</font>", "sì", "L'identificativo dell'utente nel tuo sito. Da 1 a 128 caratteri tra lettere, cifre e <font name='Mono'>. _ : @ -</font>. Meglio un id opaco che un'email."],
                       ["<font name='Mono'>team</font>", "sì", "Il gruppo dell'utente. Chi ha lo stesso team vede le stesse degustazioni; team diversi non si vedono. Da 1 a 64 caratteri tra lettere, cifre e <font name='Mono'>. _ : -</font>."],
                       ["<font name='Mono'>jti</font>", "sì", "Identificativo unico di questo token (da 8 a 64 caratteri). Rende il token monouso: usalo una sola volta e genera un valore nuovo a ogni token."],
                       ["<font name='Mono'>exp</font>", "sì", "Scadenza, in secondi Unix. Al massimo 15 minuti da adesso: consigliamo 5."],
                       ["<font name='Mono'>role</font>", "no", "<font name='Mono'>member</font> (predefinito) oppure <font name='Mono'>organizer</font>. Vedi il capitolo 5."],
                       ["<font name='Mono'>name</font>", "no", "Il nome da mostrare (fino a 60 caratteri). Non viene salvato: vive solo nella sessione."],
                       ["<font name='Mono'>lang</font>", "no", "<font name='Mono'>it</font> oppure <font name='Mono'>en</font>. Se manca vale la lingua impostata per il tuo partner."]],
                      [2.1, 2.2, 12.7]),
              Spacer(1, 6),
              riquadro("<b>Regole da rispettare.</b> Solo HS256 (qualunque altro algoritmo, compreso <font name='Mono'>none</font>, viene rifiutato). "
                       "Il token vale <b>una volta sola</b>: generalo ogni volta che la pagina viene costruita e non metterlo in cache. "
                       "Se l'orologio del tuo server va fuori tempo di più di un minuto, i token possono risultare scaduti: tienilo sincronizzato."),
              P("Esempio in Node.js", "h2"), file_esempio("firma-token.js", {"DOMINIO-SORSO": BASE.replace("https://", "")}),
              P("Esempio in Python", "h2"), file_esempio("firma-token.py"),
              P("Esempio in PHP", "h2"), file_esempio("firma-token.php"),
]

    # ---------------- 4 ----------------
    story += [P("4. Passo 2 — incorporare lo spazio", "h1"),
              P("L'indirizzo dell'iframe ha questa forma:"),
              codice("%s/embed?p=ID_PARTNER#token=TOKEN_FIRMATO" % BASE),
              P("Il tuo server lo costruisce a ogni caricamento della pagina, con un token appena firmato. Il token va <b>dopo il #</b> (nel frammento): il browser non lo invia mai a nessun server, quindi non compare nei log né nell'intestazione Referer. Nella pagina:"),
              file_esempio("pagina-ospite.html", {"DOMINIO-SORSO": BASE.replace("https://", "")}),
              P("Cosa succede dentro l'iframe", "h2")] + lista([
        "Sorso verifica il token e lo scambia subito con una <b>sessione di 4 ore</b>, tenuta solo in memoria. Dopo lo scambio riuscito toglie il token dall'indirizzo.",
        "Se la sessione finisce (dopo 4 ore, o ricaricando solo l'iframe) serve un token nuovo. L'iframe lo dice all'utente e invia al tuo sito il messaggio <font name='Mono'>{ type: \"sorso:reauth\" }</font>: se lo ascolti come nell'esempio, il tuo server firma un token nuovo e ricarichi l'iframe senza che l'utente faccia nulla. Senza questo ascolto l'utente vede un invito a ricaricare la tua pagina.",
        "Il voto che l'utente stava compilando non è perso se cambia vino o torna all'elenco; se la sessione scade mentre compila, l'iframe lo avvisa che quel voto non è stato salvato.",
        "<b>Altezza automatica.</b> L'iframe invia al tuo sito il messaggio <font name='Mono'>{ type: \"sorso:height\", height: numero }</font>. "
        "Ascoltalo come nell'esempio, controllando sempre <font name='Mono'>event.origin</font>."])
    story += [P("Se vedi “Questo accesso è già stato usato”", "h2"),
              P("Il token è monouso, quindi succede quando lo stesso token arriva due volte. Le cause più comuni:")] + lista([
        "la pagina è stata messa in <b>cache</b> (da te, da un CDN o dal browser) e contiene un token vecchio;",
        "un'<b>anteprima automatica</b> (un bot, un controllo dei link, il prefetch del browser) ha caricato la pagina prima dell'utente;",
        "il token è stato generato una volta e riusato per più pagine o più utenti."])
    story += [P("Rimedio: genera il token lato server ad ogni richiesta della pagina e imposta <font name='Mono'>Cache-Control: no-store</font> sulla pagina che lo contiene."),
]

    # ---------------- 5 ----------------
    story += [P("5. Ruoli, team e visibilità", "h1"),
              Paragraph("Il ruolo lo decidi tu, nel claim <font name='Mono'>role</font>. Sorso non ha schermate di amministrazione né inviti: se un utente è organizzatore lo dice il tuo sito.", ParagraphStyle("corpo-k", parent=S["corpo"], keepWithNext=1)),
              tabella([["Azione", "Partecipante (member)", "Organizzatore (organizer)"],
                       ["Vedere le degustazioni del proprio team", "sì", "sì"],
                       ["Creare ed eliminare una degustazione", "no", "sì"],
                       ["Aggiungere vini a una degustazione aperta", "no", "sì"],
                       ["Chiudere o riaprire una degustazione", "no", "sì"],
                       ["Votare, anche più volte lo stesso vino (l'ultimo voto sostituisce il precedente)", "sì", "sì"],
                       ["Vedere i propri voti nel dettaglio", "sì", "sì"],
                       ["Vedere la media del team di un vino", "solo dopo aver votato quel vino", "solo dopo aver votato quel vino"],
                       ["Vedere quanti hanno votato un vino", "solo dopo aver votato", "sempre (per sapere chi manca)"]],
                      [8, 4.5, 4.5]),
              Spacer(1, 6)] + lista([
        "<b>Degustazione chiusa:</b> i voti sono definitivi, non si può più votare né aggiungere vini. L'organizzatore può riaprirla.",
        "<b>Team separati:</b> degustazioni e voti di un team non sono visibili agli altri team. Lo stesso <font name='Mono'>sub</font> in due team ha dati separati.",
        "<b>Limiti:</b> fino a 200 degustazioni per team e 100 vini per degustazione (eliminando una degustazione si libera il posto). Nome della degustazione fino a 80 caratteri; vino fino a 100, produttore fino a 80, annata di quattro cifre oppure NV; note personali fino a 500 caratteri."])
    story += [P("6. Personalizzazione", "h1"),
              P("L'aspetto si adatta al tuo sito con pochi valori, che impostiamo noi per te. Inviaci quelli che vuoi cambiare:"),
              tabella([["Impostazione", "Valori", "Effetto"],
                       ["<font name='Mono'>title</font>", "testo, fino a 40 caratteri", "Titolo mostrato in alto."],
                       ["<font name='Mono'>logo</font>", "indirizzo <font name='Mono'>https</font> di un'immagine", "Logo in alto, alto 32 px."],
                       ["<font name='Mono'>accent</font>", "colore <font name='Mono'>#rrggbb</font>", "Colore dei pulsanti e della media del team."],
                       ["<font name='Mono'>bg</font>", "colore <font name='Mono'>#rrggbb</font>", "Colore dello sfondo."],
                       ["<font name='Mono'>ink</font>", "colore <font name='Mono'>#rrggbb</font>", "Colore del testo."],
                       ["<font name='Mono'>font</font>", "<font name='Mono'>system</font>, <font name='Mono'>serif</font>, <font name='Mono'>rounded</font>, <font name='Mono'>mono</font>", "Carattere (tra quelli installati sul dispositivo)."],
                       ["lingua", "<font name='Mono'>it</font> o <font name='Mono'>en</font>", "Lingua predefinita; il claim <font name='Mono'>lang</font> la sovrascrive per utente."],
                       ["modalità di voto", "rapido, completa o entrambe", "Quali modalità si possono scegliere e quale è proposta per prima."]],
                      [3.4, 6.2, 7.4]),
              Spacer(1, 6),
              riquadro("I colori vengono controllati per la leggibilità: se i tuoi non garantiscono un contrasto sufficiente (almeno 4,5 a 1 per il testo), Sorso li corregge o torna a quelli predefiniti, per non rendere illeggibile lo spazio. Imposta sempre insieme sfondo e testo. Le immagini del logo devono essere servite in <font name='Mono'>https</font>."),
]

    # ---------------- 7 ----------------
    story += [P("7. API di sola lettura", "h1"),
              P("Per leggere i risultati dal tuo server. Tutte le richieste vanno fatte <b>dal server</b>, mai dal browser: la chiave non deve uscire dal tuo sistema."),
              tabella([["Cosa", "Valore"], ["Indirizzo di base", BASE + "/api/v1"],
                       ["Autenticazione", "<font name='Mono'>Authorization: Bearer sk_ID_PARTNER_…</font>"],
                       ["Formato", "JSON, UTF-8. Ogni risposta porta <font name='Mono'>X-Sorso-Api-Version: 1</font> e <font name='Mono'>Cache-Control: no-store</font>."],
                       ["Dati", "Solo aggregati: mai chi ha votato cosa."]], [4, 13]),
              Spacer(1, 6),
              P("Elenco delle degustazioni", "h2"),
              codice("GET /api/v1/tastings?team=giovedi&status=closed", None),
              P("I filtri <font name='Mono'>team</font> e <font name='Mono'>status</font> (<font name='Mono'>open</font> o <font name='Mono'>closed</font>) sono facoltativi. Risposta:"),
              codice(json.dumps(r["tastings"], indent=2, ensure_ascii=False)),
              P("Risultati di una degustazione", "h2"),
              codice("GET /api/v1/tastings/{id}/results"),
              codice(json.dumps(r["results"], indent=2, ensure_ascii=False)),
              P("Come leggere i risultati", "h2")] + lista([
        "<font name='Mono'>votes</font> è il numero di voti; <font name='Mono'>average</font> la media del team, con un decimale.",
        "La media compare <b>dal secondo voto</b> (<font name='Mono'>minVotes</font> = 2): con un voto solo coinciderebbe con quello di una persona. Finché mancano voti, "
        "<font name='Mono'>average</font> è <font name='Mono'>null</font> e <font name='Mono'>hidden</font> è <font name='Mono'>true</font>.",
        "I punteggi dei voti rapidi e delle schede complete sono nella stessa scala 50–100, quindi la media li mescola correttamente."])
    story += [P("Esportazione in CSV", "h2"),
              codice("GET /api/v1/tastings/{id}/results?format=csv"),
              P("Un file da aprire in un foglio di calcolo. Le celle che iniziano con <font name='Mono'>= + - @</font> vengono precedute da un apice, "
                "per impedire che un nome di vino venga eseguito come formula."),
              codice(r["csv"].replace("\r\n", "\n")),
              P("Cancellare i dati di un utente", "h2"),
              codice("DELETE /api/v1/users/{sub}"),
              P("Rimuove tutti i voti dell'utente (il <font name='Mono'>sub</font> che hai messo nel token) e aggiorna di conseguenza le medie. È pensato per le richieste di cancellazione. "
                "Si può ripetere senza effetti."),
              codice(json.dumps({"votesRemoved": 2}, indent=2)),
              P("Esempi con curl", "h2"), file_esempio("api.sh"),
]

    # ---------------- 8 ----------------
    story += [P("8. Errori", "h1"),
              P("Gli errori dell'API hanno sempre questa forma, con un codice stabile da usare nel tuo programma e un messaggio per le persone:"),
              codice(json.dumps(r["errUnauthorized"], indent=2, ensure_ascii=False)),
              tabella([["Stato", "Codice", "Quando"],
                       ["401", "<font name='Mono'>unauthorized</font>", "Chiave mancante, errata o di un partner disattivato."],
                       ["400", "<font name='Mono'>invalid_status</font>, <font name='Mono'>invalid_user</font>", "Un parametro non è valido."],
                       ["404", "<font name='Mono'>not_found</font>", "Degustazione inesistente o di un altro partner; percorso sconosciuto."],
                       ["405", "<font name='Mono'>method_not_allowed</font>", "Metodo HTTP non previsto per quel percorso."],
                       ["429", "<font name='Mono'>rate_limited</font>", "Troppe richieste. L'intestazione <font name='Mono'>Retry-After</font> dice fra quanti secondi riprovare."],
                       ["503", "<font name='Mono'>read_only</font>", "Servizio in sola lettura per il limite mensile gratuito: le letture funzionano, la cancellazione no."],
                       ["503", "<font name='Mono'>no_database</font>", "Servizio momentaneamente non disponibile."]],
                      [1.6, 6.2, 9.2]),
              P("Problemi frequenti con l'iframe", "h2"),
              tabella([["Sintomo", "Causa probabile", "Cosa fare"],
                       ["L'iframe è vuoto o mostra un errore del browser", "Il dominio della tua pagina non è tra quelli registrati (il browser lo blocca: “Refused to frame”).", "Comunicaci il dominio esatto, con <font name='Mono'>https://</font> e senza percorso."],
                       ["“L'accesso non è valido o è scaduto”", "Token mancante, firma sbagliata, scaduto o con campi non validi.", "Vedi la tabella dei codici qui sotto."],
                       ["“Questo accesso è già stato usato…”", "Lo stesso token è arrivato due volte.", "Capitolo 4: niente cache, un token per caricamento."],
                       ["“Devi rientrare — La sessione è scaduta”", "Sono passate 4 ore, o la configurazione del partner è cambiata.", "L'iframe invia <font name='Mono'>sorso:reauth</font>: ricaricalo con un token nuovo (o l'utente ricarica la pagina)."],
                       ["Un utente non vede le degustazioni degli altri", "Hanno valori diversi nel claim <font name='Mono'>team</font>.", "Usa lo stesso <font name='Mono'>team</font> per chi deve stare insieme."],
                       ["Non compare “Nuova degustazione”", "L'utente è <font name='Mono'>member</font>.", "Metti <font name='Mono'>role: \"organizer\"</font> nel token."]],
                      [4.2, 6.4, 6.4]),
              Spacer(1, 6),
              P("Per capire <i>perché</i> un token viene rifiutato puoi inviarlo tu stesso (solo per diagnosi: questa chiamata è interna all'iframe e può cambiare). "
                "Attenzione: se il token è valido, questa prova lo consuma.")]
    story += [codice("curl -sS -X POST %s/api/embed \\\n  -H 'Content-Type: application/json' \\\n  -d '{\"op\":\"session\",\"token\":\"IL_TUO_TOKEN\"}'" % BASE),
              P("Risposta con il motivo, per esempio:"), codice(json.dumps(r["errTokenUsed"], indent=2, ensure_ascii=False)),
              tabella([["Codice", "Significato"],
                       ["<font name='Mono'>malformed</font>", "Il token non ha tre parti o non è JSON valido."],
                       ["<font name='Mono'>alg</font>", "L'algoritmo non è HS256."],
                       ["<font name='Mono'>signature</font>", "Firma errata: segreto sbagliato o token modificato."],
                       ["<font name='Mono'>exp_missing</font>, <font name='Mono'>expired</font>, <font name='Mono'>exp_too_far</font>", "Scadenza mancante, già passata o oltre i 15 minuti."],
                       ["<font name='Mono'>not_yet</font>", "Il campo <font name='Mono'>nbf</font> è nel futuro."],
                       ["<font name='Mono'>partner</font>", "<font name='Mono'>iss</font> sconosciuto o partner disattivato."],
                       ["<font name='Mono'>claim_sub</font>, <font name='Mono'>claim_team</font>, <font name='Mono'>claim_jti</font>, <font name='Mono'>claim_role</font>", "Quel campo manca o ha un formato non valido."],
                       ["<font name='Mono'>token_used</font>", "Il token è già stato usato."],
                       ["<font name='Mono'>rate_limited</font>", "Troppi tentativi dallo stesso indirizzo."]],
                      [6, 11]),
]

    # ---------------- 9 ----------------
    story += [P("9. Limiti e disponibilità", "h1"),
              tabella([["Cosa", "Limite"],
                       ["Apertura di sessioni (<font name='Mono'>/embed</font>)", "200 al minuto per indirizzo IP (una serata di molte persone sulla stessa rete entra senza problemi)"],
                       ["Operazioni di un utente dentro l'iframe", "90 al minuto per utente"],
                       ["API di sola lettura", "120 richieste al minuto per chiave, e 120 al minuto per indirizzo IP"],
                       ["Sessione dell'iframe", "4 ore"],
                       ["Validità del token firmato da te", "al massimo 15 minuti, monouso"]],
                      [8, 9]),
              Spacer(1, 6),
              P("Servizio gratuito: cosa significa per te", "h2"),
              P("Sorso gira su un'infrastruttura gratuita. Questo ha due conseguenze che è giusto conoscere:")] + lista([
        "<b>Quota mensile.</b> L'archivio ha un limite di operazioni al mese. Oltre l'80% le risposte portano l'intestazione <font name='Mono'>X-Sorso-Quota: warn</font> "
        "(e gli organizzatori vedono un avviso nell'iframe); oltre il 90% il servizio passa in <b>sola lettura</b> fino al mese successivo: si può consultare ma non votare né creare. "
        "Per un uso normale (gruppi di qualche decina di persone) il limite è lontano: un voto costa circa 10 operazioni.",
        "<b>Nessuna garanzia di disponibilità.</b> Non c'è un impegno formale di continuità. Non è adatto a eventi in cui un'interruzione non sia tollerabile: "
        "scarica il CSV dei risultati al termine di ogni degustazione."])
    story += [P("10. Sicurezza e privacy", "h1"),
              P("Cosa devi fare tu", "h2")] + lista([
        "Tieni il segreto di firma e la chiave API solo sul server. Se li pubblichi per errore, chiedi subito la rotazione.",
        "Firma i token solo per utenti già autenticati sul tuo sito, e imposta il team e il ruolo in base ai tuoi dati, mai in base a parametri della richiesta.",
        "Usa come <font name='Mono'>sub</font> un identificativo opaco del tuo sistema invece dell'email, quando puoi.",
        "Servi sempre la pagina che incorpora l'iframe in <font name='Mono'>https</font>."])
    story += [P("Cosa fa Sorso", "h2")] + lista([
        "La pagina si incorpora solo dai domini che hai registrato, non ha script inline, e non invia il riferimento della pagina di provenienza.",
        "Il punteggio lo calcola il server; i voti individuali non sono visibili a nessuno tranne a chi li ha dati, e l'API restituisce solo aggregati.",
        "Chi ha il token non può uscire dal proprio team né dal proprio partner: ogni richiesta controlla che team e partner coincidano."])
    story += [P("Quali dati conserviamo", "h2"),
              tabella([["Dato", "Conservato", "Note"],
                       ["Identificativo dell'utente (<font name='Mono'>sub</font>)", "sì", "Serve a collegare l'utente ai suoi voti. Non c'è altra anagrafica."],
                       ["Team, nome di degustazioni e vini", "sì", "Inseriti dagli organizzatori."],
                       ["Voti, con modalità e giudizi", "sì", "Visibili solo all'autore; l'API espone soltanto le medie."],
                       ["Note personali sui vini", "sì", "Visibili solo all'autore."],
                       ["Nome visualizzato (<font name='Mono'>name</font>)", "no", "Resta nella sessione in memoria dell'utente."],
                       ["Email, telefono, indirizzo IP", "no", "L'indirizzo IP è usato solo per il limite di richieste, in un contatore temporaneo."]],
                      [6, 2.6, 8.4]),
              Spacer(1, 6)] + lista([
        "I dati restano finché non vengono cancellati: non c'è una scadenza automatica. Per cancellare un utente usa <font name='Mono'>DELETE /api/v1/users/{sub}</font> (capitolo 7).",
        "Chi gestisce il servizio ha accesso tecnico al database. Per l'informativa agli utenti e le basi giuridiche del trattamento valgono le valutazioni del tuo sito: "
        "quanto conserviamo è l'elenco qui sopra."])

    # ---------------- 11 ----------------
    story += [P("11. Elenco di verifica prima di andare online", "h1"),
              P("Spunta ogni voce con una prova vera, non a memoria. Per qualunque dubbio o richiesta (nuovo dominio, rotazione dei segreti, tema, cancellazioni) rivolgiti a chi ti ha consegnato questa guida.")]
    voci = [
        "Ho ricevuto ID partner, segreto di firma e chiave API e li ho salvati solo sul server.",
        "Ho comunicato i domini esatti (con <font name='Mono'>https://</font>) e l'iframe si apre da quelli.",
        "Da un dominio non registrato l'iframe viene bloccato (prova da una pagina di prova).",
        "Il token viene generato a ogni caricamento della pagina e la pagina non è in cache.",
        "Un utente <font name='Mono'>member</font> vota e, solo dopo, vede la media del team.",
        "Un utente <font name='Mono'>organizer</font> crea una degustazione, aggiunge vini e la chiude.",
        "Due utenti di team diversi non vedono le rispettive degustazioni.",
        "Ricaricando solo l'iframe compare il pulsante per chiedere un nuovo accesso; con l'ascolto di <font name='Mono'>sorso:reauth</font> il tuo sito ricarica l'iframe con un token nuovo.",
        "La lettura dei risultati dal server funziona e il CSV si apre correttamente.",
        "Ho provato la cancellazione di un utente di prova e le medie si sono aggiornate.",
        "Ho deciso chi, nel mio sito, è organizzatore e dove scarico il CSV al termine delle serate.",
        "L'informativa agli utenti del mio sito è aggiornata."]
    story += [tabella([["", "Verifica"]] + [["☐", v] for v in voci], [1.1, 15.9])]

    # un paragrafo che introduce una tabella o un blocco di codice resta con quello che segue
    for a, b in zip(story, story[1:]):
        if isinstance(a, Paragraph) and a.style.name in ("corpo", "corpo-k") and isinstance(b, (Table, Preformatted)):
            a.keepWithNext = 1

    doc = Doc(USCITA, pagesize=A4, title="Sorso — Spazio di team: guida all'integrazione", author="Sorso",
              subject="Guida per lo sviluppatore del sito partner", leftMargin=2 * cm, rightMargin=2 * cm, topMargin=2 * cm, bottomMargin=2 * cm)
    doc.multiBuild(story)
    print("scritto", USCITA)


if __name__ == "__main__":
    main()
