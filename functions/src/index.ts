
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import * as webPush from "web-push";

// V2 functions read runtime config from process.env.
// The key 'webpush.public_key' is automatically converted to 'WEBPUSH_PUBLIC_KEY'.
const VAPID_PUBLIC_KEY = process.env.WEBPUSH_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.WEBPUSH_PRIVATE_KEY;

admin.initializeApp();
const db = admin.firestore();

/**
 * Provides the VAPID public key to the client application.
 * This is a public key and is safe to expose.
 */
export const getVapidPublicKey = onCall({ region: "europe-west2" }, (request) => {
  if (!VAPID_PUBLIC_KEY) {
    logger.error("CRITICAL: VAPID public key (webpush.public_key) not set in function configuration. Please run the command from the Admin panel.");
    throw new HttpsError('failed-precondition', 'VAPID public key is not configured on the server.');
  }
  
  return { publicKey: VAPID_PUBLIC_KEY };
});

export const sendShiftNotification = onDocumentWritten(
  {
    document: "shifts/{shiftId}",
    region: "europe-west2",
  },
  async (event) => {
    const shiftId = event.params.shiftId;
    logger.log(`Function triggered for shiftId: ${shiftId}`);

    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
      logger.error("CRITICAL: VAPID keys are not configured. Run the Firebase CLI command from the 'VAPID Key Generator' in the admin panel to set webpush.public_key and webpush.private_key.");
      return;
    }

    webPush.setVapidDetails(
      "mailto:example@your-project.com",
      VAPID_PUBLIC_KEY,
      VAPID_PRIVATE_KEY
    );

    const shiftDataBefore = event.data?.before.data();
    const shiftDataAfter = event.data?.after.data();
    
    let userId: string | null = null;
    let payload: object | null = null;

    if (event.data?.after.exists && !event.data?.before.exists) {
      // A new shift is created
      userId = shiftDataAfter?.userId;
      payload = {
        title: "New Shift Assigned",
        body: `You have a new shift: ${shiftDataAfter?.task} at ${shiftDataAfter?.address}.`,
        data: { url: `/` },
      };
    } else if (!event.data?.after.exists && event.data?.before.exists) {
      // A shift is deleted
      userId = shiftDataBefore?.userId;
      payload = {
        title: "Shift Cancelled",
        body: `Your shift for ${shiftDataBefore?.task} at ${shiftDataBefore?.address} has been cancelled.`,
        data: { url: `/` },
      };
    } else {
      logger.log(`Shift ${shiftId} was updated, no notification sent.`);
    }

    if (!userId || !payload) {
      logger.log("No notification necessary for this event.", {shiftId});
      return;
    }

    logger.log(`Preparing to send notification for userId: ${userId}`);

    const subscriptionsSnapshot = await db
      .collection("users")
      .doc(userId)
      .collection("pushSubscriptions")
      .get();

    if (subscriptionsSnapshot.empty) {
      logger.warn(`User ${userId} has no push subscriptions. Cannot send notification.`);
      return;
    }

    logger.log(`Found ${subscriptionsSnapshot.size} subscriptions for user ${userId}.`);

    const sendPromises = subscriptionsSnapshot.docs.map((subDoc) => {
      const subscription = subDoc.data();
      return webPush.sendNotification(subscription, JSON.stringify(payload)).catch((error: any) => {
        logger.error(`Error sending notification to user ${userId}:`, error);
        if (error.statusCode === 410 || error.statusCode === 404) {
          logger.log(`Deleting invalid subscription for user ${userId}.`);
          return subDoc.ref.delete();
        }
        return null;
      });
    });

    await Promise.all(sendPromises);
    logger.log(`Finished sending notifications for shift ${shiftId}.`);
  }
);
