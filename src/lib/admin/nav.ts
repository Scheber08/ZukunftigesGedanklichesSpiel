/**
 * Navigation des Admin-Bereichs (Plan §5). Sichtbarkeit nach Rolle;
 * die eigentliche Berechtigung prüft jede Seite/Action selbst.
 */
import type { StaffRole } from '../db/types';

export interface AdminNavItem {
  label: string;
  href: string;
  roles: StaffRole[] | 'all';
  group: 'Übersicht' | 'Liga' | 'Renntag' | 'Inhalte' | 'System';
}

export const ADMIN_NAV: AdminNavItem[] = [
  { label: 'Dashboard', href: '/admin', roles: 'all', group: 'Übersicht' },
  { label: 'Saisons', href: '/admin/saisons', roles: ['admin'], group: 'Liga' },
  { label: 'Punkteschemata', href: '/admin/punkteschemata', roles: ['admin'], group: 'Liga' },
  { label: 'Kalender', href: '/admin/kalender', roles: ['admin'], group: 'Liga' },
  { label: 'Teams & Cockpits', href: '/admin/teams', roles: ['admin'], group: 'Liga' },
  { label: 'Fahrer', href: '/admin/fahrer', roles: ['admin'], group: 'Liga' },
  { label: 'Anmeldungen', href: '/admin/anmeldungen', roles: ['admin'], group: 'Liga' },
  { label: 'Auszeichnungen', href: '/admin/auszeichnungen', roles: ['admin'], group: 'Liga' },
  { label: 'Runden (Grid & Ergebnisse)', href: '/admin/runden', roles: ['admin'], group: 'Renntag' },
  { label: 'Stewards', href: '/admin/stewards', roles: ['steward', 'admin'], group: 'Renntag' },
  { label: 'News', href: '/admin/news', roles: ['redakteur', 'admin'], group: 'Inhalte' },
  { label: 'Regelwerk', href: '/admin/regelwerk', roles: ['admin'], group: 'Inhalte' },
  { label: 'Seiten-Inhalte', href: '/admin/inhalte', roles: ['redakteur', 'admin'], group: 'Inhalte' },
  { label: 'Grafiken', href: '/admin/grafiken', roles: ['redakteur', 'admin'], group: 'Inhalte' },
  { label: 'Kontaktanfragen', href: '/admin/kontakt', roles: ['admin'], group: 'System' },
  { label: 'Einstellungen', href: '/admin/einstellungen', roles: ['admin'], group: 'System' },
  { label: 'Audit-Log', href: '/admin/audit', roles: ['admin'], group: 'System' },
];

export function visibleNav(roles: readonly StaffRole[]): AdminNavItem[] {
  return ADMIN_NAV.filter(
    (item) =>
      item.roles === 'all' ||
      item.roles.some((r) => roles.includes(r) || (r === 'redakteur' && roles.includes('admin'))),
  );
}

export const ROLE_LABELS: Record<StaffRole, string> = {
  admin: 'Admin',
  steward: 'Steward',
  redakteur: 'Redaktion',
};
