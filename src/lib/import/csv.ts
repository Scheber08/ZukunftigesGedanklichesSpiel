/**
 * CSV-Import der Ergebnis-Eingabe (Plan §5.2 „Import … einer CSV“).
 *
 * Spalten (Standard-Reihenfolge ohne Kopfzeile):
 *   Position; Startnummer; Gamertag (optional); Status; Beste Runde; Gesamtzeit; Stopps; Strafsekunden
 *
 * - Trennzeichen „;“, „,“ oder Tab werden erkannt (Excel-Zeile „sep=;“ ebenso), Excel-BOM wird entfernt.
 * - Kopfzeile optional; mit Kopfzeile ist die Reihenfolge frei und zusätzlich „Startplatz“ und
 *   „Runden“ möglich. Ohne Kopfzeile darf die Gamertag-Spalte fehlen (7 Spalten).
 * - Zeiten wie in der Ergebnis-Eingabe (1:23.456, 1:23,456, 45:12.345, 1:02:03.4); „+1 Runde“ in
 *   der Gesamtzeit bedeutet eine Runde Rückstand.
 * - Status: leer/gewertet, DNF, DNS, DSQ, NC (auch englisch).
 * Reine Funktion – im Browser (Vorschau) und auf dem Server (Speichern) dieselbe Logik.
 */
import type { ResultStatus, SessionType } from '../db/types';
import { parseLapTime } from '../domain/laptime';
import type { ImportRow } from './rows';

export type CsvColumn = 'position' | 'number' | 'gamertag' | 'status' | 'bestLap' | 'totalTime' | 'pitStops' | 'penalty' | 'grid' | 'laps' | 'ignore';

export const CSV_COLUMN_LABEL: Record<CsvColumn, string> = {
  position: 'Position',
  number: 'Startnummer',
  gamertag: 'Gamertag',
  status: 'Status',
  bestLap: 'Beste Runde',
  totalTime: 'Gesamtzeit',
  pitStops: 'Stopps',
  penalty: 'Strafsekunden',
  grid: 'Startplatz',
  laps: 'Runden',
  ignore: '(ignoriert)',
};

/** Standard-Reihenfolge ohne Kopfzeile */
export const CSV_DEFAULT_COLUMNS: readonly CsvColumn[] = ['position', 'number', 'gamertag', 'status', 'bestLap', 'totalTime', 'pitStops', 'penalty'];
const CSV_COLUMNS_NO_GAMERTAG: readonly CsvColumn[] = ['position', 'number', 'status', 'bestLap', 'totalTime', 'pitStops', 'penalty'];

/** Beispiel für die Oberfläche */
export const CSV_EXAMPLE = [
  'Position;Startnummer;Gamertag;Status;Beste Runde;Gesamtzeit;Stopps;Strafsekunden',
  '1;4;ApexAnna;gewertet;1:14.512;32:10.456;1;0',
  '2;77;KerbKiller77;gewertet;1:14.803;32:14.120;1;5',
  '3;16;LateBrakeLukas;DNF;1:15.020;;0;0',
].join('\n');

export const CSV_MAX_ROWS = 60;
export const CSV_MAX_CHARS = 64 * 1024;

const HEADER_ALIASES: Record<Exclude<CsvColumn, 'ignore'>, readonly string[]> = {
  position: ['position', 'pos', 'platz', 'p', 'rang', 'rank', 'ziel'],
  number: ['startnummer', 'nummer', 'nr', 'number', 'racenumber', 'no', 'num', 'startnr', 'carnumber'],
  gamertag: ['gamertag', 'name', 'fahrer', 'driver', 'spieler', 'player'],
  status: ['status', 'ergebnis', 'result'],
  bestLap: ['besterunde', 'bestlap', 'schnellsterunde', 'bestzeit', 'fastestlap', 'bestlaptime'],
  totalTime: ['gesamtzeit', 'zeit', 'totaltime', 'time', 'renndauer', 'racetime'],
  pitStops: ['stopps', 'stops', 'boxenstopps', 'pitstops', 'pits', 'boxenstopp'],
  penalty: ['strafsekunden', 'strafe', 'strafen', 'penalty', 'penalties', 'penaltyseconds', 'ingamestrafe', 'zeitstrafe'],
  grid: ['startplatz', 'grid', 'gridposition', 'start', 'startposition'],
  laps: ['runden', 'laps', 'rd'],
};

const STATUS_ALIASES: Record<ResultStatus, readonly string[]> = {
  classified: ['', 'gewertet', 'classified', 'fin', 'finished', 'ziel', 'imziel', 'ok', 'gew'],
  dnf: ['dnf', 'ausgefallen', 'ret', 'retired', 'aufgegeben', 'out', 'ausfall'],
  dns: ['dns', 'nichtgestartet', 'didnotstart'],
  dsq: ['dsq', 'dq', 'disqualifiziert', 'disqualified', 'disq'],
  dnc: ['nc', 'dnc', 'nichtgewertet', 'notclassified'],
};

