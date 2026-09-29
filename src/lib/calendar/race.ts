/**
 * Reine Logik der Rennseite (Plan §4.3): Tabs, Status-Banner, Aufstellung nach Team,
 * Nachbar-Runden, Steward-Kurztexte, Medien-Links und JSON-LD (Plan §10).
 * Keine I/O – getestet in tests/unit/calendar-race.test.ts.
 */

import type { Lang, T } from '~/i18n';
import type { DecisionRow, RoundCorrectionRow, RoundFormat, RoundRow, SessionRow, SessionType } from '~/lib/db/types';
import { RESULT_VISIBLE_STATUSES } from '~/lib/db/types';

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

export type RaceTabKind = 'lineup' | SessionType | 'stewards' | 'media';

export interface RaceTab {
  kind: RaceTabKind;
  /** Anker-ID (auch als URL-Fragment nutzbar, z. B. #rennen) */
  id: string;
  /** Session der Ergebnis-Tabs, sonst null */
  sessionId: number | null;
}

/** Sprechende Anker je Sprache. */
const TAB_SLUGS: Record<Lang, Record<RaceTabKind, string>> = {
  de: { lineup: 'aufstellung', qualifying: 'qualifying', sprint: 'sprint', race: 'rennen', stewards: 'stewards', media: 'medien' },
  en: { lineup: 'lineup', qualifying: 'qualifying', sprint: 'sprint', race: 'race', stewards: 'stewards', media: 'media' },
};

export function tabSlug(kind: RaceTabKind, lang: Lang): string {
  return TAB_SLUGS[lang][kind];
}

/**
 * Tabs in fester Reihenfolge: Aufstellung · Qualifying · (Sprint) · Rennen · Stewards · Medien.
 * Der Sprint-Tab erscheint bei Sprint-Wochenenden oder wenn es eine Sprint-Session gibt.
 */
export function raceTabs(format: RoundFormat, sessions: ReadonlyArray<Pick<SessionRow, 'id' | 'type'>>, lang: Lang): RaceTab[] {
  const sessionId = (type: SessionType) => sessions.find((s) => s.type === type)?.id ?? null;
  const withSprint = format === 'sprint' || sessions.some((s) => s.type === 'sprint');
  const kinds: RaceTabKind[] = ['lineup', 'qualifying', ...(withSprint ? (['sprint'] as const) : []), 'race', 'stewards', 'media'];
  return kinds.map((kind) => ({
    kind,
    id: tabSlug(kind, lang),
    sessionId: kind === 'qualifying' || kind === 'sprint' || kind === 'race' ? sessionId(kind) : null,
  }));
}

/** Standard-Tab: Rennen, wenn ein Ergebnis veröffentlicht ist, sonst die Aufstellung. */
export function defaultTabKind(status: RoundRow['status']): RaceTabKind {
  return RESULT_VISIBLE_STATUSES.includes(status) ? 'race' : 'lineup';
}

// ---------------------------------------------------------------------------
// Status-Banner
// ---------------------------------------------------------------------------

export type RaceBanner =
  | { kind: 'cancelled' }
  | { kind: 'provisional'; deadline: string | null; open: boolean }
  | { kind: 'final'; finalAt: string | null }
  | { kind: 'corrected'; corrections: RoundCorrectionRow[] }
  | { kind: 'awaiting' }
  | { kind: 'lineup' }
  | { kind: 'scheduled' };

/**
 * Banner über den Tabs: „Vorläufig, Protestfrist bis …“, „Final“, „Korrigiert am … (Grund)“,
 * dazu Hinweise für geplante, abgesagte und gerade gefahrene Runden.
 */
export function raceBanner(
  round: Pick<RoundRow, 'status' | 'protest_deadline' | 'final_at' | 'start_utc'>,
  corrections: RoundCorrectionRow[],
  now: Date,
): RaceBanner {
  switch (round.status) {
    case 'cancelled':
      return { kind: 'cancelled' };
    case 'provisional': {
      const open = round.protest_deadline != null && new Date(round.protest_deadline) > now;
      return { kind: 'provisional', deadline: round.protest_deadline, open };
    }
    case 'corrected':
      return { kind: 'corrected', corrections };
    case 'final':
      return corrections.length > 0 ? { kind: 'corrected', corrections } : { kind: 'final', finalAt: round.final_at };
    default: {
      if (new Date(round.start_utc) <= now) return { kind: 'awaiting' };
      return round.status === 'lineup_published' ? { kind: 'lineup' } : { kind: 'scheduled' };
    }
  }
}

