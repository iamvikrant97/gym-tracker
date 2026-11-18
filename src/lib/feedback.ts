// Feedback goes from the user's phone to whoever shares the app with them, through the phone's own share sheet (WhatsApp,
// Messages, email...). Nothing is stored or sent from the app itself, so there is no server to secure and no contact detail
// in the public code.

export const FEEDBACK_MAX = 1000;

export function feedbackMessage(text: string, version: string): string {
  return `Gym app feedback (v${version}):\n\n${text.trim().slice(0, FEEDBACK_MAX)}`;
}

/** shared: the share sheet took it; copied: no share sheet, text is on the clipboard; cancelled: the user closed the sheet. */
export async function sendFeedback(text: string, version: string): Promise<'shared' | 'copied' | 'cancelled' | 'failed'> {
  const msg = feedbackMessage(text, version);
  try {
    if (typeof navigator.share === 'function') {
      await navigator.share({ text: msg });
      return 'shared';
    }
  } catch (e) {
    if ((e as DOMException)?.name === 'AbortError') return 'cancelled';
  }
  try {
    await navigator.clipboard.writeText(msg);
    return 'copied';
  } catch {
    return 'failed';
  }
}

// ---- in-app feedback: posted straight to a Google Form, so nobody leaves the app ----
// The form accepts anonymous answers from anyone with the link; the three ids below are its public field names.
export const FORM_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSf2RFO1dlViebBt3N2YdbAJuruCVydtCiWrxTbtqF96xyesnw/formResponse';
const F = { text: 'entry.76885707', version: 'entry.1559706373', from: 'entry.345109602' };
const KEY = 'gym.pendingFeedback';

type Pending = { text: string; version: string; from: string };

function body(p: Pending): string {
  return new URLSearchParams({ [F.text]: p.text.trim().slice(0, FEEDBACK_MAX), [F.version]: p.version, [F.from]: p.from }).toString();
}

async function post(p: Pending): Promise<boolean> {
  try {
    // no-cors: Google answers without CORS headers, so the response is opaque; a network failure is the only thing that throws.
    // The app's content security policy must list docs.google.com under connect-src (vite-csp.ts) or this always fails.
    await fetch(FORM_URL, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body(p) });
    return true;
  } catch {
    return false;
  }
}

function readQueue(): Pending[] {
  try {
    const q = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(q) ? q : [];
  } catch {
    return [];
  }
}
const writeQueue = (q: Pending[]) => {
  try {
    if (q.length) localStorage.setItem(KEY, JSON.stringify(q));
    else localStorage.removeItem(KEY);
  } catch {
    /* storage full or blocked: nothing more to do */
  }
};

/** sent: delivered; queued: no connection, it will go out the next time the app is online. */
export async function postFeedback(text: string, version: string, from = ''): Promise<'sent' | 'queued'> {
  const p = { text, version, from };
  if (await post(p)) return 'sent';
  writeQueue([...readQueue(), p].slice(-10));
  return 'queued';
}

/** Sends anything that was saved while offline. Returns how many went out. */
export async function flushFeedback(): Promise<number> {
  const q = readQueue();
  if (!q.length) return 0;
  const left: Pending[] = [];
  let sent = 0;
  for (const p of q) (await post(p)) ? sent++ : left.push(p);
  writeQueue(left);
  return sent;
}
