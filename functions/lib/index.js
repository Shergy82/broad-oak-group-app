"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteUser = exports.onUserDeleted = exports.onUserCreated = exports.updateSettings = exports.getUserData = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
const cors_1 = __importDefault(require("cors"));
admin.initializeApp();
const db = admin.firestore();
// Use London region for all functions
const REGION = "europe-west2";
const f = functions.region(REGION);
// Fix cors import
const cors = (0, cors_1.default)({ origin: true });
/**
 * Example: Callable function to get user data
 */
exports.getUserData = f.https.onCall(async (data, context) => {
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
exports.updateSettings = f.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "User must be authenticated.");
    }
    await db.collection("settings").doc("app").set(data, { merge: true });
    return { success: true };
});
/**
 * Example: Trigger when new user created
 */
exports.onUserCreated = f.auth.user().onCreate(async (user) => {
    await db.collection("users").doc(user.uid).set({
        email: user.email,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
});
/**
 * Example: Trigger when user deleted
 */
exports.onUserDeleted = f.auth.user().onDelete(async (user) => {
    await db.collection("users").doc(user.uid).delete();
});
/**
 * Example: Callable delete user (only admin allowed)
 */
exports.deleteUser = f.https.onCall(async (data, context) => {
    var _a;
    if (!((_a = context.auth) === null || _a === void 0 ? void 0 : _a.token.admin)) {
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
//# sourceMappingURL=index.js.map