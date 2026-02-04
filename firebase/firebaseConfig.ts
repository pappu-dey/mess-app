import ReactNativeAsyncStorage from "@react-native-async-storage/async-storage";
import { getApps, initializeApp } from "firebase/app";
// @ts-ignore: getReactNativePersistence isn't exported in TS defs currently
import { getReactNativePersistence, initializeAuth } from "firebase/auth";
import { initializeFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBBdq5axGP4nY-iq-O1UxTmu3F7b-lpdIQ",
  authDomain: "meal-manager-15041.firebaseapp.com",
  projectId: "meal-manager-15041",
  storageBucket: "meal-manager-15041.firebasestorage.app",
  messagingSenderId: "600215505248",
  appId: "1:600215505248:web:7662c68089f310ed113605",
};

const app =
  getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

// Initialize Auth with React Native persistence
const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(ReactNativeAsyncStorage),
});

// Initialize Firestore with settings optimized for React Native
const db = initializeFirestore(app, {
  experimentalForceLongPolling: true, // Better for React Native
});

export { auth, db };

