import { jest, describe, test, expect, beforeEach } from '@jest/globals';

// -- Mock Setup --

const mockPost = jest.fn<any>();
const mockGet = jest.fn<any>();

// Mock axios.create to return our mocked instance
await jest.unstable_mockModule('axios', () => {
    const mockAxiosInstance = {
        post: mockPost,
        get: mockGet,
        defaults: {},
        interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } }
    };

    return {
        __esModule: true,
        default: {
            create: jest.fn(() => mockAxiosInstance),
            isAxiosError: (err: any) => err?.isAxiosError === true
        },
        AxiosError: class AxiosError extends Error {
            response: any;
            code: string | undefined;
            isAxiosError = true;
            constructor(message: string, code?: string, _config?: any, _request?: any, response?: any) {
                super(message);
                this.code = code;
                this.response = response;
            }
        }
    };
});

const mockDecrypt = jest.fn<any>();

await jest.unstable_mockModule('../../src/services/encryption.js', () => ({
    decrypt: mockDecrypt,
    encrypt: jest.fn((val: string) => `encrypted_${val}`),
    generateStateToken: jest.fn(() => 'mock-state-token')
}));

// Import subject after mocks
const { publishToInstagram, publishToFacebook, publishPost } = await import('../../src/services/publishing-service.js');

