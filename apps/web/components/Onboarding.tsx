import React, { useState, useEffect, useRef, useCallback } from 'react';
import { User, ChefHat, MapPin, UserCheck, ArrowRight, ArrowLeft, Check, Loader2 } from 'lucide-react';
import { useLoadScript, GoogleMap, Marker, Autocomplete } from '@react-google-maps/api';
import type { Restaurant, AccountManager } from '@restropulse/shared';
import { restaurantAPI, accountManagerAPI } from '../api';

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
const LIBRARIES: ('places')[] = ['places'];

interface OnboardingProps {
    onComplete: (restaurant: Restaurant) => void;
}

type OnboardingStep = 1 | 2 | 3 | 4;

const STEP_LABELS = ['Your Details', 'Restaurant', 'Location', 'Account Manager'];

const CITIES = ['Bangalore', 'Mumbai', 'Delhi', 'Chennai', 'Hyderabad', 'Pune', 'Kolkata'];

const Onboarding: React.FC<OnboardingProps> = ({ onComplete }) => {
    const [step, setStep] = useState<OnboardingStep>(1);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Step 1 - User details
    const [userName, setUserName] = useState('');

    // Step 2 - Restaurant details
    const [restaurantName, setRestaurantName] = useState('');
    const [cuisine, setCuisine] = useState('');

    // Step 3 - Location
    const [address, setAddress] = useState('');
    const [lat, setLat] = useState(0);
    const [lng, setLng] = useState(0);
    const [mapUrl, setMapUrl] = useState('');
    const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number }>({ lat: 12.9716, lng: 77.5946 });
    const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);

    // Step 4 - Account Manager
    const [city, setCity] = useState('');
    const [zone, setZone] = useState('');
    const [zones, setZones] = useState<string[]>([]);
    const [managers, setManagers] = useState<AccountManager[]>([]);
    const [selectedManager, setSelectedManager] = useState<AccountManager | null>(null);
    const [loadingManagers, setLoadingManagers] = useState(false);

    const { isLoaded: mapsLoaded } = useLoadScript({
        googleMapsApiKey: GOOGLE_MAPS_API_KEY,
        libraries: LIBRARIES,
    });

    const fetchManagers = useCallback(async (selectedCity: string, selectedZone?: string) => {
        if (!selectedCity) return;
        setLoadingManagers(true);
        try {
            const result = await accountManagerAPI.getByCityAndZone(selectedCity, selectedZone);
            setManagers(result);

            // Extract unique zones from results
            if (!selectedZone) {
                const uniqueZones = [...new Set(result.map((m) => m.zone))];
                setZones(uniqueZones);
            }
        } catch {
            setManagers([]);
        } finally {
            setLoadingManagers(false);
        }
    }, []);

    useEffect(() => {
        if (city) {
            setZone('');
            setSelectedManager(null);
            fetchManagers(city);
        }
    }, [city, fetchManagers]);

    useEffect(() => {
        if (city && zone) {
            setSelectedManager(null);
            fetchManagers(city, zone);
        }
    }, [zone, city, fetchManagers]);

    const onPlaceChanged = () => {
        const place = autocompleteRef.current?.getPlace();
        if (place?.geometry?.location) {
            const placeLat = place.geometry.location.lat();
            const placeLng = place.geometry.location.lng();
            setAddress(place.formatted_address || '');
            setLat(placeLat);
            setLng(placeLng);
            setMapUrl(`https://www.google.com/maps?q=${placeLat},${placeLng}`);
            setMapCenter({ lat: placeLat, lng: placeLng });

            // Try to extract city from address components
            const cityComponent = place.address_components?.find(
                (c) => c.types.includes('locality'),
            );
            if (cityComponent) {
                const matchedCity = CITIES.find(
                    (c) => c.toLowerCase() === cityComponent.long_name.toLowerCase(),
                );
                if (matchedCity) {
                    setCity(matchedCity);
                }
            }
        }
    };

    const canProceed = (): boolean => {
        switch (step) {
            case 1:
                return userName.trim().length >= 2;
            case 2:
                return restaurantName.trim().length >= 2 && cuisine.trim().length >= 2;
            case 3:
                return address.trim().length > 0;
            case 4:
                return true; // Account manager is optional
        }
    };

    const handleNext = () => {
        if (step < 4) {
            setStep((step + 1) as OnboardingStep);
            setError(null);
        }
    };

    const handleBack = () => {
        if (step > 1) {
            setStep((step - 1) as OnboardingStep);
            setError(null);
        }
    };

    const handleSubmit = async () => {
        setIsSubmitting(true);
        setError(null);

        try {
            const result = await restaurantAPI.create({
                userName: userName.trim(),
                name: restaurantName.trim(),
                cuisine: cuisine.trim(),
                location: {
                    address: address.trim(),
                    lat,
                    lng,
                    mapUrl,
                },
                accountManager: selectedManager
                    ? {
                          name: selectedManager.name,
                          phone: selectedManager.phone,
                          email: selectedManager.email,
                          avatar: selectedManager.avatar,
                      }
                    : { name: '', phone: '', email: '', avatar: '' },
            });

            // Store new tokens
            localStorage.setItem('rp_token', result.token);
            localStorage.setItem('rp_refresh_token', result.refreshToken);
            localStorage.setItem('rp_restaurant_id', result.restaurant.id);

            onComplete(result.restaurant);
        } catch (err: any) {
            setError(err.message || 'Failed to create restaurant. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const renderStepIndicator = () => (
        <div className="flex items-center justify-center gap-2 mb-8">
            {STEP_LABELS.map((label, index) => {
                const stepNum = (index + 1) as OnboardingStep;
                const isActive = step === stepNum;
                const isCompleted = step > stepNum;

                return (
                    <React.Fragment key={label}>
                        <div className="flex flex-col items-center">
                            <div
                                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                                    isActive
                                        ? 'bg-gradient-to-br from-orange-500 to-amber-600 text-white shadow-lg shadow-orange-500/30'
                                        : isCompleted
                                          ? 'bg-green-500/20 text-green-400 border border-green-500/50'
                                          : 'bg-slate-800 text-slate-500 border border-slate-700'
                                }`}
                            >
                                {isCompleted ? <Check size={14} /> : stepNum}
                            </div>
                            <span
                                className={`text-xs mt-1 hidden sm:block ${
                                    isActive ? 'text-orange-400' : isCompleted ? 'text-green-400' : 'text-slate-500'
                                }`}
                            >
                                {label}
                            </span>
                        </div>
                        {index < STEP_LABELS.length - 1 && (
                            <div
                                className={`w-8 h-0.5 mb-4 sm:mb-0 ${
                                    step > stepNum ? 'bg-green-500/50' : 'bg-slate-700'
                                }`}
                            />
                        )}
                    </React.Fragment>
                );
            })}
        </div>
    );

    const renderStep1 = () => (
        <div className="space-y-6">
            <div className="text-center mb-6">
                <div className="w-14 h-14 bg-orange-500/20 rounded-2xl flex items-center justify-center mx-auto mb-3">
                    <User className="w-7 h-7 text-orange-500" />
                </div>
                <h2 className="text-xl font-bold text-white">Welcome to RestroPulse</h2>
                <p className="text-slate-400 text-sm mt-1">Let's start with your name</p>
            </div>

            <div>
                <label className="block text-slate-400 text-sm mb-2">Your name</label>
                <input
                    type="text"
                    value={userName}
                    onChange={(e) => setUserName(e.target.value)}
                    placeholder="e.g. Arjun Mehta"
                    className="w-full bg-slate-800 text-white px-4 py-3.5 rounded-xl border border-slate-700 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 placeholder:text-slate-500"
                    autoFocus
                />
            </div>
        </div>
    );

    const renderStep2 = () => (
        <div className="space-y-6">
            <div className="text-center mb-6">
                <div className="w-14 h-14 bg-orange-500/20 rounded-2xl flex items-center justify-center mx-auto mb-3">
                    <ChefHat className="w-7 h-7 text-orange-500" />
                </div>
                <h2 className="text-xl font-bold text-white">Restaurant Details</h2>
                <p className="text-slate-400 text-sm mt-1">Tell us about your restaurant</p>
            </div>

            <div>
                <label className="block text-slate-400 text-sm mb-2">Restaurant name</label>
                <input
                    type="text"
                    value={restaurantName}
                    onChange={(e) => setRestaurantName(e.target.value)}
                    placeholder="e.g. The Spice Lounge"
                    className="w-full bg-slate-800 text-white px-4 py-3.5 rounded-xl border border-slate-700 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 placeholder:text-slate-500"
                    autoFocus
                />
            </div>

            <div>
                <label className="block text-slate-400 text-sm mb-2">Cuisine type</label>
                <input
                    type="text"
                    value={cuisine}
                    onChange={(e) => setCuisine(e.target.value)}
                    placeholder="e.g. Modern Indian Fusion"
                    className="w-full bg-slate-800 text-white px-4 py-3.5 rounded-xl border border-slate-700 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 placeholder:text-slate-500"
                />
            </div>
        </div>
    );

    const renderStep3 = () => (
        <div className="space-y-6">
            <div className="text-center mb-6">
                <div className="w-14 h-14 bg-orange-500/20 rounded-2xl flex items-center justify-center mx-auto mb-3">
                    <MapPin className="w-7 h-7 text-orange-500" />
                </div>
                <h2 className="text-xl font-bold text-white">Location</h2>
                <p className="text-slate-400 text-sm mt-1">Where is your restaurant located?</p>
            </div>

            {mapsLoaded && GOOGLE_MAPS_API_KEY ? (
                <>
                    <div>
                        <label className="block text-slate-400 text-sm mb-2">Search address</label>
                        <Autocomplete
                            onLoad={(autocomplete) => {
                                autocompleteRef.current = autocomplete;
                            }}
                            onPlaceChanged={onPlaceChanged}
                            options={{ componentRestrictions: { country: 'in' } }}
                        >
                            <input
                                type="text"
                                placeholder="Start typing your restaurant address..."
                                className="w-full bg-slate-800 text-white px-4 py-3.5 rounded-xl border border-slate-700 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 placeholder:text-slate-500"
                                autoFocus
                            />
                        </Autocomplete>
                    </div>

                    {address && (
                        <div className="text-sm text-slate-300 bg-slate-800/50 p-3 rounded-lg border border-slate-700">
                            <span className="text-slate-500">Selected:</span> {address}
                        </div>
                    )}

                    <div className="rounded-xl overflow-hidden border border-slate-700 h-48">
                        <GoogleMap
                            mapContainerStyle={{ width: '100%', height: '100%' }}
                            center={mapCenter}
                            zoom={lat ? 15 : 5}
                            options={{
                                disableDefaultUI: true,
                                zoomControl: true,
                                styles: [
                                    { elementType: 'geometry', stylers: [{ color: '#1e293b' }] },
                                    { elementType: 'labels.text.stroke', stylers: [{ color: '#0f172a' }] },
                                    { elementType: 'labels.text.fill', stylers: [{ color: '#94a3b8' }] },
                                    { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#334155' }] },
                                    { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0f172a' }] },
                                ],
                            }}
                        >
                            {lat !== 0 && lng !== 0 && <Marker position={{ lat, lng }} />}
                        </GoogleMap>
                    </div>
                </>
            ) : (
                <div>
                    <label className="block text-slate-400 text-sm mb-2">Restaurant address</label>
                    <input
                        type="text"
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                        placeholder="e.g. 12, Indiranagar, Bangalore, KA"
                        className="w-full bg-slate-800 text-white px-4 py-3.5 rounded-xl border border-slate-700 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 placeholder:text-slate-500"
                        autoFocus
                    />
                    {!GOOGLE_MAPS_API_KEY && (
                        <p className="text-slate-500 text-xs mt-2">
                            Google Maps API key not configured. Enter address manually.
                        </p>
                    )}
                </div>
            )}
        </div>
    );

    const renderStep4 = () => (
        <div className="space-y-6">
            <div className="text-center mb-6">
                <div className="w-14 h-14 bg-orange-500/20 rounded-2xl flex items-center justify-center mx-auto mb-3">
                    <UserCheck className="w-7 h-7 text-orange-500" />
                </div>
                <h2 className="text-xl font-bold text-white">Account Manager</h2>
                <p className="text-slate-400 text-sm mt-1">Choose your dedicated account manager (optional)</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
                <div>
                    <label className="block text-slate-400 text-sm mb-2">City</label>
                    <select
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        className="w-full bg-slate-800 text-white px-4 py-3.5 rounded-xl border border-slate-700 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 appearance-none"
                    >
                        <option value="">Select city</option>
                        {CITIES.map((c) => (
                            <option key={c} value={c}>
                                {c}
                            </option>
                        ))}
                    </select>
                </div>

                <div>
                    <label className="block text-slate-400 text-sm mb-2">Zone</label>
                    <select
                        value={zone}
                        onChange={(e) => setZone(e.target.value)}
                        disabled={!city || zones.length === 0}
                        className="w-full bg-slate-800 text-white px-4 py-3.5 rounded-xl border border-slate-700 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 appearance-none disabled:opacity-50"
                    >
                        <option value="">All zones</option>
                        {zones.map((z) => (
                            <option key={z} value={z}>
                                {z}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            {loadingManagers && (
                <div className="flex items-center justify-center py-6 text-slate-400">
                    <Loader2 className="w-5 h-5 animate-spin mr-2" />
                    Loading managers...
                </div>
            )}

            {!loadingManagers && city && managers.length === 0 && (
                <div className="text-center py-6 text-slate-500 text-sm">
                    No account managers found for this area. You can skip this step.
                </div>
            )}

            {!loadingManagers && managers.length > 0 && (
                <div className="space-y-3 max-h-48 overflow-y-auto">
                    {managers.map((manager) => (
                        <button
                            key={manager.id}
                            onClick={() =>
                                setSelectedManager(selectedManager?.id === manager.id ? null : manager)
                            }
                            className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${
                                selectedManager?.id === manager.id
                                    ? 'border-orange-500 bg-orange-500/10'
                                    : 'border-slate-700 bg-slate-800 hover:border-slate-600'
                            }`}
                        >
                            <img
                                src={manager.avatar}
                                alt={manager.name}
                                className="w-10 h-10 rounded-full object-cover bg-slate-700"
                            />
                            <div className="flex-1 min-w-0">
                                <p className="text-white font-medium text-sm truncate">{manager.name}</p>
                                <p className="text-slate-400 text-xs truncate">{manager.phone}</p>
                            </div>
                            {selectedManager?.id === manager.id && (
                                <div className="w-6 h-6 rounded-full bg-orange-500 flex items-center justify-center flex-shrink-0">
                                    <Check size={14} className="text-white" />
                                </div>
                            )}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );

    return (
        <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6 relative overflow-hidden">
            {/* Background Decor */}
            <div className="absolute top-0 left-0 w-full h-full opacity-20 pointer-events-none">
                <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-orange-500 rounded-full blur-[100px]"></div>
                <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-amber-600 rounded-full blur-[100px]"></div>
            </div>

            <div className="z-10 w-full max-w-md">
                {/* Logo */}
                <div className="text-center mb-6">
                    <div className="w-12 h-12 bg-gradient-to-br from-orange-500 to-amber-600 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-2xl shadow-orange-500/20">
                        <span className="text-white font-bold text-xl">R</span>
                    </div>
                </div>

                {renderStepIndicator()}

                {error && (
                    <div className="mb-4 p-3 bg-red-500/10 border border-red-500/50 rounded-lg text-red-400 text-sm text-center">
                        {error}
                    </div>
                )}

                {step === 1 && renderStep1()}
                {step === 2 && renderStep2()}
                {step === 3 && renderStep3()}
                {step === 4 && renderStep4()}

                {/* Navigation */}
                <div className="flex gap-3 mt-8">
                    {step > 1 && (
                        <button
                            onClick={handleBack}
                            className="flex-1 bg-slate-800 hover:bg-slate-700 text-white font-medium py-3.5 rounded-xl flex items-center justify-center gap-2 transition-all border border-slate-700"
                        >
                            <ArrowLeft size={18} />
                            Back
                        </button>
                    )}

                    {step < 4 ? (
                        <button
                            onClick={handleNext}
                            disabled={!canProceed()}
                            className="flex-1 bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 transition-all active:scale-[0.98] shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Next
                            <ArrowRight size={18} />
                        </button>
                    ) : (
                        <button
                            onClick={handleSubmit}
                            disabled={isSubmitting}
                            className="flex-1 bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 transition-all active:scale-[0.98] shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isSubmitting ? (
                                <>
                                    <Loader2 size={18} className="animate-spin" />
                                    Setting up...
                                </>
                            ) : (
                                <>
                                    Get Started
                                    <ArrowRight size={18} />
                                </>
                            )}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Onboarding;
