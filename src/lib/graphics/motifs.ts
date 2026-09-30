/**
 * Motive der Social-Grafiken (Plan Phase 2): Auswahl (Saison/Runde bzw. Fahrer) normalisieren
 * und aus der Datenquelle ein fertiges Zeichen-Modell mit lokalisierten Texten und Alt-Text bauen.
 * Rein und im Browser nutzbar; gezeichnet wird in draw.ts.
 */
import { formatGapMs, formatLapTime } from '~/lib/domain/laptime';
import { formatDate, formatTime, timeZoneName } from '~/lib/domain/time';
import type { Id, SessionType } from '~/lib/db/types';
import { countryName, seasonLabel } from '~/lib/view';
import { graphicFileName } from './files';
import { FORMATS, isFormatId, type FormatId } from './formats';
import type { GDriver, GraphicsSource, GResult, GRound, GSeason, GTeam } from './source';
import { strings, type GraphicStrings, type Lang } from './strings';

export type { Lang };

export const MOTIF_IDS = ['result', 'standings-drivers', 'standings-teams', 'grid', 'raceweek', 'pole', 'newcomer'] as const;
export type MotifId = (typeof MOTIF_IDS)[number];

export interface MotifDef {
  id: MotifId;
  /** Beschriftung im Admin */
  label: string;
  /** Dateiname-Präfix */
  slug: string;
  /** Auswahl über Runde oder Fahrer */
  input: 'round' | 'driver';
  /** kurze Erklärung im Admin */
  hint: string;
}

export const MOTIFS: Record<MotifId, MotifDef> = {
  result: { id: 'result', label: 'Ergebnis', slug: 'ergebnis', input: 'round', hint: 'Top 10 des Rennens mit schnellster Runde und Status.' },
  'standings-drivers': {
    id: 'standings-drivers',
    label: 'Wertung – Fahrer',
    slug: 'wertung-fahrer',
    input: 'round',
    hint: 'Stand nach der gewählten Runde: Top 10, im Story-Format Top 22.',
  },
  'standings-teams': { id: 'standings-teams', label: 'Wertung – Konstrukteure', slug: 'wertung-teams', input: 'round', hint: 'Stand nach der gewählten Runde, alle Teams.' },
  grid: {
    id: 'grid',
    label: 'Startaufstellung',
    slug: 'startaufstellung',
    input: 'round',
    hint: 'Startplätze aus dem Ergebnis; vor dem Rennen die veröffentlichte Aufstellung nach Teams.',
  },
  raceweek: { id: 'raceweek', label: 'Race-Week', slug: 'race-week', input: 'round', hint: 'Ankündigung: Runde, Strecke, Datum und Uhrzeit (Liga-Zeit), Sessions.' },
  pole: { id: 'pole', label: 'Pole-Position', slug: 'pole', input: 'round', hint: 'Schnellster im Qualifying mit Zeit und Abstand.' },
  newcomer: { id: 'newcomer', label: 'Neuzugang', slug: 'neuzugang', input: 'driver', hint: 'Fahrername, Startnummer, Team und Nationalität.' },
};

export function isMotifId(value: unknown): value is MotifId {
  return typeof value === 'string' && (MOTIF_IDS as readonly string[]).includes(value);
}

export interface Selection {
  motif: MotifId;
  seasonId: Id | null;
  roundId: Id | null;
  driverId: Id | null;
  format: FormatId;
  lang: Lang;
}

export const DEFAULT_SELECTION: Selection = { motif: 'result', seasonId: null, roundId: null, driverId: null, format: 'instagram', lang: 'de' };

// ---------------------------------------------------------------------------- Nachschlagen

interface Lookup {
  teams: Map<Id, GTeam>;
  drivers: Map<Id, GDriver>;
}

const lookups = new WeakMap<GraphicsSource, Lookup>();

function lookup(source: GraphicsSource): Lookup {
  let l = lookups.get(source);
  if (!l) {
    l = { teams: new Map(source.teams.map((t) => [t.id, t])), drivers: new Map(source.drivers.map((d) => [d.id, d])) };
    lookups.set(source, l);
  }
  return l;
}

export function driverName(source: GraphicsSource, id: Id, lang: Lang): string {
  const S = strings(lang);
  const d = lookup(source).drivers.get(id);
  if (!d) return S.unknownDriver;
  return d.tag ?? S.formerDriver(d.id);
}

