// -------------------------------------------------------
// Approval Deadlines
//
// Shared logic for post- and cycle-approval windows.
// Imported by apps/web (UI countdown + lock), apps/api (route enforcement),
// and apps/content-engine (deadline auto-advance processor).
//
// Pure functions, zero runtime deps -- safe for browser, Node, and tests.
//
// All functions accept an optional bufferHours override so callers
// (e.g. content-engine with env-configured values) can deviate from the
// compile-time defaults without forking the logic.
// -------------------------------------------------------

import type { Post, StrategyCycle } from './index.js';

// Default buffer hours. These are the production values and the fallback for
// any caller that does not supply an explicit override.
export const POST_APPROVAL_BUFFER_HOURS = 2;
export const CYCLE_APPROVAL_BUFFER_HOURS = 48;

// Rolling window kept equal to the cycle buffer on purpose: the cycle auto-locks
// to APPROVED exactly when rolling-window generation needs to start materialising
// the next wave of post stubs.
export const ROLLING_WINDOW_HOURS = 48;

// Minimum hours ahead a post must be scheduled.
// = POST_APPROVAL_BUFFER_HOURS (2h) + 0.5h review buffer.
// ASAP scheduling defaults to exactly this value.
export const MIN_SCHEDULE_AHEAD_HOURS = 2.5;

const MS_PER_HOUR = 60 * 60 * 1000;

function toDateOrNull(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

/**
 * Deadline after which a post's approval status auto-locks to SCHEDULED.
 * Returns null when `scheduledFor` is missing or unparseable.
 */
export function computePostApprovalDeadline(
  post: Pick<Post, 'scheduledFor'>,
  bufferHours = POST_APPROVAL_BUFFER_HOURS,
): Date | null {
  const scheduled = toDateOrNull(post.scheduledFor);
  if (!scheduled) return null;
  return new Date(scheduled.getTime() - bufferHours * MS_PER_HOUR);
}

/**
 * Deadline after which a cycle's approval status auto-locks to APPROVED.
 * Returns null when `startDate` is missing or unparseable.
 */
export function computeCycleApprovalDeadline(
  cycle: Pick<StrategyCycle, 'startDate'>,
  bufferHours = CYCLE_APPROVAL_BUFFER_HOURS,
): Date | null {
  const start = toDateOrNull(cycle.startDate);
  if (!start) return null;
  return new Date(start.getTime() - bufferHours * MS_PER_HOUR);
}

/**
 * True when `now` is at or past the post's approval deadline.
 * False when the deadline cannot be computed (treated as still open).
 */
export function isPostPastApprovalDeadline(
  post: Pick<Post, 'scheduledFor'>,
  now: Date,
  bufferHours = POST_APPROVAL_BUFFER_HOURS,
): boolean {
  const deadline = computePostApprovalDeadline(post, bufferHours);
  if (!deadline) return false;
  return now.getTime() >= deadline.getTime();
}

/**
 * True when `now` is at or past the cycle's approval deadline.
 * False when the deadline cannot be computed (treated as still open).
 */
export function isCyclePastApprovalDeadline(
  cycle: Pick<StrategyCycle, 'startDate'>,
  now: Date,
  bufferHours = CYCLE_APPROVAL_BUFFER_HOURS,
): boolean {
  const deadline = computeCycleApprovalDeadline(cycle, bufferHours);
  if (!deadline) return false;
  return now.getTime() >= deadline.getTime();
}
