import { execFileSync, spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { parseInvite } from '../src/lib/invite';

const run = (...args: string[]) => execFileSync('node', ['tools/invite-link.mjs', ...args], { encoding: 'utf8' }).trim();

describe('tools/invite-link.mjs', () => {
  it('prints the encoded link the app reads back', () => {
    const link = run('--name', 'Minal', '--morning', 'Cutie', '--afternoon', 'Minal', '--evening', 'CutieChan', '--night', 'Cutiechan');
    expect(link).toBe('https://iamvikrant97.github.io/gym-tracker/#/?name=Minal&morning=Cutie&afternoon=Minal&evening=CutieChan&night=Cutiechan');
    const u = new URL(link);
    expect(parseInvite(u.search, u.hash)).toEqual({
      userName: 'Minal',
      greetNames: { morning: 'Cutie', afternoon: 'Minal', evening: 'CutieChan', night: 'Cutiechan' },
    });
  });
  it('encodes spaces and symbols, and leaves out options that are not given', () => {
    const link = run('--name', 'Mina l&co', '--night', '✨ Zzz');
    expect(link).toBe('https://iamvikrant97.github.io/gym-tracker/#/?name=Mina%20l%26co&night=%E2%9C%A8%20Zzz');
    const u = new URL(link);
    expect(parseInvite(u.search, u.hash)).toEqual({ userName: 'Mina l&co', greetNames: { night: '✨ Zzz' } });
  });
  it('fails with a message for a name over 20 characters or no names at all', () => {
    const long = spawnSync('node', ['tools/invite-link.mjs', '--name', 'x'.repeat(21)], { encoding: 'utf8' });
    expect(long.status).not.toBe(0);
    expect(long.stderr).toMatch(/20/);
    const none = spawnSync('node', ['tools/invite-link.mjs'], { encoding: 'utf8' });
    expect(none.status).not.toBe(0);
  });
});
