/**
 * Demo-Login (nur im Demo-Modus): Rolle wählen, Cookie setzen, weiter in den Admin-Bereich.
 */
import type { APIRoute } from 'astro';
import { safeNext } from '~/lib/admin/league/auth';
import { STAFF_ROLES, type StaffRole } from '~/lib/db/types';
import { setDemoLogin } from '~/lib/server/auth';
import { isDemoMode } from '~/lib/server/env';

export const prerender = false;

export const POST: APIRoute = async (context) => {
  if (!isDemoMode()) return context.redirect('/admin/login?error=demo_only', 303);
  let form: FormData;
  try {
    form = await context.request.formData();
  } catch {
    return context.redirect('/admin/login', 303);
  }
  const role = String(form.get('role') ?? '');
  if (!(STAFF_ROLES as readonly string[]).includes(role)) return context.redirect('/admin/login', 303);
  setDemoLogin(context.cookies, role as StaffRole);
  const next = safeNext(typeof form.get('next') === 'string' ? (form.get('next') as string) : null);
  return context.redirect(next, 303);
};

export const GET: APIRoute = (context) => context.redirect('/admin/login', 302);
