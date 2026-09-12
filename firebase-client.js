// Firebase Client SDK Integration for Ask Fletch User Account Management
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/11.4.0/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
  updateProfile
} from "https://www.gstatic.com/firebasejs/11.4.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  orderBy,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/11.4.0/firebase-firestore.js";

// Load configuration from firebase-applet-config.json
let firebaseConfig = null;
let app = null;
let auth = null;
let db = null;
let isInitialized = false;

export async function loadFirebaseConfig() {
  if (firebaseConfig) return firebaseConfig;
  try {
    const res = await fetch("/firebase-applet-config.json");
    if (res.ok) {
      firebaseConfig = await res.json();
      return firebaseConfig;
    }
  } catch (err) {
    console.warn("Could not load /firebase-applet-config.json:", err);
  }
  return null;
}

export async function initFirebase() {
  if (isInitialized) return { app, auth, db, firebaseConfig };

  const config = await loadFirebaseConfig();
  if (!config || !config.apiKey) {
    console.error("Firebase configuration missing or incomplete.");
    return null;
  }

  if (!getApps().length) {
    app = initializeApp({
      apiKey: config.apiKey,
      authDomain: config.authDomain,
      projectId: config.projectId,
      storageBucket: config.storageBucket,
      messagingSenderId: config.messagingSenderId,
      appId: config.appId
    });
  } else {
    app = getApps()[0];
  }

  auth = getAuth(app);
  db = getFirestore(app, config.firestoreDatabaseId || "(default)");
  isInitialized = true;

  // Validate Connection to Firestore on startup (Mandated by Firebase Skill)
  testConnection();

  return { app, auth, db, firebaseConfig };
}

// CRITICAL CONSTRAINT: Test connection to Firestore on initial boot
export async function testConnection() {
  if (!db) return;
  try {
    await getDocFromServer(doc(db, "test", "connection"));
  } catch (error) {
    if (error instanceof Error && error.message.includes("the client is offline")) {
      console.error("Please check your Firebase configuration: Firestore client is offline.");
    }
  }
}

// -------------------------------------------------------------
// Authentication Operations
// -------------------------------------------------------------

export async function firebaseSignInEmail(email, password) {
  await initFirebase();
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

export async function firebaseSignInGoogle() {
  await initFirebase();
  const provider = new GoogleAuthProvider();
  const cred = await signInWithPopup(auth, provider);
  return cred.user;
}

export async function firebaseSignOut() {
  if (!auth) return;
  await signOut(auth);
}

export function onFirebaseAuthState(callback) {
  initFirebase().then(() => {
    if (auth) {
      onAuthStateChanged(auth, callback);
    }
  });
}

// -------------------------------------------------------------
// Firestore Error Handling (Firebase Skill Standard)
// -------------------------------------------------------------

export const OperationType = {
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
  LIST: 'list',
  GET: 'get',
  WRITE: 'write',
};

export function handleFirestoreError(error, operationType, path = null) {
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth?.currentUser?.uid || null,
      email: auth?.currentUser?.email || null,
      emailVerified: auth?.currentUser?.emailVerified ?? null,
      isAnonymous: auth?.currentUser?.isAnonymous ?? null,
      tenantId: auth?.currentUser?.tenantId || null,
      providerInfo: auth?.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// -------------------------------------------------------------
// Firestore User Account Management Operations
// -------------------------------------------------------------

/**
 * Fetches all user account profiles from Firestore
 */
export async function getFirestoreUsers() {
  await initFirebase();
  if (!db) return [];
  const pathForGetDocs = 'users';
  try {
    const q = query(collection(db, pathForGetDocs), orderBy("createdAt", "desc"));
    const snapshot = await getDocs(q);
    const users = [];
    snapshot.forEach((docSnap) => {
      users.push({ id: docSnap.id, ...docSnap.data() });
    });
    return users;
  } catch (err) {
    if (err.code === 'permission-denied' || (err.message && err.message.includes('insufficient permissions'))) {
      handleFirestoreError(err, OperationType.LIST, pathForGetDocs);
    }
    console.warn("Firestore getDocs notice:", err.message);
    return null;
  }
}

/**
 * Creates or updates a user profile document in Firestore
 */
export async function setFirestoreUser(userId, userData) {
  await initFirebase();
  if (!db) return false;
  const userPath = `users/${userId}`;
  const userRef = doc(db, "users", userId);
  const payload = {
    id: userId,
    name: userData.name || "",
    email: userData.email || "",
    role: userData.role || "agent",
    status: userData.status || "active",
    createdAt: userData.createdAt || new Date().toISOString(),
    lastLogin: userData.lastLogin || null
  };
  try {
    await setDoc(userRef, payload, { merge: true });
    return payload;
  } catch (err) {
    if (err.code === 'permission-denied' || (err.message && err.message.includes('insufficient permissions'))) {
      handleFirestoreError(err, OperationType.WRITE, userPath);
    }
    throw err;
  }
}

/**
 * Updates specific fields on an existing user in Firestore
 */
export async function updateFirestoreUser(userId, updates) {
  await initFirebase();
  if (!db) return false;
  const userPath = `users/${userId}`;
  const userRef = doc(db, "users", userId);
  try {
    await updateDoc(userRef, updates);
    return true;
  } catch (err) {
    if (err.code === 'permission-denied' || (err.message && err.message.includes('insufficient permissions'))) {
      handleFirestoreError(err, OperationType.UPDATE, userPath);
    }
    throw err;
  }
}

/**
 * Deletes a user document from Firestore
 */
export async function deleteFirestoreUser(userId) {
  await initFirebase();
  if (!db) return false;
  const userPath = `users/${userId}`;
  const userRef = doc(db, "users", userId);
  try {
    await deleteDoc(userRef);
    return true;
  } catch (err) {
    if (err.code === 'permission-denied' || (err.message && err.message.includes('insufficient permissions'))) {
      handleFirestoreError(err, OperationType.DELETE, userPath);
    }
    throw err;
  }
}

/**
 * Subscribes to real-time changes on the users collection in Firestore
 */
export function subscribeFirestoreUsers(onUsersUpdated, onError) {
  initFirebase().then(() => {
    if (!db) return;
    const pathForOnSnapshot = 'users';
    try {
      const q = query(collection(db, pathForOnSnapshot), orderBy("createdAt", "desc"));
      return onSnapshot(
        q,
        (snapshot) => {
          const users = [];
          snapshot.forEach((docSnap) => {
            users.push({ id: docSnap.id, ...docSnap.data() });
          });
          onUsersUpdated(users);
        },
        (err) => {
          if (err.code === 'permission-denied' || (err.message && err.message.includes('insufficient permissions'))) {
            try {
              handleFirestoreError(err, OperationType.LIST, pathForOnSnapshot);
            } catch (_) {}
          }
          if (onError) onError(err);
        }
      );
    } catch (e) {
      if (onError) onError(e);
    }
  });
}

// Auto-initialize on import
initFirebase().catch(console.error);
