/**
 * Zeilentypen der Datenbank – 1:1 zu supabase/migrations/*_init.sql.
 * IDs sind bigint in Postgres und hier `number` (weit unter 2^53).
 * Zeitpunkte sind ISO-Strings (timestamptz), `local_start` ist eine Ortszeit ohne Zone.
 */

export type Id = number;
export type IsoDateTime = string;
export type IsoDate = string;

interface Timestamps {
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
}

// ---------------------------------------------------------------------------
// Aufzählungen
// ---------------------------------------------------------------------------

export const SEASON_STATUSES = ['planned', 'active', 'finished'] as const;
export type SeasonStatus = (typeof SEASON_STATUSES)[number];

export const ROUND_FORMATS = ['standard', 'sprint'] as const;
export type RoundFormat = (typeof ROUND_FORMATS)[number];

export const ROUND_STATUSES = ['scheduled', 'lineup_published', 'provisional', 'final', 'corrected', 'cancelled'] as const;
export type RoundStatus = (typeof ROUND_STATUSES)[number];
/** Runden, deren Ergebnisse öffentlich sind und in die Wertung zählen. */
export const RESULT_VISIBLE_STATUSES: readonly RoundStatus[] = ['provisional', 'final', 'corrected'];

export const SESSION_TYPES = ['qualifying', 'sprint', 'race'] as const;
export type SessionType = (typeof SESSION_TYPES)[number];

export const PLATFORMS = ['pc_steam', 'pc_ea', 'playstation', 'xbox'] as const;
export type Platform = (typeof PLATFORMS)[number];

export const INPUT_DEVICES = ['wheel', 'controller'] as const;
export type InputDevice = (typeof INPUT_DEVICES)[number];

export const DRIVER_STATUSES = ['active', 'reserve', 'inactive', 'banned'] as const;
export type DriverStatus = (typeof DRIVER_STATUSES)[number];

export const ENTRY_ROLES = ['regular', 'reserve'] as const;
export type EntryRole = (typeof ENTRY_ROLES)[number];

export const RESULT_STATUSES = ['classified', 'dnf', 'dns', 'dsq', 'dnc'] as const;
export type ResultStatus = (typeof RESULT_STATUSES)[number];

export const AWARD_TYPES = ['champion', 'constructors', 'driver_of_the_day', 'rookie_of_the_year'] as const;
export type AwardType = (typeof AWARD_TYPES)[number];

export const INCIDENT_STATUSES = ['new', 'in_review', 'decided', 'rejected', 'late'] as const;
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];

export const VERDICTS = [
  'no_action',
  'warning',
  'time_penalty',
  'position_penalty',
  'grid_penalty_next',
  'dsq',
  'race_ban',
] as const;
export type Verdict = (typeof VERDICTS)[number];

export const DECISION_STATUSES = ['draft', 'published', 'revoked'] as const;
export type DecisionStatus = (typeof DECISION_STATUSES)[number];

export const NEWS_CATEGORIES = ['race_report', 'announcement', 'rule_change', 'new_drivers', 'community'] as const;
export type NewsCategory = (typeof NEWS_CATEGORIES)[number];

export const NEWS_STATUSES = ['draft', 'scheduled', 'published'] as const;
export type NewsStatus = (typeof NEWS_STATUSES)[number];

export const RULES_STATUSES = ['draft', 'published', 'archived'] as const;
export type RulesStatus = (typeof RULES_STATUSES)[number];

export const FAQ_CATEGORIES = ['general', 'requirements', 'raceday', 'technical', 'stewards'] as const;
export type FaqCategory = (typeof FAQ_CATEGORIES)[number];

export const WANTED_ROLES = ['regular', 'reserve', 'any'] as const;
export type WantedRole = (typeof WANTED_ROLES)[number];

export const AVAILABILITIES = ['regular', 'mostly', 'irregular'] as const;
export type Availability = (typeof AVAILABILITIES)[number];

export const REGISTRATION_STATUSES = ['new', 'contacted', 'accepted', 'waitlist', 'rejected'] as const;
export type RegistrationStatus = (typeof REGISTRATION_STATUSES)[number];

