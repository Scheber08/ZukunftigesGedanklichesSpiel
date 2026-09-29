/**
 * Middleware für dynamische Routen (Worker): Staff-Sitzung für /admin und Admin-Actions,
 * Sicherheits-Header (Plan §10). Statische Seiten bekommen ihre Header über public/_headers.
 */
import { defineMiddleware } from 'astro:middleware';
import { getStaff } from '~/lib/server/auth';

const PUBLIC_ADMIN_PATHS = ['/admin/login', '/admin/auth/'];

function isAdminPath(pathname: string): boolean {
  return pathname === '/admin' || pathname.startsWith('/admin/') || pathname.startsWith('/_actions/admin.');
}

export const onRequest = defineMiddleware(async (context, next) => {
  if (context.isPrerendered) return next();

  const { pathname } = context.url;
  const admin = isAdminPath(pathname);
  if (admin) {
    context.locals.staff = await getStaff(context);
    const open = PUBLIC_ADMIN_PATHS.some((p) => pathname === p || pathname.startsWith(p));
    if (!context.locals.staff && !open && !pathname.startsWith('/_actions/')) {
      return context.redirect(`/admin/login?next=${encodeURIComponent(pathname + context.url.search)}`, 302);
    }
  }

  const response = await next();
  const headers = new Headers(response.headers);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  if (context.url.protocol === 'https:') headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  if (admin) {
    headers.set('X-Robots-Tag', 'noindex, nofollow');
    headers.set('Cache-Control', 'no-store');
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
});
