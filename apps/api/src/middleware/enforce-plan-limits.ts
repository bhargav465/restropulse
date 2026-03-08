import { RequestHandler } from 'express';
import { findActiveSubscription, getWeeklyPostCounts } from '@restropulse/db';
import { POST_TYPE_CREDIT_COSTS, PostType } from '@restropulse/shared';

/**
 * enforcePlanLimits middleware.
 * Checks weekly post counts against plan limits. If over limit (or no active plan),
 * checks credit balance. Sets req.creditCost if credit deduction is needed.
 * Returns 403 if no credits available.
 *
 * Expects req.body.type to contain the PostType.
 * Must be used after requireAuth.
 */
export const enforcePlanLimits: RequestHandler = async (req, res, next) => {
    try {
        const restaurantId = req.user!.restaurantId;
        const postType = (req.body.type || 'IMAGE') as PostType;
        const creditCost = POST_TYPE_CREDIT_COSTS[postType] ?? 1;

        const subscription = await findActiveSubscription(restaurantId);

        // No subscription doc at all -- block
        if (!subscription) {
            res.status(403).json({
                success: false,
                error: 'No subscription found. Please subscribe or purchase credits.',
                creditsNeeded: creditCost,
            });
            return;
        }

        const isActive = subscription.status === 'ACTIVE' || subscription.status === 'PAST_DUE';

        if (isActive && subscription.planSnapshot?.limits) {
            // Check weekly limits by post type category
            const counts = await getWeeklyPostCounts(restaurantId);
            const limits = subscription.planSnapshot.limits;

            let withinLimit = false;

            if (postType === 'REEL') {
                withinLimit = counts.REEL < limits.reelsPerWeek;
            } else if (postType === 'CAROUSEL') {
                withinLimit = counts.CAROUSEL < limits.carouselPostsPerWeek;
            } else {
                // IMAGE, VIDEO, STORY all count toward instagramPostsPerWeek
                const instagramPostCount = counts.IMAGE + counts.VIDEO + counts.STORY;
                withinLimit = instagramPostCount < limits.instagramPostsPerWeek;
            }

            if (withinLimit) {
                // Within plan limits, no credit deduction needed
                next();
                return;
            }
        }

        // Over limit or no active plan -- check credits
        if (subscription.credits >= creditCost) {
            req.creditCost = creditCost;
            next();
            return;
        }

        res.status(403).json({
            success: false,
            error: 'No active subscription or credits. Subscribe to a plan or purchase credits.',
            creditsNeeded: creditCost,
            creditsAvailable: subscription.credits,
        });
    } catch (error) {
        next(error);
    }
};
