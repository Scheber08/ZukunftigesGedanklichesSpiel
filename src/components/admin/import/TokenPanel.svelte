<script lang="ts">
  /**
   * Import-Token für das Telemetrie-Companion (Plan Phase 2): erzeugen bzw. neu erzeugen
   * (Klartext genau einmal sichtbar, gespeichert wird nur der SHA-256-Hash), widerrufen, Status
   * und Beispiel-Befehlszeilen.
   */
  interface Props {
    configured: boolean;
    createdText: string | null;
    createdBy: string | null;
    fingerprint: string | null;
    siteUrl: string;
    demo: boolean;
    /** Name der angemeldeten Person (für „von …“ nach dem Erzeugen) */
    currentName: string;
  }

  let { configured: configuredInitial, createdText: createdInitial, createdBy, fingerprint: fingerprintInitial, siteUrl, demo, currentName }: Props = $props();

  let configured = $state(configuredInitial);
  let createdText = $state(createdInitial);
  let creator = $state(createdBy);
  let fingerprint = $state(fingerprintInitial);
  let token = $state<string | null>(null);
  let confirming = $state<'create' | 'revoke' | null>(null);
  let busy = $state(false);
  let message = $state<{ kind: 'success' | 'danger'; text: string } | null>(null);
  let copied = $state<string | null>(null);

  const tokenValue = $derived(token ?? '<TOKEN>');
  const psCommand = $derived(`$env:LIGA_IMPORT_TOKEN = "${tokenValue}"\nnode tools/telemetry/companion.mjs --url ${siteUrl}`);
  const shCommand = $derived(`LIGA_IMPORT_TOKEN='${tokenValue}' node tools/telemetry/companion.mjs --url ${siteUrl}`);

  const OFFLINE = 'Keine Verbindung zum Server – bitte die Seite neu laden und erneut versuchen.';

  const formatBerlin = (iso: string) =>
    new Date(iso).toLocaleString('de-DE', { timeZone: 'Europe/Berlin', dateStyle: 'medium', timeStyle: 'short' });

  async function create() {
    if (configured && confirming !== 'create') {
      confirming = 'create';
      return;
    }
    busy = true;
    message = null;
    let res;
    try {
      const { actions } = await import('astro:actions');
      res = await actions.admin.importTokenCreate({ confirm: true });
    } catch {
      busy = false;
      message = { kind: 'danger', text: OFFLINE };
      return;
    }
    busy = false;
    confirming = null;
    if (res.error) {
      message = { kind: 'danger', text: res.error.message };
      return;
    }
    token = res.data.token;
    configured = true;
    createdText = `${formatBerlin(res.data.createdAt)} Uhr`;
    creator = currentName;
    fingerprint = res.data.fingerprint;
    message = { kind: 'success', text: 'Neues Token erzeugt. Ein altes Token funktioniert ab sofort nicht mehr.' };
  }

  async function revoke() {
    if (confirming !== 'revoke') {
      confirming = 'revoke';
      return;
    }
    busy = true;
    message = null;
    let res;
    try {
      const { actions } = await import('astro:actions');
      res = await actions.admin.importTokenRevoke({ confirm: true });
    } catch {
      busy = false;
      message = { kind: 'danger', text: OFFLINE };
      return;
    }
    busy = false;
    confirming = null;
    if (res.error) {
      message = { kind: 'danger', text: res.error.message };
      return;
    }
    token = null;
    configured = false;
    createdText = null;
    creator = null;
    fingerprint = null;
    message = { kind: 'success', text: 'Token widerrufen. Uploads werden jetzt abgelehnt, bis ein neues Token erzeugt wird.' };
  }

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      copied = what;
      setTimeout(() => {
        if (copied === what) copied = null;
      }, 2500);
    } catch {
      copied = null;
      message = { kind: 'danger', text: 'Kopieren ist nicht möglich – bitte markieren und mit Strg+C kopieren.' };
    }
  }
</script>

