/**
 * Texte auf den Social-Grafiken (DE/EN). Die Admin-Oberfläche selbst ist nur deutsch; die
 * Grafiken erscheinen öffentlich und gibt es deshalb in beiden Sprachen. Renn-Bezeichnungen
 * ohne offizielle Event-Titel (Plan §9.1).
 */
import type { ResultStatus, RoundStatus, SessionType } from '~/lib/db/types';

export type Lang = 'de' | 'en';

export interface GraphicStrings {
  season: (n: number) => string;
  round: (n: number) => string;
  afterRound: (n: number) => string;
  titles: {
    result: string;
    sprintResult: string;
    standingsDrivers: string;
    standingsTeams: string;
    grid: string;
    lineup: string;
    raceweek: string;
    pole: string;
    newcomer: string;
  };
  roundStatus: Partial<Record<RoundStatus, string>>;
  resultStatus: Record<Exclude<ResultStatus, 'classified'>, string>;
  sessions: Record<SessionType, string>;
  points: (n: number) => string;
  pointsShort: string;
  lapsDown: (n: number) => string;
  winner: string;
  fastestLap: string;
  gapTo: (pos: number) => string;
  reserve: string;
  reserveDriver: string;
  replaces: (name: string) => string;
  formerDriver: (id: number) => string;
  unknownDriver: string;
  noTeam: string;
  sprintFormat: string;
  laps: (n: number) => string;
  km: (value: string) => string;
  leagueTime: string;
  start: string;
  number: string;
  nationality: string;
  welcome: string;
  onGrid: string;
  graphic: string;
  standingsAfterFull: (n: number) => string;
  /** kurz für Untertitel, z. B. „Nach R4“ */
  afterRoundShort: (n: number) => string;
}

const DE: GraphicStrings = {
  season: (n) => `Saison ${n}`,
  round: (n) => `Runde ${n}`,
  afterRound: (n) => `nach Runde ${n}`,
  titles: {
    result: 'Rennergebnis',
    sprintResult: 'Sprint-Ergebnis',
    standingsDrivers: 'Fahrerwertung',
    standingsTeams: 'Konstrukteurswertung',
    grid: 'Startaufstellung',
    lineup: 'Aufstellung',
    raceweek: 'Race Week',
    pole: 'Pole-Position',
    newcomer: 'Neuzugang',
  },
  roundStatus: { provisional: 'Vorläufig', final: 'Final', corrected: 'Korrigiert', lineup_published: 'Aufstellung steht', scheduled: 'Geplant' },
  resultStatus: { dnf: 'DNF', dns: 'DNS', dsq: 'DSQ', dnc: 'NC' },
  sessions: { qualifying: 'Qualifying', sprint: 'Sprint', race: 'Rennen' },
  points: (n) => `${n} ${n === 1 ? 'Punkt' : 'Punkte'}`,
  pointsShort: 'Pkt.',
  lapsDown: (n) => `+${n} ${n === 1 ? 'Rd.' : 'Rdn.'}`,
  winner: 'Sieger',
  fastestLap: 'Schnellste Runde',
  gapTo: (pos) => `Abstand zu P${pos}`,
  reserve: 'Reserve',
  reserveDriver: 'Reservefahrer',
  replaces: (name) => `für ${name}`,
  formerDriver: (id) => `Ehemaliger Fahrer #${id}`,
  unknownDriver: 'Unbekannt',
  noTeam: 'Ohne Team',
  sprintFormat: 'Sprint-Format',
  laps: (n) => `${n} Runden`,
  km: (value) => `${value} km`,
  leagueTime: 'Liga-Zeit',
  start: 'Start',
  number: 'Startnummer',
  nationality: 'Nationalität',
  welcome: 'Willkommen im Grid!',
  onGrid: 'im Grid',
  graphic: 'Grafik',
  standingsAfterFull: (n) => `Stand nach Runde ${n}`,
  afterRoundShort: (n) => `Nach R${n}`,
};

const EN: GraphicStrings = {
  season: (n) => `Season ${n}`,
  round: (n) => `Round ${n}`,
  afterRound: (n) => `after round ${n}`,
  titles: {
    result: 'Race result',
    sprintResult: 'Sprint result',
    standingsDrivers: 'Drivers’ standings',
    standingsTeams: 'Constructors’ standings',
    grid: 'Starting grid',
    lineup: 'Line-up',
    raceweek: 'Race week',
    pole: 'Pole position',
    newcomer: 'New driver',
  },
  roundStatus: { provisional: 'Provisional', final: 'Final', corrected: 'Corrected', lineup_published: 'Line-up set', scheduled: 'Scheduled' },
  resultStatus: { dnf: 'DNF', dns: 'DNS', dsq: 'DSQ', dnc: 'NC' },
  sessions: { qualifying: 'Qualifying', sprint: 'Sprint', race: 'Race' },
  points: (n) => `${n} ${n === 1 ? 'point' : 'points'}`,
  pointsShort: 'pts',
  lapsDown: (n) => `+${n} ${n === 1 ? 'lap' : 'laps'}`,
  winner: 'Winner',
  fastestLap: 'Fastest lap',
  gapTo: (pos) => `Gap to P${pos}`,
  reserve: 'Reserve',
  reserveDriver: 'Reserve driver',
  replaces: (name) => `for ${name}`,
  formerDriver: (id) => `Former driver #${id}`,
  unknownDriver: 'Unknown',
  noTeam: 'No team',
  sprintFormat: 'Sprint format',
  laps: (n) => `${n} laps`,
  km: (value) => `${value} km`,
  leagueTime: 'league time',
  start: 'Start',
  number: 'Race number',
  nationality: 'Nationality',
  welcome: 'Welcome to the grid!',
  onGrid: 'on the grid',
  graphic: 'Graphic',
  standingsAfterFull: (n) => `Standings after round ${n}`,
  afterRoundShort: (n) => `After R${n}`,
};

export const GRAPHIC_STRINGS: Record<Lang, GraphicStrings> = { de: DE, en: EN };

export function strings(lang: Lang): GraphicStrings {
  return GRAPHIC_STRINGS[lang] ?? DE;
}
