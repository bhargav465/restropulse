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
        expect(screen.getByText(/No snapshots for this period yet/i)).toBeInTheDocument();
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
        expect(screen.getByRole('button', { name: /Same cuisine & AOV \(1\)/i })).toBeInTheDocument();
    });
});
