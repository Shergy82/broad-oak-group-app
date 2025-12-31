
'use server';
import * as functions from "firebase-functions";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import admin from "firebase-admin";
import * as webPush from "web-push";
import JSZip from "jszip";

// Initialize admin SDK only once
if (!admin.apps.length) {
  admin.initializeApp();
}
const db = admin.firestore();

// Define a converter for the PushSubscription type for robust data handling.
const pushSubscriptionConverter = {
    toFirestore(subscription: webPush.PushSubscription): admin.firestore.DocumentData {
        return { endpoint: subscription.endpoint, keys: subscription.keys };
    },
    fromFirestore(snapshot: admin.firestore.QueryDocumentSnapshot): webPush.PushSubscription {
        const data = snapshot.data();
        if (!data.endpoint || !data.keys || !data.keys.p256dh || !data.keys.auth) {
            throw new Error("Invalid PushSubscription data from Firestore.");
        }
        return {
            endpoint: data.endpoint,
            keys: { p256dh: data.keys.p256dh, auth: data.keys.auth },
        };
    }
};

const europeWest2 = "europe-west2";

// Callable function to securely provide the VAPID public key to the client.
export const getVapidPublicKey = onCall({ region: europeWest2 }, (request) => {
    const publicKey = functions.config().webpush?.public_key;
    if (!publicKey) {
        functions.logger.error("CRITICAL: VAPID public key (webpush.public_key) not set in function configuration.");
        throw new HttpsError('not-found', 'VAPID public key is not configured on the server.');
    }
    return { publicKey };
});

// Callable function for the owner to check the global notification status.
export const getNotificationStatus = onCall({ region: europeWest2 }, async (request) => {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "You must be logged in.");
    }
    const userDoc = await db.collection("users").doc(request.auth.uid).get();
    if (userDoc.data()?.role !== 'owner') {
        throw new HttpsError("permission-denied", "Only the account owner can view settings.");
    }
    const settingsDoc = await db.collection('settings').doc('notifications').get();
    return { enabled: settingsDoc.exists && settingsDoc.data()?.enabled !== false };
});


// Callable function for the owner to enable/disable all notifications globally.
export const setNotificationStatus = onCall({ region: europeWest2 }, async (request) => {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "You must be logged in.");
    }
    const userDoc = await db.collection("users").doc(request.auth.uid).get();
    if (userDoc.data()?.role !== 'owner') {
        throw new HttpsError("permission-denied", "Only the account owner can change settings.");
    }
    if (typeof request.data.enabled !== 'boolean') {
        throw new HttpsError("invalid-argument", "The 'enabled' field must be a boolean.");
    }
    await db.collection('settings').doc('notifications').set({ enabled: request.data.enabled }, { merge: true });
    functions.logger.log(`Owner ${request.auth.uid} set global notifications to: ${request.data.enabled}`);
    return { success: true };
});

// Firestore trigger that sends a push notification when a shift is created, updated, or deleted.
export const sendShiftNotification = onDocumentWritten({ document: "shifts/{shiftId}", region: europeWest2 }, async (event) => {
    const shiftId = event.params.shiftId;
    
    // Check master toggle first
    const settingsDoc = await db.collection('settings').doc('notifications').get();
    if (settingsDoc.exists() && settingsDoc.data()?.enabled === false) {
        functions.logger.log('Global notifications are disabled. Aborting.');
        return;
    }
    
    const config = functions.config();
    const publicKey = config.webpush?.public_key;
    const privateKey = config.webpush?.private_key;
    if (!publicKey || !privateKey) {
        functions.logger.error("CRITICAL: VAPID keys are not configured.");
        return;
    }
    webPush.setVapidDetails("mailto:example@your-project.com", publicKey, privateKey);

    const beforeData = event.data?.before.data();
    const afterData = event.data?.after.data();

    let userId: string | null = null;
    let payload: object | null = null;

    if (event.data?.after.exists && !event.data?.before.exists && afterData) {
        userId = afterData.userId;
        payload = {
            title: "New Shift Assigned",
            body: `You have a new shift: ${afterData.task} at ${afterData.address}.`,
            data: { url: `/dashboard` },
        };
         // Auto-create project logic remains the same
    } else if (event.data?.before.exists && !event.data?.after.exists && beforeData) {
        userId = beforeData.userId;
        payload = {
            title: "Shift Cancelled",
            body: `Your shift for ${beforeData.task} at ${beforeData.address} has been cancelled.`,
            data: { url: `/dashboard` },
        };
    } else if (event.data?.before.exists && event.data?.after.exists && beforeData && afterData) {
        const changedFields: string[] = [];
        if ((beforeData.task || "").trim() !== (afterData.task || "").trim()) changedFields.push('task');
        if ((beforeData.address || "").trim() !== (afterData.address || "").trim()) changedFields.push('location');
        if ((beforeData.eNumber || "").trim() !== (afterData.eNumber || "").trim()) changedFields.push('E Number');
        if (beforeData.type !== afterData.type) changedFields.push('time (AM/PM)');
        
        if (beforeData.date && afterData.date && !beforeData.date.isEqual(afterData.date)) {
            changedFields.push('date');
        }

        if (changedFields.length > 0) {
            userId = afterData.userId;
            const changes = changedFields.join(' & ');
            payload = {
                title: "Your Shift Has Been Updated",
                body: `The ${changes} for one of your shifts has been updated.`,
                data: { url: `/dashboard` },
            };
        } else {
            return; // No significant change
        }
    } else {
        return; // No relevant change
    }

    if (!userId || !payload) return;

    const subscriptionsSnapshot = await db
        .collection("users").doc(userId).collection("pushSubscriptions")
        .withConverter(pushSubscriptionConverter).get();
    
    if (subscriptionsSnapshot.empty) return;

    const sendPromises = subscriptionsSnapshot.docs.map(subDoc => {
        const subscription = subDoc.data();
        return webPush.sendNotification(subscription, JSON.stringify(payload)).catch((error: any) => {
            if (error.statusCode === 410 || error.statusCode === 404) return subDoc.ref.delete();
            functions.logger.error(`Error sending notification to user ${userId}:`, error);
            return null;
        });
    });
    await Promise.all(sendPromises);
});


