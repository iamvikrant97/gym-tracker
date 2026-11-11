// Pure sheet logic for the Apps Script bridge. Operates on 2-D arrays that mirror the sheet
// (index 0 = sheet row 1). Code.gs inlines this file (minus `export`) at deploy; a test keeps them in sync.
//
// Log tab: A date, B day, C exercise, D/E/I formulas, F kg, G reps, H RIR, J note, K..Z helper formulas,
// AB set id. Data starts at sheet row 5 (index 4). Only A,B,C,F,G,H,J,AB are ever written.
// Exercises tab: A slot, B name, C pattern, D muscle, E equipment, F repMin, G repMax. Data from row 5.

/**
 * @typedef {{ id: string, date: string, day: string, exercise: string, kg: number, reps: number,
 *   rir?: number | string | null, note?: string, slot?: string, muscle?: string }} SetRow
 */

export const LOG_FIRST = 4; // index of sheet row 5
export const LOG_WIDTH = 28; // A..AB
export const COL = { date: 0, day: 1, exercise: 2, kg: 5, reps: 6, rir: 7, note: 9, id: 27 };
/** Columns the bridge may write, as inclusive [start, end] index runs (never D,E,I or K..Z). */
export const WRITABLE_RUNS = [[0, 2], [5, 7], [9, 9], [27, 27]];
export const EX_FIRST = 4; // index of sheet row 5
export const EX_MAX_ROWS = 300; // Exercises!B5:B300 feeds the Log dropdown

const blank = (v) => v === '' || v === null || v === undefined;
const norm = (s) => String(s ?? '').trim().toLowerCase();

function emptyLogRow() {
  return new Array(LOG_WIDTH).fill('');
}

function padLog(rows) {
  return rows.map((r) => {
    const c = r.slice();
    while (c.length < LOG_WIDTH) c.push('');
    return c;
  });
}

function isFreeLogRow(r) {
  // Every bridge-owned input cell must be empty, so a hand-typed spacer (Day, RIR or Note only) is kept.
  return [COL.date, COL.day, COL.exercise, COL.kg, COL.reps, COL.rir, COL.note, COL.id].every((c) => blank(r[c]));
}

/** App slots that do not exist in the Sheet's Exercises tab, mapped to the closest Sheet slot. */
export const SLOT_ALIASES = { 'Lat isolation': 'Back finisher' };

function writeSet(row, s) {
  row[COL.date] = s.date;
  row[COL.day] = s.day ?? '';
  row[COL.exercise] = s.exercise;
  row[COL.kg] = blank(s.kg) || !Number.isFinite(Number(s.kg)) ? 0 : Number(s.kg);
  row[COL.reps] = Number(s.reps);
  row[COL.rir] = blank(s.rir) ? '' : s.rir;
  row[COL.note] = s.note ?? '';
  row[COL.id] = s.id;
}

function ensureExercise(exRows, s) {
  const name = String(s.exercise).trim();
  const key = norm(name);
  for (let i = EX_FIRST; i < exRows.length; i++) if (norm(exRows[i][1]) === key) return;
  const wanted = SLOT_ALIASES[s.slot] && !exRows.some((r, i) => i >= EX_FIRST && r[0] === s.slot) ? SLOT_ALIASES[s.slot] : s.slot;
  const slot = wanted && exRows.some((r, i) => i >= EX_FIRST && r[0] === wanted) ? wanted : 'Other';
  let target = -1;
  for (let i = EX_FIRST; i < exRows.length; i++) {
    if (exRows[i][0] === slot && blank(exRows[i][1])) { target = i; break; }
  }
  if (target === -1 && slot !== 'Other') {
    for (let i = EX_FIRST; i < exRows.length; i++) {
      if (exRows[i][0] === 'Other' && blank(exRows[i][1])) { target = i; break; }
    }
  }
  if (target === -1) {
    if (exRows.length >= EX_MAX_ROWS) return; // library full: set is still logged
    exRows.push([slot === 'Other' || !slot ? 'Other' : slot, '', '', '', '', 8, 12, '']);
    target = exRows.length - 1;
  }
  const row = exRows[target];
  row[1] = name;
  if (blank(row[3]) && s.muscle) row[3] = s.muscle;
}

