import { describe, expect, it } from 'vitest';
import { EXERCISES } from '../src/lib/seed';
import { SETUP } from '../src/lib/setupGuides';

describe('setup tips', () => {
  it('every library exercise has one, and none point at a missing exercise', () => {
    const ids = new Set(EXERCISES.map((e) => e.id));
    expect(EXERCISES.filter((e) => !SETUP[e.id]).map((e) => e.id)).toEqual([]);
    expect(Object.keys(SETUP).filter((k) => !ids.has(k))).toEqual([]);
  });

  it('stays short enough to read between sets', () => {
    for (const [id, tip] of Object.entries(SETUP)) {
      expect(tip.length, id).toBeLessThanOrEqual(130);
      expect(tip.split(/[.!?]\s/).length, id).toBeLessThanOrEqual(3);
      expect(tip, id).not.toMatch(/\b\d+\s?(cm|mm|ft|feet|foot|inch|inches)\b/i);
    }
  });
});
