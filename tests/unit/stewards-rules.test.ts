import { describe, expect, it } from 'vitest';
import { findSection, procedureHref, procedureSection, sectionForRef, type SectionLike } from '~/components/stewards/rules';
import { plainExcerpt } from '~/components/stewards/utils';

const sections: SectionLike[] = [
  { id: 1, parent_id: null, number: '§3', anchor: 'p3', title_de: 'Fahrverhalten' },
  { id: 2, parent_id: 1, number: '§3.4', anchor: 'p3-4', title_de: 'Track Limits' },
  { id: 3, parent_id: null, number: '§7', anchor: 'p7', title_de: 'Vorfälle & Proteste' },
  { id: 4, parent_id: 3, number: '§7.2', anchor: 'p7-2', title_de: 'Frist' },
  { id: 5, parent_id: 3, number: '§7.3', anchor: 'p7-3', title_de: 'Beweise' },
  { id: 6, parent_id: 3, number: '§7.8', anchor: 'p7-8', title_de: 'Einspruchsfrist' },
  { id: 7, parent_id: null, number: '§ 9', anchor: 'katalog', title_de: 'Strafenkatalog' },
];

describe('Regel-Referenzen', () => {
  it('findet Abschnitte über die Nummer, auch mit Leerzeichen nach §', () => {
    expect(sectionForRef('§3.4', sections)?.anchor).toBe('p3-4');
    expect(sectionForRef('3.4', sections)?.anchor).toBe('p3-4');
    expect(sectionForRef('§9', sections)?.anchor).toBe('katalog');
  });

  it('liefert nichts für unbekannte oder leere Referenzen', () => {
    expect(sectionForRef('§12.1', sections)).toBeUndefined();
    expect(sectionForRef('', sections)).toBeUndefined();
    expect(sectionForRef(null, sections)).toBeUndefined();
  });

  it('findet Abschnitte über den Titel, sonst über den Standard-Anker', () => {
    expect(findSection(sections, /strafenkatalog/i, 'p8')?.number).toBe('§ 9');
    expect(findSection(sections, /gibt es nicht/i, 'p7-3')?.anchor).toBe('p7-3');
    expect(findSection(sections, /gibt es nicht/i, 'p99')).toBeUndefined();
  });

  it('sucht auf Wunsch nur unter einem Elternabschnitt und nimmt den ersten Treffer', () => {
    expect(findSection(sections, /frist/i, 'p7-2', 3)?.anchor).toBe('p7-2');
    expect(findSection(sections, /vorf(?:ä|ae)lle/i, 'p7', null)?.anchor).toBe('p7');
    expect(findSection(sections, /track/i, 'x', 3)).toBeUndefined();
  });
});

describe('Link zum Verfahren (Vorfall melden)', () => {
  it('findet den Hauptabschnitt „Vorfälle & Proteste“ über den Titel', () => {
    expect(procedureSection(sections)?.anchor).toBe('p7');
    const renamed = sections.map((s) => (s.id === 3 ? { ...s, number: '§6', anchor: 'p6' } : s));
    expect(procedureHref('de', renamed)).toBe('/liga/regelwerk#p6');
  });

  it('führt ohne passenden Abschnitt aufs Regelwerk ohne Sprungmarke', () => {
    expect(procedureHref('de', [])).toBe('/liga/regelwerk');
    expect(procedureHref('en', sections)).toBe('/en/league/rules#p7');
  });
});

describe('Kurzbegründung als Klartext', () => {
  it('erhält Gamertags, Bindestriche und Nummern', () => {
    const src = 'Oversteer_Olli traf GravelTrap_Gustav. Hauptschuld bei Car #10 (Strafenkatalog V-02).';
    expect(plainExcerpt(src)).toBe(src);
  });

  it('entfernt Markdown-Auszeichnung', () => {
    expect(plainExcerpt('## Titel\n\n**fett** und *kursiv* und _betont_ mit `Code` und [Link](https://x.example)')).toBe(
      'Titel fett und kursiv und betont mit Code und Link',
    );
    expect(plainExcerpt('> Zitat\n- Punkt eins\n- Punkt zwei\n\n---\n\n1. Nummer')).toBe('Zitat Punkt eins Punkt zwei Nummer');
    expect(plainExcerpt('| A | B |\n|---|---|\n| 1 | 2 |')).toBe('A B 1 2');
  });

  it('kürzt mit Auslassungszeichen', () => {
    const out = plainExcerpt('a'.repeat(50), 20);
    expect(out).toHaveLength(20);
    expect(out.endsWith('…')).toBe(true);
    expect(plainExcerpt(null)).toBe('');
  });
});
