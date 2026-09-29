/**
 * Deutsche Bezeichnungen für den Admin-Renntag (Admin-Oberfläche nur Deutsch).
 * Reine Daten/Funktionen – auch in den Svelte-Islands nutzbar.
 */
import type {
  DecisionStatus,
  IncidentStatus,
  ResultStatus,
  RoundStatus,
  SessionType,
  Verdict,
} from '../../db/types';
import type { ComputeWarningCode } from '../../domain/points';
import type { GridIssue, GridIssueCode } from '../../domain/grid';

export const ROUND_STATUS_LABEL: Record<RoundStatus, string> = {
  scheduled: 'geplant',
  lineup_published: 'Aufstellung veröffentlicht',
  provisional: 'vorläufig',
  final: 'final',
  corrected: 'korrigiert',
  cancelled: 'abgesagt',
};

export const SESSION_LABEL: Record<SessionType, string> = {
  qualifying: 'Qualifying',
  sprint: 'Sprint',
  race: 'Rennen',
};

export const RESULT_STATUS_LABEL: Record<ResultStatus, string> = {
  classified: 'gewertet',
  dnf: 'DNF',
  dns: 'DNS',
  dsq: 'DSQ',
  dnc: 'NC',
};

export const RESULT_STATUS_HINT: Record<ResultStatus, string> = {
  classified: 'gewertet',
  dnf: 'ausgefallen',
  dns: 'nicht gestartet',
  dsq: 'disqualifiziert',
  dnc: 'nicht gewertet',
};

export const INCIDENT_STATUS_LABEL: Record<IncidentStatus, string> = {
  new: 'neu',
  in_review: 'in Prüfung',
  decided: 'entschieden',
  rejected: 'abgelehnt',
  late: 'verspätet',
};

/** Badge-Variante je Vorfall-Status (Farbe nie allein – der Text steht immer dabei). */
export const INCIDENT_STATUS_VARIANT: Record<IncidentStatus, 'teal' | 'warning' | 'green' | 'muted' | 'danger'> = {
  new: 'teal',
  in_review: 'warning',
  decided: 'green',
  rejected: 'muted',
  late: 'danger',
};

export const VERDICT_LABEL: Record<Verdict, string> = {
  no_action: 'Keine Strafe',
  warning: 'Verwarnung',
  time_penalty: 'Zeitstrafe',
  position_penalty: 'Positionsstrafe',
  grid_penalty_next: 'Grid-Strafe (nächstes Rennen)',
  dsq: 'Disqualifikation',
  race_ban: 'Rennsperre (nächstes Rennen)',
};

export const DECISION_STATUS_LABEL: Record<DecisionStatus, string> = {
  draft: 'Entwurf',
  published: 'veröffentlicht',
  revoked: 'zurückgenommen',
};

export const DECISION_STATUS_VARIANT: Record<DecisionStatus, 'warning' | 'green' | 'muted'> = {
  draft: 'warning',
  published: 'green',
  revoked: 'muted',
};

/** Urteil als kurzer Text, z. B. „Zeitstrafe 5 s“ oder „Grid-Strafe 3 Plätze (nächstes Rennen)“. */
export function verdictText(d: { verdict: Verdict; time_seconds: number | null; positions: number | null }): string {
  switch (d.verdict) {
    case 'time_penalty':
      return d.time_seconds ? `Zeitstrafe ${d.time_seconds} s` : 'Zeitstrafe';
    case 'position_penalty':
      return d.positions ? `Positionsstrafe ${d.positions} ${d.positions === 1 ? 'Platz' : 'Plätze'}` : 'Positionsstrafe';
    case 'grid_penalty_next':
      return d.positions
        ? `Grid-Strafe ${d.positions} ${d.positions === 1 ? 'Platz' : 'Plätze'} (nächstes Rennen)`
        : VERDICT_LABEL.grid_penalty_next;
    default:
      return VERDICT_LABEL[d.verdict];
  }
}

export const COMPUTE_WARNING_TEXT: Record<ComputeWarningCode, string> = {
  time_penalty_unresolved: 'Zeitstrafe konnte mangels Gesamtzeit/Abstand nicht verrechnet werden',
  time_penalty_in_qualifying: 'Zeitstrafe im Qualifying wird nicht verrechnet',
  penalty_unknown_driver: 'Strafe für einen Fahrer ohne Ergebniszeile',
  duplicate_driver: 'Fahrer doppelt eingetragen – nur die erste Zeile zählt',
};

const GRID_ISSUE_TEXT: Record<GridIssueCode, string> = {
  duplicate_driver: 'ist mehrfach eingetragen',
  duplicate_seat: 'Cockpit ist doppelt belegt',
  number_conflict: 'Startnummer ist doppelt vergeben',
  missing_number: 'hat zum Rennstart keine gültige Startnummer',
  banned_driver: 'ist gesperrt (Fahrerstatus)',
  race_ban: 'hat eine Rennsperre aus der Vorrunde',
  inactive_driver: 'ist als inaktiv markiert',
  absent_driver_entered: 'ist abgemeldet, aber eingetragen',
  too_many_drivers: 'Mehr als 22 Fahrer in der Aufstellung',
  empty_seat: 'Cockpit ist leer',
  reserve_without_replacement: 'ist als Ersatz eingetragen, ersetzt aber niemanden',
};

/** Verständliche Meldung zu einer Grid-Prüfung. */
export function gridIssueText(
  issue: GridIssue,
  names: { driver: (id: number) => string; team: (id: number) => string },
): string {
  const text = GRID_ISSUE_TEXT[issue.code];
  if (issue.code === 'too_many_drivers') return text;
  if (issue.code === 'empty_seat' || issue.code === 'duplicate_seat') {
    const team = issue.teamId != null ? names.team(issue.teamId) : 'Team';
    return `${team}, Cockpit ${issue.seatNo ?? '?'}: ${text}`;
  }
  const who = issue.driverId != null ? names.driver(issue.driverId) : 'Fahrer';
  if (issue.code === 'number_conflict' && issue.number != null) return `${who}: Startnummer ${issue.number} ist doppelt vergeben`;
  return `${who} ${text}`;
}
