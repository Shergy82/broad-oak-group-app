// Import the functions you need from the SDKs you need
import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

// IMPORTANT: Your Firebase project configuration will be loaded from environment variables.
// Make sure to create a .env.local file in the root of your project with your Firebase credentials.
const firebaseConfig = {
  apiKey: "AIzaSyCmch6jop04hdMOGhAq4RmYv9CuH_TRH3w",
  authDomain: "broad-oak-build-live.firebaseapp.com",
  projectId: "broad-oak-build-live",
  storageBucket: "broad-oak-build-live.firebasestorage.app",
  messagingSenderId: "510466083182",
  appId: "1:510466083182:web:6261a80a83ee1fc31bd97f",
  measurementId: "G-70KMYY2B80"
};

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;

// A flag to check if Firebase is configured
export const isFirebaseConfigured = !!firebaseConfig.apiKey;

if (isFirebaseConfigured) {
    app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
} else {
    console.error("Firebase API key is not set. This is required to connect to Firebase services. Please ensure a `.env.local` file exists in the root directory of your project with your Firebase credentials. After creating or modifying the file, you MUST restart the development server for the changes to take effect.");
}

export { app, auth, db };
