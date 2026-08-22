/**
 * runGeneratePost -- per-post caption + media orchestration.
 *
 * 1. Pick the model family (Haiku for captions per ADR 4.6).
 * 2. Build system + task prompts via the specialization.
 * 3. Call LLM(generateObject, schema=PostCaptionSchema) wrapped in withRetry +
 *    withCostTracking. The LLM picks `selectedDish` from the menu, constrained
 *    by the concept (it is no longer pre-picked at random).
 * 4. ART DIRECTOR (image family only): one more Haiku call that turns
 *    (concept + caption + selectedDish + cuisine) into a short structured shot
 *    brief (ShotBriefSchema). This is what the image model receives as its
 *    subject -- so the picture follows the post, not a random dish.
 * 5. Request media via IMediaGenerator, AFTER the caption (sequential, not
 *    parallel) so the brief can see what the caption decided. Reference
 *    photos (owner-uploaded dishImages, or Sonar fallback) are forwarded as
 *    baseImageUrl for img2img.
 * 6. Merge LLM-suggested hashtags with specialization.selectHashtags, apply
 *    denylist + count cap, append to caption.
 * 7. Validate the assembled post via specialization.validateOutput. Errors
 *    bubble; warnings are logged.
 */

import { createLogger } from '@restropulse/telemetry/server';
import {
  ContentGenerationError,
  type GeneratedPost,
  type GenerationContext,
  type GeneratePostInput,
  type MediaMetadata,
} from '../../../types.js';
import type { Platform, PostType } from '@restropulse/shared';
import { withRetry, RETRY_PROFILES } from '../with-retry.js';
import { withCostTracking } from '../with-cost-tracking.js';
import { PostCaptionSchema, ShotBriefSchema, type PostCaptionSchemaType, type ShotBriefSchemaType, type ShotType } from '../llm/schemas.js';
import { computeCostUsd } from '../llm/pricing.js';
import { type PipelineDeps, toSpecializationContext, resolveCurrentAffairsHints } from './types.js';
import type { MediaGenJob, CarouselGenInput } from '../media/types.js';
import { buildImagePromptFragment } from '../specialization/restaurant/visual-direction.js';
import type { SpecializationContext } from '../specialization/types.js';

const log = createLogger('ai-generate-post');

const HASHTAG_HARD_CAP = 8;

// Mirror the denylist in specialization/restaurant/hashtag-strategy.ts.
// Applied here so LLM-suggested hashtags are also scrubbed before appending.
const HASHTAG_DENYLIST = new Set([
  '#like4like', '#follow4follow', '#l4l', '#f4f', '#tagsforlikes', '#followforfollow',
]);

function isVideoType(t: PostType): boolean {
  return t === 'REEL' || t === 'VIDEO';
}

function isStoryVideoCandidate(_t: PostType, _platform: Platform): boolean {
  // Phase 2 keeps STORY on the image path (matches placeholder behavior).
  // ReplicateMediaGenerator in phase 4 may revisit.
  return false;
}

