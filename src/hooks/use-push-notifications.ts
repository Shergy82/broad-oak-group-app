
'use client';

// This hook has been temporarily disabled to ensure a stable deployment.
export function usePushNotifications() {
  return {
    isSupported: false,
    isSubscribed: false,
    isSubscribing: false,
    subscribe: async () => {},
    unsubscribe: async () => {},
  };
}
