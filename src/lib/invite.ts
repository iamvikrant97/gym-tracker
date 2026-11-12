// Personal invite link: https://.../gym-tracker/#/?name=Minal&morning=Cutie&afternoon=Minal&evening=...&night=...
// On a first-run install only, the names pre-fill the setup. Everything is plain text, trimmed, at most GREET_MAX
// characters. The parameters are read from the hash (works with the service worker: a hash never reaches the
// network) or from a normal ?query before the hash.
import { GREET_SLOTS, cleanGreetName, sanitizeGreetNames } from './greeting';
import type { GreetNames } from './types';

export interface Invite { userName?: string; greetNames?: GreetNames }

export const INVITE_PARAMS = ['name', ...GREET_SLOTS] as const;
const KEY = 'gym-tracker:invite';

function paramsOf(query: string): URLSearchParams {
  try {
    return new URLSearchParams(query);
  } catch {
    return new URLSearchParams();
  }
}

/** The query inside a hash such as '#/progress?name=x' ('' when there is none). */
const hashQuery = (hash: string) => (hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : '');

/** Reads and sanitizes the invite from location.search and location.hash. null when nothing usable is there. */
export function parseInvite(search: string, hash: string): Invite | null {
  const q = paramsOf(search);
  const h = paramsOf(hashQuery(hash));
  const get = (k: string) => (h.has(k) ? h.get(k) : q.get(k)); // the hash wins
  return fromRaw({ userName: get('name'), greetNames: Object.fromEntries(GREET_SLOTS.map((s) => [s, get(s)])) });
}

function fromRaw(v: { userName?: unknown; greetNames?: unknown }): Invite | null {
  const userName = cleanGreetName(v.userName);
  const greetNames = sanitizeGreetNames(v.greetNames);
  if (!userName && !greetNames) return null;
  return { ...(userName ? { userName } : {}), ...(greetNames ? { greetNames } : {}) };
}

/** The address (path + query + hash) without the invite parameters. Other parameters stay. */
export function stripInvite(href: string): string {
  const u = new URL(href);
  for (const k of INVITE_PARAMS) u.searchParams.delete(k);
  let hash = u.hash;
  if (hash.includes('?')) {
    const i = hash.indexOf('?');
    const p = new URLSearchParams(hash.slice(i + 1));
    for (const k of INVITE_PARAMS) p.delete(k);
    const rest = p.toString();
    hash = hash.slice(0, i) + (rest ? `?${rest}` : '');
  }
  return u.pathname + u.search + hash;
}

/** Removes the invite parameters from the address bar without adding a history entry. */
export function stripInviteFromAddress(): void {
  try {
    const clean = stripInvite(location.href);
    if (clean !== location.pathname + location.search + location.hash) history.replaceState(history.state, '', clean);
  } catch {
    /* an unusual address: leave it */
  }
}

// ---- pending names: kept until Start, so a reload (or a close) in the middle of the setup keeps them ----
export function savePendingInvite(inv: Invite): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(inv));
  } catch {
    /* storage blocked: the names live in memory for this visit only */
  }
}

export function loadPendingInvite(): Invite | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? fromRaw(JSON.parse(raw) as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function clearPendingInvite(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing to clear */
  }
}
