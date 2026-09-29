/** Abmelden (POST, Origin-Prüfung durch Astro): Sitzung beenden, zurück zum Login. */
import type { APIRoute } from 'astro';
import { logout } from '~/lib/server/auth';

export const prerender = false;

export const POST: APIRoute = async (context) => {
  try {
    await logout(context);
  } catch (err) {
    console.error('Abmelden fehlgeschlagen', err);
  }
  return context.redirect('/admin/login?abgemeldet=1', 303);
};

/** Direktaufruf per GET abmelden wäre per Link auslösbar (CSRF) – nur zur Login-Seite. */
export const GET: APIRoute = (context) => context.redirect('/admin/login', 302);
