#!/usr/bin/env node
// Prints a personal invite link that pre-fills the greeting names on a first-run install.
//   node tools/invite-link.mjs --name Minal --morning Cutie --afternoon Minal --evening CutieChan --night Cutiechan
// Optional: --base <app address> (default: the GitHub Pages address).
const BASE = 'https://iamvikrant97.github.io/gym-tracker/';
const KEYS = ['name', 'morning', 'afternoon', 'evening', 'night'];
const MAX = 20;

const args = process.argv.slice(2);
const given = {};
let base = BASE;
for (let i = 0; i < args.length; i += 2) {
  const key = args[i]?.replace(/^--/, '');
  const value = args[i + 1];
  if (!args[i]?.startsWith('--') || value === undefined) fail(`Missing value for ${args[i]}`);
  if (key === 'base') base = value;
  else if (KEYS.includes(key)) given[key] = value.trim();
  else fail(`Unknown option --${key}. Use: ${KEYS.map((k) => `--${k}`).join(' ')} [--base URL]`);
}
const parts = KEYS.filter((k) => given[k]);
if (parts.length === 0) fail('Give at least one of: ' + KEYS.map((k) => `--${k}`).join(' '));
for (const k of parts) if ([...given[k]].length > MAX) fail(`--${k} is longer than ${MAX} characters`);

const clean = base.replace(/[?#].*$/, '').replace(/\/?$/, '/');
console.log(`${clean}#/?${parts.map((k) => `${k}=${encodeURIComponent(given[k])}`).join('&')}`);

function fail(msg) {
  console.error(msg);
  process.exit(1);
}
