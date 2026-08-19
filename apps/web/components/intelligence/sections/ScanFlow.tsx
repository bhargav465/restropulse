import React, { useEffect, useRef, useState } from 'react';
import type { IntelligenceReport, IntelligenceScan, PlaceCandidate, ScanStatus } from '@restropulse/shared';
import { ActionCard } from '../primitives';
import { ScanStepper } from './primitives';

/**
 * ScanFlow (DESIGN §2) — the empty state, the "Is this you?" place confirmation,
 * and the poll-driven pipeline stepper. Owns the pick → start → poll → fetch-report
 * lifecycle; polls every 3s until COMPLETED (then hands the report up) or FAILED
 * (stepper shows the stage-labeled error + retry).
 *
 * Why the confirmation step exists: the server used to take Google's first
 * text-search hit for the restaurant name, silently. With three "Bawarchi"s in
 * a city, that produced a confident, fully narrated report about someone else's
 * restaurant, and the owner had no way to see it or fix it. The picker shows
 * the top matches (name, address, rating, reviews), lets the owner correct the
 * search, and sends the confirmed placeId with the scan; the API remembers it
 * on the profile so every later scan and daily check targets the same listing.
 *
 * The scan API is injected so the poll flow is unit-testable with fake timers.
 */

export const SCAN_POLL_MS = 3000;

export interface ScanApi {
    startScan: (body: { name?: string; city?: string; force?: boolean; placeId?: string }) => Promise<{ scanId: string }>;
    getScan: (scanId: string) => Promise<IntelligenceScan>;
    getReport: (reportId: string) => Promise<IntelligenceReport>;
    searchPlaces: (query: { name?: string; city?: string }) => Promise<PlaceCandidate[]>;
}

interface ScanFlowProps {
    /** Name/city from the profile; `placeId` when a listing was confirmed before. */
    defaults: { name: string; city: string; placeId?: string };
    api: ScanApi;
    onReport: (report: IntelligenceReport) => void;
    /** 'first-run' shows the empty state; 'rescan' auto-starts unless `startWithPicker`. */
    variant: 'first-run' | 'rescan';
    /** Open on the "Is this you?" step even for a rescan ("Not your restaurant?"). */
    startWithPicker?: boolean;
    onCancel?: () => void;
    force?: boolean;
}

const TEASERS: Array<{ emoji: string; title: string; description: string }> = [
    { emoji: '🥊', title: 'How you compare', description: 'Your rating, reviews and photos next to the restaurants around the corner.' },
    { emoji: '📍', title: 'Where they beat you', description: 'The exact places a rival is ahead — and the one thing to fix first.' },
    { emoji: '💬', title: 'What guests are saying', description: 'Every recent review, summarised: what people love and what is slipping.' },
    { emoji: '🎯', title: 'A short to-do list', description: 'Each finding becomes a post, a photo brief or a profile fix — inside RestroPulse.' },
];

const inr = (n: number) => n.toLocaleString('en-IN');

// ---------------------------------------------------------------------------
// "Is this you?" — pick the Google listing before we score it.
// ---------------------------------------------------------------------------

