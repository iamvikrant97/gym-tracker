import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/svelte';
import App from '../src/App.svelte';
import { parseRoute } from '../src/lib/route';

describe('parseRoute', () => {
  it('maps hashes to routes', () => {
    expect(parseRoute('')).toBe('home');
    expect(parseRoute('#/')).toBe('home');
    expect(parseRoute('#/progress')).toBe('progress');
    expect(parseRoute('#/week/2')).toBe('week');
  });
});

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
    await new Promise((r) => setTimeout(r, 0));
    expect(container.querySelector('main')?.getAttribute('data-route')).toBe('progress');
  });
});

describe('cleanup between tests', () => {
  it('first mount', () => {
    render(App);
    expect(document.querySelectorAll('main').length).toBe(1);
  });
  it('second test starts with an empty document', () => {
    expect(document.querySelectorAll('main').length).toBe(0);
    render(App);
    expect(document.querySelectorAll('main').length).toBe(1);
  });
});
