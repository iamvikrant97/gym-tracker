<script lang="ts">
  import type { Component } from 'svelte';
  import { onMount } from 'svelte';
  import { parseRoute } from './lib/route';
  import { workout } from './lib/workout.svelte';
  import Home from './screens/Home.svelte';
  import Progress from './screens/Progress.svelte';
  import Week from './screens/Week.svelte';
  import Nav from './ui/Nav.svelte';
  import SpotifyBar from './ui/SpotifyBar.svelte';
  import Toast from './ui/Toast.svelte';
  import { toasts, clearToast } from './ui/toast.svelte';

  /** Text for the sync indicator; main.ts wires the real status from src/lib/sync.ts later. */
  let { syncStatus = 'Saved on phone', syncWarn = false }: { syncStatus?: string; syncWarn?: boolean } = $props();

  let route = $state(parseRoute(location.hash));

  /**
   * Route registry: route name (the first hash segment) -> screen component.
   * Later tasks add their screen here: import it and add `workout: Workout`, etc.
   * Unregistered routes show a placeholder.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const screens: Record<string, Component<any>> = { home: Home, progress: Progress, week: Week };
  const Screen = $derived(screens[route]);
  const showNav = $derived(['home', 'workout', 'progress', 'week'].includes(route));

  onMount(() => {
    workout.restore().catch(() => undefined);
  });
</script>

<svelte:window onhashchange={() => (route = parseRoute(location.hash))} />

<main data-route={route}>
  {#if Screen}
    <Screen {syncStatus} {syncWarn} />
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
    {#if route === 'home' || route === 'workout'}<SpotifyBar />{/if}
    <Nav {route} workoutActive={workout.active} />
  </div>
{/if}

<Toast message={toasts.message} onhide={clearToast} />

<style>
  .dock { position: fixed; left: 0; right: 0; bottom: 0; z-index: 10; pointer-events: none; }
  .dock > :global(*) { pointer-events: auto; }
</style>
