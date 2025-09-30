import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import corsLib from "cors";

admin.initializeApp();
const db = admin.firestore();

// Use London region for all functions
const REGION = "europe-west2";
const f = functions.region(REGION);

// Fix cors import
const cors = corsLib({ origin: true });

/**
 * Example: Callable function to get user data
 */
export const getUserData = f.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "User must be authenticated.");
  }

  const userRef = db.collection("users").doc(context.auth.uid);
  const doc = await userRef.get();

  if (!doc.exists) {
    throw new functions.https.HttpsError("not-found", "User not found.");
  }

  return doc.data();
});

/**
 * Example: Update app settings
 */
export const updateSettings = f.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "User must be authenticated.");
  }

  await db.collection("settings").doc("app").set(data, { merge: true });
  return { success: true };
});

/**
 * Example: Trigger when new user created
 */
export const onUserCreated = f.auth.user().onCreate(async (user) => {
  await db.collection("users").doc(user.uid).set({
    email: user.email,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
});

/**
 * Example: Trigger when user deleted
 */
export const onUserDeleted = f.auth.user().onDelete(async (user) => {
  await db.collection("users").doc(user.uid).delete();
});

/**
 * Example: Callable delete user (only admin allowed)
 */
export const deleteUser = f.https.onCall(async (data, context) => {
  if (!context.auth?.token.admin) {
    throw new functions.https.HttpsError("permission-denied", "Only admins can delete users.");
  }

  const { uid } = data;
  if (!uid) {
    throw new functions.https.HttpsError("invalid-argument", "UID is required.");
  }

  await admin.auth().deleteUser(uid);
  await db.collection("users").doc(uid).delete();

  return { success: true };
});
