import { describe, it, expect } from 'vitest';
import { AIContentGenerator } from '../../../../../src/services/content-generator/backends/ai/ai-content-generator.js';
import { RestaurantSpecialization } from '../../../../../src/services/content-generator/backends/ai/specialization/index.js';
import { ContentGenerationError } from '../../../../../src/services/content-generator/types.js';

const gen = new AIContentGenerator({ specialization: new RestaurantSpecialization() });

describe('AIContentGenerator (phase 1 stub)', () => {
  it('exposes name "ai"', () => {
    expect(gen.name).toBe('ai');
  });

  it('exposes the configured specialization', () => {
    expect(gen.specialization.domain).toBe('restaurant');
  });

  it('throws BACKEND_UNAVAILABLE from draftCycle until phase 2 wires the LLM', async () => {
    await expect(
      gen.draftCycle({ period: 'week-of-2026-05-04' }),
    ).rejects.toMatchObject({ name: 'ContentGenerationError', code: 'BACKEND_UNAVAILABLE' });
  });

  it('throws BACKEND_UNAVAILABLE from reviseCycle until phase 2 wires the LLM', async () => {
    await expect(
      gen.reviseCycle({
        existingCycle: {
          period: 'w', summary: 's', plannedPosts: [], focus: [],
        },
        feedback: { areas: [], note: '' },
      }),
    ).rejects.toMatchObject({ code: 'BACKEND_UNAVAILABLE' });
  });

  it('throws BACKEND_UNAVAILABLE from generatePost until phase 2 wires the LLM', async () => {
    await expect(
      gen.generatePost({ concept: 'test', type: 'IMAGE', platforms: ['INSTAGRAM'] }),
    ).rejects.toMatchObject({ code: 'BACKEND_UNAVAILABLE' });
  });

  it('throws BACKEND_UNAVAILABLE from revisePost until phase 2 wires the LLM', async () => {
    await expect(
      gen.revisePost({
        existingPost: { type: 'IMAGE', platforms: ['INSTAGRAM'], caption: 'c' },
        feedback: { tags: [], details: {}, note: '' },
      }),
    ).rejects.toMatchObject({ code: 'BACKEND_UNAVAILABLE' });
  });

  it('reports unhealthy from healthCheck while LLM is not wired', async () => {
    const r = await gen.healthCheck!();
    expect(r.ok).toBe(false);
    expect(r.detail).toMatch(/llm|not wired|phase 2/i);
  });

  it('throws when constructed without a specialization', () => {
    expect(() => new AIContentGenerator({} as any)).toThrow(ContentGenerationError);
  });
});
