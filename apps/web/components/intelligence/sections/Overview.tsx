import React, { useEffect, useState } from 'react';
import type { IntelligenceReport, ActionPlanItem } from '@restropulse/shared';
import { intelligenceAPI } from '../../../api';
import { resolveDeepLink, type DeepLinkTarget } from './deep-links';
import { track } from './track';

/**
 * Overview sub-tab (DESIGN §4.1) — the money screen. Narrative + key findings,
 * the prioritized action plan with "Act on this →" deep links, immediate
 * threats vs growth opportunities, and the collapsible 90-day verdict.
 */

const IMPACT_CLASS: Record<ActionPlanItem['impact'], string> = {
    High: 'text-primary-strong',
    Medium: 'text-info',
    Low: 'text-muted',
};

const Card: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
    <div className={`bg-surface rounded-2xl p-6 border border-line ${className}`}>{children}</div>
);

const ActionPlanCard: React.FC<{
    item: ActionPlanItem;
    onNavigate: (t: DeepLinkTarget) => void;
    done: boolean;
    onToggle: (priority: number, done: boolean) => void;
}> = ({ item, onNavigate, done, onToggle }) => {
    // Carry the rank so the shell's CTA event knows which action was tapped.
    const target = resolveDeepLink(item.deepLink ? { ...item.deepLink, params: { ...(item.deepLink.params ?? {}), rank: String(item.priority) } } : undefined);
    return (
        <div className={`rounded-xl border border-line p-4 flex flex-col gap-2 bg-surface ${done ? 'opacity-70' : ''}`} data-testid={`action-${item.priority}`}>
            <div className="flex items-start gap-3">
                <label className="shrink-0 flex items-center cursor-pointer" title={done ? 'Mark as not done' : 'Mark as done'}>
                    <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={done}
                        onChange={(e) => onToggle(item.priority, e.target.checked)}
                        aria-label={`Done: ${item.action}`}
                    />
                    <span
                        className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center border transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-primary ${
                            done ? 'bg-success border-success text-white' : 'bg-primary-strong border-primary-strong text-white'
                        }`}
                        aria-hidden="true"
                    >
                        {done ? '✓' : item.priority}
                    </span>
                </label>
                <div className="min-w-0 flex-1">
                    <p className={`text-sm font-semibold text-ink ${done ? 'line-through decoration-muted' : ''}`}>{item.action}</p>
                    <p className="text-xs text-muted mt-1 leading-relaxed">{item.detail}</p>
                </div>
            </div>
            <div className="flex items-center justify-between gap-3 flex-wrap pl-9">
                <div className="flex items-center gap-3 text-xs">
                    <span className={`font-semibold ${IMPACT_CLASS[item.impact]}`}>{item.impact} impact</span>
                    <span className="text-muted">{item.timeframe}</span>
                </div>
                <button
                    type="button"
                    onClick={() => onNavigate(target)}
                    title={target.href}
                    className="text-xs font-semibold text-primary-strong hover:underline whitespace-nowrap"
                >
                    {target.cta} →
                </button>
            </div>
        </div>
    );
};

/** Chevron shown only on mobile (sm:hidden) for the collapsible section headers. */
const Chevron: React.FC<{ open: boolean }> = ({ open }) => (
    <span className={`sm:hidden text-muted transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 9l6 6 6-6" />
        </svg>
    </span>
);

const Overview: React.FC<{ report: IntelligenceReport; onNavigate: (t: DeepLinkTarget) => void }> = ({ report, onNavigate }) => {
    const { narrative } = report;

    // Action-plan progress — the commitment loop. Ticking items is the reason to
    // come back: the next report shows whether it moved the score.
    const [done, setDone] = useState<number[]>([]);
    const [lastTime, setLastTime] = useState<{ done: number; total: number } | null>(null);
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const cur = await intelligenceAPI.getActionProgress(report._id);
                if (!cancelled) setDone(cur.done);
            } catch { /* optional */ }
            try {
                const summaries = await intelligenceAPI.getReports();
                const prev = summaries.find((s) => s.id !== report._id);
                if (prev) {
                    const p = await intelligenceAPI.getActionProgress(prev.id);
                    if (!cancelled && p.done.length > 0) setLastTime({ done: p.done.length, total: narrative.actionPlan.length || 5 });
                }
            } catch { /* optional */ }
        })();
        return () => { cancelled = true; };
    }, [report._id, narrative.actionPlan.length]);
    const toggle = (priority: number, isDone: boolean) => {
        const next = isDone ? [...new Set([...done, priority])].sort((a, b) => a - b) : done.filter((p) => p !== priority);
        setDone(next);
        track.actionMarkedDone({ reportId: report._id, rank: priority, done: isDone, doneCount: next.length, total: narrative.actionPlan.length });
        intelligenceAPI.putActionProgress(report._id, next).catch(() => undefined);
    };
    // "Full report" — findings, threats/opportunities and the 90-day verdict live
    // behind one disclosure. Owners react to one thing; the rest is there when
    // they want it. Collapsed by default on every size.
    const [fullOpen, setFullOpen] = useState(false);
    const total = narrative.actionPlan.length;
    const doneCount = narrative.actionPlan.filter((a) => done.includes(a.priority)).length;
    // Mobile collapsible verbose sections (always fully shown on sm+).
    const [actionOpen, setActionOpen] = useState(true);      // expanded by default (core value)

    return (
        <div className="space-y-6">
            {/* The headline — one paragraph, always visible. Findings live in "Full report". */}
            <Card>
                <h3 className="text-base font-semibold text-ink">The headline</h3>
                <p className="text-sm text-muted mt-2 leading-relaxed">{narrative.overview}</p>
            </Card>

            {/* Action plan — collapsible on mobile (expanded by default; it's the core CTA). */}
            <Card>
                <button
                    type="button"
                    onClick={() => setActionOpen((o) => !o)}
                    aria-expanded={actionOpen}
                    className="w-full flex items-center justify-between gap-3 text-left sm:pointer-events-none mb-0 sm:mb-4"
                >
                    <h3 className="text-base font-semibold text-ink">Your action plan</h3>
                    <span className="hidden sm:inline text-xs text-muted">Most important first · do it inside RestroPulse</span>
                    <Chevron open={actionOpen} />
                </button>
                {/* Progress — visible on all sizes; the reason to tick things off. */}
                {total > 0 && (
                    <div className="mt-2 sm:mt-0 sm:mb-4 flex items-center gap-3" data-testid="action-progress">
                        <div className="h-1.5 flex-1 rounded-full bg-canvas overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={doneCount} aria-label="Action plan progress">
                            <div className="h-full bg-success transition-all" style={{ width: `${(doneCount / total) * 100}%` }} />
                        </div>
                        <span className="text-xs font-semibold text-ink tabular-nums whitespace-nowrap">
                            {doneCount === total ? 'All done — your next report will show what moved' : `${doneCount} of ${total} done`}
                        </span>
                    </div>
                )}
                {lastTime && (
                    <p className="text-xs text-muted mb-3" data-testid="action-last-time">
                        Last report you completed {lastTime.done} of {lastTime.total} actions.
                    </p>
                )}
                <div className={`${actionOpen ? 'grid' : 'hidden sm:grid'} gap-3 mt-4 sm:mt-0`}>
                    {narrative.actionPlan.map((item) => (
                        <ActionPlanCard
                            key={item.priority}
                            item={item}
                            onNavigate={onNavigate}
                            done={done.includes(item.priority)}
                            onToggle={toggle}
                        />
                    ))}
                </div>
            </Card>

            {/* Full report — findings, threats/opportunities, 90-day verdict. One
                disclosure, collapsed by default: owners react to one thing. */}
            <Card>
                <button
                    type="button"
                    onClick={() => setFullOpen((v) => !v)}
                    aria-expanded={fullOpen}
                    className="w-full flex items-center justify-between gap-3 text-left"
                    data-testid="full-report-toggle"
                >
                    <div>
                        <h3 className="text-base font-semibold text-ink">Full report</h3>
                        <p className="text-xs text-muted mt-0.5">Key findings · what to watch out for · where you can win · the next 90 days</p>
                    </div>
                    <span className={`text-muted transition-transform ${fullOpen ? 'rotate-180' : ''}`} aria-hidden="true">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M6 9l6 6 6-6" />
                        </svg>
                    </span>
                </button>
                {fullOpen && (
                    <div className="mt-4 space-y-5" data-testid="full-report">
                        <div>
                            <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">Key findings</p>
                            <ul className="space-y-2">
                                {narrative.keyFindings.map((f, i) => (
                                    <li key={i} className="flex items-start gap-2.5 text-sm text-ink">
                                        <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-primary shrink-0" aria-hidden="true" />
                                        <span className="leading-relaxed">{f}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                        <div className="grid md:grid-cols-2 gap-4">
                            <div className="rounded-xl bg-canvas p-4 border-l-[3px] border-l-danger">
                                <h4 className="text-sm font-semibold text-ink">Watch out for</h4>
                                <p className="text-sm text-muted mt-2 leading-relaxed">{narrative.immediateThreats}</p>
                            </div>
                            <div className="rounded-xl bg-canvas p-4 border-l-[3px] border-l-success">
                                <h4 className="text-sm font-semibold text-ink">Where you can win</h4>
                                <p className="text-sm text-muted mt-2 leading-relaxed">{narrative.growthOpportunities}</p>
                            </div>
                        </div>
                        <div>
                            <h4 className="text-sm font-semibold text-ink">The next 90 days</h4>
                            <p className="text-sm text-muted mt-2 leading-relaxed">{narrative.verdict}</p>
                        </div>
                    </div>
                )}
            </Card>
        </div>
    );
};

export default Overview;
