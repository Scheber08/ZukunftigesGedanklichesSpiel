# Admin-Handbuch

Für alle, die die Liga-Website pflegen: **Admins**, **Stewards** und **Redaktion**.
Du brauchst keine Programmierkenntnisse. Der Admin-Bereich funktioniert auch auf dem Handy –
am Renntag kannst du Ergebnisse also direkt aus der Lobby eintragen.

Den genauen Ablauf eines Renntags mit Uhrzeiten beschreibt das [Renntag-Runbook](RENNTAG-RUNBOOK.md).

**Inhalt**

- [Grundlagen](#grundlagen): Anmelden, Rollen, Veröffentlichen, Adressen, Sprachen, Markdown
- Liga: [Dashboard](#dashboard) · [Saisons](#saisons) · [Punkteschemata](#punkteschemata) ·
  [Kalender](#kalender) ([Strecken](#strecken)) · [Teams & Cockpits](#teams--cockpits) · [Fahrer](#fahrer) · [Anmeldungen](#anmeldungen)
- Renntag: [Runden-Übersicht](#runden-übersicht) · [Grid-Builder](#grid-builder) ·
  [Ergebnis-Eingabe](#ergebnis-eingabe) · [Stewards](#stewards)
- Inhalte: [News](#news) · [Regelwerk](#regelwerk) · [Seiten-Inhalte](#seiten-inhalte)
- System: [Kontaktanfragen](#kontaktanfragen) · [Einstellungen](#einstellungen) · [Audit-Log](#audit-log)
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
| @Admin | Admin | alles, inklusive Redaktion |
| @Steward | Steward | Vorfälle prüfen, Entscheidungen treffen und veröffentlichen |
| @Redaktion | Redakteur | News, FAQ, Orga-Team, offene Rollen, Partner, Startseiten-Texte |

- Die Rolle wird bei jeder Anmeldung und spätestens **alle 15 Minuten** neu geprüft.
  **Wer die Discord-Rolle verliert, verliert sofort den Zugang.** Neue Rollen wirken spätestens nach
  15 Minuten oder nach Ab- und wieder Anmelden.
- Wer im Admin „Kein Zugang“ sieht, hat keine der drei Rollen – Liga-Leitung auf Discord fragen.

### Was ist wann öffentlich?

Die öffentliche Website besteht aus fertig gebauten Seiten (deshalb ist sie so schnell). Nach jedem
**Veröffentlichen** (Ergebnis, Aufstellung, Urteil, News, Kalender, Regelwerk, Seiten-Inhalte) baut
sie sich automatisch neu:

- Mehrere Änderungen kurz hintereinander werden **gebündelt** – etwa 60 Sekunden nach der letzten
  Änderung startet ein Build.
- **Nach etwa 1–3 Minuten** ist alles online. Kurz warten und die Seite neu laden (ggf. Strg + F5).
- Entwürfe sind nie öffentlich.

Formulare (Anmeldung, Vorfall melden, Kontakt) und der Admin-Bereich selbst sind immer live.

### Adressen (Slugs) und Umbenennungen

Viele Seiten haben einen sprechenden Adressteil, den **Slug**: `/fahrer/kurvenkoenig`,
`/teams/mclaren`, `/saison/2/wertung`, `/news/saison-2-startet`. Er wird meist automatisch aus dem
Namen erzeugt.

- **Umbenennen ist erlaubt.** Änderst du den Slug eines Fahrers, Teams, einer Saison oder eines
  veröffentlichten News-Artikels, merkt sich die Website die alte Adresse und **leitet sie dauerhaft
  auf die neue weiter** – geteilte Links und Suchmaschinen-Einträge funktionieren weiter.
- Die neue Adresse ist nach dem nächsten Rebuild (1–3 Minuten) online; die Weiterleitung gilt sofort.
- Einen Slug nicht „im Kreis“ tauschen (A → B und B → A zwischen zwei Fahrern) – das verwirrt Besucher.
- Ändert sich nur der **Anzeigename** (z. B. Gamertag), bleibt der Slug gleich, solange du ihn
  nicht selbst änderst.

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
| Strafpunkte | vorbereitet, bleibt aus, bis die Liga das System beschließt |
| Lobby-Einstellungen | Gruppen wie Lobby, Fahrhilfen, Wochenende, Wetter … – erscheinen auf `/liga/lobby` |
| Regelwerk-Version | welche Fassung für die Saison gilt |
| Status | **geplant** → **aktiv** (nur eine Saison gleichzeitig) → **abgeschlossen** |

**Saison abschließen:** Status „abgeschlossen“ – die Saison wird **eingefroren** (nur noch lesbar),
Champions landen in der Hall of Fame. Ablauf: [BETRIEB.md → Saisonwechsel](BETRIEB.md#saisonwechsel).

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
**Ort**, keine offiziellen Event-Titel), Land (für die Flagge), Länge, Standard-Rundenzahl und die
Spiel-ID für den späteren Telemetrie-Import.

**Streckenkarte** (optional, erscheint auf der Rennseite und im Kalender):

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
| Slug (Adresse) | ja | aus dem Gamertag erzeugt; bei Änderung leitet die alte Adresse weiter (siehe [Adressen](#adressen-slugs-und-umbenennungen)) |

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
[Seiten-Inhalte](#seiten-inhalte) bzw. [Einstellungen](#einstellungen) ein.

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

Pro Session (**Qualifying**, ggf. **Sprint**, **Rennen**), vorbefüllt mit der veröffentlichten Aufstellung.

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

### Veröffentlichen

„**Veröffentlichen**“: Das Urteil erscheint mit Referenz (z. B. `S2-R03-01`) im öffentlichen Register,
auf der Rennseite und im Fahrerprofil, `#urteile` bekommt einen Post, und **Zeit-, Positions- und
DSQ-Strafen fließen automatisch ins Ergebnis ein** – die Wertung wird neu berechnet.

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
| **Startseite** (Claim DE/EN) und **Anmeldestatus** | Startseite, `/mitfahren` |

Reihenfolge per Pfeil-Knöpfen. **Partner:** Glücksspiel, Wetten, Skins/Cases, Alkohol und Krypto sind
ausgeschlossen (Plan §4.8); Partner werden immer als Anzeige gekennzeichnet.

**Aktualitäts-Check:** Jede Inhaltsseite zeigt „Stand: …“. Einmal pro Quartal prüft die Redaktion alle
Seiten ([BETRIEB.md](BETRIEB.md#aktualitäts-check)).

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
| **Webhook-URLs** je Channel | Anmeldungen, Aufstellung, Ergebnisse, Vorfälle, Urteile, News, Kontakt – leer = keine Meldung. **Geheim halten.** |
| **Einladungen je Quelle** | Website, Instagram, TikTok, YouTube – für die Statistik, woher Mitglieder kommen |
| **Social-Links** | Instagram, TikTok, YouTube im Footer |
| **Twitch-Kanal** | leer = Live-Anzeige ausgeblendet. Ist ein Kanal eingetragen, erscheint bei laufendem Stream das LIVE-Badge |
| **GA-Mess-ID** | `G-…`; leer = kein Google Analytics, auch nicht nach Einwilligung |
| **Rollen-Zuordnung** | Discord-Rollen-IDs für Admin, Steward, Redaktion (mehrere möglich) |
| **Anmeldestatus** | offen / Warteliste / geschlossen, freie Cockpits und Reserveplätze, Hinweistext DE/EN |

Vorsicht bei der Rollen-Zuordnung: Entfernst du die eigene Admin-Rolle, sperrst du dich aus
(Rettung: [SETUP.md, Schritt 8](SETUP.md#8-erster-deploy-und-erster-login)).

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

**Die Website ist komplett weg.**
Discord ist der Fallback: Lobby-Infos und Aufstellung sind dort angepinnt.
Siehe [Renntag-Runbook → Notfall](RENNTAG-RUNBOOK.md#notfall-website-oder-admin-nicht-erreichbar).
