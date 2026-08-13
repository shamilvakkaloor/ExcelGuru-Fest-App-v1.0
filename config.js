// ─────────────────────────────────────────────────────────────
//  Firebase configuration for this deployment.
//
//  These values are PUBLIC by design. Anyone can read them in
//  view-source. That is not a leak — they identify the project,
//  they do not grant access to it. All security lives in
//  firestore.rules.
// ─────────────────────────────────────────────────────────────

export const firebaseConfig = {
  apiKey: "AIzaSyBUMIbh3PLGrgtIe7KlzNMI0_fwiip2rTA",
  authDomain: "excelguru-fest-v8-7.firebaseapp.com",
  projectId: "excelguru-fest-v8-7",
  storageBucket: "excelguru-fest-v8-7.firebasestorage.app",
  messagingSenderId: "693364242984",
  appId: "1:693364242984:web:ce0d9fd2e75220bfa5131d"
};

// Internal login domain. Accounts are created as
// <slug>@festlogin.local — these are never real mailboxes and no
// email is ever sent.
export const LOGIN_DOMAIN = "festlogin.local";