/**
 * Insert or update sets by id. Same id twice -> one row. New sets take the first free Log row.
 * @param {any[][]} logRows
 * @param {any[][]} exercisesRows
 * @param {SetRow[]} sets
 */
export function applyUpserts(logRows, exercisesRows, sets) {
  const log = padLog(logRows);
  const ex = exercisesRows.map((r) => r.slice());
  const acked = [];
  const skipped = [];
  for (const s of sets || []) {
    if (!s || blank(s.id) || blank(s.exercise) || blank(s.reps) || blank(s.date)) {
      if (s && !blank(s.id)) skipped.push(String(s.id));
      continue;
    }
    let idx = -1;
    for (let i = LOG_FIRST; i < log.length; i++) if (String(log[i][COL.id]) === String(s.id)) { idx = i; break; }
    if (idx === -1) {
      for (let i = LOG_FIRST; i < log.length; i++) if (isFreeLogRow(log[i])) { idx = i; break; }
    }
    if (idx === -1) {
      log.push(emptyLogRow());
      idx = log.length - 1;
    }
    writeSet(log[idx], s);
    ensureExercise(ex, s);
    if (!acked.includes(String(s.id))) acked.push(String(s.id));
  }
  return { logRows: log, exercisesRows: ex, written: acked.length, acked, skipped };
}

/**
 * Gives every data row that has reps but no set id a generated one (rows typed by hand have none), so the app can
 * later edit or delete them in place. Returns the new rows and how many ids were assigned. Idempotent.
 * @param {any[][]} logRows
 * @param {() => string} genId
 */
export function assignIds(logRows, genId) {
  const log = padLog(logRows);
  let assigned = 0;
  for (let i = LOG_FIRST; i < log.length; i++) {
    if (blank(log[i][COL.reps]) || !blank(log[i][COL.id])) continue;
    log[i][COL.id] = genId();
    assigned++;
  }
  return { logRows: log, assigned };
}

/** Clear the bridge-owned cells of every row whose id is in `ids`. */
export function applyDeletes(logRows, ids) {
  const want = new Set((ids || []).map(String));
  const log = padLog(logRows);
  for (let i = LOG_FIRST; i < log.length; i++) {
    if (blank(log[i][COL.id]) || !want.has(String(log[i][COL.id]))) continue;
    for (const [a, b] of WRITABLE_RUNS) for (let c = a; c <= b; c++) log[i][c] = '';
  }
  return log;
}

/** Rows with reps, inheriting blank date/day/exercise from the row above (as the sheet's formulas do). */
export function readLog(logRows) {
  const out = [];
  let date = '', day = '', exercise = '';
  for (let i = LOG_FIRST; i < logRows.length; i++) {
    const r = logRows[i];
    if (!blank(r[COL.date])) date = r[COL.date];
    if (!blank(r[COL.day])) day = r[COL.day];
    if (!blank(r[COL.exercise])) exercise = r[COL.exercise];
    if (blank(r[COL.reps])) continue;
    const item = { date, day, exercise, kg: Number(r[COL.kg]) || 0, reps: Number(r[COL.reps]), note: blank(r[COL.note]) ? '' : String(r[COL.note]) };
    if (!blank(r[COL.rir])) item.rir = Number(r[COL.rir]);
    if (!blank(r[COL.id])) item.id = String(r[COL.id]);
    out.push(item);
  }
  return out;
}

/** Exercise library rows that have a name. */
export function readExercises(exercisesRows) {
  const out = [];
  for (let i = EX_FIRST; i < exercisesRows.length; i++) {
    const r = exercisesRows[i];
    if (blank(r[1])) continue;
    out.push({ slot: String(r[0] ?? ''), name: String(r[1]), muscle: String(r[3] ?? ''), repMin: Number(r[5]) || 8, repMax: Number(r[6]) || 12 });
  }
  return out;
}
