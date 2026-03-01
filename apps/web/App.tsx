import React, { useState, useEffect } from 'react';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import ContentStudio from './components/ContentStudio';
import Inputs from './components/Inputs';
import Strategy from './components/Strategy';
import Settings from './components/Settings';
import Login from './components/Login';
import ErrorBoundary from './components/ErrorBoundary';
import InstagramCallback from './components/InstagramCallback';
import { ViewState, Restaurant } from '@restropulse/shared';
import { authAPI, restaurantAPI } from './api';

const App: React.FC = () => {
    const [currentView, setCurrentView] = useState<ViewState>('LOGIN');
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [restaurantData, setRestaurantData] = useState<Restaurant | null>(null);
    const [loading, setLoading] = useState(true);
    const [isInstagramCallback, setIsInstagramCallback] = useState(false);

    // Check if this is an Instagram OAuth callback
    useEffect(() => {
        const path = window.location.pathname;
        const searchParams = new URLSearchParams(window.location.search);

        // Check for Instagram callback path or OAuth parameters
        if (path === '/instagram/callback' ||
            searchParams.has('code') && searchParams.has('state')) {
            setIsInstagramCallback(true);
            setLoading(false);
            return;
        }
    }, []);

    // Check for existing session and load restaurant data
    useEffect(() => {
        // Skip if this is an Instagram callback
        if (isInstagramCallback) return;

        const initializeApp = async () => {
            const token = localStorage.getItem('rp_token');
            const session = localStorage.getItem('rp_session');

            if (token && session) {
                try {
                    // Verify session
                    await authAPI.checkSession();

                    // Load restaurant data
                    const restaurant = await restaurantAPI.get('r1');
                    setRestaurantData(restaurant);

                    setIsLoggedIn(true);
                    if (!window.history.state) {
                        window.history.replaceState({ view: 'DASHBOARD' }, '');
                    }
                    setCurrentView('DASHBOARD');
                } catch (error) {
                    console.error('Session validation failed:', error);
                    localStorage.removeItem('rp_token');
                    localStorage.removeItem('rp_session');
                }
            }
            setLoading(false);
        };

        initializeApp();
    }, [isInstagramCallback]);

    // Handle browser back button
    useEffect(() => {
        const handlePopState = (event: PopStateEvent) => {
            if (event.state && event.state.view) {
                setCurrentView(event.state.view);
            } else if (isLoggedIn) {
                setCurrentView('DASHBOARD');
            }
        };

        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, [isLoggedIn]);

    const navigateTo = (view: ViewState) => {
        setCurrentView(view);
        window.history.pushState({ view }, '', `?view=${view.toLowerCase()}`);
    };

    const onLoginSuccess = async (response: { success: boolean; message?: string }) => {
        if (!response.success) throw new Error(response.message || 'Login failed');
        localStorage.setItem('rp_session', 'true');
        const restaurant = await restaurantAPI.get('r1');
        setRestaurantData(restaurant);
        window.history.replaceState({ view: 'DASHBOARD' }, '', '?view=dashboard');
        setCurrentView('DASHBOARD');
        setIsLoggedIn(true);
    };

    // Firebase Authentication (Primary)
    const handleFirebaseLogin = async (firebaseIdToken: string) => {
        await onLoginSuccess(await authAPI.loginWithFirebase(firebaseIdToken));
    };

    // Fallback OTP Authentication (Development)
    const handleFallbackLogin = async (phone: string, otp: string) => {
        await onLoginSuccess(await authAPI.verifyOtp(phone, otp));
    };

    const handleLogout = async () => {
        try {
            await authAPI.logout();
        } catch (error) {
            console.error('Logout error:', error);
        } finally {
            setIsLoggedIn(false);
            setRestaurantData(null);
            window.history.replaceState({ view: 'LOGIN' }, '', '/');
            setCurrentView('LOGIN');
        }
    };

    const refreshRestaurantData = async () => {
        if (restaurantData) {
            try {
                const updated = await restaurantAPI.get(restaurantData.id);
                setRestaurantData(updated);
            } catch (error) {
                console.error('Failed to refresh restaurant data:', error);
            }
        }
    };

    const renderView = () => {
        if (!restaurantData) return <div>Loading...</div>;

        switch (currentView) {
            case 'DASHBOARD':
                return <Dashboard setView={navigateTo} restaurantData={restaurantData} />;
            case 'STUDIO':
                return <ContentStudio />;
            case 'INPUTS':
                return <Inputs restaurantData={restaurantData} onRefresh={refreshRestaurantData} />;
            case 'STRATEGY':
                return <Strategy />;
            case 'SETTINGS':
                return <Settings
                    onLogout={handleLogout}
                    restaurantData={restaurantData}
                    onRestaurantUpdate={refreshRestaurantData}
                />;
            default:
                return <Dashboard setView={navigateTo} restaurantData={restaurantData} />;
        }
    };

    const getPageTitle = () => {
        switch (currentView) {
            case 'DASHBOARD': return 'Dashboard';
            case 'STUDIO': return 'Content Studio';
            case 'INPUTS': return 'Inputs';
            case 'STRATEGY': return 'CONTENT STRATEGY';
            case 'SETTINGS': return 'Settings';
            default: return 'RestroPulse';
        }
    };

    if (loading) {
        return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
            Loading RestroPulse...
        </div>;
    }

    // Render Instagram callback handler if this is an OAuth callback
    if (isInstagramCallback) {
        return (
            <ErrorBoundary>
                <InstagramCallback />
            </ErrorBoundary>
        );
    }

    if (!isLoggedIn) {
        return (
            <ErrorBoundary>
                <Login
                    onLogin={handleFirebaseLogin}
                    onFallbackLogin={handleFallbackLogin}
                />
            </ErrorBoundary>
        );
    }

    return (
        <ErrorBoundary>
            <Layout
                currentView={currentView}
                setView={navigateTo}
                title={getPageTitle()}
            >
                {renderView()}
            </Layout>
        </ErrorBoundary>
    );
};

export default App;