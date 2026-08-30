/**
 * Public restaurant grader (lead generation) — the Owner.com-style flow:
 * name + city → scan → score, problems, competitor ranking, search table.
 *
 * Deliberately CHEAP per anonymous scan: Google Places + a website fetch only —
 * no Claude call, no narrative, no snapshots. The full Intelligence product is
 * the upsell; this is the taste of it. Thresholds mirror the real product
 * (same scoring.ts pillars), so the score a lead sees here matches the score
 * they see after signing up.
 */

import { randomUUID } from 'node:crypto';
import { getDB } from '@restropulse/db';
import type { PillarScore } from '@restropulse/shared';
import { getBaseRestaurantDetails, getNearbyRestaurants, type PlaceRow } from './places.js';
import { fetchWebsiteSEO } from './seo.js';
import { computePillars, restroScore } from './scoring.js';
import { generateGraderInsights, type GraderInsights } from './analysis.js';

export interface GraderProblem {
    label: string;
    note: string;
    pillar: PillarScore['key'];
    grade: PillarScore['grade'];
}

export interface GraderRankRow {
    name: string;
    rating: number;
    reviews: number;
    position: number;
    isYou: boolean;
    /** Concrete ways this rival beats the scanned restaurant ("Higher rating (4.5 vs 4.1)"). */
    beatsYou: string[];
    /** 0-100 threat score (rating x volume x proximity) — same math as the product. */
    threatScore?: number;
}

export interface GraderSearchRow {
    query: string;
    topResult: string;
    yourPosition: number | null; // null = outside top 10
}

export interface GraderResult {
    scanId: string;
    name: string;
    address: string;
    city: string;
    score: number;
    gradeLabel: 'Excellent' | 'Good' | 'Fair' | 'Poor';
    rating: number;
    reviews: number;
    photos: number;
    /** Places photo resource name for the hero image (served via /api/grader/photo). */
    photoName: string | null;
    /** Listing coordinates for the map fallback when the key returns no photos. */
    location: { lat: number; lng: number } | null;
    problems: GraderProblem[];
    /** Full pillar scorecard — same math as the product dashboard. */
    pillars: PillarScore[];
    rank: number;
    totalNearby: number;
    areaAvgRating: number;
    /** % of nearby rivals with review counts at or below yours. */
    reviewPercentile: number;
    closestRival: { name: string; distanceKm: number; rating: number } | null;
    /** Competition heat around this restaurant, from nearby threat scores. */
    threat: { overall: 'High' | 'Moderate' | 'Low'; avgScore: number };
    /** % of nearby rivals rated at or below this restaurant. */
    ratingPercentile: number;
    /** Total review volume across all nearby rivals — the size of the local market's voice. */
    totalReviewsInArea: number;
    /** Recent reviews at <=2 stars (0 when the key exposes no reviews). */
    estimatedNegativeReviews: number;
    /** Top ~20 nearby by threat — feeds the unlock AI and the cuisine mix. Stripped from locked responses. */
    nearbyTop: Array<{ name: string; rating: number; reviews: number; distanceKm: number; threatScore: number }>;
    /** Cuisine mix of the area, built from the AI's per-restaurant classification at unlock. */
    cuisineBreakdown: Array<{ cuisine: string; count: number; totalReviews: number; avgRating: number; top: string }> | null;
    /** Claude-written verdict + rival insights. null until unlock — the AI call
     *  runs once per scan, at unlock time, when the lead is captured. */
    aiInsights: GraderInsights | null;
    /** Low-review nearby listings — usually recent openings (our estimate). */
    likelyNew: Array<{ name: string; reviews: number; rating: number; distanceKm: number }>;
    rankedBelow: number;
    leaderboard: GraderRankRow[];
    searches: GraderSearchRow[];
    /** ₹/month the problems could be costing (same conservative model as the app). */
    estMonthlyLossInr: number;
    unlocked: boolean;
}

function compositeScore(rating: number, reviews: number): number {
    return (rating / 5) * 50 + Math.min(50, (Math.log10(Math.max(1, reviews)) / 4) * 50);
}

