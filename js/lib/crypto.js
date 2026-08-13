// Salted password hashing for the delete guard — ARCHITECTURE section 11.
//
// Web Crypto's SubtleCrypto, no library. SHA-256 over the password plus a
// random per-fest salt, so two fests using the same guard word don't hash
// identically and a stored hash can't be reversed by a lookup table.
//
// WHAT THIS DOES AND DOES NOT PROTECT AGAINST, STATED HONESTLY: this stops
// an unattended logged-in machine and a misclick. It does not stop someone
// already signed in as Admin who opens devtools — with no server, the
// comparison happens in the browser, and the check can be bypassed by
// anyone able to run arbitrary JS on the page. Real protection against that
// needs a Cloud Function, which needs the paid plan.

function randomSaltHex(bytes = 16) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return [...arr].map(b => b.toString(16).padStart(2, "0")).join("");
}

function toHex(buf) {
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return toHex(digest);
}

/** New salted hash for a password. Store the result verbatim. */
export async function hashGuardPassword(password) {
  const salt = randomSaltHex();
  const hash = await sha256Hex(salt + ":" + password);
  return { hash, salt, algo: "SHA-256" };
}

/** Does this password match a previously stored hash+salt? */
export async function verifyGuardPassword(password, { hash, salt }) {
  if (!hash || !salt) return false;
  const check = await sha256Hex(salt + ":" + password);
  return check === hash;
}
