// Registering and withdrawing an entry.
//
// A registration touches four things at once — the registration document,
// every participant's event counters, the per-house entry tally, and the
// participant's public lookup card. The first three run inside a Firestore
// transaction so two House Managers clicking at the same moment cannot both
// slip past the same cap.
//
// WHY THERE IS AN entryCounts DOCUMENT
// The Web SDK cannot run a query inside a transaction — tx.get() takes a
// document reference and nothing else. v6 therefore read the house's
// existing entries BEFORE the transaction, which meant two simultaneous
// submissions could both see "1 of 2 used" and both commit. A tiny tally
// document per (event, house) is the only way to make the cap and the
// duplicate check genuinely atomic without a server.
import { db, docRef, getOne, getAll, put, remove, where, runTransaction, serverTimestamp, deleteField } from "../lib/db.js";
import { checkCaps, applyCounts, limitsForCategory } from "./limits.js";
import { isGroupClass, maxEntriesFor } from "./constants.js";

export const tallyId = (eventId, houseId) => `${eventId}_${houseId}`;

/** Effective window for an event: its own override, else the fest default. */
export function registrationWindow(event, settings) {
  const start = event.registrationStart ?? settings?.registrationWindow?.start ?? null;
  const end   = event.registrationEnd   ?? settings?.registrationWindow?.end   ?? null;
  return { start, end };
}

export function windowState(event, settings, now = Date.now()) {
  const { start, end } = registrationWindow(event, settings);
  if (start && now < start) return { open: false, reason: "Registration has not opened yet." };
  if (end && now > end)     return { open: false, reason: "The registration deadline has passed." };
  return { open: true, reason: null };
}

/**
 * Seed for the tally document, read outside the transaction.
 *
 * Only used when the tally does not exist yet — i.e. the first registration
 * for this house and event, or a fest whose data predates the tally. After
 * that the tally is authoritative and this read is never consulted.
 */
async function tallySeed(eventId, houseId) {
  const existing = await getAll("registrations",
    where("eventId", "==", eventId), where("houseId", "==", houseId));
  return {
    count: existing.length,
    memberIds: existing.flatMap(r => r.participantIds || [])
  };
}

/**
 * Register one entry. `participants` is the full participant records, so a
 * group entry passes several and an individual entry passes one.
 * Throws with a message naming the specific cap when one is hit.
 */
