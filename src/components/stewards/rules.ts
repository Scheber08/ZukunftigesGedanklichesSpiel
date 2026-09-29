/**
 * Verweise ins Regelwerk für Register und Entscheidungen (Plan §4.6): Strafenkatalog,
 * Verfahren (§7) und die Regel einer Entscheidung. Abschnitte werden über ihre Nummer bzw.
 * ihren Titel gefunden, sonst über den Standard-Anker. Gibt es einen Abschnitt nicht,
 * führt der Link ohne Sprungmarke aufs Regelwerk – nie ins Leere.
 */
import { url, type Lang } from '~/i18n';
import type { RulesSectionRow, RulesVersionRow, SeasonRow } from '~/lib/db/types';
import type { League } from '~/lib/league/league';
import { ruleAnchor } from './utils';

export type SectionLike = Pick<RulesSectionRow, 'id' | 'parent_id' | 'number' | 'anchor' | 'title_de'>;

/** „§ 3.4“ → „3.4“ */
function bareNumber(n: string): string {
  return n.replace(/^§\s*/, '').trim();
}

/** Abschnitt zu einer Regel-Referenz wie „§3.4“ (über die Nummer, sonst über den Anker). */
export function sectionForRef<T extends SectionLike>(ref: string | null | undefined, sections: readonly T[]): T | undefined {
  const anchor = ruleAnchor(ref);
  if (!anchor) return undefined;
  const digits = anchor.slice(1).replace(/-/g, '.');
  return sections.find((s) => bareNumber(s.number) === digits) ?? sections.find((s) => s.anchor === anchor);
}

/**
 * Abschnitt über den deutschen Titel finden (optional nur direkt unter einem Elternabschnitt),
 * sonst über den Standard-Anker. Die Liste muss in Dokument-Reihenfolge sortiert sein.
 */
export function findSection<T extends SectionLike>(
  sections: readonly T[],
  pattern: RegExp,
  fallbackAnchor: string,
  parentId?: number | null,
): T | undefined {
  const pool = parentId === undefined ? sections : sections.filter((s) => s.parent_id === parentId);
  return pool.find((s) => pattern.test(s.title_de)) ?? sections.find((s) => s.anchor === fallbackAnchor);
}

export interface RuleLink {
  href: string;
  /** Paragraph wie „§8“; null, wenn der Abschnitt nicht gefunden wurde */
  number: string | null;
}

/** Fassung einer Saison (falls veröffentlicht oder archiviert), sonst die gültige Fassung. */
export function rulesVersionFor(league: League, season?: Pick<SeasonRow, 'rules_version_id'>): RulesVersionRow | undefined {
  const own = season?.rules_version_id != null ? league.rulesVersions.find((v) => v.id === season.rules_version_id) : undefined;
  return own ?? league.rulesVersion;
}

function sectionsOf(league: League, version: RulesVersionRow | undefined): RulesSectionRow[] {
  if (!version) return [];
  return league.data.rules_sections.filter((s) => s.version_id === version.id).sort((a, b) => a.sort - b.sort);
}

/** Gültige Fassung unter /liga/regelwerk, ältere unter /liga/regelwerk/v/<version>. */
function baseHref(league: League, lang: Lang, version: RulesVersionRow | undefined): string {
  if (!version || version.id === league.rulesVersion?.id) return url(lang, 'rules');
  return url(lang, 'rulesVersion', { version: version.version });
}

function link(base: string, section: SectionLike | undefined): RuleLink {
  return section ? { href: `${base}#${section.anchor}`, number: section.number } : { href: base, number: null };
}

/** Strafenkatalog der gültigen Fassung (Plan §4.6). */
export function catalogueLink(league: League, lang: Lang): RuleLink {
  const version = league.rulesVersion;
  const sections = sectionsOf(league, version);
  return link(baseHref(league, lang, version), findSection(sections, /strafenkatalog/i, 'p8'));
}

export type ProcedureKey = 'deadline' | 'evidence' | 'conflict' | 'publication';

/** Verfahren (§7 „Vorfälle & Proteste“) und seine Unterabschnitte in der gültigen Fassung. */
export function procedureLinks(league: League, lang: Lang): { root: RuleLink; items: Record<ProcedureKey, RuleLink> } {
  const version = league.rulesVersion;
  const sections = sectionsOf(league, version);
  const base = baseHref(league, lang, version);
  const root = findSection(sections, /vorf(?:ä|ae)lle|protest/i, 'p7', null);
  const child = (pattern: RegExp, fallback: string) => link(base, root ? findSection(sections, pattern, fallback, root.id) : undefined);
  return {
    root: link(base, root),
    items: {
      deadline: child(/frist/i, 'p7-2'),
      evidence: child(/beweis|video|clip/i, 'p7-3'),
      conflict: child(/befangen/i, 'p7-5'),
      publication: child(/veröffentlich/i, 'p7-7'),
    },
  };
}

/** Link zur Regel einer Entscheidung – in der Fassung, die in ihrer Saison galt. */
export function decisionRuleLink(
  league: League,
  lang: Lang,
  season: Pick<SeasonRow, 'rules_version_id'>,
  ref: string | null | undefined,
): RuleLink | null {
  if (!ref || ref.trim() === '') return null;
  const version = rulesVersionFor(league, season);
  return link(baseHref(league, lang, version), sectionForRef(ref, sectionsOf(league, version)));
}
