import { describe, test, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

// Define Mocks
const mockFindCurrentPlans = vi.fn();
const mockFindPlanBySlug = vi.fn();
const mockFindActiveSubscription = vi.fn();
const mockCreateSubscription = vi.fn();
const mockUpdateSubscription = vi.fn();
const mockFindSubscriptionByRazorpayId = vi.fn();
const mockGetWeeklyPostCounts = vi.fn();
const mockAddCredits = vi.fn();
const mockFindCreditPackById = vi.fn();
const mockCreateCreditPurchase = vi.fn();
const mockFindCreditPurchaseByOrderId = vi.fn();
const mockUpdateCreditPurchase = vi.fn();
const mockFindCouponByCode = vi.fn();
const mockIncrementCouponRedemptions = vi.fn();
const mockCreateCouponRedemption = vi.fn();
const mockHasRestaurantRedeemedCoupon = vi.fn();
const mockCreateInvoice = vi.fn();

vi.mock('@restropulse/db', async (importOriginal) => {
    const actual = await importOriginal() as any;
    return {
        ...actual,
        findCurrentPlans: mockFindCurrentPlans,
        findPlanBySlug: mockFindPlanBySlug,
        findActiveSubscription: mockFindActiveSubscription,
        createSubscription: mockCreateSubscription,
        updateSubscription: mockUpdateSubscription,
        findSubscriptionByRazorpayId: mockFindSubscriptionByRazorpayId,
        getWeeklyPostCounts: mockGetWeeklyPostCounts,
        addCredits: mockAddCredits,
        findCreditPackById: mockFindCreditPackById,
        createCreditPurchase: mockCreateCreditPurchase,
        findCreditPurchaseByOrderId: mockFindCreditPurchaseByOrderId,
        updateCreditPurchase: mockUpdateCreditPurchase,
        findCouponByCode: mockFindCouponByCode,
        incrementCouponRedemptions: mockIncrementCouponRedemptions,
        createCouponRedemption: mockCreateCouponRedemption,
        hasRestaurantRedeemedCoupon: mockHasRestaurantRedeemedCoupon,
        createInvoice: mockCreateInvoice,
    };
});

const mockCreateRazorpaySubscription = vi.fn();
const mockCancelRazorpaySubscription = vi.fn();
const mockCreateRazorpayOrder = vi.fn();
const mockVerifyWebhookSignature = vi.fn();
const mockVerifyPaymentSignature = vi.fn();
const mockGetRazorpayKeyId = vi.fn().mockReturnValue('rzp_test_key');

vi.mock('../../src/services/razorpay.js', () => ({
    createRazorpaySubscription: mockCreateRazorpaySubscription,
    cancelRazorpaySubscription: mockCancelRazorpaySubscription,
    createRazorpayOrder: mockCreateRazorpayOrder,
    verifyWebhookSignature: mockVerifyWebhookSignature,
    verifyPaymentSignature: mockVerifyPaymentSignature,
    getRazorpayKeyId: mockGetRazorpayKeyId,
    createRazorpayOffer: vi.fn(),
    fetchRazorpayInvoice: vi.fn(),
    listRazorpayInvoices: vi.fn(),
}));

const { createTestApp, generateAuthToken } = await import('../helpers/testHelper.js');

const authToken = generateAuthToken();
const app = createTestApp();

const mockPlan = {
    id: 'plan-growth-v1',
    slug: 'growth',
    version: 1,
    isCurrentVersion: true,
    tier: 'GROWTH',
    name: 'Growth',
    limits: { reelsPerWeek: 2, instagramPostsPerWeek: 5, carouselPostsPerWeek: 3 },
    pricing: { monthly: 999900, annual: 9999000, currency: 'INR' },
    razorpayPlanIds: { monthly: 'plan_monthly_growth', annual: 'plan_annual_growth' },
    features: ['INSTAGRAM', 'FACEBOOK'],
};

const mockSubscription = {
    id: 'sub-r1',
    restaurantId: 'r1',
    planId: 'plan-growth-v1',
    planSnapshot: mockPlan,
    billingCycle: 'MONTHLY',
    status: 'ACTIVE',
    razorpaySubscriptionId: 'sub_rzp_123',
    credits: 10,
    currentPeriodStart: '2024-06-01',
    currentPeriodEnd: '2024-06-30',
};

describe('Subscription Routes', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('GET /api/subscriptions/plans', () => {
        test('should return current plans (no auth required)', async () => {
            mockFindCurrentPlans.mockResolvedValue([mockPlan]);

            const res = await request(app).get('/api/subscriptions/plans');

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.data).toHaveLength(1);
            expect(res.body.data[0].slug).toBe('growth');
        });
    });

    describe('GET /api/subscriptions/current', () => {
        test('should return current subscription with usage', async () => {
            mockFindActiveSubscription.mockResolvedValue(mockSubscription);
            mockGetWeeklyPostCounts.mockResolvedValue({
                IMAGE: 2, VIDEO: 0, STORY: 0, CAROUSEL: 1, REEL: 0,
            });

            const res = await request(app)
                .get('/api/subscriptions/current')
                .set('Authorization', `Bearer ${authToken}`);

            expect(res.status).toBe(200);
            expect(res.body.data.subscription.status).toBe('ACTIVE');
            expect(res.body.data.usage.instagramPosts.used).toBe(2);
            expect(res.body.data.usage.carousels.used).toBe(1);
        });

        test('should return null when no subscription exists', async () => {
            mockFindActiveSubscription.mockResolvedValue(null);

            const res = await request(app)
                .get('/api/subscriptions/current')
                .set('Authorization', `Bearer ${authToken}`);

            expect(res.status).toBe(200);
            expect(res.body.data.subscription).toBeNull();
            expect(res.body.data.usage).toBeNull();
        });

        test('should return 401 without auth', async () => {
            const res = await request(app).get('/api/subscriptions/current');
            expect(res.status).toBe(401);
        });
    });

    describe('POST /api/subscriptions/subscribe', () => {
        test('should create a Razorpay subscription', async () => {
            mockFindPlanBySlug.mockResolvedValue(mockPlan);
            mockFindActiveSubscription.mockResolvedValue(null);
            mockCreateSubscription.mockResolvedValue({ id: 'sub-new' });
            mockCreateRazorpaySubscription.mockResolvedValue({ id: 'sub_rzp_new' });

            const res = await request(app)
                .post('/api/subscriptions/subscribe')
                .set('Authorization', `Bearer ${authToken}`)
                .send({ planSlug: 'growth', billingCycle: 'MONTHLY' });

            expect(res.status).toBe(200);
            expect(res.body.data.subscriptionId).toBe('sub_rzp_new');
            expect(res.body.data.keyId).toBe('rzp_test_key');
        });

        test('should return 400 when planSlug is missing', async () => {
            const res = await request(app)
                .post('/api/subscriptions/subscribe')
                .set('Authorization', `Bearer ${authToken}`)
                .send({ billingCycle: 'MONTHLY' });

            expect(res.status).toBe(400);
        });

        test('should return 400 for invalid billingCycle', async () => {
            const res = await request(app)
                .post('/api/subscriptions/subscribe')
                .set('Authorization', `Bearer ${authToken}`)
                .send({ planSlug: 'growth', billingCycle: 'WEEKLY' });

            expect(res.status).toBe(400);
        });

        test('should return 404 when plan not found', async () => {
            mockFindPlanBySlug.mockResolvedValue(null);

            const res = await request(app)
                .post('/api/subscriptions/subscribe')
                .set('Authorization', `Bearer ${authToken}`)
                .send({ planSlug: 'nonexistent', billingCycle: 'MONTHLY' });

            expect(res.status).toBe(404);
        });

        test('should apply coupon when provided', async () => {
            mockFindPlanBySlug.mockResolvedValue(mockPlan);
            mockFindCouponByCode.mockResolvedValue({
                id: 'c1', code: 'TESTCODE', status: 'ACTIVE', type: 'PERCENTAGE',
                value: 10, redemptionCount: 0, maxRedemptions: 5,
                razorpayOfferId: 'offer_rzp_1',
                validFrom: new Date('2024-01-01'),
            });
            mockHasRestaurantRedeemedCoupon.mockResolvedValue(false);
            mockFindActiveSubscription.mockResolvedValue(null);
            mockCreateSubscription.mockResolvedValue({ id: 'sub-new' });
            mockCreateRazorpaySubscription.mockResolvedValue({ id: 'sub_rzp_coupon' });

            const res = await request(app)
                .post('/api/subscriptions/subscribe')
                .set('Authorization', `Bearer ${authToken}`)
                .send({ planSlug: 'growth', billingCycle: 'MONTHLY', couponCode: 'TESTCODE' });

            expect(res.status).toBe(200);
            expect(mockCreateRazorpaySubscription).toHaveBeenCalledWith(
                'plan_monthly_growth', 120, 'offer_rzp_1',
            );
        });

        test('should reject invalid coupon code', async () => {
            mockFindPlanBySlug.mockResolvedValue(mockPlan);
            mockFindCouponByCode.mockResolvedValue(null);

            const res = await request(app)
                .post('/api/subscriptions/subscribe')
                .set('Authorization', `Bearer ${authToken}`)
                .send({ planSlug: 'growth', billingCycle: 'MONTHLY', couponCode: 'BADCODE' });

            expect(res.status).toBe(400);
            expect(res.body.error).toBe('Invalid coupon code');
        });

        test('should reject expired coupon', async () => {
            mockFindPlanBySlug.mockResolvedValue(mockPlan);
            mockFindCouponByCode.mockResolvedValue({
                id: 'c1', code: 'EXPIRED8', status: 'ACTIVE', type: 'FLAT',
                value: 10000, redemptionCount: 0,
                validFrom: new Date('2023-01-01'),
                validUntil: new Date('2023-12-31'),
            });

            const res = await request(app)
                .post('/api/subscriptions/subscribe')
                .set('Authorization', `Bearer ${authToken}`)
                .send({ planSlug: 'growth', billingCycle: 'MONTHLY', couponCode: 'EXPIRED8' });

            expect(res.status).toBe(400);
            expect(res.body.error).toBe('Coupon has expired');
        });

        test('should update existing subscription when one exists', async () => {
            mockFindPlanBySlug.mockResolvedValue(mockPlan);
            mockFindActiveSubscription.mockResolvedValue(mockSubscription);
            mockCreateRazorpaySubscription.mockResolvedValue({ id: 'sub_rzp_new' });

            const res = await request(app)
                .post('/api/subscriptions/subscribe')
                .set('Authorization', `Bearer ${authToken}`)
                .send({ planSlug: 'growth', billingCycle: 'ANNUAL' });

            expect(res.status).toBe(200);
            expect(mockUpdateSubscription).toHaveBeenCalled();
            expect(mockCreateSubscription).not.toHaveBeenCalled();
        });
    });

    describe('POST /api/subscriptions/cancel', () => {
        test('should cancel active subscription at cycle end', async () => {
            mockFindActiveSubscription.mockResolvedValue(mockSubscription);
            mockCancelRazorpaySubscription.mockResolvedValue({});

            const res = await request(app)
                .post('/api/subscriptions/cancel')
                .set('Authorization', `Bearer ${authToken}`);

            expect(res.status).toBe(200);
            expect(mockCancelRazorpaySubscription).toHaveBeenCalledWith('sub_rzp_123', true);
            expect(mockUpdateSubscription).toHaveBeenCalled();
        });

        test('should return 400 when no active subscription', async () => {
            mockFindActiveSubscription.mockResolvedValue(null);

            const res = await request(app)
                .post('/api/subscriptions/cancel')
                .set('Authorization', `Bearer ${authToken}`);

            expect(res.status).toBe(400);
        });

        test('should return 400 when subscription is not active', async () => {
            mockFindActiveSubscription.mockResolvedValue({
                ...mockSubscription, status: 'CANCELLED',
            });

            const res = await request(app)
                .post('/api/subscriptions/cancel')
                .set('Authorization', `Bearer ${authToken}`);

            expect(res.status).toBe(400);
        });
    });

    describe('POST /api/subscriptions/upgrade', () => {
        test('should cancel current subscription for upgrade', async () => {
            mockFindActiveSubscription.mockResolvedValue(mockSubscription);
            mockCancelRazorpaySubscription.mockResolvedValue({});

            const res = await request(app)
                .post('/api/subscriptions/upgrade')
                .set('Authorization', `Bearer ${authToken}`);

            expect(res.status).toBe(200);
            expect(mockCancelRazorpaySubscription).toHaveBeenCalledWith('sub_rzp_123', false);
        });

        test('should succeed when no existing subscription', async () => {
            mockFindActiveSubscription.mockResolvedValue(null);

            const res = await request(app)
                .post('/api/subscriptions/upgrade')
                .set('Authorization', `Bearer ${authToken}`);

            expect(res.status).toBe(200);
        });
    });

    describe('POST /api/subscriptions/credits/purchase', () => {
        test('should create a Razorpay order for credit pack', async () => {
            mockFindCreditPackById.mockResolvedValue({
                id: 'pack-1', name: '20 Credits', credits: 20,
                priceInPaise: 19900, isActive: true,
            });
            mockCreateRazorpayOrder.mockResolvedValue({
                id: 'order_123', amount: 19900, currency: 'INR',
            });
            mockCreateCreditPurchase.mockResolvedValue({ id: 'cp-1' });

            const res = await request(app)
                .post('/api/subscriptions/credits/purchase')
                .set('Authorization', `Bearer ${authToken}`)
                .send({ creditPackId: 'pack-1' });

            expect(res.status).toBe(200);
            expect(res.body.data.orderId).toBe('order_123');
            expect(res.body.data.credits).toBe(20);
        });

        test('should return 400 when creditPackId missing', async () => {
            const res = await request(app)
                .post('/api/subscriptions/credits/purchase')
                .set('Authorization', `Bearer ${authToken}`)
                .send({});

            expect(res.status).toBe(400);
        });

        test('should return 404 for inactive credit pack', async () => {
            mockFindCreditPackById.mockResolvedValue({
                id: 'pack-1', isActive: false,
            });

            const res = await request(app)
                .post('/api/subscriptions/credits/purchase')
                .set('Authorization', `Bearer ${authToken}`)
                .send({ creditPackId: 'pack-1' });

            expect(res.status).toBe(404);
        });
    });

    describe('POST /api/subscriptions/credits/verify', () => {
        test('should verify payment and add credits', async () => {
            mockVerifyPaymentSignature.mockReturnValue(true);
            mockFindCreditPurchaseByOrderId.mockResolvedValue({
                id: 'cp-1', restaurantId: 'r1', creditsAdded: 20,
                amountPaise: 19900, status: 'PENDING',
            });
            mockFindActiveSubscription.mockResolvedValue({ id: 'sub-r1' });

            const res = await request(app)
                .post('/api/subscriptions/credits/verify')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    razorpayOrderId: 'order_123',
                    razorpayPaymentId: 'pay_456',
                    razorpaySignature: 'sig_valid',
                });

            expect(res.status).toBe(200);
            expect(mockAddCredits).toHaveBeenCalledWith('sub-r1', 20);
            expect(mockCreateInvoice).toHaveBeenCalledWith(
                expect.objectContaining({
                    restaurantId: 'r1',
                    type: 'CREDIT_PURCHASE',
                    amountPaise: 19900,
                    description: '20 Credits',
                }),
            );
        });

        test('should create invoice for credit purchase', async () => {
            mockVerifyPaymentSignature.mockReturnValue(true);
            mockFindCreditPurchaseByOrderId.mockResolvedValue({
                id: 'cp-1', restaurantId: 'r1', creditsAdded: 50,
                amountPaise: 44900, status: 'PENDING',
            });
            mockFindActiveSubscription.mockResolvedValue({ id: 'sub-r1' });

            await request(app)
                .post('/api/subscriptions/credits/verify')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    razorpayOrderId: 'order_456',
                    razorpayPaymentId: 'pay_789',
                    razorpaySignature: 'sig_ok',
                });

            expect(mockCreateInvoice).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'CREDIT_PURCHASE',
                    razorpayOrderId: 'order_456',
                    razorpayPaymentId: 'pay_789',
                    description: '50 Credits',
                }),
            );
        });

        test('should return 400 for invalid signature', async () => {
            mockVerifyPaymentSignature.mockReturnValue(false);

            const res = await request(app)
                .post('/api/subscriptions/credits/verify')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    razorpayOrderId: 'order_123',
                    razorpayPaymentId: 'pay_456',
                    razorpaySignature: 'bad_sig',
                });

            expect(res.status).toBe(400);
            expect(res.body.error).toBe('Payment signature verification failed');
        });

        test('should return 400 when fields missing', async () => {
            const res = await request(app)
                .post('/api/subscriptions/credits/verify')
                .set('Authorization', `Bearer ${authToken}`)
                .send({ razorpayOrderId: 'order_123' });

            expect(res.status).toBe(400);
        });

        test('should skip if already paid', async () => {
            mockVerifyPaymentSignature.mockReturnValue(true);
            mockFindCreditPurchaseByOrderId.mockResolvedValue({
                id: 'cp-1', restaurantId: 'r1', creditsAdded: 20,
                amountPaise: 19900, status: 'PAID',
            });

            const res = await request(app)
                .post('/api/subscriptions/credits/verify')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    razorpayOrderId: 'order_123',
                    razorpayPaymentId: 'pay_456',
                    razorpaySignature: 'sig_valid',
                });

            expect(res.status).toBe(200);
            expect(res.body.message).toBe('Credits already added');
            expect(mockAddCredits).not.toHaveBeenCalled();
        });
    });

    describe('POST /api/subscriptions/webhook', () => {
        test('should handle subscription.charged and create invoice', async () => {
            mockVerifyWebhookSignature.mockReturnValue(true);
            mockFindSubscriptionByRazorpayId.mockResolvedValue({
                ...mockSubscription,
                id: 'sub-r1',
            });

            const webhookPayload = {
                event: 'subscription.charged',
                payload: {
                    subscription: {
                        entity: {
                            id: 'sub_rzp_123',
                            current_start: Math.floor(Date.now() / 1000),
                            current_end: Math.floor(Date.now() / 1000) + 30 * 86400,
                        },
                    },
                    payment: {
                        entity: {
                            id: 'pay_webhook_1',
                            invoice_id: 'inv_rzp_webhook',
                            amount: 999900,
                            currency: 'INR',
                        },
                    },
                },
            };

            const res = await request(app)
                .post('/api/subscriptions/webhook')
                .set('x-razorpay-signature', 'valid_signature')
                .send(webhookPayload);

            expect(res.status).toBe(200);
            expect(mockUpdateSubscription).toHaveBeenCalledWith('sub-r1', expect.objectContaining({
                status: 'ACTIVE',
            }));
            expect(mockCreateInvoice).toHaveBeenCalledWith(expect.objectContaining({
                restaurantId: 'r1',
                type: 'SUBSCRIPTION',
                razorpayInvoiceId: 'inv_rzp_webhook',
                razorpayPaymentId: 'pay_webhook_1',
                amountPaise: 999900,
            }));
        });

        test('should handle subscription.cancelled', async () => {
            mockVerifyWebhookSignature.mockReturnValue(true);
            mockFindSubscriptionByRazorpayId.mockResolvedValue({ ...mockSubscription });

            const res = await request(app)
                .post('/api/subscriptions/webhook')
                .set('x-razorpay-signature', 'valid_sig')
                .send({
                    event: 'subscription.cancelled',
                    payload: { subscription: { entity: { id: 'sub_rzp_123' } } },
                });

            expect(res.status).toBe(200);
            expect(mockUpdateSubscription).toHaveBeenCalledWith(mockSubscription.id, expect.objectContaining({
                status: 'CANCELLED',
            }));
        });

        test('should handle subscription.halted', async () => {
            mockVerifyWebhookSignature.mockReturnValue(true);
            mockFindSubscriptionByRazorpayId.mockResolvedValue({ ...mockSubscription });

            const res = await request(app)
                .post('/api/subscriptions/webhook')
                .set('x-razorpay-signature', 'valid_sig')
                .send({
                    event: 'subscription.halted',
                    payload: { subscription: { entity: { id: 'sub_rzp_123' } } },
                });

            expect(res.status).toBe(200);
            expect(mockUpdateSubscription).toHaveBeenCalledWith(mockSubscription.id, { status: 'HALTED' });
        });

        test('should handle subscription.pending', async () => {
            mockVerifyWebhookSignature.mockReturnValue(true);
            mockFindSubscriptionByRazorpayId.mockResolvedValue({ ...mockSubscription });

            const res = await request(app)
                .post('/api/subscriptions/webhook')
                .set('x-razorpay-signature', 'valid_sig')
                .send({
                    event: 'subscription.pending',
                    payload: { subscription: { entity: { id: 'sub_rzp_123' } } },
                });

            expect(res.status).toBe(200);
            expect(mockUpdateSubscription).toHaveBeenCalledWith(mockSubscription.id, { status: 'PAST_DUE' });
        });

        test('should return 400 when signature header missing', async () => {
            const res = await request(app)
                .post('/api/subscriptions/webhook')
                .send({ event: 'test' });

            expect(res.status).toBe(400);
        });

        test('should return 401 when signature is invalid', async () => {
            mockVerifyWebhookSignature.mockReturnValue(false);

            const res = await request(app)
                .post('/api/subscriptions/webhook')
                .set('x-razorpay-signature', 'invalid')
                .send({ event: 'test' });

            expect(res.status).toBe(401);
        });

        test('should handle subscription.authenticated', async () => {
            mockVerifyWebhookSignature.mockReturnValue(true);
            mockFindSubscriptionByRazorpayId.mockResolvedValue({ ...mockSubscription });

            const res = await request(app)
                .post('/api/subscriptions/webhook')
                .set('x-razorpay-signature', 'valid_sig')
                .send({
                    event: 'subscription.authenticated',
                    payload: { subscription: { entity: { id: 'sub_rzp_123' } } },
                });

            expect(res.status).toBe(200);
            expect(mockUpdateSubscription).toHaveBeenCalledWith(mockSubscription.id, { status: 'AUTHENTICATED' });
        });

        test('should handle subscription.activated with coupon redemption', async () => {
            mockVerifyWebhookSignature.mockReturnValue(true);
            mockFindSubscriptionByRazorpayId.mockResolvedValue({
                ...mockSubscription, couponCode: 'TESTCODE',
            });
            mockFindCouponByCode.mockResolvedValue({
                id: 'c1', code: 'TESTCODE', type: 'FLAT', value: 50000,
            });

            const res = await request(app)
                .post('/api/subscriptions/webhook')
                .set('x-razorpay-signature', 'valid_sig')
                .send({
                    event: 'subscription.activated',
                    payload: {
                        subscription: {
                            entity: {
                                id: 'sub_rzp_123',
                                current_end: Math.floor(Date.now() / 1000) + 30 * 86400,
                                customer_id: 'cust_123',
                            },
                        },
                    },
                });

            expect(res.status).toBe(200);
            expect(mockUpdateSubscription).toHaveBeenCalledWith(mockSubscription.id, expect.objectContaining({
                status: 'ACTIVE',
                razorpayCustomerId: 'cust_123',
            }));
            expect(mockIncrementCouponRedemptions).toHaveBeenCalledWith('c1');
            expect(mockCreateCouponRedemption).toHaveBeenCalled();
        });

        test('should handle subscription.activated without coupon', async () => {
            mockVerifyWebhookSignature.mockReturnValue(true);
            mockFindSubscriptionByRazorpayId.mockResolvedValue({
                ...mockSubscription, couponCode: undefined,
            });

            const res = await request(app)
                .post('/api/subscriptions/webhook')
                .set('x-razorpay-signature', 'valid_sig')
                .send({
                    event: 'subscription.activated',
                    payload: {
                        subscription: {
                            entity: { id: 'sub_rzp_123', customer_id: 'cust_456' },
                        },
                    },
                });

            expect(res.status).toBe(200);
            expect(mockIncrementCouponRedemptions).not.toHaveBeenCalled();
        });

        test('should handle unrecognized event gracefully', async () => {
            mockVerifyWebhookSignature.mockReturnValue(true);

            const res = await request(app)
                .post('/api/subscriptions/webhook')
                .set('x-razorpay-signature', 'valid_sig')
                .send({ event: 'payment.captured', payload: {} });

            expect(res.status).toBe(200);
        });
    });

    describe('Subscribe - additional coupon validation', () => {
        test('should reject inactive coupon', async () => {
            mockFindPlanBySlug.mockResolvedValue(mockPlan);
            mockFindCouponByCode.mockResolvedValue({
                id: 'c1', code: 'INACTIVE', status: 'DISABLED', type: 'FLAT', value: 10000,
            });

            const res = await request(app)
                .post('/api/subscriptions/subscribe')
                .set('Authorization', `Bearer ${authToken}`)
                .send({ planSlug: 'growth', billingCycle: 'MONTHLY', couponCode: 'INACTIVE' });

            expect(res.status).toBe(400);
            expect(res.body.error).toBe('Coupon is not active');
        });

        test('should reject fully redeemed coupon', async () => {
            mockFindPlanBySlug.mockResolvedValue(mockPlan);
            mockFindCouponByCode.mockResolvedValue({
                id: 'c1', code: 'MAXED123', status: 'ACTIVE', type: 'FLAT', value: 10000,
                maxRedemptions: 5, redemptionCount: 5,
                validFrom: new Date('2024-01-01'),
            });

            const res = await request(app)
                .post('/api/subscriptions/subscribe')
                .set('Authorization', `Bearer ${authToken}`)
                .send({ planSlug: 'growth', billingCycle: 'MONTHLY', couponCode: 'MAXED123' });

            expect(res.status).toBe(400);
            expect(res.body.error).toBe('Coupon has been fully redeemed');
        });

        test('should reject coupon assigned to different restaurant', async () => {
            mockFindPlanBySlug.mockResolvedValue(mockPlan);
            mockFindCouponByCode.mockResolvedValue({
                id: 'c1', code: 'PERSONAL', status: 'ACTIVE', type: 'FLAT', value: 10000,
                assignedTo: 'r999', redemptionCount: 0,
                validFrom: new Date('2024-01-01'),
            });

            const res = await request(app)
                .post('/api/subscriptions/subscribe')
                .set('Authorization', `Bearer ${authToken}`)
                .send({ planSlug: 'growth', billingCycle: 'MONTHLY', couponCode: 'PERSONAL' });

            expect(res.status).toBe(400);
        });

        test('should reject coupon not applicable to plan', async () => {
            mockFindPlanBySlug.mockResolvedValue(mockPlan);
            mockFindCouponByCode.mockResolvedValue({
                id: 'c1', code: 'PREMIUM8', status: 'ACTIVE', type: 'FLAT', value: 10000,
                applicablePlans: ['premium'], redemptionCount: 0,
                validFrom: new Date('2024-01-01'),
            });

            const res = await request(app)
                .post('/api/subscriptions/subscribe')
                .set('Authorization', `Bearer ${authToken}`)
                .send({ planSlug: 'growth', billingCycle: 'MONTHLY', couponCode: 'PREMIUM8' });

            expect(res.status).toBe(400);
            expect(res.body.error).toBe('Coupon is not applicable to this plan');
        });

        test('should reject coupon not applicable to billing cycle', async () => {
            mockFindPlanBySlug.mockResolvedValue(mockPlan);
            mockFindCouponByCode.mockResolvedValue({
                id: 'c1', code: 'ANNUAL12', status: 'ACTIVE', type: 'FLAT', value: 10000,
                applicableCycles: ['ANNUAL'], redemptionCount: 0,
                validFrom: new Date('2024-01-01'),
            });

            const res = await request(app)
                .post('/api/subscriptions/subscribe')
                .set('Authorization', `Bearer ${authToken}`)
                .send({ planSlug: 'growth', billingCycle: 'MONTHLY', couponCode: 'ANNUAL12' });

            expect(res.status).toBe(400);
            expect(res.body.error).toBe('Coupon is not applicable to this billing cycle');
        });

        test('should reject coupon already redeemed by restaurant', async () => {
            mockFindPlanBySlug.mockResolvedValue(mockPlan);
            mockFindCouponByCode.mockResolvedValue({
                id: 'c1', code: 'USED1234', status: 'ACTIVE', type: 'FLAT', value: 10000,
                redemptionCount: 1, maxRedemptions: 10,
                validFrom: new Date('2024-01-01'),
            });
            mockHasRestaurantRedeemedCoupon.mockResolvedValue(true);

            const res = await request(app)
                .post('/api/subscriptions/subscribe')
                .set('Authorization', `Bearer ${authToken}`)
                .send({ planSlug: 'growth', billingCycle: 'MONTHLY', couponCode: 'USED1234' });

            expect(res.status).toBe(400);
            expect(res.body.error).toBe('Coupon already redeemed by this restaurant');
        });

        test('should return 400 when Razorpay plan ID not configured', async () => {
            mockFindPlanBySlug.mockResolvedValue({
                ...mockPlan,
                razorpayPlanIds: { monthly: '', annual: 'plan_annual' },
            });

            const res = await request(app)
                .post('/api/subscriptions/subscribe')
                .set('Authorization', `Bearer ${authToken}`)
                .send({ planSlug: 'growth', billingCycle: 'MONTHLY' });

            expect(res.status).toBe(400);
            expect(res.body.error).toContain('Razorpay plan not configured');
        });
    });

    describe('Credits verify - edge cases', () => {
        test('should return 404 when purchase not found', async () => {
            mockVerifyPaymentSignature.mockReturnValue(true);
            mockFindCreditPurchaseByOrderId.mockResolvedValue(null);

            const res = await request(app)
                .post('/api/subscriptions/credits/verify')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    razorpayOrderId: 'order_nonexistent',
                    razorpayPaymentId: 'pay_456',
                    razorpaySignature: 'sig_valid',
                });

            expect(res.status).toBe(404);
        });
    });
});