export function trackName(round: Pick<GRound, 'trackDe' | 'trackEn'>, lang: Lang): string {
  return lang === 'en' ? round.trackEn || round.trackDe : round.trackDe;
}

/** „R5 · Suzuka“ – keine offiziellen Event-Titel (Plan §9.1). */
export function roundName(round: Pick<GRound, 'number' | 'trackDe' | 'trackEn'>, lang: Lang): string {
  return `R${round.number} · ${trackName(round, lang)}`;
}

function seasonOf(source: GraphicsSource, id: Id | null): GSeason | undefined {
  return id == null ? undefined : source.seasons.find((s) => s.id === id);
}

// ---------------------------------------------------------------------------- Auswahl

const hasGridData = (r: GRound) => r.race.some((x) => x.grid != null) || r.quali.length > 0 || r.lineup.length > 0;

/** Runden, für die das Motiv Daten hat. */
export function availableRounds(season: GSeason | undefined, motif: MotifId): GRound[] {
  if (!season || MOTIFS[motif].input !== 'round') return [];
  const counted = new Set(season.standings.map((s) => s.after));
  return season.rounds.filter((r) => {
    switch (motif) {
      case 'result':
        return r.race.length > 0;
      case 'standings-drivers':
      case 'standings-teams':
        return counted.has(r.number);
      case 'grid':
        return hasGridData(r);
      case 'pole':
        return r.quali.length > 0;
      case 'raceweek':
        return r.status !== 'cancelled';
      default:
        return false;
    }
  });
}

const ROUND_STATUS_ADMIN: Record<GRound['status'], string> = {
  scheduled: 'geplant',
  lineup_published: 'Aufstellung steht',
  provisional: 'vorläufig',
  final: 'final',
  corrected: 'korrigiert',
  cancelled: 'abgesagt',
};

export interface RoundOption {
  id: Id;
  number: number;
  label: string;
}

/** Runden-Auswahl im Admin (deutsch). */
export function roundOptions(source: GraphicsSource, seasonId: Id | null, motif: MotifId): RoundOption[] {
  return availableRounds(seasonOf(source, seasonId), motif).map((r) => ({
    id: r.id,
    number: r.number,
    label: `${roundName(r, 'de')} – ${ROUND_STATUS_ADMIN[r.status]}`,
  }));
}

const UPCOMING_GRACE_MS = 3 * 3_600_000;

function isUpcoming(r: GRound, now: number): boolean {
  return (r.status === 'scheduled' || r.status === 'lineup_published') && new Date(r.startUtc).getTime() > now - UPCOMING_GRACE_MS;
}

/** Sinnvolle Vorauswahl: Race-Week die nächste Runde, Aufstellung die veröffentlichte, sonst die letzte mit Daten. */
export function defaultRoundId(source: GraphicsSource, seasonId: Id | null, motif: MotifId): Id | null {
  const rounds = availableRounds(seasonOf(source, seasonId), motif);
  if (rounds.length === 0) return null;
  const now = new Date(source.now).getTime();
  if (motif === 'raceweek') {
    const next = [...rounds].filter((r) => isUpcoming(r, now)).sort((a, b) => a.startUtc.localeCompare(b.startUtc))[0];
    return (next ?? rounds.at(-1)!).id;
  }
  if (motif === 'grid') {
    const published = rounds.filter((r) => r.status === 'lineup_published' && r.lineup.length > 0).sort((a, b) => a.startUtc.localeCompare(b.startUtc));
    if (published[0]) return published[0].id;
  }
  return rounds.at(-1)!.id;
}

export interface DriverOption {
  id: Id;
  label: string;
  isNew: boolean;
}

/** Fahrer für „Neuzugang“: aktive und Reservefahrer, Neuzugänge der Saison zuerst. */
export function driverOptions(source: GraphicsSource, seasonId: Id | null): DriverOption[] {
  const season = seasonOf(source, seasonId);
  const seats = new Map(season?.seats ?? []);
  const { teams } = lookup(source);
  return source.drivers
    .filter((d) => d.tag && (d.status === 'active' || d.status === 'reserve'))
    .map((d) => {
      const isNew = seasonId != null && d.joined === seasonId;
      const teamId = seats.get(d.id);
      const team = teamId != null ? teams.get(teamId)?.name : d.status === 'reserve' ? 'Reserve' : 'ohne Cockpit';
      return {
        id: d.id,
        isNew,
        label: `${d.tag}${d.num != null ? ` #${d.num}` : ''} – ${team ?? 'ohne Cockpit'}${isNew ? ' · neu in dieser Saison' : ''}`,
      };
    })
    .sort((a, b) => Number(b.isNew) - Number(a.isNew) || a.label.localeCompare(b.label, 'de'));
}

