<script lang="ts">
  /**
   * CSV-Import einer Session (Plan §5.2): Session wählen, CSV einfügen oder Datei wählen,
   * Vorschau mit Zuordnung über die Startnummer und Warnungen – dieselbe Logik wie auf dem Server
   * (parseCsv + mapImport). „Speichern“ legt einen Import-Stapel (Quelle CSV) an; übernommen wird
   * er erst in der Ergebnis-Eingabe.
   */
  import type { SessionType } from '~/lib/db/types';
  import { SESSION_LABEL, RESULT_STATUS_LABEL, countText } from '~/lib/admin/raceday/labels';
  import { splitErrorMessage } from '~/lib/admin/raceday/errors';
  import { CSV_COLUMN_LABEL, CSV_EXAMPLE, CSV_MAX_CHARS, parseCsv } from '~/lib/import/csv';
  import { mapImport, sortWarnings, type MapContext } from '~/lib/import/map';
  import { formatLapTime } from '~/lib/domain/laptime';

  interface Props {
    roundId: number;
    sessions: Array<{ id: number; type: SessionType; hasResults: boolean }>;
    context: Omit<MapContext, 'sessionType'>;
    readOnly: boolean;
  }

  let { roundId, sessions, context, readOnly }: Props = $props();

  const lastRace = sessions.filter((s) => s.type !== 'qualifying').at(-1) ?? sessions.at(-1);
  let sessionId = $state<number>(sessions.find((s) => !s.hasResults && s.type === 'race')?.id ?? lastRace?.id ?? 0);
  let csv = $state('');
  let fileName = $state<string | null>(null);
  let busy = $state(false);
  let error = $state<{ headline: string; details: string[] } | null>(null);
  let fileNote = $state<string | null>(null);

  const session = $derived(sessions.find((s) => s.id === sessionId));
  const parsed = $derived(session && csv.trim() !== '' ? parseCsv(csv, session.type) : null);
  const mapping = $derived(parsed && session ? mapImport(parsed.rows, { ...context, sessionType: session.type }, parsed.errors) : null);
  const warnings = $derived(mapping ? sortWarnings([...mapping.warnings, ...(parsed?.warnings ?? []).map((m) => ({ code: 'skipped' as const, message: m }))]) : []);
  const byLine = $derived(new Map((parsed?.rows ?? []).map((r) => [r.line, r])));
  const tooLong = $derived(csv.length > CSV_MAX_CHARS);

  const name = (id: number | null) => (id == null ? null : (context.driverNames[id] ?? `Fahrer #${id}`));
  const time = (ms: number | null | undefined) => (ms == null ? '' : formatLapTime(ms));
  const delimiterLabel = (d: string) => (d === ';' || d === ',' ? `„${d}“` : 'Tab');

  /** UTF-8 (auch mit BOM); ungültiges UTF-8 → Windows-1252 (ältere Excel-Exporte). */
  async function readFile(file: File): Promise<string> {
    const bytes = new Uint8Array(await file.arrayBuffer());
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      fileNote = 'Die Datei ist nicht UTF-8-kodiert – gelesen als Windows-1252 (Excel). Umlaute bitte prüfen.';
      return new TextDecoder('windows-1252').decode(bytes);
    }
  }

  async function onFile(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    fileNote = null;
    error = null;
    if (!file) return;
    if (file.size > CSV_MAX_CHARS * 2) {
      error = { headline: `Die Datei ist zu groß (höchstens ${CSV_MAX_CHARS / 1024} KB).`, details: [] };
      input.value = '';
      return;
    }
    csv = await readFile(file);
    fileName = file.name;
  }

  function insertExample() {
    csv = CSV_EXAMPLE;
    fileName = null;
  }

  async function save(openReview: boolean) {
    if (!session || !mapping || busy) return;
    busy = true;
    error = null;
    let res;
    try {
      const { actions } = await import('astro:actions');
      res = await actions.admin.importCsvSave({ roundId, sessionId: session.id, csv, fileName });
    } catch {
      busy = false;
      error = { headline: 'Keine Verbindung zum Server – bitte die Seite neu laden und erneut versuchen.', details: [] };
      return;
    }
    busy = false;
    if (res.error) {
      error = splitErrorMessage(res.error.message);
      return;
    }
    const target = openReview ? res.data.reviewUrl : `/admin/runden/${roundId}/import?ok=import_saved&n=${res.data.batchId}#stapel-${res.data.batchId}`;
    window.location.assign(target);
  }
