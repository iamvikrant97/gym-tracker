<script lang="ts">
  // Equipment for the pattern-based form guides, drawn behind the figure. The classes are styled here and, per look, from the figure.
  import { FLOOR, type Skeleton } from '../lib/rig';
  let { anim, sk, variant = '' }: { anim: string; sk: Skeleton; variant?: string } = $props();
  void sk; void variant;
</script>

<g class="gx">
  {#if anim === 'incline'}
    <rect class="gear dark" x="106" y="121" width="44" height="8" rx="4" />
    <rect class="gear dark" x="124" y="128" width="7" height={FLOOR - 128} />
    <line x1="128" y1="121" x2="73" y2="74" class="gear-pad" />
    <line x1="100" y1="100" x2="94" y2={FLOOR} class="gear-leg" />
  {:else if anim === 'machinePress' || anim === 'pecFly'}
    <rect class="gear dark" x="86" y="125" width="46" height="8" rx="4" />
    <rect class="gear dark" x="106" y="132" width="8" height={FLOOR - 132} />
    <line x1="100" y1="124" x2="95" y2="60" class="gear-pad" />
    <rect class="gear dark" x="62" y="34" width="8" height={FLOOR - 34} rx="2" />
    <rect class="gear dark" x="50" y="146" width="40" height="10" rx="3" />
  {:else if anim === 'cableFly'}
    <rect class="gear dark" x="14" y="6" width="9" height={FLOOR - 6} rx="2" />
    <rect class="gear dark" x="4" y="148" width="30" height="8" rx="2" />
    <circle cx="19" cy="14" r="5" class="gear" />
    <line x1="19" y1="16" x2={sk.hand.x} y2={sk.hand.y} class="cable" />
  {:else if anim === 'row'}
    <rect class="gear dark" x="88" y="129" width="44" height="8" rx="4" />
    <rect class="gear dark" x="106" y="136" width="8" height={FLOOR - 136} />
    <rect class="gear dark" x="172" y="136" width="7" height={FLOOR - 136} />
    <rect class="gear dark" x="214" y="70" width="10" height={FLOOR - 70} rx="2" />
    <circle cx="214" cy="128" r="5" class="gear" />
    <line x1="212" y1="128" x2={sk.hand.x} y2={sk.hand.y} class="cable" />
  {:else if anim === 'straightArm' || anim === 'facePull'}
    <rect class="gear dark" x="208" y="2" width="10" height={FLOOR - 2} rx="2" />
    <rect class="gear dark" x="198" y="148" width="30" height="8" rx="2" />
    <circle cx={anim === 'facePull' ? 212 : 213} cy={anim === 'facePull' ? 34 : 10} r="5" class="gear" />
    <line x1="211" y1={anim === 'facePull' ? 36 : 12} x2={sk.hand.x} y2={sk.hand.y} class="cable" />
  {:else if anim === 'backExt'}
    <line x1="106" y1="109" x2="141" y2="78" class="gear-pad" />
    <line x1="112" y1="108" x2="106" y2={FLOOR} class="gear-leg" />
    <line x1="134" y1="86" x2="146" y2={FLOOR} class="gear-leg" />
    <rect class="gear dark" x="52" y="138" width="7" height={FLOOR - 138} />
    <line x1="50" y1="144" x2="72" y2="130" class="gear-pad" />
  {:else if anim === 'cableLateral'}
    <rect class="gear dark" x="150" y="106" width="9" height={FLOOR - 106} rx="2" />
    <circle cx="154" cy="146" r="5" class="gear" />
    <line x1="152" y1="146" x2={sk.hand.x} y2={sk.hand.y} class="cable" />
  {:else if anim === 'rearFly'}
    <rect class="gear dark" x="96" y="127" width="44" height="8" rx="4" />
    <rect class="gear dark" x="114" y="134" width="8" height={FLOOR - 134} />
    <line x1="136" y1="62" x2="136" y2="100" class="gear-pad" />
    <line x1="138" y1="100" x2="146" y2={FLOOR} class="gear-leg" />
  {:else if anim === 'rearFlyBent'}
    <rect class="gear dark" x="196" y="100" width="9" height={FLOOR - 100} rx="2" />
    <circle cx="200" cy="110" r="5" class="gear" />
    <line x1="198" y1="112" x2={sk.hand.x} y2={sk.hand.y} class="cable" />
  {:else if anim === 'shoulderMachine' || anim === 'smithShoulder'}
    <rect class="gear dark" x="90" y="125" width="44" height="8" rx="4" />
    <rect class="gear dark" x="108" y="132" width="8" height={FLOOR - 132} />
    <line x1="104" y1="124" x2="99" y2="52" class="gear-pad" />
    <rect class="gear dark" x="62" y="20" width="8" height={FLOOR - 20} rx="2" />
    {#if anim === 'smithShoulder'}<rect class="gear dark" x="150" y="0" width="6" height={FLOOR} rx="2" />{/if}
  {:else if anim === 'legPress' || anim === 'legPressHigh' || anim === 'legPressCalf'}
    <line x1="100" y1="132" x2="196" y2="58" class="gear-leg" />
    <line x1="97" y1="124" x2="48" y2="84" class="gear-pad" />
    <line x1={sk.ankle.x + 6} y1={sk.ankle.y + 4} x2={sk.ankle.x + 6 + 0.616 * 30} y2={sk.ankle.y + 4 + 0.788 * 30} class="gear-pad" style:stroke-width="5" />
    <line x1={sk.ankle.x + 6} y1={sk.ankle.y + 4} x2={sk.ankle.x + 6 - 0.616 * 30} y2={sk.ankle.y + 4 - 0.788 * 30} class="gear-pad" style:stroke-width="5" />
    <rect class="gear dark" x="90" y="136" width="8" height={FLOOR - 136} />
    <rect class="gear dark" x="178" y="100" width="8" height={FLOOR - 100} />
  {:else if anim === 'legExt'}
    <rect class="gear dark" x="78" y="119" width="44" height="8" rx="4" />
    <rect class="gear dark" x="96" y="126" width="8" height={FLOOR - 126} />
    <line x1="92" y1="118" x2="87" y2="62" class="gear-pad" />
    <rect class="gear dark" x="128" y="130" width="8" height={FLOOR - 130} />
    <line x1={sk.ankle.x - 6} y1={sk.ankle.y - 2} x2={sk.ankle.x + 2} y2={sk.ankle.y - 2} class="gear-pad" style:stroke-width="6" />
  {:else if anim === 'smithSquat'}
    <rect class="gear dark" x="118" y="0" width="6" height={FLOOR} rx="2" />
    <rect class="gear dark" x="100" y="148" width="42" height="8" rx="3" />
  {:else if anim === 'seatedCurl'}
    <rect class="gear dark" x="74" y="123" width="44" height="8" rx="4" />
    <rect class="gear dark" x="92" y="130" width="8" height={FLOOR - 130} />
    <line x1="88" y1="122" x2="83" y2="62" class="gear-pad" />
    <line x1="108" y1="106" x2="140" y2="106" class="gear-pad" style:stroke-width="7" />
    <rect class="gear dark" x="148" y="134" width="8" height={FLOOR - 134} />
    <line x1={sk.ankle.x - 3} y1={sk.ankle.y + 6} x2={sk.ankle.x + 3} y2={sk.ankle.y + 6} class="gear-pad" style:stroke-width="6" />
  {:else if anim === 'lyingCurl'}
    <line x1="62" y1="124" x2="162" y2="124" class="gear-pad" />
    <rect class="gear dark" x="86" y="130" width="8" height={FLOOR - 130} />
    <rect class="gear dark" x="136" y="130" width="8" height={FLOOR - 130} />
    <line x1={sk.ankle.x - 4} y1={sk.ankle.y + 8} x2={sk.ankle.x + 4} y2={sk.ankle.y + 8} class="gear-pad" style:stroke-width="6" />
    <rect class="gear dark" x="8" y="96" width="9" height={FLOOR - 96} rx="2" />
  {:else if anim === 'hipThrust' || anim === 'smithHipThrust' || anim === 'singleHipThrust'}
    <rect class="gear dark" x="40" y="119" width="46" height="10" rx="4" />
    <rect class="gear dark" x="48" y="128" width="8" height={FLOOR - 128} />
    <rect class="gear dark" x="70" y="128" width="8" height={FLOOR - 128} />
    {#if anim === 'smithHipThrust'}<rect class="gear dark" x="112" y="30" width="6" height={FLOOR - 30} rx="2" />{/if}
  {:else if anim === 'kickback' || anim === 'kickbackMachine'}
    <rect class="gear dark" x="160" y="30" width="9" height={FLOOR - 30} rx="2" />
    <rect class="gear dark" x="150" y="148" width="34" height="8" rx="2" />
    <line x1="166" y1="34" x2={sk.hand.x} y2={sk.hand.y} class="gear-line" />
    {#if anim === 'kickback'}
      <rect class="gear dark" x="14" y="110" width="9" height={FLOOR - 110} rx="2" />
      <circle cx="19" cy="140" r="5" class="gear" />
      <line x1="21" y1="140" x2={sk.ankle.x} y2={sk.ankle.y} class="cable" />
      <circle cx={sk.ankle.x} cy={sk.ankle.y} r="3.5" class="gear" />
    {:else}
      <line x1="96" y1="104" x2={sk.ankle.x} y2={sk.ankle.y} class="gear-pad" style:stroke-width="5" />
      <circle cx="96" cy="104" r="5" class="gear" />
    {/if}
  {:else if anim === 'abductionMachine'}
    <rect class="gear dark" x="86" y="125" width="46" height="8" rx="4" />
    <rect class="gear dark" x="106" y="132" width="8" height={FLOOR - 132} />
    <line x1="100" y1="124" x2="95" y2="62" class="gear-pad" />
    <rect class="gear dark" x="140" y="110" width="9" height={FLOOR - 110} rx="2" />
  {:else if anim === 'cableAbduction'}
    <rect class="gear dark" x="160" y="40" width="9" height={FLOOR - 40} rx="2" />
    <rect class="gear dark" x="150" y="148" width="34" height="8" rx="2" />
    <rect class="gear dark" x="14" y="110" width="9" height={FLOOR - 110} rx="2" />
    <circle cx="19" cy="146" r="5" class="gear" />
    <line x1="21" y1="146" x2={sk.ankle.x} y2={sk.ankle.y - 4} class="cable" />
  {:else if anim === 'stepUp'}
    <rect class="gear dark" x="130" y="118" width="48" height="38" rx="3" />
  {:else if anim === 'pullThrough'}
    <rect class="gear dark" x="8" y="110" width="9" height={FLOOR - 110} rx="2" />
    <circle cx="13" cy="146" r="5" class="gear" />
    <line x1="15" y1="146" x2={sk.hand.x} y2={sk.hand.y} class="cable" />
  {:else if anim === 'calfRaise'}
    <rect class="gear dark" x="132" y="150" width="26" height="6" rx="2" />
    <rect class="gear dark" x="74" y="16" width="8" height={FLOOR - 16} rx="2" />
    <line x1="80" y1={sk.shoulder.y - 8} x2={sk.shoulder.x - 2} y2={sk.shoulder.y - 8} class="gear-line" />
    <line x1={sk.shoulder.x - 8} y1={sk.shoulder.y - 8} x2={sk.shoulder.x + 6} y2={sk.shoulder.y - 8} class="gear-pad" style:stroke-width="7" />
  {:else if anim === 'cableCrunch'}
    <rect class="gear dark" x="96" y="2" width="70" height="7" rx="3" />
    <rect class="gear dark" x="160" y="2" width="9" height={FLOOR - 2} rx="2" />
    <circle cx="114" cy="12" r="5" class="gear" />
    <line x1="114" y1="14" x2={sk.hand.x} y2={sk.hand.y} class="cable" />
    <rect class="gear dark" x="60" y="152" width="70" height="4" rx="2" />
  {:else if anim === 'hangKnee'}
    <rect class="gear dark" x="96" y="-34" width="52" height="6" rx="3" />
    <rect class="gear dark" x="92" y="-34" width="7" height={FLOOR + 34} rx="2" />
    <rect class="gear dark" x="146" y="-34" width="7" height={FLOOR + 34} rx="2" />
  {:else if anim === 'deadBug'}
    <rect class="gear dark" x="14" y="150" width="212" height="6" rx="3" />
  {:else if anim === 'cableCurl' || anim === 'ropeCurl'}
    <rect class="gear dark" x="196" y="110" width="9" height={FLOOR - 110} rx="2" />
    <circle cx="200" cy="146" r="5" class="gear" />
    <line x1="198" y1="146" x2={sk.hand.x} y2={sk.hand.y} class="cable" />
  {:else if anim === 'ropePushdown' || anim === 'singleRopeExt'}
    <rect class="gear dark" x="176" y="4" width="8" height={FLOOR - 4} rx="2" />
    <rect class="gear dark" x="146" y="4" width="38" height="7" rx="3" />
    <circle cx="150" cy="9" r="5" class="gear" />
    <line x1="150" y1="12" x2={sk.hand.x} y2={sk.hand.y} class="cable" />
  {/if}
</g>

<style>
  :global(.fig .gx .gear) { fill: #3a4256; }
  :global(.fig .gx .gear.dark) { fill: #2c3345; }
  :global(.fig.dark .gx .gear), :global(.fig.dark .gx .gear.dark) { fill: #1c212c; }
  :global(.fig.outline .gx .gear), :global(.fig.outline .gx .gear.dark) { fill: none; stroke: #5b6a86; stroke-width: 1.4; }
  :global(.fig .gx .gear-line) { stroke: #4a546c; stroke-width: 2; }
  :global(.fig .gx .gear-leg) { stroke: #2a3040; stroke-width: 6; stroke-linecap: round; }
  :global(.fig .gx .gear-pad) { stroke: #3a4256; stroke-width: 9; stroke-linecap: round; }
  :global(.fig.dark .gx .gear-pad) { stroke: #1c212c; }
  :global(.fig.outline .gx .gear-pad) { stroke: #5b6a86; stroke-width: 3; }
  :global(.fig .gx .cable) { stroke: #6a7490; stroke-width: 1.3; }
</style>