function gradeLabel(score: number): GraderResult['gradeLabel'] {
    if (score >= 85) return 'Excellent';
    if (score >= 65) return 'Good';
    if (score >= 45) return 'Fair';
    return 'Poor';
}

const getGraderScans = () => getDB().collection('grader_scans');
const getGraderLeads = () => getDB().collection('grader_leads');

export async function runGraderScan(name: string, city: string, placeId?: string): Promise<GraderResult | null> {
    // placeId comes from the autocomplete pick — exact listing, no text-search guessing.
    const base = await getBaseRestaurantDetails(name, city, placeId);
    if (!base) return null;
    const competitors = (await getNearbyRestaurants(base.location)).filter((c) => c.placeId !== base.placeId);
    const seo = await fetchWebsiteSEO(base.website, base.name, city);

    // Pillars — same math as the product; cuisine-specific nuances need Claude,
    // so the closest rival of ANY cuisine stands in for the same-cuisine one.
    const within = competitors.filter((c) => c.distanceKm <= 5);
    const rows = [
        { name: base.name, rating: base.rating, reviews: base.totalRatings, isYou: true },
        ...within.map((c) => ({ name: c.name, rating: c.rating, reviews: c.totalRatings, isYou: false })),
    ].sort((a, b) => compositeScore(b.rating, b.reviews) - compositeScore(a.rating, a.reviews));
    const rank = rows.findIndex((r) => r.isYou) + 1;
    const closest = [...within].sort((a, b) => a.distanceKm - b.distanceKm)[0];
    const reviewPercentile =
        within.length === 0 ? 100 : Math.round((within.filter((c) => c.totalRatings <= base.totalRatings).length / within.length) * 100);
    const areaAvgRating = within.length > 0 ? within.reduce((sum, c) => sum + c.rating, 0) / within.length : base.rating;
    const avgThreat = within.length > 0 ? Math.round(within.reduce((sum, c) => sum + c.threatScore, 0) / within.length) : 0;
    const threatByName = new Map(within.map((c) => [c.name, c.threatScore]));
    const ratingPercentile =
        within.length === 0 ? 100 : Math.round((within.filter((c) => c.rating <= base.rating).length / within.length) * 100);
    const totalReviewsInArea = within.reduce((sum, c) => sum + c.totalRatings, 0);
    const estimatedNegativeReviews = base.recentReviews.filter((r) => r.rating <= 2).length;
    const nearbyTop = [...within]
        .sort((a, b) => b.threatScore - a.threatScore)
        .slice(0, 20)
        .map((c) => ({ name: c.name, rating: c.rating, reviews: c.totalRatings, distanceKm: c.distanceKm, threatScore: c.threatScore }));

    const pillars = computePillars({
        base: {
            rating: base.rating,
            totalRatings: base.totalRatings,
            photoCount: base.photoCount,
            website: base.website,
            phone: base.phone,
            hasHours: base.hasHours,
            hasDescription: base.hasDescription,
            businessStatus: base.businessStatus,
            recentReviewCount: base.recentReviews.length,
            ownerRespondsToReviews: base.ownerRespondsToReviews,
        },
        seo: {
            hasWebsite: seo.hasWebsite,
            customDomain: seo.customDomain,
            hasH1: seo.hasH1,
            h1IncludesBrand: seo.h1IncludesBrand,
            hasMetaDescription: seo.hasMetaDescription,
        },
        competition: {
            rank,
            total: rows.length,
            leadsClosestSameCuisineRival: !closest || base.rating >= closest.rating,
            reviewPercentile,
        },
        areaAvgRating,
    });
    const score = restroScore(pillars);

    const problems: GraderProblem[] = pillars.flatMap((p) =>
        p.checks.filter((c) => !c.pass).map((c) => ({ label: c.label, note: c.note, pillar: p.key, grade: p.grade })),
    );

    // Search table — the same simulation idea as the product, honest label on the UI.
    const searchPool = (sort: (a: PlaceRow, b: PlaceRow) => number): GraderSearchRow['topResult'] => [...within].sort(sort)[0]?.name ?? base.name;
    const posIn = (sorted: Array<{ isYou: boolean }>) => {
        const i = sorted.findIndex((r) => r.isYou);
        return i >= 0 && i < 10 ? i + 1 : null;
    };
    const byComposite = rows;
    const byRating = [...rows].sort((a, b) => b.rating - a.rating || b.reviews - a.reviews);
    const byReviews = [...rows].sort((a, b) => b.reviews - a.reviews);
    const searches: GraderSearchRow[] = [
        { query: `Best restaurant in ${city}`, topResult: byComposite[0].name, yourPosition: posIn(byComposite) },
        { query: `Top rated restaurants in ${city}`, topResult: byRating[0].name, yourPosition: posIn(byRating) },
        { query: `Most popular restaurants near ${city}`, topResult: byReviews[0].name, yourPosition: posIn(byReviews) },
    ];

    // Conservative loss model — identical assumptions to the in-app revenue card.
    const guests = Math.max(400, Math.min(8000, base.totalRatings * 2));
    const estMonthlyLossInr = problems.length > 0 ? Math.round(guests * 0.09 * 400) : 0;

    const result: GraderResult = {
        scanId: randomUUID(),
        name: base.name,
        address: base.formattedAddress ?? '',
        city,
        score,
        gradeLabel: gradeLabel(score),
        rating: base.rating,
        reviews: base.totalRatings,
        photos: base.photoCount,
        photoName: base.photoName,
        location: base.location.lat === 0 && base.location.lng === 0 ? null : base.location,
        problems,
        pillars,
        rank,
        totalNearby: rows.length,
        areaAvgRating: Math.round(areaAvgRating * 10) / 10,
        reviewPercentile,
        closestRival: closest
            ? { name: closest.name, distanceKm: closest.distanceKm, rating: closest.rating }
            : null,
        threat: {
            overall: avgThreat >= 70 ? 'High' : avgThreat >= 45 ? 'Moderate' : 'Low',
            avgScore: avgThreat,
        },
        ratingPercentile,
        totalReviewsInArea,
        estimatedNegativeReviews,
        nearbyTop,
        cuisineBreakdown: null,
        aiInsights: null,
        likelyNew: within
            .filter((c) => c.totalRatings > 0 && c.totalRatings <= 100)
            .sort((a, b) => a.totalRatings - b.totalRatings)
            .slice(0, 5)
            .map((c) => ({ name: c.name, reviews: c.totalRatings, rating: c.rating, distanceKm: c.distanceKm })),
        rankedBelow: Math.max(0, rank - 1),
        leaderboard: rows.slice(0, 8).map((r, i) => {
            const beatsYou: string[] = [];
            if (!r.isYou) {
                if (r.rating >= base.rating + 0.1) beatsYou.push(`Higher rating (${r.rating.toFixed(1)} vs ${base.rating.toFixed(1)})`);
                if (r.reviews > base.totalRatings) beatsYou.push(`More reviews (${r.reviews.toLocaleString('en-IN')} vs ${base.totalRatings.toLocaleString('en-IN')})`);
            }
            const threatScore = threatByName.get(r.name);
            return {
                name: r.name,
                rating: r.rating,
                reviews: r.reviews,
                position: i + 1,
                isYou: r.isYou,
                beatsYou,
                ...(threatScore != null && !r.isYou ? { threatScore } : {}),
            };
        }),
        searches,
        estMonthlyLossInr,
        unlocked: false,
    };

    await getGraderScans().insertOne({ _id: result.scanId as never, ...result, createdAt: new Date() });
    return result;
}