export const PlacePicker: React.FC<{
    defaults: { name: string; city: string; placeId?: string };
    api: Pick<ScanApi, 'searchPlaces'>;
    onConfirm: (candidate: PlaceCandidate) => void;
    /** Escape hatch when search itself is unavailable (e.g. no Google key locally). */
    onSkip?: () => void;
    busy?: boolean;
}> = ({ defaults, api, onConfirm, onSkip, busy }) => {
    const [candidates, setCandidates] = useState<PlaceCandidate[] | null>(null);
    const [selected, setSelected] = useState<string | null>(defaults.placeId ?? null);
    const [error, setError] = useState<string | null>(null);
    const [searchOpen, setSearchOpen] = useState(false);
    const [qName, setQName] = useState(defaults.name);
    const [qCity, setQCity] = useState(defaults.city);

    const search = async (name: string, city: string) => {
        setCandidates(null);
        setError(null);
        try {
            const found = await api.searchPlaces({ name, city });
            setCandidates(found);
            // Keep a prior confirmed choice if it's still in the list; else pick the top hit.
            setSelected((cur) => (cur && found.some((c) => c.placeId === cur) ? cur : (found[0]?.placeId ?? null)));
        } catch (e) {
            setCandidates([]);
            setError(e instanceof Error ? e.message : 'Could not search Google right now.');
        }
    };

    useEffect(() => {
        void search(defaults.name, defaults.city);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const chosen = candidates?.find((c) => c.placeId === selected) ?? null;

    return (
        <div className="bg-surface rounded-2xl p-4 sm:p-6 border border-line space-y-4" data-testid="place-picker">
            <div>
                <h3 className="text-base font-semibold text-ink">Is this your restaurant?</h3>
                <p className="text-sm text-muted mt-1">
                    Everything in the report is compared against this Google listing, so it has to be yours.
                </p>
            </div>

            {candidates === null && <p className="text-sm text-muted">Looking for “{qName}” on Google…</p>}

            {candidates && candidates.length > 0 && (
                <div role="radiogroup" aria-label="Google listings that match your restaurant" className="grid gap-2">
                    {candidates.map((c) => {
                        const active = c.placeId === selected;
                        return (
                            <button
                                key={c.placeId}
                                type="button"
                                role="radio"
                                aria-checked={active}
                                onClick={() => setSelected(c.placeId)}
                                className={`text-left rounded-xl border p-3 sm:p-4 transition-colors ${
                                    active ? 'border-primary bg-primary-soft' : 'border-line hover:border-primary/40'
                                }`}
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="text-sm font-semibold text-ink truncate">{c.name}</p>
                                        <p className="text-xs text-muted mt-0.5 truncate">{c.address || 'Address not listed'}</p>
                                    </div>
                                    <p className="text-xs text-ink tabular-nums whitespace-nowrap">
                                        ★ {c.rating.toFixed(1)} <span className="text-muted">· {inr(c.totalRatings)} reviews</span>
                                    </p>
                                </div>
                            </button>
                        );
                    })}
                </div>
            )}

            {candidates && candidates.length === 0 && !error && (
                <p className="text-sm text-ink">We couldn’t find “{qName}” in {qCity || 'your city'}. Try the exact name Google shows for you.</p>
            )}

            {error && (
                <div className="rounded-xl border border-danger/40 bg-surface p-3" role="alert">
                    <p className="text-sm text-danger">{error}</p>
                </div>
            )}

            {/* Correct the search — this is where a wrong or renamed restaurant gets fixed. */}
            {searchOpen ? (
                <form
                    className="grid sm:grid-cols-[1fr_1fr_auto] gap-2 items-end"
                    onSubmit={(e) => {
                        e.preventDefault();
                        void search(qName.trim(), qCity.trim());
                    }}
                >
                    <label className="text-xs text-muted font-semibold">
                        Restaurant name
                        <input
                            value={qName}
                            onChange={(e) => setQName(e.target.value)}
                            className="mt-1 w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-ink"
                            placeholder="Exactly as it appears on Google"
                        />
                    </label>
                    <label className="text-xs text-muted font-semibold">
                        City or area
                        <input
                            value={qCity}
                            onChange={(e) => setQCity(e.target.value)}
                            className="mt-1 w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-ink"
                            placeholder="e.g. Hyderabad"
                        />
                    </label>
                    <button
                        type="submit"
                        disabled={!qName.trim()}
                        className="rounded-lg border border-line px-4 py-2 text-sm font-semibold text-primary-strong hover:bg-primary-soft disabled:opacity-50"
                    >
                        Search again
                    </button>
                </form>
            ) : (
                <button type="button" onClick={() => setSearchOpen(true)} className="text-xs font-semibold text-primary-strong hover:underline">
                    Not in the list? Search by a different name →
                </button>
            )}

            <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-1">
                <button
                    type="button"
                    disabled={!chosen || busy}
                    onClick={() => chosen && onConfirm(chosen)}
                    className="rounded-lg bg-primary-strong text-white px-6 py-2.5 text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 whitespace-nowrap"
                >
                    {busy ? 'Starting…' : 'Yes, this is mine — run the scan'}
                </button>
                {error && onSkip && (
                    <button type="button" onClick={onSkip} disabled={busy} className="text-xs font-semibold text-muted hover:text-ink">
                        Scan using my profile name instead
                    </button>
                )}
            </div>
        </div>
    );
};

// ---------------------------------------------------------------------------

const ScanFlow: React.FC<ScanFlowProps> = ({ defaults, api, onReport, variant, startWithPicker, onCancel, force }) => {
    const name = defaults.name;
    const city = defaults.city;
    const [scanId, setScanId] = useState<string | null>(null);
    const [status, setStatus] = useState<ScanStatus>('QUEUED');
    const [error, setError] = useState<string | undefined>();
    const [starting, setStarting] = useState(false);
    // First run: confirm the listing unless the profile already has one. Rescan:
    // straight to scanning unless the owner asked to change the restaurant.
    const [picking, setPicking] = useState<boolean>(variant === 'first-run' ? !defaults.placeId : !!startWithPicker);
    const startedRef = useRef(false);
    const lastStart = useRef<{ name?: string; city?: string; placeId?: string } | undefined>(undefined);

    const start = async (overrides?: { name?: string; city?: string; placeId?: string }) => {
        setError(undefined);
        setStatus('QUEUED');
        setStarting(true);
        lastStart.current = overrides;
        try {
            const { scanId: id } = await api.startScan({
                name: overrides?.name ?? name,
                city: overrides?.city ?? city,
                force,
                placeId: overrides?.placeId ?? defaults.placeId,
            });
            setScanId(id);
            setPicking(false);
        } catch (e) {
            setStatus('FAILED');
            setError(e instanceof Error ? e.message : 'Could not start the scan.');
        } finally {
            setStarting(false);
        }
    };

    // Auto-start a re-scan on mount (once) when no confirmation is needed.
    useEffect(() => {
        if (variant === 'rescan' && !startWithPicker && !startedRef.current) {
            startedRef.current = true;
            void start();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [variant]);

    // Poll the scan while we have an id and it isn't terminal.
    useEffect(() => {
        if (!scanId) return;
        let cancelled = false;
        const id = setInterval(async () => {
            try {
                const scan = await api.getScan(scanId);
                if (cancelled) return;
                setStatus(scan.status);
                if (scan.status === 'COMPLETED' && scan.reportId) {
                    clearInterval(id);
                    const report = await api.getReport(scan.reportId);
                    if (!cancelled) onReport(report);
                } else if (scan.status === 'FAILED') {
                    clearInterval(id);
                    setError(scan.error || 'The scan failed before it finished.');
                }
            } catch (e) {
                if (cancelled) return;
                clearInterval(id);
                setStatus('FAILED');
                setError(e instanceof Error ? e.message : 'Lost contact with the scan.');
            }
        }, SCAN_POLL_MS);
        return () => {
            cancelled = true;
            clearInterval(id);
        };
    }, [scanId]); // eslint-disable-line react-hooks/exhaustive-deps

    const scanning = starting || (scanId !== null && status !== 'FAILED');
    const showStepper = !picking && (scanning || status === 'FAILED');

    const retry = () => {
        setScanId(null);
        void start(lastStart.current);
    };

    if (showStepper) {
        return (
            <div className="space-y-4">
                <ScanStepper status={status} error={error} onRetry={status === 'FAILED' ? retry : undefined} />
                {status === 'FAILED' && (
                    <button type="button" onClick={() => setPicking(true)} className="text-xs font-semibold text-primary-strong hover:underline">
                        Wrong restaurant? Pick your Google listing →
                    </button>
                )}
                {variant === 'rescan' && status !== 'FAILED' && onCancel && (
                    <button type="button" onClick={onCancel} className="text-xs font-semibold text-muted hover:text-ink">
                        ← Back to your report
                    </button>
                )}
            </div>
        );
    }

    const picker = (
        <PlacePicker
            defaults={defaults}
            api={api}
            busy={starting}
            onConfirm={(c) => void start({ name: c.name, placeId: c.placeId })}
            onSkip={() => void start()}
        />
    );

    // Rescan with "change restaurant": just the picker + a way back.
    if (variant === 'rescan') {
        return (
            <div className="space-y-4">
                {picker}
                {onCancel && (
                    <button type="button" onClick={onCancel} className="text-xs font-semibold text-muted hover:text-ink">
                        ← Back to your report
                    </button>
                )}
            </div>
        );
    }

    // First run.
    return (
        <div className="space-y-6">
            <div className="bg-banner rounded-2xl p-8 text-white">
                <div className="text-4xl mb-3" aria-hidden="true">📊</div>
                <h3 className="text-xl font-semibold">See how you stack up on Google</h3>
                <p className="text-sidebar-ink text-sm mt-2 max-w-xl leading-relaxed">
                    We’ll find your restaurant on Google, look at the restaurants around you, and turn it into a score and a short
                    to-do list — in under a minute.
                </p>

                {!picking && (
                    <div className="mt-5 flex flex-col sm:flex-row sm:items-center gap-3 max-w-xl">
                        <button
                            type="button"
                            onClick={() => void start()}
                            disabled={starting || !name.trim()}
                            className="rounded-lg bg-primary-strong text-white px-6 py-2.5 text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 whitespace-nowrap"
                        >
                            {starting ? 'Starting…' : 'Run first scan'}
                        </button>
                        <span className="text-sidebar-ink text-sm">
                            For <span className="font-semibold text-white">{name}</span>
                            {city.trim() ? <> in <span className="font-semibold text-white">{city}</span></> : null}
                            {' · '}
                            <button type="button" onClick={() => setPicking(true)} className="underline hover:text-white">
                                Not your restaurant?
                            </button>
                        </span>
                    </div>
                )}
            </div>

            {picking && picker}

            {error && !picking && <p className="text-sm text-danger">{error}</p>}

            <div className="grid sm:grid-cols-2 gap-4">
                {TEASERS.map((t) => (
                    <ActionCard key={t.title} emoji={t.emoji} title={t.title} description={t.description} />
                ))}
            </div>
        </div>
    );
};

export default ScanFlow;
