<script lang="ts">
  /**
   * Bild-Upload (Plan §7.5): Die Datei wird im Browser verkleinert (längste Kante 1600 px
   * und 800 px), als WebP neu kodiert – dabei fallen EXIF-Daten wie GPS-Position weg – und
   * dann über eine signierte Upload-URL direkt in den Supabase-Bucket „media“ geladen.
   * Klappt der direkte Upload nicht, geht es über den eigenen Server (/api/admin/upload).
   * Im Demo-Modus (ohne Supabase) wird eine kleine Data-URL (800 px) gespeichert.
   *
   * Das Ergebnis landet in einem versteckten Formularfeld (`name`) – gespeichert wird mit dem Formular.
   */
  import { tick, untrack } from 'svelte';
  import {
    DEMO_MAX_DATA_URL_CHARS,
    fitWithin,
    MAX_UPLOAD_BYTES,
    mediaVariantUrl,
    UPLOAD_CONTENT_TYPE,
    WEBP_QUALITY,
    type MediaKind,
  } from '~/lib/admin/content/media';

  interface Props {
    name: string;
    id: string;
    label: string;
    kind: MediaKind;
    value?: string | null;
    hint?: string | null;
    error?: string | null;
    /** Vorschau-Format: Titelbild 16:9, Logo/Avatar quadratisch */
    aspect?: 'video' | 'square';
  }

  let { name, id, label, kind, value = '', hint = null, error = null, aspect = 'video' }: Props = $props();

  let url = $state(untrack(() => value ?? ''));
  let busy = $state(false);
  let message = $state('');
  let problem = $state('');
  let demoNote = $state(false);
  let dragging = $state(false);
  let hidden: HTMLInputElement | undefined = $state();
  let fileInput: HTMLInputElement | undefined = $state();

  const preview = $derived(url ? (mediaVariantUrl(url, 800) ?? url) : '');
  const MAX_INPUT_BYTES = 30 * 1024 * 1024;
  const QUALITIES = [WEBP_QUALITY, 0.72, 0.62, 0.5];

  type Source = ImageBitmap | HTMLImageElement;

  async function decode(file: File): Promise<Source> {
    if (typeof createImageBitmap === 'function' && file.type !== 'image/svg+xml') {
      try {
        // EXIF-Drehung übernehmen, bevor die Metadaten wegfallen
        return await createImageBitmap(file, { imageOrientation: 'from-image' });
      } catch {
        /* Fallback unten */
      }
    }
    const src = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.decoding = 'async';
      img.src = src;
      await img.decode();
      return img;
    } catch {
      // z. B. HEIC in Chrome/Firefox oder beschädigte Dateien
      throw new Error('Dein Browser kann dieses Bildformat nicht lesen. Bitte als JPG, PNG oder WebP speichern und erneut wählen.');
    } finally {
      // Nach decode() ist das Bild im Speicher
      setTimeout(() => URL.revokeObjectURL(src), 1000);
    }
  }

  function sizeOf(src: Source): { width: number; height: number } {
    return src instanceof HTMLImageElement ? { width: src.naturalWidth || 1200, height: src.naturalHeight || 1200 } : { width: src.width, height: src.height };
  }

  function draw(src: Source, width: number, height: number): HTMLCanvasElement {
    // Stufenweise halbieren – deutlich schärfer als ein einziger großer Sprung
    let current: CanvasImageSource = src;
    let { width: cw, height: ch } = sizeOf(src);
    while (cw / 2 >= width * 1.5 && ch / 2 >= height * 1.5) {
      const step = document.createElement('canvas');
      step.width = Math.round(cw / 2);
      step.height = Math.round(ch / 2);
      const sctx = step.getContext('2d')!;
      sctx.imageSmoothingQuality = 'high';
      sctx.drawImage(current, 0, 0, step.width, step.height);
      current = step;
      cw = step.width;
      ch = step.height;
    }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(current, 0, 0, width, height);
    return canvas;
  }

  function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (!blob) return reject(new Error('Das Bild konnte nicht umgewandelt werden.'));
          if (blob.type !== UPLOAD_CONTENT_TYPE) {
            return reject(new Error('Dein Browser kann kein WebP erzeugen. Bitte nutze einen aktuellen Chrome, Edge, Firefox oder Safari.'));
          }
          resolve(blob);
        },
        UPLOAD_CONTENT_TYPE,
        quality,
      );
    });
  }

  /** WebP unter der Größengrenze erzeugen (Qualität notfalls schrittweise senken). */
  async function encode(src: Source, max: number, limitBytes: number): Promise<Blob> {
    const { width, height } = sizeOf(src);
    const target = fitWithin(width, height, max);
    const canvas = draw(src, target.width, target.height);
    for (const q of QUALITIES) {
      const blob = await toBlob(canvas, q);
      if (blob.size <= limitBytes) return blob;
    }
    throw new Error(`Das Bild (${max} px) ist auch stark komprimiert noch zu groß.`);
  }

  function blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('Das Bild konnte nicht gelesen werden.'));
      reader.readAsDataURL(blob);
    });
  }

  async function putSigned(signedUrl: string, blob: Blob, headers: Record<string, string>): Promise<void> {
    const body = new FormData();
    body.append('cacheControl', '31536000');
    body.append('', blob);
    const res = await fetch(signedUrl, { method: 'PUT', body, headers: { 'x-upsert': 'false', ...headers } });
    if (!res.ok) throw new Error(`Upload fehlgeschlagen (${res.status}).`);
  }

  async function viaServer(big: Blob, small: Blob): Promise<string> {
    const body = new FormData();
    body.append('kind', kind);
    body.append('file_1600', big, 'bild-1600.webp');
    body.append('file_800', small, 'bild-800.webp');
    const res = await fetch('/api/admin/upload', { method: 'POST', body, headers: { accept: 'application/json' } });
    const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
    if (!res.ok || !data.url) throw new Error(data.error ?? `Upload fehlgeschlagen (${res.status}).`);
    return data.url;
  }

  async function setUrl(next: string) {
    url = next;
    await tick();
    hidden?.dispatchEvent(new Event('input', { bubbles: true }));
  }

  async function handle(file: File | undefined | null) {
    if (!file) return;
    problem = '';
    message = '';
    demoNote = false;
    if (!file.type.startsWith('image/')) {
      problem = 'Bitte eine Bilddatei wählen (JPG, PNG, WebP oder SVG).';
      return;
    }
    if (file.size > MAX_INPUT_BYTES) {
      problem = 'Die Datei ist größer als 30 MB.';
      return;
    }
    busy = true;
    try {
      message = 'Bild wird verkleinert …';
      const src = await decode(file);
      const big = await encode(src, 1600, MAX_UPLOAD_BYTES);
      const small = await encode(src, 800, MAX_UPLOAD_BYTES);
      if ('close' in src) src.close();

      message = 'Upload wird vorbereitet …';
      const res = await fetch('/api/admin/upload-url', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ kind, contentType: UPLOAD_CONTENT_TYPE, sizes: { 1600: big.size, 800: small.size } }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        demo?: boolean;
        error?: string;
        url?: string;
        headers?: Record<string, string>;
        uploads?: Array<{ size: number; signedUrl: string }>;
      };
      if (!res.ok) throw new Error(data.error ?? `Upload nicht möglich (${res.status}).`);

      if (data.demo) {
        // Demo: kleine Data-URL statt Storage
        let demoBlob = small;
        let dataUrl = await blobToDataUrl(demoBlob);
        if (dataUrl.length > DEMO_MAX_DATA_URL_CHARS) {
          demoBlob = await encode(await decode(file), 800, Math.floor((DEMO_MAX_DATA_URL_CHARS * 3) / 4) - 100);
          dataUrl = await blobToDataUrl(demoBlob);
        }
        await setUrl(dataUrl);
        demoNote = true;
        message = `Bild übernommen (${Math.round(demoBlob.size / 1024)} KB, WebP).`;
        return;
      }

      message = 'Bild wird hochgeladen …';
      let finalUrl = data.url ?? '';
      try {
        if (!data.uploads?.length || !finalUrl) throw new Error('Keine Upload-URL erhalten.');
        await Promise.all(data.uploads.map((u) => putSigned(u.signedUrl, u.size === 1600 ? big : small, data.headers ?? {})));
      } catch {
        // z. B. blockiert durch die Content-Security-Policy → über den eigenen Server
        finalUrl = await viaServer(big, small);
      }
      await setUrl(finalUrl);
      message = `Hochgeladen: ${Math.round(big.size / 1024)} KB (1600 px) und ${Math.round(small.size / 1024)} KB (800 px), ohne EXIF-Daten.`;
    } catch (err) {
      problem = err instanceof Error ? err.message : 'Upload fehlgeschlagen.';
      message = '';
    } finally {
      busy = false;
      if (fileInput) fileInput.value = '';
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    dragging = false;
    if (busy) return;
    void handle(e.dataTransfer?.files?.[0]);
  }

  async function remove() {
    await setUrl('');
    message = 'Bild entfernt – speichere das Formular, um die Änderung zu übernehmen.';
    demoNote = false;
  }
