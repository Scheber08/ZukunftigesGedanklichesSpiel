/**
 * Renntag-Checkliste (Plan §11.1): Aufstellung → Ergebnis vorläufig → Stewards → final.
 * Reine Ableitung aus dem Zustand einer Runde.
 */
import type { Id, RoundStatus } from '../../db/types';
import { countText, openIncidentsText } from './labels';

export type StepState = 'done' | 'current' | 'open' | 'blocked';

export interface RaceDayStep {
  key: 'lineup' | 'results' | 'provisional' | 'stewards' | 'final';
  title: string;
  detail: string;
  state: StepState;
  href: string;
  linkLabel: string;
}

export interface RoundFacts {
  roundId: Id;
  status: RoundStatus;
  entries: number;
  /** Anzahl Sessions mit eingetragenem Ergebnis / Sessions insgesamt. */
  sessionsEntered: number;
  sessionsTotal: number;
  openIncidents: number;
  draftDecisions: number;
  protestOpen: boolean;
  frozen: boolean;
}

const PUBLIC_RESULT: readonly RoundStatus[] = ['provisional', 'final', 'corrected'];

export function raceDaySteps(f: RoundFacts): RaceDayStep[] {
  const base = `/admin/runden/${f.roundId}`;
  const lineupDone = f.entries > 0 && f.status !== 'scheduled';
  const resultsDone = f.sessionsTotal > 0 && f.sessionsEntered === f.sessionsTotal;
  const provisionalDone = PUBLIC_RESULT.includes(f.status);
  const stewardsDone = provisionalDone && !f.protestOpen && f.openIncidents === 0 && f.draftDecisions === 0;
  const finalDone = f.status === 'final' || f.status === 'corrected';

  const steps: RaceDayStep[] = [
    {
      key: 'lineup',
      title: 'Aufstellung veröffentlichen',
      detail: lineupDone
        ? `${f.entries} Cockpits veröffentlicht`
        : f.entries > 0
          ? `Entwurf mit ${f.entries} Cockpits – noch nicht veröffentlicht`
          : 'Abmeldungen übernehmen, Ersatzfahrer setzen (bis T−24 h)',
      state: lineupDone ? 'done' : 'open',
      href: `${base}/grid`,
      linkLabel: 'Grid-Builder',
    },
    {
      key: 'results',
      title: 'Ergebnis eintragen',
      detail: resultsDone
        ? 'Alle Sessions eingetragen'
        : `${f.sessionsEntered} von ${f.sessionsTotal} Sessions eingetragen (Rennende + ≤ 2 h)`,
      state: resultsDone ? 'done' : 'open',
      href: `${base}/ergebnisse`,
      linkLabel: 'Ergebnis-Eingabe',
    },
    {
      key: 'provisional',
      title: 'Vorläufig veröffentlichen',
      detail: provisionalDone ? 'Ergebnis ist öffentlich, Protestfrist gestartet' : 'Macht das Ergebnis sichtbar und startet die Protestfrist',
      state: provisionalDone ? 'done' : resultsDone ? 'open' : 'blocked',
      href: `${base}/ergebnisse`,
      linkLabel: 'Ergebnis-Eingabe',
    },
    {
      key: 'stewards',
      title: 'Stewards entscheiden',
      detail: !provisionalDone
        ? 'Nach der vorläufigen Veröffentlichung'
        : f.protestOpen
          ? `Protestfrist läuft · ${openIncidentsText(f.openIncidents)}`
          : f.openIncidents + f.draftDecisions > 0
            ? `${openIncidentsText(f.openIncidents)}, ${countText(f.draftDecisions, 'Entwurf', 'Entwürfe')}`
            : 'Alle Vorfälle bearbeitet',
      state: stewardsDone ? 'done' : provisionalDone ? 'open' : 'blocked',
      href: `/admin/stewards?runde=${f.roundId}`,
      linkLabel: 'Steward-Werkzeug',
    },
    {
      key: 'final',
      title: 'Final setzen',
      detail: finalDone
        ? f.status === 'corrected'
          ? 'Final, nachträglich korrigiert'
          : 'Final – Snapshot gespeichert'
        : 'Speichert den Wertungs-Snapshot und postet in Discord',
      state: finalDone ? 'done' : provisionalDone ? 'open' : 'blocked',
      href: `${base}/ergebnisse`,
      linkLabel: 'Ergebnis-Eingabe',
    },
  ];

  if (f.status === 'cancelled' || f.frozen) {
    return steps.map((s) => (s.state === 'done' ? s : { ...s, state: 'blocked' }));
  }
  // Erster offener Schritt ist der aktuelle
  const current = steps.find((s) => s.state === 'open');
  if (current) current.state = 'current';
  return steps;
}
