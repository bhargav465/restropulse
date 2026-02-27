/**
 * Publishing Service
 * Handles publishing posts to Instagram via the Graph API Content Publishing endpoints.
 * Supports IMAGE, CAROUSEL, REEL, and STORY post types.
 *
 * Instagram Content Publishing API flow:
 *   1. Create a media container (POST /{ig-user-id}/media)
 *   2. For video types: poll container status until FINISHED
 *   3. Publish the container (POST /{ig-user-id}/media_publish)
 *
 * See: https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/content-publishing
 */

import axios, { AxiosError } from 'axios';
import FormData from 'form-data';
import { decrypt } from './encryption.js';

// API Configuration
const META_GRAPH_API = 'https://graph.facebook.com/v18.0';
const API_TIMEOUT_MS = 60000; // 60 seconds for media uploads
const VIDEO_POLL_INTERVAL_MS = 5000; // 5 seconds between status checks
const VIDEO_POLL_MAX_ATTEMPTS = 60; // 5 minutes max wait for video processing

// Create axios instance
const metaApi = axios.create({
    baseURL: META_GRAPH_API,
    timeout: API_TIMEOUT_MS
});

// -- Media Upload Helpers --

/**
 * Download an image from any URL (following redirects) and upload it to
 * Facebook Page storage as an unpublished photo.
 * Returns a Facebook CDN URL that Instagram's API can reliably fetch.
 *
 * This avoids issues with:
 *   - Redirect URLs (e.g. picsum.photos)
 *   - URLs without image file extensions
 *   - Slow or unreliable origin servers
 *
 * Flow:
 *   1. Download image binary from the source URL (follows redirects)
 *   2. POST /{page-id}/photos?published=false with binary source
 *   3. GET /{photo-id}?fields=images to retrieve CDN URLs
 *   4. Return the largest CDN image URL
 */
async function uploadImageToFacebook(
    imageUrl: string,
    pageId: string,
    accessToken: string
): Promise<string> {
    console.log(`[Publishing] Uploading image to Facebook CDN: ${imageUrl}`);

    // Step 1: Download the image (following all redirects)
    const downloadResponse = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
        maxRedirects: 10,
        timeout: 30000,
        headers: { 'Accept': 'image/*' }
    });

    const imageBuffer = Buffer.from(downloadResponse.data);
    const contentType = downloadResponse.headers['content-type'] || 'image/jpeg';
    const fileSize = imageBuffer.length;

    console.log(`[Publishing] Downloaded image: ${fileSize} bytes, type: ${contentType}`);

    // Determine file extension from content type
    const extMap: Record<string, string> = {
        'image/jpeg': 'jpg',
        'image/jpg': 'jpg',
        'image/png': 'png',
        'image/gif': 'gif',
        'image/webp': 'webp'
    };
    const ext = extMap[contentType] || 'jpg';

    // Step 2: Upload to Facebook Page as an unpublished photo
    const formData = new FormData();
    formData.append('source', imageBuffer, {
        filename: `post_image.${ext}`,
        contentType: contentType
    });
    formData.append('published', 'false');
    formData.append('temporary', 'true'); // Mark as temporary so it auto-deletes
    formData.append('access_token', accessToken);

    const uploadResponse = await axios.post(
        `${META_GRAPH_API}/${pageId}/photos`,
        formData,
        {
            headers: formData.getHeaders(),
            timeout: API_TIMEOUT_MS,
            maxContentLength: 50 * 1024 * 1024 // 50 MB max
        }
    );

    const photoId = uploadResponse.data.id;
    if (!photoId) {
        throw new Error('No photo ID returned from Facebook upload');
    }

    console.log(`[Publishing] Uploaded to Facebook as unpublished photo: ${photoId}`);

    // Step 3: Get the CDN URL from the uploaded photo
    const photoDetails = await metaApi.get(`/${photoId}`, {
        params: {
            fields: 'images',
            access_token: accessToken
        }
    });

    const images = photoDetails.data.images || [];
    if (images.length === 0) {
        throw new Error('No image URLs returned from Facebook CDN');
    }

    // Sort by size (largest first) and return the biggest
    images.sort((a: any, b: any) => (b.width * b.height) - (a.width * a.height));
    const cdnUrl = images[0].source;

    console.log(`[Publishing] Facebook CDN URL ready: ${cdnUrl.substring(0, 80)}...`);
    return cdnUrl;
}

