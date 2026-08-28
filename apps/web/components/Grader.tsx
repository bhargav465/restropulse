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

interface GraderCandidate { placeId: string; name: string; address: string; rating: number; totalRatings: number; photoName?: string; lat?: number; lng?: number }
interface GraderProblem { label: string; note: string; pillar: string; grade: string }
interface GraderRankRow { name: string; rating: number; reviews: number; position: number; isYou: boolean }
interface GraderSearchRow { query: string; topResult: string; yourPosition: number | null }
interface GraderResult {
    scanId: string; name: string; address: string; city: string;
    score: number; gradeLabel: string; rating: number; reviews: number; photos: number;
    photoName?: string | null;
    location?: { lat: number; lng: number } | null;
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
const photoUrl = (ref: string) => `${getApiUrl()}/grader/photo?ref=${encodeURIComponent(ref)}`;
const mapUrl = (lat: number, lng: number) => `${getApiUrl()}/grader/staticmap?lat=${lat}&lng=${lng}`;

/**
 * The scanning theatre — an owner.com-style mock browser window showing the
 * restaurant's Google listing being examined: stars fill to the real rating,
 * the review count counts up, photo tiles shimmer (or show the real photo/map
 * when the key allows), a scan beam sweeps, and a progress bar tracks stages.
 */
const ScanTheatre: React.FC<{
    name: string; address: string; rating: number; reviews: number;
    photoName?: string | null; lat?: number | null; lng?: number | null;
    stageIdx: number; total: number;
}> = ({ name, address, rating, reviews, photoName, lat, lng, stageIdx, total }) => {
    const [starPct, setStarPct] = useState(0);
    const [count, setCount] = useState(0);
    const [heroFailed, setHeroFailed] = useState(false);
    useEffect(() => {
        const t = setTimeout(() => setStarPct(Math.max(0, Math.min(100, (rating / 5) * 100))), 300);
        return () => clearTimeout(t);
    }, [rating]);
    useEffect(() => {
        if (reviews <= 0) return;
        const started = Date.now();
        const iv = setInterval(() => {
            const f = Math.min(1, (Date.now() - started) / 2000);
            setCount(Math.round(reviews * f));
            if (f >= 1) clearInterval(iv);
        }, 60);
        return () => clearInterval(iv);
    }, [reviews]);
    const pct = Math.min(96, Math.round(((stageIdx + 0.5) / total) * 100));
    const shimmer: React.CSSProperties = {
        background: 'linear-gradient(90deg, rgba(124,58,237,0.08) 25%, rgba(124,58,237,0.2) 50%, rgba(124,58,237,0.08) 75%)',
        backgroundSize: '400px 100%',
        animation: 'grader-shimmer 1.4s linear infinite',
    };
    const heroSrc = photoName && !heroFailed
        ? photoUrl(photoName)
        : lat != null && lng != null && !heroFailed
            ? mapUrl(lat, lng)
            : null;
    return (
        <div className="mt-5 bg-surface rounded-2xl border border-line overflow-hidden shadow-sm" data-testid="scan-card">
            <style>{[
                '@keyframes grader-shimmer { 0% { background-position: -400px 0; } 100% { background-position: 400px 0; } }',
                '@keyframes grader-sweep2 { 0% { top: -15%; } 100% { top: 105%; } }',
                '@keyframes grader-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }',
            ].join('\n')}</style>
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-line bg-canvas">
                <span className="flex gap-1.5" aria-hidden="true">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: '#f87171' }} />
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: '#fbbf24' }} />
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: '#34d399' }} />
                </span>
                <span className="flex-1 truncate rounded-full bg-surface border border-line px-3 py-1 text-[11px] text-muted">
                    google.com/search?q={encodeURIComponent(name)}
                </span>
            </div>
            <div className="relative p-4 overflow-hidden">
                <div className="flex items-center gap-3">
                    <span className="w-11 h-11 rounded-full flex items-center justify-center text-lg font-bold text-white shrink-0"
                        style={{ background: 'rgba(124,58,237,0.85)' }} aria-hidden="true">
                        {(name.trim().charAt(0) || '?').toUpperCase()}
                    </span>
                    <span className="min-w-0">
                        <span className="block font-semibold text-ink truncate">{name}</span>
                        <span className="block text-[11px] text-muted truncate">📍 {address}</span>
                    </span>
                </div>
                <div className="mt-3 flex items-center gap-2 text-base">
                    <span className="relative inline-block leading-none" aria-hidden="true">
                        <span style={{ color: 'rgba(124,58,237,0.2)' }}>★★★★★</span>
                        <span className="absolute inset-y-0 left-0 overflow-hidden whitespace-nowrap"
                            style={{ width: `${starPct}%`, color: '#f59e0b', transition: 'width 1.8s ease-out' }}>★★★★★</span>
                    </span>
                    {rating > 0 && <span className="text-sm text-ink font-semibold tabular-nums">{rating.toFixed(1)}</span>}
                    <span className="text-sm text-muted tabular-nums">
                        {reviews > 0 ? `${count.toLocaleString('en-IN')} reviews` : 'reading reviews…'}
                    </span>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2">
                    {heroSrc ? (
                        <img src={heroSrc} alt="" className="col-span-3 h-28 w-full object-cover rounded-lg"
                            onError={() => setHeroFailed(true)} />
                    ) : (
                        [0, 1, 2].map((i) => (
                            <span key={i} className="h-16 rounded-lg block" style={{ ...shimmer, animationDelay: `${i * 0.2}s` }} aria-hidden="true" />
                        ))
                    )}
                </div>
                <div className="mt-3 space-y-2" aria-hidden="true">
                    <span className="block h-2.5 rounded w-full" style={shimmer} />
                    <span className="block h-2.5 rounded w-4/5" style={{ ...shimmer, animationDelay: '0.3s' }} />
                    <span className="block h-2.5 rounded w-3/5" style={{ ...shimmer, animationDelay: '0.6s' }} />
                </div>
                <div className="absolute left-0 right-0 h-14 pointer-events-none"
                    style={{ animation: 'grader-sweep2 2s linear infinite', background: 'linear-gradient(180deg, transparent, rgba(124,58,237,0.22), transparent)' }}
                    aria-hidden="true" />
            </div>
            <div className="px-4 pb-4">
                <div className="flex items-center justify-between text-[11px] text-muted mb-1">
                    <span style={{ animation: 'grader-blink 1.2s ease-in-out infinite' }}>{STAGES[Math.min(stageIdx, STAGES.length - 1)]}…</span>
                    <span className="tabular-nums font-semibold text-ink">{pct}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-canvas overflow-hidden">
                    <div className="h-full rounded-full bg-primary-strong" style={{ width: `${pct}%`, transition: 'width 0.8s ease' }} />
                </div>
            </div>
        </div>
    );
};

