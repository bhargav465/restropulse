import { describe, it, expect } from 'vitest';
import {
  POST_APPROVAL_BUFFER_HOURS,
  CYCLE_APPROVAL_BUFFER_HOURS,
  ROLLING_WINDOW_HOURS,
  computePostApprovalDeadline,
  computeCycleApprovalDeadline,
  isPostPastApprovalDeadline,
  isCyclePastApprovalDeadline,
} from '../src/approval-deadlines.js';

const HOUR_MS = 60 * 60 * 1000;

describe('approval-deadlines constants', () => {
  it('post buffer is 2 hours', () => {
    expect(POST_APPROVAL_BUFFER_HOURS).toBe(2);
  });

  it('cycle buffer is 48 hours', () => {
    expect(CYCLE_APPROVAL_BUFFER_HOURS).toBe(48);
  });

  it('rolling window equals cycle buffer (deliberate alignment)', () => {
    expect(ROLLING_WINDOW_HOURS).toBe(CYCLE_APPROVAL_BUFFER_HOURS);
  });
});

describe('computePostApprovalDeadline', () => {
  it('subtracts POST_APPROVAL_BUFFER_HOURS from scheduledFor (ISO string)', () => {
    const scheduled = '2026-04-19T10:00:00.000Z';
    const deadline = computePostApprovalDeadline({ scheduledFor: scheduled });
    expect(deadline).not.toBeNull();
    expect(deadline!.toISOString()).toBe('2026-04-19T08:00:00.000Z');
  });

  it('returns null when scheduledFor is missing', () => {
    expect(computePostApprovalDeadline({ scheduledFor: undefined })).toBeNull();
  });

  it('returns null when scheduledFor is empty string', () => {
    expect(computePostApprovalDeadline({ scheduledFor: '' })).toBeNull();
  });

  it('returns null when scheduledFor is unparseable', () => {
    expect(computePostApprovalDeadline({ scheduledFor: 'not-a-date' })).toBeNull();
  });
});

describe('computeCycleApprovalDeadline', () => {
  it('subtracts CYCLE_APPROVAL_BUFFER_HOURS from startDate', () => {
    const start = '2026-05-01T00:00:00.000Z';
    const deadline = computeCycleApprovalDeadline({ startDate: start });
    expect(deadline).not.toBeNull();
    expect(deadline!.toISOString()).toBe('2026-04-29T00:00:00.000Z');
  });

  it('returns null when startDate is missing', () => {
    expect(computeCycleApprovalDeadline({ startDate: undefined as unknown as string })).toBeNull();
  });

  it('returns null when startDate is unparseable', () => {
    expect(computeCycleApprovalDeadline({ startDate: 'garbage' })).toBeNull();
  });
});

describe('isPostPastApprovalDeadline', () => {
  it('returns true exactly at the deadline (boundary inclusive)', () => {
    const scheduled = '2026-04-19T10:00:00.000Z';
    const now = new Date('2026-04-19T08:00:00.000Z');
    expect(isPostPastApprovalDeadline({ scheduledFor: scheduled }, now)).toBe(true);
  });

  it('returns true after the deadline', () => {
    const scheduled = '2026-04-19T10:00:00.000Z';
    const now = new Date('2026-04-19T09:00:00.000Z');
    expect(isPostPastApprovalDeadline({ scheduledFor: scheduled }, now)).toBe(true);
  });

  it('returns false before the deadline', () => {
    const scheduled = '2026-04-19T10:00:00.000Z';
    const now = new Date('2026-04-19T07:59:59.999Z');
    expect(isPostPastApprovalDeadline({ scheduledFor: scheduled }, now)).toBe(false);
  });

  it('returns false when scheduledFor is missing (window treated as open)', () => {
    const now = new Date('2026-04-19T10:00:00.000Z');
    expect(isPostPastApprovalDeadline({ scheduledFor: undefined }, now)).toBe(false);
  });
});

describe('isCyclePastApprovalDeadline', () => {
  it('returns true exactly at the deadline (boundary inclusive)', () => {
    const start = '2026-05-01T00:00:00.000Z';
    const now = new Date(new Date(start).getTime() - CYCLE_APPROVAL_BUFFER_HOURS * HOUR_MS);
    expect(isCyclePastApprovalDeadline({ startDate: start }, now)).toBe(true);
  });

  it('returns true after the deadline', () => {
    const start = '2026-05-01T00:00:00.000Z';
    const now = new Date('2026-04-30T00:00:00.000Z');
    expect(isCyclePastApprovalDeadline({ startDate: start }, now)).toBe(true);
  });

  it('returns false well before the deadline', () => {
    const start = '2026-05-01T00:00:00.000Z';
    const now = new Date('2026-04-01T00:00:00.000Z');
    expect(isCyclePastApprovalDeadline({ startDate: start }, now)).toBe(false);
  });

  it('returns false when startDate is missing', () => {
    const now = new Date('2026-04-19T10:00:00.000Z');
    expect(
      isCyclePastApprovalDeadline({ startDate: undefined as unknown as string }, now),
    ).toBe(false);
  });
});
