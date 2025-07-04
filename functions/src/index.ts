
import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import { defineString } from "firebase-functions/params";

// Define parameters for VAPID keys using the new recommended way.
// The values MUST be lowercase.
const VAPID_PUBLIC_KEY = defineString("webpush_public_key");

admin.initializeApp();

/**
 * Provides the VAPID public key to the client application.
 * This is a public key and is safe to expose.
 */
export const getVapidPublicKey = onCall({ region: "europe-west2", cors: true }, (request) => {
  const publicKey = VAPID_PUBLIC_KEY.value();
  if (!publicKey) {
    logger.error("CRITICAL: VAPID public key (webpush_public_key) not set in function configuration.");
    throw new HttpsError('not-found', 'VAPID public key is not configured on the server.');
  }
  
  return { publicKey };
});

// The sendShiftNotification function has been temporarily removed to resolve a critical deployment issue.
// It will be restored in a future update once the underlying build instability is addressed.
