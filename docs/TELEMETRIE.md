# Telemetrie- und CSV-Import

Phase 2 des Plans (§12 „Telemetrie-Import (UDP)“, §5.2, §6.6, §7.3): Ergebnisse müssen am Renntag nicht mehr abgetippt werden. Ein kleines **Companion-Programm** läuft auf einem PC in der Lobby, liest die UDP-Telemetrie von EA SPORTS F1® 25 und lädt nach jeder Session das Endergebnis als **Entwurf** auf die Website. Alternativ lässt sich eine **CSV** einfügen. Beides führt in **denselben Prüfbildschirm** wie die Handeingabe – veröffentlicht wird nichts automatisch.

```
F1 25 ──UDP 20777──► Companion (Lobby-PC) ──HTTPS POST /api/import──► Import-Stapel (Entwurf)
                         │                                                  │
                         └─ Sicherung ./telemetrie-export/*.json            ▼
                                                     Admin: Runde → Import → „Übernehmen“
                                                     → Ergebnis-Eingabe vorbefüllt → Speichern
```

## Ablauf am Renntag

1. **Einmalig:** Im Admin unter *Runden → Runde → Import → Telemetrie (UDP)* ein **Import-Token** erzeugen. Es wird genau einmal im Klartext angezeigt (gespeichert ist nur sein SHA-256-Hash) und gilt für die ganze Liga, bis es neu erzeugt oder widerrufen wird.
2. Vor dem Rennen die **Aufstellung im Grid-Builder** speichern bzw. veröffentlichen – zugeordnet wird über die **Startnummer** der Aufstellung.
3. Auf dem Lobby-PC das Companion starten (siehe unten) und die Sessions fahren.
4. Nach jeder Session (Quali, Sprint, Rennen) meldet das Programm „Hochgeladen: Import-Stapel #…“ mit einem Link.
5. Im Admin auf *Übernehmen* klicken: Die Ergebnis-Eingabe öffnet sich mit den importierten Werten und einem Hinweis „aus Import vom …“. Warnungen prüfen, fehlende Fahrer ergänzen, **Speichern**. Erst dann gibt es ein Ergebnis; der Stapel ist danach „übernommen“.
6. Weiter wie gewohnt: vorläufig veröffentlichen → Stewards → final.

## Spiel-Einstellungen (F1 25)

*Einstellungen → Telemetrie-Einstellungen* auf dem Gerät, das die Daten sendet (bei Konsolen die Konsole des Hosts oder eines Zuschauers, am PC das Spiel selbst):

| Einstellung | Wert |
|---|---|
| UDP-Telemetrie | **An** |
| UDP-Broadcast-Modus | Aus (nur im eigenen Netz sinnvoll; dann empfängt jeder PC im Netz) |
| UDP-IP-Adresse | IP des PCs mit dem Companion, z. B. `192.168.178.40` – läuft das Spiel auf demselben PC: `127.0.0.1` |
| UDP-Port | **20777** (oder denselben Wert wie `--port`) |
| UDP-Sendefrequenz | 20 Hz reicht (für das Endergebnis ist die Frequenz egal) |
| UDP-Format | **2025** (2024 wird ebenfalls gelesen; 2026 vorläufig wie 2025 – siehe Feldtest) |
| Telemetrie öffentlich machen | für das Endergebnis nicht nötig |

Wichtig für die Zuordnung: **Jeder Fahrer fährt mit seiner Liga-Startnummer.** Namen im Spiel werden nur angezeigt (im Crossplay oft „Player“ oder ausgeblendet).

Die IP-Adresse des PCs steht unter Windows in `ipconfig` (IPv4-Adresse). Die Windows-Firewall muss eingehendes UDP auf dem Port für Node.js erlauben (Windows fragt beim ersten Start).

## Companion-Programm

`tools/telemetry/companion.mjs` – Node.js ≥ 22, **keine Abhängigkeiten** (nur `node:dgram`). Aus dem Repo-Ordner starten:

```powershell
# Windows (PowerShell)
$env:LIGA_IMPORT_TOKEN = "liga_imp_…"
node tools/telemetry/companion.mjs --url https://liga.example
```

```bash
# macOS/Linux
LIGA_IMPORT_TOKEN='liga_imp_…' node tools/telemetry/companion.mjs --url https://liga.example
```

