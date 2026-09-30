/**
 * In-Memory-Implementierung des Stores für Demo-Modus, lokale Entwicklung ohne
 * Supabase und E2E-Tests. Bildet Defaults, Trigger und die wichtigsten
 * Unique-Constraints der Migrationen nach, damit sich die App wie mit Postgres verhält.
 */

import { addHours, zonedLocalToUtc } from '../domain/time';
import { StoreError, UNIQUE_VIOLATION, type Filter, type Insert, type Patch, type Store } from './store';
import { IDENTITY_TABLES, PRIMARY_KEYS, type Row, type TableName, type Tables } from './types';

type AnyRow = Record<string, unknown>;
export type Dataset = { [T in TableName]?: Array<Partial<Row<T>>> };

/** Spalten-Defaults wie in der Migration (ohne id/created_at/updated_at). */
const DEFAULTS: { [T in TableName]?: Partial<Row<T>> } = {
  rules_versions: { changelog_de: '', changelog_en: null, status: 'draft', published_at: null, effective_from: null },
  rules_sections: { parent_id: null, body_de: '', title_en: null, body_en: null, sort: 0 },
  points_schemes: { sprint_points: [], fastest_lap_bonus: 0, fastest_lap_max_pos: null, pole_bonus: 0 },
  seasons: {
    status: 'planned',
    reserve_points_for_constructors: true,
    protest_window_hours: 48,
    two_steward_rule: false,
    penalty_points_enabled: false,
    penalty_points_config: {},
    lobby_settings: {},
    rules_version_id: null,
    starts_on: null,
    ends_on: null,
  },
  tracks: { game_track_id: null, length_km: null, laps_default: null, map_url: null, map_credit: null },
  rounds: {
    timezone: 'Europe/Berlin',
    format: 'standard',
    status: 'scheduled',
    provisional_at: null,
    final_at: null,
    vod_url: null,
    highlights_url: null,
  },
  round_corrections: { reason_en: null, created_by: null },
  sessions: { weather: null, status: 'pending' },
  teams: { text_color_hex: '#000000', game_team_id: null, active: true },
  season_teams: { sort_order: 0 },
  drivers: {
    nationality_code: null,
    input_device: 'controller',
    status: 'reserve',
    reserve_order: null,
    joined_season_id: null,
    twitch_url: null,
    youtube_url: null,
    show_links: false,
    anonymized: false,
  },
  driver_private: { discord_user_id: null, discord_username: null, ea_id: null, notes: null },
  driver_numbers: { valid_to: null, note: null },
  seats: { from_round: 1, to_round: null },
  round_entries: { role: 'regular', replaces_driver_id: null, race_number: null },
  round_absences: { reported_in_time: true, note: null },
  results: {
    round_entry_id: null,
    race_number: null,
    role: 'regular',
    position: null,
    status: 'classified',
    entered_status: null,
    grid_position: null,
    laps: null,
    total_time_ms: null,
    gap_ms: null,
    gap_laps: null,
    best_lap_ms: null,
    pit_stops: null,
    ingame_penalty_s: 0,
    steward_penalty_s: 0,
    is_fastest_lap: false,
    is_pole: false,
    points: 0,
    counts_for_constructors: true,
  },
  standings_snapshots: { wins: 0, podiums: 0, poles: 0, fastest_laps: 0 },
  awards: { round_id: null, driver_id: null, team_id: null },
  incidents: {
    session_id: null,
    reporter_driver_id: null,
    reporter_contact: null,
    involved_driver_ids: [],
    lap: null,
    corner: null,
    clip_url: null,
    clip_timestamp: null,
    ip_hash: null,
    source: 'report',
    status: 'new',
  },
  decisions: {
    incident_id: null,
    session_id: null,
    time_seconds: null,
    positions: null,
    penalty_points: null,
    reasoning_en: null,
    rule_ref: null,
    clip_url: null,
    decided_by: [],
    status: 'draft',
    published_at: null,
  },
  news: {
    title_en: null,
    excerpt_de: '',
    excerpt_en: null,
    body_de: '',
    body_en: null,
    cover_image: null,
    cover_alt_de: null,
    cover_alt_en: null,
    category: 'announcement',
    round_id: null,
    author_id: null,
    author_name: null,
    status: 'draft',
    publish_at: null,
    discord_post: false,
  },
  faq_items: { category: 'general', question_en: null, answer_en: null, sort: 0 },
  staff_members: { role_en: null, avatar: null, since_season: null, sort: 0 },
  open_positions: { title_en: null, description_en: null, effort: null, effort_en: null, active: true, sort: 0 },
  partners: { logo: null, text_de: '', text_en: null, label_ad: true, active: true, sort: 0 },
  settings: { is_public: false },
  registrations: {
    ea_id: null,
    nationality: null,
    experience: null,
    reference_time: null,
    status: 'new',
    admin_notes: null,
    ip_hash: null,
    driver_id: null,
    processed_by: null,
    processed_at: null,
  },
  contact_messages: { status: 'new', ip_hash: null },
  staff_accounts: { avatar_url: null, roles: [], driver_id: null, roles_checked_at: null },
  audit_log: { actor_id: null, actor_name: null, entity_id: null, diff: null },
  import_batches: { mapping: null, status: 'draft', uploaded_by: null },
  slug_redirects: { lang: null },
};

