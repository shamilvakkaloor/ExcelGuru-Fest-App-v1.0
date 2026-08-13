// Firebase SDK loaded straight from Google's CDN as ES modules.
// No npm, no bundler — this is what keeps the project build-free.
import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { firebaseConfig, LOGIN_DOMAIN } from "../../config.js";

export const app  = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db   = getFirestore(app);
export { LOGIN_DOMAIN };

/**
 * Runs `fn(secondaryAuth)` on a throwaway Firebase app instance.
 *
 * Why this exists: createUserWithEmailAndPassword signs the NEW user in on
 * whichever app instance you call it on. Calling it on the main app would
 * silently log the Admin out and log them back in as the judge they just
 * created. A second, disposable app instance has its own auth session, so
 * the Admin's session is never touched.
 */
export async function withSecondaryAuth(fn) {
  const name = "secondary-" + Date.now();
  const secApp = initializeApp(firebaseConfig, name);
  const secAuth = getAuth(secApp);
  try {
    return await fn(secAuth);
  } finally {
    try { await secAuth.signOut(); } catch { /* already signed out */ }
    await deleteApp(secApp);
  }
}
