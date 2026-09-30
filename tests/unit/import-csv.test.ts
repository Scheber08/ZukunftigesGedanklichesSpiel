/**
 * CSV-Import (Plan §5.2): Trennzeichen, Kopfzeile, BOM, Status, Zeiten, Fehler und Hinweise.
 */
import { describe, expect, it } from 'vitest';
import { CSV_EXAMPLE, CSV_MAX_ROWS, detectDelimiter, parseCsv, parseStatusText, splitCsvLine } from '~/lib/import/csv';

const BOM = String.fromCharCode(0xfeff);

describe('Zellen und Trennzeichen', () => {
  it('erkennt ; , und Tab', () => {
    expect(detectDelimiter('1;4;Anna')).toBe(';');
    expect(detectDelimiter('1,4,Anna')).toBe(',');
    expect(detectDelimiter(`1${String.fromCharCode(9)}4`)).toBe('\t');
    // Komma in Anführungszeichen zählt nicht
    expect(detectDelimiter('"1,5";4')).toBe(';');
  });

  it('Anführungszeichen mit "" als Escape', () => {
    expect(splitCsvLine('1;"Anna ""Apex"" Müller";gewertet', ';')).toEqual(['1', 'Anna "Apex" Müller', 'gewertet']);
    expect(splitCsvLine('1,"1:23,456",x', ',')).toEqual(['1', '1:23,456', 'x']);
  });

  it('Status-Texte', () => {
    expect(parseStatusText('')).toBe('classified');
    expect(parseStatusText('Gewertet')).toBe('classified');
    expect(parseStatusText('DNF')).toBe('dnf');
    expect(parseStatusText('ausgefallen')).toBe('dnf');
    expect(parseStatusText('dns')).toBe('dns');
    expect(parseStatusText('DSQ')).toBe('dsq');
    expect(parseStatusText('NC')).toBe('dnc');
    expect(parseStatusText('nicht gewertet')).toBe('dnc');
    expect(parseStatusText('Retired')).toBe('dnf');
    expect(parseStatusText('abgeschleppt')).toBeNull();
  });
});

