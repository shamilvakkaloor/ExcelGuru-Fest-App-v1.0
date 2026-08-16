// Data reset — Admin only, irreversible.
//
// Two shapes of reset live here:
//
//  · wipeEverything()  — the whole fest, including the Admin's own login.
//  · wipeGroup()       — one slice of it (all judging, all participants…),
//                        leaving the fest and every account standing.
//
// Ordering is the entire design constraint for the first one. Every deletion
// below still requires the caller to be Admin, and Security Rules check that
// by reading /users/{myUid}. So that document — along with the caller's own
// /loginDirectory entry and their Auth login — has to be the LAST thing
// touched. Delete it earlier and every remaining step in this function
// would be rejected as permission-denied, mid-reset, with the fest half wiped.
import { getAll, batchWrite } from "../lib/db.js";

/* ── What lives where ──────────────────────────────────────────────────
 *
 * Grouped by what DEPENDS on what, because that is what decides both the
 * cascade below and the order of a full wipe. A registration points at an
 * event and a participant; a score points at a registration. Deleting the
 * thing pointed AT without the things pointing at it leaves rows that
 * reference an id that no longer resolves — which reads in the UI as blank
 * names and phantom entries rather than as an error.
 */
const RESULTS_COLLECTIONS = [
  "scores", "judgeAssignments", "entryFlags", "judgingEntries",
  "directResults", "scoreOverrides", "results",
  "publicResults", "publicLeaderboard", "appeals", "stageArrivals"
];

const REGISTRATION_COLLECTIONS = [
  "registrations", "entryCounts", "substitutions", "eventMaterials"
];

const PARTICIPANT_COLLECTIONS = ["participants", "participantPublic", "titles"];

const EVENT_COLLECTIONS = ["events"];

const SCHEDULE_COLLECTIONS = ["publicSchedule"];

// Accounts and fest-wide configuration. Only a full wipe touches these.
const ACCOUNT_COLLECTIONS = [
  "houses", "judges", "coAdmins", "stageManagers", "houseContacts", "publicContacts"
];

// `conversations` is handled separately — see wipeConversations() — because
// deleting a parent document in Firestore does NOT delete its subcollection.
const CONFIG_COLLECTIONS = [
  "pointsConfig", "categories", "leaderboards", "designs", "adjustments",
  "constraintGroups", "programTypes", "programTiers"
];

/**
 * Every collection a full wipe clears, in dependency order.
 *
 * "logs" is deliberately absent — Security Rules forbid deleting it, by
 * design, as an audit trail that even a reset should not be able to erase.
 */
const SIMPLE_COLLECTIONS = [
  ...RESULTS_COLLECTIONS,
  ...REGISTRATION_COLLECTIONS,
  ...PARTICIPANT_COLLECTIONS,
  ...EVENT_COLLECTIONS,
  ...SCHEDULE_COLLECTIONS,
  ...ACCOUNT_COLLECTIONS,
  ...CONFIG_COLLECTIONS
];

/* ── Granular deletes ──────────────────────────────────────────────────
 *
 * `cascades` is not a convenience — it is what stops the delete leaving
 * dangling references. Deleting every event while keeping the
 * registrations that name them would leave each house's panel listing
 * entries for events that no longer exist.
 */
export const DELETE_GROUPS = [
  {
    id: "judging",
    label: "All judging and results",
    detail: "Every score, absence flag, override, finalized result, published " +
            "result page and appeal. Registrations, participants and events all stay — " +
            "so the fest can simply be judged again from scratch.",
    collections: RESULTS_COLLECTIONS
  },
  {
    id: "registrations",
    label: "All registrations",
    detail: "Every entry a House Manager made, plus the substitution requests and " +
            "event material attached to them. Participants and events stay. " +
            "Judging and results go too, because they are scored per entry.",
    collections: REGISTRATION_COLLECTIONS,
    cascades: ["judging"]
  },
  {
    id: "participants",
    label: "All participants",
    detail: "Every student on the roster, and any special title awarded to one. " +
            "Their registrations, and everything judged from those, go with them.",
    collections: PARTICIPANT_COLLECTIONS,
    cascades: ["registrations"]
  },
  {
    id: "events",
    label: "All events",
    detail: "Every competition item. Registrations for them, and everything judged " +
            "from those, go too. Participants stay on the roster.",
    collections: EVENT_COLLECTIONS,
    cascades: ["registrations"]
  },
  {
    id: "schedule",
    label: "The whole schedule",
    detail: "Every venue, fest day and time slot, and the public schedule page. " +
            "Nothing else is touched — events themselves stay.",
    collections: SCHEDULE_COLLECTIONS,
    venuesAndDays: true
  }
];

/** Expand one group id into every collection it clears, cascades included. */
export function collectionsFor(groupId, seen = new Set()) {
  if (seen.has(groupId)) return [];
  seen.add(groupId);
  const g = DELETE_GROUPS.find(x => x.id === groupId);
  if (!g) return [];
  const out = [...g.collections];
  for (const c of g.cascades || []) out.push(...collectionsFor(c, seen));
  return [...new Set(out)];
}

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

/** Conversations carry a `messages` subcollection, which a parent delete
 * leaves behind — invisible in the console, still billed as storage. */
async function wipeConversations() {
  const convs = await getAll("conversations");
  for (const c of convs) {
    const msgs = await getAll(`conversations/${c.id}/messages`).catch(() => []);
    if (msgs.length) {
      await batchWrite(msgs.map(m => ({ type: "delete", path: `conversations/${c.id}/messages`, id: m.id })));
    }
  }
  if (convs.length) await batchWrite(convs.map(c => ({ type: "delete", path: "conversations", id: c.id })));
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
 * Delete one slice of the fest, cascades included.
 *
 * Unlike wipeEverything() this leaves festSettings, every account and the
 * Admin's own login completely alone — the fest stays open and usable, it
 * just loses the data named. Returns the number of documents removed, so
 * the caller can say what actually happened rather than only that it
 * finished.
 */
export async function wipeGroup(groupId, { onProgress } = {}) {
  const group = DELETE_GROUPS.find(g => g.id === groupId);
  if (!group) throw new Error("Unknown delete group: " + groupId);

  let removed = 0;
  for (const path of collectionsFor(groupId)) {
    onProgress?.("Clearing " + path + "…");
    removed += await wipeCollection(path);
  }
  if (group.venuesAndDays) {
    onProgress?.("Clearing the schedule…");
    await wipeVenuesAndSlots();
  }
  return removed;
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

  report("Clearing messages…");
  await wipeConversations();

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
