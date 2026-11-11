<script lang="ts">
  import { parseRoute } from './lib/route';

  let route = $state(parseRoute(location.hash));
</script>

<svelte:window onhashchange={() => (route = parseRoute(location.hash))} />

<main data-route={route}>
  <p class="muted">{route}</p>
</main>