function mergeHashtags(
  caption: string,
  suggested: string[] | undefined,
  fromSpec: string[],
): string {
  const present = new Set(
    (caption.match(/#[\w-]+/g) ?? []).map((t) => t.toLowerCase()),
  );
  const candidates: string[] = [];
  for (const tag of [...(suggested ?? []), ...fromSpec]) {
    const norm = tag.startsWith('#') ? tag : `#${tag}`;
    const lower = norm.toLowerCase();
    if (HASHTAG_DENYLIST.has(lower)) continue;
    if (present.has(lower)) continue;
    if (candidates.some((c) => c.toLowerCase() === lower)) continue;
    candidates.push(lower);
    if (candidates.length >= HASHTAG_HARD_CAP) break;
  }
  if (candidates.length === 0) return caption;
  const sep = caption.endsWith('\n\n') ? '' : caption.endsWith('\n') ? '\n' : '\n\n';
  return `${caption}${sep}${candidates.join(' ')}`;
}

function metadataFromMedia(job: MediaGenJob): MediaMetadata | undefined {
  if (!job.metadata) return undefined;
  const m: MediaMetadata = {};
  if (job.metadata.widthPx !== undefined) m.widthPx = job.metadata.widthPx;
  if (job.metadata.heightPx !== undefined) m.heightPx = job.metadata.heightPx;
  if (job.metadata.durationSeconds !== undefined) m.durationSeconds = job.metadata.durationSeconds;
  return Object.keys(m).length ? m : undefined;
}

/**
 * Archetype IDs are UPPER_SNAKE_CASE workflow labels for the LLM — they have no
 * visual meaning for image models. Filter them out before building image prompts.
 */
function stripArchetypeIds(themes: string[] | undefined): string[] | undefined {
  if (!themes?.length) return themes;
  const visual = themes.filter(t => !/^[A-Z][A-Z0-9]*(_[A-Z0-9]+)+$/.test(t));
  return visual.length ? visual : undefined;
}

/** Max characters of the rendered shot brief handed to the image model. */
const SHOT_BRIEF_MAX_CHARS = 480;

/** Render a ShotBrief into a compact positive prompt: subject first, then context. */
export function renderShotBrief(b: ShotBriefSchemaType): string {
  const parts = [
    b.subject.trim(),
    `Setting: ${b.setting.trim()}.`,
    `Props: ${b.props.trim()}${b.occasionCue ? `, ${b.occasionCue.trim()}` : ''}.`,
    `Lighting: ${b.lighting.trim()}.`,
    `Mood: ${b.mood.trim()}.`,
  ];
  const out = parts.join(' ').replace(/\s+/g, ' ');
  return out.length > SHOT_BRIEF_MAX_CHARS ? out.slice(0, SHOT_BRIEF_MAX_CHARS - 1).trimEnd() + '.' : out;
}

/** Fallback image concept when the art-director call fails: dish + concept, nothing else. */
function fallbackImageConcept(concept: string, dish?: string): string {
  return [dish, concept].filter((x): x is string => Boolean(x && x.trim())).join(' — ');
}

export interface ShotBriefResult {
  prompt: string;
  shotType: ShotType;
}

/**
 * Cheap deterministic hint from the raw concept: if the owner explicitly says
 * "no dish / no food / ambience only / interior / our team …", we tell the art
 * director up front and use it as the fallback shot type. The LLM still decides,
 * but it cannot silently override an explicit exclusion.
 */
export function inferShotTypeHint(concept: string): ShotType | undefined {
  const c = concept.toLowerCase();
  if (/\b(no|without|not a|non[- ]?)\s*(dish|food|plate|plated)\b/.test(c) || /\b(ambien[cs]e|interior|d[eé]cor|dining (room|space|hall)|seating|fa[cç]ade|our (space|place|restaurant) (only|itself))\b/.test(c)) {
    return 'AMBIENCE';
  }
  if (/\b(team|staff|chef(s)? at work|hiring|we're hiring|join our team|kitchen crew|our people)\b/.test(c)) return 'PEOPLE';
  if (/\b(announce|announcement|opening hours|closed on|holiday closure|now open|new timings|offer|discount|% off)\b/.test(c)) return 'ANNOUNCEMENT';
  return undefined;
}

/**
 * ART DIRECTOR (IG-3). Ask Haiku for a structured shot brief that reflects the
 * user concept AND the caption that was just written, with the selected dish
 * as hero. Non-fatal: on any error we fall back to `dish — concept`.
 */
async function buildShotBrief(
  args: { concept: string; caption: string; dish?: string; postType: PostType; platform: Platform; themes?: string[] },
  deps: PipelineDeps,
  specCtx: SpecializationContext,
  ctx: GenerationContext | undefined,
): Promise<ShotBriefResult> {
  const hint = inferShotTypeHint(args.concept);
  // An explicit non-dish concept must not be handed a dish as hero.
  const dish = hint && hint !== 'DISH' ? undefined : args.dish;
  const cuisineHint = specCtx.cuisine ? ` (${specCtx.cuisine})` : '';
  const restaurantHint = specCtx.restaurantName ? ` for ${specCtx.restaurantName}` : '';
  const bioHint = specCtx.bio ? ` Restaurant context: ${specCtx.bio.slice(0, 200)}.` : '';

  const system = [
    'You are the art director briefing an AI image model for a restaurant social post.',
    'Write ONLY what should be visible in the frame, in concrete photographic language: form, colour, texture, garnish, vessel, surface, light.',
    'Never use marketing adjectives (delicious, mouthwatering) and never write negative instructions (no "avoid", "don\'t", "without").',
    'First decide shotType: DISH when a plated dish is the hero; AMBIENCE when the space itself (interior, tables, lighting, façade) is the hero and NO plated food is the subject; PEOPLE for staff/guests/hands at work; ANNOUNCEMENT for offers/events/hiring visuals.',
    'If the user concept excludes food ("no dish", "no food", "ambience only", "just the interior") the shotType MUST NOT be DISH and the subject MUST be the room, people or announcement scene -- describe what IS there (tables, chairs, lamps, walls, windows, plants, staff), never food. Treat such exclusions as binding even if the caption talks about food.',
    'For DISH: the dish (when given) is the hero and must be depicted exactly; the concept and caption decide the setting, props, mood and any occasion cue.',
    'An occasion cue is a SMALL prop-level detail (a diya, a marigold garland, a cricket scoreboard blur, monsoon droplets on the window) -- it never replaces the subject.',
    'Keep every field to one short clause. Total under 80 words.',
  ].join(' ');

  const prompt = [
    `Post type: ${args.postType} for ${args.platform}${restaurantHint}${cuisineHint}.${bioHint}`,
    `User concept: "${args.concept.trim() || '(none — infer from caption)'}"`,
    hint ? `Shot type hint from the concept: ${hint} (binding — the concept explicitly asks for this).` : '',
    dish ? `Featured dish (hero, depict exactly): "${dish}"` : hint && hint !== 'DISH' ? 'Featured dish: none — this is not a dish post.' : 'Featured dish: none specified — choose a subject that fits the concept and caption.',
    args.themes?.length ? `Themes: ${args.themes.join(', ')}` : '',
    `Caption that will accompany the image: "${args.caption.slice(0, 400)}"`,
    'Return the shot brief.',
  ].filter(Boolean).join('\n');

  try {
    return await withRetry(
      () => withCostTracking(
        async () => {
          const { object, usage, modelId } = await deps.llm.generateObject({
            model: 'haiku',
            system,
            prompt,
            schema: ShotBriefSchema,
            telemetryAttributes: {
              operation: 'generatePost',
              step: 'shot-brief',
              ...(ctx?.restaurantId ? { restaurantId: ctx.restaurantId } : {}),
            },
          });
          const costUsd = computeCostUsd(modelId, usage);
          // Defensive: mocks / degraded providers may return a caption-shaped object.
          // Treat a missing subject as a failed brief so we fall back cleanly.
          if (!object || typeof object.subject !== 'string' || !object.subject.trim()) {
            throw new Error('shot brief missing subject');
          }
          // Explicit exclusion wins over the model: never let a "no dish" concept come back as DISH.
          const shotType: ShotType = hint && hint !== 'DISH' && (object.shotType ?? 'DISH') === 'DISH'
            ? hint
            : (object.shotType ?? 'DISH');
          return {
            result: { prompt: renderShotBrief(object), shotType },
            usage: { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, costUsd },
          };
        },
        {
          ...(ctx?.restaurantId ? { restaurantId: ctx.restaurantId } : {}),
          operation: 'generatePost',
          surface: 'llm',
          step: 'shot-brief',
          model: 'claude-haiku-4-5-20251001',
        },
      ),
      RETRY_PROFILES.LLM,
    );
  } catch {
    log.warn({ dish, concept: args.concept.slice(0, 80) }, 'Shot brief failed; falling back to dish + concept');
    return { prompt: fallbackImageConcept(args.concept, dish), shotType: hint ?? 'DISH' };
  }
}

async function runMediaForPost(
  input: GeneratePostInput,
  deps: PipelineDeps,
  ctx: GenerationContext | undefined,
  captionObj: PostCaptionSchemaType,
): Promise<MediaGenJob> {
  const slideDirections = captionObj.carouselSlides;
  // Dish: caller-pinned wins; otherwise whatever the caption LLM chose (already
  // hard-checked against the menu by runGeneratePost before we get here).
  const dish = input.selectedDish ?? captionObj.selectedDish;
  const isCarousel = input.type === 'CAROUSEL';
  const isVideo = isVideoType(input.type) || isStoryVideoCandidate(input.type, input.platform);
  const surface = isVideo ? 'video' : 'image';

  const labels = {
    ...(ctx?.restaurantId ? { restaurantId: ctx.restaurantId } : {}),
    operation: 'generatePost' as const,
    surface: surface as 'video' | 'image',
    step: isVideo ? 'video' : isCarousel ? 'carousel' : 'image',
    model: 'placeholder-media',
  };

  const specCtx = toSpecializationContext(ctx);

  // Archetype IDs (CRAVING_CUE, etc.) are LLM concepts — strip them from image prompts
  const visualThemes = stripArchetypeIds(input.themes);

  // Image family: run the art director AFTER the caption so the brief reflects
  // concept + caption + dish. Video keeps the raw concept (Kling prompt path is
  // unchanged in this pass).
  const brief: ShotBriefResult = isVideo
    ? { prompt: input.concept, shotType: inferShotTypeHint(input.concept) ?? 'DISH' }
    : await buildShotBrief(
        { concept: input.concept, caption: captionObj.caption, dish, postType: input.type, platform: input.platform, themes: visualThemes },
        deps, specCtx, ctx,
      );
  const imageConcept = brief.prompt;

  // Style tail is chosen by shot type so an AMBIENCE/PEOPLE frame is not
  // described as "food photography … of the dish".
  const visualDirection = buildImagePromptFragment(
    { postType: input.type, platform: input.platform, concept: input.concept, themes: input.themes, shotType: brief.shotType },
    specCtx,
  );
  log.debug({ restaurantId: ctx?.restaurantId, shotType: brief.shotType, dish, conceptHead: input.concept.slice(0, 80) }, 'Shot brief resolved');

  // For single-image posts, look up or fetch a reference image for img2img.
  // Owner-uploaded dishImages first (trusted, on-brand); Sonar web search as
  // fallback. NOTE: previously this URL was computed and then silently dropped
  // by ReplicateMediaGenerator -- it is now forwarded as `image` + `prompt_strength`.
  let referenceImageUrl: string | undefined;
  if (dish && brief.shotType === 'DISH' && !isVideo && !isCarousel) {
    referenceImageUrl = ctx?.restaurantProfile?.dishImages?.[dish]?.[0];
    if (!referenceImageUrl && deps.sonar) {
      try {
        const restaurantHint = specCtx.restaurantName ? `"${specCtx.restaurantName}" ` : '';
        const result = await deps.sonar.query(
          `${restaurantHint}"${dish}" food photo India`,
          { returnImages: true },
        );
        referenceImageUrl = result.images?.[0]?.url;
        if (referenceImageUrl) {
          log.debug({ restaurantId: ctx?.restaurantId, dish }, 'Fetched dish reference image on-demand');
        }
      } catch {
        // Non-fatal — proceed without reference image
      }
    }
  }

  return withRetry(
    () => withCostTracking(
      async () => {
        const job = isVideo
          ? await deps.media.generateVideo({
              postType: input.type as 'REEL' | 'VIDEO' | 'STORY',
              platform: input.platform,
              concept: input.concept,
              themes: visualThemes,
              ...(ctx?.restaurantId ? { restaurantId: ctx.restaurantId } : {}),
              ...(input.cycleId ? { cycleId: input.cycleId } : {}),
            })
          : isCarousel
          ? await deps.media.generateCarousel({
              platform: input.platform,
              concept: imageConcept,
              themes: visualThemes,
              promptSuffix: visualDirection,
              ...(slideDirections ? { slideDirections } : {}),
              ...(ctx?.restaurantId ? { restaurantId: ctx.restaurantId } : {}),
              ...(input.cycleId ? { cycleId: input.cycleId } : {}),
            })
          : await deps.media.generateImage({
              postType: input.type,
              platform: input.platform,
              concept: imageConcept,
              themes: visualThemes,
              promptSuffix: visualDirection,
              ...(referenceImageUrl ? { baseImageUrl: referenceImageUrl } : {}),
              ...(ctx?.restaurantId ? { restaurantId: ctx.restaurantId } : {}),
              ...(input.cycleId ? { cycleId: input.cycleId } : {}),
            });

        if (job.status === 'FAILED') {
          throw new ContentGenerationError('UNKNOWN', `Media generation failed: ${job.error ?? 'unknown'}`);
        }

        return {
          result: job,
          usage: { costUsd: 0 },
        };
      },
      labels,
    ),
    isVideo ? RETRY_PROFILES.VIDEO_SUBMIT : RETRY_PROFILES.IMAGE_SUBMIT,
  );
}

async function runCaptionForPost(
  input: GeneratePostInput,
  deps: PipelineDeps,
  ctx?: GenerationContext,
): Promise<PostCaptionSchemaType> {
  const specCtx = toSpecializationContext(ctx);
  const system = deps.specialization.getSystemPromptFragment(specCtx);

  const hints = await resolveCurrentAffairsHints(
    input.currentAffairsHints,
    deps.currentAffairs,
    {
      operation: 'generatePost',
      specializationContext: specCtx,
      concept: input.concept,
      ...(ctx?.restaurantId ? { restaurantId: ctx.restaurantId } : {}),
      ...(input.cycleId ? { cycleId: input.cycleId } : {}),
    },
  );

  const userPrompt = [
    deps.specialization.getTaskPrompt('generatePost', input, specCtx),
    input.themes?.length ? `Themes: ${input.themes.join(', ')}` : '',
    input.cycleId ? `Cycle id: ${input.cycleId}` : '',
    hints.length
      ? `\nCurrent-affairs hints (use sparingly):\n- ${hints.join('\n- ')}`
      : '',
    `\nReturn the following fields:`,
    `- caption: the post caption (without hashtags inline)`,
    `- suggestedHashtags: 2-5 relevant hashtags`,
    `- motivation: 1-2 sentences explaining the creative or strategic rationale for this specific post — what angle, seasonal context, or occasion drove this content choice`,
    input.selectedDish ? `- selectedDish: "${input.selectedDish}" (the dish featured in this post)` : `- selectedDish: the main dish featured in this post, if any (must be from the menu list)`,
    input.type === 'CAROUSEL' ? `- carouselSlides: 2-4 visual briefs for each slide (see CAROUSEL SLIDES instructions above). Each brief is 1 sentence describing what that specific frame shows — subject + action/state, not just a camera angle.` : '',
  ].filter(Boolean).join('\n');

  const telemetryAttributes: Record<string, string> = { operation: 'generatePost', step: 'caption' };
  if (ctx?.restaurantId) telemetryAttributes.restaurantId = ctx.restaurantId;
  if (input.cycleId) telemetryAttributes.cycleId = input.cycleId;
  if (ctx?.correlationId) telemetryAttributes.correlationId = ctx.correlationId;

  return withRetry(
    () => withCostTracking(
      async () => {
        const { object, usage, modelId } = await deps.llm.generateObject({
          model: 'haiku',
          system,
          prompt: userPrompt,
          schema: PostCaptionSchema,
          telemetryAttributes,
        });
        const costUsd = computeCostUsd(modelId, usage);
        return {
          result: object,
          usage: {
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            costUsd,
          },
        };
      },
      {
        ...(ctx?.restaurantId ? { restaurantId: ctx.restaurantId } : {}),
        ...(input.cycleId ? { cycleId: input.cycleId } : {}),
        operation: 'generatePost',
        surface: 'llm',
        step: 'caption',
        model: 'claude-haiku-4-5-20251001',
      },
    ),
    RETRY_PROFILES.LLM,
  );
}

/** Build deduplicated dish pool from restaurant profile (menu + chefSpecials). */
function buildDishPool(ctx?: GenerationContext): string[] {
  const profile = ctx?.restaurantProfile;
  const fromMenu = profile?.menu?.filter(m => m.isAvailable !== false).map(m => m.name) ?? [];
  const fromSpecials = profile?.chefSpecials ?? [];
  return [...new Set([...fromMenu, ...fromSpecials])];
}

export async function runGeneratePost(
  input: GeneratePostInput,
  deps: PipelineDeps,
  ctx?: GenerationContext,
): Promise<GeneratedPost> {
  const hasInput = (input.concept && input.concept.trim()) ||
    (input.themes && input.themes.length > 0) ||
    (input as any).archetype;
  if (!hasInput) {
    throw new ContentGenerationError('INVALID_INPUT', 'generatePost requires either a concept or an archetype (via themes or archetype field)');
  }
  if (!input.type) {
    throw new ContentGenerationError('INVALID_INPUT', 'generatePost requires a post type');
  }
  if (!input.platform) {
    throw new ContentGenerationError('INVALID_INPUT', 'generatePost requires a platform');
  }

  // 1) Caption first. The LLM chooses selectedDish from the menu, constrained by
  //    the concept (see SELECTED DISH guidance in prompts.ts). Dishes are no longer
  //    pre-picked at random -- that was the main reason images ignored the brief.
  const captionObj: PostCaptionSchemaType = await runCaptionForPost(input, deps, ctx);

  // 2) Hard dish check BEFORE any media spend: if the LLM reports a selectedDish it
  //    must be a real menu item. Catches drift to an unlisted dish.
  if (captionObj.selectedDish) {
    const dishPool = buildDishPool(ctx);
    if (dishPool.length > 0) {
      const lowerPool = dishPool.map(d => d.toLowerCase().trim());
      const reportedDish = captionObj.selectedDish.toLowerCase().trim();
      if (!lowerPool.includes(reportedDish)) {
        throw new ContentGenerationError(
          'INVALID_INPUT',
          `Generated content references dish "${captionObj.selectedDish}" not found in restaurant menu. Available: ${dishPool.join(', ')}`,
        );
      }
    }
  }

  // 3) Media, sequenced after the caption so the art-director brief (and carousel
  //    slide briefs) can reflect what the caption decided.
  const mediaJob: MediaGenJob = await runMediaForPost(input, deps, ctx, captionObj);

  const specCtx = toSpecializationContext(ctx);
  const specHashtags = deps.specialization.selectHashtags(captionObj.caption, specCtx);
  const fullCaption = mergeHashtags(captionObj.caption, captionObj.suggestedHashtags, specHashtags);

  // Phase 5: video media may still be RUNNING. Caller writes post.status=PENDING_MEDIA
  // and waits for the media-job-poller cron to advance it.
  if (mediaJob.status === 'RUNNING') {
    return {
      caption: fullCaption,
      thumbnail: '',           // populated when poller transitions COMPLETED
      pendingMedia: true,
      mediaJobId: mediaJob.jobId,
      generationStep: 'MEDIA_REQUESTED',
      motivation: captionObj.motivation,
    };
  }

  if (mediaJob.status === 'FAILED') {
    throw new ContentGenerationError(
      'UNKNOWN',
      `Media generation failed: ${mediaJob.error ?? 'unknown'}`,
    );
  }

  const post: GeneratedPost = {
    caption: fullCaption,
    thumbnail: mediaJob.thumbnail ?? mediaJob.mediaUrl ?? '',
  };
  if (mediaJob.mediaUrls) post.mediaUrls = mediaJob.mediaUrls;
  if (isVideoType(input.type) && mediaJob.mediaUrl) post.videoUrl = mediaJob.mediaUrl;
  const metadata = metadataFromMedia(mediaJob);
  if (metadata) post.mediaMetadata = metadata;
  if (captionObj.motivation) post.motivation = captionObj.motivation;

  const validation = deps.specialization.validateOutput(post, specCtx);
  if (!validation.ok) {
    const errorIssue = validation.issues.find((i) => i.severity === 'error');
    throw new ContentGenerationError(
      'INVALID_INPUT',
      `Generated post failed specialization validation: ${errorIssue?.message ?? 'unknown'}`,
    );
  }
  if (validation.issues.length > 0) {
    log.warn({ issues: validation.issues, postType: input.type }, 'Generated post has warnings');
  }

  return post;
}
