import React, { useState, useEffect } from 'react';
import { TrendingUp, Users, ArrowRight, Bell, Calendar, Eye, Tag, UtensilsCrossed, Lock, Activity, Sparkles, RefreshCw } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { INSIGHT_DATA } from '../constants';
import { ViewState, Restaurant, User, Post } from '../types';
import { authAPI, postsAPI } from '../api';

interface DashboardProps {
    setView?: (view: ViewState) => void;
    restaurantData: Restaurant;
}

const Dashboard: React.FC<DashboardProps> = ({ setView, restaurantData }) => {
    const [user, setUser] = useState<User | null>(null);
    const [posts, setPosts] = useState<Post[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadData = async () => {
            try {
                const [userData, postsData] = await Promise.all([
                    authAPI.checkSession(),
                    postsAPI.getAll()
                ]);
                setUser(userData.user);
                setPosts(postsData);
            } catch (error) {
                console.error('Failed to load dashboard data:', error);
            } finally {
                setLoading(false);
            }
        };
        loadData();
    }, []);

    const pendingCount = posts.filter(p => p.status === 'PENDING_APPROVAL' || p.status === 'CHANGES_REQUESTED').length;
    const nextScheduled = posts.find(p => p.status === 'SCHEDULED');

    const [pullStartY, setPullStartY] = useState<number | null>(null);
    const [pullDistance, setPullDistance] = useState(0);
    const [isRefreshing, setIsRefreshing] = useState(false);

    useEffect(() => {
        const handleTouchStart = (e: TouchEvent) => {
            if (window.scrollY === 0) {
                setPullStartY(e.touches[0].clientY);
            }
        };

        const handleTouchMove = (e: TouchEvent) => {
            if (pullStartY !== null && window.scrollY === 0) {
                const distance = e.touches[0].clientY - pullStartY;
                if (distance > 0) {
                    setPullDistance(Math.min(distance, 100));
                }
            }
        };

        const handleTouchEnd = () => {
            if (pullDistance > 60) {
                setIsRefreshing(true);
                setTimeout(() => {
                    setIsRefreshing(false);
                    setPullDistance(0);
                }, 1500);
            } else {
                setPullDistance(0);
            }
            setPullStartY(null);
        };

        document.addEventListener('touchstart', handleTouchStart, { passive: true });
        document.addEventListener('touchmove', handleTouchMove, { passive: true });
        document.addEventListener('touchend', handleTouchEnd);

        return () => {
            document.removeEventListener('touchstart', handleTouchStart);
            document.removeEventListener('touchmove', handleTouchMove);
            document.removeEventListener('touchend', handleTouchEnd);
        };
    }, [pullStartY, pullDistance]);

    const activeOffers = restaurantData.activeOffers || [];
    const chefSpecials = restaurantData.chefSpecials || [];

    return (
        <div className="p-4 space-y-6 relative">

            {/* Pull-to-Refresh Indicator */}
            {pullDistance > 0 && (
                <div
                    className="absolute top-0 left-0 right-0 flex justify-center transition-opacity z-50"
                    style={{
                        transform: `translateY(${pullDistance - 60}px)`,
                        opacity: Math.min(pullDistance / 60, 1)
                    }}
                >
                    <div className="bg-white rounded-full p-2 shadow-lg">
                        <RefreshCw
                            size={20}
                            className={`text-orange-600 ${isRefreshing ? 'animate-spin' : ''}`}
                            style={{ transform: `rotate(${pullDistance * 3.6}deg)` }}
                        />
                    </div>
                </div>
            )}

            {/* Welcome Header */}
            <div className="flex justify-between items-end mb-2">
                <div>
                    <p className="text-slate-500 text-sm font-medium">Welcome back,</p>
                    <h1 className="text-2xl font-bold text-slate-800">{user?.name.split(' ')[0] || 'User'} 👋</h1>
                </div>
                <div className="bg-white p-2 rounded-full border border-slate-100 shadow-sm relative">
                    <Bell size={20} className="text-slate-600" />
                    {pendingCount > 0 && <span className="absolute top-1 right-2 w-2 h-2 bg-red-500 rounded-full border border-white"></span>}
                </div>
            </div>

            {/* Action Required Banner */}
            {pendingCount > 0 && (
                <button
                    onClick={() => setView && setView('STUDIO')}
                    className="w-full bg-gradient-to-r from-orange-500 to-red-500 rounded-2xl p-4 text-white shadow-lg shadow-orange-500/20 flex items-center justify-between transition-all active:scale-[0.97] active:shadow-xl"
                >
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm">
                            <span className="font-bold text-lg">{pendingCount}</span>
                        </div>
                        <div className="text-left">
                            <p className="font-bold text-sm">Posts Need Review</p>
                            <p className="text-orange-100 text-xs">Review pending content</p>
                        </div>
                    </div>
                    <ArrowRight size={20} className="text-white/80" />
                </button>
            )}

            {/* Up Next (Scheduled) */}
            <div className="space-y-3">
                <h3 className="font-bold text-slate-800 flex items-center gap-2">
                    <Calendar size={18} className="text-orange-500" />
                    Up Next
                </h3>
                {nextScheduled ? (
                    <div
                        onClick={() => setView && setView('STUDIO')}
                        className="bg-white p-3 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4 cursor-pointer active:scale-[0.97] active:shadow-md transition-all hover:border-orange-200"
                    >
                        <img
                            src={nextScheduled.thumbnail}
                            alt="Next Post"
                            className="w-16 h-16 rounded-lg object-cover bg-slate-100 animate-pulse"
                            loading="lazy"
                            onLoad={(e) => e.currentTarget.classList.remove('animate-pulse')}
                        />
                        <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                                <span className="px-2 py-0.5 bg-green-100 text-green-700 text-[10px] font-bold rounded-full">
                                    APPROVED
                                </span>
                                <span className="text-xs text-slate-400 flex items-center gap-1">
                                    {new Date(nextScheduled.scheduledFor!).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' })}
                                </span>
                            </div>
                            <p className="text-sm text-slate-700 line-clamp-1 font-medium">{nextScheduled.caption}</p>
                            <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                                Scheduled for {nextScheduled.platform === 'BOTH' ? 'Instagram & Facebook' : nextScheduled.platform.charAt(0) + nextScheduled.platform.slice(1).toLowerCase()}
                            </p>
                        </div>
                    </div>
                ) : (
                    <div className="bg-slate-50 p-6 rounded-2xl border border-dashed border-slate-200 text-center">
                        <p className="text-slate-400 text-sm">No upcoming posts scheduled.</p>
                    </div>
                )}
            </div>

            {/* Live Context Snapshot */}
            {((activeOffers && activeOffers.length > 0) || (chefSpecials && chefSpecials.length > 0)) && (
                <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl p-5 text-white shadow-md">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="font-bold text-[10px] uppercase tracking-wider text-slate-400">Live on Profile</h3>
                        <button onClick={() => setView && setView('INPUTS')} className="text-xs font-bold text-orange-400 hover:text-orange-300">Edit</button>
                    </div>
                    <div className="space-y-4">
                        {activeOffers.slice(0, 1).map((offer, i) => (
                            <div key={`offer-${i}`} className="flex items-start gap-3">
                                <div className="p-2 bg-white/10 rounded-lg shrink-0 mt-0.5">
                                    <Tag size={16} className="text-purple-400" />
                                </div>
                                <div className="flex-1">
                                    <p className="text-xs text-slate-400 font-bold mb-1">Active Offer</p>
                                    <p className="font-medium text-sm leading-snug">{offer}</p>
                                </div>
                            </div>
                        ))}
                        {chefSpecials.slice(0, 1).map((special, i) => (
                            <div key={`special-${i}`} className="flex items-start gap-3">
                                <div className="p-2 bg-white/10 rounded-lg shrink-0 mt-0.5">
                                    <UtensilsCrossed size={16} className="text-orange-400" />
                                </div>
                                <div className="flex-1">
                                    <p className="text-xs text-slate-400 font-bold mb-1">Chef's Special</p>
                                    <p className="font-medium text-sm leading-snug">{special}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Engagement Pulse (Area Chart) */}
            <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm">
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h3 className="font-bold text-slate-800 flex items-center gap-2">
                            <Activity size={18} className="text-orange-500" />
                            Engagement Pulse
                        </h3>
                        <p className="text-xs text-slate-400">Interactions over last 4 weeks</p>
                    </div>
                    <div className="bg-green-50 text-green-700 px-2 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1">
                        <TrendingUp size={12} /> +12%
                    </div>
                </div>

                <div className="h-40 w-full" style={{ minHeight: '160px' }}>
                    <ResponsiveContainer width="100%" height={160}>
                        <AreaChart data={INSIGHT_DATA} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
                            <defs>
                                <linearGradient id="colorEngagement" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#f97316" stopOpacity={0.2} />
                                    <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <Tooltip
                                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px -2px rgb(0 0 0 / 0.1)', fontSize: '12px', color: '#334155' }}
                                itemStyle={{ color: '#ea580c', fontWeight: 'bold' }}
                            />
                            <XAxis dataKey="name" hide />
                            <YAxis hide />
                            <Area
                                type="monotone"
                                dataKey="engagement"
                                stroke="#f97316"
                                strokeWidth={3}
                                fillOpacity={1}
                                fill="url(#colorEngagement)"
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Advanced Insights (Locked) */}
            <div className="space-y-4">
                <h3 className="font-bold text-slate-400 text-sm uppercase tracking-wider flex items-center gap-2 px-1">
                    <Sparkles size={16} /> Advanced Insights
                </h3>

                <div className="grid grid-cols-2 gap-4">
                    {/* Reach Card */}
                    <div className="relative overflow-hidden rounded-3xl p-5 border border-slate-100 bg-white shadow-sm">
                        <div className="flex items-center gap-2 mb-4">
                            <div className="p-2 bg-blue-50 text-blue-500 rounded-xl">
                                <Users size={18} />
                            </div>
                            <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Reach</span>
                        </div>
                        <div className="text-2xl font-black text-slate-800 mb-1 blur-[6px] select-none opacity-50">
                            24.5k
                        </div>
                        <div className="text-xs text-green-500 font-bold flex items-center gap-1 blur-[4px] select-none opacity-50">
                            <TrendingUp size={12} /> +15% vs last mo.
                        </div>

                        {/* Lock Overlay */}
                        <div className="absolute inset-0 bg-white/40 backdrop-blur-[2px] flex flex-col items-center justify-center z-10">
                            <div className="bg-slate-900 text-white p-2.5 rounded-full mb-2 shadow-lg scale-90">
                                <Lock size={16} />
                            </div>
                            <span className="text-[10px] font-extrabold text-slate-800 uppercase tracking-wider bg-white border border-slate-100 px-2 py-1 rounded-lg shadow-sm">Coming Soon</span>
                        </div>
                    </div>

                    {/* Engagement Card */}
                    <div className="relative overflow-hidden rounded-3xl p-5 border border-slate-100 bg-white shadow-sm">
                        <div className="flex items-center gap-2 mb-4">
                            <div className="p-2 bg-purple-50 text-purple-500 rounded-xl">
                                <Eye size={18} />
                            </div>
                            <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Engage</span>
                        </div>
                        <div className="text-2xl font-black text-slate-800 mb-1 blur-[6px] select-none opacity-50">
                            4.2k
                        </div>
                        <div className="text-xs text-green-500 font-bold flex items-center gap-1 blur-[4px] select-none opacity-50">
                            <TrendingUp size={12} /> +8% vs last mo.
                        </div>

                        {/* Lock Overlay */}
                        <div className="absolute inset-0 bg-white/40 backdrop-blur-[2px] flex flex-col items-center justify-center z-10">
                            <div className="bg-slate-900 text-white p-2.5 rounded-full mb-2 shadow-lg scale-90">
                                <Lock size={16} />
                            </div>
                            <span className="text-[10px] font-extrabold text-slate-800 uppercase tracking-wider bg-white border border-slate-100 px-2 py-1 rounded-lg shadow-sm">Coming Soon</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="h-12"></div>
        </div>
    );
};

export default Dashboard;