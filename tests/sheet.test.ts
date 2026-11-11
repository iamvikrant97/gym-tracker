import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, createEvent, fireEvent, render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import Sheet from '../src/ui/Sheet.svelte';
import Toast from '../src/ui/Toast.svelte';
import { dragOffset, releaseVelocity, shouldDismiss } from '../src/ui/sheetDrag';

afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
  document.body.innerHTML = '';
});

describe('sheetDrag maths', () => {
  it('rubber-bands upward drags', () => {
    expect(dragOffset(50)).toBe(50);
    expect(dragOffset(-16)).toBe(-8);
  });
  it('velocity only counts samples from the last 100 ms', () => {
    expect(releaseVelocity([[0, 0], [30, 50]], 60)).toBeCloseTo(0.6);
    expect(releaseVelocity([[0, 0], [30, 50]], 1050)).toBe(0); // finger paused
    expect(releaseVelocity([[0, 0]], 10)).toBe(0);
  });
  it('a flick needs velocity and at least 24 px of travel; or 40% of height', () => {
    expect(shouldDismiss(0.12, 5, 400)).toBe(false);
    expect(shouldDismiss(0.12, 24, 400)).toBe(true);
    expect(shouldDismiss(0.05, 30, 400)).toBe(false);
    expect(shouldDismiss(0.05, 161, 400)).toBe(true);
  });
});

const body = createRawSnippet(() => ({
  render: () => '<div><input aria-label="Name"><button>Inside</button><a href="#x">Link</a></div>',
}));

function pointer(type: string, target: Element, y: number) {
  const e = createEvent[type as 'pointerDown'](target, { clientY: y, pointerId: 1, bubbles: true });
  return fireEvent(target, e);
}

function mountOpen(onclose = vi.fn()) {
  const view = render(Sheet, { props: { open: true, onclose, title: 'Test', children: body } });
  const sheet = screen.getByRole('dialog', { name: 'Test' });
  Object.defineProperty(sheet, 'offsetHeight', { value: 400 });
  return { ...view, sheet, head: sheet.querySelector('.head')!, onclose };
}

function drag(head: Element, ys: [number, number][], upAt?: number) {
  // ys: [y, ms]; clock is mocked through performance.now
  let now = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  now = ys[0][1];
  pointer('pointerDown', head, ys[0][0]);
  for (const [y, t] of ys.slice(1)) {
    now = t;
    pointer('pointerMove', head, y);
  }
  now = upAt ?? ys[ys.length - 1][1];
}

describe('Sheet pointer drag', () => {
  it('a real down/move/up flick from the header dismisses', () => {
    const { head, onclose } = mountOpen();
    drag(head, [[100, 0], [120, 30], [150, 60]]);
    pointer('pointerUp', head, 150);
    expect(onclose).toHaveBeenCalledTimes(1);
  });

  it('a tiny fast nudge does not dismiss (min travel)', () => {
    const { head, onclose } = mountOpen();
    drag(head, [[100, 0], [104, 10]]);
    pointer('pointerUp', head, 104);
    expect(onclose).not.toHaveBeenCalled();
  });

  it('a flick followed by a pause before lift-off does not dismiss', () => {
    const { head, onclose } = mountOpen();
    drag(head, [[100, 0], [120, 30], [135, 60]], 1200);
    pointer('pointerUp', head, 135);
    expect(onclose).not.toHaveBeenCalled();
  });

  it('pointercancel snaps back and never dismisses', () => {
    const { head, sheet, onclose } = mountOpen();
    drag(head, [[100, 0], [150, 20], [300, 40]]);
    pointer('pointerCancel', head, 300);
    expect(onclose).not.toHaveBeenCalled();
    expect(sheet.style.transform).toBe('');
  });

  it('does not start a drag from the body, so tall content scrolls', () => {
    const { sheet, onclose } = mountOpen();
    const input = sheet.querySelector('input')!;
    drag(input, [[100, 0], [150, 20], [300, 40]]);
    pointer('pointerUp', input, 300);
    expect(onclose).not.toHaveBeenCalled();
    expect(getComputedStyle(sheet).touchAction).not.toBe('pan-x');
  });

  it('never captures the pointer for form controls and links', () => {
    const { sheet } = mountOpen();
    const spy = vi.fn();
    (sheet as HTMLElement).setPointerCapture = spy;
    for (const el of [sheet.querySelector('input')!, sheet.querySelector('button')!, sheet.querySelector('a')!]) {
      pointer('pointerDown', el, 100);
    }
    expect(spy).not.toHaveBeenCalled();
  });

  it('captures from the header', () => {
    const { head } = mountOpen();
    const spy = vi.fn();
    (head as HTMLElement).setPointerCapture = spy;
    pointer('pointerDown', head, 100);
    expect(spy).toHaveBeenCalled();
  });
});

describe('Sheet focus and inert', () => {
  it('makes the page behind inert while open and restores it, without blocking the scrim', async () => {
    const page = document.createElement('main');
    const other = document.createElement('div');
    other.setAttribute('inert', ''); // already inert before: must stay inert after
    document.body.append(page, other);
    const { rerender, container } = render(Sheet, { props: { open: false, onclose: () => {}, title: 'T' }, target: document.body.appendChild(document.createElement('div')) });
    await rerender({ open: true, onclose: () => {}, title: 'T' });
    expect(page.hasAttribute('inert')).toBe(true);
    expect(screen.getByRole('dialog').hasAttribute('inert')).toBe(false);
    expect(container.querySelector('.scrim')!.hasAttribute('inert')).toBe(false);
    await rerender({ open: false, onclose: () => {}, title: 'T' });
    expect(page.hasAttribute('inert')).toBe(false);
    expect(other.hasAttribute('inert')).toBe(true);
  });

  it('traps Tab inside the dialog', async () => {
    const { sheet } = mountOpen();
    const items = [...sheet.querySelectorAll<HTMLElement>('input, button, a[href]')];
    items[items.length - 1].focus();
    const tab = createEvent.keyDown(sheet, { key: 'Tab' });
    await fireEvent(sheet, tab);
    expect(tab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(items[0]);
    items[0].focus();
    const back = createEvent.keyDown(sheet, { key: 'Tab', shiftKey: true });
    await fireEvent(sheet, back);
    expect(document.activeElement).toBe(items[items.length - 1]);
  });
});

describe('Toast accessibility', () => {
  it('hidden toast text is out of the accessibility tree; role=status announces when shown', async () => {
    const { container, rerender } = render(Toast, { props: { message: '', duration: 10_000 } });
    expect(screen.getByRole('status').textContent).toBe('');
    expect(container.querySelector('.toast')!.getAttribute('aria-hidden')).toBe('true');
    await rerender({ message: 'New PR', duration: 10_000 });
    await vi.waitFor(() => expect(screen.getByRole('status').textContent).toBe('New PR'));
  });
});
