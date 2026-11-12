import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { setActivePlan, setRetiredNames } from '../src/lib/activePlan.svelte';
import { closeDb, DEFAULT_SETTINGS, loadSettings, put, saveSettings } from '../src/lib/db';
import { clearPendingInvite, loadPendingInvite, parseInvite, savePendingInvite, stripInvite } from '../src/lib/invite';
import { parseRoute } from '../src/lib/route';
import { fullBodyPlan } from '../src/lib/seed';
import { workout } from '../src/lib/workout.svelte';
import App from '../src/App.svelte';
import type { Workout as W } from '../src/lib/types';

const MINAL = 'name=Minal&morning=Cutie&afternoon=Minal&evening=CutieChan&night=Cutiechan';
const MINAL_NAMES = { morning: 'Cutie', afternoon: 'Minal', evening: 'CutieChan', night: 'Cutiechan' };

describe('parseInvite', () => {
  it('reads the hash form #/?name=...', () => {
    expect(parseInvite('', `#/?${MINAL}`)).toEqual({ userName: 'Minal', greetNames: MINAL_NAMES });
  });
  it('reads the hash form on any route', () => {
    expect(parseInvite('', `#/progress?${MINAL}`)).toEqual({ userName: 'Minal', greetNames: MINAL_NAMES });
    expect(parseInvite('', `#/setup/x?name=Minal`)).toEqual({ userName: 'Minal' });
  });
  it('reads a normal ?query before the hash', () => {
    expect(parseInvite(`?${MINAL}`, '#/')).toEqual({ userName: 'Minal', greetNames: MINAL_NAMES });
    expect(parseInvite(`?name=Minal`, '')).toEqual({ userName: 'Minal' });
  });
  it('the hash wins over the query for the same name', () => {
    expect(parseInvite('?name=Old&morning=Old', '#/?name=New')).toEqual({ userName: 'New', greetNames: { morning: 'Old' } });
  });
  it('URL-decodes values (%20, +, unicode)', () => {
    expect(parseInvite('', '#/?name=Mina%20l&morning=Cutie+Pie&night=%E2%9C%A8Sleep')).toEqual({
      userName: 'Mina l',
      greetNames: { morning: 'Cutie Pie', night: '✨Sleep' },
    });
  });
  it('keeps markup as literal text', () => {
    const inv = parseInvite('', '#/?name=%3Cb%3EMin%3C%2Fb%3E&morning=%3Cb%3Ex%3C%2Fb%3E');
    expect(inv).toEqual({ userName: '<b>Min</b>', greetNames: { morning: '<b>x</b>' } });
  });
  it('trims and cuts every value to 20 characters', () => {
    const long = 'A'.repeat(30);
    const inv = parseInvite('', `#/?name=%20%20Minal%20%20&morning=${long}&night=${'B'.repeat(19)}%20%20%20%20`);
    expect(inv).toEqual({ userName: 'Minal', greetNames: { morning: 'A'.repeat(20), night: 'B'.repeat(19) } });
  });
  it('ignores empty and blank values, and unknown parameters', () => {
    expect(parseInvite('', '#/?name=&morning=%20%20&evening=Hi&other=zzz')).toEqual({ greetNames: { evening: 'Hi' } });
    expect(parseInvite('', '#/?name=&morning=')).toBeNull();
    expect(parseInvite('?utm=1', '#/')).toBeNull();
    expect(parseInvite('', '')).toBeNull();
  });
  it('survives broken percent-encoding', () => {
    expect(() => parseInvite('', '#/?name=%E0%A4%A&morning=%')).not.toThrow();
  });
});

describe('stripInvite', () => {
  it('removes only the invite parameters, from the hash and from the query', () => {
    expect(stripInvite(`https://x.github.io/gym-tracker/#/?${MINAL}`)).toBe('/gym-tracker/#/');
    expect(stripInvite(`https://x.github.io/gym-tracker/?${MINAL}#/`)).toBe('/gym-tracker/#/');
    expect(stripInvite(`https://x.github.io/gym-tracker/?a=1&name=Minal#/week?b=2&night=N`)).toBe('/gym-tracker/?a=1#/week?b=2');
  });
  it('leaves a clean address alone', () => {
    expect(stripInvite('https://x.github.io/gym-tracker/#/progress')).toBe('/gym-tracker/#/progress');
  });
});