interface UniqueConstraint {
  columns: string[];
  where?: (row: AnyRow) => boolean;
  normalize?: (value: unknown) => unknown;
}

/** Unique-Constraints aus der Migration, die für Admin-Fehlermeldungen relevant sind. */
const UNIQUES: { [T in TableName]?: UniqueConstraint[] } = {
  rules_versions: [{ columns: ['version'] }],
  points_schemes: [{ columns: ['name'] }],
  seasons: [{ columns: ['number'] }, { columns: ['slug'] }, { columns: ['status'], where: (r) => r.status === 'active' }],
  tracks: [{ columns: ['slug'] }],
  rounds: [{ columns: ['season_id', 'number'] }],
  sessions: [{ columns: ['round_id', 'type'] }],
  teams: [{ columns: ['slug'] }],
  drivers: [
    { columns: ['slug'] },
    { columns: ['gamertag'], where: (r) => !r.anonymized, normalize: (v) => String(v).toLowerCase() },
  ],
  driver_numbers: [
    { columns: ['number'], where: (r) => r.valid_to == null },
    { columns: ['driver_id'], where: (r) => r.valid_to == null },
  ],
  round_entries: [{ columns: ['round_id', 'driver_id'] }, { columns: ['round_id', 'team_id', 'seat_no'] }],
  results: [{ columns: ['session_id', 'driver_id'] }],
  standings_snapshots: [{ columns: ['after_round_id', 'kind', 'entity_id'] }],
  decisions: [{ columns: ['public_ref'] }],
  news: [{ columns: ['slug_de'] }, { columns: ['slug_en'] }],
  staff_accounts: [{ columns: ['discord_user_id'] }],
  slug_redirects: [{ columns: ['entity', 'old_slug', 'lang'] }],
};

const clone = <T>(v: T): T => structuredClone(v);

export class MemoryStore implements Store {
  readonly kind = 'memory' as const;
  private tables = new Map<TableName, AnyRow[]>();
  private counters = new Map<TableName, number>();
  /** Wird bei jeder Schreiboperation erhöht (Cache-Invalidierung). */
  version = 0;

  constructor(dataset: Dataset = {}) {
    const now = new Date().toISOString();
    for (const table of Object.keys(PRIMARY_KEYS) as TableName[]) {
      const rows = (dataset[table] ?? []).map((r) => this.prepare(table, { ...(r as AnyRow) }, now));
      this.tables.set(table, rows);
      if (IDENTITY_TABLES.includes(table)) {
        const max = rows.reduce((m, r) => Math.max(m, Number(r.id) || 0), 0);
        this.counters.set(table, max);
      }
    }
  }

