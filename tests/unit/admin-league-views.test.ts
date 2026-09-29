import { describe, expect, it } from 'vitest';
import { actorKey, auditActors, auditChanges, auditQuery, deletedEntries, filterAudit, parseAuditFilter } from '~/lib/admin/league/audit-view';
import { isAutoSlug, nextDriverSlug } from '~/lib/admin/league/drivers';
import { isTrackMapUrl } from '~/lib/admin/league/forms';
import { adminEntityHref } from '~/lib/admin/league/labels';
import { filterRegistrations, parseRegistrationFilter, registrationCounts, retentionDate, selectableStatuses } from '~/lib/admin/league/registrations';
import { idsToText, rebuildSummary } from '~/lib/admin/league/settings-view';
import { pseudonymizeDriver } from '~/lib/admin/league/ops';
import { MemoryStore } from '~/lib/db/memory-store';
import type { AuditLogRow, RegistrationRow } from '~/lib/db/types';
import { slugify } from '~/lib/domain/text';
import { demoDataset } from '~/lib/seed/demo';
import { recordSlugChange } from '~/lib/server/redirects';

const TS = { created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' };

const log = (id: number, at: string, over: Partial<AuditLogRow> = {}): AuditLogRow => ({
  ...TS,
  id,
  at,
  actor_id: 'u1',
  actor_name: 'Anna',
  action: 'update',
  entity: 'drivers',
  entity_id: '3',
  diff: null,
  ...over,
});

describe('Audit-Log: Vorher/Nachher', () => {
  it('zerlegt verschachtelte Einstellungen und lässt Unverändertes weg', () => {
    const changes = auditChanges({
      before: { webhooks: { news: null, results: 'https://discord.com/api/webhooks/…abcd' } },
      after: { webhooks: { news: 'https://discord.com/api/webhooks/…wxyz', results: 'https://discord.com/api/webhooks/…abcd' } },
    });
    expect(changes).toEqual([{ field: 'webhooks.news', before: 'leer', after: 'https://discord.com/api/webhooks/…wxyz' }]);
  });

  it('zeigt beim Anlegen alle Felder und leere Objekte als JSON', () => {
    expect(auditChanges({ before: null, after: { name: 'S3', lobby_settings: {}, teams: [1, 2] } })).toEqual([
      { field: 'name', before: '–', after: 'S3' },
      { field: 'lobby_settings', before: '–', after: '{}' },
      { field: 'teams', before: '–', after: '[1,2]' },
    ]);
  });
});

describe('Audit-Log: Filter', () => {
  const rows = [
    log(1, '2026-09-28T21:59:00Z'), // 23:59 Liga-Zeit am 28.09.
    log(2, '2026-09-28T22:00:00Z'), // 00:00 Liga-Zeit am 29.09.
    log(3, '2026-09-29T12:00:00Z', { actor_id: null, actor_name: 'System', entity: 'settings', entity_id: 'rebuild' }),
    log(4, '2026-09-30T08:00:00Z', { action: 'delete', entity: 'teams', entity_id: '7', actor_id: 'u2', actor_name: 'Ben' }),
  ];

  it('prüft Query-Parameter und tauscht verdrehte Daten', () => {
    const { filter, errors } = parseAuditFilter(new URLSearchParams('entitaet=drivers&von=2026-09-30&bis=2026-09-01&person=u1&aktion=update&id=3'));
    expect(filter).toEqual({ entity: 'drivers', entityId: '3', action: 'update', actor: 'u1', from: '2026-09-01', to: '2026-09-30' });
    expect(errors).toHaveLength(1);
    const bad = parseAuditFilter(new URLSearchParams('entitaet=DROP TABLE&von=2026-02-30'));
    expect(bad.filter.entity).toBeNull();
    expect(bad.filter.from).toBeNull();
    expect(bad.errors[0]).toMatch(/Von/);
  });

  it('filtert nach Liga-Tag (Europe/Berlin), Person, Bereich und Aktion – neueste zuerst', () => {
    const base = parseAuditFilter(new URLSearchParams()).filter;
    expect(filterAudit(rows, base).map((r) => r.id)).toEqual([4, 3, 2, 1]);
    expect(filterAudit(rows, { ...base, from: '2026-09-29', to: '2026-09-29' }).map((r) => r.id)).toEqual([3, 2]);
    expect(filterAudit(rows, { ...base, to: '2026-09-28' }).map((r) => r.id)).toEqual([1]);
    expect(filterAudit(rows, { ...base, actor: 'System' }).map((r) => r.id)).toEqual([3]);
    expect(filterAudit(rows, { ...base, entity: 'teams', action: 'delete' }).map((r) => r.id)).toEqual([4]);
    expect(filterAudit(rows, { ...base, entity: 'drivers', entityId: '3' }).map((r) => r.id)).toEqual([2, 1]);
  });

  it('listet Personen und baut Filter-Links', () => {
    expect(auditActors(rows)).toEqual([
      { key: 'u1', name: 'Anna' },
      { key: 'u2', name: 'Ben' },
      { key: 'System', name: 'System' },
    ]);
    expect(actorKey({ actor_id: null, actor_name: null })).toBe('System');
    expect(auditQuery({ entity: 'drivers', entityId: '3' })).toBe('?entitaet=drivers&id=3');
    expect(auditQuery({})).toBe('');
    expect([...deletedEntries(rows)]).toEqual(['teams:7']);
  });

  it('verlinkt Einträge auf die passende Admin-Seite', () => {
    expect(adminEntityHref('settings', 'webhooks')).toBe('/admin/einstellungen#webhooks');
    expect(adminEntityHref('settings', 'home,registration')).toBe('/admin/einstellungen#startseite');
    expect(adminEntityHref('decisions', '4')).toBe('/admin/stewards/entscheidung/4');
    expect(adminEntityHref('results', '12')).toBe('/admin/runden/12');
    expect(adminEntityHref('driver_numbers', '3')).toBe('/admin/fahrer/3');
    expect(adminEntityHref('rounds', null)).toBeNull();
    expect(adminEntityHref('unknown', '1')).toBeNull();
  });
});

describe('Streckenkarte', () => {
  it('erlaubt nur SVG unter /brand/tracks/ oder per https', () => {
    expect(isTrackMapUrl('/brand/tracks/silverstone.svg')).toBe(true);
    expect(isTrackMapUrl('/brand/tracks/spa-francorchamps.min.svg')).toBe(true);
    expect(isTrackMapUrl('https://upload.wikimedia.org/wikipedia/commons/a/ab/Circuit_Silverstone.svg')).toBe(true);
    expect(isTrackMapUrl('http://example.com/x.svg')).toBe(false);
    expect(isTrackMapUrl('https://example.com/x.png')).toBe(false);
    expect(isTrackMapUrl('https://user:pw@example.com/x.svg')).toBe(false);
    expect(isTrackMapUrl('/brand/tracks/../secret.svg')).toBe(false);
    expect(isTrackMapUrl('/brand/tracks/sub/x.svg')).toBe(false);
    expect(isTrackMapUrl('//evil.example/x.svg')).toBe(false);
    expect(isTrackMapUrl('/brand/logo.svg')).toBe(false);
    expect(isTrackMapUrl('javascript:alert(1)//x.svg')).toBe(false);
    expect(isTrackMapUrl('')).toBe(false);
  });
});

describe('Anmeldungen', () => {
  const reg = (id: number, status: RegistrationRow['status'], created: string, over: Partial<RegistrationRow> = {}) =>
    ({
      ...TS,
      id,
      status,
      created_at: created,
      gamertag: `Fahrer${id}`,
      discord_username: `discord${id}`,
      ea_id: null,
      desired_number: 10 + id,
      processed_at: null,
      driver_id: null,
      ...over,
    }) as RegistrationRow;
  const rows = [
    reg(1, 'accepted', '2026-09-01T10:00:00Z'),
    reg(2, 'new', '2026-09-20T10:00:00Z'),
    reg(3, 'new', '2026-09-10T10:00:00Z', { discord_username: 'nele_racing' }),
    reg(4, 'rejected', '2026-09-05T10:00:00Z'),
    reg(5, 'accepted', '2026-09-15T10:00:00Z'),
    reg(6, 'waitlist', '2026-09-02T10:00:00Z'),
  ];

  it('sortiert offene zuerst (älteste oben), abgeschlossene neueste zuerst', () => {
    const f = parseRegistrationFilter(new URLSearchParams());
    expect(filterRegistrations(rows, f).map((r) => r.id)).toEqual([3, 2, 6, 5, 1, 4]);
  });

  it('filtert nach Status und Suche (Gamertag, Discord, Wunschnummer)', () => {
    expect(filterRegistrations(rows, { status: 'new', q: '' }).map((r) => r.id)).toEqual([3, 2]);
    expect(filterRegistrations(rows, { status: null, q: 'NELE' }).map((r) => r.id)).toEqual([3]);
    expect(filterRegistrations(rows, { status: null, q: '16' }).map((r) => r.id)).toEqual([6]);
    expect(parseRegistrationFilter(new URLSearchParams('status=kaputt')).status).toBeNull();
    expect(registrationCounts(rows)).toEqual({ new: 2, contacted: 0, accepted: 2, waitlist: 1, rejected: 1 });
  });

  it('berechnet die Löschfrist abgelehnter Anmeldungen (6 Monate)', () => {
    expect(retentionDate(reg(9, 'rejected', '2026-01-10T10:00:00Z', { processed_at: '2026-02-01T12:00:00Z' }))?.toISOString()).toBe(
      '2026-08-01T12:00:00.000Z',
    );
    expect(retentionDate(reg(9, 'new', '2026-01-10T10:00:00Z'))).toBeNull();
  });

  it('bietet „Angenommen“ nur bei verknüpftem Fahrer an', () => {
    expect(selectableStatuses({ driver_id: null })).not.toContain('accepted');
    expect(selectableStatuses({ driver_id: 4 })).toContain('accepted');
  });
});

describe('Einstellungen', () => {
  const now = new Date('2026-09-29T12:00:00Z');
  it('fasst den Neubau-Stand zusammen', () => {
    expect(rebuildSummary({ requested_at: null, dispatched_at: null, reason: null }, now).state).toBe('never');
    expect(rebuildSummary({ requested_at: '2026-09-29T11:59:30Z', dispatched_at: null, reason: 'x' }, now).state).toBe('waiting');
    expect(rebuildSummary({ requested_at: '2026-09-29T11:50:00Z', dispatched_at: '2026-09-29T11:40:00Z', reason: 'x' }, now).state).toBe('queued');
    expect(rebuildSummary({ requested_at: '2026-09-29T11:00:00Z', dispatched_at: null, reason: 'x' }, now).detail).toMatch(/GITHUB_DISPATCH_TOKEN/);
    expect(rebuildSummary({ requested_at: '2026-09-29T11:50:00Z', dispatched_at: '2026-09-29T11:51:00Z', reason: 'x' }, now).state).toBe('done');
    expect(idsToText(['1', '2'])).toBe('1\n2');
  });
});

describe('Fahrer-Slugs', () => {
  it('erkennt automatisch erzeugte Slugs', () => {
    expect(isAutoSlug('kurvenkoenig', 'Kurvenkönig')).toBe(true);
    expect(isAutoSlug('kurvenkoenig-2', 'Kurvenkönig')).toBe(true);
    expect(isAutoSlug('der-koenig', 'Kurvenkönig')).toBe(false);
    expect(isAutoSlug('kurvenkoenig-x', 'Kurvenkönig')).toBe(false);
  });

  it('lässt den Slug dem Gamertag folgen, solange er nicht selbst geändert wurde', () => {
    const before = { slug: 'latebrakelukas', gamertag: 'LateBrakeLukas' };
    const taken = ['latebrakelukas', 'other'];
    // Gamertag geändert, Slug-Feld unverändert → neuer Slug
    expect(nextDriverSlug({ gamertag: 'LateApex', slug: 'latebrakelukas' }, before, taken)).toEqual({ slug: 'lateapex', custom: false });
    // Slug-Feld geleert → ebenso
    expect(nextDriverSlug({ gamertag: 'LateApex', slug: '' }, before, taken).slug).toBe('lateapex');
    // eigener Slug gewinnt
    expect(nextDriverSlug({ gamertag: 'LateApex', slug: 'lukas' }, before, taken)).toEqual({ slug: 'lukas', custom: true });
    // nur Schreibweise geändert → gleicher Slug
    expect(nextDriverSlug({ gamertag: 'latebrakelukas', slug: 'latebrakelukas' }, before, taken).slug).toBe('latebrakelukas');
    // eigener (nicht automatischer) Slug bleibt bei Umbenennung
    expect(nextDriverSlug({ gamertag: 'LateApex', slug: 'lukas-f1' }, { slug: 'lukas-f1', gamertag: 'LateBrakeLukas' }, taken).slug).toBe('lukas-f1');
    // Kollision wird hochgezählt
    expect(nextDriverSlug({ gamertag: 'Other', slug: 'latebrakelukas' }, before, taken).slug).toBe('other-2');
    // neuer Fahrer
    expect(nextDriverSlug({ gamertag: 'Neu', slug: '' }, null, taken)).toEqual({ slug: 'neu', custom: false });
  });
});

describe('Weiterleitungen und Pseudonymisierung', () => {
  it('legt bei der Pseudonymisierung keine Weiterleitung an und entfernt alte', async () => {
    const store = new MemoryStore(demoDataset(new Date()));
    const current = slugify('Kurvenkönig');
    const [driver] = await store.select('drivers', { eq: { slug: current } });
    expect(driver).toBeDefined();
    // frühere Umbenennung (Seed: kurvenkoenig-alt → kurvenkoenig) plus eine zweite
    await recordSlugChange(store, 'driver', 'koenig-der-kurven', current);
    expect((await store.select('slug_redirects', { eq: { entity: 'driver', new_slug: current } })).length).toBe(2);

    const res = await pseudonymizeDriver(store, driver!.id);
    expect(res.driver.slug).not.toBe(current);
    const redirects = await store.select('slug_redirects', { eq: { entity: 'driver' } });
    // weder alte Namen noch der letzte Slug leiten auf das Pseudonym (Datenschutz: alte URL → 404)
    expect(redirects.filter((r) => r.new_slug === current || r.old_slug === current || r.new_slug === res.driver.slug)).toEqual([]);
    expect(redirects.some((r) => r.old_slug === 'kurvenkoenig-alt')).toBe(false);
  });
});
