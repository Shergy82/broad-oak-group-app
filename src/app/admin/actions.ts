'use server';

import { db } from '@/lib/firebase';
import { collection, addDoc, Timestamp } from 'firebase/firestore';

// This function will only ever run on the server.
export async function generateVapidKeysAction(): Promise<{ publicKey: string; privateKey: string }> {
  const webPush = require('web-push');
  return webPush.generateVAPIDKeys();
}

export async function sendTestShiftNotificationAction(userId: string): Promise<{ success: boolean; error?: string }> {
  if (!db) {
    return { success: false, error: 'Firestore is not initialized.' };
  }
  if (!userId) {
    return { success: false, error: 'User ID is required.' };
  }

  try {
    await addDoc(collection(db, 'shifts'), {
      userId: userId,
      date: Timestamp.now(),
      type: 'all-day',
      status: 'pending-confirmation',
      address: 'Test Address',
      task: 'This is a test notification shift.',
    });
    return { success: true };
  } catch (error: any) {
    console.error("Error sending test notification:", error);
    return { success: false, error: error.message || "An unknown error occurred." };
  }
}
