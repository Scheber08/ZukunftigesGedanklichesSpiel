# Website-Plan: [LIGANAME] – Online-Liga für EA SPORTS F1® 25

**Stand:** 29.09.2026 · **Status:** Planung, noch keine Umsetzung

**Referenz:** [ircf1.de](https://www.ircf1.de) und [irc-standings.de](https://irc-standings.de)

> `[LIGANAME]` und `[KÜRZEL]` sind Platzhalter, bis der Name feststeht. Wichtig für die Namenswahl: siehe §9.1, **kein „F1“ im Namen**.

---

## 0. Auf einen Blick

- **Was:** Eine einzige, eigene Website für eine neue F1-25-Liga mit einem Grid.
  - 11 echte F1-Teams mit je 2 Fahrern, also 22 Stammcockpits, plus Reservepool.
  - Crossplay auf PC, PlayStation und Xbox.
  - Zweisprachig Deutsch und Englisch.
- **Auf einer Domain:** Infos, Regelwerk, Kalender, Ergebnisse, Wertungen, Profile, Stewards, News und Admin. Keine ausgelagerte Standings-Seite wie bei IRC.
- **Look:** Dark Mode mit Schwarz und Weiß als Hauptfarben. Grün `#37BE89` und Türkis `#34C4D0` als Akzente, auch als Verlauf. Das Wirbel-Logo mit einem leuchtenden Glow ist das zentrale Motiv.
- **Technik:** Astro 6, Supabase (Postgres in Frankfurt) und Cloudflare. Laufende Kosten: nur die Domain, etwa 0,50 €/Monat.
- **Admins** pflegen alles über einen eigenen Admin-Bereich mit Discord-Login:
  - Grid-Builder per Drag & Drop
  - Ergebniseingabe mit automatischer Punkteberechnung
  - Steward-Werkzeuge
  - News und Texte in DE und EN
- **Discord** bleibt der Ort der Community. Die Website postet Anmeldungen, Ergebnisse und Urteile automatisch dorthin.

---

## 1. Entscheidungsprotokoll

| Thema | Entscheidung |
|---|---|
| Liga | Neu gegründet, **1 Grid**, 11 Teams (Grid 2026 inkl. Audi und Cadillac) × 2 Fahrer plus Reserve |
| Teams | Echte F1-Teams, **Fahrer- und Konstrukteurswertung** |
| Teamzuteilung | Admin entscheidet |
| Plattform | Crossplay PC/PS/Xbox |
| Rennformat | **Noch offen**, das System ist flexibel (Quali, Sprint, Rennen je Runde konfigurierbar) |
| Punktesystem | **Pro Saison konfigurierbar** |
| Reservefahrer-Punkte für Konstrukteure | **Pro Saison einstellbar** |
| Strafpunkte/Lizenzsystem | **Später entscheiden**, das Datenmodell ist vorbereitet |
| Startnummern | Fahrer wählt und behält seine Nummer. Der Admin kann Nummern inaktiver Fahrer freigeben. Aktive Fahrer dürfen **jederzeit mit Admin-OK** wechseln, der Wechsel gilt ab dem nächsten Rennen. Die Nummern-Historie wird gespeichert |
| Anmeldung neuer Fahrer | **Web-Formular ohne Login** mit Spam-Schutz. Die Anmeldung geht per Webhook in einen Admin-Channel auf Discord |
| An- und Abmeldung pro Rennen | Läuft über Discord. Der Admin baut das Grid bequem auf der Website (Grid-Builder) |
| Öffentliche Fahrerdaten | **Nur Gamertag**, Startnummer, Flagge (optional), Plattform. Kein Realname, kein Alter |
| Mindestalter | **16+**, per Checkbox ohne Geburtsdatum |
| Ergebnisse | **MVP:** Admin-Formular, Punkte automatisch. **Phase 2:** UDP-Telemetrie-Import |
| Vorfälle | Web-Formular mit Pflicht-Link zum Clip und Frist. **Keine Identitätsprüfung**: Spam-Schutz plus manuelle Prüfung durch die Stewards |
| Steward-Entscheidungen | **Voll öffentlich** mit Begründung und Clip |
| Rollen | Admin, Steward, Redakteur. **Login über Discord**, die Rechte folgen aus der Discord-Rolle |
| MVP-Features | Kalender + Countdown, Fahrer- und Teamprofile, Steward-/Strafenregister, Twitch-Live-Anzeige + News |
| Inhaltsseiten | Regelwerk + Lobby-Einstellungen, FAQ + Einsteiger-Guide, Über uns + Team-Suche, Partner/Sponsoren |
| Archiv | **Saisonarchiv und Hall of Fame von Anfang an** |
| Discord | Webhooks für Anmeldungen, Ergebnisse, Vorfälle und Urteile, dazu eine Discord-Karte (Mitglieder/online) |
| Streaming | Noch nicht geplant. **Die Website ist vorbereitet**, die Live-Anzeige erscheint erst, wenn ein Kanal eingetragen ist |
| Social | Instagram, TikTok, YouTube |
| Social-Grafiken | Automatisch erzeugt, **Phase 2** |
| Sprache | **Deutsch und Englisch** von Anfang an. Deutsch ist für das Regelwerk verbindlich |
| Analytics | **Google Analytics 4**, lädt erst nach Einwilligung (Consent-Banner) |
| Budget | Nur Domain, etwa 1–2 €/Monat. Alles andere läuft in Free-Tiers |
| Impressum | **Noch zu klären**, blockiert den Launch |
| Logo | Fertig. Es wird vektorisiert: flach für Web und Favicon, die Steintextur-Version nur für Hero und Social |
| Design | Dark, Schwarz/Weiß, Akzente mittel mit Verlauf, **Titillium Web** + **Inter**, Teamfarben nur als schmaler Streifen, Hero mit Logo und Countdown, **dezente** Animation |
| Tech-Stack | **Astro 6 + Supabase + Cloudflare**. Die Programmiererfahrung spielt keine Rolle, die Umsetzung übernimmt Claude |
| Zeitplan | Kein fester Termin, Qualität vor Tempo |

---

## 2. Was wir von ircf1.de lernen

### 2.1 Übernehmen: was dort gut ist

- **Konzept 22 Stammfahrer plus geordneter Reservepool.** Der erste verfügbare Reservefahrer rückt nach.
- **Lobby-Einstellungen** vollständig und gruppiert dokumentiert: Lobby, Fahrhilfen, Wochenende, Wetter, Regeln & Flaggen, Simulation.
- **Regeln zum Fahrverhalten** (Linienwechsel, Kurvenrecht, blaue Flaggen, Safety Car), **Strafenkatalog mit Fallcodes**, Vorfälle nur mit Videobeweis und Frist.
- **Recruiting-Seite** für Helfer, **Pokale** für die Top 3.
- Standings-Ideen von irc-standings.de:
  - Matrix mit den Positionen je Rennen
  - Rekorde je Strecke
  - Ewige Tabellen
  - Driver of the Day
  - Farblegende für Pole, schnellste Runde, DNF und Reserve
  - Teilen-Link
- **Keine Texte kopieren** (Urheberrecht). Wir schreiben ein eigenes Regelwerk.

### 2.2 Besser machen: Schwächen der Referenz und unsere Lösung

| Problem bei IRC | Unsere Lösung |
|---|---|
| Zwei Systeme (Wix und eine Java-App auf eigener Domain), zwei Designs | **Ein System, eine Domain, ein Design** |
| Über 10 inhaltliche Widersprüche (Topf 3 vs. 4 Punkte, 2 vs. 3 Ligen, 19:15 vs. 19:30, 20 vs. 22 Fahrer, F1 23/2021-Reste) | **Eine Datenquelle:** Zeiten, Spielversion, Feldgröße, Invite und Regeln kommen aus der DB bzw. aus Einstellungen und erscheinen überall gleich |
| Regelwerk auf 5 Seiten verteilt, teils versteckt, §-Nummern kollidieren | **Ein** Regelwerk mit festen §-Nummern, Inhaltsverzeichnis, Suche, Versionsnummer und Changelog |
| Rund 30 veraltete Seiten öffentlich und indexiert, tote Links | Saubere Sitemap, Link-Check in der CI, eigene 404-Seite, 301-Weiterleitungen bei Umbenennungen |
| Punktetabelle, Strafenkatalog und Archiv nur als Bilder | Alles als **HTML-Tabelle** (durchsuchbar, responsiv, barrierefrei) |
| Nicht responsiv (Overflow, Standings mit `min-width: 1000px`) | **Mobile first** von 320 px an, Tabellen mit fixierter Spalte, Karten-Ansicht auf dem Handy |
| 5,5 MB beim ersten Aufruf der Standings, ein 3,9-MB-GIF, kein Caching | Ziel **unter 300 KB** pro Seite, SVG-Logo, WOFF2, Caching |
| Twitch-Client-Secret im öffentlichen JavaScript | Secrets **nur auf dem Server** |
| Kein Consent: GA und Ads laden sofort, keine Datenschutzerklärung, Impressum veraltet (TMG) und in einem iframe | Consent-Banner vor GA, vollständige Datenschutzerklärung, Impressum nach § 5 DDG als HTML |
| Lizenzpflichtige Formula-1-Schrift öffentlich ausgeliefert, „F1“ im Namen | Freie Schriften (OFL), Name ohne „F1“, Disclaimer |
| Anmeldung als Blackbox (Vorlage im Discord, Felder unbekannt) | Transparentes Formular. Voraussetzungen und Ablauf stehen auf der Seite |
| Strafen, Plattform und Quali fehlen im Standings-Datenmodell | Strafen, Plattform, Quali, Startplatz, Rundenzeiten und Status sind feste Bestandteile des Datenmodells |
| Zustand im Cookie, der Zurück-Button funktioniert nicht, Profil-URL hängt am Namen | Sprechende, stabile URLs (`/fahrer/[slug]`, `/saison/1/wertung`) |
| Viele Schriftfamilien, Kontraste unter AA (z. B. Dunkelrot auf Schwarz 2,1:1) | 2 Schriftfamilien, alle Textfarben mit mindestens 4,5:1 geprüft |

---

## 3. Marke & Design-System

### 3.1 Logo

- **Ausgangspunkt:** Wirbel- bzw. Tropfensymbol mit Steintextur und dunkler Kontur auf Aquarell in Grün und Türkis.
- **Vektorisieren (SVG), sauber nachgezeichnet, keine automatische Bitmap-Umwandlung:**

| Variante | Einsatz |
|---|---|
| Symbol flach **weiß** | Primär auf der Website (Header, Footer, Hero) |
| Symbol flach **schwarz** | Helle Hintergründe, Druck |
| Symbol mit **Verlauf** Grün → Türkis | Akzent-Einsatz (Hero-Glow, Ladeanimation, Social) |
| **Texturversion** (Stein, als WebP/PNG) | Nur Hero-Hintergrund, Social-Media-Profilbild, Discord-Server-Icon, Pokale |
| **Wortmarke** horizontal und gestapelt | Sobald der Name feststeht, in Titillium Web Bold, Versalien |
| **Favicon-Set** | `favicon.svg`, 32 px PNG, `apple-touch-icon` 180 px, 512 px maskable (PWA-Manifest) |
| **OG-Standardbild** 1200×630 | Logo mit Glow auf Schwarz |

- **Schutzzone** um das Logo: der Durchmesser des inneren Kreises.
- **Mindestgröße:** 24 px für das Symbol.

### 3.2 Farben (Design-Tokens)

Hauptfarben sind Schwarz und Weiß. Grün und Türkis sind Akzente: mittel dosiert, auch als Verlauf. Die Akzentwerte stammen aus dem Logo-Bild.

| Token | Wert | Verwendung | Kontrast |
|---|---|---|---|
| `--c-bg` | `#050505` | Seitenhintergrund (nahezu Schwarz) | – |
| `--c-surface-1` | `#0E0E10` | Karten, Tabellenzeilen | – |
| `--c-surface-2` | `#16161A` | Hover, Header beim Scrollen, Eingabefelder | – |
| `--c-border` | `#26262C` | Trennlinien, Kartenrahmen | – |
| `--c-text` | `#FFFFFF` | Überschriften, Fließtext | ca. 20:1 |
| `--c-text-muted` | `#A1A1AA` | Sekundärtext, Labels | ca. 7,9:1 |
| `--c-green` | `#37BE89` | Akzent 1: Links, aktive Tabs, Pole, Erfolg | **ca. 8,9:1** auf Schwarz |
| `--c-teal` | `#34C4D0` | Akzent 2: Fokus-Ring, Hover, schnellste Runde, Live | **ca. 9,9:1** auf Schwarz |
| `--g-accent` | `linear-gradient(135deg, #37BE89, #34C4D0)` | Primär-Buttons, Hero-Glow, Trennlinien, aktive Markierung | – |
| `--c-green-deep` | `#0B6043` | Getönte Flächen, Glow-Basis | nur Fläche |
| `--c-teal-deep` | `#0E5A61` | Getönte Flächen, Glow-Basis | nur Fläche |
| `--c-danger` | `#FF6B6B` | Nur funktional: DSQ/DNF, Strafen, Fehler | ca. 7,5:1 |
| `--c-warning` | `#F5B94A` | Nur funktional: Status „vorläufig“ | ca. 11:1 |

**Regeln:**
- **Buttons mit Akzentfläche haben schwarzen Text** (ca. 9:1). Weiß auf Grün hätte nur etwa 2,4:1 und fällt deshalb durch.
- Etwa 85 % der Fläche ist Schwarz bzw. Surface, 10 % Weiß (Text), 5 % Akzent.
- Der Verlauf ist das **Signature-Element**:
  - Hero-Glow
  - 1-px-Linie unter aktiven Tabs
  - Rahmen beim Hover über Karten
  - Primär-Button
  - Fortschrittsbalken im Countdown
- **Teamfarben** nur als **4-px-Streifen** links neben Fahrer oder Team (TV-Grafik-Stil). Die Werte liegen in der DB und sind im Admin änderbar.
- **Farbe ist nie der einzige Informationsträger.** Pole, schnellste Runde und DNF bekommen immer zusätzlich ein Icon oder Kürzel.
- **Aquarell-Textur** nur im Hero (maskiert, etwa 25 % Deckkraft, hinter dem Glow) und auf Social-Grafiken.

### 3.3 Typografie

| Rolle | Schrift | Schnitte | Einsatz |
|---|---|---|---|
| Display und Headlines | **Titillium Web** (OFL) | 600, 700, 900 | H1–H3, Positionen, Countdown-Ziffern, Navigation (Versalien, `letter-spacing: 0.04em`) |
| Fließtext und UI | **Inter** (OFL, Variable Font) | 400–700 | Text, Tabellen, Formulare |
| Zahlen | Inter mit `font-variant-numeric: tabular-nums` | – | Zeiten, Punkte, Abstände (bleiben bündig) |

- **Selbst gehostet** als WOFF2 über die Fonts-API von Astro, mit Subsetting (Latin, Latin-Ext), `font-display: swap` und Preload der Headline-Schrift.
- **Kein Google-Fonts-CDN** (Urteil des LG München).
- **Typo-Skala** (fluid, `clamp`):
  - Display: 56–88 px
  - H1: 40–56 px
  - H2: 28–36 px
  - H3: 20–24 px
  - Body: 16–17 px
  - Small: 14 px
  - Micro: 12 px, nur für Labels in Versalien

### 3.4 Gestaltungsprinzipien und Motive

- **Broadcast-Ästhetik:** Klar, kontrastreich, Zahlen groß, Timing-Tower-Tabellen. Inspiration sind F1-TV-Grafiken, **ohne** F1-Marken.
- **Der Wirbel aus dem Logo als Motiv:**
  - Ladeindikator als rotierender Ring im Verlauf.
  - Abschnittsmarken als kleine Tropfenform vor H2.
  - Hintergrundmuster auf Social-Grafiken.
- **Glow:** Radialer Verlauf Grün/Türkis hinter dem Logo im Hero, mit 6 s Periode (siehe 3.6).
- **Raster:** 12 Spalten, maximal 1200 px Inhaltsbreite, 16 px Seitenabstand auf dem Handy, 8-px-Grundraster.
- **Ecken:** 12 px für Karten, 8 px für Buttons und Eingaben. Tabellen ohne Rundung.

### 3.5 Komponenten (Bibliothek)

- **Buttons:**
  - Primär: Verlauf, schwarzer Text
  - Sekundär: weiße 1-px-Kontur
  - Ghost
  - Icon-Button mit `aria-label`
  - Alle mit sichtbarem Fokus-Ring (2 px Türkis, 2 px Abstand)
- **Karten:** Surface-1, 1 px Border, beim Hover Verlaufsrahmen
- **Timing-Tabelle:**
  - Positionsziffer in Titillium 700
  - Teamstreifen, Startnummer, Gamertag in Versalien, Team, Werte bündig rechts
  - Pole mit Icon und grünem Kürzel „P“, schnellste Runde mit Stoppuhr-Icon in Türkis
  - DNF/DSQ in Danger-Rot als Text
  - Reservefahrer mit Kürzel „R“
  - Die Kopfzeile bleibt beim Scrollen stehen, die erste Spalte ist auf dem Handy fixiert
- **Countdown:** Tage, Std., Min., Sek. in großen Tabular-Ziffern, dazu Strecke, Flagge und lokale Uhrzeit. Kein sekündliches `aria-live`.
- **Badges:**
  - Status: geplant, vorläufig, final, korrigiert, abgesagt
  - Plattform: „PC“, „PS“, „XBOX“ als Text-Badges, **keine** Konsolen-Logos
  - LIVE: pulsierender Punkt in Türkis, nur wenn gestreamt wird
- **Flaggen:** SVG-Flaggen (MIT-lizenziert), optional pro Fahrer
- **Tabs, Segment-Schalter** (Fahrer/Konstrukteure, Punkte/Platzierung), **Akkordeon** (FAQ, Regelwerk), **Formularfelder** mit Fehlertext unter dem Feld
- **Diagramm:** Punkteverlauf als serverseitig gerendertes SVG
  - Linien in Teamfarbe mit Endmarke und Label
  - Immer mit einer Tabelle als Alternative
- **Header:**
  - Transparent über dem Hero, beim Scrollen Surface-2 mit Blur
  - Links Logo und Name, dann Navigation, rechts Sprachumschalter, LIVE-Badge und CTA „Mitfahren“
  - Auf dem Handy ein Menü als Vollbild-Overlay
- **Footer:** Logo, Kurzbeschreibung, Social (Discord, Instagram, TikTok, YouTube), rechtliche Links, „Cookie-Einstellungen“, Disclaimer

### 3.6 Bewegung (dezent)

- Hover: 150–200 ms, `ease-out`.
- Einblenden beim Scrollen: 8 px nach oben und Deckkraft, einmalig.
- Der Logo-Glow „atmet“ (Deckkraft 0,6 → 0,9, 6 s).
- Der Countdown kippt die Ziffern nicht, er wechselt sie nur.
- **`prefers-reduced-motion`:** Alle Animationen aus, der Glow bleibt statisch.
- Keine Parallax-Effekte, keine Autoplay-Videos.

---

## 4. Seitenstruktur & Seiten im Detail

### 4.1 Sitemap und URLs

Deutsch ist die Standardsprache ohne Präfix, Englisch liegt unter `/en/…` mit übersetzten Slugs. Jede Seite hat einen Sprachumschalter zur **entsprechenden** Seite, dazu `hreflang` und `x-default`.

```
/                               Startseite
/kalender                       Rennkalender (+ /kalender.ics Abo)
/rennen/[saison]/[runde]        Rennseite (Aufstellung, Quali, Rennen, Urteile, VOD)
/wertung                        aktuelle Saison: Fahrer | Konstrukteure | Matrix
/saison/[saison]/wertung        Archiv-Wertungen
/fahrer                         Fahrerliste (aktuell + Reserve + ehemalige)
/fahrer/[slug]                  Fahrerprofil
/teams                          Teamliste
/teams/[slug]                   Teamseite
/stewards                       Urteilsregister + „Vorfall melden“
/stewards/melden                Vorfall-Formular
/stewards/[ref]                 einzelne Entscheidung (z. B. S1-R03-02)
/news                           News-Übersicht (+ /news/rss.xml)
/news/[slug]                    Artikel / Rennbericht
/liga/regelwerk                 Regelwerk (Version, §-Anker, Changelog)
/liga/lobby                     Lobby-Einstellungen der aktuellen Saison
/liga/faq                       FAQ + Einsteiger-Guide
/liga/ueber-uns                 Orga-Team + offene Rollen
/liga/partner                   Partner/Sponsoren
/hall-of-fame                   Champions + ewige Bestenlisten
/archiv                         alle Saisons
/mitfahren                      Voraussetzungen + Anmeldeformular
/stream                         (vorbereitet, ausgeblendet) Twitch 2-Klick-Player
/kontakt                        Kontaktformular (2. Kontaktweg fürs Impressum)
/impressum  /datenschutz  /teilnahmebedingungen
/admin/…                        Admin-Bereich (nicht indexiert)
```

**Hauptnavigation:**
- Kalender · Wertung · Ergebnisse · Fahrer & Teams · Stewards · News · Liga ▾ (Regelwerk, Lobby, FAQ, Über uns, Partner, Hall of Fame, Archiv)
- Dazu der Button **Mitfahren**.

### 4.2 Startseite

1. **Hero:**
   - Das Wirbel-Logo groß, weiß, mit atmendem Glow in Grün und Türkis, dahinter dezent die Aquarell-Textur.
   - Liganame und Claim, zum Beispiel „Crossplay-Liga für EA SPORTS F1® 25 · 22 Cockpits · faire Rennen“.
   - **Countdown** zum nächsten Rennen mit Runde, Strecke, Flagge, Datum und lokaler Uhrzeit, dazu „Zum Kalender hinzufügen“.
   - CTAs: **Mitfahren** (primär) und **Discord beitreten** (sekundär).
   - Wenn gestreamt wird: LIVE-Banner.
2. **Anmeldestatus:** „Anmeldung offen, X Cockpits bzw. Reserveplätze frei“ oder „Warteliste“. Der Wert kommt aus den Einstellungen.
3. **Letztes Rennen:** Podium (P1–P3 mit Teamfarbe), schnellste Runde, Pole und Link zum Ergebnis. Der Status „vorläufig“ ist sichtbar.
4. **WM-Stand:** Top 5 Fahrer und Top 3 Teams, Link zur vollen Wertung.
5. **News:** 3 neueste Beiträge.
6. **Warum wir:** 4–6 Kacheln (ein Grid mit 22 Cockpits, Crossplay, transparente Stewards, Saisonarchiv, feste Startnummern, Community).
7. **Discord-Karte:** Mitglieder, gerade online, Button zum Beitreten. Die Daten holt der Server, nicht der Browser (siehe §8).
8. **Partner-Leiste**, falls vorhanden, gekennzeichnet.

### 4.3 Kalender und Rennseite

**Kalender:**
- Runden als Liste bzw. Karten mit Rundennummer, Strecke, Flagge, Datum, Uhrzeit, Format (Sprint-Kennzeichnung) und Status. Abgeschlossene Runden sind einklappbar.
- Zeiten werden in **Europe/Berlin** gepflegt und zusätzlich in der Zeitzone des Besuchers angezeigt, wenn diese abweicht.
- **ICS-Abo** (`webcal://…/kalender.ics`) für die ganze Saison und ein ICS-Download pro Rennen, mit korrekter Zeitumstellung (`TZID`).

**Rennseite:**
- Kopf: Strecke, Datum und Format.
- **Tabs:** Aufstellung · Qualifying · (Sprint) · Rennen · Stewards · Medien.
- **Aufstellung:** 22 Cockpits nach Team, Reservefahrer mit „ersetzt [Gamertag]“.
- **Ergebnis:**
  - Spalten: Pos, Nr, Fahrer, Team, Runden, Zeit/Abstand, beste Runde, Stopps, Strafen, Punkte, Status.
  - Positionsgewinne gegenüber dem Start werden als ▲/▼ angezeigt.
- **Status-Banner:** „Vorläufig, Protestfrist bis [Datum Uhrzeit]“, „Final“ oder „Korrigiert am … (Grund)“.
- **Medien:** VOD- und Highlight-Links (YouTube bzw. Twitch), Rennbericht.

### 4.4 Wertung

- **Fahrerwertung:** Pos, Nr, Fahrer, Team, Punkte, Abstand zum Führenden, Siege, Podien, Poles und schnellste Runden. Reservefahrer erscheinen in der Fahrerwertung.
- **Konstrukteurswertung:** Die Reservepunkte zählen je nach Saison-Einstellung, ein Hinweis wird angezeigt.
- **Matrix:** Position je Rennen, farblich dezent (Podium, Pole, schnellste Runde und DNF mit Kürzel). Umschalter zwischen Punkten und Platzierung.
- **Punkteverlauf:** Top 10 als Liniendiagramm plus Tabelle. **„Stand nach Runde X“** ist über gespeicherte Snapshots wählbar.
- **Gleichstand:** Aufgelöst per Countback (mehr Siege, dann mehr 2. Plätze usw.). Die Regel ist dokumentiert.
- **Saisonauswahl** fürs Archiv, dazu Teilen-Link und CSV-Export.

### 4.5 Fahrer- und Teamprofile

**Fahrerprofil:**
- Gamertag, Startnummer (groß), Flagge, Plattform, aktuelles Team (Streifen), Rolle (Stamm, Reserve, ehemalig) und „dabei seit Saison X“.
- **Kennzahlen:** Starts, Siege, Podien, Poles, schnellste Runden, Punkte, Ø-Platz, beste Platzierung, DNF-Quote, gewonnene Plätze.
- **Punkteverlauf** der aktuellen Saison und **Teamkollegen-Duell** (Quali und Rennen, Kopf an Kopf).
- Ergebnisliste nach Saison, Nummern-Historie, Einsätze als Ersatz.
- **Öffentliches Strafenregister** des Fahrers. Später kommt hier das Strafpunkte-Konto hin.
- Optionale Links zu Twitch und YouTube, nur wenn der Fahrer das wünscht.

**Teamseite:**
- Teamfarbe als Akzent, aktuelle Fahrer, Einsätze von Reservefahrern.
- Punkte, Verlauf, internes Duell und Saisonbilanzen.
- **Keine Teamlogos**, nur Name und Farbe.

### 4.6 Stewards

- **Register:**
  - Alle Entscheidungen, filterbar nach Saison, Runde, Fahrer und Art der Strafe.
  - Jeder Eintrag hat eine Referenz-ID (`S1-R03-02`), Beteiligte, Runde, Session, Entscheidung, Strafe, Begründung, Clip-Link und Datum.
- **Vorfall melden** (`/stewards/melden`):
  - Felder: Runde und Session (Auswahl), eigener Gamertag (Auswahl aus dem Grid), beteiligte Fahrer (Mehrfachauswahl), Rennrunde und Kurve, Beschreibung, **Clip-Link Pflicht** (YouTube, Twitch, Medal, Streamable, Xbox oder PS Share) mit Zeitstempel, Discord-Name für Rückfragen.
  - **Frist:** Die Protestfrist (Standard 48 h ab dem vorläufigen Ergebnis, pro Saison einstellbar) wird angezeigt. Danach ist das Formular für diese Runde zu, verspätete Meldungen gibt es nur über die Admins.
  - **Keine Identitätsprüfung** (so entschieden). Dafür:
    - Honeypot, Zeitfalle und Cloudflare Turnstile
    - Rate-Limit pro IP-Hash
    - Hinweis „Missbrauch führt zu Sanktionen“
    - Die Stewards prüfen im Zweifel per Discord nach
- **Strafenkatalog:** Link auf den entsprechenden § im Regelwerk.

### 4.7 News

- Übersicht mit Kategorie-Filter: Rennbericht, Ankündigung, Regeländerung, Neuzugänge, Community.
- **Artikel:** Titelbild, Datum, Autor (Gamertag), Text und optional ein verknüpftes Rennen (Ergebnis-Kasten wird automatisch eingebettet).
- DE und EN je Artikel. Fehlt EN, wird die DE-Version mit Hinweis gezeigt.
- RSS-Feed, OG-Bild pro Artikel.

### 4.8 Liga-Seiten

- **Regelwerk:**
  - Ein Dokument mit Kapiteln und §§ (Grundlagen, Anmeldung & Abmeldung, Fahrverhalten, Qualifying, Rennen, Safety Car, Vorfälle & Proteste, Strafenkatalog als Tabelle, Discord-Verhalten, Sonderregeln der Spielversion).
  - Inhaltsverzeichnis links (sticky), Suche, **Anker-Link pro §**.
  - Oben Version, Stand und Changelog. Druckansicht.
  - EN ist als „Übersetzung, die deutsche Fassung ist verbindlich“ markiert.
- **Lobby-Einstellungen:** Aus den Saisondaten erzeugt, als Karten gruppiert. Dazu „So kommst du in die Lobby“ (Crossplay an, EA-Freundschaft mit dem Host usw.).
- **FAQ und Einsteiger-Guide:**
  - **Voraussetzungen:** Spiel und DLC, Crossplay, EA-ID, Discord, Mindestalter 16, Eingabegerät.
  - **Ablauf eines Renntags** (Zeitleiste), Abmeldung über Discord, Umgang mit Lags und Disconnects, Setup-Tipps.
  - FAQ als Akkordeon.
- **Über uns und Team-Suche:**
  - Orga-Team als Karten (Gamertag, Rolle, seit wann, optional Avatar).
  - Offene Rollen (Steward, Grafik, Social Media, später Caster) mit Aufgabe, Zeitaufwand und Kontakt per Discord-Ticket.
- **Partner:**
  - Partnerkarten mit Logo, Text, Link (`rel="sponsored"`) und dem Label **„Anzeige“**.
  - Abschnitt „Partner werden“.
  - Intern gibt es eine Ausschlussliste: Glücksspiel, Wetten, Skins und Cases, Alkohol, Krypto.
- **Hall of Fame:** Champions pro Saison (Fahrer und Team) als große Karten, dazu ewige Bestenlisten (Titel, Siege, Podien, Poles, schnellste Runden, Starts, Punkte).
- **Archiv:** Alle Saisons mit Endstand und Link. Abgeschlossene Saisons sind **eingefroren** und nur noch lesbar.

### 4.9 Mitfahren (Anmeldung ohne Login)

- **Oben:** Voraussetzungen, Ablauf in nummerierten Schritten (Formular → Discord beitreten → Admin meldet sich → Einteilung als Stamm- oder Reservefahrer), aktueller Anmeldestatus.
- **Formularfelder:**

| Feld | Pflicht | Hinweis |
|---|---|---|
| Gamertag / EA-ID | ja | wird normalisiert (Trim, Unicode NFKC, keine Zero-Width-Zeichen) |
| Discord-Benutzername | ja | für die Kontaktaufnahme |
| Plattform | ja | PC (Steam), PC (EA App), PlayStation, Xbox |
| Eingabegerät | ja | Lenkrad, Controller |
| Wunsch-Startnummer | ja | Live-Prüfung „frei/vergeben“, 2–99 (die 1 bleibt ggf. dem Champion vorbehalten) |
| Nationalität | nein | für die Flagge |
| Wunschrolle | ja | Stammfahrer, Reserve, egal |
| Verfügbarkeit am Renntag | ja | regelmäßig, meistens, unregelmäßig |
| Erfahrung / Referenzzeit | nein | Freitext bzw. Time-Trial-Zeit |
| Checkbox „Ich bin mindestens 16“ | ja | kein Geburtsdatum |
| Checkbox Regelwerk & Teilnahmebedingungen | ja | inklusive Veröffentlichung von Gamertag und Ergebnissen |
| Hinweis Datenschutz | – | Link, keine Checkbox nötig |

- **Nach dem Absenden:**
  - Eintrag in der DB mit Status „neu“.
  - Discord-Webhook in `#anmeldungen` mit **minimalen Daten**: Gamertag, Plattform, Wunschnummer und Link in den Admin-Bereich. Den Discord-Namen gibt es nur im Admin-Bereich.
  - Bestätigungsseite mit Discord-Button und „Wie geht es weiter?“.
- **Schutz:** Honeypot, Zeitfalle, Turnstile, Rate-Limit und eine Duplikat-Erkennung (gleicher Discord-Name oder gleicher Gamertag).

### 4.10 Rechtliche Seiten und Sonstiges

- Impressum, Datenschutz, Teilnahmebedingungen (siehe §9), Kontaktformular, 404 im Liga-Stil.
- `sitemap.xml` (nur Live-Seiten), `robots.txt`, `/admin` mit `noindex`.

---

## 5. Admin-Bereich (`/admin`)

**Login:**
- Über **Discord OAuth**.
- Nach dem Login prüft der Server mit dem Bot-Token, welche Rollen die Person auf dem Liga-Server hat. Die Rollen sind auf App-Rollen abgebildet, etwa `@Admin` → admin, `@Steward` → steward, `@Redaktion` → redakteur.
- Die Rolle wird bei jeder Sitzung und spätestens alle 15 Minuten neu geprüft. **Wer die Discord-Rolle verliert, verliert den Zugang.**
- Alles mobil nutzbar, damit man am Renntag auch vom Handy eintragen kann.

| Modul | Rolle | Funktionen |
|---|---|---|
| **Dashboard** | alle | Nächstes Rennen, offene Aufgaben: neue Anmeldungen, offene Vorfälle, vorläufige Ergebnisse, fehlende Übersetzungen, ablaufende Protestfristen |
| **Saisons** | Admin | Saison anlegen oder aus der Vorsaison **klonen**: Name, Spielversion, Punkteschema, Reservepunkte für Konstrukteure (ja/nein), Protestfrist, Lobby-Einstellungen, Regelwerk-Version, Status (geplant, aktiv, abgeschlossen) |
| **Punkteschemata** | Admin | Punkte je Platz (Rennen und Sprint), Bonus für schnellste Runde (inkl. Bedingung „nur Top N“), Pole-Bonus. Vorlagen: F1 aktuell, F1 mit Bonus für schnellste Runde, bis P22 |
| **Kalender** | Admin | Runden anlegen (auch im Stapel): Strecke, Datum, Uhrzeit (Europe/Berlin), Format, Status, VOD-Link |
| **Teams und Cockpits** | Admin | 11 Teams, Farbe, Reihenfolge. **Saisonaufstellung:** zwei Cockpits pro Team, Transfers während der Saison mit Gültigkeit ab Runde X |
| **Fahrer** | Admin | Anlegen (auch per Klick aus einer Anmeldung), Status (aktiv, Reserve, inaktiv, gesperrt), Plattform, Flagge, private Kontaktdaten. **Startnummern:** vergeben, wechseln (gilt ab dem nächsten Rennen), freigeben (bei inaktiven Fahrern). Die Historie wird gespeichert |
| **Anmeldungen** | Admin | Eingang mit Status (neu, kontaktiert, angenommen, Warteliste, abgelehnt) und Notizen. „Annehmen“ legt den Fahrer an |
| **Grid-Builder** | Admin | Pro Runde, siehe unten |
| **Ergebnisse** | Admin | Pro Session, siehe unten |
| **Stewards** | Steward | Eingang der Vorfälle, Entscheidung, Veröffentlichung, siehe unten |
| **News** | Redakteur, Admin | Editor (Markdown mit Vorschau), DE/EN nebeneinander, Titelbild, Kategorie, verknüpftes Rennen, Entwurf, geplante Veröffentlichung |
| **Regelwerk** | Admin | §-Struktur bearbeiten, neue **Version** mit Pflicht-Changelog veröffentlichen, alte Versionen bleiben abrufbar |
| **Seiten-Inhalte** | Redakteur, Admin | FAQ-Einträge, Orga-Team, offene Rollen, Partner, Texte der Startseite und des Anmeldestatus |
| **Einstellungen** | Admin | Discord-Invite, Webhook-URLs je Channel, Social-Links, Twitch-Kanal (leer bedeutet ausgeblendet), GA-ID, Zuordnung der Discord-Rollen |
| **Audit-Log** | Admin | Wer hat was wann geändert, mit Vorher/Nachher |

### 5.1 Grid-Builder (pro Runde)

- **Vorbelegung:** 22 Cockpits aus der Saisonaufstellung, 11 Team-Spalten zu je 2 Plätzen. Rechts steht der **Reservepool**, sortiert nach Warteliste.
- **Abmeldungen:** Der Admin markiert abgemeldete Fahrer, z. B. per Klick auf „abwesend“, und hält fest, ob die Abmeldung rechtzeitig kam. Das Cockpit wird frei.
- **Ersatz:** Einen Reservefahrer per **Drag & Drop** auf das freie Cockpit ziehen. Die Website speichert „ersetzt X“. Per Tastatur geht es über „Cockpit wählen → Fahrer wählen“.
- **Prüfungen:**
  - Fahrer doppelt?
  - Nummernkonflikt?
  - Gesperrter Fahrer?
  - Mehr als 22 Fahrer?
- **Veröffentlichen:** Die Aufstellung erscheint auf der Rennseite, optional mit Discord-Post. In Phase 2 dient sie auch als Datenquelle für Grafiken und Overlays.

### 5.2 Ergebnis-Eingabe

- **Pro Session** (Quali, Sprint, Rennen), **vorbefüllt mit der Aufstellung**.
- **Reihenfolge** per Drag & Drop oder Positionsnummer. Dazu Status (gewertet, DNF, DNS, DSQ), beste Runde (mm:ss.SSS), Gesamtzeit bzw. Abstand (optional), Stopps (optional) und Ingame-Strafsekunden.
- **Automatisch:**
  - Schnellste Runde aus der besten Rundenzeit
  - Pole aus der Quali
  - Punkte nach dem Saisonschema
  - Positionsänderungen
- **Ablauf:**
  1. „Speichern als vorläufig“ zeigt die Vorschau der neuen Wertung.
  2. **„Vorläufig veröffentlichen“** macht das Ergebnis sichtbar, startet die Protestfrist und postet in Discord.
  3. Nach den Steward-Entscheidungen wird das Ergebnis **„final“**. Dann wird ein Wertungs-Snapshot gespeichert und ein Discord-Post verschickt.
- **Korrektur nach „final“:** Status „korrigiert“ mit Pflicht-Grund. Der Hinweis ist öffentlich sichtbar, dazu gibt es einen Discord-Post.
- **Phase 2:** Import eines UDP-JSON oder einer CSV führt in **denselben Prüfbildschirm**, die Fahrer werden über die Startnummer zugeordnet.

### 5.3 Steward-Werkzeug

- **Eingang:** Status neu, in Prüfung, entschieden, abgelehnt, verspätet. Clip-Vorschau per Link.
- **Entscheidungsformular:**
  - Art: keine Strafe, Verwarnung, Zeitstrafe (s), Positionsstrafe, Grid-Strafe für das nächste Rennen, DSQ, Rennsperre.
  - Strafpunkte: Das Feld ist vorbereitet und bleibt ausgeblendet, bis das System aktiviert ist.
  - Begründung in DE, EN optional. Textbausteine aus dem Strafenkatalog.
- **Befangenheit:** Ein Steward, der am Vorfall beteiligt ist, kann nicht entscheiden. Das System erzwingt das.
- **Optional:** Vier-Augen-Prinzip. Eine zweite Steward-Stimme ist nötig, pro Saison einstellbar.
- **Veröffentlichen:**
  - Der Eintrag erscheint im öffentlichen Register.
  - Discord-Webhook in `#urteile`.
  - **Zeit-, Positions- und DSQ-Strafen fließen automatisch ins Ergebnis ein**, die Wertung wird neu berechnet.
- **Von Stewards selbst eröffnete Untersuchungen** gibt es auch ohne Meldung.

---

## 6. Datenmodell (Postgres / Supabase)

**Grundsätze:**
- Jede Tabelle hat eine `id` sowie `created_at` und `updated_at`.
- **Öffentliche Daten** laufen über lesende Views. **Private Daten** liegen in eigenen Tabellen ohne öffentlichen Zugriff (RLS standardmäßig „deny“).
- Geschrieben wird **nur über den Server**, nach der Rollenprüfung.

### 6.1 Liga-Struktur
```
seasons           id, number, slug, name, game_version ("F1 25 · 2026 Season Pack"), status
                  (planned|active|finished), points_scheme_id, reserve_points_for_constructors bool,
                  protest_window_hours (48), two_steward_rule bool, penalty_points_enabled bool,
                  lobby_settings jsonb, rules_version_id, starts_on, ends_on
points_schemes    id, name, race_points int[], sprint_points int[], fastest_lap_bonus int,
                  fastest_lap_max_pos int, pole_bonus int
tracks            id, slug, name_de, name_en, country_code, game_track_id, length_km, laps_default
rounds            id, season_id, number, track_id, local_start (timestamp ohne TZ), timezone
                  ('Europe/Berlin'), start_utc (berechnet), format (standard|sprint), status
                  (scheduled|lineup_published|provisional|final|corrected|cancelled),
                  provisional_at, protest_deadline (berechnet), vod_url, highlights_url
sessions          id, round_id, type (qualifying|sprint|race), weather, status
teams             id, slug, name, short_name, color_hex, text_color_hex, game_team_id, active
season_teams      season_id, team_id, sort_order
```

### 6.2 Fahrer, Nummern, Cockpits
```
drivers           id, slug, gamertag, nationality_code?, platform (pc_steam|pc_ea|playstation|xbox),
                  input_device, status (active|reserve|inactive|banned), joined_season_id,
                  twitch_url?, youtube_url?, show_links bool, anonymized bool
driver_private    driver_id (PK), discord_user_id?, discord_username, ea_id, notes      -- nur Admin
driver_numbers    id, driver_id, number (2..99, ggf. 1), valid_from (timestamptz), valid_to?
                  → partieller UNIQUE-Index auf number WHERE valid_to IS NULL
                  (eine Nummer ist immer nur einmal aktiv vergeben; Historie bleibt)
seats             id, season_id, team_id, seat_no (1|2), driver_id, from_round, to_round?
round_entries     id, round_id, team_id, seat_no, driver_id, role (regular|reserve),
                  replaces_driver_id?, race_number (Snapshot zur Runde)
round_absences    round_id, driver_id, reported_in_time bool          -- für Statistik/spätere Fehlstrafpunkte
```

### 6.3 Ergebnisse und Wertung
```
results           id, session_id, round_entry_id, driver_id, team_id, race_number,
                  position?, status (classified|dnf|dns|dsq|dnc), grid_position?, laps,
                  total_time_ms?, gap_ms?, best_lap_ms?, pit_stops?, ingame_penalty_s,
                  is_fastest_lap bool, is_pole bool, points (berechnet bei Veröffentlichung),
                  counts_for_constructors bool (aus Rolle + Saison-Einstellung)
standings_snapshots  id, season_id, after_round_id, kind (driver|team), entity_id,
                  position, points, wins, podiums, poles, fastest_laps, created_at
                  → Grundlage für Punkteverlauf und „Stand nach Runde X“
awards            id, season_id, round_id?, type (champion|constructors|driver_of_the_day|…), driver_id?, team_id?
```
- **Punkteberechnung:** Eine getestete TypeScript-Funktion auf dem Server (Unit-Tests) wendet Schema, Boni, Strafen und DSQ an.
- **Wertung:** Die aktuelle Wertung wird live aus `results` berechnet, die Snapshots frieren jeden veröffentlichten Stand ein.
- **Gleichstand:** Countback.

### 6.4 Stewards
```
incidents         id, round_id, session_id, reporter_driver_id?, reporter_contact, involved_driver_ids int[],
                  lap?, corner?, description, clip_url, clip_timestamp?, submitted_at, ip_hash,
                  status (new|in_review|decided|rejected|late)
decisions         id, public_ref ("S1-R03-02"), incident_id?, round_id, session_id?, driver_id,
                  verdict (no_action|warning|time_penalty|position_penalty|grid_penalty_next|dsq|race_ban),
                  time_seconds?, positions?, penalty_points? (vorbereitet), reasoning_de, reasoning_en?,
                  clip_url?, decided_by uuid[], status (draft|published|revoked), published_at
```

### 6.5 Inhalte (zweisprachig)
```
news              id, slug_de, slug_en, title_de, title_en?, excerpt_*, body_de, body_en? (Markdown),
                  cover_image, category, round_id?, author_id, status (draft|scheduled|published), publish_at
rules_versions    id, version ("1.0"), effective_from, changelog_de, changelog_en?, status
rules_sections    id, version_id, parent_id?, number ("§3.2"), title_de, title_en?, body_de, body_en?, sort
faq_items         id, category, question_de/en, answer_de/en, sort
staff_members     id, gamertag, role_de/en, avatar?, since_season, sort
open_positions    id, title_de/en, description_de/en, effort, active
partners          id, name, logo, url, text_de/en, label_ad bool, active, sort
settings          key, value jsonb   (Invite, Webhooks, Socials, Twitch, GA-ID, Anmeldestatus, Rollen-Mapping)
```

### 6.6 Anmeldung, Admin, Protokoll
```
registrations     id, gamertag, discord_username, ea_id, platform, input_device, nationality?,
                  desired_number, wanted_role, availability, experience?, reference_time?,
                  consents jsonb (16+, Regeln, Zeitpunkt, Version), status, admin_notes, ip_hash,
                  processed_by?, processed_at?
staff_accounts    user_id (Supabase Auth), discord_user_id, display_name, roles text[], roles_checked_at
audit_log         id, actor_id, action, entity, entity_id, diff jsonb, at
import_batches    (Phase 2) id, session_id, source (udp|csv), raw jsonb, mapping jsonb, status, uploaded_by
```

### 6.7 Datenschutz im Modell

- **Löschung:** Wer seine Daten löschen lassen will, wird **pseudonymisiert** („Ehemaliger Fahrer #123“). So bleiben die Wertungen stimmig.
- **Aufbewahrung:**
  - Abgelehnte Anmeldungen: nach 6 Monaten gelöscht.
  - `ip_hash`: nach 30 Tagen gelöscht.
  - Kontaktdaten aus Vorfällen: nach Saisonende gelöscht.

---

## 7. Technik & Architektur

### 7.1 Stack

| Baustein | Wahl | Warum |
|---|---|---|
| Framework | **Astro 6** | Inhaltslastige Seite, extrem schnell, eingebautes i18n-Routing, Fonts-API, Actions für Formulare, CSP-Unterstützung |
| Interaktive Teile | **Svelte 5**-Islands | Klein und schnell. Für Countdown, Tabellen-Umschalter, Grid-Builder (Drag & Drop) und Admin-Formulare |
| Styling | **Tailwind CSS 4** mit Design-Tokens (`@theme`) plus eigene Komponenten | Einheitliche Tokens, schnelles Bauen, kleine CSS-Datei |
| Datenbank, Auth, Dateien | **Supabase** (Postgres, Region **Frankfurt**), Discord-OAuth, Storage | Free-Tier reicht für Jahre. RLS, Migrationen im Repo |
| Hosting | **Cloudflare Workers** mit Static Assets | Kostenlos, schnell in DE. Cron-Trigger, Turnstile und E-Mail-Routing aus einer Hand. Kein Verbot kommerzieller Nutzung im Free-Tier (anders als Vercel Hobby) |
| Domain | `.de` bei INWX oder netcup (ca. 5–6 €/Jahr), DNS bei Cloudflare | Cloudflare selbst bietet keine `.de`-Domains an |
| E-Mail | Cloudflare Email Routing (`kontakt@…` → Weiterleitung) | Kostenlos |
| Code | GitHub-Organisation **der Liga**, GitHub Actions | CI/CD, Backups, Rebuilds |

### 7.2 Rendering-Strategie

**Hybrid:**
- **Öffentliche Seiten werden statisch vorgerendert.** Grundlage sind die DB-Daten zum Build-Zeitpunkt.
- Beim **Veröffentlichen** im Admin (Ergebnis, News, Urteil, Kalender, Aufstellung) wird ein **Rebuild** ausgelöst, gebündelt mit 60 s Verzögerung. Nach etwa 1–3 Minuten ist alles live.
- **Warum statisch:**
  - Maximale Geschwindigkeit, kein Ausfallrisiko bei vielen Besuchern.
  - Unbegrenzt kostenlos.
  - Es umgeht das **CPU-Limit des Workers-Free-Tiers** (etwa 10 ms pro Anfrage), das für serverseitiges Rendern großer Tabellen knapp wäre.
- **Dynamisch (Worker)** bleiben:
  - Formulare (Anmeldung, Vorfall, Kontakt)
  - Admin-Bereich
  - Nummern-Verfügbarkeit
  - Discord- und Twitch-Status (gecacht)
  - `kalender.ics`
- **Countdown und lokale Zeitanzeige** laufen im Browser (kleine Island).

### 7.3 Architekturskizze
```
                ┌────────────── Cloudflare ──────────────────────────────┐
Besucher ──────►│ Static Assets: alle öffentlichen Seiten (DE/EN)        │
                │ Worker (Astro SSR):                                    │
                │   /mitfahren, /stewards/melden, /kontakt  (Actions)    │──► Discord-Webhooks
                │   /api/number-check, /api/discord-card, /api/live      │──► Discord API / Twitch Helix
                │   /admin/*  (Discord-Login, Rollencheck per Bot-Token) │
                │ Cron: Supabase-Keep-alive, Discord/Twitch-Cache,       │
                │       geplante News, Aufräumen (Löschfristen)          │
                └──────────────┬─────────────────────────────────────────┘
                               │ service key nur serverseitig
                        ┌──────▼───────┐
                        │ Supabase (FRA)│ Postgres · Auth (Discord) · Storage
                        └──────▲───────┘
                               │
GitHub Actions: Build + Deploy (bei Push & bei „Veröffentlichen“), Tests, nächtliches Backup → R2
Phase 2: Telemetrie-Companion (PC in der Lobby) ──UDP 20777──► JSON ──► /api/import (Entwurf)
```

### 7.4 Mehrsprachigkeit

- Astro-i18n: `defaultLocale: 'de'`, `locales: ['de','en']`. Deutsch ohne Präfix, Englisch unter `/en/`.
- **UI-Texte** liegen in Wörterbuch-Dateien (`de.json`, `en.json`). Ein Typcheck meldet fehlende Schlüssel.
- **Inhalte** (News, Regelwerk, FAQ usw.) stehen in `_de`- und `_en`-Feldern der DB. Fehlt EN, kommt die DE-Version mit dem Hinweis „Not yet translated“, und das Admin-Dashboard listet die fehlenden Übersetzungen auf.
- Datum, Uhrzeit und Zahlen werden per `Intl` formatiert (de-DE bzw. en-GB).
- Strecken- und Ländernamen liegen zweisprachig in `tracks`.

### 7.5 Bilder und Medien

- Logo und Icons als SVG, Fotos als AVIF/WebP mit festen Maßen (kein Layout-Shift).
- **Uploads** (Titelbilder, Partnerlogos, Avatare) werden **im Browser des Admins** verkleinert und nach WebP umgewandelt (1600 px und 800 px), EXIF-Daten entfernt, dann in Supabase Storage abgelegt. Die Bildumwandlung von Supabase ist im Free-Tier nicht enthalten.
- Streckenkarten als einfache SVG-Umrisse (selbst erstellt oder aus offenen Daten mit Lizenzangabe). Kein offizielles F1-Material.

### 7.6 Entwicklung und Qualitätssicherung

- **Repo:** Astro-App, `supabase/migrations`, Seed-Daten (11 Teams 2026 mit Farben, Strecken aus dem Spiel, Beispiel-Saison), `docs/` (Admin-Handbuch, Renntag-Runbook).
- **Tests:**
  - **Vitest** für die Punkte- und Wertungslogik: Tiebreaks, DSQ nach Veröffentlichung, Reservepunkte, Grid-Strafen, abgesagte Runden, Sprint.
  - **Playwright** für die Hauptabläufe: Anmelden, Aufstellung bauen, Ergebnis eintragen, Strafe veröffentlichen, Wertung prüfen.
  - **axe** für Barrierefreiheit.
- **CI:** Lint, Typecheck, Tests, Link-Check, Lighthouse-Budget, Preview-Deployment pro Pull Request.
- **Renntags-Freeze:** Kein Deploy von Code am Renntag. Inhaltliche Rebuilds sind erlaubt.

---

## 8. Integrationen

### 8.1 Discord

- **Webhooks**, je Channel eine eigene URL. Sie sind in den Einstellungen gespeichert und nur dem Server bekannt.

| Ereignis | Channel (Vorschlag) | Inhalt |
|---|---|---|
| Neue Anmeldung | `#anmeldungen` (nur Admins) | Gamertag, Plattform, Wunschnummer, Link zum Admin-Bereich |
| Aufstellung veröffentlicht | `#aufstellung` | 22 Cockpits, Ersatzfahrer markiert |
| Ergebnis vorläufig bzw. final bzw. korrigiert | `#ergebnisse` | Embed im Liga-Design: Podium, Pole, schnellste Runde, Link, Protestfrist |
| Neuer Vorfall | `#stewards-intern` (nur Stewards) | Runde, Beteiligte, Clip-Link, Link zum Admin-Bereich |
| Urteil veröffentlicht | `#urteile` | Referenz, Fahrer, Entscheidung, Kurzbegründung, Link |
| News | `#news` (optional) | Titel, Teaser, Bild |

- **Staff-Login:** Discord-OAuth über Supabase. Die Rollen prüft der Server über die Discord-API mit dem Bot-Token.
- **Discord-Karte:**
  - Der **Server** fragt die Mitglieder- und Online-Zahl ab (Invite-API mit `with_counts`) und cacht sie 10 Minuten.
  - Die Website zeigt eine eigene Karte im Liga-Design.
  - Es gibt **kein eingebettetes Discord-iframe**, dadurch fließen keine Besucherdaten an Discord und es braucht keinen Consent.
- **Invites:** Pro Quelle (Website, Instagram, TikTok, YouTube) ein **eigener dauerhafter Invite**. So ist messbar, woher neue Mitglieder kommen.

### 8.2 Twitch (vorbereitet)

- Ist in den Einstellungen ein Kanal eingetragen, prüft ein Cron-Job jede Minute über die Twitch Helix API, ob live gestreamt wird. Das Ergebnis wird gecacht.
- Dann erscheinen das LIVE-Badge und das Banner. Ohne Kanal ist beides unsichtbar.
- **Player** auf `/stream` nur per **2-Klick**: erst ein Vorschaubild mit Hinweis, das iframe lädt erst nach dem Klick.
- Die Rennseite verlinkt die VODs. Weil Twitch VODs löscht, werden sie für das Archiv zu **YouTube** exportiert.

### 8.3 Google Analytics 4

- **Consent-Banner** auf der ersten Ebene mit gleichwertigen Buttons „Akzeptieren“ und „Ablehnen“ sowie „Einstellungen“. Kategorien: notwendig, Statistik.
- Umsetzung mit einer schlanken Open-Source-Bibliothek, etwa `vanilla-cookieconsent` (MIT), im Liga-Design.
- **GA lädt erst nach Zustimmung** (Consent Mode v2, „Basic“: vorher gibt es keinen einzigen Request an Google).
- Im Footer steht „Cookie-Einstellungen“ zum Widerruf.
- In der GA-Verwaltung die Auftragsverarbeitungsbedingungen akzeptieren. Die Datenspeicherung minimal einstellen (2 Monate), Google Signals aus.
- **Ereignisse:** Anmeldung abgeschickt, Discord-Klick, Vorfall gemeldet, ICS-Abo. Zusätzlich die Discord-Invite-Statistik je Quelle, die ohne Consent funktioniert.

### 8.4 Cloudflare Turnstile

- Unsichtbare Bot-Prüfung für Anmeldung, Vorfall und Kontakt.
- Wird in der Datenschutzerklärung genannt.

---

## 9. Recht & Datenschutz

Das ist keine Rechtsberatung. Die Punkte vor dem Launch fachkundig prüfen lassen.

### 9.1 Marke und Name (blockiert Namenswahl und Domain)

- **Die Formula-1-Richtlinien verbieten die Nutzung ihrer Marken** (F1, Formula 1, Formel 1, Grand Prix, offizielle Event-Titel) **für Sim-Racing- und Esports-Teams und -Ligen**, außer mit schriftlicher Lizenz.
  - Deshalb **kein „F1“ im Liganamen oder in der Domain**.
  - Beschreibend ist es in Ordnung: „Online-Liga für EA SPORTS F1® 25“.
- **Keine** F1-Logos, Teamlogos, offiziellen Schriften oder Event-Titel.
  - Rennen heißen „R5 · Suzuka“, nicht „Großer Preis von Japan“.
  - Teamnamen nur beschreibend, mit Farbstreifen.
- **Disclaimer im Footer:**
  > Inoffizielle Fan-Liga. Nicht verbunden mit Formula One Group, FIA, Electronic Arts oder Codemasters. F1® ist eine Marke der Formula One Licensing B.V.
- **Vor der Namensentscheidung prüfen:**
  - Markenrecherche bei DPMA und EUIPO
  - Ist die Domain frei?
  - Sind die Handles bei Instagram, TikTok, YouTube und Discord-Vanity frei?

### 9.2 Pflichtseiten

- **Impressum nach § 5 DDG**, bei News zusätzlich „Verantwortlich nach § 18 Abs. 2 MStV“:
  - Volljährige Person mit ladungsfähiger Anschrift.
  - E-Mail **plus** zweiter schneller Kontaktweg (Kontaktformular).
  - Als echtes HTML, kein iframe.
  - **Noch offen: wer?** Möglich ist später auch ein e.V. (E-Sport ist seit 2026 gemeinnützig anerkennbar).
- **Datenschutzerklärung (Art. 13 DSGVO), in einfacher Sprache.** Sie nennt:
  - Hosting und CDN (Cloudflare), Datenbank und Auth (Supabase, Frankfurt), Turnstile, E-Mail-Routing
  - Formulare und ihre Weiterleitung an **Discord** (Webhooks, US-Anbieter)
  - Discord-Login (nur Staff)
  - GA4 mit Einwilligung
  - YouTube- und Twitch-Embeds (2-Klick)
  - Server-Logs
  - Rechtsgrundlagen, Speicherdauer, Betroffenenrechte, Drittlandtransfer (DPF), Beschwerderecht
  - Keine Formulierungen nach dem Muster „mit Nutzung einverstanden“
- **Teilnahmebedingungen:**
  - Veröffentlichung von Gamertag, Nummer, Ergebnissen und Steward-Entscheidungen
  - Nutzung von eingereichten Clips
  - Spätere Streams: Einwilligung, Voice nur nach Opt-in
  - Mindestalter 16, Löschung und Pseudonymisierung
- **Auftragsverarbeitungsverträge** mit Supabase und Cloudflare abschließen, bei Google die GA-Bedingungen akzeptieren.

### 9.3 Weitere Punkte

- Alles selbst hosten: Schriften und Bibliotheken, kein Google-CDN.
- Werbung und Partner mit „Anzeige“ kennzeichnen, dazu `rel="sponsored"`.
- 16–17-Jährige: nur Gamertag öffentlich, Pokal-Lieferadressen getrennt erheben und nach dem Versand löschen.
- Barrierefreiheit nach WCAG 2.2 AA. Das BFSG greift für eine Hobby-Liga voraussichtlich nicht, WCAG ist trotzdem unser Maßstab.

---

## 10. Qualitätsziele

| Bereich | Ziel |
|---|---|
| Performance | LCP < 2,0 s (4G), CLS < 0,05, INP < 200 ms, JS pro öffentlicher Seite < 50 KB, Seite gesamt < 300 KB (ohne Titelbilder) |
| Barrierefreiheit | WCAG 2.2 AA: Kontraste ≥ 4,5:1, Tastaturbedienung (auch Grid-Builder), Skip-Link, Fokus sichtbar, `th scope`, Alt-Texte, Reduced Motion |
| SEO | Ein H1 pro Seite, eindeutige Titles („Seite · [LIGANAME]“) und Descriptions, `hreflang`, JSON-LD (`SportsOrganization`, `SportsEvent` pro Runde, `BreadcrumbList`, `NewsArticle`), OG-Bilder, Sitemap |
| Sicherheit | HSTS, CSP (eingebaut in Astro), `X-Content-Type-Options`, `Referrer-Policy`, RLS standardmäßig „deny“, Service-Key und Bot-Token nur serverseitig, 2FA für alle Staff-Accounts (Discord, GitHub, Supabase, Cloudflare, Domain), Rate-Limits |
| Mobile | 320–1440 px ohne horizontales Scrollen, Touch-Ziele ≥ 44 px, Admin-Bereich am Handy benutzbar |

---

## 11. Betrieb & Abläufe

### 11.1 Renntag (Standardablauf, Zeiten pro Saison einstellbar)

| Wann | Wer | Was |
|---|---|---|
| bis T−24 h | Admin | Abmeldungen aus Discord ins Grid übernehmen, Aufstellung veröffentlichen |
| T−15 min | Host | Lobby öffnen (Einstellungen laut `/liga/lobby`) |
| Rennende + ≤ 2 h | Admin | Ergebnis eintragen → **vorläufig** veröffentlichen, die Protestfrist startet |
| + 48 h | Fahrer | Vorfälle melden (danach ist das Formular zu) |
| + ≤ 72 h nach Fristende | Stewards | Entscheiden und veröffentlichen, Strafen fließen ins Ergebnis |
| danach | Admin | Ergebnis **final** setzen, Snapshot und Discord-Post |

### 11.2 Saisonwechsel (Checkliste im Admin)

1. Saison beenden: Champions in die Hall of Fame, Saison **einfrieren**.
2. Umfrage unter den Fahrern, Regelwerk überarbeiten, neue Version veröffentlichen.
3. Neue Saison aus der alten **klonen** (Punkteschema, Lobby, Teams). Kalender anlegen.
4. Rückmeldung der Stammfahrer (bleibt / pausiert / hört auf), Nummern inaktiver Fahrer freigeben, Cockpits neu belegen.
5. Discord-Rollen und Grafiken aktualisieren, Anmeldefenster öffnen.

### 11.3 Verantwortlichkeiten

- **Admin:** Saison, Kalender, Fahrer, Grid, Ergebnisse, Einstellungen.
- **Steward:** Vorfälle und Urteile.
- **Redakteur:** News, FAQ, Seiten, Übersetzungen.
- **Aktualitäts-Check:** Jede Inhaltsseite zeigt „Stand: …“. Einmal pro Quartal prüft die Redaktion alle Seiten.
- **Verbindliche Quelle:** Die Website gilt für Regeln, Kalender und Ergebnisse, Discord ist für die Kommunikation da. Das steht so im Regelwerk.

### 11.4 Technischer Betrieb

- **Backups:** Nächtlich `pg_dump` per GitHub Action, verschlüsselt nach Cloudflare R2 (Free-Tier). 30 Tage rollierend, dazu dauerhafte Saison-Snapshots. **Wiederherstellung einmal pro Quartal testen.**
- **Keep-alive:** Das Supabase-Free-Tier pausiert nach 7 Tagen Inaktivität, ein Cron-Job verhindert das.
- **Monitoring:** Uptime-Check, Fehlerlogs der Workers, Dependabot für Updates, automatische Verlängerung der Domain.
- **Accounts gehören der Liga:** Gemeinsamer Passwortmanager, mindestens 2 Personen mit Owner-Zugang (Bus-Faktor).
- **Notfall am Renntag:** Discord ist der Fallback. Lobby-Info und Aufstellung sind dort angepinnt.

---

## 12. Roadmap

### Phase 0: Vorbereitung (blockiert den Start)

- [ ] Liganame und Kürzel (ohne „F1“), dann Marken-, Domain- und Handle-Check, Domain registrieren
- [ ] Person fürs Impressum klären
- [ ] Logo vektorisieren (Varianten aus §3.1), Wortmarke nach dem Namen
- [ ] Discord-Server:
  - Channels für die Webhooks
  - Rollen Admin, Steward und Redaktion
  - Bot-Application anlegen
  - Invites je Quelle
- [ ] Accounts auf die Liga anlegen: GitHub-Org, Cloudflare, Supabase, Google Analytics
- [ ] Rennformat, Renntag und Uhrzeit, erstes Punkteschema, Protestfrist festlegen
- [ ] Test in einer echten Lobby: Braucht jeder Teilnehmer das 2026 Season Pack?

### Phase 1: MVP (alles, was für den Start gewählt wurde)

| Meilenstein | Inhalt |
|---|---|
| **M1 Fundament** | Repo, CI/CD, Design-Tokens und Komponenten, Layout (Header, Footer, Navigation), i18n DE/EN, Rechtsseiten, Consent-Banner und GA, DB-Schema, Migrationen, Seed, Staff-Login mit Rollencheck |
| **M2 Liga-Kern (Admin)** | Saisons, Punkteschemata, Teams und Cockpits, Fahrer inkl. Nummern-Historie, Kalender, **Grid-Builder**, **Ergebnis-Eingabe**, Punkte- und Wertungslogik mit Tests, Snapshots |
| **M3 Öffentliche Sportseiten** | Startseite mit Countdown, Kalender und ICS, Rennseite, Wertungen mit Matrix und Punkteverlauf, Fahrer- und Teamprofile, Hall of Fame, Archiv |
| **M4 Stewards** | Vorfall-Formular mit Spam-Schutz, Steward-Eingang, Entscheidungen, öffentliches Register, automatische Anwendung auf Ergebnisse |
| **M5 Inhalte** | News mit Editor, Regelwerk mit Versionen, Lobby-Seite, FAQ und Guide, Über uns und Team-Suche, Partner, Anmeldeformular mit Nummernprüfung |
| **M6 Integrationen** | Discord-Webhooks, Discord-Karte, Twitch-Live vorbereitet (Feature-Flag), Turnstile, Cron-Jobs, Backups |
| **M7 Qualität und Soft-Launch** | Lighthouse, axe, Link-Check, E2E-Tests. **Geschlossene Beta** mit `noindex` und einer Test-Saison mit 2 Test-Renntagen. Admin-Handbuch. Danach öffentlicher Launch mit dem Anmeldefenster |

### Phase 2: Automatisierung und Medien

- **Telemetrie-Import (UDP):** Ein kleines Companion-Programm läuft auf einem PC in der Lobby (Host oder Zuschauer). Es liest Participants, Final Classification und Session History und lädt das Ergebnis als **Entwurf** hoch. Die Fahrer werden über die **Startnummer** zugeordnet. **Vorher per Feldtest prüfen**, ob die Final Classification im Crossplay zuverlässig ankommt und welches UDP-Format (2025 oder 2026) gilt.
- **Automatische Social-Grafiken** im Liga-Design:
  - Motive: Ergebnis, Wertung, Startaufstellung, Race-Week, Pole, Neuzugang
  - Formate: Instagram 1080×1350, TikTok bzw. Story 1080×1920, YouTube-Thumbnail 1280×720, OG 1200×630
  - Die Grafiken entstehen im Admin-Browser, damit das Worker-Limit nicht greift, und stehen als Download und Discord-Post bereit.
- **Strafpunkte-System** aktivieren, falls beschlossen. Das Konto erscheint im Profil.
- **Head-to-Head** zwischen beliebigen Fahrern, **Driver-of-the-Day**-Auszeichnung.
- **Stream-Seite** und OBS-Overlays als Browser-Source mit Live-Daten, sobald gestreamt wird.

### Phase 3: Komfort

- Discord-Bot (serverlos): `/naechstes-rennen`, `/wertung`, Rollenvergabe.
- Optional ein Fahrer-Login für die Selbstpflege von Profil, Nummernwunsch und Abmeldung.
- Streckenseiten mit Rekorden, Transferfenster, Einstufungsrangliste.

---

## 13. Offene Punkte

| # | Punkt | Warum wichtig | Blockiert |
|---|---|---|---|
| 1 | **Liganame und Kürzel** (ohne „F1“) | Domain, Wortmarke, Handles, Texte | Phase 0 |
| 2 | **Impressum-Person** | Rechtliche Pflicht | Launch |
| 3 | Rennformat (Quali-Länge, Distanz, Sprints?) | Lobby-Seite, Regelwerk, Rennseite | Regelwerk |
| 4 | Renntag und Uhrzeit | Kalender, Countdown | M3-Inhalte |
| 5 | Erstes Punkteschema | Wertung | Saisonstart |
| 6 | Strafpunkte-System ja/nein | Regelwerk, Profile | Phase 2 |
| 7 | Season Pack Pflicht? (Test in einer Lobby) | Voraussetzungen, FAQ | Anmeldung |
| 8 | Regelwerk v1: Claude entwirft auf Basis von Best Practices, die Liga passt an | Kern der Liga | Launch |
| 9 | Wer pflegt die englischen Texte? | Zweisprachigkeit | Launch |
| 10 | Discord-Server-Struktur und Rollen-IDs | Webhooks, Login | M1/M6 |

---

## Anhang: Quellen und Recherche

- **Referenzanalyse:** ircf1.de (alle 43 Seiten inkl. versteckter und Sitemap), irc-standings.de (API, Code, Performance), Recht und Technik (Impressum, Consent, Tag-Manager, Kontraste).
- **Vergleich:**
  - [LSI Racing](https://lsi.formula1.rs/): bestes Funktionsvorbild
  - [Apex Online Racing](https://apexonline.racing/): Regelwerk und Stewarding
  - [PSGL](https://www.premiersimgl.com/)
  - [F1-Onlineliga](https://www.f1-onlineliga.com/)
  - [Rookie Racing](https://rookie-racing.eu/)
  - [Online Racing Club](https://online-racing-club.de/)
  - SimGrid, Pole Apex, SimRacing Panel, Racey
- **Recht:**
  - [F1-Guidelines](https://www.formula1.com/en/information/guidelines.4EOKE9RRqevL4niTK9kWyt) (Esports-Klausel)
  - § 5 DDG (ersetzt TMG seit 14.05.2024), § 25 TDDDG, EuGH C-673/17 *Planet49*, LG München I 3 O 17493/20 (Google Fonts)
- **Technik:**
  - [Astro 6](https://astro.build/blog/astro-6/)
  - [Supabase Discord-Auth](https://supabase.com/docs/guides/auth/social-login/auth-discord)
  - [Cloudflare Workers Limits](https://developers.cloudflare.com/workers/platform/limits/)
  - [Discord Webhooks](https://discord.com/developers/docs/resources/webhook)
  - [Twitch Get Streams](https://dev.twitch.tv/docs/api/reference/#get-streams)
  - [EA F1 25 UDP-Spezifikation](https://forums.ea.com/blog/f1-games-game-info-hub-en/ea-sports%E2%84%A2-f1%C2%AE25-2026-season-pack-udp-specification/12187347)
