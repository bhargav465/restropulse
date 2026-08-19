import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from './utils/test-utils';
import type { CompetitorProfile, IntelligenceSelfMetrics, Restaurant } from '@restropulse/shared';

/**
 * Regression cover for the Intelligence P0s (RP-001, RP-003, RP-006, RP-011).
 * Each block names the ticket it locks down; the point of every assertion here
 * is that the bug was invisible to the compiler and to the eye.
 */

vi.mock('../api', () => ({
    intelligenceAPI: {
        getLatestReport: vi.fn(),
        getSelfMetrics: vi.fn(),
        getWatchlist: vi.fn(),
        putWatchlist: vi.fn(),
        getSnapshots: vi.fn(),
        getCompare: vi.fn(),
        getFeedbackChanges: vi.fn(),
        getNewOpenings: vi.fn(),
        searchPlaces: vi.fn(),
    },
}));

import { intelligenceAPI } from '../api';
import Intelligence from '../components/Intelligence';
import MyOverview from '../components/intelligence/sections/my-restaurant/Overview';
import { DailyTrendsView } from '../components/intelligence/sections/my-restaurant/DailyTrends';
import { TopThreatsView } from '../components/intelligence/sections/competition/TopThreats';
import { TrendChart } from '../components/intelligence/sections/charts';
import { SHELL_BUCKET_TO_VIEW, shellBucketToView } from '../components/intelligence/sections/deep-links';
import { DEMO_INTELLIGENCE_REPORT, DEMO_INTELLIGENCE_SELF_METRICS } from '../lib/demo-fixtures-intelligence';
import ScanFlow, { PlacePicker } from '../components/intelligence/sections/ScanFlow';
import { WhereTheyBeatYouView, rowsFromReport } from '../components/intelligence/sections/competition/WhereTheyBeatYou';
import { humanCity, whatChangedLine } from '../components/intelligence/sections/copy';
import type { PlaceCandidate } from '@restropulse/shared';

const restaurant = { id: 'r1', name: 'Test Kitchen', sourceCity: 'city-hyderabad' } as unknown as Restaurant;

beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
});

// ---------------------------------------------------------------- RP-001 ----

describe('RP-001 — action-plan CTAs are wired to the shell', () => {
    it('maps every shell bucket to a ViewState this shell owns, or to null', () => {
        expect(shellBucketToView('CONTENT')).toBe('STUDIO');
        expect(shellBucketToView('INTELLIGENCE')).toBe('INTELLIGENCE');
        expect(shellBucketToView('DASHBOARD')).toBe('DASHBOARD');
        // Buckets ported from restropulse-v2 that this app has no home for.
        expect(shellBucketToView('ORDERING')).toBeNull();
        expect(shellBucketToView('GET_STARTED')).toBeNull();
        expect(shellBucketToView('DESIGN')).toBeNull();
        // No bucket may resolve to a view the shell cannot render.
        const renderable = ['DASHBOARD', 'STUDIO', 'INPUTS', 'STRATEGY', 'INTELLIGENCE'];
        for (const view of Object.values(SHELL_BUCKET_TO_VIEW)) {
            if (view !== null) expect(renderable).toContain(view);
        }
    });

    it('calls onNavigate when an action-plan CTA is clicked', async () => {
        vi.mocked(intelligenceAPI.getLatestReport).mockResolvedValue(DEMO_INTELLIGENCE_REPORT as never);
        vi.mocked(intelligenceAPI.getSelfMetrics).mockResolvedValue(DEMO_INTELLIGENCE_SELF_METRICS as never);
        const onNavigate = vi.fn();

        render(<Intelligence restaurant={restaurant} onNavigate={onNavigate} />);

        // The fixture's priority-3 action carries deepLink { bucket: 'content' }.
        const cta = await screen.findByRole('button', { name: /Draft in Content Engine/i });
        fireEvent.click(cta);

        expect(onNavigate).toHaveBeenCalledTimes(1);
        expect(onNavigate.mock.calls[0][0]).toMatchObject({ bucket: 'CONTENT' });
    });
});

// ---------------------------------------------------------------- RP-003 ----

describe('RP-003 — empty series never render a blank oversized chart', () => {
    it('renders a real pixel height, not a viewBox unit', () => {
        const { container } = render(
            <TrendChart
                labels={['2026-08-01', '2026-08-02']}
                series={[{ key: 's', label: 'Rating', color: '#000', points: [4.4, 4.5] }]}
                height={120}
                ariaLabel="Rating trend"
            />,
        );
        const svg = container.querySelector('svg');
        expect(svg).not.toBeNull();
        expect(svg?.getAttribute('height')).toBe('120');
    });

    it('renders nothing when there is nothing to plot', () => {
        const { container } = render(
            <TrendChart labels={[]} series={[{ key: 's', label: 'Rating', color: '#000', points: [] }]} ariaLabel="Rating trend" />,
        );
        expect(container.querySelector('svg')).toBeNull();
    });

    it('shows an empty state instead of a chart when a range has no snapshots', () => {
        const { container } = render(<DailyTrendsView points={[]} mode="range" onAddZomato={() => {}} />);
        expect(screen.getByText(/No daily checks for this period yet/i)).toBeInTheDocument();
        expect(container.querySelector('svg')).toBeNull();
    });
});

