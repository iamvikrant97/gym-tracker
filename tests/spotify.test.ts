import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { closeDb, put, updateSettings, loadSettings } from '../src/lib/db';
import { SCOPES, accessToken, base64url, beginLogin, challengeFor, handleRedirect, loadTokens, makeVerifier } from '../src/lib/spotify/auth';
import * as api from '../src/lib/spotify/api';
import { SpotifyPlayer } from '../src/lib/spotify/player.svelte';

// jsdom has no crypto.subtle; Node's webcrypto is the same API the browser provides.
if (!globalThis.crypto?.subtle) Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });

const seed = (t: Partial<{ access: string; refresh: string; expiresAt: number; clientId: string }> = {}) =>
  put('settings', { key: 'spotifyTokens', value: { access: 'A1', refresh: 'R1', expiresAt: Date.now() + 3_600_000, clientId: 'cid', ...t } });

const reply = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const tokenOk = (access = 'A2', refresh: string | null = 'R2') => reply(200, { access_token: access, refresh_token: refresh ?? undefined, expires_in: 3600, token_type: 'Bearer' });

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(async () => {
  await closeDb(true);
  sessionStorage.clear();
  localStorage.clear();
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const urls = () => fetchMock.mock.calls.map((c) => String(c[0]));

describe('PKCE', () => {
  it('challenge is base64url SHA-256 of the verifier (RFC 7636 test vector)', async () => {
    expect(await challengeFor('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });
  it('verifier is 43-128 chars of the allowed alphabet and differs per call', () => {
    const a = makeVerifier();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43,128}$/);
    expect(makeVerifier()).not.toBe(a);
    expect(base64url(new Uint8Array([251, 255, 254]))).toBe('-__-');
  });
  it('beginLogin sends S256 challenge, exact scopes, redirect and state; keeps verifier for the callback', async () => {
    const nav = vi.fn();
    await beginLogin('cid', 'https://u.github.io/gym-tracker/', nav);
    const url = new URL(nav.mock.calls[0]![0]);
    expect(url.origin + url.pathname).toBe('https://accounts.spotify.com/authorize');
    const p = url.searchParams;
    expect(p.get('response_type')).toBe('code');
    expect(p.get('client_id')).toBe('cid');
    expect(p.get('redirect_uri')).toBe('https://u.github.io/gym-tracker/');
    expect(p.get('scope')).toBe(SCOPES);
    expect(p.get('code_challenge_method')).toBe('S256');
    const pending = JSON.parse(sessionStorage.getItem('spotify-pending')!);
    expect(p.get('state')).toBe(pending.state);
    expect(p.get('code_challenge')).toBe(await challengeFor(pending.verifier));
  });
  it('scopes are exactly the six required', () => {
    expect(SCOPES).toBe('user-read-playback-state user-modify-playback-state user-read-currently-playing playlist-read-private user-library-read user-read-recently-played');
  });
});

describe('callback', () => {
  it('exchanges the code, stores tokens, and cleans the URL (hash kept)', async () => {
    await beginLogin('cid', 'https://u.github.io/gym-tracker/', vi.fn());
    const { state, verifier } = JSON.parse(sessionStorage.getItem('spotify-pending')!);
    fetchMock.mockResolvedValueOnce(tokenOk('AT', 'RT'));
    history.replaceState(null, '', `/gym-tracker/?code=abc&state=${state}#/settings`);
    expect(await handleRedirect(location.href)).toBe(true);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://accounts.spotify.com/api/token');
    const body = new URLSearchParams(init.body as URLSearchParams);
    expect(body.get('grant_type')).toBe('authorization_code');
    expect(body.get('code')).toBe('abc');
    expect(body.get('code_verifier')).toBe(verifier);
    expect(body.get('client_id')).toBe('cid');
    expect(body.get('redirect_uri')).toBe('https://u.github.io/gym-tracker/');
    expect(location.search).toBe('');
    expect(location.hash).toBe('#/settings');
    const t = await loadTokens();
    expect(t).toMatchObject({ access: 'AT', refresh: 'RT', clientId: 'cid' });
    expect(t!.expiresAt).toBeGreaterThan(Date.now() + 3_500_000);
    expect(sessionStorage.getItem('spotify-pending')).toBeNull();
  });
  it('rejects a wrong state but still cleans the URL', async () => {
    await beginLogin('cid', 'https://u.github.io/gym-tracker/', vi.fn());
    history.replaceState(null, '', '/gym-tracker/?code=abc&state=WRONG');
    expect(await handleRedirect(location.href)).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(location.search).toBe('');
    expect(await loadTokens()).toBeNull();
  });
  it('user denied (?error=access_denied) cleans the URL and returns false', async () => {
    history.replaceState(null, '', '/gym-tracker/?error=access_denied&state=x');
    expect(await handleRedirect(location.href)).toBe(false);
    expect(location.search).toBe('');
  });
  it('a URL without a code is left alone', async () => {
    history.replaceState(null, '', '/gym-tracker/?foo=1');
    expect(await handleRedirect(location.href)).toBe(false);
    expect(location.search).toBe('?foo=1');
  });
});

describe('accessToken', () => {
  it('returns null when never connected', async () => {
    expect(await accessToken()).toBeNull();
  });
  it('returns the stored token while more than 60 s remain', async () => {
    await seed({ expiresAt: Date.now() + 120_000 });
    expect(await accessToken()).toBe('A1');
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('refreshes when expiry is under 60 s, keeping the old refresh token if none is returned', async () => {
    await seed({ expiresAt: Date.now() + 30_000 });
    fetchMock.mockResolvedValueOnce(tokenOk('A2', null));
    expect(await accessToken()).toBe('A2');
    const body = new URLSearchParams(fetchMock.mock.calls[0]![1].body as URLSearchParams);
    expect(body.get('grant_type')).toBe('refresh_token');
    expect(body.get('refresh_token')).toBe('R1');
    expect(body.get('client_id')).toBe('cid');
    expect((await loadTokens())!.refresh).toBe('R1');
  });
  it('concurrent callers share one refresh', async () => {
    await seed({ expiresAt: 0 });
    fetchMock.mockResolvedValue(tokenOk());
    await Promise.all([accessToken(), accessToken(), accessToken()]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('a rejected refresh token clears the login (Reconnect)', async () => {
    await seed({ expiresAt: 0 });
    fetchMock.mockResolvedValueOnce(reply(400, { error: 'invalid_grant' }));
    expect(await accessToken()).toBeNull();
    expect(await loadTokens()).toBeNull();
  });
  it('offline during refresh keeps the login', async () => {
    await seed({ expiresAt: 0 });
    fetchMock.mockRejectedValueOnce(new TypeError('offline'));
    await accessToken();
    expect(await loadTokens()).not.toBeNull();
  });
});

describe('api', () => {
  it('refreshes once on 401 then retries with the new token', async () => {
    await seed();
    fetchMock
      .mockResolvedValueOnce(reply(401, { error: { status: 401, message: 'The access token expired' } }))
      .mockResolvedValueOnce(tokenOk('A2'))
      .mockResolvedValueOnce(reply(204));
    const r = await api.pause();
    expect(r.ok).toBe(true);
    expect(urls()).toEqual(['https://api.spotify.com/v1/me/player/pause', 'https://accounts.spotify.com/api/token', 'https://api.spotify.com/v1/me/player/pause']);
    expect(fetchMock.mock.calls[2]![1].headers.Authorization).toBe('Bearer A2');
  });
  it('two 401s give needsAuth, not a loop', async () => {
    await seed();
    fetchMock
      .mockResolvedValueOnce(reply(401))
      .mockResolvedValueOnce(tokenOk('A2'))
      .mockResolvedValueOnce(reply(401));
    const r = await api.next();
    expect(r).toMatchObject({ ok: false, reason: 'needsAuth', needsAuth: true });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
  it('no device → needsDevice', async () => {
    await seed();
    fetchMock.mockResolvedValueOnce(reply(404, { error: { status: 404, message: 'Player command failed: No active device found', reason: 'NO_ACTIVE_DEVICE' } }));
    expect(await api.play('spotify:playlist:p1')).toMatchObject({ ok: false, reason: 'needsDevice', needsDevice: true });
  });
  it('not connected → needsAuth without any request', async () => {
    expect(await api.nowPlaying()).toMatchObject({ ok: false, reason: 'needsAuth' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('403 on playback means Premium is required', async () => {
    await seed();
    fetchMock.mockResolvedValueOnce(reply(403, { error: { status: 403, reason: 'PREMIUM_REQUIRED' } }));
    expect(await api.pause()).toMatchObject({ ok: false, reason: 'premium' });
  });
  it('network failure is reported as network', async () => {
    await seed();
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    expect(await api.next()).toMatchObject({ ok: false, reason: 'network' });
  });
  it("searchPlaylists('gym') calls /v1/search?q=gym&type=playlist&limit=10 and drops null entries", async () => {
    await seed();
    fetchMock.mockResolvedValueOnce(
      reply(200, {
        playlists: {
          items: [
            null,
            { id: 'p1', uri: 'spotify:playlist:p1', name: 'Gym Hits', owner: { display_name: 'Spotify User' }, images: [{ url: 'big', width: 640 }, { url: 'small', width: 60 }] },
            { id: 'p2', uri: 'spotify:playlist:p2', name: 'Lift', tracks: { total: 40 }, images: null },
          ],
        },
      }),
    );
    const r = await api.searchPlaylists('gym');
    expect(urls()[0]).toBe('https://api.spotify.com/v1/search?q=gym&type=playlist&limit=10');
    expect(r.ok && r.data).toEqual([
      { id: 'p1', uri: 'spotify:playlist:p1', name: 'Gym Hits', owner: 'Spotify User', count: undefined, art: 'small' },
      { id: 'p2', uri: 'spotify:playlist:p2', name: 'Lift', owner: undefined, count: 40, art: undefined },
    ]);
  });
  it('myPlaylists and recentlyPlayed use the right paths; recent is de-duplicated by context', async () => {
    await seed();
    fetchMock.mockResolvedValueOnce(reply(200, { items: [{ id: 'a', uri: 'spotify:playlist:a', name: 'Mine', items: { total: 12 } }] }));
    const mine = await api.myPlaylists();
    expect(urls()[0]).toBe('https://api.spotify.com/v1/me/playlists?limit=20');
    expect(mine.ok && mine.data[0]!.count).toBe(12);
    const t = (n: string, uri = `spotify:track:${n}`) => ({ uri, name: n, artists: [{ name: 'Ar' }], album: { images: [] } });
    fetchMock.mockResolvedValueOnce(
      reply(200, {
        items: [
          { track: t('1'), context: { uri: 'spotify:playlist:a' }, played_at: 'x' },
          { track: t('2'), context: { uri: 'spotify:playlist:a' }, played_at: 'y' },
          { track: t('3'), context: null, played_at: 'z' },
        ],
      }),
    );
    const rec = await api.recentlyPlayed();
    expect(urls()[1]).toBe('https://api.spotify.com/v1/me/player/recently-played?limit=10');
    expect(rec.ok && rec.data.map((x) => x.uri)).toEqual(['spotify:playlist:a', 'spotify:track:3']);
  });
  it('play sends context_uri for playlists, uris for tracks, and nothing to resume', async () => {
    await seed();
    fetchMock.mockResolvedValue(reply(204));
    await api.play('spotify:playlist:p1');
    await api.play('spotify:track:t1');
    await api.play();
    const bodies = fetchMock.mock.calls.map((c) => c[1].body);
    expect(bodies).toEqual([JSON.stringify({ context_uri: 'spotify:playlist:p1' }), JSON.stringify({ uris: ['spotify:track:t1'] }), undefined]);
  });
  it('nowPlaying maps the player state; 204 is null', async () => {
    await seed();
    fetchMock.mockResolvedValueOnce(
      reply(200, { is_playing: true, progress_ms: 50, context: { uri: 'spotify:playlist:p1' }, item: { name: 'Song', duration_ms: 100, artists: [{ name: 'A' }, { name: 'B' }], album: { images: [{ url: 'u', width: 64 }] } } }),
    );
    const r = await api.nowPlaying();
    expect(r.ok && r.data).toMatchObject({ title: 'Song', artist: 'A, B', isPlaying: true, art: 'u', contextUri: 'spotify:playlist:p1', progressMs: 50, durationMs: 100 });
    fetchMock.mockResolvedValueOnce(reply(204));
    const none = await api.nowPlaying();
    expect(none.ok && none.data).toBeNull();
  });
});

describe('player state', () => {
  it('not connected, no client id', async () => {
    const p = new SpotifyPlayer();
    await p.sync();
    expect(p).toMatchObject({ hasClientId: false, connected: false });
  });
  it('client id entered but not logged in', async () => {
    await updateSettings({ spotifyClientId: 'cid' });
    const p = new SpotifyPlayer();
    await p.sync();
    expect(p).toMatchObject({ hasClientId: true, connected: false });
    expect((await loadSettings()).spotifyClientId).toBe('cid');
  });
  it('204 from the player means needsDevice', async () => {
    await seed();
    fetchMock.mockResolvedValueOnce(reply(204));
    const p = new SpotifyPlayer();
    await p.sync();
    expect(p).toMatchObject({ connected: true, needsDevice: true, isPlaying: false });
  });
  it('shows the track, then play/pause toggles optimistically and rolls back on failure', async () => {
    await seed();
    fetchMock.mockResolvedValueOnce(reply(200, { is_playing: true, item: { name: 'S', artists: [{ name: 'A' }], duration_ms: 10, album: { images: [] } } }));
    const p = new SpotifyPlayer();
    await p.sync();
    expect(p.track).toEqual({ title: 'S', artist: 'A', art: undefined });
    expect(p.isPlaying).toBe(true);
    fetchMock.mockResolvedValueOnce(reply(404, { error: { reason: 'NO_ACTIVE_DEVICE' } }));
    await p.toggle();
    expect(p.isPlaying).toBe(true);
    expect(p.needsDevice).toBe(true);
  });
  it('a revoked login surfaces needsAuth', async () => {
    await seed({ expiresAt: 0 });
    fetchMock.mockResolvedValueOnce(reply(400, { error: 'invalid_grant' }));
    const p = new SpotifyPlayer();
    await p.sync();
    expect(p).toMatchObject({ needsAuth: true, connected: true });
  });
});
