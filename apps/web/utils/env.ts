import { getClientConfig } from './client-config';

export const getGoogleMapsApiKey = (): string | undefined =>
    import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

export const getFirebaseApiKey = (): string | undefined =>
    import.meta.env.VITE_FIREBASE_API_KEY;

export const getApiUrl = (): string =>
    getClientConfig().apiUrl;

export const getAppUrl = (): string =>
    getClientConfig().appUrl;
