/**
 * Anthropic-backed analysis stage. TWO calls, BOTH forced tool-use with a JSON
 * schema (module CLAUDE.md §7 — never free-text JSON parsing):
 *   Call A  classify_cuisines     — claude-haiku-4-5 (cheap classification)
 *   Call B  competitive_analysis  — claude-sonnet-4-6, max_tokens 8192
 *
 * Only compacted competitor rows (name/rating/reviews/distance) are sent — never
 * raw Places payloads (cost rule, CLAUDE §9). The model classifies, summarizes,
 * and strategizes; it never supplies ratings/review counts (those stay measured).
 *
 * ANTHROPIC_API_KEY is server-side only; a missing key raises a 503 StageError.
 * Each call retries once on a malformed/absent tool result, then fails the stage
 * with a 502 (INTEGRATION §7).
 */

import Anthropic from '@anthropic-ai/sdk';
import type { KeywordCluster } from '@restropulse/shared';
import { StageError } from './errors.js';
import {
    ANALYSIS_SYSTEM,
    ANALYSIS_TOOL,
    CLASSIFY_SYSTEM,
    CLASSIFY_TOOL,
    buildAnalysisPrompt,
    buildClassifyPrompt,
    DEEP_LINK_BUCKETS,
    type AnalysisPromptInput,
    type CompactRow,
} from './prompts.js';

const HAIKU_MODEL = 'claude-haiku-4-5';
const SONNET_MODEL = 'claude-sonnet-4-6';

export type DeepLinkBucket = (typeof DEEP_LINK_BUCKETS)[number];

export interface CuisineClassification {
    baseCuisine: string;
    /** Tolerant lookup (exact, then normalized) — returns undefined when unknown. */
    lookup: (name: string) => string | undefined;
}

export interface CompetitorEnhancement {
    name: string;
    strengths: string[];
    weaknesses: string[];
    whatTheyDoBetter?: string[];
    whereYouWin?: string[];
    sentimentLabel?: 'Positive' | 'Negative' | 'Mixed';
    pricingInsight?: string;
    marketingEdge?: string;
}

export interface AnalysisActionItem {
    priority: number;
    action: string;
    detail: string;
    impact: 'High' | 'Medium' | 'Low';
    timeframe: string;
    deepLinkBucket: DeepLinkBucket;
}

export interface CompetitiveAnalysis {
    overview: string;
    keyFindings: string[];
    immediateThreats: string;
    growthOpportunities: string;
    verdict: string;
    actionPlan: AnalysisActionItem[];
    keywords: KeywordCluster;
    enhancements: CompetitorEnhancement[];
    /** Tolerant lookup for a competitor's enhancement by name. */
    enhancementFor: (name: string) => CompetitorEnhancement | undefined;
}

function getClient(): Anthropic {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
        throw new StageError(
            'AI analysis is not configured on the server (missing ANTHROPIC_API_KEY).',
            503,
            'ANALYZING',
        );
    }
    return new Anthropic({ apiKey });
}

/** Normalize a name to a tolerant lookup key (lowercase, alphanumeric only). */
function normKey(s: string): string {
    return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Run a forced single-tool call and return the tool_use input. Retries once on a
 * missing/invalid tool block, then raises a 502 StageError.
 */
async function runForcedTool<T>(
    client: Anthropic,
    opts: { model: string; maxTokens: number; system: string; prompt: string; tool: Anthropic.Tool },
): Promise<T> {
    let lastErr: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            const res = await client.messages.create({
                model: opts.model,
                max_tokens: opts.maxTokens,
                system: opts.system,
                tools: [opts.tool],
                tool_choice: { type: 'tool', name: opts.tool.name },
                messages: [{ role: 'user', content: opts.prompt }],
            });
            const block = res.content.find(
                (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === opts.tool.name,
            );
            if (!block || typeof block.input !== 'object' || block.input === null) {
                throw new StageError('AI returned no structured result — please try again.', 502, 'ANALYZING');
            }
            return block.input as T;
        } catch (err) {
            lastErr = err;
            if (err instanceof Anthropic.APIError) {
                const status = err.status ?? 502;
                const message =
                    status === 401
                        ? 'AI service authentication failed — check ANTHROPIC_API_KEY.'
                        : status === 429
                          ? 'AI service is rate-limited right now — please try again in a moment.'
                          : 'AI analysis failed while generating the report — please try again.';
                // Auth/rate errors are not worth retrying; surface immediately.
                throw new StageError(message, 502, 'ANALYZING');
            }
            // Malformed tool result — retry once, then fall through.
        }
    }
    if (lastErr instanceof StageError) throw lastErr;
    throw new StageError('AI analysis returned an unexpected response — please try again.', 502, 'ANALYZING');
}