/**
 * The scan screen's hero: listing photo when Google gives us one, otherwise a
 * live map with a pin on the restaurant, otherwise designed placeholder art —
 * never a plain text card. The animated sweep sells "we are examining you".
 */
const ScanHero: React.FC<{ name: string; photoName?: string | null; lat?: number | null; lng?: number | null; sweep?: boolean }> = ({ name, photoName, lat, lng, sweep }) => {
    const [photoFailed, setPhotoFailed] = useState(false);
    const [mapFailed, setMapFailed] = useState(false);
    const src = photoName && !photoFailed
        ? photoUrl(photoName)
        : lat != null && lng != null && !mapFailed
            ? mapUrl(lat, lng)
            : null;
    return (
        <div className="relative h-44 bg-canvas overflow-hidden">
            {src ? (
                <img src={src} alt={name} className="w-full h-full object-cover"
                    onError={() => { if (photoName && !photoFailed) setPhotoFailed(true); else setMapFailed(true); }} />
            ) : (
                <div className="w-full h-full relative flex items-center justify-center overflow-hidden"
                    style={{
                        background:
                            'linear-gradient(rgba(124,58,237,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(124,58,237,0.06) 1px, transparent 1px), linear-gradient(135deg, rgba(124,58,237,0.14), rgba(124,58,237,0.02))',
                        backgroundSize: '24px 24px, 24px 24px, 100% 100%',
                    }}>
                    <style>{'@keyframes grader-ping { 0% { transform: scale(0.4); opacity: 0.6; } 100% { transform: scale(1.8); opacity: 0; } }'}</style>
                    <span className="absolute rounded-full" style={{ width: '90px', height: '90px', border: '2px solid rgba(124,58,237,0.45)', animation: 'grader-ping 1.6s ease-out infinite' }} aria-hidden="true" />
                    <span className="absolute rounded-full" style={{ width: '90px', height: '90px', border: '2px solid rgba(124,58,237,0.3)', animation: 'grader-ping 1.6s ease-out 0.8s infinite' }} aria-hidden="true" />
                    <span className="relative text-4xl" aria-hidden="true">📍</span>
                    <span className="absolute bottom-2 left-0 right-0 text-center text-[11px] font-semibold" style={{ color: 'rgba(124,58,237,0.7)' }}>
                        Locating {name.trim() || 'your restaurant'} on Google…
                    </span>
                </div>
            )}
            {sweep && (
                <>
                    <style>{'@keyframes grader-sweep { 0% { top: -20%; } 100% { top: 110%; } }'}</style>
                    <div className="absolute left-0 right-0 h-12 pointer-events-none"
                        style={{ animation: 'grader-sweep 1.8s linear infinite', background: 'linear-gradient(180deg, transparent, rgba(124,58,237,0.28), transparent)' }}
                        aria-hidden="true" />
                </>
            )}
        </div>
    );
};

