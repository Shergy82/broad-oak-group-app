import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import * as webpush from "web-push";

// Initialize the Firebase Admin SDK
admin.initializeApp();

// You will set these in the next step using the Firebase CLI
const vapidPublicKey = functions.config().webpush.public_key;
const vapidPrivateKey = functions.config().webpush.private_key;

// Configure the web-push library with your VAPID keys
webpush.setVapidDetails(
  "mailto:your-email@example.com", // IMPORTANT: Replace with your contact email
  vapidPublicKey,
  vapidPrivateKey,
);

/**
 * Interface for the data stored for a push subscription.
 */
interface PushSubscription {
  endpoint: string;
  expirationTime?: number | null;
  keys: {
    p256dh: string;
    auth: string;
  };
}

/**
 * This function triggers whenever a document in the 'shifts' collection is written (created or updated).
 * It sends a push notification to the user associated with that shift.
 */
export const sendShiftNotification = functions.firestore
  .document("shifts/{shiftId}")
  .onWrite(async (change) => {
    // Exit if the shift was deleted (no "after" data)
    if (!change.after.exists) {
      functions.logger.log(`Shift ${change.before.id} was deleted. No notification sent.`);
      return null;
    }

    const shiftData = change.after.data();
    const userId = shiftData.userId;

    if (!userId) {
      functions.logger.log(`Shift ${change.after.id} has no userId. No notification sent.`);
      return null;
    }

    // Get all the saved push subscriptions for the affected user
    const subscriptionsSnapshot = await admin.firestore()
      .collection("users").doc(userId).collection("pushSubscriptions").get();

    if (subscriptionsSnapshot.empty) {
      functions.logger.log("No push subscriptions found for user:", userId);
      return null;
    }

    // Create the notification content
    const payload = JSON.stringify({
      title: "Shift Update!",
      body: `Your shift for '${shiftData.task}' at ${shiftData.address} has been updated.`,
      icon: "/icons/icon-192x192.png", // Optional: icon for the notification
    });

    const notificationPromises = subscriptionsSnapshot.docs.map(async (subDoc) => {
      const subscription = subDoc.data() as PushSubscription;
      try {
        await webpush.sendNotification(subscription, payload);
      } catch (error: any) {
        // If a subscription is expired or invalid (e.g., user cleared browser data), delete it
        if (error.statusCode === 404 || error.statusCode === 410) {
          functions.logger.log(`Subscription ${subDoc.id} has expired or is no longer valid. Deleting it.`);
          await subDoc.ref.delete();
        } else {
          functions.logger.error(`Error sending notification to ${subDoc.id}, subscription not deleted.`, error);
        }
      }
    });

    await Promise.all(notificationPromises);
    return null;
  });
