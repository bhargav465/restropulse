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
const mockFindInvoiceByPaymentId = vi.fn();
const mockFindUserById = vi.fn();

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
        findInvoiceByPaymentId: mockFindInvoiceByPaymentId,
        findUserById: mockFindUserById,
    };
});

const mockCreateRazorpaySubscription = vi.fn();
const mockCancelRazorpaySubscription = vi.fn();
const mockUpdateRazorpaySubscription = vi.fn();
const mockCreateRazorpayOrder = vi.fn();
const mockVerifyWebhookSignature = vi.fn();
const mockVerifyPaymentSignature = vi.fn();
const mockGetRazorpayKeyId = vi.fn().mockReturnValue('rzp_test_key');
const mockCreateRazorpayCustomer = vi.fn();
const mockFetchRazorpayCustomersByContact = vi.fn();
const mockFetchRazorpayInvoice = vi.fn();

vi.mock('../../src/services/razorpay.js', () => ({
    createRazorpaySubscription: mockCreateRazorpaySubscription,
    cancelRazorpaySubscription: mockCancelRazorpaySubscription,
    updateRazorpaySubscription: mockUpdateRazorpaySubscription,
    createRazorpayOrder: mockCreateRazorpayOrder,
    verifyWebhookSignature: mockVerifyWebhookSignature,
    verifyPaymentSignature: mockVerifyPaymentSignature,
    getRazorpayKeyId: mockGetRazorpayKeyId,
    createRazorpayOffer: vi.fn(),
    fetchRazorpayInvoice: mockFetchRazorpayInvoice,
    listRazorpayInvoices: vi.fn(),
    createRazorpayCustomer: mockCreateRazorpayCustomer,
    fetchRazorpayCustomersByContact: mockFetchRazorpayCustomersByContact,
    isRazorpayConfigured: vi.fn().mockReturnValue(true),
}));

const { createTestApp, generateAuthToken, mockUser } = await import('../helpers/testHelper.js');

const authToken = generateAuthToken();
const app = createTestApp();

