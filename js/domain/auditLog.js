// I9 — an append-only trail of who signed in and what the most
// consequential admin actions were. Not every write in the app is
// instrumented here — that would mean touching every mutation site in the
// codebase — this covers logins (every role, always) plus the actions
// with the widest blast radius: settings changes, account changes,
// Danger Zone deletes, score overrides, adjustments, and appeal decisions.
//
// Never blocks the action it is describing: a failed log write is caught
// and reported to the console, never thrown back at the caller.
import { add } from "../lib/db.js";

export async function logAudit({ uid, role, name, action, details = "" }) {
  if (!uid) return;
  try {
    await add("auditLog", {
      uid, role: role || "", name: name || "",
      action, details: String(details || ""), at: Date.now()
    });
  } catch (err) {
    console.error("Audit log write failed", err);
  }
}
