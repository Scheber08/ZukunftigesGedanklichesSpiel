# Discord-Bot (Slash-Befehle)

Der Liga-Bot läuft **serverlos** über den Interactions-Endpunkt der Website – kein eigener Server,
kein dauerhaft laufender Prozess. Discord schickt jeden Befehl per HTTPS an
`https://<domain>/api/discord/interactions`, der Worker antwortet sofort.

| Befehl (DE / EN) | Was passiert | Sichtbarkeit |
|---|---|---|
| `/naechstes-rennen` · `/next-race` | Nächste Runde: Strecke, Land, Liga-Zeit, Start in der Zeitzone des Lesers (`<t:…:F>`) plus Countdown (`<t:…:R>`), Button zur Rennseite | im Channel |
| `/wertung [art]` · `/standings [type]` | Top 10 der Fahrer- oder Konstrukteurswertung (`art: Fahrer / Konstrukteure`), Stand nach Runde X, Link | im Channel |
| `/fahrer name` · `/driver name` | Kurzprofil: Team, Startnummer, Rolle, Platz und Punkte der aktuellen Saison, Siege/Podien, Link zum Profil. Gamertag mit Autovervollständigung | im Channel |
| `/rolle rolle` · `/role role` | Selbstrolle an- bzw. abwählen (z. B. „Renntag-Ping“). Nur Rollen, die in den Einstellungen freigegeben sind | nur für dich |

- **Sprache:** Deutsch, wenn der Discord-Client auf Deutsch steht, sonst Englisch.
- **Keine Pings:** Alle Antworten verbieten Erwähnungen (`allowed_mentions: { parse: [] }`).
- **Nur öffentliche Daten:** Der Bot liest dieselben Daten wie die öffentliche Website (Gamertag, Team,
  Nummer, Punkte). E-Mails, Discord-Namen, EA-IDs oder Notizen gibt er nie aus.
- Pseudonymisierte Fahrer werden nicht gefunden.

## Einrichtung Schritt für Schritt

### 1. Application und Bot

Die Application gibt es meist schon für den Staff-Login (Rollenprüfung per Bot-Token, siehe
[SETUP.md](SETUP.md)). Sonst:

1. <https://discord.com/developers/applications> → **New Application** (Name z. B. „[KÜRZEL] Bot“).
2. **General Information:** *Application ID* und *Public Key* kopieren.
3. **Bot:** *Reset Token* → Token kopieren (nur einmal sichtbar). *Public Bot* ausschalten.
   Privilegierte Intents braucht der Bot für die Befehle nicht.

### 2. Secrets / Variablen setzen

| Variable | Woher | Art |
|---|---|---|
| `DISCORD_PUBLIC_KEY` | General Information → Public Key | öffentlich |
| `DISCORD_APPLICATION_ID` | General Information → Application ID | öffentlich |
| `DISCORD_BOT_TOKEN` | Bot → Token | **geheim** (`npx wrangler secret put DISCORD_BOT_TOKEN`) |
| `DISCORD_GUILD_ID` | Rechtsklick auf den Server → „Server-ID kopieren“ (Entwicklermodus) | öffentlich |

Ohne `DISCORD_PUBLIC_KEY` antwortet der Endpunkt mit 404 – der Bot ist dann aus. Nach dem Setzen
einmal deployen.

### 3. Bot auf den Server holen

Developer Portal → **OAuth2 → URL Generator**:

- Scopes: `bot` und `applications.commands`
- Bot Permissions: **Manage Roles** (Rollen verwalten) – nur nötig für `/rolle`

Die erzeugte URL öffnen und den Liga-Server auswählen.

### 4. Rollen-Hierarchie

Discord erlaubt einem Bot nur, Rollen zu vergeben, die **unter seiner eigenen Rolle** stehen:

1. Servereinstellungen → **Rollen**.
2. Die Rolle des Bots (heißt wie die Application) per Drag & Drop **über** alle Selbstrollen ziehen
   (z. B. über „Renntag-Ping“), aber **unter** Admin/Steward/Redaktion lassen.
3. Der Bot braucht keine Administrator-Rechte.

Steht der Bot zu tief oder fehlt „Rollen verwalten“, antwortet `/rolle` mit „Der Bot darf diese Rolle
gerade nicht vergeben“.

### 5. Interactions Endpoint URL eintragen

Developer Portal → **General Information → Interactions Endpoint URL**:

```
https://<domain>/api/discord/interactions
```

Beim Speichern schickt Discord einen Test-PING und eine absichtlich falsch signierte Anfrage. Der
Endpunkt prüft jede Anfrage per Ed25519 (`X-Signature-Ed25519` über `X-Signature-Timestamp` + Rohtext)
und antwortet bei falscher Signatur mit 401. Klappt das Speichern nicht:

