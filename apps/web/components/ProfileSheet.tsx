import React, { useState, useEffect, useRef } from 'react';
import { APIProvider, Map, AdvancedMarker } from '@vis.gl/react-google-maps';
import { PlacesAutocompleteInput } from './PlacesAutocompleteInput';
import { CreditCard, LogOut, Trash2, MapPin, Edit3, X, Save, CheckCircle2, Star, Zap, Crown, ChevronRight, Loader2, AlertCircle, ExternalLink, HelpCircle, User, Plus, FileText, Download, ArrowLeft, Phone, Mail } from 'lucide-react';
import { SubscriptionTier, SubscriptionPlan, Subscription, PlanUsage, CreditPack, BillingCycle, Restaurant, InstagramConnectionError, InstagramAccount, Invoice, FeatureFlags } from '@restropulse/shared';
import { instagramAPI, restaurantAPI, subscriptionAPI, couponAPI, creditPacksAPI, invoiceAPI, configAPI, accountAPI } from '../api';
import ConfirmDialog from './ConfirmDialog';
import InvoiceHistoryPanel from './InvoiceHistoryPanel';
import { browserEvents } from '@restropulse/telemetry/browser';
import { FacebookIcon, InstagramIcon, WhatsAppIcon } from './BrandIcons';
import { ActionNotice } from './ActionNotice';
import { getGoogleMapsApiKey } from '../utils/env';

interface ProfileSheetProps {
    isOpen: boolean;
    onClose: () => void;
    onLogout: () => void;
    restaurantData: Restaurant;
    userName: string;
    userPhone?: string;
    userEmail?: string;
    onRestaurantUpdate: (restaurant: Restaurant) => void;
    autoOpenInstagramSetup?: boolean;
    onAutoOpenHandled?: () => void;
    featureFlags?: FeatureFlags | null;
}

const INSTAGRAM_ERROR_MESSAGES: Record<InstagramConnectionError, {
    title: string;
    description: string;
    helpUrl?: string;
    helpLabel?: string;
    setupStep?: string;
}> = {
    NO_PAGES_FOUND: {
        title: 'No Facebook Pages Found',
        description: 'You need to create a Facebook Page for your business and be an Admin of that page.',
        helpUrl: 'https://www.facebook.com/pages/create',
        helpLabel: 'Create a Facebook Page',
        setupStep: 'facebook_page'
    },
    NO_IG_ACCOUNT_FOUND: {
        title: 'Professional Account Required',
        description: 'Your Instagram account needs to be a Professional (Business or Creator) account, not a Personal account.',
        helpUrl: 'https://help.instagram.com/502981923235522',
        helpLabel: 'How to switch to Professional',
        setupStep: 'professional_account'
    },
    PERMISSIONS_MISSING: {
        title: 'Permissions Required',
        description: 'Please re-authenticate and make sure to check ALL permission boxes in the Facebook popup. We need these permissions to post content on your behalf.',
        helpUrl: 'https://developers.facebook.com/docs/permissions',
        helpLabel: 'Learn about permissions'
    },
    INVALID_STATE: {
        title: 'Session Expired',
        description: 'Your authorization session has expired. This can happen if you took too long or refreshed the page. Please try again.',
    },
    TOKEN_EXCHANGE_FAILED: {
        title: 'Authorization Failed',
        description: 'Failed to complete the authorization process. This might be a temporary issue. Please try again.',
    },
    API_ERROR: {
        title: 'Connection Error',
        description: 'An error occurred while connecting to Instagram. Please check your internet connection and try again.',
    },
    ACCOUNT_TYPE_MISMATCH: {
        title: 'Account Not Linked',
        description: 'Your Instagram Professional account must be linked to your Facebook Page. Go to your Facebook Page settings to connect them.',
        helpUrl: 'https://www.facebook.com/help/1148909221857370',
        helpLabel: 'Link Instagram to Facebook Page',
        setupStep: 'link_accounts'
    },
    RATE_LIMITED: {
        title: 'Too Many Attempts',
        description: 'Instagram is temporarily rate limiting requests. Please wait a few minutes and try again.'
    },
    CONFIG_ERROR: {
        title: 'Configuration Issue',
        description: 'Instagram integration is not configured correctly. Please contact support if this continues.'
    },
    TIMEOUT: {
        title: 'Request Timed Out',
        description: 'The connection request took too long. Please check your network and try again.'
    }
};

const TIER_ICONS: Record<SubscriptionTier, { icon: any; color: string }> = {
    STARTER: { icon: Zap, color: 'bg-slate-500' },
    GROWTH: { icon: Star, color: 'bg-orange-500' },
    PREMIUM: { icon: Crown, color: 'bg-indigo-600' },
};

function formatPaise(paise: number): string {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(paise / 100);
}

function planFeatures(plan: SubscriptionPlan): string[] {
    const features: string[] = [];
    const weekly = plan.limits.weekly;
    for (const [platform, typeLimits] of Object.entries(weekly)) {
        const entries = Object.entries(typeLimits as Record<string, number>).filter(([, v]) => v > 0);
        if (entries.length > 0) {
            const summary = entries.map(([type, limit]) => `${limit} ${type}`).join(', ');
            features.push(`${platform}: ${summary}/week`);
        }
    }
    features.push(...plan.features.map((f: string) => f === 'INSTAGRAM' ? 'Instagram' : f === 'FACEBOOK' ? 'Facebook' : f));
    return features;
}

