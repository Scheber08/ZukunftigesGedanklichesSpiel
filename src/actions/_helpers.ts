/**
 * Gemeinsame Helfer für Astro Actions: Rollenprüfung und Fehlerübersetzung.
 */
import { ActionError, type ActionAPIContext } from 'astro:actions';
import { StoreError, UNIQUE_VIOLATION } from '~/lib/db/store';
import type { StaffRole } from '~/lib/db/types';
import { AuthError, requireRole, type Staff } from '~/lib/server/auth';

/** Staff-Person mit einer der Rollen – sonst UNAUTHORIZED/FORBIDDEN. */
export function staffFrom(context: ActionAPIContext, ...roles: StaffRole[]): Staff {
  try {
    return requireRole(context.locals.staff, ...roles);
  } catch (err) {
    if (err instanceof AuthError) {
      throw new ActionError({ code: err.status === 401 ? 'UNAUTHORIZED' : 'FORBIDDEN', message: err.message });
    }
    throw err;
  }
}

/** Datenbankfehler in verständliche Action-Fehler übersetzen. */
export function toActionError(err: unknown, conflictMessage = 'Eintrag existiert bereits'): never {
  if (err instanceof ActionError) throw err;
  if (err instanceof StoreError && err.code === UNIQUE_VIOLATION) {
    throw new ActionError({ code: 'CONFLICT', message: conflictMessage });
  }
  console.error(err);
  throw new ActionError({ code: 'INTERNAL_SERVER_ERROR', message: err instanceof Error ? err.message : 'Unbekannter Fehler' });
}
