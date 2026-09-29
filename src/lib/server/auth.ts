/**
 * Staff-Login (Plan §5): Discord-OAuth über Supabase Auth. Nach dem Login prüft der Server
 * per Bot-Token, welche Rollen die Person auf dem Liga-Server hat (Admin, Steward, Redaktion).
 * Die Rollen werden bei jeder Sitzung und spätestens alle 15 Minuten neu geprüft –
 * wer die Discord-Rolle verliert, verliert den Zugang.
 *
 * Im Demo-Modus (ohne Supabase) gibt es einen Demo-Login mit wählbarer Rolle.
 */
import { createServerClient, parseCookieHeader } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AstroCookies } from 'astro';
import type { StaffAccountRow, StaffRole } from '../db/types';
import { fetchMemberRoleIds, mapRoles } from './discord';
import { getServiceStore } from './db';
import { env, isDemoMode } from './env';
import { readPrivateSettings } from './settings';

export const ROLE_RECHECK_MS = 15 * 60_000;
const DEMO_COOKIE = 'liga_demo_staff';

export interface Staff {
  userId: string;
  discordUserId: string;
  name: string;
  avatarUrl: string | null;
  roles: StaffRole[];
  /** Verknüpfter Fahrer (Befangenheitsprüfung bei Stewards) */
  driverId: number | null;
  demo: boolean;
}

/** Admin hat auch Redaktionsrechte; Steward-Entscheidungen erfordern die Steward-Rolle. */
export function hasRole(staff: Staff | null | undefined, ...roles: StaffRole[]): boolean {
  if (!staff) return false;
  return roles.some((r) => staff.roles.includes(r) || (r === 'redakteur' && staff.roles.includes('admin')));
}

export class AuthError extends Error {
  constructor(
    message: string,
    public readonly status: 401 | 403 = 403,
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

export function requireRole(staff: Staff | null | undefined, ...roles: StaffRole[]): Staff {
  if (!staff) throw new AuthError('Nicht angemeldet', 401);
  if (roles.length > 0 && !hasRole(staff, ...roles)) throw new AuthError('Keine Berechtigung für diese Aktion');
  return staff;
}

// ---------------------------------------------------------------------------- Supabase-Client

type CookieContext = { request: Request; cookies: AstroCookies };

export function supabaseAuthClient(ctx: CookieContext): SupabaseClient {
  if (!env.supabaseUrl || !env.supabaseAnonKey) throw new Error('Supabase ist nicht konfiguriert');
  return createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll() {
        return parseCookieHeader(ctx.request.headers.get('cookie') ?? '').map((c) => ({ name: c.name, value: c.value ?? '' }));
      },
      setAll(cookies) {
        for (const { name, value, options } of cookies) {
          ctx.cookies.set(name, value, { ...options, path: options?.path ?? '/', sameSite: 'lax', secure: import.meta.env.PROD, httpOnly: true });
        }
      },
    },
  });
}

// ---------------------------------------------------------------------------- Demo-Login

const DEMO_USERS: Record<StaffRole, { userId: string; name: string }> = {
  admin: { userId: '00000000-0000-4000-8000-000000000001', name: 'Demo-Admin' },
  steward: { userId: '00000000-0000-4000-8000-000000000002', name: 'Demo-Steward' },
  redakteur: { userId: '00000000-0000-4000-8000-000000000003', name: 'Demo-Redaktion' },
};

export function demoStaff(role: StaffRole): Staff {
  const u = DEMO_USERS[role];
  return { userId: u.userId, discordUserId: `demo-${role}`, name: u.name, avatarUrl: null, roles: [role], driverId: null, demo: true };
}

export function setDemoLogin(cookies: AstroCookies, role: StaffRole): void {
  if (!isDemoMode()) throw new AuthError('Demo-Login ist nur im Demo-Modus verfügbar');
  cookies.set(DEMO_COOKIE, role, { path: '/', httpOnly: true, sameSite: 'lax', maxAge: 8 * 3600 });
}

// ---------------------------------------------------------------------------- Sitzung

function toStaff(row: StaffAccountRow): Staff {
  return {
    userId: row.user_id,
    discordUserId: row.discord_user_id,
    name: row.display_name,
    avatarUrl: row.avatar_url,
    roles: row.roles,
    driverId: row.driver_id,
    demo: false,
  };
}

