/**
 * Start des Discord-Logins über Supabase Auth (Plan §5, §8.1). Im Demo-Modus gibt es
 * keinen OAuth-Flow – dann zurück zur Login-Seite mit den Demo-Zugängen.
 */
import type { APIRoute } from 'astro';
import { safeNext } from '~/lib/admin/league/auth';
import { supabaseAuthClient } from '~/lib/server/auth';
import { isDemoMode } from '~/lib/server/env';

export const prerender = false;

export const GET: APIRoute = async (context) => {
  const next = safeNext(context.url.searchParams.get('next'));
  if (isDemoMode()) return context.redirect(`/admin/login?next=${encodeURIComponent(next)}`, 302);

  try {
    const supabase = supabaseAuthClient(context);
    const redirectTo = new URL('/admin/auth/callback', context.url.origin);
    redirectTo.searchParams.set('next', next);
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'discord',
      options: { redirectTo: redirectTo.href, scopes: 'identify', skipBrowserRedirect: true },
    });
    if (error || !data?.url) {
      console.error('Discord-OAuth konnte nicht gestartet werden', error);
      return context.redirect('/admin/login?error=oauth', 302);
    }
    return context.redirect(data.url, 302);
  } catch (err) {
    console.error('Discord-OAuth fehlgeschlagen', err);
    return context.redirect('/admin/login?error=oauth', 302);
  }
};
