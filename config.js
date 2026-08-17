// ─────────────────────────────────────────────────────────────
//  Firebase configuration for this deployment.
//
//  These values are PUBLIC by design. Anyone can read them in
//  view-source. That is not a leak — they identify the project,
//  they do not grant access to it. All security lives in
//  firestore.rules.
// ─────────────────────────────────────────────────────────────

export const firebaseConfig = {
  apiKey: "AIzaSyCILGu7-XPOt2fMo-r7rlDgolY08faRRrY",
  authDomain: "excelguru-fest-app-v9-2.firebaseapp.com",
  projectId: "excelguru-fest-app-v9-2",
  storageBucket: "excelguru-fest-app-v9-2.firebasestorage.app",
  messagingSenderId: "635468997883",
  appId: "1:635468997883:web:bcf3c8d0b98588a69ebc5e"
};

// Internal login domain. Accounts are created as
// <slug>@festlogin.local — these are never real mailboxes and no
// email is ever sent.
export const LOGIN_DOMAIN = "festlogin.local";
