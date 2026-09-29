# Renntag-Runbook

Der Standardablauf eines Renntags – vom Übernehmen der Abmeldungen bis zum finalen Ergebnis –
mit konkreten Klickwegen im Admin-Bereich und einem Notfallplan. Zum Ausdrucken oder als zweiter
Bildschirm am Renntag. Uhrzeiten beziehen sich auf den Rennstart **T** (z. B. Donnerstag 20:00 Uhr);
die Fristen sind pro Saison einstellbar (Plan §11.1).

> **Verbindliche Quelle** für Regeln, Kalender und Ergebnisse ist die Website. Discord ist für die
> Kommunikation da – und der Fallback, wenn die Website ausfällt.

---

## Überblick (Plan §11.1)

| Wann | Wer | Was | Wo im Admin |
|---|---|---|---|
| bis **T − 24 h** | Admin | Abmeldungen aus Discord ins Grid übernehmen, Ersatzfahrer setzen, **Aufstellung veröffentlichen** | Runden → *Runde* → Grid-Builder |
| **T − 15 min** | Host | Lobby öffnen (Einstellungen laut `/liga/lobby`) | – (Spiel) |
| **Rennende + ≤ 2 h** | Admin | Ergebnis eintragen → **vorläufig veröffentlichen**, die Protestfrist startet | Runden → *Runde* → Ergebnis-Eingabe |
| **+ 48 h** (Protestfrist) | Fahrer | Vorfälle melden (danach ist das Formular zu) | öffentlich: `/stewards/melden` |
| **≤ 72 h nach Fristende** | Stewards | entscheiden und veröffentlichen, Strafen fließen ins Ergebnis | Stewards |
| **danach** | Admin | Ergebnis **final** setzen → Snapshot und Discord-Post | Runden → *Runde* → Ergebnis-Eingabe |

Die Übersichtsseite jeder Runde (Admin → *Runden (Grid & Ergebnisse)* → Runde anklicken) zeigt genau
diese Schritte als Checkliste mit Status und Direktlinks.

**Renntags-Freeze:** Am Renntag werden keine Code-Änderungen ausgerollt (Plan §7.6). Inhalte –
Aufstellung, Ergebnis, Urteile, News – gehen ganz normal raus. Wer programmiert, merged am Renntag nicht
nach `main`; ein Push würde vom Deploy-Workflow abgelehnt.

---

## Vorabend und Renntag bis T − 24 h: Aufstellung

**Admin**, am besten am Vorabend, spätestens 24 h vor dem Start.

1. Discord-Channel mit den Abmeldungen durchgehen und notieren: wer fehlt, kam die Abmeldung rechtzeitig?
2. Admin → **Renntag → Runden (Grid & Ergebnisse)** → die anstehende Runde (z. B. „R5 · Suzuka“)
   → Schritt 1 **„Grid-Builder“**.
3. Für jeden abgemeldeten Fahrer: **„abwesend“** + „rechtzeitig: ja/nein“.
4. Freie Cockpits besetzen: Reservefahrer aus dem **Reservepool** (rechts, in Wartelisten-Reihenfolge –
   der erste verfügbare rückt nach) auf das Cockpit ziehen. Am Handy: Cockpit antippen → Fahrer wählen.
5. **Prüfungen** kontrollieren: keine Doppelten, keine Nummernkonflikte, keine gesperrten Fahrer,
   höchstens 22 Fahrer.
6. **„Veröffentlichen“** (Häkchen „Discord-Post“ an) → `#aufstellung` bekommt die Liste.
7. Nach 1–3 Minuten auf der Rennseite (`/rennen/<saison>/<runde>` → Tab „Aufstellung“) kontrollieren.
8. Aufstellung zusätzlich im Discord **anpinnen** (Fallback).

Kurzfristige Absage nach der Veröffentlichung: im Grid-Builder anpassen und erneut veröffentlichen.

## T − 15 min: Lobby

**Host**