</script>

<div class="field upload">
  <span class="label" id={`${id}-label`}>{label}</span>
  <input type="hidden" {name} value={url} bind:this={hidden} />

  <div
    class="drop"
    class:dragging
    data-aspect={aspect}
    role="group"
    aria-labelledby={`${id}-label`}
    ondragover={(e) => {
      e.preventDefault();
      dragging = true;
    }}
    ondragleave={() => (dragging = false)}
    ondrop={onDrop}
  >
    {#if preview}
      <img src={preview} alt={`Vorschau: ${label}`} class="thumb" data-aspect={aspect} />
    {:else}
      <p class="empty">Kein Bild. Datei hierher ziehen oder auswählen.</p>
    {/if}

    <div class="actions">
      <label class="btn btn-secondary btn-sm picker" class:disabled={busy}>
        <input
          bind:this={fileInput}
          {id}
          type="file"
          accept="image/*"
          class="sr-only"
          disabled={busy}
          aria-describedby={[`${id}-status`, hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(' ')}
          onchange={(e) => handle((e.currentTarget as HTMLInputElement).files?.[0])}
        />
        {url ? 'Anderes Bild wählen' : 'Bild wählen'}
      </label>
      {#if url}
        <button type="button" class="btn btn-ghost btn-sm" onclick={remove} disabled={busy}>Bild entfernen</button>
      {/if}
    </div>
  </div>

  <p class="status" id={`${id}-status`} role="status" aria-live="polite">
    {#if busy}<span class="spinner" aria-hidden="true"></span>{/if}
    {message}
  </p>
  {#if demoNote}
    <p class="alert alert-warning text-sm">
      Demo-Modus: Ohne Supabase wird das Bild nur als kleine Data-URL (800 px) im Speicher abgelegt und ist nach einem Neustart weg.
    </p>
  {/if}
  {#if problem}<p class="field-error" role="alert">{problem}</p>{/if}
  {#if hint}<p class="field-hint" id={`${id}-hint`}>{hint}</p>{/if}
  {#if error}<p class="field-error" id={`${id}-error`} role="alert">{error}</p>{/if}
</div>

<style>
  .drop {
    display: grid;
    gap: 0.75rem;
    padding: 0.75rem;
    border: 1px dashed var(--color-border);
    border-radius: var(--radius-control);
    background: var(--color-surface-2);
  }
  .drop.dragging {
    border-color: var(--color-teal);
  }
  .thumb {
    width: 100%;
    max-width: 28rem;
    border-radius: 6px;
    background: var(--color-bg);
    object-fit: cover;
  }
  .thumb[data-aspect='video'] {
    aspect-ratio: 16 / 9;
  }
  .thumb[data-aspect='square'] {
    max-width: 10rem;
    aspect-ratio: 1;
    object-fit: contain;
  }
  .empty {
    color: var(--color-muted);
    font-size: var(--fs-small);
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .actions :global(.btn) {
    min-height: 44px;
  }
  .picker:focus-within {
    outline: 2px solid var(--color-teal);
    outline-offset: 2px;
  }
  .picker.disabled {
    opacity: 0.5;
    cursor: progress;
  }
  .status {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-height: 1.25rem;
    font-size: var(--fs-small);
    color: var(--color-muted);
  }
</style>
