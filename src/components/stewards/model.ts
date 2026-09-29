/**
 * Sicht auf eine veröffentlichte Entscheidung mit allem Kontext für Register und Detailseite.
 */
import type { DecisionRow, DriverRow, RoundRow, SeasonRow, SessionType, TeamRow, TrackRow } from '~/lib/db/types';
import { localized, type Lang, type League, type Localized } from '~/lib/league/league';
import { decisionRuleLink, type RuleLink } from './rules';

export interface DecisionItem {
  decision: DecisionRow;
  round: RoundRow;
  track: TrackRow | undefined;
  season: SeasonRow;
  /** Session der Entscheidung; ohne Angabe gilt sie fürs Hauptrennen. */
  sessionType: SessionType;
  driver: DriverRow | undefined;
  team: TeamRow | undefined;
  /** Startnummer in dieser Runde */
  number: number | null;
  reasoning: Localized;
  /** Link zur Regel (Fassung der Saison); null ohne Regel-Referenz */
  rule: RuleLink | null;
}

export function decisionItem(league: League, decision: DecisionRow, lang: Lang): DecisionItem | null {
  const round = league.round(decision.round_id);
  const season = round ? league.season(round.season_id) : undefined;
  if (!round || !season) return null;
  const session = decision.session_id != null ? league.session(decision.session_id) : undefined;
  const entry = league.entriesOf(round.id).find((e) => e.driver_id === decision.driver_id);
  const teamId = entry?.team_id ?? league.driverTeam(decision.driver_id, season.id)?.id;
  return {
    decision,
    round,
    track: league.track(round.track_id),
    season,
    sessionType: session?.type ?? 'race',
    driver: league.driver(decision.driver_id),
    team: teamId != null ? league.team(teamId) : undefined,
    number: entry?.race_number ?? league.numberAt(decision.driver_id, new Date(round.start_utc)),
    reasoning: localized(decision, 'reasoning', lang),
    rule: decisionRuleLink(league, lang, season, decision.rule_ref),
  };
}

/** Alle veröffentlichten Entscheidungen als Sicht, neueste zuerst. */
export function decisionItems(league: League, lang: Lang): DecisionItem[] {
  return league.decisions.map((d) => decisionItem(league, d, lang)).filter((x): x is DecisionItem => x != null);
}
