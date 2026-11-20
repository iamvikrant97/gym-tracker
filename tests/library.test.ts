import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { EXERCISES } from '../src/lib/seed';
import { guideFor } from '../src/lib/formGuides';
import { guideKeys } from '../src/lib/guideKeys';
import Library from '../src/screens/Library.svelte';
import Settings from '../src/screens/Settings.svelte';
import { closeDb } from '../src/lib/db';
import { workout } from '../src/lib/workout.svelte';

beforeEach(async () => {
  await closeDb();
  indexedDB.deleteDatabase('gym-tracker');
  sessionStorage.clear();
  location.hash = '#/library';
});
afterEach(() => cleanup());

describe('guideKeys', () => {
  it('lists exactly the exercises that have a guide', () => {
    const real = EXERCISES.filter((e) => guideFor(e.id)).map((e) => e.id).sort();
    expect([...guideKeys].sort()).toEqual(real);
  });
});

describe('Library screen', () => {
  it('lists exercises, searches and filters, and clears filters', async () => {
    render(Library);
    const count = () => screen.getByText(/\d+ exercises?/).textContent ?? '';
    const all = count();
    await fireEvent.input(screen.getByLabelText('Search exercises'), { target: { value: 'zzzz' } });
    expect(screen.getByText(/Nothing matches/)).toBeTruthy();
    await fireEvent.click(screen.getAllByRole('button', { name: 'Clear filters' })[0]);
    expect(count()).toContain(all.split(' ')[0]);
    await fireEvent.click(screen.getByRole('button', { name: 'Chest' }));
    expect(Number(count().split(' ')[0])).toBeLessThan(Number(all.split(' ')[0]));
  });
  it('opens a sheet with the guide and the disclaimer, and goes back to Settings', async () => {
    render(Library);
    const first = EXERCISES.find((e) => guideKeys.has(e.id))!;
    await fireEvent.click(screen.getByRole('button', { name: new RegExp(first.name) }));
    expect(await screen.findByText(/general reference/)).toBeTruthy();
    cleanup();
    render(Library);
    await fireEvent.click(screen.getByRole('button', { name: 'Close library' }));
    expect(location.hash).toBe('#/settings');
  });
  it('says so for an exercise without a guide', async () => {
    render(Library);
    const none = EXERCISES.find((e) => e.muscle !== 'Other' && !guideKeys.has(e.id))!;
    await fireEvent.click(screen.getByRole('button', { name: new RegExp(none.name) }));
    await waitFor(() => expect(screen.getByText(/not ready yet/)).toBeTruthy());
  });
  it('goes back to the workout when opened from the swap sheet', async () => {
    sessionStorage.setItem('gym.libFrom', 'workout');
    render(Library);
    await fireEvent.click(screen.getByRole('button', { name: 'Close library' }));
    expect(location.hash).toBe('#/workout');
  });
});

describe('Settings: library row', () => {
  it('opens the library', async () => {
    render(Settings);
    await fireEvent.click(await screen.findByRole('button', { name: 'Open library' }));
    expect(location.hash).toBe('#/library');
    expect(sessionStorage.getItem('gym.libFrom')).toBe('settings');
  });
});

describe('Library opened from a workout', () => {
  async function open(id: string) {
    await workout.startWorkout('CB-A', Date.now());
    const slot = workout.plannedSets()[0].exerciseId;
    sessionStorage.setItem('gym.libFrom', 'workout');
    sessionStorage.setItem('gym.libSlot', slot);
    render(Library);
    const name = EXERCISES.find((e) => e.id === id)!.name;
    await fireEvent.input(screen.getByLabelText('Search exercises'), { target: { value: name } });
    await fireEvent.click(await screen.findByRole('button', { name: new RegExp(name) }));
    return slot;
  }
  it('can swap the exercise you came from for the one you opened', async () => {
    const id = EXERCISES.find((e) => e.id === 'cable-fly' && !workout.plannedSets().some((p) => p.exerciseId === e.id))?.id ?? 'cable-fly';
    const slot = await open(id);
    await fireEvent.click(await screen.findByRole('button', { name: /^Swap .* for this$/ }));
    await waitFor(() => expect(workout.plannedSets().some((p) => p.exerciseId === id)).toBe(true));
    expect(workout.plannedSets().some((p) => p.exerciseId === slot)).toBe(false);
    expect(location.hash).toBe('#/workout');
  });
  it('can add it on top of the workout instead', async () => {
    const slot0 = (await workout.startWorkout('CB-A', Date.now()), workout.plannedSets()[0].exerciseId);
    await open('hammer-curl');
    await fireEvent.click(await screen.findByRole('button', { name: 'Add to this workout' }));
    await waitFor(() => expect(workout.plannedSets().some((p) => p.exerciseId === 'hammer-curl')).toBe(true));
    expect(workout.plannedSets().some((p) => p.exerciseId === slot0)).toBe(true);
  });
  it('shows no buttons when opened from Settings', async () => {
    render(Library);
    await fireEvent.click(screen.getAllByRole('button', { name: /reps/ })[0]);
    await screen.findByText(/general reference/);
    expect(screen.queryByTestId('library-use')).toBeNull();
  });
});