const mockPlan = {
    id: 'plan-growth-v1',
    slug: 'growth',
    version: 1,
    isCurrentVersion: true,
    tier: 'GROWTH',
    name: 'Growth',
    limits: { weekly: { INSTAGRAM: { IMAGE: 5, STORY: 5, CAROUSEL: 3, REEL: 2, VIDEO: 2 }, FACEBOOK: { IMAGE: 5, CAROUSEL: 3, VIDEO: 2, STORY: 5 } } },
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
        // Default: user lookup succeeds with email, customer creation succeeds
        mockFindUserById.mockResolvedValue(mockUser);
        mockCreateRazorpayCustomer.mockResolvedValue({ id: 'cust_rzp_u1' });
        mockFetchRazorpayInvoice.mockResolvedValue({ id: 'inv_rzp_123', short_url: 'https://rzp.io/i/test', status: 'paid', amount: 49900, currency: 'INR' });
        mockUpdateRazorpaySubscription.mockResolvedValue({ id: 'sub_test', status: 'active', plan_id: 'plan_test' });
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
                INSTAGRAM: { IMAGE: 2, VIDEO: 0, STORY: 0, CAROUSEL: 1, REEL: 0 },
                FACEBOOK: { IMAGE: 0, VIDEO: 0, STORY: 0, CAROUSEL: 0 },
            });

            const res = await request(app)
                .get('/api/subscriptions/current')
                .set('Authorization', `Bearer ${authToken}`);

            expect(res.status).toBe(200);
            expect(res.body.data.subscription.status).toBe('ACTIVE');
            expect(res.body.data.usage.INSTAGRAM.IMAGE.used).toBe(2);
            expect(res.body.data.usage.INSTAGRAM.CAROUSEL.used).toBe(1);
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

        test('should return usage=null when subscription has no planSnapshot limits (covers line 62 false branch)', async () => {
            // planSnapshot exists but without limits -> usage remains null
            mockFindActiveSubscription.mockResolvedValue({
                ...mockSubscription,
                planSnapshot: { slug: 'growth', tier: 'GROWTH' }, // no limits
            });

            const res = await request(app)
                .get('/api/subscriptions/current')
                .set('Authorization', `Bearer ${authToken}`);

            expect(res.status).toBe(200);
            expect(res.body.data.subscription).toBeDefined();
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
                'plan_monthly_growth', 120, 'offer_rzp_1', 'cust_rzp_u1',
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

        test('should return 409 when an active subscription already exists', async () => {
            mockFindPlanBySlug.mockResolvedValue(mockPlan);
            mockFindActiveSubscription.mockResolvedValue(mockSubscription);

            const res = await request(app)
                .post('/api/subscriptions/subscribe')
                .set('Authorization', `Bearer ${authToken}`)
                .send({ planSlug: 'growth', billingCycle: 'ANNUAL' });

            expect(res.status).toBe(409);
            expect(res.body.error).toMatch(/active subscription already exists/i);
            expect(mockCreateSubscription).not.toHaveBeenCalled();
        });

        test('should create Razorpay customer with user name, email, and phone', async () => {
            mockFindPlanBySlug.mockResolvedValue(mockPlan);
            mockFindActiveSubscription.mockResolvedValue(null);
            mockCreateSubscription.mockResolvedValue({ id: 'sub-new' });
            mockCreateRazorpaySubscription.mockResolvedValue({ id: 'sub_rzp_new' });

            await request(app)
                .post('/api/subscriptions/subscribe')
                .set('Authorization', `Bearer ${authToken}`)
                .send({ planSlug: 'growth', billingCycle: 'MONTHLY' });

            expect(mockCreateRazorpayCustomer).toHaveBeenCalledWith(
                mockUser.name,
                mockUser.email,
                mockUser.phone,
            );
        });

        test('should pass customer_id to createRazorpaySubscription', async () => {
            mockFindPlanBySlug.mockResolvedValue(mockPlan);
            mockFindActiveSubscription.mockResolvedValue(null);
            mockCreateSubscription.mockResolvedValue({ id: 'sub-new' });
            mockCreateRazorpaySubscription.mockResolvedValue({ id: 'sub_rzp_new' });

            await request(app)
                .post('/api/subscriptions/subscribe')
                .set('Authorization', `Bearer ${authToken}`)
                .send({ planSlug: 'growth', billingCycle: 'MONTHLY' });

            expect(mockCreateRazorpaySubscription).toHaveBeenCalledWith(
                'plan_monthly_growth', 120, undefined, 'cust_rzp_u1',
            );
        });

        test('should proceed with subscription even if customer creation fails', async () => {
            mockCreateRazorpayCustomer.mockRejectedValue(new Error('Razorpay customer API error'));
            mockFindPlanBySlug.mockResolvedValue(mockPlan);
            mockFindActiveSubscription.mockResolvedValue(null);
            mockCreateSubscription.mockResolvedValue({ id: 'sub-new' });
            mockCreateRazorpaySubscription.mockResolvedValue({ id: 'sub_rzp_no_cust' });

            const res = await request(app)
                .post('/api/subscriptions/subscribe')
                .set('Authorization', `Bearer ${authToken}`)
                .send({ planSlug: 'growth', billingCycle: 'MONTHLY' });

            expect(res.status).toBe(200);
            expect(res.body.data.subscriptionId).toBe('sub_rzp_no_cust');
            // customer_id should be undefined when creation fails
            expect(mockCreateRazorpaySubscription).toHaveBeenCalledWith(
                'plan_monthly_growth', 120, undefined, undefined,
            );
        });

        test('should proceed with subscription when user has no email', async () => {
            mockFindUserById.mockResolvedValue({ ...mockUser, email: undefined });
            mockFindPlanBySlug.mockResolvedValue(mockPlan);
            mockFindActiveSubscription.mockResolvedValue(null);
            mockCreateSubscription.mockResolvedValue({ id: 'sub-new' });
            mockCreateRazorpaySubscription.mockResolvedValue({ id: 'sub_rzp_no_email' });

            const res = await request(app)
                .post('/api/subscriptions/subscribe')
                .set('Authorization', `Bearer ${authToken}`)
                .send({ planSlug: 'growth', billingCycle: 'MONTHLY' });

            expect(res.status).toBe(200);
            expect(mockCreateRazorpayCustomer).not.toHaveBeenCalled();
            expect(mockCreateRazorpaySubscription).toHaveBeenCalledWith(
                'plan_monthly_growth', 120, undefined, undefined,
            );
        });

        // Re-subscribe scenarios: existing subscription archived (endedAt stamped), new doc inserted.

        test('should archive existing NONE subscription and create new CREATED doc on first subscribe', async () => {
            const noneSubscription = { id: 'sub-none', restaurantId: 'r1', status: 'NONE', credits: 100 };
            mockFindPlanBySlug.mockResolvedValue(mockPlan);
            mockFindActiveSubscription.mockResolvedValue(noneSubscription);
            mockUpdateSubscription.mockResolvedValue({ ...noneSubscription, endedAt: expect.any(String) });
            mockCreateSubscription.mockResolvedValue({ id: 'sub-new' });
            mockCreateRazorpaySubscription.mockResolvedValue({ id: 'sub_rzp_new' });

            const res = await request(app)
                .post('/api/subscriptions/subscribe')
                .set('Authorization', `Bearer ${authToken}`)
                .send({ planSlug: 'growth', billingCycle: 'MONTHLY' });

            expect(res.status).toBe(200);
            expect(mockUpdateSubscription).toHaveBeenCalledWith('sub-none', expect.objectContaining({ endedAt: expect.any(String) }));
            expect(mockCreateSubscription).toHaveBeenCalledWith(expect.objectContaining({ status: 'CREATED', razorpaySubscriptionId: 'sub_rzp_new' }));
        });

        test('should archive existing CANCELLED subscription and create new doc on re-subscribe', async () => {
            const cancelledSubscription = { id: 'sub-cancelled', restaurantId: 'r1', status: 'CANCELLED', credits: 0 };
            mockFindPlanBySlug.mockResolvedValue(mockPlan);
            mockFindActiveSubscription.mockResolvedValue(cancelledSubscription);
            mockUpdateSubscription.mockResolvedValue({ ...cancelledSubscription, endedAt: expect.any(String) });
            mockCreateSubscription.mockResolvedValue({ id: 'sub-new' });
            mockCreateRazorpaySubscription.mockResolvedValue({ id: 'sub_rzp_renew' });

            const res = await request(app)
                .post('/api/subscriptions/subscribe')
                .set('Authorization', `Bearer ${authToken}`)
                .send({ planSlug: 'growth', billingCycle: 'MONTHLY' });

            expect(res.status).toBe(200);
            expect(mockUpdateSubscription).toHaveBeenCalledWith('sub-cancelled', expect.objectContaining({ endedAt: expect.any(String) }));
            expect(mockCreateSubscription).toHaveBeenCalledWith(expect.objectContaining({ status: 'CREATED', razorpaySubscriptionId: 'sub_rzp_renew' }));
        });

        test('should archive existing HALTED subscription and create new doc on re-subscribe', async () => {
            const haltedSubscription = { id: 'sub-halted', restaurantId: 'r1', status: 'HALTED', credits: 0 };
            mockFindPlanBySlug.mockResolvedValue(mockPlan);
            mockFindActiveSubscription.mockResolvedValue(haltedSubscription);
            mockUpdateSubscription.mockResolvedValue({ ...haltedSubscription, endedAt: expect.any(String) });
            mockCreateSubscription.mockResolvedValue({ id: 'sub-new' });
            mockCreateRazorpaySubscription.mockResolvedValue({ id: 'sub_rzp_resume' });

            const res = await request(app)
                .post('/api/subscriptions/subscribe')
                .set('Authorization', `Bearer ${authToken}`)
                .send({ planSlug: 'growth', billingCycle: 'MONTHLY' });

            expect(res.status).toBe(200);
            expect(mockUpdateSubscription).toHaveBeenCalledWith('sub-halted', expect.objectContaining({ endedAt: expect.any(String) }));
            expect(mockCreateSubscription).toHaveBeenCalledWith(expect.objectContaining({ status: 'CREATED', razorpaySubscriptionId: 'sub_rzp_resume' }));
        });

        test('should insert a clean new doc (no stale fields) when re-subscribing from CANCELLED', async () => {
            const cancelledSub = {
                id: 'sub-cancelled',
                restaurantId: 'r1',
                status: 'CANCELLED',
                credits: 50,
                cancelAtPeriodEnd: true,
                cancelledAt: '2026-03-01T00:00:00.000Z',
                currentPeriodEnd: '2026-03-01T00:00:00.000Z',
                pendingPlanId: 'old-plan-id',
                pendingPlanSnapshot: { slug: 'starter' },
                pendingBillingCycle: 'MONTHLY',
            };
            mockFindPlanBySlug.mockResolvedValue(mockPlan);
            mockFindActiveSubscription.mockResolvedValue(cancelledSub);
            mockUpdateSubscription.mockResolvedValue({ ...cancelledSub, endedAt: '2026-04-01T00:00:00.000Z' });
            mockCreateSubscription.mockResolvedValue({ id: 'sub-new' });
            mockCreateRazorpaySubscription.mockResolvedValue({ id: 'sub_rzp_new' });

            const res = await request(app)
                .post('/api/subscriptions/subscribe')
                .set('Authorization', `Bearer ${authToken}`)
                .send({ planSlug: 'growth', billingCycle: 'MONTHLY' });

            expect(res.status).toBe(200);
            const newDoc = (mockCreateSubscription.mock.calls[0] as any[])[0];
            expect(newDoc).not.toHaveProperty('cancelAtPeriodEnd');
            expect(newDoc).not.toHaveProperty('cancelledAt');
            expect(newDoc).not.toHaveProperty('pendingPlanId');
        });

        test('should preserve purchased credits when re-subscribing from CANCELLED', async () => {
            const cancelledSub = { id: 'sub-cancelled', restaurantId: 'r1', status: 'CANCELLED', credits: 50 };
            mockFindPlanBySlug.mockResolvedValue(mockPlan);
            mockFindActiveSubscription.mockResolvedValue(cancelledSub);
            mockUpdateSubscription.mockResolvedValue({ ...cancelledSub, endedAt: expect.any(String) });
            mockCreateSubscription.mockResolvedValue({ id: 'sub-new' });
            mockCreateRazorpaySubscription.mockResolvedValue({ id: 'sub_rzp_new' });

            await request(app)
                .post('/api/subscriptions/subscribe')
                .set('Authorization', `Bearer ${authToken}`)
                .send({ planSlug: 'growth', billingCycle: 'MONTHLY' });

            expect(mockCreateSubscription).toHaveBeenCalledWith(expect.objectContaining({ credits: 50 }));
        });

        test('should preserve purchased credits when re-subscribing from HALTED', async () => {
            const haltedSub = { id: 'sub-halted', restaurantId: 'r1', status: 'HALTED', credits: 25 };
            mockFindPlanBySlug.mockResolvedValue(mockPlan);
            mockFindActiveSubscription.mockResolvedValue(haltedSub);
            mockUpdateSubscription.mockResolvedValue({ ...haltedSub, endedAt: expect.any(String) });
            mockCreateSubscription.mockResolvedValue({ id: 'sub-new' });
            mockCreateRazorpaySubscription.mockResolvedValue({ id: 'sub_rzp_new' });

            await request(app)
                .post('/api/subscriptions/subscribe')
                .set('Authorization', `Bearer ${authToken}`)
                .send({ planSlug: 'growth', billingCycle: 'MONTHLY' });

            expect(mockCreateSubscription).toHaveBeenCalledWith(expect.objectContaining({ credits: 25 }));
        });

        test('should zero credits when transitioning from NONE free tier to paid plan', async () => {
            const noneSub = { id: 'sub-none', restaurantId: 'r1', status: 'NONE', credits: 10 };
            mockFindPlanBySlug.mockResolvedValue(mockPlan);
            mockFindActiveSubscription.mockResolvedValue(noneSub);
            mockUpdateSubscription.mockResolvedValue({ ...noneSub, endedAt: expect.any(String) });
            mockCreateSubscription.mockResolvedValue({ id: 'sub-new' });
            mockCreateRazorpaySubscription.mockResolvedValue({ id: 'sub_rzp_new' });

            await request(app)
                .post('/api/subscriptions/subscribe')
                .set('Authorization', `Bearer ${authToken}`)
                .send({ planSlug: 'growth', billingCycle: 'MONTHLY' });

            expect(mockCreateSubscription).toHaveBeenCalledWith(expect.objectContaining({ credits: 0 }));
        });

        // Razorpay customer recovery scenarios

        test('should recover existing Razorpay customer ID when creation fails with already-exists error', async () => {
            mockCreateRazorpayCustomer.mockRejectedValue(new Error('Customer already exists for the merchant'));
            mockFetchRazorpayCustomersByContact.mockResolvedValue({ items: [{ id: 'cust_recovered_123' }] });
            mockFindPlanBySlug.mockResolvedValue(mockPlan);
            mockFindActiveSubscription.mockResolvedValue(null);
            mockCreateSubscription.mockResolvedValue({ id: 'sub-new' });
            mockCreateRazorpaySubscription.mockResolvedValue({ id: 'sub_rzp_new' });

            const res = await request(app)
                .post('/api/subscriptions/subscribe')
                .set('Authorization', `Bearer ${authToken}`)
                .send({ planSlug: 'growth', billingCycle: 'MONTHLY' });

            expect(res.status).toBe(200);
            expect(mockFetchRazorpayCustomersByContact).toHaveBeenCalledWith(mockUser.phone);
            expect(mockCreateRazorpaySubscription).toHaveBeenCalledWith(
                'plan_monthly_growth', 120, undefined, 'cust_recovered_123',
            );
        });

        test('should proceed without customer ID when creation fails with already-exists and recovery also fails', async () => {
            mockCreateRazorpayCustomer.mockRejectedValue(new Error('Customer already exists for the merchant'));
            mockFetchRazorpayCustomersByContact.mockRejectedValue(new Error('Razorpay API unavailable'));
            mockFindPlanBySlug.mockResolvedValue(mockPlan);
            mockFindActiveSubscription.mockResolvedValue(null);
            mockCreateSubscription.mockResolvedValue({ id: 'sub-new' });
            mockCreateRazorpaySubscription.mockResolvedValue({ id: 'sub_rzp_new' });

            const res = await request(app)
                .post('/api/subscriptions/subscribe')
                .set('Authorization', `Bearer ${authToken}`)
                .send({ planSlug: 'growth', billingCycle: 'MONTHLY' });

            expect(res.status).toBe(200);
            expect(mockCreateRazorpaySubscription).toHaveBeenCalledWith(
                'plan_monthly_growth', 120, undefined, undefined,
            );
        });

        // cancelAtPeriodEnd re-subscribe: immediate Razorpay cancel before creating new subscription

        test('should return 500 when Razorpay immediate-cancel fails with a genuine error on cancelAtPeriodEnd re-subscribe', async () => {
            const activePendingCancel = {
                id: 'sub-active-cancel',
                restaurantId: 'r1',
                status: 'ACTIVE',
                razorpaySubscriptionId: 'sub_rzp_cancel',
                cancelAtPeriodEnd: true,
                credits: 20,
            };
            mockFindPlanBySlug.mockResolvedValue(mockPlan);
            mockFindActiveSubscription.mockResolvedValue(activePendingCancel);
            mockCancelRazorpaySubscription.mockRejectedValue(new Error('Network timeout'));

            const res = await request(app)
                .post('/api/subscriptions/subscribe')
                .set('Authorization', `Bearer ${authToken}`)
                .send({ planSlug: 'growth', billingCycle: 'MONTHLY' });

            expect(res.status).toBe(500);
            expect(mockUpdateSubscription).not.toHaveBeenCalled();
            expect(mockCreateRazorpaySubscription).not.toHaveBeenCalled();
        });

        test('should proceed when Razorpay cancel returns already-in-terminal-state error on cancelAtPeriodEnd re-subscribe', async () => {
            const activePendingCancel = {
                id: 'sub-active-cancel',
                restaurantId: 'r1',
                status: 'ACTIVE',
                razorpaySubscriptionId: 'sub_rzp_already_done',
                cancelAtPeriodEnd: true,
                credits: 20,
            };
            mockFindPlanBySlug.mockResolvedValue(mockPlan);
            mockFindActiveSubscription.mockResolvedValue(activePendingCancel);
            mockCancelRazorpaySubscription.mockRejectedValue(new Error('Subscription not in an active state'));
            mockUpdateSubscription.mockResolvedValue({ ...activePendingCancel, endedAt: expect.any(String) });
            mockCreateSubscription.mockResolvedValue({ id: 'sub-new' });
            mockCreateRazorpaySubscription.mockResolvedValue({ id: 'sub_rzp_new' });

            const res = await request(app)
                .post('/api/subscriptions/subscribe')
                .set('Authorization', `Bearer ${authToken}`)
                .send({ planSlug: 'growth', billingCycle: 'MONTHLY' });

            expect(res.status).toBe(200);
            expect(mockUpdateSubscription).toHaveBeenCalledWith(
                'sub-active-cancel',
                expect.objectContaining({ status: 'CANCELLED', endedAt: expect.any(String) }),
            );
            expect(mockCreateSubscription).toHaveBeenCalledWith(expect.objectContaining({ status: 'CREATED' }));
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
            expect(mockUpdateSubscription).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({ cancelAtPeriodEnd: true }),
            );
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

    describe('POST /api/subscriptions/change-plan', () => {
        const mockActiveSub = {
            id: 'sub1',
            restaurantId: 'r1',
            status: 'ACTIVE',
            razorpaySubscriptionId: 'rzp_sub_123',
            billingCycle: 'MONTHLY',
            cancelAtPeriodEnd: false,
            planSnapshot: {
                slug: 'starter',
                pricing: { monthly: 49900, annual: 499000 },
                razorpayPlanIds: { monthly: 'plan_starter_m', annual: 'plan_starter_a' },
            },
            currentPeriodEnd: '2026-05-01T00:00:00.000Z',
        };

        const mockGrowthPlan = {
            id: 'plan_growth_id',
            slug: 'growth',
            name: 'Growth',
            pricing: { monthly: 99900, annual: 999000 },
            razorpayPlanIds: { monthly: 'plan_growth_m', annual: 'plan_growth_a' },
        };

        const mockStarterPlan = {
            id: 'plan_starter_id',
            slug: 'starter',
            name: 'Starter',
            pricing: { monthly: 49900, annual: 499000 },
            razorpayPlanIds: { monthly: 'plan_starter_m', annual: 'plan_starter_a' },
        };

        beforeEach(() => {
            mockFindActiveSubscription.mockResolvedValue(mockActiveSub);
            mockFindPlanBySlug.mockResolvedValue(mockGrowthPlan);
            mockUpdateRazorpaySubscription.mockResolvedValue({ id: 'rzp_sub_123', status: 'active', plan_id: 'plan_growth_m' });
            mockUpdateSubscription.mockResolvedValue(undefined);
        });

        test('should upgrade plan immediately when target is more expensive', async () => {
            const res = await request(app)
                .post('/api/subscriptions/change-plan')
                .set('Authorization', `Bearer ${authToken}`)
                .send({ planSlug: 'growth', billingCycle: 'MONTHLY' });

            expect(res.status).toBe(200);
            expect(res.body.data.effective).toBe('immediate');
            expect(mockUpdateRazorpaySubscription).toHaveBeenCalledWith('rzp_sub_123', {
                planId: 'plan_growth_m',
                scheduleChangeAt: 'now',
            });
            expect(mockUpdateSubscription).toHaveBeenCalledWith('sub1', expect.objectContaining({
                planId: 'plan_growth_id',
                planSnapshot: mockGrowthPlan,
                billingCycle: 'MONTHLY',
            }));
        });

        test('should schedule downgrade for cycle end when target is cheaper', async () => {
            mockFindActiveSubscription.mockResolvedValue({
                ...mockActiveSub,
                planSnapshot: { slug: 'growth', pricing: { monthly: 99900, annual: 999000 }, razorpayPlanIds: { monthly: 'plan_growth_m', annual: 'plan_growth_a' } },
            });
            mockFindPlanBySlug.mockResolvedValue(mockStarterPlan);

            const res = await request(app)
                .post('/api/subscriptions/change-plan')
                .set('Authorization', `Bearer ${authToken}`)
                .send({ planSlug: 'starter', billingCycle: 'MONTHLY' });

            expect(res.status).toBe(200);
            expect(res.body.data.effective).toBe('cycle_end');
            expect(mockUpdateRazorpaySubscription).toHaveBeenCalledWith('rzp_sub_123', {
                planId: 'plan_starter_m',
                scheduleChangeAt: 'cycle_end',
            });
            expect(mockUpdateSubscription).toHaveBeenCalledWith('sub1', expect.objectContaining({
                pendingPlanId: 'plan_starter_id',
                pendingPlanSnapshot: mockStarterPlan,
                pendingBillingCycle: 'MONTHLY',
            }));
        });

        test('should apply same-plan Monthly to Annual switch immediately (not a downgrade)', async () => {
            // Annual effective monthly = 999000/12 = 83250, which is less than monthly 99900.
            // Old logic classified this as a downgrade. Correct logic: billing cycle upgrade
            // on the same plan is immediate.
            mockFindActiveSubscription.mockResolvedValue({
                ...mockActiveSub,
                billingCycle: 'MONTHLY',
                planSnapshot: { slug: 'growth', pricing: { monthly: 99900, annual: 999000 }, razorpayPlanIds: { monthly: 'plan_growth_m', annual: 'plan_growth_a' } },
            });
            mockFindPlanBySlug.mockResolvedValue(mockGrowthPlan);

            const res = await request(app)
                .post('/api/subscriptions/change-plan')
                .set('Authorization', `Bearer ${authToken}`)
                .send({ planSlug: 'growth', billingCycle: 'ANNUAL' });

            expect(res.status).toBe(200);
            expect(res.body.data.effective).toBe('immediate');
            expect(mockUpdateRazorpaySubscription).toHaveBeenCalledWith('rzp_sub_123', {
                planId: 'plan_growth_a',
                scheduleChangeAt: 'now',
            });
        });

        test('should schedule same-plan Annual to Monthly switch for cycle end', async () => {
            mockFindActiveSubscription.mockResolvedValue({
                ...mockActiveSub,
                billingCycle: 'ANNUAL',
                planSnapshot: { slug: 'growth', pricing: { monthly: 99900, annual: 999000 }, razorpayPlanIds: { monthly: 'plan_growth_m', annual: 'plan_growth_a' } },
            });
            mockFindPlanBySlug.mockResolvedValue(mockGrowthPlan);

            const res = await request(app)
                .post('/api/subscriptions/change-plan')
                .set('Authorization', `Bearer ${authToken}`)
                .send({ planSlug: 'growth', billingCycle: 'MONTHLY' });

            expect(res.status).toBe(200);
            expect(res.body.data.effective).toBe('cycle_end');
            expect(mockUpdateRazorpaySubscription).toHaveBeenCalledWith('rzp_sub_123', {
                planId: 'plan_growth_m',
                scheduleChangeAt: 'cycle_end',
            });
        });

        test('should return 400 when no active subscription exists', async () => {
            mockFindActiveSubscription.mockResolvedValue(null);

            const res = await request(app)
                .post('/api/subscriptions/change-plan')
                .set('Authorization', `Bearer ${authToken}`)
                .send({ planSlug: 'growth', billingCycle: 'MONTHLY' });

            expect(res.status).toBe(400);
            expect(res.body.error).toMatch(/no active subscription/i);
        });

        test('should return 400 when subscription status is CREATED', async () => {
            mockFindActiveSubscription.mockResolvedValue({ ...mockActiveSub, status: 'CREATED' });

            const res = await request(app)
                .post('/api/subscriptions/change-plan')
                .set('Authorization', `Bearer ${authToken}`)
                .send({ planSlug: 'growth', billingCycle: 'MONTHLY' });

            expect(res.status).toBe(400);
            expect(res.body.error).toMatch(/must be active/i);
        });

        test('should return 404 when plan not found', async () => {
            mockFindPlanBySlug.mockResolvedValue(null);

            const res = await request(app)
                .post('/api/subscriptions/change-plan')
                .set('Authorization', `Bearer ${authToken}`)
                .send({ planSlug: 'nonexistent', billingCycle: 'MONTHLY' });

            expect(res.status).toBe(404);
        });

        test('should return 400 when already on same plan and billing cycle', async () => {
            mockFindPlanBySlug.mockResolvedValue(mockStarterPlan);

            const res = await request(app)
                .post('/api/subscriptions/change-plan')
                .set('Authorization', `Bearer ${authToken}`)
                .send({ planSlug: 'starter', billingCycle: 'MONTHLY' });

            expect(res.status).toBe(400);
            expect(res.body.error).toMatch(/already on this plan/i);
        });

        test('should return 400 when planSlug or billingCycle missing', async () => {
            const res = await request(app)
                .post('/api/subscriptions/change-plan')
                .set('Authorization', `Bearer ${authToken}`)
                .send({ planSlug: 'growth' });

            expect(res.status).toBe(400);
        });

        test('should return 401 without auth', async () => {
            const res = await request(app)
                .post('/api/subscriptions/change-plan')
                .send({ planSlug: 'growth', billingCycle: 'MONTHLY' });
            expect(res.status).toBe(401);
        });
    });

    describe('POST /api/subscriptions/reactivate', () => {
        const mockCancelledEndSub = {
            id: 'sub1',
            restaurantId: 'r1',
            status: 'ACTIVE',
            razorpaySubscriptionId: 'rzp_sub_123',
            cancelAtPeriodEnd: true,
        };

        beforeEach(() => {
            mockFindActiveSubscription.mockResolvedValue(mockCancelledEndSub);
            mockCancelRazorpaySubscription.mockResolvedValue({});
            mockUpdateSubscription.mockResolvedValue(undefined);
        });

        test('should reactivate subscription pending cancellation', async () => {
            const res = await request(app)
                .post('/api/subscriptions/reactivate')
                .set('Authorization', `Bearer ${authToken}`);

            expect(res.status).toBe(200);
            expect(mockCancelRazorpaySubscription).toHaveBeenCalledWith('rzp_sub_123', false);
            expect(mockUpdateSubscription).toHaveBeenCalledWith('sub1', {
                cancelAtPeriodEnd: false,
                cancelledAt: undefined,
            });
        });

        test('should return 400 when no subscription exists', async () => {
            mockFindActiveSubscription.mockResolvedValue(null);

            const res = await request(app)
                .post('/api/subscriptions/reactivate')
                .set('Authorization', `Bearer ${authToken}`);

            expect(res.status).toBe(400);
            expect(res.body.error).toMatch(/no subscription/i);
        });

        test('should return 400 when cancelAtPeriodEnd is false', async () => {
            mockFindActiveSubscription.mockResolvedValue({ ...mockCancelledEndSub, cancelAtPeriodEnd: false });

            const res = await request(app)
                .post('/api/subscriptions/reactivate')
                .set('Authorization', `Bearer ${authToken}`);

            expect(res.status).toBe(400);
            expect(res.body.error).toMatch(/not pending cancellation/i);
        });

        test('should return 400 when subscription is fully CANCELLED', async () => {
            mockFindActiveSubscription.mockResolvedValue({ ...mockCancelledEndSub, status: 'CANCELLED', cancelAtPeriodEnd: true });

            const res = await request(app)
                .post('/api/subscriptions/reactivate')
                .set('Authorization', `Bearer ${authToken}`);

            expect(res.status).toBe(400);
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
        test('should handle subscription.charged and create invoice with Razorpay auto-generated invoice', async () => {
            mockVerifyWebhookSignature.mockReturnValue(true);
            mockFindSubscriptionByRazorpayId.mockResolvedValue({
                ...mockSubscription,
                id: 'sub-r1',
                razorpayCustomerId: 'cust_db_123',
            });
            mockFindInvoiceByPaymentId.mockResolvedValue(null);

            const res = await request(app)
                .post('/api/subscriptions/webhook')
                .set('x-razorpay-signature', 'valid_signature')
                .send({
                    event: 'subscription.charged',
                    payload: {
                        subscription: {
                            entity: {
                                id: 'sub_rzp_123',
                                customer_id: 'cust_payload_123',
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
                });

            expect(res.status).toBe(200);
            expect(mockUpdateSubscription).toHaveBeenCalledWith('sub-r1', expect.objectContaining({ status: 'ACTIVE' }));
            // Fetches the auto-generated Razorpay invoice to get its PDF URL
            expect(mockFetchRazorpayInvoice).toHaveBeenCalledWith('inv_rzp_webhook');
            // Internal invoice stored with Razorpay invoice id + short_url
            expect(mockCreateInvoice).toHaveBeenCalledWith(expect.objectContaining({
                restaurantId: 'r1',
                type: 'SUBSCRIPTION',
                razorpayInvoiceId: 'inv_rzp_webhook',
                razorpayPaymentId: 'pay_webhook_1',
                amountPaise: 999900,
                pdfUrl: 'https://rzp.io/i/test',
            }));
        });

        test('should still create internal invoice if Razorpay invoice fetch fails', async () => {
            mockVerifyWebhookSignature.mockReturnValue(true);
            mockFindSubscriptionByRazorpayId.mockResolvedValue({ ...mockSubscription, id: 'sub-r1', razorpayCustomerId: 'cust_db_123' });
            mockFindInvoiceByPaymentId.mockResolvedValue(null);
            mockFetchRazorpayInvoice.mockRejectedValue(new Error('Razorpay API error'));

            const res = await request(app)
                .post('/api/subscriptions/webhook')
                .set('x-razorpay-signature', 'valid_signature')
                .send({
                    event: 'subscription.charged',
                    payload: {
                        subscription: { entity: { id: 'sub_rzp_123', current_start: 0, current_end: 0 } },
                        payment: { entity: { id: 'pay_err_1', invoice_id: 'inv_err_123', amount: 999900, currency: 'INR' } },
                    },
                });

            expect(res.status).toBe(200);
            expect(mockCreateInvoice).toHaveBeenCalledOnce();
            // pdfUrl is undefined when invoice fetch fails
            expect(mockCreateInvoice).toHaveBeenCalledWith(expect.objectContaining({ pdfUrl: undefined }));
        });

        test('should skip invoice PDF fetch when payment has no invoice_id', async () => {
            mockVerifyWebhookSignature.mockReturnValue(true);
            mockFindSubscriptionByRazorpayId.mockResolvedValue({
                ...mockSubscription,
                id: 'sub-r1',
            });
            mockFindInvoiceByPaymentId.mockResolvedValue(null);

            const res = await request(app)
                .post('/api/subscriptions/webhook')
                .set('x-razorpay-signature', 'valid_signature')
                .send({
                    event: 'subscription.charged',
                    payload: {
                        subscription: { entity: { id: 'sub_rzp_123', current_start: 0, current_end: 0 } },
                        payment: { entity: { id: 'pay_no_inv', amount: 999900, currency: 'INR' } },
                    },
                });

            expect(res.status).toBe(200);
            expect(mockFetchRazorpayInvoice).not.toHaveBeenCalled();
            expect(mockCreateInvoice).toHaveBeenCalledOnce();
        });

        test('subscription.charged should clear stale cancelAtPeriodEnd and cancelledAt', async () => {
            mockVerifyWebhookSignature.mockReturnValue(true);
            mockFindSubscriptionByRazorpayId.mockResolvedValue({
                ...mockSubscription,
                id: 'sub-r1',
                razorpayCustomerId: 'cust_db_123',
            });
            mockFindInvoiceByPaymentId.mockResolvedValue(null);

            await request(app)
                .post('/api/subscriptions/webhook')
                .set('x-razorpay-signature', 'valid_signature')
                .send({
                    event: 'subscription.charged',
                    payload: {
                        subscription: {
                            entity: {
                                id: 'sub_rzp_123',
                                customer_id: 'cust_db_123',
                                current_start: Math.floor(Date.now() / 1000),
                                current_end: Math.floor(Date.now() / 1000) + 30 * 86400,
                            },
                        },
                        payment: { entity: { id: 'pay_clear_test', amount: 999900, currency: 'INR' } },
                    },
                });

            expect(mockUpdateSubscription).toHaveBeenCalledWith(
                'sub-r1',
                expect.objectContaining({ cancelAtPeriodEnd: false, cancelledAt: undefined }),
            );
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

        test('subscription.cancelled should reset cancelAtPeriodEnd to false', async () => {
            mockVerifyWebhookSignature.mockReturnValue(true);
            mockFindSubscriptionByRazorpayId.mockResolvedValue({ ...mockSubscription });

            await request(app)
                .post('/api/subscriptions/webhook')
                .set('x-razorpay-signature', 'valid_sig')
                .send({
                    event: 'subscription.cancelled',
                    payload: { subscription: { entity: { id: 'sub_rzp_123' } } },
                });

            expect(mockUpdateSubscription).toHaveBeenCalledWith(
                mockSubscription.id,
                expect.objectContaining({
                    status: 'CANCELLED',
                    cancelledAt: expect.any(String),
                    cancelAtPeriodEnd: false,
                }),
            );
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

        test('should skip invoice creation when subscription.charged is a duplicate (idempotency)', async () => {
            mockVerifyWebhookSignature.mockReturnValue(true);
            mockFindSubscriptionByRazorpayId.mockResolvedValue({ ...mockSubscription, id: 'sub-r1' });
            // Simulate existing invoice for this payment
            mockFindInvoiceByPaymentId.mockResolvedValue({ id: 'inv-existing', razorpayPaymentId: 'pay_dup_1' });

            const res = await request(app)
                .post('/api/subscriptions/webhook')
                .set('x-razorpay-signature', 'valid_signature')
                .send({
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
                                id: 'pay_dup_1',
                                invoice_id: 'inv_rzp_dup',
                                amount: 999900,
                                currency: 'INR',
                            },
                        },
                    },
                });

            expect(res.status).toBe(200);
            expect(mockUpdateSubscription).toHaveBeenCalledWith('sub-r1', expect.objectContaining({ status: 'ACTIVE' }));
            // Invoice must NOT be created again
            expect(mockCreateInvoice).not.toHaveBeenCalled();
        });

        test('should create invoice on first subscription.charged (non-duplicate)', async () => {
            mockVerifyWebhookSignature.mockReturnValue(true);
            mockFindSubscriptionByRazorpayId.mockResolvedValue({ ...mockSubscription, id: 'sub-r1' });
            // No existing invoice
            mockFindInvoiceByPaymentId.mockResolvedValue(null);

            const res = await request(app)
                .post('/api/subscriptions/webhook')
                .set('x-razorpay-signature', 'valid_signature')
                .send({
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
                                id: 'pay_new_1',
                                invoice_id: 'inv_rzp_new',
                                amount: 999900,
                                currency: 'INR',
                            },
                        },
                    },
                });

            expect(res.status).toBe(200);
            expect(mockCreateInvoice).toHaveBeenCalledOnce();
            expect(mockCreateInvoice).toHaveBeenCalledWith(expect.objectContaining({
                razorpayPaymentId: 'pay_new_1',
                type: 'SUBSCRIPTION',
            }));
        });

        test('should promote pending plan snapshot when subscription.charged fires for a new cycle', async () => {
            mockVerifyWebhookSignature.mockReturnValue(true);
            const pendingPlanSnapshot = { name: 'Starter', slug: 'starter', pricing: { monthly: 49900, annual: 499000 } };
            const subWithPending = {
                ...mockSubscription,
                id: 'sub-r1',
                razorpayCustomerId: 'cust_db_123',
                pendingPlanId: 'plan_starter_id',
                pendingPlanSnapshot,
                pendingBillingCycle: 'MONTHLY',
            };
            mockFindSubscriptionByRazorpayId.mockResolvedValue(subWithPending);
            mockFindInvoiceByPaymentId.mockResolvedValue(null);

            const res = await request(app)
                .post('/api/subscriptions/webhook')
                .set('x-razorpay-signature', 'valid_signature')
                .send({
                    event: 'subscription.charged',
                    payload: {
                        subscription: {
                            entity: {
                                id: 'sub_rzp_123',
                                customer_id: 'cust_db_123',
                                current_start: Math.floor(Date.now() / 1000),
                                current_end: Math.floor(Date.now() / 1000) + 30 * 86400,
                            },
                        },
                        payment: {
                            entity: {
                                id: 'pay_pending_promote',
                                amount: 49900,
                                currency: 'INR',
                            },
                        },
                    },
                });

            expect(res.status).toBe(200);
            expect(mockUpdateSubscription).toHaveBeenCalledWith('sub-r1', expect.objectContaining({
                planId: 'plan_starter_id',
                planSnapshot: pendingPlanSnapshot,
                billingCycle: 'MONTHLY',
                pendingPlanId: undefined,
                pendingPlanSnapshot: null,
                pendingBillingCycle: undefined,
            }));
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

        test('should add credits without active subscription (subscription is null)', async () => {
            // Covers the branch at line 469: if (subscription) -> false path
            mockVerifyPaymentSignature.mockReturnValue(true);
            mockFindCreditPurchaseByOrderId.mockResolvedValue({
                id: 'cp-no-sub', restaurantId: 'r1', creditsAdded: 10,
                amountPaise: 9900, status: 'PENDING',
            });
            // No active subscription
            mockFindActiveSubscription.mockResolvedValue(null);

            const res = await request(app)
                .post('/api/subscriptions/credits/verify')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    razorpayOrderId: 'order_nosub',
                    razorpayPaymentId: 'pay_nosub',
                    razorpaySignature: 'sig_nosub',
                });

            expect(res.status).toBe(200);
            // addCredits should NOT have been called since there's no subscription
            expect(mockAddCredits).not.toHaveBeenCalled();
            expect(mockCreateInvoice).toHaveBeenCalled();
        });
    });

    describe('POST /api/subscriptions/webhook - when subscription not found in DB', () => {
        // These tests cover the false branches of "if (sub)" inside each webhook case
        // when findSubscriptionByRazorpayId returns null (subscription not in our DB)
        const webhookNoSubBase = {
            'x-razorpay-signature': 'valid_sig',
        };

        test('should handle subscription.authenticated when sub not found in DB', async () => {
            mockVerifyWebhookSignature.mockReturnValue(true);
            mockFindSubscriptionByRazorpayId.mockResolvedValue(null);

            const res = await request(app)
                .post('/api/subscriptions/webhook')
                .set(webhookNoSubBase)
                .send({
                    event: 'subscription.authenticated',
                    payload: { subscription: { entity: { id: 'sub_rzp_unknown' } } },
                });

            expect(res.status).toBe(200);
            expect(mockUpdateSubscription).not.toHaveBeenCalled();
        });

        test('should handle subscription.activated when sub not found in DB', async () => {
            mockVerifyWebhookSignature.mockReturnValue(true);
            mockFindSubscriptionByRazorpayId.mockResolvedValue(null);

            const res = await request(app)
                .post('/api/subscriptions/webhook')
                .set(webhookNoSubBase)
                .send({
                    event: 'subscription.activated',
                    payload: { subscription: { entity: { id: 'sub_rzp_unknown', customer_id: 'c1' } } },
                });

            expect(res.status).toBe(200);
            expect(mockUpdateSubscription).not.toHaveBeenCalled();
        });

        test('should handle subscription.charged when sub not found in DB', async () => {
            mockVerifyWebhookSignature.mockReturnValue(true);
            mockFindSubscriptionByRazorpayId.mockResolvedValue(null);

            const res = await request(app)
                .post('/api/subscriptions/webhook')
                .set(webhookNoSubBase)
                .send({
                    event: 'subscription.charged',
                    payload: {
                        subscription: { entity: { id: 'sub_rzp_unknown' } },
                        payment: { entity: { id: 'pay_unknown', amount: 100 } },
                    },
                });

            expect(res.status).toBe(200);
            expect(mockUpdateSubscription).not.toHaveBeenCalled();
        });

        test('should handle subscription.pending when sub not found in DB', async () => {
            mockVerifyWebhookSignature.mockReturnValue(true);
            mockFindSubscriptionByRazorpayId.mockResolvedValue(null);

            const res = await request(app)
                .post('/api/subscriptions/webhook')
                .set(webhookNoSubBase)
                .send({
                    event: 'subscription.pending',
                    payload: { subscription: { entity: { id: 'sub_rzp_unknown' } } },
                });

            expect(res.status).toBe(200);
            expect(mockUpdateSubscription).not.toHaveBeenCalled();
        });

        test('should handle subscription.halted when sub not found in DB', async () => {
            mockVerifyWebhookSignature.mockReturnValue(true);
            mockFindSubscriptionByRazorpayId.mockResolvedValue(null);

            const res = await request(app)
                .post('/api/subscriptions/webhook')
                .set(webhookNoSubBase)
                .send({
                    event: 'subscription.halted',
                    payload: { subscription: { entity: { id: 'sub_rzp_unknown' } } },
                });

            expect(res.status).toBe(200);
            expect(mockUpdateSubscription).not.toHaveBeenCalled();
        });

        test('should handle subscription.cancelled when sub not found in DB', async () => {
            mockVerifyWebhookSignature.mockReturnValue(true);
            mockFindSubscriptionByRazorpayId.mockResolvedValue(null);

            const res = await request(app)
                .post('/api/subscriptions/webhook')
                .set(webhookNoSubBase)
                .send({
                    event: 'subscription.cancelled',
                    payload: { subscription: { entity: { id: 'sub_rzp_unknown' } } },
                });

            expect(res.status).toBe(200);
            expect(mockUpdateSubscription).not.toHaveBeenCalled();
        });
    });

    describe('POST /api/subscriptions/webhook - error path', () => {
        test('should return 500 when webhook processing throws an unexpected error', async () => {
            mockVerifyWebhookSignature.mockReturnValue(true);
            // Make the subscription lookup throw to trigger the catch block (lines 358-360)
            mockFindSubscriptionByRazorpayId.mockRejectedValue(new Error('DB connection lost'));

            const res = await request(app)
                .post('/api/subscriptions/webhook')
                .set('x-razorpay-signature', 'valid_sig')
                .send({
                    event: 'subscription.charged',
                    payload: {
                        subscription: { entity: { id: 'sub_rzp_error' } },
                        payment: { entity: { id: 'pay_err', amount: 100, currency: 'INR' } },
                    },
                });

            expect(res.status).toBe(500);
            expect(res.body.success).toBe(false);
            expect(res.body.error).toBe('Webhook processing failed');
        });

        test('should handle subscription.charged when entity has no current_end or current_start (undefined branches)', async () => {
            // Covers the ternary branches for periodEnd and periodStart being undefined
            // and planSnapshot?.name fallback to 'Subscription'
            mockVerifyWebhookSignature.mockReturnValue(true);
            mockFindSubscriptionByRazorpayId.mockResolvedValue({
                ...mockSubscription,
                // Omit planSnapshot.name to exercise fallback
                planSnapshot: { ...mockSubscription.planSnapshot, name: undefined },
                billingCycle: undefined,
            });

            const res = await request(app)
                .post('/api/subscriptions/webhook')
                .set('x-razorpay-signature', 'valid_sig')
                .send({
                    event: 'subscription.charged',
                    payload: {
                        subscription: {
                            // No current_start or current_end fields -> periodStart/periodEnd = undefined
                            entity: { id: 'sub_rzp_123' },
                        },
                        payment: {
                            entity: {
                                id: 'pay_no_periods',
                                invoice_id: undefined,
                                amount: 500,
                                currency: 'INR',
                            },
                        },
                    },
                });

            expect(res.status).toBe(200);
            expect(mockUpdateSubscription).toHaveBeenCalledWith(mockSubscription.id, expect.objectContaining({
                status: 'ACTIVE',
                currentPeriodStart: undefined,
                currentPeriodEnd: undefined,
            }));
        });

        test('should handle subscription.activated when entity has no current_end (periodEnd undefined)', async () => {
            // Covers the ternary branch for periodEnd being undefined in subscription.activated
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
                            // No current_end -> periodEnd = undefined
                            entity: { id: 'sub_rzp_123', customer_id: 'cust_789' },
                        },
                    },
                });

            expect(res.status).toBe(200);
            expect(mockUpdateSubscription).toHaveBeenCalledWith(mockSubscription.id, expect.objectContaining({
                status: 'ACTIVE',
                currentPeriodEnd: undefined,
            }));
        });
    });
});
