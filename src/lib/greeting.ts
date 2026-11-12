import type { GreetNames } from './types';

export const GREET_MAX = 20;
export type GreetSlot = 'morning' | 'afternoon' | 'evening' | 'night';
export const GREET_SLOTS: GreetSlot[] = ['morning', 'afternoon', 'evening', 'night'];
const WORD: Record<GreetSlot, string> = { morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening', night: 'Night' };

/**
 * Without custom names (the classic greeting): <12 morning, <17 afternoon, else evening — exactly as before.
 * With custom names: 05-11 morning, 12-16 afternoon, 17-20 evening, 21-04 night.
 */
export const slotForHour = (h: number, custom = false): GreetSlot =>
  h < 12 ? (custom && h < 5 ? 'night' : 'morning') : h < 17 ? 'afternoon' : h < 21 || !custom ? 'evening' : 'night';

/** A name as a plain trimmed string, at most GREET_MAX characters. Anything that is not a string is empty. */
export const cleanGreetName = (v: unknown): string => (typeof v === 'string' ? v.trim().slice(0, GREET_MAX).trim() : '');

/** Keeps only the four known slots with non-empty names; undefined when nothing is left. */
export function sanitizeGreetNames(v: unknown): GreetNames | undefined {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return undefined;
  const out: GreetNames = {};
  for (const k of GREET_SLOTS) {
    const n = cleanGreetName((v as Record<string, unknown>)[k]);
    if (n) out[k] = n;
  }
  return Object.keys(out).length ? out : undefined;
}

/** The greeting for an hour: the slot's own name, else the main name, else the plain word. */
export function greetingFor(hour: number, userName: string | undefined, greetNames: GreetNames | undefined): { word: string; name: string; text: string } {
  const slot = slotForHour(hour, !!sanitizeGreetNames(greetNames));
  const word = WORD[slot];
  const name = cleanGreetName(greetNames?.[slot]) || cleanGreetName(userName);
  return { word, name, text: name ? `${word}, ${name}` : word };
}