Das Token besser als Umgebungsvariable setzen als mit `--token` – dann steht es nicht in der Prozessliste oder in der Shell-Historie. Beenden mit Strg+C.

| Option | Bedeutung |
|---|---|
| `--url <adresse>` | Website (oder `LIGA_SITE_URL`); `https://` Pflicht, `http://` nur für `localhost` |
| `--token <token>` | Import-Token (oder `LIGA_IMPORT_TOKEN`) |
| `--port <n>` | UDP-Port, Standard 20777 |
| `--bind <adresse>` | Lausch-Adresse, Standard `0.0.0.0` (alle Netzwerkkarten) |
| `--out <ordner>` | Sicherungen, Standard `./telemetrie-export` |
| `--round <id>` | Runde fest vorgeben (ID aus `/admin/runden/<id>`) |
| `--session qualifying\|sprint\|race` | Session fest vorgeben |
| `--dry-run` | nichts hochladen, nur lokal sichern |
| `--record <datei>` | rohe UDP-Pakete zusätzlich mitschneiden (NDJSON) |
| `--replay <datei>` | Mitschnitt abspielen statt zu lauschen (`--speed 1` = Echtzeit) |
| `--upload <datei>` | gesicherten Export erneut hochladen (mit `--round`/`--session` überschreibbar) |
| `--sample <datei>` | Beispiel-Mitschnitt erzeugen (Rennen in Montreal, passt zur Demo-Runde 5) |
| `--verbose`, `--help`, `--version` | |

Kurzform im Projektordner: `npm run telemetry -- <Optionen>` (entspricht `node tools/telemetry/companion.mjs <Optionen>`).

### Was das Programm tut

- Dekodiert die Pakete **Session** (Id 1: Session-Typ, Strecke), **Participants** (Id 4: Startnummer, Name, Team, KI-Flag, Plattform), **Final Classification** (Id 8: Position, Status, Runden, Startplatz, beste Runde, Gesamtzeit, Stopps, Strafsekunden) und **Session History** (Id 11: Ersatz für die beste Runde). Parser: `tools/telemetry/f1-packets.mjs` (reine Funktionen, little-endian, packed).
- Nach der Final Classification (das Spiel schickt sie teils mehrfach – gleiche Inhalte zählen einmal) entsteht ein kompaktes JSON (`liga-telemetry/1`), das zuerst in `./telemetrie-export/` gesichert und dann an `POST /api/import` geschickt wird (`Authorization: Bearer <Token>`, bis zu 3 Versuche bei Netzwerk-/Serverfehlern).
- Fehlt das Teilnehmer-Paket (kommt alle ~5 s), wartet es bis zu 8 s darauf.
- Training und Zeitfahren werden nur gesichert, nicht hochgeladen.
- Unbekanntes UDP-Format → klare Meldung (einmal), z. B. „UDP-Format 2023 wird nicht unterstützt …“.

### Ohne Spiel testen

```bash
node tools/telemetry/companion.mjs --sample beispiel.ndjson
node tools/telemetry/companion.mjs --replay beispiel.ndjson --dry-run
# gegen den Dev-Server im Demo-Modus (Token vorher im Admin erzeugen):
LIGA_IMPORT_TOKEN='…' node tools/telemetry/companion.mjs --replay beispiel.ndjson --url http://localhost:4321
```

## Zuordnung auf der Website

**Session** (`src/lib/import/resolve.ts`):

- Automatisch: aktive Saison, Runde auf der Strecke mit `tracks.game_track_id` = Strecken-ID des Spiels, Start innerhalb **±36 h** um den Upload, nicht abgesagt. Pflege die Spiel-Strecken-ID im Admin unter *Strecken*.
- Session-Typ aus dem Spiel: Q1–Q3/Kurzes/Ein-Runden-Qualifying und Sprint-Shootout → *Qualifying*, Rennen → *Rennen*.
- **Sprint-Runden:** Das Spiel meldet Sprint und Hauptrennen einer Einzel-Session beide als „Rennen“ – dann antwortet der Server mit 422 und bittet um `--session sprint` bzw. `--session race`. „Rennen 2“ (Sprint-Wochenende im Spiel) gilt als Hauptrennen.
- Nicht eindeutig oder nichts gefunden → **422** mit Erklärung (z. B. welche Runden in ±36 h geplant sind). Die Sicherung bleibt lokal; nach der Korrektur `--upload <datei> --round <id> --session <typ>`.

