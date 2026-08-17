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
import { checkCaps, applyCounts, limitsForCategory, checkConstraints,
         reservationBlocker } from "./limits.js";
import { isGroupClass, maxEntriesFor, teamName,
         eventCategoryIds, eventAcceptsCategory } from "./constants.js";

export const tallyId = (eventId, houseId) => `${eventId}_${houseId}`;

/**
 * Effective window for an event: its own override, else the fest default.
 *
 * `houseId` applies an extension an Admin granted after the fact — a house
 * whose entries were lost, an event reopened for one team. An extension
 * only ever moves the DEADLINE later and never the opening earlier, so it
 * cannot be used to let one house in before everybody else.
 */
export function registrationWindow(event, settings, houseId = null) {
  const start = event.registrationStart ?? settings?.registrationWindow?.start ?? null;
  let end     = event.registrationEnd   ?? settings?.registrationWindow?.end   ?? null;

  const ext = event.registrationExtensions || {};
  // "__all" extends the event for every house at once, which is the common
  // case (the whole event ran late), without writing one entry per house.
  for (const key of ["__all", houseId]) {
    if (!key) continue;
    const until = ext[key];
    if (until && (end === null || until > end)) end = until;
  }
  return { start, end };
}

export function windowState(event, settings, now = Date.now(), houseId = null) {
  const { start, end } = registrationWindow(event, settings, houseId);
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
export async function registerEntry({ event, house, participants, settings, limits, registeredBy,
                                      vocab = {}, constraintGroups = [], eventById = {}, regId: explicitRegId = null }) {
  /* v9 — a WHOLE-TEAM event has no roster at all: the house contests it
   * as a unit (a house march-past, a team chant) and earns the points as a
   * unit. There is nobody to cap, nobody to clash with, and nobody whose
   * lookup card should list it, so every per-participant rule below is
   * skipped rather than run against an empty array. */
  const wholeTeam = !!event.wholeTeam && isGroupClass(event.eventClass);

  if (!wholeTeam && !participants.length) throw new Error("Choose at least one participant.");
  const state = windowState(event, settings, Date.now(), house.id);
  if (!state.open) throw new Error(state.reason);

  const max = isGroupClass(event.eventClass) ? (event.maxParticipantsPerEntry || 1) : 1;
  if (!wholeTeam && participants.length > max) {
    throw new Error(`This event allows at most ${max} participant${max > 1 ? "s" : ""} per entry.`);
  }
  if (wholeTeam) participants = [];

  /* Category events only accept participants from that category — or, for
   * a mixed-category event, from ANY of the categories it names. */
  const openTo = eventCategoryIds(event);
  if (openTo.length) {
    const wrong = participants.filter(p => !eventAcceptsCategory(event, p.categoryId));
    if (wrong.length) {
      throw new Error(openTo.length > 1
        ? `${wrong[0].name} is not in any of this event's categories.`
        : `${wrong[0].name} is not in this event's category.`);
    }
  }

  // I12 — maxEntriesPerHouse applies to ALL FOUR CLASSES. v6 hard-coded 999
  // for individual events, so the cap the Events screen offered was silently
  // ignored on exactly the class that most needed it. null = unlimited.
  const entryCap = maxEntriesFor(event);
  /* I14 — tallySeed() used to run on EVERY registration, even though its
   * own doc comment says it is "only used when the tally does not exist
   * yet" — after the first entry for this (event, house) pair, the
   * transaction's own tx.get(tallyRef) below already has an authoritative
   * value and this query's result is thrown away unread. A single-doc
   * existence check is cheap regardless of how many registrations exist;
   * the expensive query now runs only the one time it can actually matter. */
  const existingTally = await getOne("entryCounts", tallyId(event.id, house.id)).catch(() => null);
  const seed = existingTally ? null : await tallySeed(event.id, house.id);
  // I9 — an explicit id is given when this entry fulfils an approved
  // registrationRequests document: the two share the same Firestore doc id
  // on purpose, so firestore.rules can look the request up by get() rather
  // than needing a query (see approvingOwnRequest()).
  const regId = explicitRegId ||
    `${event.id}_${house.id}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

  /* ── v9 — constraint groups and reserved slots ───────────────────
   *
   * Both are read BEFORE the transaction, deliberately. Each needs a
   * QUERY (this participant's other registrations; this event's entries
   * across all houses), and the Web SDK cannot query inside a
   * transaction — tx.get() takes a document reference only. The same
   * constraint that produced the entryCounts tally applies here.
   *
   * The consequence is honest: two simultaneous submissions could each
   * see room under a constraint group and both commit. That is a far
   * milder failure than the cap race the tally exists to prevent — a
   * group is a fairness rule, not a hard limit on points — and closing it
   * properly would mean a tally document per (participant, group), which
   * is a lot of machinery for a rare collision. Stated rather than
   * hidden.
   */
  const groups = (constraintGroups || []).filter(g => g.enabled !== false);
  let priorByParticipant = {};
  if (groups.length && participants.length) {
    // I14 — independent per-participant queries, run in parallel rather
    // than one after another. A 6-member group entry used to pay for 6
    // serialized round trips here before the transaction even opened.
    const pairs = await Promise.all(participants.map(async p => {
      const regs = await getAll("registrations", where("participantIds", "array-contains", p.id))
        .catch(() => []);
      return [p.id, regs.map(r => r.eventId)];
    }));
    priorByParticipant = Object.fromEntries(pairs);
  }

  let reservationTaken = null;
  if (event.reservedSlots && Object.keys(event.reservedSlots).length) {
    const all = await getAll("registrations", where("eventId", "==", event.id)).catch(() => []);
    reservationTaken = {};
    for (const r of all) {
      const c = r.entryCategoryId || null;
      if (c) reservationTaken[c] = (reservationTaken[c] || 0) + 1;
    }
  }

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

    // tx.get() reads don't depend on each other, so a group entry's
    // members are fetched together rather than one at a time (I14).
    const snapResults = await Promise.all(
      participants.map(p => tx.get(docRef("participants", p.id))));
    const snaps = snapResults.map((snap, i) => {
      if (!snap.exists()) throw new Error(`${participants[i].name} no longer exists.`);
      return { id: participants[i].id, data: snap.data() };
    });
    for (const s of snaps) {
      /* THE PARTICIPANT'S OWN CATEGORY decides their caps — never the
       * event's. This matters for General events, which have no category:
       * a Junior in a General event is still measured as a Junior. Reading
       * event.categoryId here silently ignored every per-category cap on
       * every General event. */
      const effLimits = limitsForCategory(limits, s.data.categoryId);
      const blocked = checkCaps(s.data.eventCounts, event, effLimits, vocab);
      if (blocked) throw new Error(`${s.data.name}: ${blocked}`);

      // Mutual-exclusion groups — "one speech event only", and the like.
      const conflict = checkConstraints(event, groups, priorByParticipant[s.id] || [], eventById);
      if (conflict) throw new Error(`${s.data.name}: ${conflict}`);
    }

    /* Reserved places. Checked against the ENTRY's category — the whole
     * point is to stop one category filling a general group event, so the
     * question is which category this entry represents, taken from its
     * first member. */
    if (reservationTaken) {
      const entryCat = participants[0]
        ? snaps.find(s => s.id === participants[0].id)?.data?.categoryId || null
        : null;
      const refused = reservationBlocker({
        event, categoryId: entryCat, taken: reservationTaken,
        capacity: entryCap ?? Object.values(event.reservedSlots).reduce((a, b) => a + Number(b || 0), 0)
      });
      if (refused) throw new Error(refused);
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
      /* The team's name — "Red", or "Red B" where a house may field more
       * than one. Stored rather than derived at read time because a
       * substitution changes the roster and the cap can be edited later;
       * an entry that renamed itself afterwards would look like a
       * different entry to anyone reading a printed sheet. */
      teamLabel: teamName(event, house.name, tally.count + 1),
      // Which category this entry represents, for reserved-slot accounting.
      // Taken from the first member; a general group entry has no category
      // of its own, so this is the only place it can come from.
      entryCategoryId: participants[0] ? (participants[0].categoryId || null) : null,
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

  // Lookup card — merged so it never clobbers other events. Independent
  // per-participant writes, so they go in parallel rather than one after
  // another (I14) — a 6-member group entry was paying for 6 more
  // serialized round trips here, on top of the ones before the transaction.
  await Promise.all(participants.map(p => put("participantPublic", p.id, {
    name: p.name, chestNumber: p.chestNumber ?? "", houseName: house.name,
    events: { [event.id]: { name: event.name, code: event.code || "", published: false } }
  })));
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
export async function registerMany({ event, house, participants, settings, limits, registeredBy,
                                     vocab = {}, constraintGroups = [], eventById = {} }) {
  const done = [], failed = [];
  for (const p of participants) {
    try {
      await registerEntry({ event, house, participants: [p], settings, limits, registeredBy,
                            vocab, constraintGroups, eventById });
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
  // A house with an extension can still withdraw while that extension runs —
  // otherwise reopening registration for them would let them add but never
  // correct a mistake.
  const state = windowState(event, settings, Date.now(), registration.houseId);
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
