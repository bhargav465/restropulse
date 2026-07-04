import { describe, it, expect } from 'vitest';
import { parseBestTime, parseDateOrFallback } from '../../src/services/processors/strategy/index.js';

describe('strategy-processor parsing helpers', () => {
  describe('parseDateOrFallback', () => {
    it('returns parsed date for a valid ISO string', () => {
      const fallback = new Date('2026-02-01T00:00:00.000Z');
      const parsed = parseDateOrFallback('2026-03-15T10:30:00.000Z', fallback);

      expect(Number.isNaN(parsed.getTime())).toBe(false);
      expect(parsed.toISOString()).toBe('2026-03-15T10:30:00.000Z');
    });

    it('returns fallback clone for invalid date input', () => {
      const fallback = new Date('2026-02-01T00:00:00.000Z');
      const parsed = parseDateOrFallback('not-a-date', fallback);

      expect(parsed.toISOString()).toBe('2026-02-01T00:00:00.000Z');
      expect(parsed).not.toBe(fallback);
    });

    it('returns fallback clone for non-string input', () => {
      const fallback = new Date('2026-02-01T00:00:00.000Z');
      const parsed = parseDateOrFallback(undefined, fallback);

      expect(parsed.toISOString()).toBe('2026-02-01T00:00:00.000Z');
      expect(parsed).not.toBe(fallback);
    });
  });

  describe('parseBestTime', () => {
    it('parses valid HH:mm values', () => {
      expect(parseBestTime('09:45')).toEqual({ hours: 9, minutes: 45 });
      expect(parseBestTime('23:59')).toEqual({ hours: 23, minutes: 59 });
    });

    it('falls back to 10:00 for malformed values', () => {
      expect(parseBestTime('bad-time')).toEqual({ hours: 10, minutes: 0 });
      expect(parseBestTime('12:3')).toEqual({ hours: 10, minutes: 0 });
      expect(parseBestTime('24:00')).toEqual({ hours: 10, minutes: 0 });
      expect(parseBestTime('11:60')).toEqual({ hours: 10, minutes: 0 });
    });

    it('falls back to 10:00 for non-string values', () => {
      expect(parseBestTime(undefined)).toEqual({ hours: 10, minutes: 0 });
      expect(parseBestTime(null)).toEqual({ hours: 10, minutes: 0 });
      expect(parseBestTime(930)).toEqual({ hours: 10, minutes: 0 });
    });
  });
});