export async function unlockGraderScan(
    scanId: string,
    promoCode: string,
    contact: { phone?: string; email?: string; name?: string },
): Promise<{ ok: true; result: GraderResult } | { ok: false; error: string }> {
    const codes = (process.env.GRADER_PROMO_CODES ?? 'RESTRO2026')
        .split(',')
        .map((c) => c.trim().toUpperCase())
        .filter(Boolean);
    if (!codes.includes(promoCode.trim().toUpperCase())) {
        return { ok: false, error: 'That promo code is not valid. Ask your RestroPulse contact for one.' };
    }
    const doc = await getGraderScans().findOne({ _id: scanId as never });
    if (!doc) return { ok: false, error: 'Scan not found — run it again.' };

    // The lead. This is the entire point of the page.
    await getGraderLeads().insertOne({
        scanId,
        restaurantName: (doc as { name?: string }).name,
        city: (doc as { city?: string }).city,
        promoCode: promoCode.trim().toUpperCase(),
        ...(contact.phone ? { phone: contact.phone } : {}),
        ...(contact.email ? { email: contact.email.toLowerCase() } : {}),
        ...(contact.name ? { contactName: contact.name } : {}),
        createdAt: new Date(),
    });
    await getGraderScans().updateOne({ _id: scanId as never }, { $set: { unlockedAt: new Date() } });

    // The AI layer runs exactly once per scan, at first unlock — a captured
    // lead is worth a Haiku call; anonymous scans never are. Failures degrade
    // to the Places-only report rather than blocking the unlock.
    const scan = doc as unknown as GraderResult;
    let aiInsights: GraderInsights | null = scan.aiInsights ?? null;
    if (!aiInsights) {
        try {
            aiInsights = await generateGraderInsights({
                name: scan.name,
                city: scan.city,
                rating: scan.rating,
                reviews: scan.reviews,
                rank: scan.rank ?? 0,
                totalNearby: scan.totalNearby ?? 0,
                areaAvgRating: scan.areaAvgRating ?? scan.rating,
                estMonthlyLossInr: scan.estMonthlyLossInr,
                problems: (scan.problems ?? []).map((p) => ({ label: p.label, note: p.note })),
                rivals: (scan.leaderboard ?? [])
                    .filter((r) => !r.isYou)
                    .slice(0, 5)
                    .map((r) => ({
                        name: r.name,
                        rating: r.rating,
                        reviews: r.reviews,
                        ...(r.threatScore != null ? { threatScore: r.threatScore } : {}),
                    })),
                nearby: (scan.nearbyTop ?? []).map((n) => ({
                    name: n.name,
                    rating: n.rating,
                    reviews: n.reviews,
                    distanceKm: n.distanceKm,
                })),
            });
            await getGraderScans().updateOne({ _id: scanId as never }, { $set: { aiInsights } });
        } catch {
            aiInsights = null; // report still unlocks, Places-only
        }
    }

    // Cuisine mix: group the nearby field by the AI's classification.
    let cuisineBreakdown: GraderResult['cuisineBreakdown'] = scan.cuisineBreakdown ?? null;
    if (!cuisineBreakdown && aiInsights && Object.keys(aiInsights.cuisineOf ?? {}).length > 0) {
        const agg = new Map<string, { cuisine: string; count: number; totalReviews: number; ratingSum: number; top: string; topRating: number }>();
        for (const n of scan.nearbyTop ?? []) {
            const cuisine = aiInsights.cuisineOf[n.name];
            if (!cuisine) continue;
            const entry = agg.get(cuisine) ?? { cuisine, count: 0, totalReviews: 0, ratingSum: 0, top: n.name, topRating: n.rating };
            entry.count += 1;
            entry.totalReviews += n.reviews;
            entry.ratingSum += n.rating;
            if (n.rating > entry.topRating) {
                entry.top = n.name;
                entry.topRating = n.rating;
            }
            agg.set(cuisine, entry);
        }
        cuisineBreakdown = [...agg.values()]
            .sort((a, b) => b.totalReviews - a.totalReviews)
            .slice(0, 8)
            .map((e) => ({
                cuisine: e.cuisine,
                count: e.count,
                totalReviews: e.totalReviews,
                avgRating: Math.round((e.ratingSum / e.count) * 10) / 10,
                top: e.top,
            }));
        await getGraderScans().updateOne({ _id: scanId as never }, { $set: { cuisineBreakdown } });
    }

    const { _id, createdAt, unlockedAt, ...rest } = doc as Record<string, unknown>;
    return { ok: true, result: { ...(rest as unknown as GraderResult), scanId, unlocked: true, aiInsights, cuisineBreakdown } };
}
