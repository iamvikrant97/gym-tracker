import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The app's Content-Security-Policy (style-src 'self') blocks inline style="..." attributes. Svelte's style:prop directive
// sets styles through the CSSOM, which is allowed. A plain style attribute in a component would silently not apply.
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.svelte') ? [p] : [];
  });
const LABS = /Lab\.svelte$|PatternSheet\.svelte$/; // preview-only pages, not part of the app

describe('components under the app CSP', () => {
  it('use style: directives, never an inline style attribute', () => {
    const bad = files('src')
      .filter((f) => !LABS.test(f))
      .filter((f) => /<[^>]*\sstyle\s*=\s*["'{`]/.test(readFileSync(f, 'utf8').replace(/<style[\s\S]*?<\/style>/g, '')));
    expect(bad).toEqual([]);
  });
});
