<script lang="ts">
  import { onMount } from 'svelte';
  import { getAll, listExercises, loadSettings, DEFAULT_SETTINGS } from '../lib/db';
  import type { QueueItem } from '../lib/db';
  import {
    attentionIds, checkScriptUrl, flush, importFromSheet, lastSyncAt, onSyncChange, syncLabel, syncStatus, testConnection,
  } from '../lib/sync';
  import type { SyncState } from '../lib/sync';
  import { backupFileName, exportAll, restoreBackup } from '../lib/backup';
  import { redirectUri, disconnect } from '../lib/spotify/auth';
  import { spotify } from '../lib/spotify/player.svelte';
  import { workout, MAX_REST_SEC } from '../lib/workout.svelte';
  import { fmtClock, fmtKg } from '../lib/workoutView';
  import Sheet from '../ui/Sheet.svelte';
  import AddExerciseForm from '../ui/AddExerciseForm.svelte';
  import { showToast } from '../ui/toast.svelte';
  import type { Exercise, Muscle, Settings } from '../lib/types';

  const MUSCLES: Muscle[] = ['Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Quads', 'Hamstrings', 'Calves', 'Abs', 'Other'];
  const REST_CHOICES = Array.from({ length: (MAX_REST_SEC - 60) / 15 + 1 }, (_, i) => 60 + i * 15);
  const STEP_CHOICES = [0.5, 1, 1.25, 2, 2.5, 5, 10];

  let settings = $state.raw<Settings>(DEFAULT_SETTINGS);
  let library = $state.raw<Exercise[]>([]);
  let url = $state('');
  let key = $state('');
  let clientId = $state('');
  let bodyKg = $state('65');
  let sheetMsg = $state<{ text: string; bad: boolean } | null>(null);
  let spotifyMsg = $state('');
  let backupMsg = $state<{ text: string; bad: boolean } | null>(null);
  let busy = $state(false);
  let status = $state<SyncState>('not-set-up');
  let lastAt = $state<number | null>(null);
  let waiting = $state(0);
  let attention = $state(0);
  let addFor = $state<Muscle | null>(null);
  let fileInput: HTMLInputElement | undefined = $state();

  async function load() {
    settings = await loadSettings();
    library = await listExercises();
    url = settings.scriptUrl ?? '';
    key = settings.scriptKey ?? '';
    clientId = settings.spotifyClientId ?? '';
    bodyKg = String(settings.bodyKg ?? 65);
  }

  async function refreshStatus() {
    try {
      const [s, at, q, att] = await Promise.all([syncStatus(), lastSyncAt(), getAll<QueueItem>('queue'), attentionIds()]);
      status = s;
      lastAt = at;
      waiting = q.length - att.length;
      attention = att.length;
    } catch {
      /* storage unavailable */
    }
  }

  onMount(() => {
    void load().then(refreshStatus);
    void spotify.sync();
    return onSyncChange(() => void refreshStatus());
  });

  async function save(change: Partial<Settings> | ((cur: Settings) => Settings)) {
    settings = await workout.updateSettings(change);
  }

  // ---- Google Sheet ----
  async function saveSheet(): Promise<boolean> {
    const u = url.trim();
    const k = key.trim();
    const bad = checkScriptUrl(u) ?? (k ? null : 'Paste the key first');
    if (bad) {
      sheetMsg = { text: bad, bad: true };
      return false;
    }
    url = u;
    key = k;
    await save({ scriptUrl: u, scriptKey: k });
    return true;
  }

  async function saveAndImport() {
    if (busy) return;
    busy = true;
    sheetMsg = { text: 'Connecting…', bad: false };
    try {
      if (!(await saveSheet())) return;
      const r = await importFromSheet();
      if (!r.ok) {
        sheetMsg = { text: r.error ?? 'Import failed', bad: true };
        return;
      }
      await workout.refreshShared();
      sheetMsg = { text: r.imported > 0 ? `Imported ${r.imported} set${r.imported === 1 ? '' : 's'}` : 'Connected · nothing new to import', bad: false };
      void flush();
    } finally {
      busy = false;
      void refreshStatus();
    }
  }

  async function test() {
    if (busy) return;
    busy = true;
    sheetMsg = { text: 'Testing…', bad: false };
    try {
      if (!(await saveSheet())) return;
      const r = await testConnection();
      sheetMsg = r.ok ? { text: `Connected · the Sheet has ${r.rows} logged set${r.rows === 1 ? '' : 's'}`, bad: false } : { text: r.error, bad: true };
    } finally {
      busy = false;
    }
  }

  async function syncNow() {
    if (busy) return;
    busy = true;
    try {
      const r = await flush();
      sheetMsg = r.ok ? { text: r.sent ? `Sent ${r.sent} change${r.sent === 1 ? '' : 's'} to the Sheet` : 'Everything is in the Sheet', bad: false } : { text: 'Could not sync now. It will retry by itself', bad: true };
    } finally {
      busy = false;
      void refreshStatus();
    }
  }

  const statusText = $derived.by(() => {
    if (status === 'not-set-up') return 'Not connected · sets are saved on this phone';
    const parts = [syncLabel(status, lastAt).text];
    if (waiting > 0) parts.push(`${waiting} waiting`);
    if (attention > 0) parts.push(`${attention} the Sheet keeps refusing`);
    if (status !== 'synced' && lastAt) parts.push(`last sync ${new Date(lastAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}`);
    return parts.join(' · ');
  });

  // ---- Spotify ----
  const redirect = redirectUri();
  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      showToast(`${what} copied`);
    } catch {
      showToast('Copy did not work: select the text and copy it');
    }
  }
  async function connectSpotify() {
    const id = clientId.trim();
    if (!id) {
      spotifyMsg = 'Paste the Client ID first';
      return;
    }
    await save({ spotifyClientId: id });
    spotifyMsg = 'Opening Spotify login…';
    await spotify.connect();
  }
  async function saveClientId() {
    await save({ spotifyClientId: clientId.trim() || undefined });
    void spotify.sync();
  }
  async function disconnectSpotify() {
    await disconnect();
    await spotify.sync();
    spotifyMsg = 'Disconnected';
  }

  // ---- training ----
  async function setTarget(n: number) {
    const v = Math.min(7, Math.max(1, n));
    await save({ weeklyTarget: v });
  }
  async function saveBody() {
    const v = Number(String(bodyKg).replace(',', '.'));
    if (!Number.isFinite(v) || v < 30 || v > 250) {
      bodyKg = String(settings.bodyKg);
      showToast('Body weight must be between 30 and 250 kg');
      return;
    }
    await save({ bodyKg: Math.round(v * 10) / 10 });
  }
  async function repeatLast() {
    try {
      await workout.repeatLast();
      location.hash = '#/workout';
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not start');
    }
  }

  // ---- exercises ----
  const groups = $derived(MUSCLES.map((m) => ({ muscle: m, list: library.filter((e) => e.muscle === m) })).filter((g) => g.list.length || g.muscle !== 'Other'));
  async function setRest(id: string, value: string) {
    await save((cur) => {
      const restOverrides = { ...cur.restOverrides };
      if (value === '') delete restOverrides[id];
      else restOverrides[id] = Number(value);
      return { ...cur, restOverrides };
    });
  }
  async function setStep(id: string, value: string) {
    await save((cur) => {
      const stepOverrides = { ...cur.stepOverrides };
      if (value === '') delete stepOverrides[id];
      else stepOverrides[id] = Number(value);
      return { ...cur, stepOverrides };
    });
  }
  async function added(ex: Exercise) {
    addFor = null;
    library = await listExercises();
    showToast(`${ex.name} added`);
  }

  // ---- backup ----
  async function exportFile() {
    try {
      const data = JSON.stringify(await exportAll(), null, 1);
      const blob = new Blob([data], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = backupFileName();
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
      backupMsg = { text: `Saved ${a.download} to Downloads`, bad: false };
    } catch {
      backupMsg = { text: 'Could not save the file. Try Copy backup instead', bad: true };
    }
  }
  async function copyBackup() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(await exportAll()));
      backupMsg = { text: 'Backup copied. Paste it into a note or an email to yourself', bad: false };
    } catch {
      backupMsg = { text: 'Copy did not work here. Use Export backup', bad: true };
    }
  }
  async function importFile(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      const r = await restoreBackup(await file.text());
      await workout.refreshShared();
      await load();
      backupMsg = { text: `Restored ${r.sets} set${r.sets === 1 ? '' : 's'}, ${r.workouts} workout${r.workouts === 1 ? '' : 's'}, ${r.exercises} exercise${r.exercises === 1 ? '' : 's'}`, bad: false };
    } catch (err) {
      backupMsg = { text: err instanceof Error ? err.message : 'Could not read that file', bad: true };
    }
  }
