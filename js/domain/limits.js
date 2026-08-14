// Participant event-count caps. Pure logic; the transaction in
// registration.js applies it, and firestore.rules re-checks the resulting
// counters so a hand-crafted write cannot slip past.
//
// ── HOW A PARTICIPANT'S CAPS ARE DECIDED (v8.6) ──────────────────────
//
// The caps that apply come from the PARTICIPANT'S OWN CATEGORY, never the
// event's. That distinction matters for General events, which have no
// category of their own: a Junior participant entering a General event is
// still a Junior, and is still measured against Junior's rules.
//
//   CLASS CAPS ask "how many Category-Individual events may this person
//   enter?" All four classes now enforce, including the two General ones.
//
//   TYPE / TIER CAPS ask "how many Speech programmes may this person enter,
//   full stop?" — and the answer counts every Speech programme they enter
//   ANYWHERE, General included. The cap's VALUE is read from their own
//   category's settings (Junior may allow 2 Speech, Senior 3), but what is
//   counted against it is not confined to that category's events.
//
//   ROLL-UP CAPS span two classes each — group, individual, category,
//   general — and count every event, General included.
//
// ── ⚠ v8.8 BEHAVIOUR CHANGE: General class caps now bite ─────────────
//
// v8.6–8.7 returned null from maxFor() for generalIndividual and
// generalGroup, on the reasoning that "class caps are a per-category
// question and General events have no category". The effect was that both
// caps could be typed into Settings and were then silently ignored.
//
// That reasoning does not survive contact with limitsForCategory(), which
// already answers the category question: it picks WHICH cap set applies
// from the PARTICIPANT's own category, not the event's. A Junior entering
// a General Individual event is measured against Junior's General
// Individual cap, which is coherent and is what the Settings screen has
// been promising all along.
//
// A fest that already has values in those two boxes will find them
// enforced from this version. That is the intended fix, but it does mean a
// registration that previously slipped through may now be refused.

// v8.8 — every class may split by stage, not only the individual two.
const SPLIT_CLASSES = ["categoryIndividual", "categoryGroup", "generalIndividual", "generalGroup"];

/* ── v8.8 — the roll-up caps ──────────────────────────────────────────
 *
 * Four caps that each span two classes. They are counted for EVERY event,
 * General included, because unlike the class caps they are not asking a
 * per-category question — "how many group events, full stop?" means all of
 * them. maxFor() returns null unless useRollupCaps is on, so a fest that
 * never touches them behaves exactly as v8.7 did.
 *
 * The two pairs each partition the four classes, so a single event
 * contributes to exactly one cap from each pair — never twice to the same.
 */
const ROLLUP_OF = {
  categoryIndividual: ["individual", "category"],
  categoryGroup:      ["group", "category"],
  generalIndividual:  ["individual", "general"],
  generalGroup:       ["group", "general"]
};
const ROLLUP_KEYS = ["group", "individual", "category", "general"];

/**
 * The limits object that applies to a participant.
 *
 * Pass the PARTICIPANT's categoryId, not the event's. With `perCategory`
 * off, or that category holding no override, this is the global set —
 * identical to earlier versions.
 *
 * An override is used WHOLESALE, never merged field-by-field: a
 * half-inherited cap set is impossible to explain to a House Manager who
 * is being told "you cannot register this".
 */
export function limitsForCategory(globalLimits, categoryId) {
  if (!globalLimits?.perCategory) return globalLimits;
  const override = categoryId && globalLimits.byCategory?.[categoryId];
  return override || globalLimits;
}

/**
 * Counter keys an event contributes to, for a participant governed by
 * `limits`.
 *
 * `overall` always, then the event's class key and — when that class is
 * split — its stage key. Then the two roll-ups the class belongs to, and
 * Type/Tier keys whenever those caps are switched on.
 */
export function counterKeys(event, limits) {
  const keys = ["overall"];

  keys.push(event.eventClass);
  // The stage split now applies to every class. It is still only counted
  // when that class actually has splitByStage on, so keys do not appear
  // for a fest that never enabled it.
  const cfg = limits?.[event.eventClass];
  if (cfg?.splitByStage && SPLIT_CLASSES.includes(event.eventClass)) {
    keys.push(`${event.eventClass}.${event.stage}`);
  }

  /* Roll-ups count EVERY event, General included. They ask "how many group
   * events, full stop?", which is not a per-category question — so unlike
   * the class caps they are not disjoint from General. */
  for (const r of ROLLUP_OF[event.eventClass] || []) keys.push(`rollup:${r}`);

  // Type and Tier count everywhere, General included.
  if (limits?.useTypeCaps && event.typeId) keys.push(`type:${event.typeId}`);
  if (limits?.useTierCaps && event.tierId) keys.push(`tier:${event.tierId}`);

  return keys;
}