/** Steht die Runde noch bevor (für Countdown und „Zum Kalender hinzufügen“)? */
export function isUpcoming(round: Pick<RoundRow, 'status' | 'start_utc'>, now: Date): boolean {
  return (round.status === 'scheduled' || round.status === 'lineup_published') && new Date(round.start_utc) > now;
}

/**
 * Zerlegt einen übersetzten Text an einem Platzhalter, damit dort eine Komponente
 * (z. B. <LocalTime>) eingesetzt werden kann: „Frist bis {deadline}.“ → ["Frist bis ", "."].
 */
export function splitPlaceholder(text: string, name: string): [string, string] {
  const token = `{${name}}`;
  const i = text.indexOf(token);
  if (i < 0) return [text, ''];
  return [text.slice(0, i), text.slice(i + token.length)];
}

// ---------------------------------------------------------------------------
// Aufstellung, Navigation
// ---------------------------------------------------------------------------

/** Einträge nach Team gruppieren (Reihenfolge der Eingabe bleibt erhalten). */
export function groupByTeam<E extends { team_id: number }>(entries: readonly E[]): Array<{ teamId: number; entries: E[] }> {
  const groups: Array<{ teamId: number; entries: E[] }> = [];
  const index = new Map<number, number>();
  for (const e of entries) {
    const i = index.get(e.team_id);
    if (i == null) {
      index.set(e.team_id, groups.length);
      groups.push({ teamId: e.team_id, entries: [e] });
    } else {
      groups[i]!.entries.push(e);
    }
  }
  return groups;
}

/** Vorherige und nächste Runde derselben Saison (abgesagte Runden inklusive – sie haben eine Seite). */
export function adjacentRounds<R extends Pick<RoundRow, 'number'>>(rounds: readonly R[], current: Pick<RoundRow, 'number'>): { previous?: R; next?: R } {
  const sorted = [...rounds].sort((a, b) => a.number - b.number);
  return {
    previous: sorted.filter((r) => r.number < current.number).at(-1),
    next: sorted.find((r) => r.number > current.number),
  };
}

// ---------------------------------------------------------------------------
// Stewards
// ---------------------------------------------------------------------------

/** Verdikt als kurzer Text, z. B. „5 Sekunden Zeitstrafe · 2 Strafpunkte“. */
export function verdictText(t: T, d: Pick<DecisionRow, 'verdict' | 'time_seconds' | 'positions' | 'penalty_points'>): string {
  let text: string;
  switch (d.verdict) {
    case 'time_penalty':
      text = d.time_seconds ? t('calendar.verdict.time_penalty.n', { n: d.time_seconds }) : t('calendar.verdict.time_penalty');
      break;
    case 'position_penalty':
      text = d.positions ? t('calendar.verdict.position_penalty.n', { n: d.positions }) : t('calendar.verdict.position_penalty');
      break;
    case 'grid_penalty_next':
      text = d.positions ? t('calendar.verdict.grid_penalty_next.n', { n: d.positions }) : t('calendar.verdict.grid_penalty_next');
      break;
    default:
      text = t(`calendar.verdict.${d.verdict}`);
  }
  if (d.penalty_points && d.penalty_points > 0) text += ` · ${t('calendar.verdict.penaltyPoints', { n: d.penalty_points })}`;
  return text;
}

/** Schwere eines Verdikts für die Badge-Farbe (zusätzlich steht immer der Text da). */
export function verdictTone(verdict: DecisionRow['verdict']): 'muted' | 'warning' | 'danger' {
  if (verdict === 'no_action') return 'muted';
  if (verdict === 'warning' || verdict === 'time_penalty' || verdict === 'grid_penalty_next') return 'warning';
  return 'danger';
}