/** Auswahl vervollständigen und ungültige Werte durch passende Vorgaben ersetzen. */
export function normalizeSelection(source: GraphicsSource, input: Partial<Selection>): Selection {
  const motif: MotifId = isMotifId(input.motif) ? input.motif : DEFAULT_SELECTION.motif;
  const seasonId =
    input.seasonId != null && source.seasons.some((s) => s.id === input.seasonId)
      ? input.seasonId
      : (source.currentSeasonId ?? source.seasons[0]?.id ?? null);
  const format: FormatId = isFormatId(input.format) ? input.format : DEFAULT_SELECTION.format;
  const lang: Lang = input.lang === 'en' ? 'en' : 'de';

  let roundId = input.roundId ?? null;
  let driverId = input.driverId ?? null;
  if (MOTIFS[motif].input === 'round') {
    const valid = availableRounds(seasonOf(source, seasonId), motif).some((r) => r.id === roundId);
    if (!valid) roundId = defaultRoundId(source, seasonId, motif);
  } else {
    const options = driverOptions(source, seasonId);
    if (!options.some((d) => d.id === driverId)) driverId = options[0]?.id ?? null;
  }
  return { motif, seasonId, roundId, driverId, format, lang };
}

/** Auswahl aus URL-Parametern (?motiv=&saison=&runde=&fahrer=&format=&sprache=). */
export function selectionFromParams(params: { get(name: string): string | null }): Partial<Selection> {
  const int = (v: string | null) => (v != null && /^\d{1,9}$/.test(v) ? Number(v) : null);
  const motif = params.get('motiv');
  const format = params.get('format');
  const lang = params.get('sprache');
  return {
    motif: isMotifId(motif) ? motif : undefined,
    seasonId: int(params.get('saison')),
    roundId: int(params.get('runde')),
    driverId: int(params.get('fahrer')),
    format: isFormatId(format) ? format : undefined,
    lang: lang === 'en' ? 'en' : lang === 'de' ? 'de' : undefined,
  };
}

/** URL-Parameter zur Auswahl (für einen teilbaren Link auf dieselbe Grafik). */
export function selectionToParams(sel: Selection): string {
  const p = new URLSearchParams();
  p.set('motiv', sel.motif);
  if (sel.seasonId != null) p.set('saison', String(sel.seasonId));
  if (MOTIFS[sel.motif].input === 'round' && sel.roundId != null) p.set('runde', String(sel.roundId));
  if (MOTIFS[sel.motif].input === 'driver' && sel.driverId != null) p.set('fahrer', String(sel.driverId));
  p.set('format', sel.format);
  p.set('sprache', sel.lang);
  return p.toString();
}

// ---------------------------------------------------------------------------- Modelle

export type Tone = 'default' | 'danger' | 'muted';
export type BadgeTone = 'warning' | 'green' | 'teal';

export interface TableRowModel {
  pos: string;
  name: string;
  team: string | null;
  color: string | null;
  number: string | null;
  value: string;
  valueTone: Tone;
  /** zweite Wertspalte (Punkte im Ergebnis) */
  extra: string | null;
  mark: 'fastest' | 'pole' | null;
  reserve: boolean;
  /** P1–P3 hervorheben */
  podium: boolean;
}

interface ModelBase {
  motif: MotifId;
  lang: Lang;
  /** „Saison 2 · Runde 4“ */
  kicker: string;
  title: string;
  subtitle: string;
  badge: { text: string; tone: BadgeTone } | null;
  /** Alt-Text für Vorschau und Social-Post */
  alt: string;
  /** Titel des Discord-Posts */
  discordTitle: string;
  /** Dateiname inkl. Format und Sprache */
  fileName: string;
}

export interface TableModel extends ModelBase {
  kind: 'table';
  columns: { name: string; value: string; extra: string | null };
  rows: TableRowModel[];
  /** Hinweiszeile unter der Tabelle (schnellste Runde) */
  note: { label: string; name: string; team: string | null; color: string | null; value: string } | null;
  /** Teamwertung: Name ist der Teamname */
  teamsOnly: boolean;
}

