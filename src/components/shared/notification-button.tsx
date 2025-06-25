'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { db } from '@/lib/firebase';
import { collection, addDoc, getDocs, query, where } from 'firebase/firestore';
import { Bell, BellRing, BellOff } from 'lucide-react';
import { Spinner } from './spinner';

// This is a VAPID public key. You should generate your own pair
// and store the public key in your .env.local file.
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function NotificationButton() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isUnsupported, setIsUnsupported] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      setIsUnsupported(true);
      setIsLoading(false);
      return;
    }

    const checkSubscription = async () => {
      setIsLoading(true);
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      setIsSubscribed(!!subscription);
      setIsLoading(false);
    };

    checkSubscription();
  }, []);

  const handleSubscribe = async () => {
    if (!user) {
      toast({ variant: 'destructive', title: 'You must be logged in to subscribe.' });
      return;
    }
    if (!VAPID_PUBLIC_KEY) {
      console.error('VAPID public key not found. Please set NEXT_PUBLIC_VAPID_PUBLIC_KEY in your .env.local file.');
      toast({
        variant: 'destructive',
        title: 'Configuration Error',
        description: 'Push notifications are not configured on this site.',
      });
      return;
    }

    setIsLoading(true);

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      toast({
        variant: 'destructive',
        title: 'Permission Denied',
        description: 'You have blocked notifications.',
      });
      setIsLoading(false);
      return;
    }

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });

      // Save subscription to Firestore
      const subCollection = collection(db, 'users', user.uid, 'pushSubscriptions');
      await addDoc(subCollection, JSON.parse(JSON.stringify(subscription)));

      toast({ title: 'Subscribed!', description: 'You will now receive shift notifications.' });
      setIsSubscribed(true);
    } catch (error) {
      console.error('Failed to subscribe the user: ', error);
      toast({
        variant: 'destructive',
        title: 'Subscription Failed',
        description: 'Could not subscribe to notifications. Please try again.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (isUnsupported) {
    return null; // Don't show the button if push is not supported
  }

  if (isLoading) {
    return (
      <Button variant="outline" size="icon" disabled>
        <Spinner />
      </Button>
    );
  }

  if (isSubscribed) {
    return (
      <Button variant="outline" size="icon" disabled>
        <BellRing className="h-4 w-4" />
      </Button>
    );
  }

  return (
    <Button variant="outline" size="icon" onClick={handleSubscribe}>
      <Bell className="h-4 w-4" />
    </Button>
  );
}
