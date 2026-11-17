import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { feedbackMessage, sendFeedback, FEEDBACK_MAX } from '../src/lib/feedback';

afterEach(() => vi.unstubAllGlobals());

describe('feedback', () => {
  it('builds a message with the version and trims the note', () => {
    expect(feedbackMessage('  Add a timer  ', '1.2.3')).toBe('Gym app feedback (v1.2.3):\n\nAdd a timer');
    expect(feedbackMessage('x'.repeat(FEEDBACK_MAX + 50), '1').length).toBeLessThanOrEqual(FEEDBACK_MAX + 40);
  });

  describe('sending', () => {
    beforeEach(() => vi.stubGlobal('navigator', {}));

    it('uses the share sheet when there is one', async () => {
      const share = vi.fn().mockResolvedValue(undefined);
      vi.stubGlobal('navigator', { share });
      expect(await sendFeedback('hi', '1')).toBe('shared');
      expect(share).toHaveBeenCalledWith({ text: 'Gym app feedback (v1):\n\nhi' });
    });

    it('closing the share sheet is not an error and keeps the note', async () => {
      vi.stubGlobal('navigator', { share: vi.fn().mockRejectedValue(new DOMException('x', 'AbortError')) });
      expect(await sendFeedback('hi', '1')).toBe('cancelled');
    });

    it('falls back to the clipboard, then reports failure', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      vi.stubGlobal('navigator', { clipboard: { writeText } });
      expect(await sendFeedback('hi', '1')).toBe('copied');
      expect(writeText).toHaveBeenCalled();
      vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('no')) } });
      expect(await sendFeedback('hi', '1')).toBe('failed');
    });
  });
});