/**
 * Upload an image to Facebook CDN, then return the CDN URL.
 * Errors are NOT silently swallowed -- they propagate to the caller
 * so that the publish attempt fails with a clear diagnostic message
 * instead of silently falling back to a broken redirect URL.
 */
async function getPublishableImageUrl(
    imageUrl: string,
    pageId: string,
    accessToken: string
): Promise<string> {
    console.log(`[Publishing] getPublishableImageUrl called for: ${imageUrl}`);
    const cdnUrl = await uploadImageToFacebook(imageUrl, pageId, accessToken);
    console.log(`[Publishing] getPublishableImageUrl success: ${cdnUrl.substring(0, 80)}...`);
    return cdnUrl;
}

// -- Types --

export interface PublishablePost {
    id: string;
    type: 'IMAGE' | 'VIDEO' | 'CAROUSEL' | 'STORY' | 'REEL';
    caption: string;
    thumbnail: string;
    mediaUrls?: string[];
    videoUrl?: string;
    platform: 'INSTAGRAM' | 'FACEBOOK' | 'BOTH';
}

export interface InstagramCredentialsForPublishing {
    userId: string;       // Instagram User ID
    pageId: string;       // Facebook Page ID
    accessToken: string;  // Encrypted access token
}

export interface PublishResult {
    success: boolean;
    instagramMediaId?: string;
    facebookPostId?: string;
    error?: string;
    errorCode?: string;
    retryable: boolean;
}

interface ContainerStatusResult {
    ready: boolean;
    statusCode: string;
    error?: string;
}

// -- Error Helpers --

function parsePublishError(error: unknown): { message: string; code: string | null; retryable: boolean } {
    if (error instanceof AxiosError) {
        if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
            return { message: 'Request timed out', code: 'TIMEOUT', retryable: true };
        }

        const metaError = error.response?.data?.error;
        if (metaError) {
            // Rate limit codes: 4 (app-level), 17 (user-level), 32 (page-level)
            const isRateLimit = [4, 17, 32].includes(metaError.code);
            // Transient errors are retryable
            const isTransient = metaError.is_transient === true;
            return {
                message: metaError.message || 'Unknown Meta API error',
                code: String(metaError.code),
                retryable: isRateLimit || isTransient
            };
        }

        return {
            message: error.message,
            code: error.response?.status ? String(error.response.status) : null,
            retryable: error.response?.status === 429 || (error.response?.status ?? 0) >= 500
        };
    }

    return { message: String(error), code: null, retryable: false };
}

// -- Container Creation --

/**
 * Create an image media container on Instagram.
 */
async function createImageContainer(
    igUserId: string,
    accessToken: string,
    imageUrl: string,
    caption: string,
    isCarouselItem: boolean = false
): Promise<string> {
    const params: Record<string, string | boolean> = {
        image_url: imageUrl,
        access_token: accessToken
    };

    if (isCarouselItem) {
        params.is_carousel_item = true;
    } else {
        params.caption = caption;
    }

    const response = await metaApi.post(`/${igUserId}/media`, null, { params });
    const containerId = response.data.id;

    if (!containerId) {
        throw new Error('No container ID returned from Instagram API');
    }

    console.log(`[Publishing] Created image container: ${containerId}${isCarouselItem ? ' (carousel item)' : ''}`);
    return containerId;
}

/**
 * Create a video/reel media container on Instagram.
 */
