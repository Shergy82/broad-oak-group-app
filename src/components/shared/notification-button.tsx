
'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { db, functions } from '@/lib/firebase';
import { collection, addDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { Bell, BellRing, BellOff } from 'lucide-react';
import { Spinner } from './spinner';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

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
  const [vapidPublicKey, setVapidPublicKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      setError("Notifications not supported by this browser.");
      setIsLoading(false);
      return;
    }
    
    if (!functions) {
        setError("Firebase not configured.");
        setIsLoading(false);
        return;
    }

    const initialize = async () => {
        try {
            // Fetch the public key from the backend
            const getVapidPublicKey = httpsCallable(functions, 'getVapidPublicKey');
            const result = await getVapidPublicKey();
            const key = (result.data as { publicKey: string }).publicKey;

            if (!key) {
              throw new Error("VAPID public key not returned from server.");
            }
            
            setVapidPublicKey(key);

            // Check existing subscription
            const registration = await navigator.serviceWorker.ready;
            const subscription = await registration.pushManager.getSubscription();
            setIsSubscribed(!!subscription);
        } catch (e: any) {
            console.error("Failed to initialize push notifications:", e);
            if (e.code === 'not-found') {
              setError("Notifications not configured. Admin must generate and set VAPID keys.");
            } else {
              setError("Could not connect to notification service.");
            }
        } finally {
            setIsLoading(false);
        }
    };

    initialize();
  }, []);

  const handleSubscribe = async () => {
    if (!user) {
      toast({ variant: 'destructive', title: 'You must be logged in to subscribe.' });
      return;
    }

    if (!db || !vapidPublicKey) {
      toast({ variant: 'destructive', title: 'Notifications are not configured correctly.' });
      return;
    }

    setIsLoading(true);

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      toast({
        variant: 'destructive',
        title: 'Permission Denied',
        description: 'You have blocked notifications for this site.',
      });
      setIsLoading(false);
      return;
    }

    try {
      const registration = await navigator.serviceWorker.ready;
      const existingSubscription = await registration.pushManager.getSubscription();

      if (existingSubscription) {
          setIsSubscribed(true);
          toast({ title: 'Already Subscribed', description: 'You are already set up to receive notifications.' });
          setIsLoading(false);
          return;
      }
      
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });

      const subCollection = collection(db, 'users', user.uid, 'pushSubscriptions');
      await addDoc(subCollection, JSON.parse(JSON.stringify(subscription)));

      toast({ title: 'Subscribed!', description: 'You will now receive shift notifications.' });
      setIsSubscribed(true);
    } catch (error) {
      console.error('Failed to subscribe the user: ', error);
      toast({
        variant: 'destructive',
        title: 'Subscription Failed',
        description: 'Could not subscribe to notifications. Please try again or contact support.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <Button variant="outline" size="icon" disabled>
        <Spinner />
      </Button>
    );
  }
  
  if (error || !vapidPublicKey) {
      return (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>
                    <Button variant="outline" size="icon" disabled>
                        <BellOff className="h-4 w-4" />
                    </Button>
                </TooltipTrigger>
                <TooltipContent>
                    <p>{error || "Notifications are unavailable."}</p>
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
      );
  }

  if (isSubscribed) {
    return (
      <TooltipProvider>
          <Tooltip>
              <TooltipTrigger asChild>
                  <Button variant="outline" size="icon" disabled>
                      <BellRing className="h-4 w-4" />
                  </Button>
              </TooltipTrigger>
              <TooltipContent>
                  <p>You are subscribed to notifications.</p>
              </TooltipContent>
          </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
        <Tooltip>
            <TooltipTrigger asChild>
                <Button variant="outline" size="icon" onClick={handleSubscribe}>
                    <Bell className="h-4 w-4" />
                </Button>
            </TooltipTrigger>
            <TooltipContent>
                <p>Subscribe to shift notifications.</p>
            </TooltipContent>
        </Tooltip>
    </TooltipProvider>
  );
}
