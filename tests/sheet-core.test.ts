// @ts-ignore plain JS module shared with Apps Script
import { applyUpserts, applyDeletes, assignIds, fillInherited, readLog, readExercises, LOG_WIDTH, LOG_FIRST } from '../apps-script/core.js';
import { readFileSync } from 'node:fs';

type Row = any[];
const blankLog = (n = 20): Row[] => {
  const rows: Row[] = [];
  for (let i = 0; i < LOG_FIRST + n; i++) rows.push(new Array(LOG_WIDTH).fill(''));
  // formula/helper columns hold values the bridge must never touch
  for (let i = LOG_FIRST; i < rows.length; i++) { rows[i][3] = 'D-formula'; rows[i][4] = 'E-formula'; rows[i][8] = 'I-formula'; rows[i][10] = 'K-formula'; rows[i][25] = 'Z-formula'; }
  return rows;
};
const exRow = (slot: string, name = '', muscle = ''): Row => [slot, name, 'Isolation', muscle, '', 8, 12, ''];
const exercises = (): Row[] => [
  [], [], [], ['Slot', 'Exercise'],
  exRow('Chest fly', 'Pec fly machine', 'Chest'),
  exRow('Chest fly', ''),
  exRow('Chest fly', ''),
  exRow('Biceps', 'Hammer curl', 'Biceps'),
  exRow('Biceps', ''),
  exRow('Other', '', ''),
  exRow('Other', '', ''),
];
const set = (o: Partial<any> = {}) => ({ id: 's1', date: '2026-11-11', day: 'Chest+Back B', exercise: 'Pec fly machine', kg: 40, reps: 12, rir: 2, note: '', slot: 'Chest fly', muscle: 'Chest', ...o });