async function createVideoContainer(
    igUserId: string,
    accessToken: string,
    videoUrl: string,
    caption: string,
    mediaType: 'REELS' | 'STORIES'
): Promise<string> {
    const params: Record<string, string> = {
        video_url: videoUrl,
        media_type: mediaType,
        access_token: accessToken
    };

    // Stories don't support captions via API
    if (mediaType !== 'STORIES') {
        params.caption = caption;
    }

    const response = await metaApi.post(`/${igUserId}/media`, null, { params });
    const containerId = response.data.id;

    if (!containerId) {
        throw new Error('No container ID returned from Instagram API');
    }

    console.log(`[Publishing] Created ${mediaType} container: ${containerId}`);
    return containerId;
}

/**
 * Create a carousel container with child media items.
 */
async function createCarouselContainer(
    igUserId: string,
    accessToken: string,
    childIds: string[],
    caption: string
): Promise<string> {
    const response = await metaApi.post(`/${igUserId}/media`, null, {
        params: {
            media_type: 'CAROUSEL',
            children: childIds.join(','),
            caption: caption,
            access_token: accessToken
        }
    });
    const containerId = response.data.id;

    if (!containerId) {
        throw new Error('No carousel container ID returned from Instagram API');
    }

    console.log(`[Publishing] Created carousel container: ${containerId} with ${childIds.length} children`);
    return containerId;
}

// -- Container Status Polling --

/**
 * Poll the status of a media container until it is ready for publishing.
 * Required for video-based media types (REELS, STORIES with video).
 */
async function waitForContainerReady(containerId: string, accessToken: string): Promise<ContainerStatusResult> {
    console.log(`[Publishing] Polling container ${containerId} status...`);

    for (let attempt = 0; attempt < VIDEO_POLL_MAX_ATTEMPTS; attempt++) {
        const response = await metaApi.get(`/${containerId}`, {
            params: {
                fields: 'status_code,status',
                access_token: accessToken
            }
        });

        const statusCode = response.data.status_code;
        console.log(`[Publishing] Container ${containerId} status: ${statusCode} (attempt ${attempt + 1})`);

        if (statusCode === 'FINISHED') {
            return { ready: true, statusCode };
        }

        if (statusCode === 'ERROR') {
            const errorMsg = response.data.status || 'Container processing failed';
            return { ready: false, statusCode, error: errorMsg };
        }

        // IN_PROGRESS - wait and try again
        await new Promise(resolve => setTimeout(resolve, VIDEO_POLL_INTERVAL_MS));
    }

    return {
        ready: false,
        statusCode: 'TIMEOUT',
        error: `Container processing timed out after ${VIDEO_POLL_MAX_ATTEMPTS * VIDEO_POLL_INTERVAL_MS / 1000} seconds`
    };
}

// -- Publishing --

/**
 * Publish a ready media container to Instagram.
 */
async function publishContainer(igUserId: string, accessToken: string, containerId: string): Promise<string> {
    const response = await metaApi.post(`/${igUserId}/media_publish`, null, {
        params: {
            creation_id: containerId,
            access_token: accessToken
        }
    });

    const mediaId = response.data.id;
    if (!mediaId) {
        throw new Error('No media ID returned from publish call');
    }

    console.log(`[Publishing] Published media: ${mediaId}`);
    return mediaId;
}

// -- Post Type Handlers --

/**
 * Publish a single image post to Instagram.
 * Uploads image to Facebook CDN first for reliable delivery.
 */
async function publishImagePost(
    igUserId: string,
    pageId: string,
    accessToken: string,
    post: PublishablePost
): Promise<PublishResult> {
    try {
        // Upload to Facebook CDN first, then use CDN URL for container
        const cdnUrl = await getPublishableImageUrl(post.thumbnail, pageId, accessToken);
        const containerId = await createImageContainer(igUserId, accessToken, cdnUrl, post.caption);
        const mediaId = await publishContainer(igUserId, accessToken, containerId);

        return { success: true, instagramMediaId: mediaId, retryable: false };
    } catch (error) {
        const parsed = parsePublishError(error);
        console.error(`[Publishing] Image post failed:`, parsed.message);
        return { success: false, error: parsed.message, errorCode: parsed.code ?? undefined, retryable: parsed.retryable };
    }
}