<div class="token">
  <p class="status" role="status">
    {#if configured}
      <span class="badge badge-green">eingerichtet</span>
      seit {createdText ?? '–'}{creator ? ` · von ${creator}` : ''}{fingerprint ? ` · Kennung ${fingerprint}` : ''}
    {:else}
      <span class="badge badge-muted">kein Token</span>
      Das Companion-Programm kann noch nichts hochladen (Antwort 503).
    {/if}
  </p>

  {#if message}
    <p class={`alert alert-${message.kind} mt-3`} role={message.kind === 'danger' ? 'alert' : 'status'}>{message.text}</p>
  {/if}

  {#if token}
    <div class="alert alert-warning mt-3">
      <p class="font-semibold">Nur jetzt sichtbar – bitte sicher aufbewahren (z. B. Passwort-Manager).</p>
      <p class="small mt-1">Gespeichert ist nur ein Hash. Geht das Token verloren, einfach ein neues erzeugen.</p>
      <div class="field mt-3">
        <label for="imp-token" class="label">Import-Token</label>
        <div class="flex flex-wrap gap-2">
          <input id="imp-token" class="input mono grow" readonly value={token} onfocus={(e) => e.currentTarget.select()} />
          <button type="button" class="btn btn-secondary" onclick={() => copy(token!, 'token')}>{copied === 'token' ? 'Kopiert' : 'Kopieren'}</button>
        </div>
      </div>
    </div>
  {/if}

  <div class="mt-4 flex flex-wrap items-center gap-3">
    <button type="button" class="btn btn-primary" disabled={busy} onclick={create}>
      {busy && confirming !== 'revoke' ? 'Erzeugt …' : confirming === 'create' ? 'Ja, neues Token erzeugen' : configured ? 'Neues Token erzeugen' : 'Token erzeugen'}
    </button>
    {#if configured}
      <button type="button" class="btn btn-danger" disabled={busy} onclick={revoke}>
        {confirming === 'revoke' ? 'Ja, widerrufen' : 'Token widerrufen'}
      </button>
    {/if}
    {#if confirming}
      <button type="button" class="btn btn-ghost" onclick={() => (confirming = null)}>Abbrechen</button>
      <span class="small text-warning" role="status">
        {confirming === 'create' ? 'Das bisherige Token wird sofort ungültig.' : 'Uploads werden danach abgelehnt.'}
      </span>
    {/if}
  </div>

  <h3 class="mt-6 text-lg uppercase">Companion starten</h3>
  <p class="small muted mt-1">
    Auf dem Lobby-PC im Ordner des Liga-Repos (Node.js 22 oder neuer). Das Token am besten als Umgebungsvariable setzen – dann steht es nicht in der
    Prozessliste.{demo ? ' Im Demo-Modus funktioniert der Upload gegen den lokalen Dev-Server.' : ''}
  </p>
  <div class="cmd mt-3">
    <div class="cmd-head">
      <span class="micro">Windows (PowerShell)</span>
      <button type="button" class="btn btn-ghost btn-sm" onclick={() => copy(psCommand, 'ps')}>{copied === 'ps' ? 'Kopiert' : 'Kopieren'}</button>
    </div>
    <pre class="mono"><code>{psCommand}</code></pre>
  </div>
  <div class="cmd mt-3">
    <div class="cmd-head">
      <span class="micro">macOS/Linux (Bash)</span>
      <button type="button" class="btn btn-ghost btn-sm" onclick={() => copy(shCommand, 'sh')}>{copied === 'sh' ? 'Kopiert' : 'Kopieren'}</button>
    </div>
    <pre class="mono"><code>{shCommand}</code></pre>
  </div>
  <p class="small muted mt-3">
    Weitere Optionen: <code>--dry-run</code> (nur lokal sichern), <code>--record feldtest.ndjson</code> (Pakete mitschneiden),
    <code>--round &lt;id&gt;</code> / <code>--session sprint</code> (Zuordnung vorgeben), <code>--help</code>. Anleitung: docs/TELEMETRIE.md.
  </p>
</div>

<style>
  .status {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.25rem 0.5rem;
  }
  .mono {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 0.8125rem;
  }
  .grow {
    flex: 1 1 16rem;
    min-width: 0;
  }
  .small {
    font-size: var(--fs-small);
  }
  .muted {
    color: var(--color-muted);
  }
  .cmd {
    border: 1px solid var(--color-border);
    border-radius: var(--radius-card);
    background: var(--color-surface-2);
    overflow: hidden;
  }
  .cmd-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0.25rem 0.5rem 0.25rem 0.75rem;
    border-bottom: 1px solid var(--color-border);
  }
  pre {
    margin: 0;
    padding: 0.75rem;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
</style>
