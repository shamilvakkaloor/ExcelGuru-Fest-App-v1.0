// ─────────────────────────────────────────────────────────────
//  Firebase configuration for this deployment.
//
//  These values are PUBLIC by design. Anyone can read them in
//  view-source. That is not a leak — they identify the project,
//  they do not grant access to it. All security lives in
//  firestore.rules.
// ─────────────────────────────────────────────────────────────

export const firebaseConfig = {
  apiKey: "AIzaSyAHu1rGgSzShqL8qihnDVJc4rlU_kAnLV0",
  authDomain: "excelguru-fest-app-v9.firebaseapp.com",
  projectId: "excelguru-fest-app-v9",
  storageBucket: "excelguru-fest-app-v9.firebasestorage.app",
  messagingSenderId: "612183513094",
  appId: "1:612183513094:web:583823ba6e1510bf72cb87"
};

// Internal login domain. Accounts are created as
// <slug>@festlogin.local — these are never real mailboxes and no
// email is ever sent.
export const LOGIN_DOMAIN = "festlogin.local";