/**
 * Kurzbegründung: Markdown grob in Klartext umwandeln und an einer Wortgrenze kürzen.
 * Einzelne Unterstriche bleiben stehen (Gamertags wie „Slipstream_Sam“).
 */
export function plainExcerpt(markdown: string | null | undefined, max = 180): string {
  if (!markdown) return '';
  const text = markdown
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, '')
    .replace(/(\*\*|__|~~|`)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:.–-]+$/, '')}…`;
}

// ---------------------------------------------------------------------------
// Medien
// ---------------------------------------------------------------------------

/** Plattform eines Video-Links für die Button-Beschriftung. */
export function mediaPlatform(href: string | null | undefined): 'YouTube' | 'Twitch' | null {
  if (!href) return null;
  try {
    const host = new URL(href).hostname.toLowerCase().replace(/^www\./, '');
    if (host === 'youtu.be' || host === 'youtube.com' || host.endsWith('.youtube.com') || host === 'youtube-nocookie.com') return 'YouTube';
    if (host === 'twitch.tv' || host.endsWith('.twitch.tv')) return 'Twitch';
    return null;
  } catch {
    return null;
  }
}

/** Nur http(s)-Links als Buttons ausgeben. */
export function safeMediaUrl(href: string | null | undefined): string | null {
  if (!href) return null;
  try {
    const u = new URL(href);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Streckenkarte (Plan §7.5)
// ---------------------------------------------------------------------------

export interface TrackMapImage {
  /** Bildquelle: eigener Pfad („/…“) oder https-URL */
  src: string;
  /** Lizenz-/Quellenangabe, leer = keine Angabe */
  credit: string | null;
}

/**
 * Streckenkarte einer Strecke, falls gepflegt. Erlaubt sind Pfade auf der eigenen Seite
 * („/strecken/suzuka.svg“) und https-URLs (z. B. Supabase Storage) – alles andere
 * (javascript:, data:, protokoll-relative „//…“, http:) wird verworfen.
 */
export function trackMapImage(track: { map_url?: string | null; map_credit?: string | null } | null | undefined): TrackMapImage | null {
  const raw = track?.map_url?.trim();
  if (!raw) return null;
  let src: string | null = null;
  if (raw.startsWith('/') && !raw.startsWith('//') && !raw.includes('\\')) {
    src = raw;
  } else {
    try {
      const u = new URL(raw);
      if (u.protocol === 'https:') src = u.href;
    } catch {
      src = null;
    }
  }
  if (!src) return null;
  const credit = track?.map_credit?.replace(/\s+/g, ' ').trim() || null;
  return { src, credit };
}

// ---------------------------------------------------------------------------
// JSON-LD (Plan §10)
// ---------------------------------------------------------------------------

export interface SportsEventInput {
  name: string;
  description: string;
  startUtc: string;
  durationMinutes: number;
  cancelled: boolean;
  trackName: string;
  pageUrl: string;
  organizerName: string;
  organizerUrl: string;
  inLanguage: Lang;
  /** Absolute Bild-URL (z. B. OG-Bild) – von Suchmaschinen für Events empfohlen */
  imageUrl?: string;
}

/** SportsEvent je Runde: Online-Event, Ort = Strecke (als VirtualLocation). */
export function sportsEventJsonLd(e: SportsEventInput): Record<string, unknown> {
  const start = new Date(e.startUtc);
  const end = new Date(start.getTime() + e.durationMinutes * 60_000);
  return {
    '@context': 'https://schema.org',
    '@type': 'SportsEvent',
    name: e.name,
    description: e.description,
    sport: 'Sim Racing',
    inLanguage: e.inLanguage,
    startDate: start.toISOString(),
    endDate: end.toISOString(),
    eventStatus: e.cancelled ? 'https://schema.org/EventCancelled' : 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OnlineEventAttendanceMode',
    location: { '@type': 'VirtualLocation', name: e.trackName, url: e.pageUrl },
    url: e.pageUrl,
    ...(e.imageUrl ? { image: [e.imageUrl] } : {}),
    organizer: { '@type': 'SportsOrganization', name: e.organizerName, url: e.organizerUrl },
  };
}
