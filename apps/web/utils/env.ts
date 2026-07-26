import { getClientConfig } from './client-config';

export const getGoogleMapsApiKey = (): string | undefined =>
    import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

// Alias used by the ported Restaurant Intelligence PlacePicker (v2 naming).
export const getGoogleMapsBrowserKey = getGoogleMapsApiKey;

export const getFirebaseApiKey = (): string | undefined =>
    import.meta.env.VITE_FIREBASE_API_KEY;

export const getApiUrl = (): string =>
    getClientConfig().apiUrl;

export const getAppUrl = (): string =>
    getClientConfig().appUrl;