describe('parseRoute with parameters', () => {
  it('ignores a query in the hash', () => {
    expect(parseRoute('#/?name=Minal')).toBe('home');
    expect(parseRoute('#/progress?name=Minal')).toBe('progress');
    expect(parseRoute('#/week/2?name=a/b')).toBe('week');
  });
});

describe('pending invite storage', () => {
  beforeEach(() => localStorage.clear());
  it('round-trips and clears', () => {
    savePendingInvite({ userName: 'Minal', greetNames: { morning: 'Cutie' } });
    expect(loadPendingInvite()).toEqual({ userName: 'Minal', greetNames: { morning: 'Cutie' } });
    clearPendingInvite();
    expect(loadPendingInvite()).toBeNull();
  });
  it('re-sanitizes whatever is stored', () => {
    localStorage.setItem('gym-tracker:invite', JSON.stringify({ userName: `  ${'x'.repeat(40)} `, greetNames: { morning: 5, night: ' N ', bogus: 'y' } }));
    expect(loadPendingInvite()).toEqual({ userName: 'x'.repeat(20), greetNames: { night: 'N' } });
    localStorage.setItem('gym-tracker:invite', 'not json');
    expect(loadPendingInvite()).toBeNull();
  });
});

// ---- App level ----
const click = (el: HTMLElement) => fireEvent.click(el);
const btn = (name: string | RegExp) => screen.getByRole('button', { name });
const nameField = () => screen.getByLabelText(/What should I call you/) as HTMLInputElement;
const openAt = (url: string) => history.replaceState(null, '', url);

beforeEach(async () => {
  await closeDb(true);
  setActivePlan(null);
  setRetiredNames(undefined);
  workout.settings = null;
  workout.current = null;
  workout.sets = [];
  workout.history = [];
  workout.customExercises = [];
  workout.ready = true;
  localStorage.clear();
  openAt('/#/');
});
afterEach(() => {
  cleanup();
  setActivePlan(null);
  setRetiredNames(undefined);
  openAt('/#/');
});

