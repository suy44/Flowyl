/**
 * Flowyl — Google Firebase Integration
 * Handles:
 *  1. Google Authentication (Sign in with Google)
 *  2. User Profile Storage in Cloud Firestore
 *  3. Real-Time API Usage Counter Tracking
 *
 * HOW TO CONFIGURE:
 * 1. Go to https://console.firebase.google.com/
 * 2. Create a free project (Spark Plan = 100% Free)
 * 3. Go to "Project Settings" -> "General" -> "Your apps" -> Web (</>)
 * 4. Copy the firebaseConfig object and paste your credentials below.
 * 5. In Firebase Console -> Authentication -> Sign-in method -> Enable "Google".
 * 6. In Firebase Console -> Firestore Database -> Create database (in test or production mode).
 */

(function () {
  "use strict";

  // ─── Paste Your Firebase Project Credentials Here ─────────────────
  const firebaseConfig = {
    apiKey: "YOUR_FIREBASE_API_KEY",
    authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT_ID.appspot.com",
    messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
    appId: "YOUR_APP_ID",
  };

  // Check if user has entered real keys
  const isConfigured =
    firebaseConfig.apiKey &&
    !firebaseConfig.apiKey.startsWith("YOUR_") &&
    firebaseConfig.projectId &&
    !firebaseConfig.projectId.startsWith("YOUR_");

  let app = null;
  let auth = null;
  let db = null;
  let googleProvider = null;

  if (isConfigured && typeof firebase !== "undefined") {
    try {
      app = firebase.initializeApp(firebaseConfig);
      auth = firebase.auth();
      db = firebase.firestore();
      googleProvider = new firebase.auth.GoogleAuthProvider();
      googleProvider.setCustomParameters({ prompt: "select_account" });
      console.log("[Flowyl Firebase] Connected successfully to project:", firebaseConfig.projectId);
    } catch (err) {
      console.warn("[Flowyl Firebase] Initialization warning:", err.message);
    }
  } else {
    console.log(
      "[Flowyl Firebase] Running in Local Storage mode. Paste your Firebase credentials in public/firebase-config.js to enable live Google Sign-In & Firestore sync."
    );
  }

  // ─── Flowyl Firebase Public API Helper ─────────────────────────────
  window.FlowylFirebase = {
    isConfigured: isConfigured,

    /**
     * Sign in with Google Popup
     */
    async signInWithGoogle() {
      if (!isConfigured || !auth || !googleProvider) {
        // Fallback for testing when Firebase config hasn't been pasted yet
        const mockEmail = prompt("Enter developer email for demo Google sign-in:", "alex.dev@gmail.com");
        if (!mockEmail) return null;
        const mockUser = {
          uid: `goog_${Math.random().toString(36).substring(2, 10)}`,
          email: mockEmail,
          displayName: mockEmail.split("@")[0],
          photoURL: "flowyl-icon.png",
        };
        localStorage.setItem("flowyl_firebase_user", JSON.stringify(mockUser));
        return mockUser;
      }

      try {
        const result = await auth.signInWithPopup(googleProvider);
        return result.user;
      } catch (err) {
        console.error("Google sign-in error:", err);
        throw err;
      }
    },

    /**
     * Sign out current user
     */
    async signOut() {
      if (isConfigured && auth) {
        await auth.signOut();
      }
      localStorage.removeItem("flowyl_firebase_user");
    },

    /**
     * Observe auth state changes
     */
    onAuthStateChanged(callback) {
      if (isConfigured && auth) {
        auth.onAuthStateChanged((user) => {
          callback(user);
        });
      } else {
        // Local mode fallback
        const saved = localStorage.getItem("flowyl_firebase_user");
        callback(saved ? JSON.parse(saved) : null);
      }
    },

    /**
     * Get or create user record with API key & usage counter in Firestore
     */
    async getOrCreateUserRecord(user) {
      if (!user) return null;

      const fallbackKey = localStorage.getItem("flowyl_my_api_key") || `ak_live_${Math.random().toString(36).substring(2, 10)}${Math.random().toString(36).substring(2, 10)}`;

      if (!isConfigured || !db) {
        // Local storage record
        let record = JSON.parse(localStorage.getItem(`flowyl_user_${user.uid}`) || "null");
        if (!record) {
          record = {
            uid: user.uid,
            email: user.email || "developer@example.com",
            displayName: user.displayName || "Developer",
            apiKey: fallbackKey,
            tier: "free",
            usage: 0,
            monthly_limit: 5000,
            created_at: new Date().toISOString(),
          };
          localStorage.setItem(`flowyl_user_${user.uid}`, JSON.stringify(record));
          localStorage.setItem("flowyl_my_api_key", record.apiKey);
        }
        return record;
      }

      try {
        const docRef = db.collection("users").doc(user.uid);
        const docSnap = await docRef.get();

        if (docSnap.exists) {
          const data = docSnap.data();
          localStorage.setItem("flowyl_my_api_key", data.apiKey);
          return data;
        } else {
          // Provision new key for this Google user
          const newKey = `ak_live_${Math.random().toString(36).substring(2, 10)}${Math.random().toString(36).substring(2, 10)}`;
          const newRecord = {
            uid: user.uid,
            email: user.email,
            displayName: user.displayName || user.email.split("@")[0],
            photoURL: user.photoURL || null,
            apiKey: newKey,
            tier: "free",
            usage: 0,
            monthly_limit: 5000,
            created_at: firebase.firestore.FieldValue.serverTimestamp(),
          };

          await docRef.set(newRecord);
          localStorage.setItem("flowyl_my_api_key", newKey);

          // Also register on server API keys endpoint
          try {
            await fetch("/v1/keys/free", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                project_name: newRecord.displayName,
                email: newRecord.email,
              }),
            });
          } catch (_) {}

          return newRecord;
        }
      } catch (err) {
        console.error("Firestore user fetch error:", err);
        return {
          uid: user.uid,
          email: user.email,
          apiKey: fallbackKey,
          tier: "free",
          usage: 0,
          monthly_limit: 5000,
        };
      }
    },

    /**
     * Increment usage counter for a user
     */
    async incrementUsage(uid, count = 1) {
      if (!uid) return;

      if (!isConfigured || !db) {
        const key = `flowyl_user_${uid}`;
        const record = JSON.parse(localStorage.getItem(key) || "{}");
        if (record) {
          record.usage = (record.usage || 0) + count;
          localStorage.setItem(key, JSON.stringify(record));
        }
        return;
      }

      try {
        const docRef = db.collection("users").doc(uid);
        await docRef.update({
          usage: firebase.firestore.FieldValue.increment(count),
          last_activity: firebase.firestore.FieldValue.serverTimestamp(),
        });
      } catch (err) {
        console.warn("Firestore increment usage error:", err);
      }
    },

    /**
     * Founder Admin: Fetch all registered users & live usage from Firestore
     */
    async getAllUsersForAdmin() {
      if (!isConfigured || !db) {
        return null;
      }

      try {
        const snapshot = await db.collection("users").orderBy("created_at", "desc").limit(100).get();
        return snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
      } catch (err) {
        console.warn("Firestore fetch all users error:", err);
        return null;
      }
    },
  };
})();