const BOM = String.fromCharCode(0xfeff);

function key(text: string): string {
  return text
    .toLowerCase()
    .replaceAll('ä', 'ae')
    .replaceAll('ö', 'oe')
    .replaceAll('ü', 'ue')
    .replaceAll('ß', 'ss')
    .replace(/[^a-z0-9]/g, '');
}

export function parseStatusText(text: string): ResultStatus | null {
  const k = key(text);
  for (const [status, aliases] of Object.entries(STATUS_ALIASES) as Array<[ResultStatus, readonly string[]]>) {
    if (aliases.includes(k)) return status;
  }
  return null;
}

function headerColumn(cell: string): CsvColumn | null {
  const k = key(cell);
  if (k === '') return null;
  for (const [col, aliases] of Object.entries(HEADER_ALIASES) as Array<[Exclude<CsvColumn, 'ignore'>, readonly string[]]>) {
    if (aliases.includes(k)) return col;
  }
  return null;
}

/** Eine Zeile in Zellen zerlegen (Anführungszeichen mit "" als Escape). */
export function splitCsvLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else quoted = false;
      } else cur += ch;
    } else if (ch === '"' && cur.trim() === '') {
      quoted = true;
      cur = '';
    } else if (ch === delimiter) {
      cells.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  cells.push(cur.trim());
  return cells;
}

function countOutsideQuotes(line: string, ch: string): number {
  let n = 0;
  let quoted = false;
  for (const c of line) {
    if (c === '"') quoted = !quoted;
    else if (!quoted && c === ch) n++;
  }
  return n;
}

export function detectDelimiter(line: string): ';' | ',' | '\t' {
  if (countOutsideQuotes(line, ';') > 0) return ';';
  if (countOutsideQuotes(line, '\t') > 0) return '\t';
  return ',';
}

export interface CsvParseResult {
  rows: ImportRow[];
  /** Zeilen, die nicht übernommen werden können */
  errors: string[];
  /** Hinweise (z. B. unlesbare Zeit, doppelte Position) */
  warnings: string[];
  delimiter: ';' | ',' | '\t';
  hasHeader: boolean;
  columns: CsvColumn[];
}

