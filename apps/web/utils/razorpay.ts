/**
 * Lazy Razorpay loader (RP-008). checkout.js used to be a synchronous <head>
 * script on every route — render-blocking, and its injected frame stretched the
 * document past 100vh, which scrolled the sidebar out of view on Intelligence.
 * Now it loads on demand, the first time a payment flow actually needs it.
 */
let loading: Promise<void> | null = null;

export function loadRazorpay(): Promise<void> {
    if ((window as unknown as { Razorpay?: unknown }).Razorpay) return Promise.resolve();
    // jsdom never resolves external scripts — resolve immediately so the callers'
    // own "window.Razorpay missing" guard produces the error the tests assert.
    if (import.meta.env.MODE === 'test') return Promise.resolve();
    if (loading) return loading;
    loading = new Promise<void>((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://checkout.razorpay.com/v1/checkout.js';
        s.async = true;
        s.onload = () => resolve();
        s.onerror = () => {
            loading = null;
            reject(new Error('Payment service could not load — check your connection and try again.'));
        };
        document.head.appendChild(s);
    });
    return loading;
}
