import { loadSettings } from '../db';
import { beginLogin, handleRedirect, isConnected, redirectUri } from './auth';
import * as api from './api';
import type { Res } from './api';

export interface TrackInfo {
  title: string;
  artist: string;
  art?: string;
}

const POLL_MS = 5000;

/** Reactive Spotify remote. The app is only a controller: Spotify keeps playing on the phone. */
export class SpotifyPlayer {
  /** a client id has been entered in Settings */
  hasClientId = $state(false);
  /** tokens are stored */
  connected = $state(false);
  /** the login was rejected or revoked: show "Reconnect" */
  needsAuth = $state(false);
  /** no active Spotify device: show "Open Spotify" */
  needsDevice = $state(false);
  premiumRequired = $state(false);
  track = $state.raw<TrackInfo | undefined>(undefined);
  isPlaying = $state(false);
  /** the first player check has finished (avoids flashing "not playing" on load) */
  ready = $state(false);
  /** name of the playlist the user picked here (Spotify only returns a URI for the context) */
  contextName = $state<string | undefined>(undefined);
  progress = $state(0);
  /** context (playlist / album / liked songs) Spotify is playing from, to mark the active row in the music sheet */
  contextUri = $state<string | undefined>(undefined);
  #timer: ReturnType<typeof setInterval> | null = null;
  #busy = false;

  /** Handles a `?code=` redirect, then reads connection state. Call once on app load. */
  async init(): Promise<void> {
    await handleRedirect(location.href).catch(() => false);
    await this.sync();
  }

  /** Re-reads the client id and token presence (Settings may have changed), then polls once. */
  async sync(): Promise<void> {
    try {
      await this.#sync();
    } catch {
      /* storage unavailable: the bar stays in its quiet "Connect" state */
      this.ready = true;
    }
  }

  async #sync(): Promise<void> {
    this.hasClientId = !!(await loadSettings()).spotifyClientId;
    this.connected = await isConnected();
    if (!this.connected) {
      this.track = undefined;
      this.isPlaying = false;
      this.needsDevice = false;
      this.needsAuth = false;
      this.ready = true;
      return;
    }
    await this.refresh();
  }

  /** Starts the Spotify login (client id comes from Settings). */
  async connect(): Promise<void> {
    const id = (await loadSettings()).spotifyClientId;
    if (id) await beginLogin(id, redirectUri());
  }

  #apply<T>(r: Res<T>): r is Extract<Res<T>, { ok: true }> {
    if (r.ok) {
      this.needsAuth = false;
      this.premiumRequired = false;
      return true;
    }
    if (r.reason === 'needsAuth') this.needsAuth = true;
    if (r.reason === 'needsDevice') this.needsDevice = true;
    if (r.reason === 'premium') this.premiumRequired = true;
    return false;
  }

  async refresh(): Promise<void> {
    if (!this.connected || this.#busy) return;
    this.#busy = true;
    try {
      const r = await api.nowPlaying();
      if (!this.#apply(r)) return;
      this.needsDevice = r.data === null;
      if (r.data) {
        this.track = { title: r.data.title, artist: r.data.artist, art: r.data.art };
        this.isPlaying = r.data.isPlaying;
        this.progress = r.data.durationMs ? r.data.progressMs / r.data.durationMs : 0;
        if (r.data.contextUri !== this.contextUri) this.contextName = undefined;
        this.contextUri = r.data.contextUri;
      } else {
        this.isPlaying = false;
      }
    } catch {
      /* storage error: keep the last known state */
    } finally {
      this.#busy = false;
      this.ready = true;
    }
  }

  /** Polls every 5 s while the page is visible; returns a stop function. */
  start(): () => void {
    this.stop();
    const tick = () => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') void this.refresh();
    };
    this.#timer = setInterval(tick, POLL_MS);
    const vis = () => document.visibilityState === 'visible' && void this.sync();
    document.addEventListener('visibilitychange', vis);
    return () => {
      document.removeEventListener('visibilitychange', vis);
      this.stop();
    };
  }
  stop(): void {
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = null;
  }

  async #command(r: Promise<Res<void>>): Promise<boolean> {
    const res = await r;
    const ok = this.#apply(res);
    if (ok) this.needsDevice = false;
    // Spotify takes a moment to report the new state.
    setTimeout(() => void this.refresh(), 350);
    return ok;
  }

  async toggle(): Promise<void> {
    const was = this.isPlaying;
    this.isPlaying = !was;
    if (!(await this.#command(was ? api.pause() : api.play()))) this.isPlaying = was;
  }
  async skip(dir: 1 | -1): Promise<void> {
    await this.#command(dir === 1 ? api.next() : api.previous());
  }
  /** Plays a playlist/album/track URI; `name` is shown as the context in the bar. */
  async playContext(uri: string, name?: string): Promise<boolean> {
    const ok = await this.#command(api.play(uri));
    if (ok) {
      this.isPlaying = true;
      this.contextUri = uri;
      this.contextName = name;
    }
    return ok;
  }
}

export const spotify = new SpotifyPlayer();
