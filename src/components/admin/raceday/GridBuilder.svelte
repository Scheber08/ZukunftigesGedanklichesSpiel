<script lang="ts">
  /**
   * Grid-Builder (Plan §5.1): 22 Cockpits in 11 Team-Spalten, rechts der Reservepool nach Warteliste.
   * Abmeldungen machen das Cockpit frei; Ersatz per Drag & Drop oder per Tastatur/Touch
   * („Cockpit wählen → Fahrer wählen“). Prüfungen laufen live mit checkGrid, Fehler blockieren
   * das Veröffentlichen; der Server prüft beim Speichern noch einmal.
   */
  import GripVertical from '@lucide/svelte/icons/grip-vertical';
  import Check from '@lucide/svelte/icons/check';
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
  import CircleAlert from '@lucide/svelte/icons/circle-alert';
  import type { DriverStatus, RoundStatus } from '~/lib/db/types';
  import { checkGrid, GRID_SIZE, type GridIssue } from '~/lib/domain/grid';
  import {
    assignSeat,
    clearSeat,
    initialLineup,
    markAbsent,
    reservePool,
    resetToSeason,
    setReportedInTime,
    slotRole,
    toGridEntries,
    unmarkAbsent,
    type LineupState,
    type SeatSlot,
  } from '~/lib/admin/raceday/lineup';
  import { gridIssueText, ROUND_STATUS_LABEL } from '~/lib/admin/raceday/labels';
  import { splitErrorMessage } from '~/lib/admin/raceday/errors';

  interface TeamInfo {
    id: number;
    name: string;
    color: string;
  }
  interface DriverInfo {
    id: number;
    gamertag: string;
    status: DriverStatus;
    reserveOrder: number | null;
    /** Startnummer zum Rennstart */
    number: number | null;
  }
  interface SeatInfo {
    team_id: number;
    seat_no: 1 | 2;
    driver_id: number;
  }

  interface Props {
    roundId: number;
    roundStatus: RoundStatus;
    readOnly: boolean;
    readOnlyReason: string | null;
    hasResults: boolean;
    teams: TeamInfo[];
    drivers: DriverInfo[];
    seasonSeats: SeatInfo[];
    entries: SeatInfo[];
    absences: Array<{ driverId: number; reportedInTime: boolean }>;
    bannedForRound: number[];
  }

  let { roundId, roundStatus, readOnly, readOnlyReason, hasResults, teams, drivers, seasonSeats, entries, absences, bannedForRound }: Props =
    $props();

  const driverById = new Map(drivers.map((d) => [d.id, d]));
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const teamIds = teams.map((t) => t.id);
  const banned = new Set(bannedForRound);
  const name = (id: number) => driverById.get(id)?.gamertag ?? `Fahrer #${id}`;
  const numberOf = (id: number) => driverById.get(id)?.number ?? null;
  const seatKey = (s: { teamId: number; seatNo: 1 | 2 }) => `${s.teamId}:${s.seatNo}`;
  const seatName = (s: { teamId: number; seatNo: 1 | 2 }) => `${teamById.get(s.teamId)?.name ?? 'Team'}, Cockpit ${s.seatNo}`;

  function payload(state: LineupState) {
    return {
      entries: state.seats
        .filter((s): s is SeatSlot & { driverId: number } => s.driverId != null)
        .map((s) => ({ teamId: s.teamId, seatNo: s.seatNo, driverId: s.driverId })),
      absences: state.absences.map((a) => ({ driverId: a.driverId, reportedInTime: a.reportedInTime })),
    };
  }

  let lineup = $state<LineupState>(initialLineup(teamIds, seasonSeats, entries, absences));
  let savedJson = $state(JSON.stringify(payload(initialLineup(teamIds, seasonSeats, entries, absences))));
  let status = $state<RoundStatus>(roundStatus);
  let selectedSeat = $state<string | null>(null);
  let selectedDriver = $state<number | null>(null);
  let dragOver = $state<string | null>(null);
  let announce = $state('');
  let busy = $state<'save' | 'publish' | null>(null);
  let error = $state<{ headline: string; details: string[] } | null>(null);
  let success = $state<string | null>(null);
  let discord = $state(true);

  const gridEntries = $derived(toGridEntries(lineup, numberOf));
  const absentIds = $derived(new Set(lineup.absences.map((a) => a.driverId)));
  const issues = $derived(
    checkGrid(gridEntries, {
      driverStatus: (id) => driverById.get(id)?.status,
      absentDriverIds: absentIds,
      bannedForRound: banned,
      teamIds,
    }),
  );
  const errors = $derived(issues.filter((i) => i.severity === 'error'));
  const warnings = $derived(issues.filter((i) => i.severity === 'warning'));
  const pool = $derived(
    reservePool(
      drivers.map((d) => ({ id: d.id, gamertag: d.gamertag, status: d.status, reserve_order: d.reserveOrder })),
      lineup,
    ),
  );
  const filled = $derived(lineup.seats.filter((s) => s.driverId != null).length);
  const dirty = $derived(JSON.stringify(payload(lineup)) !== savedJson);
  const names = { driver: name, team: (id: number) => teamById.get(id)?.name ?? `Team #${id}` };
  const issueText = (i: GridIssue) => gridIssueText(i, names);
  const driverIssues = (id: number) => issues.filter((i) => i.driverId === id && i.code !== 'empty_seat');

  $effect(() => {
    if (!dirty || readOnly) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  });

  function changed(message: string) {
    announce = message;
    success = null;
  }

  function place(teamId: number, seatNo: 1 | 2, driverId: number) {
    if (readOnly) return;
    lineup = assignSeat(lineup, teamId, seatNo, driverId);
    const slot = lineup.seats.find((s) => s.teamId === teamId && s.seatNo === seatNo)!;
    const { role, replacesDriverId } = slotRole(slot);
    selectedSeat = null;
    selectedDriver = null;
    changed(
      `${name(driverId)} sitzt jetzt in ${seatName(slot)}${role === 'reserve' && replacesDriverId != null ? ` (ersetzt ${name(replacesDriverId)})` : ''}.`,
    );
  }

  function chooseSeat(seat: SeatSlot) {
    if (readOnly) return;
    if (selectedDriver != null) {
      place(seat.teamId, seat.seatNo, selectedDriver);
      return;
    }
    const key = seatKey(seat);
    if (selectedSeat === key) {
      selectedSeat = null;
      announce = 'Auswahl aufgehoben.';
    } else {
      selectedSeat = key;
      announce = `${seatName(seat)} gewählt – jetzt einen Fahrer im Reservepool wählen.`;
    }
  }

  function chooseDriver(id: number) {
    if (readOnly) return;
    if (selectedSeat != null) {
      const [teamId, seatNo] = selectedSeat.split(':').map(Number) as [number, 1 | 2];
      place(teamId, seatNo, id);
      return;
    }
    if (selectedDriver === id) {
      selectedDriver = null;
      announce = 'Auswahl aufgehoben.';
    } else {
      selectedDriver = id;
      announce = `${name(id)} gewählt – jetzt ein Cockpit wählen.`;
    }
  }

  function removeFromSeat(seat: SeatSlot) {
    if (seat.driverId == null) return;
    const who = seat.driverId;
    lineup = clearSeat(lineup, seat.teamId, seat.seatNo);
    changed(`${name(who)} aus ${seatName(seat)} entfernt. Das Cockpit ist frei.`);
  }

  function absent(id: number) {
    lineup = markAbsent(lineup, id, true);
    changed(`${name(id)} als abwesend markiert (rechtzeitig abgemeldet). Das Cockpit ist frei.`);
  }

  function undoAbsent(id: number) {
    lineup = unmarkAbsent(lineup, id);
    changed(`Abmeldung von ${name(id)} zurückgenommen.`);
  }

  function inTime(id: number, value: boolean) {
    lineup = setReportedInTime(lineup, id, value);
    changed(`${name(id)}: ${value ? 'rechtzeitig' : 'nicht rechtzeitig'} abgemeldet.`);
  }

  function reset() {
    lineup = resetToSeason(lineup);
    selectedSeat = null;
    selectedDriver = null;
    changed('Auf die Saisonaufstellung zurückgesetzt (Abmeldungen bleiben).');
  }

  function dragStart(e: DragEvent, id: number) {
    if (readOnly || !e.dataTransfer) return;
    e.dataTransfer.setData('text/plain', String(id));
    e.dataTransfer.effectAllowed = 'move';
  }

  function dragOverTarget(e: DragEvent, key: string) {
    if (readOnly) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    dragOver = key;
  }

  function draggedId(e: DragEvent): number | null {
    const id = Number(e.dataTransfer?.getData('text/plain'));
    return Number.isInteger(id) && id > 0 ? id : null;
  }

  function dropOnSeat(e: DragEvent, seat: SeatSlot) {
    e.preventDefault();
    dragOver = null;
    const id = draggedId(e);
    if (id != null) place(seat.teamId, seat.seatNo, id);
  }

  function dropOnPool(e: DragEvent) {
    e.preventDefault();
    dragOver = null;
    const id = draggedId(e);
    const seat = id != null ? lineup.seats.find((s) => s.driverId === id) : undefined;
    if (seat) removeFromSeat(seat);
  }

  async function save(publish: boolean) {
    if (readOnly || busy) return;
    busy = publish ? 'publish' : 'save';
    error = null;
    success = null;
    const input = { roundId, ...payload(lineup) };
    const snapshot = JSON.stringify(payload(lineup));
    // Dynamisch geladen: im SSR des Islands wird der Action-Client nicht gebraucht
    const { actions } = await import('astro:actions');
    const res = publish ? await actions.admin.lineupPublish({ ...input, discord }) : await actions.admin.lineupSave(input);
    busy = null;
    if (res.error) {
      error = splitErrorMessage(res.error.message);
      // Beim blockierten Veröffentlichen ist der Entwurf trotzdem gespeichert
      if (publish && res.error.code === 'PRECONDITION_FAILED') savedJson = snapshot;
      announce = error.headline;
      return;
    }
    savedJson = snapshot;
    if (publish && res.data && 'status' in res.data) {
      status = res.data.status;
      const posted = 'discord' in res.data && res.data.discord;
      success = `Aufstellung veröffentlicht${posted ? ' und in Discord gepostet' : discord ? ' (Discord-Webhook nicht eingerichtet oder nicht erreichbar)' : ''}.`;
    } else {
      success = 'Entwurf gespeichert.';
    }
    announce = success;
  }
