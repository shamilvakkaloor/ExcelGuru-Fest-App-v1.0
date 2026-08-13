// Schedule clash detection.
//
// The scheduler already refuses to put one event in two slots. This finds
// the clash that actually bites on the day: a PERSON who has to be in two
// places at once — a participant entered in two events running together, or
// a judge assigned to two.
//
// WARN, NEVER BLOCK. Real fests deliberately overlap: an off-stage essay
// runs while the main stage continues, and a participant may genuinely be
// excused from one. Refusing to save would leave the organiser unable to
// express a schedule they have already agreed with the people involved.
// Showing the clash respects the fact that they know things the app does not.
//
// Pure: given slots and who is in what, it computes clashes. No Firestore,
// no DOM, so the overlap arithmetic is testable.

/** Do two [start, end) minute ranges overlap? Touching is not overlapping. */
export function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Find every person who is needed in two places at once.
 *
 * `slots`: [{ eventId, dayId, venueId, venueName, title, startMin, endMin }]
 * `peopleByEvent`: { eventId: [{ id, name, role }] }
 *
 * Only slots on the SAME DAY are compared — two events at 10:00 on different
 * days are not a clash, and comparing them would drown the real ones.
 *
 * Returns one row per clashing pair per person, so a report can list them
 * plainly rather than making the reader reconstruct the pairing.
 */
export function findClashes(slots, peopleByEvent) {
  const out = [];
  const timed = (slots || []).filter(s =>
    s.eventId && Number.isFinite(s.startMin) && Number.isFinite(s.endMin));

  for (let i = 0; i < timed.length; i++) {
    for (let j = i + 1; j < timed.length; j++) {
      const a = timed[i], b = timed[j];
      if (a.dayId !== b.dayId) continue;
      if (a.eventId === b.eventId) continue;
      if (!overlaps(a.startMin, a.endMin, b.startMin, b.endMin)) continue;

      const inA = peopleByEvent[a.eventId] || [];
      const inB = peopleByEvent[b.eventId] || [];
      if (!inA.length || !inB.length) continue;

      const bIds = new Map(inB.map(p => [p.id + "|" + p.role, p]));
      for (const p of inA) {
        const match = bIds.get(p.id + "|" + p.role);
        if (!match) continue;
        out.push({
          personId: p.id,
          name: p.name,
          role: p.role,                     // "participant" | "judge"
          dayId: a.dayId,
          a: { eventId: a.eventId, title: a.title, venueName: a.venueName,
               startTime: a.startTime, endTime: a.endTime },
          b: { eventId: b.eventId, title: b.title, venueName: b.venueName,
               startTime: b.startTime, endTime: b.endTime }
        });
      }
    }
  }

  return out.sort((x, y) =>
    String(x.role).localeCompare(String(y.role)) ||
    String(x.name).localeCompare(String(y.name)) ||
    String(x.a.startTime).localeCompare(String(y.a.startTime)));
}

/** Group clashes by event, so the schedule builder can flag a row. */
export function clashesByEvent(clashes) {
  const map = {};
  for (const c of clashes || []) {
    (map[c.a.eventId] ||= []).push(c);
    (map[c.b.eventId] ||= []).push(c);
  }
  return map;
}

/** A one-line summary for a slot row. */
export function describeClashes(list) {
  if (!list?.length) return "";
  const people = [...new Set(list.map(c => c.name))];
  const judges = list.filter(c => c.role === "judge").length;
  const bits = [];
  if (people.length) bits.push(people.slice(0, 3).join(", ") + (people.length > 3 ? ` +${people.length - 3}` : ""));
  return (judges === list.length ? "Judge clash: " : "Clash: ") + bits.join("");
}
