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
    findInvoiceByPaymentId,
    findUserById,
    updateUser,
} from '@restropulse/db';
import {
    ApiResponse,
    SubscriptionPlan,
    Subscription,
    PlanUsage,
    POST_TYPE_CREDIT_COSTS,
    PLATFORM_POST_TYPES,
    Platform,
} from '@restropulse/shared';
import { handle } from '../middleware/async-handler.js';
import { requireAuth } from '../middleware/auth.js';
import {
    createRazorpaySubscription,
    cancelRazorpaySubscription,
    updateRazorpaySubscription,
    createRazorpayOrder,
    verifyWebhookSignature,
    verifyPaymentSignature,
    getRazorpayKeyId,
    isRazorpayConfigured,
    createRazorpayCustomer,
    fetchRazorpayCustomersByContact,
    fetchRazorpayInvoice,
} from '../services/razorpay.js';
import { createLogger, trackEvent } from '@restropulse/telemetry/server';

const log = createLogger('subscriptions');

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
        const weeklyLimits = subscription.planSnapshot.limits.weekly;
        usage = {};
        for (const [platform, typeLimits] of Object.entries(weeklyLimits)) {
            const p = platform as Platform;
            const validTypes = PLATFORM_POST_TYPES[p] || [];
            usage[p] = {};
            for (const postType of validTypes) {
                const limit = typeLimits[postType] ?? 0;
                const used = counts[p]?.[postType] ?? 0;
                usage[p]![postType] = { used, limit };
            }
        }
    }

    res.json({ success: true, data: { subscription, usage } });
}));