/** Discord-Rollen neu prüfen und in staff_accounts speichern. */
export async function refreshStaffRoles(row: StaffAccountRow): Promise<StaffAccountRow> {
  const store = getServiceStore();
  const roleIds = await fetchMemberRoleIds(row.discord_user_id);
  const settings = await readPrivateSettings(store);
  const roles = roleIds == null ? [] : mapRoles(roleIds, settings.discord_role_map);
  // Verknüpfung zum Fahrer mitprüfen (Befangenheit, Plan §5.3) – die Discord-ID kann nachträglich gepflegt werden
  const [priv] = await store.select('driver_private', { eq: { discord_user_id: row.discord_user_id } });
  const [updated] = await store.update(
    'staff_accounts',
    { user_id: row.user_id },
    { roles, driver_id: priv?.driver_id ?? null, roles_checked_at: new Date().toISOString() },
  );
  return updated ?? { ...row, roles };
}

/**
 * Aktuelle Staff-Person aus der Sitzung (oder null). Prüft die Rollen neu, wenn die
 * letzte Prüfung älter als 15 Minuten ist.
 */
export async function getStaff(ctx: CookieContext): Promise<Staff | null> {
  if (isDemoMode()) {
    const role = ctx.cookies.get(DEMO_COOKIE)?.value as StaffRole | undefined;
    return role && role in DEMO_USERS ? demoStaff(role) : null;
  }
  const supabase = supabaseAuthClient(ctx);
  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (error || !userId) return null;

  const store = getServiceStore();
  const [row] = await store.select('staff_accounts', { eq: { user_id: userId } });
  if (!row) return null;
  let current = row;
  const checkedAt = row.roles_checked_at ? new Date(row.roles_checked_at).getTime() : 0;
  if (Date.now() - checkedAt > ROLE_RECHECK_MS) {
    try {
      current = await refreshStaffRoles(row);
    } catch (err) {
      // Discord nicht erreichbar: lieber ausloggen als veraltete Rechte weiterverwenden
      console.error('Rollenprüfung fehlgeschlagen', err);
      return null;
    }
  }
  return current.roles.length > 0 ? toStaff(current) : null;
}

/**
 * Nach dem OAuth-Callback: Staff-Konto anlegen/aktualisieren und Rollen prüfen.
 * Liefert die Staff-Person oder null, wenn sie keine Liga-Rolle hat.
 */
export async function completeLogin(user: {
  id: string;
  user_metadata?: Record<string, unknown>;
  identities?: Array<{ provider: string; id: string; identity_data?: Record<string, unknown> }> | null;
}): Promise<Staff | null> {
  const identity = user.identities?.find((i) => i.provider === 'discord');
  const discordUserId = String(identity?.id ?? user.user_metadata?.provider_id ?? user.user_metadata?.sub ?? '');
  if (!discordUserId) return null;
  const meta = { ...(identity?.identity_data ?? {}), ...(user.user_metadata ?? {}) };
  const name = String(meta.custom_claims && typeof meta.custom_claims === 'object' ? ((meta.custom_claims as Record<string, unknown>).global_name ?? meta.full_name ?? meta.name ?? 'Staff') : (meta.full_name ?? meta.name ?? 'Staff'));
  const avatar = typeof meta.avatar_url === 'string' ? meta.avatar_url : null;

  const store = getServiceStore();
  // Verknüpfung zu einem Fahrer über die Discord-ID (für die Befangenheitsprüfung)
  const [priv] = await store.select('driver_private', { eq: { discord_user_id: discordUserId } });
  const [row] = await store.upsert(
    'staff_accounts',
    [{ user_id: user.id, discord_user_id: discordUserId, display_name: name, avatar_url: avatar, driver_id: priv?.driver_id ?? null }],
    ['user_id'],
  );
  if (!row) return null;
  const refreshed = await refreshStaffRoles(row);
  return refreshed.roles.length > 0 ? toStaff(refreshed) : null;
}

export async function logout(ctx: CookieContext): Promise<void> {
  if (isDemoMode()) {
    ctx.cookies.delete(DEMO_COOKIE, { path: '/' });
    return;
  }
  const supabase = supabaseAuthClient(ctx);
  await supabase.auth.signOut();
}