</script>

<div class="gb">
  <p class="sr-only" role="status" aria-live="polite">{announce}</p>

  {#if readOnly && readOnlyReason}
    <p class="alert alert-warning mb-4">{readOnlyReason}</p>
  {/if}
  {#if hasResults && !readOnly}
    <p class="alert mb-4">
      Für diese Runde sind schon Ergebnisse eingetragen. Änderungen an der Aufstellung passen die Ergebnisse nicht an – bitte
      bei Bedarf in der Ergebnis-Eingabe nachziehen.
    </p>
  {/if}

  <div class="gb-layout">
    <section class="gb-grid" aria-labelledby="gb-grid-title">
      <div class="gb-head">
        <h2 id="gb-grid-title" class="text-xl uppercase">
          Cockpits <span class="count">{filled}/{GRID_SIZE}</span>
        </h2>
        <p class="hint">
          Reservefahrer auf ein freies Cockpit ziehen – oder per Tastatur/Touch: erst „Cockpit wählen“, dann den Fahrer im
          Reservepool.
        </p>
      </div>

      <ul class="teams">
        {#each teams as team (team.id)}
          <li class="team" style:--team-color={team.color}>
            <h3 class="team-title">
              <span class="team-stripe" aria-hidden="true"></span>
              {team.name}
            </h3>
            <ul class="seats">
              {#each lineup.seats.filter((s) => s.teamId === team.id) as seat (seatKey(seat))}
                {@const key = seatKey(seat)}
                {@const role = slotRole(seat)}
                <li
                  class="seat"
                  class:selected={selectedSeat === key}
                  class:dragover={dragOver === key}
                  class:empty={seat.driverId == null}
                  ondragover={(e) => dragOverTarget(e, key)}
                  ondragleave={() => (dragOver = dragOver === key ? null : dragOver)}
                  ondrop={(e) => dropOnSeat(e, seat)}
                >
                  <div class="seat-top">
                    <span class="micro">Cockpit {seat.seatNo}</span>
                    {#if seat.driverId != null && role.role === 'reserve'}
                      <span class="badge badge-teal" title="Ersatzfahrer">R<span class="sr-only"> (Ersatz)</span></span>
                    {/if}
                  </div>

                  {#if seat.driverId != null}
                    {@const id = seat.driverId}
                    <div class="occupant" draggable={!readOnly} ondragstart={(e) => dragStart(e, id)} role="presentation">
                      {#if !readOnly}<GripVertical size={16} aria-hidden="true" class="grip" />{/if}
                      <span class="num">#{numberOf(id) ?? '–'}</span>
                      <span class="gamertag">{name(id)}</span>
                    </div>
                    {#if role.role === 'reserve' && role.replacesDriverId != null}
                      <p class="small muted">ersetzt {name(role.replacesDriverId)}</p>
                    {/if}
                    {#each driverIssues(id) as issue (issue.code)}
                      <p class="small" class:err={issue.severity === 'error'} class:warn={issue.severity === 'warning'}>
                        {issue.severity === 'error' ? 'Fehler' : 'Hinweis'}: {issueText(issue)}
                      </p>
                    {/each}
                    {#if !readOnly}
                      <div class="seat-actions">
                        {#if role.role === 'regular'}
                          <button type="button" class="btn btn-ghost compact" onclick={() => absent(id)}>
                            Abwesend<span class="sr-only"> ({name(id)})</span>
                          </button>
                        {/if}
                        <button type="button" class="btn btn-ghost compact" onclick={() => removeFromSeat(seat)}>
                          Entfernen<span class="sr-only"> ({name(id)} aus {seatName(seat)})</span>
                        </button>
                      </div>
                    {/if}
                  {:else}
                    <p class="free">
                      <span class="text-warning">frei</span>
                      {#if seat.regularId != null}
                        <span class="small muted">
                          · Stamm: {name(seat.regularId)}{absentIds.has(seat.regularId) ? ' (abgemeldet)' : ''}
                        </span>
                      {/if}
                    </p>
                  {/if}

                  {#if !readOnly}
                    <button
                      type="button"
                      class="btn compact choose"
                      class:btn-primary={selectedSeat === key}
                      class:btn-secondary={selectedSeat !== key}
                      aria-pressed={selectedSeat === key}
                      onclick={() => chooseSeat(seat)}
                    >
                      {#if selectedDriver != null}
                        {name(selectedDriver)} hierher<span class="sr-only"> ({seatName(seat)})</span>
                      {:else}
                        {selectedSeat === key ? 'Gewählt' : 'Cockpit wählen'}<span class="sr-only"> ({seatName(seat)})</span>
                      {/if}
                    </button>
                  {/if}
                </li>
              {/each}
            </ul>
          </li>
        {/each}
      </ul>
    </section>

    <aside
      class="gb-pool"
      class:dragover={dragOver === 'pool'}
      aria-labelledby="gb-pool-title"
      ondragover={(e) => dragOverTarget(e, 'pool')}
      ondragleave={() => (dragOver = dragOver === 'pool' ? null : dragOver)}
      ondrop={dropOnPool}
    >
      <h2 id="gb-pool-title" class="text-xl uppercase">Reservepool</h2>
      <p class="hint">Sortiert nach Warteliste. Fahrer aus einem Cockpit hierher ziehen, um es freizumachen.</p>
      {#if pool.reserves.length === 0}
        <p class="small muted">Kein freier Reservefahrer.</p>
      {:else}
        <ol class="pool">
          {#each pool.reserves as d (d.id)}
            <li>
              <button
                type="button"
                class="pool-driver"
                draggable={!readOnly}
                disabled={readOnly}
                aria-pressed={selectedDriver === d.id}
                ondragstart={(e) => dragStart(e, d.id)}
                onclick={() => chooseDriver(d.id)}
              >
                <span class="rank">{d.reserve_order ?? '–'}.</span>
                <span class="num">#{numberOf(d.id) ?? '–'}</span>
                <span class="gamertag">{d.gamertag}</span>
                {#if banned.has(d.id)}<span class="badge badge-danger">Sperre</span>{/if}
                {#if selectedSeat != null}<span class="sr-only"> in das gewählte Cockpit setzen</span>{/if}
              </button>
            </li>
          {/each}
        </ol>
      {/if}

      {#if pool.others.length > 0}
        <details class="others">
          <summary>Weitere Fahrer ({pool.others.length})</summary>
          <ul class="pool">
            {#each pool.others as d (d.id)}
              <li>
                <button
                  type="button"
                  class="pool-driver"
                  draggable={!readOnly}
                  disabled={readOnly}
                  aria-pressed={selectedDriver === d.id}
                  ondragstart={(e) => dragStart(e, d.id)}
                  onclick={() => chooseDriver(d.id)}
                >
                  <span class="num">#{numberOf(d.id) ?? '–'}</span>
                  <span class="gamertag">{d.gamertag}</span>
                  <span class="badge badge-muted">{d.status === 'banned' ? 'gesperrt' : d.status === 'inactive' ? 'inaktiv' : 'aktiv'}</span>
                </button>
              </li>
            {/each}
          </ul>
        </details>
      {/if}

      <h3 class="mt-6 font-semibold">Abmeldungen ({lineup.absences.length})</h3>
      {#if lineup.absences.length === 0}
        <p class="small muted">Noch keine. „Abwesend“ am Cockpit markiert eine Abmeldung.</p>
      {:else}
        <ul class="absences">
          {#each lineup.absences as a (a.driverId)}
            <li>
              <p class="gamertag">{name(a.driverId)}</p>
              <label class="checkbox">
                <input
                  type="checkbox"
                  checked={a.reportedInTime}
                  disabled={readOnly}
                  onchange={(e) => inTime(a.driverId, e.currentTarget.checked)}
                />
                <span>rechtzeitig abgemeldet</span>
              </label>
              {#if !readOnly}
                <button type="button" class="btn btn-ghost compact" onclick={() => undoAbsent(a.driverId)}>
                  Zurücknehmen<span class="sr-only"> (Abmeldung {name(a.driverId)})</span>
                </button>
              {/if}
            </li>
          {/each}
        </ul>
      {/if}
    </aside>
  </div>

  <section class="gb-checks card" aria-labelledby="gb-checks-title">
    <h2 id="gb-checks-title" class="text-xl uppercase">Prüfungen</h2>
    {#if errors.length === 0 && warnings.length === 0}
      <p class="ok"><Check size={18} aria-hidden="true" /> Keine Auffälligkeiten – bereit zum Veröffentlichen.</p>
    {:else}
      <ul class="issues">
        {#each errors as issue, i (i)}
          <li class="err"><CircleAlert size={16} aria-hidden="true" /> <strong>Fehler:</strong> {issueText(issue)}</li>
        {/each}
        {#each warnings as issue, i (i)}
          <li class="warn"><TriangleAlert size={16} aria-hidden="true" /> <strong>Hinweis:</strong> {issueText(issue)}</li>
        {/each}
      </ul>
      {#if errors.length > 0}
        <p class="small muted mt-2">Fehler blockieren das Veröffentlichen. Als Entwurf speichern geht trotzdem.</p>
      {/if}
    {/if}
  </section>

  <div class="gb-actions">
    {#if error}
      <div class="alert alert-danger" role="alert">
        <p class="font-semibold">{error.headline}</p>
        {#if error.details.length > 0}
          <ul class="mt-2 list-disc space-y-1 pl-5 text-sm">
            {#each error.details as d, i (i)}<li>{d}</li>{/each}
          </ul>
        {/if}
      </div>
    {/if}
    {#if success}
      <p class="alert alert-success">{success}</p>
    {/if}

    <p class="small muted">
      Status: <strong class="text-fg">{ROUND_STATUS_LABEL[status]}</strong>
      {#if dirty && !readOnly}· <span class="text-warning">ungespeicherte Änderungen</span>{/if}
    </p>

    {#if !readOnly}
      <div class="buttons">
        <button type="button" class="btn btn-ghost" onclick={reset} disabled={busy != null}>Saisonaufstellung</button>
        <button type="button" class="btn btn-secondary" onclick={() => save(false)} disabled={busy != null}>
          {busy === 'save' ? 'Speichert …' : 'Entwurf speichern'}
        </button>
        <label class="checkbox discord">
          <input type="checkbox" bind:checked={discord} />
          <span>Discord-Post (#aufstellung)</span>
        </label>
        <button
          type="button"
          class="btn btn-primary"
          onclick={() => save(true)}
          disabled={busy != null || errors.length > 0}
          aria-describedby={errors.length > 0 ? 'gb-publish-hint' : undefined}
        >
          {busy === 'publish' ? 'Veröffentlicht …' : status === 'scheduled' ? 'Veröffentlichen' : 'Änderungen veröffentlichen'}
        </button>
      </div>
      {#if errors.length > 0}
        <p id="gb-publish-hint" class="small text-danger">Veröffentlichen ist gesperrt, solange Fehler bestehen ({errors.length}).</p>
      {/if}
    {/if}
  </div>
</div>

<style>
  .gb-layout {
    display: grid;
    gap: 1.5rem;
    align-items: start;
  }
  @media (min-width: 1100px) {
    .gb-layout {
      grid-template-columns: minmax(0, 1fr) 20rem;
    }
    .gb-pool {
      position: sticky;
      top: 4.5rem;
      max-height: calc(100dvh - 5.5rem);
      overflow-y: auto;
    }
  }
  .gb-head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.5rem 1rem;
    margin-bottom: 1rem;
  }
  .count {
    font-size: 1rem;
    color: var(--color-muted);
    margin-left: 0.25rem;
  }
  .hint,
  .small {
    font-size: var(--fs-small);
  }
  .hint,
  .muted {
    color: var(--color-muted);
  }
  .teams {
    display: grid;
    gap: 0.75rem;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 15rem), 1fr));
  }
  .team {
    border: 1px solid var(--color-border);
    border-radius: var(--radius-card);
    background: var(--color-surface-1);
    padding: 0.75rem;
  }
  .team-title {
    display: flex;
    align-items: stretch;
    gap: 0.5rem;
    font-size: 1rem;
    text-transform: uppercase;
    margin-bottom: 0.5rem;
  }
  .seats {
    display: grid;
    gap: 0.5rem;
  }
  .seat {
    display: grid;
    gap: 0.35rem;
    padding: 0.625rem;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-control);
    background: var(--color-surface-2);
    transition: border-color 150ms ease-out;
  }
  .seat.empty {
    border-style: dashed;
  }
  .seat.selected {
    border-color: var(--color-teal);
    box-shadow: 0 0 0 1px var(--color-teal);
  }
  .seat.dragover,
  .gb-pool.dragover {
    border-color: var(--color-green);
    box-shadow: 0 0 0 1px var(--color-green);
  }
  .seat-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .occupant {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    min-height: 1.75rem;
  }
  .occupant[draggable='true'] {
    cursor: grab;
  }
  .occupant :global(.grip) {
    color: var(--color-muted);
    flex: none;
  }
  .num {
    font-family: var(--font-display);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: var(--color-muted);
    min-width: 2.25rem;
  }
  .gamertag {
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.02em;
    overflow-wrap: anywhere;
  }
  .err {
    color: var(--color-danger);
  }
  .warn {
    color: var(--color-warning);
  }
  .seat-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
  }
  .compact {
    padding-inline: 0.75rem;
    font-size: 0.8125rem;
  }
  .choose {
    width: 100%;
  }
  .free {
    min-height: 1.75rem;
  }
  .gb-pool {
    border: 1px solid var(--color-border);
    border-radius: var(--radius-card);
    background: var(--color-surface-1);
    padding: 1rem;
  }
  .pool {
    display: grid;
    gap: 0.375rem;
    margin-top: 0.75rem;
  }
  .pool-driver {
    display: flex;
    width: 100%;
    align-items: center;
    gap: 0.5rem;
    min-height: 44px;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-control);
    background: var(--color-surface-2);
    color: var(--color-fg);
    text-align: left;
    cursor: pointer;
    font: inherit;
  }
  .pool-driver[draggable='true'] {
    cursor: grab;
  }
  .pool-driver:hover:not(:disabled) {
    border-color: #3a3a42;
  }
  .pool-driver[aria-pressed='true'] {
    border-color: var(--color-teal);
    box-shadow: 0 0 0 1px var(--color-teal);
  }
  .pool-driver:disabled {
    cursor: default;
    opacity: 0.8;
  }
  .rank {
    color: var(--color-muted);
    font-variant-numeric: tabular-nums;
    min-width: 1.5rem;
  }
  .others {
    margin-top: 1rem;
  }
  .others summary {
    min-height: 44px;
    display: flex;
    align-items: center;
    cursor: pointer;
    color: var(--color-muted);
  }
  .absences {
    display: grid;
    gap: 0.5rem;
    margin-top: 0.5rem;
  }
  .absences li {
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-control);
  }
  .gb-checks {
    margin-top: 1.5rem;
    padding: 1rem;
  }
  .ok {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: var(--color-green);
    margin-top: 0.5rem;
  }
  .issues {
    display: grid;
    gap: 0.375rem;
    margin-top: 0.5rem;
  }
  .issues li {
    display: flex;
    align-items: baseline;
    gap: 0.4rem;
  }
  .gb-actions {
    display: grid;
    gap: 0.75rem;
    margin-top: 1.5rem;
  }
  .buttons {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.75rem;
  }
  .discord {
    align-items: center;
  }
  .text-fg {
    color: var(--color-fg);
  }
  .text-danger {
    color: var(--color-danger);
  }
</style>
