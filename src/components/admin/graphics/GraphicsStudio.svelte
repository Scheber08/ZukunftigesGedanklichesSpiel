<script lang="ts">
  /**
   * Social-Grafiken (Plan Phase 2): Motiv, Saison/Runde bzw. Fahrer, Format und Sprache wählen,
   * Live-Vorschau auf einem <canvas> (skaliert, mit Alt-Text), Download als PNG und Versand an
   * den Discord-Channel „Grafiken“. Erzeugt wird komplett im Browser (kein Worker-Rendering).
   *
   * Vor dem Zeichnen werden die Astro-Schriften geladen: Die tatsächlichen Familiennamen stehen
   * in den CSS-Variablen --font-titillium und --font-inter.
   */
  import { onMount, tick, untrack } from 'svelte';
  import { drawGraphic, loadSvgImage, type DrawAssets } from '~/lib/graphics/draw';
  import { formatBytes, MAX_GRAPHIC_BYTES } from '~/lib/graphics/files';
  import { fontLoadSpecs, resolveFamilies, type FontFamilies } from '~/lib/graphics/fonts';
  import { FORMAT_IDS, FORMATS, formatSize, type FormatId } from '~/lib/graphics/formats';
  import {
    buildModel,
    driverOptions,
    MOTIF_IDS,
    MOTIFS,
    normalizeSelection,
    roundOptions,
    selectionToParams,
    type MotifId,
    type Selection,
  } from '~/lib/graphics/motifs';
  import type { GraphicsSource } from '~/lib/graphics/source';
  import { svgAspect, withSvgSize } from '~/lib/graphics/svg';

  interface Props {
    /** id des <script type="application/json"> mit der Datenquelle (kompakter als Island-Props) */
    dataId: string;
    initial?: Partial<Selection>;
    /** Webhook für den Channel „Grafiken“ hinterlegt? */
    webhookReady: boolean;
    /** Darf die Einstellungen öffnen (Admin)? */
    canEditSettings: boolean;
    /** Liga-Logo aus public/brand (leer = Wortmarke mit Platzhalter-Symbol) */
    logoUrl?: string | null;
    /** Aquarell-/Steintextur (SITE.heroTexture), leer = ohne */
    textureUrl?: string | null;
  }

  let { dataId, initial = {}, webhookReady, canEditSettings, logoUrl = '/brand/logo-symbol-gradient.svg', textureUrl = null }: Props = $props();

  const EMPTY_SOURCE: GraphicsSource = {
    brand: { name: '', shortName: '', host: '' },
    now: new Date().toISOString(),
    currentSeasonId: null,
    seasons: [],
    teams: [],
    drivers: [],
    flags: {},
  };

  function readSource(id: string): GraphicsSource | null {
    try {
      const text = document.getElementById(id)?.textContent;
      return text ? (JSON.parse(text) as GraphicsSource) : null;
    } catch {
      return null;
    }
  }

  const loaded = untrack(() => readSource(dataId));
  const source: GraphicsSource = loaded ?? EMPTY_SOURCE;

  let sel = $state<Selection>(untrack(() => normalizeSelection(source, initial)));
  const result = $derived(buildModel(source, sel));
  const model = $derived(result.ok ? result.model : null);
  const format = $derived(FORMATS[sel.format]);
  const rounds = $derived(roundOptions(source, sel.seasonId, sel.motif));
  const driverList = $derived(driverOptions(source, sel.seasonId));
  const motif = $derived(MOTIFS[sel.motif]);

  let canvas: HTMLCanvasElement | undefined = $state();
  let fonts = $state.raw<FontFamilies | null>(null);
  let assets = $state.raw<DrawAssets>({ logo: null, logoAspect: 1, flags: {} });
  let useImages = $state(true);
  let ready = $state(false);
  let fontWarning = $state(false);
  let busy = $state<null | 'download' | 'send'>(null);
  let confirming = $state(false);
  let message = $state('');
  let problem = $state('');
  let lastBytes = $state<number | null>(null);
  let confirmButton: HTMLButtonElement | undefined = $state();
  let sendButton: HTMLButtonElement | undefined = $state();

  const NO_IMAGES: DrawAssets = { logo: null, logoAspect: 1, flags: {} };

  function update(patch: Partial<Selection>) {
    sel = normalizeSelection(source, { ...sel, ...patch });
    confirming = false;
    problem = '';
    message = '';
    lastBytes = null;
  }

  function paint() {
    if (!canvas || !model || !fonts) return;
    const f = FORMATS[sel.format];
    if (canvas.width !== f.width) canvas.width = f.width;
    if (canvas.height !== f.height) canvas.height = f.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    drawGraphic(ctx, model, sel.format, {
      brand: { name: source.brand.name, host: source.brand.host },
      fonts,
      assets: useImages ? assets : NO_IMAGES,
    });
  }

  // Neu zeichnen, sobald sich Auswahl, Schriften oder Bilder ändern
  $effect(() => {
    void model;
    void sel.format;
    void assets;
    void useImages;
    if (ready) paint();
  });

  // Auswahl in der Adresse merken (Neuladen und Teilen zeigen dieselbe Grafik)
  $effect(() => {
    const query = selectionToParams(sel);
    try {
      history.replaceState(history.state, '', `${location.pathname}?${query}`);
    } catch {
      /* z. B. in eingebetteten Vorschauen */
    }
  });

  function timeout(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function loadFonts(): Promise<FontFamilies> {
    const style = getComputedStyle(document.documentElement);
    const families = resolveFamilies((name) => style.getPropertyValue(name));
    const specs = fontLoadSpecs(families);
    try {
      await Promise.race([Promise.all(specs.map((spec) => document.fonts.load(spec))), timeout(8000)]);
    } catch {
      /* Prüfung unten */
    }
    fontWarning = !specs.every((spec) => document.fonts.check(spec));
    return families;
  }

  async function loadAssets(): Promise<DrawAssets> {
    let logo: CanvasImageSource | null = null;
    let logoAspect = 1;
    if (logoUrl) {
      try {
        const res = await fetch(logoUrl, { headers: { accept: 'image/svg+xml' } });
        if (res.ok) {
          const svg = await res.text();
          logoAspect = svgAspect(svg);
          logo = await loadSvgImage(withSvgSize(svg, Math.round(256 * logoAspect), 256));
        }
      } catch {
        logo = null;
      }
    }
    const flags: Record<string, CanvasImageSource> = {};
    await Promise.all(
      Object.entries(source.flags).map(async ([code, svg]) => {
        try {
          flags[code] = await loadSvgImage(withSvgSize(svg, 150, 100));
        } catch {
          /* ohne Flagge */
        }
      }),
    );
    let texture: DrawAssets['texture'] = null;
    if (textureUrl) {
      try {
        const img = new Image();
        img.decoding = 'async';
        img.src = textureUrl;
        await img.decode();
        texture = { image: img, width: img.naturalWidth, height: img.naturalHeight };
      } catch {
        texture = null;
      }
    }
    return { logo, logoAspect, flags, texture };
  }

  onMount(() => {
    let cancelled = false;
    message = 'Schriften und Logo werden geladen …';
    void (async () => {
      const [families, loaded] = await Promise.all([loadFonts(), loadAssets()]);
      if (cancelled) return;
      fonts = families;
      assets = loaded;
      ready = true;
      message = '';
      await tick();
      paint();
    })();
    return () => {
      cancelled = true;
    };
  });

  function canvasBlob(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      if (!canvas) return reject(new Error('Keine Vorschau vorhanden.'));
      try {
        canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Die Grafik konnte nicht als PNG erzeugt werden.'))), 'image/png');
      } catch (err) {
        reject(err);
      }
    });
  }

  /** PNG erzeugen; blockiert der Browser den Export wegen eingebundener Bilder, ohne Bilder erneut. */
  async function exportPng(): Promise<Blob> {
    paint();
    try {
      return await canvasBlob();
    } catch (err) {
      if (err instanceof DOMException && err.name === 'SecurityError' && useImages) {
        useImages = false;
        paint();
        return await canvasBlob();
      }
      throw err;
    }
  }

  async function download() {
    if (!model || busy) return;
    busy = 'download';
    problem = '';
    message = 'PNG wird erzeugt …';
    try {
      const blob = await exportPng();
      lastBytes = blob.size;
      const href = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = href;
      a.download = model.fileName;
      a.rel = 'noopener';
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(href), 30_000);
      message = `PNG gespeichert: ${model.fileName} (${formatBytes(blob.size)}).`;
    } catch (err) {
      message = '';
      problem = err instanceof Error ? err.message : 'Die Grafik konnte nicht gespeichert werden.';
    } finally {
      busy = null;
    }
  }

  async function askSend() {
    if (!model || !webhookReady || busy) return;
    confirming = true;
    await tick();
    confirmButton?.focus();
  }

  async function cancelSend() {
    confirming = false;
    await tick();
    sendButton?.focus();
  }

  async function send() {
    if (!model || !webhookReady || busy) return;
    const current = model;
    confirming = false;
    busy = 'send';
    problem = '';
    message = 'Grafik wird an Discord gesendet …';
    try {
      const blob = await exportPng();
      lastBytes = blob.size;
      if (blob.size > MAX_GRAPHIC_BYTES) throw new Error(`Die Grafik ist mit ${formatBytes(blob.size)} zu groß für Discord (höchstens 8 MB).`);
      const form = new FormData();
      form.append('file', new File([blob], current.fileName, { type: 'image/png' }));
      form.append('title', current.discordTitle.slice(0, 200));
      form.append('description', current.alt.slice(0, 1500));
      const { actions } = await import('astro:actions');
      const res = await actions.admin.graphicsSend(form);
      if (res.error) {
        const tooLarge = res.error.code === 'CONTENT_TOO_LARGE' && /exceeds/i.test(res.error.message);
        throw new Error(tooLarge ? `Die Grafik (${formatBytes(blob.size)}) ist größer, als der Server annimmt. Bitte als PNG herunterladen und manuell posten.` : res.error.message);
      }
      message = `An Discord gesendet (#grafiken): ${res.data.file} (${formatBytes(blob.size)}).`;
    } catch (err) {
      message = '';
      problem = err instanceof Error ? err.message : 'Senden fehlgeschlagen.';
    } finally {
      busy = null;
      await tick();
      sendButton?.focus();
    }
  }

  async function copyAlt() {
    if (!model) return;
    try {
      await navigator.clipboard.writeText(model.alt);
      message = 'Alt-Text kopiert.';
    } catch {
      problem = 'Kopieren nicht möglich – bitte den Text im Feld markieren und kopieren.';
    }
  }

  const seasonLabelOf = (s: GraphicsSource['seasons'][number]) =>
    `${s.name || `Saison ${s.number}`}${s.status === 'active' ? ' (aktiv)' : s.status === 'planned' ? ' (geplant)' : ''}`;
