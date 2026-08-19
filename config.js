// ─────────────────────────────────────────────────────────────
//  Firebase configuration for this deployment.
//
//  These values are PUBLIC by design. Anyone can read them in
//  view-source. That is not a leak — they identify the project,
//  they do not grant access to it. All security lives in
//  firestore.rules.
// ─────────────────────────────────────────────────────────────

export const firebaseConfig = {
  apiKey: "AIzaSyD14w1XITJjDVGu2qvHSWNmg7hQVL0dvv0",
  authDomain: "excelguru-fest-app-v1-0.firebaseapp.com",
  projectId: "excelguru-fest-app-v1-0",
  storageBucket: "excelguru-fest-app-v1-0.firebasestorage.app",
  messagingSenderId: "189875069995",
  appId: "1:189875069995:web:d87fb101bdc1fafff5b66e"
};

// Internal login domain. Accounts are created as
// <slug>@festlogin.local — these are never real mailboxes and no
// email is ever sent.
export const LOGIN_DOMAIN = "festlogin.local";
