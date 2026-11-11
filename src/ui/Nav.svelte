<script lang="ts">
  /** `route` is the parsed route name; the workout screen counts as the Today tab. */
  let { route, workoutActive = false }: { route: string; workoutActive?: boolean } = $props();

  const tabs = [
    { id: 'home', label: 'Today', icon: 'M6.5 6.5v11M17.5 6.5v11M3 9.5v5M21 9.5v5M6.5 12h11' },
    { id: 'progress', label: 'Progress', icon: 'M3 17l6-6 4 4 8-8M15 7h6v6' },
    { id: 'week', label: 'Week', icon: 'M3 10h18M8 3v4M16 3v4' },
  ];
  const current = $derived(route === 'workout' ? 'home' : route);

  function go(id: string) {
    location.hash = id === 'home' ? (workoutActive ? '#/workout' : '#/') : `#/${id}`;
  }
</script>

<nav aria-label="Main">
  {#each tabs as t (t.id)}
    <button type="button" class="press" aria-current={current === t.id ? 'page' : undefined} onclick={() => go(t.id)}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d={t.icon} />
        {#if t.id === 'week'}<rect x="3" y="5" width="18" height="16" rx="2" />{/if}
      </svg>
      {t.label}
    </button>
  {/each}
</nav>

<style>
  nav {
    display: flex; justify-content: space-around; padding: 6px 0 10px;
    background: rgba(11, 13, 17, 0.92); border-top: 1px solid var(--line);
    backdrop-filter: blur(18px); -webkit-backdrop-filter: blur(18px);
  }
  button {
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px;
    min-width: 72px; min-height: 48px; border-radius: 10px; font-size: 11.5px; color: var(--muted);
  }
  svg { width: 22px; height: 22px; }
  button[aria-current='page'] { color: var(--text); }
  button[aria-current='page'] svg { color: var(--blue); }
</style>
