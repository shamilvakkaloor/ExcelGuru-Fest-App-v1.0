// Event material — a song title, a prop list, whatever an event's own
// wording asks for (event.materialLabel, e.g. "Song title"). Off by
// default per event.
//
// Submitted by the house that owns the entry, queued for Admin/Co-Admin
// approval exactly like a substitution request. Once approved, the title
// is copied into judgingEntries (see admin/registrations.js
// writeJudgingEntries) so a judge sees it beside the code letter — a judge
// never reads this collection directly. That indirection is what keeps
// blind judging enforced by what is stored, not by what the UI hides: the
// material text can never carry a house's name along with it by accident.
import { add, patch, getAll, where, serverTimestamp } from "../lib/db.js";

export const MATERIAL_STATUS = { PENDING: "pending", APPROVED: "approved", REJECTED: "rejected" };

export function materialsWindow(event) {
  if (!event?.materialsEnabled) return { open: false, reason: "This event does not take a material submission." };
  return { open: true, reason: null };
}

/** A House Manager submits material for one of their own entries. */
export async function submitMaterial({ registration, event, house, title, link, submittedBy }) {
  const win = materialsWindow(event);
  if (!win.open) throw new Error(win.reason);
  if (!title?.trim()) throw new Error(`${event.materialLabel || "Material"} is required.`);
  if (registration.houseId !== house.id) throw new Error("That entry belongs to another house.");

  // One open submission per entry. Filtered by houseId for the same reason
  // substitutions is: Firestore rejects an entire list query it cannot
  // statically prove satisfies a per-document rule, and the rule here
  // checks resource.data.houseId.
  const existing = await getAll("eventMaterials",
    where("houseId", "==", house.id), where("registrationId", "==", registration.id));
  const open = existing.find(m => m.status !== MATERIAL_STATUS.REJECTED);
  if (open) {
    throw new Error(`A ${(event.materialLabel || "material").toLowerCase()} for this entry has already been submitted.`);
  }

  return add("eventMaterials", {
    registrationId: registration.id,
    eventId: event.id, eventName: event.name,
    houseId: house.id, houseName: house.name,
    title: title.trim(), link: (link || "").trim(),
    status: MATERIAL_STATUS.PENDING,
    submittedBy: submittedBy || house.name,
    submittedAt: serverTimestamp(),
    decidedBy: null, decidedAt: null, reason: null
  });
}

/** Admin/Co-Admin decision. A rejected submission may be resubmitted. */
export async function decideMaterial({ material, status, decidedBy, reason }) {
  if (status !== MATERIAL_STATUS.APPROVED && status !== MATERIAL_STATUS.REJECTED) {
    throw new Error("Decision must be Approved or Rejected.");
  }
  await patch("eventMaterials", material.id, {
    status, decidedBy: decidedBy || "", decidedAt: Date.now(),
    reason: status === MATERIAL_STATUS.REJECTED ? (reason || "") : null
  });
}

export const pendingCount = rows => (rows || []).filter(m => m.status === MATERIAL_STATUS.PENDING).length;