export const emptyCounts = () => ({ overall: 0 });

/** Maximum configured for a counter key, or null when uncapped. */
export function maxFor(key, limits) {
  if (!limits) return null;
  if (key === "overall") return numOrNull(limits.overallMax);

  if (key.startsWith("type:")) return numOrNull(limits.typeCaps?.[key.slice(5)]?.max);
  if (key.startsWith("tier:")) return numOrNull(limits.tierCaps?.[key.slice(5)]?.max);
  // Roll-ups are inert until the fest switches them on, so an upgraded
  // fest with stale zeroes in the document is unaffected.
  if (key.startsWith("rollup:")) {
    if (!limits.useRollupCaps) return null;
    return numOrNull(limits[key.slice(7)]?.max);
  }

  const [cls, stage] = key.split(".");
  const cfg = limits[cls];
  if (!cfg) return null;
  // A split class still enforces its own `max` across both stages — the
  // "additionally" in the spec: on-stage 2 and off-stage 2 can still be
  // capped at 3 combined.
  if (!stage) return numOrNull(cfg.max);
  return numOrNull(stage === "onStage" ? cfg.onStageMax : cfg.offStageMax);
}

export function minFor(key, limits) {
  if (!limits) return null;
  if (key === "overall") return numOrNull(limits.overallMin);

  if (key.startsWith("type:")) return numOrNull(limits.typeCaps?.[key.slice(5)]?.min);
  if (key.startsWith("tier:")) return numOrNull(limits.tierCaps?.[key.slice(5)]?.min);
  if (key.startsWith("rollup:")) {
    if (!limits.useRollupCaps) return null;
    return numOrNull(limits[key.slice(7)]?.min);
  }

  const [cls, stage] = key.split(".");
  const cfg = limits[cls];
  if (!cfg) return null;
  if (!stage) return numOrNull(cfg.min);
  return numOrNull(stage === "onStage" ? cfg.onStageMin : cfg.offStageMin);
}

