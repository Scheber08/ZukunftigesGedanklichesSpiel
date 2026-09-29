<script lang="ts">
  /**
   * Ergebnis-Eingabe (Plan §5.2): pro Session ein Tab, vorbefüllt mit der Aufstellung bzw. den
   * gespeicherten Ergebnissen. Reihenfolge per Drag & Drop, Positionsnummer oder Hoch/Runter.
   * Vorschau (Positionen, Punkte, Pole, schnellste Runde, Steward-Strafen) mit derselben
   * Punktelogik wie auf dem Server. Ablauf: speichern → vorläufig → final → Korrektur mit Grund.
   */
  import ArrowUp from '@lucide/svelte/icons/arrow-up';
  import ArrowDown from '@lucide/svelte/icons/arrow-down';
  import GripVertical from '@lucide/svelte/icons/grip-vertical';
  import Timer from '@lucide/svelte/icons/timer';
  import X from '@lucide/svelte/icons/x';
  import type { DecisionRow, EntryRole, RoundStatus, SessionType } from '~/lib/db/types';
  import { RESULT_STATUSES } from '~/lib/db/types';
  import { penaltiesForSession } from '~/lib/domain/decisions';
  import { computeGrid, computeSession, type ComputedResult, type PointsScheme } from '~/lib/domain/points';
  import {
    entryToEditor,
    inputToEntered,
    moveItem,
    parseEditorRow,
    positionChange,
    validateSessionInput,
    type EditorRow,
    type ResultInput,
  } from '~/lib/admin/raceday/results-map';
  import {
    COMPUTE_WARNING_TEXT,
    countText,
    draftDecisionsText,
    openIncidentsText,
    RESULT_STATUS_HINT,
    RESULT_STATUS_LABEL,
    ROUND_STATUS_LABEL,
    SESSION_LABEL,
  } from '~/lib/admin/raceday/labels';
  import { splitErrorMessage } from '~/lib/admin/raceday/errors';

  type DecisionLite = Pick<
    DecisionRow,
    'id' | 'driver_id' | 'verdict' | 'time_seconds' | 'positions' | 'status' | 'published_at' | 'session_id' | 'round_id'
  >;

  interface SessionData {
    id: number;
    type: SessionType;
    entered: boolean;
    rows: EditorRow[];
  }

  interface PreviewRow {
    position: number;
    tied: boolean;
    driver: string;
    team: string;
    points: number;
    pointsDelta: number;
    positionDelta: number | null;
  }

  interface Props {
    roundId: number;
    roundStatus: RoundStatus;
    readOnly: boolean;
    readOnlyReason: string | null;
    reservePointsForConstructors: boolean;
    scheme: PointsScheme;
    sessions: SessionData[];
    drivers: Array<{ id: number; gamertag: string }>;
    teams: Array<{ id: number; name: string; color: string }>;
    entries: Array<{ id: number | null; driver_id: number; team_id: number; role: EntryRole; race_number: number | null }>;
    decisions: DecisionLite[];
    gridPenalties: Array<{ driverId: number; positions: number }>;
    openIncidents: number;
    draftDecisions: number;
    protestOpen: boolean;
    protestDeadline: string | null;
    stewardsUrl: string;
  }

  let {
    roundId,
    roundStatus,
    readOnly,
    readOnlyReason,
    reservePointsForConstructors,
    scheme,
    sessions,
    drivers,
    teams,
    entries,
    decisions,
    gridPenalties,
    openIncidents,
    draftDecisions,
    protestOpen: protestOpenInitial,
    protestDeadline: protestDeadlineInitial,
    stewardsUrl,
  }: Props = $props();

  const driverName = new Map(drivers.map((d) => [d.id, d.gamertag]));
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const name = (id: number) => driverName.get(id) ?? `Fahrer #${id}`;

  interface EditState {
    id: number;
    type: SessionType;
    entered: boolean;
    include: boolean;
    rows: EditorRow[];
  }

  let edit = $state<EditState[]>(sessions.map((s) => ({ id: s.id, type: s.type, entered: s.entered, include: s.entered, rows: s.rows })));
  const serialize = () => JSON.stringify(edit.map((s) => ({ include: s.include, rows: s.rows })));
  let savedJson = $state(serialize());
  let active = $state<number>(sessions[0]?.id ?? 0);
  let status = $state<RoundStatus>(roundStatus);
  let announce = $state('');
  let busy = $state<string | null>(null);
  let error = $state<{ headline: string; details: string[] } | null>(null);
  let success = $state<string | null>(null);
  let serverWarnings = $state<string[]>([]);
  let preview = $state<PreviewRow[] | null>(null);
  let finalizeBlockers = $state<string[] | null>(null);
  let forceFinal = $state(false);
  let reasonDe = $state('');
  let reasonEn = $state('');
  let dragFrom = $state<{ sessionId: number; index: number } | null>(null);
  let dragOverIndex = $state<number | null>(null);
  // Nach „Vorläufig veröffentlichen“ läuft die Protestfrist – lokal nachführen, damit „Final“ die Bestätigung verlangt
  let protestOpen = $state(protestOpenInitial);
  let protestDeadline = $state(protestDeadlineInitial);

  const formatBerlin = (iso: string) =>
    new Date(iso).toLocaleString('de-DE', { timeZone: 'Europe/Berlin', dateStyle: 'medium', timeStyle: 'short' });

  const isFinal = $derived(status === 'final' || status === 'corrected');
  const isPublic = $derived(status === 'provisional' || isFinal);
  const dirty = $derived(serialize() !== savedJson);

  const computed = $derived(
    edit.map((s) => {
      const parsed = s.rows.map(parseEditorRow);
      const inputs = parsed.map((p) => p.input);
      const penalties = penaltiesForSession(decisions, { id: s.id, round_id: roundId, type: s.type });
      const out = computeSession(inputs.map(inputToEntered), penalties, { type: s.type, scheme, reservePointsForConstructors });
      return {
        parsed,
        inputs,
        /** Fahrer mit veröffentlichter DSQ-Entscheidung in dieser Session */
        dsqByDecision: new Set(penalties.filter((p) => p.kind === 'dsq').map((p) => p.driverId)),
        byDriver: new Map<number, ComputedResult>(out.results.map((c) => [c.driverId, c])),
        warnings: out.warnings,
        issues: validateSessionInput(inputs, name),
        invalidRows: parsed.filter((p) => Object.keys(p.errors).length > 0).length,
      };
    }),
  );

  $effect(() => {
    if (!dirty || readOnly) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  });

  function say(message: string) {
    announce = message;
  }

  function touch(s: EditState) {
    s.include = true;
    success = null;
  }

  function move(s: EditState, from: number, to: number) {
    if (readOnly || to === from || to < 0 || to >= s.rows.length) return;
    const who = s.rows[from]?.driverId;
    s.rows = moveItem(s.rows, from, to);
    touch(s);
    if (who != null) say(`${name(who)} jetzt an Position ${to + 1} (${SESSION_LABEL[s.type]}).`);
  }

  function removeRow(s: EditState, index: number) {
    const who = s.rows[index]?.driverId;
    s.rows = s.rows.filter((_, i) => i !== index);
    touch(s);
    if (who != null) say(`${name(who)} aus ${SESSION_LABEL[s.type]} entfernt.`);
  }

  function missingEntries(s: EditState) {
    const present = new Set(s.rows.map((r) => r.driverId));
    return entries.filter((e) => !present.has(e.driver_id));
  }

  function addRow(s: EditState, driverId: number) {
    const e = entries.find((x) => x.driver_id === driverId);
    if (!e) return;
    s.rows = [...s.rows, entryToEditor(e)];
    touch(s);
    say(`${name(driverId)} am Ende von ${SESSION_LABEL[s.type]} hinzugefügt.`);
  }

  function toInt(value: string): number | null {
    const t = value.trim();
    if (t === '') return null;
    const n = Number(t);
    return Number.isFinite(n) ? Math.trunc(n) : null;
  }

  function gridFromQuali(s: EditState) {
    const qi = edit.findIndex((x) => x.type === 'qualifying');
    const q = edit[qi];
    const qc = computed[qi];
    if (!q || !qc) return;
    const order = q.rows
      .map((r) => qc.byDriver.get(r.driverId))
      .filter((c): c is ComputedResult => c != null && c.position != null)
      .sort((a, b) => a.position! - b.position!)
      .map((c) => c.driverId);
    if (order.length === 0) {
      say('Im Qualifying ist noch niemand gewertet.');
      error = { headline: 'Im Qualifying ist noch niemand gewertet – Startplätze können nicht übernommen werden.', details: [] };
      return;
    }
    const grid = computeGrid(order, gridPenalties);
    let next = grid.size;
    for (const r of s.rows) r.gridPosition = grid.get(r.driverId) ?? ++next;
    touch(s);
    error = null;
    say(`Startplätze aus dem Qualifying übernommen${gridPenalties.length > 0 ? ` (inkl. ${countText(gridPenalties.length, 'Grid-Strafe', 'Grid-Strafen')})` : ''}.`);
  }

  function sortByGrid(s: EditState) {
    s.rows = [...s.rows].sort((a, b) => (a.gridPosition ?? 999) - (b.gridPosition ?? 999));
    touch(s);
    say('Reihenfolge nach Startplatz sortiert.');
  }

  // ------------------------------------------------------------------ Drag & Drop

  function rowDragStart(e: DragEvent, s: EditState, index: number) {
    if (readOnly || !e.dataTransfer) return;
    dragFrom = { sessionId: s.id, index };
    e.dataTransfer.setData('text/plain', String(index));
    e.dataTransfer.effectAllowed = 'move';
    const tr = (e.currentTarget as HTMLElement).closest('tr');
    if (tr) e.dataTransfer.setDragImage(tr, 24, 20);
  }

  function rowDragOver(e: DragEvent, s: EditState, index: number) {
    if (!dragFrom || dragFrom.sessionId !== s.id) return;
    e.preventDefault();
    dragOverIndex = index;
  }

  function rowDrop(e: DragEvent, s: EditState, index: number) {
    e.preventDefault();
    if (dragFrom && dragFrom.sessionId === s.id) move(s, dragFrom.index, index);
    dragFrom = null;
    dragOverIndex = null;
  }

  // ------------------------------------------------------------------ Tabs

  function tabKey(e: KeyboardEvent, index: number) {
    const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (dir === 0 && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? edit.length - 1 : (index + dir + edit.length) % edit.length;
    active = edit[next]!.id;
    document.getElementById(`re-tab-${active}`)?.focus();
  }

  // ------------------------------------------------------------------ Speichern & Ablauf

  function buildPayload(): { sessions: Array<{ sessionId: number; rows: ResultInput[] }>; errors: string[] } {
    const errors: string[] = [];
    const out: Array<{ sessionId: number; rows: ResultInput[] }> = [];
    edit.forEach((s, idx) => {
      if (!s.include && !s.entered) return;
      const c = computed[idx]!;
      if (!s.include) {
        out.push({ sessionId: s.id, rows: [] });
        return;
      }
      if (c.invalidRows > 0) errors.push(`${SESSION_LABEL[s.type]}: ${c.invalidRows} Zeile(n) mit ungültiger Zeitangabe`);
      for (const issue of c.issues) errors.push(`${SESSION_LABEL[s.type]}: ${issue.message}`);
      out.push({ sessionId: s.id, rows: c.inputs.map((i) => ({ ...i })) });
    });
    return { sessions: out, errors };
  }

  function markSaved() {
    for (const s of edit) s.entered = s.include;
    savedJson = serialize();
  }

  function fail(message: string | undefined) {
    error = splitErrorMessage(message);
    say(error.headline);
  }

  async function save(): Promise<boolean> {
    if (readOnly) return false;
    const { sessions: payload, errors } = buildPayload();
    if (errors.length > 0) {
      error = { headline: 'Bitte korrigiere zuerst die markierten Eingaben:', details: errors };
      say(error.headline);
      return false;
    }
    if (payload.length === 0) {
      error = { headline: 'Noch keine Session eingetragen – nichts zu speichern.', details: [] };
      return false;
    }
    busy = 'save';
    error = null;
    success = null;
    const { actions } = await import('astro:actions');
    const res = await actions.admin.resultsSave({ roundId, sessions: payload });
    busy = null;
    if (res.error) {
      fail(res.error.message);
      return false;
    }
    markSaved();
    serverWarnings = res.data.warnings;
    preview = res.data.preview;
    success = isPublic ? 'Gespeichert – die Änderungen sind öffentlich (Rebuild angefordert).' : 'Gespeichert (noch nicht öffentlich). Die Vorschau zeigt die neue Wertung.';
    say(success);
    return true;
  }

  async function publishProvisional() {
    if (dirty || !edit.some((s) => s.entered)) {
      if (!(await save())) return;
    }
    busy = 'provisional';
    error = null;
    const { actions } = await import('astro:actions');
    const res = await actions.admin.resultsPublishProvisional({ roundId });
    busy = null;
    if (res.error) return fail(res.error.message);
    status = res.data.status;
    serverWarnings = res.data.warnings;
    if (!res.data.alreadyPublic && res.data.protestDeadline) {
      protestDeadline = `${formatBerlin(res.data.protestDeadline)} Uhr`;
      protestOpen = new Date(res.data.protestDeadline) > new Date();
    }
    success = res.data.alreadyPublic
      ? 'Das Ergebnis war schon vorläufig veröffentlicht – Änderungen sind übernommen.'
      : `Vorläufig veröffentlicht. Die Protestfrist läuft${protestDeadline ? ` bis ${protestDeadline}` : ''}.${res.data.discord ? ' Discord-Post gesendet.' : ''}`;
    say(success);
  }

  async function finalize() {
    if (dirty && !(await save())) return;
    busy = 'final';
    error = null;
    const { actions } = await import('astro:actions');
    const res = await actions.admin.resultsFinalize({ roundId, force: forceFinal });
    busy = null;
    if (res.error) {
      const parts = splitErrorMessage(res.error.message);
      if (res.error.code === 'PRECONDITION_FAILED' && parts.details.length > 0) finalizeBlockers = parts.details;
      return fail(res.error.message);
    }
    status = res.data.status;
    finalizeBlockers = null;
    success = `Final gesetzt. Wertungs-Snapshot gespeichert${res.data.discord ? ', Discord-Post gesendet' : ''}.`;
    say(success);
  }

  async function correct() {
    if (reasonDe.trim().length < 5) {
      error = { headline: 'Bitte gib einen Grund für die Korrektur an (mindestens 5 Zeichen, öffentlich sichtbar).', details: [] };
      document.getElementById('re-reason-de')?.focus();
      return;
    }
    const { sessions: payload, errors } = buildPayload();
    if (errors.length > 0) {
      error = { headline: 'Bitte korrigiere zuerst die markierten Eingaben:', details: errors };
      return;
    }
    busy = 'correct';
    error = null;
    const { actions } = await import('astro:actions');
    const res = await actions.admin.resultsCorrect({
      roundId,
      sessions: dirty && payload.length > 0 ? payload : undefined,
      reasonDe: reasonDe.trim(),
      reasonEn: reasonEn.trim() || null,
    });
    busy = null;
    if (res.error) return fail(res.error.message);
    markSaved();
    status = res.data.status;
    preview = res.data.preview;
    serverWarnings = res.data.warnings;
    reasonDe = '';
    reasonEn = '';
    success = `Korrektur gespeichert (öffentlicher Hinweis, Snapshots neu${res.data.discord ? ', Discord-Post gesendet' : ''}).`;
    say(success);
  }

  const blockersKnown = $derived(openIncidents + draftDecisions > 0 || protestOpen);
</script>

<div class="re">
  <p class="sr-only" role="status" aria-live="polite">{announce}</p>

  {#if readOnly && readOnlyReason}
    <p class="alert alert-warning mb-4">{readOnlyReason}</p>
  {/if}

  <div class="re-bar">
    <p>
      Status: <strong>{ROUND_STATUS_LABEL[status]}</strong>
      {#if protestDeadline}· Protestfrist {protestOpen ? 'läuft bis' : 'endete'} {protestDeadline}{/if}
      {#if dirty && !readOnly}· <span class="text-warning">ungespeicherte Änderungen</span>{/if}
    </p>
    <p class="muted small">Import (UDP/CSV) folgt in Phase 2 und führt in diesen Prüfbildschirm.</p>
  </div>

  <div class="tabs" role="tablist" aria-label="Sessions">
    {#each edit as s, i (s.id)}
      {@const c = computed[i]}
      <button
        type="button"
        role="tab"
        id={`re-tab-${s.id}`}
        class="tab"
        aria-selected={active === s.id}
        aria-controls={`re-panel-${s.id}`}
        tabindex={active === s.id ? 0 : -1}
        onclick={() => (active = s.id)}
        onkeydown={(e) => tabKey(e, i)}
      >
        {SESSION_LABEL[s.type]}
        <span class="tab-meta">
          {#if c && (c.invalidRows > 0 || c.issues.length > 0)}
            · <span class="text-danger">prüfen</span>
          {:else if s.include}
            · {s.rows.length}
          {:else}
            · offen
          {/if}
        </span>
      </button>
    {/each}
  </div>

  {#each edit as s, si (s.id)}
    {@const c = computed[si]!}
    {@const race = s.type !== 'qualifying'}
    <div
      role="tabpanel"
      id={`re-panel-${s.id}`}
      aria-labelledby={`re-tab-${s.id}`}
      hidden={active !== s.id}
      class="panel"
    >
      <div class="panel-head">
        {#if !readOnly}
          <label class="checkbox">
            <input type="checkbox" bind:checked={s.include} />
            <span>{SESSION_LABEL[s.type]} speichern{s.entered && !s.include ? ' (beim Speichern wird das Ergebnis gelöscht)' : ''}</span>
          </label>
        {/if}
        {#if race && !readOnly}
          <div class="flex flex-wrap gap-2">
            <button type="button" class="btn btn-ghost compact" onclick={() => gridFromQuali(s)}>Startplätze aus Quali</button>
            <button type="button" class="btn btn-ghost compact" onclick={() => sortByGrid(s)}>Nach Startplatz sortieren</button>
          </div>
        {/if}
      </div>
      {#if !s.include && !readOnly}
        <p class="small muted mb-3">
          Noch nicht eingetragen – die Tabelle ist mit {s.entered ? 'dem gespeicherten Ergebnis' : 'der Aufstellung'} vorbefüllt. Jede Änderung
          markiert die Session zum Speichern.
        </p>
      {/if}

      <div class="table-wrap">
        <table class="timing-table re-table">
          <caption class="sr-only">
            {SESSION_LABEL[s.type]}: Eingabe in Zielreihenfolge mit Vorschau der Wertung
          </caption>
          <thead>
            <tr>
              <th scope="col" class="sticky-col">Reihenfolge</th>
              <th scope="col">Fahrer</th>
              <th scope="col">Status</th>
              {#if race}<th scope="col">Start</th><th scope="col">Runden</th>{/if}
              <th scope="col">Beste Runde</th>
              {#if race}
                <th scope="col">Gesamtzeit</th>
                <th scope="col">Abstand (s)</th>
                <th scope="col">Rd. zurück</th>
                <th scope="col">Stopps</th>
                <th scope="col">Ingame-Strafe (s)</th>
              {/if}
              <th scope="col" class="num">Pos.</th>
              {#if race}<th scope="col" class="num">+/−</th>{/if}
              <th scope="col" class="num">Punkte</th>
              {#if !readOnly}<th scope="col"><span class="sr-only">Entfernen</span></th>{/if}
            </tr>
          </thead>
          <tbody>
            {#each s.rows as row, i (row.driverId)}
              {@const p = c.parsed[i]}
              {@const res = c.byDriver.get(row.driverId)}
              {@const team = teamById.get(row.teamId)}
              {@const delta = positionChange(s.type, row.gridPosition, res?.position ?? null)}
              {@const rid = `re-${s.id}-${row.driverId}`}
              <tr
                class:dragover={dragOverIndex === i && dragFrom?.sessionId === s.id}
                ondragover={(e) => rowDragOver(e, s, i)}
                ondrop={(e) => rowDrop(e, s, i)}
              >
                <td class="sticky-col order">
                  {#if readOnly}
                    <span class="pos-static">{i + 1}</span>
                  {:else}
                    <div class="order-tools">
                      <span class="grip" draggable="true" ondragstart={(e) => rowDragStart(e, s, i)} role="presentation" title="Ziehen zum Verschieben">
                        <GripVertical size={16} aria-hidden="true" />
                      </span>
                      <input
                        class="input pos-input"
                        type="number"
                        min="1"
                        max={s.rows.length}
                        value={i + 1}
                        aria-label={`Position von ${name(row.driverId)}`}
                        onchange={(e) => {
                          const target = Number(e.currentTarget.value);
                          if (!Number.isInteger(target) || target < 1 || target > s.rows.length) {
                            // Ungültige Position: Anzeige zurücksetzen statt stillschweigend nichts zu tun
                            e.currentTarget.value = String(i + 1);
                            say(`Ungültige Position – bitte eine Zahl von 1 bis ${s.rows.length} eingeben.`);
                            return;
                          }
                          move(s, i, target - 1);
                        }}
                      />
                      <button type="button" class="icon-btn" disabled={i === 0} onclick={() => move(s, i, i - 1)} aria-label={`${name(row.driverId)} nach oben`}>
                        <ArrowUp size={16} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        class="icon-btn"
                        disabled={i === s.rows.length - 1}
                        onclick={() => move(s, i, i + 1)}
                        aria-label={`${name(row.driverId)} nach unten`}
                      >
                        <ArrowDown size={16} aria-hidden="true" />
                      </button>
                    </div>
                  {/if}
                </td>
                <th scope="row" class="driver-cell" style:--team-color={team?.color}>
                  <span class="driver">
                  <span class="team-stripe" aria-hidden="true"></span>
                  <span class="num-label">#{row.raceNumber ?? '–'}</span>
                  <span class="gamertag">{name(row.driverId)}</span>
                  {#if row.role === 'reserve'}<span class="badge badge-teal" title="Ersatzfahrer">R</span>{/if}
                  <span class="sr-only">, {team?.name ?? ''}</span>
                  </span>
                </th>
                <td>
                  <select
                    class="select cell-select"
                    bind:value={row.status}
                    disabled={readOnly}
                    aria-label={`Status von ${name(row.driverId)}`}
                    onchange={() => touch(s)}
                  >
                    {#each RESULT_STATUSES as st (st)}
                      <option value={st}>{RESULT_STATUS_LABEL[st]} – {RESULT_STATUS_HINT[st]}</option>
                    {/each}
                  </select>
                  {#if c.dsqByDecision.has(row.driverId)}
                    <p class="small text-danger">DSQ durch Urteil</p>
                  {/if}
                </td>
                {#if race}
                  <td>
                    <input
                      class="input cell-num"
                      type="number"
                      min="1"
                      inputmode="numeric"
                      value={row.gridPosition ?? ''}
                      disabled={readOnly}
                      aria-label={`Startplatz von ${name(row.driverId)}`}
                      oninput={(e) => {
                        row.gridPosition = toInt(e.currentTarget.value);
                        touch(s);
                      }}
                    />
                  </td>
                  <td>
                    <input
                      class="input cell-num"
                      type="number"
                      min="0"
                      inputmode="numeric"
                      value={row.laps ?? ''}
                      disabled={readOnly}
                      aria-label={`Runden von ${name(row.driverId)}`}
                      oninput={(e) => {
                        row.laps = toInt(e.currentTarget.value);
                        touch(s);
                      }}
                    />
                  </td>
                {/if}
                <td>
                  <input
                    class="input cell-time"
                    type="text"
                    inputmode="decimal"
                    placeholder="1:23.456"
                    bind:value={row.bestLap}
                    disabled={readOnly}
                    aria-label={`Beste Runde von ${name(row.driverId)}`}
                    aria-invalid={p?.errors.bestLap ? 'true' : undefined}
                    aria-describedby={p?.errors.bestLap ? `${rid}-bl` : undefined}
                    oninput={() => touch(s)}
                  />
                  {#if p?.errors.bestLap}<p id={`${rid}-bl`} class="field-error">{p.errors.bestLap}</p>{/if}
                </td>
                {#if race}
                  <td>
                    <input
                      class="input cell-time"
                      type="text"
                      inputmode="decimal"
                      placeholder="45:12.345"
                      bind:value={row.totalTime}
                      disabled={readOnly}
                      aria-label={`Gesamtzeit von ${name(row.driverId)}`}
                      aria-invalid={p?.errors.totalTime ? 'true' : undefined}
                      aria-describedby={p?.errors.totalTime ? `${rid}-tt` : undefined}
                      oninput={() => touch(s)}
                    />
                    {#if p?.errors.totalTime}<p id={`${rid}-tt`} class="field-error">{p.errors.totalTime}</p>{/if}
                  </td>
                  <td>
                    <input
                      class="input cell-gap"
                      type="text"
                      inputmode="decimal"
                      placeholder="+5.123"
                      bind:value={row.gap}
                      disabled={readOnly}
                      aria-label={`Abstand von ${name(row.driverId)} in Sekunden`}
                      aria-invalid={p?.errors.gap ? 'true' : undefined}
                      aria-describedby={p?.errors.gap ? `${rid}-gap` : undefined}
                      oninput={() => touch(s)}
                    />
                    {#if p?.errors.gap}<p id={`${rid}-gap`} class="field-error">{p.errors.gap}</p>{/if}
                  </td>
                  <td>
                    <input
                      class="input cell-num"
                      type="number"
                      min="0"
                      inputmode="numeric"
                      value={row.gapLaps ?? ''}
                      disabled={readOnly}
                      aria-label={`Runden zurück von ${name(row.driverId)}`}
                      oninput={(e) => {
                        row.gapLaps = toInt(e.currentTarget.value);
                        touch(s);
                      }}
                    />
                  </td>
                  <td>
                    <input
                      class="input cell-num"
                      type="number"
                      min="0"
                      inputmode="numeric"
                      value={row.pitStops ?? ''}
                      disabled={readOnly}
                      aria-label={`Boxenstopps von ${name(row.driverId)}`}
                      oninput={(e) => {
                        row.pitStops = toInt(e.currentTarget.value);
                        touch(s);
                      }}
                    />
                  </td>
                  <td>
                    <input
                      class="input cell-num"
                      type="number"
                      min="0"
                      inputmode="numeric"
                      value={row.ingamePenaltyS || ''}
                      disabled={readOnly}
                      aria-label={`Ingame-Strafsekunden von ${name(row.driverId)}`}
                      oninput={(e) => {
                        row.ingamePenaltyS = Math.max(0, toInt(e.currentTarget.value) ?? 0);
                        touch(s);
                      }}
                    />
                  </td>
                {/if}
                <td class="num result">
                  {#if res?.position != null}
                    <span class="pos">{res.position}</span>
                  {:else}
                    <span class="text-danger">{RESULT_STATUS_LABEL[res?.status ?? row.status]}</span>
                  {/if}
                  {#if res?.isPole}<span class="flag-pole" title="Pole-Position">P</span>{/if}
                  {#if res?.isFastestLap}<span class="flag-fl" title="Schnellste Runde"><Timer size={14} aria-hidden="true" /><span class="sr-only">schnellste Runde</span></span>{/if}
                  {#if res && res.stewardPenaltyS > 0}<span class="small text-warning">+{res.stewardPenaltyS} s Stewards</span>{/if}
                </td>
                {#if race}
                  <td class="num">
                    {#if delta == null}
                      <span class="muted">–</span>
                    {:else if delta > 0}
                      <span class="text-green">+{delta}</span>
                    {:else if delta < 0}
                      <span class="text-danger">−{Math.abs(delta)}</span>
                    {:else}
                      <span class="muted">±0</span>
                    {/if}
                  </td>
                {/if}
                <td class="num"><strong>{res?.points ?? 0}</strong></td>
                {#if !readOnly}
                  <td>
                    <button type="button" class="icon-btn" onclick={() => removeRow(s, i)} aria-label={`${name(row.driverId)} aus ${SESSION_LABEL[s.type]} entfernen`}>
                      <X size={16} aria-hidden="true" />
                    </button>
                  </td>
                {/if}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      {#if !readOnly}
        {@const missing = missingEntries(s)}
        {#if missing.length > 0}
          <form
            class="add-row"
            onsubmit={(e) => {
              e.preventDefault();
              const sel = (e.currentTarget as HTMLFormElement).elements.namedItem('driver') as HTMLSelectElement;
              addRow(s, Number(sel.value));
            }}
          >
            <label class="label" for={`re-add-${s.id}`}>Fahrer aus der Aufstellung hinzufügen</label>
            <div class="flex flex-wrap gap-2">
              <select id={`re-add-${s.id}`} name="driver" class="select add-select">
                {#each missing as m (m.driver_id)}
                  <option value={m.driver_id}>#{m.race_number ?? '–'} {name(m.driver_id)}</option>
                {/each}
              </select>
              <button type="submit" class="btn btn-secondary compact">Hinzufügen</button>
            </div>
          </form>
        {/if}
      {/if}

      {#if c.warnings.length > 0 || c.issues.length > 0}
        <ul class="notes">
          {#each c.issues as issue, k (k)}<li class="text-danger">Fehler: {issue.message}</li>{/each}
          {#each c.warnings as w, k (k)}<li class="text-warning">Hinweis: {name(w.driverId)} – {COMPUTE_WARNING_TEXT[w.code]}</li>{/each}
        </ul>
      {/if}
    </div>
  {/each}

  <section class="flow card" aria-labelledby="re-flow-title">
    <h2 id="re-flow-title" class="text-xl uppercase">Ablauf</h2>

    {#if error}
      <div class="alert alert-danger mt-3" role="alert">
        <p class="font-semibold">{error.headline}</p>
        {#if error.details.length > 0}
          <ul class="mt-2 list-disc space-y-1 pl-5 text-sm">
            {#each error.details as d, k (k)}<li>{d}</li>{/each}
          </ul>
        {/if}
      </div>
    {/if}
    {#if success}<p class="alert alert-success mt-3">{success}</p>{/if}
    {#if serverWarnings.length > 0}
      <ul class="notes">
        {#each serverWarnings as w, k (k)}<li class="text-warning">Hinweis: {w}</li>{/each}
      </ul>
    {/if}

    {#if readOnly}
      <p class="muted mt-3">Keine Änderungen möglich.</p>
    {:else if !isFinal}
      <ol class="flow-steps">
        <li>
          <button type="button" class="btn btn-secondary" onclick={save} disabled={busy != null}>
            {busy === 'save' ? 'Speichert …' : isPublic ? 'Änderungen speichern' : 'Speichern als vorläufig'}
          </button>
          <span class="small muted">
            {isPublic ? 'Sofort öffentlich (Rebuild).' : 'Speichert und zeigt die Vorschau der neuen Wertung – noch nicht öffentlich.'}
          </span>
        </li>
        {#if status !== 'provisional'}
          <li>
            <button type="button" class="btn btn-primary" onclick={publishProvisional} disabled={busy != null}>
              {busy === 'provisional' ? 'Veröffentlicht …' : 'Vorläufig veröffentlichen'}
            </button>
            <span class="small muted">Macht das Ergebnis sichtbar, startet die Protestfrist, Discord-Post.</span>
          </li>
        {:else}
          <li class="final-step">
            {#if blockersKnown || finalizeBlockers}
              <div class="alert alert-warning">
                <p>
                  Noch offen:
                  {#if finalizeBlockers && finalizeBlockers.length > 0}
                    {finalizeBlockers.join(' · ')}.
                  {:else}
                    {[
                      protestOpen ? `Protestfrist läuft${protestDeadline ? ` bis ${protestDeadline}` : ''}` : null,
                      openIncidents > 0 ? openIncidentsText(openIncidents) : null,
                      draftDecisions > 0 ? draftDecisionsText(draftDecisions) : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}.
                  {/if}
                  <a href={stewardsUrl} class="underline">Zum Steward-Werkzeug</a>
                </p>
                <label class="checkbox mt-2">
                  <input type="checkbox" bind:checked={forceFinal} />
                  <span>Trotzdem final setzen (ich habe das geprüft)</span>
                </label>
              </div>
            {/if}
            <div class="flex flex-wrap items-center gap-3">
              <button
                type="button"
                class="btn btn-primary"
                onclick={finalize}
                disabled={busy != null || ((blockersKnown || finalizeBlockers != null) && !forceFinal)}
              >
                {busy === 'final' ? 'Setzt final …' : 'Final setzen'}
              </button>
              <span class="small muted">Speichert den Wertungs-Snapshot und postet in Discord.</span>
            </div>
          </li>
        {/if}
      </ol>
    {:else}
      <div class="correction">
        <p class="small muted">
          Das Ergebnis ist {status === 'corrected' ? 'final und bereits korrigiert' : 'final'}. Änderungen sind nur noch als Korrektur mit
          öffentlich sichtbarem Grund möglich (Status „korrigiert“, Snapshots neu, Discord-Post).
        </p>
        <div class="field">
          <label for="re-reason-de" class="label">Grund der Korrektur (Deutsch) <span class="req" aria-hidden="true">*</span></label>
          <textarea id="re-reason-de" class="textarea" rows="3" bind:value={reasonDe} required aria-describedby="re-reason-hint"></textarea>
          <p id="re-reason-hint" class="field-hint">Erscheint öffentlich auf der Rennseite, z. B. „Zeitmessung von P7 korrigiert“.</p>
        </div>
        <div class="field">
          <label for="re-reason-en" class="label">Grund (Englisch, optional)</label>
          <textarea id="re-reason-en" class="textarea" rows="2" bind:value={reasonEn}></textarea>
        </div>
        <button type="button" class="btn btn-primary" onclick={correct} disabled={busy != null}>
          {busy === 'correct' ? 'Speichert …' : 'Korrektur speichern'}
        </button>
      </div>
    {/if}
  </section>

  {#if preview}
    <section class="mt-6" aria-labelledby="re-preview-title">
      <h2 id="re-preview-title" class="mb-3 text-xl uppercase">Vorschau: Fahrerwertung nach dieser Runde</h2>
      <div class="table-wrap">
        <table class="timing-table">
          <caption class="sr-only">Top 10 der Fahrerwertung mit Veränderung durch diese Runde</caption>
          <thead>
            <tr>
              <th scope="col" class="num">Pos.</th>
              <th scope="col">Fahrer</th>
              <th scope="col">Team</th>
              <th scope="col" class="num">Punkte</th>
              <th scope="col" class="num">Diese Runde</th>
              <th scope="col" class="num">Veränderung</th>
            </tr>
          </thead>
          <tbody>
            {#each preview as p, k (k)}
              <tr>
                <td class="pos">{p.tied ? '=' : ''}{p.position}</td>
                <th scope="row" class="gamertag">{p.driver}</th>
                <td>{p.team}</td>
                <td class="num"><strong>{p.points}</strong></td>
                <td class="num">{p.pointsDelta > 0 ? `+${p.pointsDelta}` : '0'}</td>
                <td class="num">
                  {#if p.positionDelta == null}
                    <span class="badge badge-teal">neu</span>
                  {:else if p.positionDelta > 0}
                    <span class="text-green">▲ {p.positionDelta}</span>
                  {:else if p.positionDelta < 0}
                    <span class="text-danger">▼ {Math.abs(p.positionDelta)}</span>
                  {:else}
                    <span class="muted">=</span>
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </section>
  {/if}
</div>

<style>
  .re-bar {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 0.25rem 1rem;
    margin-bottom: 1rem;
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
  .text-green {
    color: var(--color-green);
  }
  .tab-meta {
    margin-left: 0.25rem;
    font-weight: 400;
    font-size: var(--fs-small);
    text-transform: none;
    letter-spacing: 0;
  }
  .panel {
    margin-top: 1rem;
  }
  .panel-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem 1rem;
    margin-bottom: 0.5rem;
  }
  .compact {
    padding-inline: 0.75rem;
    font-size: 0.8125rem;
  }
  .re-table th,
  .re-table td {
    padding: 0.375rem 0.5rem;
    vertical-align: middle;
  }
  .re-table tbody tr.dragover > * {
    box-shadow: inset 0 2px 0 var(--color-green);
  }
  .order-tools {
    display: flex;
    align-items: center;
    gap: 0.125rem;
  }
  .grip {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.5rem;
    min-height: 44px;
    cursor: grab;
    color: var(--color-muted);
  }
  .pos-input {
    width: 4rem;
    padding-inline: 0.5rem;
    text-align: right;
  }
  .pos-static {
    font-family: var(--font-display);
    font-weight: 700;
  }
  .icon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 44px;
    min-height: 44px;
    border-radius: var(--radius-control);
    background: none;
    border: 0;
    color: var(--color-fg);
    cursor: pointer;
  }
  .icon-btn:hover:not(:disabled) {
    background: var(--color-surface-2);
  }
  .icon-btn:disabled {
    opacity: 0.35;
    cursor: default;
  }
  .driver-cell {
    font-weight: 400;
    color: var(--color-fg);
  }
  .driver {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    min-height: 44px;
  }
  .num-label {
    font-family: var(--font-display);
    font-weight: 700;
    color: var(--color-muted);
    min-width: 2.25rem;
  }
  .gamertag {
    font-weight: 600;
    text-transform: uppercase;
  }
  .cell-select {
    min-width: 9.5rem;
    padding-block: 0.4rem;
  }
  .cell-num {
    width: 5rem;
  }
  .cell-time {
    width: 8.5rem;
  }
  .cell-gap {
    width: 7rem;
  }
  .result {
    white-space: nowrap;
  }
  .flag-pole {
    display: inline-block;
    margin-left: 0.35rem;
    font-family: var(--font-display);
    font-weight: 700;
    color: var(--color-green);
  }
  .flag-fl {
    display: inline-flex;
    margin-left: 0.35rem;
    color: var(--color-teal);
    vertical-align: -2px;
  }
  .add-row {
    display: grid;
    gap: 0.375rem;
    margin-top: 1rem;
    max-width: 32rem;
  }
  .add-select {
    flex: 1;
    min-width: 12rem;
  }
  .notes {
    display: grid;
    gap: 0.25rem;
    margin-top: 0.75rem;
    font-size: var(--fs-small);
  }
  .flow {
    margin-top: 1.5rem;
    padding: 1rem;
  }
  .flow-steps {
    display: grid;
    gap: 0.75rem;
    margin-top: 0.75rem;
  }
  .flow-steps li {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem 1rem;
  }
  .final-step {
    flex-direction: column;
    align-items: stretch !important;
  }
  .correction {
    display: grid;
    gap: 1rem;
    margin-top: 0.75rem;
    max-width: 40rem;
  }
</style>