export interface GridSlotModel {
  pos: string;
  name: string;
  team: string;
  color: string;
  number: string | null;
  reserve: boolean;
}

export interface GridModel extends ModelBase {
  kind: 'grid';
  slots: GridSlotModel[];
}

export interface LineupModel extends ModelBase {
  kind: 'lineup';
  teams: Array<{ name: string; color: string; drivers: Array<{ name: string; number: string | null; reserve: boolean }> }>;
}

export interface RaceWeekModel extends ModelBase {
  kind: 'raceweek';
  roundNo: string;
  track: string;
  country: string;
  countryCode: string;
  date: string;
  time: string;
  timeZone: string;
  sessions: string[];
  facts: string[];
}

export interface PoleModel extends ModelBase {
  kind: 'pole';
  driver: { name: string; number: string | null; team: string; color: string | null };
  time: string;
  gap: string | null;
  gapLabel: string;
  chasers: Array<{ pos: string; name: string; team: string; color: string | null; value: string }>;
}

export interface NewcomerModel extends ModelBase {
  kind: 'newcomer';
  name: string;
  number: string | null;
  team: string;
  color: string | null;
  country: string | null;
  countryCode: string | null;
  statusLabel: string;
}

export type GraphicModel = TableModel | GridModel | LineupModel | RaceWeekModel | PoleModel | NewcomerModel;

export type ModelResult = { ok: true; model: GraphicModel } | { ok: false; message: string };

const fail = (message: string): ModelResult => ({ ok: false, message });

function roundBadge(status: GRound['status'], S: GraphicStrings): ModelBase['badge'] {
  if (status === 'provisional') return { text: S.roundStatus.provisional!, tone: 'warning' };
  if (status === 'final') return { text: S.roundStatus.final!, tone: 'green' };
  if (status === 'corrected') return { text: S.roundStatus.corrected!, tone: 'teal' };
  return null;
}

function resultValue(r: GResult, first: GResult | undefined, S: GraphicStrings): { text: string; tone: Tone } {
  if (r.status !== 'classified') return { text: S.resultStatus[r.status], tone: 'danger' };
  if (r.pos === 1) return { text: r.timeMs ? formatLapTime(r.timeMs) : S.winner, tone: 'default' };
  if (r.gapLaps != null && r.gapLaps > 0) return { text: S.lapsDown(r.gapLaps), tone: 'default' };
  if (r.gapMs != null) return { text: formatGapMs(r.gapMs), tone: 'default' };
  if (r.timeMs != null && first?.timeMs != null) return { text: formatGapMs(r.timeMs - first.timeMs), tone: 'default' };
  return { text: '–', tone: 'muted' };
}

function formatKm(value: number, lang: Lang): string {
  return new Intl.NumberFormat(lang === 'de' ? 'de-DE' : 'en-GB', { maximumFractionDigits: 3 }).format(value);
}

