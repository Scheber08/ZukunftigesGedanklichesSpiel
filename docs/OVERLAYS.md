# Stream-Overlays (OBS-Browser-Quelle)

Die Website liefert fertige Overlays im Liga-Design für den Stream: transparenter Hintergrund,
ausgelegt für **1920 × 1080**, Daten live aus der Liga (alle 20 Sekunden aktualisiert). Alle
Adressen mit Kopieren-Button und Vorschau stehen im Admin unter **Stream-Overlays**
(`/admin/overlays`, Redaktion und Admin).

## Overlays

| Overlay | Adresse | Inhalt | Position |
|---|---|---|---|
| Nächstes Rennen | `/overlay/naechstes-rennen` | Runde, Strecke, Land, Termin (Liga-Zeit), Countdown; nach dem Start „Jetzt live“ | unten links |
| Aufstellung | `/overlay/aufstellung` | veröffentlichte Aufstellung der laufenden bzw. nächsten Runde, nach Team, Ersatzfahrer mit „für …“ (bleibt bis 12 h nach dem Start aktuell) | Bildmitte |
| Wertung | `/overlay/wertung` | Top N Fahrer (`art=fahrer`) oder Konstrukteure (`art=teams`), Abstand zur Spitze, „nach R4“ | oben links (Turm) |
| Ergebnis | `/overlay/ergebnis` | Top N des Hauptrennens der zuletzt gewerteten Runde: Abstand, Pole (P), schnellste Runde (Stoppuhr), Punkte, Hinweis „vorläufig“ | oben links (Turm) |
| Laufband | `/overlay/ticker` | nächstes Rennen, Fahrer- und Konstrukteurswertung (Top N), letztes Podium | unten, volle Breite |

### Parameter

| Parameter | Werte | Standard | Wirkung |
|---|---|---|---|
| `lang` | `de`, `en` | `de` | Sprache aller Texte, Datumsformat |
| `n` | 1–22 | Wertung/Ergebnis 10, Laufband 5 | Anzahl Zeilen (Wertung, Ergebnis, Laufband) |
| `art` | `fahrer`, `teams` | `fahrer` | nur Wertung |
| `scale` | 0.5–3 | 1 | Vergrößerung – z. B. `0.67` für 1280 × 720, `2` für 3840 × 2160 |
| `preview` | `1` | – | Schachbrett statt Transparenz (nur zum Ansehen im Browser, **nicht** in OBS) |

Ungültige Werte fallen auf den Standard zurück – eine vertippte Adresse ergibt nie eine leere Quelle.

Beispiele:

```
https://<domain>/overlay/wertung?lang=de&n=10&art=fahrer
https://<domain>/overlay/wertung?lang=en&n=5&art=teams
https://<domain>/overlay/ergebnis?lang=de&n=22
https://<domain>/overlay/ticker?lang=de&n=5&scale=0.67
```

## Einrichtung in OBS

1. **Quellen → + → Browser**, Namen vergeben (z. B. „Liga – Wertung“).
2. **URL:** Adresse aus dem Admin einfügen (ohne `preview=1`).
3. **Breite 1920, Höhe 1080** – auch wenn das Overlay nur einen Teil füllt. Bei einer anderen
   Leinwand Breite/Höhe entsprechend setzen und `scale` anpassen (nicht die Quelle skalieren – so
   bleibt die Schrift scharf).
4. **Seiten-FPS benutzerdefiniert: 30** reicht.
5. **Benutzerdefiniertes CSS:** den OBS-Standard stehen lassen
   (`body { background-color: rgba(0, 0, 0, 0); margin: 0px auto; overflow: hidden; }`).
6. **„Quelle herunterfahren, wenn nicht sichtbar“ aus** (die Daten laufen weiter),
   **„Browser aktualisieren, wenn Szene aktiv wird“ an**.
7. Mehrere Overlays gleichzeitig sind kein Problem (je eine Browser-Quelle). Wertung und Ergebnis
   liegen beide oben links – je Szene nur eines davon einblenden.

Streamlabs Desktop und andere Programme mit Browser-Quelle funktionieren genauso.

## Aktualisierung und Verhalten

- Die Seite bringt die Daten beim Laden mit; danach fragt ein Skript alle **20 Sekunden**
  `/api/overlay/<name>.json` ab und zeichnet nur bei Änderungen neu (kein Flackern, das Laufband läuft
  weiter). Nach dem Veröffentlichen eines Ergebnisses im Admin ist es nach spätestens etwa einer halben
  Minute im Stream.
- Die Daten kommen direkt aus der Datenbank – kein Warten auf den Rebuild der statischen Seiten.
- Ist die Website kurz nicht erreichbar, bleibt der letzte Stand stehen; ein kleiner gelber Punkt
  oben rechts im Overlay zeigt die Störung. Die Abstände zwischen den Abfragen werden dann länger
  (bis 2 Minuten) und normalisieren sich von selbst.
- Der Countdown läuft mit der Uhr des Streaming-PCs – die sollte synchron sein (Windows: „Uhrzeit
  automatisch festlegen“).
- Nach Design-Updates der Website in den Eigenschaften der Quelle **„Cache der aktuellen Seite
  aktualisieren“** klicken.

## Technik

| Datei | Inhalt |
|---|---|
| `src/pages/overlay/[name].astro` | Overlay-Seiten (Worker, `prerender = false`), `X-Robots-Tag: noindex` |
| `src/layouts/OverlayLayout.astro` | eigenes Layout ohne Header, Footer, Cookie-Banner und Analytics; transparent, `color-scheme: normal` |
| `src/components/overlay/` | Startdaten + Skript (`client.ts`, DOM nur über `textContent`), Parameter (`params.ts`), Datenformate (`types.ts`) |
| `src/pages/api/overlay/[name].json.ts` | JSON-Daten, `Cache-Control: public, max-age=15, s-maxage=15`, in Produktion zusätzlich Cloudflare-Cache-API |
| `src/lib/server/live-data.ts` | gezielte Abfragen über den öffentlichen Store + reine Wertungsfunktionen (kein `loadLeague()` pro Anfrage); auch vom Discord-Bot genutzt |

- Nur öffentliche Daten (Gamertag, Team, Teamfarbe, Startnummer, Punkte, Platzierungen) – dieselben
  wie auf der Website. Ergebnisse erst ab „vorläufig“, Aufstellungen erst nach Veröffentlichung.
- Die JSON-Endpunkte sind öffentlich abrufbar (auch per CORS) und eignen sich für eigene Widgets,
  z. B. `GET /api/overlay/wertung.json?lang=de&n=10&art=teams`.
- CSP: keine Inline-Skripte; die Startdaten stehen in einem JSON-Datenblock
  (`<script type="application/json">`), das Skript wird gebündelt.
- `X-Frame-Options: DENY` gilt auch für die Overlays. OBS lädt die Seite direkt (kein iframe) –
  Einbettung in webbasierte Stream-Tools per iframe ist daher nicht möglich.
- Tests: `npx vitest run tests/unit/overlay-*.test.ts`.
