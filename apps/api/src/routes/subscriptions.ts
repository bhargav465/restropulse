import express, { Request, Response } from 'express';
import {
    findCurrentPlans,
    findPlanBySlug,
    findActiveSubscription,
    createSubscription,
    updateSubscription,
    findSubscriptionByRazorpayId,
    getWeeklyPostCounts,
    addCredits,
    findCreditPackById,
    createCreditPurchase,
    findCreditPurchaseByOrderId,
    updateCreditPurchase,
    findCouponByCode,
    incrementCouponRedemptions,
    createCouponRedemption,
    hasRestaurantRedeemedCoupon,
    createInvoice,
} from '@restropulse/db';
import {
    ApiResponse,
    SubscriptionPlan,
    Subscription,
    PlanUsage,
    POST_TYPE_CREDIT_COSTS,
} from '@restropulse/shared';
import { handle } from '../middleware/async-handler.js';
import { requireAuth } from '../middleware/auth.js';
import {
    createRazorpaySubscription,
    cancelRazorpaySubscription,
    createRazorpayOrder,
    verifyWebhookSignature,
    verifyPaymentSignature,
    getRazorpayKeyId,
} from '../services/razorpay.js';

const router = express.Router();

// GET /plans -- public, list current plans
router.get('/plans', handle(async (_req: Request, res: Response<ApiResponse<SubscriptionPlan[]>>) => {
    const plans = await findCurrentPlans();
    res.json({ success: true, data: plans });
}));

// GET /current -- requireAuth, active subscription + weekly usage
router.get('/current', requireAuth, handle(async (req: Request, res: Response<ApiResponse>) => {
    const restaurantId = req.user!.restaurantId;
    const subscription = await findActiveSubscription(restaurantId);

    if (!subscription) {
        return res.json({ success: true, data: { subscription: null, usage: null } });
    }

    let usage: PlanUsage | null = null;
    if (subscription.planSnapshot?.limits) {
        const counts = await getWeeklyPostCounts(restaurantId);
        const limits = subscription.planSnapshot.limits;
        usage = {
            reels: { used: counts.REEL, limit: limits.reelsPerWeek },
            instagramPosts: {
                used: counts.IMAGE + counts.VIDEO + counts.STORY,
                limit: limits.instagramPostsPerWeek,
            },
            carousels: { used: counts.CAROUSEL, limit: limits.carouselPostsPerWeek },
        };
    }

    res.json({ success: true, data: { subscription, usage } });
}));

