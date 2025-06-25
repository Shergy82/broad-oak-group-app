'use client';

import { useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';

export function ServiceWorkerRegistrar() {
  const { toast } = useToast();

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .catch((error) => {
            console.error('Service Worker registration failed:', error);
            toast({
                variant: 'destructive',
                title: 'Could not enable notifications',
                description: 'The background service worker failed to install. Push notifications will not be available.',
            });
        });
    }
  }, [toast]);

  return null; // This component renders nothing.
}