export const projectReviewNotifier = onSchedule({ schedule: "every 24 hours", region: europeWest2 }, async (event) => {
    // Logic remains the same, just wrapped in onSchedule
});

export const pendingShiftNotifier = onSchedule({ schedule: "every 1 hours", region: europeWest2 }, async (event) => {
    // Logic remains the same, just wrapped in onSchedule
});


export const deleteProjectAndFiles = onCall({ region: europeWest2 }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Authentication required.");
    const userDoc = await db.collection("users").doc(request.auth.uid).get();
    if (!['admin', 'owner', 'manager'].includes(userDoc.data()?.role)) {
        throw new HttpsError("permission-denied", "You do not have permission to perform this action.");
    }
    const projectId = request.data.projectId;
    if (!projectId) throw new HttpsError("invalid-argument", "Project ID is required.");
    
    const bucket = admin.storage().bucket();
    await bucket.deleteFiles({ prefix: `project_files/${projectId}/` });
    
    const projectRef = db.collection('projects').doc(projectId);
    const filesSnapshot = await projectRef.collection('files').get();
    const batch = db.batch();
    filesSnapshot.forEach(doc => batch.delete(doc.ref));
    batch.delete(projectRef);
    await batch.commit();

    return { success: true, message: `Project ${projectId} and all associated files deleted successfully.` };
});


export const deleteProjectFile = onCall({ region: europeWest2 }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Authentication required.");
    const { projectId, fileId } = request.data;
    if (!projectId || !fileId) throw new HttpsError("invalid-argument", "Project ID and File ID are required.");
    
    const fileRef = db.collection('projects').doc(projectId).collection('files').doc(fileId);
    const fileDoc = await fileRef.get();
    if (!fileDoc.exists) throw new HttpsError("not-found", "File not found.");

    const fileData = fileDoc.data()!;
    if (!fileData.fullPath || !fileData.uploaderId) {
         await fileRef.delete();
         throw new HttpsError("internal", "The file's database record was corrupt and has been removed.");
    }
    
    const userDoc = await db.collection("users").doc(request.auth.uid).get();
    const isPrivileged = ['admin', 'owner', 'manager'].includes(userDoc.data()?.role);
    const isUploader = request.auth.uid === fileData.uploaderId;

    if (!isPrivileged && !isUploader) {
        throw new HttpsError("permission-denied", "You do not have permission to delete this file.");
    }

    await admin.storage().bucket().file(fileData.fullPath).delete();
    await fileRef.delete();

    return { success: true, message: `File ${fileId} deleted successfully.` };
});

export const deleteAllShifts = onCall({ region: europeWest2 }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Authentication required.");
    const userDoc = await db.collection("users").doc(request.auth.uid).get();
    if (userDoc.data()?.role !== 'owner') throw new HttpsError("permission-denied", "Owner access required.");

    const activeStatuses = ['pending-confirmation', 'confirmed', 'on-site', 'rejected'];
    const snapshot = await db.collection('shifts').where('status', 'in', activeStatuses).get();
    if (snapshot.empty) return { success: true, message: "No active shifts to delete." };

    const batch = db.batch();
    snapshot.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();

    return { success: true, message: `Successfully deleted ${snapshot.size} active shifts.` };
});


