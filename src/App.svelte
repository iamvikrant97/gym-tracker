<script lang="ts">
  import type { Component } from 'svelte';
  import { onMount } from 'svelte';
  import { parseRoute } from './lib/route';
  import { workout } from './lib/workout.svelte';
  import Home from './screens/Home.svelte';
  import Progress from './screens/Progress.svelte';
  import Week from './screens/Week.svelte';
  import Workout from './screens/Workout.svelte';
  import Summary from './screens/Summary.svelte';
  import Settings from './screens/Settings.svelte';
  import Setup from './screens/Setup.svelte';
  import { initPlan, type PlanGate } from './lib/planSetup';
  import { lastSyncAt, onImported, onSyncChange, startAutoSync, syncLabel, syncStatus } from './lib/sync';
  import RestDock from './ui/RestDock.svelte';
  import { watchWorkout } from './lib/session.svelte';
  import Nav from './ui/Nav.svelte';
  import SpotifyBar from './ui/SpotifyBar.svelte';
  import Toast from './ui/Toast.svelte';
  import { toasts, clearToast } from './ui/toast.svelte';

  /** Sync indicator shown on Home, refreshed from src/lib/sync.ts after every flush and queue change. */
  let sync = $state(syncLabel('not-set-up', null));
  async function refreshSync() {
    try {
      sync = syncLabel(await syncStatus(), await lastSyncAt());
    } catch {
      /* storage unavailable: keep the last label */
    }
  }

  let route = $state(parseRoute(location.hash));

  // 'loading' until the stored plan is known. An empty install with no plan runs the setup flow instead of Home;
  // an install that already has sets or workouts is Vik's and gets plan 'vik' silently (see initPlan).
  let gate = $state<'loading' | PlanGate>('loading');
  const setupOpen = $derived(gate === 'setup' || (gate === 'ready' && route === 'setup'));
  function finishSetup() {
    gate = 'ready';
    location.hash = '#/';
    route = 'home';
  }

  /**
   * Route registry: route name (the first hash segment) -> screen component.
   * Later tasks add their screen here: import it and add `workout: Workout`, etc.
   * Unregistered routes show a placeholder.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const screens: Record<string, Component<any>> = { home: Home, progress: Progress, week: Week, workout: Workout, summary: Summary, settings: Settings };
  const Screen = $derived(screens[route]);
  const showNav = $derived(gate === 'ready' && ['home', 'workout', 'progress', 'week'].includes(route));

  onMount(() => {
    // Home opens only once the store has the settings too, so a new install never flashes the original greeting.
    initPlan()
      .then(async (g) => {
        if (g === 'ready') await workout.refreshShared().catch(() => undefined);
        gate = g;
      })
      .catch(() => (gate = 'ready'));
    workout.restore().catch(() => undefined);
    // Sync: queue flushes on start, after each set (2 s debounce), when back online / visible / leaving.
    startAutoSync();
    void refreshSync();
    const offSync = onSyncChange(() => void refreshSync());
    // Sets and custom exercises imported from the Sheet: the store's caches must see them.
    const offImport = onImported(() => void workout.refreshShared().catch(() => undefined));
    const vis = () => document.visibilityState === 'visible' && void refreshSync();
    document.addEventListener('visibilitychange', vis);
    return () => {
      offSync();
      offImport();
      document.removeEventListener('visibilitychange', vis);
    };
  });
  // Wake lock while a workout is open, auto-end checked every 60 s and on visibilitychange, storage.persist() once.
  onMount(() => watchWorkout(workout));
</script>

<svelte:window onhashchange={() => (route = parseRoute(location.hash))} />

<main data-route={route}>
  {#if gate === 'loading'}
    <!-- the stored plan is being read -->
  {:else if setupOpen}
    <Setup firstRun={gate === 'setup'} onfinish={finishSetup} oncancel={() => (location.hash = '#/settings')} />
  {:else if Screen}
    <Screen syncStatus={sync.text} syncWarn={sync.warn} />
  {:else}
    <section class="screen">
      <h1 class="page-title">{route.charAt(0).toUpperCase() + route.slice(1)}</h1>
      <p class="muted">{route}</p>
    </section>
  {/if}
</main>

{#if showNav}
  <!-- Dock stack, bottom up: nav, then (later tasks) the Spotify bar and rest timer above it. -->
  <div class="dock">
    <RestDock />
    {#if route === 'home' || route === 'workout'}<SpotifyBar />{/if}
    <Nav {route} workoutActive={workout.active} />
  </div>
{/if}

<Toast message={toasts.message} onhide={clearToast} />

<style>
  .dock { position: fixed; left: 0; right: 0; bottom: 0; z-index: 10; pointer-events: none; }
  /* Bars take taps; sheets, scrims and the rest dock decide for themselves, so a closed one never blocks a tap. */
  .dock > :global(*:not(.scrim):not(.sheet):not(.rest)) { pointer-events: auto; }
</style>
