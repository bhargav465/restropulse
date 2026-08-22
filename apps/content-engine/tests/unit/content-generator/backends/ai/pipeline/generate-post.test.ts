import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@restropulse/telemetry/server', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
  trackAIUsage: vi.fn(),
}));

vi.mock('@restropulse/db', () => ({
  insertCostEvent: vi.fn().mockResolvedValue({ id: 'ce_test' }),
}));

const { runGeneratePost, renderShotBrief, inferShotTypeHint } = await import(
  '../../../../../../src/services/content-generator/backends/ai/pipeline/generate-post.js'
);
const { RestaurantSpecialization } = await import(
  '../../../../../../src/services/content-generator/backends/ai/specialization/index.js'
);

beforeEach(() => {
  vi.clearAllMocks();
});

const MOCK_SUBJECT = 'Golden-bronze cauliflower florets with char marks, drizzled with herb-flecked achaar emulsion on a copper plate';
const MOCK_SHOT = {
  shotType: 'DISH',
  subject: MOCK_SUBJECT,
  setting: 'a dark teak table by a window',
  props: 'brass tumbler, scattered curry leaves',
  lighting: 'soft warm side light',
  mood: 'intimate, unhurried',
};

function makeDeps(captionOverrides: Partial<{ caption: string; suggestedHashtags: string[] }> = {}) {
  // Single mock satisfies both PostCaptionSchema calls (caption/suggestedHashtags) and
  // ShotBriefSchema calls (subject/setting/props/lighting/mood). Zod is not invoked on mocks.
  const generateObject = vi.fn().mockResolvedValue({
    object: {
      caption: captionOverrides.caption ?? 'Soft, flaky, ghee-laced parotta straight off the tawa.',
      suggestedHashtags: captionOverrides.suggestedHashtags ?? ['#parotta', '#ghee'],
      archetype: 'CHEFS_PICK',
      ...MOCK_SHOT,
    },
    usage: { inputTokens: 80, outputTokens: 40 },
    modelId: 'claude-haiku-4-5-20251001',
  });
  const generateImage = vi.fn().mockResolvedValue({
    jobId: 'job_img_1',
    status: 'COMPLETED',
    mediaUrl: 'http://localhost:3002/images/x.jpg',
    thumbnail: 'http://localhost:3002/images/x.jpg',
    metadata: { widthPx: 1080, heightPx: 1080 },
  });
  const generateVideo = vi.fn().mockResolvedValue({
    jobId: 'job_vid_1',
    status: 'COMPLETED',
    mediaUrl: 'http://localhost:3002/videos/x.mp4',
    thumbnail: 'http://localhost:3002/videos/x.jpg',
    metadata: { widthPx: 1080, heightPx: 1920, durationSeconds: 18 },
  });
  const generateCarousel = vi.fn().mockResolvedValue({
    jobId: 'job_car_1',
    status: 'COMPLETED',
    mediaUrls: ['http://localhost:3002/images/a.jpg', 'http://localhost:3002/images/b.jpg', 'http://localhost:3002/images/c.jpg'],
    thumbnail: 'http://localhost:3002/images/a.jpg',
    metadata: { widthPx: 1080, heightPx: 1080 },
  });
  return {
    llm: { name: 'mock-llm', generateObject },
    media: { name: 'mock-media', generateImage, generateCarousel, generateVideo, pollJob: vi.fn() },
    specialization: new RestaurantSpecialization(),
  };
}

