import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from './utils/test-utils';
import Dashboard from '../components/Dashboard';

// Mock the API module
vi.mock('../api', () => ({
    authAPI: {
        checkSession: vi.fn(),
    },
    postsAPI: {
        getAll: vi.fn(),
    },
}));

import { authAPI, postsAPI } from '../api';

describe('Dashboard Component', () => {
    const mockUser = {
        id: 'u1',
        email: 'test@test.com',
        name: 'Test User',
        restaurantId: 'r1',
        phone: '1234567890',
        role: 'OWNER' as const,
    };

    const mockPosts = [
        {
            id: 'p1',
            caption: 'Delicious pasta dish',
            type: 'IMAGE' as const,
            status: 'PENDING_APPROVAL' as const,
            thumbnail: '/pasta.jpg',
            platform: 'INSTAGRAM' as const,
        },
        {
            id: 'p2',
            caption: 'Fresh ingredients',
            type: 'VIDEO' as const,
            status: 'CHANGES_REQUESTED' as const,
            thumbnail: '/ingredients.jpg',
            platform: 'FACEBOOK' as const,
        },
        {
            id: 'p3',
            caption: 'Weekend special',
            type: 'IMAGE' as const,
            status: 'SCHEDULED' as const,
            thumbnail: '/special.jpg',
            platform: 'BOTH' as const,
            scheduledFor: '2024-12-25',
        },
    ];

    const mockRestaurant = {
        id: 'r1',
        name: 'Test Restaurant',
        cuisine: 'Italian',
        location: {
            address: 'Test Address',
            lat: 0,
            lng: 0,
            mapUrl: 'https://maps.example.com',
        },
        accountManager: {
            name: 'Manager',
            phone: '123',
            email: 'manager@test.com',
            avatar: '/avatar.jpg',
        },
        integrations: {
            whatsapp: true,
            instagram: true,
            facebook: false,
        },
        activeOffers: ['20% off on weekends'],
        chefSpecials: ['Truffle Risotto'],
    };

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(authAPI.checkSession).mockResolvedValue({ user: mockUser } as any);
        vi.mocked(postsAPI.getAll).mockResolvedValue(mockPosts);
    });

    describe('Initial Load', () => {
        it('should load and display user name', async () => {
            render(<Dashboard restaurantData={mockRestaurant} userName="Test User" />);

            await waitFor(() => {
                expect(screen.getByText('Welcome')).toBeInTheDocument();
                expect(screen.getByText('Test')).toBeInTheDocument();
            });
        });

        it('should call APIs on mount', async () => {
            render(<Dashboard restaurantData={mockRestaurant} />);

            await waitFor(() => {
                expect(postsAPI.getAll).toHaveBeenCalled();
            });
        });

        it('should handle API errors gracefully', async () => {
            vi.mocked(postsAPI.getAll).mockRejectedValue(new Error('API Error'));
            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

            render(<Dashboard restaurantData={mockRestaurant} />);

            await waitFor(() => {
                expect(consoleSpy).toHaveBeenCalledWith('Failed to load dashboard data:', expect.any(Error));
            });

            consoleSpy.mockRestore();
        });
    });

    describe('Pending Posts Banner', () => {
        it('should show action required banner when there are pending posts', async () => {
            render(<Dashboard restaurantData={mockRestaurant} />);

            await waitFor(() => {
                expect(screen.getByText('Posts Need Review')).toBeInTheDocument();
                expect(screen.getByText('2')).toBeInTheDocument();
            });
        });

        it('should not show banner when there are no pending posts', async () => {
            vi.mocked(postsAPI.getAll).mockResolvedValue([]);

            render(<Dashboard restaurantData={mockRestaurant} />);

            await waitFor(() => {
                expect(screen.queryByText('Posts Need Review')).not.toBeInTheDocument();
            });
        });

        it('should navigate to studio when banner is clicked', async () => {
            const mockSetView = vi.fn();
            render(<Dashboard restaurantData={mockRestaurant} setView={mockSetView} />);

            await waitFor(() => {
                const banner = screen.getByText('Posts Need Review').closest('button');
                fireEvent.click(banner!);
                expect(mockSetView).toHaveBeenCalledWith('STUDIO');
            });
        });
    });

    describe('Scheduled Posts', () => {
        it('should display next scheduled post', async () => {
            render(<Dashboard restaurantData={mockRestaurant} />);

            await waitFor(() => {
                expect(screen.getByText('Weekend special')).toBeInTheDocument();
                expect(screen.getByText(/Scheduled for Instagram & Facebook/i)).toBeInTheDocument();
            });
        });

        it('should show message when no scheduled posts', async () => {
            vi.mocked(postsAPI.getAll).mockResolvedValue([]);

            render(<Dashboard restaurantData={mockRestaurant} />);

            await waitFor(() => {
                expect(screen.getByText('No upcoming posts scheduled')).toBeInTheDocument();
            });
        });

        it('should navigate to studio when scheduled post is clicked', async () => {
            const mockSetView = vi.fn();
            render(<Dashboard restaurantData={mockRestaurant} setView={mockSetView} />);

            await waitFor(() => {
                const post = screen.getByText('Weekend special').closest('div');
                fireEvent.click(post!);
                expect(mockSetView).toHaveBeenCalledWith('STUDIO');
            });
        });
    });

    describe('Live Context Section', () => {
        it('should display active offers', async () => {
            render(<Dashboard restaurantData={mockRestaurant} />);

            await waitFor(() => {
                expect(screen.getByText('20% off on weekends')).toBeInTheDocument();
                expect(screen.getByText('Active Offer')).toBeInTheDocument();
            });
        });

        it('should display chef specials', async () => {
            render(<Dashboard restaurantData={mockRestaurant} />);

            await waitFor(() => {
                expect(screen.getByText('Truffle Risotto')).toBeInTheDocument();
            });
        });

        it('should not show live context section when no offers or specials', async () => {
            const emptyRestaurant = {
                ...mockRestaurant,
                activeOffers: [],
                chefSpecials: [],
            };

            render(<Dashboard restaurantData={emptyRestaurant} />);

            await waitFor(() => {
                expect(screen.queryByText('Live on Profile')).not.toBeInTheDocument();
            });
        });

        it('should navigate to inputs when Edit button is clicked', async () => {
            const mockSetView = vi.fn();
            render(<Dashboard restaurantData={mockRestaurant} setView={mockSetView} />);

            await waitFor(() => {
                const editButton = screen.getByText('Edit');
                fireEvent.click(editButton);
                expect(mockSetView).toHaveBeenCalledWith('INPUTS');
            });
        });
    });

    describe('Pending Posts Banner', () => {
        it('should show action required banner when there are pending posts', async () => {
            render(<Dashboard restaurantData={mockRestaurant} />);

            await waitFor(() => {
                expect(screen.getByText('Posts Need Review')).toBeInTheDocument();
                expect(screen.getByText('2')).toBeInTheDocument();
            });
        });
    });

    describe('Header Display', () => {
        it('should display Up Next header', async () => {
            render(<Dashboard restaurantData={mockRestaurant} />);

            await waitFor(() => {
                expect(screen.getByText('Up Next')).toBeInTheDocument();
            });
        });

        it('should show Live on Profile header when context exists', async () => {
            render(<Dashboard restaurantData={mockRestaurant} />);

            await waitFor(() => {
                expect(screen.getByText('Live on Profile')).toBeInTheDocument();
            });
        });
    });

    describe('Pull to Refresh', () => {
        it('should handle touch start at scroll top', () => {
            render(<Dashboard restaurantData={mockRestaurant} />);

            const container = document.body;

            Object.defineProperty(window, 'scrollY', { value: 0, writable: true });

            fireEvent.touchStart(container, { touches: [{ clientY: 100 }] });
        });

        it('should track pull distance on touch move', () => {
            render(<Dashboard restaurantData={mockRestaurant} />);

            const container = document.body;

            Object.defineProperty(window, 'scrollY', { value: 0, writable: true });

            fireEvent.touchStart(container, { touches: [{ clientY: 100 }] });
            fireEvent.touchMove(container, { touches: [{ clientY: 150 }] });
        });

        it('should trigger refresh on sufficient pull', () => {
            vi.useFakeTimers();

            render(<Dashboard restaurantData={mockRestaurant} />);

            const container = document.body;

            Object.defineProperty(window, 'scrollY', { value: 0, writable: true });

            fireEvent.touchStart(container, { touches: [{ clientY: 100 }] });
            fireEvent.touchMove(container, { touches: [{ clientY: 180 }] });
            fireEvent.touchEnd(container);

            vi.advanceTimersByTime(1500);

            vi.useRealTimers();
        });

        it('should not trigger refresh on small pull', () => {
            render(<Dashboard restaurantData={mockRestaurant} />);

            const container = document.body;

            Object.defineProperty(window, 'scrollY', { value: 0, writable: true });

            fireEvent.touchStart(container, { touches: [{ clientY: 100 }] });
            fireEvent.touchMove(container, { touches: [{ clientY: 120 }] });
            fireEvent.touchEnd(container);
        });

        it('should not start pull when not at scroll top', () => {
            render(<Dashboard restaurantData={mockRestaurant} />);

            const container = document.body;

            Object.defineProperty(window, 'scrollY', { value: 100, writable: true });

            fireEvent.touchStart(container, { touches: [{ clientY: 100 }] });
            fireEvent.touchMove(container, { touches: [{ clientY: 150 }] });
        });
    });
});