// POST /subscribe -- requireAuth, create Razorpay subscription
router.post('/subscribe', requireAuth, handle(async (req: Request, res: Response<ApiResponse>) => {
    const restaurantId = req.user!.restaurantId;
    const { planSlug, billingCycle, couponCode } = req.body;

    if (!planSlug || !billingCycle) {
        return res.status(400).json({ success: false, error: 'planSlug and billingCycle are required' });
    }

    if (!['MONTHLY', 'ANNUAL'].includes(billingCycle)) {
        return res.status(400).json({ success: false, error: 'billingCycle must be MONTHLY or ANNUAL' });
    }

    const plan = await findPlanBySlug(planSlug);
    if (!plan) {
        return res.status(404).json({ success: false, error: 'Plan not found' });
    }

    const razorpayPlanId = billingCycle === 'MONTHLY'
        ? plan.razorpayPlanIds.monthly
        : plan.razorpayPlanIds.annual;

    if (!razorpayPlanId) {
        return res.status(400).json({ success: false, error: 'Razorpay plan not configured for this billing cycle' });
    }

    // Validate coupon if provided
    let offerId: string | undefined;
    if (couponCode) {
        const coupon = await findCouponByCode(couponCode);
        if (!coupon) {
            return res.status(400).json({ success: false, error: 'Invalid coupon code' });
        }

        if (coupon.status !== 'ACTIVE') {
            return res.status(400).json({ success: false, error: 'Coupon is not active' });
        }

        if (coupon.validUntil && new Date(coupon.validUntil) < new Date()) {
            return res.status(400).json({ success: false, error: 'Coupon has expired' });
        }

        if (coupon.maxRedemptions && coupon.redemptionCount >= coupon.maxRedemptions) {
            return res.status(400).json({ success: false, error: 'Coupon has been fully redeemed' });
        }

        if (coupon.assignedTo && coupon.assignedTo !== restaurantId) {
            return res.status(400).json({ success: false, error: 'Invalid coupon code' });
        }

        if (coupon.applicablePlans && coupon.applicablePlans.length > 0 && !coupon.applicablePlans.includes(planSlug)) {
            return res.status(400).json({ success: false, error: 'Coupon is not applicable to this plan' });
        }

        if (coupon.applicableCycles && coupon.applicableCycles.length > 0 && !coupon.applicableCycles.includes(billingCycle)) {
            return res.status(400).json({ success: false, error: 'Coupon is not applicable to this billing cycle' });
        }

        const alreadyRedeemed = await hasRestaurantRedeemedCoupon(coupon.id, restaurantId);
        if (alreadyRedeemed) {
            return res.status(400).json({ success: false, error: 'Coupon already redeemed by this restaurant' });
        }

        offerId = coupon.razorpayOfferId;
    }

    // Total cycles: 120 for monthly (10 years), 10 for annual
    const totalCount = billingCycle === 'MONTHLY' ? 120 : 10;

    const razorpaySub = await createRazorpaySubscription(razorpayPlanId, totalCount, offerId);

    // Upsert subscription doc
    const existing = await findActiveSubscription(restaurantId);
    const now = new Date();

    if (existing) {
        await updateSubscription(existing.id, {
            planId: plan.id,
            planSnapshot: plan,
            billingCycle: billingCycle,
            status: 'CREATED',
            razorpaySubscriptionId: razorpaySub.id,
            couponCode: couponCode || undefined,
            currentPeriodStart: now.toISOString(),
        });
    } else {
        await createSubscription({
            restaurantId,
            planId: plan.id,
            planSnapshot: plan,
            billingCycle: billingCycle,
            status: 'CREATED',
            razorpaySubscriptionId: razorpaySub.id,
            credits: 0,
            couponCode: couponCode || undefined,
            currentPeriodStart: now.toISOString(),
        });
    }

    res.json({
        success: true,
        data: {
            subscriptionId: razorpaySub.id,
            keyId: getRazorpayKeyId(),
        },
    });
}));

