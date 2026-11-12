import type { Plugin } from 'vite';

/**
 * The app's Content-Security-Policy. Only what the code uses:
 * - connect: Spotify Web API + token endpoint, and the user's Apps Script (script.google.com answers with a redirect
 *   to script.googleusercontent.com, and CSP checks redirect targets too)
 * - img: Spotify cover art (hosts vary: i.scdn.co, mosaic.scdn.co, lineup-images.scdn.co, *.spotifycdn.com ...)
 * No inline script or style (Svelte `style:` and motion use CSSOM), no frames, no objects, no Web Playback SDK.
 */
export const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "font-src 'self'",
  "manifest-src 'self'",
  "worker-src 'self'",
  "frame-src 'none'",
  "img-src 'self' https://*.scdn.co https://*.spotifycdn.com",
  "connect-src 'self' https://api.spotify.com https://accounts.spotify.com https://script.google.com https://script.googleusercontent.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

/** Adds the CSP <meta> to the built index.html only: `npm run dev` injects <style> elements that style-src would block. */
export function cspPlugin(): Plugin {
  return {
    name: 'gym-csp',
    apply: 'build',
    transformIndexHtml(html) {
      const meta = `\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`;
      const charset = /<meta charset=[^>]*>/i;
      return charset.test(html) ? html.replace(charset, (m) => m + meta) : html.replace('<head>', `<head>${meta}`);
    },
  };
}