/**
 * Publish a carousel post to Instagram.
 * Uploads each image to Facebook CDN first for reliable delivery.
 */
async function publishCarouselPost(
    igUserId: string,
    pageId: string,
    accessToken: string,
    post: PublishablePost
): Promise<PublishResult> {
    try {
        const mediaUrls = post.mediaUrls || [post.thumbnail];

        if (mediaUrls.length > 10) {
            return {
                success: false,
                error: 'Carousel posts support a maximum of 10 media items',
                errorCode: 'INVALID_CAROUSEL',
                retryable: false
            };
        }

        // Step 1: Upload each image to CDN and create child containers
        const childIds: string[] = [];
        for (const url of mediaUrls) {
            const cdnUrl = await getPublishableImageUrl(url, pageId, accessToken);
            const childId = await createImageContainer(igUserId, accessToken, cdnUrl, '', true);
            childIds.push(childId);
        }

        // Step 2: Create carousel container
        const carouselId = await createCarouselContainer(igUserId, accessToken, childIds, post.caption);

        // Step 3: Publish
        const mediaId = await publishContainer(igUserId, accessToken, carouselId);

        return { success: true, instagramMediaId: mediaId, retryable: false };
    } catch (error) {
        const parsed = parsePublishError(error);
        console.error(`[Publishing] Carousel post failed:`, parsed.message);
        return { success: false, error: parsed.message, errorCode: parsed.code ?? undefined, retryable: parsed.retryable };
    }
}

/**
 * Publish a reel to Instagram.
 */
async function publishReelPost(
    igUserId: string,
    pageId: string,
    accessToken: string,
    post: PublishablePost
): Promise<PublishResult> {
    try {
        const videoUrl = post.videoUrl;
        if (!videoUrl) {
            return publishImagePost(igUserId, pageId, accessToken, post);
        }

        // Step 1: Create reel container
        const containerId = await createVideoContainer(igUserId, accessToken, videoUrl, post.caption, 'REELS');

        // Step 2: Wait for video processing
        const status = await waitForContainerReady(containerId, accessToken);
        if (!status.ready) {
            return {
                success: false,
                error: status.error || 'Video processing failed',
                errorCode: status.statusCode,
                retryable: status.statusCode === 'TIMEOUT'
            };
        }

        // Step 3: Publish
        const mediaId = await publishContainer(igUserId, accessToken, containerId);

        return { success: true, instagramMediaId: mediaId, retryable: false };
    } catch (error) {
        const parsed = parsePublishError(error);
        console.error(`[Publishing] Reel post failed:`, parsed.message);
        return { success: false, error: parsed.message, errorCode: parsed.code ?? undefined, retryable: parsed.retryable };
    }
}

/**
 * Publish a story to Instagram.
 * Image stories upload to Facebook CDN first.
 */
async function publishStoryPost(
    igUserId: string,
    pageId: string,
    accessToken: string,
    post: PublishablePost
): Promise<PublishResult> {
    try {
        const isVideo = !!post.videoUrl;
        const mediaUrl = isVideo ? post.videoUrl! : post.thumbnail;

        // Step 1: Create story container
        let containerId: string;
        if (isVideo) {
            containerId = await createVideoContainer(igUserId, accessToken, mediaUrl, '', 'STORIES');

            // Step 2: Wait for video processing
            const status = await waitForContainerReady(containerId, accessToken);
            if (!status.ready) {
                return {
                    success: false,
                    error: status.error || 'Story video processing failed',
                    errorCode: status.statusCode,
                    retryable: status.statusCode === 'TIMEOUT'
                };
            }
        } else {
            // Image stories: upload to CDN first
            const cdnUrl = await getPublishableImageUrl(mediaUrl, pageId, accessToken);
            const response = await metaApi.post(`/${igUserId}/media`, null, {
                params: {
                    image_url: cdnUrl,
                    media_type: 'STORIES',
                    access_token: accessToken
                }
            });
            containerId = response.data.id;
            if (!containerId) {
                throw new Error('No container ID returned for story');
            }
        }

        // Step 3: Publish
        const mediaId = await publishContainer(igUserId, accessToken, containerId);

        return { success: true, instagramMediaId: mediaId, retryable: false };
    } catch (error) {
        const parsed = parsePublishError(error);
        console.error(`[Publishing] Story post failed:`, parsed.message);
        return { success: false, error: parsed.message, errorCode: parsed.code ?? undefined, retryable: parsed.retryable };
    }
}

