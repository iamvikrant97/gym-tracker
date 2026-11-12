<script lang="ts">
  import { checkScriptUrl, importFromSheet } from '../lib/sync';
  import { restoreBackup } from '../lib/backup';
  import { workout } from '../lib/workout.svelte';

  /** For someone who already uses the app on another phone: bring the data back, then the app re-checks and opens Home. */
  let { onback, onrecheck }: { onback: () => void; onrecheck: () => Promise<boolean> } = $props();

  let url = $state('');
  let key = $state('');
  let msg = $state<{ text: string; bad: boolean } | null>(null);
  let busy = $state(false);
  let fileInput: HTMLInputElement | undefined = $state();

  const NOTHING = 'There was nothing to restore in that. Try another file or check the Sheet details.';

  async function afterLoad(text: string) {
    if (!(await onrecheck())) msg = { text: NOTHING, bad: true };
    else msg = { text, bad: false };
  }

  async function importFile(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || busy) return;
    busy = true;
    try {
      const r = await restoreBackup(await file.text());
      await afterLoad(`Restored ${r.sets} sets`);
    } catch (err) {
      msg = { text: err instanceof Error ? err.message : 'Could not read that file', bad: true };
    } finally {
      busy = false;
    }
  }

  async function connect() {
    if (busy) return;
    const u = url.trim();
    const k = key.trim();
    const bad = checkScriptUrl(u) ?? (k ? null : 'Paste the key first');
    if (bad) {
      msg = { text: bad, bad: true };
      return;
    }
    busy = true;
    msg = { text: 'Connecting…', bad: false };
    try {
      await workout.updateSettings({ scriptUrl: u, scriptKey: k });
      const r = await importFromSheet();
      if (!r.ok) msg = { text: r.error ?? 'Import failed', bad: true };
      else await afterLoad(`Imported ${r.imported} sets`);
    } finally {
      busy = false;
    }
  }
</script>

<section class="restore" aria-labelledby="restore-title">
  <header class="top">
    <button class="back press" type="button" aria-label="Back" onclick={onback}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
    </button>
  </header>
  <h1 id="restore-title">Restore your data</h1>
  <p class="lead">Your plan and history come back with it, and you go straight to Today.</p>

  <article class="card">
    <h2>Backup file</h2>
    <button class="secondary press" type="button" disabled={busy} onclick={() => fileInput?.click()}>Import backup file</button>
    <input bind:this={fileInput} class="sr-only" type="file" accept="application/json,.json" aria-label="Backup file" onchange={importFile} />
  </article>

  <article class="card">
    <h2>Google Sheet</h2>
    <label class="field">Web app URL
      <input type="url" inputmode="url" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="https://script.google.com/macros/s/…/exec" bind:value={url} />
    </label>
    <label class="field">Key
      <input type="password" autocomplete="off" autocapitalize="off" spellcheck="false" bind:value={key} />
    </label>
    <button class="primary btn-primary press" type="button" disabled={busy} onclick={connect}>Save and import</button>
  </article>

  {#if msg}<p class="msg" class:bad={msg.bad} role="status">{msg.text}</p>{/if}
</section>

<style>
  .restore { max-width: 440px; margin: 0 auto; padding: 0 16px 48px; }
  .top { display: flex; align-items: center; min-height: 64px; padding-top: 6px; }
  .back { width: 48px; height: 48px; margin-left: -12px; display: grid; place-items: center; border-radius: 12px; }
  .back svg { width: 22px; height: 22px; }
  h1 { font: 800 32px/1.05 var(--body); letter-spacing: -0.02em; margin: 14px 0 10px; }
  .lead { margin: 0 0 8px; color: var(--muted); font-size: 14.5px; }
  .card { background: var(--surface); border: 1px solid var(--line); border-radius: 20px; padding: 18px; margin-top: 14px; display: grid; gap: 12px; }
  h2 { margin: 0; font-size: 12px; font-weight: 600; color: var(--muted); letter-spacing: 0.04em; text-transform: uppercase; }
  .field { display: grid; gap: 6px; font-size: 12.5px; color: var(--muted); }
  input:not(.sr-only) { height: 48px; width: 100%; min-width: 0; border-radius: 12px; border: 1px solid var(--line); background: var(--raised); color: var(--text); padding: 0 12px; font: inherit; font-size: 15px; }
  input:focus-visible { outline: 2px solid var(--blue); outline-offset: 1px; }
  .primary { height: 52px; border-radius: 14px; font-size: 15px; width: 100%; }
  .secondary { height: 52px; border-radius: 12px; background: var(--raised); border: 1px solid var(--line); font-size: 14.5px; }
  .primary:disabled, .secondary:disabled { opacity: 0.55; }
  .msg { margin: 14px 0 0; font-size: 13.5px; }
  .msg.bad { color: var(--amber); }
</style>