</script>

{#if !loaded}
  <p class="alert alert-danger" role="alert">Die Daten für die Grafiken konnten nicht gelesen werden. Bitte die Seite neu laden.</p>
{/if}

<div class="studio" class:hidden-frame={!loaded}>
  <form class="controls card" aria-labelledby="g-controls-title" onsubmit={(e) => e.preventDefault()}>
    <h2 id="g-controls-title" class="text-xl uppercase">Auswahl</h2>

    <div class="field">
      <label class="label" for="g-motif">Motiv</label>
      <select
        id="g-motif"
        class="select"
        value={sel.motif}
        aria-describedby="g-motif-hint"
        onchange={(e) => update({ motif: e.currentTarget.value as MotifId })}
      >
        {#each MOTIF_IDS as id (id)}
          <option value={id}>{MOTIFS[id].label}</option>
        {/each}
      </select>
      <p class="field-hint" id="g-motif-hint">{motif.hint}</p>
    </div>

    <div class="field">
      <label class="label" for="g-season">Saison</label>
      <select id="g-season" class="select" value={sel.seasonId ?? ''} onchange={(e) => update({ seasonId: Number(e.currentTarget.value) })}>
        {#each source.seasons as s (s.id)}
          <option value={s.id}>{seasonLabelOf(s)}</option>
        {/each}
      </select>
    </div>

    {#if motif.input === 'round'}
      <div class="field">
        <label class="label" for="g-round">Runde</label>
        <select
          id="g-round"
          class="select"
          value={sel.roundId ?? ''}
          disabled={rounds.length === 0}
          aria-describedby={rounds.length === 0 ? 'g-round-hint' : undefined}
          onchange={(e) => update({ roundId: Number(e.currentTarget.value) })}
        >
          {#if rounds.length === 0}
            <option value="">Keine passende Runde</option>
          {/if}
          {#each rounds as r (r.id)}
            <option value={r.id}>{r.label}</option>
          {/each}
        </select>
        {#if rounds.length === 0}
          <p class="field-hint" id="g-round-hint">In dieser Saison gibt es noch keine Runde mit Daten für dieses Motiv.</p>
        {/if}
      </div>
    {:else}
      <div class="field">
        <label class="label" for="g-driver">Fahrer</label>
        <select
          id="g-driver"
          class="select"
          value={sel.driverId ?? ''}
          disabled={driverList.length === 0}
          aria-describedby="g-driver-hint"
          onchange={(e) => update({ driverId: Number(e.currentTarget.value) })}
        >
          {#if driverList.length === 0}
            <option value="">Keine Fahrer</option>
          {/if}
          {#each driverList as d (d.id)}
            <option value={d.id}>{d.label}</option>
          {/each}
        </select>
        <p class="field-hint" id="g-driver-hint">Neuzugänge der gewählten Saison stehen oben; das Team kommt aus den Cockpits der Saison.</p>
      </div>
    {/if}

    <fieldset class="field">
      <legend class="label">Format</legend>
      <div class="choices">
        {#each FORMAT_IDS as id (id)}
          <label class="choice">
            <input type="radio" name="g-format" value={id} checked={sel.format === id} onchange={() => update({ format: id as FormatId })} />
            <span>
              <span class="choice-title">{FORMATS[id].label}</span>
              <span class="choice-hint">{formatSize(FORMATS[id])} · {FORMATS[id].hint}</span>
            </span>
          </label>
        {/each}
      </div>
    </fieldset>

    <fieldset class="field">
      <legend class="label">Sprache der Grafik</legend>
      <div class="choices choices-2">
        <label class="choice">
          <input type="radio" name="g-lang" value="de" checked={sel.lang === 'de'} onchange={() => update({ lang: 'de' })} />
          <span class="choice-title">Deutsch</span>
        </label>
        <label class="choice">
          <input type="radio" name="g-lang" value="en" checked={sel.lang === 'en'} onchange={() => update({ lang: 'en' })} />
          <span class="choice-title">Englisch</span>
        </label>
      </div>
    </fieldset>
  </form>

  <section class="preview card" aria-labelledby="g-preview-title">
    <div class="preview-head">
      <h2 id="g-preview-title" class="text-xl uppercase">Vorschau</h2>
      <p class="text-sm text-muted">
        {format.label} · {formatSize(format)} px{#if model}&nbsp;· <span class="break-all">{model.fileName}</span>{/if}
      </p>
    </div>

    {#if !result.ok}
      <p class="alert alert-warning" role="status">{result.message}</p>
    {/if}

    <!-- Vorschau als Bild mit Alt-Text; das Canvas selbst ist für Screenreader ausgeblendet -->
    <div
      class="frame"
      class:hidden-frame={!model}
      style={`--ratio: ${format.width} / ${format.height}`}
      role="img"
      aria-label={model ? `Vorschau: ${model.alt}` : 'Keine Vorschau'}
    >
      <canvas bind:this={canvas} width={format.width} height={format.height} aria-hidden="true"></canvas>
      {#if !ready}
        <div class="loading" aria-hidden="true"><span class="spinner"></span></div>
      {/if}
    </div>

    {#if fontWarning}
      <p class="alert alert-warning text-sm">Die Liga-Schriften konnten nicht vollständig geladen werden – die Vorschau nutzt Ersatzschriften. Bitte die Seite neu laden.</p>
    {/if}
    {#if !useImages}
      <p class="alert alert-warning text-sm">Der Browser erlaubt den Export mit eingebundenen Bildern nicht – Logo und Flaggen wurden weggelassen.</p>
    {/if}

    <div class="actions">
      <button type="button" class="btn btn-primary" onclick={download} disabled={!model || !ready || busy !== null}>
        {busy === 'download' ? 'PNG wird erzeugt …' : 'PNG herunterladen'}
      </button>
      <button
        type="button"
        class="btn btn-secondary"
        bind:this={sendButton}
        onclick={askSend}
        disabled={!webhookReady || !model || !ready || busy !== null}
        aria-describedby={webhookReady ? undefined : 'g-webhook-hint'}
        aria-expanded={webhookReady ? confirming : undefined}
        aria-controls={webhookReady ? 'g-confirm' : undefined}
      >
        {busy === 'send' ? 'Wird gesendet …' : 'An Discord senden'}
      </button>
    </div>

    {#if !webhookReady}
      <p class="field-hint" id="g-webhook-hint">
        Für den Channel „Grafiken“ ist kein Discord-Webhook hinterlegt.
        {#if canEditSettings}
          Trage ihn unter <a href="/admin/einstellungen#webhooks" class="underline hover:text-teal">Einstellungen → Webhooks</a> ein.
        {:else}
          Ein Admin kann ihn unter Einstellungen → Webhooks eintragen.
        {/if}
      </p>
    {/if}

    {#if confirming && model}
      <div class="confirm" id="g-confirm" role="group" aria-labelledby="g-confirm-text">
        <p id="g-confirm-text">„{model.discordTitle}“ jetzt als Bild im Discord-Channel #grafiken posten?</p>
        <div class="actions">
          <button type="button" class="btn btn-primary" bind:this={confirmButton} onclick={send}>Jetzt senden</button>
          <button type="button" class="btn btn-ghost" onclick={cancelSend}>Abbrechen</button>
        </div>
      </div>
    {/if}

    <p class="status" role="status" aria-live="polite">
      {#if busy}<span class="spinner" aria-hidden="true"></span>{/if}
      {message}
      {#if lastBytes != null && !message}Letzter Export: {formatBytes(lastBytes)}{/if}
    </p>
    {#if problem}
      <p class="alert alert-danger text-sm" role="alert">{problem}</p>
    {/if}

    {#if model}
      <div class="field">
        <label class="label" for="g-alt">Alt-Text</label>
        <textarea id="g-alt" class="textarea" rows="4" readonly aria-describedby="g-alt-hint">{model.alt}</textarea>
        <p class="field-hint" id="g-alt-hint">Beschreibt die Grafik für Screenreader – beim Posten auf Instagram, TikTok oder YouTube als Bildbeschreibung einfügen.</p>
        <div>
          <button type="button" class="btn btn-ghost" onclick={copyAlt}>Alt-Text kopieren</button>
        </div>
      </div>
    {/if}
  </section>
</div>

<style>
  .studio {
    display: grid;
    gap: 1.5rem;
    align-items: start;
  }
  @media (min-width: 1024px) {
    .studio {
      grid-template-columns: minmax(18rem, 24rem) minmax(0, 1fr);
    }
    .controls {
      position: sticky;
      top: 4.5rem;
    }
  }
  .controls,
  .preview {
    display: grid;
    gap: 1rem;
    padding: 1rem;
    min-width: 0;
  }
  @media (min-width: 640px) {
    .controls,
    .preview {
      padding: 1.5rem;
    }
  }
  fieldset {
    border: 0;
    padding: 0;
    margin: 0;
    min-width: 0;
  }
  .choices {
    display: grid;
    gap: 0.5rem;
    grid-template-columns: 1fr;
  }
  @media (min-width: 480px) {
    .choices {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  @media (min-width: 1024px) {
    .choices {
      grid-template-columns: 1fr;
    }
    .choices-2 {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  .choice {
    display: flex;
    align-items: flex-start;
    gap: 0.625rem;
    min-height: 44px;
    padding: 0.625rem 0.75rem;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-control);
    background: var(--color-surface-2);
    cursor: pointer;
  }
  .choice:has(input:checked) {
    border-color: var(--color-teal);
    box-shadow: inset 0 0 0 1px var(--color-teal);
  }
  .choice:has(input:focus-visible) {
    outline: 2px solid var(--color-teal);
    outline-offset: 2px;
  }
  .choice input {
    flex: none;
    width: 1.125rem;
    height: 1.125rem;
    margin-top: 0.15rem;
    accent-color: var(--color-teal);
  }
  .choice-title {
    display: block;
    font-weight: 600;
    line-height: 1.3;
  }
  .choice-hint {
    display: block;
    font-size: var(--fs-small);
    color: var(--color-muted);
    line-height: 1.35;
  }
  .preview-head {
    display: grid;
    gap: 0.25rem;
  }
  .frame {
    position: relative;
    justify-self: center;
    width: 100%;
    max-width: min(100%, calc(70dvh * var(--ratio)));
    aspect-ratio: var(--ratio);
    border: 1px solid var(--color-border);
    border-radius: 6px;
    overflow: hidden;
    background: var(--color-bg);
  }
  .hidden-frame {
    display: none;
  }
  .frame canvas {
    display: block;
    width: 100%;
    height: 100%;
  }
  .loading {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    background: rgb(5 5 5 / 0.7);
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
  }
  .confirm {
    display: grid;
    gap: 0.75rem;
    padding: 1rem;
    border: 1px solid var(--color-teal);
    border-radius: var(--radius-control);
    background: var(--color-surface-2);
  }
  .status {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-height: 1.5rem;
    font-size: var(--fs-small);
    color: var(--color-muted);
  }
  .textarea {
    resize: vertical;
  }
</style>