describe('parseCsv', () => {
  it('Beispiel mit Kopfzeile und ;', () => {
    const r = parseCsv(CSV_EXAMPLE, 'race');
    expect(r.errors).toEqual([]);
    expect(r).toMatchObject({ delimiter: ';', hasHeader: true });
    expect(r.rows).toHaveLength(3);
    expect(r.rows[0]).toMatchObject({ position: 1, raceNumber: 4, name: 'ApexAnna', status: 'classified', bestLapMs: 74_512, totalTimeMs: 1_930_456, pitStops: 1, penaltyS: 0 });
    expect(r.rows[1]).toMatchObject({ raceNumber: 77, penaltyS: 5 });
    expect(r.rows[2]).toMatchObject({ raceNumber: 16, status: 'dnf', totalTimeMs: null });
  });

  it('ohne Kopfzeile, Komma-Trennung, Excel-BOM und Windows-Zeilenenden', () => {
    const csv = `${BOM}2,77,Kerb,gewertet,1:14.803,32:14.120,1,0\r\n1,4,Anna,gewertet,1:14.512,32:10.456,2,0\r\n`;
    const r = parseCsv(csv, 'race');
    expect(r).toMatchObject({ delimiter: ',', hasHeader: false, errors: [] });
    // nach Position sortiert
    expect(r.rows.map((x) => x.raceNumber)).toEqual([4, 77]);
    expect(r.rows[0]).toMatchObject({ line: 2, pitStops: 2 });
  });

  it('7 Spalten ohne Kopfzeile: Gamertag-Spalte weggelassen', () => {
    const r = parseCsv('1;4;gewertet;1:14,512;32:10,456;1;0\n2;77;DNF;1:15,000;;0;0', 'race');
    expect(r.errors).toEqual([]);
    expect(r.rows[0]).toMatchObject({ raceNumber: 4, name: null, status: 'classified', bestLapMs: 74_512, totalTimeMs: 1_930_456 });
    expect(r.rows[1]).toMatchObject({ raceNumber: 77, status: 'dnf' });
  });

  it('Kopfzeile mit freier Reihenfolge, Startplatz und Runden; unbekannte Spalten werden ignoriert', () => {
    const csv = ['Nr;Fahrer;Pos;Startplatz;Runden;Zeit;Team', '#44;Sam;2;1;24;+1 Runde;McLaren', '4;Anna;1;3;25;32:10.456;Ferrari'].join('\n');
    const r = parseCsv(csv, 'race');
    expect(r.errors).toEqual([]);
    expect(r.warnings.join(' ')).toMatch(/„Team“ ist unbekannt/);
    expect(r.rows[0]).toMatchObject({ position: 1, raceNumber: 4, gridPosition: 3, laps: 25, totalTimeMs: 1_930_456 });
    expect(r.rows[1]).toMatchObject({ position: 2, raceNumber: 44, gridPosition: 1, laps: 24, totalTimeMs: null, lapsDown: 1 });
  });

  it('„+3.664“ in der Gesamtzeit ist ein Abstand zum Sieger, keine Renndauer', () => {
    const csv = ['1;4;Anna;;1:14.512;32:10.456;1;0', '2;77;Kerb;;1:14.803;+3.664;1;5', '3;16;Lukas;;1:15.0;+1:05,2;1;0', '4;55;Dani;;1:15.1;+x;1;0'].join('\n');
    const r = parseCsv(csv, 'race');
    expect(r.errors).toEqual([]);
    expect(r.rows[0]).toMatchObject({ totalTimeMs: 1_930_456, gapMs: null });
    expect(r.rows[1]).toMatchObject({ totalTimeMs: null, gapMs: 3_664, lapsDown: null });
    expect(r.rows[2]).toMatchObject({ totalTimeMs: null, gapMs: 65_200 });
    expect(r.rows[3]).toMatchObject({ totalTimeMs: null, gapMs: null });
    expect(r.warnings.join(' ')).toMatch(/Zeile 4: Abstand „\+x“ nicht lesbar/);
  });

  it('eigene Spalte „Abstand“ (mit Kopfzeile), auch ohne Pluszeichen und mit Rundenrückstand', () => {
    const csv = ['Pos;Nr;Status;Gesamtzeit;Abstand', '1;4;;32:10.456;', '2;77;;;3,664', '3;16;;;+2 Runden', '4;55;DNF;;+9.000'].join('\n');
    const r = parseCsv(csv, 'race');
    expect(r.errors).toEqual([]);
    expect(r.columns).toContain('gap');
    expect(r.rows[1]).toMatchObject({ gapMs: 3_664, totalTimeMs: null });
    expect(r.rows[2]).toMatchObject({ gapMs: null, lapsDown: 2 });
    // nicht gewertet: kein Abstand
    expect(r.rows[3]).toMatchObject({ status: 'dnf', gapMs: null });
  });

  it('Excel-Zeile „sep=;“ wird ausgewertet', () => {
    const r = parseCsv('sep=;\n1;4;Anna;;1:14.5;;;', 'race');
    expect(r.delimiter).toBe(';');
    expect(r.rows[0]).toMatchObject({ raceNumber: 4, status: 'classified', bestLapMs: 74_500 });
  });

  it('Qualifying: nur beste Runde, keine Renndaten', () => {
    const r = parseCsv('1;4;Anna;;1:14.512;32:10.456;1;5', 'qualifying');
    expect(r.rows[0]).toMatchObject({ bestLapMs: 74_512, totalTimeMs: null, pitStops: null, penaltyS: 0, gridPosition: null });
  });

  it('Fehler je Zeile: Position, Nummer, Status – andere Zeilen bleiben', () => {
    const csv = ['x;4;A;gewertet', '2;abc;B;gewertet', '3;7;C;abgeschleppt', '4;5;D;DNS'].join('\n');
    const r = parseCsv(csv, 'race');
    expect(r.errors).toHaveLength(3);
    expect(r.errors[0]).toMatch(/Zeile 1: Position/);
    expect(r.errors[1]).toMatch(/Zeile 2: Startnummer/);
    expect(r.errors[2]).toMatch(/Zeile 3: Status „abgeschleppt“/);
    expect(r.rows).toEqual([expect.objectContaining({ raceNumber: 5, status: 'dns' })]);
  });

  it('Hinweise: unlesbare Zeit, doppelte Position, zu viele Zeilen', () => {
    const csv = ['1;4;A;gewertet;schnell;;;', '1;5;B;gewertet;1:15.000;;;'].join('\n');
    const r = parseCsv(csv, 'race');
    expect(r.warnings.join(' ')).toMatch(/Beste Runde „schnell“ nicht lesbar/);
    expect(r.warnings.join(' ')).toMatch(/Position 1 kommt doppelt vor/);
    const many = Array.from({ length: CSV_MAX_ROWS + 5 }, (_, i) => `${i + 1};${(i % 99) + 1};;gewertet`).join('\n');
    expect(parseCsv(many, 'race').warnings.join(' ')).toMatch(/nur die ersten 60/);
  });

  it('Kopfzeile ohne Startnummer → Fehler', () => {
    const r = parseCsv('Position;Fahrer\n1;Anna', 'race');
    expect(r.rows).toEqual([]);
    expect(r.errors[0]).toMatch(/Startnummer/);
  });

  it('leer', () => {
    expect(parseCsv('   \n\n', 'race').errors).toEqual(['Keine Daten gefunden.']);
  });

  it('Zeilen ohne Position hinten in Datei-Reihenfolge', () => {
    const r = parseCsv('2;77;;gewertet\n;31;;DNF\n1;4;;gewertet\n;5;;DNS', 'race');
    expect(r.rows.map((x) => x.raceNumber)).toEqual([4, 77, 31, 5]);
  });
});
