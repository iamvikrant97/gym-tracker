<script lang="ts">
  import { onMount } from 'svelte';
  import { spotify } from '../lib/spotify/player.svelte';
  import { workout } from '../lib/workout.svelte';
  import MusicSheet from './MusicSheet.svelte';

  let sheetOpen = $state(false);
  let songEl: HTMLDivElement | undefined = $state();
  let x0: number | null = null;
  const legDay = $derived(workout.current?.sessionId?.startsWith('L-') ?? false);
  const reduce = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  onMount(() => {
    void spotify.init();
    return spotify.start();
  });

  // Settings may have saved a client id (or the user came back from logging in) since the bar last looked.
  function resync() {
    void spotify.sync();
  }

  function slide(dir: 1 | -1) {
    const el = songEl;
    if (!el || reduce()) return;
    el.style.opacity = '0';
    el.style.transform = `translateX(${-dir * 16}px)`;
    setTimeout(() => {
      el.style.transition = 'none';
      el.style.transform = `translateX(${dir * 16}px)`;
      requestAnimationFrame(() => {
        el.style.transition = '';
        el.style.opacity = '';
        el.style.transform = '';
      });
    }, 160);
  }

  function skip(dir: 1 | -1) {
    slide(dir);
    void spotify.skip(dir);
  }

  function down(e: PointerEvent) {
    if ((e.target as HTMLElement).closest('button, a')) return;
    x0 = e.clientX;
  }
  function up(e: PointerEvent) {
    if (x0 === null) return;
    const dx = e.clientX - x0;
    x0 = null;
    if (Math.abs(dx) > 40) skip(dx < 0 ? 1 : -1);
  }

  const sub = $derived(
    spotify.track ? [spotify.track.artist, spotify.contextName].filter(Boolean).join(' · ') : '',
  );
  const live = $derived(spotify.connected && !spotify.needsAuth && !spotify.needsDevice && !spotify.premiumRequired && !!spotify.track);
</script>

<svelte:window onhashchange={resync} />

<div class="spot" onpointerdown={down} onpointerup={up} onpointercancel={() => (x0 = null)} role="group" aria-label="Spotify">
  {#if !spotify.connected && !spotify.hasClientId}
    <a class="link" href="#/settings">Connect Spotify</a>
  {:else if !spotify.connected}
    <button type="button" class="link press" onclick={() => spotify.connect()}>Connect Spotify</button>
  {:else if spotify.needsAuth}
    <span class="msg">Spotify login expired</span>
    <button type="button" class="cta press" onclick={() => spotify.connect()}>Reconnect</button>
  {:else if spotify.premiumRequired}
    <span class="msg">Spotify Premium is needed to control playback</span>
  {:else if spotify.ready && (spotify.needsDevice || !spotify.track)}
    <span class="msg">Spotify isn't playing</span>
    <a class="cta press" href="spotify:">Open Spotify</a>
  {/if}

  {#if live && spotify.track}
    <button class="art" type="button" onclick={() => (sheetOpen = true)} aria-label="Open playlists">
      {#if spotify.track.art}
        <img src={spotify.track.art} alt="" />
      {:else}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>
      {/if}
    </button>
    <div class="song" bind:this={songEl} aria-live="polite">
      <b>{spotify.track.title}</b><span>{sub}</span>
    </div>
    <button class="ib press" type="button" aria-label="Previous track" onclick={() => skip(-1)}>
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 5h2v14H6zM20 5v14L9 12z" /></svg>
    </button>
    <button class="ib play press" type="button" aria-label={spotify.isPlaying ? 'Pause' : 'Play'} onclick={() => spotify.toggle()}>
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        {#if spotify.isPlaying}<path d="M7 5h4v14H7zM13 5h4v14h-4z" />{:else}<path d="M7 4v16l13-8z" />{/if}
      </svg>
    </button>
    <button class="ib press" type="button" aria-label="Next track" onclick={() => skip(1)}>
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M16 5h2v14h-2zM4 5v14l11-7z" /></svg>
    </button>
    <div class="prog" aria-hidden="true"><i style:width="{Math.round(spotify.progress * 100)}%"></i></div>
  {/if}
</div>

<MusicSheet open={sheetOpen} onclose={() => (sheetOpen = false)} {legDay} />

<style>
  .spot {
    width: min(408px, calc(100% - 32px)); margin: 0 auto 8px; min-height: 56px; background: var(--surface);
    border: 1px solid var(--line); border-radius: 14px; display: flex; align-items: center; gap: 10px;
    padding: 0 6px 0 8px; touch-action: pan-y; position: relative; overflow: hidden;
  }
  .art {
    width: 40px; height: 40px; border-radius: 8px; flex: none; display: grid; place-items: center; overflow: hidden;
    background: linear-gradient(135deg, #2a3140, #1a1e26); color: var(--muted);
  }
  .art img { width: 100%; height: 100%; object-fit: cover; }
  .art svg { width: 18px; height: 18px; }
  .song { min-width: 0; flex: 1; transition: transform 260ms var(--ease-out), opacity 200ms; }
  .song b { display: block; font-size: 13.5px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .song span { font-size: 12px; color: var(--muted); display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ib { width: 44px; height: 44px; display: grid; place-items: center; border-radius: 10px; }
  .ib svg { width: 20px; height: 20px; }
  .ib.play svg { width: 22px; height: 22px; }
  .prog { position: absolute; left: 8px; right: 8px; bottom: 0; height: 2px; background: var(--line); }
  .prog i { display: block; height: 100%; background: var(--green); transition: width 600ms linear; }
  .link {
    display: flex; align-items: center; min-height: 56px; flex: 1; font-size: 13.5px; color: var(--muted);
    text-decoration: none; text-align: left;
  }
  .msg { flex: 1; font-size: 13px; color: var(--muted); padding-left: 4px; }
  .cta {
    display: flex; align-items: center; height: 44px; padding: 0 16px; border-radius: 22px; background: var(--green);
    color: #04130a; font-weight: 600; font-size: 14px; text-decoration: none; flex: none;
  }
  @media (prefers-reduced-motion: reduce) {
    .song { transition: opacity 120ms linear; }
    .prog i { transition: none; }
  }
</style>
