/**
 * Selbstrollen per Bot-Token setzen bzw. entfernen (Discord REST API):
 * PUT/DELETE /guilds/{guild}/members/{user}/roles/{role}. Der Bot braucht „Rollen verwalten“
 * und muss in der Rollenliste über den vergebenen Rollen stehen (sonst 403).
 */

export type RoleResult = 'ok' | 'forbidden' | 'not_found' | 'error';

const API = 'https://discord.com/api/v10';
const SNOWFLAKE = /^\d{17,20}$/;

export function isSnowflake(value: string | null | undefined): value is string {
  return value != null && SNOWFLAKE.test(value);
}

export interface SetRoleOptions {
  token: string;
  guildId: string;
  userId: string;
  roleId: string;
  add: boolean;
  /** Grund im Audit-Log des Servers */
  reason?: string;
  fetchImpl?: typeof fetch;
}

export async function setMemberRole(o: SetRoleOptions): Promise<RoleResult> {
  if (!isSnowflake(o.guildId) || !isSnowflake(o.userId) || !isSnowflake(o.roleId)) return 'error';
  const doFetch = o.fetchImpl ?? fetch;
  try {
    const res = await doFetch(`${API}/guilds/${o.guildId}/members/${o.userId}/roles/${o.roleId}`, {
      method: o.add ? 'PUT' : 'DELETE',
      headers: {
        authorization: `Bot ${o.token}`,
        ...(o.reason ? { 'x-audit-log-reason': encodeURIComponent(o.reason.slice(0, 200)) } : {}),
      },
    });
    if (res.status === 204 || res.ok) return 'ok';
    if (res.status === 403) return 'forbidden';
    if (res.status === 404) return 'not_found';
    console.error(`Discord-Rollenänderung fehlgeschlagen: ${res.status}`);
    return 'error';
  } catch (err) {
    console.error('Discord-API nicht erreichbar', err);
    return 'error';
  }
}
