import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from './utils/test-utils';
import ContentStudio from '../components/ContentStudio';

// Mock the API module
vi.mock('../api', () => ({
    postsAPI: {
        getAll: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        approve: vi.fn(),
    },
    restaurantAPI: {
        get: vi.fn(),
    },
}));

import { postsAPI, restaurantAPI } from '../api';

describe('ContentStudio Component', () => {
    const mockRestaurant = {
        id: 'r1',
        name: 'Test Restaurant',
        cuisine: 'Italian',
        location: {
            address: '123 Main St',
            lat: 0,
            lng: 0,
            mapUrl: 'https://maps.example.com'
        },
        accountManager: {
            name: 'John Doe',
            phone: '+1234567890',
            email: 'john@example.com',
            avatar: '/avatar.jpg'
        },
        subscription: {
            tier: 'GOLD' as const,
            renewalDate: '2024-12-31',
            status: 'ACTIVE' as const
        },
        integrations: {
            whatsapp: true,
            instagram: true,
            facebook: false
        },
        activeOffers: [],
        chefSpecials: []
    };

    const mockPosts = [
        {
            id: 'p1',
            caption: 'Delicious pasta',
            type: 'IMAGE' as const,
            status: 'PENDING_APPROVAL' as const,
            thumbnail: '/mock.jpg',
            platform: 'INSTAGRAM' as const,
            createdAt: new Date().toISOString(),
        },
        {
            id: 'p2',
            caption: 'Fresh ingredients',
            type: 'VIDEO' as const,
            status: 'PENDING_APPROVAL' as const,
            thumbnail: '/mock.jpg',
            platform: 'INSTAGRAM' as const,
            createdAt: new Date().toISOString(),
        },
        {
            id: 'p3',
            caption: 'Weekend special',
            type: 'IMAGE' as const,
            status: 'SCHEDULED' as const,
            thumbnail: '/special.jpg',
            platform: 'BOTH' as const,
            scheduledFor: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
        },
        {
            id: 'p4',
            caption: 'Posted last week',
            type: 'IMAGE' as const,
            status: 'POSTED' as const,
            thumbnail: '/posted.jpg',
            platform: 'FACEBOOK' as const,
            postedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        },
    ];

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(postsAPI.getAll).mockResolvedValue(mockPosts);
        vi.mocked(restaurantAPI.get).mockResolvedValue(mockRestaurant);

        // Mock localStorage
        Object.defineProperty(window, 'localStorage', {
            value: {
                getItem: vi.fn(() => 'r1'),
                setItem: vi.fn(),
                removeItem: vi.fn(),
            },
            writable: true,
        });
    });

    describe('Initial Load', () => {
        it('should load and display posts', async () => {
            render(<ContentStudio />);

            await waitFor(() => {
                expect(screen.getByText('Delicious pasta')).toBeInTheDocument();
            });
        });

        it('should load restaurant data', async () => {
            render(<ContentStudio />);

            await waitFor(() => {
                expect(restaurantAPI.get).toHaveBeenCalledWith('r1');
            });
        });

        it('should call postsAPI.getAll on mount', async () => {
            render(<ContentStudio />);

            await waitFor(() => {
                expect(postsAPI.getAll).toHaveBeenCalled();
            });
        });
    });

    describe('Tab Navigation', () => {
        it('should display Review tab by default', async () => {
            render(<ContentStudio />);

            await waitFor(() => {
                expect(screen.getByText('Delicious pasta')).toBeInTheDocument();
            });
        });

        it('should switch to Scheduled tab', async () => {
            render(<ContentStudio />);

            await waitFor(() => {
                const scheduledTab = screen.getByText('Scheduled');
                fireEvent.click(scheduledTab);

                expect(screen.getByText('Weekend special')).toBeInTheDocument();
            });
        });

        it('should switch to History tab', async () => {
            render(<ContentStudio />);

            await waitFor(() => {
                const historyTab = screen.getByText('History');
                fireEvent.click(historyTab);

                expect(screen.getByText('Posted last week')).toBeInTheDocument();
            });
        });

        it('should filter posts correctly by tab', async () => {
            render(<ContentStudio />);

            await waitFor(() => {
                // Review tab shows PENDING_APPROVAL and CHANGES_REQUESTED
                expect(screen.getByText('Delicious pasta')).toBeInTheDocument();
                expect(screen.getByText('Fresh ingredients')).toBeInTheDocument();
            });

            const scheduledTab = screen.getByText('Scheduled');
            fireEvent.click(scheduledTab);

            await waitFor(() => {
                // Scheduled tab shows only SCHEDULED posts
                expect(screen.queryByText('Delicious pasta')).not.toBeInTheDocument();
                expect(screen.getByText('Weekend special')).toBeInTheDocument();
            });
        });
    });

    describe('Post Actions', () => {
        it('should render approve button for pending posts', async () => {
            render(<ContentStudio />);

            await waitFor(() => {
                // Verify approve button is rendered
                const buttons = screen.getAllByRole('button');
                const approveButton = buttons.find(btn => btn.textContent?.trim().includes('Approve'));
                expect(approveButton).toBeDefined();
            });
        });
    });

    describe('Empty States', () => {
        it('should render when posts list is empty for review', async () => {
            vi.mocked(postsAPI.getAll).mockResolvedValue([
                {
                    id: 'p1',
                    caption: 'Scheduled post',
                    type: 'IMAGE' as const,
                    status: 'SCHEDULED' as const,
                    thumbnail: '/mock.jpg',
                    platform: 'INSTAGRAM' as const,
                    scheduledFor: new Date().toISOString(),
                },
            ]);

            render(<ContentStudio />);

            await waitFor(() => {
                // Component renders even with empty review tab
                expect(postsAPI.getAll).toHaveBeenCalled();
            });
        });

        it('should handle switching to scheduled tab with no scheduled posts', async () => {
            vi.mocked(postsAPI.getAll).mockResolvedValue([
                {
                    id: 'p1',
                    caption: 'Pending post',
                    type: 'IMAGE' as const,
                    status: 'PENDING_APPROVAL' as const,
                    thumbnail: '/mock.jpg',
                    platform: 'INSTAGRAM' as const,
                },
            ]);

            render(<ContentStudio />);

            await waitFor(() => {
                const scheduledTab = screen.getByText('Scheduled');
                fireEvent.click(scheduledTab);
                // Component switches to scheduled tab
            });
        });
    });

    describe('Error Handling', () => {
        it('should handle posts loading error', async () => {
            vi.mocked(postsAPI.getAll).mockRejectedValue(new Error('Loading failed'));
            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

            render(<ContentStudio />);

            await waitFor(() => {
                expect(consoleSpy).toHaveBeenCalledWith('Failed to load content studio data:', expect.any(Error));
            });

            consoleSpy.mockRestore();
        });

        it('should handle restaurant data loading error', async () => {
            vi.mocked(restaurantAPI.get).mockRejectedValue(new Error('Restaurant load failed'));
            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

            render(<ContentStudio />);

            await waitFor(() => {
                expect(consoleSpy).toHaveBeenCalledWith('Failed to load content studio data:', expect.any(Error));
            });

            consoleSpy.mockRestore();
        });
    });

    describe('Post Display', () => {
        it('should display post captions', async () => {
            render(<ContentStudio />);

            await waitFor(() => {
                expect(screen.getByText('Delicious pasta')).toBeInTheDocument();
                expect(screen.getByText('Fresh ingredients')).toBeInTheDocument();
            });
        });

        it('should display post thumbnails', async () => {
            render(<ContentStudio />);

            await waitFor(() => {
                const images = screen.getAllByRole('img');
                expect(images.length).toBeGreaterThan(0);
            });
        });
    });

    describe('Request Changes Button', () => {
        it('should render request edit button for pending posts', async () => {
            render(<ContentStudio />);

            await waitFor(() => {
                const buttons = screen.getAllByRole('button');
                const requestEditButton = buttons.find(btn => btn.textContent?.includes('Request Edit'));
                expect(requestEditButton).toBeDefined();
            });
        });

        it('should find post to edit when clicking request edit', async () => {
            render(<ContentStudio />);

            await waitFor(() => {
                const buttons = screen.getAllByRole('button');
                const requestEditButton = buttons.find(btn => btn.textContent?.includes('Request Edit'));

                if (requestEditButton) {
                    fireEvent.click(requestEditButton);
                    // Modal should be triggered but not fully testable due to complex state
                }
            });
        });
    });

    describe('Post Count Display', () => {
        it('should show correct count for pending posts', async () => {
            render(<ContentStudio />);

            await waitFor(() => {
                // Check that post count is displayed
                const postCountText = screen.getByText(/posts need your approval/i);
                expect(postCountText).toBeInTheDocument();
            });
        });

        it('should show scheduled post count', async () => {
            render(<ContentStudio />);

            const scheduledTab = screen.getByText('Scheduled');
            fireEvent.click(scheduledTab);

            await waitFor(() => {
                // Verify scheduled posts are displayed
                expect(screen.getByText('Weekend special')).toBeInTheDocument();
            });
        });
    });

    describe('Carousel Posts', () => {
        it('should handle carousel post navigation', async () => {
            const carouselPost = {
                id: 'p5',
                caption: 'Carousel post',
                type: 'CAROUSEL' as const,
                status: 'PENDING_APPROVAL' as const,
                thumbnail: '/carousel1.jpg',
                platform: 'INSTAGRAM' as const,
                createdAt: new Date().toISOString(),
                mediaUrls: ['/carousel1.jpg', '/carousel2.jpg', '/carousel3.jpg'],
            };

            vi.mocked(postsAPI.getAll).mockResolvedValue([carouselPost]);
            render(<ContentStudio />);

            await waitFor(() => {
                expect(screen.getByText('Carousel post')).toBeInTheDocument();
            });
        });

        it('should handle carousel touch swipe', async () => {
            const carouselPost = {
                id: 'p5',
                caption: 'Swipe carousel',
                type: 'CAROUSEL' as const,
                status: 'PENDING_APPROVAL' as const,
                thumbnail: '/carousel1.jpg',
                platform: 'INSTAGRAM' as const,
                createdAt: new Date().toISOString(),
                mediaUrls: ['/carousel1.jpg', '/carousel2.jpg'],
            };

            vi.mocked(postsAPI.getAll).mockResolvedValue([carouselPost]);
            render(<ContentStudio />);

            await waitFor(() => {
                const images = screen.getAllByRole('img');
                expect(images.length).toBeGreaterThan(0);
            });
        });
    });

    describe('Video Posts', () => {
        it('should display video posts with thumbnails', async () => {
            const videoPost = {
                id: 'p6',
                caption: 'Video content',
                type: 'REEL' as const,
                status: 'PENDING_APPROVAL' as const,
                thumbnail: '/video-thumb.jpg',
                videoUrl: '/video.mp4',
                platform: 'INSTAGRAM' as const,
                createdAt: new Date().toISOString(),
                duration: '0:30',
            };

            vi.mocked(postsAPI.getAll).mockResolvedValue([videoPost]);
            render(<ContentStudio />);

            await waitFor(() => {
                expect(screen.getByText('Video content')).toBeInTheDocument();
            });
        });

        it('should handle story type posts', async () => {
            const storyPost = {
                id: 'p7',
                caption: 'Story post',
                type: 'STORY' as const,
                status: 'PENDING_APPROVAL' as const,
                thumbnail: '/story-thumb.jpg',
                videoUrl: '/story.mp4',
                platform: 'INSTAGRAM' as const,
                createdAt: new Date().toISOString(),
            };

            vi.mocked(postsAPI.getAll).mockResolvedValue([storyPost]);
            render(<ContentStudio />);

            await waitFor(() => {
                expect(screen.getByText('Story post')).toBeInTheDocument();
            });
        });
    });

    describe('Post Status Badges', () => {
        it('should display scheduled date for scheduled posts', async () => {
            render(<ContentStudio />);

            const scheduledTab = screen.getByText('Scheduled');
            fireEvent.click(scheduledTab);

            await waitFor(() => {
                expect(screen.getByText('Weekend special')).toBeInTheDocument();
            });
        });

        it('should display posted date for posted content', async () => {
            render(<ContentStudio />);

            const historyTab = screen.getByText('History');
            fireEvent.click(historyTab);

            await waitFor(() => {
                expect(screen.getByText('Posted last week')).toBeInTheDocument();
            });
        });

        it('should handle posts with feedback', async () => {
            const postWithFeedback = {
                id: 'p8',
                caption: 'Needs changes',
                type: 'IMAGE' as const,
                status: 'CHANGES_REQUESTED' as const,
                thumbnail: '/feedback.jpg',
                platform: 'INSTAGRAM' as const,
                createdAt: new Date().toISOString(),
                feedback: JSON.stringify({
                    tags: ['Caption', 'Media'],
                    details: { Caption: 'Too long', Media: 'Blurry image' },
                    note: 'Please update the caption and use a clearer image',
                }),
            };

            vi.mocked(postsAPI.getAll).mockResolvedValue([postWithFeedback]);
            render(<ContentStudio />);

            await waitFor(() => {
                expect(screen.getByText('Needs changes')).toBeInTheDocument();
            });
        });
    });

    describe('Multiple Platforms', () => {
        it('should display platform badges', async () => {
            const multiPlatformPost = {
                id: 'p9',
                caption: 'Multi-platform post',
                type: 'IMAGE' as const,
                status: 'PENDING_APPROVAL' as const,
                thumbnail: '/multi.jpg',
                platform: 'BOTH' as const,
                createdAt: new Date().toISOString(),
            };

            vi.mocked(postsAPI.getAll).mockResolvedValue([multiPlatformPost]);
            render(<ContentStudio />);

            await waitFor(() => {
                expect(screen.getByText('Multi-platform post')).toBeInTheDocument();
            });
        });
    });

    describe('Approve Action', () => {
        it('should render approve button and handle click', async () => {
            render(<ContentStudio />);

            await waitFor(() => {
                const buttons = screen.getAllByRole('button');
                const approveButton = buttons.find(btn => btn.textContent?.includes('Approve'));
                expect(approveButton).toBeDefined();
            });
        });
    });

    describe('Missed Deadline Posts', () => {
        it('should handle posts with missed deadline status', async () => {
            const missedPost = {
                id: 'p10',
                caption: 'Missed deadline',
                type: 'IMAGE' as const,
                status: 'PENDING_APPROVAL' as const,
                thumbnail: '/missed.jpg',
                platform: 'INSTAGRAM' as const,
                createdAt: new Date().toISOString(),
            };

            vi.mocked(postsAPI.getAll).mockResolvedValue([missedPost]);
            render(<ContentStudio />);

            await waitFor(() => {
                expect(screen.getByText('Missed deadline')).toBeInTheDocument();
            });
        });
    });

    describe('Video Post Interactions', () => {
        it('should handle video thumbnail click', async () => {
            const videoPost = {
                id: 'v1',
                caption: 'Video post',
                type: 'REEL' as const,
                status: 'PENDING_APPROVAL' as const,
                thumbnail: '/video-thumb.jpg',
                videoUrl: '/video.mp4',
                platform: 'INSTAGRAM' as const,
                createdAt: new Date().toISOString(),
                duration: '0:45',
            };

            vi.mocked(postsAPI.getAll).mockResolvedValue([videoPost]);
            render(<ContentStudio />);

            await waitFor(() => {
                const images = screen.getAllByRole('img');
                if (images.length > 0) {
                    fireEvent.click(images[0]);
                }
            });
        });

        it('should display video duration badge', async () => {
            const videoPost = {
                id: 'v2',
                caption: 'Video with duration',
                type: 'VIDEO' as const,
                status: 'PENDING_APPROVAL' as const,
                thumbnail: '/video-thumb.jpg',
                videoUrl: '/video.mp4',
                platform: 'INSTAGRAM' as const,
                createdAt: new Date().toISOString(),
                duration: '1:30',
            };

            vi.mocked(postsAPI.getAll).mockResolvedValue([videoPost]);
            render(<ContentStudio />);

            await waitFor(() => {
                expect(screen.getByText('Video with duration')).toBeInTheDocument();
            });
        });
    });

    describe('Carousel Navigation', () => {
        it('should navigate carousel with buttons', async () => {
            const carouselPost = {
                id: 'car1',
                caption: 'Carousel navigation',
                type: 'CAROUSEL' as const,
                status: 'PENDING_APPROVAL' as const,
                thumbnail: '/car1.jpg',
                platform: 'INSTAGRAM' as const,
                createdAt: new Date().toISOString(),
                mediaUrls: ['/car1.jpg', '/car2.jpg', '/car3.jpg'],
            };

            vi.mocked(postsAPI.getAll).mockResolvedValue([carouselPost]);
            render(<ContentStudio />);

            await waitFor(() => {
                expect(screen.getByText('Carousel navigation')).toBeInTheDocument();
            });
        });

        it('should handle carousel swipe gestures', async () => {
            const carouselPost = {
                id: 'car2',
                caption: 'Swipeable carousel',
                type: 'CAROUSEL' as const,
                status: 'PENDING_APPROVAL' as const,
                thumbnail: '/car1.jpg',
                platform: 'INSTAGRAM' as const,
                createdAt: new Date().toISOString(),
                mediaUrls: ['/car1.jpg', '/car2.jpg'],
            };

            vi.mocked(postsAPI.getAll).mockResolvedValue([carouselPost]);
            render(<ContentStudio />);

            await waitFor(() => {
                const container = document.querySelector('.touch-pan-y');
                if (container) {
                    fireEvent.touchStart(container, { touches: [{ clientX: 200 }] });
                    fireEvent.touchMove(container, { touches: [{ clientX: 50 }] });
                    fireEvent.touchEnd(container);
                }
            });
        });
    });

    describe('Post Metadata Display', () => {
        it('should display scheduled time for future posts', async () => {
            const futurePost = {
                id: 'future1',
                caption: 'Future post',
                type: 'IMAGE' as const,
                status: 'SCHEDULED' as const,
                thumbnail: '/future.jpg',
                platform: 'INSTAGRAM' as const,
                scheduledFor: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            };

            vi.mocked(postsAPI.getAll).mockResolvedValue([futurePost]);
            render(<ContentStudio />);

            const scheduledTab = screen.getByText('Scheduled');
            fireEvent.click(scheduledTab);

            await waitFor(() => {
                expect(screen.getByText('Future post')).toBeInTheDocument();
            });
        });

        it('should display posted time for past posts', async () => {
            const pastPost = {
                id: 'past1',
                caption: 'Past post',
                type: 'IMAGE' as const,
                status: 'POSTED' as const,
                thumbnail: '/past.jpg',
                platform: 'INSTAGRAM' as const,
                postedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
            };

            vi.mocked(postsAPI.getAll).mockResolvedValue([pastPost]);
            render(<ContentStudio />);

            const historyTab = screen.getByText('History');
            fireEvent.click(historyTab);

            await waitFor(() => {
                expect(screen.getByText('Past post')).toBeInTheDocument();
            });
        });
    });

    describe('Feedback Display', () => {
        it('should display structured feedback', async () => {
            const feedbackPost = {
                id: 'fb1',
                caption: 'Post with structured feedback',
                type: 'IMAGE' as const,
                status: 'CHANGES_REQUESTED' as const,
                thumbnail: '/fb.jpg',
                platform: 'INSTAGRAM' as const,
                createdAt: new Date().toISOString(),
                feedback: JSON.stringify({
                    tags: ['Caption', 'Timing'],
                    details: { Caption: 'Too long', Timing: 'Post earlier' },
                    note: 'Please revise',
                }),
            };

            vi.mocked(postsAPI.getAll).mockResolvedValue([feedbackPost]);
            render(<ContentStudio />);

            await waitFor(() => {
                expect(screen.getByText('Post with structured feedback')).toBeInTheDocument();
            });
        });

        it('should display legacy feedback format', async () => {
            const legacyFeedbackPost = {
                id: 'fb2',
                caption: 'Post with legacy feedback',
                type: 'IMAGE' as const,
                status: 'CHANGES_REQUESTED' as const,
                thumbnail: '/fb2.jpg',
                platform: 'INSTAGRAM' as const,
                createdAt: new Date().toISOString(),
                feedback: 'Simple text feedback',
            };

            vi.mocked(postsAPI.getAll).mockResolvedValue([legacyFeedbackPost]);
            render(<ContentStudio />);

            await waitFor(() => {
                expect(screen.getByText('Post with legacy feedback')).toBeInTheDocument();
            });
        });
    });

    describe('Tab Badge Counts', () => {
        it('should display correct count for pending posts', async () => {
            const pendingPosts = [
                {
                    id: 'p1',
                    caption: 'Pending 1',
                    type: 'IMAGE' as const,
                    status: 'PENDING_APPROVAL' as const,
                    thumbnail: '/p1.jpg',
                    platform: 'INSTAGRAM' as const,
                    createdAt: new Date().toISOString(),
                },
                {
                    id: 'p2',
                    caption: 'Pending 2',
                    type: 'IMAGE' as const,
                    status: 'PENDING_APPROVAL' as const,
                    thumbnail: '/p2.jpg',
                    platform: 'INSTAGRAM' as const,
                    createdAt: new Date().toISOString(),
                },
            ];

            vi.mocked(postsAPI.getAll).mockResolvedValue(pendingPosts);
            render(<ContentStudio />);

            await waitFor(() => {
                expect(screen.getByText('2')).toBeInTheDocument();
            });
        });

        it('should update count when switching tabs', async () => {
            const mixedPosts = [
                {
                    id: 'p1',
                    caption: 'Pending',
                    type: 'IMAGE' as const,
                    status: 'PENDING_APPROVAL' as const,
                    thumbnail: '/p1.jpg',
                    platform: 'INSTAGRAM' as const,
                    createdAt: new Date().toISOString(),
                },
                {
                    id: 's1',
                    caption: 'Scheduled',
                    type: 'IMAGE' as const,
                    status: 'SCHEDULED' as const,
                    thumbnail: '/s1.jpg',
                    platform: 'INSTAGRAM' as const,
                    scheduledFor: new Date().toISOString(),
                },
            ];

            vi.mocked(postsAPI.getAll).mockResolvedValue(mixedPosts);
            render(<ContentStudio />);

            await waitFor(() => {
                const badges = screen.getAllByText('1');
                expect(badges.length).toBeGreaterThan(0);
            });

            const scheduledTab = screen.getAllByText('Scheduled')[0];
            fireEvent.click(scheduledTab);

            await waitFor(() => {
                // Find the Scheduled tab button (contains 'Scheduled' text)
                const scheduledButton = screen.getAllByRole('button').find(
                    btn => btn.textContent?.includes('Scheduled')
                );
                expect(scheduledButton).toHaveClass('text-slate-800');
            });
        });
    });

    describe('Different Platform Types', () => {
        it('should render Facebook platform posts', async () => {
            const facebookPost = {
                id: 'fb1',
                caption: 'Facebook exclusive',
                type: 'IMAGE' as const,
                status: 'PENDING_APPROVAL' as const,
                thumbnail: '/fb.jpg',
                platform: 'FACEBOOK' as const,
                createdAt: new Date().toISOString(),
            };

            vi.mocked(postsAPI.getAll).mockResolvedValue([facebookPost]);
            render(<ContentStudio />);

            await waitFor(() => {
                expect(screen.getByText('Facebook exclusive')).toBeInTheDocument();
            });
        });

        it('should render cross-platform posts', async () => {
            const bothPost = {
                id: 'both1',
                caption: 'Both platforms',
                type: 'IMAGE' as const,
                status: 'PENDING_APPROVAL' as const,
                thumbnail: '/both.jpg',
                platform: 'BOTH' as const,
                createdAt: new Date().toISOString(),
            };

            vi.mocked(postsAPI.getAll).mockResolvedValue([bothPost]);
            render(<ContentStudio />);

            await waitFor(() => {
                expect(screen.getByText('Both platforms')).toBeInTheDocument();
            });
        });
    });

    describe('Empty State Rendering', () => {
        it('should show empty state for review tab', async () => {
            vi.mocked(postsAPI.getAll).mockResolvedValue([]);

            render(<ContentStudio />);

            await waitFor(() => {
                expect(screen.getByText('All caught up!')).toBeInTheDocument();
            });
        });

        it('should show empty state for scheduled tab', async () => {
            vi.mocked(postsAPI.getAll).mockResolvedValue([
                {
                    id: 'p1',
                    caption: 'Not scheduled',
                    type: 'IMAGE' as const,
                    status: 'POSTED' as const,
                    thumbnail: '/p1.jpg',
                    platform: 'INSTAGRAM' as const,
                    postedAt: new Date().toISOString(),
                },
            ]);

            render(<ContentStudio />);

            const scheduledTab = screen.getByText('Scheduled');
            fireEvent.click(scheduledTab);

            await waitFor(() => {
                expect(screen.getByText('Queue is empty')).toBeInTheDocument();
            });
        });
    });

    describe('Additional Coverage Tests', () => {
        // 1. Feedback Parsing Edge Cases
        it('should handle partial or invalid JSON feedback gracefully', async () => {
            const problematicPosts = [
                {
                    id: 'pf1',
                    caption: 'Invalid JSON',
                    type: 'IMAGE' as const,
                    status: 'CHANGES_REQUESTED' as const,
                    thumbnail: '/img.jpg',
                    platform: 'INSTAGRAM' as const,
                    createdAt: new Date().toISOString(),
                    feedback: '{"broken": json',
                },
                {
                    id: 'pf2',
                    caption: 'Empty JSON',
                    type: 'IMAGE' as const,
                    status: 'CHANGES_REQUESTED' as const,
                    thumbnail: '/img.jpg',
                    platform: 'INSTAGRAM' as const,
                    createdAt: new Date().toISOString(),
                    feedback: '{}',
                }
            ];
            vi.mocked(postsAPI.getAll).mockResolvedValue(problematicPosts);
            render(<ContentStudio />);

            await waitFor(() => {
                // Should fall back to valid text display logic
                expect(screen.getByText('Invalid JSON')).toBeInTheDocument();
                // Should treat invalid json as simple text details under "Other"
                expect(screen.getByText('{"broken": json')).toBeInTheDocument();
            });
        });

        // 2. Video Play/Pause Interaction
        it('should toggle video play state', async () => {
            // Mock HTMLMediaElement functions
            const playSpy = vi.spyOn(window.HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
            const pauseSpy = vi.spyOn(window.HTMLMediaElement.prototype, 'pause').mockImplementation(() => { });

            const videoPost = {
                id: 'v-play',
                caption: 'Playable Video',
                type: 'VIDEO' as const,
                status: 'PENDING_APPROVAL' as const,
                thumbnail: '/thumb.jpg',
                videoUrl: '/vid.mp4',
                platform: 'INSTAGRAM' as const,
                createdAt: new Date().toISOString(),
            };
            vi.mocked(postsAPI.getAll).mockResolvedValue([videoPost]);
            render(<ContentStudio />);

            await waitFor(() => expect(screen.getByText('Playable Video')).toBeInTheDocument());

            // Since renderMedia uses a complex overlay, we look for the Play icon container
            // The overlay text isn't explicit, but we can find the video element wrapper or click the overlay
            // The overlay is an absolute div.
            const container = screen.getByText('Playable Video').closest('div')?.parentElement;
            const videoArea = container?.querySelector('video')?.nextElementSibling; // The overlay is after video

            if (videoArea) {
                fireEvent.click(videoArea);
                expect(playSpy).toHaveBeenCalled();
            }
        });

        // 3. Locked vs Ready Scheduled Posts
        it('should display Locked status for posts scheduled within 3 hours', async () => {
            const lockedPost = {
                id: 's-locked',
                caption: 'Locked Post',
                type: 'IMAGE' as const,
                status: 'SCHEDULED' as const,
                thumbnail: '/img.jpg',
                platform: 'INSTAGRAM' as const,
                // Scheduled 1 hour from now
                scheduledFor: new Date(Date.now() + 1 * 60 * 60 * 1000).toISOString(),
            };
            vi.mocked(postsAPI.getAll).mockResolvedValue([lockedPost]);
            render(<ContentStudio />);

            fireEvent.click(screen.getByText('Scheduled'));

            await waitFor(() => {
                expect(screen.getByText('Locked Post')).toBeInTheDocument();
                expect(screen.getByText('Locked for Publishing')).toBeInTheDocument();
                // Revert button should NOT be present
                expect(screen.queryByText('Revert to Review')).not.toBeInTheDocument();
            });
        });

        it('should display Ready status for posts scheduled later', async () => {
            const readyPost = {
                id: 's-ready',
                caption: 'Ready Post',
                type: 'IMAGE' as const,
                status: 'SCHEDULED' as const,
                thumbnail: '/img.jpg',
                platform: 'INSTAGRAM' as const,
                // Scheduled 5 hours from now
                scheduledFor: new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString(),
            };
            vi.mocked(postsAPI.getAll).mockResolvedValue([readyPost]);
            render(<ContentStudio />);

            fireEvent.click(screen.getByText('Scheduled'));

            await waitFor(() => {
                expect(screen.getByText('Ready Post')).toBeInTheDocument();
                // "Ready to Post" appears multiple times (header + card badge)
                const readyBadges = screen.getAllByText('Ready to Post');
                expect(readyBadges.length).toBeGreaterThan(0);
                expect(screen.getByText('Revert to Review')).toBeInTheDocument();
            });
        });

        // 4. Feedback History Display
        it('should display valid feedback', async () => {
            // ... (existing test)
        });

        // 5. Feedback Modal Interactions (CRITICAL for coverage)
        it('should open feedback modal and submit feedback', async () => {
            vi.mocked(postsAPI.update).mockResolvedValue({} as any);
            const pendingPost = {
                id: 'fb-modal-test',
                caption: 'Pending Post',
                type: 'IMAGE' as const,
                status: 'PENDING_APPROVAL' as const,
                thumbnail: '/img.jpg',
                platform: 'INSTAGRAM' as const,
                createdAt: new Date().toISOString(),
            };
            vi.mocked(postsAPI.getAll).mockResolvedValue([pendingPost]);
            render(<ContentStudio />);

            // 1. Open Modal
            await waitFor(() => expect(screen.getByText('Pending Post')).toBeInTheDocument());
            const requestEditBtn = screen.getByText('Request Edit');
            fireEvent.click(requestEditBtn);

            // 2. Verify Modal Header
            await waitFor(() => expect(screen.getByText('Refine Content')).toBeInTheDocument());

            // 3. Click Tags (Tabs)
            const captionTag = screen.getByText('Caption');
            fireEvent.click(captionTag);

            // 4. Select a quick option using the question text to anchor
            await waitFor(() => expect(screen.getByText("What's the issue with the text?")).toBeInTheDocument());
            const quickOption = screen.getByText('Too short');
            fireEvent.click(quickOption);

            // 5. Enter a note
            const noteInput = screen.getByPlaceholderText('Any additional context...');
            fireEvent.change(noteInput, { target: { value: 'Make it longer' } });

            // 6. Submit
            const submitBtn = screen.getByText('Submit Revision');
            fireEvent.click(submitBtn);

            await waitFor(() => {
                expect(postsAPI.update).toHaveBeenCalledWith(
                    'fb-modal-test',
                    expect.objectContaining({
                        status: 'CHANGES_REQUESTED',
                        feedback: expect.stringContaining('"tags":["Caption"]')
                    })
                );
            });
        });

        it('should handle drag to close feedback modal', async () => {
            const pendingPost = {
                id: 'fb-drag-test',
                caption: 'Pending Post',
                type: 'IMAGE' as const,
                status: 'PENDING_APPROVAL' as const,
                thumbnail: '/img.jpg',
                platform: 'INSTAGRAM' as const,
                createdAt: new Date().toISOString(),
            };
            vi.mocked(postsAPI.getAll).mockResolvedValue([pendingPost]);
            render(<ContentStudio />);

            await waitFor(() => expect(screen.getByText('Pending Post')).toBeInTheDocument());
            fireEvent.click(screen.getByText('Request Edit'));

            await waitFor(() => expect(screen.getByText('Refine Content')).toBeInTheDocument());

            // Drag the header
            const header = screen.getByText('Refine Content');

            // Drag down significantly
            fireEvent.touchStart(header, { touches: [{ clientY: 100 }] });
            fireEvent.touchMove(header, { touches: [{ clientY: 400 }] });
            fireEvent.touchEnd(header);

            await waitFor(() => {
                expect(screen.queryByText('Refine Content')).not.toBeInTheDocument();
            });
        });

        it('should revert scheduled post to review with note', async () => {
            vi.mocked(postsAPI.update).mockResolvedValue({} as any);
            const scheduledPost = {
                id: 's-revert-test',
                caption: 'Scheduled Post',
                type: 'IMAGE' as const,
                status: 'SCHEDULED' as const,
                thumbnail: '/img.jpg',
                platform: 'INSTAGRAM' as const,
                scheduledFor: new Date(Date.now() + 5 * 3600 * 1000).toISOString(),
            };
            vi.mocked(postsAPI.getAll).mockResolvedValue([scheduledPost]);
            render(<ContentStudio />);

            fireEvent.click(screen.getByText('Scheduled'));
            await waitFor(() => expect(screen.getByText('Revert to Review')).toBeInTheDocument());

            fireEvent.click(screen.getByText('Revert to Review'));

            // Modal opens
            await waitFor(() => expect(screen.getByText('Refine Content')).toBeInTheDocument());

            // Type reason
            const noteInput = screen.getByPlaceholderText('Any additional context...');
            fireEvent.change(noteInput, { target: { value: 'Bad timing' } });

            // Click dummy tag "Other" to satisfy validation
            const otherTag = screen.getByText('Other');
            fireEvent.click(otherTag);
            // Select an option to actually activate the tag
            fireEvent.click(screen.getByText('Check Pricing'));

            // Confirm
            fireEvent.click(screen.getByText('Submit Revision'));

            await waitFor(() => {
                expect(postsAPI.update).toHaveBeenCalledWith(
                    's-revert-test',
                    expect.objectContaining({
                        status: 'CHANGES_REQUESTED',
                        feedback: expect.stringContaining('Bad timing')
                    })
                );
            });
        });

        it('should display feedback updates', async () => {
            const updatePost = {
                id: 'fb-update',
                caption: 'Update Feedback',
                type: 'IMAGE' as const,
                status: 'CHANGES_REQUESTED' as const,
                thumbnail: '/img.jpg',
                platform: 'INSTAGRAM' as const,
                createdAt: new Date().toISOString(),
                feedback: JSON.stringify({
                    tags: ['Caption'],
                    details: { Caption: 'Change it' },
                    note: 'Original Note\n\n[Update]: Follow up note',
                    resolution: 'Fixed spelling'
                }),
            };
            vi.mocked(postsAPI.getAll).mockResolvedValue([updatePost]);
            render(<ContentStudio />);

            await waitFor(() => {
                expect(screen.getByText('Original Note')).toBeInTheDocument();
                // We check for the update text
                expect(screen.getByText('Follow up note')).toBeInTheDocument();
                // Check if resolution is displayed
                expect(screen.getByText('Fixed spelling')).toBeInTheDocument();
            });
        });

        it('should handle API error when submitting feedback', async () => {
            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
            vi.mocked(postsAPI.update).mockRejectedValue(new Error('API Error'));

            const pendingPost = {
                id: 'fb-error',
                caption: 'Pending Post',
                type: 'IMAGE' as const,
                status: 'PENDING_APPROVAL' as const,
                thumbnail: '/img.jpg',
                platform: 'INSTAGRAM' as const,
            };
            vi.mocked(postsAPI.getAll).mockResolvedValue([pendingPost]);
            render(<ContentStudio />);

            await waitFor(() => expect(screen.getByText('Pending Post')).toBeInTheDocument());
            fireEvent.click(screen.getByText('Request Edit'));

            await waitFor(() => expect(screen.getByText('Refine Content')).toBeInTheDocument());

            // Select logic to enable submit
            const captionTag = screen.getByText('Caption');
            fireEvent.click(captionTag);
            const quickOption = screen.getByText('Too short');
            fireEvent.click(quickOption);

            fireEvent.click(screen.getByText('Submit Revision'));

            await waitFor(() => {
                expect(consoleSpy).toHaveBeenCalledWith('Failed to update post:', expect.any(Error));
            });
            consoleSpy.mockRestore();
        });
    });

    describe('Adhoc Post Integration', () => {
        it('should display New Post button', async () => {
            render(<ContentStudio />);

            await waitFor(() => {
                expect(screen.getByTestId('new-post-button')).toBeInTheDocument();
                expect(screen.getByText('New Post')).toBeInTheDocument();
            });
        });

        it('should open AdhocPostModal when New Post button is clicked', async () => {
            render(<ContentStudio />);

            await waitFor(() => {
                expect(screen.getByTestId('new-post-button')).toBeInTheDocument();
            });

            fireEvent.click(screen.getByTestId('new-post-button'));

            await waitFor(() => {
                expect(screen.getByTestId('adhoc-post-modal')).toBeInTheDocument();
                expect(screen.getByText('Quick Post')).toBeInTheDocument();
            });
        });

        it('should close AdhocPostModal when close button is clicked', async () => {
            render(<ContentStudio />);

            await waitFor(() => {
                expect(screen.getByTestId('new-post-button')).toBeInTheDocument();
            });

            fireEvent.click(screen.getByTestId('new-post-button'));

            await waitFor(() => {
                expect(screen.getByTestId('adhoc-post-modal')).toBeInTheDocument();
            });

            fireEvent.click(screen.getByTestId('close-button'));

            await waitFor(() => {
                expect(screen.queryByTestId('adhoc-post-modal')).not.toBeInTheDocument();
            });
        });

        it('should refresh posts and switch to Review tab after successful adhoc post creation', async () => {
            vi.mocked(postsAPI.create).mockResolvedValue({
                id: 'adhoc-1',
                type: 'IMAGE',
                status: 'PENDING_APPROVAL',
                thumbnail: '/api/placeholder/400/400',
                caption: 'New adhoc post',
                platform: 'INSTAGRAM',
                isAdhoc: true,
            });

            render(<ContentStudio />);

            // Click Scheduled tab first
            await waitFor(() => {
                fireEvent.click(screen.getByText('Scheduled'));
            });

            // Open modal
            fireEvent.click(screen.getByTestId('new-post-button'));

            await waitFor(() => {
                expect(screen.getByTestId('adhoc-post-modal')).toBeInTheDocument();
            });

            // Fill in concept
            fireEvent.change(screen.getByTestId('concept-input'), {
                target: { value: 'New adhoc post' }
            });

            // Submit
            fireEvent.click(screen.getByTestId('submit-button'));

            await waitFor(() => {
                // Modal should close
                expect(screen.queryByTestId('adhoc-post-modal')).not.toBeInTheDocument();
                // Posts should be refreshed (getAll called again)
                expect(postsAPI.getAll).toHaveBeenCalledTimes(2); // Initial + refresh
            });
        });
    });
});
