import React, { useEffect, useMemo, useState } from 'react';
import { REVIEW_THEMES, type ReviewTheme } from '@restropulse/shared';
import { intelligenceAPI, type FeedbackDay, type FeedbackReview } from '../../../../api';
import type { PeriodQuery } from '../period';
import type { DeepLinkTarget } from '../deep-links';
import { ProvenanceChip } from '../provenance';
import { track } from '../track';

/**
 * FeedbackChanges (Brief 09 §2) — the self-only "what changed" feed. Day-grouped
 * new-review cards with source chips and theme hashtag chips (clicking a chip
 * filters the feed). A theme trending negative over the last 7 days raises a
 * `border-danger` alert card. "Rating changed" rows carry a cause hint, and each
 * review has a "Reply now" deep link into the Get-started task.
 */

const Card: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
    <div className={`bg-surface rounded-2xl p-4 sm:p-6 border border-line ${className}`}>{children}</div>
);

const Stars: React.FC<{ n: number }> = ({ n }) => (
    <span className="text-warning text-xs tabular-nums" aria-label={`${n} stars`}>
        {'★'.repeat(Math.round(n))}
        <span className="text-line">{'★'.repeat(Math.max(0, 5 - Math.round(n)))}</span>
    </span>
);

const SourceChip: React.FC<{ source: FeedbackReview['source'] }> = ({ source }) => (
    <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-primary-soft text-primary-strong">
        {source}
    </span>
);

/**
 * One review + "Draft a reply". The reply is drafted by Claude (draft-only, the
 * owner copies it to Google), which is the one-tap follow-through for the
 * "negative review" nudge. Once Google Business Profile connect exists this
 * becomes "post reply".
 */
export const ReviewCard: React.FC<{ review: FeedbackReview }> = ({ review: r }) => {
    const [state, setState] = useState<{ status: 'idle' | 'loading' | 'ready' | 'error'; reply?: string; stance?: string; error?: string }>({ status: 'idle' });
    const [copied, setCopied] = useState(false);

    const draft = async () => {
        setState({ status: 'loading' });
        try {
            const out = await intelligenceAPI.draftReply({ text: r.text, rating: r.rating, ...(r.author ? { author: r.author } : {}) });
            setState({ status: 'ready', reply: out.reply, stance: out.stance });
            track.replyDrafted({ rating: r.rating, stance: out.stance, ok: true });
        } catch (e) {
            setState({ status: 'error', error: e instanceof Error ? e.message : 'Could not draft a reply right now.' });
            track.replyDrafted({ rating: r.rating, ok: false });
        }
    };
    const copy = async () => {
        if (!state.reply) return;
        try {
            await navigator.clipboard.writeText(state.reply);
            setCopied(true);
            track.replyCopied({ rating: r.rating });
            setTimeout(() => setCopied(false), 1500);
        } catch {
            /* clipboard blocked — the textarea is selectable */
        }
    };

    return (
        <div className="rounded-xl border border-line p-4 bg-surface" data-testid="review-card">
            <div className="flex items-center gap-2 flex-wrap">
                <Stars n={r.rating} />
                <SourceChip source={r.source} />
                {(r.themes ?? []).map((t) => (
                    <span key={t} className="text-[10px] text-muted">#{t}</span>
                ))}
                {state.status !== 'ready' && (
                    <button
                        type="button"
                        onClick={draft}
                        disabled={state.status === 'loading'}
                        className="ml-auto text-xs font-semibold text-primary-strong hover:underline disabled:opacity-60"
                    >
                        {state.status === 'loading' ? 'Drafting…' : r.rating <= 2 ? 'Draft a reply →' : 'Draft a thank-you →'}
                    </button>
                )}
            </div>
            <p className="text-sm text-ink mt-2 leading-relaxed">{r.text}</p>

            {state.status === 'error' && <p className="text-xs text-danger mt-2">{state.error}</p>}

            {state.status === 'ready' && state.reply && (
                <div className="mt-3 rounded-xl bg-canvas p-3" data-testid="reply-draft">
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                            Suggested reply{state.stance ? ` · ${state.stance}` : ''}
                        </p>
                        <ProvenanceChip provenance="ai-inferred" />
                    </div>
                    <textarea
                        className="w-full rounded-lg border border-line bg-surface p-2.5 text-sm text-ink leading-relaxed"
                        rows={4}
                        value={state.reply}
                        onChange={(e) => setState((s) => ({ ...s, reply: e.target.value }))}
                        aria-label="Suggested reply — edit before you post it"
                    />
                    <div className="flex items-center gap-3 mt-2 flex-wrap">
                        <button type="button" onClick={copy} className="rounded-lg bg-primary-strong text-white px-3 py-1.5 text-xs font-semibold hover:opacity-90">
                            {copied ? 'Copied' : 'Copy reply'}
                        </button>
                        <button type="button" onClick={draft} className="text-xs font-semibold text-primary-strong hover:underline">
                            Try another
                        </button>
                        <span className="text-[11px] text-muted">Edit it so it sounds like you, then paste it on Google.</span>
                    </div>
                </div>
            )}
        </div>
    );
};

const NEGATIVE_WINDOW_DAYS = 7;

