import React, { useState, useEffect } from 'react';
import { CreditCard, LogOut, Trash2, MapPin, Instagram, Edit3, X, Save, Facebook, CheckCircle2, Star, Zap, Crown, ChevronRight } from 'lucide-react';
import { MOCK_RESTAURANT } from '../constants';
import { SubscriptionTier } from '../types';

interface SettingsProps {
    onLogout: () => void;
}

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

const Settings: React.FC<SettingsProps> = ({ onLogout }) => {
    const [isEditingProfile, setIsEditingProfile] = useState(false);
    const [isSubscriptionOpen, setIsSubscriptionOpen] = useState(false);

    const [dragStartY, setDragStartY] = useState<number | null>(null);
    const [dragOffset, setDragOffset] = useState(0);

    // Local state to simulate changes
    const [integrations, setIntegrations] = useState(MOCK_RESTAURANT.integrations);
    const [subscription, setSubscription] = useState(MOCK_RESTAURANT.subscription);

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
        };
        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, [isEditingProfile, isSubscriptionOpen]);

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

    const toggleIntegration = (key: 'instagram') => {
        setIntegrations(prev => ({ ...prev, [key]: !prev[key] }));
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
                        <input type="text" defaultValue={MOCK_RESTAURANT.name} className="w-full border-b border-slate-200 py-2 text-slate-800 focus:border-orange-500 outline-none" />
                    </div>
                    <div>
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Cuisine</label>
                        <input type="text" defaultValue={MOCK_RESTAURANT.cuisine} className="w-full border-b border-slate-200 py-2 text-slate-800 focus:border-orange-500 outline-none" />
                    </div>
                    <div>
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Location</label>
                        <input type="text" defaultValue={MOCK_RESTAURANT.location.address} className="w-full border-b border-slate-200 py-2 text-slate-800 focus:border-orange-500 outline-none" />
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
                <h2 className="text-2xl font-bold text-slate-800">{MOCK_RESTAURANT.name}</h2>
                <p className="text-slate-500 font-medium">{MOCK_RESTAURANT.cuisine}</p>
                <div className="flex items-center gap-1 text-slate-400 text-sm mt-1">
                    <MapPin size={14} />
                    <span className="truncate max-w-[200px]">{MOCK_RESTAURANT.location.address}</span>
                </div>
            </div>

            {/* Integrations */}
            <div>
                <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3 px-1">Integrations</h3>
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden divide-y divide-slate-50">
                    {/* Instagram */}
                    <div className="p-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-pink-100 text-pink-600 rounded-full flex items-center justify-center">
                                <Instagram size={20} />
                            </div>
                            <div>
                                <p className="font-bold text-slate-800 text-sm">Instagram</p>
                                <p className="text-xs text-slate-500">{integrations.instagram ? 'Connected' : 'Not Connected'}</p>
                            </div>
                        </div>
                        <button
                            onClick={() => toggleIntegration('instagram')}
                            className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${integrations.instagram ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'
                                }`}
                        >
                            {integrations.instagram ? 'Connected' : 'Connect'}
                        </button>
                    </div>

                    {/* Facebook (Disabled/Coming Soon) */}
                    <div className="p-4 flex items-center justify-between opacity-60">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center">
                                <Facebook size={20} />
                            </div>
                            <div>
                                <p className="font-bold text-slate-800 text-sm">Facebook</p>
                                <p className="text-xs text-slate-500">Coming Soon</p>
                            </div>
                        </div>
                        <button
                            disabled
                            className="px-4 py-1.5 rounded-full text-xs font-bold bg-slate-50 text-slate-400 cursor-not-allowed border border-slate-100"
                        >
                            Disabled
                        </button>
                    </div>
                </div>
            </div>

            {/* Account Manager */}
            <div>
                <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3 px-1">Your Team</h3>
                <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <img src={MOCK_RESTAURANT.accountManager.avatar} alt="AM" className="w-10 h-10 rounded-full" />
                        <div>
                            <p className="font-bold text-slate-800 text-sm">{MOCK_RESTAURANT.accountManager.name}</p>
                            <p className="text-xs text-slate-500">Account Manager</p>
                        </div>
                    </div>
                    {/* WhatsApp Redirect */}
                    <a
                        href={`https://wa.me/${MOCK_RESTAURANT.accountManager.phone.replace(/[^0-9]/g, '')}?text=Hi%20${MOCK_RESTAURANT.accountManager.name.split(' ')[0]},%20I%20need%20assistance%20with%20my%20account.`}
                        target="_blank"
                        rel="noreferrer"
                        className="w-10 h-10 bg-[#25D366] text-white rounded-full flex items-center justify-center hover:bg-[#20bd5a] shadow-md shadow-green-500/20 active:scale-95 transition-all"
                    >
                        <WhatsAppIcon size={20} />
                    </a>
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