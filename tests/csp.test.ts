import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CSP, cspPlugin } from '../vite-csp';

const dir = (name: string) => CSP.split(';').map((d) => d.trim()).find((d) => d.startsWith(`${name} `)) ?? '';

describe('Content-Security-Policy', () => {
  it('is emitted for the production build only (dev injects <style>, which style-src would block)', () => {
    const p = cspPlugin();
    expect(p.apply).toBe('build');
    const html = (p.transformIndexHtml as (h: string) => string)('<head><title>x</title></head>');
    expect(html).toContain('http-equiv="Content-Security-Policy"');
    expect(html).toContain(CSP);
    expect(readFileSync('index.html', 'utf8')).not.toContain('Content-Security-Policy');
  });
  it('allows Spotify cover art from any scdn.co / spotifycdn.com host and nothing else for images', () => {
    expect(dir('img-src')).toBe("img-src 'self' https://*.scdn.co https://*.spotifycdn.com");
  });
  it('stays tight: no inline script/style, no eval, no frames or objects', () => {
    expect(CSP).not.toMatch(/unsafe-inline|unsafe-eval|\sdata:|\*\s|https:\s*;/);
    expect(dir('script-src')).toBe("script-src 'self'");
    expect(dir('style-src')).toBe("style-src 'self'");
    expect(dir('connect-src')).toBe("connect-src 'self' https://api.spotify.com https://accounts.spotify.com https://script.google.com https://script.googleusercontent.com");
    expect(CSP).toContain("object-src 'none'");
    expect(CSP).toContain("frame-src 'none'");
    expect(CSP).toContain("base-uri 'self'");
    expect(CSP).toContain("form-action 'self'");
  });
});
