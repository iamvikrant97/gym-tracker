import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Runs apps-script/Code.gs against hand-made Apps Script globals, to pin the entry-point contract.
const src = readFileSync('apps-script/Code.gs', 'utf8');

function load(key: string | null, logRows: unknown[][] = []) {
  const props: Record<string, string> = key === null ? {} : { KEY: key };
  const hidden: number[] = [];
  const sheet = (name: string, rows: unknown[][]) => ({
    getName: () => name,
    getLastRow: () => rows.length,
    getRange: (r: number, c: number, nr: number, nc: number) => ({
      getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => rows[r - 1 + i]?.[c - 1 + j] ?? '')),
      setValues: () => undefined,
    }),
    isColumnHiddenByUser: () => false,
    hideColumns: (c: number) => hidden.push(c),
  });
  const logSheet = sheet('Log', logRows);
  const exSheet = sheet('Exercises', []);
  const g = {
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k: string) => props[k] ?? null }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (t: string) => ({ text: t, setMimeType() { return this; } }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => undefined }) },
    SpreadsheetApp: {
      flush: () => undefined,
      getActive: () => ({ getSpreadsheetTimeZone: () => 'UTC', getSheetByName: (n: string) => (n === 'Log' ? logSheet : exSheet) }),
    },
    Utilities: { getUuid: () => 'uuid', formatDate: (d: Date) => d.toISOString().slice(0, 10), parseDate: (s: string) => new Date(s) },
    Logger: { log: () => undefined },
  };
  const names = Object.keys(g);
  const fn = new Function(...names, `${src}\nreturn { doGet, doPost, keyOk_ };`);
  const api = fn(...names.map((n) => (g as Record<string, unknown>)[n])) as {
    doGet: (e?: unknown) => { text: string };
    doPost: (e: unknown) => { text: string };
    keyOk_: (k: unknown) => boolean;
  };
  return { ...api, hidden };
}
const post = (body: unknown) => ({ postData: { contents: JSON.stringify(body) } });
const out = (r: { text: string }) => JSON.parse(r.text);

describe('Code.gs entry points', () => {
  it('doGet no longer accepts a key: always "use POST"', () => {
    const { doGet } = load('secret');
    expect(out(doGet({ parameter: { key: 'secret' } }))).toEqual({ ok: false, error: 'use POST' });
    expect(out(doGet())).toEqual({ ok: false, error: 'use POST' });
  });

  it('doPost action import runs the import and returns the log', () => {
    const rows: unknown[][] = [[], [], [], [], ['2026-11-09', 'Chest+Back A', 'Smith flat press', '', '', 40, 10, '', '', '', ...new Array(17).fill(''), 'id1']];
    const { doPost, hidden } = load('secret', rows);
    const r = out(doPost(post({ key: 'secret', action: 'import' })));
    expect(r.ok).toBe(true);
    expect(r.log).toEqual([expect.objectContaining({ id: 'id1', exercise: 'Smith flat press', kg: 40, reps: 10 })]);
    expect(hidden).toEqual([28]);
  });

  it('doPost import with a wrong or missing key is refused and returns nothing', () => {
    const { doPost } = load('secret');
    expect(out(doPost(post({ key: 'wrong!', action: 'import' })))).toEqual({ ok: false, error: 'bad key' });
    expect(out(doPost(post({ action: 'import' })))).toEqual({ ok: false, error: 'bad key' });
  });

  it('an upsert POST without an action still works', () => {
    const { doPost } = load('secret');
    expect(out(doPost(post({ key: 'secret', upserts: [], deletes: [] })))).toMatchObject({ ok: true, written: 0 });
  });
});

describe('keyOk_', () => {
  it('accepts only the exact key', () => {
    const { keyOk_ } = load('squat-rack-blue');
    expect(keyOk_('squat-rack-blue')).toBe(true);
    expect(keyOk_('squat-rack-bluE')).toBe(false);
    expect(keyOk_('squat-rack-blu')).toBe(false); // length mismatch
    expect(keyOk_('squat-rack-blue!')).toBe(false);
    expect(keyOk_('')).toBe(false);
    expect(keyOk_(undefined)).toBe(false);
    expect(keyOk_(null)).toBe(false);
    expect(keyOk_(12345)).toBe(false);
  });
  it('rejects everything when no KEY property is set', () => {
    const { keyOk_ } = load(null);
    expect(keyOk_('')).toBe(false);
    expect(keyOk_(undefined)).toBe(false);
  });
  it('rejects every near-miss of the same length (one character off at each position), other lengths and non-strings', () => {
    const real = 'squat-rack-blue-4417-mango';
    const { keyOk_ } = load(real);
    for (let i = 0; i < real.length; i++) {
      const off = real.slice(0, i) + (real[i] === 'x' ? 'y' : 'x') + real.slice(i + 1);
      expect(keyOk_(off)).toBe(false);
    }
    expect(keyOk_(real.toUpperCase())).toBe(false);
    expect(keyOk_(real + 'x')).toBe(false);
    expect(keyOk_(real.slice(1))).toBe(false);
    expect(keyOk_(['squat-rack-blue-4417-mango'])).toBe(false);
    expect(keyOk_({ toString: () => real })).toBe(false);
    expect(keyOk_(real)).toBe(true);
  });
});
