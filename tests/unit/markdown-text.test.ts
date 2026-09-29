import { describe, expect, it } from 'vitest';
import { markdownToText } from '~/lib/util/markdown';

describe('markdownToText', () => {
  it('lässt Zeichen innerhalb von Wörtern stehen', () => {
    expect(markdownToText('Oversteer_Olli traf V-02 in Kurve #10.')).toBe('Oversteer_Olli traf V-02 in Kurve #10.');
    expect(markdownToText('Race-Control und Box-Box-Bruno')).toBe('Race-Control und Box-Box-Bruno');
  });

  it('entfernt Markdown-Syntax', () => {
    expect(markdownToText('## Titel\n\nDas ist **fett** und _kursiv_ und *auch*.')).toBe('Titel Das ist fett und kursiv und auch.');
    expect(markdownToText('- eins\n- zwei\n1. drei')).toBe('eins zwei drei');
    expect(markdownToText('> Zitat\n\n---\n\nText')).toBe('Zitat Text');
    expect(markdownToText('Mehr im [Regelwerk](/liga/regelwerk#p3) und ![Bild](x.webp)')).toBe('Mehr im Regelwerk und Bild');
    expect(markdownToText('`code` und ~~weg~~')).toBe('code und weg');
  });

  it('macht Tabellen lesbar', () => {
    const table = '| Code | Vergehen |\n| --- | --- |\n| V-01 | Kollision |';
    expect(markdownToText(table)).toBe('Code Vergehen V-01 Kollision');
  });

  it('kürzt mit Auslassungszeichen', () => {
    const long = 'Wort '.repeat(100);
    const out = markdownToText(long, 20);
    expect(out.length).toBeLessThanOrEqual(20);
    expect(out.endsWith('…')).toBe(true);
  });
});
