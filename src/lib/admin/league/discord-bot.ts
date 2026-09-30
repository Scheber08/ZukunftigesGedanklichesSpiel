/**
 * Discord-Bot (Plan Phase 3, Rollenvergabe): Selbstrollen, die sich Mitglieder per Bot geben
 * oder nehmen dürfen, z. B. „Renntag-Ping“. Reine Prüf- und Planungsfunktionen (getestet);
 * gespeichert wird in der privaten Einstellung `discord_self_roles`.
 */
import { normalizeText } from '~/lib/domain/text';
import type { PrivateSettings } from '~/lib/settings';

export type SelfRole = PrivateSettings['discord_self_roles']['roles'][number];

/** Discord-Auswahlmenüs zeigen höchstens 25 Einträge. */
export const MAX_SELF_ROLES = 25;
export const SELF_ROLE_LABEL_MAX = 60;

/** Rollen-ID (Snowflake): nur Ziffern, 17–20 Stellen. */
export function isRoleId(value: string | null | undefined): value is string {
  return !!value && /^\d{17,20}$/.test(value);
}

/** Pfad des Interactions-Endpunkts (Slash-Befehle des Bots). */
export const INTERACTIONS_PATH = '/api/discord/interactions';

/** Absolute Adresse des Interactions-Endpunkts für das Discord-Entwicklerportal. */
export function interactionsEndpoint(site: string | URL): string {
  return new URL(INTERACTIONS_PATH, site).href;
}

export interface SelfRoleInput {
  role_id?: string | null;
  label_de?: string | null;
  label_en?: string | null;
}

export interface SelfRolePlan {
  roles: SelfRole[];
  /** true = bestehende Rolle mit neuen Bezeichnungen, false = neu hinzugefügt */
  updated: boolean;
  /** Feldfehler (Schlüssel = Formularfeld) */
  errors: Record<string, string>;
}

const clean = (v: string | null | undefined) => normalizeText(v ?? '').replace(/\s+/g, ' ');

/**
 * Selbstrolle hinzufügen oder – bei bekannter Rollen-ID – ihre Bezeichnungen ändern.
 * Staff-Rollen (Admin/Steward/Redaktion) dürfen nie selbst vergebbar sein, sonst könnte sich
 * jedes Mitglied Admin-Rechte geben.
 */
export function planSelfRoleUpsert(
  current: readonly SelfRole[],
  input: SelfRoleInput,
  staffRoleMap: PrivateSettings['discord_role_map'],
): SelfRolePlan {
  const errors: Record<string, string> = {};
  const roleId = (input.role_id ?? '').trim();
  const labelDe = clean(input.label_de);
  const labelEnRaw = clean(input.label_en);
  if (!isRoleId(roleId)) errors.role_id = 'Rollen-ID: nur Ziffern, 17–20 Stellen (Entwicklermodus → Rechtsklick auf die Rolle → „ID kopieren“).';
  else if (Object.values(staffRoleMap).some((ids) => ids.includes(roleId))) {
    errors.role_id = 'Diese Rolle gibt Rechte im Admin-Bereich (Discord-Rollen oben) und darf nicht selbst vergebbar sein.';
  }
  if (labelDe === '') errors.label_de = 'Bezeichnung (DE) fehlt.';
  else if (labelDe.length > SELF_ROLE_LABEL_MAX) errors.label_de = `Bezeichnung (DE): höchstens ${SELF_ROLE_LABEL_MAX} Zeichen.`;
  if (labelEnRaw.length > SELF_ROLE_LABEL_MAX) errors.label_en = `Bezeichnung (EN): höchstens ${SELF_ROLE_LABEL_MAX} Zeichen.`;

  const existing = current.find((r) => r.role_id === roleId);
  if (!existing && current.length >= MAX_SELF_ROLES && !errors.role_id) {
    errors.role_id = `Höchstens ${MAX_SELF_ROLES} Selbstrollen – Discord zeigt nicht mehr in einer Auswahl.`;
  }
  const clash = current.find((r) => r.role_id !== roleId && r.label_de.toLowerCase() === labelDe.toLowerCase());
  if (clash && !errors.label_de) errors.label_de = `Die Bezeichnung „${clash.label_de}“ gibt es schon – bitte eindeutig benennen.`;
  if (Object.keys(errors).length > 0) return { roles: [...current], updated: false, errors };

  const role: SelfRole = { role_id: roleId, label_de: labelDe, label_en: labelEnRaw || labelDe };
  const roles = existing ? current.map((r) => (r.role_id === roleId ? role : r)) : [...current, role];
  return { roles, updated: !!existing, errors };
}

/** Selbstrolle entfernen (die Rolle selbst bleibt auf dem Discord-Server bestehen). */
export function planSelfRoleRemove(current: readonly SelfRole[], roleId: string): { roles: SelfRole[]; removed: SelfRole | null } {
  const removed = current.find((r) => r.role_id === roleId) ?? null;
  return { roles: current.filter((r) => r.role_id !== roleId), removed };
}

/** Selbstrollen, die (nachträglich) auch Staff-Rechte geben – Warnung auf der Einstellungsseite. */
export function selfRolesWithStaffRights(roles: readonly SelfRole[], staffRoleMap: PrivateSettings['discord_role_map']): SelfRole[] {
  const staff = new Set(Object.values(staffRoleMap).flat());
  return roles.filter((r) => staff.has(r.role_id));
}
