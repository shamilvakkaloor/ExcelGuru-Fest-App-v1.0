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
import { getAll, add, patch, put, remove } from "../lib/db.js";
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

/** Does this role's permission need the House Manager's consent before it
 *  can be used at all? Decided once, when the toggle was switched on (see
 *  admin/settings.js) — never re-evaluated afterwards, so the answer cannot
 *  change mid-fest by coincidence.
 *
 *  NOTE the change in what this gates. It used to make EVERY entry a
 *  separate request the House Manager had to approve one event at a time,
 *  which for a fest with 150 events meant 150 approvals for what is really
 *  a single decision. It now gates the PERMISSION: the House Manager agrees
 *  once, and after that staff register for them directly, exactly as if the
 *  toggle had been on from the start. The stored field keeps its name
 *  because its meaning — "approval is required" — is unchanged, so no fest
 *  needs migrating. */
export function onBehalfNeedsApproval(role, settings) {
  return role === "admin" ? !!settings?.adminRegOnBehalfNeedsApproval
       : role === "coAdmin" ? !!settings?.coAdminRegOnBehalfNeedsApproval
       : true;
}

/* ── Consent for the permission itself ─────────────────────────────────
 *
 * One document per (role, house), with a deterministic id so asking twice
 * updates the same row instead of piling up duplicates. A house that has
 * not answered yet blocks that role from registering for THAT house only —
 * one house dragging its feet never blocks the others.
 */
export const consentId = (role, houseId) => `${role}__${houseId}`;

/** Ask every house for consent. Houses that already said yes are left
 *  alone, so re-saving Settings does not silently revoke a decision the
 *  House Manager already made. */
export async function requestOnBehalfConsent({ role, houses, requestedBy }) {
  const existing = await getAll("onBehalfConsents").catch(() => []);
  const byId = Object.fromEntries(existing.map(c => [c.id, c]));
  let asked = 0;
  for (const h of houses) {
    const id = consentId(role, h.id);
    if (byId[id]?.status === REQUEST_STATUS.APPROVED) continue;
    await put("onBehalfConsents", id, {
      role, houseId: h.id, houseName: h.name,
      status: REQUEST_STATUS.PENDING,
      requestedBy: requestedBy || "", requestedAt: Date.now(),
      decidedBy: null, decidedAt: null
    });
    asked++;
  }
  return asked;
}

/** Switching the permission off drops its consents, so a later re-enable
 *  asks fresh rather than reusing an answer given about a different moment
 *  in the fest. */
export async function clearOnBehalfConsent(role) {
  const existing = await getAll("onBehalfConsents").catch(() => []);
  for (const c of existing.filter(x => x.role === role)) {
    await remove("onBehalfConsents", c.id).catch(() => {});
  }
}

/** The House Manager's one decision. */
export async function decideOnBehalfConsent({ role, houseId, approved, decidedBy }) {
  return patch("onBehalfConsents", consentId(role, houseId), {
    status: approved ? REQUEST_STATUS.APPROVED : REQUEST_STATUS.REJECTED,
    decidedBy: decidedBy || "", decidedAt: Date.now()
  });
}

/**
 * May `role` register for this house right now?
 *
 * Returns { ok, reason } rather than a bare boolean so the caller can say
 * WHY it is blocked — "still waiting", "declined" and "never switched on"
 * need different words in front of an Admin.
 */
export function onBehalfReady(role, settings, houseId, consents = []) {
  if (!onBehalfAllowed(role, settings)) {
    return { ok: false, reason: "This role is not allowed to register on a house's behalf." };
  }
  if (!onBehalfNeedsApproval(role, settings)) return { ok: true, reason: "" };

  const c = consents.find(x => x.id === consentId(role, houseId));
  if (c?.status === REQUEST_STATUS.APPROVED) return { ok: true, reason: "" };
  if (c?.status === REQUEST_STATUS.REJECTED) {
    return { ok: false, reason: "This house's House Manager declined. They can change that from their own panel." };
  }
  return { ok: false, reason: "Waiting for this house's House Manager to approve. It was turned on after registration had already started, so they decide whether staff may register for them." };
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