// ---------------------------------------------------------------- RP-006 ----

describe('RP-006 — no green "Measured" chip over an all-zero dataset', () => {
    const zeroMetrics: IntelligenceSelfMetrics = {
        ...DEMO_INTELLIGENCE_SELF_METRICS,
        orderCount: 0,
        totalCustomers: 0,
        repeatCustomers: 0,
        repeatRatePct: 0,
        avgOrderValue: 0,
        revenue: { newCustomer: 0, returningCustomer: 0 },
    };

    it('hides the operations strip when there are no orders', () => {
        render(<MyOverview report={DEMO_INTELLIGENCE_REPORT} metrics={zeroMetrics} onNavigate={() => {}} />);
        expect(screen.queryByText('Your operations')).not.toBeInTheDocument();
    });

    it('still shows the operations strip when orders exist', () => {
        render(<MyOverview report={DEMO_INTELLIGENCE_REPORT} metrics={DEMO_INTELLIGENCE_SELF_METRICS} onNavigate={() => {}} />);
        expect(screen.getByText('Your operations')).toBeInTheDocument();
    });
});

// ---------------------------------------------------------------- RP-011 ----

describe('RP-011 — the restaurant is never its own competitor', () => {
    const competitor = (placeId: string, name: string, threatScore: number): CompetitorProfile => ({
        placeId,
        name,
        address: 'Somewhere',
        rating: 4.5,
        totalRatings: 100,
        distanceKm: 1,
        lat: 0,
        lng: 0,
        priceLevel: 2,
        photoCount: 10,
        cuisine: 'Indian',
        threatScore,
        sameCuisineThreatScore: threatScore,
    });

    it('filters the merchant out of both buckets and the counts', () => {
        const rows = [competitor('self-1', 'Bawarchi Test Kitchen', 99), competitor('rival-1', 'Behrouz', 80)];
        render(
            <TopThreatsView
                buckets={{ directTop10: rows, overallTop10: rows, aovBand: { base: 2, label: 'Value' } }}
                watchlist={[]}
                max={5}
                error={null}
                onAdd={() => {}}
                selfPlaceId="self-1"
            />,
        );
        expect(screen.queryByText('Bawarchi Test Kitchen')).not.toBeInTheDocument();
        expect(screen.getByText('Behrouz')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Same food & price \(1\)/i })).toBeInTheDocument();
    });
});

// ------------------------------------------------------ "Is this you?" ----