</script>

<section class="screen">
  <header class="top">
    <button class="back press" type="button" aria-label="Back to Today" onclick={() => (location.hash = workout.active ? '#/workout' : '#/')}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
    </button>
    <h1 class="page-title">Settings</h1>
  </header>

  <!-- Google Sheet -->
  <article class="card">
    <h2>Google Sheet</h2>
    <p class="status" class:warn={status === 'offline' || status === 'attention'} data-testid="sync-status">{statusText}</p>
    <label class="field">Web app URL
      <input type="url" inputmode="url" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="https://script.google.com/macros/s/…/exec" bind:value={url} />
    </label>
    <label class="field">Key
      <input type="password" autocomplete="off" autocapitalize="off" spellcheck="false" bind:value={key} />
    </label>
    <button class="primary btn-primary press" type="button" disabled={busy} onclick={saveAndImport}>Save and import</button>
    <div class="pair">
      <button class="secondary press" type="button" disabled={busy} onclick={test}>Test connection</button>
      <button class="secondary press" type="button" disabled={busy || status === 'not-set-up'} onclick={syncNow}>Sync now</button>
    </div>
    {#if sheetMsg}<p class="msg" class:bad={sheetMsg.bad} role="status">{sheetMsg.text}</p>{/if}
    <p class="hint">Import adds sets from the Sheet that the app does not have yet. It is safe to run again.</p>
  </article>

  <!-- Spotify -->
  <article class="card">
    <h2>Spotify</h2>
    <p class="status">{spotify.connected ? (spotify.needsAuth ? 'Login expired · connect again' : 'Connected') : 'Not connected'}</p>
    <label class="field">Client ID
      <input type="text" autocomplete="off" autocapitalize="off" spellcheck="false" bind:value={clientId} onchange={saveClientId} />
    </label>
    <div class="field">
      <span>Redirect URI (paste this exactly in the Spotify dashboard)</span>
      <div class="copyrow">
        <code>{redirect}</code>
        <button class="secondary small press" type="button" onclick={() => copy(redirect, 'Redirect URI')}>Copy</button>
      </div>
    </div>
    <div class="pair">
      <button class="primary btn-primary press" type="button" onclick={connectSpotify}>{spotify.connected ? 'Connect again' : 'Connect Spotify'}</button>
      {#if spotify.connected}<button class="secondary press" type="button" onclick={disconnectSpotify}>Disconnect</button>{/if}
    </div>
    {#if spotifyMsg}<p class="msg" role="status">{spotifyMsg}</p>{/if}
  </article>

  <!-- Training -->
  <article class="card">
    <h2>Training</h2>
    <div class="line">
      <label for="target">Sessions per week</label>
      <div class="stepper">
        <button type="button" class="press" aria-label="Fewer sessions" onclick={() => setTarget(settings.weeklyTarget - 1)}>−</button>
        <input id="target" type="number" readonly value={settings.weeklyTarget} />
        <button type="button" class="press" aria-label="More sessions" onclick={() => setTarget(settings.weeklyTarget + 1)}>+</button>
      </div>
    </div>
    <div class="line">
      <label for="body">Body weight (kg)</label>
      <input id="body" class="num" type="number" inputmode="decimal" step="0.1" min="30" max="250" bind:value={bodyKg} onchange={saveBody} />
    </div>
    <div class="line">
      <span id="pause-lbl">Pause training<small>Injury or a break: hides the legs reminder</small></span>
      <button type="button" role="switch" class="switch" aria-checked={settings.paused} aria-labelledby="pause-lbl" onclick={() => save((c) => ({ ...c, paused: !c.paused }))}><i></i></button>
    </div>
    <button class="secondary wide press" type="button" disabled={workout.active} onclick={repeatLast}>Repeat last workout</button>
    {#if workout.active}<p class="hint">A workout is open. Finish it before repeating the last one.</p>{/if}
  </article>

  <!-- Exercises -->
  <article class="card">
    <h2>Exercises</h2>
    <p class="hint">Rest and weight step per exercise. Default uses the programme.</p>
    {#each groups as g (g.muscle)}
      <details>
        <summary><span>{g.muscle}</span><small>{g.list.length}</small></summary>
        {#each g.list as ex (ex.id)}
          <div class="ex">
            <div class="ex-name">{ex.name}</div>
            <div class="ex-ctl">
              <select aria-label="Rest for {ex.name}" value={settings.restOverrides[ex.id] !== undefined ? String(settings.restOverrides[ex.id]) : ''} onchange={(e) => setRest(ex.id, e.currentTarget.value)}>
                <option value="">Rest {fmtClock(Math.min(ex.restSec, MAX_REST_SEC))} (default)</option>
                {#each REST_CHOICES as r (r)}<option value={String(r)}>Rest {fmtClock(r)}</option>{/each}
              </select>
              <select aria-label="Weight step for {ex.name}" value={settings.stepOverrides[ex.id] !== undefined ? String(settings.stepOverrides[ex.id]) : ''} onchange={(e) => setStep(ex.id, e.currentTarget.value)}>
                <option value="">Step {fmtKg(ex.step)} kg (default)</option>
                {#each STEP_CHOICES as s (s)}<option value={String(s)}>Step {fmtKg(s)} kg</option>{/each}
              </select>
            </div>
          </div>
        {/each}
        <button type="button" class="add press" onclick={() => (addFor = g.muscle)}>+ Add exercise</button>
      </details>
    {/each}
  </article>

  <!-- Backup -->
  <article class="card">
    <h2>Backup</h2>
    <p class="hint">The Sheet is your main backup. This file is a second copy of everything on this phone (without the key or Spotify login).</p>
    <div class="pair">
      <button class="secondary press" type="button" onclick={exportFile}>Export backup</button>
      <button class="secondary press" type="button" onclick={copyBackup}>Copy backup</button>
    </div>
    <button class="secondary wide press" type="button" onclick={() => fileInput?.click()}>Import backup file</button>
    <input bind:this={fileInput} class="sr-only" type="file" accept="application/json,.json" aria-label="Backup file" onchange={importFile} />
    {#if backupMsg}<p class="msg" class:bad={backupMsg.bad} role="status">{backupMsg.text}</p>{/if}
  </article>

  <p class="about">Version {__APP_VERSION__} · built {__BUILD_DATE__}</p>
</section>

<Sheet open={addFor !== null} onclose={() => (addFor = null)} title="Add exercise" sub="It shows up in Swap for its category">
  {#if addFor}
    {#key addFor}<AddExerciseForm muscle={addFor} onadded={added} />{/key}
  {/if}
</Sheet>

<style>
  .screen { padding-bottom: 48px; }
  .top { display: flex; align-items: center; gap: 4px; margin: 10px 0 4px; }
  .top .page-title { margin: 0; }
  .back { width: 48px; height: 48px; margin-left: -12px; display: grid; place-items: center; border-radius: 12px; flex: none; }
  .back svg { width: 22px; height: 22px; }
  .card { background: var(--surface); border: 1px solid var(--line); border-radius: 20px; padding: 18px; margin-top: 14px; display: grid; gap: 12px; }
  h2 { margin: 0; font-size: 12px; font-weight: 600; color: var(--muted); letter-spacing: 0.04em; text-transform: uppercase; }
  .status { margin: -4px 0 0; font-size: 13.5px; color: var(--text); }
  .status.warn { color: var(--amber); }
  .field { display: grid; gap: 6px; font-size: 12.5px; color: var(--muted); }
  input:not(.sr-only), select {
    height: 48px; width: 100%; min-width: 0; border-radius: 12px; border: 1px solid var(--line); background: var(--raised);
    color: var(--text); padding: 0 12px; font: inherit; font-size: 15px;
  }
  input:focus-visible, select:focus-visible { outline: 2px solid var(--blue); outline-offset: 1px; }
  .primary { height: 52px; border-radius: 14px; font-size: 15px; width: 100%; }
  .primary:disabled, .secondary:disabled { opacity: 0.55; }
  .secondary { height: 48px; border-radius: 12px; background: var(--raised); border: 1px solid var(--line); font-size: 14px; padding: 0 14px; }
  .secondary.small { height: 44px; min-width: 64px; flex: none; }
  .secondary.wide { width: 100%; }
  .pair { display: flex; gap: 10px; }
  .pair > * { flex: 1; }
  .msg { margin: 0; font-size: 13px; color: var(--text); }
  .msg.bad { color: var(--amber); }
  .hint { margin: 0; font-size: 12.5px; color: var(--muted); }
  .copyrow { display: flex; gap: 8px; align-items: center; }
  code {
    flex: 1; min-width: 0; overflow-wrap: anywhere; font: 500 13px/1.35 ui-monospace, monospace; color: var(--blue-ink);
    background: var(--ground); border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px; user-select: all;
  }
  .line { display: flex; align-items: center; gap: 12px; min-height: 48px; font-size: 15px; }
  .line > :first-child { flex: 1; }
  .line small { display: block; font-size: 12px; color: var(--muted); }
  .line input.num { width: 96px; flex: none; text-align: center; }
  .stepper { display: flex; align-items: center; gap: 4px; }
  .stepper button { width: 48px; height: 48px; border-radius: 12px; background: var(--raised); font-size: 20px; }
  .stepper input:not(.sr-only) { width: 52px; text-align: center; padding: 0; background: transparent; border: 0; font: 600 18px/1 var(--display); -moz-appearance: textfield; appearance: textfield; }
  .switch { width: 52px; height: 32px; border-radius: 16px; background: var(--raised); border: 2px solid var(--ring); position: relative; flex: none; transition: background 200ms var(--ease-out); }
  .switch i { position: absolute; top: 3px; left: 3px; width: 22px; height: 22px; border-radius: 50%; background: var(--muted); transition: transform 200ms var(--ease-out), background 200ms; }
  .switch[aria-checked='true'] { background: var(--blue-deep); border-color: var(--blue); }
  .switch[aria-checked='true'] i { transform: translateX(20px); background: var(--blue); }
  details { border-top: 1px solid var(--line); }
  summary { display: flex; align-items: center; min-height: 48px; cursor: pointer; font-weight: 600; list-style: none; }
  summary::-webkit-details-marker { display: none; }
  summary small { margin-left: auto; color: var(--muted); font-weight: 400; font-size: 13px; }
  summary::after { content: ''; width: 8px; height: 8px; margin: 0 4px 0 12px; border-right: 2px solid var(--muted); border-bottom: 2px solid var(--muted); transform: rotate(45deg) translateY(-2px); transition: transform 200ms var(--ease-out); }
  details[open] summary::after { transform: rotate(225deg) translateY(-2px); }
  .ex { padding: 8px 0 12px; display: grid; gap: 8px; }
  .ex-name { font-size: 14.5px; }
  .ex-ctl { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .ex-ctl select { font-size: 13.5px; padding: 0 8px; }
  .add { display: flex; align-items: center; min-height: 48px; font-size: 14px; color: var(--blue); }
  .about { text-align: center; margin: 22px 0 0; font-size: 12px; color: var(--muted); }
  @media (prefers-reduced-motion: reduce) {
    .switch, .switch i, summary::after { transition: none; }
  }
</style>
