<script lang="ts">
  import FormFigure from './FormFigure.svelte';
  import { guideFor } from '../lib/formGuides';
  import { MUSCLES } from '../lib/muscles';

  let { exerciseId }: { exerciseId: string } = $props();

  const guide = $derived(guideFor(exerciseId));
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let mode = $state<'play' | 'start' | 'finish'>(reduced ? 'start' : 'play');
  let slow = $state(false);
  let phase = $state<0 | 1 | 2 | 3>(0);
  const STEP = ['Start', 'Go', 'Finish', 'Return'];
</script>

{#if guide}
  <div class="guide">
    <FormFigure anim={guide.anim} look="dark" muscles={MUSCLES[guide.anim]} callouts={guide.callouts} {mode} speed={slow ? 0.5 : 1} onphase={(p) => (phase = p)} />

    <div class="ctrl" role="group" aria-label="Animation controls">
      <button type="button" class="chip press" aria-pressed={mode === 'play'} onclick={() => (mode = 'play')}>▶ Play</button>
      <button type="button" class="chip press" aria-pressed={mode === 'start'} onclick={() => (mode = 'start')}>Start</button>
      <button type="button" class="chip press" aria-pressed={mode === 'finish'} onclick={() => (mode = 'finish')}>Finish</button>
      <button type="button" class="chip slow press" aria-pressed={slow} onclick={() => (slow = !slow)}>0.5× speed</button>
    </div>

    <div class="steps" aria-hidden="true">
      {#each STEP as s, i}<span class="dot" class:on={phase === i}><i></i>{s}</span>{/each}
    </div>
    <p class="caption" aria-live="polite">{guide.phases[phase]}</p>

    <div class="muscles">
      {#each guide.main as m}<span class="m main">{m}</span>{/each}
      {#each guide.also as m}<span class="m also">{m}</span>{/each}
    </div>

    <h3>Do</h3>
    <ul class="list do">
      {#each guide.dos as d}<li><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5l3.2 3.2L13 5" /></svg>{d}</li>{/each}
    </ul>
    <h3>Avoid</h3>
    <ul class="list dont">
      {#each guide.donts as d}<li><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" /></svg>{d}</li>{/each}
    </ul>
    <p class="note">These guides are a general reference. The drawings are simplified, so they may not match your body or your machine exactly. Not medical advice. Stop if anything hurts, and ask a coach if you're unsure.</p>
  </div>
{/if}

<style>
  .guide { display: flex; flex-direction: column; gap: 10px; font-family: var(--body, system-ui); color: var(--text, #e8eaee); }
  .ctrl { display: flex; gap: 8px; flex-wrap: wrap; }
  .chip {
    min-height: 44px; padding: 0 14px; border-radius: 12px; background: var(--raised, #1a1e26); color: var(--muted, #8c94a3);
    font: 600 13.5px var(--body, system-ui); border: 1px solid var(--line, #242934);
  }
  .chip[aria-pressed='true'] { background: var(--blue-deep, #16305c); color: var(--blue-ink, #dce7ff); border-color: var(--blue, #4c8dff); }
  .slow { margin-left: auto; }
  .steps { display: flex; justify-content: space-between; gap: 6px; font-size: 11.5px; color: var(--muted, #8c94a3); }
  .dot { display: flex; align-items: center; gap: 5px; transition: color 0.15s; }
  .dot i { width: 7px; height: 7px; border-radius: 50%; background: var(--line, #242934); transition: background 0.15s, transform 0.15s; }
  .dot.on { color: var(--text, #e8eaee); }
  .dot.on i { background: var(--blue, #4c8dff); transform: scale(1.25); }
  .caption { margin: 0; font: 700 16px/1.3 var(--display, system-ui); min-height: 42px; }
  .muscles { display: flex; flex-wrap: wrap; gap: 6px; }
  .m { font-size: 12.5px; font-weight: 600; padding: 5px 10px; border-radius: 999px; display: inline-flex; align-items: center; gap: 6px; background: var(--raised, #1a1e26); }
  .m::before { content: ''; width: 8px; height: 8px; border-radius: 50%; background: #ff4d4d; }
  .m.also::before { background: #ffb347; }
  h3 { margin: 6px 0 0; font: 700 12px var(--body, system-ui); letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted, #8c94a3); }
  .list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
  .list li { display: grid; grid-template-columns: 18px 1fr; gap: 10px; font-size: 14.5px; line-height: 1.35; }
  .list svg { width: 18px; height: 18px; fill: none; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; margin-top: 1px; }
  .note { margin: 6px 0 0; padding-top: 12px; border-top: 1px solid var(--line, #242934); font-size: 12.5px; line-height: 1.4; color: var(--muted, #8c94a3); }
  .do svg { stroke: var(--green, #1ed760); }
  .dont svg { stroke: #ff6b5e; }
</style>
