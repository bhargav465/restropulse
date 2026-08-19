import React, { useEffect, useMemo, useState } from 'react';
import type { CompareRow, MetricGap, CompetitorProfile, IntelligenceReport } from '@restropulse/shared';
import { intelligenceAPI } from '../../../../api';
import { compareParamsFor, type PeriodQuery } from '../period';
import { ThreatRadar } from '../ThreatRadar';
import { ProvenanceChip } from '../provenance';
import { resolveDeepLink, type DeepLinkTarget } from '../deep-links';

/**
 * WhereTheyBeatYou (Brief 09 §3) — one card per competitor with a non-empty
 * `beatsYou`. Deterministic `computed` gaps first (rating, review velocity,
 * response rate, photos), then the v1 `ai-inferred` whatTheyDoBetter/whereYouWin
 * lists. Cards are sorted by summed gap severity; each ends with a "Close this
 * gap →" deep link chosen by the top gap's type. ThreatRadar sits on top.
 */

/** Normalized per-gap severity so heterogeneous metrics sort sensibly. */
export function gapSeverity(gap: MetricGap): number {
    switch (gap.metric) {
        case 'rating':
            return gap.gap * 10;
        case 'reviewVelocity':
            return gap.gap * 2;
        case 'responseRate':
            return gap.gap * 0.2;
        case 'photoCount':
            return gap.gap * 0.05;
        default:
            return gap.gap;
    }
}

export function rowSeverity(row: CompareRow): number {
    return row.beatsYou.reduce((s, g) => s + gapSeverity(g), 0);
}

/** Deep-link bucket for the highest-severity gap type. */
function closeGapTarget(gaps: MetricGap[]): DeepLinkTarget {
    const top = [...gaps].sort((a, b) => gapSeverity(b) - gapSeverity(a))[0];
    switch (top?.metric) {
        case 'photoCount':
            return resolveDeepLink({ bucket: 'content', params: { brief: 'fresh-photos' } });
        case 'reviewVelocity':
            return resolveDeepLink({ bucket: 'campaigns', params: { goal: 'reviews' } });
        case 'rating':
        case 'responseRate':
        default:
            return resolveDeepLink({ bucket: 'get-started', params: { task: 'review-replies' } });
    }
}

const GAP_LABEL: Record<MetricGap['metric'], (g: MetricGap) => string> = {
    rating: (g) => `+${g.gap.toFixed(1)} rating (${g.source})`,
    reviewVelocity: (g) => `${(g.theirs / (g.yours || 1)).toFixed(1)}× more new reviews (${g.source})`,
    responseRate: (g) => `replies to ${g.theirs}% of reviews vs your ${g.yours}% (${g.source})`,
    photoCount: (g) => `+${g.gap} photos (${g.source})`,
};

const AiList: React.FC<{ title: string; items?: string[]; tone: 'good' | 'bad' }> = ({ title, items, tone }) => {
    if (!items || items.length === 0) return null;
    return (
        <div>
            <p className={`text-xs font-semibold uppercase tracking-wider mb-1 ${tone === 'good' ? 'text-success' : 'text-danger'}`}>{title}</p>
            <ul className="space-y-1">
                {items.map((it, i) => (
                    <li key={i} className="text-xs text-muted leading-relaxed">• {it}</li>
                ))}
            </ul>
        </div>
    );
};

/**
 * Day-0 rows built from the scan report itself (RP-004).
 *
 * The daily-check layer that normally feeds this tab is empty until the worker's
 * first nightly run, which used to make the tab say "no competitor is beating
 * you" on the very day the report said three of them were. The report already
 * carries today's rating and photo count for you and every nearby rival, so we
 * derive the same gap rows from it and label them as coming from the scan.
 * Review velocity / reply rate need history, so they only appear once the daily
 * checks exist.
 */
export function rowsFromReport(report: IntelligenceReport): CompareRow[] {
    const pool = report.buckets?.overallTop10 ?? report.topCompetitors ?? [];
    const yoursRating = report.base.rating;
    const yoursPhotos = report.base.photoCount;
    return pool.map((c) => {
        const beatsYou: MetricGap[] = [];
        if (c.rating - yoursRating >= 0.1) {
            beatsYou.push({ metric: 'rating', source: 'google', yours: yoursRating, theirs: c.rating, gap: Number((c.rating - yoursRating).toFixed(1)) });
        }
        if (c.photoCount > yoursPhotos) {
            beatsYou.push({ metric: 'photoCount', source: 'google', yours: yoursPhotos, theirs: c.photoCount, gap: c.photoCount - yoursPhotos });
        }
        return {
            placeId: c.placeId,
            name: c.name,
            isSelf: false,
            google: { rating: c.rating, reviewCount: c.totalRatings, newReviews: 0, photoCount: c.photoCount },
            beatsYou,
        };
    });
}

