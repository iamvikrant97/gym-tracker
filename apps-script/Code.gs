// Gym tracker bridge. GENERATED section below is apps-script/core.js with `export` removed
// (tests/sheet-core.test.ts fails if they drift). Edit core.js, then re-paste the block.

// ==== BEGIN CORE (copy of core.js) ====
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

const LOG_FIRST = 4; // index of sheet row 5
const LOG_WIDTH = 28; // A..AB
const COL = { date: 0, day: 1, exercise: 2, kg: 5, reps: 6, rir: 7, note: 9, id: 27 };
/** Columns the bridge may write, as inclusive [start, end] index runs (never D,E,I or K..Z). */
const WRITABLE_RUNS = [[0, 2], [5, 7], [9, 9], [27, 27]];
const EX_FIRST = 4; // index of sheet row 5
const EX_MAX_ROWS = 300; // Exercises!B5:B300 feeds the Log dropdown

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
  return blank(r[COL.date]) && blank(r[COL.exercise]) && blank(r[COL.kg]) && blank(r[COL.reps]);
}

function writeSet(row, s) {
  row[COL.date] = s.date;
  row[COL.day] = s.day ?? '';
  row[COL.exercise] = s.exercise;
  row[COL.kg] = Number(s.kg);
  row[COL.reps] = Number(s.reps);
  row[COL.rir] = blank(s.rir) ? '' : s.rir;
  row[COL.note] = s.note ?? '';
  row[COL.id] = s.id;
}

