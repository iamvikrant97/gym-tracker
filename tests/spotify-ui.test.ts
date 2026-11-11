import 'fake-indexeddb/auto';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/svelte';
import { closeDb, put, updateSettings } from '../src/lib/db';
import { spotify } from '../src/lib/spotify/player.svelte';
import SpotifyBar from '../src/ui/SpotifyBar.svelte';

const reply = (status: number, body?: unknown) => new Response(body === undefined ? null : JSON.stringify(body), { status });
const seed = () => put('settings', { key: 'spotifyTokens', value: { access: 'A', refresh: 'R', expiresAt: Date.now() + 3_600_000, clientId: 'cid' } });
const settle = () => new Promise((r) => setTimeout(r, 30));

beforeEach(async () => {
  await closeDb(true);
  vi.stubGlobal('fetch', vi.fn());
});
afterEach(() => {
  cleanup();
  spotify.stop();
  vi.unstubAllGlobals();
});

describe('SpotifyBar', () => {
  it('no client id: quiet "Connect Spotify" linking to Settings', async () => {
    render(SpotifyBar);
    await settle();
    expect(screen.getByRole('link', { name: 'Connect Spotify' }).getAttribute('href')).toBe('#/settings');
  });
  it('no active device: "Open Spotify" link', async () => {
    await updateSettings({ spotifyClientId: 'cid' });
    await seed();
    (fetch as any).mockResolvedValue(reply(204));
    render(SpotifyBar);
    await settle();
    expect(screen.getByRole('link', { name: 'Open Spotify' }).getAttribute('href')).toBe('spotify:');
  });
  it('expired login: "Reconnect"', async () => {
    await updateSettings({ spotifyClientId: 'cid' });
    await seed();
    (fetch as any).mockResolvedValueOnce(reply(401)).mockResolvedValue(reply(400, { error: 'invalid_grant' }));
    render(SpotifyBar);
    await settle();
    expect(screen.getByRole('button', { name: 'Reconnect' })).toBeTruthy();
  });
  it('playing: shows track and artist with prev / pause / next', async () => {
    await updateSettings({ spotifyClientId: 'cid' });
    await seed();
    (fetch as any).mockResolvedValue(reply(200, { is_playing: true, item: { name: 'Song One', duration_ms: 10, artists: [{ name: 'Band' }], album: { images: [] } } }));
    render(SpotifyBar);
    await settle();
    expect(screen.getByText('Song One')).toBeTruthy();
    expect(screen.getByText('Band')).toBeTruthy();
    for (const n of ['Previous track', 'Pause', 'Next track']) expect(screen.getByRole('button', { name: n })).toBeTruthy();
  });
});
