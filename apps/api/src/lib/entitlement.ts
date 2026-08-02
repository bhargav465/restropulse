/**
 * Feature-entitlement logic. A restaurant may use the gated features
 * (Content Engine, Restaurant Intelligence, Strategy) when it either has an
 * active paid subscription OR is inside its no-card free-trial window.
 *
 * Single source of truth shared by requireEntitlement, enforcePlanLimits, and
 * the /subscriptions/current response.
 */
import type { Subscription, EntitlementState } from '@restropulse/shared';

const DAY_MS = 24 * 60 * 60 * 1000;
const ACTIVE_STATUSES = new Set(['ACTIVE', 'PAST_DUE']);

export type { EntitlementState };

export function getEntitlement(sub: Subscription | null | undefined, now: Date = new Date()): EntitlementState {
    if (!sub) {
        return { entitled: false, inTrial: false, activePlan: false, trialDaysLeft: 0 };
    }
    const activePlan = ACTIVE_STATUSES.has(sub.status);
    const trialEndsMs = sub.trialEndsAt ? new Date(sub.trialEndsAt).getTime() : 0;
    const inTrial = trialEndsMs > now.getTime();
    const trialDaysLeft = inTrial ? Math.ceil((trialEndsMs - now.getTime()) / DAY_MS) : 0;
    return {
        entitled: activePlan || inTrial,
        inTrial,
        activePlan,
        trialEndsAt: trialEndsMs ? new Date(trialEndsMs).toISOString() : undefined,
        trialDaysLeft,
    };
}

export function isEntitled(sub: Subscription | null | undefined, now?: Date): boolean {
    return getEntitlement(sub, now).entitled;
}