function listText(items: string[], lang: Lang): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} ${lang === 'de' ? 'und' : 'and'} ${items.at(-1)}`;
}

function ranked(rows: Array<{ pos: string; label: string }>): string {
  return rows.map((r) => `${r.pos}. ${r.label}`).join(', ');
}

/** Zeichen-Modell für die Auswahl – oder eine Meldung, warum es (noch) keine Daten gibt. */
export function buildModel(source: GraphicsSource, selection: Selection): ModelResult {
  const sel = normalizeSelection(source, selection);
  const S = strings(sel.lang);
  const lang = sel.lang;
  const season = seasonOf(source, sel.seasonId);
  if (!season) return fail('Es gibt noch keine Saison.');
  const { teams, drivers } = lookup(source);
  const format = FORMATS[sel.format];
  const seasonText = seasonLabel(season, lang);
  const brand = source.brand.name;
  const teamName = (id: Id | null | undefined) => (id != null ? (teams.get(id)?.name ?? '') : '');
  const teamColor = (id: Id | null | undefined) => (id != null ? (teams.get(id)?.color ?? null) : null);
  const name = (id: Id) => driverName(source, id, lang);
  const numberOf = (id: Id) => {
    const n = drivers.get(id)?.num;
    return n != null ? String(n) : null;
  };
  const def = MOTIFS[sel.motif];

  if (def.input === 'driver') {
    const driver = sel.driverId != null ? drivers.get(sel.driverId) : undefined;
    if (!driver || !driver.tag) return fail('Bitte einen Fahrer wählen (aktive Fahrer und Reserve).');
    const teamId = new Map(season.seats).get(driver.id) ?? null;
    const team = teamId != null ? teamName(teamId) : driver.status === 'reserve' ? S.reserveDriver : S.noTeam;
    const country = driver.nat ? countryName(driver.nat, lang) : null;
    const number = driver.num != null ? String(driver.num) : null;
    const facts = [number ? `${S.number} ${number}` : null, team, country ? `${S.nationality}: ${country}` : null].filter(Boolean);
    const model: NewcomerModel = {
      kind: 'newcomer',
      motif: sel.motif,
      lang,
      kicker: seasonText,
      title: S.titles.newcomer,
      subtitle: S.welcome,
      badge: null,
      name: driver.tag,
      number,
      team,
      color: teamColor(teamId),
      country,
      countryCode: driver.nat,
      statusLabel: teamId != null ? '' : S.reserveDriver,
      alt: `${brand} – ${S.titles.newcomer}, ${seasonText}: ${driver.tag}. ${facts.join(', ')}.`,
      discordTitle: `${S.titles.newcomer}: ${driver.tag}`,
      fileName: graphicFileName({ motif: def.slug, season: season.number, key: driver.slug || `fahrer-${driver.id}`, format: format.slug, lang }),
    };
    return { ok: true, model };
  }

  const round = sel.roundId != null ? season.rounds.find((r) => r.id === sel.roundId) : undefined;
  if (!round) {
    const why: Record<MotifId, string> = {
      result: 'Für diese Saison gibt es noch kein veröffentlichtes Rennergebnis.',
      'standings-drivers': 'Für diese Saison gibt es noch keine Wertung (keine gewertete Runde).',
      'standings-teams': 'Für diese Saison gibt es noch keine Wertung (keine gewertete Runde).',
      grid: 'Für diese Saison gibt es noch keine veröffentlichte Aufstellung oder Startaufstellung.',
      raceweek: 'Diese Saison hat noch keine Runden im Kalender.',
      pole: 'Für diese Saison gibt es noch kein veröffentlichtes Qualifying.',
      newcomer: '',
    };
    return fail(why[sel.motif]);
  }

  const label = roundName(round, lang);
  const kicker = `${seasonText} · ${S.round(round.number)}`;
  const key = `r${round.number}`;
  const file = (slug = def.slug) => graphicFileName({ motif: slug, season: season.number, key, format: format.slug, lang });

  switch (sel.motif) {
    case 'result': {
      const all = round.race;
      if (all.length === 0) return fail('Für diese Runde gibt es noch kein veröffentlichtes Rennergebnis.');
      const first = all.find((r) => r.pos === 1);
      const top = all.slice(0, 10);
      const badge = roundBadge(round.status, S);
      const rows: TableRowModel[] = top.map((r, i) => {
        const v = resultValue(r, first, S);
        return {
          pos: r.pos != null ? String(r.pos) : '–',
          name: name(r.driver),
          team: teamName(r.team),
          color: teamColor(r.team),
          number: r.num != null ? String(r.num) : null,
          value: v.text,
          valueTone: v.tone,
          extra: r.points > 0 ? `${r.points}` : null,
          mark: r.fastest ? 'fastest' : null,
          reserve: r.reserve,
          podium: r.pos != null && r.pos <= 3 && i < 3,
        };
      });
      const fastest = all.find((r) => r.fastest);
      const note = fastest
        ? { label: S.fastestLap, name: name(fastest.driver), team: teamName(fastest.team), color: teamColor(fastest.team), value: fastest.bestMs ? formatLapTime(fastest.bestMs) : '' }
        : null;
      const status = badge ? ` (${badge.text.toLowerCase()})` : '';
      const model: TableModel = {
        kind: 'table',
        motif: sel.motif,
        lang,
        kicker,
        title: S.titles.result,
        subtitle: label,
        badge,
        columns: { name: lang === 'de' ? 'Fahrer' : 'Driver', value: lang === 'de' ? 'Zeit / Abstand' : 'Time / gap', extra: S.pointsShort },
        rows,
        note,
        teamsOnly: false,
        alt:
          `${brand} – ${S.titles.result} ${label}, ${seasonText}${status}: ` +
          ranked(rows.map((r) => ({ pos: r.pos, label: `${r.name}${r.team ? ` (${r.team})` : ''}${r.valueTone === 'danger' ? ` ${r.value}` : ''}` }))) +
          (note ? `. ${S.fastestLap}: ${note.name}${note.value ? `, ${note.value}` : ''}.` : '.'),
        discordTitle: `${S.titles.result} · ${label}${status}`,
        fileName: file(),
      };
      return { ok: true, model };
    }

    case 'standings-drivers':
    case 'standings-teams': {
      const st = season.standings.find((s) => s.after === round.number);
      if (!st) return fail('Nach dieser Runde gibt es noch keinen Wertungsstand.');
      const teamsOnly = sel.motif === 'standings-teams';
      const limit = teamsOnly ? st.teams.length : sel.format === 'story' ? 22 : 10;
      const list = (teamsOnly ? st.teams : st.drivers).slice(0, limit);
      if (list.length === 0) return fail('Nach dieser Runde gibt es noch keinen Wertungsstand.');
      const title = teamsOnly ? S.titles.standingsTeams : S.titles.standingsDrivers;
      const rows: TableRowModel[] = list.map((s, i) => {
        const prevTied = i > 0 && list[i - 1]!.pos === s.pos;
        const teamId = teamsOnly ? s.id : s.team;
        return {
          pos: prevTied ? '=' : String(s.pos),
          name: teamsOnly ? teamName(s.id) : name(s.id),
          team: teamsOnly ? null : teamName(teamId) || null,
          color: teamColor(teamId),
          number: teamsOnly ? null : numberOf(s.id),
          value: String(s.points),
          valueTone: 'default',
          extra: null,
          mark: null,
          reserve: false,
          podium: s.pos <= 3,
        };
      });
      const after = S.standingsAfterFull(round.number);
      const model: TableModel = {
        kind: 'table',
        motif: sel.motif,
        lang,
        kicker: `${seasonText} · ${S.afterRound(round.number)}`,
        title,
        subtitle: `${S.afterRoundShort(round.number)} · ${trackName(round, lang)}`,
        // Stand mit vorläufigem Ergebnis kennzeichnen
        badge: round.status === 'provisional' ? roundBadge(round.status, S) : null,
        columns: { name: teamsOnly ? 'Team' : lang === 'de' ? 'Fahrer' : 'Driver', value: lang === 'de' ? 'Punkte' : 'Points', extra: null },
        rows,
        note: null,
        teamsOnly,
        alt:
          `${brand} – ${title}, ${seasonText}, ${after} (${label}): ` +
          list.map((s, i) => `${s.pos}. ${rows[i]!.name} ${S.points(s.points)}`).join(', ') +
          '.',
        discordTitle: `${title} · ${seasonText} · ${after}`,
        fileName: file(),
      };
      return { ok: true, model };
    }

    case 'grid': {
      const fromRace = round.race.filter((r) => r.grid != null).sort((a, b) => a.grid! - b.grid!);
      const fromQuali = round.quali.filter((r) => r.pos != null);
      const order: Array<{ pos: number; r: GResult }> =
        fromRace.length > 0 ? fromRace.map((r) => ({ pos: r.grid!, r })) : fromQuali.map((r, i) => ({ pos: i + 1, r }));
      if (order.length > 0) {
        const slots: GridSlotModel[] = order.slice(0, 22).map(({ pos, r }) => ({
          pos: String(pos),
          name: name(r.driver),
          team: teamName(r.team),
          color: teamColor(r.team) ?? '#26262C',
          number: r.num != null ? String(r.num) : null,
          reserve: r.reserve,
        }));
        const model: GridModel = {
          kind: 'grid',
          motif: sel.motif,
          lang,
          kicker,
          title: S.titles.grid,
          subtitle: label,
          badge: null,
          slots,
          alt: `${brand} – ${S.titles.grid} ${label}, ${seasonText}: ${ranked(slots.map((s) => ({ pos: s.pos, label: `${s.name} (${s.team})` })))}.`,
          discordTitle: `${S.titles.grid} · ${label}`,
          fileName: file(),
        };
        return { ok: true, model };
      }
      if (round.lineup.length === 0) return fail('Für diese Runde ist noch keine Aufstellung veröffentlicht.');
      const groups = new Map<Id, LineupModel['teams'][number]>();
      for (const e of round.lineup) {
        let g = groups.get(e.team);
        if (!g) {
          g = { name: teamName(e.team), color: teamColor(e.team) ?? '#26262C', drivers: [] };
          groups.set(e.team, g);
        }
        g.drivers.push({ name: name(e.driver), number: e.num != null ? String(e.num) : null, reserve: e.reserve });
      }
      const list = [...groups.values()];
      const model: LineupModel = {
        kind: 'lineup',
        motif: sel.motif,
        lang,
        kicker,
        title: S.titles.lineup,
        subtitle: label,
        badge: null,
        teams: list,
        alt:
          `${brand} – ${S.titles.lineup} ${label}, ${seasonText}: ` +
          list.map((t) => `${t.name}: ${listText(t.drivers.map((d) => `${d.name}${d.reserve ? ` (${S.reserve})` : ''}`), lang)}`).join('; ') +
          '.',
        discordTitle: `${S.titles.lineup} · ${label}`,
        fileName: file('aufstellung'),
      };
      return { ok: true, model };
    }

    case 'raceweek': {
      if (round.status === 'cancelled') return fail('Diese Runde ist abgesagt.');
      const date = formatDate(round.startUtc, lang, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
      const time = formatTime(round.startUtc, lang);
      const tz = timeZoneName(round.startUtc, lang);
      const sessions = round.sessions.map((t: SessionType) => S.sessions[t]);
      const facts = [
        round.format === 'sprint' ? S.sprintFormat : null,
        round.laps ? S.laps(round.laps) : null,
        round.lengthKm ? S.km(formatKm(round.lengthKm, lang)) : null,
      ].filter((x): x is string => !!x);
      const country = countryName(round.country, lang);
      const track = trackName(round, lang);
      const model: RaceWeekModel = {
        kind: 'raceweek',
        motif: sel.motif,
        lang,
        kicker,
        title: S.titles.raceweek,
        // Strecke und Runde stehen groß im Motiv
        subtitle: '',
        badge: null,
        roundNo: `R${round.number}`,
        track,
        country,
        countryCode: round.country,
        date,
        time,
        timeZone: tz,
        sessions,
        facts,
        alt:
          `${brand} – ${S.titles.raceweek}: ${S.round(round.number)}, ${track}${country ? ` (${country})` : ''}, ${seasonText}. ` +
          `${date}, ${time} ${tz} (${S.leagueTime}). ${listText(sessions, lang)}${facts.length ? `. ${facts.join(', ')}` : ''}.`,
        discordTitle: `${S.titles.raceweek} · ${label}`,
        fileName: file(),
      };
      return { ok: true, model };
    }

    case 'pole': {
      const q = round.quali;
      const pole = q.find((r) => r.pole) ?? q.find((r) => r.pos === 1);
      if (!pole) return fail('Für diese Runde gibt es noch kein veröffentlichtes Qualifying.');
      const others = q.filter((r) => r !== pole && r.pos != null && r.status === 'classified').slice(0, 2);
      const gapTo = (r: GResult) => (r.bestMs != null && pole.bestMs != null ? formatGapMs(r.bestMs - pole.bestMs) : '');
      const second = others[0];
      const gap = second ? gapTo(second) || null : null;
      const time = pole.bestMs != null ? formatLapTime(pole.bestMs) : '–';
      const driver = { name: name(pole.driver), number: pole.num != null ? String(pole.num) : null, team: teamName(pole.team), color: teamColor(pole.team) };
      const model: PoleModel = {
        kind: 'pole',
        motif: sel.motif,
        lang,
        kicker,
        title: S.titles.pole,
        subtitle: label,
        badge: null,
        driver,
        time,
        gap,
        gapLabel: S.gapTo(2),
        chasers: others.map((r) => ({ pos: `P${r.pos}`, name: name(r.driver), team: teamName(r.team), color: teamColor(r.team), value: gapTo(r) })),
        alt:
          `${brand} – ${S.titles.pole} ${label}, ${seasonText}: ${driver.name} (${driver.team}), ${time}` +
          (second && gap ? `, ${gap} ${lang === 'de' ? 'vor' : 'ahead of'} ${name(second.driver)}` : '') +
          '.',
        discordTitle: `${S.titles.pole} · ${label}: ${driver.name}`,
        fileName: file(),
      };
      return { ok: true, model };
    }

    default:
      return fail('Unbekanntes Motiv.');
  }
}