// -- Main Entry Point --

/**
 * Publish a post to Instagram.
 * Decrypts the stored access token and routes to the correct handler based on post type.
 *
 * @param post - The post to publish
 * @param credentials - The restaurant's Instagram credentials (with encrypted token)
 * @returns PublishResult with success/failure details
 */
export async function publishToInstagram(
    post: PublishablePost,
    credentials: InstagramCredentialsForPublishing
): Promise<PublishResult> {
    console.log(`[Publishing] Starting publish for post ${post.id} (${post.type}) to Instagram`);

    // Decrypt access token
    const accessToken = decrypt(credentials.accessToken);
    if (!accessToken) {
        return {
            success: false,
            error: 'Failed to decrypt Instagram access token. Re-authentication may be required.',
            errorCode: 'TOKEN_DECRYPT_FAILED',
            retryable: false
        };
    }

    const igUserId = credentials.userId;
    const pageId = credentials.pageId;

    switch (post.type) {
        case 'IMAGE':
            return publishImagePost(igUserId, pageId, accessToken, post);
        case 'CAROUSEL':
            return publishCarouselPost(igUserId, pageId, accessToken, post);
        case 'REEL':
            return publishReelPost(igUserId, pageId, accessToken, post);
        case 'STORY':
            return publishStoryPost(igUserId, pageId, accessToken, post);
        case 'VIDEO':
            // VIDEO type uses the reel flow (Instagram deprecated standalone video posts in favor of reels)
            console.log('[Publishing] VIDEO type will be published as a Reel');
            return publishReelPost(igUserId, pageId, accessToken, post);
        default:
            return {
                success: false,
                error: `Unsupported post type: ${post.type}`,
                errorCode: 'UNSUPPORTED_TYPE',
                retryable: false
            };
    }
}

/**
 * Publish a post to Facebook Page.
 * Uses the Facebook Graph API to publish photos, videos, reels, and stories to a Facebook Page.
 *
 * Supported types:
 *   - IMAGE: POST /{page-id}/photos
 *   - CAROUSEL: POST /{page-id}/photos (multiple)
 *   - VIDEO: POST /{page-id}/videos
 *   - REEL: POST /{page-id}/video_reels (two-phase upload)
 *   - STORY: POST /{page-id}/photo_stories or /{page-id}/video_stories
 *
 * See: https://developers.facebook.com/docs/pages-api/posts
 * See: https://developers.facebook.com/docs/video-api/guides/reels-publishing
 */
