<script lang="ts">
  /**
   * Countdown zum nächsten Rennen (Plan §3.5, §4.2): Tage, Std., Min., Sek. in großen
   * Tabular-Ziffern. Kein sekündliches aria-live – der Termin steht als Text daneben.
   * Die Ziffern wechseln nur (kein Kippen); der Verlauf-Balken zeigt den Fortschritt
   * seit dem letzten Rennen.
   */
  import { onMount } from 'svelte';

  interface Target {
    startUtc: string;
    label: string;
    href: string;
    dateText: string;
  }

  interface Props {
    targets: Target[];
    /** Start des letzten Rennens – Basis für den Fortschrittsbalken */
    previousStartUtc?: string | null;
    labels: { days: string; hours: string; minutes: string; seconds: string; next: string; now: string; none: string };
  }

  let { targets, previousStartUtc = null, labels }: Props = $props();

  let now = $state<number | null>(null);

  onMount(() => {
    now = Date.now();
    const id = setInterval(() => (now = Date.now()), 1000);
    return () => clearInterval(id);
  });

  const LIVE_WINDOW = 3 * 3_600_000;
  const target = $derived(
    now == null ? targets[0] : targets.find((t) => new Date(t.startUtc).getTime() > now! - LIVE_WINDOW),
  );
  const startMs = $derived(target ? new Date(target.startUtc).getTime() : 0);
  const diff = $derived(now == null || !target ? null : Math.max(0, startMs - now));
  const isLive = $derived(diff === 0 && target != null);
  const parts = $derived.by(() => {
    if (diff == null) return ['––', '––', '––', '––'];
    const s = Math.floor(diff / 1000);
    return [Math.floor(s / 86400), Math.floor((s % 86400) / 3600), Math.floor((s % 3600) / 60), s % 60].map((v) =>
      String(v).padStart(2, '0'),
    );
  });
  const progress = $derived.by(() => {
    if (now == null || !target || !previousStartUtc) return 0;
    const from = new Date(previousStartUtc).getTime();
    return Math.min(1, Math.max(0, (now - from) / (startMs - from)));
  });
  const units = $derived([labels.days, labels.hours, labels.minutes, labels.seconds]);
</script>

{#if target}
  <div class="countdown">
    <p class="micro">{labels.next}</p>
    <a class="target" href={target.href}>{target.label}</a>
    <p class="date">{target.dateText}</p>
    {#if isLive}
      <p class="live"><span class="live-dot" aria-hidden="true"></span>{labels.now}</p>
    {:else}
      <div class="digits" aria-hidden="true">
        {#each parts as value, i (i)}
          <div class="unit">
            <span class="value">{value}</span>
            <span class="label">{units[i]}</span>
          </div>
        {/each}
      </div>
    {/if}
    <div class="bar" aria-hidden="true"><span style:width={`${Math.round(progress * 100)}%`}></span></div>
  </div>
{:else}
  <p class="text-muted">{labels.none}</p>
{/if}

<style>
  .countdown {
    display: grid;
    gap: 0.35rem;
  }
  .target {
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 1.5rem;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    text-decoration: none;
  }
  .target:hover {
    color: var(--color-teal);
  }
  .date {
    color: var(--color-muted);
    font-size: 0.9375rem;
  }
  .digits {
    display: flex;
    gap: 0.75rem;
    margin-top: 0.75rem;
  }
  .unit {
    display: grid;
    justify-items: center;
    min-width: 3.6rem;
    padding: 0.5rem 0.25rem;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-control);
    background: rgb(14 14 16 / 0.8);
  }
  .value {
    font-family: var(--font-display);
    font-weight: 700;
    font-size: clamp(2rem, 1.6rem + 2vw, 3rem);
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }
  .label {
    margin-top: 0.3rem;
    font-size: 0.7rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--color-muted);
  }
  .bar {
    height: 2px;
    margin-top: 0.75rem;
    background: var(--color-border);
    border-radius: 2px;
    overflow: hidden;
  }
  .bar span {
    display: block;
    height: 100%;
    background: var(--g-accent);
  }
  .live {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-top: 0.5rem;
    font-family: var(--font-display);
    font-weight: 700;
    text-transform: uppercase;
    color: var(--color-teal);
  }
</style>
