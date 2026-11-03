// Paste the values from Firebase Console > Project settings > Your apps > Web app.
// These values are public identifiers, not secrets. Security comes from the Firestore rules.
export const firebaseConfig = {
    apiKey: "AIzaSyDSnCfvGIGRSU5H37Y2082QwrWdoqJ8gMU",
    authDomain: "taxi-quote-console.firebaseapp.com",
    projectId: "taxi-quote-console",
    appId: "1:472696217150:web:7df0bf7a908a0ce36e3b6f"
};

// The email of the one admin user you create in Firebase Authentication.
// The Admin Access popup still asks only for the passcode (that user's password).
export const ADMIN_EMAIL = "PASTE_ADMIN_EMAIL";
