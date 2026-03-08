import React, { useState, useEffect } from 'react';
import { APIProvider, Map, AdvancedMarker } from '@vis.gl/react-google-maps';
import { PlacesAutocompleteInput } from './PlacesAutocompleteInput';
import { CreditCard, LogOut, Trash2, MapPin, Edit3, X, Save, CheckCircle2, Star, Zap, Crown, ChevronRight, Loader2, AlertCircle, ExternalLink, HelpCircle, User, Plus, FileText, Download } from 'lucide-react';
import { SubscriptionTier, SubscriptionPlan, Subscription, PlanUsage, CreditPack, BillingCycle, Restaurant, InstagramConnectionError, InstagramAccount, Invoice } from '@restropulse/shared';
import { instagramAPI, restaurantAPI, subscriptionAPI, couponAPI, creditPacksAPI, invoiceAPI } from '../api';
import { FacebookIcon, InstagramIcon } from './BrandIcons';

interface SettingsProps {
    onLogout: () => void;
    restaurantData: Restaurant;
    onRestaurantUpdate?: (restaurant: Restaurant) => void;
}

// Error messages for Instagram connection issues with detailed help
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

// ... [WhatsAppIcon and SUBSCRIPTION_PLANS remain unchanged] ...
const WhatsAppIcon = ({ size = 24, className = "" }: { size?: number, className?: string }) => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="currentColor"
        className={className}
    >
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.008-.57-.008-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
    </svg>
);

const TIER_ICONS: Record<SubscriptionTier, { icon: any; color: string }> = {
    STARTER: { icon: Zap, color: 'bg-slate-500' },
    GROWTH: { icon: Star, color: 'bg-orange-500' },
    PREMIUM: { icon: Crown, color: 'bg-indigo-600' },
};

function formatPaise(paise: number): string {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(paise / 100);
}

function planFeatures(plan: SubscriptionPlan): string[] {
    return [
        `${plan.limits.reelsPerWeek} Reels/week`,
        `${plan.limits.instagramPostsPerWeek} Posts/week`,
        `${plan.limits.carouselPostsPerWeek} Carousels/week`,
        ...plan.features.map(f => f === 'INSTAGRAM' ? 'Instagram' : f === 'FACEBOOK' ? 'Facebook' : f),
    ];
}