export async function registerEntry({ event, house, participants, settings, limits, registeredBy, vocab = {} }) {
  /* v8.8 — a WHOLE-TEAM event has no roster at all: the house contests it
   * as a unit (a house march-past, a team chant) and earns the points as a
   * unit. There is nobody to cap, nobody to clash with, and nobody whose
   * lookup card should list it, so every per-participant rule below is
   * skipped rather than run against an empty array. */
  const wholeTeam = !!event.wholeTeam && isGroupClass(event.eventClass);

  if (!wholeTeam && !participants.length) throw new Error("Choose at least one participant.");
  const state = windowState(event, settings);
  if (!state.open) throw new Error(state.reason);

  const max = isGroupClass(event.eventClass) ? (event.maxParticipantsPerEntry || 1) : 1;
  if (!wholeTeam && participants.length > max) {
    throw new Error(`This event allows at most ${max} participant${max > 1 ? "s" : ""} per entry.`);
  }
  if (wholeTeam) participants = [];

  // Category events only accept participants from that category.
  if (event.categoryId) {
    const wrong = participants.filter(p => p.categoryId !== event.categoryId);
    if (wrong.length) throw new Error(`${wrong[0].name} is not in this event's category.`);
  }

  // I12 — maxEntriesPerHouse applies to ALL FOUR CLASSES. v6 hard-coded 999
  // for individual events, so the cap the Events screen offered was silently
  // ignored on exactly the class that most needed it. null = unlimited.
  const entryCap = maxEntriesFor(event);
  const seed = await tallySeed(event.id, house.id);
  const regId = `${event.id}_${house.id}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

  await runTransaction(db, async tx => {
    const tallyRef = docRef("entryCounts", tallyId(event.id, house.id));
    const tallySnap = await tx.get(tallyRef);
    const tally = tallySnap.exists()
      ? { count: tallySnap.data().count || 0, memberIds: tallySnap.data().memberIds || [] }
      : seed;

    if (entryCap !== null && tally.count >= entryCap) {
      throw new Error(
        `${house.name} has already entered the maximum of ${entryCap} for ${event.name}.`);
    }
    const clash = participants.find(p => tally.memberIds.includes(p.id));
    if (clash) throw new Error(`${clash.name} is already entered in this event.`);

    const snaps = [];
    for (const p of participants) {
      const snap = await tx.get(docRef("participants", p.id));
      if (!snap.exists()) throw new Error(`${p.name} no longer exists.`);
      snaps.push({ id: p.id, data: snap.data() });
    }
    for (const s of snaps) {
      /* THE PARTICIPANT'S OWN CATEGORY decides their caps — never the
       * event's. This matters for General events, which have no category:
       * a Junior in a General event is still measured as a Junior. Reading
       * event.categoryId here silently ignored every per-category cap on
       * every General event. */
      const effLimits = limitsForCategory(limits, s.data.categoryId);
      const blocked = checkCaps(s.data.eventCounts, event, effLimits, vocab);
      if (blocked) throw new Error(`${s.data.name}: ${blocked}`);
    }
    for (const s of snaps) {
      tx.update(docRef("participants", s.id), {
        eventCounts: applyCounts(s.data.eventCounts, event,
          limitsForCategory(limits, s.data.categoryId), +1)
      });
    }

    tx.set(tallyRef, {
      eventId: event.id,
      houseId: house.id,
      count: tally.count + 1,
      memberIds: [...tally.memberIds, ...participants.map(p => p.id)]
    });

    tx.set(docRef("registrations", regId), {
      eventId: event.id,
      eventName: event.name,
      eventClass: event.eventClass,
      houseId: house.id,
      houseName: house.name,
      categoryId: event.categoryId || null,
      entryNumber: tally.count + 1,
      // A whole-team entry stores an empty roster and says so, rather than
      // leaving a consumer to guess why the names are missing.
      wholeTeam,
      participantIds: participants.map(p => p.id),
      participantNames: participants.map(p => p.name),
      chestNumbers: participants.map(p => p.chestNumber ?? ""),
      codeLetter: "",
      status: "registered",
      registeredBy: registeredBy || "",
      timestamp: serverTimestamp()
    });
  });

  // Lookup card — merged so it never clobbers other events.
  for (const p of participants) {
    await put("participantPublic", p.id, {
      name: p.name, chestNumber: p.chestNumber ?? "", houseName: house.name,
      events: { [event.id]: { name: event.name, code: event.code || "", published: false } }
    });
  }
  return regId;
}

/**
 * Register several participants into an INDIVIDUAL event in one pass — one
 * separate entry each (ARCHITECTURE §14.2).
 *
 * Partial success is the contract. If the third participant trips a cap the
 * other four are still registered and the caller gets a report naming who
 * failed and why. Failing the whole batch would let one capped participant
 * block four valid entries, and the House Manager would have to guess who to
 * drop and try again.
 *
 * Each entry is its own transaction, so one failure cannot corrupt the
 * counters of the entries that succeeded.
 */
export async function registerMany({ event, house, participants, settings, limits, registeredBy, vocab = {} }) {
  const done = [], failed = [];
  for (const p of participants) {
    try {
      await registerEntry({ event, house, participants: [p], settings, limits, registeredBy, vocab });
      done.push(p);
    } catch (err) {
      failed.push({ participant: p, reason: err?.message || "Could not register." });
    }
  }
  return { done, failed };
}

/** Withdraw an entry and give the counters back. */
export async function withdrawEntry({ registration, event, limits }) {
  await runTransaction(db, async tx => {
    const tallyRef = docRef("entryCounts", tallyId(registration.eventId, registration.houseId));
    const tallySnap = await tx.get(tallyRef);

    const snaps = [];
    for (const pid of registration.participantIds || []) {
      const snap = await tx.get(docRef("participants", pid));
      if (snap.exists()) snaps.push({ id: pid, data: snap.data() });
    }
    for (const s of snaps) {
      tx.update(docRef("participants", s.id), {
        eventCounts: applyCounts(s.data.eventCounts, event,
          limitsForCategory(limits, s.data.categoryId), -1)
      });
    }

    if (tallySnap.exists()) {
      const data = tallySnap.data();
      const gone = new Set(registration.participantIds || []);
      tx.set(tallyRef, {
        eventId: registration.eventId,
        houseId: registration.houseId,
        count: Math.max(0, (data.count || 0) - 1),
        memberIds: (data.memberIds || []).filter(id => !gone.has(id))
      });
    }

    tx.delete(docRef("registrations", registration.id));
  });

  for (const pid of registration.participantIds || []) {
    await put("participantPublic", pid, { events: { [event.id]: deleteField() } });
  }

  // A direct event's placement is keyed by registration, so withdrawing the
  // entry must take it with them — otherwise it lingers as an orphan and
  // would resurface if the id were ever reused.
  // Cheap and harmless when the event was never direct — a delete of a
  // document that does not exist.
  await remove("directResults", `${event.id}_${registration.id}`).catch(() => {});
}

/** Can this entry still be withdrawn by its House Manager? */
export function canWithdraw(registration, event, settings) {
  if (registration.codeLetter) return { ok: false, reason: "Code letters have been assigned." };
  const state = windowState(event, settings);
  if (!state.open) return { ok: false, reason: state.reason };
  return { ok: true };
}

/**
 * How many entries a house holds per event — the input to the completed /
 * uncompleted split in the House Manager panel (§11.5).
 */
export function countByEvent(registrations) {
  const out = {};
  for (const r of registrations || []) out[r.eventId] = (out[r.eventId] || 0) + 1;
  return out;
}
