import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

vi.mock('@restropulse/telemetry/server', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
  trackAIUsage: vi.fn(),
}));

const ORIGINAL_KEY = process.env['ANTHROPIC_API_KEY'];

beforeAll(() => {
  process.env['ASSET_SERVER_BASE_URL'] = 'http://localhost:3002';
  process.env['ASSET_SERVER_PORT'] = '3002';
  process.env['ANTHROPIC_API_KEY'] = 'sk-test-fixture';
});

afterAll(() => {
  if (ORIGINAL_KEY === undefined) delete process.env['ANTHROPIC_API_KEY'];
  else process.env['ANTHROPIC_API_KEY'] = ORIGINAL_KEY;
});

const { createContentGenerator } = await import('../../../src/services/content-generator/factory.js');

describe('createContentGenerator', () => {
  it('returns the placeholder backend by default ("placeholder")', () => {
    const g = createContentGenerator('placeholder');
    expect(g.name).toBe('placeholder');
  });

  it('returns the AI backend when "ai" and ANTHROPIC_API_KEY is present', () => {
    const g = createContentGenerator('ai');
    expect(g.name).toBe('ai');
  });

  it('throws on an unknown backend string', () => {
    expect(() => createContentGenerator('chatgpt' as any)).toThrow(/unknown content generator backend/i);
  });

  it('throws a clear error when ai backend is selected but ANTHROPIC_API_KEY is missing', () => {
    const k = process.env['ANTHROPIC_API_KEY'];
    delete process.env['ANTHROPIC_API_KEY'];
    try {
      expect(() => createContentGenerator('ai')).toThrow(/ANTHROPIC_API_KEY/);
    } finally {
      if (k !== undefined) process.env['ANTHROPIC_API_KEY'] = k;
    }
  });
});
