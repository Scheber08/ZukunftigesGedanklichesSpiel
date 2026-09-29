/**
 * i18n-Parität (Plan §7.4): Jede Bereichsdatei gibt es in DE und EN mit exakt denselben
 * Schlüsseln, gleichen Platzhaltern und ohne leere Texte. Weil index.ts die Bereiche per
 * Spread zusammenführt, darf ein Schlüssel außerdem nur in EINER Bereichsdatei stehen –
 * sonst überschreibt eine Datei still die andere.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const LOCALES = join(process.cwd(), 'src', 'i18n', 'locales');
const LANGS = ['de', 'en'] as const;

function jsonFiles(lang: string): string[] {
  return readdirSync(join(LOCALES, lang))
    .filter((f) => f.endsWith('.json'))
    .sort();
}

function load(lang: string, file: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(LOCALES, lang, file), 'utf8')) as Record<string, unknown>;
}

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

const files = jsonFiles('de');

describe('i18n-Wörterbücher', () => {
  it('haben in DE und EN dieselben Bereichsdateien', () => {
    expect(jsonFiles('en')).toEqual(files);
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    describe(file, () => {
      const de = load('de', file);
      const en = load('en', file);

      it('ist ein flaches Objekt mit Text-Werten', () => {
        for (const [lang, dict] of [
          ['de', de],
          ['en', en],
        ] as const) {
          for (const [key, value] of Object.entries(dict)) {
            expect(typeof value, `${lang}/${file}: ${key}`).toBe('string');
          }
        }
      });

      it('hat in beiden Sprachen exakt dieselben Schlüssel', () => {
        const deKeys = Object.keys(de).sort();
        const enKeys = Object.keys(en).sort();
        const missingInEn = deKeys.filter((k) => !(k in en));
        const missingInDe = enKeys.filter((k) => !(k in de));
        expect({ missingInEn, missingInDe }).toEqual({ missingInEn: [], missingInDe: [] });
      });

      it('hat keine leeren Texte', () => {
        const empty = LANGS.flatMap((lang) =>
          Object.entries(lang === 'de' ? de : en)
            .filter(([, v]) => typeof v === 'string' && v.trim() === '')
            .map(([k]) => `${lang}:${k}`),
        );
        expect(empty).toEqual([]);
      });

      it('verwendet in beiden Sprachen dieselben Platzhalter', () => {
        const mismatched = Object.keys(de)
          .filter((k) => typeof de[k] === 'string' && typeof en[k] === 'string')
          .filter((k) => placeholders(de[k] as string).join(',') !== placeholders(en[k] as string).join(','))
          .map((k) => `${k}: de{${placeholders(de[k] as string).join(',')}} en{${placeholders(en[k] as string).join(',')}}`);
        expect(mismatched).toEqual([]);
      });

      it('nutzt flache Punkt-Schlüssel', () => {
        const bad = Object.keys(de).filter((k) => !/^[a-z][A-Za-z0-9]*(\.[A-Za-z0-9_-]+)+$/.test(k));
        expect(bad).toEqual([]);
      });
    });
  }

  it('hat jeden Schlüssel nur in einer Bereichsdatei (sonst überschreibt der Spread in index.ts)', () => {
    for (const lang of LANGS) {
      const owner = new Map<string, string>();
      const duplicates: string[] = [];
      for (const file of files) {
        for (const key of Object.keys(load(lang, file))) {
          const first = owner.get(key);
          if (first) duplicates.push(`${lang}: „${key}“ in ${first} und ${file}`);
          else owner.set(key, file);
        }
      }
      expect(duplicates).toEqual([]);
    }
  });

  it('bindet alle Bereichsdateien in src/i18n/index.ts ein', () => {
    const index = readFileSync(join(process.cwd(), 'src', 'i18n', 'index.ts'), 'utf8');
    const missing = LANGS.flatMap((lang) =>
      files.filter((f) => !index.includes(`./locales/${lang}/${f}`)).map((f) => `${lang}/${f}`),
    );
    expect(missing).toEqual([]);
  });
});
