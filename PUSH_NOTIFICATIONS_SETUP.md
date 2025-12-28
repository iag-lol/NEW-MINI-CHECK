# Push Notifications Setup Guide

## Overview
This application uses Web Push API for native mobile notifications with sound and vibration support.

## Browser Support
- ✅ **Android Chrome**: Full support (notifications work even when phone is locked)
- ⚠️ **iOS Safari 16.4+**: Limited support - requires app to be "Added to Home Screen" for best experience
- ✅ **Desktop Chrome/Firefox/Edge**: Full support

## Setup Instructions

### 1. Generate VAPID Keys

VAPID keys are required for Web Push API. Generate them using the `web-push` npm package:

```bash
# Install web-push globally
npm install -g web-push

# Generate VAPID keys
web-push generate-vapid-keys
```

This will output:
```
Public Key: BEl62iUYgUivxIkv69yViEuiBIa-Ib37J8xYjEB0x2IaLPW7JrXgkNBJiZhHcSwcjwJcWmJKnJQJJWfJJJJJJJJ
Private Key: ...
```

### 2. Update Application Server Key

Replace the placeholder key in `src/shared/services/pushNotifications.ts`:

```typescript
applicationServerKey: this.urlBase64ToUint8Array(
    'YOUR_PUBLIC_VAPID_KEY_HERE' // Replace this
)
```

### 3. Store Private Key Securely

Add the private VAPID key to your environment variables:

```bash
# .env
VITE_VAPID_PRIVATE_KEY=your_private_key_here
```

**⚠️ NEVER commit the private key to version control!**

### 4. Add Notification Icons

Create the following icon files in the `public/` directory:

- `icon-192.png` - 192x192px app icon
- `badge-72.png` - 72x72px badge icon (monochrome, for notification badge)

You can use an online tool like [favicon.io](https://favicon.io) to generate these.

### 5. Backend Integration (TODO)

To send push notifications from the backend when tasks are created:

```typescript
// Example using web-push library
import webpush from 'web-push';

webpush.setVapidDetails(
  'mailto:your-email@example.com',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

// When creating a task
const payload = JSON.stringify({
  title: 'Nueva tarea asignada',
  body: taskTitle,
  icon: '/icon-192.png',
  badge: '/badge-72.png',
  vibrate: [200, 100, 200],
  data: {
    url: '/aseo',
    taskId: taskId
  }
});

// Get user's push subscription from database
const subscription = await getUserPushSubscription(cleanerId);

await webpush.sendNotification(subscription, payload);
```

## Testing

### Android Chrome
1. Open the app on Android Chrome
2. Log in to the Aseo portal
3. Grant notification permission when prompted
4. Lock your phone
5. Create a task from admin panel
6. You should receive a notification with sound and vibration

### iOS Safari
1. Open Safari on iOS
2. Navigate to the app
3. Tap the Share button → "Add to Home Screen"
4. Open the app from home screen
5. Grant notification permission
6. Test as above

## Troubleshooting

### Notifications not appearing
- Check browser console for errors
- Verify notification permission is granted: `Notification.permission === 'granted'`
- Check service worker is registered: `navigator.serviceWorker.controller`
- Verify VAPID keys are correct

### iOS not working
- Ensure app is added to home screen (PWA mode)
- iOS requires HTTPS (except localhost)
- Check iOS version is 16.4+

### No sound/vibration
- Check device is not in silent mode
- Verify notification settings in device settings
- Android: Check "Do Not Disturb" mode
- iOS: Sound/vibration support is limited

## Current Limitations

1. **VAPID Key**: Currently using a placeholder - needs to be replaced with real keys
2. **Backend Integration**: Push notifications are not yet sent from backend when tasks are created
3. **Subscription Storage**: User subscriptions need to be stored in database
4. **iOS Support**: Limited compared to Android

## Next Steps

- [ ] Generate real VAPID keys
- [ ] Create notification icons
- [ ] Store push subscriptions in Supabase
- [ ] Implement backend push notification sending
- [ ] Test on real devices (Android & iOS)