function numOrNull(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

export const LABEL = {
  overall: "overall events",
  categoryIndividual: "Category Individual events",
  categoryGroup: "Category Group events",
  generalIndividual: "General Individual events",
  generalGroup: "General Group events",
  "rollup:group":      "group events overall",
  "rollup:individual": "individual events overall",
  "rollup:category":   "Category events overall",
  "rollup:general":    "General events overall"
};
// Stage labels for all four classes, built rather than listed so a class
// can never gain a split and silently lose its label.
for (const c of SPLIT_CLASSES) {
  LABEL[`${c}.onStage`]  = "on-stage " + LABEL[c];
  LABEL[`${c}.offStage`] = "off-stage " + LABEL[c];
}

/** Readable name for any key, including the dynamic Type/Tier ones. */
export function labelFor(key, vocab = {}) {
  if (key.startsWith("type:")) return `${vocab.types?.[key.slice(5)] || "Type"} programmes`;
  if (key.startsWith("tier:")) return `${vocab.tiers?.[key.slice(5)] || "Tier"} programmes`;
  return LABEL[key] || key;
}

/**
 * Would adding this event breach a cap? Returns an explanatory message, or
 * null if the registration is allowed. Maximums hard-block; minimums never
 * do — they only surface later in the compliance report.
 */
export function checkCaps(counts, event, limits, vocab = {}) {
  for (const key of counterKeys(event, limits)) {
    const max = maxFor(key, limits);
    if (max === null) continue;
    const current = Number(counts?.[key] || 0);
    if (current + 1 > max) {
      return `This exceeds the maximum of ${max} ${labelFor(key, vocab)} for this participant.`;
    }
  }
  return null;
}

/* ── v8.8 — mutual-exclusion constraint groups ────────────────────────
 *
 * "One speech event only" — a named set of events (and/or whole Types)
 * from which a participant may enter at most N. This is not a cap on a
 * class or an axis; it is an arbitrary set an Admin draws by hand, which
 * is why it cannot be expressed with the counter keys above.
 *
 * Counted from the participant's actual registrations rather than a
 * stored counter. A group's membership can be edited at any time, and a
 * counter written under the old membership would then be wrong with no
 * way to detect it — whereas recounting from registrations is always
 * correct and costs one read the registration transaction already makes.
 */
export function constraintBlockers(event, group, currentEventIds, eventById = {}) {
  if (!group?.eventIds?.length && !group?.typeIds?.length) return null;
  const inGroup = id => {
    if ((group.eventIds || []).includes(id)) return true;
    const t = eventById[id]?.typeId;
    return !!t && (group.typeIds || []).includes(t);
  };
  if (!inGroup(event.id)) return null;

  const already = (currentEventIds || []).filter(id => id !== event.id && inGroup(id)).length;
  const max = Number(group.maxEvents);
  if (isNaN(max) || max <= 0) return null;
  if (already + 1 > max) {
    return `${group.name || "This group"} allows at most ${max} event${max > 1 ? "s" : ""} per participant.`;
  }
  return null;
}

/** Every constraint group that refuses this entry, as messages. */
export function checkConstraints(event, groups, currentEventIds, eventById = {}) {
  for (const g of groups || []) {
    const msg = constraintBlockers(event, g, currentEventIds, eventById);
    if (msg) return msg;
  }
  return null;
}

/* ── v8.8 — reserved slots in a general group event ───────────────────
 *
 * Keeps a general group event from being filled entirely by one or two
 * categories. Each reservation says "at least N of this event's places
 * belong to category X", and an entry is refused when taking it would
 * make those reservations impossible to honour.
 *
 * `taken` is a map of categoryId -> places already used, `capacity` the
 * event's total places. The test is forward-looking: it does not ask
 * whether the reservation is met NOW, but whether it can still be met
 * after this entry — the only question that can fairly block someone.
 */
export function reservationBlocker({ event, categoryId, taken = {}, capacity }) {
  const res = event?.reservedSlots;
  if (!res || !Object.keys(res).length) return null;
  const cap = Number(capacity);
  if (isNaN(cap) || cap <= 0) return null;

  const used = Object.values(taken).reduce((a, b) => a + Number(b || 0), 0);
  if (used + 1 > cap) return null;   // the ordinary capacity cap handles this

  // Places that must still be held back for categories short of their
  // reservation — counting this entry as already placed.
  const after = { ...taken, [categoryId]: Number(taken[categoryId] || 0) + 1 };
  let mustReserve = 0;
  for (const [catId, n] of Object.entries(res)) {
    const need = Number(n || 0) - Number(after[catId] || 0);
    if (need > 0) mustReserve += need;
  }
  const remaining = cap - (used + 1);
  if (mustReserve > remaining) {
    return `The remaining places are reserved for categories that have not filled their quota yet.`;
  }
  return null;
}

export function applyCounts(counts, event, limits, delta) {
  const next = { ...(counts || {}) };
  for (const key of counterKeys(event, limits)) {
    next[key] = Math.max(0, Number(next[key] || 0) + delta);
  }
  return next;
}

/** Every configured minimum this participant currently falls short of. */
export function shortfalls(counts, limits, vocab = {}) {
  const out = [];
  /* Derived, not hand-listed. The old list named five keys and so silently
   * ignored a minimum set on generalIndividual or on any stage split other
   * than categoryIndividual's — a shortfall the report was supposed to
   * catch simply never appeared. Building the list from the same constants
   * counterKeys() uses means a new cap cannot be added without the report
   * seeing it. */
  const keys = ["overall", ...ROLLUP_KEYS.map(r => `rollup:${r}`)];
  for (const cls of SPLIT_CLASSES) {
    keys.push(cls);
    keys.push(`${cls}.onStage`, `${cls}.offStage`);
  }

  for (const key of keys) {
    const [cls] = key.split(".");
    if (key.includes(".") && !limits?.[cls]?.splitByStage) continue;
    const min = minFor(key, limits);
    if (min === null || min <= 0) continue;
    const current = Number(counts?.[key] || 0);
    if (current < min) out.push({ key, label: labelFor(key, vocab), required: min, actual: current });
  }

  // Type and Tier minimums, which are configured per category but counted
  // across every event the participant enters.
  for (const [scope, caps] of [["type", limits?.typeCaps], ["tier", limits?.tierCaps]]) {
    if (!caps) continue;
    if (scope === "type" && !limits?.useTypeCaps) continue;
    if (scope === "tier" && !limits?.useTierCaps) continue;
    for (const [id, cap] of Object.entries(caps)) {
      const min = numOrNull(cap?.min);
      if (min === null || min <= 0) continue;
      const key = `${scope}:${id}`;
      const current = Number(counts?.[key] || 0);
      if (current < min) out.push({ key, label: labelFor(key, vocab), required: min, actual: current });
    }
  }
  return out;
}

/**
 * Rebuild one participant's counters from their actual registrations.
 *
 * The repair behind the Recount tool. Counter KEYS depend on settings —
 * splitByStage, useTypeCaps, useTierCaps — so changing any of those leaves
 * historic counts filed under keys nothing reads any more. Recomputing from
 * the registrations themselves is the only way to be sure, and it is
 * idempotent.
 */
export function recountParticipant(participant, registrations, eventById, globalLimits) {
  const limits = limitsForCategory(globalLimits, participant.categoryId);
  let counts = emptyCounts();
  for (const reg of registrations) {
    if (!(reg.participantIds || []).includes(participant.id)) continue;
    const event = eventById[reg.eventId];
    if (!event) continue;
    counts = applyCounts(counts, event, limits, +1);
  }
  return counts;
}