/** Themes trending negative (≥2 low-star mentions) in the trailing 7 days. */
export function negativeTrendingThemes(days: FeedbackDay[]): ReviewTheme[] {
    const recent = [...days].sort((a, b) => b.date.localeCompare(a.date)).slice(0, NEGATIVE_WINDOW_DAYS);
    const counts = new Map<ReviewTheme, number>();
    for (const d of recent) {
        for (const r of d.newReviews) {
            if (r.rating > 2) continue;
            for (const t of r.themes ?? []) counts.set(t, (counts.get(t) ?? 0) + 1);
        }
    }
    return [...counts.entries()].filter(([, c]) => c >= 2).sort((a, b) => b[1] - a[1]).map(([t]) => t);
}

export const FeedbackChangesView: React.FC<{
    days: FeedbackDay[];
    onNavigate: (t: DeepLinkTarget) => void;
}> = ({ days, onNavigate }) => {
    const [activeTheme, setActiveTheme] = useState<ReviewTheme | null>(null);

    const sortedDays = useMemo(() => [...days].sort((a, b) => b.date.localeCompare(a.date)), [days]);

    // Which themes appear anywhere in the feed (drives the chip row).
    const presentThemes = useMemo(() => {
        const set = new Set<ReviewTheme>();
        for (const d of days) for (const r of d.newReviews) for (const t of r.themes ?? []) set.add(t);
        return REVIEW_THEMES.filter((t) => set.has(t));
    }, [days]);

    const negatives = useMemo(() => negativeTrendingThemes(days), [days]);

    const filtered = (reviews: FeedbackReview[]) =>
        activeTheme ? reviews.filter((r) => (r.themes ?? []).includes(activeTheme)) : reviews;

    return (
        <div className="space-y-4 sm:space-y-6">
            {/* Negative-trend alert */}
            {negatives.length > 0 && (
                <div className="bg-surface rounded-2xl p-5 border border-line border-l-[3px] border-l-danger" data-testid="negative-trend-alert">
                    <h3 className="text-sm font-semibold text-danger">Reviews are turning negative</h3>
                    <p className="text-sm text-muted mt-1">
                        {negatives.map((t) => `#${t}`).join(', ')} mentioned in multiple low-star reviews this week. Reply and address it before it drags your rating.
                    </p>
                    <p className="mt-2 text-xs text-muted">Use “Draft a reply” on the low-star reviews below — replying quickly is what turns this around.</p>
                </div>
            )}

            {/* Theme filter chips */}
            <Card>
                <div className="flex items-center justify-between gap-2 mb-3">
                    <h3 className="text-base font-semibold text-ink">What guests are talking about</h3>
                    <ProvenanceChip provenance="ai-inferred" />
                </div>
                <div className="flex flex-wrap gap-2">
                    {presentThemes.map((t) => {
                        const active = activeTheme === t;
                        return (
                            <button
                                key={t}
                                type="button"
                                aria-pressed={active}
                                onClick={() => setActiveTheme(active ? null : t)}
                                className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                                    active ? 'bg-primary text-white border-primary' : 'border-line text-ink hover:bg-primary-soft'
                                }`}
                            >
                                #{t}
                            </button>
                        );
                    })}
                    {activeTheme && (
                        <button type="button" onClick={() => setActiveTheme(null)} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-muted hover:text-ink">
                            Clear
                        </button>
                    )}
                </div>
            </Card>

            {/* Day-grouped feed */}
            {sortedDays.map((day) => {
                const reviews = filtered(day.newReviews);
                const ratingDropped = day.ratingBefore !== null && day.ratingAfter < day.ratingBefore;
                if (reviews.length === 0 && !(ratingDropped && !activeTheme)) return null;
                return (
                    <div key={day.date} className="space-y-3">
                        <div className="flex items-center gap-3">
                            <h4 className="text-sm font-semibold text-ink">{day.date}</h4>
                            {ratingDropped && (
                                <span className="text-xs text-danger font-semibold">
                                    Rating {day.ratingBefore?.toFixed(1)} → {day.ratingAfter.toFixed(1)}
                                    {day.themesTrending.length > 0 && (
                                        <span className="text-muted font-normal"> · {day.newReviews.filter((r) => r.rating <= 2).length} new low-star mentioning #{day.themesTrending[0]}</span>
                                    )}
                                </span>
                            )}
                        </div>
                        {reviews.map((r, i) => (
                            <ReviewCard key={`${day.date}-${i}`} review={r} />
                        ))}
                    </div>
                );
            })}
        </div>
    );
};

/** Container: fetches the self feedback feed for the current window. */
const FeedbackChanges: React.FC<{ query: PeriodQuery; onNavigate: (t: DeepLinkTarget) => void }> = ({ query, onNavigate }) => {
    const [days, setDays] = useState<FeedbackDay[] | null>(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setDays(null);
            try {
                const res = await intelligenceAPI.getFeedbackChanges({ from: query.from, to: query.to });
                if (!cancelled) setDays(res.days);
            } catch {
                if (!cancelled) setDays([]);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [query.from, query.to]);

    if (days === null) return <p className="text-sm text-muted">Loading recent reviews…</p>;
    if (days.length === 0) return <p className="text-sm text-muted">No new reviews in this period.</p>;
    return <FeedbackChangesView days={days} onNavigate={onNavigate} />;
};

export default FeedbackChanges;
