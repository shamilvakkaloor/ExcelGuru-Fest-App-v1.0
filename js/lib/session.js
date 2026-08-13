// Who is signed in, and what are they allowed to do.
//
// Firebase Auth proves identity. The ROLE lives in /users/{uid}, which only
// an Admin can write — so a user cannot promote themselves. Security Rules
// read the same document, meaning the browser and the database agree on
// permissions without a server in between.
import {
  signInWithEmailAndPassword, signOut, onAuthStateChanged,
  createUserWithEmailAndPassword, updatePassword, deleteUser,
  EmailAuthProvider, reauthenticateWithCredential
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";
import { auth, withSecondaryAuth, LOGIN_DOMAIN } from "./firebase.js";
import { getOne, put, remove, getAll } from "./db.js";

export const session = { user: null, role: null, refId: null, name: null, ready: false, error: null };

const listeners = new Set();
export function onSession(fn) { listeners.add(fn); if (session.ready) fn(session); return () => listeners.delete(fn); }
function emit() { listeners.forEach(fn => fn(session)); }

/**
 * Resolve once the first auth state is known.
 *
 * THIS FUNCTION MUST NEVER HANG. `boot()` awaits it before rendering
 * anything, so a promise that never settles leaves the loading screen up
 * forever with no error on screen — which is exactly what happened when the
 * `users/{uid}` read threw. The rejection escaped the async callback,
 * `resolve()` was never reached, and the app simply stopped.
 *
 * Three guards now:
 *   1. the profile read is wrapped, so a denied or failed read still signs
 *      the person in — with no role, which the router treats as "not
 *      permitted here" rather than as a dead app;
 *   2. `settle()` is idempotent and called from a finally;
 *   3. a hard timeout resolves anyway if Firebase Auth never answers, e.g.
 *      on a captive-portal venue wifi that swallows the request.
 */
export const SESSION_TIMEOUT_MS = 12000;

export function startSessionWatch() {
  return new Promise(resolve => {
    let settled = false;
    const settle = () => { if (!settled) { settled = true; resolve(session); } };

    const timer = setTimeout(() => {
      if (settled) return;
      session.ready = true;
      session.error = "Could not reach Firebase Authentication in time.";
      emit();
      settle();
    }, SESSION_TIMEOUT_MS);

    onAuthStateChanged(auth, async user => {
      try {
        if (user) {
          let profile = null;
          try {
            profile = await getOne("users", user.uid);
          } catch (err) {
            // A missing or unreadable role document is a real state — an
            // account whose role doc was deleted, or rules that deny the
            // read. It must not stop the app from starting.
            console.error("Could not read the role document for " + user.uid, err);
            session.error = "Signed in, but your role could not be read.";
          }
          session.user  = user;
          session.role  = profile?.role  ?? null;
          session.refId = profile?.refId ?? null;
          session.name  = profile?.name  ?? "Account";
        } else {
          Object.assign(session, { user: null, role: null, refId: null, name: null, error: null });
        }
      } finally {
        session.ready = true;
        clearTimeout(timer);
        emit();
        settle();
      }
    }, err => {
      // onAuthStateChanged's own error channel — previously ignored entirely.
      console.error("Auth state watch failed", err);
      session.ready = true;
      session.error = err?.message || "Authentication failed.";
      clearTimeout(timer);
      emit();
      settle();
    });
  });
}

export const is = {
  admin:   () => session.role === "admin",
  coAdmin: () => session.role === "coAdmin",
  staff:   () => session.role === "admin" || session.role === "coAdmin",
  judge:   () => session.role === "judge",
  house:   () => session.role === "house",
  signedIn:() => !!session.user
};

/** Synthetic address for an account. No mail is ever sent to it. */
export function loginEmail(slug) { return `${slug}@${LOGIN_DOMAIN}`; }

/**
 * Wait until the session reflects a specific signed-in uid.
 *
 * B1 — THE LOGIN LANDING BUG.
 *
 * signInWithEmailAndPassword resolves as soon as Firebase Auth accepts the
 * credential. The onAuthStateChanged callback that reads the role document
 * runs AFTER that. So login() used to return with session.role still null,
 * homeForRole() returned "/" — the public home — and the person had to press
 * Log in a second time, by which point the role had arrived and they were
 * sent to their panel.
 *
 * Resolving only once the role has landed makes the first press behave like
 * the second.
 */
function sessionFor(uid, timeoutMs = 8000) {
  if (session.user?.uid === uid && session.ready) return Promise.resolve(session);
  return new Promise(resolve => {
    let done = false;
    const finish = () => { if (!done) { done = true; off(); clearTimeout(timer); resolve(session); } };
    const off = onSession(s => { if (s.ready && s.user?.uid === uid) finish(); });
    // Never hang: an unreadable role document must still let the person in,
    // with the degraded-session notice explaining why nothing role-specific
    // is available.
    const timer = setTimeout(finish, timeoutMs);
  });
}

export async function login(slug, password) {
  const cred = await signInWithEmailAndPassword(auth, loginEmail(slug), padPassword(password));
  await sessionFor(cred.user.uid);
  return session;
}

export async function logout() { await signOut(auth); }

/** Names shown in the login dropdown. Public — contains no secrets. */
export async function loginNames(role) {
  const rows = await getAll("loginDirectory");
  return rows.filter(r => r.role === role).sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * First-run only: creates the Admin account on the MAIN Auth connection,
 * not the secondary one.
 *
 * This is deliberately different from createAccount(). Security Rules only
 * allow the Admin's own role document to be written by someone signed in
 * AS that exact uid while no fest exists yet — so signing in must happen
 * before the role document write, not after. Since nobody is signed in to
 * begin with, there is no existing session to protect here, so using the
 * main connection directly (which signs the browser in as a side effect)
 * is both safe and necessary.
 */
export async function bootstrapAdmin({ password, name = "Admin" }) {
  const slug = "admin";
  const cred = await createUserWithEmailAndPassword(auth, loginEmail(slug), padPassword(password));
  const uid = cred.user.uid;
  await put("users", uid, { role: "admin", refId: uid, name });
  await put("loginDirectory", slug, { name, role: "admin", slug, uid, refId: uid });
  return uid;
}

/**
 * Create an account without disturbing the current session (see
 * withSecondaryAuth). Writes three things: the Auth user, the role
 * document, and the public dropdown entry.
 *
 * Only for use by an already-signed-in Admin creating OTHER accounts
 * (judges, houses, co-admins) — not for the first-run Admin itself, which
 * needs bootstrapAdmin() above instead.
 */
export async function createAccount({ slug, password, role, name, refId }) {
  const uid = await withSecondaryAuth(async secAuth => {
    const cred = await createUserWithEmailAndPassword(secAuth, loginEmail(slug), padPassword(password));
    return cred.user.uid;
  });
  await put("users", uid, { role, refId: refId ?? uid, name });
  await put("loginDirectory", slug, { name, role, slug, uid, refId: refId ?? uid });
  return uid;
}

/**
 * Remove an account's access. The Firebase Auth user itself can only be
 * deleted by an admin SDK or by the user themselves, so we revoke the role
 * document instead — without it, every Security Rule denies the request and
 * the account is inert.
 */
export async function revokeAccount({ slug, uid }) {
  await remove("users", uid);
  await remove("loginDirectory", slug);
}

/**
 * Give an existing person a new password.
 *
 * The browser SDK cannot change another user's password, and cannot delete
 * their Auth account either — both are Admin-SDK-only operations that need
 * a server. So instead of editing the old login, this issues a NEW one and
 * revokes the old.
 *
 * The person keeps their name, their record and all their data (same
 * refId); only the hidden slug behind the login changes, from e.g.
 * "ann-mary" to "ann-mary-r2". Since they sign in by picking their name
 * from a dropdown, they never see the difference.
 *
 * The old Auth entry is left orphaned in Firebase console → Authentication.
 * It is inert: its role document is gone, so every Security Rule denies it.
 */
export async function reissueLogin({ oldSlug, oldUid, role, name, refId, password }) {
  const base = slugify(name);
  const existing = await getAll("loginDirectory");
  const taken = new Set(existing.map(r => r.id));
  let slug = base, n = 2;
  while (taken.has(slug)) slug = `${base}-r${n++}`;

  const uid = await withSecondaryAuth(async secAuth => {
    const cred = await createUserWithEmailAndPassword(secAuth, loginEmail(slug), padPassword(password));
    return cred.user.uid;
  });

  await put("users", uid, { role, refId, name });
  await put("loginDirectory", slug, { name, role, slug, uid, refId });

  // Revoke the old one only after the new one exists, so a failure midway
  // leaves the person with a working login rather than none.
  if (oldUid) await remove("users", oldUid);
  if (oldSlug && oldSlug !== slug) await remove("loginDirectory", oldSlug);

  return { slug, uid };
}

export async function changeOwnPassword(currentPassword, newPassword) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in.");
  const cred = EmailAuthProvider.credential(user.email, padPassword(currentPassword));
  await reauthenticateWithCredential(user, cred);
  await updatePassword(user, padPassword(newPassword));
}

/**
 * Delete the currently signed-in Auth user permanently.
 *
 * The client SDK can only ever delete the account making the request — it
 * cannot delete anyone else's login. This is why a full in-app reset can
 * revoke every other account's access (by removing its role document) but
 * can only fully erase the ONE account doing the resetting.
 */
export async function deleteOwnAccount(currentPassword) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in.");
  const cred = EmailAuthProvider.credential(user.email, padPassword(currentPassword));
  await reauthenticateWithCredential(user, cred);   // required before a sensitive delete
  await deleteUser(user);
}

