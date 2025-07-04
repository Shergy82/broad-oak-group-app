
import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import { defineString } from "firebase-functions/params";

// The push notification feature has been temporarily disabled to ensure a stable deployment.
// This file is kept to maintain the project structure but the notification-sending logic has been removed.

// Define parameters for VAPID keys using the new recommended way.
// The values MUST be lowercase and snake_cased.
const VAPID_PUBLIC_KEY = defineString("webpush_public_key");

admin.initializeApp();

/**
 * Provides the VAPID public key to the client application.
 * This is a public key and is safe to expose.
 */
export const getVapidPublicKey = onCall({ region: "europe-west2" }, (request) => {
  const publicKey = VAPID_PUBLIC_KEY.value();
  if (!publicKey) {
    logger.error("CRITICAL: VAPID public key (webpush_public_key) not set in function configuration.");
    throw new HttpsError('not-found', 'VAPID public key is not configured on the server.');
  }
  
  return { publicKey };
});
