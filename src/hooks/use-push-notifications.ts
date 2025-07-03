
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from './use-auth';
import { db, functions, httpsCallable, isFirebaseConfigured } from '@/lib/firebase';
import { collection, addDoc, getDocs, query, where, deleteDoc } from 'firebase/firestore';
import { useToast } from './use-toast';

const urlBase64ToUint8Array = (base64String: string) => {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
};

export function usePushNotifications() {
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [permissionStatus, setPermissionStatus] = useState<NotificationPermission>('default');

  const checkSubscription = useCallback(async () => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window) {
      setPermissionStatus(Notification.permission);
      const registration = await navigator.serviceWorker.ready;
      const sub = await registration.pushManager.getSubscription();
      setIsSubscribed(!!sub);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    checkSubscription();
  }, [checkSubscription]);

  const subscribe = useCallback(async () => {
    if (!isFirebaseConfigured || !db || !user || !functions) {
      toast({ variant: 'destructive', title: 'Error', description: 'User or Firebase is not available.' });
      return;
    }
    
    // Request permission first
    const permission = await Notification.requestPermission();
    setPermissionStatus(permission);

    if (permission !== 'granted') {
      toast({ variant: 'destructive', title: 'Permission Denied', description: 'Please enable notifications in your browser settings to subscribe.' });
      return;
    }
    
    // Check for existing subscription to avoid errors
    const registration = await navigator.serviceWorker.ready;
    let sub = await registration.pushManager.getSubscription();
    
    if (sub) {
        setIsSubscribed(true);
        toast({ title: 'Already Subscribed', description: 'You are already subscribed to notifications.' });
        return;
    }

    try {
      const getVapidPublicKey = httpsCallable(functions, 'getVapidPublicKey');
      const result: any = await getVapidPublicKey();
      const VAPID_PUBLIC_KEY = result.data.publicKey;
      
      if (!VAPID_PUBLIC_KEY) {
          throw new Error("VAPID public key not received from server.");
      }

      const applicationServerKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
      sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });

      const subscriptionsRef = collection(db, `users/${user.uid}/pushSubscriptions`);
      await addDoc(subscriptionsRef, sub.toJSON());

      setIsSubscribed(true);
      toast({ title: 'Subscribed!', description: 'You will now receive notifications.' });
    } catch (error: any) {
      console.error('Failed to subscribe the user: ', error);
      let description = 'Could not subscribe to notifications. Please try again.';
      if (error.message.includes('VAPID public key')) {
          description = "Could not subscribe: The server's security key is missing. Please ensure it has been configured correctly in the admin panel.";
      }
      toast({ variant: 'destructive', title: 'Subscription Failed', description });
    }
  }, [user, toast, functions]);

  const unsubscribe = useCallback(async () => {
    if (!user || !db) return;

    setIsLoading(true);
    try {
        const registration = await navigator.serviceWorker.ready;
        const sub = await registration.pushManager.getSubscription();

        if (!sub) {
            toast({ title: 'Not Subscribed', description: "You weren't subscribed to begin with." });
            setIsSubscribed(false);
            return;
        }

        // Unsubscribe from push manager first
        const unsubscribed = await sub.unsubscribe();
        if (unsubscribed) {
            setIsSubscribed(false);
            toast({ title: 'Unsubscribed', description: 'You will no longer receive notifications.' });
            
            // Then, clean up the database in the background
            const subscriptionsRef = collection(db, `users/${user.uid}/pushSubscriptions`);
            const q = query(subscriptionsRef, where('endpoint', '==', sub.endpoint));
            const querySnapshot = await getDocs(q);
            const deletePromises: Promise<void>[] = [];
            querySnapshot.forEach((doc) => {
                deletePromises.push(deleteDoc(doc.ref));
            });
            await Promise.all(deletePromises);
        } else {
            throw new Error("Failed to unsubscribe from PushManager.");
        }
    } catch (error) {
      console.error('Failed to unsubscribe the user: ', error);
      toast({ variant: 'destructive', title: 'Unsubscribe Failed', description: 'Could not unsubscribe. Please try again.' });
    } finally {
        setIsLoading(false);
    }
  }, [user, db, toast]);

  return { isSubscribed, subscribe, unsubscribe, isLoading, permissionStatus };
}