// ---------------------------------------------------------------------------
// Grader unlock insights — the AI layer of the public lead-gen report. Runs
// ONCE per scan, at unlock time (a captured lead), never for anonymous scans,
// so the free teaser stays Places-only paise-cheap. One Haiku forced-tool call
// produces the full owner-facing analysis: executive summary + action plan,
// keyword clusters, per-rival insights, cuisine classification, and a
// multi-paragraph verdict.
// ---------------------------------------------------------------------------

export interface GraderInsightsInput {
    name: string;
    city: string;
    rating: number;
    reviews: number;
    rank: number;
    totalNearby: number;
    areaAvgRating: number;
    estMonthlyLossInr: number;
    problems: Array<{ label: string; note: string }>;
    rivals: Array<{ name: string; rating: number; reviews: number; threatScore?: number }>;
    /** Wider nearby field (top ~20 by threat) for cuisine classification. */
    nearby: Array<{ name: string; rating: number; reviews: number; distanceKm?: number }>;
}

export interface GraderActionItem {
    priority: number;
    action: string;
    detail: string;
    impact: string;
    timeframe: string;
}

export interface GraderInsights {
    baseCuisine: string;
    executiveSummary: {
        overview: string;
        keyFindings: string[];
        immediateThreats: string;
        growthOpportunities: string;
        recommendation: string;
        actionPlan: GraderActionItem[];
    };
    verdict: string;
    keywords: {
        primary: string[];
        positive: string[];
        negative: string[];
        longTail: string[];
        trending: string[];
    };
    rivals: Array<{ name: string; theyDoBetter: string[]; whereYouWin: string[] }>;
    /** AI cuisine label per nearby restaurant name (for the cuisine-mix card). */
    cuisineOf: Record<string, string>;
}

const strArr = (v: unknown, cap: number): string[] =>
    Array.isArray(v) ? v.map(String).filter(Boolean).slice(0, cap) : [];