1. Lobby nach `/liga/lobby` einrichten (Crossplay an, Fahrhilfen, Wetter, Sessions …).
2. Einladungen verschicken; wer nicht in der Aufstellung steht, kommt nicht in die Lobby.
3. Lobby-Infos im Discord anpinnen (Fallback, falls die Website nicht erreichbar ist).
4. Optional: Rennen aufzeichnen/streamen (Twitch-VODs später nach YouTube exportieren, Twitch löscht sie).

## Nach dem Rennen (spätestens Rennende + 2 h): Ergebnis

**Admin** – geht gut vom Handy.

1. Endstand-Screenshots von **Qualifying**, ggf. **Sprint** und **Rennen** machen (inkl. beste Runden).
2. Admin → Runden → Runde → **„Ergebnis-Eingabe“**.
3. Session **Qualifying**: Reihenfolge herstellen (ziehen oder Positionsnummern), beste Runden im Format
   `1:23.456`. Die Pole setzt die Website selbst.
4. Session **Sprint** (nur bei Sprint-Runden) und **Rennen**: Reihenfolge, Status (DNF/DNS/DSQ),
   beste Runde, optional Abstand/Gesamtzeit, Stopps, **Ingame-Strafsekunden**.
5. **„Speichern als vorläufig“** → Vorschau der neuen Wertung prüfen (Punkte plausibel? Schnellste Runde richtig?).
6. **„Vorläufig veröffentlichen“** → Ergebnis ist öffentlich mit Banner „Vorläufig, Protestfrist bis …“,
   `#ergebnisse` bekommt den Post mit Podium, Pole, schnellster Runde und Protestfrist.
7. Nach 1–3 Minuten Rennseite und `/wertung` kontrollieren.

## Protestfrist (Standard 48 h): Vorfälle

**Fahrer** melden unter `/stewards/melden` (Clip-Link Pflicht, mit Zeitstempel).
Die Stewards sehen neue Meldungen in `#stewards-intern` und im Admin unter **Stewards**.
Nach Ablauf der Frist schließt das Formular für diese Runde automatisch; die Rennseite wird dann
ohne Zutun neu gebaut, damit Fristhinweis und „Vorfall melden“ stimmen.

## Bis 72 h nach Fristende: Entscheidungen

**Stewards**

1. Admin → **Renntag → Stewards** → Eingang, Filter auf die Runde.
2. Meldung öffnen → Status **„in Prüfung“** → Clip ansehen, bei Bedarf beide Seiten auf Discord anhören.
3. **Entscheidung** erfassen: Art (keine Strafe, Verwarnung, Zeitstrafe, Positionsstrafe, Grid-Strafe
   nächstes Rennen, DSQ, Rennsperre), Begründung (DE Pflicht, EN optional, Textbausteine mit Fallcode
   aus dem Strafenkatalog), Paragraf.
4. Beteiligte Stewards können nicht entscheiden (Befangenheit – das System sperrt sie).
   Bei aktivem **Vier-Augen-Prinzip** bestätigt ein zweiter Steward.
5. **„Veröffentlichen“** → Register, Rennseite, Fahrerprofil, Post in `#urteile`;
   Zeit-/Positions-/DSQ-Strafen werden **automatisch** ins Ergebnis eingerechnet.
6. Unbegründete oder verspätete Meldungen: Status „abgelehnt“ bzw. „verspätet“ mit kurzer Notiz.

## Danach: final

**Admin**

1. Runden-Übersicht: Schritt „Stewards entscheiden“ ist erledigt (keine offenen Vorfälle, keine Entwürfe,
   Frist abgelaufen).
2. Ergebnis-Eingabe → **„Final setzen“** → Wertungs-Snapshot („Stand nach Runde X“) und Post in `#ergebnisse`.
3. Optional: Rennbericht als News (Kategorie „Rennbericht“, Rennen verknüpfen) und VOD-/Highlight-Link
   im Kalender eintragen.