export const STAFF_ROLES = ['admin', 'steward', 'redakteur'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

// ---------------------------------------------------------------------------
// §6.1 Liga-Struktur
// ---------------------------------------------------------------------------

export interface RulesVersionRow extends Timestamps {
  id: Id;
  version: string;
  effective_from: IsoDate | null;
  changelog_de: string;
  changelog_en: string | null;
  status: RulesStatus;
  published_at: IsoDateTime | null;
}

export interface RulesSectionRow extends Timestamps {
  id: Id;
  version_id: Id;
  parent_id: Id | null;
  number: string;
  anchor: string;
  title_de: string;
  title_en: string | null;
  body_de: string;
  body_en: string | null;
  sort: number;
}

export interface PointsSchemeRow extends Timestamps {
  id: Id;
  name: string;
  race_points: number[];
  sprint_points: number[];
  fastest_lap_bonus: number;
  fastest_lap_max_pos: number | null;
  pole_bonus: number;
}

/** Lobby-Einstellungen: Gruppen mit Einträgen, frei pflegbar (Plan §2.1). */
export interface LobbySettings {
  groups?: Array<{
    key: string;
    title_de: string;
    title_en?: string | null;
    items: Array<{ label_de: string; label_en?: string | null; value_de: string; value_en?: string | null }>;
  }>;
  join_steps_de?: string[];
  join_steps_en?: string[];
}

/** Strafpunkte-System je Saison (Plan Phase 2); leere Felder = Standardwerte */
/** Renntag-Fristen je Saison (Plan §11.1). Fehlende Werte = Standard 24 h / 2 h / 72 h. */
export interface RacedayDeadlines {
  /** Aufstellung steht so viele Stunden vor dem Start */
  lineup_hours_before?: number | null;
  /** Ergebnis ist so viele Stunden nach dem Start eingetragen */
  results_hours_after?: number | null;
  /** Stewards entscheiden so viele Stunden nach Ende der Protestfrist */
  decisions_hours_after_protest?: number | null;
}

export interface PenaltyPointsConfig {
  /** Hinweis ab dieser Summe */
  warning_threshold?: number | null;
  /** Rennsperre ab dieser Summe */
  ban_threshold?: number | null;
  /** Punkte verfallen nach so vielen gewerteten Runden (null = gelten die ganze Saison) */
  expiry_rounds?: number | null;
}

export interface SeasonRow extends Timestamps {
  id: Id;
  number: number;
  slug: string;
  name: string;
  game_version: string;
  status: SeasonStatus;
  points_scheme_id: Id;
  reserve_points_for_constructors: boolean;
  protest_window_hours: number;
  two_steward_rule: boolean;
  penalty_points_enabled: boolean;
  penalty_points_config: PenaltyPointsConfig;
  /** Renntag-Fristen (Plan §11.1); fehlende Werte = Standard */
  raceday_deadlines: RacedayDeadlines;
  lobby_settings: LobbySettings;
  rules_version_id: Id | null;
  starts_on: IsoDate | null;
  ends_on: IsoDate | null;
}

export interface TrackRow extends Timestamps {
  id: Id;
  slug: string;
  name_de: string;
  name_en: string;
  country_code: string;
  game_track_id: number | null;
  length_km: number | null;
  laps_default: number | null;
  /** Streckenkarte als SVG-Umriss (Plan §7.5) */
  map_url: string | null;
  map_credit: string | null;
}

export interface RoundRow extends Timestamps {
  id: Id;
  season_id: Id;
  number: number;
  track_id: Id;
  /** Ortszeit ohne Zone, z. B. "2026-11-05T20:00:00" */
  local_start: string;
  timezone: string;
  start_utc: IsoDateTime;
  format: RoundFormat;
  status: RoundStatus;
  provisional_at: IsoDateTime | null;
  protest_deadline: IsoDateTime | null;
  final_at: IsoDateTime | null;
  vod_url: string | null;
  highlights_url: string | null;
}

export interface RoundCorrectionRow extends Timestamps {
  id: Id;
  round_id: Id;
  reason_de: string;
  reason_en: string | null;
  created_by: string | null;
}

export interface SessionRow extends Timestamps {
  id: Id;
  round_id: Id;
  type: SessionType;
  weather: string | null;
  status: 'pending' | 'entered';
}

export interface TeamRow extends Timestamps {
  id: Id;
  slug: string;
  name: string;
  short_name: string;
  color_hex: string;
  text_color_hex: string;
  game_team_id: number | null;
  active: boolean;
}

export interface SeasonTeamRow extends Timestamps {
  season_id: Id;
  team_id: Id;
  sort_order: number;
}

// ---------------------------------------------------------------------------
// §6.2 Fahrer, Nummern, Cockpits
// ---------------------------------------------------------------------------

export interface DriverRow extends Timestamps {
  id: Id;
  slug: string;
  gamertag: string;
  nationality_code: string | null;
  platform: Platform;
  input_device: InputDevice;
  status: DriverStatus;
  reserve_order: number | null;
  joined_season_id: Id | null;
  twitch_url: string | null;
  youtube_url: string | null;
  show_links: boolean;
  anonymized: boolean;
  /** 16–17 Jahre: öffentlich nur Gamertag (Plan §9.3); nie in drivers_public */
  is_minor: boolean;
}

export interface DriverPrivateRow extends Timestamps {
  driver_id: Id;
  discord_user_id: string | null;
  discord_username: string | null;
  ea_id: string | null;
  notes: string | null;
}

export interface DriverNumberRow extends Timestamps {
  id: Id;
  driver_id: Id;
  number: number;
  valid_from: IsoDateTime;
  valid_to: IsoDateTime | null;
  note: string | null;
}

export interface SeatRow extends Timestamps {
  id: Id;
  season_id: Id;
  team_id: Id;
  seat_no: 1 | 2;
  driver_id: Id;
  from_round: number;
  to_round: number | null;
}

export interface RoundEntryRow extends Timestamps {
  id: Id;
  round_id: Id;
  team_id: Id;
  seat_no: 1 | 2;
  driver_id: Id;
  role: EntryRole;
  replaces_driver_id: Id | null;
  race_number: number | null;
}

export interface RoundAbsenceRow extends Timestamps {
  round_id: Id;
  driver_id: Id;
  reported_in_time: boolean;
  note: string | null;
}

// ---------------------------------------------------------------------------
// §6.3 Ergebnisse und Wertung
// ---------------------------------------------------------------------------

export interface ResultRow extends Timestamps {
  id: Id;
  session_id: Id;
  round_entry_id: Id | null;
  driver_id: Id;
  team_id: Id;
  race_number: number | null;
  role: EntryRole;
  entered_position: number;
  position: number | null;
  status: ResultStatus;
  /** Eingegebener Status vor Steward-Strafen (DSQ-Rücknahme stellt ihn wieder her) */
  entered_status: ResultStatus | null;
  grid_position: number | null;
  laps: number | null;
  total_time_ms: number | null;
  gap_ms: number | null;
  gap_laps: number | null;
  best_lap_ms: number | null;
  pit_stops: number | null;
  ingame_penalty_s: number;
  steward_penalty_s: number;
  is_fastest_lap: boolean;
  is_pole: boolean;
  points: number;
  counts_for_constructors: boolean;
}

export interface StandingsSnapshotRow extends Timestamps {
  id: Id;
  season_id: Id;
  after_round_id: Id;
  kind: 'driver' | 'team';
  entity_id: Id;
  position: number;
  points: number;
  wins: number;
  podiums: number;
  poles: number;
  fastest_laps: number;
}

export interface AwardRow extends Timestamps {
  id: Id;
  season_id: Id;
  round_id: Id | null;
  type: AwardType;
  driver_id: Id | null;
  team_id: Id | null;
}

// ---------------------------------------------------------------------------
// §6.4 Stewards
// ---------------------------------------------------------------------------

export interface IncidentRow extends Timestamps {
  id: Id;
  round_id: Id;
  session_id: Id | null;
  reporter_driver_id: Id | null;
  reporter_contact: string | null;
  involved_driver_ids: Id[];
  lap: number | null;
  corner: string | null;
  description: string;
  clip_url: string | null;
  clip_timestamp: string | null;
  submitted_at: IsoDateTime;
  ip_hash: string | null;
  source: 'report' | 'steward';
  status: IncidentStatus;
}

export interface DecisionRow extends Timestamps {
  id: Id;
  public_ref: string;
  incident_id: Id | null;
  round_id: Id;
  session_id: Id | null;
  driver_id: Id;
  verdict: Verdict;
  time_seconds: number | null;
  positions: number | null;
  penalty_points: number | null;
  reasoning_de: string;
  reasoning_en: string | null;
  rule_ref: string | null;
  clip_url: string | null;
  decided_by: string[];
  status: DecisionStatus;
  published_at: IsoDateTime | null;
}

// ---------------------------------------------------------------------------
// §6.5 Inhalte
// ---------------------------------------------------------------------------

export interface NewsRow extends Timestamps {
  id: Id;
  slug_de: string;
  slug_en: string;
  title_de: string;
  title_en: string | null;
  excerpt_de: string;
  excerpt_en: string | null;
  body_de: string;
  body_en: string | null;
  cover_image: string | null;
  cover_alt_de: string | null;
  cover_alt_en: string | null;
  /** Eigenes Vorschaubild 1200×630 (sonst Titelbild bzw. Liga-Standard) */
  og_image: string | null;
  category: NewsCategory;
  round_id: Id | null;
  author_id: string | null;
  author_name: string | null;
  status: NewsStatus;
  publish_at: IsoDateTime | null;
  /** Beim (geplanten) Veröffentlichen in Discord posten */
  discord_post: boolean;
}

export interface FaqItemRow extends Timestamps {
  id: Id;
  category: FaqCategory;
  question_de: string;
  question_en: string | null;
  answer_de: string;
  answer_en: string | null;
  sort: number;
}

export interface StaffMemberRow extends Timestamps {
  id: Id;
  gamertag: string;
  role_de: string;
  role_en: string | null;
  avatar: string | null;
  since_season: number | null;
  sort: number;
}

export interface OpenPositionRow extends Timestamps {
  id: Id;
  title_de: string;
  title_en: string | null;
  description_de: string;
  description_en: string | null;
  effort: string | null;
  effort_en: string | null;
  active: boolean;
  sort: number;
}

export interface PartnerRow extends Timestamps {
  id: Id;
  name: string;
  logo: string | null;
  url: string;
  text_de: string;
  text_en: string | null;
  label_ad: boolean;
  active: boolean;
  sort: number;
}

export interface SettingRow extends Timestamps {
  key: string;
  value: unknown;
  is_public: boolean;
}

// ---------------------------------------------------------------------------
// §6.6 Anmeldung, Admin, Protokoll
// ---------------------------------------------------------------------------

export interface RegistrationConsents {
  age16: boolean;
  rules: boolean;
  at: IsoDateTime;
  rules_version: string | null;
}

export interface RegistrationRow extends Timestamps {
  id: Id;
  gamertag: string;
  discord_username: string;
  ea_id: string | null;
  platform: Platform;
  input_device: InputDevice;
  nationality: string | null;
  desired_number: number;
  wanted_role: WantedRole;
  availability: Availability;
  experience: string | null;
  reference_time: string | null;
  consents: RegistrationConsents;
  status: RegistrationStatus;
  admin_notes: string | null;
  ip_hash: string | null;
  driver_id: Id | null;
  processed_by: string | null;
  processed_at: IsoDateTime | null;
}

export interface ContactMessageRow extends Timestamps {
  id: Id;
  name: string;
  email: string;
  subject: string;
  message: string;
  status: 'new' | 'done';
  ip_hash: string | null;
}

export interface StaffAccountRow extends Timestamps {
  user_id: string;
  discord_user_id: string;
  display_name: string;
  avatar_url: string | null;
  roles: StaffRole[];
  driver_id: Id | null;
  roles_checked_at: IsoDateTime | null;
}

export interface AuditLogRow extends Timestamps {
  id: Id;
  actor_id: string | null;
  actor_name: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  diff: unknown;
  at: IsoDateTime;
}

export interface RateLimitEventRow extends Timestamps {
  id: Id;
  bucket: string;
  ip_hash: string;
}

/** 301-Weiterleitung bei Umbenennungen (Plan §2.2) */
export interface SlugRedirectRow extends Timestamps {
  id: Id;
  entity: 'driver' | 'team' | 'season' | 'news';
  old_slug: string;
  new_slug: string;
  lang: 'de' | 'en' | null;
}

export interface ImportBatchRow extends Timestamps {
  id: Id;
  session_id: Id;
  source: 'udp' | 'csv';
  raw: unknown;
  mapping: unknown;
  status: 'draft' | 'applied' | 'discarded';
  uploaded_by: string | null;
}

// ---------------------------------------------------------------------------
// Tabellen-Registry
// ---------------------------------------------------------------------------

export interface Tables {
  rules_versions: RulesVersionRow;
  rules_sections: RulesSectionRow;
  points_schemes: PointsSchemeRow;
  seasons: SeasonRow;
  tracks: TrackRow;
  rounds: RoundRow;
  round_corrections: RoundCorrectionRow;
  sessions: SessionRow;
  teams: TeamRow;
  season_teams: SeasonTeamRow;
  drivers: DriverRow;
  driver_private: DriverPrivateRow;
  driver_numbers: DriverNumberRow;
  seats: SeatRow;
  round_entries: RoundEntryRow;
  round_absences: RoundAbsenceRow;
  results: ResultRow;
  standings_snapshots: StandingsSnapshotRow;
  awards: AwardRow;
  incidents: IncidentRow;
  decisions: DecisionRow;
  news: NewsRow;
  faq_items: FaqItemRow;
  staff_members: StaffMemberRow;
  open_positions: OpenPositionRow;
  partners: PartnerRow;
  settings: SettingRow;
  registrations: RegistrationRow;
  contact_messages: ContactMessageRow;
  staff_accounts: StaffAccountRow;
  audit_log: AuditLogRow;
  rate_limit_events: RateLimitEventRow;
  import_batches: ImportBatchRow;
  slug_redirects: SlugRedirectRow;
}

export type TableName = keyof Tables;
export type Row<T extends TableName> = Tables[T];

/** Primärschlüssel je Tabelle (für Updates/Deletes im Memory-Store). */
export const PRIMARY_KEYS: { [T in TableName]: ReadonlyArray<keyof Tables[T] & string> } = {
  rules_versions: ['id'],
  rules_sections: ['id'],
  points_schemes: ['id'],
  seasons: ['id'],
  tracks: ['id'],
  rounds: ['id'],
  round_corrections: ['id'],
  sessions: ['id'],
  teams: ['id'],
  season_teams: ['season_id', 'team_id'],
  drivers: ['id'],
  driver_private: ['driver_id'],
  driver_numbers: ['id'],
  seats: ['id'],
  round_entries: ['id'],
  round_absences: ['round_id', 'driver_id'],
  results: ['id'],
  standings_snapshots: ['id'],
  awards: ['id'],
  incidents: ['id'],
  decisions: ['id'],
  news: ['id'],
  faq_items: ['id'],
  staff_members: ['id'],
  open_positions: ['id'],
  partners: ['id'],
  settings: ['key'],
  registrations: ['id'],
  contact_messages: ['id'],
  staff_accounts: ['user_id'],
  audit_log: ['id'],
  rate_limit_events: ['id'],
  import_batches: ['id'],
  slug_redirects: ['id'],
};

/** Tabellen, deren Primärschlüssel eine generierte bigint-`id` ist. */
export const IDENTITY_TABLES = (Object.keys(PRIMARY_KEYS) as TableName[]).filter(
  (t) => PRIMARY_KEYS[t].length === 1 && PRIMARY_KEYS[t][0] === 'id',
);
