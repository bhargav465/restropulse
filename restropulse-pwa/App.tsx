import React, { useState, useEffect } from 'react';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import ContentStudio from './components/ContentStudio';
import Inputs from './components/Inputs';
import Strategy from './components/Strategy';
import Settings from './components/Settings';
import Login from './components/Login';
import ErrorBoundary from './components/ErrorBoundary';
import { ViewState, Restaurant } from './types';
import { authAPI, restaurantAPI } from './api';

const App: React.FC = () => {
    const [currentView, setCurrentView] = useState<ViewState>('LOGIN');
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [restaurantData, setRestaurantData] = useState<Restaurant | null>(null);
    const [loading, setLoading] = useState(true);

    // Check for existing session and load restaurant data
    useEffect(() => {
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
    }, []);

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

    const handleLogin = async (email: string, password: string) => {
        try {
            const response = await authAPI.login({ email, password });

            if (response.success) {
                setIsLoggedIn(true);
                localStorage.setItem('rp_session', 'true');

                // Load restaurant data
                const restaurant = await restaurantAPI.get('r1');
                setRestaurantData(restaurant);

                window.history.replaceState({ view: 'DASHBOARD' }, '', '?view=dashboard');
                setCurrentView('DASHBOARD');
            }
        } catch (error) {
            console.error('Login failed:', error);
            throw error;
        }
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
                return <Settings onLogout={handleLogout} restaurantData={restaurantData} />;
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

    if (!isLoggedIn) {
        return (
            <ErrorBoundary>
                <Login onLogin={handleLogin} />
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