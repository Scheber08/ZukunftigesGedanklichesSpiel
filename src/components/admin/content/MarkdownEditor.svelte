<script lang="ts">
  /**
   * Markdown-Editor mit Live-Vorschau (Plan §5 News/Regelwerk): normales Textfeld im
   * Formular (funktioniert auch ohne JavaScript), dazu eine kleine Werkzeugleiste und
   * die Vorschau über dieselbe renderMarkdown()-Funktion wie auf der Website.
   */
  import { tick, untrack } from 'svelte';
  import { renderMarkdown } from '~/lib/util/markdown';

  interface Props {
    name: string;
    id: string;
    label: string;
    value?: string | null;
    rows?: number;
    lang?: 'de' | 'en';
    required?: boolean;
    hint?: string | null;
    error?: string | null;
    maxlength?: number;
    placeholder?: string;
    /** „side“: Text und Vorschau ab lg nebeneinander (für einspaltige Formulare). */
    layout?: 'stack' | 'side';
  }

  let {
    name,
    id,
    label,
    value = '',
    rows = 12,
    lang = 'de',
    required = false,
    hint = null,
    error = null,
    maxlength,
    placeholder,
    layout = 'stack',
  }: Props = $props();

  let text = $state(untrack(() => value ?? ''));
  let mode = $state<'split' | 'write' | 'preview'>('split');
  let textarea: HTMLTextAreaElement | undefined = $state();

  const html = $derived(renderMarkdown(text));
  const describedBy = $derived([hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(' ') || undefined);

  const MODES = [
    { key: 'split', label: 'Beides' },
    { key: 'write', label: 'Schreiben' },
    { key: 'preview', label: 'Vorschau' },
  ] as const;

  async function replaceSelection(build: (selected: string) => { insert: string; selectFrom: number; selectTo: number }) {
    const el = textarea;
    if (!el) return;
    if (mode === 'preview') mode = 'split';
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const { insert, selectFrom, selectTo } = build(text.slice(start, end));
    text = text.slice(0, start) + insert + text.slice(end);
    await tick();
    el.focus();
    el.setSelectionRange(start + selectFrom, start + selectTo);
  }

  function wrap(before: string, after: string, fallback: string) {
    return replaceSelection((sel) => {
      const inner = sel || fallback;
      return { insert: before + inner + after, selectFrom: before.length, selectTo: before.length + inner.length };
    });
  }

  function prefixLines(prefix: (i: number) => string, fallback: string) {
    return replaceSelection((sel) => {
      const lines = (sel || fallback).split('\n');
      const insert = lines.map((l, i) => prefix(i) + l).join('\n');
      return { insert, selectFrom: 0, selectTo: insert.length };
    });
  }

  function link() {
    return replaceSelection((sel) => {
      const textPart = sel || 'Linktext';
      const insert = `[${textPart}](https://)`;
      // Cursor auf die URL setzen
      const urlStart = textPart.length + 3;
      return { insert, selectFrom: urlStart, selectTo: urlStart + 8 };
    });
  }

  function onKeydown(e: KeyboardEvent) {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const key = e.key.toLowerCase();
    if (key === 'b') {
      e.preventDefault();
      void wrap('**', '**', 'fett');
    } else if (key === 'i') {
      e.preventDefault();
      void wrap('_', '_', 'kursiv');
    } else if (key === 'k') {
      e.preventDefault();
      void link();
    }
  }
</script>

<div class="md-editor field" data-layout={layout}>
  <div class="md-head">
    <label for={id} class="label">
      {label}
      {#if required}<span class="req" aria-hidden="true"> *</span>{/if}
    </label>
    <div class="segmented" role="group" aria-label={`Ansicht für ${label}`}>
      {#each MODES as m (m.key)}
        <button type="button" aria-pressed={mode === m.key} onclick={() => (mode = m.key)}>{m.label}</button>
      {/each}
    </div>
  </div>

  <div class="md-body" data-mode={mode}>
    <div class="md-write" hidden={mode === 'preview'}>
      <div class="md-toolbar" role="toolbar" aria-label={`Formatierung für ${label}`} aria-controls={id}>
        <button type="button" class="btn btn-ghost btn-sm" title="Fett (Strg+B)" onclick={() => wrap('**', '**', 'fett')}><strong>B</strong><span class="sr-only"> Fett</span></button>
        <button type="button" class="btn btn-ghost btn-sm" title="Kursiv (Strg+I)" onclick={() => wrap('_', '_', 'kursiv')}><em>I</em><span class="sr-only"> Kursiv</span></button>
        <button type="button" class="btn btn-ghost btn-sm" title="Zwischenüberschrift" onclick={() => prefixLines(() => '## ', 'Überschrift')}>H2</button>
        <button type="button" class="btn btn-ghost btn-sm" title="Unterüberschrift" onclick={() => prefixLines(() => '### ', 'Überschrift')}>H3</button>
        <button type="button" class="btn btn-ghost btn-sm" title="Aufzählung" onclick={() => prefixLines(() => '- ', 'Punkt')}>• Liste</button>
        <button type="button" class="btn btn-ghost btn-sm" title="Nummerierte Liste" onclick={() => prefixLines((i) => `${i + 1}. `, 'Schritt')}>1. Liste</button>
        <button type="button" class="btn btn-ghost btn-sm" title="Link (Strg+K)" onclick={link}>Link</button>
        <button type="button" class="btn btn-ghost btn-sm" title="Zitat" onclick={() => prefixLines(() => '> ', 'Zitat')}>Zitat</button>
      </div>
      <textarea
        bind:this={textarea}
        bind:value={text}
        {id}
        {name}
        {rows}
        {required}
        {maxlength}
        {placeholder}
        {lang}
        class="textarea md-textarea"
        spellcheck="true"
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={describedBy}
        onkeydown={onKeydown}
        oninvalid={() => {
          // Pflichtfeld leer, aber nur die Vorschau sichtbar: Textfeld wieder zeigen, damit der Browser es markieren kann
          if (mode === 'preview') mode = 'split';
        }}
      ></textarea>
      <p class="md-meta">
        <span>{text.length.toLocaleString('de-DE')} Zeichen{maxlength ? ` von ${maxlength.toLocaleString('de-DE')}` : ''}</span>
        <span>Markdown: **fett**, _kursiv_, ## Überschrift, - Liste, [Link](https://…)</span>
      </p>
    </div>

    {#if mode !== 'write'}
      <section class="md-preview" aria-label={`Vorschau: ${label}`}>
        <p class="micro">Vorschau</p>
        {#if text.trim() === ''}
          <p class="text-muted text-sm">Noch kein Text.</p>
        {:else}
          <div class="prose" {lang}>{@html html}</div>
        {/if}
      </section>
    {/if}
  </div>

  {#if hint}<p class="field-hint" id={`${id}-hint`}>{hint}</p>{/if}
  {#if error}<p class="field-error" id={`${id}-error`} role="alert">{error}</p>{/if}
</div>

<style>
  .md-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }
  .md-editor {
    min-width: 0;
  }
  /* Ansichtsumschalter darf ab 320 px umbrechen, statt die Karte (und die Seite) zu verbreitern */
  .md-head :global(.segmented) {
    flex-wrap: wrap;
    max-width: 100%;
  }
  .md-head :global(.segmented > button) {
    min-height: 44px;
    padding-inline: 0.625rem;
  }
  .md-body {
    display: grid;
    gap: 0.75rem;
  }
  @media (min-width: 1024px) {
    [data-layout='side'] .md-body[data-mode='split'] {
      grid-template-columns: 1fr 1fr;
      align-items: start;
    }
  }
  .md-write {
    display: grid;
    gap: 0.375rem;
    min-width: 0;
  }
  .md-write[hidden] {
    display: none;
  }
  .md-toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
  }
  .md-toolbar :global(.btn) {
    min-height: 44px;
    min-width: 44px;
    text-transform: none;
    letter-spacing: 0;
    font-family: var(--font-sans);
    font-weight: 600;
  }
  .md-textarea {
    width: 100%;
    min-width: 0;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 0.9375rem;
    line-height: 1.55;
  }
  .md-meta {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 0.25rem 1rem;
    font-size: var(--fs-micro);
    color: var(--color-muted);
  }
  .md-preview {
    min-width: 0;
    padding: 0.875rem 1rem;
    border: 1px dashed var(--color-border);
    border-radius: var(--radius-control);
    background: var(--color-bg);
    overflow-wrap: anywhere;
  }
  .md-preview :global(.prose) {
    max-width: none;
  }
  .md-preview :global(table) {
    display: block;
    overflow-x: auto;
  }
</style>
