
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import * as webPush from "web-push";

admin.initializeApp();
const db = admin.firestore();

// Helper to safely get VAPID keys from the function's configuration
const getVapidKeys = () => {
  const config = functions.config();
  if (!config.webpush || !config.webpush.public_key || !config.webpush.private_key) {
    functions.logger.error("CRITICAL: VAPID keys are not configured. Run `firebase functions:config:set webpush.public_key=... webpush.private_key=...`");
    return null;
  }
  return {
    publicKey: config.webpush.public_key,
    privateKey: config.webpush.private_key,
  };
};

export const getVapidPublicKey = functions
  .region("europe-west2")
  .https.onCall((data, context) => {
    const keys = getVapidKeys();
    if (!keys) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "VAPID public key is not configured on the server."
      );
    }
    return { publicKey: keys.publicKey };
  });

export const sendShiftNotification = functions
  .region("europe-west2")
  .firestore.document("shifts/{shiftId}")
  .onWrite(async (change, context) => {
    const shiftId = context.params.shiftId;

    // Only trigger on CREATION of a new shift.
    // This simplifies the logic and avoids firing on updates or deletes.
    if (!change.after.exists || change.before.exists) {
      functions.logger.log(`Event for shift ${shiftId} was not a creation. Skipping.`);
      return null;
    }
    
    functions.logger.log(`Function triggered for new shift creation: ${shiftId}`);
    const shiftDataAfter = change.after.data();

    const vapidKeys = getVapidKeys();
    if (!vapidKeys) {
      return null; // Error is logged in helper
    }

    webPush.setVapidDetails(
      "mailto:example@your-project.com",
      vapidKeys.publicKey,
      vapidKeys.privateKey
    );

    const userId: string | null = shiftDataAfter?.userId;
    const payload: object | null = {
        title: "New Shift Assigned",
        body: `You have a new shift: ${shiftDataAfter?.task} at ${shiftDataAfter?.address}.`,
        data: { url: `/` },
    };

    if (!userId || !payload) {
      functions.logger.log("New shift was missing a userId, cannot send notification.", {shiftId});
      return null;
    }

    functions.logger.log(`Preparing to send notification for userId: ${userId}`);

    const subscriptionsSnapshot = await db
      .collection("users")
      .doc(userId)
      .collection("pushSubscriptions")
      .get();

    if (subscriptionsSnapshot.empty) {
      functions.logger.warn(`User ${userId} has no push subscriptions. Cannot send notification.`);
      return null;
    }

    functions.logger.log(`Found ${subscriptionsSnapshot.size} subscriptions for user ${userId}.`);

    const sendPromises = subscriptionsSnapshot.docs.map((subDoc) => {
      const subscription = subDoc.data();
      return webPush.sendNotification(subscription, JSON.stringify(payload)).catch((error: any) => {
        functions.logger.error(`Error sending notification to user ${userId}:`, error);
        if (error.statusCode === 410 || error.statusCode === 404) {
          functions.logger.log(`Deleting invalid subscription for user ${userId}.`);
          return subDoc.ref.delete();
        }
        return null;
      });
    });

    await Promise.all(sendPromises);
    functions.logger.log(`Finished sending notifications for shift ${shiftId}.`);
    return null;
  });