// POST /subscribe -- requireAuth, create Razorpay subscription
router.post('/subscribe', requireAuth, handle(async (req: Request, res: Response<ApiResponse>) => {
    if (!isRazorpayConfigured()) {
        return res.status(503).json({ success: false, error: 'Payment service is not configured' });
    }

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

    // Block duplicate subscriptions — active subs must use /change-plan instead.
    // Exception: if cancelAtPeriodEnd is set, the user already chose to leave and
    // wants a new plan now. Cancel the Razorpay subscription immediately and proceed.
    const existingCheck = await findActiveSubscription(restaurantId);
    if (existingCheck && ['ACTIVE', 'PAST_DUE', 'CREATED', 'AUTHENTICATED'].includes(existingCheck.status)) {
        if (!existingCheck.cancelAtPeriodEnd) {
            return res.status(409).json({ success: false, error: 'An active subscription already exists. Use change-plan to switch plans.' });
        }
        if (existingCheck.razorpaySubscriptionId) {
            try {
                await cancelRazorpaySubscription(existingCheck.razorpaySubscriptionId, false);
            } catch (cancelErr) {
                const msg = ((cancelErr as Error).message || '').toLowerCase();
                const alreadyTerminal = msg.includes('already cancelled') || msg.includes('completed') || msg.includes('not in an active state');
                if (alreadyTerminal) {
                    log.warn({ err: cancelErr, razorpaySubscriptionId: existingCheck.razorpaySubscriptionId }, 'Subscription already in terminal state in Razorpay — proceeding');
                } else {
                    throw new Error('Failed to cancel your existing subscription. Please try again in a moment.');
                }
            }
        }
        await updateSubscription(existingCheck.id, {
            status: 'CANCELLED',
            cancelledAt: new Date().toISOString(),
            cancelAtPeriodEnd: false,
            endedAt: new Date().toISOString(),
        });
    }

    // Total cycles: 120 for monthly (10 years), 10 for annual
    const totalCount = billingCycle === 'MONTHLY' ? 120 : 10;

    // Reuse existing Razorpay customer (created at onboarding); create one if missing
    const user = await findUserById(req.user!.userId);
    let customerId: string | undefined = user?.razorpayCustomerId;
    if (!customerId && user?.email) {
        try {
            const customer = await createRazorpayCustomer(user.name, user.email, user.phone);
            customerId = customer.id;
            await updateUser(req.user!.userId, { razorpayCustomerId: customerId });
        } catch (customerErr) {
            const errMsg = (customerErr as Error).message || '';
            if (errMsg.includes('Customer already exists') && user.phone) {
                // Customer exists in Razorpay but not linked in our DB — recover the ID
                try {
                    const existing = await fetchRazorpayCustomersByContact(user.phone);
                    if (existing.items?.[0]?.id) {
                        customerId = existing.items[0].id;
                        await updateUser(req.user!.userId, { razorpayCustomerId: customerId });
                    }
                } catch (fetchErr) {
                    log.warn({ err: fetchErr, userId: req.user!.userId }, 'Failed to fetch existing Razorpay customer; proceeding without customer_id');
                }
            } else {
                log.warn({ err: customerErr, userId: req.user!.userId }, 'Failed to create Razorpay customer; proceeding without customer_id');
            }
        }
    }

    const razorpaySub = await createRazorpaySubscription(razorpayPlanId, totalCount, offerId, customerId);

    const now = new Date();
    // Archive the previous subscription document (if any) by stamping endedAt,
    // then always insert a fresh record. The partial unique index on restaurantId
    // (where endedAt: null) ensures at most one active subscription per restaurant.
    if (existingCheck) {
        await updateSubscription(existingCheck.id, { endedAt: now.toISOString() });
    }
    await createSubscription({
        restaurantId,
        planId: plan.id,
        planSnapshot: plan,
        billingCycle: billingCycle,
        status: 'CREATED',
        razorpaySubscriptionId: razorpaySub.id,
        // Preserve credits when re-subscribing from terminal state;
        // zero out only for the NONE (free trial) -> paid transition.
        credits: existingCheck?.status === 'NONE' ? 0 : (existingCheck?.credits ?? 0),
        couponCode: couponCode || undefined,
        currentPeriodStart: now.toISOString(),
    });

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

        // express.raw() always gives a Buffer — pass it directly so HMAC is computed
        // over the original bytes, not JSON.stringify(buffer) which produces garbage.
        const rawBody = req.body as Buffer;

        if (!verifyWebhookSignature(rawBody, signature)) {
            return res.status(401).json({ success: false, error: 'Invalid signature' });
        }

        const event = JSON.parse(rawBody.toString('utf8'));
        const eventType = event.event;
        const payload = event.payload;

        log.info({ eventType }, 'Razorpay webhook received');
        trackEvent('webhook.received', { eventType });

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

                        trackEvent('subscription.activated', {
                            subscriptionId: sub.id,
                            restaurantId: sub.restaurantId,
                            razorpaySubscriptionId: subId,
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
                            // Defensively clear cancellation flags: if the user re-subscribed
                            // and the stale fields weren't cleared (race condition), the first
                            // successful charge corrects them.
                            cancelAtPeriodEnd: false,
                            cancelledAt: undefined,
                        });

                        trackEvent('payment.completed', {
                            subscriptionId: sub.id,
                            restaurantId: sub.restaurantId,
                            razorpaySubscriptionId: subId,
                            amountPaise: String(payload?.payment?.entity?.amount || 0),
                        });

                        // Create invoice record from payment (idempotent: skip if already exists for this payment)
                        const payment = payload?.payment?.entity;
                        if (payment) {
                            const existingInvoice = await findInvoiceByPaymentId(payment.id);
                            if (!existingInvoice) {
                                // Capture plan name before pending promotion so invoice reflects what was charged
                                const planName = sub.pendingPlanSnapshot?.name ?? sub.planSnapshot?.name ?? 'Subscription';
                                const cycle = sub.billingCycle || 'MONTHLY';
                                const cycleLabel = cycle.charAt(0) + cycle.slice(1).toLowerCase();

                                // Fetch the auto-generated Razorpay subscription invoice to get its PDF URL.
                                // This is the post-payment receipt Razorpay creates for every charge cycle.
                                const rzpInvoiceId: string | undefined = payment.invoice_id || undefined;
                                let rzpInvoicePdfUrl: string | undefined;

                                if (rzpInvoiceId) {
                                    try {
                                        const rzpInvoice = await fetchRazorpayInvoice(rzpInvoiceId);
                                        rzpInvoicePdfUrl = rzpInvoice.short_url;
                                    } catch (invoiceErr) {
                                        log.warn({ err: invoiceErr, rzpInvoiceId }, 'Failed to fetch Razorpay invoice PDF url — continuing without pdf link');
                                    }
                                }

                                await createInvoice({
                                    restaurantId: sub.restaurantId,
                                    type: 'SUBSCRIPTION',
                                    razorpayInvoiceId: rzpInvoiceId,
                                    razorpayPaymentId: payment.id,
                                    razorpaySubscriptionId: subId,
                                    amountPaise: payment.amount || 0,
                                    currency: payment.currency || 'INR',
                                    status: 'paid',
                                    description: `${planName} Plan - ${cycleLabel}`,
                                    billingPeriodStart: periodStart,
                                    billingPeriodEnd: periodEnd,
                                    pdfUrl: rzpInvoicePdfUrl,
                                    paidAt: new Date(),
                                });

                                log.info(
                                    { paymentId: payment.id, rzpInvoiceId: rzpInvoiceId ?? null },
                                    'Subscription charged: invoice record created',
                                );
                            } else {
                                log.info({ razorpayPaymentId: payment.id }, 'Skipping duplicate subscription.charged invoice');
                            }
                        }

                        // Promote scheduled downgrade if the new cycle has started
                        if (sub.pendingPlanId && sub.pendingPlanSnapshot) {
                            await updateSubscription(sub.id, {
                                planId: sub.pendingPlanId,
                                planSnapshot: sub.pendingPlanSnapshot,
                                billingCycle: sub.pendingBillingCycle ?? sub.billingCycle,
                                pendingPlanId: undefined,
                                pendingPlanSnapshot: null,
                                pendingBillingCycle: undefined,
                            });
                            const updatedSub = await findSubscriptionByRazorpayId(subId);
                            if (updatedSub) Object.assign(sub, updatedSub);
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
                            // Cancellation is now complete — clear the pending flag so
                            // re-subscribe logic and the UI do not see a stale "pending
                            // cancellation" state on a fully cancelled subscription.
                            cancelAtPeriodEnd: false,
                        });
                    }
                }
                break;
            }

            default:
                log.warn({ eventType }, 'Unhandled Razorpay webhook event');
        }

        res.json({ success: true });
    } catch (error) {
        log.error({ err: error }, 'Razorpay webhook processing error');
        res.status(500).json({ success: false, error: 'Webhook processing failed' });
    }
});

