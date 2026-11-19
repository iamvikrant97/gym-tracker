<script lang="ts">
  import { LABELS, type MuscleId } from '../lib/muscles';
  import { smoothD } from '../lib/smoothPath';

  let { main = [], also = [] }: { main?: MuscleId[]; also?: MuscleId[] } = $props();
  const cls = (id: MuscleId) => (main.includes(id) ? 'm main' : also.includes(id) ? 'm also' : 'm');
  const label = (id: MuscleId) => LABELS[id];
  const BODY = 'M 100 58 L 136 66 L 154 72 L 152 104 L 136 150 L 140 186 L 142 234 L 140 262 L 137 292 L 136 352 L 140 372 L 112 372 L 115 352 L 117 292 L 119 262 L 100 262 Z';
  const ARM = 'M 150 70 L 164 74 L 168 100 L 169 152 L 170 206 L 172 232 L 160 234 L 154 210 L 150 160 L 146 104 Z';
  const FRONT_IDS: MuscleId[] = ['chest', 'front-delts', 'side-delts', 'biceps', 'abs', 'obliques', 'quads', 'adductors'];
  const BACK_IDS: MuscleId[] = ['traps', 'rear-delts', 'lats', 'lower-back', 'triceps', 'glutes', 'hamstrings'];
  const used = (ids: MuscleId[]) => [...main, ...also].some((m) => ids.includes(m));
  // a view with no worked muscle is dimmed; forearms and calves show on both sides
  const frontOn = $derived(used(FRONT_IDS) || !used(BACK_IDS));
  const backOn = $derived(used(BACK_IDS) || !used(FRONT_IDS));
</script>

