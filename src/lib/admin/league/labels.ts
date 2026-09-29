/**
 * Deutsche Bezeichnungen für Aufzählungen im Admin-Bereich (die Admin-Oberfläche ist
 * nur deutsch, daher ohne i18n-Wörterbuch).
 */
import type {
  Availability,
  DriverStatus,
  IncidentStatus,
  InputDevice,
  Platform,
  RegistrationStatus,
  RoundFormat,
  RoundStatus,
  SeasonStatus,
  SessionType,
  StaffRole,
  WantedRole,
} from '~/lib/db/types';

export type BadgeVariant = 'default' | 'green' | 'teal' | 'warning' | 'danger' | 'muted' | 'solid';

export const SEASON_STATUS_LABELS: Record<SeasonStatus, string> = {
  planned: 'Geplant',
  active: 'Aktiv',
  finished: 'Abgeschlossen',
};
export const SEASON_STATUS_BADGE: Record<SeasonStatus, BadgeVariant> = {
  planned: 'muted',
  active: 'green',
  finished: 'teal',
};

export const ROUND_STATUS_LABELS: Record<RoundStatus, string> = {
  scheduled: 'Geplant',
  lineup_published: 'Aufstellung veröffentlicht',
  provisional: 'Vorläufig',
  final: 'Final',
  corrected: 'Korrigiert',
  cancelled: 'Abgesagt',
};
export const ROUND_STATUS_BADGE: Record<RoundStatus, BadgeVariant> = {
  scheduled: 'muted',
  lineup_published: 'teal',
  provisional: 'warning',
  final: 'green',
  corrected: 'teal',
  cancelled: 'danger',
};

export const ROUND_FORMAT_LABELS: Record<RoundFormat, string> = {
  standard: 'Standard (Quali + Rennen)',
  sprint: 'Sprint (Quali + Sprint + Rennen)',
};
export const ROUND_FORMAT_SHORT: Record<RoundFormat, string> = {
  standard: 'Standard',
  sprint: 'Sprint',
};

export const SESSION_TYPE_LABELS: Record<SessionType, string> = {
  qualifying: 'Qualifying',
  sprint: 'Sprint',
  race: 'Rennen',
};

export const PLATFORM_LABELS: Record<Platform, string> = {
  pc_steam: 'PC (Steam)',
  pc_ea: 'PC (EA App)',
  playstation: 'PlayStation',
  xbox: 'Xbox',
};

export const INPUT_DEVICE_LABELS: Record<InputDevice, string> = {
  wheel: 'Lenkrad',
  controller: 'Controller',
};

export const DRIVER_STATUS_LABELS: Record<DriverStatus, string> = {
  active: 'Aktiv',
  reserve: 'Reserve',
  inactive: 'Inaktiv',
  banned: 'Gesperrt',
};
export const DRIVER_STATUS_BADGE: Record<DriverStatus, BadgeVariant> = {
  active: 'green',
  reserve: 'teal',
  inactive: 'muted',
  banned: 'danger',
};

export const REGISTRATION_STATUS_LABELS: Record<RegistrationStatus, string> = {
  new: 'Neu',
  contacted: 'Kontaktiert',
  accepted: 'Angenommen',
  waitlist: 'Warteliste',
  rejected: 'Abgelehnt',
};
export const REGISTRATION_STATUS_BADGE: Record<RegistrationStatus, BadgeVariant> = {
  new: 'warning',
  contacted: 'teal',
  accepted: 'green',
  waitlist: 'muted',
  rejected: 'danger',
};

export const WANTED_ROLE_LABELS: Record<WantedRole, string> = {
  regular: 'Stammfahrer',
  reserve: 'Reserve',
  any: 'Egal',
};

export const AVAILABILITY_LABELS: Record<Availability, string> = {
  regular: 'Regelmäßig',
  mostly: 'Meistens',
  irregular: 'Unregelmäßig',
};

export const INCIDENT_STATUS_LABELS: Record<IncidentStatus, string> = {
  new: 'Neu',
  in_review: 'In Prüfung',
  decided: 'Entschieden',
  rejected: 'Abgelehnt',
  late: 'Verspätet',
};

export const CONTACT_STATUS_LABELS: Record<'new' | 'done', string> = {
  new: 'Offen',
  done: 'Erledigt',
};

export const STAFF_ROLE_LABELS: Record<StaffRole, string> = {
  admin: 'Admin',
  steward: 'Steward',
  redakteur: 'Redaktion',
};

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  create: 'Angelegt',
  update: 'Geändert',
  delete: 'Gelöscht',
  publish: 'Veröffentlicht',
  unpublish: 'Zurückgezogen',
  finalize: 'Final gesetzt',
  correct: 'Korrigiert',
  login: 'Anmeldung',
  import: 'Import',
};

/** Tabellen-/Entitätsnamen im Audit-Log. */
export const ENTITY_LABELS: Record<string, string> = {
  seasons: 'Saison',
  points_schemes: 'Punkteschema',
  tracks: 'Strecke',
  rounds: 'Runde',
  sessions: 'Session',
  teams: 'Team',
  season_teams: 'Saison-Teams',
  seats: 'Cockpit',
  drivers: 'Fahrer',
  driver_private: 'Fahrer (privat)',
  driver_numbers: 'Startnummer',
  registrations: 'Anmeldung',
  settings: 'Einstellung',
  contact_messages: 'Kontaktanfrage',
  staff_accounts: 'Staff-Konto',
  awards: 'Auszeichnung',
  round_entries: 'Aufstellung',
  round_absences: 'Abmeldung',
  results: 'Ergebnis',
  round_corrections: 'Korrektur',
  standings_snapshots: 'Wertungs-Snapshot',
  incidents: 'Vorfall',
  decisions: 'Entscheidung',
  news: 'News',
  rules_versions: 'Regelwerk-Version',
  rules_sections: 'Regelwerk-Abschnitt',
  faq_items: 'FAQ',
  staff_members: 'Orga-Team',
  open_positions: 'Offene Rolle',
  partners: 'Partner',
};

/** Admin-Link zu einer Entität (für das Audit-Log), falls es eine Detailseite gibt. */
export function adminEntityHref(entity: string, entityId: string | null): string | null {
  if (!entityId || !/^\d+$/.test(entityId)) {
    if (entity === 'settings') return '/admin/einstellungen';
    return null;
  }
  switch (entity) {
    case 'seasons':
      return `/admin/saisons/${entityId}`;
    case 'points_schemes':
      return `/admin/punkteschemata/${entityId}`;
    case 'tracks':
      return `/admin/kalender/strecken/${entityId}`;
    case 'rounds':
      return `/admin/kalender/${entityId}`;
    case 'teams':
      return `/admin/teams/${entityId}`;
    case 'drivers':
    case 'driver_private':
      return `/admin/fahrer/${entityId}`;
    case 'registrations':
      return `/admin/anmeldungen/${entityId}`;
    case 'contact_messages':
      return `/admin/kontakt/${entityId}`;
    default:
      return null;
  }
}

export const WEEKDAY_LABELS = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'] as const;