describe('App: invite on a first run', () => {
  it('pre-fills the name, clears the address bar and keeps the names for Start', async () => {
    openAt(`/#/?${MINAL}`);
    render(App);
    expect(await screen.findByRole('heading', { name: 'How many days a week?' })).toBeTruthy();
    expect(nameField().value).toBe('Minal');
    await waitFor(() => expect(location.hash).toBe('#/'));
    expect(location.search).toBe('');
    expect(location.href).not.toMatch(/Minal|Cutie/);
    await click(btn('Continue'));
    await click(btn('Continue'));
    await click(btn('Start'));
    await screen.findByRole('button', { name: 'Start workout' });
    const s = await loadSettings();
    expect(s.userName).toBe('Minal');
    expect(s.greetNames).toEqual(MINAL_NAMES);
    expect(loadPendingInvite()).toBeNull();
  });

  it('works with a normal ?query before the hash', async () => {
    openAt(`/?${MINAL}#/`);
    render(App);
    await screen.findByRole('heading', { name: 'How many days a week?' });
    expect(nameField().value).toBe('Minal');
    await waitFor(() => expect(location.search).toBe(''));
  });

  it('works on another hash route (#/progress?...) and still shows the setup', async () => {
    openAt(`/#/progress?${MINAL}`);
    render(App);
    await screen.findByRole('heading', { name: 'How many days a week?' });
    expect(nameField().value).toBe('Minal');
  });

  it('what she types over the pre-filled name is saved instead; greeting names still come from the link', async () => {
    openAt(`/#/?${MINAL}`);
    render(App);
    await screen.findByRole('heading', { name: 'How many days a week?' });
    await fireEvent.input(nameField(), { target: { value: 'Mini' } });
    await click(btn('Continue'));
    await click(btn('Continue'));
    await click(btn('Start'));
    await screen.findByRole('button', { name: 'Start workout' });
    const s = await loadSettings();
    expect(s.userName).toBe('Mini');
    expect(s.greetNames).toEqual(MINAL_NAMES);
  });

  it('shows markup as plain text and never as elements', async () => {
    openAt('/#/?name=%3Cb%3EMin%3C%2Fb%3E&morning=%3Cb%3Ex%3C%2Fb%3E');
    const { container } = render(App);
    await screen.findByRole('heading', { name: 'How many days a week?' });
    expect(nameField().value).toBe('<b>Min</b>');
    expect(container.querySelector('b')).toBeNull();
    await click(btn('Continue'));
    await click(btn('Continue'));
    await click(btn('Start'));
    await screen.findByRole('button', { name: 'Start workout' });
    expect((await loadSettings()).greetNames).toEqual({ morning: '<b>x</b>' });
    expect(container.querySelector('h1 b')).toBeNull();
  });

  it('an over-length value is cut to 20 characters', async () => {
    openAt(`/#/?name=${'N'.repeat(40)}`);
    render(App);
    await screen.findByRole('heading', { name: 'How many days a week?' });
    expect(nameField().value).toBe('N'.repeat(20));
  });

  it('empty parameters leave the field empty and save no names', async () => {
    openAt('/#/?name=&morning=');
    render(App);
    await screen.findByRole('heading', { name: 'How many days a week?' });
    expect(nameField().value).toBe('');
    await click(btn('Continue'));
    await click(btn('Continue'));
    await click(btn('Start'));
    await screen.findByRole('button', { name: 'Start workout' });
    const s = await loadSettings();
    expect(s.userName).toBeUndefined();
    expect(s.greetNames).toBeUndefined();
  });

  it('survives a reload in the middle of the setup', async () => {
    openAt(`/#/?${MINAL}`);
    const first = render(App);
    await screen.findByRole('heading', { name: 'How many days a week?' });
    await waitFor(() => expect(location.hash).toBe('#/'));
    first.unmount();
    cleanup();
    // the reload: the address no longer has the parameters
    render(App);
    await screen.findByRole('heading', { name: 'How many days a week?' });
    expect(nameField().value).toBe('Minal');
    await click(btn('Continue'));
    await click(btn('Continue'));
    await click(btn('Start'));
    await screen.findByRole('button', { name: 'Start workout' });
    const s = await loadSettings();
    expect(s.userName).toBe('Minal');
    expect(s.greetNames).toEqual(MINAL_NAMES);
  });

  it('a later plain visit after Start does not bring the names back', async () => {
    openAt(`/#/?${MINAL}`);
    render(App);
    await screen.findByRole('heading', { name: 'How many days a week?' });
    await click(btn('Continue'));
    await click(btn('Continue'));
    await click(btn('Start'));
    await screen.findByRole('button', { name: 'Start workout' });
    expect(localStorage.getItem('gym-tracker:invite')).toBeNull();
  });
});

describe('App: invite on an existing install', () => {
  it('is ignored completely when a plan is saved, and never overwrites settings', async () => {
    await saveSettings({ ...DEFAULT_SETTINGS, plan: fullBodyPlan([1, 3, 5]), userName: 'Vik', greetNames: { night: 'Boss' } });
    openAt(`/#/?${MINAL}`);
    render(App);
    expect(await screen.findByRole('button', { name: 'Start workout' })).toBeTruthy();
    await waitFor(() => expect(location.hash).toBe('#/'));
    const s = await loadSettings();
    expect(s.userName).toBe('Vik');
    expect(s.greetNames).toEqual({ night: 'Boss' });
    expect(localStorage.getItem('gym-tracker:invite')).toBeNull();
  });

  it('is ignored when there is data but no plan yet (Vik install migration)', async () => {
    const w: W = { id: 'w1', date: '2026-11-09', sessionId: 'CB-A', startedAt: 1, endedAt: 2, swaps: {} };
    await put('workouts', w);
    openAt(`/#/?${MINAL}`);
    render(App);
    expect(await screen.findByRole('button', { name: 'Start workout' })).toBeTruthy();
    const s = await loadSettings();
    expect(s.userName).toBe('Vik');
    expect(s.greetNames).toBeUndefined();
    expect(localStorage.getItem('gym-tracker:invite')).toBeNull();
  });

  it('a leftover pending invite is dropped once the install turns out to have a plan', async () => {
    savePendingInvite({ userName: 'Minal' });
    await saveSettings({ ...DEFAULT_SETTINGS, plan: fullBodyPlan([1, 3, 5]), userName: 'Vik' });
    render(App);
    await screen.findByRole('button', { name: 'Start workout' });
    expect(localStorage.getItem('gym-tracker:invite')).toBeNull();
    expect((await loadSettings()).userName).toBe('Vik');
  });
});