  private rows(table: TableName): AnyRow[] {
    let rows = this.tables.get(table);
    if (!rows) {
      rows = [];
      this.tables.set(table, rows);
    }
    return rows;
  }

  private nextId(table: TableName): number {
    const n = (this.counters.get(table) ?? 0) + 1;
    this.counters.set(table, n);
    return n;
  }

  /** Defaults, IDs, Zeitstempel und „Trigger“ anwenden. */
  private prepare(table: TableName, row: AnyRow, now: string): AnyRow {
    const withDefaults: AnyRow = { ...clone(DEFAULTS[table] ?? {}), ...row };
    if (IDENTITY_TABLES.includes(table) && withDefaults.id == null) withDefaults.id = this.nextId(table);
    withDefaults.created_at ??= now;
    withDefaults.updated_at ??= now;
    if (table === 'rounds') this.computeRoundTimes(withDefaults);
    if (table === 'incidents') withDefaults.submitted_at ??= now;
    if (table === 'audit_log') withDefaults.at ??= now;
    if (table === 'driver_numbers') withDefaults.valid_from ??= now;
    return withDefaults;
  }

  private computeRoundTimes(row: AnyRow): void {
    const local = String(row.local_start);
    row.start_utc = zonedLocalToUtc(local, String(row.timezone ?? 'Europe/Berlin')).toISOString();
    if (row.provisional_at) {
      const season = this.rows('seasons').find((s) => s.id === row.season_id);
      const hours = Number(season?.protest_window_hours ?? 48);
      row.protest_deadline = addHours(new Date(String(row.provisional_at)), hours).toISOString();
    } else {
      row.protest_deadline = null;
    }
  }

  private matches(row: AnyRow, filter?: Filter<AnyRow>): boolean {
    if (!filter) return true;
    for (const [col, val] of Object.entries(filter.eq ?? {})) {
      if (val === null ? row[col] != null : row[col] !== val) return false;
    }
    for (const [col, vals] of Object.entries(filter.in ?? {})) {
      if (!(vals as unknown[]).includes(row[col])) return false;
    }
    return true;
  }

  private checkUnique(table: TableName, candidate: AnyRow, ignore?: AnyRow): void {
    const pk = PRIMARY_KEYS[table] as readonly string[];
    const all = this.rows(table);
    const clash = all.find((r) => r !== ignore && pk.every((c) => r[c] === candidate[c]));
    if (clash) throw new StoreError(`duplicate key in ${table} (${pk.join(', ')})`, UNIQUE_VIOLATION);
    for (const u of UNIQUES[table] ?? []) {
      if (u.where && !u.where(candidate)) continue;
      const norm = u.normalize ?? ((v: unknown) => v);
      const dup = all.find(
        (r) =>
          r !== ignore &&
          (!u.where || u.where(r)) &&
          u.columns.every((c) => r[c] != null && norm(r[c]) === norm(candidate[c])),
      );
      if (dup) throw new StoreError(`duplicate key in ${table} (${u.columns.join(', ')})`, UNIQUE_VIOLATION);
    }
  }

  async select<T extends TableName>(table: T, filter?: Filter<Row<T>>): Promise<Row<T>[]> {
    let rows = this.rows(table).filter((r) => this.matches(r, filter as Filter<AnyRow>));
    if (filter?.order) {
      const { column, desc } = filter.order;
      rows = [...rows].sort((a, b) => {
        const av = a[column] as string | number | null;
        const bv = b[column] as string | number | null;
        if (av === bv) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        return (av < bv ? -1 : 1) * (desc ? -1 : 1);
      });
    }
    if (filter?.limit != null) rows = rows.slice(0, filter.limit);
    return clone(rows) as unknown as Row<T>[];
  }

  async insert<T extends TableName>(table: T, rows: Insert<T> | Insert<T>[]): Promise<Row<T>[]> {
    const list = Array.isArray(rows) ? rows : [rows];
    const now = new Date().toISOString();
    const created: AnyRow[] = [];
    for (const r of list) {
      const row = this.prepare(table, clone(r as AnyRow), now);
      this.checkUnique(table, row);
      this.rows(table).push(row);
      created.push(row);
    }
    this.version++;
    return clone(created) as unknown as Row<T>[];
  }

