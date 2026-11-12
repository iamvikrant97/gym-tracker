import type { Plan, SessionId } from './types';

// The plan in effect, kept in memory so screens and pure helpers can read it synchronously.
// It is loaded from the settings row at start (see planSetup.ts) and whenever settings are reloaded.
// Null = nothing loaded: callers fall back to Vik's built-in plan (seed.ts currentPlan()).
let active = $state.raw<Plan | null>(null);
let retired = $state.raw<Record<SessionId, string>>({});

export function getActivePlan(): Plan | null {
  return active;
}

export function setActivePlan(plan: Plan | null): void {
  active = plan;
}

export function getRetiredNames(): Record<SessionId, string> {
  return retired;
}

export function setRetiredNames(names: Record<SessionId, string> | undefined): void {
  retired = names ?? {};
}
