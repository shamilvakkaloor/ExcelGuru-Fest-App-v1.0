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
// Two scopes coexist, deliberately, because they answer different questions:
//
//   CLASS CAPS ask "how many Category-Individual events may this person
//   enter?" — and General events are OUTSIDE that question entirely. A
//   General entry only ever touches the `overall` counter.
//
//   TYPE / TIER CAPS ask "how many Speech programmes may this person enter,
//   full stop?" — and the answer counts every Speech programme they enter
//   ANYWHERE, General included. The cap's VALUE is read from their own
//   category's settings (Junior may allow 2 Speech, Senior 3), but what is
//   counted against it is not confined to that category's events.
//
// So a Junior in a General Speech event increments: overall, and
// type:<speech>. It does not increment generalIndividual against any
// category cap, because class caps and General are disjoint.

const SPLIT_CLASSES = ["categoryIndividual", "generalIndividual"];
const GENERAL_CLASSES = ["generalIndividual", "generalGroup"];

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
 * `overall` always. The class key (and its stage split) only for events
 * belonging to a category — General events are outside class caps. Type
 * and Tier keys whenever those caps are switched on, regardless of class.
 */
export function counterKeys(event, limits) {
  const keys = ["overall"];

  if (!GENERAL_CLASSES.includes(event.eventClass)) {
    keys.push(event.eventClass);
    const cfg = limits?.[event.eventClass];
    if (cfg?.splitByStage && SPLIT_CLASSES.includes(event.eventClass)) {
      keys.push(`${event.eventClass}.${event.stage}`);
    }
  } else {
    // A General event still has its own class counter for reporting, but no
    // category cap is read against it — maxFor() returns null for these.
    keys.push(event.eventClass);
  }

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

  const [cls, stage] = key.split(".");
  // General events are not measured against a category's class caps.
  if (GENERAL_CLASSES.includes(cls)) return null;
  const cfg = limits[cls];
  if (!cfg) return null;
  if (!stage) return numOrNull(cfg.max);
  return numOrNull(stage === "onStage" ? cfg.onStageMax : cfg.offStageMax);
}

export function minFor(key, limits) {
  if (!limits) return null;
  if (key === "overall") return numOrNull(limits.overallMin);

  if (key.startsWith("type:")) return numOrNull(limits.typeCaps?.[key.slice(5)]?.min);
  if (key.startsWith("tier:")) return numOrNull(limits.tierCaps?.[key.slice(5)]?.min);

  const [cls, stage] = key.split(".");
  if (GENERAL_CLASSES.includes(cls)) return null;
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
  "categoryIndividual.onStage":  "on-stage Category Individual events",
  "categoryIndividual.offStage": "off-stage Category Individual events",
  "generalIndividual.onStage":   "on-stage General Individual events",
  "generalIndividual.offStage":  "off-stage General Individual events"
};

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
  const keys = ["overall", "categoryIndividual", "categoryGroup",
    "categoryIndividual.onStage", "categoryIndividual.offStage"];

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
