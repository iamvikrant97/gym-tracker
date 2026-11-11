import { get, put, loadSettings, openDb } from '../db';

/** Exactly the scopes the app needs; nothing that writes to the library or playlists. */
export const SCOPES =
  'user-read-playback-state user-modify-playback-state user-read-currently-playing playlist-read-private user-library-read user-read-recently-played';

const AUTH_URL = 'https://accounts.spotify.com/authorize';
const TOKEN_URL = 'https://accounts.spotify.com/api/token';
const PENDING_KEY = 'spotify-pending';
const TOKENS_KEY = 'spotifyTokens';
const SKEW_MS = 60_000;

export interface Tokens {
  access: string;
  refresh: string;
  expiresAt: number;
  /** client id the tokens were issued for (the refresh call needs it even if Settings changes later) */
  clientId: string;
}

interface Pending {
  verifier: string;
  state: string;
  clientId: string;
  redirectUri: string;
}

/** The redirect URI registered in the Spotify dashboard: the exact Pages URL, no hash. */
export function redirectUri(): string {
  return `${location.origin}/gym-tracker/`;
}

export function base64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** 64 characters from 48 random bytes: within Spotify's 43-128 limit, using only [A-Za-z0-9_-]. */
export function makeVerifier(): string {
  return base64url(crypto.getRandomValues(new Uint8Array(48)));
}

/** PKCE S256: base64url(SHA-256(verifier)). */
export async function challengeFor(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64url(new Uint8Array(digest));
}

// The login may come back in a different browsing context than it left from (installed PWA vs Chrome tab),
// and sessionStorage is per context, so the pending login is mirrored into localStorage.
function savePending(p: Pending) {
  const raw = JSON.stringify(p);
  try { sessionStorage.setItem(PENDING_KEY, raw); } catch { /* ignore */ }
  try { localStorage.setItem(PENDING_KEY, raw); } catch { /* ignore */ }
}
function loadPending(): Pending | null {
  for (const store of [sessionStorage, localStorage]) {
    try {
      const raw = store.getItem(PENDING_KEY);
      if (raw) return JSON.parse(raw) as Pending;
    } catch { /* ignore */ }
  }
  return null;
}
function clearPending() {
  try { sessionStorage.removeItem(PENDING_KEY); } catch { /* ignore */ }
  try { localStorage.removeItem(PENDING_KEY); } catch { /* ignore */ }
}

/** Starts the login: stores verifier + state, then sends the browser to Spotify. */
export async function beginLogin(
  clientId: string,
  redirect: string = redirectUri(),
  navigate: (url: string) => void = (u) => location.assign(u),
): Promise<void> {
  const verifier = makeVerifier();
  const state = base64url(crypto.getRandomValues(new Uint8Array(16)));
  savePending({ verifier, state, clientId, redirectUri: redirect });
  const q = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirect,
    scope: SCOPES,
    state,
    code_challenge_method: 'S256',
    code_challenge: await challengeFor(verifier),
  });
  navigate(`${AUTH_URL}?${q}`);
}

// ---- token storage (IndexedDB, own row in the settings store so Settings writes can't clobber it) ----

export async function loadTokens(): Promise<Tokens | null> {
  const row = await get<{ key: string; value: Tokens }>('settings', TOKENS_KEY);
  return row?.value ?? null;
}
async function saveTokens(t: Tokens): Promise<void> {
  await put('settings', { key: TOKENS_KEY, value: t });
}
export async function disconnect(): Promise<void> {
  await (await openDb()).delete('settings', TOKENS_KEY);
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}

async function tokenRequest(body: Record<string, string>): Promise<Response> {
  return fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  });
}

function cleanUrl() {
  try {
    history.replaceState(null, '', location.pathname + location.hash);
  } catch { /* ignore */ }
}

/**
 * Call on load. When the URL carries `?code=`, exchanges it for tokens and removes the query from the address bar.
 * Returns true only when new tokens were stored.
 */
export async function handleRedirect(url: string = location.href): Promise<boolean> {
  let u: URL;
  try { u = new URL(url); } catch { return false; }
  const code = u.searchParams.get('code');
  const state = u.searchParams.get('state');
  const failed = u.searchParams.has('error');
  if (!code && !failed) return false;
  const pending = loadPending();
  clearPending();
  cleanUrl();
  if (!code || failed || !pending || pending.state !== state) return false;
  try {
    const res = await tokenRequest({
      grant_type: 'authorization_code',
      code,
      redirect_uri: pending.redirectUri,
      client_id: pending.clientId,
      code_verifier: pending.verifier,
    });
    if (!res.ok) return false;
    const j = (await res.json()) as TokenResponse;
    await saveTokens({
      access: j.access_token,
      refresh: j.refresh_token ?? '',
      expiresAt: Date.now() + j.expires_in * 1000,
      clientId: pending.clientId,
    });
    return true;
  } catch {
    return false;
  }
}

let inflight: Promise<Tokens | null> | null = null;

/** Refresh result: new tokens, 'revoked' (refresh token rejected: log in again) or 'offline' (try later). */
async function refresh(t: Tokens): Promise<Tokens | 'revoked' | 'offline'> {
  const clientId = t.clientId || (await loadSettings()).spotifyClientId || '';
  let res: Response;
  try {
    res = await tokenRequest({ grant_type: 'refresh_token', refresh_token: t.refresh, client_id: clientId });
  } catch {
    return 'offline';
  }
  if (res.status === 400 || res.status === 401) {
    await disconnect();
    return 'revoked';
  }
  if (!res.ok) return 'offline';
  const j = (await res.json()) as TokenResponse;
  const next: Tokens = {
    access: j.access_token,
    refresh: j.refresh_token || t.refresh, // Spotify may omit a new refresh token: keep the old one
    expiresAt: Date.now() + j.expires_in * 1000,
    clientId,
  };
  await saveTokens(next);
  return next;
}

/** One refresh at a time, however many requests hit an expired token together. */
export function forceRefresh(): Promise<string | null> {
  const run =
    inflight ??
    (inflight = (async () => {
      try {
        const t = await loadTokens();
        if (!t?.refresh) return null;
        const r = await refresh(t);
        return typeof r === 'string' ? null : r;
      } finally {
        inflight = null;
      }
    })());
  return run.then((t) => t?.access ?? null);
}

/** A usable access token, refreshing first when under 60 s remain. Null = not connected or login was revoked. */
export async function accessToken(): Promise<string | null> {
  const t = await loadTokens();
  if (!t) return null;
  if (t.expiresAt - Date.now() >= SKEW_MS) return t.access;
  const fresh = await forceRefresh();
  if (fresh) return fresh;
  // Offline (not revoked): hand back the old token so the request fails as a network error, not as "Reconnect".
  return (await loadTokens())?.access ?? null;
}

export async function isConnected(): Promise<boolean> {
  return (await loadTokens()) !== null;
}
