/**
 * Push Notification Service
 * Handles Web Push API for native mobile notifications
 */

export class PushNotificationService {
    private static instance: PushNotificationService;
    private registration: ServiceWorkerRegistration | null = null;

    private constructor() { }

    static getInstance(): PushNotificationService {
        if (!PushNotificationService.instance) {
            PushNotificationService.instance = new PushNotificationService();
        }
        return PushNotificationService.instance;
    }

    /**
     * Check if push notifications are supported
     */
    isSupported(): boolean {
        return 'serviceWorker' in navigator &&
            'PushManager' in window &&
            'Notification' in window;
    }

    /**
     * Request notification permission
     */
    async requestPermission(): Promise<NotificationPermission> {
        if (!this.isSupported()) {
            throw new Error('Push notifications are not supported');
        }

        const permission = await Notification.requestPermission();
        console.log('Notification permission:', permission);
        return permission;
    }

    /**
     * Register service worker
     */
    async registerServiceWorker(): Promise<ServiceWorkerRegistration> {
        if (!this.isSupported()) {
            throw new Error('Service workers are not supported');
        }

        try {
            this.registration = await navigator.serviceWorker.register('/sw.js', {
                scope: '/'
            });
            console.log('Service Worker registered:', this.registration);
            return this.registration;
        } catch (error) {
            console.error('Service Worker registration failed:', error);
            throw error;
        }
    }

    /**
     * Subscribe to push notifications
     */
    async subscribe(): Promise<PushSubscription | null> {
        if (!this.registration) {
            await this.registerServiceWorker();
        }

        if (!this.registration) {
            throw new Error('Service worker not registered');
        }

        try {
            // Check for existing subscription
            let subscription = await this.registration.pushManager.getSubscription();

            if (!subscription) {
                // Create new subscription
                subscription = await this.registration.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: this.urlBase64ToUint8Array(
                        // You'll need to generate VAPID keys and add the public key here
                        // For now, using a placeholder - this needs to be replaced
                        'BEl62iUYgUivxIkv69yViEuiBIa-Ib37J8xYjEB0x2IaLPW7JrXgkNBJiZhHcSwcjwJcWmJKnJQJJWfJJJJJJJJ'
                    ) as any // Type assertion needed for compatibility
                });
            }

            console.log('Push subscription:', subscription);
            return subscription;
        } catch (error) {
            console.error('Failed to subscribe to push notifications:', error);
            throw error;
        }
    }

    /**
     * Unsubscribe from push notifications
     */
    async unsubscribe(): Promise<boolean> {
        if (!this.registration) {
            return false;
        }

        try {
            const subscription = await this.registration.pushManager.getSubscription();
            if (subscription) {
                await subscription.unsubscribe();
                console.log('Unsubscribed from push notifications');
                return true;
            }
            return false;
        } catch (error) {
            console.error('Failed to unsubscribe:', error);
            return false;
        }
    }

    /**
     * Show a local notification (for testing)
     */
    async showNotification(title: string, options?: NotificationOptions): Promise<void> {
        if (!this.registration) {
            await this.registerServiceWorker();
        }

        if (!this.registration) {
            throw new Error('Service worker not registered');
        }

        const defaultOptions: NotificationOptions = {
            icon: '/icon-192.png',
            badge: '/badge-72.png',
            requireInteraction: true,
            ...options
        };

        await this.registration.showNotification(title, defaultOptions);
    }

    /**
     * Initialize push notifications
     * Call this when user logs in
     */
    async initialize(): Promise<PushSubscription | null> {
        try {
            // Request permission
            const permission = await this.requestPermission();

            if (permission !== 'granted') {
                console.log('Notification permission denied');
                return null;
            }

            // Register service worker
            await this.registerServiceWorker();

            // Subscribe to push
            const subscription = await this.subscribe();

            return subscription;
        } catch (error) {
            console.error('Failed to initialize push notifications:', error);
            return null;
        }
    }

    /**
     * Convert VAPID key from base64 to Uint8Array
     */
    private urlBase64ToUint8Array(base64String: string): Uint8Array {
        const padding = '='.repeat((4 - base64String.length % 4) % 4);
        const base64 = (base64String + padding)
            .replace(/\-/g, '+')
            .replace(/_/g, '/');

        const rawData = window.atob(base64);
        const outputArray = new Uint8Array(rawData.length);

        for (let i = 0; i < rawData.length; ++i) {
            outputArray[i] = rawData.charCodeAt(i);
        }
        return outputArray;
    }
}

// Export singleton instance
export const pushNotificationService = PushNotificationService.getInstance();