export async function publishToFacebook(
    post: PublishablePost,
    credentials: InstagramCredentialsForPublishing
): Promise<PublishResult> {
    console.log(`[Publishing] Starting publish for post ${post.id} (${post.type}) to Facebook`);

    const accessToken = decrypt(credentials.accessToken);
    if (!accessToken) {
        return {
            success: false,
            error: 'Failed to decrypt access token',
            errorCode: 'TOKEN_DECRYPT_FAILED',
            retryable: false
        };
    }

    try {
        const pageId = credentials.pageId;

        if (!pageId) {
            return {
                success: false,
                error: 'No Facebook Page ID configured. Please reconnect Instagram/Facebook in Settings.',
                errorCode: 'MISSING_PAGE_ID',
                retryable: false
            };
        }

        // For single images, download and upload binary directly
        if (post.type === 'IMAGE') {
            // Download image first, then upload as binary
            const downloadResponse = await axios.get(post.thumbnail, {
                responseType: 'arraybuffer',
                maxRedirects: 10,
                timeout: 30000
            });
            const imageBuffer = Buffer.from(downloadResponse.data);
            const contentType = downloadResponse.headers['content-type'] || 'image/jpeg';

            const formData = new FormData();
            formData.append('source', imageBuffer, {
                filename: 'post_image.jpg',
                contentType: contentType
            });
            formData.append('message', post.caption);
            formData.append('access_token', accessToken);

            const response = await axios.post(
                `${META_GRAPH_API}/${pageId}/photos`,
                formData,
                { headers: formData.getHeaders(), timeout: API_TIMEOUT_MS }
            );

            console.log(`[Publishing] Facebook photo posted: ${response.data.post_id || response.data.id}`);
            return {
                success: true,
                facebookPostId: response.data.post_id || response.data.id,
                retryable: false
            };
        }

        // For carousels, post each image as unpublished, then create a multi-photo post
        if (post.type === 'CAROUSEL') {
            const mediaUrls = post.mediaUrls || [post.thumbnail];

            if (mediaUrls.length === 1) {
                // Single image fallback - download and upload binary
                const dlRes = await axios.get(mediaUrls[0], {
                    responseType: 'arraybuffer',
                    maxRedirects: 10,
                    timeout: 30000
                });
                const buf = Buffer.from(dlRes.data);
                const ct = dlRes.headers['content-type'] || 'image/jpeg';

                const fd = new FormData();
                fd.append('source', buf, { filename: 'post_image.jpg', contentType: ct });
                fd.append('message', post.caption);
                fd.append('access_token', accessToken);

                const response = await axios.post(
                    `${META_GRAPH_API}/${pageId}/photos`,
                    fd,
                    { headers: fd.getHeaders(), timeout: API_TIMEOUT_MS }
                );

                console.log(`[Publishing] Facebook single-photo carousel posted: ${response.data.post_id || response.data.id}`);
                return {
                    success: true,
                    facebookPostId: response.data.post_id || response.data.id,
                    retryable: false
                };
            }

            // Upload each photo as unpublished (binary upload)
            const photoIds: string[] = [];
            for (const url of mediaUrls) {
                const dlRes = await axios.get(url, {
                    responseType: 'arraybuffer',
                    maxRedirects: 10,
                    timeout: 30000
                });
                const buf = Buffer.from(dlRes.data);
                const ct = dlRes.headers['content-type'] || 'image/jpeg';

                const fd = new FormData();
                fd.append('source', buf, { filename: 'carousel_image.jpg', contentType: ct });
                fd.append('published', 'false');
                fd.append('access_token', accessToken);

                const photoResponse = await axios.post(
                    `${META_GRAPH_API}/${pageId}/photos`,
                    fd,
                    { headers: fd.getHeaders(), timeout: API_TIMEOUT_MS }
                );
                photoIds.push(photoResponse.data.id);
            }

            // Create multi-photo post using the feed endpoint
            // Facebook requires attached_media as URL parameters with specific format
            const params = new URLSearchParams({
                message: post.caption,
                access_token: accessToken
            });

            // Add each photo as attached_media[index]
            photoIds.forEach((id, index) => {
                params.append(`attached_media[${index}]`, JSON.stringify({ media_fbid: id }));
            });

            const feedResponse = await axios.post(
                `${META_GRAPH_API}/${pageId}/feed`,
                params.toString(),
                {
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    timeout: API_TIMEOUT_MS
                }
            );

            console.log(`[Publishing] Facebook multi-photo carousel posted: ${feedResponse.data.id}`);
            return {
                success: true,
                facebookPostId: feedResponse.data.id,
                retryable: false
            };
        }

        // Facebook Reels - use video_reels endpoint
        if (post.type === 'REEL') {
            if (!post.videoUrl) {
                // Graceful fallback: If no video but has thumbnail, post as image instead
                if (post.thumbnail) {
                    console.log(`[Publishing] REEL has no videoUrl, falling back to IMAGE for Facebook: ${post.id}`);
                    const fbImageUrl = await uploadImageToFacebook(post.thumbnail, pageId, accessToken);

                    const response = await metaApi.post(`/${pageId}/photos`, null, {
                        params: {
                            url: fbImageUrl,
                            message: post.caption,
                            access_token: accessToken
                        }
                    });

                    console.log(`[Publishing] Facebook photo posted (REEL fallback): ${response.data.post_id || response.data.id}`);
                    return {
                        success: true,
                        facebookPostId: response.data.post_id || response.data.id,
                        retryable: false
                    };
                }

                return {
                    success: false,
                    error: 'Reel posts require a videoUrl',
                    errorCode: 'MISSING_VIDEO',
                    retryable: false
                };
            }

            const response = await metaApi.post(`/${pageId}/video_reels`, null, {
                params: {
                    upload_phase: 'start',
                    access_token: accessToken
                }
            });

            const videoId = response.data.video_id;

            // Upload the video
            await metaApi.post(`/${videoId}`, null, {
                params: {
                    file_url: post.videoUrl,
                    upload_phase: 'finish',
                    description: post.caption,
                    access_token: accessToken
                }
            });

            console.log(`[Publishing] Facebook Reel posted: ${videoId}`);
            return {
                success: true,
                facebookPostId: videoId,
                retryable: false
            };
        }

        // Facebook Stories
        if (post.type === 'STORY') {
            // Stories can be either photo or video
            if (post.videoUrl) {
                // Video story
                const response = await metaApi.post(`/${pageId}/video_stories`, null, {
                    params: {
                        file_url: post.videoUrl,
                        access_token: accessToken
                    }
                });

                console.log(`[Publishing] Facebook video story posted: ${response.data.id}`);
                return {
                    success: true,
                    facebookPostId: response.data.id,
                    retryable: false
                };
            } else {
                // Photo story - upload image first
                const fbImageUrl = await uploadImageToFacebook(post.thumbnail, pageId, accessToken);

                const response = await metaApi.post(`/${pageId}/photo_stories`, null, {
                    params: {
                        photo_url: fbImageUrl,
                        access_token: accessToken
                    }
                });

                console.log(`[Publishing] Facebook photo story posted: ${response.data.id}`);
                return {
                    success: true,
                    facebookPostId: response.data.id,
                    retryable: false
                };
            }
        }

        // For regular video posts, use the page videos endpoint
        if (post.type === 'VIDEO') {
            if (!post.videoUrl) {
                return {
                    success: false,
                    error: 'Video posts require a videoUrl',
                    errorCode: 'MISSING_VIDEO',
                    retryable: false
                };
            }

            const response = await metaApi.post(`/${pageId}/videos`, null, {
                params: {
                    file_url: post.videoUrl,
                    description: post.caption,
                    access_token: accessToken
                }
            });

            console.log(`[Publishing] Facebook video posted: ${response.data.id}`);
            return {
                success: true,
                facebookPostId: response.data.id,
                retryable: false
            };
        }

        return {
            success: false,
            error: `Unsupported post type for Facebook: ${post.type}`,
            errorCode: 'UNSUPPORTED_TYPE',
            retryable: false
        };
    } catch (error) {
        const parsed = parsePublishError(error);
        console.error(`[Publishing] Facebook publish failed:`, parsed.message);
        return { success: false, error: parsed.message, errorCode: parsed.code ?? undefined, retryable: parsed.retryable };
    }
}

/**
 * Main entry point: publish a post to the configured platform(s).
 */
export async function publishPost(
    post: PublishablePost,
    credentials: InstagramCredentialsForPublishing
): Promise<{ instagram?: PublishResult; facebook?: PublishResult }> {
    const results: { instagram?: PublishResult; facebook?: PublishResult } = {};

    if (post.platform === 'INSTAGRAM' || post.platform === 'BOTH') {
        results.instagram = await publishToInstagram(post, credentials);
    }

    if (post.platform === 'FACEBOOK' || post.platform === 'BOTH') {
        results.facebook = await publishToFacebook(post, credentials);
    }

    return results;
}