**Fahrer** (`src/lib/import/map.ts`) über die Startnummer:

1. Eintrag der Aufstellung dieser Runde mit der Nummer (sonst Saisonaufstellung mit der Nummer zum Rennstart – mit Hinweis),
2. sonst der Fahrer, dem die Nummer zum Rennstart gehört (Nummern-Historie) – nur wenn er in der Aufstellung steht.

Warnungen: KI-Autos (ohne passende Nummer ignoriert; mit passender Nummer übernommen, z. B. nach Verbindungsabbruch), unbekannte/fehlende/doppelte Nummern, Fahrer außerhalb der Aufstellung, Aufstellungsfahrer ohne Import-Zeile, abweichendes Team im Spiel (nur echte Teams, generische ab ID 41 nicht), unsichere Status-Übersetzung. Beim *Übernehmen* wird mit der **aktuellen** Aufstellung neu zugeordnet – Korrekturen im Grid-Builder nach dem Upload zählen also.

**Werte:**

| Spiel | Liga |
|---|---|
| Status 3 „im Ziel“ | gewertet |
| 4 „DNF“, 7 „aufgegeben“ | DNF (Grund „zu wenige Runden“ → NC, „schwarze Flagge“ → DSQ mit Hinweis) |
| 5 „disqualifiziert“ | DSQ (mit Hinweis – Stewards prüfen) |
| 6 „nicht gewertet“ | NC |
| 2 „aktiv“ | gewertet, im Rennen mit Hinweis „bei Sessionende noch unterwegs“ (im Qualifying normal) |
| 1 „inaktiv“ | DNS mit Hinweis |
| 0 „ungültig“ / Position 0 | nicht übernommen |
| Gesamtzeit | Rennzeit + Ingame-Strafsekunden (passt zur Reihenfolge im Spiel) |
| Rückstand | aus den Runden (Runden des Siegers − eigene Runden) |
| Startplatz, Runden, Stopps, Strafsekunden, beste Runde | direkt |

## CSV-Import

*Runde → Import → CSV-Import*: Session wählen, Datei wählen oder Text einfügen, Vorschau mit Zuordnung und Warnungen, dann „Speichern und übernehmen“ (öffnet die Ergebnis-Eingabe) oder „Nur als Stapel speichern“.

```
Position;Startnummer;Gamertag;Status;Beste Runde;Gesamtzeit;Stopps;Strafsekunden
1;4;ApexAnna;gewertet;1:14.512;32:10.456;1;0
2;77;KerbKiller77;gewertet;1:14.803;32:14.120;1;5
3;16;LateBrakeLukas;DNF;1:15.020;;0;0
```

- Trennzeichen `;`, `,` oder Tab (auch Excel-Zeile `sep=;`), Excel-BOM, Windows-Zeilenenden; nicht-UTF-8-Dateien werden als Windows-1252 gelesen.
- Kopfzeile optional. Mit Kopfzeile ist die Reihenfolge frei und zusätzlich *Startplatz*, *Runden* und *Abstand* möglich; unbekannte Spalten werden ignoriert. Ohne Kopfzeile darf die Gamertag-Spalte fehlen (7 Spalten).
- Status: leer/gewertet, DNF, DNS, DSQ, NC (auch englisch: finished, retired, …). Zeiten wie in der Ergebnis-Eingabe (`1:23.456`, `1:23,456`, `45:12.345`); `+1 Runde` in der Gesamtzeit = eine Runde Rückstand, `+5.123` in der Gesamtzeit = **Abstand** zum Sieger (landet im Abstandsfeld der Ergebnis-Eingabe, nicht als Renndauer).
- Die Gesamtzeit ist die Zeit **inklusive Ingame-Strafen** (wie im Spiel angezeigt).

## Endpunkt `POST /api/import`

`src/pages/api/import.ts` (Worker, `prerender = false`, keine `loadLeague()`-Aufrufe):

