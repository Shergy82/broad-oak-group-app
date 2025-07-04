
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
// import * as webPush from "web-push";
import * as crypto from "crypto";
import { defineString } from "firebase-functions/params";

admin.initializeApp();
const db = admin.firestore();

/*
 * NOTE: All push notification functionality has been temporarily disabled
 * to ensure the application can be deployed successfully. The 'web-push'
 * library was causing persistent build failures.
 *
 * The functions below (getVapidPublicKey, generateVapidKeys, sendShiftNotification)
 * have been commented out to remove the dependency.
 */