// POST /change-plan -- requireAuth, upgrade or downgrade the current subscription
// Upgrade (higher effective monthly price): schedule_change_at=now, applies immediately.
// Downgrade (lower effective monthly price): schedule_change_at=cycle_end, applies next cycle.
router.post('/change-plan', requireAuth, handle(async (req: Request, res: Response<ApiResponse>) => {
    if (!isRazorpayConfigured()) {
        return res.status(503).json({ success: false, error: 'Payment service is not configured' });
    }

    const restaurantId = req.user!.restaurantId;
    const { planSlug, billingCycle } = req.body;

    if (!planSlug || !billingCycle) {
        return res.status(400).json({ success: false, error: 'planSlug and billingCycle are required' });
    }

    if (!['MONTHLY', 'ANNUAL'].includes(billingCycle)) {
        return res.status(400).json({ success: false, error: 'billingCycle must be MONTHLY or ANNUAL' });
    }

    const existing = await findActiveSubscription(restaurantId);
    if (!existing || !existing.razorpaySubscriptionId) {
        return res.status(400).json({ success: false, error: 'No active subscription to change' });
    }

    if (existing.status !== 'ACTIVE' && existing.status !== 'PAST_DUE') {
        return res.status(400).json({ success: false, error: 'Subscription must be active to change plan' });
    }

    const plan = await findPlanBySlug(planSlug);
    if (!plan) {
        return res.status(404).json({ success: false, error: 'Plan not found' });
    }

    if (plan.slug === existing.planSnapshot?.slug && billingCycle === existing.billingCycle) {
        return res.status(400).json({ success: false, error: 'Already on this plan and billing cycle' });
    }

    const razorpayPlanId = billingCycle === 'MONTHLY'
        ? plan.razorpayPlanIds.monthly
        : plan.razorpayPlanIds.annual;

    if (!razorpayPlanId) {
        return res.status(400).json({ success: false, error: 'Razorpay plan not configured for this billing cycle' });
    }

    // Determine upgrade vs. downgrade.
    // Plan tier is compared by monthly list price (not divided by 12 for annual),
    // which correctly reflects service level independent of billing cycle.
    // Switching from Monthly to Annual billing on the same or higher tier is
    // also an upgrade (applies immediately): the user is committing more upfront.
    const currentSnapshot = existing.planSnapshot;
    const currentMonthlyPrice = currentSnapshot?.pricing.monthly ?? 0;
    const targetMonthlyPrice = plan.pricing.monthly;
    const isPlanUpgrade = targetMonthlyPrice > currentMonthlyPrice;
    const isBillingCycleUpgrade =
        plan.slug === currentSnapshot?.slug &&
        billingCycle === 'ANNUAL' &&
        existing.billingCycle === 'MONTHLY';
    const isUpgrade = isPlanUpgrade || isBillingCycleUpgrade;
    const scheduleChangeAt = isUpgrade ? 'now' : 'cycle_end';

    try {
        await updateRazorpaySubscription(existing.razorpaySubscriptionId, {
            planId: razorpayPlanId,
            scheduleChangeAt,
        });
    } catch (err) {
        const msg = (err as Error).message || '';
        if (msg.toLowerCase().includes('payment mode is upi')) {
            return res.status(422).json({
                success: false,
                error: 'Plan changes are not supported for UPI subscriptions. Please cancel your current plan and subscribe to the new one.',
            });
        }
        throw err;
    }

    if (isUpgrade) {
        await updateSubscription(existing.id, {
            planId: plan.id,
            planSnapshot: plan,
            billingCycle: billingCycle,
            pendingPlanId: undefined,
            pendingPlanSnapshot: null,
            pendingBillingCycle: undefined,
        });
        log.info({ restaurantId, planSlug, billingCycle }, 'Plan upgraded immediately');
        return res.json({ success: true, data: { effective: 'immediate', planName: plan.name } });
    } else {
        await updateSubscription(existing.id, {
            pendingPlanId: plan.id,
            pendingPlanSnapshot: plan,
            pendingBillingCycle: billingCycle,
        });
        log.info({ restaurantId, planSlug, billingCycle }, 'Plan downgrade scheduled for cycle end');
        return res.json({
            success: true,
            data: {
                effective: 'cycle_end',
                planName: plan.name,
                currentPeriodEnd: existing.currentPeriodEnd,
            },
        });
    }
}));