| Antwort | Wann |
|---|---|
| 201 `{ batchId, reviewUrl, listUrl, matched, total, warnings }` | Stapel angelegt (Entwurf) |
| 200 `{ …, duplicate: true }` | dasselbe Endergebnis derselben Session ist schon als Stapel da (Entwurf oder übernommen) – z. B. Neuversuch nach Zeitüberschreitung; kein zweiter Stapel. Nach „Verwerfen“ legt ein erneuter Upload wieder einen Entwurf an |
| 400 | kein JSON / passt nicht zum Format (`details`) |
| 401 | Token fehlt oder falsch (Vergleich des SHA-256-Hashes in konstanter Zeit) |
| 413 | größer als 512 KB |
| 415 | kein `application/json` |
| 422 | Session nicht eindeutig zuzuordnen (`error` + `details`) |
| 429 | mehr als 30 Anfragen in 10 Minuten je IP (auch Fehlversuche) |
| 503 | kein Import-Token eingerichtet |

Gespeichert wird `import_batches` (`source` udp/csv, `raw` = geprüfte Rohdaten, `mapping` = Zuordnung zum Zeitpunkt des Imports, `status` draft → applied/discarded). Alle Aktionen (Upload, CSV, Verwerfen, Übernehmen, Token) landen im Audit-Log.

## Feldtest-Checkliste (vor dem ersten echten Einsatz)

Plan §12: *„Vorher per Feldtest prüfen, ob die Final Classification im Crossplay zuverlässig ankommt und welches UDP-Format (2025 oder 2026) gilt.“*

- [ ] Companion mit `--dry-run --record feldtest-<datum>.ndjson --verbose` auf dem Lobby-PC starten.
- [ ] Erste Meldung „Erste Pakete empfangen (UDP-Format …)“: Welches Format kommt an (mit und ohne 2026 Season Pack)? Bei 2026: Wird es gelesen oder kommt die Meldung „Format noch nicht dokumentiert“?
- [ ] Kurzes Qualifying und kurzes Rennen in einer **Crossplay-Lobby** (PC, PlayStation, Xbox) fahren – einmal als Host, einmal als Zuschauer/Teilnehmer.
- [ ] Kommt nach **jeder** Session „Endergebnis: …“? Auch wenn der Host die Session vorzeitig beendet? Auch bei Fahrern, die das Rennen verlassen haben (Status/KI-Übernahme)?
- [ ] Stimmen Startnummern aller Plattformen? Kommen Namen an oder „Player“ (Einstellung „Online-Namen anzeigen“)?
- [ ] Sprint-Wochenende: Welche Session-Typen meldet das Spiel für Sprint und Hauptrennen (15/16)?
- [ ] Qualifying im Format Q1–Q3: Kommt nach jedem Teil ein eigenes Endergebnis (dann entstehen bis zu drei Stapel für „Qualifying“)? Welcher Stapel enthält die komplette Reihenfolge aller 22 Fahrer? Nur diesen übernehmen, die anderen verwerfen – oder im Liga-Format „Kurzes“/„Ein-Runden-Qualifying“ fahren.
- [ ] Final Classification mit dem Ergebnis-Bildschirm vergleichen: Positionen, Status (DNF/DSQ), Gesamtzeit inkl. Strafen, beste Runde, Stopps.
- [ ] Mitschnitt mit `--replay` gegen den Dev-Server abspielen und in der Ergebnis-Eingabe prüfen.
- [ ] Ergebnis, Format und Auffälligkeiten hier dokumentieren; Mitschnitte als Test-Fixtures aufheben.

## Datenschutz

- Übertragen und gespeichert werden **nur Renndaten**: Positionen, Zeiten, Runden, Stopps, Strafsekunden, Status, Startnummern, Namen im Spiel, Team im Spiel, KI-Flag und Plattform-Code. Keine IP-Adressen, keine Konten, keine Chat- oder Sprachdaten, keine Fahrzeug-Telemetrie (Gas, Bremse, Position).
- Unbekannte Felder im Upload werden verworfen (zod), Namen von Steuerzeichen befreit.
- Import-Stapel sind nur für Admins sichtbar (Tabelle ohne öffentlichen Zugriff); öffentlich wird erst das gespeicherte Ergebnis.
- Das Token wird nur als SHA-256-Hash gespeichert und nie protokolliert. Für die Rate-Begrenzung wird die IP nur gesalzen gehasht (wie bei den Formularen, Löschung nach 30 Tagen).
- Die lokalen Sicherungen im Ordner `telemetrie-export` enthalten dieselben Renndaten – nach der Saison löschen.