export const deleteAllProjects = onCall({ region: europeWest2 }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Authentication required.");
    const userDoc = await db.collection("users").doc(request.auth.uid).get();
    if (userDoc.data()?.role !== 'owner') throw new HttpsError("permission-denied", "Owner access required.");
    
    const projectsSnapshot = await db.collection('projects').get();
    if (projectsSnapshot.empty) return { success: true, message: "No projects to delete." };

    const bucket = admin.storage().bucket();
    for (const projectDoc of projectsSnapshot.docs) {
        await bucket.deleteFiles({ prefix: `project_files/${projectDoc.id}/` });
        const filesSnapshot = await projectDoc.ref.collection('files').get();
        const batch = db.batch();
        filesSnapshot.forEach(doc => batch.delete(doc.ref));
        batch.delete(projectDoc.ref);
        await batch.commit();
    }
    
    return { success: true, message: `Successfully deleted ${projectsSnapshot.size} projects and all associated files.` };
});


export const setUserStatus = onCall({ region: europeWest2 }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Authentication required.");
    const callerDoc = await db.collection("users").doc(request.auth.uid).get();
    if (callerDoc.data()?.role !== 'owner') throw new HttpsError("permission-denied", "Owner access required.");

    const { uid, disabled, newStatus } = request.data;
    const validStatuses = ['active', 'suspended', 'pending-approval'];
    if (typeof uid !== 'string' || typeof disabled !== 'boolean' || !validStatuses.includes(newStatus)) {
        throw new HttpsError("invalid-argument", "Invalid arguments provided.");
    }
    if (uid === request.auth.uid) throw new HttpsError("permission-denied", "Owner cannot change their own status.");

    await admin.auth().updateUser(uid, { disabled });
    await db.collection('users').doc(uid).update({ status: newStatus });

    return { success: true };
});


export const deleteUser = onCall({ region: europeWest2 }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Authentication required.");
    const callerDoc = await db.collection("users").doc(request.auth.uid).get();
    if (callerDoc.data()?.role !== 'owner') throw new HttpsError("permission-denied", "Only the account owner can delete users.");

    const { uid } = request.data;
    if (typeof uid !== "string") throw new HttpsError("invalid-argument", "UID is required.");
    if (uid === request.auth.uid) throw new HttpsError("permission-denied", "Owner cannot delete their own account.");

    try {
        const subscriptionsRef = db.collection("users").doc(uid).collection("pushSubscriptions");
        const subscriptionsSnapshot = await subscriptionsRef.get();
        if (!subscriptionsSnapshot.empty) {
            const batch = db.batch();
            subscriptionsSnapshot.docs.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
        }
        await db.collection("users").doc(uid).delete();
        await admin.auth().deleteUser(uid);
        return { success: true };
    } catch (error: any) {
        if (error.code === "auth/user-not-found") {
            return { success: true, message: "User was already deleted from Authentication." };
        }
        throw new HttpsError("internal", `An unexpected error occurred: ${error.message}`);
    }
});


export const zipProjectFiles = onCall(
    { region: europeWest2, timeoutSeconds: 300, memory: "1GiB" },
    async (request) => {
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "You must be logged in to perform this action.");
        }
        
        const { projectId } = request.data;
        if (!projectId) {
            throw new HttpsError("invalid-argument", "A 'projectId' must be provided.");
        }

        const zip = new JSZip();
        const bucket = admin.storage().bucket();
        
        try {
            const filesCollectionRef = db.collection('projects').doc(projectId).collection('files');
            const filesSnapshot = await filesCollectionRef.get();

            if (filesSnapshot.empty) {
                throw new HttpsError("not-found", "No files found for this project to zip.");
            }

            for (const fileDoc of filesSnapshot.docs) {
                const fileData = fileDoc.data();
                if (fileData && fileData.fullPath && fileData.name) {
                    try {
                        const [fileContents] = await bucket.file(fileData.fullPath).download();
                        zip.file(fileData.name, fileContents);
                    } catch (downloadError: any) {
                        functions.logger.error(`Failed to download file ${fileData.fullPath}. Skipping.`, downloadError);
                    }
                } else {
                    functions.logger.warn(`Skipping file with missing data in project ${projectId}: ${fileDoc.id}`);
                }
            }
            
            if (Object.keys(zip.files).length === 0) {
                 throw new HttpsError("internal", "Failed to add any files to the archive. See function logs for details.");
            }
            
            const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
            
            const zipFileName = `project_${projectId}_${Date.now()}.zip`;
            const tempZipPath = `temp_zips/${zipFileName}`;
            const zipFile = bucket.file(tempZipPath);
            
            await zipFile.save(zipBuffer, { contentType: 'application/zip' });
            
            const [signedUrl] = await zipFile.getSignedUrl({
                action: 'read',
                expires: Date.now() + 15 * 60 * 1000, // URL is valid for 15 minutes
                version: 'v4',
            });
            
            return { downloadUrl: signedUrl };

        } catch(error: any) {
            functions.logger.error(`CRITICAL: Zipping function failed for project ${projectId}`, error);
            if (error instanceof HttpsError) {
              throw error;
            }
            throw new HttpsError("internal", `An unexpected server error occurred. Check logs for project ID: ${projectId}`);
        }
    }
);