export async function generateGraderInsights(
    input: GraderInsightsInput,
    client: Anthropic = getClient(),
): Promise<GraderInsights> {
    const out = await runForcedTool<GraderInsights>(client, {
        model: HAIKU_MODEL,
        maxTokens: 4000,
        system: [
            'You write sharp, concrete competitive analysis for Indian restaurant owners.',
            'Plain language a busy owner skims in seconds. Anchor every claim to the numbers provided.',
            'Never invent facts absent from the data — no delivery-platform claims, no imagined menus.',
            'Amounts are in INR (₹). Keyword suggestions should fit Indian search behaviour.',
        ].join(' '),
        prompt: JSON.stringify(input),
        tool: {
            name: 'grader_insights',
            description: 'Full structured analysis for the unlocked grader report.',
            input_schema: {
                type: 'object',
                required: ['baseCuisine', 'executiveSummary', 'verdict', 'keywords', 'rivals', 'cuisineOf'],
                properties: {
                    baseCuisine: { type: 'string', description: "The scanned restaurant's primary cuisine (e.g. Biryani, North Indian, Cafe)." },
                    executiveSummary: {
                        type: 'object',
                        required: ['overview', 'keyFindings', 'immediateThreats', 'growthOpportunities', 'recommendation', 'actionPlan'],
                        properties: {
                            overview: { type: 'string', description: '3-4 sentences on the competitive landscape and this restaurant\'s standing.' },
                            keyFindings: { type: 'array', maxItems: 6, items: { type: 'string' }, description: '6 specific, number-anchored findings.' },
                            immediateThreats: { type: 'string', description: '2-3 sentences naming the most urgent rivals and exactly why.' },
                            growthOpportunities: { type: 'string', description: '2-3 sentences on the biggest untapped opportunities in this data.' },
                            recommendation: { type: 'string', description: '2-3 sentences: what to do first, second, and why.' },
                            actionPlan: {
                                type: 'array',
                                maxItems: 5,
                                items: {
                                    type: 'object',
                                    required: ['priority', 'action', 'detail', 'impact', 'timeframe'],
                                    properties: {
                                        priority: { type: 'number' },
                                        action: { type: 'string' },
                                        detail: { type: 'string', description: '2-3 sentences: exactly what to do and how.' },
                                        impact: { type: 'string', enum: ['High', 'Medium', 'Low'] },
                                        timeframe: { type: 'string', enum: ['Immediate', '1-2 weeks', '1 month', '3 months'] },
                                    },
                                },
                            },
                        },
                    },
                    verdict: {
                        type: 'string',
                        description:
                            '3 short paragraphs separated by blank lines: (1) market position and biggest risk, (2) the single biggest opportunity and how to capture it, (3) a 90-day roadmap with 3 milestones.',
                    },
                    keywords: {
                        type: 'object',
                        required: ['primary', 'positive', 'negative', 'longTail', 'trending'],
                        properties: {
                            primary: { type: 'array', maxItems: 8, items: { type: 'string' } },
                            positive: { type: 'array', maxItems: 8, items: { type: 'string' } },
                            negative: { type: 'array', maxItems: 6, items: { type: 'string' }, description: 'Complaint keywords to monitor for this cuisine.' },
                            longTail: { type: 'array', maxItems: 8, items: { type: 'string' }, description: '4-6 word phrases customers type into Google/Zomato/Swiggy.' },
                            trending: { type: 'array', maxItems: 6, items: { type: 'string' } },
                        },
                    },
                    rivals: {
                        type: 'array',
                        maxItems: 5,
                        items: {
                            type: 'object',
                            required: ['name', 'theyDoBetter', 'whereYouWin'],
                            properties: {
                                name: { type: 'string' },
                                theyDoBetter: { type: 'array', items: { type: 'string' }, maxItems: 3 },
                                whereYouWin: { type: 'array', items: { type: 'string' }, maxItems: 3 },
                            },
                        },
                    },
                    cuisineOf: {
                        type: 'object',
                        description: 'Map of nearby restaurant name -> primary cuisine label, for every restaurant in the nearby list.',
                        additionalProperties: { type: 'string' },
                    },
                },
            },
        },
    });
    const es = (out.executiveSummary ?? {}) as GraderInsights['executiveSummary'];
    const kw = (out.keywords ?? {}) as GraderInsights['keywords'];
    return {
        baseCuisine: typeof out.baseCuisine === 'string' ? out.baseCuisine : '',
        executiveSummary: {
            overview: typeof es.overview === 'string' ? es.overview : '',
            keyFindings: strArr(es.keyFindings, 6),
            immediateThreats: typeof es.immediateThreats === 'string' ? es.immediateThreats : '',
            growthOpportunities: typeof es.growthOpportunities === 'string' ? es.growthOpportunities : '',
            recommendation: typeof es.recommendation === 'string' ? es.recommendation : '',
            actionPlan: Array.isArray(es.actionPlan)
                ? es.actionPlan.slice(0, 5).map((a, i) => ({
                      priority: typeof a?.priority === 'number' ? a.priority : i + 1,
                      action: String(a?.action ?? ''),
                      detail: String(a?.detail ?? ''),
                      impact: String(a?.impact ?? 'Medium'),
                      timeframe: String(a?.timeframe ?? '1 month'),
                  })).filter((a) => a.action)
                : [],
        },
        verdict: typeof out.verdict === 'string' ? out.verdict : '',
        keywords: {
            primary: strArr(kw.primary, 8),
            positive: strArr(kw.positive, 8),
            negative: strArr(kw.negative, 6),
            longTail: strArr(kw.longTail, 8),
            trending: strArr(kw.trending, 6),
        },
        rivals: Array.isArray(out.rivals)
            ? out.rivals
                  .slice(0, 5)
                  .map((r) => ({
                      name: String(r?.name ?? ''),
                      theyDoBetter: strArr(r?.theyDoBetter, 3),
                      whereYouWin: strArr(r?.whereYouWin, 3),
                  }))
                  .filter((r) => r.name)
            : [],
        cuisineOf:
            out.cuisineOf && typeof out.cuisineOf === 'object'
                ? Object.fromEntries(Object.entries(out.cuisineOf).map(([k, v]) => [k, String(v)]))
                : {},
    };
}

