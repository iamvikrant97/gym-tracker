<script lang="ts">
  import Sheet from './Sheet.svelte';
  import { loadSettings, updateSettings } from '../lib/db';
  import { myPlaylists, myUserId, recentlyPlayed, searchPlaylists } from '../lib/spotify/api';
  import type { Playlist, Reason, RecentItem, Res } from '../lib/spotify/api';
  import { spotify } from '../lib/spotify/player.svelte';

  let { open, onclose, legDay = false }: { open: boolean; onclose: () => void; legDay?: boolean } = $props();

  /** One row in any section. */
  interface Row { uri: string; name: string; meta: string; art?: string }

  let suggested = $state.raw<Row[]>([]);
  let mine = $state.raw<Row[]>([]);
  let recent = $state.raw<Row[]>([]);
  let liked = $state<string | null>(null);
  let pinned = $state.raw<string[]>([]);
  let loading = $state(false);
  let problem = $state<Reason | null>(null);
  let notice = $state('');

  // Pins are saved as "uri|name" so they can be shown without searching again.
  const pinKey = (r: Row) => `${r.uri}|${r.name}`;
  const pinUri = (k: string) => k.slice(0, k.indexOf('|'));
  const pinRow = (k: string): Row => ({ uri: pinUri(k), name: k.slice(k.indexOf('|') + 1), meta: 'Pinned' });
  const isPinned = (uri: string) => pinned.some((k) => pinUri(k) === uri);

  const fromPlaylist = (p: Playlist, meta?: string): Row => ({
    uri: p.uri,
    name: p.name,
    meta: meta ?? [p.count !== undefined ? `${p.count} songs` : '', p.owner ?? ''].filter(Boolean).join(' · '),
    art: p.art,
  });
  const fromRecent = (r: RecentItem): Row => ({ uri: r.uri, name: r.title, meta: r.artist, art: r.art });

  // "For your workout": pinned first, then search results (de-duplicated), up to 10 shown.
  const workoutRows = $derived.by(() => {
    const seen = new Set<string>();
    const out: Row[] = [];
    for (const r of [...pinned.map(pinRow), ...suggested]) {
      if (seen.has(r.uri)) continue;
      seen.add(r.uri);
      out.push(isPinned(r.uri) ? { ...r, meta: r.meta === 'Pinned' ? 'Pinned' : `Pinned · ${r.meta}` } : r);
    }
    return out.slice(0, Math.max(10, pinned.length));
  });

  function note<T>(r: Res<T>): r is { ok: true; data: T } {
    if (!r.ok && !problem) problem = r.reason;
    return r.ok;
  }

  let loadedAt = 0;
  async function load() {
    loading = true;
    problem = null;
    notice = '';
    pinned = (await loadSettings()).pinnedPlaylists;
    const queries = ['gym', 'workout', ...(legDay ? ['leg day'] : [])];
    const [found, pls, rec, me] = await Promise.all([
      Promise.all(queries.map((q) => searchPlaylists(q))),
      myPlaylists(20),
      recentlyPlayed(10),
      myUserId(),
    ]);
    const merged: Playlist[] = [];
    const seen = new Set<string>();
    // Interleave so each query is represented when the list is capped at 10.
    const lists = found.map((f) => (note(f) ? f.data : []));
    for (let i = 0; i < 10; i++)
      for (const l of lists) {
        const p = l[i];
        if (p && !seen.has(p.uri)) {
          seen.add(p.uri);
          merged.push(p);
        }
      }
    suggested = merged.map((p) => fromPlaylist(p));
    mine = note(pls) ? pls.data.map((p) => fromPlaylist(p)) : [];
    recent = note(rec) ? rec.data.map(fromRecent) : [];
    liked = note(me) && me.data ? `spotify:user:${me.data}:collection` : null;
    loadedAt = Date.now();
    loading = false;
  }

  // Load when the sheet opens (re-use results for 2 minutes if reopened).
  $effect(() => {
    if (open && Date.now() - loadedAt > 120_000) void load();
    else if (open) void loadSettings().then((s) => (pinned = s.pinnedPlaylists));
  });

  async function pick(r: Row) {
    notice = '';
    const ok = await spotify.playContext(r.uri, r.name);
    if (ok) onclose();
    else if (spotify.needsDevice) problem = 'needsDevice';
    else if (spotify.needsAuth) problem = 'needsAuth';
    else if (spotify.premiumRequired) problem = 'premium';
    else notice = "Couldn't start that. Try again.";
  }

  async function togglePin(r: Row) {
    const cur = pinned;
    const next = isPinned(r.uri) ? cur.filter((k) => pinUri(k) !== r.uri) : [...cur, pinKey(r)];
    pinned = next;
    pinned = (await updateSettings({ pinnedPlaylists: next })).pinnedPlaylists;
  }
</script>

