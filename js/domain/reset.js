// Full data reset — Admin only, irreversible.
//
// Ordering is the entire design constraint here. Every deletion below still
// requires the caller to be Admin, and Security Rules check that by reading
// /users/{myUid}. So that document — along with the caller's own
// /loginDirectory entry and their Auth login — has to be the LAST thing
// touched. Delete it earlier and every remaining step in this function
// would be rejected as permission-denied, mid-reset, with the fest half wiped.
import { getAll, batchWrite } from "../lib/db.js";

// Plain collections wiped in one pass each. "logs" is deliberately left out
// — Security Rules forbid deleting it, by design, as an audit trail that
// even a reset should not be able to erase.
const SIMPLE_COLLECTIONS = [
  "pointsConfig", "houses", "judges", "coAdmins", "categories",
  "events", "participants", "registrations", "entryCounts", "judgingEntries", "directResults", "leaderboards",
  "substitutions",
  "judgeAssignments", "scores", "entryFlags", "results",
  "publicResults", "publicLeaderboard", "publicSchedule", "participantPublic", "designs"
];

async function wipeCollection(path) {
  const rows = await getAll(path);
  if (rows.length) await batchWrite(rows.map(r => ({ type: "delete", path, id: r.id })));
  return rows.length;
}

async function wipeConfigExceptFestSettings() {
  const rows = await getAll("config");
  const rest = rows.filter(r => r.id !== "festSettings");
  if (rest.length) await batchWrite(rest.map(r => ({ type: "delete", path: "config", id: r.id })));
}

async function wipeVenuesAndSlots() {
  const venues = await getAll("venues");
  for (const v of venues) {
    const slots = await getAll(`venues/${v.id}/slots`);
    if (slots.length) await batchWrite(slots.map(s => ({ type: "delete", path: `venues/${v.id}/slots`, id: s.id })));
  }
  if (venues.length) await batchWrite(venues.map(v => ({ type: "delete", path: "venues", id: v.id })));

  // Days are a separate collection from v7 — see ARCHITECTURE section 6.3.
  const days = await getAll("festDays");
  if (days.length) await batchWrite(days.map(d => ({ type: "delete", path: "festDays", id: d.id })));
}

/**
 * Wipe every collection to nothing. Every OTHER account (judges, houses,
 * co-admins, other admins) has its role document and login-directory entry
 * removed too, which revokes its access completely — but its underlying
 * Firebase Auth login is NOT deleted, because the browser SDK can only
 * delete the currently signed-in user, never someone else's. Those entries
 * sit inert in Firebase console → Authentication until removed there by
 * hand; they can no longer sign in to anything meaningful once their data
 * and role document are gone.
 *
 * The caller (the Admin running this) is the one exception: their own
 * account can be fully deleted, because deleteOwnAccount() runs after this
 * function returns and is a self-delete, which the SDK does allow.
 */
export async function wipeEverything({ currentUid, currentSlug, onProgress }) {
  const report = msg => onProgress?.(msg);

  report("Clearing configuration…");
  await wipeConfigExceptFestSettings();

  for (const path of SIMPLE_COLLECTIONS) {
    report("Clearing " + path + "…");
    await wipeCollection(path);
  }

  report("Clearing the schedule…");
  await wipeVenuesAndSlots();

  report("Revoking every other account…");
  const [users, directory] = await Promise.all([getAll("users"), getAll("loginDirectory")]);
  const otherUsers = users.filter(u => u.id !== currentUid);
  const otherDirectory = directory.filter(d => d.id !== currentSlug);
  if (otherUsers.length) await batchWrite(otherUsers.map(u => ({ type: "delete", path: "users", id: u.id })));
  if (otherDirectory.length) await batchWrite(otherDirectory.map(d => ({ type: "delete", path: "loginDirectory", id: d.id })));

  report("Closing out the fest…");
  await batchWrite([{ type: "delete", path: "config", id: "festSettings" }]);

  // Last of all: my own access. Nothing after this point can rely on being
  // signed in as Admin, so nothing after this point writes to Firestore.
  report("Removing your own admin record…");
  await batchWrite([
    { type: "delete", path: "loginDirectory", id: currentSlug },
    { type: "delete", path: "users", id: currentUid }
  ]);
}