- Ist `DISCORD_PUBLIC_KEY` gesetzt und deployt? (Ohne → 404.)
- Stimmt der Schlüssel (Public Key, **nicht** Client Secret oder Bot-Token)?
- Ist die Seite unter HTTPS erreichbar (keine Vorschau hinter Login/Access)?

### 6. Selbstrollen freigeben

Admin → **Einstellungen**, Abschnitt Discord-Bot/Selbstrollen: Rollen-ID (Entwicklermodus → Rechtsklick
auf die Rolle → „ID kopieren“) und Bezeichnungen DE/EN eintragen. Gespeichert wird in der privaten
Einstellung `discord_self_roles`.

- Nur diese Rollen kann `/rolle` vergeben – eine beliebige Rollen-ID wird abgelehnt.
- Rollen, die im Admin-Bereich Rechte geben (Discord-Rollen für Admin/Steward/Redaktion), vergibt der
  Bot **nie**, auch wenn sie versehentlich als Selbstrolle eingetragen sind.
- Höchstens 25 Selbstrollen (Grenze der Discord-Auswahlliste).
- `/rolle` funktioniert nur auf dem Server aus `DISCORD_GUILD_ID`, nicht per Direktnachricht.

### 7. Befehle registrieren

Einmalig und nach jeder Änderung an `src/lib/discord-bot/commands.ts`:

```bash
# Zum Testen nur auf einem Server (sofort sichtbar)
DISCORD_APPLICATION_ID=… DISCORD_BOT_TOKEN=… npm run discord:register -- --guild <Server-ID>

# Global (alle Server, kann bis zu einer Stunde dauern)
DISCORD_APPLICATION_ID=… DISCORD_BOT_TOKEN=… npm run discord:register

# Nur anzeigen, was gesendet würde
npm run discord:register -- --dry-run
```

Unter Windows (PowerShell): `$env:DISCORD_APPLICATION_ID='…'; $env:DISCORD_BOT_TOKEN='…'; npm run discord:register`.

Die Registrierung ersetzt die komplette Liste (PUT): Befehle, die es nicht mehr gibt, verschwinden.
Wer zuerst auf einem Test-Server registriert und danach global, entfernt die Server-Befehle wieder,
sonst erscheinen sie dort doppelt:

```bash
DISCORD_APPLICATION_ID=… DISCORD_BOT_TOKEN=… npm run discord:register -- --guild <Server-ID> --clear
```

Befehlsnamen: Standard Englisch (`/next-race`, `/standings`, `/driver`, `/role`), deutsche Namen
über `name_localizations` – Mitglieder mit deutschem Client sehen `/naechstes-rennen`, `/wertung`,
`/fahrer`, `/rolle`.

## Technik

| Datei | Inhalt |
|---|---|
| `src/pages/api/discord/interactions.ts` | Endpunkt: Größenlimit, Signaturprüfung, Aufruf des Handlers |
| `src/lib/discord-bot/verify.ts` | Ed25519 über WebCrypto (`crypto.subtle`, Name `Ed25519`, Fallback `NODE-ED25519`), Zeitstempel max. 10 min alt |
| `src/lib/discord-bot/handler.ts` | PING, Befehle, Autocomplete, Rollenlogik (Abhängigkeiten per `BotDeps`, testbar ohne Netz) |
| `src/lib/discord-bot/messages.ts` | Embeds, Markdown-Escaping, Discord-Zeitstempel, Link-Buttons |
| `src/lib/discord-bot/commands.ts` | Befehlsdefinitionen (auch fürs Registrierungsskript) |
| `src/lib/discord-bot/roles.ts` | `PUT/DELETE /guilds/{guild}/members/{user}/roles/{role}` mit Bot-Token |
| `src/lib/server/live-data.ts` | Daten (gemeinsam mit den Stream-Overlays): gezielte Abfragen, kein `loadLeague()` |
| `scripts/discord-register-commands.ts` | Registrierung (`npm run discord:register`) |

- Discord erwartet die Antwort innerhalb von 3 Sekunden. Die Daten kommen aus wenigen kleinen
  Abfragen über den öffentlichen Store (wie die Overlays) und werden 10 s im Worker zwischengespeichert.
- Die Selbstrollen liest der Endpunkt aus den privaten Einstellungen (Service-Store, nur lesen).
- Tests: `npx vitest run tests/unit/discord-bot-*.test.ts` (inkl. Signaturtest mit in Node erzeugtem
  Schlüsselpaar und Endpunkt-Test gegen den Demo-Datensatz).