</script>

<div class="csv">
  {#if readOnly}
    <p class="alert alert-warning">Die Saison ist abgeschlossen oder die Runde abgesagt – kein Import möglich.</p>
  {:else}
    <div class="grid gap-4 sm:grid-cols-2">
      <div class="field">
        <label for="csv-session" class="label">Session</label>
        <select id="csv-session" class="select" bind:value={sessionId}>
          {#each sessions as s (s.id)}
            <option value={s.id}>{SESSION_LABEL[s.type]}{s.hasResults ? ' (Ergebnis vorhanden)' : ''}</option>
          {/each}
        </select>
      </div>
      <div class="field">
        <label for="csv-file" class="label">CSV-Datei (optional)</label>
        <input id="csv-file" type="file" class="input file" accept=".csv,.txt,text/csv,text/plain" onchange={onFile} aria-describedby="csv-file-hint" />
        <p id="csv-file-hint" class="field-hint">Oder den Inhalt unten einfügen. UTF-8 (auch mit Excel-BOM).</p>
      </div>
    </div>

    <div class="field mt-4">
      <label for="csv-text" class="label">CSV-Inhalt</label>
      <textarea
        id="csv-text"
        class="textarea mono"
        rows="8"
        spellcheck="false"
        bind:value={csv}
        placeholder={CSV_EXAMPLE}
        aria-describedby="csv-text-hint"
        aria-invalid={tooLong ? 'true' : undefined}
      ></textarea>
      <p id="csv-text-hint" class="field-hint">
        Spalten: Position; Startnummer; Gamertag (optional); Status; Beste Runde; Gesamtzeit; Stopps; Strafsekunden. Trennzeichen „;“ oder „,“,
        Kopfzeile optional. Status: gewertet (oder leer), DNF, DNS, DSQ, NC. Zeiten wie 1:23.456, Gesamtzeit inkl. Ingame-Strafen, „+1 Runde“ für
        überrundete Fahrer.
      </p>
      <div class="mt-2 flex flex-wrap gap-2">
        <button type="button" class="btn btn-ghost btn-sm" onclick={insertExample}>Beispiel einfügen</button>
        {#if csv !== ''}
          <button
            type="button"
            class="btn btn-ghost btn-sm"
            onclick={() => {
              csv = '';
              fileName = null;
              fileNote = null;
            }}>Leeren</button
          >
        {/if}
      </div>
      {#if fileName}<p class="field-hint">Datei: {fileName}</p>{/if}
      {#if fileNote}<p class="field-hint text-warning">{fileNote}</p>{/if}
      {#if tooLong}<p class="field-error" role="alert">Zu lang – höchstens {CSV_MAX_CHARS / 1024} KB.</p>{/if}
    </div>

    {#if parsed && mapping && session}
      <section class="mt-6" aria-labelledby="csv-preview-title">
        <h3 id="csv-preview-title" class="text-lg uppercase">Vorschau · {SESSION_LABEL[session.type]}</h3>
        <p class="small muted mt-1" role="status">
          {mapping.matched} von {countText(mapping.total, 'Zeile', 'Zeilen')} zugeordnet · Trennzeichen {delimiterLabel(parsed.delimiter)} ·
          {parsed.hasHeader ? 'Kopfzeile erkannt' : 'ohne Kopfzeile'} · Spalten: {parsed.columns
            .filter((c) => c !== 'ignore')
            .map((c) => CSV_COLUMN_LABEL[c])
            .join(', ')}
        </p>

        {#if parsed.errors.length > 0}
          <div class="alert alert-danger mt-3">
            <p class="font-semibold">{countText(parsed.errors.length, 'Zeile kann', 'Zeilen können')} nicht gelesen werden:</p>
            <ul class="mt-1 list-disc space-y-1 pl-5 small">
              {#each parsed.errors as e, k (k)}<li>{e}</li>{/each}
            </ul>
          </div>
        {/if}
        {#if warnings.length > 0}
          <div class="alert alert-warning mt-3">
            <p class="font-semibold">{countText(warnings.length, 'Hinweis', 'Hinweise')}:</p>
            <ul class="mt-1 list-disc space-y-1 pl-5 small">
              {#each warnings as w, k (k)}<li>{w.message}</li>{/each}
            </ul>
          </div>
        {/if}

        {#if mapping.lines.length > 0}
          <div class="table-wrap mt-3">
            <table class="timing-table">
              <caption class="sr-only">Vorschau des CSV-Imports mit Zuordnung zu Fahrern der Aufstellung</caption>
              <thead>
                <tr>
                  <th scope="col" class="num">Pos.</th>
                  <th scope="col" class="num">Nr.</th>
                  <th scope="col">CSV-Name</th>
                  <th scope="col">Fahrer (zugeordnet)</th>
                  <th scope="col">Status</th>
                  <th scope="col">Beste Runde</th>
                  {#if session.type !== 'qualifying'}
                    <th scope="col">Gesamtzeit</th>
                    <th scope="col" class="num">Stopps</th>
                    <th scope="col" class="num">Strafe (s)</th>
                  {/if}
                </tr>
              </thead>
              <tbody>
                {#each mapping.lines as l (l.line)}
                  {@const r = byLine.get(l.line)}
                  <tr class:unmatched={l.driverId == null}>
                    <td class="num">{l.position ?? '–'}</td>
                    <td class="num">{l.raceNumber ?? '–'}</td>
                    <td>{l.name ?? ''}</td>
                    <th scope="row" class="gamertag">
                      {#if l.driverId != null}{name(l.driverId)}{:else}<span class="text-danger">nicht zugeordnet</span>{/if}
                    </th>
                    <td>{RESULT_STATUS_LABEL[l.status]}</td>
                    <td>{time(r?.bestLapMs)}</td>
                    {#if session.type !== 'qualifying'}
                      <td>{r?.lapsDown ? `+${countText(r.lapsDown, 'Runde', 'Runden')}` : time(r?.totalTimeMs)}</td>
                      <td class="num">{r?.pitStops ?? ''}</td>
                      <td class="num">{r?.penaltyS || ''}</td>
                    {/if}
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/if}

        {#if error}
          <div class="alert alert-danger mt-3" role="alert">
            <p class="font-semibold">{error.headline}</p>
            {#if error.details.length > 0}
              <ul class="mt-1 list-disc space-y-1 pl-5 small">
                {#each error.details as d, k (k)}<li>{d}</li>{/each}
              </ul>
            {/if}
          </div>
        {/if}

        <div class="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" class="btn btn-primary" disabled={busy || mapping.matched === 0 || tooLong} onclick={() => save(true)}>
            {busy ? 'Speichert …' : 'Speichern und übernehmen'}
          </button>
          <button type="button" class="btn btn-secondary" disabled={busy || mapping.matched === 0 || tooLong} onclick={() => save(false)}>
            Nur als Stapel speichern
          </button>
          <span class="small muted">
            {session.hasResults ? 'Die Session hat schon ein Ergebnis – überschrieben wird erst beim Speichern in der Ergebnis-Eingabe.' : 'Übernommen wird erst in der Ergebnis-Eingabe.'}
          </span>
        </div>
      </section>
    {:else if error}
      <div class="alert alert-danger mt-3" role="alert"><p>{error.headline}</p></div>
    {/if}
  {/if}
</div>

<style>
  .mono {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 0.875rem;
  }
  .file {
    padding-block: 0.5rem;
    min-height: 44px;
  }
  .small {
    font-size: var(--fs-small);
  }
  .muted {
    color: var(--color-muted);
  }
  .text-danger {
    color: var(--color-danger);
  }
  tr.unmatched > * {
    background: rgb(255 107 107 / 0.06);
  }
</style>
