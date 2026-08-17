// I9 — Admin/Co-Admin registering participants on a house's behalf.
//
// Mirrors substitution.js's request/decide shape, with requester and
// decider swapped: STAFF is the requester here (create, status "pending"),
// the HOUSE is the decider (update to approved/rejected) — enforced in
// firestore.rules, not just hidden in the UI, so "if the House rejects, an
// Admin cannot force it through" is a rule, not a convention.
//
// When a request IS approved, it goes through the exact same registerEntry()
// every house-initiated entry uses, so every cap and constraint still
// applies — an approval can still fail if the fest's own limits would be
// breached, matching how approveSubstitution() already refuses a cap
// breach outright rather than waving it through "with a warning".
import { getAll, add, patch } from "../lib/db.js";
import { registerEntry } from "./registration.js";

export const REQUEST_STATUS = {
  PENDING:  "pending",
  APPROVED: "approved",
  REJECTED: "rejected"
};

/** May this role register on a house's behalf at all, right now? */
export function onBehalfAllowed(role, settings) {
  return role === "admin" ? !!settings?.allowAdminRegisterForHouse
       : role === "coAdmin" ? !!settings?.allowCoAdminRegisterForHouse
       : false;
}

/** Does a request from this role need the House Manager's approval, or can
 *  it become a real registration immediately? Decided once, when the
 *  toggle was switched on (see admin/settings.js) — never re-evaluated
 *  per request, so the answer cannot change mid-fest by coincidence. */
export function onBehalfNeedsApproval(role, settings) {
  return role === "admin" ? !!settings?.adminRegOnBehalfNeedsApproval
       : role === "coAdmin" ? !!settings?.coAdminRegOnBehalfNeedsApproval
       : true;
}

/** Staff creates a pending request for ONE entry's worth of participants
 *  (empty for a whole-team event). Nothing is registered yet. */
export async function requestRegistrationOnBehalf({ event, house, participants, role, requestedBy }) {
  const wholeTeam = !!event.wholeTeam;
  if (!wholeTeam && !participants.length) throw new Error("Choose at least one participant.");
  return add("registrationRequests", {
    eventId: event.id, eventName: event.name, eventClass: event.eventClass,
    houseId: house.id, houseName: house.name, categoryId: event.categoryId || null,
    wholeTeam,
    participantIds: participants.map(p => p.id),
    participantNames: participants.map(p => p.name),
    status: REQUEST_STATUS.PENDING,
    requestedByRole: role,
    requestedBy: requestedBy || "",
    requestedAt: Date.now(),
    decidedBy: null, decidedAt: null, reason: null
  });
}

/** Same partial-success contract as registerMany(): for an individual
 *  event with several participants picked at once, one request per
 *  participant, so the House can approve some and reject others. */
export async function requestManyOnBehalf({ event, house, participants, role, requestedBy }) {
  const done = [], failed = [];
  for (const p of participants) {
    try {
      await requestRegistrationOnBehalf({ event, house, participants: [p], role, requestedBy });
      done.push(p);
    } catch (err) {
      failed.push({ participant: p, reason: err?.message || "Could not submit." });
    }
  }
  return { done, failed };
}

/** House Manager approves — this is the moment an entry actually exists.
 *  The request must still be "pending" when registerEntry() runs: the new
 *  registrations doc is given the SAME id as this request, and the rules'
 *  approvingOwnRequest() reads that pending status to allow the write past
 *  a registration window that may already be closed. Only once the write
 *  succeeds is the request itself marked approved. */
export async function approveRegistrationRequest({ request, event, house, participants, settings, limits, constraintGroups, eventById, decidedBy }) {
  await registerEntry({
    event, house, participants, settings, limits, regId: request.id,
    registeredBy: (request.requestedBy || "Admin") + " — approved by " + (decidedBy || house.name),
    constraintGroups, eventById
  });
  await patch("registrationRequests", request.id, {
    status: REQUEST_STATUS.APPROVED, decidedBy: decidedBy || "", decidedAt: Date.now()
  });
}

export async function rejectRegistrationRequest({ request, decidedBy, reason }) {
  await patch("registrationRequests", request.id, {
    status: REQUEST_STATUS.REJECTED, decidedBy: decidedBy || "", decidedAt: Date.now(),
    reason: reason || null
  });
}

export const pendingCount = rows =>
  (rows || []).filter(r => r.status === REQUEST_STATUS.PENDING).length;

/** True once any activity has happened that counts as "registration has
 *  already started" for this fest — either a registration already exists,
 *  or the fest's own default window has already opened. Called once, at
 *  the moment a toggle flips on, to decide whether that role's future
 *  requests need approval (see admin/settings.js). */
export async function registrationAlreadyStarted(settings) {
  const existing = await getAll("registrations").catch(() => []);
  if (existing.length) return true;
  const start = settings?.registrationWindow?.start;
  return !!(start && Date.now() >= start);
}