export const WhereTheyBeatYouView: React.FC<{
    rows: CompareRow[];
    profilesByName: Record<string, CompetitorProfile>;
    radar?: { base: { lat: number; lng: number; name: string }; competitors: CompetitorProfile[] };
    onNavigate: (t: DeepLinkTarget) => void;
    /** 'daily' = from the nightly checks for this period; 'scan' = seeded from the latest report (day 0). */
    source?: 'daily' | 'scan';
}> = ({ rows, profilesByName, radar, onNavigate, source = 'daily' }) => {
    const cards = rows
        .filter((r) => !r.isSelf && r.beatsYou.length > 0)
        .sort((a, b) => rowSeverity(b) - rowSeverity(a));

    if (cards.length === 0) {
        // Two different truths that used to share one sentence: "we have data and
        // nobody is ahead" vs "we have no data for this period yet".
        if (rows.length === 0) {
            return (
                <div className="bg-surface rounded-2xl p-4 sm:p-6 border border-line" data-testid="wtby-no-data">
                    <p className="text-sm font-semibold text-ink">Nothing recorded for this period yet</p>
                    <p className="text-sm text-muted mt-1">
                        Every night we note the rating, reviews and photos of you and the rivals you track. Comparisons for this
                        period will appear once those checks exist — try “Overall”, or check back tomorrow.
                    </p>
                </div>
            );
        }
        return (
            <p className="text-sm text-muted" data-testid="wtby-no-gaps">
                None of these restaurants is ahead of you on rating, reviews, replies or photos right now. Keep it up.
            </p>
        );
    }

    return (
        <div className="space-y-4 sm:space-y-6">
            {source === 'scan' && (
                <p className="text-xs text-muted" data-testid="wtby-from-scan">
                    From your latest scan. Day-by-day comparisons — including who is gaining reviews faster and who replies more —
                    start after tonight’s first check.
                </p>
            )}
            {/* Threat radar: hidden on mobile (visual-only; the gap cards below carry
                the same comparison as text). */}
            {radar && (
                <div className="hidden sm:flex bg-surface rounded-2xl p-4 sm:p-6 border border-line flex-col items-center">
                    <h3 className="text-base font-semibold text-ink self-start">Who’s closest on your heels</h3>
                    <p className="text-xs text-muted self-start mb-2">Closer to the centre = a stronger rival.</p>
                    <ThreatRadar base={radar.base} competitors={radar.competitors} />
                </div>
            )}

            {cards.map((row) => {
                const profile = profilesByName[row.name];
                const target = closeGapTarget(row.beatsYou);
                return (
                    <div key={row.placeId} className="bg-surface rounded-2xl p-4 sm:p-6 border border-line">
                        <div className="flex items-center justify-between gap-2 mb-3">
                            <h3 className="text-base font-semibold text-ink">{row.name}</h3>
                            <ProvenanceChip provenance="computed" />
                        </div>
                        {/* Deterministic gaps */}
                        <div className="flex flex-wrap gap-2 mb-4">
                            {row.beatsYou.map((g, i) => (
                                <span key={i} className="inline-flex items-center px-3 py-1.5 rounded-lg border border-line bg-canvas text-xs font-medium text-ink">
                                    {GAP_LABEL[g.metric](g)}
                                </span>
                            ))}
                        </div>
                        {/* v1 ai-inferred lists */}
                        {profile && (profile.whatTheyDoBetter || profile.whereYouWin) && (
                            <div className="grid sm:grid-cols-2 gap-4 rounded-xl bg-canvas p-4 mb-4">
                                <AiList title="What they do better" items={profile.whatTheyDoBetter} tone="bad" />
                                <AiList title="Where you win" items={profile.whereYouWin} tone="good" />
                                <div className="sm:col-span-2">
                                    <ProvenanceChip provenance="ai-inferred" />
                                </div>
                            </div>
                        )}
                        <button
                            type="button"
                            onClick={() => onNavigate(target)}
                            title={target.href}
                            className="text-xs font-semibold text-primary-strong hover:underline"
                        >
                            Close this gap →
                        </button>
                    </div>
                );
            })}
        </div>
    );
};

/** Container: fetches compare rows for the period and joins the v1 report layer. */
const WhereTheyBeatYou: React.FC<{
    query: PeriodQuery;
    report: IntelligenceReport | null;
    onNavigate: (t: DeepLinkTarget) => void;
}> = ({ query, report, onNavigate }) => {
    const [rows, setRows] = useState<CompareRow[] | null>(null);
    const params = useMemo(() => compareParamsFor(query), [query.from, query.to, query.granularity]);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setRows(null);
            try {
                const data = await intelligenceAPI.getCompare(params);
                if (!cancelled) setRows(data);
            } catch {
                if (!cancelled) setRows([]);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [params.granularity, (params as { date?: string }).date, (params as { month?: string }).month]);

    if (rows === null) return <p className="text-sm text-muted">Loading where they beat you…</p>;

    const profilesByName = report ? Object.fromEntries(report.competitors.map((c) => [c.name, c])) : {};
    const radar = report
        ? { base: { lat: report.base.location.lat, lng: report.base.location.lng, name: report.base.name }, competitors: report.topCompetitors }
        : undefined;

    // The daily layer has nothing usable for this period (no rows, or rows with no
    // Google data — the self row alone is common on day 0): seed from the report.
    const dailyHasData = rows.some((r) => !r.isSelf && (r.google || r.zomato));
    if (!dailyHasData && report) {
        return (
            <WhereTheyBeatYouView rows={rowsFromReport(report)} profilesByName={profilesByName} radar={radar} onNavigate={onNavigate} source="scan" />
        );
    }
    return <WhereTheyBeatYouView rows={rows} profilesByName={profilesByName} radar={radar} onNavigate={onNavigate} />;
};

export default WhereTheyBeatYou;
