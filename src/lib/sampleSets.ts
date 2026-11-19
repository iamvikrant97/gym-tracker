// Preview only: 16 weeks of believable training from Vik's split, so the analytics screens have something to draw.
import { EXERCISES, TEMPLATES } from './seed';
import { weekStart } from './stats';
import type { SetLog } from './types';

const DAY_MS = 86_400_000;
const day = (d: string) => Math.floor(Date.parse(`${d}T00:00:00Z`) / DAY_MS);
const iso = (n: number) => new Date(n * DAY_MS).toISOString().slice(0, 10);
const hash = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);

export function sampleSets(today: string, weeks = 16): SetLog[] {
  const out: SetLog[] = [];
  const monday = day(weekStart(today));
  let rotation = 0;
  for (let w = weeks - 1; w >= 0; w--) {
    if (w === 7) continue; // a week away
    const trainDays = w === 3 ? [0, 2, 4] : [0, 1, 2, 3, 4, 5];
    for (const d of trainDays) {
      const date = iso(monday - 7 * w + d);
      if (date > today) continue;
      const tpl = TEMPLATES[rotation++ % TEMPLATES.length];
      const workoutId = `s-${date}-${tpl.id}`;
      let setNo = 0;
      for (const item of tpl.items) {
        const ex = EXERCISES.find((e) => e.id === item.exerciseId);
        if (!ex) continue;
        const base = 20 + (hash(ex.id) % 55);
        const progress = 1 + 0.012 * (weeks - 1 - w) - (w === 6 ? 0.06 : 0); // eases back after the week away
        const kg = Math.max(ex.step, Math.round((base * progress) / ex.step) * ex.step);
        const n = (item.sets ?? 3) + (hash(ex.id + date) % 5 === 0 ? 1 : 0);
        for (let i = 0; i < n; i++) {
          const heavy = ex.kind === 'compound' && (w + i) % 5 === 0;
          const reps = heavy ? 4 + (i % 2) : Math.max(1, (item.repMin ?? ex.repMin) + ((hash(ex.id + date + i) % 4) % (((item.repMax ?? ex.repMax) - (item.repMin ?? ex.repMin)) + 1)));
          if (i === 0 && ex.kind === 'compound') {
            out.push({ id: `${workoutId}-${ex.id}-w`, workoutId, date, sessionId: tpl.id, exerciseId: ex.id, setNo: ++setNo, kg: Math.round(kg * 0.5), reps: 8, warmup: true, feltIt: true, doneAt: 0, updatedAt: 0, deleted: false, synced: true });
          }
          out.push({ id: `${workoutId}-${ex.id}-${i}`, workoutId, date, sessionId: tpl.id, exerciseId: ex.id, setNo: ++setNo, kg: heavy ? kg * 1.1 : kg, reps, warmup: false, feltIt: true, doneAt: 0, updatedAt: 0, deleted: false, synced: true });
        }
      }
    }
  }
  return out;
}
