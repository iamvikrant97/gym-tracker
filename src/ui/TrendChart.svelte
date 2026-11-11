<script lang="ts">
  /** Hand-drawn SVG line chart: area fill, faint grid, emphasised endpoint, start/end labels. */
  let {
    points,
    startLabel = '8 weeks ago',
    endLabel = 'now',
    label = 'Trend',
  }: { points: number[]; startLabel?: string; endLabel?: string; label?: string } = $props();

  const L = 20, R = 300, TOP = 14, BASE = 140;
  const coords = $derived.by(() => {
    if (points.length === 0) return [] as [number, number][];
    const lo = Math.min(...points), hi = Math.max(...points);
    const span = hi - lo || 1;
    return points.map((v, i): [number, number] => [
      points.length === 1 ? R : L + (i * (R - L)) / (points.length - 1),
      // Keep the line inside the grid with some headroom; flat series sit mid-chart.
      hi === lo ? 80 : BASE - 20 - ((v - lo) / span) * (BASE - 20 - TOP - 10),
    ]);
  });
  const line = $derived(coords.map((p) => p.join(',')).join(' '));
  const area = $derived(coords.length ? `${coords[0][0]},${BASE} ${line} ${coords[coords.length - 1][0]},${BASE}` : '');
  const end = $derived(coords[coords.length - 1]);
</script>

<svg class="chart" viewBox="0 0 320 150" role="img" aria-label={label}>
  <g stroke="#242934">
    {#each [40, 80, 120] as y (y)}<line x1="20" x2="300" y1={y} y2={y} />{/each}
  </g>
  {#if coords.length > 1}<polygon points={area} fill="rgba(76,141,255,.12)" />{/if}
  {#if coords.length > 1}<polyline points={line} fill="none" stroke="#4C8DFF" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" />{/if}
  {#if end}<circle cx={end[0]} cy={end[1]} r="4" fill="#4C8DFF" />{/if}
  <text x="20" y="148" fill="#8C94A3" font-size="10">{startLabel}</text>
  <text x="300" y="148" fill="#8C94A3" font-size="10" text-anchor="end">{endLabel}</text>
</svg>

<style>
  .chart { width: 100%; height: 150px; margin: 6px 0 10px; display: block; }
</style>
