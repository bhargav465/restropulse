import React, { useEffect, useRef, useState } from 'react';
import { ScoreDial } from './intelligence/sections/primitives';
import { getApiUrl } from './../utils/env';
import { track } from './intelligence/sections/track';

/**
 * Public restaurant grader — the lead-generation page (?view=grader).
 * No login. Flow: name + city → staged scan animation → score + teaser report
 * with the competition sections blurred → unlock with a promo code, which is
 * where the lead (phone, name) is captured.
 *
 * The scan is Places-only server-side (no Claude) so an anonymous visit costs
 * paise, not rupees; the full Intelligence product is the upsell.
 */

interface GraderProblem { label: string; note: string; pillar: string; grade: string }
interface GraderRankRow { name: string; rating: number; reviews: number; position: number; isYou: boolean }
interface GraderSearchRow { query: string; topResult: string; yourPosition: number | null }
interface GraderResult {
    scanId: string; name: string; address: string; city: string;
    score: number; gradeLabel: string; rating: number; reviews: number; photos: number;
    problems: GraderProblem[]; rankedBelow: number; leaderboard: GraderRankRow[];
    searches: GraderSearchRow[]; estMonthlyLossInr: number; unlocked: boolean;
}

const STAGES = [
    'Finding your restaurant on Google',
    'Scanning nearby competitors',
    'Reading your Google business profile',
    'Checking photos and reviews',
    'Testing your website',
    'Scoring your online presence',
];

const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`;

async function post<T>(path: string, body: unknown): Promise<{ ok: boolean; data?: T; error?: string }> {
    try {
        const res = await fetch(`${getApiUrl()}${path}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        const json = (await res.json()) as { success: boolean; data?: T; error?: string };
        return { ok: json.success, data: json.data, error: json.error };
    } catch {
        return { ok: false, error: 'Could not reach the scanner — check your connection and try again.' };
    }
}

const Blurrable: React.FC<{ locked: boolean; children: React.ReactNode }> = ({ locked, children }) => (
    <div className="relative">
        <div className={locked ? 'blur-sm select-none pointer-events-none' : ''} aria-hidden={locked}>{children}</div>
        {locked && <div className="absolute inset-0" data-testid="blur-lock" />}
    </div>
);

