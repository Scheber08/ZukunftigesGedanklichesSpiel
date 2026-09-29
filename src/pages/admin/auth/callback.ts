/**
 * OAuth-Callback (Plan §5 Login): Code gegen Sitzung tauschen, Staff-Konto anlegen bzw.
 * aktualisieren und die Discord-Rollen prüfen. Ohne Liga-Rolle wird die Sitzung sofort
 * wieder beendet. Weiterleitung nur auf relative /admin-Pfade.
 */
import type { APIRoute } from 'astro';
import { safeNext } from '~/lib/admin/league/auth';
import { audit } from '~/lib/server/audit';
import { completeLogin, supabaseAuthClient } from '~/lib/server/auth';
import { getServiceStore } from '~/lib/server/db';
import { isDemoMode } from '~/lib/server/env';

export const prerender = false;

export const GET: APIRoute = async (context) => {
  const { url } = context;
  const next = safeNext(url.searchParams.get('next'));
  if (isDemoMode()) return context.redirect(`/admin/login?next=${encodeURIComponent(next)}`, 302);

  // Abbruch bei Discord (z. B. „Abbrechen“ im Autorisierungsdialog)
  if (url.searchParams.get('error')) {
    const denied = url.searchParams.get('error') === 'access_denied';
    return context.redirect(`/admin/login?error=${denied ? 'denied' : 'callback'}`, 302);
  }
  const code = url.searchParams.get('code');
  if (!code) return context.redirect('/admin/login?error=callback', 302);

  const supabase = supabaseAuthClient(context);
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data?.user) {
    console.error('Code-Austausch fehlgeschlagen', error);
    return context.redirect('/admin/login?error=callback', 302);
  }

  let staff;
  try {
    staff = await completeLogin(data.user);
  } catch (err) {
    console.error('Rollenprüfung beim Login fehlgeschlagen', err);
    await supabase.auth.signOut();
    return context.redirect('/admin/login?error=roles', 302);
  }
  if (!staff) {
    await supabase.auth.signOut();
    return context.redirect('/admin/login?error=no_role', 302);
  }

  await audit(getServiceStore(), staff, 'login', 'staff_accounts', staff.userId, null, { roles: staff.roles });
  return context.redirect(next, 302);
};
