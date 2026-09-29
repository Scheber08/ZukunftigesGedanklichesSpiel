/**
 * Dashboard-Logik (Plan §5 „Dashboard“): fehlende Übersetzungen und Protestfristen.
 * Reine Funktionen – die Seite lädt die Zeilen gezielt aus dem Store.
 */
import type {
  FaqItemRow,
  NewsRow,
  OpenPositionRow,
  PartnerRow,
  RoundRow,
  RulesSectionRow,
  RulesVersionRow,
  StaffMemberRow,
} from '~/lib/db/types';

const blank = (v: string | null | undefined) => v == null || v.trim() === '';

export interface MissingTranslation {
  kind: 'news' | 'faq' | 'rules' | 'positions' | 'partners' | 'staff';
  label: string;
  count: number;
  href: string;
  /** Beispiele (Titel), höchstens drei */
  examples: string[];
}

export interface TranslationInput {
  news: ReadonlyArray<Pick<NewsRow, 'title_de' | 'title_en' | 'excerpt_de' | 'excerpt_en' | 'body_de' | 'body_en' | 'status'>>;
  faq: ReadonlyArray<Pick<FaqItemRow, 'question_de' | 'question_en' | 'answer_de' | 'answer_en'>>;
  rulesVersions: ReadonlyArray<Pick<RulesVersionRow, 'id' | 'status'>>;
  rulesSections: ReadonlyArray<Pick<RulesSectionRow, 'version_id' | 'number' | 'title_de' | 'title_en' | 'body_de' | 'body_en'>>;
  positions: ReadonlyArray<Pick<OpenPositionRow, 'title_de' | 'title_en' | 'description_de' | 'description_en' | 'active'>>;
  partners: ReadonlyArray<Pick<PartnerRow, 'name' | 'text_de' | 'text_en' | 'active'>>;
  staff: ReadonlyArray<Pick<StaffMemberRow, 'gamertag' | 'role_de' | 'role_en'>>;
}

/** Inhalte ohne englische Fassung (fehlt EN, zeigt die Website DE mit Hinweis, Plan §7.4). */
export function missingTranslations(input: TranslationInput): MissingTranslation[] {
  const out: MissingTranslation[] = [];
  const push = (kind: MissingTranslation['kind'], label: string, href: string, titles: string[]) => {
    if (titles.length > 0) out.push({ kind, label, href, count: titles.length, examples: titles.slice(0, 3) });
  };

  push(
    'news',
    'News',
    '/admin/news',
    input.news
      .filter((n) => n.status !== 'draft')
      .filter((n) => blank(n.title_en) || (!blank(n.body_de) && blank(n.body_en)) || (!blank(n.excerpt_de) && blank(n.excerpt_en)))
      .map((n) => n.title_de),
  );
  push(
    'faq',
    'FAQ',
    '/admin/inhalte',
    input.faq.filter((f) => blank(f.question_en) || blank(f.answer_en)).map((f) => f.question_de),
  );
  // Regelwerk: nur aktuelle Versionen (Entwurf und veröffentlicht, nicht archiviert)
  const current = new Set(input.rulesVersions.filter((v) => v.status !== 'archived').map((v) => v.id));
  push(
    'rules',
    'Regelwerk-Abschnitte',
    '/admin/regelwerk',
    input.rulesSections
      .filter((s) => current.has(s.version_id))
      .filter((s) => blank(s.title_en) || (!blank(s.body_de) && blank(s.body_en)))
      .map((s) => `${s.number} ${s.title_de}`),
  );
  push(
    'positions',
    'Offene Rollen',
    '/admin/inhalte',
    input.positions.filter((p) => p.active && (blank(p.title_en) || blank(p.description_en))).map((p) => p.title_de),
  );
  push(
    'partners',
    'Partner',
    '/admin/inhalte',
    input.partners.filter((p) => p.active && !blank(p.text_de) && blank(p.text_en)).map((p) => p.name),
  );
  push(
    'staff',
    'Orga-Team',
    '/admin/inhalte',
    input.staff.filter((s) => blank(s.role_en)).map((s) => `${s.gamertag} (${s.role_de})`),
  );
  return out;
}

export interface ProtestInfo {
  round: RoundRow;
  /** Stunden bis Fristende (negativ = abgelaufen) */
  hoursLeft: number | null;
  state: 'open' | 'expired' | 'unknown';
}

/** Vorläufige Runden mit Protestfrist, die dringendsten zuerst. */
export function protestDeadlines(rounds: readonly RoundRow[], now: Date): ProtestInfo[] {
  return rounds
    .filter((r) => r.status === 'provisional')
    .map((round): ProtestInfo => {
      if (!round.protest_deadline) return { round, hoursLeft: null, state: 'unknown' };
      const hoursLeft = (new Date(round.protest_deadline).getTime() - now.getTime()) / 3_600_000;
      return { round, hoursLeft, state: hoursLeft > 0 ? 'open' : 'expired' };
    })
    .sort((a, b) => (a.hoursLeft ?? Infinity) - (b.hoursLeft ?? Infinity));
}

/** „noch 5 Std.“, „noch 2 Tage“, „seit 3 Std. abgelaufen“ */
export function formatHoursLeft(hours: number): string {
  const abs = Math.abs(hours);
  const future = hours >= 0;
  const span =
    abs < 1
      ? `${Math.max(1, Math.round(abs * 60))} Min.`
      : abs < 48
        ? `${Math.round(abs)} Std.`
        : `${Math.round(abs / 24)} ${future ? 'Tage' : 'Tagen'}`;
  return future ? `noch ${span}` : `seit ${span} abgelaufen`;
}