// ---------------------------------------------------------------------------
// Review reply drafting — the one-tap follow-through for the "negative review"
// nudge. Draft-only: the owner copies it to Google today; once Business Profile
// connect exists this becomes "post reply". Haiku: cheap, fast, good at tone.
// ---------------------------------------------------------------------------

export interface DraftReplyInput {
    restaurantName: string;
    review: { text: string; rating: number; author?: string };
    /** Optional owner voice hints — cuisine, sign-off name. */
    voice?: { cuisine?: string; signOff?: string };
}

export interface DraftReplyOutput {
    reply: string;
    /** What the draft is doing, for the UI label. */
    stance: 'apology' | 'thanks' | 'clarify';
}

const DRAFT_REPLY_TOOL: Anthropic.Tool = {
    name: 'draft_reply',
    description: 'A short owner reply to one Google review.',
    input_schema: {
        type: 'object',
        properties: {
            reply: { type: 'string', description: '2-4 sentences, plain English, no emojis, no hashtags, no marketing.' },
            stance: { type: 'string', enum: ['apology', 'thanks', 'clarify'] },
        },
        required: ['reply', 'stance'],
    },
};

export async function draftReviewReply(input: DraftReplyInput, client: Anthropic = getClient()): Promise<DraftReplyOutput> {
    const { restaurantName, review, voice } = input;
    const stars = Math.max(1, Math.min(5, Math.round(review.rating)));
    const system = [
        `You write replies from the owner of "${restaurantName}"${voice?.cuisine ? ` (${voice.cuisine})` : ''} to Google reviews.`,
        'Rules: 2-4 sentences. Warm, specific to what the guest actually wrote, never generic. No emojis, no hashtags, no discounts or offers, no promises you cannot keep, no arguing.',
        'For 1-2 stars: acknowledge the specific problem, apologise once without excuses, say one concrete thing you will do, invite them back or to contact you. For 3 stars: thank, address the gap, invite back. For 4-5 stars: thank specifically, mention one detail they praised, invite back.',
        `Sign off as ${voice?.signOff ? `"${voice.signOff}"` : 'the owner'} in one short line.`,
    ].join(' ');
    const guestLine = review.author ? `\nGuest: ${review.author}` : '';
    const prompt = `Rating: ${stars}/5${guestLine}\nReview: <<<${review.text.slice(0, 1200)}>>>`;
    const out = await runForcedTool<Partial<DraftReplyOutput>>(client, {
        model: HAIKU_MODEL,
        maxTokens: 400,
        system,
        prompt,
        tool: DRAFT_REPLY_TOOL,
    });
    const reply = (out.reply ?? '').trim();
    if (!reply) throw new StageError('AI returned an empty reply - please try again.', 502, 'ANALYZING');
    const stance: DraftReplyOutput['stance'] =
        out.stance === 'apology' || out.stance === 'thanks' || out.stance === 'clarify' ? out.stance : stars <= 2 ? 'apology' : 'thanks';
    return { reply, stance };
}