// POST /reactivate -- requireAuth, undo a pending cycle-end cancellation
router.post('/reactivate', requireAuth, handle(async (req: Request, res: Response<ApiResponse>) => {
    const restaurantId = req.user!.restaurantId;
    const existing = await findActiveSubscription(restaurantId);

    if (!existing || !existing.razorpaySubscriptionId) {
        return res.status(400).json({ success: false, error: 'No subscription to reactivate' });
    }

    if ((existing.status !== 'ACTIVE' && existing.status !== 'PAST_DUE') || !existing.cancelAtPeriodEnd) {
        return res.status(400).json({ success: false, error: 'Subscription is not pending cancellation' });
    }

    // Passing cancel_at_cycle_end=0 to the cancel endpoint undoes the pending cancellation
    await cancelRazorpaySubscription(existing.razorpaySubscriptionId, false);
    await updateSubscription(existing.id, {
        cancelAtPeriodEnd: false,
        cancelledAt: undefined,
    });

    log.info({ restaurantId }, 'Subscription reactivated');
    res.json({ success: true, message: 'Subscription reactivated successfully' });
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
        cancelAtPeriodEnd: true,
    });

    res.json({ success: true, message: 'Subscription will cancel at the end of the current billing period' });
}));

// POST /credits/purchase -- requireAuth, create Razorpay Order for credit pack
router.post('/credits/purchase', requireAuth, handle(async (req: Request, res: Response<ApiResponse>) => {
    if (!isRazorpayConfigured()) {
        return res.status(503).json({ success: false, error: 'Payment service is not configured' });
    }

    const { creditPackId } = req.body;

    if (!creditPackId) {
        return res.status(400).json({ success: false, error: 'creditPackId is required' });
    }

    const pack = await findCreditPackById(creditPackId);
    if (!pack || !pack.isActive) {
        return res.status(404).json({ success: false, error: 'Credit pack not found' });
    }

    const receipt = `cr_${req.user!.restaurantId.slice(-8)}_${Date.now()}`;
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
