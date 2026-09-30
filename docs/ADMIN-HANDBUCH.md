# Admin-Handbuch

Für alle, die die Liga-Website pflegen: **Admins**, **Stewards** und **Redaktion**.
Du brauchst keine Programmierkenntnisse. Der Admin-Bereich funktioniert auch auf dem Handy –
am Renntag kannst du Ergebnisse also direkt aus der Lobby eintragen.

Den genauen Ablauf eines Renntags mit Uhrzeiten beschreibt das [Renntag-Runbook](RENNTAG-RUNBOOK.md).

**Inhalt**

- [Grundlagen](#grundlagen): Anmelden, Rollen, Veröffentlichen, Adressen, Sprachen, Markdown
- Liga: [Dashboard](#dashboard) · [Saisons](#saisons) ([Strafpunkte](#strafpunkte-einstellen)) · [Punkteschemata](#punkteschemata) ·
  [Kalender](#kalender) ([Strecken](#strecken)) · [Teams & Cockpits](#teams--cockpits) · [Fahrer](#fahrer) · [Anmeldungen](#anmeldungen) ·
  [Auszeichnungen](#auszeichnungen)
- Renntag: [Runden-Übersicht](#runden-übersicht) · [Grid-Builder](#grid-builder) ·
  [Ergebnis-Eingabe](#ergebnis-eingabe) · [Import (Telemetrie/CSV)](#import-telemetrie-und-csv) · [Stewards](#stewards)
- Inhalte: [News](#news) · [Regelwerk](#regelwerk) · [Seiten-Inhalte](#seiten-inhalte) · [Social-Grafiken](#social-grafiken) ·
  [Stream-Overlays](#stream-overlays)
- System: [Kontaktanfragen](#kontaktanfragen) · [Einstellungen](#einstellungen) ([Discord-Bot](#discord-bot)) · [Audit-Log](#audit-log)
- [Häufige Fragen und Probleme](#häufige-fragen-und-probleme)

---

## Grundlagen

### Anmelden

1. `https://<liga-domain>/admin` öffnen → „**Mit Discord anmelden**“.
2. Beim ersten Mal fragt Discord, ob die Liga-Website deinen Benutzernamen sehen darf
   (nur „identify“ – keine E-Mail, keine Server-Liste). Bestätigen.
3. Du landest im **Dashboard**. Welche Module du siehst, hängt von deiner Rolle ab.

Zum **Abmelden** oben rechts auf „Abmelden“. Auf fremden Geräten immer abmelden.

**Demo-Modus:** Auf der Vorschau (z. B. einem Pull-Request-Link) oder lokal gibt es statt Discord
Knöpfe wie „Als Demo-Admin“. Dort ist alles erfunden, Änderungen verschwinden beim Neustart.
Ideal zum Üben.

### Rollen

Die Rechte folgen **deiner Rolle auf dem Discord-Server der Liga** (Plan §5):

| Discord-Rolle | App-Rolle | Darf |
|---|---|---|
| @Admin | Admin | alles, inklusive Redaktion. Nur Admins: Liga-Daten, Grid und Ergebnisse, **Import**, **Auszeichnungen**, Regelwerk, Kontaktanfragen, Einstellungen, Audit-Log |
| @Steward | Steward | Vorfälle prüfen, Entscheidungen (inkl. Strafpunkte) treffen und veröffentlichen |
| @Redaktion | Redakteur | News, FAQ, Orga-Team, offene Rollen, Partner, Startseiten-Texte, **Social-Grafiken**, **Stream-Overlays** |

- Die Rolle wird bei jeder Anmeldung und spätestens **alle 15 Minuten** neu geprüft.
  **Wer die Discord-Rolle verliert, verliert sofort den Zugang.** Neue Rollen wirken spätestens nach
  15 Minuten oder nach Ab- und wieder Anmelden.
- Wer im Admin „Kein Zugang“ sieht, hat keine der drei Rollen – Liga-Leitung auf Discord fragen.

### Was ist wann öffentlich?

Die öffentliche Website besteht aus fertig gebauten Seiten (deshalb ist sie so schnell). Nach jedem
**Veröffentlichen** (Ergebnis, Aufstellung, Urteil, News, Kalender, Regelwerk, Seiten-Inhalte,
Auszeichnungen, Strafpunkte-Einstellungen) baut sie sich automatisch neu:

- Mehrere Änderungen kurz hintereinander werden **gebündelt** – etwa 60 Sekunden nach der letzten
  Änderung startet ein Build.
- **Nach etwa 1–3 Minuten** ist alles online. Kurz warten und die Seite neu laden (ggf. Strg + F5).
- Entwürfe sind nie öffentlich.

Formulare (Anmeldung, Vorfall melden, Kontakt) und der Admin-Bereich selbst sind immer live.
Die [Stream-Overlays](#stream-overlays) und der [Discord-Bot](#discord-bot) lesen direkt aus der
Datenbank – sie brauchen keinen Rebuild (Overlays zeigen Änderungen nach spätestens etwa einer Minute).

### Adressen (Slugs) und Umbenennungen

Viele Seiten haben einen sprechenden Adressteil, den **Slug**: `/fahrer/kurvenkoenig`,
`/teams/mclaren`, `/saison/2/wertung`, `/news/saison-2-startet`. Er wird meist automatisch aus dem
Namen erzeugt.

- **Umbenennen ist erlaubt.** Änderst du den Slug eines Fahrers, Teams, einer Saison oder eines
  veröffentlichten News-Artikels, merkt sich die Website die alte Adresse und **leitet sie dauerhaft
  auf die neue weiter** – geteilte Links und Suchmaschinen-Einträge funktionieren weiter.
- Nach dem nächsten Rebuild (1–3 Minuten) ist die neue Adresse online und die alte leitet weiter.
  Bis dahin zeigt die alte Adresse noch die bisherige Seite, die neue ist noch nicht erreichbar.
- Einen Slug nicht „im Kreis“ tauschen (A → B und B → A zwischen zwei Fahrern) – das verwirrt Besucher.
- Ändert sich nur der **Anzeigename** (z. B. Gamertag), bleibt der Slug gleich, solange du ihn
  nicht selbst änderst.
- **Reservierte Slugs:** Bei Fahrern und Teams sind Namen fester Unterseiten gesperrt, z. B.
  `vergleich` und `compare` (wegen `/fahrer/vergleich` bzw. `/en/drivers/compare`), außerdem
  `head-to-head`, `h2h`, `statistik`, `stats`, `index`. Ein selbst eingetragener reservierter Slug wird
  abgelehnt; ein automatisch erzeugter bekommt einen Zähler (z. B. `vergleich-2`).

### Zwei Sprachen

Alle Inhalte haben ein **deutsches** Feld (Pflicht) und ein **englisches** (optional). Fehlt Englisch,
zeigt die englische Seite den deutschen Text mit dem Hinweis „Not yet translated“. Das Dashboard
listet fehlende Übersetzungen, damit die Redaktion sie nachtragen kann.
**Beim Regelwerk ist immer die deutsche Fassung verbindlich.**

### Markdown (Textformatierung)

News, Regelwerk, FAQ und Begründungen werden mit einfachen Zeichen formatiert. Die Vorschau im Editor
zeigt das Ergebnis.

| Du schreibst | Ergebnis |
|---|---|
| `**fett**` | **fett** |
| `*kursiv*` | *kursiv* |
| `## Zwischenüberschrift` | Überschrift |
| `- Punkt` (jede Zeile) | Aufzählung |
| `1. Schritt` | nummerierte Liste |
| `[Kalender](/kalender)` | Link auf eine Seite der Website |
| `[Regel 3.4](/liga/regelwerk#p3-4)` | Link direkt auf einen Paragrafen |
| `[Video](https://youtu.be/…)` | externer Link (öffnet in neuem Tab) |
| `> Zitat` | eingerücktes Zitat |
| Tabelle mit `\|` | Tabelle (siehe Strafenkatalog im Regelwerk) |

HTML-Code wird aus Sicherheitsgründen **nicht** ausgeführt, sondern als Text angezeigt.

### Zeiten

Alle Termine werden in **deutscher Zeit (Europe/Berlin)** eingegeben – Sommer- und Winterzeit
rechnet die Website selbst um. Besucher aus anderen Zeitzonen sehen zusätzlich ihre Ortszeit.

---

## Dashboard

*Alle Rollen · `/admin`*

Das Dashboard zeigt, was als Nächstes zu tun ist:

- das **nächste Rennen** mit Termin und Link zur Runde,
- **offene Aufgaben**: neue Anmeldungen, offene Vorfälle, vorläufige Ergebnisse, ablaufende
  Protestfristen, fehlende Übersetzungen,
- je nach Rolle nur die Aufgaben, die dich betreffen.

---

## Saisons

*Admin · Liga → Saisons*

Eine Saison bündelt Kalender, Teams, Cockpits, Punkteschema und Regeln.

**Neue Saison anlegen** – am einfachsten „**Aus Vorsaison klonen**“: übernimmt Punkteschema,
Lobby-Einstellungen, Teams und Einstellungen; den Kalender legst du danach neu an.

| Feld | Bedeutung |
|---|---|
| Nummer / Name | z. B. 2 / „Saison 2“ – die Nummer erscheint in Adressen (`/saison/2/wertung`) |
| Spielversion | z. B. „F1 25 · 2026 Season Pack“ – steht überall gleich auf der Website |
| Punkteschema | siehe [Punkteschemata](#punkteschemata) |
| Reservepunkte für Konstrukteure | ja = Punkte von Ersatzfahrern zählen für das Team; ein Hinweis erscheint in der Wertung |
| Protestfrist (Stunden) | Standard 48 h ab „vorläufig veröffentlicht“ |
| Vier-Augen-Prinzip | Urteile brauchen die Stimme eines zweiten Stewards |
| Strafpunkte | eigener Abschnitt „Strafpunkte“ auf der Saisonseite, siehe [unten](#strafpunkte-einstellen) |
| Lobby-Einstellungen | Gruppen wie Lobby, Fahrhilfen, Wochenende, Wetter … – erscheinen auf `/liga/lobby` |
| Regelwerk-Version | welche Fassung für die Saison gilt |
| Status | **geplant** → **aktiv** (nur eine Saison gleichzeitig) → **abgeschlossen** |

**Saison abschließen:** Status „abgeschlossen“ – die Saison wird **eingefroren** (nur noch lesbar),
Champions landen in der Hall of Fame. Den Rookie of the Year vorher unter
[Auszeichnungen](#auszeichnungen) wählen. Ablauf: [BETRIEB.md → Saisonwechsel](BETRIEB.md#saisonwechsel).

### Strafpunkte einstellen

*Admin · Liga → Saisons → Saison → Abschnitt „Strafpunkte“*

Stewards können zusätzlich zur Strafe **Strafpunkte** vergeben. Sie sammeln sich auf einem Konto je
Fahrer und Saison. Laut Regelwerk (§8.4) legt die Liga-Leitung **vor dem ersten Rennen** fest, ob das
System gilt und mit welchen Werten.

| Feld | Bedeutung |
|---|---|
| Strafpunkte-System in dieser Saison aktiv | Schalter. Aus = kein Strafpunkte-Feld, keine Konten, nichts öffentlich |
| Verwarnschwelle (Punkte) | ab dieser Summe **aktiver** Punkte: Verwarnung (1–98) |
| Sperrschwelle (Punkte) | ab dieser Summe: Rennsperre prüfen (2–99, größer als die Verwarnschwelle) |
| Verfall | **nie** (Punkte gelten bis Saisonende) oder **nach N Runden** (1–30) |

- **Standardwerte**, solange nichts gespeichert ist: Sperre ab 12, Verwarnung ab 8 Punkten
  (zwei Drittel der Sperrschwelle, aufgerundet), kein Verfall.
- **Verfall:** gezählt ab der Runde des Vorfalls, abgesagte Runden zählen nicht. Beispiel 3: Punkte aus
  R2 gelten in R3 bis R5 und verfallen, sobald R5 gewertet ist (Ergebnis vorläufig, final oder korrigiert).
- Es zählen nur **veröffentlichte** Entscheidungen – keine Entwürfe, keine zurückgenommenen.
- Das Konto zeigt nur den Stand. Eine **Rennsperre** sprechen die Stewards als eigene Entscheidung aus.
- Unter dem Formular stehen die **aktuellen Konten** (aktiv, verfallen, Status) mit Link zum
  Steward-Werkzeug.
- **Ausschalten:** Die Punkte bleiben in den Entscheidungen gespeichert, werden aber nirgends mehr
  gezeigt oder gezählt.
- Öffentlich (nur bei aktivem System): Abschnitt „Strafpunkte“ auf `/stewards`, Konto im Fahrerprofil,
  Hinweiskasten mit Schwellen und Verfall im Regelwerk. Speichern löst einen Rebuild aus.
- In einer abgeschlossenen (eingefrorenen) Saison lässt sich nichts mehr ändern.

---

## Punkteschemata

*Admin · Liga → Punkteschemata*

Punkte je Platz für **Rennen** und **Sprint**, Bonus für die **schnellste Runde** (optional nur, wenn
der Fahrer in den Top N ist) und **Pole-Bonus**. Vorlagen: „F1 aktuell“, „F1 mit Bonus für die
schnellste Runde“, „bis P22“.

- Ein Schema, das schon in einer Saison mit Ergebnissen benutzt wird, nicht mehr ändern –
  lieber ein neues anlegen.
- **Gleichstand** löst die Wertung per Countback auf (mehr Siege, dann mehr 2. Plätze usw.).

---

## Kalender

*Admin · Liga → Kalender*

Runden anlegen – einzeln oder im **Stapel** (z. B. „jeden Donnerstag 20:00 ab …“):

| Feld | Hinweis |
|---|---|
| Runde | fortlaufende Nummer; auf der Website heißt das Rennen z. B. „**R5 · Suzuka**“ |
| Strecke | Auswahl aus der Streckenliste (nach Ort benannt, keine offiziellen Event-Titel) |
| Datum und Uhrzeit | in deutscher Zeit |
| Format | Standard oder **Sprint** (dann gibt es zusätzlich eine Sprint-Session) |
| Status | geplant · Aufstellung veröffentlicht · vorläufig · final · korrigiert · **abgesagt** |
| VOD- / Highlight-Link | YouTube oder Twitch, erscheint auf der Rennseite unter „Medien“ |

Eine **abgesagte** Runde bleibt im Kalender sichtbar (als „abgesagt“ markiert) und zählt nicht zur Wertung.
Terminverschiebung: Datum/Uhrzeit ändern und speichern – Countdown und Kalender-Abo passen sich an.

### Strecken

*Admin · Liga → Kalender → Strecken*

Die Streckenliste ist mit allen Strecken aus dem Spiel vorbelegt. Je Strecke: Name DE/EN (nach dem
**Ort**, keine offiziellen Event-Titel), Land (für die Flagge), Slug, Länge, Standard-Rundenzahl und die
**Spiel-ID (UDP)**. Die Spiel-ID ist vorbelegt und nötig, damit der
[Telemetrie-Import](#import-telemetrie-und-csv) die Runde automatisch findet – nicht ändern, außer ein
Spiel-Update verlangt es.

**Streckenseiten:** Jede Strecke, die in einem Liga-Kalender vorkommt, hat eine öffentliche Seite
`/strecken/<slug>` (Übersicht unter `/strecken`) mit Karte, Streckendaten, nächster Runde und Rekorden
aus allen gewerteten Ergebnissen. Wird der Slug einer Strecke geändert, gibt es **keine** Weiterleitung
von der alten Adresse.

**Streckenkarte** (optional, erscheint auf der Rennseite, im Kalender und auf der Streckenseite):

| Feld | Hinweis |
|---|---|
| Karte (SVG-Umriss) | eine eigene Datei, die im Repository unter `public/brand/tracks/<name>.svg` liegt (Technik fragen), **oder** eine `https://…`-Adresse, die auf `.svg` endet. Leer = keine Karte |
| Quelle / Lizenz | **Pflicht bei fremden Karten**, z. B. „Wikimedia Commons, CC BY-SA 4.0“ – wird unter der Karte angezeigt |

Die Vorschau zeigt die Karte auf dunklem und hellem Grund; beide sollten gut lesbar sein.
**Kein offizielles F1- oder Spiel-Material** verwenden (Markenrecht, Plan §9.1) – nur selbst
gezeichnete Umrisse oder Karten aus offenen Quellen mit passender Lizenz.

---

## Teams & Cockpits

*Admin · Liga → Teams & Cockpits*

- **Teams:** Name, Kürzel, **Teamfarbe** (erscheint nur als schmaler Streifen), Reihenfolge.
  Keine Logos (Markenrecht).
- **Saisonaufstellung:** pro Team zwei Cockpits mit Stammfahrer.
- **Transfer während der Saison:** neuen Fahrer ins Cockpit setzen mit „**gültig ab Runde X**“ –
  frühere Ergebnisse bleiben beim alten Team.
- **Rückwirkende Transfers** (Saisonaufstellung, `/admin/teams/aufstellung`): Liegt „gültig ab Runde X“
  auf oder vor der letzten gewerteten Runde (Ergebnis vorläufig, final oder korrigiert), ändert der
  Wechsel rückwirkend die Cockpit-Zuordnung dieser Runden – und damit deren Konstrukteurspunkte. Dann
  verlangt das Formular das Häkchen „**Rückwirkende Änderung bestätigen**“; ohne Häkchen wird der
  Wechsel abgelehnt. Im Normalfall eine spätere Runde wählen.
- **Einträge korrigieren** (Fehlerkorrektur): Entfernen eines Cockpit-Eintrags braucht ebenfalls eine
  Bestätigung; betrifft der Eintrag gewertete Runden, nennt die Bestätigung sie.
- Team-Slugs: siehe [reservierte Slugs](#adressen-slugs-und-umbenennungen).

---

## Fahrer

*Admin · Liga → Fahrer*

| Feld | Öffentlich? | Hinweis |
|---|---|---|
| Gamertag | ja | Groß-/Kleinschreibung egal bei der Duplikat-Prüfung |
| Startnummer | ja | siehe unten |
| Flagge (Nationalität) | ja, optional | |
| Plattform | ja | PC (Steam), PC (EA App), PlayStation, Xbox – als Text-Badge, keine Konsolen-Logos |
| Eingabegerät | **nein** | Lenkrad oder Controller – nur für die Orga |
| Status | ja | aktiv (Stamm), Reserve (mit Position in der Warteliste), inaktiv, gesperrt |
| Twitch-/YouTube-Link | nur wenn „Links zeigen“ an | nur auf Wunsch des Fahrers |
| Discord-Name, Discord-ID, EA-ID, Notizen | **nein** | nur im Admin |
| Slug (Adresse) | ja | aus dem Gamertag erzeugt; bei Änderung leitet die alte Adresse weiter; reservierte Slugs wie `vergleich` sind gesperrt (siehe [Adressen](#adressen-slugs-und-umbenennungen)) |

Technisch sieht die öffentliche Website Fahrer nur über eine eigene, gefilterte Sicht der Datenbank –
was oben mit „nein“ markiert ist, kann nicht versehentlich auf einer Seite landen.

**Neuer Fahrer aus einer Anmeldung:** in [Anmeldungen](#anmeldungen) auf „Annehmen“ – die Daten
werden übernommen.

**Startnummern** (Plan §1):

- **Vergeben:** 2–99; die 1 ist ggf. dem Champion vorbehalten. Eine Nummer ist immer nur einmal aktiv.
- **Wechseln:** nur mit Admin-OK; der Wechsel gilt **ab dem nächsten Rennen**. Die alte Nummer bleibt in der
  Historie auf dem Profil sichtbar.
- **Freigeben:** bei inaktiven Fahrern, damit andere sie wählen können.

**Löschwunsch eines Fahrers:** nicht löschen, sondern **pseudonymisieren** – aus dem Gamertag wird
„Ehemaliger Fahrer #123“, private Daten werden entfernt, Wertungen bleiben stimmig (Plan §6.7).

---

## Anmeldungen

*Admin · Liga → Anmeldungen*

Hier landet jede Anmeldung aus dem Formular `/mitfahren`. Gleichzeitig kommt eine kurze Meldung in
`#anmeldungen` auf Discord (nur Gamertag, Plattform, Wunschnummer – der Discord-Name steht nur hier).

Status: **neu** → **kontaktiert** → **angenommen** / **Warteliste** / **abgelehnt**.

1. Anmeldung öffnen, Angaben prüfen (Doppelte Anmeldungen werden markiert).
2. Person auf Discord anschreiben → Status „kontaktiert“, Notiz ergänzen.
3. „**Annehmen**“ legt den Fahrer an (Stamm oder Reserve) – danach Nummer vergeben und ggf. ins Cockpit setzen.
4. Abgelehnte Anmeldungen werden nach 6 Monaten automatisch gelöscht (Datenschutz).

Den **Anmeldestatus** auf der Startseite („offen, X Cockpits frei“ / „Warteliste“) stellst du unter
[Seiten-Inhalte → Texte](#seiten-inhalte) (Redaktion und Admins) bzw. [Einstellungen](#einstellungen)
(Admins) ein – beide Formulare pflegen dieselben Werte. `/mitfahren` zeigt dazu „Stand: …“ mit dem
Datum der letzten Änderung.

---

## Auszeichnungen

*Admin · Liga → Auszeichnungen* (`/admin/auszeichnungen`)

Oben die Saison wählen („Anzeigen“).

**Saison-Auszeichnungen**

- **Fahrer- und Konstrukteurs-Champion** setzt der Saisonabschluss automatisch – hier nur Anzeige.
- **Rookie of the Year:** Fahrer wählen → „Setzen“ bzw. „Ändern“, „Entfernen“ zum Löschen. Zur
  Auswahl stehen Fahrer mit veröffentlichtem Rennergebnis in der Saison; „Debüt“ heißt: in keiner
  früheren Saison gefahren. Er erscheint mit der abgeschlossenen Saison in der Hall of Fame.

**Fahrer des Tages je Runde** (Driver of the Day)

1. Möglich, sobald das Ergebnis der Runde veröffentlicht ist (vorläufig, final oder korrigiert).
2. Bei der Runde den Fahrer aus dem Rennergebnis wählen → „Speichern“ (bzw. „Ändern“).
3. Optional „**In Discord posten**“ – geht an den Webhook „Ergebnisse“ (`#ergebnisse`). Ohne
   eingetragenen Webhook ist das Häkchen ausgegraut.
4. „Entfernen“ löscht die Auszeichnung wieder.

Öffentlich erscheint der Fahrer des Tages auf der Rennseite, im Fahrerprofil und als Rangliste in der
Hall of Fame. Jede Änderung löst einen Rebuild aus und steht im Audit-Log.

Ebenfalls öffentlich (ohne Pflege im Admin): der **Fahrer-Vergleich** `/fahrer/vergleich`
(Head-to-Head zweier Fahrer über alle Saisons oder eine Saison, aus den veröffentlichten Ergebnissen).

---

## Runden-Übersicht

*Admin · Renntag → Runden (Grid & Ergebnisse)*

Jede Runde hat eine Übersichtsseite mit der **Renntag-Checkliste**:

1. Aufstellung veröffentlichen → [Grid-Builder](#grid-builder)
2. Ergebnis eintragen → [Ergebnis-Eingabe](#ergebnis-eingabe)
3. Vorläufig veröffentlichen
4. Stewards entscheiden → [Stewards](#stewards)
5. Final setzen

Jeder Schritt zeigt „erledigt“, „offen“ oder „noch nicht möglich“ und führt per Link direkt zur Aufgabe.

Darunter:

- **Import (Telemetrie/CSV):** Link „Zum Import“, mit Hinweis auf offene Import-Stapel
  (siehe [Import](#import-telemetrie-und-csv)).
- **Social-Grafiken:** passende Motive je Rundenstatus, die direkt das
  [Grafik-Werkzeug](#social-grafiken) mit dieser Runde öffnen – vor dem Rennen „Race-Week“ (nach
  veröffentlichter Aufstellung zusätzlich „Aufstellung“), ab „vorläufig“ „Ergebnis“, „Pole“,
  „Startaufstellung“ und „Fahrerwertung“.

---

## Grid-Builder

*Admin · Runde → Grid-Builder* (Plan §5.1)

1. **Vorbelegung:** 22 Cockpits aus der Saisonaufstellung, 11 Team-Spalten zu je 2 Plätzen.
   Rechts steht der **Reservepool** in Wartelisten-Reihenfolge.
2. **Abmeldungen aus Discord übernehmen:** beim Fahrer „**abwesend**“ wählen und angeben, ob die
   Abmeldung **rechtzeitig** kam (zählt für die Statistik und spätere Fehlstrafen). Das Cockpit wird frei.
3. **Ersatz setzen:**
   - mit der Maus: Reservefahrer auf das freie Cockpit **ziehen**,
   - per Tastatur oder am Handy: Cockpit wählen → Fahrer wählen.
   Die Website merkt sich „ersetzt X“ und zeigt es auf der Rennseite an.
4. **Prüfungen** (rechts bzw. unten) meldet: Fahrer doppelt? Nummernkonflikt? Gesperrter Fahrer?
   Mehr als 22 Fahrer? – erst beheben, dann veröffentlichen.
5. „**Veröffentlichen**“ – die Aufstellung erscheint auf der Rennseite, optional mit Post in `#aufstellung`.

Spätere Änderungen (kurzfristige Absage): einfach anpassen und erneut veröffentlichen.

---

## Ergebnis-Eingabe

*Admin · Runde → Ergebnis-Eingabe* (Plan §5.2)

Pro Session (**Qualifying**, ggf. **Sprint**, **Rennen**), vorbefüllt mit der veröffentlichten Aufstellung –
oder mit den Werten eines Import-Stapels, wenn du über [Import](#import-telemetrie-und-csv) →
„Übernehmen“ kommst.

1. **Reihenfolge** herstellen: per Drag & Drop oder Positionsnummer eintragen.
2. Je Fahrer: **Status** (gewertet, DNF, DNS, DSQ), **beste Runde** im Format `1:23.456`,
   optional Gesamtzeit bzw. Abstand, Boxenstopps und **Ingame-Strafsekunden**.
3. Automatisch berechnet: **Pole** (aus dem Qualifying), **schnellste Runde** (aus den Rundenzeiten),
   **Punkte** nach dem Saisonschema, **Startplatz** (inkl. Grid-Strafen aus Urteilen der Vorrunde) und
   Positionsgewinne.
4. „**Speichern als vorläufig**“ – zeigt eine **Vorschau der neuen Wertung**. Noch nicht öffentlich.
5. „**Vorläufig veröffentlichen**“ – das Ergebnis ist sichtbar mit Banner „Vorläufig, Protestfrist bis …“,
   die **Protestfrist startet** und `#ergebnisse` bekommt einen Post.
6. Nach den Steward-Entscheidungen: „**Final setzen**“ – ein **Wertungs-Snapshot** wird gespeichert
   (für „Stand nach Runde X“ und den Punkteverlauf) und `#ergebnisse` bekommt einen Post.

**Korrektur nach „final“:** „Korrigieren“ mit **Pflicht-Grund**. Status „korrigiert“, der Grund ist
öffentlich auf der Rennseite sichtbar, dazu ein Discord-Post.

Tipp: Zeit- und Positionsstrafen der Stewards **nicht** von Hand in die Reihenfolge einarbeiten –
das macht die Website beim Veröffentlichen des Urteils selbst.

---

## Import (Telemetrie und CSV)

*Admin · Runde → Import* (`/admin/runden/<id>/import`, auch über „Import (UDP/CSV)“ in der Ergebnis-Eingabe)

Statt abzutippen: Das Endergebnis kommt aus der **UDP-Telemetrie** des Spiels (Companion-Programm auf
einem PC in der Lobby) oder aus einer **CSV**. Beides landet als **Entwurf** in einem Import-Stapel und
führt in dieselbe Ergebnis-Eingabe – **veröffentlicht wird nichts automatisch**. Technik, Spiel-
Einstellungen und Feldtest: [TELEMETRIE.md](TELEMETRIE.md).

**Vorher:** Aufstellung im [Grid-Builder](#grid-builder) speichern bzw. veröffentlichen. Zugeordnet wird
**nur über die Startnummer** – jeder Fahrer fährt im Spiel mit seiner Liga-Startnummer.

### Import-Stapel

Je Stapel: Nummer und Quelle (Telemetrie oder CSV), Zeitpunkt, Session, „Zugeordnet x / y“, Hinweise und
Status **Entwurf** → **übernommen** bzw. **verworfen**.

1. Hinweise lesen (z. B. unbekannte Startnummer, Fahrer nicht in der Aufstellung, KI-Auto, DSQ aus dem
   Spiel → Stewards prüfen).
2. „**Übernehmen**“ öffnet die Ergebnis-Eingabe dieser Session, vorbefüllt und mit dem Kasten
   „Vorbefüllt aus Import vom …“. Zugeordnet wird dabei mit der **aktuellen** Aufstellung – Korrekturen im
   Grid-Builder nach dem Upload zählen also.
3. Werte mit dem Ergebnis-Bildschirm vergleichen, fehlende Fahrer ergänzen, dann speichern
   („Speichern als vorläufig“ bzw. bei schon öffentlichem Ergebnis „Änderungen speichern“). Erst jetzt
   gibt es ein Ergebnis; der Stapel ist „übernommen“.
   „Import nicht verwenden“ zeigt stattdessen die gespeicherten Werte.
4. Weiter wie gewohnt: vorläufig veröffentlichen → Stewards → final.

„Verwerfen“ markiert einen Entwurf als verworfen. Ein übernommener Stapel lässt sich mit „Erneut öffnen“
noch einmal laden. In abgesagten Runden und eingefrorenen Saisons gibt es kein „Übernehmen“.

Fährt die Liga das Qualifying als Q1–Q3, kann je Teil ein eigener Stapel entstehen: nur den mit der
kompletten Reihenfolge übernehmen, die anderen verwerfen.

### CSV-Import

Session wählen, Datei wählen oder Inhalt einfügen („Beispiel einfügen“ zeigt das Format), Vorschau mit
Zuordnung und Warnungen prüfen, dann „**Speichern und übernehmen**“ (öffnet die Ergebnis-Eingabe) oder
„Nur als Stapel speichern“. Spalten und erlaubte Werte: [TELEMETRIE.md → CSV-Import](TELEMETRIE.md#csv-import).

### Telemetrie (UDP) und Import-Token

- „**Token erzeugen**“: Das Import-Token wird **genau einmal** angezeigt – sofort kopieren und in den
  Passwortmanager legen. Gespeichert ist nur ein Hash; verloren = einfach neu erzeugen.
- Das Token gilt für die **ganze Liga**, nicht nur für eine Runde. „Neues Token erzeugen“ macht das alte
  sofort ungültig, „Token widerrufen“ sperrt alle Uploads.
- Darunter stehen fertige Befehle zum Kopieren (Windows PowerShell und macOS/Linux), um das
  Companion-Programm auf dem Lobby-PC zu starten.
- Die Runde findet der Server selbst: aktive Saison, Strecke (Spiel-ID der [Strecke](#strecken)) und
  Termin ±36 h. Klappt das nicht (z. B. Sprint-Runde), meldet das Programm den Grund; dann mit
  `--round`/`--session` neu hochladen ([TELEMETRIE.md](TELEMETRIE.md#zuordnung-auf-der-website)).

Upload, CSV, Übernehmen, Verwerfen und Token-Änderungen stehen im Audit-Log.

---

## Stewards

*Steward, Admin · Renntag → Stewards* (Plan §5.3)

### Eingang

Alle Meldungen aus `/stewards/melden` mit Status **neu**, **in Prüfung**, **entschieden**,
**abgelehnt**, **verspätet**. Jede Meldung hat einen **Clip-Link** (YouTube, Twitch, Medal,
Streamable, Xbox/PS-Share) mit Zeitstempel – öffnen, ansehen, bei Bedarf auf Discord nachfragen
(der Discord-Name des Meldenden steht in der Meldung). Die Identität wird nicht geprüft; Missbrauch
wird sanktioniert.

Nach Ablauf der Protestfrist ist das Formular für die Runde geschlossen. Verspätete Meldungen gibt
es nur über die Admins (Status „verspätet“).

### Entscheidung

| Art | Wirkung auf das Ergebnis |
|---|---|
| Keine Strafe | – |
| Verwarnung | – (erscheint im Register und im Fahrerprofil) |
| Zeitstrafe (s) | wird zur Rennzeit addiert, Positionen werden neu berechnet |
| Positionsstrafe | Fahrer rutscht um N Plätze zurück |
| Grid-Strafe nächstes Rennen | wirkt beim Startplatz der nächsten Runde |
| DSQ | Fahrer wird disqualifiziert, alle dahinter rücken auf |
| Rennsperre | für das nächste Rennen gesperrt |

- **Begründung** auf Deutsch (Pflicht), Englisch optional. **Textbausteine** aus dem Strafenkatalog
  des Regelwerks (Fallcodes wie V-02) helfen bei einheitlichen Formulierungen.
- **Befangenheit:** Wer am Vorfall beteiligt ist, kann nicht entscheiden – das System verhindert es.
- **Vier-Augen-Prinzip** (wenn in der Saison aktiv): Ein Urteil wird erst nach der Stimme eines zweiten
  Stewards veröffentlicht.
- **Eigene Untersuchung:** Stewards können einen Fall auch ohne Meldung eröffnen.

### Strafpunkte

Nur wenn das Strafpunkte-System in der Saison aktiv ist ([Saisons → Strafpunkte](#strafpunkte-einstellen)):

- Das Entscheidungsformular hat ein Feld **Strafpunkte** (0–12, leer = keine) für alle Arten außer
  „Keine Strafe“. Daneben steht das Konto der Beteiligten (ohne diese Entscheidung) und ein Hinweis,
  wie das Konto danach aussieht.
- Erreicht der Fahrer eine Schwelle, warnt das Formular: „Verwarnschwelle erreicht“ bzw.
  „Sperrschwelle erreicht – Rennsperre prüfen“. Die **Rennsperre** ist eine eigene Entscheidung
  (Art „Rennsperre“) – sie entsteht nicht automatisch.
- Späte Entscheidung: Sind die Punkte dieser Runde beim Eintragen schon verfallen, weist das Formular
  darauf hin; sie zählen dann nicht mehr zum aktiven Konto.
- Im **Eingang** stehen unten die **Strafpunkte-Konten** der gewählten Saison: aktive und verfallene
  Punkte, Status, nächster Verfall und die Entscheidungen mit Punkten.
- Punkte zählen erst ab **Veröffentlichen** – Entwürfe nie.

### Veröffentlichen

„**Veröffentlichen**“: Das Urteil erscheint mit Referenz (z. B. `S2-R03-01`) im öffentlichen Register,
auf der Rennseite und im Fahrerprofil, `#urteile` bekommt einen Post, und **Zeit-, Positions- und
DSQ-Strafen fließen automatisch ins Ergebnis ein** – die Wertung wird neu berechnet. Strafpunkte landen
im Konto des Fahrers (öffentlich auf `/stewards` und im Fahrerprofil).

---

## News

*Redaktion, Admin · Inhalte → News*

1. „Neuer Artikel“ → **Titel**, **Teaser** (kurzer Anreißer für Übersicht und Discord) und **Text**
   in DE, optional EN (nebeneinander, mit Vorschau).
2. **Kategorie:** Rennbericht, Ankündigung, Regeländerung, Neuzugänge, Community.
3. **Titelbild** (optional): Bild auswählen – es wird **im Browser** verkleinert und in WebP umgewandelt,
   Kameradaten (EXIF) werden entfernt. **Alternativtext** für Screenreader ausfüllen.
4. **Verknüpftes Rennen** (bei Rennberichten): das Ergebnis wird automatisch als Kasten eingebettet.
5. Status: **Entwurf** (unsichtbar), **geplant** (mit Datum/Uhrzeit – geht dann automatisch online)
   oder **veröffentlicht**.

Die Adresse (Slug) je Sprache wird aus dem Titel erzeugt. Nach dem Veröffentlichen ändert sie sich
**nicht mehr automatisch**, auch wenn du den Titel korrigierst. Änderst du sie selbst, leitet die
alte Adresse dauerhaft auf die neue weiter (siehe [Adressen](#adressen-slugs-und-umbenennungen)).

---

## Regelwerk

*Admin · Inhalte → Regelwerk*

- Das Regelwerk hat Kapitel und Paragrafen mit **festen Nummern** (§3, §3.2 …) und festen Ankern
  (`#p3-2`) – Links darauf funktionieren dauerhaft.
- Änderungen entstehen immer als **neue Version** (Entwurf). Beim Veröffentlichen ist ein
  **Changelog** Pflicht („Was hat sich geändert?“). Alte Versionen bleiben unter
  `/liga/regelwerk/v/<version>` abrufbar.
- Die gültige Version pro Saison stellst du in der [Saison](#saisons) ein.
- Englisch ist eine Übersetzung – verbindlich ist Deutsch (steht so auf der Seite).

---

## Seiten-Inhalte

*Redaktion, Admin · Inhalte → Seiten-Inhalte*

| Bereich | Erscheint auf |
|---|---|
| **FAQ** (Kategorien: Allgemein, Voraussetzungen, Renntag, Technik, Stewards) | `/liga/faq` |
| **Orga-Team** (Gamertag, Rolle, seit Saison, optional Avatar) | `/liga/ueber-uns` |
| **Offene Rollen** (Aufgabe, Zeitaufwand DE/EN, aktiv/inaktiv) | `/liga/ueber-uns` |
| **Partner** (Logo, Text, Link, Kennzeichnung „Anzeige“) | `/liga/partner`, Partner-Leiste der Startseite |
| **Texte**: Claim der Startseite (DE/EN) und **Anmeldestatus** (Zustand, freie Cockpits und Reserveplätze, Hinweis DE/EN) | Startseite, `/mitfahren` |

Reihenfolge per Pfeil-Knöpfen. **Partner:** Glücksspiel, Wetten, Skins/Cases, Alkohol und Krypto sind
ausgeschlossen (Plan §4.8); Partner werden immer als Anzeige gekennzeichnet.

**Texte:**

- Der **Claim der Startseite** wird **nur hier** gepflegt; die [Einstellungen](#einstellungen) zeigen
  ihn nur an (mit Link „Claim bearbeiten“).
- Den **Anmeldestatus** gibt es zusätzlich unter Einstellungen (nur Admins). Es gilt die zuletzt
  gespeicherte Fassung; jedes Formular ändert nur die Felder, die es selbst enthält – andere Werte
  bleiben erhalten.
- `/mitfahren` zeigt „Stand: …“ mit dem Datum der letzten Änderung des Anmeldestatus.

**Aktualitäts-Check:** Jede Inhaltsseite zeigt „Stand: …“. Einmal pro Quartal prüft die Redaktion alle
Seiten ([BETRIEB.md](BETRIEB.md#aktualitäts-check)).

---

## Social-Grafiken

*Redaktion, Admin · Inhalte → Grafiken* (`/admin/grafiken`)

Grafiken im Liga-Design für Instagram, Story/TikTok, YouTube und Link-Vorschauen. Sie entstehen **in
deinem Browser** aus den **veröffentlichten** Daten der Website – nicht veröffentlichte Ergebnisse oder
Aufstellungen tauchen hier nicht auf.

| Motiv | Inhalt |
|---|---|
| Ergebnis | Top 10 des Rennens mit schnellster Runde und Status |
| Wertung – Fahrer | Stand nach der gewählten Runde: Top 10, im Story-Format Top 22 |
| Wertung – Konstrukteure | Stand nach der gewählten Runde, alle Teams |
| Startaufstellung | Startplätze aus dem Ergebnis; vor dem Rennen die veröffentlichte Aufstellung nach Teams |
| Race-Week | Ankündigung: Runde, Strecke, Datum und Uhrzeit (Liga-Zeit), Sessions |
| Pole-Position | Schnellster im Qualifying mit Zeit und Abstand |
| Neuzugang | Fahrer (aktiv oder Reserve): Name, Startnummer, Team, Nationalität |

| Format | Größe |
|---|---|
| Instagram (Feed 4:5) | 1080 × 1350 |
| Story / TikTok (9:16) | 1080 × 1920 |
| YouTube-Thumbnail (16:9) | 1280 × 720 |
| OG / Link-Vorschau | 1200 × 630 |

1. Motiv, Saison, Runde (bzw. Fahrer), Format und **Sprache der Grafik** (DE/EN) wählen – die Vorschau
   aktualisiert sich sofort. Ergebnis- und Wertungsgrafiken zu einem vorläufigen Ergebnis tragen den
   Hinweis „Vorläufig“.
2. „**PNG herunterladen**“ oder „**An Discord senden**“ → „Jetzt senden“: postet die Grafik in den
   Channel „Social-Grafiken“ (`#grafiken`). Das geht nur, wenn dafür ein Webhook unter
   [Einstellungen](#einstellungen) eingetragen ist (höchstens 5 MB je Grafik).
3. Den **Alt-Text** beim Posten auf Instagram, TikTok oder YouTube als Bildbeschreibung einfügen
   („Alt-Text kopieren“).

Die Adresse im Browser enthält die Auswahl – sie lässt sich als Link auf genau diese Grafik teilen. Für
Admins führen aus der [Runden-Übersicht](#runden-übersicht) fertige Links mit der passenden Runde hierher.
Discord-Posts stehen im Audit-Log.

---

## Stream-Overlays

*Redaktion, Admin · Inhalte → Stream-Overlays* (`/admin/overlays`)

Fertige Overlays für OBS (Browser-Quelle, 1920 × 1080, transparent): **Nächstes Rennen**,
**Aufstellung**, **Wertung** (Fahrer oder Konstrukteure), **Ergebnis** und **Laufband**. Die Seite
zeigt alle Adressen mit Kopieren-Knopf und Vorschau, dazu einen URL-Baukasten (Sprache, Anzahl Zeilen,
Wertungsart, Vergrößerung) und die empfohlenen OBS-Einstellungen.

- Die Overlays holen sich die Daten alle 20 Sekunden direkt aus der Datenbank – ein veröffentlichtes
  Ergebnis ist nach spätestens etwa einer Minute im Stream, ohne Rebuild.
- Nur öffentliche Daten; Ergebnisse erst ab „vorläufig“, Aufstellungen erst nach Veröffentlichung.
- Einrichtung in OBS, Parameter und Verhalten bei Störungen: [OVERLAYS.md](OVERLAYS.md).

---

## Kontaktanfragen

*Admin · System → Kontaktanfragen*

Nachrichten aus `/kontakt` (Name, E-Mail, Betreff, Nachricht). Beantworten per E-Mail von der
Liga-Adresse, dann auf „erledigt“ setzen. Die Nachricht ist zugleich der zweite Kontaktweg fürs Impressum.

---

## Einstellungen

*Admin · System → Einstellungen*

| Einstellung | Hinweis |
|---|---|
| **Discord-Einladung** (Website) | Button „Discord beitreten“ und Discord-Karte (Mitglieder/online, alle 10 Minuten aktualisiert) |
| **Webhook-URLs** je Channel | Anmeldungen, Aufstellung, Ergebnisse, Vorfälle, Urteile, News, Kontakt, **Social-Grafiken** – nicht hinterlegt = keine Meldung. Gespeicherte URLs werden nur gekürzt angezeigt; ein leeres Feld lässt sie **unverändert**, „URL entfernen“ löscht sie. „Verbindung testen“ schickt eine Test-Nachricht. **Geheim halten.** |
| **Einladungen je Quelle** | Website, Instagram, TikTok, YouTube – für die Statistik, woher Mitglieder kommen |
| **Social-Links** | Instagram, TikTok, YouTube im Footer |
| **Twitch-Kanal** | leer = Live-Anzeige ausgeblendet. Ist ein Kanal eingetragen, erscheint bei laufendem Stream das LIVE-Badge |
| **GA-Mess-ID** | `G-…`; leer = kein Google Analytics, auch nicht nach Einwilligung |
| **Rollen-Zuordnung** | Discord-Rollen-IDs für Admin, Steward, Redaktion (mehrere möglich) |
| **Discord-Bot** | Status der Bot-Variablen, Interactions-Endpunkt zum Kopieren, Selbstrollen – siehe [unten](#discord-bot) |
| **Anmeldestatus** | offen / Warteliste / geschlossen, freie Cockpits und Reserveplätze, Hinweistext DE/EN (dieselben Werte wie unter [Seiten-Inhalte → Texte](#seiten-inhalte)) |
| **Startseite** | zeigt den Claim nur an – bearbeitet wird er unter [Seiten-Inhalte → Texte](#seiten-inhalte) |
| **Neubau der Website** | Stand des gebündelten Rebuilds (zuletzt angefordert/ausgelöst), Knopf „Jetzt neu bauen“ |

Jeder Abschnitt speichert nur seine eigenen Felder; andere Werte derselben Einstellung bleiben
erhalten.

Vorsicht bei der Rollen-Zuordnung: Entfernst du die eigene Admin-Rolle, sperrst du dich aus
(Rettung: [SETUP.md, Schritt 8](SETUP.md#8-erster-deploy-und-erster-login)).

### Discord-Bot

Der Liga-Bot beantwortet Slash-Befehle auf dem Liga-Server: `/naechstes-rennen`, `/wertung`,
`/fahrer` und `/rolle` (auf englischen Clients `/next-race`, `/standings`, `/driver`, `/role`). Er
zeigt nur öffentliche Daten. Einrichtung durch die Technik: [DISCORD-BOT.md](DISCORD-BOT.md).

- **Status:** zeigt, ob `DISCORD_APPLICATION_ID`, `DISCORD_PUBLIC_KEY`, `DISCORD_BOT_TOKEN` und
  `DISCORD_GUILD_ID` gesetzt sind. Die Werte selbst erscheinen nie.
- **Interactions-Endpunkt:** Adresse zum Kopieren – gehört ins Discord-Entwicklerportal
  (General Information → Interactions Endpoint URL).
- **Selbstrollen:** Rollen, die sich Mitglieder mit `/rolle` selbst geben oder nehmen dürfen (z. B.
  „Renntag-Ping“), höchstens 25. Je Rolle: Rollen-ID (Entwicklermodus → Rechtsklick auf die Rolle →
  „ID kopieren“), Bezeichnung DE und optional EN → „Selbstrolle speichern“. Eine bekannte ID ändert die
  Bezeichnungen. Rollen, die Rechte im Admin-Bereich geben, vergibt der Bot nie; steht so eine Rolle in
  der Liste, erscheint oben eine Warnung.
- Damit `/rolle` funktioniert, braucht der Bot die Berechtigung „Rollen verwalten“, und seine Rolle muss
  auf dem Server **über** allen Selbstrollen stehen (aber unter Admin/Steward/Redaktion).

---

## Audit-Log

*Admin · System → Audit-Log*

Protokoll jeder Änderung: **wer**, **was**, **wann**, mit Vorher/Nachher der geänderten Felder.
Hilft bei „Wer hat das Ergebnis geändert?“ und ist Teil der Nachvollziehbarkeit gegenüber den Fahrern.

---

## Häufige Fragen und Probleme

**Ich habe veröffentlicht, aber die Website zeigt noch den alten Stand.**
1–3 Minuten warten, dann neu laden (Strg + F5). Hilft das nach 10 Minuten nicht: Technik informieren –
unter GitHub → Actions → „Deploy“ ist zu sehen, ob der Build läuft oder fehlgeschlagen ist.

**„Kein Zugang“ nach dem Login.**
Dir fehlt die Discord-Rolle, oder die Rollen-Zuordnung stimmt nicht. Nach dem Vergeben der Rolle
ab- und wieder anmelden.

**Ich wurde mitten in der Arbeit abgemeldet.**
Die Rolle wird alle 15 Minuten geprüft. Ist Discord gerade nicht erreichbar, wirst du vorsichtshalber
abgemeldet. Kurz warten und neu anmelden – ungespeicherte Eingaben vorher kopieren.

**Der Grid-Builder meldet einen Nummernkonflikt.**
Zwei Fahrer haben zur Runde dieselbe Startnummer (z. B. nach einem Nummernwechsel). Unter *Fahrer*
die Nummern-Historie prüfen.

**Ein Fahrer ist doppelt in der Fahrerliste.**
Nicht löschen, wenn es schon Ergebnisse gibt – Liga-Leitung bzw. Technik ansprechen, die Einträge
werden zusammengeführt.

**Nach einer Umbenennung zeigt die alte Adresse „Seite nicht gefunden“.**
Die Weiterleitung entsteht nur, wenn der **Slug** im Admin geändert wurde (nicht bei neu angelegten
Einträgen). Technik kann sie in der Datenbank nachtragen ([BETRIEB.md](BETRIEB.md#weiterleitungen-nach-umbenennungen)).

**Ein Ergebnis ist falsch, aber schon „final“.**
„Korrigieren“ mit Grund – nie ein finales Ergebnis stillschweigend ändern.

**Beim Import fehlen Fahrer oder die Zuordnung stimmt nicht.**
Zugeordnet wird nur über die Startnummer der Aufstellung. Aufstellung im Grid-Builder prüfen und
speichern, dann im Import erneut „Übernehmen“ – es wird mit der aktuellen Aufstellung neu zugeordnet.
Fehlende Fahrer in der Ergebnis-Eingabe von Hand ergänzen.

**Das Companion-Programm meldet einen Fehler beim Hochladen.**
401 = Token falsch, 503 = kein Token eingerichtet (beides: Runde → Import → Telemetrie), 422 = Runde oder
Session nicht eindeutig (z. B. Sprint-Runde). Die Daten bleiben lokal gesichert und lassen sich später
hochladen; notfalls von Hand eintragen. Details: [TELEMETRIE.md](TELEMETRIE.md#endpunkt-post-apiimport).

**Ein Transfer wird abgelehnt („liegt auf oder vor der letzten gewerteten Runde“).**
Der Wechsel wäre rückwirkend. Eine spätere Runde wählen – oder, wenn es wirklich rückwirkend gelten soll,
„Rückwirkende Änderung bestätigen“ ankreuzen ([Teams & Cockpits](#teams--cockpits)).

**„Der Slug … ist für feste Unterseiten reserviert“.**
Einen anderen Slug wählen, z. B. mit Zusatz `-2` ([Adressen](#adressen-slugs-und-umbenennungen)).

**„An Discord senden“ im Grafik-Werkzeug ist ausgegraut.**
Für den Channel „Social-Grafiken“ ist kein Webhook eingetragen – ein Admin trägt ihn unter
Einstellungen → Webhooks ein. Bis dahin: PNG herunterladen und von Hand posten.

**`/rolle` antwortet „Der Bot darf diese Rolle gerade nicht vergeben“.**
Die Rolle des Bots steht auf dem Discord-Server zu tief oder ihm fehlt „Rollen verwalten“
([Discord-Bot](#discord-bot)).

**Die Website ist komplett weg.**
Discord ist der Fallback: Lobby-Infos und Aufstellung sind dort angepinnt.
Siehe [Renntag-Runbook → Notfall](RENNTAG-RUNBOOK.md#notfall-website-oder-admin-nicht-erreichbar).
