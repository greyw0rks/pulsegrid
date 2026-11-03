import type { DetectionAction, DetectionPolicy, DetectionState, ProbeResult } from "./types";

export function detect(state: DetectionState, probe: ProbeResult, policy: DetectionPolicy): { state: DetectionState; action: DetectionAction } {
  const gap = state.lastCheckedAt ? Date.parse(probe.checkedAt) - Date.parse(state.lastCheckedAt) : 0;
  const failures = gap > policy.intervalMs * 2.5 ? 0 : state.failures;
  const successes = gap > policy.intervalMs * 2.5 ? 0 : state.successes;
  const next: DetectionState = {
    ...state,
    failures: probe.success ? 0 : failures + 1,
    successes: probe.success ? successes + 1 : 0,
    lastCheckedAt: probe.checkedAt
  };
  if (!probe.success && !state.activeIncidentId && next.failures >= policy.failureThreshold) return { state: next, action: "open" };
  if (probe.success && state.activeIncidentId && next.successes >= policy.recoveryThreshold) return { state: next, action: "resolve" };
  return { state: next, action: null };
}
