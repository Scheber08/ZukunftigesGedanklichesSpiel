/**
 * Discord-Embeds für den Renntag (Plan §8.1): Aufstellung, Ergebnis (vorläufig/final/korrigiert)
 * und Urteile. Reine Funktionen – der Server ergänzt Farbe und verschickt sie über `notify()`.
 */
import type { Embed, EmbedField } from '../../server/discord';

export type ResultsEmbedKind = 'provisional' | 'final' | 'corrected';

export interface EmbedDriver {
  name: string;
  number?: number | null;
  team?: string | null;
}

const KIND_TITLE: Record<ResultsEmbedKind, string> = {
  provisional: 'Vorläufiges Ergebnis',
  final: 'Endergebnis',
  corrected: 'Korrigiertes Ergebnis',
};

const MEDALS = ['P1', 'P2', 'P3'];

function driverLine(d: EmbedDriver): string {
  const num = d.number != null ? `#${d.number} ` : '';
  const team = d.team ? ` (${d.team})` : '';
  return `${num}${d.name}${team}`;
}

export interface ResultsEmbedInput {
  kind: ResultsEmbedKind;
  roundLabel: string;
  seasonName: string;
  url: string;
  podium: EmbedDriver[];
  pole: EmbedDriver | null;
  fastestLap: (EmbedDriver & { time: string }) | null;
  /** Protestfrist als Text (nur bei vorläufig). */
  protestDeadline?: string | null;
  /** Grund der Korrektur (nur bei korrigiert). */
  reason?: string | null;
  sprintWinner?: EmbedDriver | null;
}

export function resultsEmbed(input: ResultsEmbedInput): Embed {
  const fields: EmbedField[] = [];
  fields.push({
    name: 'Podium',
    value: input.podium.length > 0 ? input.podium.map((d, i) => `${MEDALS[i] ?? `P${i + 1}`}  ${driverLine(d)}`).join('\n') : '–',
  });
  if (input.sprintWinner) fields.push({ name: 'Sprint-Sieg', value: driverLine(input.sprintWinner), inline: true });
  fields.push({ name: 'Pole', value: input.pole ? driverLine(input.pole) : '–', inline: true });
  fields.push({
    name: 'Schnellste Runde',
    value: input.fastestLap ? `${driverLine(input.fastestLap)} · ${input.fastestLap.time}` : '–',
    inline: true,
  });
  if (input.kind === 'provisional' && input.protestDeadline) {
    fields.push({ name: 'Protestfrist', value: `Meldungen an die Stewards bis ${input.protestDeadline}` });
  }
  if (input.kind === 'corrected' && input.reason) {
    fields.push({ name: 'Grund der Korrektur', value: input.reason });
  }
  return {
    title: `${KIND_TITLE[input.kind]}: ${input.roundLabel}`,
    description: `${input.seasonName} · alle Ergebnisse auf der Rennseite`,
    url: input.url,
    fields,
    timestamp: new Date().toISOString(),
  };
}

export interface LineupEmbedTeam {
  team: string;
  seats: Array<{ name: string | null; number: number | null; reserve: boolean; replaces: string | null }>;
}

export function lineupEmbed(input: {
  roundLabel: string;
  seasonName: string;
  startText: string;
  url: string;
  teams: LineupEmbedTeam[];
}): Embed {
  const reserves = input.teams.flatMap((t) => t.seats).filter((s) => s.reserve && s.name).length;
  return {
    title: `Aufstellung: ${input.roundLabel}`,
    description: `${input.seasonName} · Start ${input.startText}${reserves > 0 ? ` · ${reserves} Ersatzfahrer (R)` : ''}`,
    url: input.url,
    fields: input.teams.map((t) => ({
      name: t.team,
      value: t.seats
        .map((s) => {
          if (!s.name) return 'frei';
          const num = s.number != null ? `#${s.number} ` : '';
          const reserve = s.reserve ? ` (R${s.replaces ? `, für ${s.replaces}` : ''})` : '';
          return `${num}${s.name}${reserve}`;
        })
        .join('\n'),
      inline: true,
    })),
    timestamp: new Date().toISOString(),
  };
}

/** Markdown grob in Klartext umwandeln und kürzen (für die Kurzbegründung). */
export function plainShort(markdown: string, max = 280): string {
  const text = markdown
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_`>#]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

export function decisionEmbed(input: {
  ref: string;
  roundLabel: string;
  driver: EmbedDriver;
  verdict: string;
  reasoning: string;
  url: string;
  revoked?: boolean;
}): Embed {
  return {
    title: `${input.revoked ? 'Urteil zurückgenommen' : 'Urteil'} ${input.ref}`,
    description: plainShort(input.reasoning),
    url: input.url,
    fields: [
      { name: 'Rennen', value: input.roundLabel, inline: true },
      { name: 'Fahrer', value: driverLine(input.driver), inline: true },
      { name: 'Entscheidung', value: input.revoked ? `${input.verdict} (zurückgenommen)` : input.verdict, inline: true },
    ],
    timestamp: new Date().toISOString(),
  };
}