  async update<T extends TableName>(table: T, match: Partial<Row<T>>, patch: Patch<T>): Promise<Row<T>[]> {
    const now = new Date().toISOString();
    const updated: AnyRow[] = [];
    for (const row of this.rows(table)) {
      if (!this.matches(row, { eq: match as AnyRow })) continue;
      const next = { ...row, ...clone(patch as AnyRow), updated_at: now };
      if (table === 'rounds') this.computeRoundTimes(next);
      this.checkUnique(table, next, row);
      Object.assign(row, next);
      updated.push(row);
    }
    if (updated.length > 0) this.version++;
    return clone(updated) as unknown as Row<T>[];
  }

  async upsert<T extends TableName>(
    table: T,
    rows: Insert<T>[],
    onConflict?: ReadonlyArray<keyof Row<T> & string>,
  ): Promise<Row<T>[]> {
    const keys = (onConflict ?? PRIMARY_KEYS[table]) as readonly string[];
    const out: Row<T>[] = [];
    for (const r of rows) {
      const record = r as AnyRow;
      const existing = keys.every((k) => record[k] != null)
        ? this.rows(table).find((row) => keys.every((k) => row[k] === record[k]))
        : undefined;
      if (existing) {
        const match = Object.fromEntries(keys.map((k) => [k, record[k]])) as Partial<Row<T>>;
        out.push(...(await this.update(table, match, r)));
      } else {
        out.push(...(await this.insert(table, r)));
      }
    }
    return out;
  }

  async remove<T extends TableName>(table: T, match: Partial<Row<T>>): Promise<number> {
    const rows = this.rows(table);
    const keep = rows.filter((r) => !this.matches(r, { eq: match as AnyRow }));
    const removed = rows.length - keep.length;
    this.tables.set(table, keep);
    if (removed > 0) {
      this.version++;
      this.cascade(table, rows.filter((r) => !keep.includes(r)));
    }
    return removed;
  }

  /** Die wichtigsten ON DELETE CASCADE-Beziehungen nachbilden. */
  private cascade(table: TableName, removed: AnyRow[]): void {
    const ids = removed.map((r) => r.id);
    const drop = (t: TableName, col: string) => {
      const rows = this.rows(t);
      const keep = rows.filter((r) => !ids.includes(r[col]));
      if (keep.length !== rows.length) {
        const gone = rows.filter((r) => !keep.includes(r));
        this.tables.set(t, keep);
        this.cascade(t, gone);
      }
    };
    switch (table) {
      case 'seasons':
        drop('rounds', 'season_id');
        drop('season_teams', 'season_id');
        drop('seats', 'season_id');
        drop('standings_snapshots', 'season_id');
        drop('awards', 'season_id');
        break;
      case 'rounds':
        drop('sessions', 'round_id');
        drop('round_entries', 'round_id');
        drop('round_absences', 'round_id');
        drop('round_corrections', 'round_id');
        drop('incidents', 'round_id');
        drop('decisions', 'round_id');
        break;
      case 'sessions':
        drop('results', 'session_id');
        drop('import_batches', 'session_id');
        break;
      case 'drivers':
        drop('driver_private', 'driver_id');
        drop('driver_numbers', 'driver_id');
        drop('round_absences', 'driver_id');
        break;
      case 'rules_versions':
        drop('rules_sections', 'version_id');
        break;
      default:
        break;
    }
  }

  async rpc(fn: string): Promise<unknown> {
    if (fn === 'run_retention') return { demo: true };
    throw new StoreError(`RPC ${fn} ist im Demo-Modus nicht verfügbar`);
  }

  /** Alle Tabellen als Dataset (z. B. für den Seed-Export). */
  dump(): { [T in TableName]: Tables[T][] } {
    return Object.fromEntries([...this.tables.entries()].map(([t, rows]) => [t, clone(rows)])) as never;
  }
}