// POST /webhook -- Razorpay webhook handler (no auth, signature verification)
router.post('/webhook', async (req: Request, res: Response) => {
    try {
        const signature = req.headers['x-razorpay-signature'] as string;

        if (!signature) {
            return res.status(400).json({ success: false, error: 'Missing signature' });
        }

        const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);

        if (!verifyWebhookSignature(body, signature)) {
            return res.status(401).json({ success: false, error: 'Invalid signature' });
        }

        const event = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        const eventType = event.event;
        const payload = event.payload;

        console.log(`[Razorpay Webhook] ${eventType}`);

        switch (eventType) {
            case 'subscription.authenticated': {
                const subId = payload?.subscription?.entity?.id;
                if (subId) {
                    const sub = await findSubscriptionByRazorpayId(subId);
                    if (sub) {
                        await updateSubscription(sub.id, { status: 'AUTHENTICATED' });
                    }
                }
                break;
            }

            case 'subscription.activated': {
                const subId = payload?.subscription?.entity?.id;
                if (subId) {
                    const sub = await findSubscriptionByRazorpayId(subId);
                    if (sub) {
                        const entity = payload.subscription.entity;
                        const periodEnd = entity.current_end
                            ? new Date(entity.current_end * 1000).toISOString()
                            : undefined;

                        await updateSubscription(sub.id, {
                            status: 'ACTIVE',
                            currentPeriodEnd: periodEnd,
                            razorpayCustomerId: entity.customer_id,
                        });

                        // Record coupon redemption if applicable
                        if (sub.couponCode) {
                            const coupon = await findCouponByCode(sub.couponCode);
                            if (coupon) {
                                await incrementCouponRedemptions(coupon.id);
                                await createCouponRedemption({
                                    couponId: coupon.id,
                                    couponCode: coupon.code,
                                    restaurantId: sub.restaurantId,
                                    userId: '',
                                    subscriptionId: sub.id,
                                    discountAppliedPaise: coupon.type === 'FLAT' ? coupon.value : 0,
                                    redeemedAt: new Date(),
                                });
                            }
                        }
                    }
                }
                break;
            }

            case 'subscription.charged': {
                const subId = payload?.subscription?.entity?.id;
                if (subId) {
                    const sub = await findSubscriptionByRazorpayId(subId);
                    if (sub) {
                        const entity = payload.subscription.entity;
                        const periodEnd = entity.current_end
                            ? new Date(entity.current_end * 1000).toISOString()
                            : undefined;
                        const periodStart = entity.current_start
                            ? new Date(entity.current_start * 1000).toISOString()
                            : undefined;

                        await updateSubscription(sub.id, {
                            status: 'ACTIVE',
                            currentPeriodStart: periodStart,
                            currentPeriodEnd: periodEnd,
                        });

                        // Create invoice record from payment
                        const payment = payload?.payment?.entity;
                        if (payment) {
                            const planName = sub.planSnapshot?.name || 'Subscription';
                            const cycle = sub.billingCycle || 'MONTHLY';
                            await createInvoice({
                                restaurantId: sub.restaurantId,
                                type: 'SUBSCRIPTION',
                                razorpayInvoiceId: payment.invoice_id || undefined,
                                razorpayPaymentId: payment.id,
                                razorpaySubscriptionId: subId,
                                amountPaise: payment.amount || 0,
                                currency: payment.currency || 'INR',
                                status: 'paid',
                                description: `${planName} Plan - ${cycle.charAt(0) + cycle.slice(1).toLowerCase()}`,
                                billingPeriodStart: periodStart,
                                billingPeriodEnd: periodEnd,
                                paidAt: new Date(),
                            });
                        }
                    }
                }
                break;
            }

            case 'subscription.pending': {
                const subId = payload?.subscription?.entity?.id;
                if (subId) {
                    const sub = await findSubscriptionByRazorpayId(subId);
                    if (sub) {
                        await updateSubscription(sub.id, { status: 'PAST_DUE' });
                    }
                }
                break;
            }

            case 'subscription.halted': {
                const subId = payload?.subscription?.entity?.id;
                if (subId) {
                    const sub = await findSubscriptionByRazorpayId(subId);
                    if (sub) {
                        await updateSubscription(sub.id, { status: 'HALTED' });
                    }
                }
                break;
            }

            case 'subscription.cancelled': {
                const subId = payload?.subscription?.entity?.id;
                if (subId) {
                    const sub = await findSubscriptionByRazorpayId(subId);
                    if (sub) {
                        await updateSubscription(sub.id, {
                            status: 'CANCELLED',
                            cancelledAt: new Date().toISOString(),
                        });
                    }
                }
                break;
            }

            default:
                console.log(`[Razorpay Webhook] Unhandled event: ${eventType}`);
        }

        res.json({ success: true });
    } catch (error) {
        console.error('[Razorpay Webhook] Error:', error);
        res.status(500).json({ success: false, error: 'Webhook processing failed' });
    }
});

// POST /upgrade -- requireAuth, cancel current and create new subscription
router.post('/upgrade', requireAuth, handle(async (req: Request, res: Response<ApiResponse>) => {
    const restaurantId = req.user!.restaurantId;
    const existing = await findActiveSubscription(restaurantId);

    if (existing?.razorpaySubscriptionId && (existing.status === 'ACTIVE' || existing.status === 'PAST_DUE')) {
        await cancelRazorpaySubscription(existing.razorpaySubscriptionId, false);
        await updateSubscription(existing.id, {
            status: 'CANCELLED',
            cancelledAt: new Date().toISOString(),
        });
    }

    // Forward to subscribe logic (client should call /subscribe after this)
    res.json({ success: true, message: 'Current subscription cancelled. Proceed with new subscription.' });
}));

