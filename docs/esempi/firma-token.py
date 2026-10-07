# Firma il token per un utente del tuo sito (Python 3, solo libreria standard).
# Da eseguire SUL SERVER del tuo sito, mai nel browser.
import base64, hashlib, hmac, json, os, secrets, sys, time

PARTNER_ID = os.environ["SORSO_PARTNER_ID"]   # l'ID che ti abbiamo consegnato
SEGRETO = os.environ["SORSO_SECRET"]          # il segreto di firma (64 caratteri esadecimali)


def b64url(dati: bytes) -> str:
    return base64.urlsafe_b64encode(dati).rstrip(b"=").decode()


def crea_token_sorso(sub, team, role="member", name=""):
    header = {"alg": "HS256", "typ": "JWT"}
    payload = {
        "iss": PARTNER_ID,                  # chi firma: il tuo ID partner
        "sub": sub,                         # l'ID dell'utente nel TUO sito
        "name": name,                       # nome da mostrare, facoltativo
        "team": team,                       # il gruppo
        "role": role,                       # "member" oppure "organizer"
        "jti": secrets.token_hex(12),       # identificativo unico: rende il token monouso
        "exp": int(time.time()) + 300,      # scade fra 5 minuti
    }
    corpo = (b64url(json.dumps(header, separators=(",", ":")).encode()) + "."
             + b64url(json.dumps(payload, separators=(",", ":")).encode()))
    firma = hmac.new(SEGRETO.encode(), corpo.encode(), hashlib.sha256).digest()
    return corpo + "." + b64url(firma)


if __name__ == "__main__":
    sub, team = sys.argv[1], sys.argv[2]
    role = sys.argv[3] if len(sys.argv) > 3 else "member"
    name = sys.argv[4] if len(sys.argv) > 4 else ""
    print(crea_token_sorso(sub, team, role, name))