const Grader: React.FC = () => {
    const [step, setStep] = useState<'form' | 'scanning' | 'report'>('form');
    const [name, setName] = useState('');
    const [city, setCity] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [stageIdx, setStageIdx] = useState(0);
    const [result, setResult] = useState<GraderResult | null>(null);
    const [unlockOpen, setUnlockOpen] = useState(false);
    const [promo, setPromo] = useState('');
    const [phone, setPhone] = useState('');
    const [contactName, setContactName] = useState('');
    const [unlockBusy, setUnlockBusy] = useState(false);
    const [unlockError, setUnlockError] = useState<string | null>(null);
    const stageTimer = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => () => { if (stageTimer.current) clearInterval(stageTimer.current); }, []);

    const scan = async () => {
        if (!name.trim() || !city.trim()) { setError('Enter your restaurant name and city.'); return; }
        setError(null);
        setStep('scanning');
        setStageIdx(0);
        track.tabOpened({ bucket: 'GRADER', tab: 'SCAN' });
        // The staged checklist is theatre timed to the real request — it advances
        // while the scan runs and snaps to done when the response lands.
        stageTimer.current = setInterval(() => setStageIdx((i) => Math.min(i + 1, STAGES.length - 2)), 1800);
        const res = await post<GraderResult>('/grader/scan', { name: name.trim(), city: city.trim() });
        if (stageTimer.current) clearInterval(stageTimer.current);
        if (!res.ok || !res.data) {
            setStep('form');
            setError(res.error ?? 'The scan failed — try again.');
            return;
        }
        setStageIdx(STAGES.length);
        setResult(res.data);
        setTimeout(() => setStep('report'), 500);
    };

    const unlock = async () => {
        if (!result) return;
        setUnlockBusy(true);
        setUnlockError(null);
        const res = await post<GraderResult>('/grader/unlock', {
            scanId: result.scanId,
            promoCode: promo,
            phone: phone || undefined,
            name: contactName || undefined,
        });
        setUnlockBusy(false);
        if (!res.ok || !res.data) { setUnlockError(res.error ?? 'Could not unlock.'); return; }
        track.tabOpened({ bucket: 'GRADER', tab: 'UNLOCKED' });
        setResult(res.data);
        setUnlockOpen(false);
    };

    return (
        <div className="min-h-screen bg-canvas" data-theme="orchid-admin">
            <header className="px-6 py-4 flex items-center justify-between border-b border-line bg-surface">
                <p className="font-bold text-ink text-lg">Restro<span className="text-primary-strong">Pulse</span> <span className="font-normal text-muted text-sm ml-1">Restaurant Grader</span></p>
                <a href="/" className="text-sm font-semibold text-primary-strong hover:underline">Get RestroPulse →</a>
            </header>

            <main className="max-w-5xl mx-auto px-4 py-10">
                {step === 'form' && (
                    <div className="max-w-xl mx-auto text-center">
                        <h1 className="text-3xl font-bold text-ink leading-tight">How does your restaurant look on Google?</h1>
                        <p className="text-muted mt-3 leading-relaxed">
                            Free scan: your rating, reviews, photos and website, scored against the restaurants around you — in under a minute.
                        </p>
                        <form
                            className="mt-8 grid gap-3 text-left"
                            onSubmit={(e) => { e.preventDefault(); void scan(); }}
                        >
                            <label className="text-xs font-semibold text-muted">
                                Restaurant name
                                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Exactly as it appears on Google"
                                    className="mt-1 w-full rounded-xl border border-line bg-surface px-4 py-3 text-base text-ink" />
                            </label>
                            <label className="text-xs font-semibold text-muted">
                                City or area
                                <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="e.g. Hyderabad"
                                    className="mt-1 w-full rounded-xl border border-line bg-surface px-4 py-3 text-base text-ink" />
                            </label>
                            {error && <p className="text-sm text-danger" role="alert">{error}</p>}
                            <button type="submit" className="mt-2 rounded-xl bg-primary-strong text-white px-6 py-3.5 text-base font-semibold hover:opacity-90">
                                Scan my restaurant — free
                            </button>
                            <p className="text-[11px] text-muted text-center">No signup. Data comes from your public Google listing.</p>
                        </form>
                    </div>
                )}

                {step === 'scanning' && (
                    <div className="max-w-md mx-auto" data-testid="grader-scanning">
                        <h2 className="text-xl font-bold text-ink">Scanning {name}…</h2>
                        <ol className="mt-6 space-y-3">
                            {STAGES.map((s, i) => (
                                <li key={s} className="flex items-center gap-3 text-sm">
                                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                                        i < stageIdx ? 'bg-success text-white' : i === stageIdx ? 'border-2 border-primary animate-pulse' : 'border border-line'
                                    }`}>{i < stageIdx ? '✓' : ''}</span>
                                    <span className={i <= stageIdx ? 'text-ink font-medium' : 'text-muted'}>{s}</span>
                                </li>
                            ))}
                        </ol>
                        <p className="text-xs text-muted mt-6">Usually under a minute.</p>
                    </div>
                )}

                {step === 'report' && result && (
                    <div className="grid lg:grid-cols-[280px_1fr] gap-6 items-start">
                        {/* Score rail */}
                        <div className="bg-surface rounded-2xl border border-line p-6 flex flex-col items-center gap-3 lg:sticky lg:top-6">
                            <ScoreDial score={result.score} grade={result.score >= 85 ? 'A' : result.score >= 70 ? 'B' : result.score >= 55 ? 'C' : result.score >= 40 ? 'D' : 'F'} label="Online score" />
                            <p className="text-sm text-muted">Online health: <span className="font-semibold text-ink">{result.gradeLabel}</span></p>
                            <div className="w-full border-t border-line pt-3 text-sm text-ink">
                                <p className="font-semibold truncate">{result.name}</p>
                                <p className="text-xs text-muted mt-0.5">★ {result.rating.toFixed(1)} · {result.reviews.toLocaleString('en-IN')} reviews · {result.photos.toLocaleString('en-IN')} photos</p>
                            </div>
                            {!result.unlocked && (
                                <button type="button" onClick={() => setUnlockOpen(true)}
                                    className="w-full rounded-xl bg-primary-strong text-white px-4 py-3 text-sm font-semibold hover:opacity-90" data-testid="unlock-cta">
                                    Unlock the full report
                                </button>
                            )}
                        </div>

                        <div className="space-y-6">
                            {/* Loss headline */}
                            <div className="bg-surface rounded-2xl border border-line p-6">
                                <h2 className="text-xl font-bold text-ink leading-snug">
                                    {result.problems.length > 0
                                        ? <>You could be missing <span className="text-danger">~{inr(result.estMonthlyLossInr)}/month</span> — we found {result.problems.length}{result.unlocked ? '' : '+'} problems</>
                                        : 'Your online presence looks strong'}
                                </h2>
                                <ul className="mt-4 space-y-2">
                                    {result.problems.map((p, i) => (
                                        <li key={i} className="flex items-start gap-2.5 text-sm text-ink">
                                            <span className="mt-1 text-danger" aria-hidden="true">▲</span>
                                            <span><span className="font-medium">{p.label}</span> <span className="text-muted">— {p.note}</span></span>
                                        </li>
                                    ))}
                                </ul>
                                {!result.unlocked && <p className="text-xs text-muted mt-3">Unlock to see every problem and how to fix each one.</p>}
                            </div>

                            {/* Competition — blurred until unlock */}
                            <div className="bg-surface rounded-2xl border border-line p-6">
                                <h3 className="text-base font-semibold text-ink mb-3">You're ranking below {result.rankedBelow} competitor{result.rankedBelow === 1 ? '' : 's'}</h3>
                                <Blurrable locked={!result.unlocked}>
                                    <div data-testid="grader-leaderboard">
                                        {result.leaderboard.map((r) => (
                                            <div key={r.position} className={`flex items-center justify-between gap-3 py-2.5 border-b border-line last:border-b-0 ${r.isYou ? 'font-semibold text-primary-strong' : 'text-ink'}`}>
                                                <span className="text-sm truncate">{r.position}. {r.name}{r.isYou ? ' (you)' : ''}</span>
                                                <span className="text-sm tabular-nums text-muted">★ {r.rating.toFixed(1)} · {r.reviews.toLocaleString('en-IN')}</span>
                                            </div>
                                        ))}
                                    </div>
                                </Blurrable>
                            </div>

                            {/* Searches — first row visible, rest blurred */}
                            <div className="bg-surface rounded-2xl border border-line p-6">
                                <div className="flex items-center justify-between gap-2 mb-3">
                                    <h3 className="text-base font-semibold text-ink">Where you show up when people search</h3>
                                    <span className="text-[11px] text-muted">Our estimate, not live Google</span>
                                </div>
                                <div className="space-y-2.5">
                                    {result.searches.map((s, i) => (
                                        <Blurrable key={s.query} locked={!result.unlocked && i > 0}>
                                            <div className="flex items-center justify-between gap-3 text-sm">
                                                <span className="text-ink">{s.query}</span>
                                                <span className="text-muted whitespace-nowrap">
                                                    #1: {s.topResult} · you: {s.yourPosition ? `#${s.yourPosition}` : 'outside top 10'}
                                                </span>
                                            </div>
                                        </Blurrable>
                                    ))}
                                </div>
                            </div>

                            <p className="text-xs text-muted">
                                Want this every week, with a plan to fix it? <a href="/" className="font-semibold text-primary-strong hover:underline">That's RestroPulse.</a>
                            </p>
                        </div>
                    </div>
                )}
            </main>

            {/* Unlock modal — the lead capture */}
            {unlockOpen && result && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" role="dialog" aria-modal="true" aria-label="Unlock your free report">
                    <div className="bg-surface rounded-2xl border border-line p-6 w-full max-w-md">
                        <h3 className="text-lg font-bold text-ink">Unlock your free report</h3>
                        <p className="text-sm text-muted mt-1">See every problem, the full competitor ranking, and all searches.</p>
                        <div className="mt-4 grid gap-3">
                            <label className="text-xs font-semibold text-muted">
                                Promo code
                                <input value={promo} onChange={(e) => setPromo(e.target.value)} placeholder="From your RestroPulse contact"
                                    className="mt-1 w-full rounded-xl border border-line bg-canvas px-4 py-3 text-base text-ink uppercase" data-testid="promo-input" />
                            </label>
                            <label className="text-xs font-semibold text-muted">
                                Your name <span className="font-normal">(optional)</span>
                                <input value={contactName} onChange={(e) => setContactName(e.target.value)}
                                    className="mt-1 w-full rounded-xl border border-line bg-canvas px-4 py-3 text-base text-ink" />
                            </label>
                            <label className="text-xs font-semibold text-muted">
                                Phone <span className="font-normal">(optional — we'll send the PDF)</span>
                                <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel"
                                    className="mt-1 w-full rounded-xl border border-line bg-canvas px-4 py-3 text-base text-ink" />
                            </label>
                            {unlockError && <p className="text-sm text-danger" role="alert">{unlockError}</p>}
                            <div className="flex items-center gap-3">
                                <button type="button" disabled={unlockBusy || !promo.trim()} onClick={() => void unlock()}
                                    className="flex-1 rounded-xl bg-primary-strong text-white px-4 py-3 text-sm font-semibold hover:opacity-90 disabled:opacity-50">
                                    {unlockBusy ? 'Unlocking…' : 'Unlock'}
                                </button>
                                <button type="button" onClick={() => setUnlockOpen(false)} className="text-sm font-semibold text-muted hover:text-ink">Not now</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Grader;
