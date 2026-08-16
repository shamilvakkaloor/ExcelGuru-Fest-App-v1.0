// Appeal system for published results.
//
// A published result can be appealed for a fixed window after publish, with
// a screenshot standing in for a receipt — there is no payment gateway on
// the free tier, so a screenshot of the fee transfer is the proof, the same
// workaround the fest manual uses for an upload. Admin decides Upheld
// (result stands) or Overturned (result was wrong) with a written reason.
// Deciding an appeal does not itself change a score: an Overturned outcome
// is acted on separately through Score Override or Adjustments, so the
// appeal record can never contradict the scoring model it is judging.
//
// THE ACTIVE-APPEAL LIMIT IS QUERIED, NOT TALLIED. A house may have at most
// appealMaxActive appeals open at once (pending or upheld); an overturned
// appeal stops counting, so being right frees the slot back up. This is
// checked with a query before submission rather than a rules-enforced tally
// document — appeals are rare and every one is read by a human before
// anything follows from it, so a double-submission race is a minor
// nuisance an Admin will notice immediately, not the kind of silent
// overrun a cap on points would be. Same reasoning as constraint groups.

import { getAll, getOne, put, where, serverTimestamp } from "../lib/db.js";

export const APPEAL_STATUS = { PENDING: "pending", UPHELD: "upheld", OVERTURNED: "overturned" };

/** Is the appeal window open for this event's published result? */
export function appealWindowState(result, settings, now = Date.now()) {
  if (!settings?.appealsEnabled) return { open: false, reason: "Appeals are not enabled for this fest." };
  if (!result || result.publishStatus !== "Published") {
    return { open: false, reason: "This result is not published yet." };
  }
  // v9.2 — minutes, not hours. appealWindowHours is read only as a
  // fallback for a fest that saved its window before this change.
  const minutes = Number(settings.appealWindowMinutes)
    || (Number(settings.appealWindowHours) || 24) * 60;
  const closesAt = (result.publishedAtMs || 0) + minutes * 60 * 1000;
  if (now > closesAt) return { open: false, reason: "The appeal window for this result has closed.", closesAt };
  return { open: true, closesAt };
}

/**
 * How many of this house's appeals count against the active limit right
 * now. A single-field query (houseId only) so it never needs a composite
 * index — the same reason registration and substitution checks filter by
 * one field and finish the filtering in the browser.
 */
export async function activeAppealCount(houseId) {
  const mine = await getAll("appeals", where("houseId", "==", houseId));
  return mine.filter(a => a.status === APPEAL_STATUS.PENDING || a.status === APPEAL_STATUS.UPHELD).length;
}

export async function fileAppeal({ event, result, house, settings, reason, feeScreenshot, submittedBy }) {
  const state = appealWindowState(result, settings);
  if (!state.open) throw new Error(state.reason);
  if (!reason?.trim()) throw new Error("Explain the reason for the appeal.");
  if (!feeScreenshot) throw new Error("Attach a screenshot showing the appeal fee was paid.");

  const limit = Number(settings.appealMaxActive) || 2;
  const active = await activeAppealCount(house.id);
  if (active >= limit) {
    throw new Error(
      `${house.name} already has ${active} active appeal${active === 1 ? "" : "s"} — the limit is ${limit}. ` +
      "An overturned appeal frees a slot back up.");
  }

  // Denormalised onto the appeal so a Judge can find their own events with
  // a single array-contains query, rather than a list query gated by a
  // get() per document — the shape that failed once already for
  // substitutions, because Firestore cannot statically prove a per-document
  // rule holds for every row in an unfiltered list query.
  const judgeAssignments = await getAll("judgeAssignments", where("eventId", "==", event.id)).catch(() => []);

  const id = `${event.id}_${house.id}_${Date.now().toString(36)}`;
  await put("appeals", id, {
    eventId: event.id, eventName: event.name, eventCode: event.code || "",
    houseId: house.id, houseName: house.name,
    judgeUids: judgeAssignments.map(a => a.judgeUid),
    reason: reason.trim(),
    feeScreenshot,
    status: APPEAL_STATUS.PENDING,
    decision: "", decidedBy: "", decidedAt: null, refundScreenshot: null,
    submittedBy: submittedBy || "", submittedAt: serverTimestamp()
  }, false);
  return id;
}

/** Admin/Co-Admin decision. Terminal — a decided appeal cannot be reopened. */
export async function decideAppeal({ appeal, status, decision, decidedBy, refundScreenshot = null }) {
  if (status !== APPEAL_STATUS.UPHELD && status !== APPEAL_STATUS.OVERTURNED) {
    throw new Error("Decision must be Upheld or Overturned.");
  }
  if (!decision?.trim()) throw new Error("Explain the decision — it is shown to the house that appealed.");
  await put("appeals", appeal.id, {
    status,
    decision: decision.trim(),
    decidedBy: decidedBy || "",
    decidedAt: serverTimestamp(),
    refundScreenshot: status === APPEAL_STATUS.OVERTURNED ? (refundScreenshot || null) : null
  });
}