describe('runGeneratePost', () => {
  it('produces caption + thumbnail for an IMAGE post', async () => {
    const deps = makeDeps();
    const out = await runGeneratePost(
      { concept: 'parotta', type: 'IMAGE', platform: 'INSTAGRAM' },
      deps,
      { restaurantId: 'r1', restaurantName: 'Spice Route', locale: 'en-IN' },
    );
    expect(out.caption).toContain('parotta');
    expect(out.thumbnail).toMatch(/^http:\/\//);
    expect(out.videoUrl).toBeUndefined();
  });

  it('routes REEL post type through generateVideo and returns pendingMedia=true', async () => {
    const deps = makeDeps();
    (deps.media.generateVideo as any).mockResolvedValueOnce({
      jobId: 'jobV1', status: 'RUNNING',
    });
    const out = await runGeneratePost(
      { concept: 'kitchen reel', type: 'REEL', platform: 'INSTAGRAM' },
      deps,
      {},
    );
    expect(deps.media.generateVideo).toHaveBeenCalledTimes(1);
    expect(out.pendingMedia).toBe(true);
    expect(out.mediaJobId).toBe('jobV1');
    expect(out.generationStep).toBe('MEDIA_REQUESTED');
  });

  it('routes CAROUSEL through generateCarousel and returns mediaUrls', async () => {
    const deps = makeDeps();
    const out = await runGeneratePost(
      { concept: 'menu', type: 'CAROUSEL', platform: 'INSTAGRAM' },
      deps,
      {},
    );
    expect(deps.media.generateCarousel).toHaveBeenCalledTimes(1);
    expect(deps.media.generateImage).not.toHaveBeenCalled();
    expect(out.mediaUrls).toHaveLength(3);
    expect(out.thumbnail).toBe(out.mediaUrls![0]);
    expect(out.videoUrl).toBeUndefined();
  });

  it('routes STORY through generateImage and returns a single mediaUrl', async () => {
    const deps = makeDeps();
    const out = await runGeneratePost(
      { concept: 'story post', type: 'STORY', platform: 'INSTAGRAM' },
      deps,
      {},
    );
    expect(deps.media.generateImage).toHaveBeenCalledTimes(1);
    expect(deps.media.generateCarousel).not.toHaveBeenCalled();
    expect(deps.media.generateVideo).not.toHaveBeenCalled();
    expect(out.thumbnail).toMatch(/^http:\/\//);
    expect(out.mediaUrls).toBeUndefined();
    expect(out.videoUrl).toBeUndefined();
  });

  it('routes VIDEO through generateVideo', async () => {
    const deps = makeDeps();
    (deps.media.generateVideo as any).mockResolvedValueOnce({
      jobId: 'jobV2', status: 'RUNNING',
    });
    const out = await runGeneratePost(
      { concept: 'video post', type: 'VIDEO', platform: 'FACEBOOK' },
      deps,
      {},
    );
    expect(deps.media.generateVideo).toHaveBeenCalledTimes(1);
    expect(deps.media.generateImage).not.toHaveBeenCalled();
    expect(deps.media.generateCarousel).not.toHaveBeenCalled();
    expect(out.pendingMedia).toBe(true);
    expect(out.mediaJobId).toBe('jobV2');
  });

  it('caption ends with hashtags merged from LLM + specialization, deduped, denylist applied', async () => {
    const deps = makeDeps({
      suggestedHashtags: ['#parotta', '#like4like', '#ghee'],  // like4like is on the denylist
    });
    const out = await runGeneratePost(
      { concept: 'parotta', type: 'IMAGE', platform: 'INSTAGRAM' },
      deps,
      { restaurantId: 'r1', locale: 'en-IN' },
    );
    expect(out.caption).not.toMatch(/like4like/i);
    // At least one hashtag from the model input survives:
    expect(out.caption).toMatch(/#parotta|#ghee/);
  });

  it('writes three cost events for an IMAGE post: caption llm, shot-brief llm, image', async () => {
    const { insertCostEvent } = await import('@restropulse/db');
    (insertCostEvent as any).mockClear();
    const deps = makeDeps();
    await runGeneratePost({ concept: 'x', type: 'IMAGE', platform: 'INSTAGRAM' }, deps, { restaurantId: 'r1' });
    expect(insertCostEvent).toHaveBeenCalledTimes(3);
    const steps = (insertCostEvent as any).mock.calls.map((c: any) => `${c[0].surface}:${c[0].step}`);
    expect(steps).toContain('llm:caption');
    expect(steps).toContain('llm:shot-brief');
    expect(steps).toContain('image:image');
  });

  it('throws ContentGenerationError on missing concept and type', async () => {
    const deps = makeDeps();
    await expect(
      runGeneratePost({ concept: '', type: 'IMAGE', platform: 'INSTAGRAM' }, deps, {}),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('accepts themes-only input when concept is empty', async () => {
    const deps = makeDeps();
    // Should not throw -- themes[0] is the archetype, concept is empty
    const out = await runGeneratePost(
      { concept: '', type: 'IMAGE', platform: 'INSTAGRAM', themes: ['CRAVING_CUE'] },
      deps,
    );
    expect(out.caption).toBeTruthy();
  });

  it('throws INVALID_INPUT when concept, themes, and archetype are all absent', async () => {
    const deps = makeDeps();
    await expect(
      runGeneratePost({ concept: '', type: 'IMAGE', platform: 'INSTAGRAM' }, deps),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('accepts archetype field as standalone input without concept', async () => {
    const deps = makeDeps();
    const out = await runGeneratePost(
      { concept: '', type: 'REEL', platform: 'INSTAGRAM', archetype: 'CRAVING_CUE' },
      deps,
    );
    expect(out.caption).toBeTruthy();
  });

  it('runs the art director after the caption and hands the rendered shot brief to the image model', async () => {
    const deps = makeDeps();
    await runGeneratePost(
      { concept: 'Charred Cauliflower with Achaar Emulsion', type: 'IMAGE', platform: 'INSTAGRAM', selectedDish: 'Charred Cauliflower with Achaar Emulsion' },
      deps,
      { restaurantId: 'r1', restaurantName: 'Saffron & Smoke' },
    );
    // Caption call + shot-brief call
    expect(deps.llm.generateObject).toHaveBeenCalledTimes(2);
    const [captionCall, briefCall] = (deps.llm.generateObject as any).mock.calls;
    expect(captionCall[0].telemetryAttributes.step).toBe('caption');
    expect(briefCall[0].telemetryAttributes.step).toBe('shot-brief');
    // The brief prompt sees the dish, the concept AND the caption that was just written
    expect(briefCall[0].prompt).toContain('Charred Cauliflower with Achaar Emulsion');
    expect(briefCall[0].prompt).toContain('ghee-laced parotta');
    // Image received the rendered brief (subject first), not the raw dish name
    const imgInput = (deps.media.generateImage as any).mock.calls[0][0];
    expect(imgInput.concept.startsWith(MOCK_SUBJECT)).toBe(true);
    expect(imgInput.concept).toContain('Setting: a dark teak table');
    expect(imgInput.concept).toContain('Mood: intimate, unhurried');
  });

  it('passes the user concept into the shot brief even when no dish is selected', async () => {
    const deps = makeDeps();
    await runGeneratePost(
      { concept: 'weekend brunch', type: 'IMAGE', platform: 'INSTAGRAM' },
      deps,
      { restaurantId: 'r1' },
    );
    // Caption + shot brief -- the art director always runs for the image family
    expect(deps.llm.generateObject).toHaveBeenCalledTimes(2);
    const briefCall = (deps.llm.generateObject as any).mock.calls[1][0];
    expect(briefCall.prompt).toContain('User concept: "weekend brunch"');
    expect(deps.media.generateImage).toHaveBeenCalledWith(
      expect.objectContaining({ concept: expect.stringContaining(MOCK_SUBJECT) }),
    );
  });

  it('honours an explicit "no dish / ambience" concept: no dish handed to the art director, AMBIENCE style tail, no reference photo', async () => {
    const deps = makeDeps();
    // Model tries to answer DISH anyway -- the explicit exclusion must win.
    (deps.llm.generateObject as any)
      .mockResolvedValueOnce({ object: { caption: 'Our biryani ritual…', motivation: 'm', selectedDish: 'Chicken Biryani' }, usage: { inputTokens: 1, outputTokens: 1 }, modelId: 'claude-haiku-4-5-20251001' })
      .mockResolvedValueOnce({ object: { ...MOCK_SHOT, shotType: 'DISH', subject: 'Warm dining room with brass lamps and set tables' }, usage: { inputTokens: 1, outputTokens: 1 }, modelId: 'claude-haiku-4-5-20251001' });
    await runGeneratePost(
      { concept: 'No dish image, only my restaurant ambience image', type: 'IMAGE', platform: 'INSTAGRAM' },
      deps,
      { restaurantId: 'r1', restaurantProfile: { menu: [{ name: 'Chicken Biryani' } as any], dishImages: { 'Chicken Biryani': ['https://cdn.example/biryani.jpg'] } } },
    );
    const briefCall = (deps.llm.generateObject as any).mock.calls[1][0];
    expect(briefCall.prompt).toContain('Shot type hint from the concept: AMBIENCE');
    expect(briefCall.prompt).toContain('Featured dish: none — this is not a dish post.');
    const imgInput = (deps.media.generateImage as any).mock.calls[0][0];
    expect(imgInput.promptSuffix).toContain('interior photography');
    expect(imgInput.promptSuffix).not.toContain('of the dish');
    expect(imgInput.baseImageUrl).toBeUndefined();
  });

  it('generates media strictly AFTER the caption (no parallel race)', async () => {
    const deps = makeDeps();
    await runGeneratePost({ concept: 'x', type: 'IMAGE', platform: 'INSTAGRAM' }, deps, { restaurantId: 'r1' });
    const captionOrder = (deps.llm.generateObject as any).mock.invocationCallOrder[0];
    const imageOrder = (deps.media.generateImage as any).mock.invocationCallOrder[0];
    expect(captionOrder).toBeLessThan(imageOrder);
  });

  it('forwards an owner-uploaded dish photo as baseImageUrl for img2img', async () => {
    const deps = makeDeps();
    await runGeneratePost(
      { concept: 'our biryani', type: 'IMAGE', platform: 'INSTAGRAM', selectedDish: 'Chicken Biryani' },
      deps,
      { restaurantId: 'r1', restaurantProfile: { menu: [{ name: 'Chicken Biryani' } as any], dishImages: { 'Chicken Biryani': ['https://cdn.example/biryani.jpg'] } } },
    );
    expect(deps.media.generateImage).toHaveBeenCalledWith(
      expect.objectContaining({ baseImageUrl: 'https://cdn.example/biryani.jpg' }),
    );
  });

  it('falls back to "dish — concept" when the shot-brief call throws', async () => {
    const deps = makeDeps();
    (deps.llm.generateObject as any)
      .mockResolvedValueOnce({ object: { caption: 'cap', motivation: 'm' }, usage: { inputTokens: 1, outputTokens: 1 }, modelId: 'claude-haiku-4-5-20251001' })
      .mockRejectedValue(new Error('boom'));
    await runGeneratePost(
      { concept: 'monsoon special', type: 'IMAGE', platform: 'INSTAGRAM', selectedDish: 'Pakora' },
      deps,
      { restaurantId: 'r1' },
    );
    expect(deps.media.generateImage).toHaveBeenCalledWith(
      expect.objectContaining({ concept: 'Pakora — monsoon special' }),
    );
  });

  it('does not run the art director for video posts (Kling path unchanged)', async () => {
    const deps = makeDeps();
    (deps.media.generateVideo as any).mockResolvedValueOnce({ jobId: 'jv', status: 'RUNNING' });
    await runGeneratePost(
      { concept: 'Biryani Reel', type: 'REEL', platform: 'INSTAGRAM', selectedDish: 'Biryani' },
      deps,
      { restaurantId: 'r1' },
    );
    // Only the caption call; the shot brief is image-family only in this pass
    expect(deps.llm.generateObject).toHaveBeenCalledTimes(1);
  });

  describe('renderShotBrief', () => {
    it('renders subject first, then setting/props/lighting/mood, folding occasionCue into props', () => {
      const out = renderShotBrief({
        subject: 'Steaming dum biryani in a sealed clay handi',
        setting: 'a family dining table',
        props: 'brass bowls of raita',
        lighting: 'warm evening window light',
        mood: 'festive, generous',
        occasionCue: 'a small saffron-white-green marigold garland',
      });
      expect(out.startsWith('Steaming dum biryani')).toBe(true);
      expect(out).toContain('Props: brass bowls of raita, a small saffron-white-green marigold garland.');
      expect(out).toContain('Mood: festive, generous.');
    });

    it('caps the rendered brief so it can never crowd out the style tail', () => {
      const out = renderShotBrief({ subject: 'x'.repeat(2000), setting: 's', props: 'p', lighting: 'l', mood: 'm' });
      expect(out.length).toBeLessThanOrEqual(480);
    });
  });

  describe('inferShotTypeHint', () => {
    it('detects explicit exclusions and non-dish intents', () => {
      expect(inferShotTypeHint('No dish image only my restaurant ambience image')).toBe('AMBIENCE');
      expect(inferShotTypeHint('just the interior, no food')).toBe('AMBIENCE');
      expect(inferShotTypeHint('We are hiring — join our team')).toBe('PEOPLE');
      expect(inferShotTypeHint('Closed on Diwali — new timings')).toBe('ANNOUNCEMENT');
    });
    it('returns undefined for ordinary dish concepts so the model decides', () => {
      expect(inferShotTypeHint('Independence Day dum biryani in a clay handi')).toBeUndefined();
    });
  });
});