const intOrNull = (text: string): number | null | undefined => {
  const s = text.trim().replace(/^#/, '').replace(/^\+/, '').replace(/\s*s$/i, '');
  if (s === '') return null;
  if (!/^\d{1,4}$/.test(s)) return undefined;
  return Number(s);
};

/** „+1 Runde“, „+2 Laps“, „1L“, „+1 Rd.“ → 1/2; sonst null */
function lapsDownOf(text: string): number | null {
  const m = /^\+?\s*(\d{1,3})\s*(runden?|rd\.?|laps?|l)$/i.exec(text.trim());
  return m ? Number(m[1]) : null;
}

/**
 * CSV-Text → Import-Zeilen (sortiert nach Position; ohne Position in Datei-Reihenfolge hinten).
 */
export function parseCsv(input: string, sessionType: SessionType): CsvParseResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  let text = input.startsWith(BOM) ? input.slice(1) : input;
  if (text.length > CSV_MAX_CHARS) {
    text = text.slice(0, CSV_MAX_CHARS);
    warnings.push(`Die Datei ist länger als ${CSV_MAX_CHARS / 1024} KB – der Rest wurde ignoriert.`);
  }
  const lines = text.split(/\r\n|\n|\r/).map((l, i) => ({ no: i + 1, text: l }));
  let delimiter: ';' | ',' | '\t' | null = null;
  const firstIdx = lines.findIndex((l) => l.text.trim() !== '');
  if (firstIdx >= 0) {
    const sep = /^sep=(.)$/i.exec(lines[firstIdx]!.text.trim());
    if (sep) {
      const c = sep[1]!;
      delimiter = c === ';' || c === ',' ? c : c === '\t' ? '\t' : null;
      lines.splice(firstIdx, 1);
    }
  }
  const content = lines.filter((l) => l.text.trim() !== '');
  if (content.length === 0) {
    return { rows: [], errors: ['Keine Daten gefunden.'], warnings, delimiter: delimiter ?? ';', hasHeader: false, columns: [...CSV_DEFAULT_COLUMNS] };
  }
  delimiter ??= detectDelimiter(content[0]!.text);
  const table = content.map((l) => ({ no: l.no, cells: splitCsvLine(l.text, delimiter!) }));

  // Kopfzeile erkennen
  const headerCols = table[0]!.cells.map(headerColumn);
  const hasHeader = headerCols.some((c) => c != null) && !/^\d+$/.test(table[0]!.cells[0] ?? '');
  let columns: CsvColumn[];
  let data = table;
  if (hasHeader) {
    data = table.slice(1);
    const seen = new Set<CsvColumn>();
    columns = headerCols.map((c, i) => {
      if (c == null) {
        const label = table[0]!.cells[i] ?? '';
        if (label !== '') warnings.push(`Spalte „${label}“ ist unbekannt und wird ignoriert.`);
        return 'ignore';
      }
      if (seen.has(c)) {
        warnings.push(`Spalte „${CSV_COLUMN_LABEL[c]}“ kommt doppelt vor – nur die erste zählt.`);
        return 'ignore';
      }
      seen.add(c);
      return c;
    });
    if (!seen.has('number')) errors.push('Die Kopfzeile enthält keine Spalte „Startnummer“ – ohne Nummer ist keine Zuordnung möglich.');
  } else {
    const width = Math.max(...data.map((r) => r.cells.length));
    if (width >= CSV_DEFAULT_COLUMNS.length) columns = [...CSV_DEFAULT_COLUMNS];
    else {
      // 7 Spalten: Gamertag weggelassen, wenn die 3. Spalte wie ein Status aussieht
      const thirdIsStatus = data.every((r) => parseStatusText(r.cells[2] ?? '') != null);
      columns = [...(thirdIsStatus ? CSV_COLUMNS_NO_GAMERTAG : CSV_DEFAULT_COLUMNS)];
    }
  }
  if (errors.length > 0) return { rows: [], errors, warnings, delimiter, hasHeader, columns };

  if (data.length > CSV_MAX_ROWS) {
    warnings.push(`Mehr als ${CSV_MAX_ROWS} Zeilen – nur die ersten ${CSV_MAX_ROWS} werden gelesen.`);
    data = data.slice(0, CSV_MAX_ROWS);
  }

  const race = sessionType !== 'qualifying';
  const rows: ImportRow[] = [];
  for (const { no, cells } of data) {
    const cell = (col: CsvColumn): string => {
      const i = columns.indexOf(col);
      return i >= 0 ? (cells[i] ?? '').trim() : '';
    };
    const where = `Zeile ${no}`;
    const position = intOrNull(cell('position'));
    if (position === undefined || (position != null && (position < 1 || position > 99))) {
      errors.push(`${where}: Position „${cell('position')}“ ist keine gültige Zahl.`);
      continue;
    }
    const numberText = cell('number');
    const raceNumber = intOrNull(numberText);
    if (raceNumber === undefined || (raceNumber != null && raceNumber > 99)) {
      errors.push(`${where}: Startnummer „${numberText}“ ist ungültig.`);
      continue;
    }
    const status = parseStatusText(cell('status'));
    if (!status) {
      errors.push(`${where}: Status „${cell('status')}“ ist unbekannt (erlaubt: gewertet, DNF, DNS, DSQ, NC).`);
      continue;
    }
    const time = (col: 'bestLap' | 'totalTime'): number | null => {
      const t = cell(col);
      if (t === '' || /^(dnf|dns|dsq|nc|dnc|-+|–)$/i.test(t)) return null;
      const ms = parseLapTime(t.replace(/^\+/, ''));
      if (ms == null) {
        if (col === 'totalTime' && lapsDownOf(t) != null) return null;
        warnings.push(`${where}: ${CSV_COLUMN_LABEL[col]} „${t}“ nicht lesbar – bleibt leer.`);
      }
      return ms;
    };
    const num = (col: 'pitStops' | 'penalty' | 'grid' | 'laps'): number | null => {
      const v = intOrNull(cell(col));
      if (v === undefined) {
        warnings.push(`${where}: ${CSV_COLUMN_LABEL[col]} „${cell(col)}“ ist keine ganze Zahl – bleibt leer.`);
        return null;
      }
      return v;
    };
    const lapsDown = lapsDownOf(cell('totalTime'));
    rows.push({
      line: no,
      position,
      raceNumber: raceNumber != null && raceNumber > 0 ? raceNumber : null,
      name: cell('gamertag') || null,
      status,
      statusNote: null,
      gridPosition: race ? num('grid') : null,
      laps: race ? num('laps') : null,
      bestLapMs: time('bestLap'),
      totalTimeMs: race && status === 'classified' ? time('totalTime') : null,
      pitStops: race ? num('pitStops') : null,
      penaltyS: race ? (num('penalty') ?? 0) : 0,
      lapsDown: race && status === 'classified' ? lapsDown : null,
      ai: false,
      gameTeamId: null,
    });
  }

  const byPos = new Map<number, number>();
  for (const r of rows) {
    if (r.position == null) continue;
    const other = byPos.get(r.position);
    if (other != null) warnings.push(`Position ${r.position} kommt doppelt vor (Zeilen ${other} und ${r.line}) – Reihenfolge bitte prüfen.`);
    else byPos.set(r.position, r.line);
  }
  const sorted = rows
    .map((r, i) => ({ r, i }))
    .sort((a, b) => (a.r.position ?? 1000) - (b.r.position ?? 1000) || a.i - b.i)
    .map(({ r }) => r);
  if (sorted.length === 0 && errors.length === 0) errors.push('Keine Datenzeilen gefunden.');
  return { rows: sorted, errors, warnings, delimiter, hasHeader, columns };
}