async function get<T>(path: string): Promise<{ ok: boolean; data?: T }> {
    try {
        const res = await fetch(`${getApiUrl()}${path}`);
        const json = (await res.json()) as { success: boolean; data?: T };
        return { ok: json.success, data: json.data };
    } catch {
        return { ok: false };
    }
}

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
    const [suggestions, setSuggestions] = useState<GraderCandidate[]>([]);
    const [suggestOpen, setSuggestOpen] = useState(false);
    const [picked, setPicked] = useState<GraderCandidate | null>(null);
    const suggestTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const suggestSeq = useRef(0);
    const [stageIdx, setStageIdx] = useState(0);
    const [result, setResult] = useState<GraderResult | null>(null);
    const [unlockOpen, setUnlockOpen] = useState(false);
    const [promo, setPromo] = useState('');
    const [phone, setPhone] = useState('');
    const [email, setEmail] = useState('');
    const [contactName, setContactName] = useState('');
    const [unlockBusy, setUnlockBusy] = useState(false);
    const [unlockError, setUnlockError] = useState<string | null>(null);
    const stageTimer = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => () => {
        if (stageTimer.current) clearInterval(stageTimer.current);
        if (suggestTimer.current) clearTimeout(suggestTimer.current);
    }, []);

    // Autocomplete: debounce the name, ask the public suggest endpoint, and let
    // the owner pick their exact listing (name + address) instead of guessing.
    const onNameChange = (v: string) => {
        setName(v);
        if (picked && v !== picked.name) setPicked(null);
        if (suggestTimer.current) clearTimeout(suggestTimer.current);
        const q = v.trim();
        if (q.length < 3) { setSuggestions([]); setSuggestOpen(false); return; }
        suggestTimer.current = setTimeout(() => {
            const seq = ++suggestSeq.current;
            void get<GraderCandidate[]>(
                `/grader/suggest?name=${encodeURIComponent(q)}${city.trim() ? `&city=${encodeURIComponent(city.trim())}` : ''}`,
            ).then((res) => {
                if (seq !== suggestSeq.current) return; // a newer keystroke owns the dropdown
                const list = res.ok && res.data ? res.data : [];
                setSuggestions(list);
                setSuggestOpen(list.length > 0);
            });
        }, 350);
    };

    const pick = (c: GraderCandidate) => {
        setPicked(c);
        setName(c.name);
        setSuggestions([]);
        setSuggestOpen(false);
        if (!city.trim() && c.address) {
            const parts = c.address.split(',').map((x) => x.trim()).filter(Boolean);
            if (parts.length > 0) setCity(parts[parts.length - 1]);
        }
    };

    const scan = async () => {
        if (!name.trim() || !city.trim()) { setError('Enter your restaurant name and city.'); return; }
        setError(null);
        setStep('scanning');
        setStageIdx(0);
        track.tabOpened({ bucket: 'GRADER', tab: 'SCAN' });
        // The staged checklist is theatre timed to the real request — it advances
        // while the scan runs and snaps to done when the response lands. Cached
        // scans return in under a second, so hold the scanning screen a few
        // seconds anyway: the owner should see their restaurant being examined.
        const started = Date.now();
        stageTimer.current = setInterval(() => setStageIdx((i) => Math.min(i + 1, STAGES.length - 2)), 1000);
        const res = await post<GraderResult>('/grader/scan', {
            name: name.trim(),
            city: city.trim(),
            placeId: picked?.placeId,
        });
        if (!res.ok || !res.data) {
            if (stageTimer.current) clearInterval(stageTimer.current);
            setStep('form');
            setError(res.error ?? 'The scan failed — try again.');
            return;
        }
        const hold = Math.max(600, 6500 - (Date.now() - started));
        setTimeout(() => {
            if (stageTimer.current) clearInterval(stageTimer.current);
            setStageIdx(STAGES.length);
            setResult(res.data ?? null);
            setTimeout(() => setStep('report'), 600);
        }, hold);
    };

    const unlock = async () => {
        if (!result) return;
        setUnlockBusy(true);
        setUnlockError(null);
        const res = await post<GraderResult>('/grader/unlock', {
            scanId: result.scanId,
            promoCode: promo,
            phone: phone || undefined,
            email: email || undefined,
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
                            <label className="text-xs font-semibold text-muted relative block">
                                Restaurant name
                                <input value={name} onChange={(e) => onNameChange(e.target.value)}
                                    onFocus={() => { if (suggestions.length > 0) setSuggestOpen(true); }}
                                    onBlur={() => setSuggestOpen(false)}
                                    placeholder="Start typing and pick yours from the list"
                                    autoComplete="off" role="combobox" aria-expanded={suggestOpen} aria-autocomplete="list"
                                    className="mt-1 w-full rounded-xl border border-line bg-surface px-4 py-3 text-base text-ink" />
                                {suggestOpen && suggestions.length > 0 && (
                                    <div className="absolute left-0 right-0 top-full mt-1 bg-surface border border-line rounded-xl shadow-lg overflow-hidden overflow-y-auto max-h-80 z-20"
                                        role="listbox" data-testid="grader-suggestions">
                                        {suggestions.map((c) => (
                                            <button key={c.placeId} type="button" role="option" aria-selected={picked?.placeId === c.placeId}
                                                onMouseDown={(e) => { e.preventDefault(); pick(c); }}
                                                className="w-full text-left px-4 py-2.5 hover:bg-canvas border-b border-line last:border-b-0">
                                                <span className="block text-sm font-medium text-ink truncate">{c.name}</span>
                                                <span className="block text-xs text-muted mt-0.5 truncate">
                                                    {c.address}{c.rating > 0 ? ` · ★ ${c.rating.toFixed(1)} (${c.totalRatings.toLocaleString('en-IN')})` : ''}
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                                {picked && (
                                    <span className="block mt-1 text-[11px] font-normal text-success" data-testid="picked-confirmation">
                                        ✓ {picked.name} · {picked.address}
                                    </span>
                                )}
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
                        <h2 className="text-xl font-bold text-ink">Scanning {picked?.name ?? name}…</h2>
                        <ScanTheatre
                            name={picked?.name ?? name}
                            address={picked?.address || city}
                            rating={picked?.rating ?? 0}
                            reviews={picked?.totalRatings ?? 0}
                            photoName={picked?.photoName}
                            lat={picked?.lat}
                            lng={picked?.lng}
                            stageIdx={stageIdx}
                            total={STAGES.length}
                        />
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
                            {(result.photoName || result.location) && (
                                <div className="w-full rounded-xl overflow-hidden -mt-1" style={{ height: '8rem' }}>
                                    <ScanHero name={result.name} photoName={result.photoName}
                                        lat={result.location?.lat} lng={result.location?.lng} />
                                </div>
                            )}
                            <ScoreDial score={result.score} grade={result.score >= 85 ? 'A' : result.score >= 70 ? 'B' : result.score >= 55 ? 'C' : result.score >= 40 ? 'D' : 'F'} label="Online score" />
                            <p className="text-sm text-muted">Online health: <span className="font-semibold text-ink">{result.gradeLabel}</span></p>
                            <div className="w-full border-t border-line pt-3 text-sm text-ink">
                                <p className="font-semibold truncate">{result.name}</p>
                                {result.address && <p className="text-xs text-muted mt-0.5 truncate">{result.address}</p>}
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
                                Phone
                                <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="+91…"
                                    className="mt-1 w-full rounded-xl border border-line bg-canvas px-4 py-3 text-base text-ink" data-testid="lead-phone" />
                            </label>
                            <label className="text-xs font-semibold text-muted">
                                Email
                                <input value={email} onChange={(e) => setEmail(e.target.value)} inputMode="email" placeholder="you@restaurant.com"
                                    className="mt-1 w-full rounded-xl border border-line bg-canvas px-4 py-3 text-base text-ink" data-testid="lead-email" />
                            </label>
                            <p className="text-[11px] text-muted -mt-1">Phone or email required — we'll send your full report there.</p>
                            {unlockError && <p className="text-sm text-danger" role="alert">{unlockError}</p>}
                            <div className="flex items-center gap-3">
                                <button type="button" disabled={unlockBusy || !promo.trim() || (!phone.trim() && !email.trim())} onClick={() => void unlock()}
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
