import { accessToken, forceRefresh } from './auth';

const BASE = 'https://api.spotify.com';

/** Why a call did not succeed. The UI maps these to "Reconnect", "Open Spotify", or a quiet retry. */
export type Reason = 'needsAuth' | 'needsDevice' | 'premium' | 'rate' | 'network' | 'error';

export type Res<T> =
  | { ok: true; data: T }
  | { ok: false; reason: Reason; needsDevice?: true; needsAuth?: true; status?: number };

const fail = (reason: Reason, status?: number): Res<never> => ({
  ok: false,
  reason,
  status,
  ...(reason === 'needsDevice' ? { needsDevice: true as const } : {}),
  ...(reason === 'needsAuth' ? { needsAuth: true as const } : {}),
});

async function send(path: string, init: RequestInit, token: string): Promise<Response> {
  return fetch(`${BASE}${path}`, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` } });
}

/**
 * One authenticated call. A 401 triggers exactly one token refresh and one retry; a second 401 is
 * reported as needsAuth (no loop). 404 NO_ACTIVE_DEVICE is needsDevice; 403 is Premium-only playback.
 */
async function call<T>(path: string, init: RequestInit = {}, parse: (j: any) => T): Promise<Res<T>> {
  let token = await accessToken();
  if (!token) return fail('needsAuth');
  let res: Response;
  try {
    res = await send(path, init, token);
    if (res.status === 401) {
      token = await forceRefresh();
      if (!token) return fail('needsAuth');
      res = await send(path, init, token);
      if (res.status === 401) return fail('needsAuth', 401);
    }
  } catch {
    return fail('network');
  }
  if (res.ok) {
    if (res.status === 204) return { ok: true, data: parse(null) };
    const text = await res.text();
    let json: unknown = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON success body */ }
    return { ok: true, data: parse(json) };
  }
  if (res.status === 429) return fail('rate', 429);
  let reason = '';
  try { reason = ((await res.json()) as any)?.error?.reason ?? ''; } catch { /* no body */ }
  if (res.status === 404 && (reason === 'NO_ACTIVE_DEVICE' || path.startsWith('/v1/me/player'))) return fail('needsDevice', 404);
  if (res.status === 403) return fail(reason === 'PREMIUM_REQUIRED' || path.startsWith('/v1/me/player') ? 'premium' : 'error', 403);
  return fail('error', res.status);
}

const json = (body: unknown): RequestInit => ({
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

// ---- shapes the UI uses ----------------------------------------------------------------

export interface NowPlaying {
  title: string;
  artist: string;
  art?: string;
  isPlaying: boolean;
  /** spotify:playlist:… / album / artist context currently playing, if any */
  contextUri?: string;
  progressMs: number;
  durationMs: number;
}

export interface Playlist {
  id: string;
  uri: string;
  name: string;
  /** owner name; Development Mode hides track counts for playlists the user doesn't own */
  owner?: string;
  count?: number;
  art?: string;
}

export interface RecentItem {
  /** what tapping plays: the context (playlist / album / artist) when there is one, else the track */
  uri: string;
  title: string;
  artist: string;
  art?: string;
  playedAt: string;
}

const smallest = (images?: { url: string; width?: number | null }[]) =>
  images?.length ? [...images].sort((a, b) => (a.width ?? 1e9) - (b.width ?? 1e9))[0]!.url : undefined;

const artists = (a?: { name: string }[]) => (a ?? []).map((x) => x.name).join(', ');

function toPlaylist(p: any): Playlist | null {
  if (!p?.uri) return null; // search can contain null entries
  const count = p.items?.total ?? p.tracks?.total; // `tracks` was renamed `items` in 2026
  return {
    id: p.id,
    uri: p.uri,
    name: p.name,
    owner: p.owner?.display_name ?? undefined,
    count: typeof count === 'number' ? count : undefined,
    art: smallest(p.images ?? undefined),
  };
}

// ---- endpoints -------------------------------------------------------------------------

/** null = nothing is playing and no active device (Spotify answers 204). */
export const nowPlaying = (): Promise<Res<NowPlaying | null>> =>
  call('/v1/me/player?additional_types=episode', {}, (j) => {
    const it = j?.item;
    if (!it) return null;
    return {
      title: it.name,
      artist: it.artists ? artists(it.artists) : (it.show?.name ?? ''),
      art: smallest((it.album ?? it.show)?.images),
      isPlaying: !!j.is_playing,
      contextUri: j.context?.uri,
      progressMs: j.progress_ms ?? 0,
      durationMs: it.duration_ms ?? 0,
    };
  });

/** Plays a playlist / album / artist URI, or a single `spotify:track:` URI; with no argument, resumes. */
export const play = (contextUri?: string): Promise<Res<void>> => {
  const body = !contextUri ? undefined : contextUri.startsWith('spotify:track:') ? { uris: [contextUri] } : { context_uri: contextUri };
  return call('/v1/me/player/play', body ? json(body) : { method: 'PUT' }, () => undefined);
};
export const pause = (): Promise<Res<void>> => call('/v1/me/player/pause', { method: 'PUT' }, () => undefined);
export const next = (): Promise<Res<void>> => call('/v1/me/player/next', { method: 'POST' }, () => undefined);
export const previous = (): Promise<Res<void>> => call('/v1/me/player/previous', { method: 'POST' }, () => undefined);

export const myPlaylists = (limit = 20): Promise<Res<Playlist[]>> =>
  call(`/v1/me/playlists?limit=${limit}`, {}, (j) => ((j?.items ?? []) as any[]).map(toPlaylist).filter((p): p is Playlist => !!p));

export const recentlyPlayed = (limit = 10): Promise<Res<RecentItem[]>> =>
  call(`/v1/me/player/recently-played?limit=${limit}`, {}, (j) => {
    const seen = new Set<string>();
    const out: RecentItem[] = [];
    for (const h of (j?.items ?? []) as any[]) {
      const t = h.track;
      if (!t?.uri) continue;
      const uri: string = h.context?.uri ?? t.uri;
      if (seen.has(uri)) continue;
      seen.add(uri);
      out.push({ uri, title: t.name, artist: artists(t.artists), art: smallest(t.album?.images), playedAt: h.played_at });
    }
    return out;
  });

/** Spotify caps search at 10 results per call in Development Mode. */
export const searchPlaylists = (q: string): Promise<Res<Playlist[]>> => {
  const params = new URLSearchParams({ q, type: 'playlist', limit: '10' });
  return call(`/v1/search?${params}`, {}, (j) => ((j?.playlists?.items ?? []) as any[]).map(toPlaylist).filter((p): p is Playlist => !!p));
};

/** The signed-in user's id, for the Liked Songs context `spotify:user:<id>:collection`. */
export const myUserId = (): Promise<Res<string | null>> => call('/v1/me', {}, (j) => j?.id ?? null);