interface ClassifyToolInput {
    baseCuisine?: string;
    classifications?: Array<{ name?: string; cuisine?: string }>;
}

/** Call A — classify base + nearby cuisines. */
export async function classifyCuisines(
    base: { name: string; city: string },
    rows: CompactRow[],
    client: Anthropic = getClient(),
): Promise<CuisineClassification> {
    const input = await runForcedTool<ClassifyToolInput>(client, {
        model: HAIKU_MODEL,
        maxTokens: 2048,
        system: CLASSIFY_SYSTEM,
        prompt: buildClassifyPrompt(base, rows),
        tool: CLASSIFY_TOOL,
    });

    const exact: Record<string, string> = {};
    const normalized: Record<string, string> = {};
    for (const c of input.classifications ?? []) {
        if (!c?.name || !c?.cuisine) continue;
        exact[c.name] = c.cuisine;
        normalized[normKey(c.name)] = c.cuisine;
    }
    return {
        baseCuisine: input.baseCuisine || 'Multi-cuisine',
        lookup: (name: string) => exact[name] ?? normalized[normKey(name)],
    };
}

interface AnalysisToolInput {
    overview?: string;
    keyFindings?: string[];
    immediateThreats?: string;
    growthOpportunities?: string;
    verdict?: string;
    actionPlan?: Array<Partial<AnalysisActionItem>>;
    keywords?: Partial<KeywordCluster>;
    competitors?: CompetitorEnhancement[];
}

function coerceBucket(v: unknown): DeepLinkBucket {
    return (DEEP_LINK_BUCKETS as readonly string[]).includes(v as string)
        ? (v as DeepLinkBucket)
        : 'get-started';
}

/** Call B — full competitive analysis, keywords, and per-competitor layer. */
export async function analyzeCompetition(
    input: AnalysisPromptInput,
    client: Anthropic = getClient(),
): Promise<CompetitiveAnalysis> {
    const out = await runForcedTool<AnalysisToolInput>(client, {
        model: SONNET_MODEL,
        maxTokens: 8192,
        system: ANALYSIS_SYSTEM,
        prompt: buildAnalysisPrompt(input),
        tool: ANALYSIS_TOOL,
    });

    const keywords: KeywordCluster = {
        primary: out.keywords?.primary ?? [],
        longTail: out.keywords?.longTail ?? [],
        trending: out.keywords?.trending ?? [],
        competitor: out.keywords?.competitor ?? [],
        negativeToMonitor: out.keywords?.negativeToMonitor ?? [],
    };

    const actionPlan: AnalysisActionItem[] = (out.actionPlan ?? []).map((a, i) => ({
        priority: typeof a.priority === 'number' ? a.priority : i + 1,
        action: a.action ?? '',
        detail: a.detail ?? '',
        impact: (a.impact as AnalysisActionItem['impact']) ?? 'Medium',
        timeframe: a.timeframe ?? '',
        deepLinkBucket: coerceBucket((a as { deepLinkBucket?: unknown }).deepLinkBucket),
    }));

    const enhancements = out.competitors ?? [];
    const byName: Record<string, CompetitorEnhancement> = {};
    for (const e of enhancements) {
        if (e?.name) byName[normKey(e.name)] = e;
    }

    return {
        overview: out.overview ?? '',
        keyFindings: out.keyFindings ?? [],
        immediateThreats: out.immediateThreats ?? '',
        growthOpportunities: out.growthOpportunities ?? '',
        verdict: out.verdict ?? '',
        actionPlan,
        keywords,
        enhancements,
        enhancementFor: (name: string) => byName[normKey(name)],
    };
}
