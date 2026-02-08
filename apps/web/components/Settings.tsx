import React, { useState, useEffect } from 'react';
import { CreditCard, LogOut, Trash2, MapPin, Instagram, Edit3, X, Save, CheckCircle2, Star, Zap, Crown, ChevronRight, Loader2, AlertCircle, ExternalLink, HelpCircle, Facebook } from 'lucide-react';
import { SubscriptionTier, Restaurant, InstagramConnectionError, InstagramAccount } from '../types';
import { instagramAPI, restaurantAPI } from '../api';

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

const SUBSCRIPTION_PLANS: { id: SubscriptionTier; name: string; price: string; features: string[]; icon: any; color: string }[] = [
    {
        id: 'BASIC',
        name: 'Basic',
        price: '₹2,999/mo',
        features: ['4 Posts/Week', 'Basic Analytics', 'Email Support', '1 User'],
        icon: Zap,
        color: 'bg-slate-500'
    },
    {
        id: 'GOLD',
        name: 'Gold',
        price: '₹5,999/mo',
        features: ['Daily Posts', 'Advanced Analytics', 'Priority Support', 'Reels Creation', '3 Users'],
        icon: Star,
        color: 'bg-orange-500'
    },
    {
        id: 'PLATINUM',
        name: 'Platinum',
        price: '₹9,999/mo',
        features: ['Dedicated Account Manager', 'On-site Shoots', 'Custom Strategy', '24/7 Support', 'Unlimited Users'],
        icon: Crown,
        color: 'bg-indigo-600'
    }
];

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

    const [subscription, setSubscription] = useState(restaurantData.subscription);

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
                            <Instagram size={28} className="text-white" />
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
                                    <Facebook size={16} />
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
                                    <Instagram size={16} />
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
                        <Instagram size={28} className="text-white" />
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
                                        <Instagram size={20} className="text-white" />
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

    const handleSwitchPlan = (tier: SubscriptionTier) => {
        // Simulate API call
        setSubscription(prev => ({
            ...prev,
            tier: tier,
            status: 'ACTIVE'
        }));
        alert(`Switched to ${tier} plan successfully!`);
        closeSubscription();
    };

    const EditProfileModal = () => (
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

                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-lg font-bold text-slate-800">Edit Profile</h3>
                </div>
                <div className="space-y-4">
                    <div>
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Restaurant Name</label>
                        <input type="text" defaultValue={restaurantData.name} className="w-full border-b border-slate-200 py-2 text-slate-800 focus:border-orange-500 outline-none" />
                    </div>
                    <div>
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Cuisine</label>
                        <input type="text" defaultValue={restaurantData.cuisine} className="w-full border-b border-slate-200 py-2 text-slate-800 focus:border-orange-500 outline-none" />
                    </div>
                    <div>
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Location</label>
                        <input type="text" defaultValue={restaurantData.location.address} className="w-full border-b border-slate-200 py-2 text-slate-800 focus:border-orange-500 outline-none" />
                    </div>
                    <button onClick={closeEditProfile} className="w-full bg-slate-900 text-white py-3 rounded-xl font-bold mt-4 flex items-center justify-center gap-2">
                        <Save size={18} /> Save Changes
                    </button>
                </div>
            </div>
        </div>
    );

    const SubscriptionModal = () => {
        const currentPlan = SUBSCRIPTION_PLANS.find(p => p.id === subscription.tier);
        const modalRef = React.useRef<HTMLDivElement>(null);

        const handleDragStart = (e: React.TouchEvent) => {
            setDragStartY(e.touches[0].clientY);
        };

        const handleDragMove = (e: React.TouchEvent) => {
            if (dragStartY !== null) {
                const offset = e.touches[0].clientY - dragStartY;
                const scrollTop = modalRef.current?.scrollTop || 0;

                // Only allow dragging down when at the top of scroll
                if (offset > 0 && scrollTop === 0) {
                    e.preventDefault();
                    setDragOffset(offset);
                } else if (offset < 0) {
                    // Allow scrolling up normally
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
                {/* Click outside */}
                <div className="absolute inset-0" onClick={closeSubscription}></div>

                <div
                    ref={modalRef}
                    className="bg-white w-full max-w-lg rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl animate-in slide-in-from-bottom duration-300 max-h-[90vh] overflow-y-auto no-scrollbar relative z-10"
                    style={{ transform: `translateY(${Math.max(0, dragOffset)}px)` }}
                    onTouchStart={handleDragStart}
                    onTouchMove={handleDragMove}
                    onTouchEnd={handleDragEnd}
                >
                    {/* Drag Handle */}
                    <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-6 shrink-0 sm:hidden"></div>

                    <div className="flex justify-between items-center mb-6">
                        <div>
                            <h3 className="text-xl font-bold text-slate-800">Subscription</h3>
                            <p className="text-sm text-slate-500">Manage your plan</p>
                        </div>
                    </div>

                    {/* Current Plan Status */}
                    <div className="bg-gradient-to-r from-slate-900 to-slate-800 rounded-2xl p-5 text-white mb-8 shadow-lg">
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <p className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-1">Current Plan</p>
                                <h4 className="text-2xl font-bold flex items-center gap-2">
                                    {currentPlan?.name} <span className="px-2 py-0.5 bg-white/20 text-xs rounded-md font-medium">Active</span>
                                </h4>
                            </div>
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center bg-white/10`}>
                                {currentPlan && <currentPlan.icon size={20} />}
                            </div>
                        </div>
                        <div className="flex items-center justify-between text-sm border-t border-white/10 pt-4">
                            <span className="text-slate-300">Renews on {new Date(subscription.renewalDate).toLocaleDateString()}</span>
                            <span className="font-bold">{currentPlan?.price}</span>
                        </div>
                    </div>

                    <h4 className="font-bold text-slate-800 mb-4">Available Plans</h4>
                    <div className="space-y-3">
                        {SUBSCRIPTION_PLANS.map((plan) => (
                            <div key={plan.id} className={`border rounded-2xl p-4 transition-all ${subscription.tier === plan.id ? 'border-orange-500 bg-orange-50 ring-1 ring-orange-500' : 'border-slate-200'}`}>
                                <div className="flex justify-between items-center mb-3">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white ${plan.color}`}>
                                            <plan.icon size={20} />
                                        </div>
                                        <div>
                                            <h5 className="font-bold text-slate-800">{plan.name}</h5>
                                            <p className="text-sm text-slate-500 font-medium">{plan.price}</p>
                                        </div>
                                    </div>
                                    {subscription.tier === plan.id ? (
                                        <CheckCircle2 size={24} className="text-orange-500" />
                                    ) : (
                                        <button
                                            onClick={() => handleSwitchPlan(plan.id)}
                                            className="px-4 py-2 bg-slate-900 text-white text-xs font-bold rounded-xl hover:bg-slate-800"
                                        >
                                            Switch
                                        </button>
                                    )}
                                </div>
                                <ul className="space-y-2 pl-1">
                                    {plan.features.map((feat, i) => (
                                        <li key={i} className="text-xs text-slate-600 flex items-center gap-2">
                                            <div className="w-1 h-1 bg-slate-300 rounded-full"></div> {feat}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </div>

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
                                <Instagram size={20} className={instagramConnected ? 'text-white' : 'text-pink-600'} />
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
                        <img src={restaurantData.accountManager.avatar} alt="AM" className="w-10 h-10 rounded-full" />
                        <div>
                            <p className="font-bold text-slate-800 text-sm">{restaurantData.accountManager.name}</p>
                            <p className="text-xs text-slate-500">Account Manager</p>
                        </div>
                    </div>
                </div>
            </div>

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
                                <p className="text-xs text-slate-500 font-medium">{subscription.tier} Plan</p>
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