const Settings: React.FC<SettingsProps> = ({ onLogout, restaurantData, onRestaurantUpdate }) => {
    const [isEditingProfile, setIsEditingProfile] = useState(false);
    const [isSubscriptionOpen, setIsSubscriptionOpen] = useState(false);

    const [dragStartY, setDragStartY] = useState<number | null>(null);
    const [dragOffset, setDragOffset] = useState(0);

    // Instagram connection state
    const [instagramConnected, setInstagramConnected] = useState(restaurantData.integrations.instagram);
    const [instagramUsername, setInstagramUsername] = useState(restaurantData.instagramConnection?.username || '');
    const [instagramLoading, setInstagramLoading] = useState(false);
    const [instagramError, setInstagramError] = useState<{ type: InstagramConnectionError; message: string } | null>(null);
    const [showInstagramErrorModal, setShowInstagramErrorModal] = useState(false);
    const [showAccountPicker, setShowAccountPicker] = useState(false);
    const [pendingAccounts, setPendingAccounts] = useState<InstagramAccount[]>([]);
    const [pendingSelectionId, setPendingSelectionId] = useState<string | null>(null);

    // Setup guide state - simplified to informational only
    const [showSetupGuide, setShowSetupGuide] = useState(false);

    // Subscription state (fetched from API)
    const [subscription, setSubscription] = useState<Subscription | null>(null);
    const [usage, setUsage] = useState<PlanUsage | null>(null);
    const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
    const [creditPacks, setCreditPacks] = useState<CreditPack[]>([]);
    const [billingCycle, setBillingCycle] = useState<BillingCycle>('MONTHLY');
    const [couponCode, setCouponCode] = useState('');
    const [couponValid, setCouponValid] = useState<boolean | null>(null);
    const [subscriptionLoading, setSubscriptionLoading] = useState(true);
    const [invoices, setInvoices] = useState<Invoice[]>([]);

    // Load subscription data on mount
    useEffect(() => {
        const loadSubscription = async () => {
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
        loadSubscription();
    }, []);

    // Sync Instagram state when restaurantData prop changes (e.g., after refresh)
    useEffect(() => {
        setInstagramConnected(restaurantData.integrations.instagram);
        setInstagramUsername(restaurantData.instagramConnection?.username || '');
    }, [restaurantData.integrations.instagram, restaurantData.instagramConnection?.username]);

    // Listen for OAuth popup messages
    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            if (event.origin !== window.location.origin) return;

            if (event.data?.type === 'instagram-oauth-callback') {
                setInstagramLoading(false);

                if (event.data.success) {
                    setInstagramConnected(true);
                    setInstagramUsername(event.data.username || '');
                    setInstagramError(null);
                    // Refresh restaurant data
                    refreshRestaurantData();
                } else if (event.data.error) {
                    setInstagramError({
                        type: event.data.error,
                        message: event.data.errorMessage || 'Connection failed'
                    });
                    setShowInstagramErrorModal(true);
                }
            } else if (event.data?.type === 'instagram-oauth-retry') {
                // User wants to retry from popup
                handleInstagramConnect();
            }
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, [restaurantData.id]);

    // Refresh restaurant data after connection changes
    const refreshRestaurantData = async () => {
        try {
            const updated = await restaurantAPI.get(restaurantData.id);
            if (onRestaurantUpdate) {
                onRestaurantUpdate(updated);
            }
        } catch (err) {
            console.error('Failed to refresh restaurant data:', err);
        }
    };

    // Handle Instagram connect button click
    const handleInstagramConnect = async () => {
        if (instagramConnected) {
            // Disconnect flow
            if (confirm('Are you sure you want to disconnect Instagram?')) {
                setInstagramLoading(true);
                try {
                    await instagramAPI.disconnect(restaurantData.id);
                    setInstagramConnected(false);
                    setInstagramUsername('');
                    refreshRestaurantData();
                } catch (err) {
                    console.error('Disconnect error:', err);
                    alert('Failed to disconnect. Please try again.');
                } finally {
                    setInstagramLoading(false);
                }
            }
            return;
        }

        // Show setup guide first
        setShowSetupGuide(true);
        window.history.pushState({ modal: 'setupGuide' }, '', '#setup-guide');
    };

    // Actually start the OAuth flow after user confirms setup
    // useOnboarding: true for guided setup (new users), false for standard OAuth (existing setup)
    const startInstagramOAuth = async (useOnboarding: boolean = false) => {
        setShowSetupGuide(false);
        setInstagramLoading(true);
        setInstagramError(null);

        try {
            const { oauthUrl } = await instagramAPI.getOAuthUrl(restaurantData.id, useOnboarding);

            // Open OAuth popup
            const width = 600;
            const height = 700;
            const left = window.screenX + (window.outerWidth - width) / 2;
            const top = window.screenY + (window.outerHeight - height) / 2;

            const popup = window.open(
                oauthUrl,
                'instagram-oauth',
                `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no,scrollbars=yes`
            );

            // Check if popup was blocked
            if (!popup || popup.closed || typeof popup.closed === 'undefined') {
                setInstagramLoading(false);
                setInstagramError({
                    type: 'API_ERROR',
                    message: 'Popup was blocked. Please allow popups and try again.'
                });
                setShowInstagramErrorModal(true);

                // Fallback to redirect
                if (confirm('Popup was blocked. Would you like to continue in this window instead?')) {
                    window.location.href = oauthUrl;
                }
                return;
            }

            // Monitor popup for close
            const checkPopup = setInterval(() => {
                if (popup.closed) {
                    clearInterval(checkPopup);
                    // If still loading, user closed popup without completing
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

    // Handle account selection when multiple accounts are available
    const handleSelectAccount = async (account: InstagramAccount) => {
        if (!pendingSelectionId) return;

        setInstagramLoading(true);
        setShowAccountPicker(false);

        try {
            const result = await instagramAPI.selectAccount(pendingSelectionId, account.id, restaurantData.id);
            setInstagramConnected(true);
            setInstagramUsername(result.username);
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

    // History Handling for Modals
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
            if (showInstagramErrorModal) {
                setShowInstagramErrorModal(false);
            }
            if (showAccountPicker) {
                setShowAccountPicker(false);
            }
            if (showSetupGuide) {
                setShowSetupGuide(false);
            }
        };
        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, [isEditingProfile, isSubscriptionOpen, showInstagramErrorModal, showAccountPicker, showSetupGuide]);

    const openEditProfile = () => {
        setIsEditingProfile(true);
        window.history.pushState({ modal: 'editProfile' }, '', '#edit-profile');
    };

    const closeEditProfile = () => {
        setDragOffset(0);
        window.history.back();
    };

    const openSubscription = () => {
        setIsSubscriptionOpen(true);
        window.history.pushState({ modal: 'subscription' }, '', '#subscription');
    };

    const closeSubscription = () => {
        setDragOffset(0);
        window.history.back();
    };

    // Instagram Setup Guide Modal - Offers two connection options
    const InstagramSetupGuide = () => {
        if (!showSetupGuide) return null;

        return (
            <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in">
                <div className="absolute inset-0" onClick={() => { setShowSetupGuide(false); window.history.back(); }}></div>
                <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl animate-in slide-in-from-bottom duration-300 relative z-10 max-h-[90vh] overflow-y-auto">
                    {/* Drag Handle for mobile */}
                    <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-4 sm:hidden"></div>

                    {/* Header */}
                    <div className="flex items-center gap-4 mb-6">
                        <div className="w-14 h-14 bg-gradient-to-br from-purple-500 via-pink-500 to-orange-500 rounded-2xl flex items-center justify-center">
                            <InstagramIcon size={28} className="text-white" />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-slate-800">Connect Instagram</h3>
                            <p className="text-sm text-slate-500">Choose your setup method</p>
                        </div>
                    </div>

                    {/* Option 1: Already Have Everything Set Up */}
                    <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-4">
                        <div className="flex items-start gap-3">
                            <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                                <span className="text-white font-bold text-sm">1</span>
                            </div>
                            <div className="flex-1">
                                <p className="font-semibold text-green-800 mb-1">I already have everything set up</p>
                                <p className="text-xs text-green-700 mb-3">
                                    Use this if you have a Facebook Page with Instagram Professional account already linked.
                                </p>
                                <button
                                    onClick={() => {
                                        window.history.back();
                                        startInstagramOAuth(false); // Standard OAuth
                                    }}
                                    className="w-full px-4 py-2.5 rounded-xl font-medium flex items-center justify-center gap-2 bg-green-600 text-white hover:bg-green-700 text-sm"
                                >
                                    <FacebookIcon size={16} />
                                    Connect with Facebook
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Option 2: Need Guided Setup */}
                    <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 mb-5">
                        <div className="flex items-start gap-3">
                            <div className="w-8 h-8 bg-purple-500 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                                <span className="text-white font-bold text-sm">2</span>
                            </div>
                            <div className="flex-1">
                                <p className="font-semibold text-purple-800 mb-1">I need help setting up</p>
                                <p className="text-xs text-purple-700 mb-3">
                                    Use this for a guided setup that helps you create a Page and link Instagram.
                                </p>
                                <button
                                    onClick={() => {
                                        window.history.back();
                                        startInstagramOAuth(true); // IG_API_ONBOARDING
                                    }}
                                    className="w-full px-4 py-2.5 rounded-xl font-medium flex items-center justify-center gap-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:opacity-90 text-sm"
                                >
                                    <InstagramIcon size={16} />
                                    Guided Setup
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Help Links */}
                    <div className="border-t border-slate-100 pt-4 mb-4">
                        <p className="text-xs text-slate-500 mb-2">Need to set things up manually first?</p>
                        <div className="flex flex-wrap gap-2">
                            <a
                                href="https://www.facebook.com/pages/create"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs px-3 py-1.5 bg-blue-50 text-blue-600 rounded-full hover:bg-blue-100 transition-colors"
                            >
                                Create Facebook Page
                            </a>
                            <a
                                href="https://help.instagram.com/502981923235522"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs px-3 py-1.5 bg-pink-50 text-pink-600 rounded-full hover:bg-pink-100 transition-colors"
                            >
                                Switch to Professional
                            </a>
                            <a
                                href="https://www.facebook.com/help/1148909221857370"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs px-3 py-1.5 bg-purple-50 text-purple-600 rounded-full hover:bg-purple-100 transition-colors"
                            >
                                Link Instagram to Page
                            </a>
                        </div>
                    </div>

                    {/* Cancel button */}
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

    // Instagram Error Modal with enhanced help
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

                    {/* Help link for specific errors */}
                    {errorInfo.helpUrl && (
                        <a
                            href={errorInfo.helpUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-center gap-2 text-pink-600 hover:text-pink-700 text-sm font-medium mb-4 p-3 bg-pink-50 rounded-xl"
                        >
                            <ExternalLink size={14} />
                            {errorInfo.helpLabel || 'Get Help'}
                        </a>
                    )}

                    <div className="flex gap-3">
                        <button
                            onClick={() => setShowInstagramErrorModal(false)}
                            className="flex-1 px-4 py-2.5 bg-slate-100 text-slate-700 rounded-xl font-medium hover:bg-slate-200"
                        >
                            Close
                        </button>
                        <button
                            onClick={() => {
                                setShowInstagramErrorModal(false);
                                startInstagramOAuth();
                            }}
                            className="flex-1 px-4 py-2.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium hover:opacity-90"
                        >
                            Try Again
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    // Account Picker Modal (for multiple Instagram accounts)
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
                            <button
                                key={account.id}
                                onClick={() => handleSelectAccount(account)}
                                className="w-full p-4 border border-slate-200 rounded-xl hover:border-pink-300 hover:bg-pink-50 transition-all flex items-center gap-4"
                            >
                                {account.profilePictureUrl ? (
                                    <img
                                        src={account.profilePictureUrl}
                                        alt={account.username}
                                        className="w-12 h-12 rounded-full"
                                    />
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

                    <button
                        onClick={() => setShowAccountPicker(false)}
                        className="w-full mt-4 px-4 py-2.5 bg-slate-100 text-slate-700 rounded-xl font-medium hover:bg-slate-200"
                    >
                        Cancel
                    </button>
                </div>
            </div>
        );
    };

    const handleSwitchPlan = async (planSlug: string) => {
        try {
            // If upgrading from an active subscription, cancel first
            if (subscription?.status === 'ACTIVE' || subscription?.status === 'PAST_DUE') {
                await subscriptionAPI.upgrade();
            }

            const data = await subscriptionAPI.subscribe(planSlug, billingCycle, couponCode || undefined);

            // Open Razorpay checkout
            const options = {
                key: data.keyId,
                subscription_id: data.subscriptionId,
                name: 'RestroPulse',
                description: `${planSlug} plan - ${billingCycle.toLowerCase()}`,
                handler: async () => {
                    // Refresh subscription data after successful payment
                    const currentData = await subscriptionAPI.getCurrent();
                    setSubscription(currentData.subscription);
                    setUsage(currentData.usage);
                    closeSubscription();
                },
            };

            const rzp = new (window as any).Razorpay(options);
            rzp.open();
        } catch (error) {
            console.error('Subscription failed:', error);
            alert('Failed to start subscription. Please try again.');
        }
    };

    const handlePurchaseCredits = async (packId: string) => {
        try {
            const data = await subscriptionAPI.purchaseCredits(packId);

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
                    // Refresh subscription data
                    const currentData = await subscriptionAPI.getCurrent();
                    setSubscription(currentData.subscription);
                    setUsage(currentData.usage);
                },
            };

            const rzp = new (window as any).Razorpay(options);
            rzp.open();
        } catch (error) {
            console.error('Credit purchase failed:', error);
            alert('Failed to start credit purchase. Please try again.');
        }
    };

    const handleValidateCoupon = async () => {
        if (!couponCode) return;
        try {
            const result = await couponAPI.validate(couponCode);
            setCouponValid(result.valid);
        } catch {
            setCouponValid(false);
        }
    };

    const EditProfileModal = () => {
        const [editName, setEditName] = useState(restaurantData.name);
        const [editCuisine, setEditCuisine] = useState(restaurantData.cuisine);
        const [editAddress, setEditAddress] = useState(restaurantData.location.address);
        const [editCoordinates, setEditCoordinates] = useState<[number, number]>(
            restaurantData.location.coordinates || [0, 0]
        );
        const googleMapsApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

        const handleSave = () => {
            if (onRestaurantUpdate) {
                onRestaurantUpdate({
                    ...restaurantData,
                    name: editName,
                    cuisine: editCuisine,
                    location: {
                        ...restaurantData.location,
                        address: editAddress,
                        coordinates: editCoordinates
                    }
                });
            }
            closeEditProfile();
        };

        return (
            <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in">
                {/* Click outside */}
                <div className="absolute inset-0" onClick={closeEditProfile}></div>

                <div
                    className="bg-white w-full max-w-sm rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl animate-in slide-in-from-bottom duration-300 relative z-10"
                    style={{ transform: `translateY(${Math.max(0, dragOffset)}px)` }}
                    onTouchStart={(e) => {
                        setDragStartY(e.touches[0].clientY);
                    }}
                    onTouchMove={(e) => {
                        if (dragStartY !== null) {
                            const offset = e.touches[0].clientY - dragStartY;
                            setDragOffset(offset);
                        }
                    }}
                    onTouchEnd={() => {
                        if (dragOffset > 100) {
                            closeEditProfile();
                        } else {
                            setDragOffset(0);
                        }
                        setDragStartY(null);
                    }}
                >
                    {/* Drag Handle */}
                    <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-6 shrink-0 sm:hidden"></div>

                    <div className="space-y-5">
                        <div>
                            <label className="block text-slate-600 text-sm font-medium mb-1.5">Restaurant name</label>
                            <input
                                type="text"
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                aria-label="Restaurant Name"
                                className="w-full bg-white text-slate-900 px-4 py-3 rounded-xl border border-slate-200 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 placeholder:text-slate-400"
                            />
                        </div>
                        <div>
                            <label className="block text-slate-600 text-sm font-medium mb-1.5">Cuisine</label>
                            <input
                                type="text"
                                value={editCuisine}
                                onChange={(e) => setEditCuisine(e.target.value)}
                                aria-label="Cuisine"
                                className="w-full bg-white text-slate-900 px-4 py-3 rounded-xl border border-slate-200 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 placeholder:text-slate-400"
                            />
                        </div>
                        <div>
                            <label className="block text-slate-600 text-sm font-medium mb-1.5">Location</label>
                            {googleMapsApiKey ? (
                                <APIProvider apiKey={googleMapsApiKey}>
                                    <PlacesAutocompleteInput
                                        theme="light"
                                        initialValue={editAddress}
                                        onSelect={(place) => {
                                            setEditAddress(place.address);
                                            setEditCoordinates([place.lng, place.lat]);
                                        }}
                                        placeholder="Enter restaurant location"
                                    />
                                    {editCoordinates && (editCoordinates[0] !== 0 || editCoordinates[1] !== 0) && (
                                        <div className="mt-4 rounded-xl overflow-hidden border border-slate-200 map-container">
                                            <Map
                                                style={{ width: '100%', height: '12rem' }}
                                                defaultCenter={{ lat: editCoordinates[1], lng: editCoordinates[0] }}
                                                center={{ lat: editCoordinates[1], lng: editCoordinates[0] }}
                                                zoom={16}
                                                disableDefaultUI
                                                mapId="settings-map"
                                            >
                                                <AdvancedMarker position={{ lat: editCoordinates[1], lng: editCoordinates[0] }} />
                                            </Map>
                                        </div>
                                    )}
                                </APIProvider>
                            ) : (
                                <input
                                    type="text"
                                    value={editAddress}
                                    onChange={(e) => setEditAddress(e.target.value)}
                                    aria-label="Location"
                                    className="w-full bg-white text-slate-900 px-4 py-3 rounded-xl border border-slate-200 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 placeholder:text-slate-400"
                                />
                            )}
                        </div>

                        <div className="pt-2">
                            <button onClick={handleSave} className="w-full bg-slate-900 text-white py-3.5 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-slate-800 transition-colors shadow-sm">
                                <Save size={18} /> Save Changes
                            </button>
                            <button
                                onClick={closeEditProfile}
                                className="w-full bg-transparent text-slate-600 hover:text-slate-900 py-3 rounded-xl font-bold mt-2 hover:bg-slate-50 transition-colors"
                            >
                                Cancel
                            </button>
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
        const modalRef = React.useRef<HTMLDivElement>(null);

        const handleDragStart = (e: React.TouchEvent) => {
            setDragStartY(e.touches[0].clientY);
        };

        const handleDragMove = (e: React.TouchEvent) => {
            if (dragStartY !== null) {
                const offset = e.touches[0].clientY - dragStartY;
                const scrollTop = modalRef.current?.scrollTop || 0;

                if (offset > 0 && scrollTop === 0) {
                    e.preventDefault();
                    setDragOffset(offset);
                } else if (offset < 0) {
                    setDragOffset(0);
                }
            }
        };

        const handleDragEnd = () => {
            if (dragOffset > 100) {
                closeSubscription();
            } else {
                setDragOffset(0);
            }
            setDragStartY(null);
        };

        return (
            <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in">
                <div className="absolute inset-0" onClick={closeSubscription}></div>

                <div
                    ref={modalRef}
                    className="bg-white w-full max-w-lg rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl animate-in slide-in-from-bottom duration-300 max-h-[90vh] overflow-y-auto no-scrollbar relative z-10"
                    style={{ transform: `translateY(${Math.max(0, dragOffset)}px)` }}
                    onTouchStart={handleDragStart}
                    onTouchMove={handleDragMove}
                    onTouchEnd={handleDragEnd}
                >
                    <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-6 shrink-0 sm:hidden"></div>

                    <div className="flex justify-between items-center mb-6">
                        <div>
                            <h3 className="text-xl font-bold text-slate-800">Subscription</h3>
                            <p className="text-sm text-slate-500">Manage your plan</p>
                        </div>
                    </div>

                    {/* Current Plan Status */}
                    <div className="bg-gradient-to-r from-slate-900 to-slate-800 rounded-2xl p-5 text-white mb-6 shadow-lg">
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <p className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-1">Current Plan</p>
                                <h4 className="text-2xl font-bold flex items-center gap-2">
                                    {subscription?.planSnapshot?.name || 'No Plan'}
                                    {subscription?.status === 'ACTIVE' && <span className="px-2 py-0.5 bg-white/20 text-xs rounded-md font-medium">Active</span>}
                                    {subscription?.status === 'NONE' && <span className="px-2 py-0.5 bg-yellow-500/30 text-xs rounded-md font-medium">Free Credits</span>}
                                </h4>
                            </div>
                            <div className="w-10 h-10 rounded-full flex items-center justify-center bg-white/10">
                                {CurrentIcon && <CurrentIcon size={20} />}
                            </div>
                        </div>
                        <div className="flex items-center justify-between text-sm border-t border-white/10 pt-4">
                            <span className="text-slate-300">Credits: {subscription?.credits ?? 0}</span>
                            {subscription?.currentPeriodEnd && (
                                <span className="font-bold">Renews {new Date(subscription.currentPeriodEnd).toLocaleDateString()}</span>
                            )}
                        </div>
                    </div>

                    {/* Weekly Usage */}
                    {usage && (
                        <div className="mb-6 space-y-2">
                            <h4 className="font-bold text-slate-800 mb-2 text-sm">Weekly Usage</h4>
                            <div className="grid grid-cols-3 gap-2">
                                <div className="bg-slate-50 rounded-xl p-3 text-center">
                                    <p className="text-xs text-slate-500">Reels</p>
                                    <p className="text-lg font-bold text-slate-800">{usage.reels.used}<span className="text-sm text-slate-400">/{usage.reels.limit}</span></p>
                                </div>
                                <div className="bg-slate-50 rounded-xl p-3 text-center">
                                    <p className="text-xs text-slate-500">Posts</p>
                                    <p className="text-lg font-bold text-slate-800">{usage.instagramPosts.used}<span className="text-sm text-slate-400">/{usage.instagramPosts.limit}</span></p>
                                </div>
                                <div className="bg-slate-50 rounded-xl p-3 text-center">
                                    <p className="text-xs text-slate-500">Carousels</p>
                                    <p className="text-lg font-bold text-slate-800">{usage.carousels.used}<span className="text-sm text-slate-400">/{usage.carousels.limit}</span></p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Billing Cycle Toggle */}
                    <div className="flex items-center justify-center gap-2 mb-4">
                        <button
                            onClick={() => setBillingCycle('MONTHLY')}
                            className={`px-4 py-2 text-xs font-bold rounded-xl transition-colors ${billingCycle === 'MONTHLY' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}
                        >
                            Monthly
                        </button>
                        <button
                            onClick={() => setBillingCycle('ANNUAL')}
                            className={`px-4 py-2 text-xs font-bold rounded-xl transition-colors ${billingCycle === 'ANNUAL' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}
                        >
                            Annual (2 months free)
                        </button>
                    </div>

                    <h4 className="font-bold text-slate-800 mb-4">Available Plans</h4>
                    <div className="space-y-3">
                        {plans.map((plan) => {
                            const meta = TIER_ICONS[plan.tier] || TIER_ICONS.STARTER;
                            const PlanIcon = meta.icon;
                            const price = billingCycle === 'MONTHLY' ? plan.pricing.monthly : plan.pricing.annual;
                            const priceLabel = billingCycle === 'MONTHLY'
                                ? `${formatPaise(price)}/mo`
                                : `${formatPaise(price)}/yr`;
                            const isCurrentPlan = subscription?.planSnapshot?.slug === plan.slug && (subscription?.status === 'ACTIVE' || subscription?.status === 'PAST_DUE');

                            return (
                                <div key={plan.id} className={`border rounded-2xl p-4 transition-all ${isCurrentPlan ? 'border-orange-500 bg-orange-50 ring-1 ring-orange-500' : 'border-slate-200'}`}>
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
                                        ) : (
                                            <button
                                                onClick={() => handleSwitchPlan(plan.slug)}
                                                className="px-4 py-2 bg-slate-900 text-white text-xs font-bold rounded-xl hover:bg-slate-800"
                                            >
                                                {subscription?.status === 'ACTIVE' ? 'Switch' : 'Subscribe'}
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
                    <div className="mt-6">
                        <h4 className="font-bold text-slate-800 mb-2 text-sm">Coupon Code</h4>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={couponCode}
                                onChange={(e) => { setCouponCode(e.target.value.toUpperCase()); setCouponValid(null); }}
                                placeholder="Enter coupon code"
                                className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm"
                            />
                            <button
                                onClick={handleValidateCoupon}
                                className="px-4 py-2 bg-slate-900 text-white text-xs font-bold rounded-xl hover:bg-slate-800"
                            >
                                Apply
                            </button>
                        </div>
                        {couponValid === true && <p className="text-xs text-green-600 mt-1">Coupon applied!</p>}
                        {couponValid === false && <p className="text-xs text-red-500 mt-1">Invalid coupon code</p>}
                    </div>

                    {/* Credit Packs */}
                    {creditPacks.length > 0 && (
                        <div className="mt-6">
                            <h4 className="font-bold text-slate-800 mb-3 text-sm">Buy Credits</h4>
                            <div className="grid grid-cols-3 gap-2">
                                {creditPacks.map((pack) => (
                                    <button
                                        key={pack.id}
                                        onClick={() => handlePurchaseCredits(pack.id)}
                                        className="border border-slate-200 rounded-xl p-3 text-center hover:border-orange-300 hover:bg-orange-50 transition-colors"
                                    >
                                        <p className="text-sm font-bold text-slate-800">{pack.credits}</p>
                                        <p className="text-[10px] text-slate-500">credits</p>
                                        <p className="text-xs font-bold text-orange-600 mt-1">{formatPaise(pack.priceInPaise)}</p>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="mt-6 text-center">
                        <p className="text-xs text-slate-400">Payments are processed securely via Razorpay.</p>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="p-4 space-y-8">
            {isEditingProfile && <EditProfileModal />}
            {isSubscriptionOpen && <SubscriptionModal />}
            {showInstagramErrorModal && <InstagramErrorModal />}
            {showAccountPicker && <AccountPickerModal />}
            {showSetupGuide && <InstagramSetupGuide />}

            {/* Profile Header */}
            <div className="flex flex-col items-center text-center">
                <div className="relative">
                    <img src="https://picsum.photos/80/80" alt="Restaurant Logo" className="w-24 h-24 rounded-full object-cover border-4 border-white shadow-md mb-3" />
                    <button
                        onClick={openEditProfile}
                        aria-label="Edit profile"
                        title="Edit profile"
                        className="absolute bottom-2 right-0 bg-slate-800 text-white p-2 rounded-full shadow-sm hover:bg-slate-700"
                    >
                        <Edit3 size={14} />
                    </button>
                </div>
                <h2 className="text-2xl font-bold text-slate-800">{restaurantData.name}</h2>
                <p className="text-slate-500 font-medium">{restaurantData.cuisine}</p>
                <div className="flex items-center gap-1 text-slate-400 text-sm mt-1">
                    <MapPin size={14} />
                    <span className="truncate max-w-[200px]">{restaurantData.location.address}</span>
                </div>
            </div>

            {/* Integrations */}
            <div>
                <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3 px-1">Integrations</h3>
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden divide-y divide-slate-50">
                    {/* Instagram */}
                    <div className="p-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${instagramConnected
                                ? 'bg-gradient-to-br from-purple-500 via-pink-500 to-orange-500'
                                : 'bg-pink-100'
                                }`}>
                                <InstagramIcon size={20} className={instagramConnected ? 'text-white' : 'text-pink-600'} />
                            </div>
                            <div>
                                <p className="font-bold text-slate-800 text-sm">Instagram</p>
                                <p className="text-xs text-slate-500">
                                    {instagramConnected
                                        ? `@${instagramUsername}`
                                        : 'Connect your business account'}
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            {/* Help button - only show when not connected */}
                            {!instagramConnected && !instagramLoading && (
                                <button
                                    onClick={() => {
                                        setShowSetupGuide(true);
                                        window.history.pushState({ modal: 'setupGuide' }, '', '#setup-guide');
                                    }}
                                    className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700 flex items-center justify-center transition-colors"
                                    title="View setup guide"
                                >
                                    <HelpCircle size={16} />
                                </button>
                            )}
                            <button
                                onClick={handleInstagramConnect}
                                disabled={instagramLoading}
                                className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-2 ${instagramLoading
                                    ? 'bg-slate-100 text-slate-400 cursor-wait'
                                    : instagramConnected
                                        ? 'bg-green-100 text-green-700 hover:bg-red-100 hover:text-red-700'
                                        : 'bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:opacity-90'
                                    }`}
                            >
                                {instagramLoading ? (
                                    <>
                                        <Loader2 size={12} className="animate-spin" />
                                        <span>Connecting...</span>
                                    </>
                                ) : instagramConnected ? (
                                    'Connected'
                                ) : (
                                    'Connect'
                                )}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Instagram connection status details */}
                {instagramConnected && restaurantData.instagramConnection && (
                    <div className="mt-2 px-4 py-3 bg-slate-50 rounded-xl">
                        <div className="flex items-center justify-between text-xs">
                            <span className="text-slate-500">Connected via {restaurantData.instagramConnection.pageName}</span>
                            {restaurantData.instagramConnection.tokenStatus === 'expiring_soon' && (
                                <span className="text-orange-600 font-medium">Token expiring soon</span>
                            )}
                            {restaurantData.instagramConnection.needsReauthorization && (
                                <button
                                    onClick={handleInstagramConnect}
                                    className="text-pink-600 font-medium hover:text-pink-700"
                                >
                                    Reauthorize
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Account Manager */}
            <div>
                <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3 px-1">Your Team</h3>
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
                </div>
            </div>

            {/* Billing History */}
            {invoices.length > 0 && (
                <div>
                    <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3 px-1">Billing History</h3>
                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden divide-y divide-slate-50">
                        {invoices.slice(0, 10).map((invoice) => (
                            <div key={invoice.id} className="p-4 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${invoice.type === 'SUBSCRIPTION' ? 'bg-blue-100 text-blue-600' : 'bg-green-100 text-green-600'}`}>
                                        <FileText size={18} />
                                    </div>
                                    <div>
                                        <p className="text-sm font-bold text-slate-700">{invoice.description}</p>
                                        <p className="text-xs text-slate-500">
                                            {new Date(invoice.paidAt || invoice.createdAt || '').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                                            {' -- '}
                                            {formatPaise(invoice.amountPaise)}
                                        </p>
                                    </div>
                                </div>
                                {invoice.pdfUrl && (
                                    <a
                                        href={invoice.pdfUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="w-9 h-9 bg-slate-100 text-slate-500 hover:text-slate-700 rounded-lg flex items-center justify-center"
                                        title="Download Invoice"
                                    >
                                        <Download size={16} />
                                    </a>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Subscription & Account Actions */}
            <div>
                <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3 px-1">Account</h3>
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden divide-y divide-slate-50">
                    <button
                        onClick={openSubscription}
                        className="w-full p-4 flex items-center justify-between hover:bg-slate-50 transition-colors group"
                    >
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 bg-orange-100 text-orange-600 rounded-lg flex items-center justify-center">
                                <CreditCard size={18} />
                            </div>
                            <div className="text-left">
                                <p className="text-sm font-bold text-slate-700">Subscription</p>
                                <p className="text-xs text-slate-500 font-medium">{subscription?.planSnapshot?.name || 'No Plan'} {subscription?.credits ? `(${subscription.credits} credits)` : ''}</p>
                            </div>
                        </div>
                        <ChevronRight size={18} className="text-slate-300 group-hover:text-slate-400" />
                    </button>

                    <button onClick={onLogout} className="w-full p-4 flex items-center gap-3 text-left hover:bg-slate-50">
                        <div className="w-9 h-9 bg-slate-100 text-slate-500 rounded-lg flex items-center justify-center">
                            <LogOut size={18} />
                        </div>
                        <span className="text-sm font-medium text-slate-700">Log Out</span>
                    </button>
                    <button onClick={() => alert("Delete account?")} className="w-full p-4 flex items-center gap-3 text-left hover:bg-red-50 group">
                        <div className="w-9 h-9 bg-red-50 text-red-400 group-hover:text-red-500 rounded-lg flex items-center justify-center">
                            <Trash2 size={18} />
                        </div>
                        <span className="text-sm font-medium text-red-500 group-hover:text-red-600">Delete Account</span>
                    </button>
                </div>
            </div>

            <div className="h-10"></div>
        </div>
    );
};

export default Settings;
