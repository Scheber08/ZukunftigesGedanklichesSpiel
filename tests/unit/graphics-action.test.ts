/**
 * Action admin.graphicsSend gegen den Memory-Store: Rollen, PNG-Prüfung, fehlender Webhook,
 * Discord-Post mit Bild-Embed (attachment://…) und Audit-Eintrag. `astro:actions` ist durch eine
 * schlanke Nachbildung ersetzt (Handler direkt aufrufbar), Discord ist gemockt.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  notifyWithFile: vi.fn(async (..._args: unknown[]) => true),
}));

vi.mock('astro:actions', () => {
  class ActionError extends Error {
    code: string;
    type = 'AstroActionError';
    constructor({ code, message }: { code: string; message?: string }) {
      super(message ?? code);
      this.code = code;
    }
  }
  return { ActionError, defineAction: (config: unknown) => config };
});
vi.mock('~/lib/server/discord', () => ({ notifyWithFile: mocks.notifyWithFile, EMBED_GREEN: 0x37be89 }));

import { graphicsActions } from '~/actions/admin/graphics';
import { MemoryStore } from '~/lib/db/memory-store';
import type { StaffRole } from '~/lib/db/types';
import { demoStaff } from '~/lib/server/auth';
import { getServiceStore } from '~/lib/server/db';
import { patchSetting } from '~/lib/server/settings';
import { demoDataset } from '~/lib/seed/demo';

type Handler = (input: Record<string, unknown>, context: unknown) => Promise<unknown>;
const handler = (graphicsActions.graphicsSend as unknown as { handler: Handler }).handler;

function ctx(role: StaffRole | null) {
  return { locals: { staff: role ? demoStaff(role) : null } };
}

/** PNG mit Signatur und IHDR (Maße wählbar) plus Füllbytes */
function png(width = 1080, height = 1350, extra = 200, name = 'ergebnis-s2-r4-instagram.png', type = 'image/png'): File {
  const bytes = new Uint8Array(24 + extra);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return new File([bytes], name, { type });
}

async function fails(input: Record<string, unknown>, role: StaffRole | null = 'redakteur') {
  try {
    await handler(input, ctx(role));
  } catch (err) {
    return { code: (err as { code?: string }).code, message: (err as Error).message };
  }
  throw new Error('graphicsSend hätte scheitern müssen');
}

const WEBHOOK = 'https://discord.com/api/webhooks/123/abc';

beforeEach(async () => {
  globalThis.__ligaMemoryStore = new MemoryStore(demoDataset());
  mocks.notifyWithFile.mockReset();
  mocks.notifyWithFile.mockResolvedValue(true);
});

describe('admin.graphicsSend', () => {
  it('nur Redaktion und Admins', async () => {
    await patchSetting(getServiceStore(), 'webhooks', { graphics: WEBHOOK });
    expect((await fails({ file: png(), title: 'x' }, null)).code).toBe('UNAUTHORIZED');
    expect((await fails({ file: png(), title: 'x' }, 'steward')).code).toBe('FORBIDDEN');
    expect(mocks.notifyWithFile).not.toHaveBeenCalled();
    await expect(handler({ file: png(), title: 'Admin darf' }, ctx('admin'))).resolves.toMatchObject({ sent: true });
  });

  it('ohne Webhook für „Grafiken“: verständlicher Fehler, kein Versand', async () => {
    const res = await fails({ file: png(), title: 'Ergebnis' });
    expect(res.code).toBe('PRECONDITION_FAILED');
    expect(res.message).toContain('Einstellungen');
    expect(mocks.notifyWithFile).not.toHaveBeenCalled();
  });

  it('prüft Typ, Signatur, Größe und Format', async () => {
    await patchSetting(getServiceStore(), 'webhooks', { graphics: WEBHOOK });
    expect((await fails({ file: png(1080, 1350, 200, 'a.png', 'image/jpeg'), title: 'x' })).code).toBe('UNSUPPORTED_MEDIA_TYPE');
    expect((await fails({ file: new File([new TextEncoder().encode('kein png, nur text ....................')], 'a.png', { type: 'image/png' }), title: 'x' })).code).toBe(
      'UNSUPPORTED_MEDIA_TYPE',
    );
    expect((await fails({ file: png(1080, 1350, 8 * 1024 * 1024), title: 'x' })).code).toBe('CONTENT_TOO_LARGE');
    expect((await fails({ file: png(640, 480), title: 'x' })).code).toBe('BAD_REQUEST');
    expect((await fails({ file: new File([], 'leer.png', { type: 'image/png' }), title: 'x' })).code).toBe('BAD_REQUEST');
    expect(mocks.notifyWithFile).not.toHaveBeenCalled();
  });

  it('postet die Grafik als Bild-Embed und protokolliert', async () => {
    const store = getServiceStore();
    await patchSetting(store, 'webhooks', { graphics: WEBHOOK });
    const file = png(1280, 720, 500, '../../Ergebnis S2 R4.png');
    const res = await handler({ file, title: 'Rennergebnis · R4 · Miami', description: 'Alt-Text' }, ctx('redakteur'));
    expect(res).toEqual({ sent: true, file: 'ergebnis-s2-r4.png' });

    expect(mocks.notifyWithFile).toHaveBeenCalledTimes(1);
    const [, channel, embed, attachment] = mocks.notifyWithFile.mock.calls[0] as [unknown, string, Record<string, unknown>, { name: string; data: ArrayBuffer; contentType: string }];
    expect(channel).toBe('graphics');
    expect(embed).toMatchObject({ title: 'Rennergebnis · R4 · Miami', description: 'Alt-Text', image: { url: 'attachment://ergebnis-s2-r4.png' } });
    expect(attachment.name).toBe('ergebnis-s2-r4.png');
    expect(attachment.contentType).toBe('image/png');
    expect(attachment.data.byteLength).toBe(file.size);

    const log = (await store.select('audit_log')).filter((a) => a.entity === 'graphics');
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ action: 'publish', entity_id: 'ergebnis-s2-r4.png', actor_name: demoStaff('redakteur').name });
    expect(JSON.stringify(log[0]!.diff)).toContain('"sent":true');
  });

  it('meldet, wenn Discord die Grafik ablehnt (und protokolliert den Versuch)', async () => {
    const store = getServiceStore();
    await patchSetting(store, 'webhooks', { graphics: WEBHOOK });
    mocks.notifyWithFile.mockResolvedValue(false);
    const res = await fails({ file: png(), title: 'Ergebnis' });
    expect(res.code).toBe('BAD_GATEWAY');
    const log = (await store.select('audit_log')).filter((a) => a.entity === 'graphics');
    expect(JSON.stringify(log[0]!.diff)).toContain('"sent":false');
  });
});
