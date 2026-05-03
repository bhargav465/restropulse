import { describe, it, expect } from 'vitest';
import {
  CycleSchema,
  PostCaptionSchema,
} from '../../../../../../src/services/content-generator/backends/ai/llm/schemas.js';

describe('CycleSchema', () => {
  it('accepts a minimal valid cycle', () => {
    const valid = {
      summary: 'Week 1 focus on chef specials and behind-the-scenes content',
      plannedPosts: [{ category: 'chef_special', count: 2 }],
      focus: ['Chef Specials'],
    };
    expect(() => CycleSchema.parse(valid)).not.toThrow();
  });

  it('accepts an optional rationale', () => {
    const valid = {
      summary: 's',
      plannedPosts: [{ category: 'a', count: 1 }],
      focus: ['x'],
      rationale: 'because reasons',
    };
    expect(() => CycleSchema.parse(valid)).not.toThrow();
  });

  it('rejects a cycle missing required fields', () => {
    expect(() => CycleSchema.parse({ summary: 's' })).toThrow();
    expect(() => CycleSchema.parse({ plannedPosts: [], focus: [] })).toThrow();
  });

  it('rejects a plannedPost with non-numeric count', () => {
    expect(() =>
      CycleSchema.parse({
        summary: 's',
        plannedPosts: [{ category: 'c', count: 'two' }],
        focus: ['x'],
      }),
    ).toThrow();
  });
});

describe('PostCaptionSchema', () => {
  it('accepts a caption + optional suggestedHashtags + optional archetype', () => {
    const valid = {
      caption: 'Soft, flaky, ghee-laced parotta straight off the tawa.',
      suggestedHashtags: ['#parotta', '#southindian'],
      archetype: 'CHEFS_PICK',
    };
    expect(() => PostCaptionSchema.parse(valid)).not.toThrow();
  });

  it('accepts caption only (hashtags + archetype optional)', () => {
    const valid = { caption: 'Hello world' };
    expect(() => PostCaptionSchema.parse(valid)).not.toThrow();
  });

  it('rejects empty caption', () => {
    expect(() => PostCaptionSchema.parse({ caption: '' })).toThrow();
  });
});
