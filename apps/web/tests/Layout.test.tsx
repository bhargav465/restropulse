import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from './utils/test-utils';
import Layout from '../components/Layout';
import { ViewState } from '../types';

describe('Layout Component', () => {
    const mockSetView = vi.fn();
    const mockChildren = <div>Test Content</div>;

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should render children content', () => {
        render(
            <Layout currentView="DASHBOARD" setView={mockSetView} title="Dashboard">
                {mockChildren}
            </Layout>
        );

        expect(screen.getByText('Test Content')).toBeInTheDocument();
    });

    it('should display the RestroPulse branding', () => {
        render(
            <Layout currentView="DASHBOARD" setView={mockSetView} title="Dashboard">
                {mockChildren}
            </Layout>
        );

        expect(screen.getByText('RestroPulse')).toBeInTheDocument();
        expect(screen.getByText('R')).toBeInTheDocument(); // Logo text
    });

    it('should display the current title', () => {
        render(
            <Layout currentView="STUDIO" setView={mockSetView} title="Content Studio">
                {mockChildren}
            </Layout>
        );

        // Title is displayed
        const titleElement = screen.getByText((content, element) => {
            return element?.textContent === 'Content Studio';
        });
        expect(titleElement).toBeInTheDocument();
    });

    it('should render all navigation items', () => {
        render(
            <Layout currentView="DASHBOARD" setView={mockSetView} title="Dashboard">
                {mockChildren}
            </Layout>
        );

        const dashboardElements = screen.getAllByText('Dashboard');
        expect(dashboardElements.length).toBeGreaterThan(0);
        expect(screen.getByText('Studio')).toBeInTheDocument();
        expect(screen.getByText('Strategy')).toBeInTheDocument();
        expect(screen.getByText('Settings')).toBeInTheDocument();
    });

    it('should highlight the active navigation item', () => {
        render(
            <Layout currentView="DASHBOARD" setView={mockSetView} title="Dashboard">
                {mockChildren}
            </Layout>
        );

        const dashboardButtons = screen.getAllByText('Dashboard');
        const navDashboardButton = dashboardButtons.find(el => el.closest('button')?.querySelector('svg'));
        const studioButton = screen.getByText('Studio').closest('button');

        if (navDashboardButton) {
            expect(navDashboardButton.closest('button')).toHaveClass('text-orange-600');
        }
        expect(studioButton).toHaveClass('text-slate-400');
    });

    it('should call setView when Dashboard nav item is clicked', () => {
        render(
            <Layout currentView="STUDIO" setView={mockSetView} title="Studio">
                {mockChildren}
            </Layout>
        );

        const dashboardButton = screen.getByText('Dashboard').closest('button');
        fireEvent.click(dashboardButton!);

        expect(mockSetView).toHaveBeenCalledWith('DASHBOARD');
    });

    it('should call setView when Studio nav item is clicked', () => {
        render(
            <Layout currentView="DASHBOARD" setView={mockSetView} title="Dashboard">
                {mockChildren}
            </Layout>
        );

        const studioButton = screen.getByText('Studio').closest('button');
        fireEvent.click(studioButton!);

        expect(mockSetView).toHaveBeenCalledWith('STUDIO');
    });

    it('should call setView when Strategy nav item is clicked', () => {
        render(
            <Layout currentView="DASHBOARD" setView={mockSetView} title="Dashboard">
                {mockChildren}
            </Layout>
        );

        const strategyButton = screen.getByText('Strategy').closest('button');
        fireEvent.click(strategyButton!);

        expect(mockSetView).toHaveBeenCalledWith('STRATEGY');
    });

    it('should call setView when Settings nav item is clicked', () => {
        render(
            <Layout currentView="DASHBOARD" setView={mockSetView} title="Dashboard">
                {mockChildren}
            </Layout>
        );

        const settingsButton = screen.getByText('Settings').closest('button');
        fireEvent.click(settingsButton!);

        expect(mockSetView).toHaveBeenCalledWith('SETTINGS');
    });

    it('should call setView when central Inputs button is clicked', () => {
        render(
            <Layout currentView="DASHBOARD" setView={mockSetView} title="Dashboard">
                {mockChildren}
            </Layout>
        );

        // The central button doesn't have text, so we need to find it by class or role
        const inputsButtons = screen.getAllByRole('button');
        const centralButton = inputsButtons.find(btn =>
            btn.className.includes('w-14 h-14 rounded-full')
        );

        expect(centralButton).toBeDefined();
        fireEvent.click(centralButton!);

        expect(mockSetView).toHaveBeenCalledWith('INPUTS');
    });

    it('should apply different styling to central button when INPUTS is active', () => {
        const { rerender } = render(
            <Layout currentView="DASHBOARD" setView={mockSetView} title="Dashboard">
                {mockChildren}
            </Layout>
        );

        const inputsButtons = screen.getAllByRole('button');
        let centralButton = inputsButtons.find(btn =>
            btn.className.includes('w-14 h-14 rounded-full')
        );
        expect(centralButton).toHaveClass('bg-orange-600');

        rerender(
            <Layout currentView="INPUTS" setView={mockSetView} title="Inputs">
                {mockChildren}
            </Layout>
        );

        const inputsButtonsAfter = screen.getAllByRole('button');
        centralButton = inputsButtonsAfter.find(btn =>
            btn.className.includes('w-14 h-14 rounded-full')
        );
        expect(centralButton).toHaveClass('bg-slate-800');
    });

    it('should handle all ViewState values correctly', () => {
        const views: ViewState[] = ['DASHBOARD', 'STUDIO', 'INPUTS', 'STRATEGY', 'SETTINGS'];

        views.forEach(view => {
            const { unmount } = render(
                <Layout currentView={view} setView={mockSetView} title={view}>
                    {mockChildren}
                </Layout>
            );

            expect(screen.getByText('Test Content')).toBeInTheDocument();
            unmount();
        });
    });

    it('should have proper header structure', () => {
        render(
            <Layout currentView="DASHBOARD" setView={mockSetView} title="Dashboard">
                {mockChildren}
            </Layout>
        );

        const header = screen.getByRole('banner');
        expect(header).toBeInTheDocument();
        expect(header).toHaveClass('sticky');
    });

    it('should have proper navigation structure', () => {
        render(
            <Layout currentView="DASHBOARD" setView={mockSetView} title="Dashboard">
                {mockChildren}
            </Layout>
        );

        const nav = screen.getByRole('navigation');
        expect(nav).toBeInTheDocument();
        expect(nav).toHaveClass('fixed', 'bottom-0');
    });
});
