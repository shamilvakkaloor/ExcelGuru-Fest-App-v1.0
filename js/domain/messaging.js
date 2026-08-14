// Two-way messaging between accounts — admin-toggleable, off by default
// (#30). An Admin or Co-Admin starts a conversation, personal or group,
// picking anyone across every role; everyone already in it can reply.
// Nobody outside a conversation can read it, staff excepted.
//
// NO CLOUD FUNCTIONS EXIST on the free tier, so there is no server-side
// fan-out, no push notification and no "mark delivered" — a message is a
// document, read live through Firestore's own listener (lib/db.js watch()),
// which is the only real-time primitive available at all here.
import { add, patch, getAll, where, serverTimestamp } from "../lib/db.js";

/**
 * Admin/Co-Admin only. The creator is always included, whether or not the
 * caller remembered to add them.
 *
 * There is no queryable list of Admin accounts to pick FROM — this app's
 * own account model is one Admin, created once at setup, with no "add
 * another Admin" flow, and firestore.rules keeps the users collection
 * (the role document itself) readable only by its own owner and an Admin.
 * A Co-Admin can start a conversation with any House, Judge or Stage
 * Manager, just not with the Admin by name — a real but minor limitation
 * given a fest typically runs one.
 */
export async function startConversation({ type, name, participants, createdBy, createdByUid }) {
  if (!["personal", "group"].includes(type)) throw new Error("Unknown conversation type.");
  const all = participants.some(p => p.uid === createdByUid)
    ? participants : [...participants, { uid: createdByUid, name: createdBy || "", role: "staff" }];
  if (all.length < 2) throw new Error("Pick at least one other person for a conversation.");
  if (type === "group" && !name?.trim()) throw new Error("Name the group.");

  const label = type === "group" ? name.trim()
    : all.filter(p => p.uid !== createdByUid).map(p => p.name).join(", ") || name?.trim() || "";

  return add("conversations", {
    type,
    name: label,
    participantUids: all.map(p => p.uid),
    participants: all,
    createdBy: createdByUid, createdByName: createdBy || "",
    createdAt: serverTimestamp(),
    lastMessageAt: serverTimestamp(),
    lastMessageText: "Conversation started.",
    lastMessageBy: createdBy || ""
  });
}

export async function sendMessage({ conversation, text, senderUid, senderName }) {
  if (!text?.trim()) throw new Error("Type a message.");
  await add(`conversations/${conversation.id}/messages`, {
    senderUid, senderName: senderName || "",
    text: text.trim(),
    sentAt: serverTimestamp()
  });
  // A tiny denormalised preview on the conversation itself, so the list of
  // conversations needs no extra read of the messages subcollection to show
  // what was last said and by whom.
  await patch("conversations", conversation.id, {
    lastMessageAt: serverTimestamp(),
    lastMessageText: text.trim().slice(0, 140),
    lastMessageBy: senderName || ""
  });
}

/** Display name for a conversation from a given viewer's point of view. */
export function conversationTitle(conv, viewerUid) {
  if (conv.type === "group") return conv.name || "Group";
  const other = (conv.participants || []).find(p => p.uid !== viewerUid);
  return other?.name || conv.name || "Conversation";
}

export const sortByRecent = rows =>
  [...(rows || [])].sort((a, b) => (b.lastMessageAt?.seconds || 0) - (a.lastMessageAt?.seconds || 0));

/** Fetch one candidate list per role, for the "who to include" picker. */
export async function directory() {
  const [houses, judges, coAdmins, stageManagers] = await Promise.all([
    getAll("houses"), getAll("judges"), getAll("coAdmins"), getAll("stageManagers").catch(() => [])
  ]);
  const withUid = (rows, role) => rows.filter(r => r.uid).map(r => ({ uid: r.uid, name: r.name, role }));
  return [
    ...withUid(houses, "house"), ...withUid(judges, "judge"),
    ...withUid(coAdmins, "coAdmin"), ...withUid(stageManagers, "stage")
  ];
}
