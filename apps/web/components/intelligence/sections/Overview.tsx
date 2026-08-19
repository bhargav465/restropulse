import React, { useState } from 'react';
import type { IntelligenceReport, ActionPlanItem } from '@restropulse/shared';
import { resolveDeepLink, type DeepLinkTarget } from './deep-links';

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

const ActionPlanCard: React.FC<{ item: ActionPlanItem; onNavigate: (t: DeepLinkTarget) => void }> = ({ item, onNavigate }) => {
    const target = resolveDeepLink(item.deepLink);
    return (
        <div className="rounded-xl border border-line p-4 flex flex-col gap-2 bg-surface">
            <div className="flex items-start gap-3">
                <span className="shrink-0 w-6 h-6 rounded-full bg-primary-strong text-white text-xs font-bold flex items-center justify-center">
                    {item.priority}
                </span>
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-ink">{item.action}</p>
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
    const [verdictOpen, setVerdictOpen] = useState(false);
    // Mobile collapsible verbose sections (always fully shown on sm+).
    const [headlineOpen, setHeadlineOpen] = useState(false); // collapsed by default on mobile
    const [actionOpen, setActionOpen] = useState(true);      // expanded by default (core value)

    return (
        <div className="space-y-6">
            {/* Narrative + key findings — collapsible on mobile (collapsed by default). */}
            <Card>
                <button
                    type="button"
                    onClick={() => setHeadlineOpen((o) => !o)}
                    aria-expanded={headlineOpen}
                    className="w-full flex items-center justify-between gap-3 text-left sm:pointer-events-none"
                >
                    <h3 className="text-base font-semibold text-ink">The headline</h3>
                    <Chevron open={headlineOpen} />
                </button>
                <div className={headlineOpen ? 'block' : 'hidden sm:block'}>
                    <p className="text-sm text-muted mt-2 leading-relaxed">{narrative.overview}</p>
                    <div className="mt-4 border-t border-line pt-4">
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
                </div>
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
                <div className={`${actionOpen ? 'grid' : 'hidden sm:grid'} gap-3 mt-4 sm:mt-0`}>
                    {narrative.actionPlan.map((item) => (
                        <ActionPlanCard key={item.priority} item={item} onNavigate={onNavigate} />
                    ))}
                </div>
            </Card>

            {/* Threats vs opportunities -- also surfaced in the Competition bucket; hidden on mobile. */}
            <div className="hidden sm:grid md:grid-cols-2 gap-4">
                <div className="bg-surface rounded-2xl p-6 border border-line border-l-[3px] border-l-danger">
                    <h3 className="text-sm font-semibold text-ink">Watch out for</h3>
                    <p className="text-sm text-muted mt-2 leading-relaxed">{narrative.immediateThreats}</p>
                </div>
                <div className="bg-surface rounded-2xl p-6 border border-line border-l-[3px] border-l-success">
                    <h3 className="text-sm font-semibold text-ink">Where you can win</h3>
                    <p className="text-sm text-muted mt-2 leading-relaxed">{narrative.growthOpportunities}</p>
                </div>
            </div>

            {/* 90-day verdict — collapsible prose */}
            <Card>
                <button
                    type="button"
                    onClick={() => setVerdictOpen((v) => !v)}
                    aria-expanded={verdictOpen}
                    className="w-full flex items-center justify-between gap-3 text-left"
                >
                    <h3 className="text-base font-semibold text-ink">The next 90 days</h3>
                    <span className={`text-muted transition-transform ${verdictOpen ? 'rotate-180' : ''}`} aria-hidden="true">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M6 9l6 6 6-6" />
                        </svg>
                    </span>
                </button>
                {verdictOpen && <p className="text-sm text-muted mt-3 leading-relaxed">{narrative.verdict}</p>}
            </Card>
        </div>
    );
};

export default Overview;