{#snippet m(id: MuscleId, d: string)}
  <path d={smoothD(d, id === 'abs' ? 0.5 : 0.85)} class={cls(id)} data-muscle={id}><title>{label(id)}</title></path>
{/snippet}

<!-- One half of the front view; the other half is the mirror image. -->
{#snippet front()}
  {@render m('traps', 'M 100 58 L 110 58 L 128 66 L 134 71 L 112 73 L 100 67 Z')}
  {@render m('chest', 'M 100 75 L 112 71 L 134 73 L 140 81 L 138 92 L 130 102 L 116 106 L 108 104 L 100 100 Z')}
  {@render m('front-delts', 'M 135 71 L 146 65 L 156 69 L 160 81 L 158 94 L 150 102 L 144 91 L 139 81 Z')}
  {@render m('side-delts', 'M 156 69 L 164 75 L 166 91 L 160 101 L 158 94 L 160 81 Z')}
  {@render m('abs', 'M 101 109 L 115 109 L 115 121 L 101 121 Z')}
  {@render m('abs', 'M 101 123 L 115 123 L 114.5 135 L 101 135 Z')}
  {@render m('abs', 'M 101 137 L 114 137 L 113.5 149 L 101 149 Z')}
  {@render m('abs', 'M 101 151 L 113 151 L 112.5 163 L 101 163 Z')}
  {@render m('abs', 'M 101 165 L 112 165 L 110 177 L 101 183 Z')}
  {@render m('obliques', 'M 118 108 L 130 104 L 133 116 L 131 146 L 125 164 L 117 172 L 117.5 140 Z')}
  {@render m('biceps', 'M 150 103 L 158 101 L 164 113 L 164 129 L 160 145 L 154 149 L 150 137 L 146 115 Z')}
  {@render m('forearms', 'M 148 153 L 164 151 L 168 161 L 168 187 L 166 205 L 160 208 L 156 191 L 150 169 Z')}
  {@render m('adductors', 'M 100 193 L 112 192 L 116 216 L 114 244 L 108 258 L 103 241 L 100 216 Z')}
  {@render m('quads', 'M 113 191 L 132 189 L 138 205 L 140 233 L 136 259 L 128 271 L 119 269 L 115 241 L 113 215 Z')}
  {@render m('calves', 'M 117 293 L 131 291 L 134 305 L 133 329 L 128 350 L 122 352 L 118 331 L 116 309 Z')}
{/snippet}

{#snippet back()}
  {@render m('traps', 'M 100 56 L 112 58 L 132 68 L 135 75 L 122 93 L 100 123 Z')}
  {@render m('rear-delts', 'M 135 71 L 146 65 L 156 69 L 160 82 L 156 96 L 148 101 L 141 91 L 137 81 Z')}
  {@render m('lats', 'M 100 125 L 122 95 L 136 99 L 140 113 L 136 141 L 126 161 L 118 169 L 100 157 Z')}
  {@render m('lower-back', 'M 100 159 L 116 165 L 118 177 L 100 183 Z')}
  {@render m('triceps', 'M 150 101 L 160 99 L 166 113 L 166 131 L 160 149 L 152 151 L 148 135 L 146 115 Z')}
  {@render m('forearms', 'M 148 154 L 164 152 L 168 162 L 168 188 L 166 206 L 160 209 L 156 192 L 150 170 Z')}
  {@render m('glutes', 'M 101.5 190 L 114 184 L 127 188 L 133 199 L 131 211 L 122 218 L 108 217 L 101.5 211 Z')}
  {@render m('hamstrings', 'M 104 225 L 124 223 L 136 231 L 138 253 L 132 271 L 120 275 L 110 269 L 104 247 Z')}
  {@render m('calves', 'M 114 291 L 128 289 L 136 303 L 134 323 L 128 349 L 120 351 L 114 331 L 110 307 Z')}
{/snippet}

{#snippet body(view: 'front' | 'back')}
  <g class="sil">
    <path d={smoothD("M 93 44 L 107 44 L 110 60 L 90 60 Z", 0.6)} />
    <path d={smoothD(BODY, 0.7)} />
    <path d={smoothD(ARM, 0.7)} />
  </g>
  <g class="sil" transform="translate(200 0) scale(-1 1)">
    <path d={smoothD(BODY, 0.7)} />
    <path d={smoothD(ARM, 0.7)} />
  </g>
  <path class="head" d={smoothD("M 100 5 L 111 8 L 116 19 L 115 31 L 110 41 L 103 47 L 97 47 L 90 41 L 85 31 L 84 19 L 89 8 Z", 0.9)} />
  {#if view === 'front'}
    <g>{@render front()}</g>
    <g transform="translate(200 0) scale(-1 1)">{@render front()}</g>
  {:else}
    <g>{@render back()}</g>
    <g transform="translate(200 0) scale(-1 1)">{@render back()}</g>
  {/if}
{/snippet}

<div class="wrap">
<svg viewBox="0 0 440 392" role="img" aria-label="Muscles worked, front and back" class="map">
  <defs>
    <radialGradient id="mm-main" cx="50%" cy="40%" r="75%"><stop offset="0" stop-color="#ff7a6b" /><stop offset="0.55" stop-color="#ff3b30" /><stop offset="1" stop-color="#b8140d" /></radialGradient>
    <radialGradient id="mm-also" cx="50%" cy="40%" r="75%"><stop offset="0" stop-color="#ffc09a" /><stop offset="1" stop-color="#ff8d58" /></radialGradient>
    <radialGradient id="mm-idle" cx="50%" cy="30%" r="80%"><stop offset="0" stop-color="#3a4256" /><stop offset="1" stop-color="#262c3b" /></radialGradient>
    <radialGradient id="mm-spot" cx="50%" cy="45%" r="60%"><stop offset="0" stop-color="#2a3350" stop-opacity="0.55" /><stop offset="1" stop-color="#2a3350" stop-opacity="0" /></radialGradient>
  </defs>
  <ellipse cx="100" cy="190" rx="110" ry="190" fill="url(#mm-spot)" opacity={frontOn ? 1 : 0.3} />
  <ellipse cx="320" cy="190" rx="110" ry="190" fill="url(#mm-spot)" opacity={backOn ? 1 : 0.3} />
  <g class="view-g" class:dim={!frontOn}>{@render body('front')}</g>
  <g transform="translate(220 0)" class="view-g" class:dim={!backOn}>{@render body('back')}</g>
  <text x="100" y="388" text-anchor="middle" class="view">FRONT</text>
  <text x="320" y="388" text-anchor="middle" class="view">BACK</text>
</svg>
</div>

<style>
  .wrap { background: #0d0e11; border-radius: 14px; overflow: hidden; }
  .map { width: 100%; height: auto; display: block; }
  .view-g { transition: opacity 0.3s; } .view-g.dim { opacity: 0.45; }
  .sil path { fill: #171b25; stroke: #2c3447; stroke-width: 1; }
  .head { fill: #232938; stroke: #3b4560; stroke-width: 1; stroke-linejoin: round; }
  .m { fill: url(#mm-idle); stroke: #4a5470; stroke-opacity: 0.55; stroke-width: 0.7; stroke-linejoin: round; }
  .m.also { fill: url(#mm-also); stroke: #ffd2b8; stroke-opacity: 0.7; animation: mm-also 3.2s ease-in-out infinite; }
  .m.main { transform-box: fill-box; transform-origin: center; fill: url(#mm-main); stroke: #ffb1a8; stroke-opacity: 0.85; stroke-width: 0.9; animation: mm-main 3.2s ease-in-out infinite; }
  @keyframes mm-main { 0%, 100% { transform: scale(1); filter: drop-shadow(0 0 1.5px rgba(255, 59, 48, 0.5)); opacity: 0.82; } 50% { transform: scale(1.035); filter: drop-shadow(0 0 7px rgba(255, 59, 48, 0.95)); opacity: 1; } }
  @keyframes mm-also { 0%, 100% { opacity: 0.7; } 50% { opacity: 0.95; } }
  .view { fill: #8c94a3; font: 700 9px var(--body, system-ui); letter-spacing: 0.1em; }
  @media (prefers-reduced-motion: reduce) { .m.main, .m.also { animation: none; } .m.main { filter: drop-shadow(0 0 4px rgba(255, 59, 48, 0.8)); } }
</style>