describe('sheet core', () => {
  it('upsert is idempotent', () => {
    const a = applyUpserts(blankLog(), exercises(), [set()]);
    const b = applyUpserts(a.logRows, a.exercisesRows, [set()]);
    const rows = readLog(b.logRows);
    expect(rows).toHaveLength(1);
    expect(b.logRows[LOG_FIRST]).toEqual(a.logRows[LOG_FIRST]);
    // duplicate inside one batch (retry after timeout) is also one row
    const c = applyUpserts(blankLog(), exercises(), [set(), set()]);
    expect(readLog(c.logRows)).toHaveLength(1);
  });

  it('upsert with existing id updates kg/reps in place', () => {
    const a = applyUpserts(blankLog(), exercises(), [set(), set({ id: 's2', reps: 10 })]);
    const b = applyUpserts(a.logRows, a.exercisesRows, [set({ kg: 42.5, reps: 11 })]);
    const rows = readLog(b.logRows);
    expect(rows.map((r: any) => [r.id, r.kg, r.reps])).toEqual([['s1', 42.5, 11], ['s2', 40, 10]]);
  });

  it('new set goes to first row whose A, C, F, G are empty', () => {
    const log = blankLog();
    log[LOG_FIRST][0] = '2026-11-10'; log[LOG_FIRST][2] = 'Hammer curl'; log[LOG_FIRST][5] = 20; log[LOG_FIRST][6] = 10; // hand-entered
    log[LOG_FIRST + 1][2] = 'Hammer curl'; // exercise picked, no reps yet: not free
    const r = applyUpserts(log, exercises(), [set()]);
    expect(r.logRows[LOG_FIRST + 2][27]).toBe('s1');
    expect(r.logRows[LOG_FIRST + 1][27]).toBe('');
  });

  it('writes full date/day/exercise on the row and never touches formula columns', () => {
    const before = blankLog();
    const r = applyUpserts(before, exercises(), [set({ note: 'easy' })]);
    const row = r.logRows[LOG_FIRST];
    expect([row[0], row[1], row[2], row[5], row[6], row[7], row[9], row[27]]).toEqual(['2026-11-11', 'Chest+Back B', 'Pec fly machine', 40, 12, 2, 'easy', 's1']);
    for (const c of [3, 4, 8, 10, 25]) expect(row[c]).toBe(before[LOG_FIRST][c]);
  });

  it('extends the sheet when no free row remains', () => {
    const log = blankLog(1);
    const r = applyUpserts(log, exercises(), [set(), set({ id: 's2' })]);
    expect(r.logRows).toHaveLength(LOG_FIRST + 2);
    expect(r.logRows[LOG_FIRST + 1][27]).toBe('s2');
  });

  it('delete clears row', () => {
    const a = applyUpserts(blankLog(), exercises(), [set(), set({ id: 's2' })]);
    const b = applyDeletes(a.logRows, ['s1']);
    const row = b[LOG_FIRST];
    for (const c of [0, 1, 2, 5, 6, 7, 9, 27]) expect(row[c]).toBe('');
    expect(row[3]).toBe('D-formula');
    expect(readLog(b).map((r: any) => r.id)).toEqual(['s2']);
    // deleting an id that is gone (retry) is harmless, and the freed row is reused
    expect(applyDeletes(b, ['s1', 'nope'])).toEqual(b);
    expect(applyUpserts(b, a.exercisesRows, [set({ id: 's3' })]).logRows[LOG_FIRST][27]).toBe('s3');
  });

  it('unknown exercise is added to library', () => {
    const r = applyUpserts(blankLog(), exercises(), [set({ id: 'u1', exercise: 'Cable crossover', slot: 'Chest fly' })]);
    expect(r.exercisesRows[5][1]).toBe('Cable crossover'); // first blank row in the Chest fly slot
    expect(r.exercisesRows[6][1]).toBe('');
    // slot full -> falls to first blank Other row
    const full = exercises(); full[8][1] = 'Preacher curl';
    const o = applyUpserts(blankLog(), full, [set({ id: 'u2', exercise: 'Zottman curl', slot: 'Biceps', muscle: 'Biceps' })]);
    expect(o.exercisesRows[9][1]).toBe('Zottman curl');
    expect(o.exercisesRows[9][3]).toBe('Biceps');
    // unknown slot -> Other; known exercise (any case) is not duplicated
    const x = applyUpserts(blankLog(), exercises(), [set({ id: 'u3', exercise: 'Sled push', slot: 'Mystery' }), set({ id: 'u4', exercise: 'pec FLY machine ' })]);
    expect(x.exercisesRows[9][1]).toBe('Sled push');
    expect(x.exercisesRows.filter((r: Row) => /pec fly/i.test(String(r[1])))).toHaveLength(1);
    // same unknown exercise twice adds it once
    const y = applyUpserts(blankLog(), exercises(), [set({ id: 'a', exercise: 'Sled push', slot: 'Other' }), set({ id: 'b', exercise: 'Sled push', slot: 'Other' })]);
    expect(y.exercisesRows.filter((r: Row) => r[1] === 'Sled push')).toHaveLength(1);
  });

  it('readLog inherits blank date/day/exercise from the row above', () => {
    const log = blankLog();
    log[LOG_FIRST].splice(0, 10, '2026-11-09', 'Legs A', 'Leg press', '', '', 100, 10, 2, '', 'warm');
    log[LOG_FIRST + 1].splice(5, 2, 110, 8);
    log[LOG_FIRST + 2][2] = 'Leg curl'; // picked, no reps: no output but carries
    log[LOG_FIRST + 3].splice(5, 2, 50, 12);
    log[LOG_FIRST + 3][27] = 'x9';
    expect(readLog(log)).toEqual([
      { date: '2026-11-09', day: 'Legs A', exercise: 'Leg press', kg: 100, reps: 10, rir: 2, note: 'warm' },
      { date: '2026-11-09', day: 'Legs A', exercise: 'Leg press', kg: 110, reps: 8, note: '' },
      { id: 'x9', date: '2026-11-09', day: 'Legs A', exercise: 'Leg curl', kg: 50, reps: 12, note: '' },
    ]);
  });

  it('readExercises lists named rows', () => {
    expect(readExercises(exercises())).toEqual([
      { slot: 'Chest fly', name: 'Pec fly machine', muscle: 'Chest', repMin: 8, repMax: 12 },
      { slot: 'Biceps', name: 'Hammer curl', muscle: 'Biceps', repMin: 8, repMax: 12 },
    ]);
  });

  it('Code.gs inlines core.js verbatim (minus export)', () => {
    const core = readFileSync('apps-script/core.js', 'utf8').replace(/^export /gm, '').trim();
    const gs = readFileSync('apps-script/Code.gs', 'utf8');
    const m = gs.match(/\/\/ ==== BEGIN CORE[^\n]*\n([\s\S]*?)\n\/\/ ==== END CORE/);
    expect(m).not.toBeNull();
    expect(m![1].trim()).toBe(core);
  });

  it('Code.gs holds no key', () => {
    const gs = readFileSync('apps-script/Code.gs', 'utf8');
    expect(gs).toMatch(/getProperty\('KEY'\)/);
    expect(gs).not.toMatch(/KEY\s*=\s*['"][A-Za-z0-9]{8,}/);
  });
});

describe('bridge review fixes', () => {
  const handRow = (log: Row[], i: number, o: Record<number, any>) => { for (const [c, v] of Object.entries(o)) log[LOG_FIRST + i][Number(c)] = v; };

  it('assignIds gives each id-less data row a unique id, keeps existing ids, is idempotent', () => {
    const log = blankLog();
    handRow(log, 0, { 0: '2026-11-09', 1: 'Chest+Back A', 2: 'Smith flat press', 5: 40, 6: 10 });
    handRow(log, 1, { 5: 40, 6: 9 }); // continuation row
    handRow(log, 2, { 5: 40, 6: 8, 27: 'keep-me' });
    handRow(log, 3, { 0: '2026-11-09', 2: 'No reps yet' }); // not a set
    let n = 0;
    const a = assignIds(log, () => `gen-${++n}`);
    expect(a.assigned).toBe(2);
    expect(a.logRows[LOG_FIRST][27]).toBe('gen-1');
    expect(a.logRows[LOG_FIRST + 1][27]).toBe('gen-2');
    expect(a.logRows[LOG_FIRST + 2][27]).toBe('keep-me');
    expect(a.logRows[LOG_FIRST + 3][27]).toBe('');
    const b = assignIds(a.logRows, () => `gen-${++n}`);
    expect(b.assigned).toBe(0);
    expect(readLog(b.logRows).map((r: any) => r.id)).toEqual(['gen-1', 'gen-2', 'keep-me']);
  });

  it('an edit or delete of an id-assigned row hits the same row (no duplicate)', () => {
    const log = blankLog();
    handRow(log, 0, { 0: '2026-11-09', 1: 'Chest+Back A', 2: 'Pec fly machine', 5: 40, 6: 10 });
    const { logRows } = assignIds(log, () => 'gen-1');
    const up = applyUpserts(logRows, exercises(), [set({ id: 'gen-1', reps: 12 })]);
    expect(readLog(up.logRows)).toHaveLength(1);
    expect(readLog(up.logRows)[0].reps).toBe(12);
    expect(readLog(applyDeletes(up.logRows, ['gen-1']))).toHaveLength(0);
  });

  it('maps app slots missing from the Sheet (Lat isolation -> Back finisher) before falling back to Other', () => {
    const ex = [...exercises(), exRow('Back finisher', 'Straight-arm pulldown', 'Back'), exRow('Back finisher', '')];
    const r = applyUpserts(blankLog(), ex, [set({ exercise: 'Straight-arm cable pulldown', slot: 'Lat isolation', muscle: 'Back' })]);
    const idx = r.exercisesRows.findIndex((x: Row) => x[1] === 'Straight-arm cable pulldown');
    expect(r.exercisesRows[idx][0]).toBe('Back finisher');
  });

  it('reports acked and skipped ids; a missing kg is 0', () => {
    const r = applyUpserts(blankLog(), exercises(), [set({ id: 'ok', kg: undefined }), set({ id: 'bad', reps: '' }), set({ id: 'ok', kg: undefined })]);
    expect(r.acked).toEqual(['ok']);
    expect(r.skipped).toEqual(['bad']);
    expect(r.written).toBe(1);
    expect(r.logRows[LOG_FIRST][5]).toBe(0);
  });

  it('a row with only Day, RIR or Note typed in is not treated as free', () => {
    const log = blankLog();
    handRow(log, 0, { 1: 'Chest+Back A' });
    handRow(log, 1, { 9: 'spacer note' });
    const r = applyUpserts(log, exercises(), [set()]);
    expect(r.logRows[LOG_FIRST + 2][27]).toBe('s1');
    expect(r.logRows[LOG_FIRST][1]).toBe('Chest+Back A');
  });

  it('Code.gs deploy comment names the real access option and the key is not made with Math.random', () => {
    const gs = readFileSync('apps-script/Code.gs', 'utf8');
    expect(gs).toContain('Execute as: Me');
    expect(gs).toContain('Who has access: Anyone');
    expect(gs).not.toContain('Math.random');
  });
});

describe('rows that rely on inheritance (F1)', () => {
  // Real sheet shape: head row carries date/day/exercise, continuation rows leave A-C blank.
  const group = () => {
    const log = blankLog();
    const put = (i: number, o: Record<number, any>) => { for (const [c, v] of Object.entries(o)) log[LOG_FIRST + i][Number(c)] = v; };
    put(0, { 0: '2026-11-09', 1: 'Chest+Back A', 2: 'Smith flat press', 5: 40, 6: 10 });
    put(1, { 5: 40, 6: 9 });
    put(2, { 5: 40, 6: 8 });
    put(3, { 2: 'Pec fly machine', 5: 30, 6: 12 }); // new exercise, inherits date and day
    return log;
  };
  const prep = (log: Row[]) => {
    let n = 0;
    return assignIds(fillInherited(log).logRows, () => `g${++n}`).logRows;
  };

  it('fillInherited writes inherited date/day/exercise into every row that has reps but blank A-C', () => {
    const f = fillInherited(group());
    expect(f.filled).toBe(3); // rows changed: the two continuation rows and the Pec fly row
    for (let i = 0; i < 4; i++) expect(f.logRows[LOG_FIRST + i].slice(0, 3)).toEqual([
      '2026-11-09', 'Chest+Back A', i < 3 ? 'Smith flat press' : 'Pec fly machine']);
    expect(fillInherited(f.logRows).filled).toBe(0); // idempotent
  });

  it('deleting the head row leaves the other rows with their own date, day and exercise', () => {
    const log = prep(group());
    const before = readLog(log);
    const after = readLog(applyDeletes(log, [before[0].id]));
    expect(after).toHaveLength(3);
    expect(after.slice(0, 2).map((r: any) => [r.date, r.day, r.exercise])).toEqual([
      ['2026-11-09', 'Chest+Back A', 'Smith flat press'], ['2026-11-09', 'Chest+Back A', 'Smith flat press']]);
    expect(after[2].exercise).toBe('Pec fly machine');
  });

  it('a later upsert reusing the freed row does not change other rows\' effective exercise', () => {
    const log = prep(group());
    const ids = readLog(log).map((r: any) => r.id);
    const freed = applyDeletes(log, [ids[0]]);
    const up = applyUpserts(freed, exercises(), [set({ id: 'new', exercise: 'Hammer curl', day: 'Shoulders+Arms A', date: '2026-11-11', slot: 'Biceps' })]);
    const rows = readLog(up.logRows);
    const by = Object.fromEntries(rows.map((r: any) => [r.id, r.exercise]));
    expect(by[ids[1]]).toBe('Smith flat press');
    expect(by[ids[2]]).toBe('Smith flat press');
    expect(by[ids[3]]).toBe('Pec fly machine');
    expect(by.new).toBe('Hammer curl');
  });
});
