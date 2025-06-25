'use server';

import { db } from '@/lib/firebase';
import { collection, addDoc, Timestamp, deleteDoc, doc } from 'firebase/firestore';

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
    // Create a new shift document, which will trigger the onWrite Cloud Function
    const newShiftRef = await addDoc(collection(db, 'shifts'), {
      userId: userId,
      date: Timestamp.now(),
      type: 'all-day',
      status: 'pending-confirmation',
      address: 'Test Notification',
      task: 'This is a test notification from the admin panel.',
    });
    
    // For good housekeeping, this test shift can be deleted after a short period.
    // The notification will have already been sent.
    setTimeout(async () => {
        try {
            if (db) {
               await deleteDoc(doc(db, 'shifts', newShiftRef.id));
               console.log(`Cleaned up test shift: ${newShiftRef.id}`);
            }
        } catch (e) {
            // It's okay if this fails, it's just a cleanup.
            console.error("Failed to clean up test shift", e);
        }
    }, 30000); // 30 seconds delay

    return { success: true };
  } catch (error: any) {
    console.error('Failed to create test shift document:', error);
    return { success: false, error: error.message || 'An unexpected error occurred.' };
  }
}