describe('Publishing Service', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockDecrypt.mockReturnValue('decrypted-access-token');
    });

    const mockCredentials = {
        userId: 'ig-user-123',
        pageId: 'page-456',
        accessToken: 'encrypted:token'
    };

    describe('publishToInstagram', () => {
        describe('IMAGE posts', () => {
            const imagePost = {
                id: 'post-1',
                type: 'IMAGE' as const,
                caption: 'Delicious food!',
                thumbnail: 'https://example.com/food.jpg',
                platform: 'INSTAGRAM' as const
            };

            test('should publish an image post successfully', async () => {
                // Step 1: Create container
                mockPost.mockResolvedValueOnce({ data: { id: 'container-789' } });
                // Step 2: Publish container
                mockPost.mockResolvedValueOnce({ data: { id: 'media-999' } });

                const result = await publishToInstagram(imagePost, mockCredentials);

                expect(result.success).toBe(true);
                expect(result.instagramMediaId).toBe('media-999');
                expect(result.retryable).toBe(false);

                // Verify container creation call
                expect(mockPost).toHaveBeenCalledTimes(2);
                expect(mockPost.mock.calls[0][0]).toBe('/ig-user-123/media');
                expect((mockPost.mock.calls[0] as any[])[2].params).toEqual(
                    expect.objectContaining({
                        image_url: 'https://example.com/food.jpg',
                        caption: 'Delicious food!',
                        access_token: 'decrypted-access-token'
                    })
                );

                // Verify publish call
                expect(mockPost.mock.calls[1][0]).toBe('/ig-user-123/media_publish');
                expect((mockPost.mock.calls[1] as any[])[2].params).toEqual(
                    expect.objectContaining({
                        creation_id: 'container-789',
                        access_token: 'decrypted-access-token'
                    })
                );
            });

            test('should return error when container creation fails', async () => {
                mockPost.mockRejectedValueOnce(new Error('API error'));

                const result = await publishToInstagram(imagePost, mockCredentials);

                expect(result.success).toBe(false);
                expect(result.error).toBeDefined();
                expect(mockPost).toHaveBeenCalledTimes(1);
            });

            test('should handle no container ID returned', async () => {
                mockPost.mockResolvedValueOnce({ data: {} });

                const result = await publishToInstagram(imagePost, mockCredentials);

                expect(result.success).toBe(false);
                expect(result.error).toContain('No container ID');
            });
        });

        describe('CAROUSEL posts', () => {
            const carouselPost = {
                id: 'post-2',
                type: 'CAROUSEL' as const,
                caption: 'Multi-photo post!',
                thumbnail: 'https://example.com/img1.jpg',
                mediaUrls: ['https://example.com/img1.jpg', 'https://example.com/img2.jpg', 'https://example.com/img3.jpg'],
                platform: 'INSTAGRAM' as const
            };

            test('should publish a carousel post successfully', async () => {
                // Step 1: Create child containers (3 images)
                mockPost.mockResolvedValueOnce({ data: { id: 'child-1' } });
                mockPost.mockResolvedValueOnce({ data: { id: 'child-2' } });
                mockPost.mockResolvedValueOnce({ data: { id: 'child-3' } });
                // Step 2: Create carousel container
                mockPost.mockResolvedValueOnce({ data: { id: 'carousel-container' } });
                // Step 3: Publish
                mockPost.mockResolvedValueOnce({ data: { id: 'media-carousel' } });

                const result = await publishToInstagram(carouselPost, mockCredentials);

                expect(result.success).toBe(true);
                expect(result.instagramMediaId).toBe('media-carousel');
                expect(mockPost).toHaveBeenCalledTimes(5);

                // Verify child items have is_carousel_item=true
                expect((mockPost.mock.calls[0] as any[])[2].params.is_carousel_item).toBe(true);
                expect((mockPost.mock.calls[1] as any[])[2].params.is_carousel_item).toBe(true);
                expect((mockPost.mock.calls[2] as any[])[2].params.is_carousel_item).toBe(true);

                // Verify carousel container has children param
                expect((mockPost.mock.calls[3] as any[])[2].params.children).toBe('child-1,child-2,child-3');
                expect((mockPost.mock.calls[3] as any[])[2].params.media_type).toBe('CAROUSEL');
            });

            test('should reject carousel with less than 2 items', async () => {
                const singleItemCarousel = {
                    ...carouselPost,
                    mediaUrls: ['https://example.com/img1.jpg']
                };

                const result = await publishToInstagram(singleItemCarousel, mockCredentials);

                expect(result.success).toBe(false);
                expect(result.errorCode).toBe('INVALID_CAROUSEL');
                expect(result.retryable).toBe(false);
                expect(mockPost).not.toHaveBeenCalled();
            });

            test('should reject carousel with more than 10 items', async () => {
                const tooManyItems = {
                    ...carouselPost,
                    mediaUrls: Array.from({ length: 11 }, (_, i) => `https://example.com/img${i}.jpg`)
                };

                const result = await publishToInstagram(tooManyItems, mockCredentials);

                expect(result.success).toBe(false);
                expect(result.errorCode).toBe('INVALID_CAROUSEL');
                expect(result.retryable).toBe(false);
            });
        });

        describe('REEL posts', () => {
            const reelPost = {
                id: 'post-3',
                type: 'REEL' as const,
                caption: 'Check out this reel!',
                thumbnail: 'https://example.com/thumb.jpg',
                videoUrl: 'https://example.com/reel.mp4',
                platform: 'INSTAGRAM' as const
            };

            test('should publish a reel successfully', async () => {
                jest.useFakeTimers();

                // Step 1: Create video container
                mockPost.mockResolvedValueOnce({ data: { id: 'reel-container' } });
                // Step 2: Poll status - first IN_PROGRESS, then FINISHED
                mockGet.mockResolvedValueOnce({ data: { status_code: 'IN_PROGRESS' } });
                mockGet.mockResolvedValueOnce({ data: { status_code: 'FINISHED' } });
                // Step 3: Publish
                mockPost.mockResolvedValueOnce({ data: { id: 'media-reel' } });

                const resultPromise = publishToInstagram(reelPost, mockCredentials);

                // Advance past the 5-second poll interval to avoid a real timer handle
                await jest.advanceTimersByTimeAsync(5000);

                const result = await resultPromise;

                expect(result.success).toBe(true);
                expect(result.instagramMediaId).toBe('media-reel');

                // Verify video container creation
                expect((mockPost.mock.calls[0] as any[])[2].params.video_url).toBe('https://example.com/reel.mp4');
                expect((mockPost.mock.calls[0] as any[])[2].params.media_type).toBe('REELS');

                jest.useRealTimers();
            });

            test('should fail when reel has no videoUrl', async () => {
                const noVideoReel = { ...reelPost, videoUrl: undefined };

                const result = await publishToInstagram(noVideoReel, mockCredentials);

                expect(result.success).toBe(false);
                expect(result.errorCode).toBe('MISSING_VIDEO');
                expect(result.retryable).toBe(false);
            });

            test('should fail when video processing errors out', async () => {
                mockPost.mockResolvedValueOnce({ data: { id: 'reel-container' } });
                mockGet.mockResolvedValueOnce({ data: { status_code: 'ERROR', status: 'Video format not supported' } });

                const result = await publishToInstagram(reelPost, mockCredentials);

                expect(result.success).toBe(false);
                expect(result.error).toContain('Video format not supported');
            });
        });

        describe('STORY posts', () => {
            test('should publish an image story successfully', async () => {
                const storyPost = {
                    id: 'post-4',
                    type: 'STORY' as const,
                    caption: '',
                    thumbnail: 'https://example.com/story.jpg',
                    platform: 'INSTAGRAM' as const
                };

                // Step 1: Create story container
                mockPost.mockResolvedValueOnce({ data: { id: 'story-container' } });
                // Step 2: Publish
                mockPost.mockResolvedValueOnce({ data: { id: 'media-story' } });

                const result = await publishToInstagram(storyPost, mockCredentials);

                expect(result.success).toBe(true);
                expect(result.instagramMediaId).toBe('media-story');

                // Verify story container has STORIES media_type
                expect((mockPost.mock.calls[0] as any[])[2].params.media_type).toBe('STORIES');
            });

            test('should publish a video story successfully', async () => {
                const videoStory = {
                    id: 'post-5',
                    type: 'STORY' as const,
                    caption: '',
                    thumbnail: 'https://example.com/thumb.jpg',
                    videoUrl: 'https://example.com/story.mp4',
                    platform: 'INSTAGRAM' as const
                };

                // Step 1: Create video story container
                mockPost.mockResolvedValueOnce({ data: { id: 'video-story-container' } });
                // Step 2: Poll status
                mockGet.mockResolvedValueOnce({ data: { status_code: 'FINISHED' } });
                // Step 3: Publish
                mockPost.mockResolvedValueOnce({ data: { id: 'media-video-story' } });

                const result = await publishToInstagram(videoStory, mockCredentials);

                expect(result.success).toBe(true);
                expect(result.instagramMediaId).toBe('media-video-story');
            });
        });

        describe('VIDEO posts (published as Reels)', () => {
            test('should route VIDEO type to reel handler', async () => {
                const videoPost = {
                    id: 'post-6',
                    type: 'VIDEO' as const,
                    caption: 'Video post',
                    thumbnail: 'https://example.com/thumb.jpg',
                    videoUrl: 'https://example.com/video.mp4',
                    platform: 'INSTAGRAM' as const
                };

                mockPost.mockResolvedValueOnce({ data: { id: 'video-container' } });
                mockGet.mockResolvedValueOnce({ data: { status_code: 'FINISHED' } });
                mockPost.mockResolvedValueOnce({ data: { id: 'media-video' } });

                const result = await publishToInstagram(videoPost, mockCredentials);

                expect(result.success).toBe(true);
                expect((mockPost.mock.calls[0] as any[])[2].params.media_type).toBe('REELS');
            });
        });

        describe('Token decryption', () => {
            test('should fail when token decryption fails', async () => {
                mockDecrypt.mockReturnValue(null);

                const post = {
                    id: 'post-7',
                    type: 'IMAGE' as const,
                    caption: 'Test',
                    thumbnail: 'https://example.com/img.jpg',
                    platform: 'INSTAGRAM' as const
                };

                const result = await publishToInstagram(post, mockCredentials);

                expect(result.success).toBe(false);
                expect(result.errorCode).toBe('TOKEN_DECRYPT_FAILED');
                expect(result.retryable).toBe(false);
                expect(mockPost).not.toHaveBeenCalled();
            });
        });
    });

    describe('publishPost (platform routing)', () => {
        test('should publish to Instagram only for INSTAGRAM platform', async () => {
            const post = {
                id: 'post-ig',
                type: 'IMAGE' as const,
                caption: 'IG only',
                thumbnail: 'https://example.com/img.jpg',
                platform: 'INSTAGRAM' as const
            };

            mockPost.mockResolvedValueOnce({ data: { id: 'container-1' } });
            mockPost.mockResolvedValueOnce({ data: { id: 'media-1' } });

            const results = await publishPost(post, mockCredentials);

            expect(results.instagram).toBeDefined();
            expect(results.instagram?.success).toBe(true);
            expect(results.facebook).toBeUndefined();
        });

        test('should publish to Facebook only for FACEBOOK platform', async () => {
            const post = {
                id: 'post-fb',
                type: 'IMAGE' as const,
                caption: 'FB only',
                thumbnail: 'https://example.com/img.jpg',
                platform: 'FACEBOOK' as const
            };

            // Facebook photos endpoint
            mockPost.mockResolvedValueOnce({ data: { post_id: 'fb-post-1' } });

            const results = await publishPost(post, mockCredentials);

            expect(results.facebook).toBeDefined();
            expect(results.facebook?.success).toBe(true);
            expect(results.instagram).toBeUndefined();
        });

        test('should publish to both platforms for BOTH platform', async () => {
            const post = {
                id: 'post-both',
                type: 'IMAGE' as const,
                caption: 'Both platforms',
                thumbnail: 'https://example.com/img.jpg',
                platform: 'BOTH' as const
            };

            // Instagram: container + publish
            mockPost.mockResolvedValueOnce({ data: { id: 'container-ig' } });
            mockPost.mockResolvedValueOnce({ data: { id: 'media-ig' } });
            // Facebook: photos
            mockPost.mockResolvedValueOnce({ data: { post_id: 'fb-post' } });

            const results = await publishPost(post, mockCredentials);

            expect(results.instagram?.success).toBe(true);
            expect(results.facebook?.success).toBe(true);
        });
    });

    describe('publishToFacebook', () => {
        test('should publish image to Facebook page', async () => {
            const post = {
                id: 'post-fb-img',
                type: 'IMAGE' as const,
                caption: 'FB image',
                thumbnail: 'https://example.com/img.jpg',
                platform: 'FACEBOOK' as const
            };

            mockPost.mockResolvedValueOnce({ data: { post_id: 'fb-123' } });

            const result = await publishToFacebook(post, mockCredentials);

            expect(result.success).toBe(true);
            expect(result.facebookPostId).toBe('fb-123');

            // Verify page photos endpoint was called
            expect(mockPost.mock.calls[0][0]).toBe('/page-456/photos');
        });

        test('should publish carousel with multiple photos to Facebook', async () => {
            const post = {
                id: 'post-fb-carousel',
                type: 'CAROUSEL' as const,
                caption: 'FB carousel',
                thumbnail: 'https://example.com/img1.jpg',
                mediaUrls: ['https://example.com/img1.jpg', 'https://example.com/img2.jpg', 'https://example.com/img3.jpg'],
                platform: 'FACEBOOK' as const
            };

            // Three unpublished photo uploads
            mockPost.mockResolvedValueOnce({ data: { id: 'photo-1' } });
            mockPost.mockResolvedValueOnce({ data: { id: 'photo-2' } });
            mockPost.mockResolvedValueOnce({ data: { id: 'photo-3' } });
            // Multi-photo feed post
            mockPost.mockResolvedValueOnce({ data: { id: 'feed-post-1' } });

            const result = await publishToFacebook(post, mockCredentials);

            expect(result.success).toBe(true);
            expect(result.facebookPostId).toBe('feed-post-1');
            // 3 photo uploads + 1 feed post = 4 calls
            expect(mockPost).toHaveBeenCalledTimes(4);
        });

        test('should publish single-image carousel as regular photo', async () => {
            const post = {
                id: 'post-fb-single-carousel',
                type: 'CAROUSEL' as const,
                caption: 'Single carousel',
                thumbnail: 'https://example.com/img1.jpg',
                mediaUrls: ['https://example.com/img1.jpg'],
                platform: 'FACEBOOK' as const
            };

            mockPost.mockResolvedValueOnce({ data: { post_id: 'fb-single-123' } });

            const result = await publishToFacebook(post, mockCredentials);

            expect(result.success).toBe(true);
            expect(result.facebookPostId).toBe('fb-single-123');
            expect(mockPost).toHaveBeenCalledTimes(1);
        });

        test('should publish video to Facebook page', async () => {
            const post = {
                id: 'post-fb-vid',
                type: 'VIDEO' as const,
                caption: 'FB video',
                thumbnail: 'https://example.com/thumb.jpg',
                videoUrl: 'https://example.com/video.mp4',
                platform: 'FACEBOOK' as const
            };

            mockPost.mockResolvedValueOnce({ data: { id: 'fb-vid-123' } });

            const result = await publishToFacebook(post, mockCredentials);

            expect(result.success).toBe(true);
            expect(mockPost.mock.calls[0][0]).toBe('/page-456/videos');
        });

        test('should publish reel to Facebook page', async () => {
            const post = {
                id: 'post-fb-reel',
                type: 'REEL' as const,
                caption: 'FB reel',
                thumbnail: 'https://example.com/thumb.jpg',
                videoUrl: 'https://example.com/reel.mp4',
                platform: 'FACEBOOK' as const
            };

            mockPost.mockResolvedValueOnce({ data: { id: 'fb-reel-123' } });

            const result = await publishToFacebook(post, mockCredentials);

            expect(result.success).toBe(true);
            expect(result.facebookPostId).toBe('fb-reel-123');
            expect(mockPost.mock.calls[0][0]).toBe('/page-456/videos');
        });

        test('should fail when video type has no videoUrl', async () => {
            const post = {
                id: 'post-fb-no-vid',
                type: 'VIDEO' as const,
                caption: 'FB video no url',
                thumbnail: 'https://example.com/thumb.jpg',
                platform: 'FACEBOOK' as const
            };

            const result = await publishToFacebook(post, mockCredentials);

            expect(result.success).toBe(false);
            expect(result.errorCode).toBe('MISSING_VIDEO');
        });

        test('should skip stories for Facebook (Instagram-only)', async () => {
            const post = {
                id: 'post-fb-story',
                type: 'STORY' as const,
                caption: '',
                thumbnail: 'https://example.com/story.jpg',
                platform: 'FACEBOOK' as const
            };

            const result = await publishToFacebook(post, mockCredentials);

            // Stories are Instagram-only, should succeed silently
            expect(result.success).toBe(true);
            expect(mockPost).not.toHaveBeenCalled();
        });

        test('should fail when pageId is missing', async () => {
            const post = {
                id: 'post-fb-no-page',
                type: 'IMAGE' as const,
                caption: 'No page',
                thumbnail: 'https://example.com/img.jpg',
                platform: 'FACEBOOK' as const
            };

            const noPageCredentials = {
                userId: 'ig-user-123',
                pageId: '',
                accessToken: 'encrypted:token'
            };

            const result = await publishToFacebook(post, noPageCredentials);

            expect(result.success).toBe(false);
            expect(result.errorCode).toBe('MISSING_PAGE_ID');
        });

        test('should fail when token decryption fails', async () => {
            mockDecrypt.mockReturnValue(null);

            const post = {
                id: 'post-fb-fail',
                type: 'IMAGE' as const,
                caption: 'Test',
                thumbnail: 'https://example.com/img.jpg',
                platform: 'FACEBOOK' as const
            };

            const result = await publishToFacebook(post, mockCredentials);

            expect(result.success).toBe(false);
            expect(result.errorCode).toBe('TOKEN_DECRYPT_FAILED');
        });

        test('should handle API error during Facebook publish', async () => {
            const post = {
                id: 'post-fb-err',
                type: 'IMAGE' as const,
                caption: 'Error test',
                thumbnail: 'https://example.com/img.jpg',
                platform: 'FACEBOOK' as const
            };

            mockPost.mockRejectedValueOnce(new Error('Network error'));

            const result = await publishToFacebook(post, mockCredentials);

            expect(result.success).toBe(false);
            expect(result.error).toContain('Network error');
        });

        test('should return error for unsupported post type', async () => {
            const post = {
                id: 'post-fb-unknown',
                type: 'UNKNOWN' as any,
                caption: 'Unknown type',
                thumbnail: 'https://example.com/img.jpg',
                platform: 'FACEBOOK' as const
            };

            const result = await publishToFacebook(post, mockCredentials);

            expect(result.success).toBe(false);
            expect(result.errorCode).toBe('UNSUPPORTED_TYPE');
        });
    });
});
