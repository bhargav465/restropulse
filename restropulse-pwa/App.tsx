import React, { useState, useEffect } from 'react';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import ContentStudio from './components/ContentStudio';
import Inputs from './components/Inputs';
import Strategy from './components/Strategy';
import Settings from './components/Settings';
import Login from './components/Login';
import ErrorBoundary from './components/ErrorBoundary';
import { ViewState } from './types';
import { MOCK_RESTAURANT } from './constants';

const App: React.FC = () => {
    // Simple state-based routing for PWA experience
    const [currentView, setCurrentView] = useState<ViewState>('LOGIN');
    const [isLoggedIn, setIsLoggedIn] = useState(false);

    // Centralized State for Restaurant Data
    const [restaurantData, setRestaurantData] = useState(MOCK_RESTAURANT);

    // Check for existing session
    useEffect(() => {
        const session = localStorage.getItem('rp_session');
        if (session) {
            setIsLoggedIn(true);
            // Initialize history state if needed
            if (!window.history.state) {
                window.history.replaceState({ view: 'DASHBOARD' }, '');
            }
            setCurrentView('DASHBOARD');
        }
    }, []);

    // Handle Browser Back Button (Popstate)
    useEffect(() => {
        const handlePopState = (event: PopStateEvent) => {
            if (event.state && event.state.view) {
                setCurrentView(event.state.view);
            } else if (isLoggedIn) {
                // Fallback if state is lost but user is logged in
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

    const handleLogin = () => {
        setIsLoggedIn(true);
        localStorage.setItem('rp_session', 'true');
        // Replace login entry with dashboard so back button doesn't go to login
        window.history.replaceState({ view: 'DASHBOARD' }, '', '?view=dashboard');
        setCurrentView('DASHBOARD');
    };

    const handleLogout = () => {
        setIsLoggedIn(false);
        localStorage.removeItem('rp_session');
        window.history.replaceState({ view: 'LOGIN' }, '', '/');
        setCurrentView('LOGIN');
    };

    // Handler to update restaurant data
    const handleUpdateRestaurant = (type: 'OFFER' | 'SPECIAL' | 'MENU', action: 'ADD' | 'DELETE' | 'UPDATE', payload?: any) => {
        setRestaurantData(prev => {
            const newState = { ...prev };

            if (type === 'OFFER') {
                if (action === 'ADD' && typeof payload === 'string') {
                    newState.activeOffers = [payload, ...(newState.activeOffers || [])];
                }
                if (action === 'DELETE' && typeof payload === 'number') {
                    newState.activeOffers = (newState.activeOffers || []).filter((_, i) => i !== payload);
                }
            }

            if (type === 'SPECIAL') {
                if (action === 'ADD' && typeof payload === 'string') {
                    newState.chefSpecials = [payload, ...(newState.chefSpecials || [])];
                }
                if (action === 'DELETE' && typeof payload === 'number') {
                    newState.chefSpecials = (newState.chefSpecials || []).filter((_, i) => i !== payload);
                }
            }

            if (type === 'MENU') {
                newState.menuLastUpdated = new Date().toISOString().split('T')[0];
            }

            return newState;
        });
    };

    const renderView = () => {
        switch (currentView) {
            case 'DASHBOARD':
                return <Dashboard setView={navigateTo} restaurantData={restaurantData} />;
            case 'STUDIO':
                return <ContentStudio />;
            case 'INPUTS':
                return <Inputs restaurantData={restaurantData} onUpdate={handleUpdateRestaurant} />;
            case 'STRATEGY':
                return <Strategy />;
            case 'SETTINGS':
                return <Settings onLogout={handleLogout} />;
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