{#snippet item(r: Row, pinnable: boolean)}
  <div class="row" class:on={spotify.contextUri === r.uri}>
    <button type="button" class="pl press" onclick={() => pick(r)}>
      <span class="art" aria-hidden="true">
        {#if r.art}<img src={r.art} alt="" loading="lazy" />{:else}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>
        {/if}
      </span>
      <span class="txt"><b>{r.name}</b>{#if r.meta}<small>{r.meta}</small>{/if}</span>
      <span class="eq" aria-hidden="true"><i></i><i></i><i></i></span>
    </button>
    {#if pinnable}
      <button type="button" class="pin" aria-pressed={isPinned(r.uri)} aria-label={isPinned(r.uri) ? `Unpin ${r.name}` : `Pin ${r.name}`} onclick={() => togglePin(r)}>
        <svg viewBox="0 0 24 24" fill={isPinned(r.uri) ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" /></svg>
      </button>
    {/if}
  </div>
{/snippet}

<Sheet {open} {onclose} title="Music" sub="Plays through Spotify on your phone">
  <div class="scroll">
    {#if problem === 'needsAuth'}
      <p class="msg">Spotify needs you to log in again.</p>
      <button type="button" class="act press" onclick={() => spotify.connect()}>Reconnect</button>
    {:else if problem === 'needsDevice'}
      <p class="msg">No active Spotify device. Open Spotify, start any song, then pick a playlist.</p>
      <a class="act press" href="spotify:">Open Spotify</a>
    {:else if problem === 'premium'}
      <p class="msg">Spotify says playback control needs Premium.</p>
    {:else if problem === 'network'}
      <p class="msg">Can't reach Spotify. Check your connection.</p>
      <button type="button" class="act press" onclick={load}>Try again</button>
    {:else if problem}
      <p class="msg">Spotify didn't answer as expected. Some lists may be missing.</p>
    {/if}
    {#if notice}<p class="msg" role="status">{notice}</p>{/if}

    <div class="sec">For your workout</div>
    {#each workoutRows as r (r.uri)}{@render item(r, true)}{/each}
    {#if !workoutRows.length}<p class="empty">{loading ? 'Loading…' : 'No suggestions found.'}</p>{/if}

    <div class="sec">Your playlists</div>
    {#each mine as r (r.uri)}{@render item(r, false)}{/each}
    {#if !mine.length}<p class="empty">{loading ? 'Loading…' : 'No playlists found.'}</p>{/if}

    {#if liked}
      <div class="sec">Liked songs</div>
      {@render item({ uri: liked, name: 'Liked songs', meta: 'Your library' }, false)}
    {/if}

    <div class="sec">Recently played</div>
    {#each recent as r (r.uri)}{@render item(r, false)}{/each}
    {#if !recent.length}<p class="empty">{loading ? 'Loading…' : 'Nothing played recently.'}</p>{/if}
  </div>
</Sheet>

<style>
  .scroll { max-height: 56vh; overflow: auto; margin: 0 -4px; padding: 0 4px; touch-action: pan-y; }
  .sec { font: 600 12px/1 var(--body); color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; margin: 16px 0 6px; }
  .row { display: flex; align-items: center; border-radius: 12px; }
  .row.on { background: var(--raised); }
  .pl { flex: 1; min-width: 0; display: flex; align-items: center; gap: 12px; padding: 10px 4px; border-radius: 12px; text-align: left; min-height: 48px; }
  .art {
    width: 48px; height: 48px; border-radius: 8px; flex: none; overflow: hidden; display: grid; place-items: center;
    background: linear-gradient(135deg, #2a3140, #1a1e26); color: var(--muted);
  }
  .art img { width: 100%; height: 100%; object-fit: cover; }
  .art svg { width: 20px; height: 20px; }
  .txt { min-width: 0; flex: 1; }
  .txt b { display: block; font-weight: 500; font-size: 15px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .txt small { display: block; font-size: 12px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .eq { display: none; gap: 2px; align-items: flex-end; height: 14px; margin-right: 6px; }
  .row.on .eq { display: flex; }
  .eq i { width: 3px; background: var(--green); border-radius: 1px; height: 6px; }
  .eq i:nth-child(2) { height: 12px; }
  .eq i:nth-child(3) { height: 9px; }
  .pin { width: 48px; height: 48px; display: grid; place-items: center; color: var(--muted); border-radius: 12px; flex: none; }
  .pin[aria-pressed='true'] { color: var(--blue); }
  .pin svg { width: 20px; height: 20px; }
  .msg { margin: 8px 0; font-size: 13.5px; color: var(--muted); }
  .empty { margin: 6px 4px; font-size: 13px; color: var(--muted); }
  .act {
    display: flex; align-items: center; justify-content: center; height: 48px; padding: 0 20px; border-radius: 14px;
    background: var(--green); color: #04130a; font-weight: 600; font-size: 15px; text-decoration: none; margin: 4px 0 8px;
  }
</style>