function getInitials(name: string): string {
    return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function getCityFromAddress(address: string): string {
    const parts = address.split(',').map(s => s.trim());
    return parts.length >= 2 ? parts[parts.length - 2] : parts[0] || '';
}


const ProfileSheet: React.FC<ProfileSheetProps> = ({ isOpen, onClose, onLogout, restaurantData, userName, userPhone, userEmail, onRestaurantUpdate, autoOpenInstagramSetup, onAutoOpenHandled, featureFlags }) => {
    const topupCreditsEnabled = featureFlags?.topupCredits === true;

    const [isEditingProfile, setIsEditingProfile] = useState(false);
    const [isSubscriptionOpen, setIsSubscriptionOpen] = useState(false);

    const [dragStartY, setDragStartY] = useState<number | null>(null);
    const [dragOffset, setDragOffset] = useState(0);
    const subscriptionModalRef = React.useRef<HTMLDivElement>(null);

    // Swipe-right to go back (profile page)
    const [swipeStartX, setSwipeStartX] = useState<number | null>(null);
    const [swipeStartYPos, setSwipeStartYPos] = useState<number | null>(null);

    // Instagram connection state
    const [instagramConnected, setInstagramConnected] = useState(restaurantData.integrations.instagram);
    const [instagramUsername, setInstagramUsername] = useState(restaurantData.instagramConnection?.username || '');
    const [instagramLoading, setInstagramLoading] = useState(false);
    const [instagramError, setInstagramError] = useState<{ type: InstagramConnectionError; message: string } | null>(null);
    const [showInstagramErrorModal, setShowInstagramErrorModal] = useState(false);
    const [showAccountPicker, setShowAccountPicker] = useState(false);
    const [pendingAccounts, setPendingAccounts] = useState<InstagramAccount[]>([]);
    const [pendingSelectionId, setPendingSelectionId] = useState<string | null>(null);

    const [showSetupGuide, setShowSetupGuide] = useState(false);

    // Subscription state
    const [subscription, setSubscription] = useState<Subscription | null>(null);
    const [usage, setUsage] = useState<PlanUsage | null>(null);
    const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
    const [creditPacks, setCreditPacks] = useState<CreditPack[]>([]);
    const [billingCycle, setBillingCycle] = useState<BillingCycle>('MONTHLY');
    const [couponCode, setCouponCode] = useState('');
    const [couponValid, setCouponValid] = useState<boolean | null>(null);
    const [loadingPlanSlug, setLoadingPlanSlug] = useState<string | null>(null);
    const [subscriptionLoading, setSubscriptionLoading] = useState(true);
    const pollingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [actionError, setActionError] = useState<string | null>(null);
    const [actionErrorKey, setActionErrorKey] = useState(0);
    const [showInvoiceHistory, setShowInvoiceHistory] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [isDeletingAccount, setIsDeletingAccount] = useState(false);
    const [showCancelConfirm, setShowCancelConfirm] = useState(false);
    const [isCancellingPlan, setIsCancellingPlan] = useState(false);
    const [switchConfirmPlan, setSwitchConfirmPlan] = useState<SubscriptionPlan | null>(null);
    const [resubscribeConfirmPlan, setResubscribeConfirmPlan] = useState<SubscriptionPlan | null>(null);

    const loadSubscriptionData = async () => {
        setSubscriptionLoading(true);
        try {
            const [currentData, plansData, packsData, invoicesData] = await Promise.all([
                subscriptionAPI.getCurrent(),
                subscriptionAPI.getPlans(),
                creditPacksAPI.getAll(),
                invoiceAPI.getAll().catch(() => [] as Invoice[]),
            ]);
            setSubscription(currentData.subscription);
            setUsage(currentData.usage);
            setPlans(plansData);
            setCreditPacks(packsData);
            setInvoices(invoicesData);
        } catch (error) {
            console.error('Failed to load subscription data:', error);
        } finally {
            setSubscriptionLoading(false);
        }
    };

    const stopPolling = () => {
        if (pollingTimeoutRef.current) {
            clearTimeout(pollingTimeoutRef.current);
            pollingTimeoutRef.current = null;
        }
    };

    const scheduleSubscriptionPoll = (interval: number) => {
        pollingTimeoutRef.current = setTimeout(async () => {
            try {
                const currentData = await subscriptionAPI.getCurrent();
                const status = currentData.subscription?.status;
                if (status === 'ACTIVE' || status === 'PAST_DUE') {
                    setSubscription(currentData.subscription);
                    setUsage(currentData.usage);
                    return;
                }
            } catch {
                // keep polling on transient errors
            }
            scheduleSubscriptionPoll(Math.min(interval * 2, 60_000));
        }, interval);
    };

    // Load subscription data when sheet opens; stop any background polling when it closes
    useEffect(() => {
        if (!isOpen) {
            stopPolling();
            return;
        }
        loadSubscriptionData();
    }, [isOpen]);

    // Sync Instagram state when restaurantData changes
    useEffect(() => {
        setInstagramConnected(restaurantData.integrations.instagram);
        setInstagramUsername(restaurantData.instagramConnection?.username || '');
    }, [restaurantData.integrations.instagram, restaurantData.instagramConnection?.username]);

    // Listen for OAuth popup messages
    useEffect(() => {
        if (!isOpen) return;
        const handleMessage = (event: MessageEvent) => {
            if (event.origin !== window.location.origin) return;

            if (event.data?.type === 'instagram-oauth-callback') {
                setInstagramLoading(false);

                if (event.data.success) {
                    setInstagramConnected(true);
                    setInstagramUsername(event.data.username || '');
                    setInstagramError(null);
                    browserEvents.instagramConnected();
                    refreshRestaurantData();
                } else if (event.data.error) {
                    setInstagramError({
                        type: event.data.error,
                        message: event.data.errorMessage || 'Connection failed'
                    });
                    setShowInstagramErrorModal(true);
                }
            } else if (event.data?.type === 'instagram-oauth-retry') {
                handleInstagramConnect();
            }
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, [isOpen, restaurantData.id]);

    // History handling for modals
    useEffect(() => {
        const handlePopState = () => {
            if (isEditingProfile) {
                setIsEditingProfile(false);
                setDragOffset(0);
            }
            if (isSubscriptionOpen) {
                setIsSubscriptionOpen(false);
                setDragOffset(0);
            }
            if (showInstagramErrorModal) setShowInstagramErrorModal(false);
            if (showAccountPicker) setShowAccountPicker(false);
            if (showSetupGuide) setShowSetupGuide(false);
        };
        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, [isEditingProfile, isSubscriptionOpen, showInstagramErrorModal, showAccountPicker, showSetupGuide]);

    // Escape key to dismiss sheet
    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen]);

    // Auto-open Instagram setup guide when requested from external CTA
    useEffect(() => {
        if (isOpen && autoOpenInstagramSetup && !instagramConnected && !showSetupGuide) {
            setShowSetupGuide(true);
            window.history.pushState({ modal: 'setupGuide' }, '', '#setup-guide');
            onAutoOpenHandled?.();
        }
    }, [isOpen, autoOpenInstagramSetup]);

    const refreshRestaurantData = async () => {
        try {
            const updated = await restaurantAPI.get(restaurantData.id);
            onRestaurantUpdate(updated);
        } catch (err) {
            console.error('Failed to refresh restaurant data:', err);
        }
    };

    const handleInstagramConnect = async () => {
        if (instagramConnected) {
            if (confirm('Are you sure you want to disconnect Instagram?')) {
                setInstagramLoading(true);
                try {
                    await instagramAPI.disconnect(restaurantData.id);
                    setInstagramConnected(false);
                    setInstagramUsername('');
                    browserEvents.instagramDisconnected();
                    refreshRestaurantData();
                } catch (err) {
                    console.error('Disconnect error:', err);
                    setActionError('Something went wrong. Please try again in a moment.');
                } finally {
                    setInstagramLoading(false);
                }
            }
            return;
        }
        setShowSetupGuide(true);
        window.history.pushState({ modal: 'setupGuide' }, '', '#setup-guide');
    };

    const startInstagramOAuth = async (useOnboarding: boolean = false) => {
        setShowSetupGuide(false);
        setInstagramLoading(true);
        setInstagramError(null);

        try {
            const { oauthUrl } = await instagramAPI.getOAuthUrl(restaurantData.id, useOnboarding);
            const width = 600;
            const height = 700;
            const left = window.screenX + (window.outerWidth - width) / 2;
            const top = window.screenY + (window.outerHeight - height) / 2;

            const popup = window.open(
                oauthUrl,
                'instagram-oauth',
                `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no,scrollbars=yes`
            );

            if (!popup || popup.closed || typeof popup.closed === 'undefined') {
                setInstagramLoading(false);
                setInstagramError({
                    type: 'API_ERROR',
                    message: 'Popup was blocked. Please allow popups and try again.'
                });
                setShowInstagramErrorModal(true);

                if (confirm('Popup was blocked. Would you like to continue in this window instead?')) {
                    window.location.href = oauthUrl;
                }
                return;
            }

            const checkPopup = setInterval(() => {
                if (popup.closed) {
                    clearInterval(checkPopup);
                    setInstagramLoading(false);
                }
            }, 500);
        } catch (err) {
            console.error('OAuth initiation error:', err);
            setInstagramLoading(false);
            setInstagramError({
                type: 'API_ERROR',
                message: 'Failed to start Instagram connection. Please try again.'
            });
            setShowInstagramErrorModal(true);
        }
    };

    const handleSelectAccount = async (account: InstagramAccount) => {
        if (!pendingSelectionId) return;
        setInstagramLoading(true);
        setShowAccountPicker(false);
        try {
            const result = await instagramAPI.selectAccount(pendingSelectionId, account.id, restaurantData.id);
            setInstagramConnected(true);
            setInstagramUsername(result.username);
            browserEvents.instagramConnected();
            setPendingAccounts([]);
            setPendingSelectionId(null);
            refreshRestaurantData();
        } catch (err) {
            console.error('Account selection error:', err);
            setInstagramError({
                type: 'API_ERROR',
                message: 'Failed to connect account. Please try again.'
            });
            setShowInstagramErrorModal(true);
        } finally {
            setInstagramLoading(false);
        }
    };

    const openEditProfile = () => {
        setIsEditingProfile(true);
        window.history.pushState({ modal: 'editProfile' }, '', '#edit-profile');
    };

    const closeEditProfile = () => {
        setDragOffset(0);
        window.history.back();
    };

    const openSubscription = () => {
        setActionError(null);
        setIsSubscriptionOpen(true);
        window.history.pushState({ modal: 'subscription' }, '', '#subscription');
        loadSubscriptionData();
    };

    const closeSubscription = () => {
        setDragOffset(0);
        window.history.back();
    };

    // Errors persist until dismissed — no auto-dismiss.

    const showActionError = (message: string) => {
        setActionError(message);
        // Bump key so React re-mounts ActionNotice even if the message is the same,
        // ensuring the animation replays and the banner is visible
        setActionErrorKey((k) => k + 1);
        const modal = subscriptionModalRef.current;
        if (modal) {
            modal.scrollTo?.({ top: 0, behavior: 'smooth' });
            modal.scrollTop = 0;
        }
    };

    const handleDeleteAccount = async () => {
        if (isDeletingAccount) return;
        setIsDeletingAccount(true);
        try {
            await accountAPI.delete();
            onLogout();
        } catch (err: any) {
            setShowDeleteConfirm(false);
            setActionError(err.message || 'Failed to delete account. Please try again.');
            setActionErrorKey((k) => k + 1);
        } finally {
            setIsDeletingAccount(false);
        }
    };

    useEffect(() => {
        if (!isSubscriptionOpen || !actionError) return;
        const modal = subscriptionModalRef.current;
        if (!modal) return;

        modal.scrollTop = 0;
        const timeoutId = window.setTimeout(() => {
            modal.scrollTop = 0;
        }, 0);

        return () => window.clearTimeout(timeoutId);
    }, [actionErrorKey, actionError, isSubscriptionOpen]);

    const handleCancelPlan = async () => {
        if (isCancellingPlan) return;
        setIsCancellingPlan(true);
        try {
            await subscriptionAPI.cancel();
            await loadSubscriptionData();
            setShowCancelConfirm(false);
        } catch (err: any) {
            showActionError(err.message || 'Failed to cancel subscription. Please try again.');
        } finally {
            setIsCancellingPlan(false);
        }
    };

    const handleSwitchPlan = async (planSlug: string) => {
        if (loadingPlanSlug) return;
        try {
            setLoadingPlanSlug(planSlug);
            setActionError(null);
            const normalizedCouponCode = couponCode.trim().toUpperCase();
            if ((subscription?.status === 'ACTIVE' || subscription?.status === 'PAST_DUE') && !subscription?.cancelAtPeriodEnd) {
                // Use change-plan API: upgrades apply immediately, downgrades at cycle end
                const result = await subscriptionAPI.changePlan(planSlug, billingCycle);
                browserEvents.subscriptionStarted(planSlug, billingCycle);
                if (result.effective === 'cycle_end') {
                    // Downgrade: keep the subscription section open so the notice is visible
                    const endDate = result.currentPeriodEnd
                        ? new Date(result.currentPeriodEnd).toLocaleDateString()
                        : 'next billing date';
                    showActionError(`Switching to ${result.planName} on ${endDate}.`);
                    loadSubscriptionData();
                } else {
                    // Upgrade: change takes effect immediately, close panel and refresh
                    closeSubscription();
                    loadSubscriptionData();
                }
            } else {
                const data = await subscriptionAPI.subscribe(planSlug, billingCycle, normalizedCouponCode || undefined);
                browserEvents.subscriptionStarted(planSlug, billingCycle);
                if (!(window as any).Razorpay) {
                    throw new Error('Payment service not available');
                }
                const options = {
                    key: data.keyId,
                    subscription_id: data.subscriptionId,
                    name: 'RestroPulse',
                    description: `${planSlug} plan - ${billingCycle.toLowerCase()}`,
                    handler: () => {
                        // Razorpay calls this immediately after payment. Webhook updates DB asynchronously.
                        // Close the modal, do an immediate data refresh, then poll with exponential backoff
                        // until the subscription status confirms ACTIVE or PAST_DUE.
                        closeSubscription();
                        loadSubscriptionData();
                        scheduleSubscriptionPoll(3_000);
                    },
                };
                const rzp = new (window as any).Razorpay(options);
                if (typeof rzp.on === 'function') {
                    rzp.on('payment.failed', (response: { error?: { description?: string; reason?: string } }) => {
                        const detail = response?.error?.description || response?.error?.reason;
                        showActionError(detail ? `Payment failed: ${detail}` : 'Payment failed. Please try again.');
                    });
                    rzp.on('modal.ondismiss', () => {
                        loadSubscriptionData();
                    });
                }
                rzp.open();
            }
        } catch (error: any) {
            showActionError(error?.message || 'Something went wrong. Please try again in a moment.');
        } finally {
            setLoadingPlanSlug(null);
        }
    };

    const handleReactivate = async () => {
        try {
            setActionError(null);
            await subscriptionAPI.reactivate();
            loadSubscriptionData();
        } catch (error) {
            console.error('Reactivate failed:', error);
            showActionError('Something went wrong. Please try again in a moment.');
        }
    };

    const handlePurchaseCredits = async (packId: string) => {
        try {
            setActionError(null);
            const data = await subscriptionAPI.purchaseCredits(packId);
            if (!(window as any).Razorpay) {
                throw new Error('Payment service not available');
            }
            const options = {
                key: data.keyId,
                amount: data.amount,
                currency: data.currency,
                order_id: data.orderId,
                name: 'RestroPulse',
                description: `${data.credits} Credits`,
                handler: async (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
                    await subscriptionAPI.verifyCredits(
                        response.razorpay_order_id,
                        response.razorpay_payment_id,
                        response.razorpay_signature,
                    );
                    const currentData = await subscriptionAPI.getCurrent();
                    setSubscription(currentData.subscription);
                    setUsage(currentData.usage);
                },
            };
            const rzp = new (window as any).Razorpay(options);
            rzp.open();
        } catch (error) {
            console.error('Credit purchase failed:', error);
            showActionError('Something went wrong. Please try again in a moment.');
        }
    };

    const handleValidateCoupon = async () => {
        const normalizedCouponCode = couponCode.trim().toUpperCase();
        if (!normalizedCouponCode) return;
        try {
            const result = await couponAPI.validate(normalizedCouponCode);
            setCouponCode(normalizedCouponCode);
            setCouponValid(result.valid);
        } catch {
            setCouponValid(false);
        }
    };

    // Sub-components

    const InstagramSetupGuide = () => {
        if (!showSetupGuide) return null;
        return (
            <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in">
                <div className="absolute inset-0" onClick={() => { setShowSetupGuide(false); window.history.back(); }}></div>
                <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl animate-in slide-in-from-bottom duration-300 relative z-10 max-h-[90vh] overflow-y-auto">
                    <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-4 sm:hidden"></div>
                    <div className="flex items-center gap-4 mb-6">
                        <div className="w-14 h-14 bg-gradient-to-br from-purple-500 via-pink-500 to-orange-500 rounded-2xl flex items-center justify-center">
                            <InstagramIcon size={28} className="text-white" />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-slate-800">Connect Instagram</h3>
                            <p className="text-sm text-slate-500">Choose your setup method</p>
                        </div>
                    </div>

                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4">
                        <div className="flex items-start gap-3">
                            <div className="w-8 h-8 bg-[#1877F2] rounded-full flex items-center justify-center shrink-0 mt-0.5">
                                <span className="text-white font-bold text-sm">1</span>
                            </div>
                            <div className="flex-1">
                                <p className="font-semibold text-blue-900 mb-1">I already have everything set up</p>
                                <p className="text-xs text-blue-700 mb-3">
                                    Use this if you have a Facebook Page with Instagram Professional account already linked.
                                </p>
                                <button
                                    onClick={() => { window.history.back(); startInstagramOAuth(false); }}
                                    className="w-full px-4 py-2.5 rounded-xl font-medium flex items-center justify-center gap-2 bg-[#1877F2] text-white hover:bg-[#1565D8] text-sm"
                                >
                                    <FacebookIcon size={16} />
                                    Connect with Facebook
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="bg-gradient-to-br from-purple-50 via-pink-50 to-orange-50 border border-pink-200 rounded-xl p-4 mb-5">
                        <div className="flex items-start gap-3">
                            <div className="w-8 h-8 bg-gradient-to-br from-purple-500 via-pink-500 to-orange-500 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                                <span className="text-white font-bold text-sm">2</span>
                            </div>
                            <div className="flex-1">
                                <p className="font-semibold text-pink-900 mb-1">I need help setting up</p>
                                <p className="text-xs text-pink-700 mb-3">
                                    Use this for a guided setup that helps you create a Page and link Instagram.
                                </p>
                                <button
                                    onClick={() => { window.history.back(); startInstagramOAuth(true); }}
                                    className="w-full px-4 py-2.5 rounded-xl font-medium flex items-center justify-center gap-2 bg-gradient-to-r from-purple-600 via-pink-500 to-orange-500 text-white hover:opacity-90 text-sm"
                                >
                                    <InstagramIcon size={16} />
                                    Guided Setup
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="border-t border-slate-100 pt-4 mb-4">
                        <p className="text-xs text-slate-500 mb-2">Need to set things up manually first?</p>
                        <div className="flex flex-wrap gap-2">
                            <a href="https://www.facebook.com/pages/create" target="_blank" rel="noopener noreferrer" className="text-xs px-3 py-1.5 bg-blue-50 text-blue-600 rounded-full hover:bg-blue-100 transition-colors">Create Facebook Page</a>
                            <a href="https://help.instagram.com/502981923235522" target="_blank" rel="noopener noreferrer" className="text-xs px-3 py-1.5 bg-pink-50 text-pink-600 rounded-full hover:bg-pink-100 transition-colors">Switch to Professional</a>
                            <a href="https://www.facebook.com/help/1148909221857370" target="_blank" rel="noopener noreferrer" className="text-xs px-3 py-1.5 bg-purple-50 text-purple-600 rounded-full hover:bg-purple-100 transition-colors">Link Instagram to Page</a>
                        </div>
                    </div>

                    <button
                        onClick={() => { setShowSetupGuide(false); window.history.back(); }}
                        className="w-full px-4 py-3 bg-slate-100 text-slate-700 rounded-xl font-medium hover:bg-slate-200"
                    >
                        Cancel
                    </button>
                </div>
            </div>
        );
    };

    const InstagramErrorModal = () => {
        if (!instagramError) return null;
        const errorInfo = INSTAGRAM_ERROR_MESSAGES[instagramError.type] || {
            title: 'Connection Error',
            description: instagramError.message
        };

        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in">
                <div className="absolute inset-0" onClick={() => setShowInstagramErrorModal(false)}></div>
                <div className="bg-white w-full max-w-sm rounded-2xl p-6 shadow-2xl animate-in zoom-in-95 relative z-10">
                    <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <AlertCircle className="w-8 h-8 text-red-600" />
                    </div>
                    <h3 className="text-xl font-bold text-slate-800 text-center mb-2">{errorInfo.title}</h3>
                    <p className="text-slate-600 text-center mb-4">{errorInfo.description}</p>
                    {errorInfo.helpUrl && (
                        <a href={errorInfo.helpUrl} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 text-pink-600 hover:text-pink-700 text-sm font-medium mb-4 p-3 bg-pink-50 rounded-xl">
                            <ExternalLink size={14} />
                            {errorInfo.helpLabel || 'Get Help'}
                        </a>
                    )}
                    <div className="flex gap-3">
                        <button onClick={() => setShowInstagramErrorModal(false)} className="flex-1 px-4 py-2.5 bg-slate-100 text-slate-700 rounded-xl font-medium hover:bg-slate-200">Close</button>
                        <button onClick={() => { setShowInstagramErrorModal(false); startInstagramOAuth(); }} className="flex-1 px-4 py-2.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium hover:opacity-90">Try Again</button>
                    </div>
                </div>
            </div>
        );
    };

    const AccountPickerModal = () => {
        if (!showAccountPicker || pendingAccounts.length === 0) return null;
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in">
                <div className="absolute inset-0" onClick={() => setShowAccountPicker(false)}></div>
                <div className="bg-white w-full max-w-sm rounded-2xl p-6 shadow-2xl animate-in zoom-in-95 relative z-10">
                    <div className="w-16 h-16 bg-gradient-to-br from-purple-500 via-pink-500 to-orange-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
                        <InstagramIcon size={28} className="text-white" />
                    </div>
                    <h3 className="text-xl font-bold text-slate-800 text-center mb-2">Select Account</h3>
                    <p className="text-slate-500 text-sm text-center mb-6">Choose which Instagram account to connect</p>
                    <div className="space-y-3 max-h-64 overflow-y-auto">
                        {pendingAccounts.map((account) => (
                            <button key={account.id} onClick={() => handleSelectAccount(account)} className="w-full p-4 border border-slate-200 rounded-xl hover:border-pink-300 hover:bg-pink-50 transition-all flex items-center gap-4">
                                {account.profilePictureUrl ? (
                                    <img src={account.profilePictureUrl} alt={account.username} className="w-12 h-12 rounded-full" />
                                ) : (
                                    <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center">
                                        <InstagramIcon size={20} className="text-white" />
                                    </div>
                                )}
                                <div className="flex-1 text-left">
                                    <p className="font-bold text-slate-800">@{account.username}</p>
                                    <p className="text-xs text-slate-500">via {account.pageName}</p>
                                </div>
                            </button>
                        ))}
                    </div>
                    <button onClick={() => setShowAccountPicker(false)} className="w-full mt-4 px-4 py-2.5 bg-slate-100 text-slate-700 rounded-xl font-medium hover:bg-slate-200">Cancel</button>
                </div>
            </div>
        );
    };

    const EditProfileModal = () => {
        const [editName, setEditName] = useState(restaurantData.name);
        const [editCuisine, setEditCuisine] = useState(restaurantData.cuisine);
        const [editAddress, setEditAddress] = useState(restaurantData.location.address);
        const [editCoordinates, setEditCoordinates] = useState<[number, number]>(
            [restaurantData.location.lng, restaurantData.location.lat] || [0, 0]
        );
        const googleMapsApiKey = getGoogleMapsApiKey();

        const handleSave = () => {
            onRestaurantUpdate({
                ...restaurantData,
                name: editName,
                cuisine: editCuisine,
                location: {
                    ...restaurantData.location,
                    address: editAddress,
                    lng: editCoordinates[0],
                    lat: editCoordinates[1]
                }
            });
            closeEditProfile();
        };

        return (
            <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in">
                <div className="absolute inset-0" onClick={closeEditProfile}></div>
                <div
                    className="bg-white w-full max-w-sm rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl animate-in slide-in-from-bottom duration-300 relative z-10"
                    style={{ transform: `translateY(${Math.max(0, dragOffset)}px)` }}
                    onTouchStart={(e) => setDragStartY(e.touches[0].clientY)}
                    onTouchMove={(e) => { if (dragStartY !== null) setDragOffset(e.touches[0].clientY - dragStartY); }}
                    onTouchEnd={() => { if (dragOffset > 100) closeEditProfile(); else setDragOffset(0); setDragStartY(null); }}
                >
                    <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-6 shrink-0 sm:hidden"></div>
                    <div className="space-y-5">
                        <div>
                            <label className="block text-slate-600 text-sm font-medium mb-1.5">Restaurant name</label>
                            <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} aria-label="Restaurant Name" className="w-full bg-white text-slate-900 px-4 py-3 rounded-xl border border-slate-200 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 placeholder:text-slate-400" />
                        </div>
                        <div>
                            <label className="block text-slate-600 text-sm font-medium mb-1.5">Cuisine</label>
                            <input type="text" value={editCuisine} onChange={(e) => setEditCuisine(e.target.value)} aria-label="Cuisine" className="w-full bg-white text-slate-900 px-4 py-3 rounded-xl border border-slate-200 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 placeholder:text-slate-400" />
                        </div>
                        <div>
                            <label htmlFor="edit-location" className="block text-slate-600 text-sm font-medium mb-1.5">Location</label>
                            {googleMapsApiKey ? (
                                <APIProvider apiKey={googleMapsApiKey}>
                                    <PlacesAutocompleteInput
                                        theme="light"
                                        initialValue={editAddress}
                                        onSelect={(place) => { setEditAddress(place.address); setEditCoordinates([place.lng, place.lat]); }}
                                        placeholder="Enter restaurant location"
                                    />
                                    {editCoordinates && (editCoordinates[0] !== 0 || editCoordinates[1] !== 0) && (
                                        <div className="mt-4 rounded-xl overflow-hidden border border-slate-200 map-container">
                                            <Map style={{ width: '100%', height: '12rem' }} defaultCenter={{ lat: editCoordinates[1], lng: editCoordinates[0] }} center={{ lat: editCoordinates[1], lng: editCoordinates[0] }} zoom={16} disableDefaultUI mapId="settings-map">
                                                <AdvancedMarker position={{ lat: editCoordinates[1], lng: editCoordinates[0] }} />
                                            </Map>
                                        </div>
                                    )}
                                </APIProvider>
                            ) : (
                                <input id="edit-location" type="text" value={editAddress} onChange={(e) => setEditAddress(e.target.value)} className="w-full bg-white text-slate-900 px-4 py-3 rounded-xl border border-slate-200 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 placeholder:text-slate-400" />
                            )}
                        </div>
                        <div className="pt-2">
                            <button onClick={handleSave} className="w-full bg-slate-900 text-white py-3.5 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-slate-800 transition-colors shadow-sm">
                                <Save size={18} /> Save Changes
                            </button>
                            <button onClick={closeEditProfile} className="w-full bg-transparent text-slate-600 hover:text-slate-900 py-3 rounded-xl font-bold mt-2 hover:bg-slate-50 transition-colors">Cancel</button>
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    const SubscriptionModal = () => {
        const currentTier = subscription?.planSnapshot?.tier;
        const tierMeta = currentTier ? TIER_ICONS[currentTier] : null;
        const CurrentIcon = tierMeta?.icon;

        const handleDragStart = (e: React.TouchEvent) => { setDragStartY(e.touches[0].clientY); };
        const handleDragMove = (e: React.TouchEvent) => {
            if (dragStartY !== null) {
                const offset = e.touches[0].clientY - dragStartY;
                const scrollTop = subscriptionModalRef.current?.scrollTop || 0;
                if (offset > 0 && scrollTop === 0) { e.preventDefault(); setDragOffset(offset); }
                else if (offset < 0) setDragOffset(0);
            }
        };
        const handleDragEnd = () => { if (dragOffset > 100) closeSubscription(); else setDragOffset(0); setDragStartY(null); };

        return (
            <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in">
                <div className="absolute inset-0" onClick={closeSubscription}></div>
                <div
                    ref={subscriptionModalRef}
                    data-subscription-modal
                    className="bg-white w-full max-w-lg rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl animate-in slide-in-from-bottom duration-300 max-h-[90vh] overflow-y-auto no-scrollbar relative z-10"
                    style={{ transform: `translateY(${Math.max(0, dragOffset)}px)` }}
                    onTouchStart={handleDragStart} onTouchMove={handleDragMove} onTouchEnd={handleDragEnd}
                >
                    <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-6 shrink-0 sm:hidden"></div>
                    <div className="flex justify-between items-center mb-6">
                        <div>
                            <h3 className="text-xl font-bold text-slate-800">Subscription</h3>
                            <p className="text-sm text-slate-500">Manage your plan</p>
                        </div>
                    </div>

                    {actionError && (
                        <div className="mb-4">
                            <ActionNotice
                                key={actionErrorKey}
                                message={actionError}
                                onDismiss={() => setActionError(null)}
                            />
                            <button
                                onClick={() => { setActionError(null); loadSubscriptionData(); }}
                                className="mt-2 text-xs font-medium text-slate-500 hover:text-slate-700 underline underline-offset-2 transition-colors"
                            >
                                Tap to retry
                            </button>
                        </div>
                    )}

                    {/* Current Plan + Credits Hero */}
                    <div className="bg-gradient-to-r from-slate-900 to-slate-800 rounded-2xl p-5 text-white mb-6 shadow-lg">
                        <div className="flex justify-between items-start mb-3">
                            <div>
                                <p className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-1">Current Plan</p>
                                <h4 className="text-2xl font-bold flex items-center gap-2">
                                    {subscription?.planSnapshot?.name || 'No Plan'}
                                    {subscription?.status === 'ACTIVE' && <span className="px-2 py-0.5 bg-white/20 text-xs rounded-md font-medium">Active</span>}
                                    {subscription?.status === 'NONE' && <span className="px-2 py-0.5 bg-yellow-500/30 text-xs rounded-md font-medium">Free Credits</span>}
                                    {subscription?.status === 'PAST_DUE' && <span className="px-2 py-0.5 bg-amber-500/30 text-xs rounded-md font-medium">Past Due</span>}
                                    {subscription?.status === 'HALTED' && <span className="px-2 py-0.5 bg-red-500/30 text-xs rounded-md font-medium">Suspended</span>}
                                    {subscription?.status === 'CANCELLED' && <span className="px-2 py-0.5 bg-slate-400/30 text-xs rounded-md font-medium">Cancelled</span>}
                                    {(subscription?.status === 'CREATED' || subscription?.status === 'AUTHENTICATED') && <span className="px-2 py-0.5 bg-blue-400/30 text-xs rounded-md font-medium">Processing</span>}
                                </h4>
                            </div>
                            <div className="w-10 h-10 rounded-full flex items-center justify-center bg-white/10">
                                {CurrentIcon && <CurrentIcon size={20} />}
                            </div>
                        </div>
                        <div className="flex items-center justify-between text-sm border-t border-white/10 pt-3">
                            <div className="flex items-center gap-2">
                                <Zap size={14} className="text-yellow-400" />
                                <span className="text-white font-bold text-lg">{subscription?.credits ?? 0}</span>
                                <span className="text-slate-400 text-xs">credits</span>
                            </div>
                            <div className="flex flex-col items-end gap-0.5">
                                {subscription?.currentPeriodEnd && (
                                    <span className="text-slate-400 text-xs">
                                        {(subscription.cancelAtPeriodEnd || subscription.status === 'CANCELLED') ? 'Expires' : 'Renews'}{' '}
                                        {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
                                    </span>
                                )}
                                {subscription?.status === 'ACTIVE' && !subscription.cancelAtPeriodEnd && (
                                    <button
                                        onClick={() => setShowCancelConfirm(true)}
                                        className="text-xs text-slate-500 active:text-red-400 underline underline-offset-2 py-1 transition-colors"
                                    >
                                        Cancel plan
                                    </button>
                                )}
                                {subscription?.status === 'ACTIVE' && subscription.cancelAtPeriodEnd && (
                                    <button
                                        onClick={handleReactivate}
                                        className="text-xs text-green-600 active:text-green-800 underline underline-offset-2 py-1 transition-colors font-medium"
                                    >
                                        Reactivate
                                    </button>
                                )}
                            </div>
                        </div>
                        {(subscription?.status === 'CREATED' || subscription?.status === 'AUTHENTICATED') && (
                            <p className="text-xs text-blue-300 mt-2 flex items-center gap-1.5">
                                <Loader2 size={11} className="animate-spin shrink-0" />
                                New plan activating — this may take a moment.
                            </p>
                        )}
                    </div>

                    {/* Payment status banners */}
                    {subscription?.status === 'PAST_DUE' && (
                        <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-3">
                            <AlertCircle size={18} className="text-amber-500 mt-0.5 shrink-0" />
                            <div>
                                <p className="text-sm font-bold text-amber-800">Payment Overdue</p>
                                <p className="text-xs text-amber-700 mt-0.5">Your last payment failed. Razorpay will retry automatically. You may also retry by switching plans or re-subscribing below.</p>
                            </div>
                        </div>
                    )}
                    {subscription?.status === 'HALTED' && (
                        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-3">
                            <AlertCircle size={18} className="text-red-500 mt-0.5 shrink-0" />
                            <div>
                                <p className="text-sm font-bold text-red-800">Subscription Suspended</p>
                                <p className="text-xs text-red-700 mt-0.5">All payment retries were exhausted. Please re-subscribe below to restore access.</p>
                            </div>
                        </div>
                    )}
                    {(subscription?.cancelAtPeriodEnd || subscription?.status === 'CANCELLED') && (
                        <div className="mb-4 p-4 bg-slate-50 border border-slate-200 rounded-2xl flex items-start gap-3">
                            <AlertCircle size={18} className="text-slate-400 mt-0.5 shrink-0" />
                            <div>
                                <p className="text-sm font-bold text-slate-700">Subscription Cancelled</p>
                                <p className="text-xs text-slate-500 mt-0.5">
                                    {subscription.currentPeriodEnd
                                        ? `Access continues until ${new Date(subscription.currentPeriodEnd).toLocaleDateString()}.`
                                        : 'Your subscription has been cancelled.'}
                                    {' '}Subscribe below to continue.
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Weekly Usage */}
                    {usage && (
                        <div className="mb-6">
                            <h4 className="font-bold text-slate-800 mb-2 text-sm">This Week</h4>
                            <div className="space-y-3">
                                {Object.entries(usage).map(([platform, postTypes]) => {
                                    const items = Object.entries(postTypes || {}).filter(([, v]) => v && v.limit > 0);
                                    if (items.length === 0) return null;
                                    return (
                                        <div key={platform}>
                                            <p className="text-[10px] text-slate-500 font-bold uppercase mb-1">{platform}</p>
                                            <div className="grid grid-cols-3 gap-2">
                                                {items.map(([type, val]) => {
                                                    const { used, limit } = val!;
                                                    const pct = limit > 0 ? Math.min((used / limit) * 100, 100) : 0;
                                                    return (
                                                        <div key={`${platform}-${type}`} className="bg-slate-50 rounded-xl p-3">
                                                            <p className="text-[10px] text-slate-500 font-medium mb-1">{type}</p>
                                                            <p className="text-lg font-bold text-slate-800">{used}<span className="text-sm text-slate-400">/{limit}</span></p>
                                                            <div className="w-full h-1 bg-slate-200 rounded-full mt-1.5">
                                                                <div className={`h-1 rounded-full transition-all ${pct >= 100 ? 'bg-red-500' : pct >= 75 ? 'bg-amber-500' : 'bg-green-500'}`} style={{ width: `${pct}%` }}></div>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Top Up Credits */}
                    {topupCreditsEnabled ? (
                        creditPacks.length > 0 && (
                            <div className="mb-6">
                                <div className="flex items-center justify-between mb-3">
                                    <h4 className="font-bold text-slate-800 text-sm">Top Up Credits</h4>
                                    <span className="text-[10px] text-slate-400">Used when over weekly limits</span>
                                </div>
                                <div className="grid grid-cols-3 gap-2">
                                    {creditPacks.map((pack) => (
                                        <button key={pack.id} onClick={() => handlePurchaseCredits(pack.id)} className="border border-slate-200 rounded-xl p-3 text-center hover:border-orange-300 hover:bg-orange-50 transition-all hover:shadow-sm">
                                            <p className="text-lg font-bold text-slate-800">{pack.credits}</p>
                                            <p className="text-[10px] text-slate-500 mb-1">credits</p>
                                            <p className="text-xs font-bold text-orange-600">{formatPaise(pack.priceInPaise)}</p>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )
                    ) : (
                        <div className="mb-6">
                            <div className="flex items-center justify-between mb-2">
                                <h4 className="font-bold text-slate-400 text-sm">Top Up Credits</h4>
                                <span className="text-[10px] font-bold text-orange-400 uppercase tracking-wide">Coming Soon</span>
                            </div>
                            <p className="text-[11px] text-slate-400">Purchase additional credits when over your weekly plan limit.</p>
                        </div>
                    )}

                    {/* Divider */}
                    <div className="border-t border-slate-100 my-6"></div>

                    {/* Change Plan */}
                    <div>
                        <h4 className="font-bold text-slate-800 mb-4">Change Plan</h4>

                        {/* Billing Cycle Toggle */}
                        <div className="flex items-center justify-center gap-1 mb-4 bg-slate-100 rounded-xl p-1">
                            <button onClick={() => setBillingCycle('MONTHLY')} disabled={loadingPlanSlug !== null} className={`flex-1 px-3 py-2 text-xs font-bold rounded-lg transition-colors ${billingCycle === 'MONTHLY' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>Monthly</button>
                            <button onClick={() => setBillingCycle('ANNUAL')} disabled={loadingPlanSlug !== null} className={`flex-1 px-3 py-2 text-xs font-bold rounded-lg transition-colors ${billingCycle === 'ANNUAL' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>Annual <span className="text-green-600">(save 17%)</span></button>
                        </div>

                        <div className="space-y-3">
                            {plans.map((plan) => {
                                const meta = TIER_ICONS[plan.tier] || TIER_ICONS.STARTER;
                                const PlanIcon = meta.icon;
                                const price = billingCycle === 'MONTHLY' ? plan.pricing.monthly : plan.pricing.annual;
                                const priceLabel = billingCycle === 'MONTHLY' ? `${formatPaise(price)}/mo` : `${formatPaise(price)}/yr`;
                                const isCurrentPlan =
                                    subscription?.planSnapshot?.slug === plan.slug &&
                                    (subscription?.status === 'ACTIVE' || subscription?.status === 'PAST_DUE') &&
                                    subscription?.billingCycle === billingCycle;

                                const isActivatingPlan =
                                    subscription?.planSnapshot?.slug === plan.slug &&
                                    (subscription?.status === 'CREATED' || subscription?.status === 'AUTHENTICATED');

                                return (
                                    <div key={plan.id} className={`border rounded-2xl p-4 transition-all ${isCurrentPlan ? 'border-orange-500 bg-orange-50 ring-1 ring-orange-500' : isActivatingPlan ? 'border-blue-300 bg-blue-50' : 'border-slate-200'}`}>
                                        <div className="flex justify-between items-center mb-3">
                                            <div className="flex items-center gap-3">
                                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white ${meta.color}`}>
                                                    <PlanIcon size={20} />
                                                </div>
                                                <div>
                                                    <h5 className="font-bold text-slate-800">{plan.name}</h5>
                                                    <p className="text-sm text-slate-500 font-medium">{priceLabel}</p>
                                                </div>
                                            </div>
                                            {isCurrentPlan ? (
                                                <CheckCircle2 size={24} className="text-orange-500" />
                                            ) : isActivatingPlan ? (
                                                <div className="flex items-center gap-1.5">
                                                    <Loader2 size={14} className="text-blue-500 animate-spin" />
                                                    <span className="text-xs text-blue-600 font-medium">Activating...</span>
                                                </div>
                                            ) : (
                                                <button
                                                    onClick={() => {
                                                        if (subscription?.cancelAtPeriodEnd && subscription?.status === 'ACTIVE') {
                                                            setResubscribeConfirmPlan(plan);
                                                        } else if (subscription?.status === 'ACTIVE' || subscription?.status === 'PAST_DUE') {
                                                            setSwitchConfirmPlan(plan);
                                                        } else {
                                                            handleSwitchPlan(plan.slug);
                                                        }
                                                    }}
                                                    disabled={loadingPlanSlug !== null}
                                                    className={`px-4 py-2 text-white text-xs font-bold rounded-xl ${loadingPlanSlug !== null ? 'bg-slate-400 cursor-not-allowed' : 'bg-slate-900 active:bg-slate-700'}`}
                                                >
                                                    {loadingPlanSlug === plan.slug ? 'Processing...' : (
                                                        subscription?.status === 'ACTIVE' ? 'Switch' :
                                                        subscription?.status === 'PAST_DUE' ? 'Retry' :
                                                        'Subscribe'
                                                    )}
                                                </button>
                                            )}
                                        </div>
                                        <ul className="space-y-2 pl-1">
                                            {planFeatures(plan).map((feat, i) => (
                                                <li key={i} className="text-xs text-slate-600 flex items-center gap-2">
                                                    <div className="w-1 h-1 bg-slate-300 rounded-full"></div> {feat}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Coupon Code */}
                        <div className="mt-4">
                            <div className="flex gap-2">
                                <input type="text" value={couponCode} onChange={(e) => { setCouponCode(e.target.value); setCouponValid(null); }} placeholder="Have a coupon code?" className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm" />
                                <button onClick={handleValidateCoupon} className="px-4 py-2 bg-slate-900 text-white text-xs font-bold rounded-xl hover:bg-slate-800">Apply</button>
                            </div>
                            {couponValid === true && <p className="text-xs text-green-600 mt-1">Coupon applied!</p>}
                            {couponValid === false && <p className="text-xs text-red-500 mt-1">Invalid coupon code</p>}
                        </div>
                    </div>

                    <div className="mt-6 text-center">
                        <p className="text-xs text-slate-400">Payments processed securely via Razorpay</p>
                    </div>
                </div>
            </div>
        );
    };

    if (!isOpen) return null;

    const initials = getInitials(userName);
    const city = getCityFromAddress(restaurantData.location.address);

    return (
        <>
            {/* Full-page profile */}
            <div
                className="fixed inset-0 z-40 bg-white animate-in slide-in-from-right duration-300 overflow-y-auto no-scrollbar"
                onTouchStart={(e) => {
                    if (!isEditingProfile && !isSubscriptionOpen && !showInstagramErrorModal && !showAccountPicker && !showSetupGuide) {
                        setSwipeStartX(e.touches[0].clientX);
                        setSwipeStartYPos(e.touches[0].clientY);
                    }
                }}
                onTouchEnd={(e) => {
                    if (swipeStartX !== null && swipeStartYPos !== null) {
                        const deltaX = e.changedTouches[0].clientX - swipeStartX;
                        const deltaY = Math.abs(e.changedTouches[0].clientY - swipeStartYPos);
                        if (deltaX > 80 && deltaY < 100 && swipeStartX < 60) {
                            onClose();
                        }
                    }
                    setSwipeStartX(null);
                    setSwipeStartYPos(null);
                }}
            >

                {/* Top bar */}
                <div className="sticky top-0 z-10 bg-white/80 backdrop-blur-md border-b border-slate-100 px-4 py-3 flex items-center gap-3">
                    <button onClick={onClose} className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-colors" aria-label="Go back">
                        <ArrowLeft size={18} className="text-slate-600" />
                    </button>
                    <h1 className="text-base font-bold text-slate-800">Profile</h1>
                </div>

                <div className="p-6 space-y-6">
                    {/* Header: avatar + name */}
                    <div className="flex items-center gap-4">
                        <div className="w-16 h-16 bg-gradient-to-br from-orange-500 to-red-600 rounded-full flex items-center justify-center shrink-0">
                            <span className="text-white font-bold text-xl">{initials}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                            <h2 className="text-xl font-bold text-slate-800 truncate">{userName}</h2>
                            <p className="text-sm text-slate-500 truncate">{restaurantData.name}</p>
                            <div className="flex flex-col gap-1 mt-2">
                                {userPhone && (
                                    <span className="flex items-center gap-1.5 text-sm text-slate-400">
                                        <Phone size={13} className="shrink-0" />
                                        {userPhone.replace(/^\+91(\d)/, '+91 $1')}
                                    </span>
                                )}
                                {userEmail && !userEmail.endsWith('@phone.restropulse.local') && (
                                    <span className="flex items-center gap-1.5 text-sm text-slate-400">
                                        <Mail size={13} className="shrink-0" />
                                        <span className="truncate">{userEmail}</span>
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Action notice (only when no modal is covering the sheet) */}
                    {actionError && !isSubscriptionOpen && !isEditingProfile && (
                        <ActionNotice
                            key={actionErrorKey}
                            message={actionError}
                            onDismiss={() => setActionError(null)}
                        />
                    )}

                    {/* Restaurant */}
                    <div>
                        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 px-1">Restaurant</h3>
                        <button onClick={openEditProfile} className="w-full bg-white rounded-2xl p-4 border border-slate-100 shadow-sm flex items-center justify-between hover:bg-slate-50 transition-colors group">
                            <div className="flex items-center gap-3">
                                <div className="w-9 h-9 bg-slate-100 text-slate-500 rounded-lg flex items-center justify-center">
                                    <Edit3 size={18} />
                                </div>
                                <div className="text-left">
                                    <p className="text-sm font-bold text-slate-700">Edit Restaurant Profile</p>
                                    <p className="text-xs text-slate-500 font-medium">{restaurantData.cuisine}</p>
                                </div>
                            </div>
                            <ChevronRight size={18} className="text-slate-300 group-hover:text-slate-400" />
                        </button>
                    </div>

                    {/* Your Team */}
                    <div>
                        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 px-1">Your RestroPulse Team</h3>
                        <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                {restaurantData.accountManager.avatar ? (
                                    <img src={restaurantData.accountManager.avatar} alt="AM" className="w-10 h-10 rounded-full object-cover" />
                                ) : (
                                    <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center">
                                        <User size={20} className="text-slate-400" />
                                    </div>
                                )}
                                <div>
                                    <p className="font-bold text-slate-800 text-sm">{restaurantData.accountManager.name}</p>
                                    <p className="text-xs text-slate-500">Account Manager</p>
                                </div>
                            </div>
                            <a
                                href={`https://wa.me/${restaurantData.accountManager.phone.replace(/[^0-9]/g, '')}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="w-11 h-11 bg-green-100 text-green-600 hover:bg-green-200 rounded-xl flex items-center justify-center transition-colors"
                                title="Chat on WhatsApp"
                            >
                                <WhatsAppIcon size={22} />
                            </a>
                        </div>
                    </div>

                    {/* Account */}
                    <div>
                        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 px-1">Account</h3>
                        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                            <button onClick={openSubscription} className="w-full p-4 flex items-center justify-between hover:bg-slate-50 transition-colors group">
                                <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 bg-orange-100 text-orange-600 rounded-lg flex items-center justify-center">
                                        <CreditCard size={18} />
                                    </div>
                                    <div className="text-left">
                                        <p className="text-sm font-bold text-slate-700">Subscription</p>
                                        <p className="text-xs text-slate-500 font-medium">
                                            {subscriptionLoading ? 'Loading...' : `${subscription?.planSnapshot?.name || 'No Plan'} ${subscription?.credits ? `(${subscription.credits} credits)` : ''}`}
                                        </p>
                                    </div>
                                </div>
                                <ChevronRight size={18} className="text-slate-300 group-hover:text-slate-400" />
                            </button>
                        </div>
                    </div>

                    {/* Integrations */}
                    <div>
                        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 px-1">Integrations</h3>
                        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                            <div className="p-4 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${instagramConnected ? 'bg-gradient-to-br from-purple-500 via-pink-500 to-orange-500' : 'bg-pink-100'}`}>
                                        <InstagramIcon size={20} className={instagramConnected ? 'text-white' : 'text-pink-600'} />
                                    </div>
                                    <div>
                                        <p className="font-bold text-slate-800 text-sm">Instagram</p>
                                        <p className="text-xs text-slate-500">{instagramConnected ? `@${instagramUsername}` : 'Connect your business account'}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    {!instagramConnected && !instagramLoading && (
                                        <button onClick={() => { setShowSetupGuide(true); window.history.pushState({ modal: 'setupGuide' }, '', '#setup-guide'); }} className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700 flex items-center justify-center transition-colors" title="View setup guide">
                                            <HelpCircle size={16} />
                                        </button>
                                    )}
                                    <button
                                        onClick={handleInstagramConnect}
                                        disabled={instagramLoading}
                                        className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-2 ${instagramLoading ? 'bg-slate-100 text-slate-400 cursor-wait' : instagramConnected ? 'bg-green-100 text-green-700 hover:bg-red-100 hover:text-red-700' : 'bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:opacity-90'}`}
                                    >
                                        {instagramLoading ? (<><Loader2 size={12} className="animate-spin" /><span>Connecting...</span></>) : instagramConnected ? 'Connected' : 'Connect'}
                                    </button>
                                </div>
                            </div>
                        </div>
                        {instagramConnected && restaurantData.instagramConnection && (
                            <div className="mt-2 px-4 py-3 bg-slate-50 rounded-xl">
                                <div className="flex items-center justify-between text-xs">
                                    <span className="text-slate-500">Connected via {restaurantData.instagramConnection.pageName}</span>
                                    {restaurantData.instagramConnection.tokenStatus === 'expiring_soon' && (
                                        <span className="text-orange-600 font-medium">Token expiring soon</span>
                                    )}
                                    {restaurantData.instagramConnection.needsReauthorization && (
                                        <button onClick={handleInstagramConnect} className="text-pink-600 font-medium hover:text-pink-700">Reauthorize</button>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Billing History */}
                    {invoices.length > 0 && (
                        <div>
                            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 px-1">Billing History</h3>
                            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden divide-y divide-slate-50">
                                {invoices.slice(0, 2).map((invoice) => (
                                    <div key={invoice.id} className="p-4 flex items-center justify-between">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className={`w-9 h-9 shrink-0 rounded-lg flex items-center justify-center ${invoice.type === 'SUBSCRIPTION' ? 'bg-blue-100 text-blue-600' : 'bg-green-100 text-green-600'}`}>
                                                <FileText size={18} />
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-sm font-bold text-slate-700 truncate">{invoice.description}</p>
                                                <p className="text-xs text-slate-500">
                                                    {new Date(invoice.paidAt || invoice.createdAt || '').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                                                    {' · '}
                                                    {formatPaise(invoice.amountPaise)}
                                                </p>
                                            </div>
                                        </div>
                                        {invoice.pdfUrl && (
                                            <a href={invoice.pdfUrl} target="_blank" rel="noopener noreferrer" className="w-9 h-9 bg-slate-100 text-slate-500 hover:text-slate-700 rounded-lg flex items-center justify-center shrink-0 ml-3" title="Download Invoice">
                                                <Download size={16} />
                                            </a>
                                        )}
                                    </div>
                                ))}
                            </div>
                            {invoices.length > 2 && (
                                <button
                                    onClick={() => setShowInvoiceHistory(true)}
                                    className="mt-2 w-full py-2.5 text-xs font-bold text-slate-500 hover:text-slate-700 flex items-center justify-center gap-1.5 transition-colors"
                                >
                                    View all {invoices.length} invoices
                                    <ChevronRight size={14} />
                                </button>
                            )}
                        </div>
                    )}

                    {/* Footer actions */}
                    <div className="space-y-2 pt-2">
                        <button onClick={onLogout} className="w-full p-4 flex items-center gap-3 text-left bg-white rounded-2xl border border-slate-100 shadow-sm hover:bg-slate-50">
                            <div className="w-9 h-9 bg-slate-100 text-slate-500 rounded-lg flex items-center justify-center">
                                <LogOut size={18} />
                            </div>
                            <span className="text-sm font-medium text-slate-700">Log Out</span>
                        </button>
                        {featureFlags?.deleteAccount === true ? (
                            <button onClick={() => setShowDeleteConfirm(true)} className="w-full p-4 flex items-center gap-3 text-left bg-white rounded-2xl border border-slate-100 shadow-sm hover:bg-red-50 group">
                                <div className="w-9 h-9 bg-red-50 text-red-400 group-hover:text-red-500 rounded-lg flex items-center justify-center">
                                    <Trash2 size={18} />
                                </div>
                                <span className="text-sm font-medium text-red-500 group-hover:text-red-600">Delete Account</span>
                            </button>
                        ) : (
                            <button onClick={() => setActionError('To delete your account, please contact your account manager. They will guide you through the process.')} className="w-full p-4 flex items-center gap-3 text-left bg-white rounded-2xl border border-slate-100 shadow-sm hover:bg-red-50 group">
                                <div className="w-9 h-9 bg-red-50 text-red-400 group-hover:text-red-500 rounded-lg flex items-center justify-center">
                                    <Trash2 size={18} />
                                </div>
                                <span className="text-sm font-medium text-red-500 group-hover:text-red-600">Delete Account</span>
                            </button>
                        )}
                    </div>

                    <div className="h-24"></div>
                </div>
            </div>

            {/* Sub-modals */}
            {isEditingProfile && <EditProfileModal />}
            {isSubscriptionOpen && SubscriptionModal()}
            {showInvoiceHistory && <InvoiceHistoryPanel invoices={invoices} onClose={() => setShowInvoiceHistory(false)} />}
            {showInstagramErrorModal && <InstagramErrorModal />}
            {showAccountPicker && <AccountPickerModal />}
            {showSetupGuide && <InstagramSetupGuide />}
            {showCancelConfirm && (
                <ConfirmDialog
                    title="Cancel subscription?"
                    message={`Your ${subscription?.planSnapshot?.name} plan stays active until ${subscription?.currentPeriodEnd ? new Date(subscription.currentPeriodEnd).toLocaleDateString() : 'end of billing period'}. After that you'll move to free credits.`}
                    confirmLabel={isCancellingPlan ? 'Cancelling...' : 'Cancel plan'}
                    cancelLabel="Keep plan"
                    details={[
                        <a key="policy" href="/terms#cancellation" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">
                            View cancellation policy
                        </a>
                    ]}
                    onConfirm={handleCancelPlan}
                    onCancel={() => !isCancellingPlan && setShowCancelConfirm(false)}
                />
            )}
            {switchConfirmPlan && (() => {
                const currentEffective = subscription?.billingCycle === 'MONTHLY'
                    ? (subscription?.planSnapshot?.pricing.monthly ?? 0)
                    : (subscription?.planSnapshot?.pricing.annual ?? 0) / 12;
                const targetEffective = billingCycle === 'MONTHLY'
                    ? switchConfirmPlan.pricing.monthly
                    : switchConfirmPlan.pricing.annual / 12;
                const isUpgrade = targetEffective > currentEffective;
                return (
                    <ConfirmDialog
                        title={`Switch to ${switchConfirmPlan.name}?`}
                        message={isUpgrade
                            ? `You'll be charged for ${switchConfirmPlan.name} immediately. The difference in price is applied to your account now.`
                            : `You're switching to a lower-tier plan. The change will take effect on your next billing date.`}
                        confirmLabel={isUpgrade ? 'Confirm Upgrade' : 'Confirm Downgrade'}
                        cancelLabel="Go back"
                        details={[
                            <a key="policy" href="/terms#refund" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">
                                View refund policy
                            </a>
                        ]}
                        onConfirm={() => { setSwitchConfirmPlan(null); handleSwitchPlan(switchConfirmPlan.slug); }}
                        onCancel={() => setSwitchConfirmPlan(null)}
                    />
                );
            })()}
            {resubscribeConfirmPlan && (() => {
                const daysLeft = subscription?.currentPeriodEnd
                    ? Math.max(0, Math.ceil((new Date(subscription.currentPeriodEnd as string).getTime() - Date.now()) / 86_400_000))
                    : null;
                return (
                    <ConfirmDialog
                        title="Start new plan now?"
                        message={daysLeft
                            ? `You have ${daysLeft} day${daysLeft !== 1 ? 's' : ''} remaining on your current plan. Starting a new plan immediately will cancel it — unused days are not refunded.`
                            : 'Starting a new plan will cancel your current subscription immediately. Unused days are not refunded.'
                        }
                        confirmLabel="Start new plan"
                        cancelLabel="Wait until period ends"
                        details={[
                            <a key="policy" href="/terms#cancellation" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">
                                View cancellation policy
                            </a>
                        ]}
                        onConfirm={() => { setResubscribeConfirmPlan(null); handleSwitchPlan(resubscribeConfirmPlan.slug); }}
                        onCancel={() => setResubscribeConfirmPlan(null)}
                    />
                );
            })()}
            {showDeleteConfirm && (
                <ConfirmDialog
                    title="Delete Account"
                    message="This action is permanent and cannot be undone."
                    details={[
                        'Your restaurant profile and all account data will be permanently deleted.',
                        'All posts, content strategies, and scheduling history will be removed.',
                        'Your active subscription will be cancelled immediately -- no refund for remaining days already paid.',
                        'All billing records and invoices will be removed.',
                    ]}
                    confirmLabel={isDeletingAccount ? 'Deleting...' : 'Delete My Account'}
                    onConfirm={handleDeleteAccount}
                    onCancel={() => !isDeletingAccount && setShowDeleteConfirm(false)}
                />
            )}
        </>
    );
};

export default ProfileSheet;
