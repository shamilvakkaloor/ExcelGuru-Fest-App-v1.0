// Substitutions — swapping a participant inside an existing entry.
//
// WHY THE WINDOW IS NARROW
// It opens when the registration deadline passes and closes when code
// letters are assigned. Before the deadline a House Manager can simply
// withdraw and re-register, needing nobody's approval — a whole approval
// workflow for something they can already do alone would be ceremony. After
// code letters exist the running order is fixed and judges may be holding
// sheets, so a name change is a result correction for an Admin in Judging,
// not a substitution.
//
// WHY A CAP BREACH IS REFUSED OUTRIGHT
// Caps are enforced when an entry is created, so a breach cannot arise
// through the front door. Allowing one here — even "with a warning" — would
// make substitution the quiet route around the limits the fest set for
// itself.
import { db, docRef, getOne, getAll, add, patch, put, remove, where,
         runTransaction, serverTimestamp } from "../lib/db.js";
import { checkCaps, applyCounts, limitsForCategory } from "./limits.js";
import { windowState } from "./registration.js";

export const SUB_STATUS = {
  PENDING:  "pending",
  APPROVED: "approved",
  REJECTED: "rejected"
};

/**
 * Is a substitution possible for this entry right now?
 *
 * Returns { open, reason }. The reason is shown to the House Manager, so it
 * says what to do instead rather than only what is refused.
 */
export function substitutionWindow(registration, event, settings, now = Date.now()) {
  if (registration.codeLetter) {
    return { open: false, reason: "Code letters have been assigned — ask an Admin to correct this in Judging." };
  }
  const reg = windowState(event, settings, now);
  if (reg.open) {
    return { open: false, reason: "Registration is still open — withdraw and re-register instead." };
  }
  return { open: true, reason: null };
}

/** A House Manager asks for a swap. Creates a pending request only. */
export async function requestSubstitution({ registration, event, outgoing, incoming, house, settings, requestedBy }) {
  const win = substitutionWindow(registration, event, settings);
  if (!win.open) throw new Error(win.reason);

  if (registration.houseId !== house.id) throw new Error("That entry belongs to another house.");
  if (!(registration.participantIds || []).includes(outgoing.id)) {
    throw new Error(`${outgoing.name} is not in this entry.`);
  }
  if ((registration.participantIds || []).includes(incoming.id)) {
    throw new Error(`${incoming.name} is already in this entry.`);
  }
  if (incoming.houseId !== house.id) throw new Error(`${incoming.name} is not in your house.`);
  if (event.categoryId && incoming.categoryId !== event.categoryId) {
    throw new Error(`${incoming.name} is not in this event's category.`);
  }

  // One open request per entry keeps the approval queue unambiguous.
  const existing = await getAll("substitutions",
    where("registrationId", "==", registration.id), where("status", "==", SUB_STATUS.PENDING));
  if (existing.length) throw new Error("A substitution for this entry is already awaiting approval.");

  return add("substitutions", {
    registrationId: registration.id,
    eventId: event.id,
    eventName: event.name,
    houseId: house.id,
    houseName: house.name,
    outgoingId: outgoing.id,
    outgoingName: outgoing.name,
    incomingId: incoming.id,
    incomingName: incoming.name,
    status: SUB_STATUS.PENDING,
    requestedBy: requestedBy || house.name,
    requestedAt: serverTimestamp(),
    decidedBy: null,
    decidedAt: null,
    reason: null
  });
}

/**
 * Approve a swap. One transaction: the entry's roster, both participants'
 * counters, and the decision record move together or not at all.
 */
export async function approveSubstitution({ request, event, limits, decidedBy, vocab = {} }) {
  await runTransaction(db, async tx => {
    const regRef = docRef("registrations", request.registrationId);
    const regSnap = await tx.get(regRef);
    if (!regSnap.exists()) throw new Error("That entry no longer exists.");
    const reg = regSnap.data();

    if (reg.codeLetter) {
      throw new Error("Code letters were assigned while this request was waiting. Correct it in Judging instead.");
    }
    if (!(reg.participantIds || []).includes(request.outgoingId)) {
      throw new Error(`${request.outgoingName} is no longer in this entry.`);
    }

    const outRef = docRef("participants", request.outgoingId);
    const inRef  = docRef("participants", request.incomingId);
    const [outSnap, inSnap] = [await tx.get(outRef), await tx.get(inRef)];
    if (!inSnap.exists()) throw new Error(`${request.incomingName} no longer exists.`);

    const inData = inSnap.data();
    // Caps use the INCOMING participant's own category, as everywhere else.
    const inLimits = limitsForCategory(limits, inData.categoryId);
    const blocked = checkCaps(inData.eventCounts, event, inLimits, vocab);
    if (blocked) throw new Error(`${request.incomingName}: ${blocked}`);

    const ids = (reg.participantIds || []).map(id => id === request.outgoingId ? request.incomingId : id);
    const names = (reg.participantNames || []).map((n, i) =>
      (reg.participantIds || [])[i] === request.outgoingId ? inData.name : n);
    const chests = (reg.chestNumbers || []).map((c, i) =>
      (reg.participantIds || [])[i] === request.outgoingId ? (inData.chestNumber ?? "") : c);

    tx.update(regRef, { participantIds: ids, participantNames: names, chestNumbers: chests });

    if (outSnap.exists()) {
      tx.update(outRef, {
        eventCounts: applyCounts(outSnap.data().eventCounts, event,
          limitsForCategory(limits, outSnap.data().categoryId), -1)
      });
    }
    tx.update(inRef, { eventCounts: applyCounts(inData.eventCounts, event, inLimits, +1) });

    tx.update(docRef("substitutions", request.id), {
      status: SUB_STATUS.APPROVED, decidedBy: decidedBy || "", decidedAt: Date.now()
    });
  });

  // Lookup cards: the outgoing participant loses the event, the incoming
  // gains it. Nothing marks the swap publicly — a substituted participant
  // simply appears as though they were always registered.
  const { deleteField } = await import("../lib/db.js");
  await put("participantPublic", request.outgoingId, { events: { [request.eventId]: deleteField() } });
  await put("participantPublic", request.incomingId, {
    name: request.incomingName,
    events: { [request.eventId]: { name: request.eventName, code: event.code || "", published: false } }
  });
}

export async function rejectSubstitution({ request, decidedBy, reason }) {
  await patch("substitutions", request.id, {
    status: SUB_STATUS.REJECTED,
    decidedBy: decidedBy || "",
    decidedAt: Date.now(),
    reason: reason || null
  });
}

export const pendingCount = rows =>
  (rows || []).filter(r => r.status === SUB_STATUS.PENDING).length;