// POST /cancel -- requireAuth, cancel at cycle end
router.post('/cancel', requireAuth, handle(async (req: Request, res: Response<ApiResponse>) => {
    const restaurantId = req.user!.restaurantId;
    const subscription = await findActiveSubscription(restaurantId);

    if (!subscription || !subscription.razorpaySubscriptionId) {
        return res.status(400).json({ success: false, error: 'No active subscription to cancel' });
    }

    if (subscription.status !== 'ACTIVE' && subscription.status !== 'PAST_DUE') {
        return res.status(400).json({ success: false, error: 'Subscription is not active' });
    }

    await cancelRazorpaySubscription(subscription.razorpaySubscriptionId, true);
    await updateSubscription(subscription.id, {
        cancelledAt: new Date().toISOString(),
    });

    res.json({ success: true, message: 'Subscription will cancel at the end of the current billing period' });
}));

// POST /credits/purchase -- requireAuth, create Razorpay Order for credit pack
router.post('/credits/purchase', requireAuth, handle(async (req: Request, res: Response<ApiResponse>) => {
    const { creditPackId } = req.body;

    if (!creditPackId) {
        return res.status(400).json({ success: false, error: 'creditPackId is required' });
    }

    const pack = await findCreditPackById(creditPackId);
    if (!pack || !pack.isActive) {
        return res.status(404).json({ success: false, error: 'Credit pack not found' });
    }

    const receipt = `cr_${req.user!.restaurantId}_${Date.now()}`;
    const order = await createRazorpayOrder(pack.priceInPaise, receipt);

    await createCreditPurchase({
        restaurantId: req.user!.restaurantId,
        userId: req.user!.userId,
        creditPackId: pack.id,
        creditsAdded: pack.credits,
        amountPaise: pack.priceInPaise,
        razorpayOrderId: order.id,
        status: 'PENDING',
    });

    res.json({
        success: true,
        data: {
            orderId: order.id,
            amount: order.amount,
            currency: order.currency,
            keyId: getRazorpayKeyId(),
            credits: pack.credits,
        },
    });
}));

// POST /credits/verify -- requireAuth, verify payment and add credits
router.post('/credits/verify', requireAuth, handle(async (req: Request, res: Response<ApiResponse>) => {
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;

    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
        return res.status(400).json({ success: false, error: 'Missing payment verification fields' });
    }

    if (!verifyPaymentSignature(razorpayOrderId, razorpayPaymentId, razorpaySignature)) {
        return res.status(400).json({ success: false, error: 'Payment signature verification failed' });
    }

    const purchase = await findCreditPurchaseByOrderId(razorpayOrderId);
    if (!purchase) {
        return res.status(404).json({ success: false, error: 'Purchase not found' });
    }

    if (purchase.status === 'PAID') {
        return res.json({ success: true, message: 'Credits already added' });
    }

    // Update purchase status
    await updateCreditPurchase(purchase.id, {
        status: 'PAID',
        razorpayPaymentId,
    });

    // Add credits to subscription
    const subscription = await findActiveSubscription(purchase.restaurantId);
    if (subscription) {
        await addCredits(subscription.id, purchase.creditsAdded);
    }

    // Create invoice for credit purchase
    await createInvoice({
        restaurantId: purchase.restaurantId,
        type: 'CREDIT_PURCHASE',
        razorpayOrderId: razorpayOrderId,
        razorpayPaymentId: razorpayPaymentId,
        amountPaise: purchase.amountPaise,
        currency: 'INR',
        status: 'paid',
        description: `${purchase.creditsAdded} Credits`,
        paidAt: new Date(),
    });

    res.json({ success: true, message: `${purchase.creditsAdded} credits added successfully` });
}));

export default router;