describe('"Is this you?" — confirm the Google listing before scanning', () => {
    const candidates: PlaceCandidate[] = [
        { placeId: 'p-main', name: 'Bawarchi Test Kitchen', address: 'RTC X Roads, Hyderabad', rating: 4.4, totalRatings: 85646 },
        { placeId: 'p-other', name: 'Bawarchi (Banjara Hills)', address: 'Road No 12, Hyderabad', rating: 4.1, totalRatings: 3021 },
    ];

    it('shows candidates, preselects the first, and confirms with its placeId', async () => {
        const searchPlaces = vi.fn().mockResolvedValue(candidates);
        const onConfirm = vi.fn();
        render(<PlacePicker defaults={{ name: 'Bawarchi', city: 'Hyderabad' }} api={{ searchPlaces }} onConfirm={onConfirm} />);

        expect(await screen.findByText('Bawarchi Test Kitchen')).toBeInTheDocument();
        expect(screen.getByRole('radio', { name: /Bawarchi Test Kitchen/ })).toHaveAttribute('aria-checked', 'true');
        expect(searchPlaces).toHaveBeenCalledWith({ name: 'Bawarchi', city: 'Hyderabad' });

        fireEvent.click(screen.getByRole('radio', { name: /Banjara Hills/ }));
        fireEvent.click(screen.getByRole('button', { name: /Yes, this is mine/i }));
        expect(onConfirm).toHaveBeenCalledWith(candidates[1]);
    });

    it('lets the owner search again under a different name', async () => {
        const searchPlaces = vi.fn().mockResolvedValueOnce(candidates).mockResolvedValueOnce([candidates[1]]);
        render(<PlacePicker defaults={{ name: 'Bawarchi', city: 'Hyderabad' }} api={{ searchPlaces }} onConfirm={() => {}} />);
        await screen.findByText('Bawarchi Test Kitchen');

        fireEvent.click(screen.getByRole('button', { name: /Search by a different name/i }));
        fireEvent.change(screen.getByLabelText(/Restaurant name/i), { target: { value: 'Bawarchi Banjara' } });
        fireEvent.click(screen.getByRole('button', { name: /Search again/i }));

        await waitFor(() => expect(searchPlaces).toHaveBeenLastCalledWith({ name: 'Bawarchi Banjara', city: 'Hyderabad' }));
        await waitFor(() => expect(screen.queryByText('Bawarchi Test Kitchen')).not.toBeInTheDocument());
    });

    it('first-run ScanFlow starts the scan with the confirmed placeId', async () => {
        const api = {
            searchPlaces: vi.fn().mockResolvedValue(candidates),
            startScan: vi.fn().mockResolvedValue({ scanId: 's1' }),
            getScan: vi.fn(),
            getReport: vi.fn(),
        };
        render(<ScanFlow variant="first-run" defaults={{ name: 'Bawarchi', city: 'Hyderabad' }} api={api} onReport={() => {}} />);
        await screen.findByText('Bawarchi Test Kitchen');
        fireEvent.click(screen.getByRole('button', { name: /Yes, this is mine/i }));
        await waitFor(() => expect(api.startScan).toHaveBeenCalledTimes(1));
        expect(api.startScan.mock.calls[0][0]).toMatchObject({ placeId: 'p-main', name: 'Bawarchi Test Kitchen' });
    });

    it('skips the picker when the profile already has a confirmed listing', () => {
        const api = { searchPlaces: vi.fn(), startScan: vi.fn(), getScan: vi.fn(), getReport: vi.fn() };
        render(<ScanFlow variant="first-run" defaults={{ name: 'Bawarchi', city: 'Hyderabad', placeId: 'p-main' }} api={api} onReport={() => {}} />);
        expect(screen.getByRole('button', { name: /Run first scan/i })).toBeInTheDocument();
        expect(screen.queryByTestId('place-picker')).not.toBeInTheDocument();
        expect(api.searchPlaces).not.toHaveBeenCalled();
    });
});

// ---------------------------------------------------------------- RP-004 ----

describe('RP-004 — Where they beat you never contradicts the report', () => {
    it('seeds gap rows from the report when the daily layer is empty', () => {
        const rows = rowsFromReport(DEMO_INTELLIGENCE_REPORT);
        expect(rows.length).toBeGreaterThan(0);
        // Every row is a real competitor from the report, never the merchant.
        expect(rows.every((r) => !r.isSelf && r.placeId !== DEMO_INTELLIGENCE_REPORT.base.placeId)).toBe(true);
        // A rival with a higher rating produces a rating gap.
        const better = DEMO_INTELLIGENCE_REPORT.topCompetitors.find((c) => c.rating > DEMO_INTELLIGENCE_REPORT.base.rating);
        if (better) {
            const row = rows.find((r) => r.placeId === better.placeId);
            expect(row?.beatsYou.some((g) => g.metric === 'rating')).toBe(true);
        }
    });

    it('says "nothing recorded" when there is no data, and "nobody ahead" when there is', () => {
        const { rerender } = render(<WhereTheyBeatYouView rows={[]} profilesByName={{}} onNavigate={() => {}} />);
        expect(screen.getByTestId('wtby-no-data')).toBeInTheDocument();

        rerender(
            <WhereTheyBeatYouView
                rows={[{ placeId: 'x', name: 'Rival', isSelf: false, google: { rating: 4.0, reviewCount: 10, newReviews: 0, photoCount: 1 }, beatsYou: [] }]}
                profilesByName={{}}
                onNavigate={() => {}}
            />,
        );
        expect(screen.getByTestId('wtby-no-gaps')).toBeInTheDocument();
    });
});

// ------------------------------------------------------------ vocabulary ----

describe('owner-facing copy helpers', () => {
    it('turns a city id into a human city', () => {
        expect(humanCity('city-hyderabad')).toBe('Hyderabad');
        expect(humanCity('city-new-delhi')).toBe('New Delhi');
        expect(humanCity('Bengaluru')).toBe('Bengaluru');
        expect(humanCity(undefined)).toBe('');
    });

    it('writes a "since your last scan" sentence from the deltas', () => {
        const line = whatChangedLine(DEMO_INTELLIGENCE_REPORT);
        expect(line).toMatch(/^Since your last scan, /);
        expect(line).toMatch(/score is up 3 points/);
        expect(line).toMatch(/opened nearby/);
        expect(whatChangedLine({ ...DEMO_INTELLIGENCE_REPORT, deltas: undefined })).toBeNull();
    });
});
