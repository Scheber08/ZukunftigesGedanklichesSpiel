/**
 * Kalender-Abo und ICS-Download pro Runde (Plan §4.3).
 * Baut aus den Liga-Daten die Termine für `buildIcs()` (src/lib/domain/ics.ts):
 * TZID Europe/Berlin, feste Dauer je Format, SUMMARY „R5 · Suzuka – [LIGANAME]“,
 * URL der Rennseite, STATUS:CANCELLED bei Absage und SEQUENCE aus `updated_at`,
 * damit Kalender-Apps Änderungen übernehmen.
 */

import { SITE } from '~/config/site';
import { t, url } from '~/i18n';
import type { RoundFormat, RoundRow, SeasonRow } from '~/lib/db/types';
import { buildIcs, type IcsEvent } from '~/lib/domain/ics';
import { LEAGUE_TIMEZONE } from '~/lib/domain/time';
import type { League } from '~/lib/league/league';
import { roundLabel, seasonLabel, trackName } from '~/lib/view';

/** Ungefähre Dauer eines Renn-Events inkl. Lobby, Qualifying und ggf. Sprint. */
export const EVENT_DURATION_MINUTES: Record<RoundFormat, number> = {
  standard: 150,
  sprint: 180,
};

/** Basis für SEQUENCE: Sekunden seit 01.01.2024 bleiben lange im 32-Bit-Bereich. */
const SEQUENCE_EPOCH_MS = Date.UTC(2024, 0, 1);

/** Änderungszähler aus `updated_at` – steigt mit jeder Änderung der Runde. */
export function icsSequence(updatedAt: string | null | undefined): number {
  const ms = updatedAt ? Date.parse(updatedAt) : Number.NaN;
  if (!Number.isFinite(ms)) return 0;
  return Math.max(0, Math.floor((ms - SEQUENCE_EPOCH_MS) / 1000));
}

/** Stabile UID je Runde – identisch im Abo und im Einzel-Download. */
export function roundUid(round: Pick<RoundRow, 'id'>, site: URL): string {
  return `round-${round.id}@${site.hostname}`;
}

/** Dateiname für den Einzel-Download, z. B. „s2-r05-suzuka.ics“. */
export function roundIcsFilename(season: Pick<SeasonRow, 'slug'>, round: Pick<RoundRow, 'number'>, trackSlug: string | undefined): string {
  const safe = (s: string) => s.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
  const parts = [`s${safe(season.slug)}`, `r${String(round.number).padStart(2, '0')}`, trackSlug ? safe(trackSlug) : ''];
  return `${parts.filter(Boolean).join('-')}.ics`;
}

/** Termin einer Runde. Das Abo ist sprachneutral und nutzt die deutschen Texte. */
export function roundIcsEvent(league: League, round: RoundRow, site: URL): IcsEvent | null {
  const season = league.season(round.season_id);
  if (!season) return null;
  const track = league.track(round.track_id);
  const cancelled = round.status === 'cancelled';
  const label = roundLabel(round, track, 'de');
  const pageUrl = new URL(url('de', 'race', { season: season.slug, round: round.number }), site).href;
  const summary = `${cancelled ? `${t('de', 'calendar.ics.cancelledPrefix')}: ` : ''}${label} – ${SITE.name}`;
  const description = [
    t('de', 'calendar.ics.eventDescription', { season: seasonLabel(season, 'de'), n: round.number }),
    round.format === 'sprint' ? t('de', 'format.sprint') : null,
    cancelled ? t('de', 'calendar.ics.cancelledNote') : null,
    t('de', 'calendar.ics.moreInfo', { url: pageUrl }),
  ]
    .filter((line): line is string => line != null)
    .join('\n');
  const updated = Date.parse(round.updated_at);

  return {
    uid: roundUid(round, site),
    localStart: round.local_start,
    timezone: round.timezone || LEAGUE_TIMEZONE,
    durationMinutes: EVENT_DURATION_MINUTES[round.format] ?? EVENT_DURATION_MINUTES.standard,
    summary,
    description,
    url: pageUrl,
    location: t('de', 'calendar.ics.location', { track: trackName(track, 'de') }),
    cancelled,
    sequence: icsSequence(round.updated_at),
    lastModified: Number.isFinite(updated) ? new Date(updated) : undefined,
  };
}

/** Saisons im Abo: die aktuelle plus alle geplanten (Plan §4.3). */
export function subscriptionSeasons(league: League): SeasonRow[] {
  const current = league.currentSeason;
  return league.seasons
    .filter((s) => s.id === current?.id || s.status === 'planned')
    .sort((a, b) => a.number - b.number);
}

/** Alle Runden des Abos, chronologisch. */
export function subscriptionRounds(league: League): RoundRow[] {
  return subscriptionSeasons(league)
    .flatMap((s) => league.roundsOf(s.id))
    .sort((a, b) => a.start_utc.localeCompare(b.start_utc) || a.number - b.number);
}

/** Inhalt von /kalender.ics. */
export function buildCalendarIcs(league: League, site: URL): string {
  const events = subscriptionRounds(league)
    .map((r) => roundIcsEvent(league, r, site))
    .filter((e): e is IcsEvent => e != null);
  return buildIcs({
    name: t('de', 'calendar.ics.name', { league: SITE.name }),
    description: t('de', 'calendar.ics.description', { league: SITE.name, game: SITE.gameName }),
    prodId: `-//${SITE.name}//Rennkalender//DE`,
    events,
    now: league.now,
  });
}

/** Inhalt von /rennen/[saison]/[runde].ics (ein Termin, gleiche UID wie im Abo). */
export function buildRoundIcs(league: League, round: RoundRow, site: URL): string {
  const event = roundIcsEvent(league, round, site);
  const track = league.track(round.track_id);
  return buildIcs({
    name: `${roundLabel(round, track, 'de')} – ${SITE.name}`,
    prodId: `-//${SITE.name}//Rennkalender//DE`,
    events: event ? [event] : [],
    now: league.now,
  });
}

/** HTTP-Antwort für ICS-Endpunkte. */
export function icsResponse(body: string, filename: string, disposition: 'inline' | 'attachment' = 'inline'): Response {
  return new Response(body, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `${disposition}; filename="${filename}"`,
      'Cache-Control': 'public, max-age=900',
    },
  });
}
