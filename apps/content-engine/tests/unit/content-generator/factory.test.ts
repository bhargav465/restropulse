import { describe, it, expect, beforeAll, vi } from 'vitest';

vi.mock('@restropulse/telemetry/server', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
  trackAIUsage: vi.fn(),
}));

beforeAll(() => {
  process.env['ASSET_SERVER_BASE_URL'] = 'http://localhost:3002';
});

const { createContentGenerator } = await import('../../../src/services/content-generator/factory.js');

describe('createContentGenerator', () => {
  it('returns the placeholder backend by default ("placeholder")', () => {
    const g = createContentGenerator('placeholder');
    expect(g.name).toBe('placeholder');
  });

  it('returns the AI backend when "ai"', () => {
    const g = createContentGenerator('ai');
    expect(g.name).toBe('ai');
  });

  it('throws on an unknown backend string', () => {
    expect(() => createContentGenerator('chatgpt' as any)).toThrow(/unknown content generator backend/i);
  });
});