**Später noch ein Fehler entdeckt?** Ergebnis-Eingabe → „Korrigieren“ mit Pflicht-Grund. Der Hinweis
„Korrigiert am … (Grund)“ steht öffentlich auf der Rennseite, Discord bekommt einen Post.

---

## Checkliste zum Abhaken

```
Runde: R__ · ______________   Datum: __.__.____   Start: __:__

[ ] T-24h  Abmeldungen übernommen, Ersatz gesetzt, Prüfungen grün
[ ] T-24h  Aufstellung veröffentlicht + im Discord angepinnt
[ ] T-15m  Lobby offen, Lobby-Infos angepinnt
[ ] +2h    Ergebnis Quali / (Sprint) / Rennen eingetragen, Vorschau geprüft
[ ] +2h    Vorläufig veröffentlicht, Rennseite und Wertung kontrolliert
[ ] +48h   Protestfrist abgelaufen (Formular zu)
[ ] +72h   Alle Vorfälle entschieden/abgelehnt, Urteile veröffentlicht
[ ]        Final gesetzt, Snapshot + Discord-Post
[ ]        (optional) Rennbericht, VOD-Link
```

---

## Notfall: Website oder Admin nicht erreichbar

**Discord ist der Fallback** (Plan §11.4). Die Liga läuft weiter, die Website wird nachgezogen.

| Problem | Sofortmaßnahme | Danach |
|---|---|---|
| Website komplett nicht erreichbar | In Discord `#ankündigungen` posten: „Website gestört, es gilt die angepinnte Aufstellung und Lobby-Info.“ Rennen findet statt. | Technik informieren. Status prüfen: https://www.cloudflarestatus.com und https://status.supabase.com |
| Admin-Login klappt nicht („Kein Zugang“, Fehler bei Discord) | Anderen Admin bitten; Discord-Status prüfen (https://discordstatus.com) | Rolle/Zuordnung prüfen ([Admin-Handbuch](ADMIN-HANDBUCH.md#häufige-fragen-und-probleme)) |
| Ergebnis kann nicht eingetragen werden | Endstand-Screenshots in `#ergebnisse` posten mit „vorläufig, offizielle Eintragung folgt“ | Eintragen, sobald es geht; **die Protestfrist beginnt erst mit der Veröffentlichung auf der Website** |
| Veröffentlicht, aber die Seite ändert sich nicht | 10 Minuten warten | GitHub → Actions → „Deploy“: letzter Lauf rot? Log an die Technik. Notfalls dort „Run workflow“ starten |
| Deploy-Lauf rot mit „Renntags-Freeze“ | Nichts tun – das betrifft nur Code, nicht Inhalte | Code am nächsten Tag ausrollen lassen |
| Vorfall-Formular geht nicht | Stewards nehmen Meldungen per Discord-Ticket entgegen (mit Clip-Link) | Steward trägt sie als eigene Untersuchung ein |
| Discord-Posts der Website fehlen | Selbst posten | Webhook-URL unter Einstellungen prüfen (Webhook evtl. gelöscht) |
| Datenbank kaputt / Daten versehentlich gelöscht | **Nichts weiter ändern!** Technik informieren | Wiederherstellung aus dem Backup ([BETRIEB.md](BETRIEB.md#wiederherstellung)) |

**Kontakte im Notfall** (vor Saisonbeginn ausfüllen, im Discord-Staff-Channel anpinnen):

| Rolle | Name (Discord) | erreichbar |
|---|---|---|
| Technik 1 | | |
| Technik 2 | | |
| Liga-Leitung | | |
| Chef-Steward | | |

**Code-Hotfix am Renntag** (nur wenn etwas Wichtiges kaputt ist, z. B. die Anmeldung): Technik startet
GitHub → Actions → **Deploy** → „Run workflow“ mit Häkchen **„Renntags-Freeze ignorieren“** und
dokumentiert den Grund im Staff-Channel.
