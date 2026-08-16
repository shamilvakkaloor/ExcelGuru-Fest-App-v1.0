// ─────────────────────────────────────────────────────────────
//  Firebase configuration for this deployment.
//
//  These values are PUBLIC by design. Anyone can read them in
//  view-source. That is not a leak — they identify the project,
//  they do not grant access to it. All security lives in
//  firestore.rules.
// ─────────────────────────────────────────────────────────────

export const firebaseConfig = {
  apiKey: "AIzaSyCgHXCUgAsGQ5SpjZwi7wgc5YhL4zBA-H8",
  authDomain: "excelguru-fest-app-v9-8fbbe.firebaseapp.com",
  projectId: "excelguru-fest-app-v9-8fbbe",
  storageBucket: "excelguru-fest-app-v9-8fbbe.firebasestorage.app",
  messagingSenderId: "1076489304778",
  appId: "1:1076489304778:web:bb57e179cd9f3a0fac5233"
};

// Internal login domain. Accounts are created as
// <slug>@festlogin.local — these are never real mailboxes and no
// email is ever sent.
export const LOGIN_DOMAIN = "festlogin.local";
