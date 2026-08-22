/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_API_URL: string;
    readonly VITE_FIREBASE_API_KEY: string;
    readonly VITE_FIREBASE_AUTH_DOMAIN: string;
    readonly VITE_FIREBASE_PROJECT_ID: string;
    readonly VITE_FIREBASE_STORAGE_BUCKET: string;
    readonly VITE_FIREBASE_MESSAGING_SENDER_ID: string;
    readonly VITE_FIREBASE_APP_ID: string;
    /** Dev only: force the backend OTP login path even when a Firebase key is set. */
    readonly VITE_AUTH_DEV_OTP?: string;
    /** Dev only: auto-login this phone via the backend dev OTP and skip the login page. */
    readonly VITE_DEV_AUTO_LOGIN_PHONE?: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
