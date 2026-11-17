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