function ensureExercise(exRows, s) {
  const name = String(s.exercise).trim();
  const key = norm(name);
  for (let i = EX_FIRST; i < exRows.length; i++) if (norm(exRows[i][1]) === key) return;
  const slot = s.slot && exRows.some((r, i) => i >= EX_FIRST && r[0] === s.slot) ? s.slot : 'Other';
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
function applyUpserts(logRows, exercisesRows, sets) {
  const log = padLog(logRows);
  const ex = exercisesRows.map((r) => r.slice());
  let written = 0;
  for (const s of sets || []) {
    if (!s || blank(s.id) || blank(s.exercise) || blank(s.reps) || blank(s.date)) continue;
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
    written++;
  }
  return { logRows: log, exercisesRows: ex, written };
}

/** Clear the bridge-owned cells of every row whose id is in `ids`. */
function applyDeletes(logRows, ids) {
  const want = new Set((ids || []).map(String));
  const log = padLog(logRows);
  for (let i = LOG_FIRST; i < log.length; i++) {
    if (blank(log[i][COL.id]) || !want.has(String(log[i][COL.id]))) continue;
    for (const [a, b] of WRITABLE_RUNS) for (let c = a; c <= b; c++) log[i][c] = '';
  }
  return log;
}

/** Rows with reps, inheriting blank date/day/exercise from the row above (as the sheet's formulas do). */
function readLog(logRows) {
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
function readExercises(exercisesRows) {
  const out = [];
  for (let i = EX_FIRST; i < exercisesRows.length; i++) {
    const r = exercisesRows[i];
    if (blank(r[1])) continue;
    out.push({ slot: String(r[0] ?? ''), name: String(r[1]), muscle: String(r[3] ?? ''), repMin: Number(r[5]) || 8, repMax: Number(r[6]) || 12 });
  }
  return out;
}
// ==== END CORE ====

// ---------------------------------------------------------------------------------------------
// Entry points. Deploy: Extensions > Apps Script in the Sheet, paste this file, run setup() once
// (copy the key from the log into the app's Settings), then Deploy > Web app (execute as me,
// anyone with the link). The key lives only in Script Properties, never in the repo.
// ---------------------------------------------------------------------------------------------
const LOG_SHEET = 'Log';
const EX_SHEET = 'Exercises';
const FORMULA_ROW = 1004; // last preformatted Log row; copied down when the sheet is full

function setup() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('KEY')) { Logger.log('KEY already set (delete it in Project Settings to rotate).'); return; }
  const chars = 'abcdefghijkmnopqrstuvwxyzABCDEFGHIJKLMNPQRSTUVWXYZ23456789';
  let key = '';
  for (let i = 0; i < 24; i++) key += chars.charAt(Math.floor(Math.random() * chars.length));
  props.setProperty('KEY', key);
  Logger.log('KEY: ' + key);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function keyOk_(key) {
  const real = PropertiesService.getScriptProperties().getProperty('KEY');
  return !!real && key === real;
}

function tz_() { return SpreadsheetApp.getActive().getSpreadsheetTimeZone(); }

function readBlock_(sheet, width, minRows) {
  const last = Math.max(sheet.getLastRow(), minRows);
  const vals = sheet.getRange(1, 1, last, width).getValues();
  const tz = tz_();
  // Dates come back as Date objects: normalise column A (Log) to YYYY-MM-DD strings for the core.
  if (sheet.getName() === LOG_SHEET) {
    for (const r of vals) if (r[0] instanceof Date) r[0] = Utilities.formatDate(r[0], tz, 'yyyy-MM-dd');
  }
  return vals;
}

function doGet(e) {
  if (!keyOk_(e && e.parameter && e.parameter.key)) return json_({ ok: false, error: 'bad key' });
  const ss = SpreadsheetApp.getActive();
  const log = readBlock_(ss.getSheetByName(LOG_SHEET), LOG_WIDTH, LOG_FIRST + 1);
  const ex = readBlock_(ss.getSheetByName(EX_SHEET), 8, EX_FIRST + 1);
  return json_({ ok: true, log: readLog(log), exercises: readExercises(ex) });
}

function doPost(e) {
  let body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: 'bad json' }); }
  if (!keyOk_(body && body.key)) return json_({ ok: false, error: 'bad key' });
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(25000)) return json_({ ok: false, error: 'busy' });
  try {
    const ss = SpreadsheetApp.getActive();
    const logSheet = ss.getSheetByName(LOG_SHEET);
    const exSheet = ss.getSheetByName(EX_SHEET);
    const logBefore = readBlock_(logSheet, LOG_WIDTH, LOG_FIRST + 1);
    const exBefore = readBlock_(exSheet, 8, EX_FIRST + 1);

    // Deletes first, so a delete + re-add of the same id in one batch ends up present.
    let log = applyDeletes(logBefore, body.deletes || []);
    const up = applyUpserts(log, exBefore, body.upserts || []);
    log = up.logRows;

    if (log.length > logBefore.length) {
      // No free row left: extend the preformatted rows (formulas, validation, formats) from the last one.
      const need = log.length - logBefore.length;
      const src = logSheet.getRange(FORMULA_ROW, 1, 1, LOG_WIDTH);
      src.copyTo(logSheet.getRange(logBefore.length + 1, 1, need, LOG_WIDTH));
      // copyTo carried over row-1004 input values; clear the bridge-owned cells again.
      for (const [a, b] of WRITABLE_RUNS) logSheet.getRange(logBefore.length + 1, a + 1, need, b - a + 1).clearContent();
    }

    const tz = tz_();
    for (let i = LOG_FIRST; i < log.length; i++) {
      const before = logBefore[i];
      const after = log[i];
      for (const [a, b] of WRITABLE_RUNS) {
        let changed = !before;
        for (let c = a; c <= b && !changed; c++) if (before[c] !== after[c]) changed = true;
        if (!changed) continue;
        const range = logSheet.getRange(i + 1, a + 1, 1, b - a + 1);
        const vals = after.slice(a, b + 1).map((v, k) => (a + k === COL.date && typeof v === 'string' && v ? Utilities.parseDate(v, tz, 'yyyy-MM-dd') : v));
        if (vals.every((v) => v === '')) range.clearContent(); else range.setValues([vals]);
      }
    }

    // Exercises: write only the cells the core may have filled (name B, muscle D), changed rows only.
    for (let i = EX_FIRST; i < up.exercisesRows.length; i++) {
      const before = exBefore[i];
      const after = up.exercisesRows[i];
      if (!before) { exSheet.getRange(i + 1, 1, 1, 8).setValues([after]); continue; }
      if (before[1] !== after[1]) exSheet.getRange(i + 1, 2).setValue(after[1]);
      if (before[3] !== after[3]) exSheet.getRange(i + 1, 4).setValue(after[3]);
    }
    SpreadsheetApp.flush();
    return json_({ ok: true, written: up.written });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  } finally {
    lock.releaseLock();
  }
}
