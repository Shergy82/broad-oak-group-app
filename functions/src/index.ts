
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";

admin.initializeApp();
const db = admin.firestore();

// All notification-related functions have been removed as part of a feature rollback.
// This file is kept for project structure consistency.
// You can add new, working Cloud Functions here in the future.

/**
 * This is an example function that can be safely deployed.
 */
export const helloWorld = onCall((request) => {
  logger.info("Hello world function was called!", { structuredData: true });
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "You must be logged in to call this function.");
  }
  return { text: `Hello, ${request.auth.token.name || 'user'}!` };
});