/**
 * Short passwords, despite Firebase's 6-character floor.
 *
 * Firebase Auth hard-rejects anything under 6 characters and the limit is
 * not configurable. So what the person types is not what Firebase stores:
 * a fixed suffix is appended before the credential is sent. Typing "abc"
 * sends "abc" + PAD, which clears Firebase's bar while letting the login
 * box accept 3 characters.
 *
 * The suffix is a constant, not a secret — it adds no real strength. A
 * 3-character password is genuinely weak and guessable by hand; that is an
 * accepted trade for usability at a school fest, not a security claim.
 *
 * Changing PAD would invalidate every existing password, so it must stay
 * fixed for the life of a deployment.
 */
const PAD = "-fst26";
export const MIN_PASSWORD = 3;
export const MAX_PASSWORD = 8;

/** What actually goes to Firebase Auth. Never shown to anyone. */
export function padPassword(pw) { return String(pw) + PAD; }

export function validatePassword(pw, confirm) {
  if (!pw || pw.length < MIN_PASSWORD) return `Password must be at least ${MIN_PASSWORD} characters.`;
  if (pw.length > MAX_PASSWORD) return `Password must be at most ${MAX_PASSWORD} characters.`;
  if (confirm !== undefined && pw !== confirm) return "Passwords do not match.";
  return null;
}

/** URL-safe id derived from a display name, e.g. "Ann Mary" → "ann-mary". */
export function slugify(s) {
  return String(s).toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "acct";
}
