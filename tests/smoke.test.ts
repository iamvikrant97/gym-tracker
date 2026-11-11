import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/svelte';
import App from '../src/App.svelte';

describe('App routing', () => {
  beforeEach(() => {
    location.hash = '';
  });

  it('defaults to home with empty hash', () => {
    const { container } = render(App);
    expect(container.querySelector('main')?.getAttribute('data-route')).toBe('home');
  });

  it('follows hashchange to progress', async () => {
    const { container } = render(App);
    location.hash = '#/progress';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    expect(container.querySelector('main')?.getAttribute('data-route')).toBe('progress');
  });
});
