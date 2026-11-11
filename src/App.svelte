<script lang="ts">
  export function parseRoute(hash: string): string {
    if (hash === '' || hash === '#' || hash === '#/') return 'home';
    return hash.replace(/^#\//, '').split('/')[0] || 'home';
  }

  let route = $state(parseRoute(location.hash));
</script>

<svelte:window onhashchange={() => (route = parseRoute(location.hash))} />

<main data-route={route}>
  <p class="muted">{route}</p>
</main>
